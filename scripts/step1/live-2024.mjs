#!/usr/bin/env node
// STEP 1 — 2024 매출 복구 (2025 v2 와 동일 안전 패턴).
// 2024 파일: 각 row = 한 프로젝트, 월별 "월 이용료" 총액을 사용 (서비스별 분리 없음).
//   → project_name = 현장명 그대로 (서비스 suffix 없음), service_type = null
//   → 기존 DB 는 2026 split 이후 project_name 이 "현장 - 서비스" 형태로 대부분 저장돼 있어 매칭 잘 안 될 것 (신규 생성 위주 예상)
//
// 안전 원칙 (2025 v2 와 동일):
//   - INSERT only, DELETE 없음
//   - source='excel_backfill' 마킹
//   - year=2024 만 다룸 (2025/2026 절대 안 건드림)
//   - (project_id, month) aggregate

import { readFileSync } from 'fs'
import { createClient } from '@supabase/supabase-js'

const env = readFileSync('.env.local', 'utf-8')
env.split('\n').forEach(l => {
  const m = l.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)
  if (m) process.env[m[1]] = m[2].replace(/^"(.*)"$/, '$1')
})
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

const YEAR = 2024
const LIVE = process.argv.includes('--live')

const normalize = (s) => (s || '').toString().replace(/\s+/g, '').replace(/[()（）\-·・㈜]/g, '').toLowerCase()

// 접미사 (선납/선불/후불/등) 제거 → 원래 회사명 매칭
const stripSuffix = (s) => (s || '').toString().replace(/\s*\((선납|선불|후불|후납|카드|현금)\)\s*$/g, '').trim()

async function fetchAll(t, cols, ff) {
  let all = [], size = 1000
  for (let f = 0; ; f += size) {
    let q = sb.from(t).select(cols).range(f, f + size - 1)
    if (ff) q = ff(q)
    const { data, error } = await q
    if (error) throw new Error(error.message)
    if (!data || !data.length) break
    all = all.concat(data)
    if (data.length < size) break
  }
  return all
}

console.log(`[STEP 1] 2024 ${LIVE ? 'LIVE' : 'DRY-RUN'}\n`)

const parsed = JSON.parse(readFileSync('/tmp/2024_parsed.json', 'utf-8'))
console.log(`엑셀 파싱 행: ${parsed.length}`)

const customers = await fetchAll('customers', 'id, company_name')
const custByName = {}
for (const c of customers) {
  custByName[c.company_name] = c.id
  custByName[normalize(c.company_name)] = c.id
}
const projects = await fetchAll('projects', 'id, customer_id, project_name, service_type')
const projLookup = new Map()
for (const p of projects) {
  // 다양한 매칭 시도: 서비스 suffix 없이, 그리고 있는 채로
  projLookup.set(`${p.customer_id}||${p.project_name}||`, p.id)
  const baseName = p.project_name?.replace(/ - (플랫폼|AI CCTV|Wearable Cam|LTE\/인터넷 회선|Mobile APP|Story Book|근로자관리|운임비|무사고|안전관리|실시간 안전관리|Wearable|편집studio|풀타임 타임랩스|기타)$/, '')
  if (baseName && baseName !== p.project_name) {
    projLookup.set(`${p.customer_id}||${baseName}||`, p.id)  // 서비스 제거 매칭용
  }
}
console.log(`customers=${customers.length}, projects=${projects.length}, projLookup entries=${projLookup.size}`)

// 1단계: 항목 확장
const revItems = []
let noCustomer = 0
const custMisses = new Set()
for (const row of parsed) {
  if (!row.monthly || row.monthly.length === 0) continue
  const stripped = stripSuffix(row.company)
  const custId = custByName[row.company]
    || custByName[stripped]
    || custByName[normalize(row.company)]
    || custByName[normalize(stripped)]
  if (!custId) { noCustomer++; custMisses.add(row.company); continue }
  const projectName = row.project  // 서비스 suffix 없음
  for (const m of row.monthly) {
    revItems.push({
      customer_id: custId,
      project_name: projectName,
      service_type: null,
      month: m.month,
      amount: m.amount,
      extras: {
        billing_start: row.bill_start,
        billing_end: row.bill_end,
        project_start: row.proj_start,
        project_end: row.proj_end,
        billing_method: row.billing_method,
        notes: row.notes,
      },
    })
  }
}
console.log(`\n항목 확장: ${revItems.length} (no-cust=${noCustomer})`)
if (custMisses.size) {
  console.log(`⚠ 회사 매칭 실패 (${custMisses.size}종):`)
  ;[...custMisses].slice(0, 20).forEach(c => console.log(`   - ${c}`))
}

// 2단계: project 결정 (기존 or 신규)
const projectsToCreate = new Map()
const keyToExistingProjId = new Map()
for (const r of revItems) {
  const k = `${r.customer_id}||${r.project_name}||`
  const existing = projLookup.get(k)
  if (existing) {
    keyToExistingProjId.set(k, existing)
  } else if (!projectsToCreate.has(k)) {
    projectsToCreate.set(k, {
      customer_id: r.customer_id,
      project_name: r.project_name,
      service_type: null,
      extras: r.extras,
    })
  }
}
console.log(`\n프로젝트 결정:`)
console.log(`  기존 매칭: ${keyToExistingProjId.size}`)
console.log(`  신규 생성 예정: ${projectsToCreate.size}`)

