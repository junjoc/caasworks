#!/usr/bin/env node
// content_performance 에 저장된 404/외부/무효 레코드 정리 (Q3 팀 관찰)
// - title 에 "찾을 수 없음/not found/404" 포함
// - page_path 가 외부 URL
// 파괴적 → --live 없으면 dry-run.

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'

const env = readFileSync('.env.local', 'utf-8')
env.split('\n').forEach(l => { const m = l.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/); if (m) process.env[m[1]] = m[2].replace(/^"(.*)"$/, '$1') })
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
const LIVE = process.argv.includes('--live')

const { data: all, error } = await sb.from('content_performance').select('id, page_path, title, is_manual')
if (error) { console.log(error.message); process.exit(1) }

function invalidTitle(t) {
  const s = (t || '').toLowerCase()
  return s.includes('찾을 수 없음') || s.includes('not found') || s.includes('404')
    || s === '(제목 없음)' || s.trim() === ''
}
function externalPath(p) { return /^https?:\/\//i.test(p || '') || (p || '').includes('://') }

// 수동 등록(is_manual=true) 은 팀이 넣은 것이니 스킵.
const targets = (all || []).filter(r => !r.is_manual && (invalidTitle(r.title) || externalPath(r.page_path)))
console.log(`총 ${all.length} 중 정리 대상: ${targets.length}`)
console.log(`\n샘플 상위 10`)
for (const r of targets.slice(0, 10)) {
  console.log(`  ${r.id.substring(0, 8)}...  ${(r.title || '').substring(0, 30).padEnd(30)}  ${r.page_path}`)
}

if (!LIVE) { console.log('\n[DRY-RUN] --live'); process.exit(0) }

const ids = targets.map(r => r.id)
let ok = 0
for (let i = 0; i < ids.length; i += 100) {
  const slice = ids.slice(i, i + 100)
  const { error, count } = await sb.from('content_performance').delete({ count: 'exact' }).in('id', slice)
  if (error) console.log(`  ❌ ${error.message}`)
  else ok += count || 0
  process.stdout.write(`\r  ${ok}/${targets.length}`)
}
console.log(`\n  ✅ ${ok}개 삭제`)
