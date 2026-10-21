import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { classifyLead } from '@/lib/inflow-taxonomy'

// 세일즈 › 리스트 — 검색·필터·정렬을 서버에서 하고 50행씩 보낸다 (2026-10-21, 디자인 정의 › 세일즈).
// 로그인한 사람 권한(쿠키)으로 읽는다. 문의자·연락처는 리스트에 보내지 않는다(드로어에서 따로 읽음).
export const dynamic = 'force-dynamic'

const PAGE = 50
const PROG = ['신규리드', '컨텍', '제안', '미팅', '도입직전']
const TAB_STAGES: Record<string, string[] | null> = { 전체: null, 진행: PROG, 예정: ['예정'], 도입완료: ['도입완료'], 이탈: ['이탈'] }
const COLS = 'id, customer_code, company_name, contact_person, contact_phone, contact_email, stage, priority, inquiry_date, created_at, inquiry_channel, inquiry_source, assigned_to, site_category, industry, conversion_probability, next_action, next_action_date, converted_at, notes'

type Row = Record<string, string | null> & { id: string; company_name: string; stage: string; created_at: string }
const kst = (d = new Date()) => new Date(d.getTime() + 9 * 3600 * 1000).toISOString().slice(0, 10)

export async function POST(request: Request) {
  try {
    const p = await request.json() as { tab?: string; q?: string; assignee?: string; inflow?: string; year?: string; followIds?: string[]; sort?: 'inquiry' | 'next'; asc?: boolean; page?: number }
    const sb = createServerSupabaseClient()
    const { data: { session } } = await sb.auth.getSession()
    if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

    let leads: Row[] = []
    for (let off = 0; ; off += 1000) {
      const { data, error } = await sb.from('pipeline_leads').select(COLS).order('id').range(off, off + 999)
      if (error) throw new Error(error.message)
      leads = leads.concat((data || []) as unknown as Row[])
      if (!data || data.length < 1000) break
    }
    const d = (l: Row) => l.inquiry_date || l.created_at.slice(0, 10)
    const inf = new Map(leads.map(l => [l.id, classifyLead(l.inquiry_channel, l.inquiry_source)]))

    // KPI — 필터와 상관없이 전체 기준
    const today = kst(), year = today.slice(0, 4), m1 = `${today.slice(0, 7)}-01`
    const pmD = new Date(`${m1}T00:00:00Z`); pmD.setUTCMonth(pmD.getUTCMonth() - 1)
    const pm1 = pmD.toISOString().slice(0, 10)
    const yLeads = leads.filter(l => d(l) >= `${year}-01-01`)
    const kpi = {
      month: leads.filter(l => d(l) >= m1).length,
      prevMonth: leads.filter(l => d(l) >= pm1 && d(l) < m1).length,
      prog: leads.filter(l => PROG.includes(l.stage)).length,
      plan: leads.filter(l => l.stage === '예정').length,
      wonMonth: leads.filter(l => l.stage === '도입완료' && (l.converted_at || '') >= m1).length,
      yLeads: yLeads.length, yWon: yLeads.filter(l => l.stage === '도입완료').length,
    }

    // 탭 외 필터
    const q = (p.q || '').trim().toLowerCase().replace(/-/g, '')
    const follow = p.followIds ? new Set(p.followIds) : null
    const base = leads.filter(l => {
      if (q && ![l.company_name, l.customer_code, l.contact_person, l.contact_email, l.industry, l.next_action, l.notes]
        .some(v => (v || '').toLowerCase().includes(q)) && !(l.contact_phone || '').replace(/-/g, '').includes(q)) return false
      if (p.assignee && p.assignee !== '전체' && (p.assignee === '미배정' ? !!l.assigned_to : l.assigned_to !== p.assignee)) return false
      if (p.inflow && p.inflow !== '전체' && inf.get(l.id)!.group !== p.inflow) return false
      if (p.year && p.year !== '전체' && !d(l).startsWith(p.year)) return false
      if (follow && !follow.has(l.id)) return false
      return true
    })
    const counts: Record<string, number> = {}
    for (const [k, st] of Object.entries(TAB_STAGES)) counts[k] = st ? base.filter(l => st.includes(l.stage)).length : base.length
    const st = TAB_STAGES[p.tab || '전체']
    const list = st ? base.filter(l => st.includes(l.stage)) : base

    const asc = !!p.asc
    if (p.sort === 'next') {
      // 다음 액션 날짜 — 비어 있는 행은 방향과 상관없이 맨 뒤
      list.sort((a, b) => {
        const x = a.next_action_date, y = b.next_action_date
        if (!x || !y) return x ? -1 : y ? 1 : 0
        return asc ? x.localeCompare(y) : y.localeCompare(x)
      })
    } else {
      list.sort((a, b) => (asc ? 1 : -1) * (d(a).localeCompare(d(b)) || a.created_at.localeCompare(b.created_at)))
    }

    const page = Math.max(0, Math.min(p.page || 0, Math.floor(Math.max(list.length - 1, 0) / PAGE)))
    const rows = list.slice(page * PAGE, page * PAGE + PAGE).map(l => {
      const f = inf.get(l.id)!
      return {
        id: l.id, company_name: l.company_name, stage: l.stage, priority: l.priority, date: d(l),
        assigned_to: l.assigned_to, site_category: l.site_category, industry: l.industry, conversion_probability: l.conversion_probability,
        next_action: l.next_action, next_action_date: l.next_action_date, group: f.group, sub: f.sub,
      }
    })
    return NextResponse.json({ rows, total: list.length, page, pageSize: PAGE, counts, kpi, today })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
