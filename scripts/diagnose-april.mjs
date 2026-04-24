#!/usr/bin/env node
// ============================================================
// diagnose-april.mjs
//
// April (4월) 2026 revenue 차이 진단
// - Sheet column 25 (April) 데이터 읽기 (row >= 5)
// - DB monthly_revenues (year=2026, month=4) 비교
// - 불일치 항목 상세 리스트 (실제 매출 있는 항목만)
//
// Usage:
//   node scripts/diagnose-april.mjs
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
const YEAR = 2026
const MONTH = 4  // April
const APRIL_COL = 25  // Month columns: 22=1월, 23=2월, ..., 25=4월

const COL = { NO: 1, COMPANY: 4, PROJECT: 5, SERVICE: 8 }

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

const col = (r, i) => (r?.[i] || '').toString().trim()
const parseMoney = (s) => {
  if (!s) return 0
  const n = Number(s.toString().replace(/[,₩\s]/g, ''))
  return isNaN(n) ? 0 : n
}
const parseSheetNo = (s) => {
  const n = parseFloat(String(s).trim())
  return isNaN(n) ? null : n
}
const normalize = (s) => (s || '').replace(/\s+/g, '').replace(/[()（）\-·・㈜]/g, '').toLowerCase()

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

console.log(`[Diagnose April 2026 Revenue]\n`)

// ── Load DB data ──────────────────────────────────────────
console.log('📊 Loading DB data...')

const customers = await fetchAll('customers', 'id, company_name')
const custById = {}
const custByNorm = {}  // normalized name → id
for (const c of customers) {
  custById[c.id] = c.company_name
  custByNorm[normalize(c.company_name)] = c.id
}
console.log(`  Customers: ${customers.length}`)

const projects = await fetchAll('projects', 'id, customer_id, sheet_no')
const projByKey = new Map()  // "${customer_id}__${sheet_no}" → project_id
for (const p of projects) {
  if (p.sheet_no != null) {
    const key = `${p.customer_id}__${Number(p.sheet_no)}`
    projByKey.set(key, p.id)
  }
}
console.log(`  Projects: ${projects.length}`)

const revs = await fetchAll('monthly_revenues', 'id, project_id, customer_id, month, amount', q => q.eq('year', YEAR).eq('month', MONTH))
const revByProjId = new Map()  // project_id → amount
const revByKey = new Map()  // "${customer_id}__${sheet_no}" → amount
for (const r of revs) {
  revByProjId.set(r.project_id, Number(r.amount))
  // Try to find the matching project to get sheet_no
  const proj = projects.find(p => p.id === r.project_id)
  if (proj && proj.sheet_no != null) {
    const key = `${r.customer_id}__${Number(proj.sheet_no)}`
    revByKey.set(key, Number(r.amount))
  }
}
console.log(`  Monthly Revenues (${YEAR}-${MONTH}): ${revs.length}\n`)

// ── Read Sheet ────────────────────────────────────────────
console.log('📄 Reading Google Sheet...')
const sheets = google.sheets({ version: 'v4', auth: getAuth() })
const res = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: '현장별 전체 매출!A1:AZ5000' })
const rows = res.data.values || []
console.log(`  Total rows: ${rows.length}`)

// Parse sheet data for April
const sheetData = []  // { no, company, project, service, amount, row_index }
let sheetTotal = 0

for (let i = 5; i < rows.length; i++) {
  const r = rows[i]
  const no = parseSheetNo(col(r, COL.NO))
  if (no === null) continue  // Skip rows without NO

  const company = col(r, COL.COMPANY)
  const project = col(r, COL.PROJECT)
  const service = col(r, COL.SERVICE)
  const amount = parseMoney(col(r, APRIL_COL))

  sheetData.push({
    row: i + 1,  // 1-based for display
    no,
    company,
    project,
    service,
    amount
  })
  sheetTotal += amount
}

console.log(`  Data rows with NO: ${sheetData.length}`)
console.log(`  Sheet April Total: ₩${sheetTotal.toLocaleString('ko-KR')}\n`)

// ── Calculate DB Total ────────────────────────────────────
const dbTotal = Array.from(revByKey.values()).reduce((a, b) => a + b, 0)
console.log(`  DB April Total: ₩${dbTotal.toLocaleString('ko-KR')}`)
console.log(`  Difference: ₩${(sheetTotal - dbTotal).toLocaleString('ko-KR')}\n`)

// ── Find Discrepancies ────────────────────────────────────
console.log('🔍 Analyzing discrepancies...\n')

const discrepancies = []

for (const sheet of sheetData) {
  // Skip empty company or both amounts are 0
  if (!sheet.company || (sheet.amount === 0)) {
    continue
  }

  const custId = custByNorm[normalize(sheet.company)]
  if (!custId) {
    // Customer not found - this is also a discrepancy
    if (sheet.amount !== 0) {
      discrepancies.push({
        type: 'customer_not_found',
        company: sheet.company,
        sheetNo: sheet.no,
        sheetAmount: sheet.amount,
        dbAmount: 0,
        diff: sheet.amount,
        row: sheet.row
      })
    }
    continue
  }

  const key = `${custId}__${sheet.no}`
  const dbAmount = revByKey.get(key) || 0

  if (sheet.amount !== dbAmount) {
    discrepancies.push({
      type: 'mismatch',
      company: sheet.company,
      sheetNo: sheet.no,
      sheetAmount: sheet.amount,
      dbAmount: dbAmount,
      diff: sheet.amount - dbAmount,
      row: sheet.row,
      custId,
      key
    })
  }
}

// Sort by absolute difference, descending
discrepancies.sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff))

console.log(`Total discrepancies (excluding zero/empty): ${discrepancies.length}\n`)

// Show top 20
const top20 = discrepancies.slice(0, 20)
if (top20.length === 0) {
  console.log('No discrepancies found in non-zero rows.')
} else {
  console.log(`Top ${Math.min(20, discrepancies.length)} discrepancies (sorted by |diff|):\n`)

  top20.forEach((d, idx) => {
    console.log(`${idx + 1}. ${d.company} | NO=${d.sheetNo}`)
    console.log(`   Sheet: ₩${d.sheetAmount.toLocaleString('ko-KR')}`)
    console.log(`   DB:    ₩${d.dbAmount.toLocaleString('ko-KR')}`)
    console.log(`   Diff:  ₩${d.diff.toLocaleString('ko-KR')} | Row: ${d.row}`)
    if (d.type === 'customer_not_found') {
      console.log(`   ⚠️  Customer not found in DB`)
    }
    console.log()
  })
}

// Summary statistics
const mismatches = discrepancies.filter(d => d.type === 'mismatch').length
const customerNotFound = discrepancies.filter(d => d.type === 'customer_not_found').length
const totalDiscrepancyAmount = discrepancies.reduce((sum, d) => sum + Math.abs(d.diff), 0)

console.log(`\n📊 Summary:`)
console.log(`  Sheet rows with data: ${sheetData.length}`)
console.log(`  DB month 4 entries: ${revs.length}`)
console.log(`  Mismatches: ${mismatches}`)
console.log(`  Customer not found: ${customerNotFound}`)
console.log(`  Total discrepancy amount: ₩${totalDiscrepancyAmount.toLocaleString('ko-KR')}`)

