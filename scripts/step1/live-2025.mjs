#!/usr/bin/env node
// STEP 1 LIVE — 2025 매출 복구.
// - 신규 projects INSERT (source='excel_backfill')
// - monthly_revenues INSERT (year=2025 만, is_confirmed=true)
// - 기존 2026 데이터 절대 안 건드림
// - DELETE 없음

import { readFileSync } from 'fs'
import { createClient } from '@supabase/supabase-js'

const env = readFileSync('.env.local', 'utf-8')
env.split('\n').forEach(l => {
  const m = l.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)
  if (m) process.env[m[1]] = m[2].replace(/^"(.*)"$/, '$1')
})
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

const YEAR = 2025

console.log(`[STEP 1 LIVE] 2025 매출 복구 시작\n`)

// DRY-RUN 결과 로드
const dry = JSON.parse(readFileSync('backups/step1-dry-run-2025.json', 'utf-8'))
const upsertList = dry.upsert_list
console.log(`upsert list: ${upsertList.length}건`)
const existing = upsertList.filter(x => x._match === 'existing')
const newProj = upsertList.filter(x => x._match === 'new_project')
console.log(`  기존 project 매칭: ${existing.length}`)
console.log(`  신규 project 생성 예정: ${newProj.length}`)

// STEP A. 기존 프로젝트에 대한 2025 매출 이미 있는지 확인 (중복 방지)
console.log(`\n[Step A] 기존 project 의 2025 매출 존재 여부 확인...`)
const existingProjIds = existing.map(x => x.project_id)
const chunks = []
for (let i = 0; i < existingProjIds.length; i += 500) chunks.push(existingProjIds.slice(i, i + 500))
const existingRevKeys = new Set()  // `${project_id}|${month}`
for (const chunk of chunks) {
  const { data, error } = await sb.from('monthly_revenues')
    .select('project_id, month').eq('year', YEAR).in('project_id', chunk)
  if (error) { console.log(`  ❌ ${error.message}`); process.exit(1) }
  data.forEach(r => existingRevKeys.add(`${r.project_id}|${r.month}`))
}
console.log(`  이미 있는 monthly rev (project, month): ${existingRevKeys.size}`)

// STEP B. 신규 projects INSERT
console.log(`\n[Step B] 신규 projects INSERT (${newProj.length}건)...`)
const projectInsertMap = new Map()  // excel row idx → newly created project_id
let projInserted = 0
const projBatchSize = 100
for (let i = 0; i < newProj.length; i += projBatchSize) {
  const slice = newProj.slice(i, i + projBatchSize)
  const batch = slice.map(p => ({
    customer_id: p.customer_id,
    project_name: p.project_name,
    service_type: p.service_type,
    status: 'active',
    source: 'excel_backfill',
  }))
  const { data, error } = await sb.from('projects').insert(batch).select('id')
  if (error) {
    console.log(`  ❌ batch ${i}: ${error.message}`)
    continue
  }
  // 순서 보장 — PostgREST 는 입력 순서대로 반환
  data.forEach((row, j) => {
    projectInsertMap.set(slice[j].excel_row, row.id)
  })
  projInserted += data.length
  process.stdout.write(`\r  ${projInserted}/${newProj.length}`)
}
console.log(`\n  ✅ 신규 projects: ${projInserted}/${newProj.length}`)

// STEP C. monthly_revenues INSERT
console.log(`\n[Step C] monthly_revenues INSERT (year=${YEAR})...`)
const revPayload = []
let skippedByExisting = 0
for (const u of upsertList) {
  const projId = u._match === 'existing' ? u.project_id : projectInsertMap.get(u.excel_row)
  if (!projId) continue  // 신규 project insert 실패 케이스
  for (const m of u.monthly) {
    const key = `${projId}|${m.month}`
    if (existingRevKeys.has(key)) { skippedByExisting++; continue }
    revPayload.push({
      customer_id: u.customer_id,
      project_id: projId,
      year: YEAR,
      month: m.month,
      amount: m.amount,
      is_confirmed: true,
    })
  }
}
console.log(`  총 ${revPayload.length}건 대기 (중복 skip: ${skippedByExisting})`)

let revInserted = 0
const revBatchSize = 500
for (let i = 0; i < revPayload.length; i += revBatchSize) {
  const batch = revPayload.slice(i, i + revBatchSize)
  const { error } = await sb.from('monthly_revenues').insert(batch)
  if (error) console.log(`\n  ❌ rev batch ${i}: ${error.message}`)
  else revInserted += batch.length
  process.stdout.write(`\r  ${revInserted}/${revPayload.length}`)
}
console.log(`\n  ✅ monthly_revenues: ${revInserted}/${revPayload.length}`)

// STEP D. 검증
console.log(`\n[Step D] 실행 후 검증...`)
const { data: verify } = await sb.from('monthly_revenues').select('amount, month').eq('year', YEAR)
console.log(`  DB monthly_revenues (year=${YEAR}) 행 수: ${verify.length}`)
const byMonth = {}
verify.forEach(r => { byMonth[r.month] = (byMonth[r.month] || 0) + Number(r.amount) })
console.log(`  월별 합계 (DB):`)
for (let m = 1; m <= 12; m++) {
  console.log(`    ${m}월: ${(byMonth[m] || 0).toLocaleString()}`)
}
const yearTotal = Object.values(byMonth).reduce((a, b) => a + b, 0)
console.log(`  연간 합계 (DB): ${yearTotal.toLocaleString()}`)
console.log(`  엑셀 예상:      ${dry.year_total.toLocaleString()}`)
console.log(`  차이:           ${(yearTotal - dry.year_total).toLocaleString()}`)

console.log(`\n[Done] STEP 1 (2025) 완료`)
