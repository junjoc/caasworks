#!/usr/bin/env node
// 통합 rebuild: 2024 또는 2025 시트 기준 재임포트
// usage: node rebuild-year.mjs 2024 --live
//        node rebuild-year.mjs 2025 --live

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
const YEAR = Number(process.argv.find(a => /^\d{4}$/.test(a)) || 0)
if (!YEAR || (YEAR !== 2024 && YEAR !== 2025)) {
  console.error('Usage: node rebuild-year.mjs <2024|2025> [--live]')
  process.exit(1)
}

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
const SERVICE_MAP = { '플랫폼': '플랫폼', 'CCTV': 'AI CCTV', 'AI CCTV': 'AI CCTV', '운임비': '운임비', '근로자관리': '근로자관리', 'Wearable Cam': 'Wearable Cam', '기타': '기타', '안전관리': '안전관리', '실시간 안전관리': '실시간 안전관리', 'Story Book': 'Story Book', '편집studio': '편집studio', '풀타임 타임랩스': '풀타임 타임랩스', '기타 솔루션': '기타', 'Mobile APP': 'Mobile APP' }

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

// 연도별 시트 config
const SHEET_CFG = {
  2024: {
    id: '1v6jJvJcs5avc-ClQ3YXVwBlKEJ8cJaeKx8hrPVdVeYI',
    range: 'CaaS.Works 현장별 매출 현황!A1:JV1600',
    startI: 9,
    // 컬럼 매핑 (2024 layout)
    parse: (row) => ({
      company: row[4], project: row[6], company_type: row[5],
      proj_start: row[7], proj_end: row[8], bill_start: row[2], bill_end: row[3],
      billing_method: row[10], notes: row[13], service: null,
    }),
    monthly: (row) => {
      const out = []
      for (let m = 0; m < 12; m++) {
        const blockStart = 31 + m * 15
        let sum = 0
        for (let s = 0; s < 13; s++) sum += toMoney(row[blockStart + s])
        if (sum !== 0) out.push({ month: m + 1, amount: sum })
      }
      return out
    },
  },
  2025: {
    id: '1X9u9JUAy1t-i74BWyaVUhj7_73vV_L70kKG-73Z7HZU',
    range: '현장별 전체 매출!A1:AZ2600',
    startI: 8,
    parse: (row) => ({
      company: row[4], project: row[5], site_category: row[6],
      service: row[7], proj_start: row[2], proj_end: row[3],
      bill_start: row[8], bill_end: row[9], notes: row[10], billing_method: row[12],
    }),
    monthly: (row) => {
      const out = []
      for (let m = 0; m < 12; m++) {
        const amt = toMoney(row[21 + m])
        if (amt !== 0) out.push({ month: m + 1, amount: amt })
      }
      return out
    },
  },
}

const cfg = SHEET_CFG[YEAR]
console.log(`\n[${YEAR} rebuild] ${LIVE ? 'LIVE' : 'DRY-RUN'}\n`)

// 1. 시트 파싱
const s = (await sheets.spreadsheets.values.get({
  spreadsheetId: cfg.id, range: cfg.range,
})).data.values || []

const sheetRows = []
let seq = 0
for (let i = cfg.startI; i < s.length; i++) {
  const row = s[i] || []
  const noRaw = row[1]
  const parsed = cfg.parse(row)
  if (!noRaw && !parsed.company) continue
  if (typeof noRaw === 'string' && noRaw === '복사') continue
  if (!parsed.company || typeof parsed.company !== 'string' || !parsed.company.trim()) continue
  if (noRaw !== null && noRaw !== undefined && noRaw !== '' && typeof noRaw !== 'number' && isNaN(parseFloat(noRaw))) continue

  seq++
  sheetRows.push({
    seq,
    company: parsed.company.trim(),
    project: clean(parsed.project) || parsed.company.trim(),
    service: clean(parsed.service),
    site_category: clean(parsed.site_category || parsed.company_type),
    site_category2: null,
    proj_start: toDate(parsed.proj_start),
    proj_end: toDate(parsed.proj_end),
    bill_start: toDate(parsed.bill_start),
    bill_end: toDate(parsed.bill_end),
    notes: clean(parsed.notes),
    billing_method: clean(parsed.billing_method),
    monthly: cfg.monthly(row),
  })
}
console.log(`시트 rows: ${sheetRows.length}, seq 1~${seq}`)
const sheetTotal = sheetRows.reduce((s, r) => s + r.monthly.reduce((a, m) => a + m.amount, 0), 0)
console.log(`시트 매출 총액 (VAT 제외): ${sheetTotal.toLocaleString()}`)

// 2. 고객 매핑
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

// 3. 삭제 대상
const targetProjs = await fetchAll(
  'projects', 'id, revenues:monthly_revenues!inner(year)',
  q => q.eq('source', 'excel_backfill').eq('revenues.year', YEAR)
)
const projIds = targetProjs.map(p => p.id)
console.log(`\n${YEAR} 매출 있는 excel_backfill projects: ${projIds.length}`)

