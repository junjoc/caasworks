import { readFileSync } from 'fs'
import { createClient } from '@supabase/supabase-js'
const env = readFileSync('.env.local', 'utf-8')
env.split('\n').forEach(l => { const m = l.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/); if (m) process.env[m[1]] = m[2].replace(/^"(.*)"$/, '$1') })
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

// 테스트: customers 에 dummy row insert → 삭제 → audit_logs 확인
const testName = `__AUDIT_TEST_${Date.now()}`
const { data: ins } = await sb.from('customers').insert({ company_name: testName, status: 'active' }).select('id').single()
console.log('Inserted:', ins?.id)
if (ins) {
  await sb.from('customers').update({ company_name: testName + '_updated' }).eq('id', ins.id)
  await sb.from('customers').delete().eq('id', ins.id)
}
// audit_logs 확인
const { data: logs } = await sb.from('audit_logs')
  .select('entity_type, entity_id, action, performed_at')
  .eq('entity_id', ins?.id)
  .order('performed_at', { ascending: true })
console.log(`audit_logs 기록: ${logs?.length}건`)
logs?.forEach(l => console.log(`  ${l.action} · ${l.entity_type} · ${l.performed_at}`))
