#!/usr/bin/env node
// v4 3개 시트 통합 파싱
// 정책:
//   - VAT 제외 값 저장 (2024: offset 0-12 서비스별 값 합; 2025/2026: col 22-33 그대로)
//   - 시트의 모든 데이터 row 카운트 (매출 없어도 포함) → sheet_no 1~N 연속
//   - 시작일/종료일 모두 캡처
//   - 2026 은 1~6월만

import { google } from 'googleapis'
import { readFileSync, writeFileSync } from 'fs'

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
function toDate(v) {
  if (!v) return null
  const s = String(v).trim().replace(/\./g, '-').replace(/\s+/g, '')
  const m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/)
  return m ? `${m[1]}-${m[2].padStart(2,'0')}-${m[3].padStart(2,'0')}` : null
}
const clean = v => (v || '').toString().trim() || null

// ========== 2025 ==========
console.log('# 2025 파싱')
const s25 = (await sheets.spreadsheets.values.get({
  spreadsheetId: '1X9u9JUAy1t-i74BWyaVUhj7_73vV_L70kKG-73Z7HZU',
  range: `현장별 전체 매출!A1:AZ2600`,
})).data.values || []
// 0-idx: 1=NO, 2=proj_start, 3=proj_end, 4=회사, 5=현장, 6=구분, 7=서비스, 8=bill_start, 9=bill_end
// 10=비고, 11=계산서일, 12=과금방식, 21~32=1~12월 매출

const rows25 = []
let seq25 = 0
for (let i = 8; i < s25.length; i++) {
  const row = s25[i] || []
  const noRaw = row[1]
  const company = row[4]
  // 데이터 row 판별: NO 있고 회사명 있음 (매출 유무 상관없이 카운트)
  if (!noRaw && !company) continue
  if (typeof noRaw === 'string' && noRaw === '복사') continue
  if (!company || typeof company !== 'string' || !company.trim()) continue
  if (noRaw !== null && noRaw !== undefined && noRaw !== '' && typeof noRaw !== 'number' && isNaN(parseFloat(noRaw))) continue

  seq25++  // 모든 데이터 row 카운트

  const monthly = []
  for (let m = 0; m < 12; m++) {
    const amt = toMoney(row[21 + m])
    if (amt !== 0) monthly.push({ month: m + 1, amount: amt })
  }

  rows25.push({
    sheet_no: seq25,
    original_no: noRaw,
    company: company.trim(),
    project: clean(row[5]) || company.trim(),
    site_category: clean(row[6]),
    service: clean(row[7]),
    proj_start: toDate(row[2]),
    proj_end: toDate(row[3]),
    bill_start: toDate(row[8]),
    bill_end: toDate(row[9]),
    notes: clean(row[10]),
    issue_date: toDate(row[11]),
    billing_method: clean(row[12]),
    monthly,
  })
}
console.log(`  rows: ${rows25.length}, monthly total: ${rows25.reduce((s,r) => s + r.monthly.reduce((a,m)=>a+m.amount,0), 0).toLocaleString()}`)
writeFileSync('/tmp/2025_v4.json', JSON.stringify(rows25))

// ========== 2024 ==========
console.log('\n# 2024 파싱')
const s24 = (await sheets.spreadsheets.values.get({
  spreadsheetId: '1v6jJvJcs5avc-ClQ3YXVwBlKEJ8cJaeKx8hrPVdVeYI',
  range: `CaaS.Works 현장별 매출 현황!A1:JV1600`,
})).data.values || []
// 0-idx: 1=NO, 2=bill_start, 3=bill_end, 4=회사, 5=타입, 6=현장, 7=proj_start, 8=proj_end
// 10=과금방식, 12=계산서일, 13=비고
// 월별 15컬럼 블록: block_start = 31 + m*15. VAT 제외 서비스별 값: offset 0~12

