import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { isSignedIn } from '@/lib/pipeline/read-leads'

// 리드 한 건 — 드로어·상세 페이지가 한 번에 받는다 (2026-10-21, 디자인 정의 › 세일즈 › 리드 상세).
// 리드 + 타임라인(활동 + 단계·담당·다음 액션 변경) + 담당자 목록 + 연결 고객사 + VoC. 이전엔 화면이 5~8번 따로 읽었다.
export const dynamic = 'force-dynamic'

export type TimelineItem = {
  id: string; kind: 'act' | 'stage' | 'assign' | 'next' | 'field'; at: string; by: string; byId: string | null
  type?: string; title?: string | null; desc?: string | null; field?: string; old?: string | null; new?: string | null
}

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  try {
    if (params.id === 'warm') return NextResponse.json({ ok: true }) // 깨우기 (app-shell)
    if (!(await isSignedIn())) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
    const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)
    const id = params.id
    const [l, h, a, u] = await Promise.all([
      sb.from('pipeline_leads').select('*').eq('id', id).single(),
      sb.from('pipeline_history').select('id, field_changed, old_value, new_value, changed_by, changed_at').eq('lead_id', id),
      sb.from('activity_logs').select('id, activity_type, title, description, performed_by, performed_at').eq('lead_id', id),
      sb.from('users').select('id, name, is_active').order('name'),
    ])
    if (l.error || !l.data) return NextResponse.json({ error: l.error?.message || 'not found' }, { status: 404 })
    const lead = l.data
    const uname = new Map((u.data || []).map(x => [x.id, x.name as string]))
    const kindOf = (f: string): TimelineItem['kind'] => (f === 'stage' ? 'stage' : f === 'assigned_to' ? 'assign' : f === 'next_action' ? 'next' : 'field')
    const timeline: TimelineItem[] = [
      ...(a.data || []).map(x => ({ id: x.id, kind: 'act' as const, at: x.performed_at, by: uname.get(x.performed_by) || '시스템', byId: x.performed_by, type: x.activity_type, title: x.title, desc: x.description })),
      ...(h.data || []).map(x => ({ id: x.id, kind: kindOf(x.field_changed), at: x.changed_at, by: uname.get(x.changed_by) || '시스템', byId: x.changed_by, field: x.field_changed, old: x.old_value, new: x.new_value })),
    ].sort((x, y) => y.at.localeCompare(x.at))

    const [cust, voc] = lead.customer_id
      ? await Promise.all([
          sb.from('customers').select('id, company_name, customer_code').eq('id', lead.customer_id).single(),
          sb.from('voc_tickets').select('id, ticket_number, title, status, priority, category, created_at').eq('customer_id', lead.customer_id).order('created_at', { ascending: false }).limit(10),
        ])
      : [{ data: null }, { data: [] }]

    return NextResponse.json({
      lead, timeline,
      users: (u.data || []).filter(x => x.is_active).map(x => ({ id: x.id, name: x.name })),
      customer: cust.data, voc: voc.data || [],
    })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
