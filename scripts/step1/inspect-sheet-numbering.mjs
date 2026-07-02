#!/usr/bin/env node
// 시트의 NO 값 (소수점 포함) 과 VAT 포함 매출 확인
import { google } from 'googleapis'
import { readFileSync } from 'fs'

try {
  const env = readFileSync('.env.local', 'utf-8')
  env.split('\n').forEach(line => {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)
    if (m) process.env[m[1]] = m[2].replace(/^"(.*)"$/, '$1').replace(/\\n/g, '\n')
  })
} catch {}

function getAuth() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_KEY || ''
  let credentials
  try { credentials = JSON.parse(raw) } catch { credentials = JSON.parse(Buffer.from(raw, 'base64').toString('utf-8')) }
  return new google.auth.GoogleAuth({ credentials, scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'] })
}
const sheets = google.sheets({ version: 'v4', auth: getAuth() })

function toMoney(v) {
  if (v === null || v === undefined || v === '') return 0
  if (typeof v === 'number') return Math.round(v)
  const n = parseFloat(String(v).replace(/[,₩원\s]/g, ''))
  return isNaN(n) ? 0 : Math.round(n)
}

// ===== 2024 =====
console.log('# 2024 시트 NO/VAT 확인\n')
const s24 = (await sheets.spreadsheets.values.get({
  spreadsheetId: '1v6jJvJcs5avc-ClQ3YXVwBlKEJ8cJaeKx8hrPVdVeYI',
  range: `CaaS.Works 현장별 매출 현황!A1:JV1600`
})).data.values || []

// NO 컬럼 값 (col 2 = 0-idx 1) 실측
console.log('## 시트 NO 값 (소수점 포함) 샘플 20개')
const nos = []
for (let i = 9; i < s24.length; i++) {
  const row = s24[i] || []
  const no = row[1]
  if (no !== null && no !== undefined && no !== '') nos.push({ row: i+1, no, company: row[4], project: row[6] })
}
console.log(`총 NO 개수: ${nos.length}`)
console.log('상위 10:')
nos.slice(0, 10).forEach(n => console.log(`  row ${n.row}: NO=${n.no}  ${n.company}  ${n.project}`))
console.log('하위 10:')
nos.slice(-10).forEach(n => console.log(`  row ${n.row}: NO=${n.no}  ${n.company}`))

// 소수점 NO 찾기
const decimalNos = nos.filter(n => {
  const s = String(n.no)
  return s.includes('.') && !s.endsWith('.0')
})
console.log(`\n소수점 NO (예: 1300.1): ${decimalNos.length}개`)
decimalNos.slice(0, 20).forEach(n => console.log(`  row ${n.row}: NO=${n.no}  ${n.company}`))

// VAT 포함 컬럼 (offset 14 = 각 월 15컬럼 블록의 마지막)
// 각 월 블록 시작 col (0-idx): 31 (1월), 46 (2월), ..., 197 (12월)
// VAT 포함: block_start + 14 = 45 (1월), 60 (2월), ..., 211 (12월)
console.log('\n\n## 시트 VAT 포함 매출 (offset 14) 12개월 합계')
let vatTotal = 0
const vatMonthly = {}
for (let i = 9; i < s24.length; i++) {
  const row = s24[i] || []
  const no = row[1]
  if (!no) continue
  if (typeof no === 'string' && isNaN(parseFloat(no))) continue
  for (let m = 0; m < 12; m++) {
    const blockStart = 31 + m * 15
    const vat = toMoney(row[blockStart + 14])
    if (vat !== 0) {
      vatTotal += vat
      vatMonthly[m + 1] = (vatMonthly[m + 1] || 0) + vat
    }
  }
}
console.log(`VAT 포함 총액: ${vatTotal.toLocaleString()}`)
for (let m = 1; m <= 12; m++) console.log(`  ${m}월: ${(vatMonthly[m]||0).toLocaleString()}`)

// 이전 세분화 vs VAT 포함 비교
console.log(`\n### 비교`)
console.log(`  서비스별 세분화 합 (offset 0-12): 807,425,683`)
console.log(`  VAT 포함 합 (offset 14):          ${vatTotal.toLocaleString()}`)
console.log(`  사용자 제공 (부가세 포함 전체):   889,653,250`)
console.log(`  세분화 합 × 1.1:                  ${Math.round(807425683 * 1.1).toLocaleString()}`)

// ===== 2025 =====
console.log('\n\n# 2025 시트 NO 확인\n')
const s25 = (await sheets.spreadsheets.values.get({
  spreadsheetId: '1X9u9JUAy1t-i74BWyaVUhj7_73vV_L70kKG-73Z7HZU',
  range: `현장별 전체 매출!A1:AZ2600`
})).data.values || []
const nos25 = []
for (let i = 8; i < s25.length; i++) {
  const row = s25[i] || []
  const no = row[1]
  if (no !== null && no !== undefined && no !== '' && no !== '복사') nos25.push({ row: i+1, no })
}
console.log(`2025 NO 개수: ${nos25.length}`)
const decNos25 = nos25.filter(n => {
  const s = String(n.no)
  return s.includes('.') && !s.endsWith('.0')
})
console.log(`2025 소수점 NO: ${decNos25.length}개`)
decNos25.slice(0, 20).forEach(n => console.log(`  row ${n.row}: NO=${n.no}`))
