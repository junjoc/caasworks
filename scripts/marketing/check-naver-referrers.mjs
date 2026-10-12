#!/usr/bin/env node
// 리드 레퍼러 중 네이버 블로그 글(logNo) 집계 확인 (2026-10-12)
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
const env = readFileSync('.env.local', 'utf-8')
env.split('\n').forEach(l => { const m = l.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/); if (m) process.env[m[1]] = m[2].replace(/^"(.*)"$/, '$1') })
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
let all = []
for (let off = 0; ; off += 1000) {
  const { data, error } = await sb.from('pipeline_leads').select('id, inquiry_content').ilike('inquiry_content', '%blog.naver.com%').range(off, off + 999)
  if (error) throw error
  all = all.concat(data); if (data.length < 1000) break
}
const cnt = new Map()
for (const l of all) {
  const m = (l.inquiry_content || '').match(/(?:^|\n)\s*>?\s*레퍼러(?: 주소)?\s*:\s*(\S+)/)
  if (!m || !/blog\.naver\.com/.test(m[1])) continue
  const u = new URL(m[1]); const log = u.searchParams.get('logNo') || u.pathname.split('/').filter(Boolean)[1] || '(없음)'
  cnt.set(log, (cnt.get(log) || 0) + 1)
}
const { data: posts } = await sb.from('naver_blog_posts').select('log_no, title').not('log_no', 'is', null)
console.log(`네이버 블로그 레퍼러 리드 ${[...cnt.values()].reduce((a, b) => a + b, 0)}건, 글 ${cnt.size}개 / URL 입력된 글 ${posts.length}편`)
console.log([...cnt].sort((a, b) => b[1] - a[1]).slice(0, 20))
