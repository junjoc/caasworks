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

// Get detailed cell data for Z column only
const gridMeta = await sheets.spreadsheets.get({
  spreadsheetId: SHEET_ID,
  ranges: [`${tab}!Z9:Z2200`],
  includeGridData: true,
  fields: 'sheets(data(rowData(values(effectiveValue,formattedValue,effectiveFormat(numberFormat(type))))))',
})
const rowData = gridMeta.data.sheets[0].data[0].rowData || []

let sumAll = 0
const entries = []
rowData.forEach((rd, idx) => {
  const cell = rd.values?.[0]
  const ev = cell?.effectiveValue
  if (ev?.numberValue && ev.numberValue > 0) {
    const fmt = cell?.effectiveFormat?.numberFormat?.type
    sumAll += ev.numberValue
    entries.push({ row: idx + 9, val: ev.numberValue, fmt, fv: cell.formattedValue })
  }
})
console.log('Total Z col (row 9~2200) sum: ₩' + sumAll.toLocaleString())
console.log('Cells: ' + entries.length)

// Also fetch via SUM formula through API to verify
const sumRes = await sheets.spreadsheets.values.get({
  spreadsheetId: SHEET_ID,
  range: `${tab}!Z7`,
  valueRenderOption: 'UNFORMATTED_VALUE',
})
console.log('\nRow 7 (sheet SUM formula result for 4월) Z7: ₩' + (sumRes.data.values?.[0]?.[0] || 0).toLocaleString())

// Also compute via sheets api SUM function
const formulaRes = await sheets.spreadsheets.values.get({
  spreadsheetId: SHEET_ID,
  range: `${tab}!AK1:AK1`,  // empty cell to test
  valueRenderOption: 'UNFORMATTED_VALUE',
})

// Sort and show top 20 largest
entries.sort((a, b) => b.val - a.val)
console.log('\nTop 10 largest Z values:')
entries.slice(0, 10).forEach(e => console.log('  row ' + e.row + ': ₩' + e.val.toLocaleString() + ' fmt=' + e.fmt))

// Any with unusual format type?
const unusual = entries.filter(e => e.fmt !== 'CURRENCY' && e.fmt !== 'NUMBER')
console.log('\nUnusual format cells: ' + unusual.length)
unusual.forEach(e => console.log('  row ' + e.row + ': ₩' + e.val.toLocaleString() + ' fmt=' + e.fmt))
