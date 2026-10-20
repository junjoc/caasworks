#!/usr/bin/env node
// docs/DEV_LOG/YYYY-MM-DD.md 의 번호 섹션("## N. 제목 (커밋)")을 CRM 피드백 > 개발일지(user_feedbacks, status=done)에 넣는다. 2026-10-20
// - 같은 완료일 + 같은 제목이 이미 있으면 건너뜀 (여러 번 실행해도 안전). 삭제·수정 없음
// - 번호 없는 섹션(세션 요약, 기타 등)은 무시
// usage: node scripts/devlog-to-crm.mjs [docs/DEV_LOG/2026-10-20.md ...] [--live]   (파일 생략 시 docs/DEV_LOG/*.md 전체. 과거 사후 요약은 docs/DEV_LOG/backfill/)
import { createClient } from '@supabase/supabase-js'
import { readFileSync, readdirSync } from 'fs'

readFileSync('.env.local', 'utf-8').split('\n').forEach(l => { const m = l.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/); if (m) process.env[m[1]] = m[2].replace(/^"(.*)"$/, '$1') })
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
const LIVE = process.argv.includes('--live')
let files = process.argv.slice(2).filter(a => a.endsWith('.md'))
if (!files.length) files = readdirSync('docs/DEV_LOG').filter(f => /^\d{4}-\d{2}-\d{2}\.md$/.test(f)).sort().map(f => `docs/DEV_LOG/${f}`)

const PAGE_HINTS = [
  [/연간 비교/, '/marketing/history'], [/마케팅 리포트|리포트/, '/marketing/report'], [/콘텐츠 성과|블로그 통계|블로그 레퍼러/, '/marketing/content'],
  [/캘린더/, '/team/calendar'], [/GA|여정|앱 트래픽/, '/marketing/journey'], [/광고|NAds|캠페인|스마트스토어/, '/marketing/ads'],
  [/청구서|미납|매입매출/, '/finance/invoices'], [/매출/, '/revenue'], [/고객/, '/customers'],
  [/유입채널|도입완료|주제 태그|블로그 채널|파이프라인/, '/pipeline'],
]
const categoryOf = t => (/수정|오류|버그|사라짐|문제|안 나오|깨짐/.test(t) ? 'bug' : /정리|개선|변경|제거|구분|분리|갱신|마무리|잠금|문의내용|집계/.test(t) ? 'improvement' : 'feature')

const entries = []
for (const f of files) {
  const date = f.match(/(\d{4}-\d{2}-\d{2})/)[1]
  const text = readFileSync(f, 'utf-8')
  const sections = text.split(/^## /m).slice(1)
  for (const sec of sections) {
    const head = sec.split('\n')[0].trim()
    const m = head.match(/^(\d+)\.\s+(.+)$/)
    if (!m) continue
    let title = m[2]
    // 커밋은 제목 뒤 괄호가 해시(와 →)만으로 된 경우만 ("(신규 카테고리, aaf958c 이후 커밋)" 같은 설명은 제외)
    const shas = [...title.matchAll(/\(([0-9a-f]{7,8}(?:\s*(?:→|,)\s*[0-9a-f]{7,8})*)\)/g)].flatMap(x => x[1].match(/[0-9a-f]{7,8}/g) || [])
    title = title.replace(/\s*\([^)]*\)\s*/g, ' ').replace(/\s*—.*$/, '').replace(/\s+/g, ' ').trim()
    if (!title || /^기타$/.test(title)) continue
    const body = sec.split('\n').slice(1).join('\n').trim()
    const bullets = body.split('\n').filter(l => /^- /.test(l)).map(l => l.replace(/^- /, '').replace(/`/g, '').trim())
    const summary = bullets.slice(0, 4).join('\n').slice(0, 500)
    const page = (PAGE_HINTS.find(([re]) => re.test(title)) || [])[1] || null
    entries.push({
      title: `${title}`, description: `docs/DEV_LOG/${date}.md §${m[1]}\n\n${body}`.slice(0, 4000),
      category: categoryOf(title), priority: 'normal', status: 'done', target_page: page,
      completed_at: `${date}T09:00:00+09:00`, created_at: `${date}T09:00:00+09:00`, started_at: `${date}T09:00:00+09:00`,
      resolution_summary: summary || null, commit_shas: shas,
    })
  }
}

const { data: existing, error } = await sb.from('user_feedbacks').select('title, completed_at').eq('status', 'done')
if (error) throw new Error(error.message)
const have = new Set((existing || []).map(e => `${(e.completed_at || '').slice(0, 10)}|${e.title}`))
const toInsert = entries.filter(e => !have.has(`${e.completed_at.slice(0, 10)}|${e.title}`))
console.log(`[개발일지 → CRM] ${LIVE ? 'LIVE' : 'DRY-RUN'}  파일 ${files.length}, 섹션 ${entries.length}, 이미 있음 ${entries.length - toInsert.length}, 추가 ${toInsert.length}`)
for (const e of toInsert) console.log(`  ${e.completed_at.slice(0, 10)} [${e.category}] ${e.title}  ${e.target_page || ''}  ${e.commit_shas.join(',')}\n      ${(e.resolution_summary || '').split('\n')[0].slice(0, 100)}`)
if (!LIVE) { console.log('\n[DRY-RUN] --live 로 실행'); process.exit(0) }
let ok = 0
for (const e of toInsert) { const { error } = await sb.from('user_feedbacks').insert(e); if (error) console.log(`  ❌ ${e.title}: ${error.message}`); else ok++ }
console.log(`완료: ${ok}건 추가`)
