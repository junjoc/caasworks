#!/usr/bin/env node
// STEP 0 라이브 실측 — 순수 read-only
import { readFileSync } from 'fs'
import { createClient } from '@supabase/supabase-js'

const env = readFileSync('.env.local', 'utf-8')
env.split('\n').forEach(l => {
  const m = l.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)
  if (m) process.env[m[1]] = m[2].replace(/^"(.*)"$/, '$1')
})
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

async function fetchAll(t, cols, ff) {
  let all = [], size = 1000
  for (let f = 0; ; f += size) {
    let q = sb.from(t).select(cols).range(f, f + size - 1)
    if (ff) q = ff(q)
    const { data, error } = await q
    if (error) { console.log(`  ❌ ${t}: ${error.message}`); return [] }
    if (!data || !data.length) break
    all = all.concat(data)
    if (data.length < size) break
  }
  return all
}

async function count(t, ff) {
  let q = sb.from(t).select('*', { count: 'exact', head: true })
  if (ff) q = ff(q)
  const { count: c, error } = await q
  return error ? `❌ ${error.message}` : c
}

console.log('# STEP 0 라이브 실측 (2026-07-01)\n')

console.log('## 1) 핵심 테이블 행 수')
const tables = [
  'customers', 'projects', 'monthly_revenues',
  'pipeline_leads', 'invoices', 'invoice_items',
  'ad_performance', 'campaigns',
  'site_sessions', 'site_pageviews', 'site_events',
  'voc_tickets', 'quotations', 'activity_logs',
  'audit_logs', 'user_feedbacks', 'feedback_comments',
  'roles', 'users',
]
for (const t of tables) console.log(`  - ${t}: ${await count(t)}`)

console.log('\n## 2) monthly_revenues 연도별 (핵심)')
const yearlyStats = {}
for (const year of [2023, 2024, 2025, 2026, 2027]) {
  const rows = await fetchAll('monthly_revenues', 'amount, month', q => q.eq('year', year))
  const sum = rows.reduce((s, r) => s + Number(r.amount), 0)
  const byMonth = {}
  rows.forEach(r => byMonth[r.month] = (byMonth[r.month] || 0) + Number(r.amount))
  yearlyStats[year] = { rows: rows.length, sum, byMonth }
  console.log(`  - ${year}년: ${rows.length}행, 합계 ${sum.toLocaleString()}원`)
}
console.log('\n### 2026 월별 세부')
for (let m = 1; m <= 12; m++) {
  const v = yearlyStats[2026]?.byMonth?.[m] || 0
  console.log(`    ${m}월: ${v.toLocaleString()}`)
}

console.log('\n## 3) projects 요약')
const projects = await fetchAll('projects', 'source, status, sheet_no, created_at')
const bySource = {}, byStatus = {}
projects.forEach(p => {
  const s = p.source || '(null)'; bySource[s] = (bySource[s] || 0) + 1
  const st = p.status || '(null)'; byStatus[st] = (byStatus[st] || 0) + 1
})
console.log('  by source:', bySource)
console.log('  by status:', byStatus)
const withSheetNo = projects.filter(p => p.sheet_no != null).length
console.log(`  sheet_no 있음: ${withSheetNo} / 없음: ${projects.length - withSheetNo}`)

console.log('\n## 4) pipeline_leads 요약')
const leads = await fetchAll('pipeline_leads', 'stage, inquiry_channel, inquiry_source, inquiry_date')
const byStage = {}, byChannel = {}
leads.forEach(l => {
  const s = l.stage || '(null)'; byStage[s] = (byStage[s] || 0) + 1
  const c = l.inquiry_channel || '(null)'; byChannel[c] = (byChannel[c] || 0) + 1
})
console.log('  by stage:', byStage)
console.log('  by channel:', byChannel)
const withDate = leads.filter(l => l.inquiry_date).length
console.log(`  inquiry_date 있음: ${withDate} / 총 ${leads.length}`)

console.log('\n## 5) audit_logs 실측')
const auditCount = await count('audit_logs')
console.log(`  audit_logs 행 수: ${auditCount}`)
if (typeof auditCount === 'number' && auditCount > 0) {
  const { data: sample } = await sb.from('audit_logs').select('*').order('created_at', { ascending: false }).limit(3)
  console.log('  최근 3건 샘플:', sample)
} else {
  console.log('  → 비어 있음. 감사 미들웨어 미작동 확인됨.')
}

console.log('\n## 6) invoices 요약')
const invoices = await fetchAll('invoices', 'year, month, status, total, tax_invoice_issued_at, paid_at')
const invByYear = {}, invByStatus = {}
let sumTotal = 0
invoices.forEach(i => {
  const y = i.year || 0; invByYear[y] = (invByYear[y] || 0) + 1
  const s = i.status || '(null)'; invByStatus[s] = (invByStatus[s] || 0) + 1
  sumTotal += Number(i.total || 0)
})
console.log('  by year:', invByYear)
console.log('  by status:', invByStatus)
console.log(`  총 금액: ${sumTotal.toLocaleString()}원`)
const withTax = invoices.filter(i => i.tax_invoice_issued_at).length
const paid = invoices.filter(i => i.paid_at).length
console.log(`  tax_invoice_issued_at 있음: ${withTax} / paid_at 있음: ${paid}`)

console.log('\n## 7) site_sessions ↔ pipeline_leads 관통 여부')
const leadCols = await sb.from('pipeline_leads').select('*').limit(1)
if (leadCols.data?.[0]) {
  const cols = Object.keys(leadCols.data[0])
  const attribution = ['session_id', 'site_session_id', 'utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'landing_page', 'referrer']
  console.log('  pipeline_leads 에 attribution 컬럼 존재:')
  attribution.forEach(c => console.log(`    ${c}: ${cols.includes(c) ? '✅' : '❌'}`))
}

console.log('\n## 8) ad_performance 요약')
const adCount = await count('ad_performance')
const ss = await count('site_sessions')
const sp = await count('site_pageviews')
console.log(`  ad_performance: ${adCount}  site_sessions: ${ss}  pageviews: ${sp}`)

console.log('\n[Done]')
