import { readFileSync } from 'fs'
import { google } from 'googleapis'

const env = readFileSync('.env.local', 'utf-8')
env.split('\n').forEach(l => {
  const m = l.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)
  if (m) process.env[m[1]] = m[2].replace(/^"(.*)"$/, '$1')
})

const SHEET_ID = '1ISGq9rkQe8LOlmS1-nCmWp95Lr34kpJ_jnp3OTaLFHQ'

function getAuth() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_KEY || ''
  let c
  try { c = JSON.parse(raw) } catch { c = JSON.parse(Buffer.from(raw, 'base64').toString('utf-8')) }
  return new google.auth.GoogleAuth({
    credentials: c,
    scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
  })
}

const sheets = google.sheets({ version: 'v4', auth: getAuth() })
const fullRes = await sheets.spreadsheets.values.get({
  spreadsheetId: SHEET_ID,
  range: `매입매출(계산서)!A1:BZ2000`,
  valueRenderOption: 'UNFORMATTED_VALUE',
})
const fmtRes = await sheets.spreadsheets.values.get({
  spreadsheetId: SHEET_ID,
  range: `매입매출(계산서)!A1:BZ2000`,
  valueRenderOption: 'FORMATTED_VALUE',
})
const raw = fullRes.data.values || []
const fmt = fmtRes.data.values || []

console.log('Total rows:', raw.length)
console.log('\n=== First 10 rows (FORMATTED, col 0-20) ===')
fmt.slice(0, 10).forEach((r, i) => {
  console.log(`row ${i+1}:`, r.slice(0, 20).map(c => (c || '').toString().substring(0, 15)).join(' | '))
})

// Detect header rows structure
console.log('\n=== col labels (row 5-7) ===')
for (let r = 4; r < 8; r++) {
  if (fmt[r]) {
    fmt[r].forEach((v, i) => {
      if (v && v.toString().trim()) console.log(`  row${r+1} col${i}: "${v.toString().substring(0, 30)}"`)
    })
    console.log('---')
  }
}

// Find where each month's column block starts
console.log('\n=== Looking for 월 markers across all columns ===')
if (fmt[4]) {
  fmt[4].forEach((v, i) => {
    const s = (v || '').toString().trim()
    if (/^\d+월$|^\d+$/.test(s)) console.log(`  col ${i}: "${s}"`)
  })
}

// Count rows with data in company column (guess column 3 based on earlier inspect)
console.log('\n=== Rows with company in col 3 ===')
let rowsWithCompany = 0
for (let i = 7; i < fmt.length; i++) {
  const c = (fmt[i]?.[3] || '').toString().trim()
  if (c && c !== '회사명') rowsWithCompany++
}
console.log('Total:', rowsWithCompany)
