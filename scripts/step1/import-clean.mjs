#!/usr/bin/env node
// STEP 1 정확한 재임포트 (2024 + 2025)
//
// 원칙:
//   - INSERT only (DELETE/UPDATE 없음)
//   - source='excel_backfill' 마킹
//   - sheet_no 음수 부여 → 넘버링 규칙 유지 (2026 아래에 2025 → 2024 순 배치)
//     * 2025: -1 ~ -N25 (2025 첫 행이 sheet_no -1, DESC 상 2026 바로 밑에 옴)
//     * 2024: -10001 ~ -10000-N24 (2025 아래에 위치)
//   - 전체 필드 채움: site_category, project_start/end, billing_start/end, billing_method, notes
//   - service_type 매핑: 엑셀 서비스명 → DB 22종 매핑
//   - (project_id, month) aggregate 로 UNIQUE 위반 방지

import { readFileSync } from 'fs'
import { createClient } from '@supabase/supabase-js'

const env = readFileSync('.env.local', 'utf-8')
env.split('\n').forEach(l => {
  const m = l.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)
  if (m) process.env[m[1]] = m[2].replace(/^"(.*)"$/, '$1')
})
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

const LIVE = process.argv.includes('--live')

const normalize = (s) => (s || '').toString().replace(/\s+/g, '').replace(/[()（）\-·・㈜]/g, '').toLowerCase()
const stripSuffix = (s) => (s || '').toString().replace(/\s*\((선납|선불|후불|후납|카드|현금)\)\s*$/g, '').trim()

