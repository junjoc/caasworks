import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
const env = readFileSync('.env.local', 'utf-8')
env.split('\n').forEach(l => { const m = l.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/); if (m) process.env[m[1]] = m[2].replace(/^"(.*)"$/, '$1') })
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
// changes->before->>stage = 도입완료 AND changes->after->>stage <> 도입완료
let all = []
for (let off = 0; ; off += 1000) {
  const { data, error } = await sb.from('audit_logs')
    .select('entity_id, performed_at, changes')
    .eq('entity_type', 'pipeline_leads').eq('action', 'update')
    .eq('changes->before->>stage', '도입완료')
    .neq('changes->after->>stage', '도입완료')
    .order('performed_at', { ascending: false })
    .range(off, off + 999)
  if (error) { console.log('ERR', error.message); break }
  all = all.concat(data); if (data.length < 1000) break
}
console.log(`audit_logs 도입완료 → 다른 단계: ${all.length}건`)
const byNew = {}
for (const r of all) { const s = r.changes.after.stage; byNew[s] = (byNew[s] || 0) + 1 }
console.log('  새 단계 분포:', byNew)
for (const r of all.slice(0, 15)) {
  const b = r.changes.before, a = r.changes.after
  // 같이 바뀐 필드 (원인 추정용)
  const changed = Object.keys(a).filter(k => JSON.stringify(a[k]) !== JSON.stringify(b[k]) && k !== 'updated_at')
  console.log(`  ${r.performed_at?.slice(0,16)}  ${a.company_name?.slice(0,14).padEnd(14)}  도입완료→${a.stage}  변경필드: ${changed.join(',')}`)
}
