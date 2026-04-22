import { readFileSync } from 'fs'
import { google } from 'googleapis'
import { createClient } from '@supabase/supabase-js'

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
const sheetMeta = await sheets.spreadsheets.get({ spreadsheetId: SHEET_ID })
const tab = sheetMeta.data.sheets.find(s => s.properties.title.includes('현장별 전체 매출')).properties.title

// Sheet: row 9~ end, all 12 months, UNFORMATTED raw values
const res = await sheets.spreadsheets.values.get({
  spreadsheetId: SHEET_ID,
  range: `${tab}!W9:AI2200`,  // W=1월, AI=12월 (columns 22-33 zero-indexed → W-AI)
  valueRenderOption: 'UNFORMATTED_VALUE',
})
const vals = res.data.values || []
const sheetMonth = [0,0,0,0,0,0,0,0,0,0,0,0]
let sheetRows = 0
for (const row of vals) {
  let rowHasRev = false
  for (let m = 0; m < 12; m++) {
    const v = row?.[m]
    if (typeof v === 'number' && v > 0) { sheetMonth[m] += v; rowHasRev = true }
  }
  if (rowHasRev) sheetRows++
}

// DB
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
async function fetchAll(table, cols, filter) {
  const size = 1000; let all = []
  for (let from = 0; ; from += size) {
    let q = sb.from(table).select(cols).range(from, from + size - 1)
    if (filter) q = filter(q)
    const { data, error } = await q
    if (error) throw error
    if (!data || data.length === 0) break
    all = all.concat(data)
    if (data.length < size) break
  }
  return all
}
const dbRevs = await fetchAll('monthly_revenues', 'month, amount', q => q.eq('year', 2026))
const dbMonth = [0,0,0,0,0,0,0,0,0,0,0,0]
for (const r of dbRevs) dbMonth[r.month - 1] += Number(r.amount)

const sheetTotal = sheetMonth.reduce((a,b)=>a+b, 0)
const dbTotal = dbMonth.reduce((a,b)=>a+b, 0)

console.log('='.repeat(70))
console.log('2026 매출: 시트 UNFORMATTED sum vs DB 비교')
console.log('='.repeat(70))
console.log('월  | 시트                  | DB                    | 차이')
console.log('-'.repeat(70))
for (let m = 0; m < 12; m++) {
  const diff = sheetMonth[m] - dbMonth[m]
  const mark = diff === 0 ? '✅' : '❌'
  console.log(String(m+1).padStart(2) + '월 | ' +
    ('₩'+sheetMonth[m].toLocaleString()).padStart(20) + ' | ' +
    ('₩'+dbMonth[m].toLocaleString()).padStart(20) + ' | ' +
    (diff === 0 ? '0' : diff.toLocaleString()).padStart(10) + ' ' + mark)
}
console.log('-'.repeat(70))
console.log('합계 | ' +
  ('₩'+sheetTotal.toLocaleString()).padStart(20) + ' | ' +
  ('₩'+dbTotal.toLocaleString()).padStart(20) + ' | ' +
  (sheetTotal - dbTotal).toLocaleString().padStart(10))
console.log('\nSheet rows w/ revenue:', sheetRows)
console.log('DB revenue rows:', dbRevs.length)
