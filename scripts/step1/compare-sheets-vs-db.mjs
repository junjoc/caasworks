#!/usr/bin/env node
// 구글 시트 vs 현재 DB (excel_backfill) 비교 리포트 (파괴 없음, read-only)
//
// - 2024 시트: CaaS.Works 현장별 매출 현황 (서비스별 15컬럼 × 12개월 블록)
// - 2025 시트: 현장별 전체 매출 (col 22~33 = 1월~12월)

import { google } from 'googleapis'
import { readFileSync } from 'fs'
import { createClient } from '@supabase/supabase-js'

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
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

const SHEETS = {
  2024: { id: '1v6jJvJcs5avc-ClQ3YXVwBlKEJ8cJaeKx8hrPVdVeYI', tab: 'CaaS.Works 현장별 매출 현황' },
  2025: { id: '1X9u9JUAy1t-i74BWyaVUhj7_73vV_L70kKG-73Z7HZU', tab: '현장별 전체 매출' },
}

async function fetchSheet(id, tab) {
  const res = await sheets.spreadsheets.values.get({ spreadsheetId: id, range: `${tab}!A1:JV5000` })
  return res.data.values || []
}

function toMoney(v) {
  if (v === null || v === undefined || v === '') return 0
  if (typeof v === 'number') return Math.round(v)
  const n = parseFloat(String(v).replace(/[,₩원\s]/g, ''))
  return isNaN(n) ? 0 : Math.round(n)
}

async function fetchAll(t, cols, ff) {
  let all = [], size = 1000
  for (let f = 0; ; f += size) {
    let q = sb.from(t).select(cols).range(f, f + size - 1)
    if (ff) q = ff(q)
    const { data, error } = await q
    if (error) throw new Error(error.message)
    if (!data || !data.length) break
    all = all.concat(data)
    if (data.length < size) break
  }
  return all
}

console.log('# 구글 시트 vs DB 비교 리포트 (read-only)\n')

// ===== 2025 =====
console.log('## 2025년\n')
const s25 = await fetchSheet(SHEETS[2025].id, SHEETS[2025].tab)
console.log(`시트 전체 행: ${s25.length}`)
// row 5 = 헤더 (1-indexed 기준 → 0-indexed row 4)
// 데이터 시작: row 9 (0-indexed 8)
// 회사명: col 5 (0-indexed 4), 프로젝트: col 6 (0-indexed 5), 서비스: col 8 (0-indexed 7)
// 월별 매출: col 22~33 (0-indexed 21~32)
let s25_rows = 0, s25_total = 0
const s25_monthly = {}
const s25_projects = new Set()
for (let i = 8; i < s25.length; i++) {
  const row = s25[i] || []
  const no = row[1]
  if (!no) continue
  if (typeof no === 'string' && (no === '복사' || isNaN(parseFloat(no)))) continue
  if (isNaN(parseFloat(no))) continue
  const company = row[4]
  if (!company || typeof company !== 'string') continue
  const project = row[5] || ''
  const service = row[7] || ''
  s25_rows++
  s25_projects.add(`${company.trim()}||${(project||'').trim()}||${(service||'').trim()}`)
  for (let m = 0; m < 12; m++) {
    const amt = toMoney(row[21 + m])
    if (amt !== 0) {
      s25_total += amt
      s25_monthly[m + 1] = (s25_monthly[m + 1] || 0) + amt
    }
  }
}
console.log(`시트 데이터 행: ${s25_rows}`)
console.log(`시트 unique (회사+현장+서비스): ${s25_projects.size}`)
console.log(`시트 연간 합계: ${s25_total.toLocaleString()}`)
console.log('월별:')
for (let m = 1; m <= 12; m++) console.log(`  ${m}월: ${(s25_monthly[m]||0).toLocaleString()}`)

