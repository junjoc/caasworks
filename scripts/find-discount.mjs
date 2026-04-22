import { readFileSync } from 'fs'
import { google } from 'googleapis'

const env = readFileSync('.env.local', 'utf-8')
env.split('\n').forEach(l => { const m = l.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/); if (m) process.env[m[1]] = m[2].replace(/^"(.*)"$/, '$1') })
const SHEET_ID = '1ISGq9rkQe8LOlmS1-nCmWp95Lr34kpJ_jnp3OTaLFHQ'
function getAuth() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_KEY || ''
  let c; try { c = JSON.parse(raw) } catch { c = JSON.parse(Buffer.from(raw, 'base64').toString('utf-8')) }
  return new google.auth.GoogleAuth({ credentials: c, scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'] })
}

const sheets = google.sheets({ version: 'v4', auth: getAuth() })
const meta = await sheets.spreadsheets.get({ spreadsheetId: SHEET_ID })
const tab = meta.data.sheets.find(s => s.properties.title.includes('현장별 전체 매출')).properties.title

// Fetch full data UNFORMATTED, include negative values
const res = await sheets.spreadsheets.values.get({
  spreadsheetId: SHEET_ID,
  range: `${tab}!A1:AZ2200`,
  valueRenderOption: 'UNFORMATTED_VALUE',
})
const rows = res.data.values || []

// Find 디자인이음새 rows + rows with negative values in month columns
console.log('=== 디자인이음새 rows with 매출 ===')
for (let i = 8; i < rows.length; i++) {
  const company = (rows[i]?.[4] || '').toString()
  if (company.includes('디자인이음새')) {
    const monthVals = []
    for (let m = 0; m < 12; m++) {
      const v = rows[i][22 + m]
      if (typeof v === 'number' && v !== 0) monthVals.push((m+1) + '월:' + v)
    }
    console.log('  row ' + (i+1) + ' company=' + company.substring(0, 25) + ' proj=' + (rows[i][5] || '').substring(0, 30) + ' months=[' + monthVals.join(', ') + ']')
  }
}

console.log('\n=== Rows with NEGATIVE values in month columns ===')
const negRows = []
for (let i = 8; i < rows.length; i++) {
  for (let m = 0; m < 12; m++) {
    const v = rows[i]?.[22 + m]
    if (typeof v === 'number' && v < 0) {
      negRows.push({ row: i+1, month: m+1, val: v, company: rows[i][4], proj: rows[i][5] })
    }
  }
}
console.log('Found ' + negRows.length + ' negative cells')
negRows.forEach(r => console.log('  row ' + r.row + ' ' + r.month + '월: ₩' + r.val.toLocaleString() + ' ' + (r.company||'').substring(0,25) + ' / ' + (r.proj||'').substring(0,30)))

// Total by signed vs unsigned
let posSum = 0, negSum = 0, posCount = 0, negCount = 0
for (let i = 8; i < rows.length; i++) {
  for (let m = 0; m < 12; m++) {
    const v = rows[i]?.[22 + m]
    if (typeof v === 'number' && v !== 0) {
      if (v > 0) { posSum += v; posCount++ }
      else { negSum += v; negCount++ }
    }
  }
}
console.log('\nAll months summary:')
console.log('  Positive cells: ' + posCount + ' = ₩' + posSum.toLocaleString())
console.log('  Negative cells: ' + negCount + ' = ₩' + negSum.toLocaleString())
console.log('  Net (pos + neg): ₩' + (posSum + negSum).toLocaleString())
