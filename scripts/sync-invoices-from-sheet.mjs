// Sync invoices from 매입매출(계산서) Google Sheet tab.
// Each data row (row 9+) represents one contract; each of the 12 month
// blocks to the right contains the invoice issued that month (if any).
//
// Month block columns (0-indexed):
//   base = 9 + (month-1)*11
//   base+3 = 발행일 (issue date)
//   base+4 = 발행 금액 (total with VAT)
//   base+7 = 입금일 (paid date)
//   base+8 = VAT포함 입금액
//   base+9 = 미납액
//
// Usage:
//   node scripts/sync-invoices-from-sheet.mjs          # DRY-RUN
//   node scripts/sync-invoices-from-sheet.mjs --live   # apply

import { readFileSync } from 'fs'
import { google } from 'googleapis'
import { createClient } from '@supabase/supabase-js'

const env = readFileSync('.env.local', 'utf-8')
env.split('\n').forEach(l => {
  const m = l.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)
  if (m) process.env[m[1]] = m[2].replace(/^"(.*)"$/, '$1')
})

const SHEET_ID = '1ISGq9rkQe8LOlmS1-nCmWp95Lr34kpJ_jnp3OTaLFHQ'
const TAB = '매입매출(계산서)'
const YEAR = 2026
const LIVE = process.argv.includes('--live')

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

const normalize = s => (s || '').toString().replace(/\s+/g, '').replace(/[()（）\-·・㈜]/g, '').toLowerCase()

function getAuth() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_KEY || ''
  let c
  try { c = JSON.parse(raw) } catch { c = JSON.parse(Buffer.from(raw, 'base64').toString('utf-8')) }
  return new google.auth.GoogleAuth({ credentials: c, scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'] })
}

// Google Sheets dates come as Excel serial numbers when UNFORMATTED.
// Day 0 = 1899-12-30. Day 1 = 1899-12-31. etc.
function serialToISO(serial) {
  if (typeof serial !== 'number' || serial < 1) return null
  const ms = (serial - 25569) * 86400 * 1000  // 25569 = days between 1899-12-30 and 1970-01-01
  const d = new Date(ms)
  if (isNaN(d.getTime())) return null
  return d.toISOString().substring(0, 10)
}

async function fetchAll(table, cols, filter) {
  const size = 1000; let all = []
  for (let from = 0; ; from += size) {
    let q = sb.from(table).select(cols).range(from, from + size - 1)
    if (filter) q = filter(q)
    const { data, error } = await q
    if (error) throw error
    if (!data || data.length === 0) break
    all = all.concat(data)
    if (data.length < size) break
  }
  return all
}

console.log(`[Invoice Sync] ${LIVE ? 'LIVE' : 'DRY-RUN'} · tab=${TAB} · year=${YEAR}`)

// 1. Load customers for matching
const customers = await fetchAll('customers', 'id, company_name')
const custByName = {}
for (const c of customers) {
  if (c.company_name) {
    custByName[c.company_name] = c.id
    custByName[normalize(c.company_name)] = c.id
  }
}
console.log(`  customers: ${customers.length}`)

// 2. Read sheet
const sheets = google.sheets({ version: 'v4', auth: getAuth() })
const [rawRes, fmtRes] = await Promise.all([
  sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: `${TAB}!A1:EZ2000`, valueRenderOption: 'UNFORMATTED_VALUE' }),
  sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: `${TAB}!A1:EZ2000`, valueRenderOption: 'FORMATTED_VALUE' }),
])
const raw = rawRes.data.values || []
const fmt = fmtRes.data.values || []
console.log(`  sheet rows: ${raw.length}`)

// 3. Parse each data row (rows 9+). Skip row 8 (합계).
const invoices = []
const missingCompanies = new Set()
const baseColForMonth = m => 9 + (m - 1) * 11  // 1월=9, 2월=20, ...

