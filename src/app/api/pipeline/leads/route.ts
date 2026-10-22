import { NextResponse } from 'next/server'
import { isSignedIn, readLeads, isLegacy } from '@/lib/pipeline/read-leads'
import { classifyLead } from '@/lib/inflow-taxonomy'

// 세일즈 › 리스트 — 검색·필터·정렬을 서버에서 하고 50행씩 보낸다 (2026-10-21, 디자인 정의 › 세일즈).
// 로그인 확인 후 서버 키로 읽는다. 문의자·연락처는 리스트에 보내지 않는다(드로어에서 따로 읽음).
export const dynamic = 'force-dynamic'

const PAGE = 50
const PROG = ['신규리드', '컨텍', '제안', '미팅', '도입직전']
const TAB_STAGES: Record<string, string[] | null> = { 전체: null, 진행: PROG, 예정: ['예정'], 도입완료: ['도입완료'], 이탈: ['이탈'], '이전 기록': null }
const COLS = 'id, customer_code, company_name, contact_person, contact_phone, contact_email, stage, priority, inquiry_date, created_at, inquiry_channel, inquiry_source, assigned_to, site_category, industry, conversion_probability, next_action, next_action_date, converted_at, notes, site_name, site_region, contact_team'

type Row = Record<string, string | null> & { id: string; company_name: string; stage: string; created_at: string }
const kst = (d = new Date()) => new Date(d.getTime() + 9 * 3600 * 1000).toISOString().slice(0, 10)

export async function POST(request: Request) {
  try {
    const p = await request.json() as { tab?: string; q?: string; assignee?: string; inflow?: string; year?: string; followIds?: string[]; sort?: 'inquiry' | 'next'; asc?: boolean; page?: number }
    if ((p as { warm?: boolean }).warm) return NextResponse.json({ ok: true }) // 깨우기 (app-shell)
    if (!(await isSignedIn())) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

    const all = await readLeads<Row>(COLS)
    const leads = all.filter(l => !isLegacy(l)), legacy = all.filter(l => isLegacy(l))
    const d = (l: Row) => l.inquiry_date || l.created_at.slice(0, 10)
    const inf = new Map(all.map(l => [l.id, classifyLead(l.inquiry_channel, l.inquiry_source)]))

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
    const pass = (l: Row) => {
      if (q && ![l.company_name, l.customer_code, l.contact_person, l.contact_email, l.industry, l.next_action, l.notes, l.site_name, l.site_region, l.contact_team]
        .some(v => (v || '').toLowerCase().includes(q)) && !(l.contact_phone || '').replace(/-/g, '').includes(q)) return false
      if (p.assignee && p.assignee !== '전체' && (p.assignee === '미배정' ? !!l.assigned_to : l.assigned_to !== p.assignee)) return false
      if (p.inflow && p.inflow !== '전체' && inf.get(l.id)!.group !== p.inflow) return false
      if (p.year && p.year !== '전체' && !d(l).startsWith(p.year)) return false
      if (follow && !follow.has(l.id)) return false
      return true
    }
    const base = leads.filter(pass), legacyBase = legacy.filter(pass)
    const counts: Record<string, number> = {}
    for (const [k, st] of Object.entries(TAB_STAGES)) counts[k] = st ? base.filter(l => st.includes(l.stage)).length : base.length
    counts['이전 기록'] = legacyBase.length
    const st = TAB_STAGES[p.tab || '전체']
    const list = p.tab === '이전 기록' ? legacyBase : st ? base.filter(l => st.includes(l.stage)) : base

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
        site_name: l.site_name, contact_team: l.contact_team,
      }
    })
    return NextResponse.json({ rows, total: list.length, page, pageSize: PAGE, counts, kpi, today })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
