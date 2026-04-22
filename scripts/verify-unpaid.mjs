import { readFileSync } from 'fs'
import { createClient } from '@supabase/supabase-js'

const env = readFileSync('.env.local', 'utf-8')
env.split('\n').forEach(l => {
  const m = l.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)
  if (m) process.env[m[1]] = m[2].replace(/^"(.*)"$/, '$1')
})

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

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

const unpaid = await fetchAll('invoices', 'total, status, month, receiver_company', q => q.eq('year', 2026).eq('status', 'sent'))
const total = unpaid.reduce((s, r) => s + Number(r.total), 0)
console.log('미납 invoices: ' + unpaid.length + '건, 총 ₩' + total.toLocaleString())

const byMonth = {}
for (const u of unpaid) byMonth[u.month] = (byMonth[u.month] || 0) + Number(u.total)
console.log('월별 미납 금액:')
for (let m = 1; m <= 12; m++) {
  if (byMonth[m]) console.log('  ' + m + '월: ₩' + byMonth[m].toLocaleString())
}

// Top 10 unpaid companies
const byCompany = {}
for (const u of unpaid) byCompany[u.receiver_company] = (byCompany[u.receiver_company] || 0) + Number(u.total)
const top = Object.entries(byCompany).sort((a, b) => b[1] - a[1]).slice(0, 10)
console.log('\n미납 상위 10개사:')
top.forEach(([c, a], i) => console.log('  ' + (i+1) + '. ' + c + ': ₩' + a.toLocaleString()))
