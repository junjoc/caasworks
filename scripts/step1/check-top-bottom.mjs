#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
const env = readFileSync('.env.local', 'utf-8')
env.split('\n').forEach(l => { const m = l.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/); if (m) process.env[m[1]] = m[2].replace(/^"(.*)"$/, '$1') })
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

console.log('# CRM 매출페이지 2026 상단 15줄 (매출 있는 것만)\n')
const { data: top } = await sb.from('projects')
  .select('sheet_no, project_name, customer:customers(company_name), revenues:monthly_revenues!inner(year)')
  .eq('source', 'excel_backfill')
  .eq('revenues.year', 2026)
  .not('sheet_no', 'is', null)
  .order('sheet_no', { ascending: false })
  .limit(15)
for (const p of top || []) {
  console.log(`  sheet_no=${String(p.sheet_no).padStart(5)}  ${(p.customer?.company_name||'').substring(0,15).padEnd(15)}  ${(p.project_name||'').substring(0,55)}`)
}

console.log('\n# CRM 매출페이지 2026 하단 5줄 (매출 있는 것만)\n')
const { data: bot } = await sb.from('projects')
  .select('sheet_no, project_name, customer:customers(company_name), revenues:monthly_revenues!inner(year)')
  .eq('source', 'excel_backfill')
  .eq('revenues.year', 2026)
  .not('sheet_no', 'is', null)
  .order('sheet_no', { ascending: true })
  .limit(5)
for (const p of bot || []) {
  console.log(`  sheet_no=${String(p.sheet_no).padStart(5)}  ${(p.customer?.company_name||'').substring(0,15).padEnd(15)}  ${(p.project_name||'').substring(0,55)}`)
}
