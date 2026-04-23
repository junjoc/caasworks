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

// Three DIFFERENT fetch methods
const [fullA, zOnlyB, allBigC] = await Promise.all([
  // A: W9:AI2200 (what compare-now uses)
  sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: `${tab}!W9:AI2200`, valueRenderOption: 'UNFORMATTED_VALUE' }).then(r => r.data.values || []),
  // B: Z9:Z3000 (what my earlier verify used — this gave ₩207,304,750)
  sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: `${tab}!Z9:Z3000`, valueRenderOption: 'UNFORMATTED_VALUE' }).then(r => r.data.values || []),
  // C: A1:AZ5000 (what v2 script uses — gave ₩207,368,750)
  sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: `${tab}!A1:AZ5000`, valueRenderOption: 'UNFORMATTED_VALUE' }).then(r => r.data.values || []),
])

// A: column index 3 in W..AI range (W=0, X=1, Y=2, Z=3)
let aSum = 0, aCount = 0
for (let i = 0; i < fullA.length; i++) {
  const v = fullA[i]?.[3]
  if (typeof v === 'number' && v > 0) { aSum += v; aCount++ }
}
console.log('A (W9:AI2200, col[3]=Z=4월): ' + aCount + ' cells, ₩' + aSum.toLocaleString())

let bSum = 0, bCount = 0
for (let i = 0; i < zOnlyB.length; i++) {
  const v = zOnlyB[i]?.[0]
  if (typeof v === 'number' && v > 0) { bSum += v; bCount++ }
}
console.log('B (Z9:Z3000, col[0]):         ' + bCount + ' cells, ₩' + bSum.toLocaleString())

let cSum = 0, cCount = 0
for (let i = 8; i < allBigC.length; i++) {
  const v = allBigC[i]?.[25]
  if (typeof v === 'number' && v > 0) { cSum += v; cCount++ }
}
console.log('C (A1:AZ5000, col[25]=Z):     ' + cCount + ' cells, ₩' + cSum.toLocaleString())

console.log('\nA-B diff:', aSum - bSum)
console.log('A-C diff:', aSum - cSum)
console.log('B-C diff:', bSum - cSum)

// row-by-row diff A vs B
if (aSum !== bSum) {
  console.log('\nA vs B row diffs:')
  const maxN = Math.max(fullA.length, zOnlyB.length)
  for (let i = 0; i < maxN; i++) {
    const vA = typeof fullA[i]?.[3] === 'number' ? fullA[i][3] : 0
    const vB = typeof zOnlyB[i]?.[0] === 'number' ? zOnlyB[i][0] : 0
    if (vA !== vB) console.log('  row ' + (i+9) + ': A=' + vA + ' B=' + vB + ' diff=' + (vA - vB))
  }
}
