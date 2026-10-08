import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
const env = readFileSync(process.argv[2], 'utf-8')
env.split('\n').forEach(l => { const m = l.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/); if (m) process.env[m[1]] = m[2].replace(/^"(.*)"$/, '$1') })
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
// 1) pipeline_history: 도입완료에서 다른 단계로 바뀐 기록
const { data: hist } = await sb.from('pipeline_history')
  .select('lead_id, old_value, new_value, changed_by, changed_at')
  .eq('field_changed', 'stage').eq('old_value', '도입완료')
  .order('changed_at', { ascending: false }).limit(30)
console.log(`pipeline_history 도입완료→다른단계: ${hist?.length ?? 0}건`)
for (const h of hist || []) console.log(`  ${h.changed_at?.slice(0,16)}  → ${h.new_value}  by=${h.changed_by ? h.changed_by.slice(0,8) : 'null(자동)'}`)
// 2) 같은 시각 활동 기록 여부
const { data: users } = await sb.from('users').select('id,name')
const uname = id => users?.find(u => u.id === id)?.name || id
for (const h of (hist || []).slice(0, 10)) {
  const t = new Date(h.changed_at)
  const from = new Date(t.getTime() - 60000).toISOString(), to = new Date(t.getTime() + 60000).toISOString()
  const { data: acts } = await sb.from('activity_logs').select('activity_type, title').eq('lead_id', h.lead_id).gte('performed_at', from).lte('performed_at', to)
  console.log(`  [${h.changed_at?.slice(0,16)}] ${uname(h.changed_by)} → ${h.new_value} | 같은 시각 활동: ${(acts||[]).map(a=>a.activity_type).join(',') || '없음'}`)
}
