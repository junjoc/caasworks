import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
const env = readFileSync('.env.local', 'utf-8')
env.split('\n').forEach(l => { const m = l.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/); if (m) process.env[m[1]] = m[2].replace(/^"(.*)"$/, '$1') })
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
let leads = []
for (let off = 0; ; off += 1000) {
  const { data } = await sb.from('pipeline_leads').select('inquiry_date, company_name, inquiry_channel, inquiry_source, referrer, utm_source, utm_campaign, inquiry_content, notes').gte('inquiry_date', '2026-08-01').range(off, off + 999)
  leads = leads.concat(data); if (data.length < 1000) break
}
const re = /smartstore|스마트스토어|shopping\.naver|search\.shopping|브랜드스토어|brand\.naver/i
const hit = leads.filter(l => re.test([l.referrer, l.inquiry_content, l.notes, l.inquiry_source, l.utm_source, l.utm_campaign].join(' ')))
console.log(`8/1 이후 리드 ${leads.length}건 중 스마트스토어/쇼핑 흔적: ${hit.length}건`)
for (const l of hit) console.log(`  ${l.inquiry_date} ${l.company_name} ${l.inquiry_channel}/${l.inquiry_source} ref=${(l.referrer || '').slice(0, 60)} utm=${l.utm_source || '-'}/${l.utm_campaign || '-'}`)
let ads = []
for (let off = 0; ; off += 1000) {
  const { data } = await sb.from('ad_performance').select('date, ad_type, adgroup_name, impressions, clicks, cost, inquiries').eq('campaign_name', '카스웍스 스마트스토어 테스트 0810').range(off, off + 999)
  ads = ads.concat(data); if (data.length < 1000) break
}
const t = ads.reduce((a, r) => ({ imp: a.imp + (r.impressions || 0), clk: a.clk + (r.clicks || 0), cost: a.cost + (r.cost || 0), inq: a.inq + (r.inquiries || 0) }), { imp: 0, clk: 0, cost: 0, inq: 0 })
console.log(`\n광고성과 '카스웍스 스마트스토어 테스트 0810': ${ads.length}행, ad_type=${[...new Set(ads.map(a => a.ad_type))].join(',')}`)
console.log(`  노출 ${t.imp.toLocaleString()} 클릭 ${t.clk} 비용 ${t.cost.toLocaleString()} 문의 ${t.inq}`)
const { data: other } = await sb.from('ad_performance').select('ad_type, campaign_name').eq('channel', '네이버').gte('date', '2026-10-01')
console.log('네이버 캠페인별 ad_type:', [...new Set(other.map(o => `${o.campaign_name}=${o.ad_type}`))].join(' | '))
