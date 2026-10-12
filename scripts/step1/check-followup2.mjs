import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
const env = readFileSync('.env.local', 'utf-8')
env.split('\n').forEach(l => { const m = l.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/); if (m) process.env[m[1]] = m[2].replace(/^"(.*)"$/, '$1') })
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
const TYPES = ['QUOTATION', 'PROPOSAL', 'MEETING', 'DEMO']
const { data: leads } = await sb.from('pipeline_leads').select('id, company_name, converted_at, inquiry_date').eq('stage', '도입완료')
const ids = leads.map(l => l.id)
const conv = new Map(), src = new Map()
const put = (id, t, s) => { if (t && (!conv.has(id) || t > conv.get(id))) { conv.set(id, t); src.set(id, s) } }
const { data: hist } = await sb.from('pipeline_history').select('lead_id, changed_at').eq('field_changed', 'stage').eq('new_value', '도입완료')
for (const h of hist || []) put(h.lead_id, h.changed_at, 'history')
const { data: aud } = await sb.from('audit_logs').select('entity_id, performed_at').eq('entity_type', 'pipeline_leads').eq('changes->after->>stage', '도입완료').neq('changes->before->>stage', '도입완료')
for (const a of aud || []) put(a.entity_id, a.performed_at, 'audit')
let acts = []
for (let i = 0; i < ids.length; i += 100) {
  const { data } = await sb.from('activity_logs').select('lead_id, activity_type, performed_at').in('lead_id', ids.slice(i, i + 100))
  acts = acts.concat(data || [])
}
for (const a of acts.filter(a => a.activity_type === 'CONTRACT')) if (!conv.has(a.lead_id)) put(a.lead_id, a.performed_at, 'contract')
for (const l of leads) if (!conv.has(l.id) && l.converted_at) put(l.id, l.converted_at, 'converted_at')
const by = {}; for (const v of src.values()) by[v] = (by[v] || 0) + 1
const unknown = leads.filter(l => !conv.has(l.id))
console.log(`도입완료 ${leads.length}건, 시점 확인 ${conv.size}건`, by, `/ 모름 ${unknown.length}건`)
const unkActs = acts.filter(a => unknown.some(u => u.id === a.lead_id) && TYPES.includes(a.activity_type))
console.log(`시점 모르는 리드에 달린 견적/제안/미팅/데모 활동: ${unkActs.length}건 (리드 ${new Set(unkActs.map(a => a.lead_id)).size}개)`)
const fu = leads.filter(l => conv.has(l.id) && acts.some(a => a.lead_id === l.id && TYPES.includes(a.activity_type) && a.performed_at > conv.get(l.id)))
console.log(`추가 진행: ${fu.length}건 → ${fu.map(l => l.company_name).join(', ')}`)
console.log(`모름 리드 유입일 범위: ${unknown.map(u => u.inquiry_date).filter(Boolean).sort()[0]} ~ ${unknown.map(u => u.inquiry_date).filter(Boolean).sort().pop()}`)
