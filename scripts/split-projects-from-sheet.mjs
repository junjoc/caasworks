#!/usr/bin/env node
// ============================================================
// split-projects-from-sheet.mjs
//
// 매출현황 시트의 각 행을 1개 project 로 1:1 매핑하는 재임포트 스크립트.
// 같은 현장의 같은 서비스가 여러 행(대수)이면 각각 개별 project 로 저장.
// sheet_no 컬럼(NUMERIC) 에 시트의 NO 를 그대로 저장 → 1428.1 같은
// 소수점 NO(중간 추가) 도 보존.
//
// 전략:
//   1. 기존 monthly_revenues 와 projects 전체 백업 → json 파일
//   2. monthly_revenues → 전부 삭제
//   3. projects → 전부 삭제 (주의: FK 참조 확인)
//   4. 시트에서 projects 1654건 insert (각 행 = 1 project)
//   5. monthly_revenues 삽입 (시트의 월별 컬럼에서)
//
// Usage:
//   node scripts/split-projects-from-sheet.mjs              # DRY-RUN
//   node scripts/split-projects-from-sheet.mjs --backup     # 백업만 생성
//   node scripts/split-projects-from-sheet.mjs --live       # 실제 수행
// ============================================================

import { google } from 'googleapis'
import { createClient } from '@supabase/supabase-js'
import { readFileSync, writeFileSync } from 'fs'

try {
  const env = readFileSync(new URL('../.env.local', import.meta.url), 'utf-8')
  env.split('\n').forEach(line => {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)
    if (m) process.env[m[1]] = m[2].replace(/^"(.*)"$/, '$1').replace(/\\n/g, '\n')
  })
} catch {}

const SHEET_ID = '1ISGq9rkQe8LOlmS1-nCmWp95Lr34kpJ_jnp3OTaLFHQ'
const ARGS = new Set(process.argv.slice(2))
const LIVE = ARGS.has('--live')
const BACKUP_ONLY = ARGS.has('--backup')
const MODE = LIVE ? 'LIVE' : (BACKUP_ONLY ? 'BACKUP-ONLY' : 'DRY-RUN')

// sheet column indices (0-based) — same as sync-revenue-sheet.mjs
const COL = {
  NO: 1, PROJ_START: 2, PROJ_END: 3,
  COMPANY: 4, PROJECT: 5,
  SITE_CAT: 6, SITE_CAT2: 7, SERVICE: 8,
  BILL_START: 9, BILL_END: 10, NOTES: 11,
  INVOICE_DAY: 12, BILL_METHOD: 13,
}
const MONTH_COLS = [22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33]
const SHEET_YEAR = 2026  // "현장별 전체 매출" 시트는 2026 기준

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

const col = (r, i) => (r?.[i] || '').toString().trim()
const parseMoney = (s) => {
  if (!s) return 0
  const n = Number(s.toString().replace(/[,₩\s]/g, ''))
  return isNaN(n) ? 0 : n
}
const parseDate = (s) => {
  if (!s) return null
  const s2 = s.toString().trim().replace(/\./g, '-').replace(/\s+/g, '')
  const m = s2.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/)
  return m ? `${m[1]}-${m[2].padStart(2,'0')}-${m[3].padStart(2,'0')}` : null
}
const normalize = (s) => (s || '').replace(/\s+/g, '').replace(/[()（）\-·・㈜]/g, '').toLowerCase()
const parseSheetNo = (s) => {
  // 시트 NO는 "1428" 또는 "1428.1" 형식
  const n = parseFloat(String(s).trim())
  return isNaN(n) ? null : n
}

