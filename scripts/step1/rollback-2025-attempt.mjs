#!/usr/bin/env node
// Rollback: source='excel_backfill' 로 마킹된 오늘 넣은 projects 삭제.
// CASCADE 로 그 프로젝트의 monthly_revenues 도 자동 삭제.
// - 오늘 처음 도입한 값이라 안전 (기존 데이터엔 이 마킹 없음)
// - 기존 2026 데이터 절대 안 건드림

import { readFileSync } from 'fs'
import { createClient } from '@supabase/supabase-js'

const env = readFileSync('.env.local', 'utf-8')
env.split('\n').forEach(l => {
  const m = l.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)
  if (m) process.env[m[1]] = m[2].replace(/^"(.*)"$/, '$1')
})
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

console.log('[ROLLBACK] 방금 넣은 excel_backfill projects 삭제\n')

// 사전 확인
const { data: preProjs } = await sb.from('projects').select('id, project_name').eq('source', 'excel_backfill')
console.log(`대상 projects (source=excel_backfill): ${preProjs?.length || 0}`)

const { count: preRevs } = await sb.from('monthly_revenues')
  .select('*', { count: 'exact', head: true }).eq('year', 2025)
console.log(`현재 monthly_revenues year=2025: ${preRevs}`)

if (!preProjs?.length) {
  console.log('삭제할 것 없음. 종료.')
  process.exit(0)
}

// 삭제 실행 (CASCADE 로 monthly_revenues 도 함께 삭제)
console.log(`\n삭제 시작...`)
let deleted = 0
for (const p of preProjs) {
  const { error } = await sb.from('projects').delete().eq('id', p.id)
  if (error) console.log(`  ❌ ${p.id}: ${error.message}`)
  else deleted++
  if (deleted % 100 === 0) process.stdout.write(`\r  ${deleted}/${preProjs.length}`)
}
console.log(`\n  ✅ projects 삭제: ${deleted}/${preProjs.length}`)

// 검증
const { count: postProjs } = await sb.from('projects').select('*', { count: 'exact', head: true }).eq('source', 'excel_backfill')
const { count: postRevs } = await sb.from('monthly_revenues')
  .select('*', { count: 'exact', head: true }).eq('year', 2025)
console.log(`\n검증:`)
console.log(`  projects source=excel_backfill: ${postProjs} (0 이어야 정상)`)
console.log(`  monthly_revenues year=2025: ${postRevs} (0 이어야 정상)`)

// 기존 2026 데이터 무결성 재확인
const { count: rev2026 } = await sb.from('monthly_revenues')
  .select('*', { count: 'exact', head: true }).eq('year', 2026)
console.log(`  monthly_revenues year=2026: ${rev2026} (3888 유지되어야 정상)`)

console.log(`\n[Done] Rollback 완료. v2 스크립트로 재시도 가능.`)
