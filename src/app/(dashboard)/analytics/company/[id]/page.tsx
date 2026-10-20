'use client'

// 분석 > 고객 생애주기 > 회사 생애주기 타임라인 (디자인 정의 v1 시범 적용)
// 유입(채널) → 활동 → 도입 → 월별 매출 → 청구/수납 을 한 줄로
import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { formatDate, ACTIVITY_TYPE_LABELS } from '@/lib/utils'
import { toast } from 'sonner'
import { fmtWon } from '@/lib/lifecycle'
import { PageHeader, Skeleton, Empty, SectionTitle, StatusChip, Avatar, Tag, DsButton, stageTone } from '@/components/ds'

interface Lead { id: string; company_name: string; inquiry_date: string | null; created_at: string; inquiry_channel: string | null; inquiry_source: string | null; stage: string; converted_at: string | null; industry: string | null; site_category: string | null; assigned_to: string | null; topic_tags: string[] | null }
interface Act { id: string; lead_id: string | null; activity_type: string; title: string | null; performed_at: string }
interface Rev { year: number; month: number; amount: number; project: { project_name: string; service_type: string | null } | null }
interface Inv { id: string; year: number; month: number; total: number; status: string; tax_invoice_issued_at: string | null; paid_at: string | null; due_date: string | null }
interface Ev { date: string; kind: 'lead' | 'activity' | 'won' | 'revenue' | 'invoice'; text: string; sub?: string }
const dotColor: Record<Ev['kind'], string> = { lead: 'var(--ds-accent)', activity: 'var(--ds-fg3)', won: 'var(--ds-ok)', revenue: 'var(--ds-ok)', invoice: 'var(--ds-warn)' }

