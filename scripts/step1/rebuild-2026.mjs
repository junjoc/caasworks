#!/usr/bin/env node
// 2026 완전 rebuild — 시트 기준으로 프로젝트 + 매출 재구성
// 1. 삭제: excel_backfill AND 2026 매출 있는 projects
//    - 2024/2025 매출도 있는 프로젝트는 유지, 2026 매출만 삭제
// 2. 시트 파싱 (2026, 1~12월)
// 3. 새 프로젝트 insert (source='excel_backfill', sheet_no = 시트 seq)
// 4. 매출 insert

import { google } from 'googleapis'
import { readFileSync } from 'fs'
import { createClient } from '@supabase/supabase-js'

try {
  const env = readFileSync('.env.local', 'utf-8')
  env.split('\n').forEach(line => {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)
    if (m) process.env[m[1]] = m[2].replace(/^"(.*)"$/, '$1').replace(/\\n/g, '\n')
  })
} catch {}

const LIVE = process.argv.includes('--live')
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

function getAuth() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_KEY || ''
  let credentials
  try { credentials = JSON.parse(raw) } catch { credentials = JSON.parse(Buffer.from(raw, 'base64').toString('utf-8')) }
  return new google.auth.GoogleAuth({ credentials, scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'] })
}
const sheets = google.sheets({ version: 'v4', auth: getAuth() })

function toMoney(v) {
  if (v === null || v === undefined || v === '') return 0
  if (typeof v === 'number') return Math.round(v)
  const n = parseFloat(String(v).replace(/[,₩원\s]/g, ''))
  return isNaN(n) ? 0 : Math.round(n)
}
function toDate(v) {
  if (!v) return null
  const s = String(v).trim().replace(/\./g, '-').replace(/\s+/g, '')
  const m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/)
  return m ? `${m[1]}-${m[2].padStart(2,'0')}-${m[3].padStart(2,'0')}` : null
}
const clean = v => (v || '').toString().trim() || null
const normalize = (s) => (s || '').toString().replace(/\s+/g, '').replace(/[()（）\-·・㈜]/g, '').toLowerCase()
const stripSuffix = (s) => (s || '').toString().replace(/\s*\((선납|선불|후불|후납|카드|현금)\)\s*$/g, '').trim()

const SERVICE_MAP = {
  '플랫폼': '플랫폼', 'CCTV': 'AI CCTV', 'AI CCTV': 'AI CCTV',
  '운임비': '운임비', '근로자관리': '근로자관리',
  'Wearable Cam': 'Wearable Cam', '기타': '기타',
  '안전관리': '안전관리', '실시간 안전관리': '실시간 안전관리',
  'Story Book': 'Story Book', '편집studio': '편집studio',
  '풀타임 타임랩스': '풀타임 타임랩스', '기타 솔루션': '기타',
  'Mobile APP': 'Mobile APP',
}

async function fetchAll(t, cols, ff) {
  let all = [], size = 1000
  for (let f = 0; ; f += size) {
    let q = sb.from(t).select(cols).range(f, f + size - 1)
    if (ff) q = ff(q)
    const { data, error } = await q
    if (error) throw error
    if (!data || !data.length) break
    all = all.concat(data); if (data.length < size) break
  }
  return all
}

console.log(`[2026 완전 rebuild] ${LIVE ? 'LIVE' : 'DRY-RUN'}\n`)

// 1. 시트 파싱
const s26 = (await sheets.spreadsheets.values.get({
  spreadsheetId: '1ISGq9rkQe8LOlmS1-nCmWp95Lr34kpJ_jnp3OTaLFHQ',
  range: `현장별 전체 매출!A1:AZ5000`,
})).data.values || []

const sheetRows = []
let seq = 0
for (let i = 8; i < s26.length; i++) {
  const row = s26[i] || []
  const noRaw = row[1]
  const company = row[4]
  if (!noRaw && !company) continue
  if (typeof noRaw === 'string' && noRaw === '복사') continue
  if (!company || typeof company !== 'string' || !company.trim()) continue
  if (noRaw !== null && noRaw !== undefined && noRaw !== '' && typeof noRaw !== 'number' && isNaN(parseFloat(noRaw))) continue

  seq++
  const monthly = []
  for (let m = 0; m < 12; m++) {
    const amt = toMoney(row[22 + m])
    if (amt !== 0) monthly.push({ month: m + 1, amount: amt })
  }
  sheetRows.push({
    seq,
    company: company.trim(),
    project: clean(row[5]) || company.trim(),
    site_category: clean(row[6]),
    site_category2: clean(row[7]),
    service: clean(row[8]),
    proj_start: toDate(row[2]),
    proj_end: toDate(row[3]),
    bill_start: toDate(row[9]),
    bill_end: toDate(row[10]),
    notes: clean(row[11]),
    billing_method: clean(row[13]),
    monthly,
  })
}
console.log(`시트 rows: ${sheetRows.length}, seq 1~${seq}`)

