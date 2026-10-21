#!/usr/bin/env node
// 재정렬된 프로젝트 sample 조회 — 새 sheet_no 로 조회
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'

const env = readFileSync('.env.local', 'utf-8')
env.split('\n').forEach(l => { const m = l.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/); if (m) process.env[m[1]] = m[2].replace(/^"(.*)"$/, '$1') })
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

// dry-run 결과 나온 큰 이동 sample: 새 sheet_no
const newSheetNos = [147, 164, 299, 411, 412, 390, 389, 250, 251, 249]

console.log('# 재정렬된 프로젝트 sample (새 sheet_no 기준)\n')
for (const n of newSheetNos) {
  const { data } = await sb.from('projects')
    .select('sheet_no, project_name, customer:customers(company_name)')
    .eq('sheet_no', n)
    .eq('source', 'excel_backfill')
  if (!data || data.length === 0) { console.log(`sheet_no=${n}: not found`); continue }
  for (const p of data) {
    console.log(`  sheet_no=${String(p.sheet_no).padStart(4)}  ${p.customer?.company_name?.substring(0,18).padEnd(18)}  ${p.project_name?.substring(0,55)}`)
  }
}
