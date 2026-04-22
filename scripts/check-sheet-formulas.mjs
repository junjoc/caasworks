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
  return new google.auth.GoogleAuth({ credentials: c, scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'] })
}

const sheets = google.sheets({ version: 'v4', auth: getAuth() })
const meta = await sheets.spreadsheets.get({ spreadsheetId: SHEET_ID })
const tab = meta.data.sheets.find(s => s.properties.title.includes('현장별 전체 매출')).properties.title

// Get FORMULA values to see the actual formulas used
const res = await sheets.spreadsheets.values.get({
  spreadsheetId: SHEET_ID,
  range: `${tab}!W4:AI8`,  // Rows 4-8 (headers + sum rows)
  valueRenderOption: 'FORMULA',
})
const rows = res.data.values || []

console.log('=== Rows 4-8, columns W (1월) ~ AI (12월) FORMULAS ===')
rows.forEach((r, i) => {
  console.log('\nRow ' + (i+4) + ':')
  for (let c = 0; c < 12; c++) {
    const v = r[c]
    if (v !== undefined && v !== null && v !== '') {
      console.log('  ' + (c+1) + '월 (col ' + String.fromCharCode(87+c) + (87+c > 90 ? '... adjusted' : '') + '): ' + JSON.stringify(v).substring(0, 100))
    }
  }
})

// Also get the VALUES (what user actually sees on screen) for rows 4-8
const res2 = await sheets.spreadsheets.values.get({
  spreadsheetId: SHEET_ID,
  range: `${tab}!W4:AI8`,
  valueRenderOption: 'UNFORMATTED_VALUE',
})
console.log('\n=== Rows 4-8 VALUES ===')
res2.data.values.forEach((r, i) => {
  console.log('\nRow ' + (i+4) + ':')
  for (let c = 0; c < 12; c++) {
    const v = r[c]
    if (typeof v === 'number' && v !== 0) {
      console.log('  ' + (c+1) + '월: ₩' + v.toLocaleString())
    }
  }
})