// aggregate: (project 조합, month) 단위 합산
const aggMap = new Map()
for (const r of revItems) {
  const k = `${r.customer_id}||${r.project_name}||${r.month}`
  if (aggMap.has(k)) aggMap.get(k).amount += r.amount
  else aggMap.set(k, { ...r })
}
console.log(`  aggregate: ${revItems.length} → ${aggMap.size}`)

if (!LIVE) {
  const byMonth = {}
  for (const a of aggMap.values()) byMonth[a.month] = (byMonth[a.month] || 0) + a.amount
  console.log(`\n[DRY-RUN] 예상 upsert monthly: ${aggMap.size}`)
  console.log(`월별:`)
  for (let m = 1; m <= 12; m++) console.log(`  ${m}월: ${(byMonth[m] || 0).toLocaleString()}`)
  console.log(`연간: ${Object.values(byMonth).reduce((a,b)=>a+b,0).toLocaleString()}`)
  console.log(`\n--live 로 실행 시 실제 반영`)
  process.exit(0)
}

// 3단계: 신규 프로젝트 INSERT
console.log(`\n[LIVE] 신규 프로젝트 INSERT (${projectsToCreate.size})...`)
const newProjKeys = [...projectsToCreate.keys()]
const newProjRows = [...projectsToCreate.values()].map(p => ({
  customer_id: p.customer_id,
  project_name: p.project_name,
  service_type: p.service_type,
  project_start: p.extras.project_start,
  project_end: p.extras.project_end,
  billing_start: p.extras.billing_start,
  billing_end: p.extras.billing_end,
  billing_method: p.extras.billing_method,
  notes: p.extras.notes,
  status: 'active',
  source: 'excel_backfill',
}))
const keyToNewProjId = new Map()
let projInserted = 0
for (let i = 0; i < newProjRows.length; i += 100) {
  const slice = newProjRows.slice(i, i + 100)
  const sliceKeys = newProjKeys.slice(i, i + 100)
  const { data, error } = await sb.from('projects').insert(slice).select('id')
  if (error) { console.log(`  ❌ batch ${i}: ${error.message}`); continue }
  data.forEach((row, j) => keyToNewProjId.set(sliceKeys[j], row.id))
  projInserted += data.length
  process.stdout.write(`\r  ${projInserted}/${newProjRows.length}`)
}
console.log(`\n  ✅ ${projInserted}/${newProjRows.length}`)

// 4단계: revenue payload 만들기
console.log(`\n[LIVE] revenue payload (aggregate)...`)
const revsArr = []
for (const a of aggMap.values()) {
  const k = `${a.customer_id}||${a.project_name}||`
  const projId = keyToExistingProjId.get(k) || keyToNewProjId.get(k)
  if (!projId) continue
  revsArr.push({
    customer_id: a.customer_id,
    project_id: projId,
    year: YEAR,
    month: a.month,
    amount: a.amount,
    is_confirmed: true,
  })
}
console.log(`  총 ${revsArr.length}건`)

// 5단계: revenues INSERT
console.log(`\n[LIVE] revenues INSERT...`)
let revInserted = 0
for (let i = 0; i < revsArr.length; i += 500) {
  const batch = revsArr.slice(i, i + 500)
  const { error } = await sb.from('monthly_revenues').insert(batch)
  if (error) console.log(`\n  ❌ batch ${i}: ${error.message}`)
  else revInserted += batch.length
  process.stdout.write(`\r  ${revInserted}/${revsArr.length}`)
}
console.log(`\n  ✅ ${revInserted}/${revsArr.length}`)

// 검증
console.log(`\n[검증]`)
const verify = await fetchAll('monthly_revenues', 'amount, month', q => q.eq('year', YEAR))
const byMonth = {}
verify.forEach(r => { byMonth[r.month] = (byMonth[r.month] || 0) + Number(r.amount) })
console.log(`  monthly_revenues (year=${YEAR}): ${verify.length}`)
console.log(`  월별:`)
for (let m = 1; m <= 12; m++) console.log(`    ${m}월: ${(byMonth[m] || 0).toLocaleString()}`)
const dbTotal = Object.values(byMonth).reduce((a,b)=>a+b,0)
console.log(`  연간: ${dbTotal.toLocaleString()}`)
console.log(`  엑셀 예상: 808,325,681`)
console.log(`  차이: ${(dbTotal - 808325681).toLocaleString()}`)

const { count: rev2025 } = await sb.from('monthly_revenues').select('*', { count: 'exact', head: true }).eq('year', 2025)
const { count: rev2026 } = await sb.from('monthly_revenues').select('*', { count: 'exact', head: true }).eq('year', 2026)
console.log(`\n  monthly_revenues year=2025: ${rev2025} (3368 유지 확인)`)
console.log(`  monthly_revenues year=2026: ${rev2026} (3888 유지 확인)`)

console.log(`\n[Done]`)
