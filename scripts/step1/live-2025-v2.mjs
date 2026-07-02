#!/usr/bin/env node
// STEP 1 LIVE v2 — 2025 매출 복구
// 지난 성공 스크립트(import-historical-revenues.mjs) 의 aggregate 패턴 채택:
// 같은 (project_id, month) → amount 합산 → UNIQUE 위반 방지.
//
// 안전 원칙:
// - INSERT 만 사용 (DELETE 없음, UPDATE 없음)
// - source='excel_backfill' 로 마킹 → 향후 sync 보호 + 롤백 가능
// - 2026 데이터 절대 안 건드림 (year=2025 만 다룸)
// - projectLookup 캐싱으로 같은 (customer, name, service) → 같은 project_id 재사용

import { readFileSync } from 'fs'
import { createClient } from '@supabase/supabase-js'

const env = readFileSync('.env.local', 'utf-8')
env.split('\n').forEach(l => {
  const m = l.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)
  if (m) process.env[m[1]] = m[2].replace(/^"(.*)"$/, '$1')
})
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

const YEAR = 2025
const LIVE = process.argv.includes('--live')

const normalize = (s) => (s || '').toString().replace(/\s+/g, '').replace(/[()（）\-·・㈜]/g, '').toLowerCase()

const SERVICE_MAP = {
  '플랫폼': '플랫폼', 'CCTV': 'AI CCTV', '운임비': '운임비', '근로자관리': '근로자관리',
  'Wearable Cam': 'Wearable Cam', '기타': '기타', '안전관리': '안전관리',
  '실시간 안전관리': '실시간 안전관리', 'Story Book': 'Story Book',
  '편집studio': '편집studio', '풀타임 타임랩스': '풀타임 타임랩스',
  '기타 솔루션': '기타', 'Mobile APP': 'Mobile APP',
}

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

console.log(`[STEP 1 v2] 2025 ${LIVE ? 'LIVE' : 'DRY-RUN'}\n`)

// 파싱 결과 로드
const parsed = JSON.parse(readFileSync('/tmp/2025_parsed.json', 'utf-8'))
console.log(`엑셀 파싱 행: ${parsed.length}`)

// customer / project 로드
const customers = await fetchAll('customers', 'id, company_name')
const custByName = {}
for (const c of customers) {
  custByName[c.company_name] = c.id
  custByName[normalize(c.company_name)] = c.id
}
const projects = await fetchAll('projects', 'id, customer_id, project_name, service_type')
const projLookup = new Map()
for (const p of projects) {
  projLookup.set(`${p.customer_id}||${p.project_name}||${p.service_type || ''}`, p.id)
}
console.log(`customers=${customers.length}, projects=${projects.length}`)

// 1단계: 파싱 결과를 매출별로 확장 + customer/service 매핑
const revItems = []  // { customer_id, project_name, service_type, month, amount, extras }
let noCustomer = 0, noService = 0, emptyRow = 0
const custMisses = new Set()
for (const row of parsed) {
  if (!row.monthly || row.monthly.length === 0) { emptyRow++; continue }
  const custId = custByName[row.company] || custByName[normalize(row.company)]
  if (!custId) { noCustomer++; custMisses.add(row.company); continue }
  const dbSvc = SERVICE_MAP[row.service] || (row.service ? null : null)
  if (row.service && !dbSvc) { noService++; continue }
  const projectName = dbSvc ? `${row.project} - ${dbSvc}` : row.project
  for (const m of row.monthly) {
    revItems.push({
      customer_id: custId,
      project_name: projectName,
      service_type: dbSvc,
      month: m.month,
      amount: m.amount,
    })
  }
}
console.log(`\n항목 확장: ${revItems.length} (empty=${emptyRow}, no-cust=${noCustomer}, no-svc=${noService})`)

// 2단계: (customer_id, project_name, service_type) 단위로 project 결정 (기존 or 신규)
// 캐시로 같은 조합 → 같은 project_id 재사용 (중복 project 생성 방지)
const projectsToCreate = new Map()  // key → { customer_id, project_name, service_type }
const keyToExistingProjId = new Map()
for (const r of revItems) {
  const k = `${r.customer_id}||${r.project_name}||${r.service_type || ''}`
  const existing = projLookup.get(k)
  if (existing) {
    keyToExistingProjId.set(k, existing)
  } else if (!projectsToCreate.has(k)) {
    projectsToCreate.set(k, {
      customer_id: r.customer_id,
      project_name: r.project_name,
      service_type: r.service_type,
    })
  }
}
console.log(`\n프로젝트 결정:`)
console.log(`  기존 매칭 (unique): ${keyToExistingProjId.size}`)
console.log(`  신규 생성 예정 (unique): ${projectsToCreate.size}`)