export default function CompanyLifecyclePage({ params }: { params: { id: string } }) {
  const supabase = createClient()
  const [loading, setLoading] = useState(true)
  const [customer, setCustomer] = useState<{ id: string; company_name: string; company_type: string | null; billing_type: string | null; billing_start: string | null; status: string } | null>(null)
  const [leads, setLeads] = useState<Lead[]>([])
  const [acts, setActs] = useState<Act[]>([])
  const [revs, setRevs] = useState<Rev[]>([])
  const [invs, setInvs] = useState<Inv[]>([])
  const [users, setUsers] = useState<Map<string, string>>(new Map())

  useEffect(() => {
    (async () => {
      const t0 = performance.now()
      try {
        const [{ data: c }, { data: l }, { data: r }, { data: i }, { data: u }] = await Promise.all([
          supabase.from('customers').select('id, company_name, company_type, billing_type, billing_start, status').eq('id', params.id).single(),
          supabase.from('pipeline_leads').select('id, company_name, inquiry_date, created_at, inquiry_channel, inquiry_source, stage, converted_at, industry, site_category, assigned_to, topic_tags').eq('customer_id', params.id).order('inquiry_date'),
          supabase.from('monthly_revenues').select('year, month, amount, project:projects(project_name, service_type)').eq('customer_id', params.id).order('year').order('month'),
          supabase.from('invoices').select('id, year, month, total, status, tax_invoice_issued_at, paid_at, due_date').eq('customer_id', params.id).order('year').order('month'),
          supabase.from('users').select('id, name'),
        ])
        setCustomer(c); setLeads(l || []); setRevs((r || []) as unknown as Rev[]); setInvs(i || []); setUsers(new Map((u || []).map(x => [x.id, x.name])))
        const ids = (l || []).map(x => x.id)
        if (ids.length) { const { data: a } = await supabase.from('activity_logs').select('id, lead_id, activity_type, title, performed_at').in('lead_id', ids).order('performed_at'); setActs(a || []) }
        console.log(`[company.lifecycle] ${Math.round(performance.now() - t0)}ms`)
      } catch (e) { toast.error((e as Error).message) }
      setLoading(false)
    })()
  }, [params.id])

  const first = leads[0]
  const firstDate = first ? (first.inquiry_date || first.created_at.slice(0, 10)) : null
  const wonDate = leads.filter(l => l.stage === '도입완료' && l.converted_at).map(l => l.converted_at!.slice(0, 10)).sort()[0] || null
  const monthly = useMemo(() => { const m = new Map<string, number>(); for (const r of revs) { const k = `${r.year}-${String(r.month).padStart(2, '0')}`; m.set(k, (m.get(k) || 0) + Number(r.amount)) }; return Array.from(m.entries()).sort().map(([month, amount]) => ({ month, amount })) }, [revs])
  const total = monthly.reduce((s, m) => s + m.amount, 0)
  const sinceInq = firstDate ? monthly.filter(m => m.month >= firstDate.slice(0, 7)).reduce((s, m) => s + m.amount, 0) : total
  const unpaid = invs.filter(i => i.tax_invoice_issued_at && !i.paid_at && i.status !== 'cancelled')
  const services = Array.from(new Set(revs.map(r => r.project?.service_type).filter(Boolean))) as string[]
  const maxM = Math.max(1, ...monthly.map(m => m.amount))
  const events = useMemo<Ev[]>(() => {
    const ev: Ev[] = []
    leads.forEach((l, i) => ev.push({ date: l.inquiry_date || l.created_at.slice(0, 10), kind: 'lead', text: `${i === 0 ? '첫 문의' : '추가 문의'} · ${l.inquiry_channel || '—'}${l.inquiry_source ? ' / ' + l.inquiry_source : ''}`, sub: l.topic_tags?.length ? l.topic_tags.map(t => `#${t}`).join(' ') : undefined }))
    for (const a of acts) ev.push({ date: a.performed_at.slice(0, 10), kind: 'activity', text: ACTIVITY_TYPE_LABELS[a.activity_type] || a.activity_type, sub: a.title || undefined })
    if (wonDate) ev.push({ date: wonDate, kind: 'won', text: '도입완료' })
    if (monthly.length) ev.push({ date: `${monthly[0].month}-01`, kind: 'revenue', text: `첫 매출 ${fmtWon(monthly[0].amount)}원` })
    for (const i of invs) if (i.tax_invoice_issued_at) ev.push({ date: i.tax_invoice_issued_at.slice(0, 10), kind: 'invoice', text: `세금계산서 ${i.year}.${i.month} ${fmtWon(Number(i.total))}원`, sub: i.paid_at ? `수납 ${i.paid_at.slice(0, 10)}` : '미수납' })
    return ev.sort((a, b) => a.date.localeCompare(b.date))
  }, [leads, acts, wonDate, monthly, invs])

  if (loading) return <Skeleton rows={10} />
  if (!customer) return <Empty text="고객사를 찾을 수 없습니다" />
  const days = wonDate && firstDate ? Math.round((new Date(wonDate).getTime() - new Date(firstDate).getTime()) / 86400000) : null

  return (
    <div>
      <PageHeader title={customer.company_name}
        kpis={[
          { label: '첫 유입', value: firstDate ? `${firstDate} · ${first?.inquiry_channel || '—'}` : '기록 없음 (기존 고객)' },
          { label: '도입', value: wonDate ? `${wonDate}${days != null ? ` (${days}일)` : ''}` : (leads.some(l => l.stage === '도입완료') ? '일자 없음' : '—') },
          { label: '유입 후 매출', value: `${fmtWon(sinceInq)}원` }, { label: '전체 매출', value: `${fmtWon(total)}원 · ${monthly.length}개월` },
          { label: '미납', value: unpaid.length ? <span className="text-ds-bad">{unpaid.length}건 {fmtWon(unpaid.reduce((s, i) => s + Number(i.total), 0))}원</span> : '없음' },
        ]}
        subtitle={`${customer.company_type || '—'} · ${customer.billing_type || '—'} · 과금 시작 ${customer.billing_start || '—'}`}
        actions={<><Link href="/analytics/cohort"><DsButton variant="ghost" size="sm">코호트로</DsButton></Link><Link href={`/customers/${customer.id}`}><DsButton size="sm">고객사 열기</DsButton></Link></>} />

      <div className="grid lg:grid-cols-5 gap-6">
        <div className="lg:col-span-3 min-w-0">
          <SectionTitle>월별 매출 <span className="text-ds-fg3 font-normal text-[12px]">{services.join(', ') || '서비스 없음'}</span></SectionTitle>
          {monthly.length === 0 ? <Empty text="매출 기록이 없습니다" /> : (
            <div className="ds-wrap p-3">
              <div className="flex items-end gap-1 h-32 overflow-x-auto">
                {monthly.map(m => (
                  <div key={m.month} className="flex-1 min-w-[18px] flex flex-col items-center justify-end gap-1" title={`${m.month} ${fmtWon(m.amount)}원`}>
                    <div className="w-full rounded-t-sm bg-ds-ok" style={{ height: `${Math.max(2, m.amount / maxM * 100)}%` }} />
                    <span className="text-[10px] text-ds-fg3 tabular-nums">{m.month.slice(2).replace('-', '.')}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {leads.length > 0 && (
            <>
              <SectionTitle>리드 {leads.length}</SectionTitle>
              <div className="ds-wrap">
                <table className="ds-table">
                  <thead><tr><th>리드</th><th>유입일</th><th>채널</th><th className="text-center">단계</th><th>도입일</th><th>담당</th><th>주제</th></tr></thead>
                  <tbody>{leads.map((l, i) => (
                    <tr key={l.id} className="ds-row"><td><Link href={`/pipeline/${l.id}`} className="font-medium hover:text-ds-accent">{i === 0 ? '첫 문의' : `추가 ${i}`}</Link></td><td className="muted">{l.inquiry_date || formatDate(l.created_at)}</td><td className="muted">{l.inquiry_channel || '—'}{l.inquiry_source ? ` / ${l.inquiry_source}` : ''}</td><td><StatusChip cell tone={stageTone(l.stage)}>{l.stage}</StatusChip></td><td className="muted">{l.converted_at?.slice(0, 10) || '—'}</td><td><Avatar name={l.assigned_to ? users.get(l.assigned_to) : null} /></td><td>{l.topic_tags?.map(t => <Tag key={t}>{t}</Tag>)}</td></tr>
                  ))}</tbody>
                </table>
              </div>
            </>
          )}
        </div>
        <div className="lg:col-span-2 min-w-0">
          <SectionTitle>타임라인 <span className="text-ds-fg3 font-normal text-[12px]">{events.length}</span></SectionTitle>
          <div className="ds-wrap p-4 max-h-[600px] overflow-auto">
            {events.length === 0 ? <Empty text="기록이 없습니다" /> : (
              <ol className="relative border-l border-ds-line ml-1.5">
                {events.map((e, i) => (
                  <li key={i} className="mb-3 ml-4">
                    <span className="absolute -left-[5px] mt-1.5 w-2.5 h-2.5 rounded-full" style={{ background: dotColor[e.kind] }} />
                    <div className="text-[11px] text-ds-fg3 tabular-nums">{e.date}</div>
                    <div className={`text-[12.5px] ${e.kind === 'won' ? 'font-semibold text-ds-ok' : 'text-ds-fg'}`}>{e.text}</div>
                    {e.sub && <div className="text-[11.5px] text-ds-fg2">{e.sub}</div>}
                  </li>
                ))}
              </ol>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
