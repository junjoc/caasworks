import { readFileSync } from 'fs'
import { google } from 'googleapis'

const env = readFileSync('.env.local', 'utf-8')
env.split('\n').forEach(l => {
  const m = l.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)
  if (m) process.env[m[1]] = m[2].replace(/^"(.*)"$/, '$1')
})

const SHEET_ID = '1vsDdXKL4dyRanSENqG3svCOGbTfCV01r'

function getAuth() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_KEY || ''
  let c
  try { c = JSON.parse(raw) } catch { c = JSON.parse(Buffer.from(raw, 'base64').toString('utf-8')) }
  return new google.auth.GoogleAuth({
    credentials: c,
    scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
  })
}

try {
  const sheets = google.sheets({ version: 'v4', auth: getAuth() })
  const meta = await sheets.spreadsheets.get({ spreadsheetId: SHEET_ID })
  console.log('Tabs:')
  for (const s of meta.data.sheets) {
    console.log('  - ' + s.properties.title)
  }

  // Inspect first tab's first 10 rows
  const firstTab = meta.data.sheets[0].properties.title
  console.log('\n=== ' + firstTab + ' (first 10 rows) ===')
  const r = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: firstTab + '!A1:AZ10',
  })
  ;(r.data.values || []).forEach((row, i) => {
    console.log('row ' + (i + 1) + ': [' + row.slice(0, 18).map(c => (c || '').toString().substring(0, 15)).join(' | ') + ']')
  })
} catch (e) {
  console.log('Error:', e.message)
  if (e.message.includes('does not have permission')) {
    console.log('\n⚠ Service account needs read access to sheet:', SHEET_ID)
    console.log('User should share the sheet with the service account email.')
  }
}
