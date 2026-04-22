#!/usr/bin/env node
// ============================================================
// Incremental sync of 매출현황 Google Sheet into projects +
// monthly_revenues. Preserves existing data; only inserts new
// projects and new/updated revenue rows.
//
// Usage:
//   node scripts/sync-revenue-sheet.mjs           # DRY-RUN
//   node scripts/sync-revenue-sheet.mjs --live    # actually writes
// ============================================================

import { google } from 'googleapis'
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'

try {
  const env = readFileSync(new URL('../.env.local', import.meta.url), 'utf-8')
  env.split('\n').forEach(line => {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)
    if (m) process.env[m[1]] = m[2].replace(/^"(.*)"$/, '$1').replace(/\\n/g, '\n')
  })
} catch {}

const SHEET_ID = '1ISGq9rkQe8LOlmS1-nCmWp95Lr34kpJ_jnp3OTaLFHQ'
const LIVE = process.argv.includes('--live')
const MODE = LIVE ? 'LIVE' : 'DRY-RUN'

// Column indices (0-based) for row 4+ (header at row 4, data from row 5)
const COL = {
  NO: 1, PROJ_START: 2, PROJ_END: 3,
  COMPANY: 4, PROJECT: 5,
  SITE_CAT: 6, SITE_CAT2: 7, SERVICE: 8,
  BILL_START: 9, BILL_END: 10, NOTES: 11,
  INVOICE_DAY: 12, BILL_METHOD: 13,
}
const MONTH_COLS = [22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33] // 1월 ~ 12월 (2024 tab / 2025 / 2026 share same layout)
const YEAR_OF_SHEET = new Date().getFullYear()

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

function col(row, idx) { return (row[idx] || '').toString().trim() }

function parseMoney(s) {
  if (!s) return 0
  const n = Number(s.replace(/[,₩\s]/g, ''))
  return isNaN(n) ? 0 : n
}

function parseDate(s) {
  if (!s) return null
  const s2 = s.trim().replace(/\./g, '-').replace(/\s+/g, '')
  // yyyy-mm-dd or yyyy-m-d
  const m = s2.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/)
  if (m) return `${m[1]}-${m[2].padStart(2,'0')}-${m[3].padStart(2,'0')}`
  return null
}

const normalize = (s) => (s || '').replace(/\s+/g, '').replace(/[()（）\-·・㈜]/g, '').toLowerCase()

function getAuth() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_KEY || ''
  let credentials
  try { credentials = JSON.parse(raw) }
  catch { credentials = JSON.parse(Buffer.from(raw, 'base64').toString('utf-8')) }
  return new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
  })
}

// ── 1. Load current DB state ─────────────────────────────────

console.log(`[Revenue Sync] ${MODE} · sheet=${SHEET_ID} · year=${YEAR_OF_SHEET}`)

const { data: customers } = await sb.from('customers').select('id, company_name').limit(3000)
const custById = {}
const custByName = {}
for (const c of customers || []) {
  custById[c.id] = c
  if (c.company_name) {
    custByName[c.company_name] = c.id
    custByName[normalize(c.company_name)] = c.id
  }
}
console.log(`  customers loaded: ${(customers || []).length}`)

// Supabase PostgREST caps at 1000 per request — paginate with .range()
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

const existingProjects = await fetchAll('projects', 'id, customer_id, project_name, service_type')
const projByKey = new Map()  // "{customer_id}||{project_name}||{service_type}" → project_id
for (const p of existingProjects) {
  const key = `${p.customer_id}||${p.project_name}||${p.service_type || ''}`
  projByKey.set(key, p.id)
}
console.log(`  existing projects: ${existingProjects.length}`)

const existingRevs = await fetchAll('monthly_revenues', 'id, project_id, year, month, amount', q => q.eq('year', YEAR_OF_SHEET))
const revByKey = new Map()  // "{project_id}|{month}" → { id, amount }
for (const r of existingRevs) {
  revByKey.set(`${r.project_id}|${r.month}`, { id: r.id, amount: Number(r.amount) })
}
console.log(`  existing monthly_revenues (${YEAR_OF_SHEET}): ${existingRevs.length}`)

// ── 2. Read the sheet ────────────────────────────────────────

const sheets = google.sheets({ version: 'v4', auth: getAuth() })
const meta = await sheets.spreadsheets.get({ spreadsheetId: SHEET_ID })
const tabs = meta.data.sheets.map(s => s.properties.title)
const targetTab = tabs.find(t => t.includes('현장별 전체 매출')) || tabs[0]
console.log(`  sheet tab: ${targetTab}`)

const res = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: `${targetTab}!A1:AZ5000` })
const rows = res.data.values || []
console.log(`  sheet rows: ${rows.length}`)

// Data starts from row 5 (index 4 is header)
let projectsParsed = 0, projectsToInsert = [], revenuesToInsert = [], revenuesToUpdate = []
let customerMissCount = 0
const customerMisses = new Set()