// 엑셀 서비스명 → DB service_type 매핑 (DB 22종 기준)
const SERVICE_MAP = {
  // 2025 파일
  '플랫폼': '플랫폼',
  'CCTV': 'AI CCTV',
  '운임비': '운임비',
  '근로자관리': '근로자관리',
  'Wearable Cam': 'Wearable Cam',
  '기타': '기타',
  '안전관리': '안전관리',
  '실시간 안전관리': '실시간 안전관리',
  'Story Book': 'Story Book',
  '편집studio': '편집studio',
  '풀타임 타임랩스': '풀타임 타임랩스',
  '기타 솔루션': '기타',
  'Mobile APP': 'Mobile APP',
  // 2024 파일 (서비스별 세분화)
  '견적서': '기타',        // DB에 없음 → 기타
  '전용앱': '기타',        // DB에 없음 → 기타
  '홈페이지': '기타',      // DB에 없음 → 기타
  '솔루션': '기타',        // DB에 없음 → 기타
  '3D': '3D',
  'AI CCTV': 'AI CCTV',
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

console.log(`[STEP 1 재임포트] ${LIVE ? 'LIVE' : 'DRY-RUN'}\n`)

const data2024 = JSON.parse(readFileSync('/tmp/2024_v2.json', 'utf-8'))
const data2025 = JSON.parse(readFileSync('/tmp/2025_v2.json', 'utf-8'))
console.log(`2024 파싱: ${data2024.length}행`)
console.log(`2025 파싱: ${data2025.length}행`)

// DB 로드
const customers = await fetchAll('customers', 'id, company_name')
const custByName = {}
for (const c of customers) {
  custByName[c.company_name] = c.id
  custByName[normalize(c.company_name)] = c.id
}
console.log(`customers: ${customers.length}`)

// 회사 매칭 helper
function findCust(company) {
  const stripped = stripSuffix(company)
  return custByName[company] || custByName[stripped]
    || custByName[normalize(company)] || custByName[normalize(stripped)]
}

// 프로젝트 결정 (기존 매칭 시도 후 신규)
// key: `${customer_id}||${project_name}||${service_type}`
const projectsToCreate = new Map()  // key → { customer_id, project_name, service_type, extras, sheet_no }
const revenueItems = []             // 각 항목: { key, month, amount }

let noCustomer = 0, noService = 0
const custMisses = new Set()

// 2025 처리 (sheet_no -1 부터)
let sheetNo25 = 0
console.log(`\n[2025 항목 확장]`)
for (const row of data2025) {
  const custId = findCust(row.company)
  if (!custId) { noCustomer++; custMisses.add(row.company); continue }
  const dbSvc = row.service ? (SERVICE_MAP[row.service] || null) : null
  if (row.service && !dbSvc) { noService++; console.log(`  ⚠ 서비스 매핑 실패 (2025): ${row.service}`); continue }

  const projectName = dbSvc ? `${row.project} - ${dbSvc}` : row.project
  const key = `${custId}||${projectName}||${dbSvc || ''}`

  if (!projectsToCreate.has(key)) {
    sheetNo25 += 1
    projectsToCreate.set(key, {
      customer_id: custId,
      project_name: projectName,
      service_type: dbSvc,
      site_category: row.site_category,  // 공공/민간
      project_start: row.proj_start,
      project_end: row.proj_end,
      billing_start: row.bill_start,
      billing_end: row.bill_end,
      billing_method: row.billing_method,
      invoice_day: null,
      notes: row.notes,
      status: 'active',
      source: 'excel_backfill',
      sheet_no: -sheetNo25,  // -1, -2, ... (2025 첫 행이 sheet_no -1)
    })
  }
  for (const m of row.monthly) {
    revenueItems.push({ key, year: 2025, month: m.month, amount: m.amount, customer_id: custId })
  }
}
console.log(`  2025 신규 project (unique): ${sheetNo25}`)

// 2024 처리 (sheet_no -10001 부터)
let sheetNo24 = 10000
console.log(`\n[2024 항목 확장]`)
for (const row of data2024) {
  const custId = findCust(row.company)
  if (!custId) { noCustomer++; custMisses.add(row.company); continue }
  const dbSvc = row.service ? (SERVICE_MAP[row.service] || null) : null
  if (row.service && !dbSvc) { noService++; console.log(`  ⚠ 서비스 매핑 실패 (2024): ${row.service}`); continue }

  const projectName = dbSvc ? `${row.project} - ${dbSvc}` : row.project
  const key = `${custId}||${projectName}||${dbSvc || ''}`

  if (!projectsToCreate.has(key)) {
    sheetNo24 += 1
    projectsToCreate.set(key, {
      customer_id: custId,
      project_name: projectName,
      service_type: dbSvc,
      site_category: row.site_category,  // 건설사/인테리어 등 (편의상 site_category 로 저장)
      project_start: row.proj_start,
      project_end: row.proj_end,
      billing_start: row.bill_start,
      billing_end: row.bill_end,
      billing_method: row.billing_method,
      invoice_day: null,
      notes: row.notes,
      status: 'active',
      source: 'excel_backfill',
      sheet_no: -sheetNo24,  // -10001, -10002, ... (2025 아래 위치)
    })
  }
  for (const m of row.monthly) {
    revenueItems.push({ key, year: 2024, month: m.month, amount: m.amount, customer_id: custId })
  }
}
console.log(`  2024 신규 project (unique): ${sheetNo24 - 10000}`)

// aggregate (key, year, month) → amount 합산
console.log(`\n[Aggregate]`)
const aggMap = new Map()
for (const r of revenueItems) {
  const k = `${r.key}||${r.year}||${r.month}`
  if (aggMap.has(k)) aggMap.get(k).amount += r.amount
  else aggMap.set(k, { ...r })
}
console.log(`  원본 ${revenueItems.length} → aggregate ${aggMap.size}`)

// 매출 요약
const yearMonth = {}
for (const a of aggMap.values()) {
  const k = `${a.year}-${a.month}`
  yearMonth[k] = (yearMonth[k] || 0) + a.amount
}
const yearTotal = { 2024: 0, 2025: 0 }
for (const [k, v] of Object.entries(yearMonth)) {
  const [y] = k.split('-')
  yearTotal[y] = (yearTotal[y] || 0) + v
}
console.log(`\n예상 매출:`)
console.log(`  2024: ${yearTotal[2024].toLocaleString()}`)
console.log(`  2025: ${yearTotal[2025].toLocaleString()}`)
if (custMisses.size) console.log(`\n회사 매칭 실패 (${custMisses.size}종):`, [...custMisses].slice(0, 10))

if (!LIVE) {
  console.log(`\n[DRY-RUN] --live 로 실행`)
  process.exit(0)
}

// ===== LIVE 실행 =====
console.log(`\n[LIVE] 프로젝트 INSERT (${projectsToCreate.size})...`)
const keys = [...projectsToCreate.keys()]
const rows = [...projectsToCreate.values()]
const keyToProjId = new Map()
let projInserted = 0
for (let i = 0; i < rows.length; i += 100) {
  const slice = rows.slice(i, i + 100)
  const sliceKeys = keys.slice(i, i + 100)
  const { data, error } = await sb.from('projects').insert(slice).select('id')
  if (error) { console.log(`\n  ❌ batch ${i}: ${error.message}`); continue }
  data.forEach((row, j) => keyToProjId.set(sliceKeys[j], row.id))
  projInserted += data.length
  process.stdout.write(`\r  ${projInserted}/${rows.length}`)
}
console.log(`\n  ✅ ${projInserted}/${rows.length}`)

// Revenue INSERT
console.log(`\n[LIVE] Revenues INSERT...`)
const revPayload = []
for (const a of aggMap.values()) {
  const projId = keyToProjId.get(a.key)
  if (!projId) continue
  revPayload.push({
    customer_id: a.customer_id,
    project_id: projId,
    year: a.year,
    month: a.month,
    amount: a.amount,
    is_confirmed: true,
  })
}
console.log(`  payload: ${revPayload.length}`)

let revInserted = 0
for (let i = 0; i < revPayload.length; i += 500) {
  const batch = revPayload.slice(i, i + 500)
  const { error } = await sb.from('monthly_revenues').insert(batch)
  if (error) console.log(`\n  ❌ batch ${i}: ${error.message}`)
  else revInserted += batch.length
  process.stdout.write(`\r  ${revInserted}/${revPayload.length}`)
}
console.log(`\n  ✅ ${revInserted}/${revPayload.length}`)

// 검증
console.log(`\n[검증]`)
for (const y of [2024, 2025, 2026]) {
  const verify = await fetchAll('monthly_revenues', 'amount', q => q.eq('year', y))
  const sum = verify.reduce((s, r) => s + Number(r.amount), 0)
  console.log(`  year=${y}: ${verify.length}행, ${sum.toLocaleString()}원`)
}
console.log(`\n[Done]`)
