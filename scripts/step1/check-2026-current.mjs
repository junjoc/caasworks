#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'

const env = readFileSync('.env.local', 'utf-8')
env.split('\n').forEach(l => { const m = l.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/); if (m) process.env[m[1]] = m[2].replace(/^"(.*)"$/, '$1') })
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

// Batch fetch (1000 limit 우회)
let all = []
for (let off = 0; ; off += 1000) {
  const { data, error } = await sb.from('monthly_revenues')
    .select('month, amount').eq('year', 2026).range(off, off + 999)
  if (error) { console.log(error.message); process.exit(1) }
  if (!data.length) break
  all = all.concat(data)
  if (data.length < 1000) break
}

const byMonth = Array.from({length: 12}, () => ({rows: 0, total: 0}))
for (const r of all) {
  const i = r.month - 1
  byMonth[i].rows++
  byMonth[i].total += r.amount
}
console.log(`총 2026 monthly_revenues: ${all.length}`)
for (let m = 0; m < 12; m++) {
  console.log(`  ${String(m+1).padStart(2)}월: ${String(byMonth[m].rows).padStart(4)} rows,  ${byMonth[m].total.toLocaleString().padStart(15)}`)
}
const grand = all.reduce((s,r) => s+r.amount, 0)
console.log(`총합 (VAT 제외): ${grand.toLocaleString()}`)
console.log(`         × 1.1: ${Math.round(grand*1.1).toLocaleString()}`)
