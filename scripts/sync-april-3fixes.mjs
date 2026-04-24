#!/usr/bin/env node
// 4월 3건 한국교통정책연구원 수정 — 시트 기준 동기화
// - NO 1309.1: DB 200k → 시트 0 (삭제)
// - NO 1309.2: DB 200k → 시트 300k (업데이트)
// - NO 1310:   DB 100k → 시트 300k (업데이트)

import { readFileSync } from 'fs'
import { createClient } from '@supabase/supabase-js'

const env = readFileSync('.env.local', 'utf-8')
env.split('\n').forEach(l => {
  const m = l.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)
  if (m) process.env[m[1]] = m[2].replace(/^"(.*)"$/, '$1')
})

const LIVE = process.argv.includes('--live')
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

// 변경 대상: [sheet_no, targetAmount (시트 값)]. 0 이면 DB 행 삭제.
const CHANGES = [
  { sheet_no: 1309.1, sheetAmount: 0 },
  { sheet_no: 1309.2, sheetAmount: 300000 },
  { sheet_no: 1310,   sheetAmount: 300000 },
]
const MONTH = 4
const YEAR = 2026
const COMPANY_PATTERN = '한국교통정책연구원'

console.log(`[April Fix] ${LIVE ? 'LIVE' : 'DRY-RUN'}`)

// 회사 찾기
const { data: cust, error: custErr } = await sb.from('customers')
  .select('id, company_name')
  .ilike('company_name', `%${COMPANY_PATTERN}%`)
  .maybeSingle()
if (custErr || !cust) {
  console.error('❌ customer not found:', custErr?.message)
  process.exit(1)
}
console.log(`  고객: ${cust.company_name} (${cust.id})`)

for (const c of CHANGES) {
  // 해당 project 찾기
  const { data: proj } = await sb.from('projects')
    .select('id, sheet_no, project_name')
    .eq('customer_id', cust.id)
    .eq('sheet_no', c.sheet_no)
    .maybeSingle()
  if (!proj) {
    console.log(`  ⚠ NO ${c.sheet_no}: project 없음`)
    continue
  }

  // 현재 4월 매출
  const { data: rev } = await sb.from('monthly_revenues')
    .select('id, amount')
    .eq('project_id', proj.id)
    .eq('year', YEAR)
    .eq('month', MONTH)
    .maybeSingle()

  const cur = rev ? Number(rev.amount) : null
  const target = c.sheetAmount

  console.log(`\n  NO ${c.sheet_no} | ${proj.project_name}`)
  console.log(`    현재 DB: ${cur === null ? '(없음)' : cur.toLocaleString() + '원'}`)
  console.log(`    시트 값: ${target.toLocaleString()}원`)

  if (cur === target) {
    console.log(`    ✓ 이미 일치, skip`)
    continue
  }

  if (!LIVE) {
    console.log(`    → DRY-RUN: ${rev ? (target === 0 ? 'DELETE' : 'UPDATE → ' + target.toLocaleString()) : 'INSERT ' + target.toLocaleString()}`)
    continue
  }

  // LIVE
  if (target === 0 && rev) {
    const { error } = await sb.from('monthly_revenues').delete().eq('id', rev.id)
    console.log(error ? `    ❌ DELETE: ${error.message}` : `    ✅ DELETE`)
  } else if (rev) {
    const { error } = await sb.from('monthly_revenues').update({ amount: target }).eq('id', rev.id)
    console.log(error ? `    ❌ UPDATE: ${error.message}` : `    ✅ UPDATE → ${target.toLocaleString()}`)
  } else if (target > 0) {
    const { error } = await sb.from('monthly_revenues').insert({
      customer_id: cust.id, project_id: proj.id,
      year: YEAR, month: MONTH, amount: target, is_confirmed: true,
    })
    console.log(error ? `    ❌ INSERT: ${error.message}` : `    ✅ INSERT ${target.toLocaleString()}`)
  }
}

console.log(`\n[${LIVE ? 'Done' : 'DRY-RUN'}] 완료`)
