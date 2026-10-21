import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { isSignedIn } from '@/lib/pipeline/read-leads'

// 고객 목록 v2 — 검색·필터·정렬·50행 페이지를 서버에서, 올해 매출·이번 달 매출·미납을 붙여서 (2026-10-21, 디자인 정의 › 고객 목록 v2)
export const dynamic = 'force-dynamic'
const PAGE = 50
const kst = () => new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10)

type Cust = { id: string; customer_code: string | null; company_name: string; company_type: string | null; status: string | null; billing_start: string | null; assigned_to: string | null; created_at: string; contact_person: string | null; contact_phone: string | null; contact_email: string | null; business_reg_no: string | null; notes: string | null }

async function readAll<T>(q: (a: number, b: number) => PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>): Promise<T[]> {
  const res = await Promise.all([0, 1, 2].map(i => q(i * 1000, i * 1000 + 999)))
  while (res[res.length - 1].data?.length === 1000) res.push(await q(res.length * 1000, res.length * 1000 + 999))
  const err = res.find(r => r.error)?.error
  if (err) throw new Error(err.message)
  return res.flatMap(r => (r.data || []) as T[])
}

export async function POST(request: Request) {
  try {
    const p = await request.json() as { warm?: boolean; tab?: string; q?: string; type?: string; owner?: string; sort?: string; asc?: boolean; page?: number }
    if (p.warm) return NextResponse.json({ ok: true })
    if (!(await isSignedIn())) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
    const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)
    const today = kst(), year = Number(today.slice(0, 4)), month = Number(today.slice(5, 7)), m1 = `${today.slice(0, 7)}-01`
    const [cust, rev, inv, users] = await Promise.all([
      readAll<Cust>((a, b) => sb.from('customers').select('id, customer_code, company_name, company_type, status, billing_start, assigned_to, created_at, contact_person, contact_phone, contact_email, business_reg_no, notes').order('id').range(a, b)),
      readAll<{ customer_id: string; month: number; amount: number }>((a, b) => sb.from('monthly_revenues').select('customer_id, month, amount').eq('year', year).order('id').range(a, b)),
      readAll<{ customer_id: string; total: number; tax_invoice_issued_at: string | null; paid_at: string | null; status: string }>((a, b) => sb.from('invoices').select('customer_id, total, tax_invoice_issued_at, paid_at, status').order('id').range(a, b)),
      sb.from('users').select('id, name'),
    ])
    const uname = new Map((users.data || []).map(u => [u.id, u.name as string]))
    const ry = new Map<string, number>(), rm = new Map<string, number>(), unp = new Map<string, number>()
    for (const r of rev) {
      ry.set(r.customer_id, (ry.get(r.customer_id) || 0) + Number(r.amount))
      if (r.month === month) rm.set(r.customer_id, (rm.get(r.customer_id) || 0) + Number(r.amount))
    }
    for (const i of inv) if (i.tax_invoice_issued_at && !i.paid_at && i.status !== 'cancelled') unp.set(i.customer_id, (unp.get(i.customer_id) || 0) + Number(i.total))

    const rows = cust.map(c => ({
      id: c.id, code: c.customer_code, name: c.company_name, type: c.company_type, status: c.status || 'active', start: c.billing_start,
      owner: c.assigned_to, ownerName: uname.get(c.assigned_to || '') || null, created: c.created_at.slice(0, 10),
      rm: Math.round(rm.get(c.id) || 0), ry: Math.round(ry.get(c.id) || 0), unp: Math.round(unp.get(c.id) || 0),
      _s: [c.company_name, c.customer_code, c.contact_person, c.contact_email, c.notes, uname.get(c.assigned_to || '')].join(' ').toLowerCase() + ' ' + [c.contact_phone, c.business_reg_no].join(' ').replace(/-/g, ''),
    }))

    // KPI — 필터와 상관없이 전체
    const kpi = {
      total: rows.length, active: rows.filter(r => r.status === 'active').length, churned: rows.filter(r => r.status === 'churned').length,
      billed: rows.filter(r => r.rm > 0).length, rmSum: rows.reduce((s, r) => s + r.rm, 0),
      unpN: rows.filter(r => r.unp > 0).length, unpSum: rows.reduce((s, r) => s + r.unp, 0),
      newMonth: rows.filter(r => r.created >= m1).length, month,
    }
    const q = (p.q || '').trim().toLowerCase().replace(/-/g, '')
    const base = rows.filter(r => (!q || r._s.includes(q))
      && (!p.type || p.type === '전체' || (r.type || '—') === p.type)
      && (!p.owner || p.owner === '전체' || (p.owner === '미배정' ? !r.owner : r.owner === p.owner)))
    const TABS: Record<string, (r: typeof rows[number]) => boolean> = { 전체: () => true, 활성: r => r.status === 'active', 이탈: r => r.status === 'churned', 미납: r => r.unp > 0 }
    const counts = Object.fromEntries(Object.entries(TABS).map(([k, f]) => [k, base.filter(f).length]))
    const list = base.filter(TABS[p.tab || '전체'] || TABS['전체'])

    const key = (p.sort || 'ry') as 'ry' | 'rm' | 'unp' | 'code' | 'start'
    const dir = p.asc ? 1 : -1
    list.sort((a, b) => {
      const x = a[key], y = b[key]
      if (x == null || x === '') return 1
      if (y == null || y === '') return -1
      return (typeof x === 'number' ? (x as number) - (y as number) : String(x).localeCompare(String(y))) * dir || a.name.localeCompare(b.name)
    })
    const sums = { rm: list.reduce((s, r) => s + r.rm, 0), ry: list.reduce((s, r) => s + r.ry, 0), unp: list.reduce((s, r) => s + r.unp, 0) }
    const page = Math.max(0, Math.min(p.page || 0, Math.floor(Math.max(list.length - 1, 0) / PAGE)))
    const types = Array.from(new Set(rows.map(r => r.type || '—'))).sort()
    return NextResponse.json({
      rows: list.slice(page * PAGE, page * PAGE + PAGE).map(({ _s, created, ...r }) => r), // eslint-disable-line @typescript-eslint/no-unused-vars
      total: list.length, page, pageSize: PAGE, counts, kpi, sums, types,
    })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
