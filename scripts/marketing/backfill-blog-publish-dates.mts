// 카스웍스 블로그 글 발행일 일괄 채우기 (2026-10-20). 발행일이 빈 content_performance 글 페이지를 읽어 <time> 날짜를 저장.
// usage: npx tsx --tsconfig tsconfig.json scripts/marketing/backfill-blog-publish-dates.mts
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { fetchBlogPublishDate } from '../../src/lib/blog-publish-date'

readFileSync('.env.local', 'utf-8').split('\n').forEach(l => { const m = l.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/); if (m) process.env[m[1]] = m[2].replace(/^"(.*)"$/, '$1') })
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

const { data, error } = await sb.from('content_performance').select('id, page_path, title').eq('channel', 'caasworks_blog').is('published_at', null).not('page_path', 'is', null)
if (error) throw error
console.log(`발행일 없는 글 ${data.length}편`)
let ok = 0, miss: string[] = []
for (const r of data) {
  const d = await fetchBlogPublishDate(r.page_path)
  if (d) { await sb.from('content_performance').update({ published_at: d }).eq('id', r.id); ok++ }
  else miss.push(`${r.page_path} ${r.title.slice(0, 30)}`)
}
console.log(`채움 ${ok}편, 못 읽음 ${miss.length}편`)
for (const m of miss) console.log('  ', m)