for (let i = 8; i < raw.length; i++) {  // 0-indexed 8 = sheet row 9
  const fRow = fmt[i] || []
  const rRow = raw[i] || []

  const no = (fRow[2] || '').toString().trim()  // col 2 = No.
  const company = (fRow[3] || '').toString().trim()  // col 3 = 회사명
  if (!no || isNaN(parseFloat(no))) continue
  if (!company) continue

  const customerId = custByName[company] || custByName[normalize(company)]
  if (!customerId) {
    missingCompanies.add(company)
    continue
  }

  for (let m = 1; m <= 12; m++) {
    const b = baseColForMonth(m)
    const issueDate = serialToISO(rRow[b + 3])  // 발행일
    const totalAmt = typeof rRow[b + 4] === 'number' ? rRow[b + 4] : 0  // 발행 금액 (VAT 포함)
    const paidDate = serialToISO(rRow[b + 7])  // 입금일
    const paidAmt = typeof rRow[b + 8] === 'number' ? rRow[b + 8] : 0  // 입금액 VAT
    const unpaidAmt = typeof rRow[b + 9] === 'number' ? rRow[b + 9] : 0  // 미납액

    // Skip months with no issued invoice
    if (totalAmt <= 0 && !issueDate) continue

    const subtotal = Math.round(totalAmt / 1.1)
    const vat = totalAmt - subtotal
    const status = paidDate || paidAmt > 0 ? 'paid' : (issueDate ? 'sent' : 'draft')

    invoices.push({
      customer_id: customerId,
      year: YEAR,
      month: m,
      invoice_number: `CAAS-SHEET-${customerId.substring(0, 8)}-${YEAR}-${m.toString().padStart(2, '0')}`,
      sender_company: '(주)아이콘',
      sender_biz_no: '153-87-01774',
      sender_ceo: '김종민',
      receiver_company: company,
      subtotal,
      vat,
      total: totalAmt,
      status,
      sent_at: issueDate,
      paid_at: paidDate,
      notes: `${YEAR}년 ${m}월 청구분 (시트 동기화)${unpaidAmt > 0 ? ` · 미납 ₩${unpaidAmt.toLocaleString()}` : ''}`,
    })
  }
}

// Summary
const byMonth = {}
let totalAmt = 0, paidCount = 0, sentCount = 0
for (const inv of invoices) {
  byMonth[inv.month] = (byMonth[inv.month] || 0) + 1
  totalAmt += inv.total
  if (inv.status === 'paid') paidCount++
  else if (inv.status === 'sent') sentCount++
}
console.log(`\n  invoices parsed:  ${invoices.length}`)
console.log(`  total amount:     ₩${totalAmt.toLocaleString()}`)
console.log(`  status counts:    paid=${paidCount}  sent(미납)=${sentCount}  draft=${invoices.length - paidCount - sentCount}`)
console.log(`  by month:`)
for (let m = 1; m <= 12; m++) console.log(`    ${m}월: ${byMonth[m] || 0}건`)
if (missingCompanies.size > 0) {
  console.log(`\n  ⚠ missing customers (${missingCompanies.size}):`)
  for (const n of missingCompanies) console.log(`    - ${n}`)
}

if (!LIVE) {
  console.log(`\n[DRY-RUN] no writes.`)
  process.exit(0)
}

// ── LIVE ───────────────────────────────────────────────────

// Auto-create missing customers
let custCreated = 0
for (const name of missingCompanies) {
  const { data, error } = await sb.from('customers').insert({
    company_name: name, status: 'active', company_type: '일반', notes: '매입매출 시트에서 자동 생성',
  }).select('id').single()
  if (error) { console.log(`  ❌ customer: ${name} ${error.message}`); continue }
  custByName[name] = data.id
  custByName[normalize(name)] = data.id
  custCreated++
}
console.log(`  ✅ customers created: ${custCreated}`)

