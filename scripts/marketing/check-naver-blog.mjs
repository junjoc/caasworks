import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
const env = readFileSync('.env.local', 'utf-8')
env.split('\n').forEach(l => { const m = l.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/); if (m) process.env[m[1]] = m[2].replace(/^"(.*)"$/, '$1') })
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
const { count: posts } = await sb.from('naver_blog_posts').select('*', { count: 'exact', head: true })
const { data: v } = await sb.from('naver_blog_post_views').select('month, views')
const byM = {}; for (const r of v) byM[r.month] = (byM[r.month] || 0) + r.views
console.log(`글 ${posts}편, 월별 상위100 조회수 합:`, byM)
const { data: kw } = await sb.from('naver_blog_inflow').select('name, ratio').eq('month', '2026-09-01').eq('kind', 'keyword').order('rank').limit(8)
console.log('9월 검색어 상위:', kw.map(k => `${k.name}(${k.ratio}%)`).join(', '))
const { data: mon } = await sb.from('naver_blog_monthly').select('*').gte('month', '2026-04-01').order('month')
console.log('월별 요약:', mon.map(m => `${m.month.slice(0, 7)} 방문자${m.unique_visitors ?? '-'} ${m.avg_time_sec ?? '-'}초 모바일${m.mobile_ratio ?? '-'}%`).join(' | '))