const sheetTotal = sheetRows.reduce((s, r) => s + r.monthly.reduce((a, m) => a + m.amount, 0), 0)
console.log(`시트 매출 총액 (VAT 제외): ${sheetTotal.toLocaleString()}`)

// 2. 고객 매핑 + miss 자동 등록 대상
const customers = await fetchAll('customers', 'id, company_name')
const custByName = {}
for (const c of customers) { custByName[c.company_name] = c.id; custByName[normalize(c.company_name)] = c.id }
function findCust(company) {
  const stripped = stripSuffix(company)
  return custByName[company] || custByName[stripped] || custByName[normalize(company)] || custByName[normalize(stripped)]
}
const missCustomers = new Set()
for (const r of sheetRows) if (!findCust(r.company)) missCustomers.add(r.company.trim())
console.log(`고객 매칭 miss: ${missCustomers.size}`)

// 3. 삭제 대상 파악
const targetProjs = await fetchAll(
  'projects',
  'id, revenues:monthly_revenues!inner(year)',
  q => q.eq('source', 'excel_backfill').eq('revenues.year', 2026)
)
console.log(`\n2026 매출 있는 excel_backfill projects: ${targetProjs.length}`)

// 각 프로젝트가 다른 연도 매출도 있는지 확인
const projIds = targetProjs.map(p => p.id)
const otherYearRevs = []
for (let i = 0; i < projIds.length; i += 100) {
  const slice = projIds.slice(i, i + 100)
  const { data, error } = await sb.from('monthly_revenues')
    .select('project_id, year').in('project_id', slice).neq('year', 2026)
  if (error) throw error
  otherYearRevs.push(...(data || []))
}
const hasOtherYear = new Set(otherYearRevs.map(r => r.project_id))
const deleteProjIds = projIds.filter(id => !hasOtherYear.has(id))  // 2026만 있음 → 프로젝트 삭제
const keepProjIds  = projIds.filter(id => hasOtherYear.has(id))   // 다른 연도도 있음 → 프로젝트 유지, 2026 매출만 삭제
console.log(`  → 프로젝트 삭제 (2026만): ${deleteProjIds.length}`)
console.log(`  → 2026 매출만 삭제 (유지): ${keepProjIds.length}`)

if (!LIVE) {
  console.log(`\n[DRY-RUN] --live 로 실행`)
  process.exit(0)
}

// ============ LIVE ============

// 사전: 신규 customer 자동 등록
if (missCustomers.size > 0) {
  console.log(`\n[사전] 신규 customers ${missCustomers.size}개 추가`)
  const payload = [...missCustomers].map(name => ({ company_name: name, status: 'active' }))
  const { data, error } = await sb.from('customers').insert(payload).select('id, company_name')
  if (error) { console.log(`  ❌ ${error.message}`); process.exit(1) }
  for (const c of data) { custByName[c.company_name] = c.id; custByName[normalize(c.company_name)] = c.id }
  console.log(`  ✅ ${data.length}개 추가`)
}

// 3-A. 유지되는 프로젝트의 2026 매출 삭제
console.log(`\n[삭제 1] 유지 프로젝트의 2026 매출 (${keepProjIds.length}개 프로젝트)`)
let delRevOk = 0
for (let i = 0; i < keepProjIds.length; i += 100) {
  const slice = keepProjIds.slice(i, i + 100)
  const { error, count } = await sb.from('monthly_revenues').delete({ count: 'exact' })
    .in('project_id', slice).eq('year', 2026)
  if (error) console.log(`  ❌ ${error.message}`)
  else delRevOk += count || 0
  process.stdout.write(`\r  ${i + slice.length}/${keepProjIds.length}`)
}
console.log(`\n  ✅ 매출 삭제: ${delRevOk} rows`)

