#!/usr/bin/env node
// v3 재임포트
//
// 원칙:
// - 각 시트 row = 1 project = 1 sheet_no (1~N 연속)
// - VAT 포함 매출 저장
// - source='excel_backfill' 마킹
// - INSERT only

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

// 서비스 매핑 (2025 시트 서비스명 → DB service_type)
const SERVICE_MAP = {
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

console.log(`[v3 재임포트] ${LIVE ? 'LIVE' : 'DRY-RUN'}\n`)

const data24 = JSON.parse(readFileSync('/tmp/2024_v3.json', 'utf-8'))
const data25 = JSON.parse(readFileSync('/tmp/2025_v3.json', 'utf-8'))
console.log(`2024 파싱: ${data24.length}행`)
console.log(`2025 파싱: ${data25.length}행`)

const customers = await fetchAll('customers', 'id, company_name')
const custByName = {}
for (const c of customers) {
  custByName[c.company_name] = c.id
  custByName[normalize(c.company_name)] = c.id
}
function findCust(company) {
  const stripped = stripSuffix(company)
  return custByName[company] || custByName[stripped]
    || custByName[normalize(company)] || custByName[normalize(stripped)]
}

// 2025 프로젝트 준비
const projs25 = []
const revs25 = []
const custMisses25 = new Set()
for (const r of data25) {
  const custId = findCust(r.company)
  if (!custId) { custMisses25.add(r.company); continue }
  const dbSvc = r.service ? (SERVICE_MAP[r.service] || r.service) : null
  const projectName = dbSvc ? `${r.project} - ${dbSvc}` : r.project
  projs25.push({
    _sheet_no: r.sheet_no,  // 임시로 배열 순서 매칭용
    customer_id: custId,
    project_name: projectName,
    service_type: dbSvc,
    site_category: r.site_category,
    project_start: null,
    project_end: null,
    billing_start: r.bill_start,
    billing_end: r.bill_end,
    billing_method: r.billing_method,
    notes: r.notes,
    status: 'active',
    source: 'excel_backfill',
    sheet_no: r.sheet_no,
  })
  for (const m of r.monthly) {
    revs25.push({
      customer_id: custId,
      _sheet_no: r.sheet_no,  // 매칭용
      year: 2025,
      month: m.month,
      amount: m.amount,
      is_confirmed: true,
    })
  }
}

// 2024 프로젝트 준비 (service_type = 회사타입 or null, project_name = 현장명)
const projs24 = []
const revs24 = []
const custMisses24 = new Set()
for (const r of data24) {
  const custId = findCust(r.company)
  if (!custId) { custMisses24.add(r.company); continue }
  projs24.push({
    _sheet_no: r.sheet_no,
    customer_id: custId,
    project_name: r.project,   // 서비스 suffix 없음
    service_type: null,
    site_category: r.company_type,  // 건설사/인테리어 등
    project_start: r.proj_start,
    project_end: r.proj_end,
    billing_start: r.bill_start,
    billing_end: r.bill_end,
    billing_method: r.billing_method,
    notes: r.notes,
    status: 'active',
    source: 'excel_backfill',
    sheet_no: r.sheet_no,
  })
  for (const m of r.monthly) {
    revs24.push({
      customer_id: custId,
      _sheet_no: r.sheet_no,
      year: 2024,
      month: m.month,
      amount: m.amount,
      is_confirmed: true,
    })
  }
}

console.log(`\n2025 project: ${projs25.length}, revenue: ${revs25.length}`)
console.log(`2024 project: ${projs24.length}, revenue: ${revs24.length}`)
console.log(`\n회사 매칭 실패:`)
console.log(`  2025: ${custMisses25.size}`, [...custMisses25].slice(0, 5))
console.log(`  2024: ${custMisses24.size}`, [...custMisses24].slice(0, 5))

const tot25 = revs25.reduce((s, r) => s + r.amount, 0)
const tot24 = revs24.reduce((s, r) => s + r.amount, 0)
console.log(`\n예상 매출:`)
console.log(`  2024: ${tot24.toLocaleString()}`)
console.log(`  2025: ${tot25.toLocaleString()}`)

if (!LIVE) {
  console.log(`\n[DRY-RUN] --live 로 실행`)
  process.exit(0)
}

// LIVE 실행
async function importGroup(projs, revs, label) {
  console.log(`\n[${label}] projects INSERT...`)
  // sheet_no 순서대로 INSERT (배치 결과 순서 보장)
  const sheetNoToProjId = new Map()
  let projInserted = 0
  for (let i = 0; i < projs.length; i += 100) {
    const slice = projs.slice(i, i + 100)
    // insert 시 _sheet_no 필드는 제외
    const payload = slice.map(p => { const { _sheet_no, ...rest } = p; return rest })
    const { data, error } = await sb.from('projects').insert(payload).select('id')
    if (error) { console.log(`  ❌ batch ${i}: ${error.message}`); continue }
    data.forEach((row, j) => sheetNoToProjId.set(slice[j]._sheet_no, row.id))
    projInserted += data.length
    process.stdout.write(`\r  ${projInserted}/${projs.length}`)
  }
  console.log(`\n  ✅ ${projInserted}/${projs.length}`)

  // revenues INSERT
  console.log(`\n[${label}] revenues INSERT...`)
  const revPayload = revs.map(r => ({
    customer_id: r.customer_id,
    project_id: sheetNoToProjId.get(r._sheet_no),
    year: r.year,
    month: r.month,
    amount: r.amount,
    is_confirmed: r.is_confirmed,
  })).filter(r => r.project_id)
  let revInserted = 0
  for (let i = 0; i < revPayload.length; i += 500) {
    const batch = revPayload.slice(i, i + 500)
    const { error } = await sb.from('monthly_revenues').insert(batch)
    if (error) console.log(`\n  ❌ batch ${i}: ${error.message}`)
    else revInserted += batch.length
    process.stdout.write(`\r  ${revInserted}/${revPayload.length}`)
  }
  console.log(`\n  ✅ ${revInserted}/${revPayload.length}`)
}

await importGroup(projs25, revs25, '2025')
await importGroup(projs24, revs24, '2024')

// 검증
console.log(`\n[검증]`)
for (const y of [2024, 2025, 2026]) {
  const verify = await fetchAll('monthly_revenues', 'amount', q => q.eq('year', y))
  const sum = verify.reduce((s, r) => s + Number(r.amount), 0)
  console.log(`  year=${y}: ${verify.length}행, ${sum.toLocaleString()}원`)
}
console.log(`\n[Done]`)
