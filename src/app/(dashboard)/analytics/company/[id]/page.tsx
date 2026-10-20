'use client'

// 분석 > 고객 생애주기 > 회사 생애주기 타임라인: 유입(채널) → 활동 → 도입 → 월별 매출 → 청구/수납 을 한 줄로
import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Loading } from '@/components/ui/loading'
import { Badge } from '@/components/ui/badge'
import { formatDate, ACTIVITY_TYPE_LABELS, STAGE_COLORS } from '@/lib/utils'
import { toast } from 'sonner'
import { ArrowLeft, ExternalLink } from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'
import { fmtWon } from '@/lib/lifecycle'

interface Lead { id: string; company_name: string; inquiry_date: string | null; created_at: string; inquiry_channel: string | null; inquiry_source: string | null; stage: string; converted_at: string | null; industry: string | null; site_category: string | null; assigned_to: string | null; topic_tags: string[] | null }
interface Act { id: string; lead_id: string | null; activity_type: string; title: string | null; performed_at: string }
interface Rev { year: number; month: number; amount: number; project: { project_name: string; service_type: string | null } | null }
interface Inv { id: string; year: number; month: number; total: number; status: string; tax_invoice_issued_at: string | null; paid_at: string | null; due_date: string | null }
interface Ev { date: string; kind: 'lead' | 'activity' | 'won' | 'revenue' | 'invoice'; text: string; sub?: string }

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
        if (ids.length) {
          const { data: a } = await supabase.from('activity_logs').select('id, lead_id, activity_type, title, performed_at').in('lead_id', ids).order('performed_at')
          setActs(a || [])
        }
        console.log(`[company.lifecycle] ${Math.round(performance.now() - t0)}ms`)
      } catch (e) { toast.error((e as Error).message) }
      setLoading(false)
    })()
  }, [params.id])

  const first = leads[0]
  const firstDate = first ? (first.inquiry_date || first.created_at.slice(0, 10)) : null
  const wonDate = leads.filter(l => l.stage === '도입완료' && l.converted_at).map(l => l.converted_at!.slice(0, 10)).sort()[0] || null
  const monthly = useMemo(() => {
    const m = new Map<string, number>()
    for (const r of revs) { const k = `${r.year}-${String(r.month).padStart(2, '0')}`; m.set(k, (m.get(k) || 0) + Number(r.amount)) }
    return Array.from(m.entries()).sort().map(([month, amount]) => ({ month, amount }))
  }, [revs])
  const total = monthly.reduce((s, m) => s + m.amount, 0)
  const sinceInq = firstDate ? monthly.filter(m => m.month >= firstDate.slice(0, 7)).reduce((s, m) => s + m.amount, 0) : total
  const unpaid = invs.filter(i => i.tax_invoice_issued_at && !i.paid_at && i.status !== 'cancelled')
  const services = Array.from(new Set(revs.map(r => r.project?.service_type).filter(Boolean))) as string[]

  const events = useMemo<Ev[]>(() => {
    const ev: Ev[] = []
    leads.forEach((l, i) => ev.push({ date: l.inquiry_date || l.created_at.slice(0, 10), kind: 'lead', text: `${i === 0 ? '첫 문의' : '추가 문의'} · ${l.inquiry_channel || '-'}${l.inquiry_source ? ' / ' + l.inquiry_source : ''}`, sub: `${l.stage}${l.topic_tags?.length ? ' · ' + l.topic_tags.join(', ') : ''}` }))
    for (const a of acts) ev.push({ date: a.performed_at.slice(0, 10), kind: 'activity', text: ACTIVITY_TYPE_LABELS[a.activity_type] || a.activity_type, sub: a.title || undefined })
    if (wonDate) ev.push({ date: wonDate, kind: 'won', text: '도입완료' })
    if (monthly.length) ev.push({ date: `${monthly[0].month}-01`, kind: 'revenue', text: `첫 매출 ${fmtWon(monthly[0].amount)}원` })
    for (const i of invs) if (i.tax_invoice_issued_at) ev.push({ date: i.tax_invoice_issued_at.slice(0, 10), kind: 'invoice', text: `세금계산서 ${i.year}.${i.month} ${fmtWon(Number(i.total))}원`, sub: i.paid_at ? `수납 ${i.paid_at.slice(0, 10)}` : '미수납' })
    return ev.sort((a, b) => a.date.localeCompare(b.date))
  }, [leads, acts, wonDate, monthly, invs])
  const color: Record<Ev['kind'], string> = { lead: 'bg-blue-500', activity: 'bg-gray-400', won: 'bg-green-600', revenue: 'bg-emerald-500', invoice: 'bg-amber-500' }

  if (loading) return <Loading />
  if (!customer) return <div className="card p-8 text-center text-sm text-text-tertiary">고객사를 찾을 수 없습니다.</div>

  return (
    <div>
      <div className="page-header">
        <div className="flex items-center gap-2">
          <Link href="/analytics/cohort" className="text-text-tertiary hover:text-text-primary"><ArrowLeft className="w-5 h-5" /></Link>
          <div>
            <h1 className="page-title">{customer.company_name} <Link href={`/customers/${customer.id}`} className="text-sm font-normal text-primary-600 ml-2">고객 상세 <ExternalLink className="w-3 h-3 inline" /></Link></h1>
            <p className="text-xs text-text-tertiary mt-0.5">{customer.company_type || '-'} · {customer.billing_type || '-'} · 과금 시작 {customer.billing_start || '-'}</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-4">
        {[
          ['첫 유입', firstDate ? `${firstDate} · ${first?.inquiry_channel || '-'}` : '유입 기록 없음 (기존 고객)'],
          ['도입', wonDate ? `${wonDate}${firstDate ? ` (${Math.round((new Date(wonDate).getTime() - new Date(firstDate).getTime()) / 86400000)}일)` : ''}` : (leads.some(l => l.stage === '도입완료') ? '도입 (일자 없음)' : '-')],
          ['유입 후 매출 (공급가)', `${fmtWon(sinceInq)}원`], ['전체 매출', `${fmtWon(total)}원 · ${monthly.length}개월`],
          ['미납', unpaid.length ? `${unpaid.length}건 ${fmtWon(unpaid.reduce((s, i) => s + Number(i.total), 0))}원` : '없음'],
        ].map(([k, v]) => <div key={k} className="card p-4"><p className="text-xs text-text-secondary mb-1">{k}</p><p className="text-sm font-bold">{v}</p></div>)}
      </div>

      <div className="grid lg:grid-cols-5 gap-4">
        <div className="card p-4 lg:col-span-3">
          <p className="text-sm font-medium mb-2">월별 매출 <span className="text-text-tertiary font-normal">({services.join(', ') || '서비스 없음'})</span></p>
          {monthly.length === 0 ? <p className="text-xs text-text-tertiary">매출 기록이 없습니다.</p> : (
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={monthly} margin={{ left: 10, right: 10, top: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
                  <XAxis dataKey="month" tick={{ fontSize: 10 }} /><YAxis tick={{ fontSize: 10 }} tickFormatter={v => `${Math.round(v / 10000)}만`} width={50} />
                  <Tooltip formatter={(v: number) => `${fmtWon(v)}원`} />
                  <Bar dataKey="amount" fill="#22c55e" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
          {leads.length > 0 && (
            <div className="table-container mt-3">
              <table className="data-table">
                <thead><tr><th>리드</th><th>유입일</th><th>채널</th><th>단계</th><th>도입일</th><th>담당</th></tr></thead>
                <tbody>{leads.map((l, i) => (
                  <tr key={l.id}><td><Link href={`/pipeline/${l.id}`} className="hover:text-primary-600">{i === 0 ? '첫 문의' : `추가 ${i}`} <ExternalLink className="w-3 h-3 inline" /></Link></td><td>{l.inquiry_date || formatDate(l.created_at)}</td><td>{l.inquiry_channel || '-'}{l.inquiry_source ? ` / ${l.inquiry_source}` : ''}</td><td><Badge className={`${STAGE_COLORS[l.stage] || ''} text-xs`}>{l.stage}</Badge></td><td>{l.converted_at?.slice(0, 10) || '-'}</td><td>{l.assigned_to ? users.get(l.assigned_to) || '-' : '-'}</td></tr>
                ))}</tbody>
              </table>
            </div>
          )}
        </div>
        <div className="card p-4 lg:col-span-2">
          <p className="text-sm font-medium mb-2">타임라인 <span className="text-text-tertiary font-normal">({events.length})</span></p>
          <div className="max-h-[560px] overflow-auto">
            {events.length === 0 ? <p className="text-xs text-text-tertiary">기록이 없습니다.</p> : (
              <ol className="relative border-l border-gray-200 ml-2">
                {events.map((e, i) => (
                  <li key={i} className="mb-3 ml-4">
                    <span className={`absolute -left-[5px] mt-1.5 w-2.5 h-2.5 rounded-full ${color[e.kind]}`} />
                    <div className="text-[11px] text-text-tertiary">{e.date}</div>
                    <div className={`text-xs ${e.kind === 'won' ? 'font-semibold text-green-700' : 'text-text-primary'}`}>{e.text}</div>
                    {e.sub && <div className="text-[11px] text-text-secondary">{e.sub}</div>}
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