const rows24 = []
let seq24 = 0
for (let i = 9; i < s24.length; i++) {
  const row = s24[i] || []
  const noRaw = row[1]
  const company = row[4]
  if (!noRaw && !company) continue
  if (!company || typeof company !== 'string' || !company.trim()) continue
  if (noRaw !== null && noRaw !== undefined && noRaw !== '' && typeof noRaw !== 'number' && isNaN(parseFloat(noRaw))) continue

  seq24++  // 모든 데이터 row 카운트

  // VAT 제외 서비스별 합계 (offset 0-12)
  const monthly = []
  for (let m = 0; m < 12; m++) {
    const blockStart = 31 + m * 15
    let monthTotal = 0
    for (let s = 0; s < 13; s++) {
      monthTotal += toMoney(row[blockStart + s])
    }
    if (monthTotal !== 0) monthly.push({ month: m + 1, amount: monthTotal })
  }

  rows24.push({
    sheet_no: seq24,
    original_no: noRaw,
    company: company.trim(),
    company_type: clean(row[5]),
    project: clean(row[6]) || company.trim(),
    proj_start: toDate(row[7]),
    proj_end: toDate(row[8]),
    bill_start: toDate(row[2]),
    bill_end: toDate(row[3]),
    billing_method: clean(row[10]),
    issue_date: toDate(row[12]),
    notes: clean(row[13]),
    monthly,
  })
}
console.log(`  rows: ${rows24.length}, monthly total (VAT 제외): ${rows24.reduce((s,r) => s + r.monthly.reduce((a,m)=>a+m.amount,0), 0).toLocaleString()}`)
writeFileSync('/tmp/2024_v4.json', JSON.stringify(rows24))

// ========== 2026 (1~6월만) ==========
console.log('\n# 2026 파싱 (1~6월만)')
const s26 = (await sheets.spreadsheets.values.get({
  spreadsheetId: '1ISGq9rkQe8LOlmS1-nCmWp95Lr34kpJ_jnp3OTaLFHQ',
  range: `현장별 전체 매출!A1:AZ5000`,
})).data.values || []
// 2026 시트 layout (2025 대비 현장구분2 컬럼 추가로 1칸씩 shift):
// 0-idx: 1=NO, 2=proj_start, 3=proj_end, 4=회사, 5=현장, 6=구분, 7=구분2, 8=서비스,
// 9=bill_start, 10=bill_end, 11=비고, 12=계산서일, 13=과금방식, 21~32=1~12월 매출
// 데이터 시작: 0-idx 8

const rows26 = []
let seq26 = 0
for (let i = 8; i < s26.length; i++) {
  const row = s26[i] || []
  const noRaw = row[1]
  const company = row[4]
  if (!noRaw && !company) continue
  if (typeof noRaw === 'string' && noRaw === '복사') continue
  if (!company || typeof company !== 'string' || !company.trim()) continue
  if (noRaw !== null && noRaw !== undefined && noRaw !== '' && typeof noRaw !== 'number' && isNaN(parseFloat(noRaw))) continue

  seq26++

  // 1~6월만 (2026 시트는 현장구분2 컬럼 추가로 col 22부터 시작)
  const monthly = []
  for (let m = 0; m < 6; m++) {
    const amt = toMoney(row[22 + m])  // ← 21 → 22 fix
    if (amt !== 0) monthly.push({ month: m + 1, amount: amt })
  }

  rows26.push({
    sheet_no: seq26,
    original_no: noRaw,
    company: company.trim(),
    project: clean(row[5]) || company.trim(),
    site_category: clean(row[6]),
    site_category2: clean(row[7]),
    service: clean(row[8]),
    proj_start: toDate(row[2]),
    proj_end: toDate(row[3]),
    bill_start: toDate(row[9]),
    bill_end: toDate(row[10]),
    notes: clean(row[11]),
    issue_date: toDate(row[12]),
    billing_method: clean(row[13]),
    monthly,
  })
}
console.log(`  rows: ${rows26.length}, monthly total (1~6월): ${rows26.reduce((s,r) => s + r.monthly.reduce((a,m)=>a+m.amount,0), 0).toLocaleString()}`)
writeFileSync('/tmp/2026_v4.json', JSON.stringify(rows26))

console.log('\n[Done]')
