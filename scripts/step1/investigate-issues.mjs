import { readFileSync } from 'fs'
import { google } from 'googleapis'
import { createClient } from '@supabase/supabase-js'
const env = readFileSync('.env.local', 'utf-8')
env.split('\n').forEach(l => { const m = l.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/); if (m) process.env[m[1]] = m[2].replace(/^"(.*)"$/, '$1').replace(/\\n/g, '\n') })
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
async function fetchAll(t, cols, ff) { let all=[],size=1000; for(let f=0;;f+=size){let q=sb.from(t).select(cols).range(f,f+size-1); if(ff)q=ff(q); const {data,error}=await q; if(error)throw error; if(!data||!data.length)break; all=all.concat(data); if(data.length<size)break} return all }

// === Issue 1: 2026 1월 이상 숫자 확인 ===
console.log('=== Issue 1: 2026년 1월 상세 ===')
const jan26 = await fetchAll('monthly_revenues',
  'amount, project:projects(project_name, customer:customers(company_name))',
  q => q.eq('year', 2026).eq('month', 1))
console.log(`1월 rows: ${jan26.length}`)
const sortedJan = jan26.sort((a,b) => Number(b.amount) - Number(a.amount))
console.log('상위 20 (금액 큰 순):')
sortedJan.slice(0, 20).forEach(r => {
  console.log(`  ${Number(r.amount).toLocaleString()} · ${r.project?.customer?.company_name} · ${r.project?.project_name}`)
})
const jan26Sum = jan26.reduce((s,r) => s+Number(r.amount), 0)
console.log(`\n2026 1월 총합: ${jan26Sum.toLocaleString()}`)

// 2026 시트에서 1월 값 확인
function getAuth() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_KEY || ''
  let credentials
  try { credentials = JSON.parse(raw) } catch { credentials = JSON.parse(Buffer.from(raw, 'base64').toString('utf-8')) }
  return new google.auth.GoogleAuth({ credentials, scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'] })
}
const sheets = google.sheets({ version: 'v4', auth: getAuth() })
function toMoney(v) { if (!v) return 0; if (typeof v === 'number') return Math.round(v); const n=parseFloat(String(v).replace(/[,₩원\s]/g,'')); return isNaN(n)?0:Math.round(n) }

const s26 = (await sheets.spreadsheets.values.get({
  spreadsheetId: '1ISGq9rkQe8LOlmS1-nCmWp95Lr34kpJ_jnp3OTaLFHQ',
  range: '현장별 전체 매출!A1:AZ5000',
})).data.values || []

let sheetJanTotal = 0
for (let i = 8; i < s26.length; i++) {
  const row = s26[i] || []
  const amt = toMoney(row[21])  // 1월 (0-idx)
  sheetJanTotal += amt
}
console.log(`\n2026 시트 1월 총합: ${sheetJanTotal.toLocaleString()}`)
console.log(`차이 (DB - 시트): ${(jan26Sum - sheetJanTotal).toLocaleString()}`)

// === Issue 2: 2024 시트 숫자 확인 ===
console.log('\n\n=== Issue 2: 2024 숫자 검증 ===')
// 시트의 VAT포함 컬럼 전체 합 (offset 14 in each month block)
const s24 = (await sheets.spreadsheets.values.get({
  spreadsheetId: '1v6jJvJcs5avc-ClQ3YXVwBlKEJ8cJaeKx8hrPVdVeYI',
  range: 'CaaS.Works 현장별 매출 현황!A1:JV1600',
})).data.values || []

let vatIncluded = 0  // offset 14 (VAT포함)
let vatExcluded = 0  // offset 13 (월 이용료 = VAT 제외)
let servicesSum = 0  // offset 0-12 합 (서비스별)
for (let i = 9; i < s24.length; i++) {
  const row = s24[i] || []
  const noRaw = row[1]
  const company = row[4]
  if (!noRaw || !company) continue
  for (let m = 0; m < 12; m++) {
    const bs = 31 + m * 15
    vatIncluded += toMoney(row[bs + 14])
    vatExcluded += toMoney(row[bs + 13])
    for (let s = 0; s < 13; s++) servicesSum += toMoney(row[bs + s])
  }
}
console.log(`시트 col 총합:`)
console.log(`  서비스별 합 (offset 0-12):    ${servicesSum.toLocaleString()}`)
console.log(`  월 이용료 (offset 13, VAT제외): ${vatExcluded.toLocaleString()}`)
console.log(`  VAT포함 (offset 14):          ${vatIncluded.toLocaleString()}`)
console.log(`  사용자 목표 (VAT 포함):        889,653,250`)
console.log(`  현재 DB 2024:                 807,425,683 (VAT 제외)`)
console.log(`  현재 DB × 1.1:                ${Math.round(807425683 * 1.1).toLocaleString()}`)

// 서비스별 합 vs 월이용료 vs VAT포함 3자 비교
console.log(`\n분석:`)
console.log(`  월이용료 (offset 13) vs 서비스별합 (offset 0-12) 차이: ${(vatExcluded - servicesSum).toLocaleString()}`)
console.log(`  VAT포함 vs 서비스별합*1.1 차이: ${(vatIncluded - Math.round(servicesSum * 1.1)).toLocaleString()}`)
