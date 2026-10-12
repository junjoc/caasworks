import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
const env = readFileSync('.env.local', 'utf-8')
env.split('\n').forEach(l => { const m = l.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/); if (m) process.env[m[1]] = m[2].replace(/^"(.*)"$/, '$1') })
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
let all = []
for (let off = 0; ; off += 1000) {
  const { data } = await sb.from('pipeline_leads').select('company_name, inquiry_date, inquiry_channel, inquiry_source, referrer, utm_source, utm_campaign, stage, inquiry_content').range(off, off + 999)
  all = all.concat(data); if (data.length < 1000) break
}
const hit = all.filter(l => /miracleintip\.com/i.test(l.referrer || '') || /miracleintip\.com/i.test(l.inquiry_content || ''))
console.log(`miracleintip.com 레퍼러 리드: ${hit.length}건`)
const c = {}
for (const l of hit) { const k = `${l.inquiry_channel}/${l.inquiry_source}  utm=${l.utm_source || '-'}/${l.utm_campaign || '-'}`; c[k] = (c[k] || 0) + 1 }
for (const [k, v] of Object.entries(c).sort((a, b) => b[1] - a[1])) console.log(`  ${String(v).padStart(3)}  ${k}`)
for (const l of hit.filter(l => l.inquiry_channel !== '네이버')) console.log(`  · ${l.inquiry_date} ${l.company_name} [${l.stage}] ${l.inquiry_channel}/${l.inquiry_source}`)
