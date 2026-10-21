import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { unstable_cache } from 'next/cache'
import { classifyLead, INFLOW_ORDER } from '@/lib/inflow-taxonomy'

// 대시보드 데이터 — 위젯마다 따로 읽던 19번의 조회를 서버에서 한 번에 (2026-10-21, 디자인 정의 › 대시보드).
// 사람별 값(내 담당 리드)은 담당자별로 모두 담아 보내고 화면이 고른다 → 캐시 하나로 전원. 1분 캐시.
export const dynamic = 'force-dynamic'

async function readAll<T>(q: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> {
  let all: T[] = []
  for (let off = 0; ; off += 1000) {
    const { data, error } = await q(off, off + 999)
    if (error) throw new Error(error.message)
    all = all.concat(data || [])
    if (!data || data.length < 1000) break
  }
  return all
}

const kst = (d = new Date()) => new Date(d.getTime() + 9 * 3600 * 1000).toISOString().slice(0, 10)
const OPEN = ['신규리드', '컨텍', '제안', '미팅', '도입직전', '예정']

type Lead = { id: string; company_name: string; stage: string; inquiry_date: string | null; created_at: string; inquiry_channel: string | null; inquiry_source: string | null; assigned_to: string | null; next_action: string | null; next_action_date: string | null; conversion_probability: string | null; converted_at: string | null }
type Inv = { total: number; year: number; month: number; status: string; tax_invoice_issued_at: string | null; paid_at: string | null; due_date: string | null; customer: { company_name: string } | null }

async function build() {
  const t0 = Date.now()
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)
  const today = kst()
  const year = Number(today.slice(0, 4)), month = Number(today.slice(5, 7))
  const m1 = `${today.slice(0, 7)}-01`
  const pm = month === 1 ? { y: year - 1, m: 12 } : { y: year, m: month - 1 }
  const pm1 = `${pm.y}-${String(pm.m).padStart(2, '0')}-01`
  const yday = kst(new Date(Date.now() - 86400000))
  const weekEnd = kst(new Date(Date.now() + 6 * 86400000))
  const ago90 = kst(new Date(Date.now() - 90 * 86400000))

  const [leads, users, revRows, monthRevs, invs, adMonth, adPrev] = await Promise.all([
    readAll<Lead>((a, b) => sb.from('pipeline_leads').select('id, company_name, stage, inquiry_date, created_at, inquiry_channel, inquiry_source, assigned_to, next_action, next_action_date, conversion_probability, converted_at').order('id').range(a, b)),
    readAll<{ id: string; name: string }>((a, b) => sb.from('users').select('id, name').order('id').range(a, b)),
    readAll<{ month: number; total: number }>((a, b) => sb.from('v_revenue_monthly').select('month, total').eq('year', year).range(a, b)),
    readAll<{ amount: number; customer: { company_name: string } | null }>((a, b) => sb.from('monthly_revenues').select('amount, customer:customers(company_name)').eq('year', year).eq('month', month).order('id').range(a, b) as never),
    readAll<Inv>((a, b) => sb.from('invoices').select('total, year, month, status, tax_invoice_issued_at, paid_at, due_date, customer:customers(company_name)').order('id').range(a, b) as never),
    readAll<{ cost: number; ga_visits: number }>((a, b) => sb.from('ad_performance').select('cost, ga_visits').gte('date', m1).lte('date', today).order('id').range(a, b)),
    readAll<{ cost: number }>((a, b) => sb.from('ad_performance').select('cost').gte('date', pm1).lt('date', m1).order('id').range(a, b)),
  ])
  const uname = new Map(users.map(u => [u.id, u.name]))
  const d = (l: Lead) => l.inquiry_date || l.created_at.slice(0, 10)
  const short = (s: string | null) => (s ? s.slice(5).replace('-', '.') : '')

  // 매출
  const rev = Array.from({ length: 12 }, (_, i) => [i + 1, Math.round(Number(revRows.find(r => r.month === i + 1)?.total || 0))] as [number, number])
  const byCust = new Map<string, number>()
  for (const r of monthRevs) { const k = r.customer?.company_name || '?'; byCust.set(k, (byCust.get(k) || 0) + Number(r.amount)) }
  const topCust = Array.from(byCust.entries()).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([k, v]) => [k, Math.round(v)])

  // 미납 · 청구
  const unp = invs.filter(i => i.tax_invoice_issued_at && !i.paid_at && i.status !== 'cancelled')
  const ub = new Map<string, number>()
  for (const i of unp) { const k = i.customer?.company_name || '?'; ub.set(k, (ub.get(k) || 0) + Number(i.total)) }
  const thisInv = invs.filter(i => i.year === year && i.month === month)

  // 리드
  const yLeads = leads.filter(l => d(l) >= `${year}-01-01`)
  const stages: Record<string, number> = {}
  for (const l of yLeads) stages[l.stage] = (stages[l.stage] || 0) + 1
  const openLeads = leads.filter(l => OPEN.includes(l.stage))
  const pre = leads.filter(l => l.stage === '도입직전' || l.stage === '예정').sort((a, b) => d(b).localeCompare(d(a)))
  const week = openLeads.filter(l => l.next_action_date && l.next_action_date >= today && l.next_action_date <= weekEnd).sort((a, b) => a.next_action_date!.localeCompare(b.next_action_date!))
  const overdue = openLeads.filter(l => l.next_action_date && l.next_action_date < today)
  const monthLeads = leads.filter(l => d(l) >= m1)
  const inflowCount = new Map<string, number>()
  for (const l of monthLeads) { const g = classifyLead(l.inquiry_channel, l.inquiry_source).group; inflowCount.set(g, (inflowCount.get(g) || 0) + 1) }
  // 담당자별 내 리드 (진행 중, 최근 유입순 5개)
  const mine: Record<string, { open: number; list: [string, string, string][] }> = {}
  for (const l of [...openLeads].sort((a, b) => d(b).localeCompare(d(a)))) {
    if (!l.assigned_to) continue
    const m = mine[l.assigned_to] ||= { open: 0, list: [] }
    m.open++
    if (m.list.length < 5) m.list.push([l.company_name, l.stage, short(d(l))])
  }

  return {
    today, year, month, ms: 0,
    rev,
    topCust: { n: byCust.size, list: topCust },
    unpaid: { sum: Math.round(unp.reduce((s, i) => s + Number(i.total), 0)), n: unp.length, customers: new Set(unp.map(i => i.customer?.company_name)).size,
      over90: Math.round(unp.filter(i => i.due_date && i.due_date < ago90).reduce((s, i) => s + Number(i.total), 0)),
      top: Array.from(ub.entries()).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([k, v]) => [k, Math.round(v)]) },
    bill: { n: thisInv.length, sum: Math.round(thisInv.reduce((s, i) => s + Number(i.total), 0)), issued: thisInv.filter(i => i.tax_invoice_issued_at).length },
    ad: { cost: Math.round(adMonth.reduce((s, a) => s + Number(a.cost || 0), 0)), costPrev: Math.round(adPrev.reduce((s, a) => s + Number(a.cost || 0), 0)), ga: adMonth.reduce((s, a) => s + (a.ga_visits || 0), 0) },
    sitesBilled: monthRevs.length,
    leads: {
      today: leads.filter(l => d(l) === today).length, yday: leads.filter(l => d(l) === yday).length,
      month: monthLeads.length, prevMonth: leads.filter(l => d(l) >= pm1 && d(l) < m1).length,
      yLeads: yLeads.length, yWon: yLeads.filter(l => l.stage === '도입완료').length,
      wonMonth: leads.filter(l => l.stage === '도입완료' && (l.converted_at || '') >= m1).length,
      stages,
      preN: pre.length, pre: pre.slice(0, 5).map(l => [l.company_name, l.stage, uname.get(l.assigned_to || '') || '', l.conversion_probability || '']),
      recent: [...monthLeads].sort((a, b) => d(b).localeCompare(d(a))).slice(0, 6).map(l => [l.company_name, l.stage, l.inquiry_channel || '—', short(d(l))]),
      inflowMonth: INFLOW_ORDER.map(g => [g, inflowCount.get(g) || 0]),
      overdueN: overdue.length, weekN: week.length,
      week: week.slice(0, 5).map(l => [l.company_name, l.next_action || '', short(l.next_action_date), uname.get(l.assigned_to || '') || '']),
    },
    mine,
    builtMs: Date.now() - t0,
  }
}

const cached = unstable_cache(build, ['dashboard-v1'], { revalidate: 60 })

export async function GET(request: Request) {
  try {
    const t0 = Date.now()
    const fresh = new URL(request.url).searchParams.get('fresh') === '1'
    const data = fresh ? await build() : await cached()
    return NextResponse.json({ ...data, ms: Date.now() - t0 })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