const otherYearRevs = []
for (let i = 0; i < projIds.length; i += 100) {
  const slice = projIds.slice(i, i + 100)
  const { data, error } = await sb.from('monthly_revenues')
    .select('project_id, year').in('project_id', slice).neq('year', YEAR)
  if (error) throw error
  otherYearRevs.push(...(data || []))
}
const hasOtherYear = new Set(otherYearRevs.map(r => r.project_id))
const deleteProjIds = projIds.filter(id => !hasOtherYear.has(id))
const keepProjIds = projIds.filter(id => hasOtherYear.has(id))
console.log(`  → 프로젝트 삭제 (${YEAR}만): ${deleteProjIds.length}`)
console.log(`  → ${YEAR} 매출만 삭제 (유지): ${keepProjIds.length}`)

if (!LIVE) {
  console.log(`\n[DRY-RUN] --live 로 실행`)
  process.exit(0)
}

// ============ LIVE ============

if (missCustomers.size > 0) {
  console.log(`\n[사전] 신규 customers ${missCustomers.size}개`)
  const payload = [...missCustomers].map(name => ({ company_name: name, status: 'active' }))
  const { data, error } = await sb.from('customers').insert(payload).select('id, company_name')
  if (error) { console.log(`  ❌ ${error.message}`); process.exit(1) }
  for (const c of data) { custByName[c.company_name] = c.id; custByName[normalize(c.company_name)] = c.id }
  console.log(`  ✅ ${data.length}개`)
}

// 삭제 1: keep 프로젝트의 매출
console.log(`\n[삭제 1] keep 프로젝트의 ${YEAR} 매출 (${keepProjIds.length}개)`)
let delRevOk = 0
for (let i = 0; i < keepProjIds.length; i += 100) {
  const slice = keepProjIds.slice(i, i + 100)
  const { error, count } = await sb.from('monthly_revenues').delete({ count: 'exact' })
    .in('project_id', slice).eq('year', YEAR)
  if (error) console.log(`  ❌ ${error.message}`)
  else delRevOk += count || 0
  process.stdout.write(`\r  ${i + slice.length}/${keepProjIds.length}`)
}
console.log(`\n  ✅ ${delRevOk} rows 삭제`)

// 삭제 2: 프로젝트 삭제
console.log(`\n[삭제 2] 프로젝트 (${deleteProjIds.length}개)`)
let delProjOk = 0
for (let i = 0; i < deleteProjIds.length; i += 100) {
  const slice = deleteProjIds.slice(i, i + 100)
  const { error, count } = await sb.from('projects').delete({ count: 'exact' }).in('id', slice)
  if (error) console.log(`  ❌ ${error.message}`)
  else delProjOk += count || 0
  process.stdout.write(`\r  ${i + slice.length}/${deleteProjIds.length}`)
}
console.log(`\n  ✅ ${delProjOk}개 삭제`)

// insert projects + revenues
console.log(`\n[insert projects] ${sheetRows.length}개`)
const projs = []
for (const r of sheetRows) {
  const custId = findCust(r.company)
  if (!custId) continue
  const dbSvc = r.service ? (SERVICE_MAP[r.service] || r.service) : null
  const projectName = dbSvc ? `${r.project} - ${dbSvc}` : r.project
  projs.push({
    _seq: r.seq, _monthly: r.monthly, _customerId: custId,
    payload: {
      customer_id: custId, project_name: projectName, service_type: dbSvc,
      site_category: r.site_category, site_category2: r.site_category2,
      project_start: r.proj_start, project_end: r.proj_end,
      billing_start: r.bill_start, billing_end: r.bill_end,
      billing_method: r.billing_method, notes: r.notes,
      status: 'active', source: 'excel_backfill', sheet_no: r.seq, sheet_year: YEAR,
    },
  })
}

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
console.log(`\n  ✅ ${projOk}개`)

// insert revenues
const revsPayload = []
for (const p of projs) {
  const projId = seqToProjId.get(p._seq)
  if (!projId) continue
  for (const m of p._monthly) {
    revsPayload.push({
      project_id: projId, customer_id: p._customerId,
      year: YEAR, month: m.month, amount: m.amount, is_confirmed: true,
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

// 검증
let after = []
for (let off = 0; ; off += 1000) {
  const { data } = await sb.from('monthly_revenues').select('amount').eq('year', YEAR).range(off, off + 999)
  if (!data || !data.length) break
  after = after.concat(data)
  if (data.length < 1000) break
}
const grand = after.reduce((s,r) => s+r.amount, 0)
console.log(`\n[검증] ${YEAR} DB 매출: ${after.length} rows, 총액 ${grand.toLocaleString()}`)
console.log(`  시트 총액: ${sheetTotal.toLocaleString()}`)
console.log(`  차이:      ${(grand - sheetTotal).toLocaleString()}`)
