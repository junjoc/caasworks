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
const metaRes = await sheets.spreadsheets.get({ spreadsheetId: SHEET_ID })
const tab = metaRes.data.sheets.find(s => s.properties.title.includes('현장별 전체 매출')).properties.title

const full = (await sheets.spreadsheets.values.get({
  spreadsheetId: SHEET_ID,
  range: tab + '!A1:AZ5000',
  valueRenderOption: 'UNFORMATTED_VALUE',
})).data.values || []

// All rows 1650~end that have company name
console.log('Rows 1650~ with company:')
for (let i = 1649; i < full.length; i++) {
  const no = full[i]?.[1]
  const company = (full[i]?.[4] || '').toString()
  const apr = full[i]?.[25]
  if (company || no) {
    console.log('  row ' + (i + 1) + ': no=' + no + ' company=' + company.substring(0, 30) + ' apr=' + apr)
  }
}

// Total rows with ANY month revenue
const monthCols = [22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33]
let rowsWithRevenue = 0
let maxRowWithRev = 0
for (let i = 8; i < full.length; i++) {
  const hasRev = monthCols.some(c => {
    const v = full[i]?.[c]
    return typeof v === 'number' && v > 0
  })
  if (hasRev) {
    rowsWithRevenue++
    maxRowWithRev = i + 1
  }
}
console.log('\nRows with any month revenue: ' + rowsWithRevenue)
console.log('Max row with revenue: ' + maxRowWithRev)

// Companies with revenue after row 1649
console.log('\nCompanies with revenue at row 1650+:')
const companiesAfter = new Set()
for (let i = 1649; i < full.length; i++) {
  const hasRev = monthCols.some(c => {
    const v = full[i]?.[c]
    return typeof v === 'number' && v > 0
  })
  const company = (full[i]?.[4] || '').toString()
  if (hasRev && company) companiesAfter.add(company)
}
companiesAfter.forEach(c => console.log('  - ' + c))
