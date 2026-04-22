#!/usr/bin/env node
// ============================================================
// Hard-reset 2026 revenues to exactly match the sheet.
//
// 1. Reads 현장별 전체 매출 tab
// 2. Auto-creates customers for sheet rows that don't match DB
// 3. Auto-creates projects for sheet rows that don't match DB
// 4. Replaces all 2026 monthly_revenues with sheet contents
//    (so rows removed from sheet also disappear from DB)
//
// Usage:
//   node scripts/reset-2026-revenue.mjs           # DRY-RUN
//   node scripts/reset-2026-revenue.mjs --live    # actually writes
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
function parseMoney(s) { if (!s) return 0; const n = Number(s.replace(/[,₩\s]/g,'')); return isNaN(n)?0:n }
function parseDate(s) { if (!s) return null; const s2 = s.trim().replace(/\./g, '-').replace(/\s+/g, ''); const m = s2.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/); return m ? `${m[1]}-${m[2].padStart(2,'0')}-${m[3].padStart(2,'0')}` : null }
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

console.log(`[Reset 2026] ${LIVE ? 'LIVE' : 'DRY-RUN'} · year=${YEAR}`)

// 1. Load customers
const customers = await fetchAll('customers', 'id, company_name')
const custByName = {}
for (const c of customers) { if (c.company_name) { custByName[c.company_name]=c.id; custByName[normalize(c.company_name)]=c.id } }
console.log(`  customers: ${customers.length}`)

// 2. Read sheet
const sheets = google.sheets({version:'v4', auth:getAuth()})
const meta = await sheets.spreadsheets.get({spreadsheetId:SHEET_ID})
const tab = meta.data.sheets.map(s=>s.properties.title).find(t=>t.includes('현장별 전체 매출'))
const res = await sheets.spreadsheets.values.get({spreadsheetId:SHEET_ID, range:`${tab}!A1:AZ5000`})
const rows = res.data.values || []
console.log(`  sheet rows: ${rows.length}`)

// 3. Parse sheet → determine customers to create + projects to create + revenues to insert
const missingCustomers = new Set()
const sheetProjects = []  // { customerName, combinedName, serviceType, projectRow, revenues[] }
for (let i = 5; i < rows.length; i++) {
  const r = rows[i]
  const no = col(r, COL.NO); if (!no || isNaN(parseFloat(no))) continue
  const companyName = col(r, COL.COMPANY); if (!companyName) continue
  if (!(custByName[companyName] || custByName[normalize(companyName)])) {
    missingCustomers.add(companyName)
  }
  const serviceType = col(r, COL.SERVICE) || null
  const projectName = col(r, COL.PROJECT) || companyName
  const combinedName = serviceType ? `${projectName} - ${serviceType}` : projectName
  const monthlyRevs = []
  for (let m = 0; m < 12; m++) {
    const amount = parseMoney(col(r, MONTH_COLS[m]))
    if (amount > 0) monthlyRevs.push({ month: m+1, amount })
  }
  sheetProjects.push({
    customerName: companyName,
    combinedName,
    serviceType,
    projectRow: {
      project_name: combinedName,
      service_type: serviceType,
      site_category: col(r, COL.SITE_CAT) || null,
      site_category2: col(r, COL.SITE_CAT2) || null,
      project_start: parseDate(col(r, COL.PROJ_START)),
      project_end: parseDate(col(r, COL.PROJ_END)),
      billing_start: parseDate(col(r, COL.BILL_START)),
      billing_end: parseDate(col(r, COL.BILL_END)),
      billing_method: col(r, COL.BILL_METHOD) || null,
      notes: col(r, COL.NOTES) || null,
      status: 'active',
      source: 'sheet',
    },
    revenues: monthlyRevs,
  })
}

console.log(`  sheet projects: ${sheetProjects.length}`)
console.log(`  customers to auto-create: ${missingCustomers.size}`)
if (missingCustomers.size > 0) {
  console.log(`    sample: ${Array.from(missingCustomers).slice(0,5).join(', ')}`)
}

