#!/usr/bin/env node
// ============================================================
// v2: Uses UNFORMATTED_VALUE to read raw numeric values from the
// sheet. The FORMATTED_VALUE-based v1 script was introducing tiny
// parse errors (₩64,000 overcount on April). This fixes that.
//
// Usage: node scripts/reset-2026-revenue-v2.mjs [--live]
// ============================================================

import { readFileSync } from 'fs'
import { google } from 'googleapis'
import { createClient } from '@supabase/supabase-js'

const env = readFileSync('.env.local', 'utf-8')
env.split('\n').forEach(l => { const m = l.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/); if (m) process.env[m[1]] = m[2].replace(/^"(.*)"$/, '$1') })

const SHEET_ID = '1ISGq9rkQe8LOlmS1-nCmWp95Lr34kpJ_jnp3OTaLFHQ'
const LIVE = process.argv.includes('--live')
const YEAR = 2026
const COL = { NO:1, PROJ_START:2, PROJ_END:3, COMPANY:4, PROJECT:5, SITE_CAT:6, SITE_CAT2:7, SERVICE:8, BILL_START:9, BILL_END:10, NOTES:11, BILL_METHOD:13 }
const MONTH_COLS = [22,23,24,25,26,27,28,29,30,31,32,33]

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
function col(r, i) { return (r[i]||'').toString().trim() }
// For month columns we use rawNum() with UNFORMATTED_VALUE data.
function rawNum(v) { return typeof v === 'number' ? v : 0 }
function parseDate(s) { if (!s) return null; const s2 = (s||'').toString().trim().replace(/\./g, '-').replace(/\s+/g, ''); const m = s2.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/); return m ? `${m[1]}-${m[2].padStart(2,'0')}-${m[3].padStart(2,'0')}` : null }
const normalize = (s) => (s||'').replace(/\s+/g,'').replace(/[()（）\-·・㈜]/g,'').toLowerCase()

function getAuth() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_KEY||''
  let c; try{c=JSON.parse(raw)}catch{c=JSON.parse(Buffer.from(raw,'base64').toString('utf-8'))}
  return new google.auth.GoogleAuth({credentials:c, scopes:['https://www.googleapis.com/auth/spreadsheets.readonly']})
}

async function fetchAll(table, cols, filter) {
  const size = 1000; let all = []
  for (let from = 0; ; from += size) {
    let q = sb.from(table).select(cols).range(from, from+size-1)
    if (filter) q = filter(q)
    const { data, error } = await q
    if (error) throw error
    if (!data || data.length === 0) break
    all = all.concat(data)
    if (data.length < size) break
  }
  return all
}

console.log(`[Reset 2026 v2] ${LIVE ? 'LIVE' : 'DRY-RUN'} · year=${YEAR}`)

const customers = await fetchAll('customers', 'id, company_name')
const custByName = {}
for (const c of customers) { if (c.company_name) { custByName[c.company_name]=c.id; custByName[normalize(c.company_name)]=c.id } }
console.log(`  customers: ${customers.length}`)

const sheets = google.sheets({version:'v4', auth:getAuth()})
const metaRes = await sheets.spreadsheets.get({spreadsheetId:SHEET_ID})
const tab = metaRes.data.sheets.map(s=>s.properties.title).find(t=>t.includes('현장별 전체 매출'))

// Fetch TEXT (formatted) for text columns AND RAW (unformatted) for month columns
const [rowsFmt, rowsRaw] = await Promise.all([
  sheets.spreadsheets.values.get({spreadsheetId:SHEET_ID, range:`${tab}!A1:AZ5000`, valueRenderOption: 'FORMATTED_VALUE'}).then(r => r.data.values || []),
  sheets.spreadsheets.values.get({spreadsheetId:SHEET_ID, range:`${tab}!A1:AZ5000`, valueRenderOption: 'UNFORMATTED_VALUE'}).then(r => r.data.values || []),
])
console.log(`  sheet rows: fmt=${rowsFmt.length} raw=${rowsRaw.length}`)

// Also get row hidden metadata
const gridMeta = await sheets.spreadsheets.get({
  spreadsheetId:SHEET_ID, ranges: [`${tab}!A1:A5000`], includeGridData: true,
  fields: 'sheets(data(rowMetadata(hiddenByUser,hiddenByFilter)))',
})
const rowMetas = gridMeta.data.sheets[0].data[0].rowMetadata || []

const missingCustomers = new Set()
const sheetProjects = []
let hiddenSkipped = 0

for (let i = 8; i < rowsFmt.length; i++) {  // row 9 onwards (0-indexed 8)
  const m = rowMetas[i] || {}
  if (m.hiddenByUser || m.hiddenByFilter) {
    hiddenSkipped++
    continue
  }
  const fRow = rowsFmt[i]
  const rRow = rowsRaw[i] || []
  if (!fRow) continue
  const no = col(fRow, COL.NO); if (!no || isNaN(parseFloat(no))) continue
  const companyName = col(fRow, COL.COMPANY); if (!companyName) continue
  if (!(custByName[companyName] || custByName[normalize(companyName)])) {
    missingCustomers.add(companyName)
  }
  const serviceType = col(fRow, COL.SERVICE) || null
  const projectName = col(fRow, COL.PROJECT) || companyName
  const combinedName = serviceType ? `${projectName} - ${serviceType}` : projectName
  const monthlyRevs = []
  for (let m2 = 0; m2 < 12; m2++) {
    const amount = rawNum(rRow[MONTH_COLS[m2]])
    if (amount !== 0) monthlyRevs.push({ month: m2+1, amount })  // include negatives (discounts)
  }
  sheetProjects.push({
    customerName: companyName,
    combinedName,
    serviceType,
    projectRow: {
      project_name: combinedName,
      service_type: serviceType,
      site_category: col(fRow, COL.SITE_CAT) || null,
      site_category2: col(fRow, COL.SITE_CAT2) || null,
      project_start: parseDate(fRow[COL.PROJ_START]),
      project_end: parseDate(fRow[COL.PROJ_END]),
      billing_start: parseDate(fRow[COL.BILL_START]),
      billing_end: parseDate(fRow[COL.BILL_END]),
      billing_method: col(fRow, COL.BILL_METHOD) || null,
      notes: col(fRow, COL.NOTES) || null,
      status: 'active',
      source: 'sheet',
    },
    revenues: monthlyRevs,
  })
}

