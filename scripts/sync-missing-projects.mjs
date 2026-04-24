#!/usr/bin/env node
// ============================================================
// sync-missing-projects.mjs
//
// DB 에 없는 시트 행(project 자체 누락)만 찾아서 삽입.
// 기존 데이터는 전혀 건드리지 않음.
//
//   node scripts/sync-missing-projects.mjs           # DRY-RUN
//   node scripts/sync-missing-projects.mjs --live    # 실행
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
const YEAR = 2026

const COL = { NO: 1, PROJ_START: 2, PROJ_END: 3, COMPANY: 4, PROJECT: 5, SITE_CAT: 6, SITE_CAT2: 7, SERVICE: 8, BILL_START: 9, BILL_END: 10, NOTES: 11, INVOICE_DAY: 12, BILL_METHOD: 13 }
const MONTH_COLS = [22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33]

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
const col = (r, i) => (r?.[i] || '').toString().trim()
const parseMoney = (s) => { if (!s) return 0; const n = Number(s.toString().replace(/[,₩\s]/g, '')); return isNaN(n) ? 0 : n }
const parseDate = (s) => { if (!s) return null; const s2 = s.toString().trim().replace(/\./g, '-').replace(/\s+/g, ''); const m = s2.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/); return m ? `${m[1]}-${m[2].padStart(2,'0')}-${m[3].padStart(2,'0')}` : null }
const parseSheetNo = (s) => { const n = parseFloat(String(s).trim()); return isNaN(n) ? null : n }

function getAuth() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_KEY || ''
  let credentials
  try { credentials = JSON.parse(raw) } catch { credentials = JSON.parse(Buffer.from(raw, 'base64').toString('utf-8')) }
  return new google.auth.GoogleAuth({ credentials, scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'] })
}

async function fetchAll(t, cols) {
  let all = [], size = 1000
  for (let f = 0; ; f += size) {
    const { data, error } = await sb.from(t).select(cols).range(f, f + size - 1)
    if (error) throw new Error(error.message)
    if (!data || !data.length) break
    all = all.concat(data)
    if (data.length < size) break
  }
  return all
}

console.log(`[Sync Missing Projects] ${LIVE ? 'LIVE' : 'DRY-RUN'}\n`)

const projects = await fetchAll('projects', 'id, customer_id, sheet_no')
const projBySheetNo = new Map()
for (const p of projects) {
  if (p.sheet_no != null) projBySheetNo.set(`${p.customer_id}__${Number(p.sheet_no)}`, p.id)
}

const customers = await fetchAll('customers', 'id, company_name')
const custByName = {}
for (const c of customers) {
  if (c.company_name) {
    custByName[c.company_name] = c.id
    custByName[c.company_name.replace(/\s+/g, '').replace(/[()（）\-·・㈜]/g, '').toLowerCase()] = c.id
  }
}

const sheets = google.sheets({ version: 'v4', auth: getAuth() })
const res = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: '현장별 전체 매출!A1:AZ5000' })
const rows = res.data.values || []

const toAdd = []
for (let i = 5; i < rows.length; i++) {
  const r = rows[i]
  const noStr = col(r, COL.NO)
  if (!noStr || isNaN(parseFloat(noStr))) continue
  const company = col(r, COL.COMPANY)
  if (!company) continue

  const sheetNo = parseSheetNo(noStr)
  const customerId = custByName[company] || custByName[company.replace(/\s+/g, '').replace(/[()（）\-·・㈜]/g, '').toLowerCase()]
  if (!customerId) continue

  if (projBySheetNo.has(`${customerId}__${sheetNo}`)) continue

  // 신규
  const project = col(r, COL.PROJECT) || company
  const service = col(r, COL.SERVICE) || null
  const combinedName = service ? `${project} - ${service}` : project

  const monthAmounts = []
  for (let m = 0; m < 12; m++) {
    const amt = parseMoney(col(r, MONTH_COLS[m]))
    if (amt !== 0) monthAmounts.push({ month: m + 1, amount: amt })
  }

  toAdd.push({
    sheet_no: sheetNo,
    customer_id: customerId,
    customer_name: company,
    project_name: combinedName,
    service_type: service,
    site_category: col(r, COL.SITE_CAT) || null,
    site_category2: col(r, COL.SITE_CAT2) || null,
    project_start: parseDate(col(r, COL.PROJ_START)),
    project_end: parseDate(col(r, COL.PROJ_END)),
    billing_start: parseDate(col(r, COL.BILL_START)),
    billing_end: parseDate(col(r, COL.BILL_END)),
    billing_method: col(r, COL.BILL_METHOD) || null,
    notes: col(r, COL.NOTES) || null,
    invoice_day: col(r, COL.INVOICE_DAY) ? Number(col(r, COL.INVOICE_DAY)) || null : null,
    month_amounts: monthAmounts,
  })
}

console.log(`  추가 대상 프로젝트: ${toAdd.length}건`)
toAdd.forEach(p => console.log(`    NO=${p.sheet_no} | ${p.customer_name} | ${p.service_type} | 월별 ${p.month_amounts.length}건`))

if (!LIVE) {
  console.log(`\n  DRY-RUN. --live 로 실제 반영.`)
  process.exit(0)
}

console.log(`\n[LIVE] inserting...`)
let projInserted = 0, revInserted = 0
for (const p of toAdd) {
  const { data, error } = await sb.from('projects').insert({
    customer_id: p.customer_id,
    project_name: p.project_name,
    service_type: p.service_type,
    site_category: p.site_category,
    site_category2: p.site_category2,
    project_start: p.project_start,
    project_end: p.project_end,
    billing_start: p.billing_start,
    billing_end: p.billing_end,
    billing_method: p.billing_method,
    notes: p.notes,
    invoice_day: p.invoice_day,
    sheet_no: p.sheet_no,
    status: 'active',
    source: 'sheet',
  }).select('id').single()
  if (error) { console.log(`  ❌ project NO=${p.sheet_no}: ${error.message}`); continue }
  projInserted++

  if (p.month_amounts.length > 0) {
    const revs = p.month_amounts.map(m => ({
      customer_id: p.customer_id, project_id: data.id,
      year: YEAR, month: m.month, amount: m.amount, is_confirmed: true,
    }))
    const { error: revErr } = await sb.from('monthly_revenues').insert(revs)
    if (revErr) console.log(`  ❌ revenues NO=${p.sheet_no}: ${revErr.message}`)
    else revInserted += revs.length
  }
}

console.log(`\n[Done] projects 추가 ${projInserted}/${toAdd.length}, revenues 추가 ${revInserted}`)
