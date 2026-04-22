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
const res = await sheets.spreadsheets.values.get({
  spreadsheetId: SHEET_ID,
  range: '미납 현황!A1:AZ50',
  valueRenderOption: 'FORMATTED_VALUE',
})
const rows = res.data.values || []
console.log('미납 현황 sheet — first 20 rows:')
rows.slice(0, 20).forEach((r, i) => {
  console.log(`row ${i+1}:`, r.slice(0, 15).map(c => (c || '').toString().substring(0, 25)).join(' | '))
})
