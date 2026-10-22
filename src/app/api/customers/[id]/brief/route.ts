import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { isSignedIn } from '@/lib/pipeline/read-leads'

// 고객 드로어 — 고객 한 곳을 한 번에: 기본 정보 + 올해 월별 매출 + 미납 청구 + 연결 리드 (2026-10-21, 고객 목록 v2)
export const dynamic = 'force-dynamic'

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  try {
    if (params.id === 'warm') return NextResponse.json({ ok: true })
    if (!(await isSignedIn())) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
    const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)
    const year = Number(new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 4))
    const [c, rev, inv, leads, legacy] = await Promise.all([
      sb.from('customers').select('*').eq('id', params.id).single(),
      sb.from('monthly_revenues').select('month, amount').eq('customer_id', params.id).eq('year', year),
      sb.from('invoices').select('id, year, month, total, due_date, tax_invoice_issued_at, paid_at, status').eq('customer_id', params.id).order('year', { ascending: false }).order('month', { ascending: false }),
      sb.from('pipeline_leads').select('id, company_name, stage, inquiry_date, created_at').eq('customer_id', params.id).order('created_at', { ascending: false }),
      // 이전 기록(2023~2025.1) 중 연결 안 된 것 — 회사명·대표 연락처로 찾음 (10/22)
      sb.from('pipeline_leads').select('id, company_name, stage, inquiry_date, created_at, contact_phone').like('notes', '[이전 기록]%').is('customer_id', null).limit(3000),
    ])
    if (c.error || !c.data) return NextResponse.json({ error: c.error?.message || 'not found' }, { status: 404 })
    const norm = (v: unknown) => String(v || '').replace(/\(주\)|주식회사|㈜|\(유\)|유한회사|\s/g, '').toLowerCase()
    const name = norm(c.data.company_name), ph = String(c.data.contact_phone || '').replace(/\D/g, '').slice(-8)
    const old = (legacy.data || []).filter(l => (name.length >= 2 && norm(l.company_name) === name) || (ph.length === 8 && String(l.contact_phone || '').replace(/\D/g, '').slice(-8) === ph))
    const allLeads = [...(leads.data || []), ...old.map(({ contact_phone: _p, ...l }) => l)].sort((a, b) => (b.inquiry_date || b.created_at).localeCompare(a.inquiry_date || a.created_at))
    const months = Array.from({ length: 12 }, (_, i) => Math.round((rev.data || []).filter(r => r.month === i + 1).reduce((s, r) => s + Number(r.amount), 0)))
    const unpaid = (inv.data || []).filter(i => i.tax_invoice_issued_at && !i.paid_at && i.status !== 'cancelled')
    return NextResponse.json({ customer: c.data, year, months, unpaid, invoiceN: (inv.data || []).length, leads: allLeads })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