for (let i = 5; i < rows.length; i++) {
  const r = rows[i]
  const no = col(r, COL.NO)
  if (!no || isNaN(parseFloat(no))) continue
  const companyName = col(r, COL.COMPANY)
  if (!companyName) continue

  const projectName = col(r, COL.PROJECT) || companyName
  const serviceType = col(r, COL.SERVICE) || null
  const combinedName = serviceType ? `${projectName} - ${serviceType}` : projectName

  projectsParsed++

  // Match customer (exact → fuzzy by normalized name)
  let customerId = custByName[companyName] || custByName[normalize(companyName)]
  if (!customerId) {
    customerMissCount++
    customerMisses.add(companyName)
    continue
  }

  // Find or plan-to-insert project
  const projKey = `${customerId}||${combinedName}||${serviceType || ''}`
  let projectId = projByKey.get(projKey)

  const projRow = {
    customer_id: customerId,
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
  }

  if (!projectId) {
    projectsToInsert.push({ customerId, combinedName, serviceType, row: projRow, monthKey: i })
  }

  // Monthly revenues — need projectId (which might be TBD for new projects)
  for (let m = 0; m < 12; m++) {
    const amount = parseMoney(col(r, MONTH_COLS[m]))
    if (amount <= 0) continue
    const month = m + 1
    if (projectId) {
      const revKey = `${projectId}|${month}`
      const existing = revByKey.get(revKey)
      if (!existing) {
        revenuesToInsert.push({ project_id: projectId, customer_id: customerId, year: YEAR_OF_SHEET, month, amount, is_confirmed: true })
      } else if (Math.abs(existing.amount - amount) > 0.01) {
        revenuesToUpdate.push({ id: existing.id, amount, _prev: existing.amount, month })
      }
    } else {
      // defer until new project inserted
      revenuesToInsert.push({ _pendingKey: projKey, customer_id: customerId, year: YEAR_OF_SHEET, month, amount, is_confirmed: true })
    }
  }
}

console.log(`\n[Revenue Sync] Parse summary:`)
console.log(`  rows parsed:            ${projectsParsed}`)
console.log(`  customer not matched:   ${customerMissCount} distinct=${customerMisses.size}`)
console.log(`  projects to insert:     ${projectsToInsert.length}`)
console.log(`  revenues to insert:     ${revenuesToInsert.length}`)
console.log(`  revenues to update:     ${revenuesToUpdate.length}`)

if (customerMisses.size > 0 && customerMisses.size < 20) {
  console.log(`  missed companies sample:`)
  for (const n of Array.from(customerMisses).slice(0, 20)) console.log(`    - ${n}`)
}

if (!LIVE) {
  console.log(`\n[Revenue Sync] DRY-RUN — no writes performed. Re-run with --live to apply.`)
  process.exit(0)
}

// ── 3. Apply (LIVE) ─────────────────────────────────────────

console.log(`\n[Revenue Sync] LIVE mode — applying changes...`)

// 3a. Insert new projects
let projInserted = 0
for (const p of projectsToInsert) {
  const { data, error } = await sb.from('projects').insert(p.row).select('id').single()
  if (error) {
    console.log(`  ❌ project insert failed: ${p.combinedName} (${error.message})`)
    continue
  }
  projInserted++
  const newProjectId = data.id
  // Fix up deferred revenues
  for (const rev of revenuesToInsert) {
    if (rev._pendingKey === `${p.row.customer_id}||${p.combinedName}||${p.serviceType || ''}`) {
      rev.project_id = newProjectId
      delete rev._pendingKey
    }
  }
}
console.log(`  ✅ projects inserted: ${projInserted}/${projectsToInsert.length}`)

// 3b. Insert revenues (in batches)
const revsToInsertReady = revenuesToInsert.filter(r => !r._pendingKey)
const unmatchedRevs = revenuesToInsert.filter(r => r._pendingKey).length
if (unmatchedRevs > 0) console.log(`  ⚠ ${unmatchedRevs} revenue rows skipped (project couldn't be created)`)

let revInserted = 0
for (let i = 0; i < revsToInsertReady.length; i += 500) {
  const batch = revsToInsertReady.slice(i, i + 500)
  const { error } = await sb.from('monthly_revenues').insert(batch)
  if (error) console.log(`  ❌ revenue batch ${i}-${i+batch.length} failed: ${error.message}`)
  else revInserted += batch.length
}
console.log(`  ✅ revenues inserted: ${revInserted}/${revsToInsertReady.length}`)

// 3c. Update revenues with changed amounts
let revUpdated = 0
for (const r of revenuesToUpdate) {
  const { error } = await sb.from('monthly_revenues').update({ amount: r.amount }).eq('id', r.id)
  if (error) console.log(`  ❌ revenue update failed: ${error.message}`)
  else revUpdated++
}
console.log(`  ✅ revenues updated:  ${revUpdated}/${revenuesToUpdate.length}`)

console.log(`\n[Revenue Sync] ✅ Done.`)
