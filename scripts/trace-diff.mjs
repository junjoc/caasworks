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

const [full, zOnly] = await Promise.all([
  sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: tab + '!A1:AZ5000',
    valueRenderOption: 'UNFORMATTED_VALUE',
  }).then(r => r.data.values || []),
  sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: tab + '!Z9:Z3000',
    valueRenderOption: 'UNFORMATTED_VALUE',
  }).then(r => r.data.values || []),
])

// Method 1: full[i][25] (what v2 uses internally)
let fullSum = 0, fullN = 0
for (let i = 8; i < full.length; i++) {
  const v = full[i]?.[25]
  if (typeof v === 'number' && v > 0) { fullSum += v; fullN++ }
}
console.log('Method 1 full[i][25] from row 9:', fullN, '건', '₩' + fullSum.toLocaleString())

// Method 2: Z9:Z3000 direct
let zSum = 0, zN = 0
for (let i = 0; i < zOnly.length; i++) {
  const v = zOnly[i]?.[0]
  if (typeof v === 'number' && v > 0) { zSum += v; zN++ }
}
console.log('Method 2 Z9:Z3000 direct:        ', zN, '건', '₩' + zSum.toLocaleString())

// Row-by-row diff
const diffs = []
const maxLen = Math.max(full.length - 8, zOnly.length)
for (let i = 0; i < maxLen; i++) {
  const vF = typeof full[i + 8]?.[25] === 'number' ? full[i + 8][25] : 0
  const vZ = typeof zOnly[i]?.[0] === 'number' ? zOnly[i][0] : 0
  if (vF !== vZ) diffs.push({ row: i + 9, full: vF, z: vZ })
}
console.log('\ndiff rows:', diffs.length)
diffs.slice(0, 30).forEach(d => console.log('  row', d.row, 'full=', d.full, 'z=', d.z))

// Find last non-empty row and 아이디알
let lastRow = 0
for (let i = 8; i < full.length; i++) {
  if (full[i] && full[i].some(c => c !== null && c !== undefined && c !== '')) lastRow = i + 1
}
console.log('\nlast non-empty row:', lastRow)

for (let i = 8; i < full.length; i++) {
  const company = (full[i]?.[4] || '').toString()
  if (company.includes('아이디알') || company.includes('idr')) {
    console.log('아이디알 row:', i + 1, 'company=', company, 'apr=', full[i]?.[25])
  }
}
