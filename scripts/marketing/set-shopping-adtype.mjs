// 네이버 쇼핑검색 캠페인(카스웍스 스마트스토어 테스트 0810) 기존 광고성과 행의 광고유형을 '쇼핑'으로
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
const env = readFileSync('.env.local', 'utf-8')
env.split('\n').forEach(l => { const m = l.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/); if (m) process.env[m[1]] = m[2].replace(/^"(.*)"$/, '$1') })
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
const CAMP = '카스웍스 스마트스토어 테스트 0810'
const { data, error, count } = await sb.from('ad_performance').update({ ad_type: '쇼핑' }, { count: 'exact' })
  .eq('channel', '네이버').eq('campaign_name', CAMP).neq('ad_type', '쇼핑').select('id')
if (error) { console.log(error.message); process.exit(1) }
const { count: now } = await sb.from('ad_performance').select('*', { count: 'exact', head: true }).eq('campaign_name', CAMP).eq('ad_type', '쇼핑')
console.log(`변경 ${data.length}행, 현재 '쇼핑' ${now}행`)
