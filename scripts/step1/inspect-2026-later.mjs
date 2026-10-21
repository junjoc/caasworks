#!/usr/bin/env node
// 2026 시트 7~12월 데이터 존재 여부만 확인. 파괴 없음.

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

console.log('# 2026 시트 7~12월 존재 여부 확인')
const s26 = (await sheets.spreadsheets.values.get({
  spreadsheetId: '1ISGq9rkQe8LOlmS1-nCmWp95Lr34kpJ_jnp3OTaLFHQ',
  range: `현장별 전체 매출!A1:AZ5000`,
})).data.values || []

// 2026 layout: col 22-33 = 1~12월
// 데이터 시작: row idx 8

const monthSum = Array.from({ length: 12 }, () => ({ rows: 0, total: 0 }))
let totalRows = 0

for (let i = 8; i < s26.length; i++) {
  const row = s26[i] || []
  const noRaw = row[1]
  const company = row[4]
  if (!noRaw && !company) continue
  if (typeof noRaw === 'string' && noRaw === '복사') continue
  if (!company || typeof company !== 'string' || !company.trim()) continue
  if (noRaw !== null && noRaw !== undefined && noRaw !== '' && typeof noRaw !== 'number' && isNaN(parseFloat(noRaw))) continue

  totalRows++
  for (let m = 0; m < 12; m++) {
    const amt = toMoney(row[22 + m])
    if (amt !== 0) {
      monthSum[m].rows++
      monthSum[m].total += amt
    }
  }
}

console.log(`\n총 데이터 rows: ${totalRows}`)
console.log(`\n월별 매출 rows / 합계 (VAT 제외):`)
console.log(`  1월: ${String(monthSum[0].rows).padStart(4)} rows  ${monthSum[0].total.toLocaleString().padStart(15)}`)
console.log(`  2월: ${String(monthSum[1].rows).padStart(4)} rows  ${monthSum[1].total.toLocaleString().padStart(15)}`)
console.log(`  3월: ${String(monthSum[2].rows).padStart(4)} rows  ${monthSum[2].total.toLocaleString().padStart(15)}`)
console.log(`  4월: ${String(monthSum[3].rows).padStart(4)} rows  ${monthSum[3].total.toLocaleString().padStart(15)}`)
console.log(`  5월: ${String(monthSum[4].rows).padStart(4)} rows  ${monthSum[4].total.toLocaleString().padStart(15)}`)
console.log(`  6월: ${String(monthSum[5].rows).padStart(4)} rows  ${monthSum[5].total.toLocaleString().padStart(15)}`)
console.log(`  ─── 위 = 이미 DB 임포트됨 (1~6월) ───`)
console.log(`  7월: ${String(monthSum[6].rows).padStart(4)} rows  ${monthSum[6].total.toLocaleString().padStart(15)}`)
console.log(`  8월: ${String(monthSum[7].rows).padStart(4)} rows  ${monthSum[7].total.toLocaleString().padStart(15)}`)
console.log(`  9월: ${String(monthSum[8].rows).padStart(4)} rows  ${monthSum[8].total.toLocaleString().padStart(15)}`)
console.log(` 10월: ${String(monthSum[9].rows).padStart(4)} rows  ${monthSum[9].total.toLocaleString().padStart(15)}`)
console.log(` 11월: ${String(monthSum[10].rows).padStart(4)} rows  ${monthSum[10].total.toLocaleString().padStart(15)}`)
console.log(` 12월: ${String(monthSum[11].rows).padStart(4)} rows  ${monthSum[11].total.toLocaleString().padStart(15)}`)

const later = monthSum.slice(6).reduce((a, b) => ({ rows: a.rows + b.rows, total: a.total + b.total }), { rows: 0, total: 0 })
console.log(`\n7~12월 합계: ${later.rows} rows,  ${later.total.toLocaleString()} 원 (VAT 제외)`)
console.log(`             × 1.1 = ${Math.round(later.total * 1.1).toLocaleString()} 원 (VAT 포함)`)