// Calculate sheet totals for verification
let sheetTotal = 0
for (const p of sheetProjects) for (const r of p.revenues) sheetTotal += r.amount
console.log(`  sheet 2026 total: ₩${sheetTotal.toLocaleString('ko-KR')}`)

if (!LIVE) {
  console.log('\n[DRY-RUN] No changes made. Re-run with --live to apply.')
  process.exit(0)
}

// ── LIVE mode ────────────────────────────────────────────────

// 4a. Create missing customers
let custCreated = 0
for (const name of missingCustomers) {
  const { data, error } = await sb.from('customers').insert({
    company_name: name,
    status: 'active',
    company_type: '일반',
    notes: '매출 시트에서 자동 생성',
  }).select('id').single()
  if (error) { console.log(`  ❌ customer create failed: ${name}`); continue }
  custByName[name] = data.id
  custByName[normalize(name)] = data.id
  custCreated++
}
console.log(`  ✅ customers created: ${custCreated}`)

// 4b. Load existing projects (post-sync may include ones from earlier)
const existingProjects = await fetchAll('projects', 'id, customer_id, project_name, service_type')
const projByKey = new Map()
for (const p of existingProjects) {
  projByKey.set(`${p.customer_id}||${p.project_name}||${p.service_type || ''}`, p.id)
}

// 4c. Create missing projects
let projCreated = 0, projMatched = 0
for (const sp of sheetProjects) {
  const customerId = custByName[sp.customerName] || custByName[normalize(sp.customerName)]
  if (!customerId) continue
  const key = `${customerId}||${sp.combinedName}||${sp.serviceType || ''}`
  if (projByKey.has(key)) { projMatched++; continue }
  const { data, error } = await sb.from('projects').insert({
    ...sp.projectRow,
    customer_id: customerId,
  }).select('id').single()
  if (error) { console.log(`  ❌ project create failed: ${sp.combinedName}`); continue }
  projByKey.set(key, data.id)
  projCreated++
}
console.log(`  ✅ projects: matched=${projMatched}, created=${projCreated}`)

// 4d. DELETE all 2026 monthly_revenues, then re-insert
console.log(`  🗑  deleting existing 2026 monthly_revenues...`)
const { error: delErr, count: delCount } = await sb.from('monthly_revenues').delete({ count: 'exact' }).eq('year', YEAR)
if (delErr) { console.log(`  ❌ delete failed: ${delErr.message}`); process.exit(1) }
console.log(`  ✅ deleted ${delCount || '?'} rows`)

// 4e. Insert fresh revenues
const revRows = []
for (const sp of sheetProjects) {
  const customerId = custByName[sp.customerName] || custByName[normalize(sp.customerName)]
  if (!customerId) continue
  const key = `${customerId}||${sp.combinedName}||${sp.serviceType || ''}`
  const projectId = projByKey.get(key)
  if (!projectId) continue
  for (const r of sp.revenues) {
    revRows.push({ project_id: projectId, customer_id: customerId, year: YEAR, month: r.month, amount: r.amount, is_confirmed: true })
  }
}

// Dedupe by (project_id, month) — sum amounts if dupes
const dedupe = new Map()
for (const r of revRows) {
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
console.log(`  ✅ inserted: ${inserted}/${finalRevs.length}`)

// Verify
const { data: verify } = await sb.from('monthly_revenues').select('amount').eq('year', YEAR)
const total = (verify || []).reduce((s,r) => s + Number(r.amount), 0)
console.log(`\n[Reset 2026] ✅ Done. DB 2026 total: ₩${total.toLocaleString('ko-KR')} (sheet: ₩${sheetTotal.toLocaleString('ko-KR')})`)
console.log(`  diff: ₩${(total - sheetTotal).toLocaleString('ko-KR')}`)