if (!LIVE) {
  // 사전 예상 카운트만 표시
  const distinctRevKeys = new Set()
  for (const r of revItems) distinctRevKeys.add(`${r.customer_id}||${r.project_name}||${r.service_type || ''}||${r.month}`)
  const byMonth = {}
  const aggMap = new Map()
  for (const r of revItems) {
    const k = `${r.customer_id}||${r.project_name}||${r.service_type || ''}||${r.month}`
    if (aggMap.has(k)) aggMap.get(k).amount += r.amount
    else aggMap.set(k, { ...r })
  }
  for (const a of aggMap.values()) byMonth[a.month] = (byMonth[a.month] || 0) + a.amount
  console.log(`\n[DRY-RUN] 실제 INSERT 예상: monthly ${aggMap.size}건`)
  console.log(`월별:`)
  for (let m = 1; m <= 12; m++) console.log(`  ${m}월: ${(byMonth[m] || 0).toLocaleString()}`)
  console.log(`연간: ${Object.values(byMonth).reduce((a,b)=>a+b,0).toLocaleString()}`)
  console.log(`\n--live 로 실행하면 실제 반영`)
  process.exit(0)
}

// 3단계: 신규 프로젝트 INSERT (배치)
console.log(`\n[LIVE] 신규 프로젝트 INSERT (${projectsToCreate.size})...`)
const newProjRows = [...projectsToCreate.values()].map(p => ({
  customer_id: p.customer_id,
  project_name: p.project_name,
  service_type: p.service_type,
  status: 'active',
  source: 'excel_backfill',
}))
let projInserted = 0
const newProjKeys = [...projectsToCreate.keys()]
const keyToNewProjId = new Map()
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

// 4단계: (project_id, month) 단위로 revenue 합산
console.log(`\n[LIVE] revenues 합산 (aggregate)...`)
const revAggMap = new Map()  // key: project_id|month
for (const r of revItems) {
  const k = `${r.customer_id}||${r.project_name}||${r.service_type || ''}`
  const projId = keyToExistingProjId.get(k) || keyToNewProjId.get(k)
  if (!projId) continue  // insert 실패 케이스
  const rk = `${projId}|${r.month}`
  if (revAggMap.has(rk)) revAggMap.get(rk).amount += r.amount
  else revAggMap.set(rk, {
    customer_id: r.customer_id,
    project_id: projId,
    year: YEAR,
    month: r.month,
    amount: r.amount,
    is_confirmed: true,
  })
}
console.log(`  aggregate: ${revItems.length} 원본 → ${revAggMap.size} 합산 결과`)

// 5단계: revenues INSERT (배치)
console.log(`\n[LIVE] revenues INSERT...`)
const revsArr = [...revAggMap.values()]
let revInserted = 0
for (let i = 0; i < revsArr.length; i += 500) {
  const batch = revsArr.slice(i, i + 500)
  const { error } = await sb.from('monthly_revenues').insert(batch)
  if (error) console.log(`\n  ❌ batch ${i}: ${error.message}`)
  else revInserted += batch.length
  process.stdout.write(`\r  ${revInserted}/${revsArr.length}`)
}
console.log(`\n  ✅ ${revInserted}/${revsArr.length}`)

// 6단계: 검증
console.log(`\n[검증] DB 실측`)
const { count: cntProj } = await sb.from('projects').select('*', { count: 'exact', head: true }).eq('source', 'excel_backfill')
const verify = await fetchAll('monthly_revenues', 'amount, month', q => q.eq('year', YEAR))
const byMonth = {}
verify.forEach(r => { byMonth[r.month] = (byMonth[r.month] || 0) + Number(r.amount) })
console.log(`  projects (excel_backfill): ${cntProj}`)
console.log(`  monthly_revenues (year=${YEAR}): ${verify.length}`)
console.log(`  월별:`)
for (let m = 1; m <= 12; m++) console.log(`    ${m}월: ${(byMonth[m] || 0).toLocaleString()}`)
const dbTotal = Object.values(byMonth).reduce((a,b)=>a+b,0)
console.log(`  연간: ${dbTotal.toLocaleString()}`)
console.log(`  엑셀 예상: 1,100,577,696`)
console.log(`  차이: ${(dbTotal - 1100577696).toLocaleString()}`)

// 2026 무결성 재확인
const { count: rev2026 } = await sb.from('monthly_revenues').select('*', { count: 'exact', head: true }).eq('year', 2026)
console.log(`\n  monthly_revenues year=2026: ${rev2026} (3888 유지 확인)`)

console.log(`\n[Done]`)
