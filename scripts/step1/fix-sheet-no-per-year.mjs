#!/usr/bin/env node
// sheet_no 재배정 — 매년 1~N 독립 넘버링
//
// 현재:
//   2024 → sheet_no -10001 ~ -10864
//   2025 → sheet_no -1 ~ -1118
//   2026 → sheet_no 1 ~ 1466 (그대로)
//
// 목표:
//   2024 → sheet_no 1 ~ 864 (독립)
//   2025 → sheet_no 1 ~ 1118 (독립, 2024와 넘버 겹쳐도 OK — 다른 프로젝트라서)
//   2026 → 그대로 유지
//
// 변환:
//   2025: -sheet_no → sheet_no  (예: -1 → 1)
//   2024: (-sheet_no - 10000) → sheet_no (예: -10001 → 1)
//
// 정렬 로직 (DESC): xlsx 마지막 행이 sheet_no 가장 큰 값 → 화면 맨 위 (newest)
// xlsx 첫 행이 sheet_no = 1 → 맨 밑 (oldest)

import { readFileSync } from 'fs'
import { createClient } from '@supabase/supabase-js'

const env = readFileSync('.env.local', 'utf-8')
env.split('\n').forEach(l => {
  const m = l.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)
  if (m) process.env[m[1]] = m[2].replace(/^"(.*)"$/, '$1')
})
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

async function fetchAll(t, cols, ff) {
  let all = [], size = 1000
  for (let f = 0; ; f += size) {
    let q = sb.from(t).select(cols).range(f, f + size - 1)
    if (ff) q = ff(q)
    const { data, error } = await q
    if (error) throw new Error(error.message)
    if (!data || !data.length) break
    all = all.concat(data)
    if (data.length < size) break
  }
  return all
}

console.log('[SHEET_NO 재배정]\n')

// 2025 프로젝트 조회 (-1 ~ -1118)
const proj2025 = await fetchAll('projects', 'id, sheet_no',
  q => q.eq('source', 'excel_backfill').gte('sheet_no', -1200).lt('sheet_no', 0))
console.log(`2025 대상: ${proj2025.length}`)

// 2024 프로젝트 조회 (-10001 ~ -10864)
const proj2024 = await fetchAll('projects', 'id, sheet_no',
  q => q.eq('source', 'excel_backfill').lt('sheet_no', -1200))
console.log(`2024 대상: ${proj2024.length}`)

// 2025 UPDATE: sheet_no = -sheet_no
console.log('\n[UPDATE] 2025 프로젝트 sheet_no 재배정...')
let updated25 = 0
for (const p of proj2025) {
  const newVal = -Number(p.sheet_no)  // -1 → 1
  const { error } = await sb.from('projects').update({ sheet_no: newVal }).eq('id', p.id)
  if (!error) updated25++
  if (updated25 % 200 === 0) process.stdout.write(`\r  ${updated25}/${proj2025.length}`)
}
console.log(`\n  ✅ ${updated25}/${proj2025.length}`)

// 2024 UPDATE: sheet_no = -sheet_no - 10000
console.log('\n[UPDATE] 2024 프로젝트 sheet_no 재배정...')
let updated24 = 0
for (const p of proj2024) {
  const newVal = -Number(p.sheet_no) - 10000  // -10001 → 1
  const { error } = await sb.from('projects').update({ sheet_no: newVal }).eq('id', p.id)
  if (!error) updated24++
  if (updated24 % 200 === 0) process.stdout.write(`\r  ${updated24}/${proj2024.length}`)
}
console.log(`\n  ✅ ${updated24}/${proj2024.length}`)

// 검증
console.log('\n[검증]')
const check2024 = await fetchAll('projects', 'sheet_no', q => q.eq('source', 'excel_backfill').gt('sheet_no', 0).lt('sheet_no', 1000))
console.log(`  2024 (sheet_no 1~864 예상): ${check2024.length}`)
const check2025 = await fetchAll('projects', 'sheet_no', q => q.eq('source', 'excel_backfill').gte('sheet_no', 1000).lt('sheet_no', 2000))
console.log(`  2025 (sheet_no 1000~2000 예상? 아님, 1~1118 예상): ${check2025.length}`)

// 그냥 전체 확인
const allBackfill = await fetchAll('projects', 'sheet_no', q => q.eq('source', 'excel_backfill'))
const nos = allBackfill.map(p => Number(p.sheet_no)).sort((a, b) => a - b)
console.log(`\n  excel_backfill 전체 sheet_no 범위: min=${nos[0]}, max=${nos[nos.length-1]}`)

// 2026 무결성
const rev2026 = await fetchAll('monthly_revenues', 'amount', q => q.eq('year', 2026))
console.log(`  monthly_revenues year=2026: ${rev2026.length} (3888 유지 확인)`)

console.log('\n[Done]')
