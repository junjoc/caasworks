#!/usr/bin/env node
// 2026 시트 7~12월 upsert 임포트.
// - 1~6월은 스킵 (이미 검증됨)
// - 기존 2026 프로젝트 sheet_no 매칭 → 매출 upsert (project_id, year, month) unique
// - 시트에 있는데 DB 에 없는 프로젝트 → 신규 insert 후 매출 추가
// - 파괴 없음 (DELETE 없음)
// - --live 로 실행. 기본은 dry-run.

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
    if (error) throw new Error(error.message)
    if (!data || !data.length) break
    all = all.concat(data)
    if (data.length < size) break
  }
  return all
}

console.log(`[2026 7~12월 upsert] ${LIVE ? 'LIVE' : 'DRY-RUN'}\n`)

// 1. 시트 파싱 (전체 1~12월, 나중에 7~12월만 사용)
const s26 = (await sheets.spreadsheets.values.get({
  spreadsheetId: '1ISGq9rkQe8LOlmS1-nCmWp95Lr34kpJ_jnp3OTaLFHQ',
  range: `현장별 전체 매출!A1:AZ5000`,
})).data.values || []

const rows = []
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
  rows.push({
    sheet_no: seq,
    original_no: noRaw,
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
console.log(`시트 rows: ${rows.length}`)

// 2. 고객 매핑
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

const missCustomers = new Set()
for (const r of rows) if (!findCust(r.company)) missCustomers.add(r.company.trim())
console.log(`고객 매칭 miss: ${missCustomers.size}`)

// 3. DB 의 excel_backfill projects 전부 fetch (customer_id, project_name) 매칭
const allProjs = await fetchAll(
  'projects',
  'id, sheet_no, customer_id, project_name, source',
  q => q.eq('source', 'excel_backfill')
)
const projByKey = new Map()
for (const p of allProjs) {
  const key = `${p.customer_id}||${p.project_name}`
  // 중복 있으면 sheet_no 있는 것 우선
  if (!projByKey.has(key) || p.sheet_no != null) projByKey.set(key, p.id)
}
console.log(`DB excel_backfill projects: ${allProjs.length}, unique (customer,project_name): ${projByKey.size}`)

// 4. 시트 rows → 액션 분류 (customer_id + project_name 매칭)
const actions = {
  updateMonthly712: [],       // 7~12월만 upsert
  newProjectRows: [],         // 신규 프로젝트
  ignoredNoCust: [],
}

for (const r of rows) {
  const custId = findCust(r.company)
  if (!custId) { actions.ignoredNoCust.push(r); continue }

  const dbSvc = r.service ? (SERVICE_MAP[r.service] || r.service) : null
  const projectName = dbSvc ? `${r.project} - ${dbSvc}` : r.project
  const key = `${custId}||${projectName}`
  const projId = projByKey.get(key)

  if (projId) {
    for (const m of r.monthly) {
      if (m.month >= 7 && m.month <= 12) {
        actions.updateMonthly712.push({ project_id: projId, customer_id: custId, year: 2026, month: m.month, amount: m.amount, is_confirmed: true })
      }
    }
  } else {
    actions.newProjectRows.push({ sheetRow: r, customerId: custId, computedProjectName: projectName })
  }
}

console.log(`\n액션 요약:`)
console.log(`  7~12월 upsert (기존 프로젝트): ${actions.updateMonthly712.length}`)
console.log(`  신규 프로젝트: ${actions.newProjectRows.length}`)
console.log(`  고객 매칭 실패 (스킵): ${actions.ignoredNoCust.length}`)

const totalAmt = actions.updateMonthly712.reduce((s, x) => s + x.amount, 0)
console.log(`  기존 프로젝트 7~12월 총액 (VAT 제외): ${totalAmt.toLocaleString()}`)

// 신규 프로젝트 매출 (7~12월만 세기)
let newProj712Total = 0
let newProj712Rows = 0
for (const np of actions.newProjectRows) {
  for (const m of np.sheetRow.monthly) {
    if (m.month >= 7 && m.month <= 12) { newProj712Total += m.amount; newProj712Rows++ }
  }
}
console.log(`  신규 프로젝트 7~12월 총액 (VAT 제외): ${newProj712Total.toLocaleString()} (${newProj712Rows} rows)`)

console.log(`\n합계 7~12월 upsert 후 예상: ${(totalAmt + newProj712Total).toLocaleString()} 원`)

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
  for (const c of data) {
    custByName[c.company_name] = c.id
    custByName[normalize(c.company_name)] = c.id
  }
  console.log(`  ✅ ${data.length}개 추가`)
  // 신규 customer 매칭 재시도
  for (const np of actions.newProjectRows) {
    if (!np.customerId) np.customerId = findCust(np.sheetRow.company)
  }
}

// 4-A. 신규 프로젝트 insert (한 번에 100개씩)
console.log(`\n[신규 projects] ${actions.newProjectRows.length}개 insert`)
let newProjOk = 0
const newProjMap = new Map()  // sheet_no → new project_id
for (let i = 0; i < actions.newProjectRows.length; i += 100) {
  const slice = actions.newProjectRows.slice(i, i + 100)
  const payload = slice.map(({ sheetRow: r, customerId }) => {
    const dbSvc = r.service ? (SERVICE_MAP[r.service] || r.service) : null
    const projectName = dbSvc ? `${r.project} - ${dbSvc}` : r.project
    return {
      customer_id: customerId,
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
      sheet_no: r.sheet_no,
    }
  })
  const { data, error } = await sb.from('projects').insert(payload).select('id')
  if (error) { console.log(`  ❌ ${error.message}`); continue }
  data.forEach((row, j) => newProjMap.set(slice[j].sheetRow.sheet_no, row.id))
  newProjOk += data.length
  process.stdout.write(`\r  ${newProjOk}/${actions.newProjectRows.length}`)
}
console.log(`\n  ✅ 신규 프로젝트 ${newProjOk}개 insert`)

// 4-B. 신규 프로젝트의 7~12월 매출 준비
for (const np of actions.newProjectRows) {
  const projId = newProjMap.get(np.sheetRow.sheet_no)
  if (!projId) continue
  for (const m of np.sheetRow.monthly) {
    if (m.month >= 7 && m.month <= 12) {
      actions.updateMonthly712.push({
        project_id: projId,
        customer_id: np.customerId,
        year: 2026,
        month: m.month,
        amount: m.amount,
        is_confirmed: true,
      })
    }
  }
}

// 4-C. Dedup: 같은 (project_id, year, month) → amount SUM
const revMap = new Map()
for (const rev of actions.updateMonthly712) {
  const key = `${rev.project_id}-${rev.year}-${rev.month}`
  if (revMap.has(key)) {
    revMap.get(key).amount += rev.amount
  } else {
    revMap.set(key, { ...rev })
  }
}
const aggregated = [...revMap.values()]
console.log(`\n[dedup] ${actions.updateMonthly712.length} → ${aggregated.length} (같은 project 여러 서비스 합산)`)

// 4-D. 매출 upsert (project_id, year, month)
console.log(`\n[매출 upsert] ${aggregated.length}개`)
let revOk = 0
for (let i = 0; i < aggregated.length; i += 500) {
  const batch = aggregated.slice(i, i + 500)
  const { error } = await sb.from('monthly_revenues').upsert(batch, {
    onConflict: 'project_id,year,month',
  })
  if (error) { console.log(`\n  ❌ ${error.message}`); continue }
  revOk += batch.length
  process.stdout.write(`\r  ${revOk}/${aggregated.length}`)
}
console.log(`\n  ✅ 매출 ${revOk}개 upsert`)

// 최종 확인 (batch fetch: default 1000 limit 우회)
let after = []
for (let off = 0; ; off += 1000) {
  const { data, error } = await sb.from('monthly_revenues')
    .select('month, amount').eq('year', 2026).range(off, off + 999)
  if (error) { console.log(error.message); process.exit(1) }
  if (!data.length) break
  after = after.concat(data)
  if (data.length < 1000) break
}
const monthTotals = Array.from({ length: 12 }, () => ({ rows: 0, total: 0 }))
for (const r of after) {
  const idx = r.month - 1
  monthTotals[idx].rows++
  monthTotals[idx].total += r.amount
}
console.log(`\n[최종 DB 상태 — 2026]`)
for (let m = 0; m < 12; m++) {
  console.log(`  ${String(m+1).padStart(2)}월: ${String(monthTotals[m].rows).padStart(4)} rows,  ${monthTotals[m].total.toLocaleString().padStart(15)}`)
}
const grand = after.reduce((s, r) => s + r.amount, 0)
console.log(`  총합 (VAT 제외): ${grand.toLocaleString()}`)
console.log(`         × 1.1  = ${Math.round(grand * 1.1).toLocaleString()}`)
