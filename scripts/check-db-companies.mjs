import { readFileSync } from 'fs'
import { createClient } from '@supabase/supabase-js'

const env = readFileSync('.env.local', 'utf-8')
env.split('\n').forEach(l => {
  const m = l.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)
  if (m) process.env[m[1]] = m[2].replace(/^"(.*)"$/, '$1')
})

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

const targets = ['주식회사 미래가', '주식회사 인밍아웃', '타임뱅크', '제아씨앤씨', '(주)아이디알시스템']

for (const name of targets) {
  const { data: cust } = await sb.from('customers').select('id, company_name').ilike('company_name', '%' + name.replace(/\s/g, '%') + '%')
  console.log(name + ': ' + (cust?.length || 0) + ' customer(s)')
  if (cust && cust.length > 0) {
    for (const c of cust) {
      const { data: proj } = await sb.from('projects').select('id, project_name').eq('customer_id', c.id)
      const projIds = (proj || []).map(p => p.id)
      let rev2026 = 0
      if (projIds.length > 0) {
        const { data: revs } = await sb.from('monthly_revenues').select('amount, month').in('project_id', projIds).eq('year', 2026)
        rev2026 = (revs || []).reduce((s, r) => s + Number(r.amount), 0)
      }
      console.log('  ' + c.company_name + ' (id=' + c.id.substring(0, 8) + '...): ' + (proj?.length || 0) + ' projects, ₩' + rev2026.toLocaleString() + ' in 2026')
    }
  }
}

// Count total 2026 revenues and compare to sheet (UNFORMATTED sum)
async function fetchAll(table, cols, filter) {
  const size = 1000; let all = []
  for (let from = 0; ; from += size) {
    let q = sb.from(table).select(cols).range(from, from + size - 1)
    if (filter) q = filter(q)
    const { data, error } = await q
    if (error) throw error
    if (!data || data.length === 0) break
    all = all.concat(data)
    if (data.length < size) break
  }
  return all
}

const revs = await fetchAll('monthly_revenues', 'month, amount', q => q.eq('year', 2026))
const byMonth = [0,0,0,0,0,0,0,0,0,0,0,0]
for (const r of revs) byMonth[r.month-1] += Number(r.amount)
const total = byMonth.reduce((a,b)=>a+b, 0)
console.log('\n=== DB 2026 monthly totals ===')
for (let m = 0; m < 12; m++) console.log('  ' + (m+1) + '월: ₩' + byMonth[m].toLocaleString())
console.log('  TOTAL: ₩' + total.toLocaleString())
