import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// "추가 진행" 리드: 도입완료 이후에 견적/제안/미팅/데모 활동이 기록된 리드.
// 도입 시점은 pipeline_history → audit_logs → 계약체결 활동 → converted_at 순으로 찾는다
// (audit_logs 는 브라우저 권한으로 못 읽어서 서버에서 계산).

export const dynamic = 'force-dynamic'

const FOLLOWUP_TYPES = ['QUOTATION', 'PROPOSAL', 'MEETING', 'DEMO']

export async function GET() {
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  )

  const { data: leads, error } = await sb.from('pipeline_leads').select('id, converted_at').eq('stage', '도입완료')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  const ids = (leads || []).map(l => l.id)
  if (ids.length === 0) return NextResponse.json({ lead_ids: [] })

  const convAt = new Map<string, string>()
  const keepLatest = (id: string, t: string | null | undefined) => {
    if (t && (!convAt.has(id) || t > convAt.get(id)!)) convAt.set(id, t)
  }

  const [hist, aud] = await Promise.all([
    sb.from('pipeline_history').select('lead_id, changed_at').eq('field_changed', 'stage').eq('new_value', '도입완료'),
    sb.from('audit_logs').select('entity_id, performed_at').eq('entity_type', 'pipeline_leads')
      .eq('changes->after->>stage', '도입완료').neq('changes->before->>stage', '도입완료'),
  ])
  for (const h of hist.data || []) keepLatest(h.lead_id, h.changed_at)
  for (const a of aud.data || []) keepLatest(a.entity_id, a.performed_at)

  // .in() URL 길이 제한 때문에 100개씩
  const chunks: string[][] = []
  for (let i = 0; i < ids.length; i += 100) chunks.push(ids.slice(i, i + 100))
  const actResults = await Promise.all(chunks.map(c =>
    sb.from('activity_logs').select('lead_id, activity_type, performed_at')
      .in('lead_id', c).in('activity_type', [...FOLLOWUP_TYPES, 'CONTRACT'])
  ))
  const acts = actResults.flatMap(r => r.data || [])

  for (const a of acts) if (a.activity_type === 'CONTRACT' && !convAt.has(a.lead_id)) keepLatest(a.lead_id, a.performed_at)
  for (const l of leads || []) if (!convAt.has(l.id)) keepLatest(l.id, l.converted_at)

  const followup = new Set<string>()
  for (const a of acts) {
    if (!FOLLOWUP_TYPES.includes(a.activity_type)) continue
    const t = convAt.get(a.lead_id)
    if (t && a.performed_at > t) followup.add(a.lead_id)
  }
  return NextResponse.json({ lead_ids: Array.from(followup) })
}