function getAuth() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_KEY || ''
  let credentials
  try { credentials = JSON.parse(raw) }
  catch { credentials = JSON.parse(Buffer.from(raw, 'base64').toString('utf-8')) }
  return new google.auth.GoogleAuth({ credentials, scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'] })
}

async function fetchAll(table, cols, filterFn) {
  const size = 1000
  let all = []
  for (let from = 0; ; from += size) {
    let q = sb.from(table).select(cols).range(from, from + size - 1)
    if (filterFn) q = filterFn(q)
    const { data, error } = await q
    if (error) throw new Error(`${table}: ${error.message}`)
    if (!data || data.length === 0) break
    all = all.concat(data)
    if (data.length < size) break
  }
  return all
}

console.log(`[Split] mode=${MODE}  sheet=${SHEET_ID}  year=${SHEET_YEAR}\n`)

// ── 1. Load existing DB state ─────────────────────────────

const { data: customers } = await sb.from('customers').select('id, company_name').limit(5000)
const custByName = {}
for (const c of customers || []) {
  if (c.company_name) {
    custByName[c.company_name] = c.id
    custByName[normalize(c.company_name)] = c.id
  }
}
console.log(`  customers loaded: ${(customers || []).length}`)

// sheet_no는 migration 009 적용 후에만 존재. 없으면 일반 컬럼만 로드.
let oldProjectCols = 'id, customer_id, project_name, service_type, source, status, created_at'
{
  const probe = await sb.from('projects').select('sheet_no').limit(1)
  if (!probe.error) oldProjectCols += ', sheet_no'
  else console.log('  ℹ projects.sheet_no 미존재 (migration 009 미적용)')
}
const oldProjects = await fetchAll('projects', oldProjectCols)
console.log(`  existing projects: ${oldProjects.length}`)

const oldRevenues = await fetchAll('monthly_revenues', 'id, customer_id, project_id, year, month, amount, is_confirmed, created_at', q => q.eq('year', SHEET_YEAR))
console.log(`  existing revenues (${SHEET_YEAR}): ${oldRevenues.length}`)

// ── 2. Backup ─────────────────────────────────────────────
const timestamp = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19)
const backupPath = `./backup-split-${timestamp}.json`
writeFileSync(backupPath, JSON.stringify({
  note: 'Pre-split backup',
  timestamp: new Date().toISOString(),
  year: SHEET_YEAR,
  projects: oldProjects,
  revenues: oldRevenues,
}, null, 2))
console.log(`  ✅ backup saved: ${backupPath} (projects: ${oldProjects.length}, revenues: ${oldRevenues.length})\n`)

if (BACKUP_ONLY) {
  console.log('[Split] --backup 모드, 백업만 수행하고 종료.')
  process.exit(0)
}

// ── 3. Read sheet ─────────────────────────────────────────
const sheets = google.sheets({ version: 'v4', auth: getAuth() })
const res = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: '현장별 전체 매출!A1:AZ5000' })
const rows = res.data.values || []
console.log(`  sheet rows: ${rows.length}`)

// Parse all sheet rows
const parsedRows = []
let customerMisses = new Set()
let dupSheetNos = new Map()  // sheet_no → [companies]
for (let i = 5; i < rows.length; i++) {
  const r = rows[i]
  const noStr = col(r, COL.NO)
  if (!noStr || isNaN(parseFloat(noStr))) continue
  const company = col(r, COL.COMPANY)
  if (!company) continue

  const sheetNo = parseSheetNo(noStr)
  const customerId = custByName[company] || custByName[normalize(company)]
  if (!customerId) {
    customerMisses.add(company)
    continue
  }

  const project = col(r, COL.PROJECT) || company
  const service = col(r, COL.SERVICE) || null
  const combinedName = service ? `${project} - ${service}` : project

  // month amounts
  const monthAmounts = []
  for (let m = 0; m < 12; m++) {
    const amt = parseMoney(col(r, MONTH_COLS[m]))
    if (amt > 0) monthAmounts.push({ month: m + 1, amount: amt })
  }

  parsedRows.push({
    sheetRowIdx: i,
    sheet_no: sheetNo,
    customer_id: customerId,
    customer_name: company,
    project_name: combinedName,
    service_type: service,
    site_category: col(r, COL.SITE_CAT) || null,
    site_category2: col(r, COL.SITE_CAT2) || null,
    project_start: parseDate(col(r, COL.PROJ_START)),
    project_end: parseDate(col(r, COL.PROJ_END)),
    billing_start: parseDate(col(r, COL.BILL_START)),
    billing_end: parseDate(col(r, COL.BILL_END)),
    billing_method: col(r, COL.BILL_METHOD) || null,
    notes: col(r, COL.NOTES) || null,
    invoice_day: col(r, COL.INVOICE_DAY) ? Number(col(r, COL.INVOICE_DAY)) || null : null,
    month_amounts: monthAmounts,
  })

  // check for (customer_id + sheet_no) duplicates — should be unique per customer
  const key = `${customerId}__${sheetNo}`
  if (dupSheetNos.has(key)) dupSheetNos.get(key).push({ company, sheetNo, row: i })
  else dupSheetNos.set(key, [{ company, sheetNo, row: i }])
}

