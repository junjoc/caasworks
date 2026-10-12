import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
const env = readFileSync('.env.local', 'utf-8')
env.split('\n').forEach(l => { const m = l.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/); if (m) process.env[m[1]] = m[2].replace(/^"(.*)"$/, '$1') })
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
const { data: rows } = await sb.from('ad_performance').select('date, campaign_name, adgroup_name, inquiries, inquiry_companies, adoptions, adoption_companies, data_source').eq('channel', '네이버').gt('inquiries', 0)
console.log(`네이버 광고성과 중 문의가 입력된 행: ${rows.length}`)
for (const r of rows.sort((a, b) => a.date.localeCompare(b.date))) console.log(`  ${r.date} ${r.adgroup_name?.padEnd(14)} 문의${r.inquiries} [${r.inquiry_companies || '회사명 없음'}] 도입${r.adoptions || 0} ${r.adoption_companies || ''}`)
const { data: leads } = await sb.from('pipeline_leads').select('inquiry_date, company_name, inquiry_source, stage').eq('inquiry_channel', '네이버')
console.log(`\n유입채널=네이버 리드 ${leads.length}건`)
for (const l of leads.sort((a, b) => a.inquiry_date.localeCompare(b.inquiry_date))) {
  const same = rows.find(r => r.date === l.inquiry_date && (r.inquiry_companies || '').includes(l.company_name.replace(/\(주\)|주식회사/g, '').trim().slice(0, 3)))
  console.log(`  ${l.inquiry_date} ${l.company_name.padEnd(16)} ${l.inquiry_source.padEnd(8)} ${l.stage.padEnd(4)} ${same ? '← 같은 날 광고성과에 입력돼 있음: ' + same.inquiry_companies : ''}`)
}
