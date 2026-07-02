#!/usr/bin/env node
// v4 완전 리셋 — source in ('excel_backfill', 'sheet') 프로젝트 전부 삭제 (CASCADE)
// 유지: source='manual' 프로젝트 (사용자가 직접 추가한 것)

import { readFileSync } from 'fs'
import { createClient } from '@supabase/supabase-js'

const env = readFileSync('.env.local', 'utf-8')
env.split('\n').forEach(l => { const m = l.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/); if (m) process.env[m[1]] = m[2].replace(/^"(.*)"$/, '$1') })
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

console.log('[v4 완전 리셋]\n')

// 사전
const { count: preAll } = await sb.from('projects').select('*', { count: 'exact', head: true })
const { count: preSheet } = await sb.from('projects').select('*', { count: 'exact', head: true }).eq('source', 'sheet')
const { count: preBackfill } = await sb.from('projects').select('*', { count: 'exact', head: true }).eq('source', 'excel_backfill')
const { count: preManual } = await sb.from('projects').select('*', { count: 'exact', head: true }).eq('source', 'manual')
console.log('사전 projects:', { total: preAll, sheet: preSheet, backfill: preBackfill, manual: preManual })

// 삭제 대상
let totalDeleted = 0
for (const source of ['excel_backfill', 'sheet']) {
  console.log(`\n삭제: source='${source}'`)
  while (true) {
    const projs = await fetchAll('projects', 'id', q => q.eq('source', source).limit(1000))
    if (projs.length === 0) break
    let batchDel = 0
    for (const p of projs) {
      const { error } = await sb.from('projects').delete().eq('id', p.id)
      if (!error) batchDel++
      if (batchDel % 200 === 0) process.stdout.write(`\r  ${batchDel}/${projs.length}`)
    }
    totalDeleted += batchDel
    console.log(`\n  batch ${batchDel} 삭제`)
    if (batchDel < projs.length) break
  }
}
console.log(`\n총 삭제: ${totalDeleted}`)

// 잔여 revenue 정리 (year 2024/2025/2026 중 관계 남은 것)
console.log('\n잔여 revenue 정리...')
for (const y of [2024, 2025, 2026]) {
  const { data, error, count } = await sb.from('monthly_revenues').delete({ count: 'exact' }).eq('year', y)
  console.log(`  year=${y}: ${error ? '❌ '+error.message : '✅ '+count+'건'}`)
}

// 최종
console.log('\n=== 최종 상태 ===')
for (const y of [2024, 2025, 2026]) {
  const rows = await fetchAll('monthly_revenues', 'amount', q => q.eq('year', y))
  const sum = rows.reduce((s, r) => s + Number(r.amount), 0)
  console.log(`  year=${y}: ${rows.length}행, ${sum.toLocaleString()}원`)
}
const { count: cntTotal } = await sb.from('projects').select('*', { count: 'exact', head: true })
const { count: cntManual } = await sb.from('projects').select('*', { count: 'exact', head: true }).eq('source', 'manual')
console.log(`  projects total: ${cntTotal} (manual ${cntManual}만 유지)`)
console.log('\n[Done]')
