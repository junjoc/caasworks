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

// Read full data with metadata including formatting
const gridMeta = await sheets.spreadsheets.get({
  spreadsheetId: SHEET_ID,
  ranges: [`${tab}!W9:AI2200`],
  includeGridData: true,
  fields: 'sheets(data(rowData(values(userEnteredValue,effectiveValue,formattedValue,effectiveFormat(numberFormat)))))',
})

const rowData = gridMeta.data.sheets[0].data[0].rowData || []
console.log('Total rowData entries:', rowData.length)

// Look for cells with value 64000 in any month
console.log('\n=== Cells with value 64000 (any month) ===')
const hits = []
rowData.forEach((rd, rowIdx) => {
  const vals = rd.values || []
  for (let c = 0; c < 12 && c < vals.length; c++) {
    const ev = vals[c]?.effectiveValue
    if (ev?.numberValue === 64000) {
      hits.push({ row: rowIdx + 9, month: c + 1, formattedValue: vals[c].formattedValue, userEnteredValue: vals[c].userEnteredValue })
    }
  }
})
console.log('Found ' + hits.length + ' cells with 64000')
hits.slice(0, 15).forEach(h => console.log('  row ' + h.row + ' ' + h.month + '월: fv="' + h.formattedValue + '" uev=' + JSON.stringify(h.userEnteredValue)))

// Check each row for cells that look like numbers but might be text
console.log('\n=== Possible text-formatted number cells (numberValue exists + numberFormat type != NUMBER/CURRENCY) ===')
let textNumCount = 0
rowData.forEach((rd, rowIdx) => {
  const vals = rd.values || []
  for (let c = 0; c < 12 && c < vals.length; c++) {
    const ev = vals[c]?.effectiveValue
    const fmt = vals[c]?.effectiveFormat?.numberFormat?.type
    if (ev?.numberValue && fmt === 'TEXT') {
      textNumCount++
      if (textNumCount <= 10) console.log('  row ' + (rowIdx + 9) + ' ' + (c + 1) + '월: ' + ev.numberValue + ' fmt=' + fmt)
    }
  }
})
console.log('Total text-formatted: ' + textNumCount)

// Another angle: find rows where at least one month has number AND userEnteredValue is stringValue (type text)
console.log('\n=== stringValue-backed numbers ===')
let strCount = 0
rowData.forEach((rd, rowIdx) => {
  const vals = rd.values || []
  for (let c = 0; c < 12 && c < vals.length; c++) {
    const uev = vals[c]?.userEnteredValue
    const ev = vals[c]?.effectiveValue
    if (uev?.stringValue && ev?.numberValue) {
      strCount++
      if (strCount <= 10) console.log('  row ' + (rowIdx + 9) + ' ' + (c + 1) + '월: str=' + uev.stringValue + ' num=' + ev.numberValue)
    }
  }
})
console.log('Total stringValue-but-number: ' + strCount)
