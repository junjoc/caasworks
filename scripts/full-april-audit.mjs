#!/usr/bin/env node
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
const COL = { NO: 1, COMPANY: 4 }
const APRIL_COL = 25

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

// Load DB
const customers = await fetchAll('customers', 'id, company_name')
const custByNorm = {}
for (const c of customers) {
  custByNorm[normalize(c.company_name)] = c.id
}

const projects = await fetchAll('projects', 'id, customer_id, sheet_no')
const projByKey = new Map()
for (const p of projects) {
  if (p.sheet_no != null) {
    const key = `${p.customer_id}__${Number(p.sheet_no)}`
    projByKey.set(key, p)
  }
}

const revs = await fetchAll('monthly_revenues', 'id, project_id, customer_id, amount', q => q.eq('year', 2026).eq('month', 4))
const revByProjId = new Map()
for (const r of revs) {
  revByProjId.set(r.project_id, r.amount)
}

// Read sheet
const sheets = google.sheets({ version: 'v4', auth: getAuth() })
const res = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: '현장별 전체 매출!A1:AZ5000' })
const rows = res.data.values || []

console.log('[April 2026 Full Audit]\n')

const targetCust = '한국교통정책연구원(주)'
const targetCustId = custByNorm[normalize(targetCust)]

console.log(`Target customer: ${targetCust} (ID: ${targetCustId})`)
console.log(`\nDetailed comparison:\n`)
console.log('NO\t\tSheet\t\tDB\t\tDiff')
console.log('─'.repeat(60))

const sheetRows = []
let sheetSum = 0
let dbSum = 0

for (let i = 5; i < rows.length; i++) {
  const r = rows[i]
  const no = parseSheetNo(col(r, COL.NO))
  if (no === null) continue
  
  const company = col(r, COL.COMPANY)
  if (normalize(company) !== normalize(targetCust)) continue
  
  const amount = parseMoney(col(r, APRIL_COL))
  
  const key = `${targetCustId}__${no}`
  const proj = projByKey.get(key)
  const dbAmt = proj ? revByProjId.get(proj.id) || 0 : 0
  
  if (amount !== 0 || dbAmt !== 0) {
    console.log(`${no.toString().padEnd(8)} ₩${amount.toLocaleString('ko-KR').padEnd(12)} ₩${dbAmt.toLocaleString('ko-KR').padEnd(12)} ${(amount - dbAmt >= 0 ? '+' : '')}₩${(amount - dbAmt).toLocaleString('ko-KR')}`)
    sheetSum += amount
    dbSum += dbAmt
    sheetRows.push({ no, amount, dbAmt, diff: amount - dbAmt })
  }
}

console.log('─'.repeat(60))
console.log(`TOTAL\t\t₩${sheetSum.toLocaleString('ko-KR').padEnd(12)} ₩${dbSum.toLocaleString('ko-KR').padEnd(12)} ${(sheetSum - dbSum >= 0 ? '+' : '')}₩${(sheetSum - dbSum).toLocaleString('ko-KR')}`)

const discreps = sheetRows.filter(r => r.diff !== 0)
if (discreps.length > 0) {
  console.log('\n📊 Discrepancies:')
  discreps.forEach(d => {
    console.log(`  NO ${d.no}: Sheet=₩${d.amount.toLocaleString('ko-KR')}, DB=₩${d.dbAmt.toLocaleString('ko-KR')}, Diff=${d.diff >= 0 ? '+' : ''}₩${d.diff.toLocaleString('ko-KR')}`)
  })
}

