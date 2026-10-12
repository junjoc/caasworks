import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
const env = readFileSync('.env.local', 'utf-8')
env.split('\n').forEach(l => { const m = l.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/); if (m) process.env[m[1]] = m[2].replace(/^"(.*)"$/, '$1') })
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
const { data } = await sb.from('pipeline_leads').select('company_name, inquiry_date, inquiry_channel, inquiry_source, referrer, inquiry_content, utm_source, utm_campaign, stage').gte('inquiry_date', '2026-07-01')
const val = (t, k) => { const m = (t || '').match(new RegExp(`${k}\\s*:\\s*([^\\s>]+)`)); return m ? m[1] : null }
const rows = data.filter(l => /utm_source/.test(l.inquiry_content || ''))
console.log(`7/1 이후 문의내용에 utm 줄이 있는 리드: ${rows.length}건 (utm 컬럼 채워진 리드: ${data.filter(l => l.utm_source).length}건)`)
const combo = {}
for (const l of rows) {
  const k = `${val(l.inquiry_content, 'utm_source') || '(빈값)'} / ${val(l.inquiry_content, 'utm_medium') || '-'} / ${val(l.inquiry_content, 'utm_campaign') || '-'}  ← 현재 ${l.inquiry_channel}/${l.inquiry_source}`
  combo[k] = (combo[k] || 0) + 1
}
for (const [k, v] of Object.entries(combo).sort((a, b) => b[1] - a[1])) console.log(`  ${String(v).padStart(3)}  ${k}`)
const nads = rows.filter(l => /^nads/i.test(val(l.inquiry_content, 'utm_source') || ''))
console.log(`\nNAds 리드 ${nads.length}건, 도입완료 ${nads.filter(l => l.stage === '도입완료').length}건`)
for (const l of nads) console.log(`  ${l.inquiry_date} ${l.company_name.slice(0, 14).padEnd(14)} ${l.stage.padEnd(4)} ref=${(l.referrer || '').slice(0, 40)}`)
const { data: ads } = await sb.from('ad_performance').select('channel, campaign_name, data_source').eq('channel', '네이버').gte('date', '2026-07-01')
const camps = {}
for (const a of ads || []) { const k = `${a.campaign_name} (${a.data_source})`; camps[k] = (camps[k] || 0) + 1 }
console.log(`\n광고성과 '네이버' 캠페인명 (7/1~, 행 수):`)
for (const [k, v] of Object.entries(camps).sort((a, b) => b[1] - a[1])) console.log(`  ${String(v).padStart(4)}  ${k}`)
