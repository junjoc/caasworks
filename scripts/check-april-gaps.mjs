// 4월 차이가 어디서 발생하는지 상세 분석
// - DB only: 프로젝트가 DB에는 있는데 시트에서 사라졌거나 빈 값
// - Sheet only: 시트에 있는데 DB에 4월 매출이 없음

import { google } from 'googleapis'
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'

try {
  const env = readFileSync(new URL('../.env.local', import.meta.url), 'utf-8')
  env.split('\n').forEach(line => {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)
    if (m) process.env[m[1]] = m[2].replace(/^"(.*)"$/, '$1').replace(/\\n/g, '\n')
  })
} catch {}

const SHEET_ID = '1ISGq9rkQe8LOlmS1-nCmWp95Lr34kpJ_jnp3OTaLFHQ'
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
const parseMoney = (s) => { if (!s) return 0; const n = Number(s.toString().replace(/[,₩\s]/g, '')); return isNaN(n) ? 0 : n }
const parseSheetNo = (s) => { const n = parseFloat(String(s).trim()); return isNaN(n) ? null : n }

function getAuth() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_KEY || ''
  let credentials
  try { credentials = JSON.parse(raw) } catch { credentials = JSON.parse(Buffer.from(raw, 'base64').toString('utf-8')) }
  return new google.auth.GoogleAuth({ credentials, scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'] })
}

async function fetchAll(t, cols, ff) { let all=[], size=1000; for (let f=0;;f+=size){let q=sb.from(t).select(cols).range(f,f+size-1);if(ff)q=ff(q);const {data,error}=await q;if(error)throw error;if(!data||!data.length)break;all=all.concat(data);if(data.length<size)break}return all }

const customers = await fetchAll('customers', 'id, company_name')
const custById = new Map(customers.map(c => [c.id, c.company_name]))
const custByName = {}
for (const c of customers) {
  if (c.company_name) {
    custByName[c.company_name] = c.id
    custByName[c.company_name.replace(/\s+/g, '').replace(/[()（）\-·・㈜]/g, '').toLowerCase()] = c.id
  }
}

const projects = await fetchAll('projects', 'id, customer_id, sheet_no, project_name, service_type')
const projBySheetKey = new Map(projects.map(p => [`${p.customer_id}__${Number(p.sheet_no)}`, p]))
const projById = new Map(projects.map(p => [p.id, p]))

const revs = await fetchAll('monthly_revenues', 'id, project_id, amount', q => q.eq('year', 2026).eq('month', 4))

// 시트 읽기
const sheets = google.sheets({ version: 'v4', auth: getAuth() })
const res = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: '현장별 전체 매출!A1:AZ5000' })
const rows = res.data.values || []

// 시트에서 4월 금액 (column 25) 있는 행
const sheetRows = new Map()  // `${customer_id}__${sheet_no}` → amount
let unmatchedCust = 0
for (let i = 5; i < rows.length; i++) {
  const r = rows[i] || []
  const noStr = (r[1] || '').toString().trim()
  if (!noStr || isNaN(parseFloat(noStr))) continue
  const company = (r[4] || '').toString().trim()
  if (!company) continue
  const custId = custByName[company] || custByName[company.replace(/\s+/g, '').replace(/[()（）\-·・㈜]/g, '').toLowerCase()]
  if (!custId) { unmatchedCust++; continue }
  const sheetNo = parseSheetNo(noStr)
  const apr = parseMoney(r[25])
  const key = `${custId}__${sheetNo}`
  if (apr !== 0) {
    // 같은 key 중복 대응: 누적
    sheetRows.set(key, (sheetRows.get(key) || 0) + apr)
  }
}

// DB 4월 매출 맵
const dbByProject = new Map()
for (const r of revs) dbByProject.set(r.project_id, (dbByProject.get(r.project_id) || 0) + Number(r.amount))

// 각 방향 비교
let sheetTotal = 0, dbTotal = 0
const sheetOnly = []  // sheet에만 있는 항목 (DB 4월 매출 없음)
const dbOnly = []     // DB에만 있는 항목 (sheet에 이 행이 없거나 4월 금액 없음)
const bothDiff = []

for (const [key, sheetAmt] of sheetRows) {
  sheetTotal += sheetAmt
  const proj = projBySheetKey.get(key)
  if (!proj) {
    sheetOnly.push({ key, sheetAmt, reason: 'project 없음' })
    continue
  }
  const dbAmt = dbByProject.get(proj.id) || 0
  if (dbAmt === 0) {
    sheetOnly.push({ key, sheetAmt, reason: 'DB 4월 없음', proj })
  } else if (Math.abs(dbAmt - sheetAmt) > 0.01) {
    bothDiff.push({ key, sheetAmt, dbAmt, proj })
  }
}

for (const [projId, dbAmt] of dbByProject) {
  dbTotal += dbAmt
  const proj = projById.get(projId)
  if (!proj) continue
  const key = `${proj.customer_id}__${Number(proj.sheet_no)}`
  if (!sheetRows.has(key)) {
    dbOnly.push({ projId, dbAmt, proj })
  }
}

console.log(`\n=== 4월 전체 ===`)
console.log(`시트 합계: ${sheetTotal.toLocaleString()}`)
console.log(`DB 합계:   ${dbTotal.toLocaleString()}`)
console.log(`차이(sheet-db): ${(sheetTotal - dbTotal).toLocaleString()}`)

console.log(`\n=== Sheet에 있는데 DB에 4월 없음 (${sheetOnly.length}건, 합계 ${sheetOnly.reduce((s,x)=>s+x.sheetAmt,0).toLocaleString()}) ===`)
sheetOnly.slice(0, 20).forEach(s => {
  const [cid, sn] = s.key.split('__')
  console.log(`  NO=${sn} | ${custById.get(cid)} | 시트=${s.sheetAmt.toLocaleString()} | ${s.reason} | ${s.proj?.project_name || ''}`)
})

console.log(`\n=== DB에 있는데 Sheet에 없음 (${dbOnly.length}건, 합계 ${dbOnly.reduce((s,x)=>s+x.dbAmt,0).toLocaleString()}) ===`)
dbOnly.slice(0, 20).forEach(s => {
  console.log(`  NO=${s.proj.sheet_no} | ${custById.get(s.proj.customer_id)} | DB=${s.dbAmt.toLocaleString()} | ${s.proj.project_name}`)
})

console.log(`\n=== 값이 다른 케이스 (${bothDiff.length}건) ===`)
bothDiff.slice(0, 20).forEach(s => {
  console.log(`  NO=${s.proj.sheet_no} | ${custById.get(s.proj.customer_id)} | 시트=${s.sheetAmt.toLocaleString()} DB=${s.dbAmt.toLocaleString()}`)
})
