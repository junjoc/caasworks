#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
const env = readFileSync('.env.local', 'utf-8')
env.split('\n').forEach(l => { const m = l.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/); if (m) process.env[m[1]] = m[2].replace(/^"(.*)"$/, '$1') })
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

const targets = [2414, 2413, 2412, 2411, 2410, 2400]
for (const n of targets) {
  const { data: projs } = await sb.from('projects')
    .select('id, sheet_no, project_name, customer:customers(company_name), revenues:monthly_revenues(year, month, amount)')
    .eq('sheet_no', n)
    .eq('source', 'excel_backfill')
  for (const p of projs || []) {
    const byYear = {}
    for (const r of p.revenues || []) {
      byYear[r.year] = (byYear[r.year] || 0) + r.amount
    }
    console.log(`sheet_no=${p.sheet_no}  ${p.customer?.company_name}  ${p.project_name?.substring(0,40)}`)
    console.log(`  매출: ${JSON.stringify(byYear)}`)
    console.log(`  ID: ${p.id}`)
  }
}
