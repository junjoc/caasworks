import { NextResponse } from 'next/server'
import { isSignedIn, readLeads, isLegacy } from '@/lib/pipeline/read-leads'
import { classifyLead } from '@/lib/inflow-taxonomy'

// 세일즈 › 보드 — 단계별 건수 + 열마다 앞에서 30장(더 보기로 늘림)을 한 번에 (2026-10-21, 디자인 정의 › 세일즈).
// 열 안 순서: 다음 액션 날짜 있는 카드(빠른 순) → 나머지 최근 유입순.
export const dynamic = 'force-dynamic'

const STAGES = ['신규리드', '컨텍', '예정', '제안', '미팅', '도입직전', '도입완료', '이탈']
const COLS = 'id, company_name, contact_person, contact_phone, stage, priority, inquiry_date, created_at, inquiry_channel, inquiry_source, assigned_to, industry, next_action, next_action_date, site_name, contact_team, notes'
type Row = Record<string, string | null> & { id: string; company_name: string; stage: string; created_at: string }

export async function POST(request: Request) {
  try {
    const p = await request.json() as { q?: string; assignee?: string; year?: string; limits?: Record<string, number> }
    if ((p as { warm?: boolean }).warm) return NextResponse.json({ ok: true }) // 깨우기 (app-shell)
    if (!(await isSignedIn())) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

    const leads = await readLeads<Row>(COLS)
    const d = (l: Row) => l.inquiry_date || l.created_at.slice(0, 10)
    const q = (p.q || '').trim().toLowerCase().replace(/-/g, '')
    const vis = leads.filter(l => {
      if (isLegacy(l)) return false
      if (q && ![l.company_name, l.contact_person, l.industry, l.next_action, l.site_name, l.contact_team].some(v => (v || '').toLowerCase().includes(q)) && !(l.contact_phone || '').replace(/-/g, '').includes(q)) return false
      if (p.assignee && p.assignee !== '전체' && (p.assignee === '미배정' ? !!l.assigned_to : l.assigned_to !== p.assignee)) return false
      if (p.year && p.year !== '전체' && !d(l).startsWith(p.year)) return false
      return true
    })
    const cmp = (a: Row, b: Row) => {
      const x = a.next_action_date, y = b.next_action_date
      if (x && y) return x.localeCompare(y)
      if (x || y) return x ? -1 : 1
      return d(b).localeCompare(d(a))
    }
    const cols: Record<string, { n: number; cards: unknown[] }> = {}
    for (const s of STAGES) {
      const list = vis.filter(l => l.stage === s).sort(cmp)
      cols[s] = {
        n: list.length,
        cards: list.slice(0, p.limits?.[s] ?? 30).map(l => {
          const f = classifyLead(l.inquiry_channel, l.inquiry_source)
          return { id: l.id, company_name: l.company_name, stage: l.stage, priority: l.priority, date: d(l), assigned_to: l.assigned_to, next_action: l.next_action, next_action_date: l.next_action_date, group: f.group, sub: f.sub, site_name: l.site_name, contact_team: l.contact_team }
        }),
      }
    }
    return NextResponse.json({ cols, total: vis.length })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
