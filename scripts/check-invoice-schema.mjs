import { readFileSync } from 'fs'
import { createClient } from '@supabase/supabase-js'

const env = readFileSync('.env.local', 'utf-8')
env.split('\n').forEach(l => {
  const m = l.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)
  if (m) process.env[m[1]] = m[2].replace(/^"(.*)"$/, '$1')
})

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

// Get one existing invoice to see columns
const { data } = await sb.from('invoices').select('*').limit(2)
console.log('Sample invoice columns:')
if (data && data[0]) {
  Object.keys(data[0]).forEach(k => console.log('  ' + k + ': ' + JSON.stringify(data[0][k]).substring(0, 80)))
}
console.log('\n2nd sample:')
if (data && data[1]) {
  Object.keys(data[1]).forEach(k => console.log('  ' + k + ': ' + JSON.stringify(data[1][k]).substring(0, 80)))
}

// Count totals per year
const { count: c2026 } = await sb.from('invoices').select('*', { count: 'exact', head: true }).eq('year', 2026)
const { count: c2025 } = await sb.from('invoices').select('*', { count: 'exact', head: true }).eq('year', 2025)
const { count: cAll } = await sb.from('invoices').select('*', { count: 'exact', head: true })
console.log('\nDB invoice counts: all=' + cAll + ' 2026=' + c2026 + ' 2025=' + c2025)