// Re-iterate with new customer ids (rebuild invoices)
const invoices2 = []
for (let i = 8; i < raw.length; i++) {
  const fRow = fmt[i] || []
  const rRow = raw[i] || []
  const no = (fRow[2] || '').toString().trim()
  const company = (fRow[3] || '').toString().trim()
  if (!no || isNaN(parseFloat(no)) || !company) continue
  const customerId = custByName[company] || custByName[normalize(company)]
  if (!customerId) continue
  for (let m = 1; m <= 12; m++) {
    const b = baseColForMonth(m)
    const issueDate = serialToISO(rRow[b + 3])
    const totalAmt = typeof rRow[b + 4] === 'number' ? rRow[b + 4] : 0
    const paidDate = serialToISO(rRow[b + 7])
    const paidAmt = typeof rRow[b + 8] === 'number' ? rRow[b + 8] : 0
    const unpaidAmt = typeof rRow[b + 9] === 'number' ? rRow[b + 9] : 0
    if (totalAmt <= 0 && !issueDate) continue
    const subtotal = Math.round(totalAmt / 1.1)
    const vat = totalAmt - subtotal
    const status = paidDate || paidAmt > 0 ? 'paid' : (issueDate ? 'sent' : 'draft')
    invoices2.push({
      customer_id: customerId,
      year: YEAR, month: m,
      invoice_number: `CAAS-SHEET-${customerId.substring(0, 8)}-${YEAR}-${m.toString().padStart(2, '0')}`,
      sender_company: '(주)아이콘',
      sender_biz_no: '153-87-01774',
      sender_ceo: '김종민',
      receiver_company: company,
      subtotal, vat, total: totalAmt,
      status, sent_at: issueDate, paid_at: paidDate,
      notes: `${YEAR}년 ${m}월 청구분 (시트 동기화)${unpaidAmt > 0 ? ` · 미납 ₩${unpaidAmt.toLocaleString()}` : ''}`,
    })
  }
}

// Delete existing 2026 invoices, then insert fresh
const { error: delErr, count: delCount } = await sb.from('invoices').delete({ count: 'exact' }).eq('year', YEAR)
if (delErr) { console.log(`  ❌ delete: ${delErr.message}`); process.exit(1) }
console.log(`  🗑  deleted ${delCount} existing 2026 invoices`)

// Dedupe by (customer_id, year, month) — sum totals if dupes
const dedupe = new Map()
for (const inv of invoices2) {
  const k = `${inv.customer_id}|${inv.year}|${inv.month}`
  if (dedupe.has(k)) {
    const prev = dedupe.get(k)
    prev.total += inv.total
    prev.subtotal += inv.subtotal
    prev.vat += inv.vat
  } else {
    dedupe.set(k, { ...inv })
  }
}
const final = Array.from(dedupe.values())

let inserted = 0, failed = 0
for (let i = 0; i < final.length; i += 500) {
  const batch = final.slice(i, i + 500)
  const { error } = await sb.from('invoices').insert(batch)
  if (error) { console.log(`  ❌ batch ${i}: ${error.message}`); failed += batch.length; continue }
  inserted += batch.length
}
console.log(`  ✅ invoices inserted: ${inserted}/${final.length}${failed ? `  ❌ failed: ${failed}` : ''}`)

// Verify
const { count: dbCount } = await sb.from('invoices').select('*', { count: 'exact', head: true }).eq('year', YEAR)
const dbRevs = await fetchAll('invoices', 'total, status', q => q.eq('year', YEAR))
const dbTotal = dbRevs.reduce((s, r) => s + Number(r.total || 0), 0)
const dbPaid = dbRevs.filter(r => r.status === 'paid').length
const dbSent = dbRevs.filter(r => r.status === 'sent').length
console.log(`\n=== DB after sync ===`)
console.log(`  total count: ${dbCount}`)
console.log(`  total amount: ₩${dbTotal.toLocaleString()}`)
console.log(`  paid:  ${dbPaid}`)
console.log(`  미납:  ${dbSent}`)
