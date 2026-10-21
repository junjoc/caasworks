// GA 유입 행 백업 (읽기 전용) — 재동기화 전에 실행. node scripts/sync/backup-ga-sources.mjs 2026-01-01 2026-10-21
import { createClient } from '@supabase/supabase-js'
import fs from 'fs'
const [from = '2026-01-01', to = new Date().toISOString().slice(0, 10)] = process.argv.slice(2)
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)
const CH = ['검색유입', '자사채널', '블로그', '외주 블로그', '언론', '외부 글', '언론·뉴스', '커뮤니티', '소셜', '미분류']
let rows = []
for (let off = 0; ; off += 1000) {
  const { data, error } = await sb.from('ad_performance').select('*').in('channel', CH).is('campaign_id', null).gte('date', from).lte('date', to).order('date').range(off, off + 999)
  if (error) throw error
  rows = rows.concat(data); if (data.length < 1000) break
}
const { data: unk } = await sb.from('ad_performance').select('*').eq('channel', '네이버').eq('campaign_name', '캠페인 미확인').gte('date', from).lte('date', to)
rows = rows.concat(unk || [])
const file = `backups/ga-sources/ga-sources-${from}_${to}-${new Date().toISOString().replace(/[:.]/g, '-')}.json`
fs.writeFileSync(file, JSON.stringify(rows))
const manual = rows.filter(r => (r.inquiries || 0) + (r.signups || 0) + (r.adoptions || 0) + (r.inquiry_clicks || 0) > 0).length
console.log(`백업 ${rows.length}행 (문의·도입 등 수기 값 있는 행 ${manual}) → ${file}`)
