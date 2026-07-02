#!/usr/bin/env node
// STEP 1 DRY-RUN — 2025 매출 엑셀 → 라이브 DB 매칭 검증.
// 파괴적 작업 없음. INSERT/DELETE 안 함. 리포트만 생성.
//
// 검증 항목:
//   1) 회사명 매칭 (customers 테이블)
//   2) 서비스 매핑 (엑셀 이름 → DB service_type)
//   3) 프로젝트 매칭 (customer + project_name + service_type)
//   4) 각 케이스별 카운트 + 총 upsert 대상

import { readFileSync, writeFileSync } from 'fs'
import { createClient } from '@supabase/supabase-js'

const env = readFileSync('.env.local', 'utf-8')
env.split('\n').forEach(l => {
  const m = l.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)
  if (m) process.env[m[1]] = m[2].replace(/^"(.*)"$/, '$1')
})
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

// 엑셀 → DB service_type 매핑
// (2026 라이브 데이터 실측 기준 22종 vs 엑셀 12종)
const SERVICE_MAP = {
  '플랫폼': '플랫폼',
  'CCTV': 'AI CCTV',            // 엑셀 'CCTV' → DB 'AI CCTV'
  '운임비': '운임비',
  '근로자관리': '근로자관리',
  'Wearable Cam': 'Wearable Cam',
  '기타': '기타',
  '안전관리': '안전관리',
  '실시간 안전관리': '실시간 안전관리',
  'Story Book': 'Story Book',
  '편집studio': '편집studio',
  '풀타임 타임랩스': '풀타임 타임랩스',
  '기타 솔루션': '기타',           // 엑셀 '기타 솔루션' → DB '기타'
  'Mobile APP': 'Mobile APP',
}

const normalize = (s) => (s || '').toString().replace(/\s+/g, '').replace(/[()（）\-·・㈜]/g, '').toLowerCase()

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

console.log('[STEP 1 DRY-RUN] 2025 매출 upsert 대상 매칭 검증\n')

// 파싱된 엑셀 데이터
const parsed = JSON.parse(readFileSync('/tmp/2025_parsed.json', 'utf-8'))
console.log(`엑셀 파싱 행: ${parsed.length}`)

// customers 매칭
const customers = await fetchAll('customers', 'id, company_name')
const custByName = {}
for (const c of customers) {
  custByName[c.company_name] = c.id
  custByName[normalize(c.company_name)] = c.id
}
console.log(`customers 총: ${customers.length}`)

// projects (2025 매칭용)
const projects = await fetchAll('projects', 'id, customer_id, project_name, service_type')
const projByKey = new Map()  // customer_id + project_name + service_type → project
for (const p of projects) {
  const k = `${p.customer_id}||${p.project_name}||${p.service_type || ''}`
  projByKey.set(k, p)
}
console.log(`projects 총: ${projects.length}`)

// 통계
let stats = {
  totalRows: parsed.length,
  emptyMonthly: 0,
  customerMissing: 0,
  serviceMissing: 0,
  projectMatched: 0,
  projectNew: 0,
  revenueInsertNew: 0,
  revenueSkipExisting: 0,
}
const custMisses = new Set()
const svcMisses = new Set()
const upsertList = []  // 실제 upsert 대상 (customer_id, project 정보, monthly)

for (const row of parsed) {
  if (!row.monthly || row.monthly.length === 0) { stats.emptyMonthly++; continue }
  const custId = custByName[row.company] || custByName[normalize(row.company)]
  if (!custId) { stats.customerMissing++; custMisses.add(row.company); continue }
  const dbSvc = SERVICE_MAP[row.service] || null
  if (row.service && !dbSvc) { stats.serviceMissing++; svcMisses.add(row.service); continue }

  // 프로젝트 매칭 (엑셀 project + 서비스 → DB 조합명)
  // DB 는 project_name 이 '{현장} - {서비스}' 형식
  const combinedName = dbSvc ? `${row.project} - ${dbSvc}` : row.project
  const key = `${custId}||${combinedName}||${dbSvc || ''}`
  const existing = projByKey.get(key)
  if (existing) {
    stats.projectMatched++
    upsertList.push({
      _match: 'existing',
      project_id: existing.id,
      customer_id: custId,
      project_name: combinedName,
      service_type: dbSvc,
      monthly: row.monthly,
      excel_row: row.row,
    })
  } else {
    stats.projectNew++
    upsertList.push({
      _match: 'new_project',
      customer_id: custId,
      project_name: combinedName,
      service_type: dbSvc,
      monthly: row.monthly,
      excel_row: row.row,
      excel_company: row.company,
    })
  }
}

// 각 upsert 예상 revenue rows
let totalRevRows = 0
for (const u of upsertList) totalRevRows += u.monthly.length

console.log('\n=== DRY-RUN 결과 ===')
console.log(`엑셀 파싱 행:              ${stats.totalRows}`)
console.log(`  월별 매출 없음(skip):    ${stats.emptyMonthly}`)
console.log(`  회사명 매칭 실패:        ${stats.customerMissing}`)
console.log(`  서비스명 매칭 실패:      ${stats.serviceMissing}`)
console.log(`  기존 프로젝트 매칭:      ${stats.projectMatched}`)
console.log(`  신규 프로젝트 예정:      ${stats.projectNew}`)
console.log(`  --------`)
console.log(`  실제 upsert 대상 (행):   ${upsertList.length}`)
console.log(`  실제 upsert monthly:     ${totalRevRows}`)

if (custMisses.size > 0) {
  console.log(`\n⚠ 회사명 매칭 실패 (${custMisses.size}종):`)
  ;[...custMisses].slice(0, 20).forEach(c => console.log(`   - ${c}`))
  if (custMisses.size > 20) console.log(`   ... 외 ${custMisses.size - 20}종`)
}
if (svcMisses.size > 0) {
  console.log(`\n⚠ 서비스 매칭 실패 (${svcMisses.size}종):`)
  ;[...svcMisses].forEach(s => console.log(`   - ${s}`))
}

// 매출 금액 검증
const byMonth = {}
for (const u of upsertList) {
  for (const m of u.monthly) {
    byMonth[m.month] = (byMonth[m.month] || 0) + m.amount
  }
}
console.log('\n=== 예상 upsert 월별 합계 (매칭 성공분만) ===')
for (let m = 1; m <= 12; m++) {
  console.log(`  ${m}월: ${(byMonth[m] || 0).toLocaleString()}`)
}
const yearTotal = Object.values(byMonth).reduce((a, b) => a + b, 0)
console.log(`  연간: ${yearTotal.toLocaleString()}`)

// 저장
const outPath = 'backups/step1-dry-run-2025.json'
writeFileSync(outPath, JSON.stringify({
  meta: { generated_at: new Date().toISOString(), stats },
  customer_misses: [...custMisses],
  service_misses: [...svcMisses],
  upsert_list: upsertList,
  monthly_totals: byMonth,
  year_total: yearTotal,
}, null, 2))
console.log(`\n📄 상세 결과: ${outPath}`)
console.log(`\n다음 단계: 위 리포트 확인 → David 님 승인 → --live 실행 (별도 스크립트)`)
