import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
const env = readFileSync('.env.local', 'utf-8')
env.split('\n').forEach(l => { const m = l.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/); if (m) process.env[m[1]] = m[2].replace(/^"(.*)"$/, '$1') })
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
const TYPES = ['QUOTATION', 'PROPOSAL', 'MEETING', 'DEMO']
const { data: leads } = await sb.from('pipeline_leads').select('id, company_name, converted_at, updated_at').eq('stage', '도입완료')
const ids = leads.map(l => l.id)
const { data: hist } = await sb.from('pipeline_history').select('lead_id, changed_at').eq('field_changed', 'stage').eq('new_value', '도입완료')
const convAt = new Map()
for (const h of hist || []) if (!convAt.has(h.lead_id) || h.changed_at > convAt.get(h.lead_id)) convAt.set(h.lead_id, h.changed_at)
let acts = []
for (let i = 0; i < ids.length; i += 100) {
  const { data } = await sb.from('activity_logs').select('lead_id, activity_type, title, performed_at').in('lead_id', ids.slice(i, i + 100)).in('activity_type', TYPES)
  acts = acts.concat(data || [])
}
const noRef = leads.filter(l => !convAt.get(l.id) && !l.converted_at).length
const fu = new Map()
for (const l of leads) {
  const t = convAt.get(l.id) || l.converted_at
  if (!t) continue
  const after = acts.filter(a => a.lead_id === l.id && a.performed_at > t)
  if (after.length) fu.set(l.id, { l, after })
}
console.log(`도입완료 ${leads.length}건 / 도입 시점 모름 ${noRef}건 / 추가 진행 ${fu.size}건`)
for (const { l, after } of [...fu.values()].slice(0, 10)) console.log(`  ${l.company_name.slice(0, 16).padEnd(16)} ${after.map(a => `${a.performed_at.slice(0, 10)} ${a.activity_type}`).join(', ')}`)
