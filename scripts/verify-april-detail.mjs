#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'

try {
  const env = readFileSync(new URL('../.env.local', import.meta.url), 'utf-8')
  env.split('\n').forEach(line => {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)
    if (m) process.env[m[1]] = m[2].replace(/^"(.*)"$/, '$1').replace(/\\n/g, '\n')
  })
} catch {}

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

// Find the 한국교통정책연구원(주) customer
const { data: custs } = await sb.from('customers').select('id, company_name').ilike('company_name', '%한국교통%')
if (!custs || custs.length === 0) {
  console.log('Customer not found')
  process.exit(1)
}

console.log('Customer:', custs[0])

const custId = custs[0].id
const { data: projs } = await sb.from('projects').select('id, project_name, sheet_no').eq('customer_id', custId)
console.log('\nProjects for this customer:')
projs.forEach(p => console.log(`  NO ${p.sheet_no}: ${p.id}`))

// Check April revenues for this customer
const { data: revs } = await sb.from('monthly_revenues').select('id, project_id, amount').eq('customer_id', custId).eq('year', 2026).eq('month', 4)
console.log('\nApril 2026 revenues for this customer:')
revs.forEach(r => {
  const proj = projs.find(p => p.id === r.project_id)
  console.log(`  NO ${proj.sheet_no}: ₩${r.amount.toLocaleString('ko-KR')}`)
})

const dbTotal = revs.reduce((sum, r) => sum + r.amount, 0)
console.log(`\nDB Total for this customer: ₩${dbTotal.toLocaleString('ko-KR')}`)