// 3-B. 2026만 있는 프로젝트 삭제 (CASCADE 로 매출도 삭제)
console.log(`\n[삭제 2] 프로젝트 삭제 (${deleteProjIds.length}개)`)
let delProjOk = 0
for (let i = 0; i < deleteProjIds.length; i += 100) {
  const slice = deleteProjIds.slice(i, i + 100)
  const { error, count } = await sb.from('projects').delete({ count: 'exact' }).in('id', slice)
  if (error) console.log(`  ❌ ${error.message}`)
  else delProjOk += count || 0
  process.stdout.write(`\r  ${i + slice.length}/${deleteProjIds.length}`)
}
console.log(`\n  ✅ 프로젝트 삭제: ${delProjOk}`)

// 4-A. 신규 프로젝트 insert (시트 seq 순)
console.log(`\n[insert projects] ${sheetRows.length}개`)
const projs = []
const projSkipped = []
for (const r of sheetRows) {
  const custId = findCust(r.company)
  if (!custId) { projSkipped.push(r); continue }
  const dbSvc = r.service ? (SERVICE_MAP[r.service] || r.service) : null
  const projectName = dbSvc ? `${r.project} - ${dbSvc}` : r.project
  projs.push({
    _seq: r.seq,
    _monthly: r.monthly,
    _customerId: custId,
    payload: {
      customer_id: custId,
      project_name: projectName,
      service_type: dbSvc,
      site_category: r.site_category,
      site_category2: r.site_category2,
      project_start: r.proj_start,
      project_end: r.proj_end,
      billing_start: r.bill_start,
      billing_end: r.bill_end,
      billing_method: r.billing_method,
      notes: r.notes,
      status: 'active',
      source: 'excel_backfill',
      sheet_no: r.seq,
    },
  })
}
console.log(`  대상: ${projs.length}, skip (고객 miss): ${projSkipped.length}`)

const seqToProjId = new Map()
let projOk = 0
for (let i = 0; i < projs.length; i += 100) {
  const slice = projs.slice(i, i + 100)
  const payload = slice.map(p => p.payload)
  const { data, error } = await sb.from('projects').insert(payload).select('id')
  if (error) { console.log(`\n  ❌ ${error.message}`); continue }
  data.forEach((row, j) => seqToProjId.set(slice[j]._seq, row.id))
  projOk += data.length
  process.stdout.write(`\r  ${projOk}/${projs.length}`)
}
console.log(`\n  ✅ ${projOk}개 insert`)

// 4-B. 매출 insert
const revsPayload = []
for (const p of projs) {
  const projId = seqToProjId.get(p._seq)
  if (!projId) continue
  for (const m of p._monthly) {
    revsPayload.push({
      project_id: projId,
      customer_id: p._customerId,
      year: 2026,
      month: m.month,
      amount: m.amount,
      is_confirmed: true,
    })
  }
}
console.log(`\n[insert revenues] ${revsPayload.length} rows`)
let revOk = 0
for (let i = 0; i < revsPayload.length; i += 500) {
  const batch = revsPayload.slice(i, i + 500)
  const { error } = await sb.from('monthly_revenues').insert(batch)
  if (error) console.log(`\n  ❌ ${error.message}`)
  else revOk += batch.length
  process.stdout.write(`\r  ${revOk}/${revsPayload.length}`)
}
console.log(`\n  ✅ ${revOk} rows`)

// 5. 검증 (batch fetch 우회)
let after = []
for (let off = 0; ; off += 1000) {
  const { data } = await sb.from('monthly_revenues').select('month, amount').eq('year', 2026).range(off, off + 999)
  if (!data || !data.length) break
  after = after.concat(data)
  if (data.length < 1000) break
}
console.log(`\n[검증] DB 2026 매출: ${after.length} rows`)
const monthTotals = Array.from({length: 12}, () => ({rows: 0, total: 0}))
for (const r of after) { const i = r.month - 1; monthTotals[i].rows++; monthTotals[i].total += r.amount }
for (let m = 0; m < 12; m++) {
  console.log(`  ${String(m+1).padStart(2)}월: ${String(monthTotals[m].rows).padStart(4)} rows,  ${monthTotals[m].total.toLocaleString().padStart(15)}`)
}
const grand = after.reduce((s,r) => s+r.amount, 0)
console.log(`  총합 (VAT 제외): ${grand.toLocaleString()}`)
console.log(`         × 1.1  = ${Math.round(grand*1.1).toLocaleString()}`)
console.log(`  시트 총액: ${sheetTotal.toLocaleString()}`)
console.log(`  차이:      ${(grand - sheetTotal).toLocaleString()}`)
