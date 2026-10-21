#!/usr/bin/env node
// 2026 매출 있는 프로젝트 중 (customer_id, project_name) 중복 스캔
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'

const env = readFileSync('.env.local', 'utf-8')
env.split('\n').forEach(l => { const m = l.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/); if (m) process.env[m[1]] = m[2].replace(/^"(.*)"$/, '$1') })
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

async function fetchAll(t, cols, ff) {
  let all = [], size = 1000
  for (let f = 0; ; f += size) {
    let q = sb.from(t).select(cols).range(f, f + size - 1)
    if (ff) q = ff(q)
    const { data, error } = await q
    if (error) throw error
    if (!data || !data.length) break
    all = all.concat(data)
    if (data.length < size) break
  }
  return all
}

const projs = await fetchAll(
  'projects',
  'id, sheet_no, customer_id, project_name, customer:customers(company_name), revenues:monthly_revenues!inner(year)',
  q => q.eq('revenues.year', 2026).eq('source', 'excel_backfill')
)
console.log(`2026 매출 있는 excel_backfill projects: ${projs.length}\n`)

// group by (customer_id, project_name)
const groups = new Map()
for (const p of projs) {
  const key = `${p.customer_id}||${p.project_name}`
  if (!groups.has(key)) groups.set(key, [])
  groups.get(key).push(p)
}

const dups = [...groups.entries()].filter(([, list]) => list.length > 1)
console.log(`중복 그룹 수: ${dups.length}`)
let totalDupProjs = 0
for (const [, list] of dups) totalDupProjs += list.length - 1
console.log(`중복으로 인한 초과 프로젝트: ${totalDupProjs}`)

console.log(`\n[샘플 상위 20 그룹]`)
dups.sort((a, b) => b[1].length - a[1].length)
for (const [key, list] of dups.slice(0, 20)) {
  list.sort((a, b) => Number(a.sheet_no) - Number(b.sheet_no))
  const company = list[0].customer?.company_name || 'null'
  const name = list[0].project_name?.substring(0, 45) || 'null'
  const sheets = list.map(p => p.sheet_no).join(', ')
  console.log(`  ${company.substring(0,15).padEnd(15)}  ${name.padEnd(48)}  sheet_no: ${sheets}`)
}
