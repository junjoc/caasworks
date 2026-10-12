import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
const env = readFileSync('.env.local', 'utf-8')
env.split('\n').forEach(l => { const m = l.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/); if (m) process.env[m[1]] = m[2].replace(/^"(.*)"$/, '$1') })
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
let rows = []
for (let off = 0; ; off += 1000) {
  const { data, error } = await sb.from('ad_performance').select('date, campaign_name, adgroup_name, cost, inquiries, adoptions').eq('channel', '네이버').gte('date', '2026-04-01').range(off, off + 999)
  if (error) { console.log(error.message); break }
  rows = rows.concat(data); if (data.length < 1000) break
}
const g = {}
for (const r of rows) { const k = `${r.campaign_name} ▸ ${r.adgroup_name || '(그룹없음)'}`; g[k] = g[k] || { n: 0, cost: 0, inq: 0, first: r.date, last: r.date }; const x = g[k]; x.n++; x.cost += r.cost || 0; x.inq += r.inquiries || 0; if (r.date < x.first) x.first = r.date; if (r.date > x.last) x.last = r.date }
for (const [k, v] of Object.entries(g).sort((a, b) => b[1].cost - a[1].cost)) console.log(`${k.padEnd(60)} ${v.first}~${v.last}  ${v.n}일  비용 ${Math.round(v.cost).toLocaleString()}  문의 ${v.inq}`)
