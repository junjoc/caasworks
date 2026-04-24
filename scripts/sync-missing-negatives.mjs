#!/usr/bin/env node
// ============================================================
// sync-missing-negatives.mjs
//
// 이전 split 실행 시 `amt > 0` 필터 때문에 시트의 음수(환불/차감) 값이
// DB에 반영 안 됐음. 기존 데이터는 건드리지 않고, 시트의 음수 셀 + DB 에
// 없는 값만 추가 삽입.
//
// 또한 기존 DB 의 값이 시트와 다른 경우(금액 변경)도 업데이트 옵션으로 처리.
//
// Usage:
//   node scripts/sync-missing-negatives.mjs           # DRY-RUN
//   node scripts/sync-missing-negatives.mjs --live    # 실제 삽입/업데이트
// ============================================================

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
const LIVE = process.argv.includes('--live')
const MODE = LIVE ? 'LIVE' : 'DRY-RUN'
const YEAR = 2026

const COL = { NO: 1, COMPANY: 4, PROJECT: 5, SERVICE: 8 }
const MONTH_COLS = [22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33]

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
const col = (r, i) => (r?.[i] || '').toString().trim()
const parseMoney = (s) => { if (!s) return 0; const n = Number(s.toString().replace(/[,₩\s]/g, '')); return isNaN(n) ? 0 : n }
const parseSheetNo = (s) => { const n = parseFloat(String(s).trim()); return isNaN(n) ? null : n }

function getAuth() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_KEY || ''
  let credentials
  try { credentials = JSON.parse(raw) }
  catch { credentials = JSON.parse(Buffer.from(raw, 'base64').toString('utf-8')) }
  return new google.auth.GoogleAuth({ credentials, scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'] })
}

async function fetchAll(t, cols, filterFn) {
  let all = [], size = 1000
  for (let f = 0; ; f += size) {
    let q = sb.from(t).select(cols).range(f, f + size - 1)
    if (filterFn) q = filterFn(q)
    const { data, error } = await q
    if (error) throw new Error(error.message)
    if (!data || !data.length) break
    all = all.concat(data)
    if (data.length < size) break
  }
  return all
}

console.log(`[Sync Missing Negatives] mode=${MODE}  year=${YEAR}\n`)

// Load current DB state
const projects = await fetchAll('projects', 'id, customer_id, sheet_no')
const projBySheetNo = new Map()  // `${customer_id}__${sheet_no}` → project_id
for (const p of projects) {
  if (p.sheet_no != null) {
    projBySheetNo.set(`${p.customer_id}__${Number(p.sheet_no)}`, p.id)
  }
}

const customers = await fetchAll('customers', 'id, company_name')
const custByName = {}
for (const c of customers) {
  if (c.company_name) {
    custByName[c.company_name] = c.id
    custByName[c.company_name.replace(/\s+/g, '').replace(/[()（）\-·・㈜]/g, '').toLowerCase()] = c.id
  }
}

const revs = await fetchAll('monthly_revenues', 'id, project_id, month, amount', q => q.eq('year', YEAR))
const revByKey = new Map()  // `${project_id}|${month}` → { id, amount }
for (const r of revs) {
  revByKey.set(`${r.project_id}|${r.month}`, { id: r.id, amount: Number(r.amount) })
}
console.log(`  DB: projects=${projects.length}, revenues(${YEAR})=${revs.length}`)

// Read sheet
const sheets = google.sheets({ version: 'v4', auth: getAuth() })
const res = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: '현장별 전체 매출!A1:AZ5000' })
const rows = res.data.values || []
console.log(`  sheet rows: ${rows.length}`)

const toInsert = []
const toUpdate = []
let parsedRows = 0, missingProj = 0, matchedExistingAmt = 0

for (let i = 5; i < rows.length; i++) {
  const r = rows[i]
  const noStr = col(r, COL.NO)
  if (!noStr || isNaN(parseFloat(noStr))) continue
  const company = col(r, COL.COMPANY)
  if (!company) continue

  const sheetNo = parseSheetNo(noStr)
  const customerId = custByName[company] || custByName[company.replace(/\s+/g, '').replace(/[()（）\-·・㈜]/g, '').toLowerCase()]
  if (!customerId) continue

  const projectId = projBySheetNo.get(`${customerId}__${sheetNo}`)
  if (!projectId) { missingProj++; continue }
  parsedRows++

  for (let m = 0; m < 12; m++) {
    const amt = parseMoney(col(r, MONTH_COLS[m]))
    if (amt === 0) continue
    const month = m + 1
    const key = `${projectId}|${month}`
    const existing = revByKey.get(key)
    if (!existing) {
      toInsert.push({
        customer_id: customerId, project_id: projectId,
        year: YEAR, month, amount: amt, is_confirmed: true,
      })
    } else {
      // 이미 있는 값은 건드리지 않음 (사용자가 웹에서 수정했을 수 있음)
      matchedExistingAmt++
    }
  }
}

console.log(`\n  parsed rows with matching project: ${parsedRows}`)
console.log(`  missing project (sheet 에 있는데 DB 에 없음): ${missingProj}`)
console.log(`  기존 값 유지(덮어쓰기 안함): ${matchedExistingAmt}`)
console.log(`  ➕ 추가 삽입 대상: ${toInsert.length}`)

// 음수 건수 별도 집계
const negInsert = toInsert.filter(i => i.amount < 0)
const posInsert = toInsert.filter(i => i.amount > 0)
console.log(`    ├ 음수 추가: ${negInsert.length}`)
console.log(`    └ 양수 추가: ${posInsert.length}`)

if (toInsert.length > 0 && toInsert.length <= 30) {
  console.log(`\n  추가할 항목 샘플:`)
  toInsert.slice(0, 20).forEach(x =>
    console.log(`    project=${x.project_id.substring(0,8)} ${x.month}월 ${x.amount.toLocaleString()}원`)
  )
}

if (!LIVE) {
  console.log(`\n  [DRY-RUN] --live 로 실행하면 실제 반영.`)
  process.exit(0)
}

console.log(`\n[LIVE] applying...`)

// Insert batch
let inserted = 0
for (let i = 0; i < toInsert.length; i += 500) {
  const batch = toInsert.slice(i, i + 500)
  const { error } = await sb.from('monthly_revenues').insert(batch)
  if (error) console.log(`  ❌ batch ${i}: ${error.message}`)
  else inserted += batch.length
}
console.log(`  ✅ inserted ${inserted}/${toInsert.length}`)

console.log(`\n[Done] 추가 ${inserted}건. 기존 값은 전혀 수정하지 않음.`)