// DB 대조 (year=2025)
const db25_revs = await fetchAll('monthly_revenues', 'amount, month', q => q.eq('year', 2025))
const db25_monthly = {}
db25_revs.forEach(r => { db25_monthly[r.month] = (db25_monthly[r.month] || 0) + Number(r.amount) })
const db25_total = Object.values(db25_monthly).reduce((a,b)=>a+b,0)
console.log(`\nDB (year=2025):`)
console.log(`  monthly_revenues rows: ${db25_revs.length}`)
console.log(`  총액: ${db25_total.toLocaleString()}`)
console.log(`  차이 (시트 - DB): ${(s25_total - db25_total).toLocaleString()}`)
console.log('월별 diff (시트 - DB):')
for (let m = 1; m <= 12; m++) {
  const s = s25_monthly[m] || 0
  const d = db25_monthly[m] || 0
  const diff = s - d
  const flag = Math.abs(diff) > 1 ? ' ⚠' : ''
  console.log(`  ${m}월: ${s.toLocaleString()} vs ${d.toLocaleString()} = ${diff.toLocaleString()}${flag}`)
}

// ===== 2024 =====
console.log('\n\n## 2024년\n')
const s24 = await fetchSheet(SHEETS[2024].id, SHEETS[2024].tab)
console.log(`시트 전체 행: ${s24.length}`)
// row 6 = 헤더 (0-idx 5), 데이터 시작 row 10 (0-idx 9)
// 회사명: col 5 (0-idx 4), 타입: col 6 (0-idx 5), 프로젝트: col 7 (0-idx 6)
// 월별 15컬럼 블록 시작: col 32 (0-idx 31) 부터 15컬럼씩
// 각 월 안에서 offset 0~12 가 서비스별 매출
const SVC_OFFSETS = 13  // 0~12 (VAT/월이용료 제외)

let s24_rows = 0, s24_total = 0
const s24_monthly = {}
const s24_projects = new Set()
for (let i = 9; i < s24.length; i++) {
  const row = s24[i] || []
  const no = row[1]
  if (!no) continue
  if (typeof no === 'string' && isNaN(parseFloat(no))) continue
  const company = row[4]
  if (!company || typeof company !== 'string') continue
  const project = row[6] || ''
  s24_rows++
  s24_projects.add(`${company.trim()}||${(project||'').trim()}`)
  // 서비스별 세분화 파싱
  for (let m = 0; m < 12; m++) {
    const blockStart = 31 + m * 15  // 0-indexed
    for (let s = 0; s < SVC_OFFSETS; s++) {
      const amt = toMoney(row[blockStart + s])
      if (amt !== 0) {
        s24_total += amt
        s24_monthly[m + 1] = (s24_monthly[m + 1] || 0) + amt
      }
    }
  }
}
console.log(`시트 데이터 행: ${s24_rows}`)
console.log(`시트 unique (회사+현장): ${s24_projects.size}`)
console.log(`시트 연간 합계 (서비스별 세분화): ${s24_total.toLocaleString()}`)
console.log('월별:')
for (let m = 1; m <= 12; m++) console.log(`  ${m}월: ${(s24_monthly[m]||0).toLocaleString()}`)

// DB 대조
const db24_revs = await fetchAll('monthly_revenues', 'amount, month', q => q.eq('year', 2024))
const db24_monthly = {}
db24_revs.forEach(r => { db24_monthly[r.month] = (db24_monthly[r.month] || 0) + Number(r.amount) })
const db24_total = Object.values(db24_monthly).reduce((a,b)=>a+b,0)
console.log(`\nDB (year=2024):`)
console.log(`  monthly_revenues rows: ${db24_revs.length}`)
console.log(`  총액: ${db24_total.toLocaleString()}`)
console.log(`  차이 (시트 - DB): ${(s24_total - db24_total).toLocaleString()}`)
console.log('월별 diff (시트 - DB):')
for (let m = 1; m <= 12; m++) {
  const s = s24_monthly[m] || 0
  const d = db24_monthly[m] || 0
  const diff = s - d
  const flag = Math.abs(diff) > 1 ? ' ⚠' : ''
  console.log(`  ${m}월: ${s.toLocaleString()} vs ${d.toLocaleString()} = ${diff.toLocaleString()}${flag}`)
}

console.log('\n\n[Done] 파괴 없음. DB 그대로.')
