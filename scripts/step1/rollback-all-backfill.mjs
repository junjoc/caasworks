#!/usr/bin/env node
// 전체 롤백 — source='excel_backfill' 프로젝트 전부 삭제 (CASCADE 로 revenue 함께 삭제)
// 이후 2024/2025 revenue 잔여도 삭제 (백업 기준 원래 0)

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

console.log('[ROLLBACK] 전체 excel_backfill 삭제\n')

// 사전 상태
console.log('사전 상태:')
for (const y of [2024, 2025, 2026]) {
  const { count } = await sb.from('monthly_revenues').select('*', { count: 'exact', head: true }).eq('year', y)
  console.log(`  monthly_revenues year=${y}: ${count}`)
}
const { count: cntBackfill } = await sb.from('projects').select('*', { count: 'exact', head: true }).eq('source', 'excel_backfill')
console.log(`  projects source=excel_backfill: ${cntBackfill}`)

// 삭제 반복 (Supabase 1000 limit)
let totalDeleted = 0
while (true) {
  const projs = await fetchAll('projects', 'id', q => q.eq('source', 'excel_backfill').limit(1000))
  if (projs.length === 0) break
  console.log(`\n삭제 중: ${projs.length}건 (누적 ${totalDeleted})`)
  let batchDeleted = 0
  for (const p of projs) {
    const { error } = await sb.from('projects').delete().eq('id', p.id)
    if (!error) batchDeleted++
    if (batchDeleted % 200 === 0) process.stdout.write(`\r  ${batchDeleted}/${projs.length}`)
  }
  totalDeleted += batchDeleted
  console.log(`\n  ✅ batch ${batchDeleted}`)
  if (batchDeleted < projs.length) {
    console.log(`  ⚠ 일부 실패, 다음 batch 진행`)
  }
}
console.log(`\n총 삭제: ${totalDeleted}`)

// 잔여 revenue 삭제 (year=2024, 2025)
console.log(`\n잔여 revenue 정리...`)
for (const y of [2024, 2025]) {
  const { data, error, count } = await sb.from('monthly_revenues').delete({ count: 'exact' }).eq('year', y)
  console.log(`  year=${y}: ${error ? '❌ ' + error.message : '✅ ' + count + '건 삭제'}`)
}

// 최종 검증
console.log(`\n=== 최종 상태 ===`)
for (const y of [2024, 2025, 2026]) {
  const rows = await fetchAll('monthly_revenues', 'amount', q => q.eq('year', y))
  const sum = rows.reduce((s, r) => s + Number(r.amount), 0)
  console.log(`  ${y}: ${rows.length} rows, ${sum.toLocaleString()}원`)
}
const { count: pfinal } = await sb.from('projects').select('*', { count: 'exact', head: true })
const { count: pbf } = await sb.from('projects').select('*', { count: 'exact', head: true }).eq('source', 'excel_backfill')
console.log(`  projects 총: ${pfinal}`)
console.log(`  projects source=excel_backfill: ${pbf} (0 이어야 정상)`)
console.log(`\n[Done] Rollback 완료`)
