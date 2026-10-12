import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
const env = readFileSync('.env.local', 'utf-8')
env.split('\n').forEach(l => { const m = l.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/); if (m) process.env[m[1]] = m[2].replace(/^"(.*)"$/, '$1') })
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
const NEW = ['오가닉검색', '직접', 'AI어시스턴트', '유료검색_네이버', '오가닉_구글', '오가닉_네이버']
const { data, error } = await sb.from('ad_performance').select('date, channel, campaign_name, inquiries, adoptions, cost, impressions, clicks, data_source, inquiry_companies, adoption_companies').eq('channel', '기타').in('campaign_name', NEW).order('date')
if (error) { console.log(error.message); process.exit(1) }
console.log(`광고성과 '기타' 채널에 잘못 들어간 행: ${data.length}`)
let inq = 0, ad = 0
for (const r of data) { inq += r.inquiries || 0; ad += r.adoptions || 0 }
console.log(`  합계 문의 ${inq}, 도입 ${ad}`)
for (const r of data.slice(0, 12)) console.log(`  ${r.date} ${r.campaign_name.padEnd(8)} 문의${r.inquiries} 도입${r.adoptions} 비용${r.cost} src=${r.data_source}`)
// 150건 referrer 샘플
const { data: leads } = await sb.from('pipeline_leads').select('inquiry_channel, inquiry_source, referrer').in('inquiry_channel', NEW)
const hosts = {}
for (const l of leads) { let h = '(없음)'; try { if (l.referrer) h = new URL(l.referrer).host } catch { h = l.referrer?.slice(0, 30) } const k = `${l.inquiry_channel} ← ${h}`; hosts[k] = (hosts[k] || 0) + 1 }
console.log('\n채널 ← 레퍼러 호스트')
for (const [k, v] of Object.entries(hosts).sort((a, b) => b[1] - a[1])) console.log(`  ${String(v).padStart(3)}  ${k}`)
