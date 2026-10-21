#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
const env = readFileSync('.env.local', 'utf-8')
env.split('\n').forEach(l => { const m = l.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/); if (m) process.env[m[1]] = m[2].replace(/^"(.*)"$/, '$1') })
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

console.log('# sheet_year=2026 프로젝트 상단 20 (sheet_no DESC)\n')
const { data: top } = await sb.from('projects')
  .select('sheet_no, project_name, customer:customers(company_name)')
  .eq('sheet_year', 2026)
  .order('sheet_no', { ascending: false })
  .limit(20)
for (const p of top || []) {
  console.log(`  sheet_no=${String(p.sheet_no).padStart(7)}  ${(p.customer?.company_name||'').substring(0,15).padEnd(15)}  ${(p.project_name||'').substring(0,60)}`)
}

// 통계
const { count } = await sb.from('projects')
  .select('*', { count: 'exact', head: true })
  .eq('sheet_year', 2026)
console.log(`\n총 sheet_year=2026: ${count}`)

// sheet_no > 2000 인 것 (아직 seq 값인지 확인)
const { data: bigSeq, count: bigCount } = await sb.from('projects')
  .select('sheet_no', { count: 'exact' })
  .eq('sheet_year', 2026)
  .gt('sheet_no', 2000)
console.log(`sheet_no > 2000 인 것: ${bigCount} (0 이어야 정상. 있으면 update 안된 것)`)
if (bigSeq && bigSeq.length) {
  console.log(`  샘플: ${bigSeq.slice(0, 5).map(p => p.sheet_no).join(', ')}`)
}
