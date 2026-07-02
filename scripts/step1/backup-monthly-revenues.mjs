#!/usr/bin/env node
// STEP 1 안전장치 — monthly_revenues 전체 JSON 백업.
// 실행 결과: backups/monthly-revenues-YYYY-MM-DD-HHmm.json
// 파괴적 작업 아님 (read-only + JSON 파일 생성).

import { readFileSync, writeFileSync, mkdirSync } from 'fs'
import { createClient } from '@supabase/supabase-js'

const env = readFileSync('.env.local', 'utf-8')
env.split('\n').forEach(l => {
  const m = l.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)
  if (m) process.env[m[1]] = m[2].replace(/^"(.*)"$/, '$1')
})
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

async function fetchAll(t, cols) {
  let all = [], size = 1000
  for (let f = 0; ; f += size) {
    const { data, error } = await sb.from(t).select(cols).range(f, f + size - 1)
    if (error) throw new Error(error.message)
    if (!data || !data.length) break
    all = all.concat(data)
    if (data.length < size) break
  }
  return all
}

console.log('=== monthly_revenues 전체 백업 ===')
const revs = await fetchAll('monthly_revenues', '*')
console.log(`  fetched: ${revs.length} rows`)

// 정합성 sanity check
const byYear = {}
revs.forEach(r => { byYear[r.year] = (byYear[r.year] || 0) + 1 })
console.log('  by year:', byYear)
const sum = revs.reduce((s, r) => s + Number(r.amount || 0), 0)
console.log(`  total amount: ${sum.toLocaleString()}원`)

// projects 도 함께 스냅샷 (FK 무결성 검증용)
console.log('\n=== projects 전체 스냅샷 (FK 무결성 검증용) ===')
const projs = await fetchAll('projects', 'id, customer_id, project_name, service_type, sheet_no, source')
console.log(`  fetched: ${projs.length} rows`)

mkdirSync('backups', { recursive: true })
const now = new Date()
const stamp = now.toISOString().replace(/[:.]/g, '-').substring(0, 16)
const path = `backups/monthly-revenues-${stamp}.json`
writeFileSync(path, JSON.stringify({
  meta: {
    created_at: now.toISOString(),
    note: 'Pre-STEP-1 backup before 2024/2025 upsert restore',
    monthly_revenues_count: revs.length,
    projects_count: projs.length,
    monthly_revenues_by_year: byYear,
    monthly_revenues_total_amount: sum,
  },
  monthly_revenues: revs,
  projects_snapshot: projs,
}, null, 2))

console.log(`\n✅ 백업 저장: ${path}`)
console.log(`   파일 크기: ${(readFileSync(path).length / 1024 / 1024).toFixed(2)} MB`)