// Report month totals for verification
const monthTotals = [0,0,0,0,0,0,0,0,0,0,0,0]
for (const sp of sheetProjects) for (const r of sp.revenues) monthTotals[r.month-1] += r.amount
let sheetTotal = monthTotals.reduce((a,b) => a+b, 0)

console.log(`  sheet projects: ${sheetProjects.length} (hidden skipped: ${hiddenSkipped})`)
console.log(`  missing customers: ${missingCustomers.size}`)
console.log('  month totals:')
for (let m = 0; m < 12; m++) console.log(`    ${m+1}월: ₩${monthTotals[m].toLocaleString('ko-KR')}`)
console.log(`  TOTAL: ₩${sheetTotal.toLocaleString('ko-KR')}`)

if (!LIVE) {
  console.log('\n[DRY-RUN] no writes. Re-run with --live.')
  process.exit(0)
}

// ── LIVE ────────────────────────────────────────────────────

// Create missing customers
let custCreated = 0
for (const name of missingCustomers) {
  const { data, error } = await sb.from('customers').insert({
    company_name: name, status: 'active', company_type: '일반', notes: '매출 시트에서 자동 생성',
  }).select('id').single()
  if (error) { console.log(`  ❌ customer create: ${name}`); continue }
  custByName[name] = data.id
  custByName[normalize(name)] = data.id
  custCreated++
}
console.log(`  ✅ customers created: ${custCreated}`)

// Project matching / creation
const existingProjects = await fetchAll('projects', 'id, customer_id, project_name, service_type')
const projByKey = new Map()
for (const p of existingProjects) projByKey.set(`${p.customer_id}||${p.project_name}||${p.service_type || ''}`, p.id)

let projCreated = 0
for (const sp of sheetProjects) {
  const customerId = custByName[sp.customerName] || custByName[normalize(sp.customerName)]
  if (!customerId) continue
  const key = `${customerId}||${sp.combinedName}||${sp.serviceType || ''}`
  if (projByKey.has(key)) continue
  const { data, error } = await sb.from('projects').insert({ ...sp.projectRow, customer_id: customerId }).select('id').single()
  if (error) { console.log(`  ❌ project create: ${sp.combinedName}`); continue }
  projByKey.set(key, data.id)
  projCreated++
}
console.log(`  ✅ projects created: ${projCreated}`)

// Nuke + re-insert 2026 monthly_revenues
const { error: delErr, count: delCount } = await sb.from('monthly_revenues').delete({ count: 'exact' }).eq('year', YEAR)
if (delErr) { console.log(`  ❌ delete: ${delErr.message}`); process.exit(1) }
console.log(`  🗑  deleted ${delCount} rows`)

const revs = []
for (const sp of sheetProjects) {
  const customerId = custByName[sp.customerName] || custByName[normalize(sp.customerName)]
  if (!customerId) continue
  const key = `${customerId}||${sp.combinedName}||${sp.serviceType || ''}`
  const projectId = projByKey.get(key)
  if (!projectId) continue
  for (const r of sp.revenues) revs.push({ project_id: projectId, customer_id: customerId, year: YEAR, month: r.month, amount: r.amount, is_confirmed: true })
}

// Dedupe (same project_id+month) — sum amounts
const dedupe = new Map()
for (const r of revs) {
  const k = `${r.project_id}|${r.month}`
  if (dedupe.has(k)) dedupe.get(k).amount += r.amount
  else dedupe.set(k, { ...r })
}
const finalRevs = Array.from(dedupe.values())

let inserted = 0
for (let i = 0; i < finalRevs.length; i += 500) {
  const batch = finalRevs.slice(i, i+500)
  const { error } = await sb.from('monthly_revenues').insert(batch)
  if (error) { console.log(`  ❌ batch ${i}: ${error.message}`); continue }
  inserted += batch.length
}
console.log(`  ✅ revenues inserted: ${inserted}`)

// Verify by fetching back
const dbRevs = await fetchAll('monthly_revenues', 'month, amount', q => q.eq('year', YEAR))
const dbMonth = [0,0,0,0,0,0,0,0,0,0,0,0]
for (const r of dbRevs) dbMonth[r.month-1] += Number(r.amount)
const dbTotal = dbMonth.reduce((a,b) => a+b, 0)
console.log(`\n=== Verification ===`)
console.log(`month | sheet                | db                   | diff`)
for (let m = 0; m < 12; m++) {
  const diff = monthTotals[m] - dbMonth[m]
  const mark = Math.abs(diff) < 1 ? '✅' : '❌'
  console.log(`  ${String(m+1).padStart(2)}월 | ${monthTotals[m].toLocaleString('ko-KR').padStart(18)} | ${dbMonth[m].toLocaleString('ko-KR').padStart(18)} | ${diff.toString().padStart(8)} ${mark}`)
}
console.log(` TOTAL | ${sheetTotal.toLocaleString('ko-KR').padStart(18)} | ${dbTotal.toLocaleString('ko-KR').padStart(18)} | ${(sheetTotal-dbTotal).toString().padStart(8)}`)
