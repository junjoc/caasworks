#!/usr/bin/env node
// v3 시트 기준 파싱
//
// 원칙:
// - VAT 포함 값 사용 (2024: offset 14 컬럼, 2025: col 22~33 그대로 = 팀이 입력한 실제 값)
// - 시트 row 순서대로 sheet_no 1, 2, 3, ... 순차 부여 (소수점 NO 도 하나의 카운트)
// - 각 시트 row 는 1 project = 1 sheet_no
// - 매출은 VAT 포함 값 저장

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

// ===== 2025 파싱 =====
console.log('# 2025 파싱 (VAT 포함, 시트 row 순서 넘버링)')
const s25 = (await sheets.spreadsheets.values.get({
  spreadsheetId: '1X9u9JUAy1t-i74BWyaVUhj7_73vV_L70kKG-73Z7HZU',
  range: `현장별 전체 매출!A1:AZ2600`
})).data.values || []
// row 5 = header (0-idx 4), 데이터 시작 row 9 (0-idx 8)
// col 2=NO(1), col 5=회사명(4), col 6=현장명(5), col 7=현장구분(6), col 8=이용서비스(7)
// col 9=과금시작일(8), col 10=과금종료일(9), col 11=비고(10), col 12=계산서발행일(11), col 13=과금방식(12)
// col 22~33 = 1월~12월 (0-idx 21~32)

const rows_2025 = []
let seq25 = 0
for (let i = 8; i < s25.length; i++) {
  const row = s25[i] || []
  const noRaw = row[1]
  if (!noRaw) continue
  if (typeof noRaw === 'string' && (noRaw === '복사' || isNaN(parseFloat(noRaw)))) continue
  if (typeof noRaw !== 'number' && isNaN(parseFloat(noRaw))) continue
  const company = row[4]
  if (!company || typeof company !== 'string' || !company.trim()) continue

  const monthly = []
  for (let m = 0; m < 12; m++) {
    const amt = toMoney(row[21 + m])
    if (amt !== 0) monthly.push({ month: m + 1, amount: amt })
  }
  if (monthly.length === 0) continue  // 매출 없는 row skip (seq 소비 X)
  seq25++  // 시트 row 순서대로 1, 2, 3, ... 연속 (매출 있는 것만)

  rows_2025.push({
    sheet_no: seq25,
    sheet_row: i + 1,
    original_no: noRaw,
    company: company.trim(),
    project: (row[5] || '').toString().trim(),
    site_category: (row[6] || '').toString().trim() || null,
    service: (row[7] || '').toString().trim() || null,
    bill_start: toDate(row[8]),
    bill_end: toDate(row[9]),
    notes: (row[10] || '').toString().trim() || null,
    issue_date: toDate(row[11]),
    billing_method: (row[12] || '').toString().trim() || null,
    monthly,
  })
}
const tot25 = rows_2025.reduce((s, r) => s + r.monthly.reduce((a, m) => a + m.amount, 0), 0)
console.log(`  2025 rows: ${rows_2025.length} (seq up to ${seq25})`)
console.log(`  2025 총액 (VAT 포함): ${tot25.toLocaleString()}`)
writeFileSync('/tmp/2025_v3.json', JSON.stringify(rows_2025))

// ===== 2024 파싱 =====
console.log('\n# 2024 파싱 (VAT 포함, 시트 row 순서 넘버링)')
const s24 = (await sheets.spreadsheets.values.get({
  spreadsheetId: '1v6jJvJcs5avc-ClQ3YXVwBlKEJ8cJaeKx8hrPVdVeYI',
  range: `CaaS.Works 현장별 매출 현황!A1:JV1600`
})).data.values || []
// row 6 = header (0-idx 5), 데이터 시작 row 10 (0-idx 9)
// col 2=NO(1), col 3=과금시작일(2), col 4=과금종료일(3), col 5=회사명(4), col 6=타입(5), col 7=현장명(6)
// col 8=proj_start(7), col 9=proj_end(8), col 11=과금방식(10), col 12=특이사항(11), col 13=계산서발행일(12), col 14=비고(13)
// 월별 15컬럼 블록: block_start = 31 + m*15 (0-idx). offset 14 = 'VAT포함' 컬럼.
// VAT 포함 컬럼: 45, 60, 75, ..., 210 (0-idx)

const rows_2024 = []
let seq24 = 0
for (let i = 9; i < s24.length; i++) {
  const row = s24[i] || []
  const noRaw = row[1]
  if (!noRaw) continue
  if (typeof noRaw === 'string' && isNaN(parseFloat(noRaw))) continue
  const company = row[4]
  if (!company || typeof company !== 'string' || !company.trim()) continue

  // VAT 포함 월별
  const monthly = []
  for (let m = 0; m < 12; m++) {
    const blockStart = 31 + m * 15  // 0-idx
    const vatAmt = toMoney(row[blockStart + 14])  // 'VAT포함' 컬럼
    if (vatAmt !== 0) monthly.push({ month: m + 1, amount: vatAmt })
  }
  if (monthly.length === 0) continue
  seq24++  // 시트 row 순서대로 1, 2, 3, ... 연속 (매출 있는 것만)

  rows_2024.push({
    sheet_no: seq24,
    sheet_row: i + 1,
    original_no: noRaw,
    company: company.trim(),
    company_type: (row[5] || '').toString().trim() || null,
    project: (row[6] || '').toString().trim(),
    proj_start: toDate(row[7]),
    proj_end: toDate(row[8]),
    bill_start: toDate(row[2]),
    bill_end: toDate(row[3]),
    billing_method: (row[10] || '').toString().trim() || null,
    issue_date: toDate(row[12]),
    notes: (row[13] || '').toString().trim() || null,
    monthly,
  })
}
const tot24 = rows_2024.reduce((s, r) => s + r.monthly.reduce((a, m) => a + m.amount, 0), 0)
console.log(`  2024 rows: ${rows_2024.length} (seq up to ${seq24})`)
console.log(`  2024 총액 (VAT 포함): ${tot24.toLocaleString()}`)
console.log(`  사용자 목표:            889,653,250`)
console.log(`  차이:                   ${(tot24 - 889653250).toLocaleString()}`)
writeFileSync('/tmp/2024_v3.json', JSON.stringify(rows_2024))

console.log('\n[Done]')
console.log(`  /tmp/2024_v3.json — ${rows_2024.length} rows`)
console.log(`  /tmp/2025_v3.json — ${rows_2025.length} rows`)