const dupGroups = [...dupSheetNos.entries()].filter(([, v]) => v.length > 1)
console.log(`\n  [parse] ok: ${parsedRows.length}`)
console.log(`  [parse] customer not found: ${customerMisses.size}`)
console.log(`  [parse] (customer, sheet_no) 중복: ${dupGroups.length} 건`)
if (customerMisses.size && customerMisses.size <= 30) {
  console.log(`  고객 없음 샘플:`)
  for (const n of [...customerMisses].slice(0, 30)) console.log(`    - ${n}`)
}
if (dupGroups.length) {
  console.log(`  중복 sheet_no 샘플:`)
  for (const [k, arr] of dupGroups.slice(0, 10)) console.log(`    ${k}: rows=${arr.map(a => a.row).join(',')}`)
}

// ── 4. DRY-RUN summary ──────────────────────────────────
const projByCust = new Map()
for (const p of parsedRows) {
  const k = p.customer_name
  projByCust.set(k, (projByCust.get(k) || 0) + 1)
}
const top = [...projByCust.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10)
console.log(`\n  top customers by project count (split 후):`)
for (const [name, n] of top) console.log(`    ${n.toString().padStart(4)}건 | ${name}`)

const totalRev = parsedRows.reduce((s, p) => s + p.month_amounts.reduce((a, m) => a + m.amount, 0), 0)
const totalRevRows = parsedRows.reduce((s, p) => s + p.month_amounts.length, 0)

console.log(`\n  after split:`)
console.log(`    projects:        ${parsedRows.length}`)
console.log(`    revenue rows:    ${totalRevRows}`)
console.log(`    revenue total:   ${totalRev.toLocaleString()} 원`)

// FK 체크 — project_id 를 참조하는 다른 테이블들
console.log(`\n  [FK check] tables referencing projects:`)
for (const t of ['invoice_items', 'payment_due_rules', 'camera_shipments']) {
  const { count, error } = await sb.from(t).select('*', { count: 'exact', head: true }).not('project_id', 'is', null)
  if (error) console.log(`    ${t}.project_id: (skip — ${error.message})`)
  else console.log(`    ${t}.project_id: ${count ?? 0} 개 행이 project 를 참조`)
}

if (!LIVE) {
  console.log(`\n[Split] ${MODE}. 실제 반영은 --live 로 실행.`)
  process.exit(0)
}

// ── 5. LIVE mode — execute ──────────────────────────────
console.log(`\n[Split] LIVE mode — 5 seconds to abort (Ctrl+C)...`)
await new Promise(r => setTimeout(r, 5000))

// 5b. Delete revenues (2026 only) + projects
console.log(`\n  [delete] monthly_revenues year=${SHEET_YEAR}...`)
let delRev = 0
for (const r of oldRevenues) {
  const { error } = await sb.from('monthly_revenues').delete().eq('id', r.id)
  if (!error) delRev++
  if (delRev % 500 === 0) process.stdout.write(`\r    ${delRev}/${oldRevenues.length}`)
}
console.log(`\n    ✅ deleted ${delRev} revenue rows`)

