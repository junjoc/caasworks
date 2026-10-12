import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
const env = readFileSync('.env.local', 'utf-8')
env.split('\n').forEach(l => { const m = l.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/); if (m) process.env[m[1]] = m[2].replace(/^"(.*)"$/, '$1') })
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
for (const d of ['2026-08-12', '2026-08-20', '2026-09-18', '2026-10-06']) {
  const { data } = await sb.from('ad_performance').select('id, date, channel, campaign_name, adgroup_name, cost, inquiries, inquiry_companies, data_source').eq('date', d).eq('channel', '네이버')
  console.log(`== ${d}`)
  for (const r of data) console.log(`  [${r.campaign_name}] [${r.adgroup_name}] 비용${r.cost} 문의${r.inquiries} ${r.inquiry_companies || ''} (${r.data_source})`)
}
