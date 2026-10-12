#!/usr/bin/env node
// 리드 주제 태그 일괄 분류 (마케팅 리포트 §5).
// 규칙: src/config/topic_tags.json. 로직은 src/lib/topic-tags.ts 와 동일하게 유지.
// usage: node scripts/marketing/backfill-topic-tags.mjs [--from 2026-07-01] [--live]
//   - "기타" 비율이 20%를 넘으면 기타로 분류된 문의 샘플 20건을 출력 (마케팅팀 단어 보강용)
//   - --live: topic_tags 저장 (사람이 고친 리드 topic_tags_manual=true 는 건드리지 않음)

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'

const env = readFileSync('.env.local', 'utf-8')
env.split('\n').forEach(l => { const m = l.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/); if (m) process.env[m[1]] = m[2].replace(/^"(.*)"$/, '$1') })
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
const LIVE = process.argv.includes('--live')
const fromIdx = process.argv.indexOf('--from')
const FROM = fromIdx > -1 ? process.argv[fromIdx + 1] : '2026-07-01'

const rules = JSON.parse(readFileSync('src/config/topic_tags.json', 'utf-8'))

function cleanText(parts) {
  return parts.filter(Boolean).join('\n').split('\n')
    .filter(line => !/^\s*(레퍼러 주소|실제 레퍼러)\s*:/.test(line))
    .join('\n').replace(/https?:\/\/\S+/gi, ' ')
}
function matches(text, lower, kw) {
  if (/^[A-Za-z0-9-]+$/.test(kw)) return new RegExp(`(?<![A-Za-z])${kw.replace(/[-]/g, '\\-')}(?![A-Za-z])`, 'i').test(text)
  return lower.includes(kw.toLowerCase())
}
function isEmptyBody(text) {
  return !text.replace(/>?\s*(utm_\w+|landing_page)\s*:\s*\S*/gi, ' ')
    .replace(/\[Slack 문의알림\]\s*자동등록/g, ' ').replace(/[>\s|-]+/g, '')
}
function classify(l) {
  const text = cleanText([l.inquiry_content, l.core_need, l.notes])
  if (isEmptyBody(text)) return [rules.empty_label]
  const lower = text.toLowerCase()
  const tags = rules.tags.filter(r => r.keywords.some(kw => matches(text, lower, kw))).map(r => r.tag)
  return tags.length ? tags : [rules.fallback]
}

let leads = []
for (let off = 0; ; off += 1000) {
  const { data, error } = await sb.from('pipeline_leads')
    .select('id, company_name, inquiry_date, inquiry_channel, inquiry_content, core_need, notes')
    .gte('inquiry_date', FROM).order('inquiry_date', { ascending: false }).range(off, off + 999)
  if (error) throw error
  leads = leads.concat(data); if (data.length < 1000) break
}

const result = leads.map(l => ({ l, tags: classify(l) }))
const cnt = {}
for (const r of result) for (const t of r.tags) cnt[t] = (cnt[t] || 0) + 1
const etc = result.filter(r => r.tags.length === 1 && r.tags[0] === rules.fallback)
const ratio = leads.length ? etc.length / leads.length : 0

console.log(`[주제 태그] ${LIVE ? 'LIVE' : 'DRY-RUN'}  유입일 ${FROM} 이후 리드 ${leads.length}건\n`)
for (const [t, v] of Object.entries(cnt).sort((a, b) => b[1] - a[1])) console.log(`  ${String(v).padStart(4)}  ${t}`)
const empty = result.filter(r => r.tags[0] === rules.empty_label).length
console.log(`\n"${rules.fallback}" 비율: ${(ratio * 100).toFixed(1)}% (${etc.length}/${leads.length})  — 목표 20% 이하`)
console.log(`"${rules.empty_label}" (문의내용 없음): ${empty}건`)

const hasBody = l => !!cleanText([l.inquiry_content, l.core_need]).replace(/>?\s*(utm_\w+|landing_page)\s*:\s*\S*/g, ' ').replace(/[>\s]+/g, ' ').trim()
const etcWithBody = etc.filter(r => hasBody(r.l))
console.log(`  그중 문의내용이 비어 있는 리드: ${etc.length - etcWithBody.length}건, 내용이 있는데 못 붙인 리드: ${etcWithBody.length}건`)
if (ratio > 0.2) {
  console.log(`\n▼ 내용이 있는데 "${rules.fallback}"로 분류된 문의 샘플 (최대 20건, 단어 보강용)`)
  for (const { l } of etcWithBody.slice(0, 20)) {
    const body = (cleanText([l.inquiry_content]) || '(문의내용 없음)').replace(/\s+/g, ' ').trim().slice(0, 160)
    console.log(`  · ${l.inquiry_date} [${l.inquiry_channel || '-'}] ${l.company_name}\n      ${body}`)
  }
}

if (!LIVE) { console.log('\n[DRY-RUN] --live 로 저장'); process.exit(0) }

let ok = 0, skipped = 0
for (const r of result) {
  const { data, error } = await sb.from('pipeline_leads')
    .update({ topic_tags: r.tags }).eq('id', r.l.id).eq('topic_tags_manual', false).select('id')
  if (error) { console.log(`  ❌ ${r.l.company_name}: ${error.message}`); continue }
  if (data.length) ok++; else skipped++
}
console.log(`\n저장 ${ok}건, 사람이 고친 리드라 건너뜀 ${skipped}건`)
