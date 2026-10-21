#!/usr/bin/env node
// 2026 시트 origin 프로젝트에 sheet_year=2026 설정
// 대상: 오늘 rebuild 로 insert 된 excel_backfill projects
// - 2026 매출 있는 것 OR
// - 2026 시트 seq 범위 (1~1929 NO 값) & 다른 연도 매출 없음

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'

const env = readFileSync('.env.local', 'utf-8')
env.split('\n').forEach(l => { const m = l.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/); if (m) process.env[m[1]] = m[2].replace(/^"(.*)"$/, '$1') })
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

const LIVE = process.argv.includes('--live')

async function fetchAll(t, cols, ff) {
  let all = [], size = 1000
  for (let f = 0; ; f += size) {
    let q = sb.from(t).select(cols).range(f, f + size - 1)
    if (ff) q = ff(q)
    const { data, error } = await q
    if (error) throw error
    if (!data || !data.length) break
    all = all.concat(data); if (data.length < size) break
  }
  return all
}

// Rebuild-2026 실행 시점 이후만 (백업 파일 시각 = 2026-07-02T06:05 UTC → 이후)
// rebuild 만 이 시점 이후 excel_backfill projects 인서트. update-sheet-no-to-original 는 UPDATE 만.
// 즉 rebuild 이후 excel_backfill 새 insert = 2218 rows 정확히.
const rebuildStart = '2026-07-02T06:05:00Z'

const target = await fetchAll(
  'projects',
  'id, sheet_no, sheet_year, created_at',
  q => q.eq('source', 'excel_backfill').gte('created_at', rebuildStart)
)
console.log(`rebuild 시점 이후 insert 된 excel_backfill projects: ${target.length}`)

const needUpdate = target.filter(p => p.sheet_year !== 2026)
console.log(`sheet_year=2026 설정 대상: ${needUpdate.length}`)

if (!LIVE) {
  console.log(`\n샘플 5:`)
  for (const p of needUpdate.slice(0, 5)) console.log(`  ${p.id} sheet_no=${p.sheet_no} sheet_year=${p.sheet_year}`)
  console.log(`\n[DRY-RUN] --live 로 실행`)
  process.exit(0)
}

// UPDATE 병렬
let ok = 0, fail = 0
for (let i = 0; i < needUpdate.length; i += 30) {
  const chunk = needUpdate.slice(i, i + 30)
  const results = await Promise.all(chunk.map(p =>
    sb.from('projects').update({ sheet_year: 2026 }).eq('id', p.id)
  ))
  for (const r of results) {
    if (r.error) { fail++; console.log(`\n  ❌ ${r.error.message}`) }
    else ok++
  }
  process.stdout.write(`\r  ${ok + fail}/${needUpdate.length}`)
}
console.log(`\n  ✅ ${ok} 성공, ${fail} 실패`)