console.log(`\n  [delete] projects (all ${oldProjects.length})...`)
let delProj = 0
for (const p of oldProjects) {
  const { error } = await sb.from('projects').delete().eq('id', p.id)
  if (!error) delProj++
  else if (delProj < 5) console.log(`    ❌ ${p.id}: ${error.message}`)
  if (delProj % 500 === 0) process.stdout.write(`\r    ${delProj}/${oldProjects.length}`)
}
console.log(`\n    ✅ deleted ${delProj}/${oldProjects.length} projects`)

if (delProj < oldProjects.length) {
  console.log(`\n  ⚠ ${oldProjects.length - delProj} projects 삭제 실패 — FK 참조 때문일 가능성.`)
  console.log(`  백업 파일: ${backupPath}`)
  console.log(`  중단합니다. FK 참조 정리 후 다시 실행하거나 백업으로 복구하세요.`)
  process.exit(1)
}

// 5c. Insert new projects (one-by-one to capture exact mapping; batch ALTERNATIVE:
// batch insert loses row-order guarantee. we use sheetRowIdx as unique key.)
console.log(`\n  [insert] projects (${parsedRows.length})...`)
let projInserted = 0
const projIdByRowIdx = new Map()  // sheetRowIdx → project_id
// We still batch for speed, but tag each row with sheetRowIdx as notes-suffix
// temporarily, and immediately read back using (customer_id, sheet_no, created_at desc)
// is unreliable. Safest: batch insert with RETURNING using insert().select(),
// and rely on PostgREST returning same order as input.
const CHUNK = 200
for (let i = 0; i < parsedRows.length; i += CHUNK) {
  const slice = parsedRows.slice(i, i + CHUNK)
  const batch = slice.map(p => ({
    customer_id: p.customer_id,
    project_name: p.project_name,
    service_type: p.service_type,
    site_category: p.site_category,
    site_category2: p.site_category2,
    project_start: p.project_start,
    project_end: p.project_end,
    billing_start: p.billing_start,
    billing_end: p.billing_end,
    billing_method: p.billing_method,
    notes: p.notes,
    invoice_day: p.invoice_day,
    sheet_no: p.sheet_no,
    status: 'active',
    source: 'sheet',
  }))
  const { data, error } = await sb.from('projects').insert(batch).select('id')
  if (error) {
    console.log(`\n    ❌ batch ${i}-${i+batch.length}: ${error.message}`)
    continue
  }
  // PostgREST preserves input order in returning array
  data.forEach((ins, j) => {
    projIdByRowIdx.set(slice[j].sheetRowIdx, ins.id)
  })
  projInserted += data.length
  process.stdout.write(`\r    ${projInserted}/${parsedRows.length}`)
}
console.log(`\n    ✅ inserted ${projInserted} projects`)

// 5d. Insert revenues
console.log(`\n  [insert] monthly_revenues...`)
const revPayload = []
for (const p of parsedRows) {
  const projId = projIdByRowIdx.get(p.sheetRowIdx)
  if (!projId) continue
  for (const m of p.month_amounts) {
    revPayload.push({
      customer_id: p.customer_id,
      project_id: projId,
      year: SHEET_YEAR,
      month: m.month,
      amount: m.amount,
      is_confirmed: true,
    })
  }
}
let revInserted = 0
for (let i = 0; i < revPayload.length; i += 500) {
  const batch = revPayload.slice(i, i + 500)
  const { error } = await sb.from('monthly_revenues').insert(batch)
  if (error) console.log(`\n    ❌ rev batch ${i}: ${error.message}`)
  else revInserted += batch.length
  process.stdout.write(`\r    ${revInserted}/${revPayload.length}`)
}
console.log(`\n    ✅ inserted ${revInserted} revenues`)

console.log(`\n[Split] 완료. projects=${projInserted}, revenues=${revInserted}`)
console.log(`  백업: ${backupPath}`)
