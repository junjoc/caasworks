import { readFileSync } from 'fs'
import { createClient } from '@supabase/supabase-js'

const env = readFileSync('.env.local', 'utf-8')
env.split('\n').forEach(l => {
  const m = l.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)
  if (m) process.env[m[1]] = m[2].replace(/^"(.*)"$/, '$1')
})

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

const tables = ['user_feedbacks', 'feedback_comments', 'assets', 'purchases', 'inventory_items', 'rentals']
for (const t of tables) {
  const { error } = await sb.from(t).select('*').limit(1)
  console.log(t + ':', error ? '❌ ' + error.message : '✅')
}

const { error: e1 } = await sb.from('projects').select('revenue_type').limit(1)
console.log('projects.revenue_type:', e1 ? '❌' : '✅')
const { error: e2 } = await sb.from('monthly_revenues').select('revenue_type').limit(1)
console.log('monthly_revenues.revenue_type:', e2 ? '❌' : '✅')
