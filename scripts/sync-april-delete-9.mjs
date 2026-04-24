// 시트에 없는 4월 매출 9건 삭제 (user 승인)
import { readFileSync } from 'fs'
import { createClient } from '@supabase/supabase-js'
const env = readFileSync('.env.local', 'utf-8')
env.split('\n').forEach(l => { const m = l.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/); if (m) process.env[m[1]] = m[2].replace(/^"(.*)"$/, '$1') })
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
const LIVE = process.argv.includes('--live')

// 삭제 대상 — (company_name pattern, sheet_no, expected_amount)
const TARGETS = [
  ['인종합건설', 1255, 360000],
  ['인종합건설', 1256, 720000],
  ['인종합건설', 1257, 324000],
  ['인종합건설', 1258, 324000],
  ['인종합건설', 1259, 14000],
  ['한국교통정책연구원', 1308.4, 200000],
  ['한국교통정책연구원', 1310.2, 300000],
  ['한국교통정책연구원', 1310.3, 300000],
  ['한국교통정책연구원', 1310.4, 35000],
]

console.log(`[Delete April 9] ${LIVE ? 'LIVE' : 'DRY-RUN'}\n`)
let deleted = 0, skipped = 0
for (const [company, sheetNo, expAmt] of TARGETS) {
  const { data: cust } = await sb.from('customers').select('id, company_name').ilike('company_name', `%${company}%`).maybeSingle()
  if (!cust) { console.log(`  ❌ ${company} not found`); continue }
  const { data: proj } = await sb.from('projects').select('id, project_name').eq('customer_id', cust.id).eq('sheet_no', sheetNo).maybeSingle()
  if (!proj) { console.log(`  ❌ NO ${sheetNo} project not found`); continue }
  const { data: rev } = await sb.from('monthly_revenues').select('id, amount').eq('project_id', proj.id).eq('year', 2026).eq('month', 4).maybeSingle()
  if (!rev) { console.log(`  ⚠ NO ${sheetNo}: 4월 매출 이미 없음`); skipped++; continue }
  const cur = Number(rev.amount)
  if (cur !== expAmt) {
    console.log(`  ⚠ NO ${sheetNo}: 값 다름 (예상 ${expAmt}, 실제 ${cur}) — skip 안전상`)
    skipped++
    continue
  }
  console.log(`  ${LIVE ? '✅ DELETE' : '→ DELETE'} NO ${sheetNo} ${cust.company_name} ${cur.toLocaleString()}원 (${proj.project_name})`)
  if (LIVE) {
    const { error } = await sb.from('monthly_revenues').delete().eq('id', rev.id)
    if (error) console.log(`     ❌ ${error.message}`)
    else deleted++
  }
}
console.log(`\n[Done] ${LIVE ? `삭제 ${deleted}/9` : 'DRY-RUN'}, skip ${skipped}`)
