import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
const env = readFileSync('.env.local', 'utf-8')
env.split('\n').forEach(l => { const m = l.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/); if (m) process.env[m[1]] = m[2].replace(/^"(.*)"$/, '$1') })
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
let all = []
for (let off = 0; ; off += 1000) {
  const { data, error } = await sb.from('pipeline_leads').select('inquiry_channel, inquiry_source, referrer, inquiry_date').range(off, off + 999)
  if (error) throw error
  all = all.concat(data); if (data.length < 1000) break
}
console.log(`총 리드: ${all.length}`)
const cnt = {}
for (const r of all) { const k = r.inquiry_channel ?? '(null)'; cnt[k] = (cnt[k] || 0) + 1 }
for (const [k, v] of Object.entries(cnt).sort((a, b) => b[1] - a[1])) console.log(`  ${String(v).padStart(4)}  ${k}`)
const withRef = all.filter(r => r.referrer).length
console.log(`\nreferrer 필드 있는 리드: ${withRef}`)
const recent = all.filter(r => r.inquiry_date >= '2026-07-01')
console.log(`7/1 이후 리드: ${recent.length}`)
