'use client'

import { useEffect, useState, useMemo, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Badge } from '@/components/ui/badge'
import { Loading } from '@/components/ui/loading'
import { EmptyState } from '@/components/ui/empty-state'
import { formatCurrency, formatDate } from '@/lib/utils'
import {
  AlertTriangle, Clock, Phone, Search, Building2, TrendingDown,
  ChevronDown, ChevronRight, ArrowUpRight, Calendar, Users, List,
  FileText,
} from 'lucide-react'

/* ══════════════════════════════════════════════════════
   미납 현황 페이지 재설계
   - 미납 판단: tax_invoice_issued_at 있음 + paid_at 없음 + 취소 아님
   - Aging 5 버킷: 긴급한 순서로 배치
   - 카드 클릭 → 해당 버킷 섹션으로 스크롤 + 펼침 (단일 accordion)
   - 기본 펼침: 90일+
   - 추가 뷰: 월별 (세금계산서 발행 월), 고객사별
   ══════════════════════════════════════════════════════ */

interface InvoiceItem {
  id?: string
  project_name: string | null
  service_type: string | null
  amount: number
  notes?: string | null
}

interface UnpaidInvoice {
  id: string
  invoice_number: string
  year: number
  month: number
  total: number
  due_date: string | null
  tax_invoice_issued_at: string | null
  tax_invoice_number: string | null
  status: string
  customer_id: string
  customer_name: string
  contact_person: string
  contact_phone: string
  notes: string | null
  items: InvoiceItem[]
}

type ViewMode = 'aging' | 'monthly' | 'customer'

// aging 버킷 — 긴급한 순서 (사용자 요청: 90일+ → 61~90 → 31~60 → 1~30 → 미도래)
const AGING_BUCKETS = [
  { key: '90+',     label: '90일+',    color: 'text-red-700',    bg: 'bg-red-100',    ring: 'ring-red-300',    desc: '장기 연체',    emoji: '🔴' },
  { key: '61-90',   label: '61~90일',  color: 'text-red-500',    bg: 'bg-red-50',     ring: 'ring-red-200',    desc: '긴급',        emoji: '🟥' },
  { key: '31-60',   label: '31~60일',  color: 'text-orange-600', bg: 'bg-orange-50',  ring: 'ring-orange-200', desc: '주의 필요',   emoji: '🟠' },
  { key: '1-30',    label: '1~30일',   color: 'text-amber-600',  bg: 'bg-amber-50',   ring: 'ring-amber-200',  desc: '소액 연체',   emoji: '🟡' },
  { key: 'current', label: '미도래',   color: 'text-status-blue', bg: 'bg-blue-50',   ring: 'ring-blue-200',   desc: '납기일 전',   emoji: '🔵' },
] as const

type BucketKey = typeof AGING_BUCKETS[number]['key']

const DAYS_IN_MS = 86400000

function getDaysOverdue(dueDate: string | null): number {
  if (!dueDate) return 0
  return Math.floor((Date.now() - new Date(dueDate).getTime()) / DAYS_IN_MS)
}

function getAgingBucket(daysOverdue: number): BucketKey {
  if (daysOverdue <= 0) return 'current'
  if (daysOverdue <= 30) return '1-30'
  if (daysOverdue <= 60) return '31-60'
  if (daysOverdue <= 90) return '61-90'
  return '90+'
}

export default function UnpaidPage() {
  const [invoices, setInvoices] = useState<UnpaidInvoice[]>([])
  const [loading, setLoading] = useState(true)
  const [viewMode, setViewMode] = useState<ViewMode>('aging')
  const [search, setSearch] = useState('')
  // 단일 accordion — 기본 90일+ 펼침
  const [expandedBucket, setExpandedBucket] = useState<BucketKey | null>('90+')
  const [expandedMonth, setExpandedMonth] = useState<string | null>(null)
  const [expandedCustomer, setExpandedCustomer] = useState<string | null>(null)

  const supabase = createClient()
  const bucketRefs = useRef<Record<string, HTMLDivElement | null>>({})

  useEffect(() => {
    async function fetch() {
      // 미납 기준: 세금계산서 발행 + 미수납 + 취소 아님
      const { data } = await supabase
        .from('invoices')
        .select('*, customer:customers(company_name, contact_person, contact_phone), items:invoice_items(id, project_name, service_type, amount, notes)')
        .not('tax_invoice_issued_at', 'is', null)
        .is('paid_at', null)
        .neq('status', 'cancelled')
        .order('due_date', { ascending: true })
      setInvoices((data || []).map((inv: any) => ({
        id: inv.id,
        invoice_number: inv.invoice_number,
        year: inv.year,
        month: inv.month,
        total: Number(inv.total || 0),
        due_date: inv.due_date,
        tax_invoice_issued_at: inv.tax_invoice_issued_at,
        tax_invoice_number: inv.tax_invoice_number,
        status: inv.status,
        customer_id: inv.customer_id,
        customer_name: inv.customer?.company_name || '(알수없음)',
        contact_person: inv.customer?.contact_person || '',
        contact_phone: inv.customer?.contact_phone || '',
        notes: inv.notes || null,
        items: (inv.items || []).map((it: any) => ({
          id: it.id,
          project_name: it.project_name,
          service_type: it.service_type,
          amount: Number(it.amount || 0),
          notes: it.notes || null,
        })),
      })))
      setLoading(false)
    }
    fetch()
  }, [])

  const filtered = useMemo(() => {
    if (!search) return invoices
    const q = search.toLowerCase()
    return invoices.filter(inv =>
      inv.customer_name.toLowerCase().includes(q) ||
      inv.invoice_number?.toLowerCase().includes(q) ||
      (inv.tax_invoice_number || '').toLowerCase().includes(q)
    )
  }, [invoices, search])

  // Aging 버킷별 집계
  const agingData = useMemo(() => {
    const buckets: Record<BucketKey, { invoices: UnpaidInvoice[]; total: number }> = {} as any
    for (const b of AGING_BUCKETS) buckets[b.key] = { invoices: [], total: 0 }
    for (const inv of filtered) {
      const days = getDaysOverdue(inv.due_date)
      const bucket = getAgingBucket(days)
      buckets[bucket].invoices.push(inv)
      buckets[bucket].total += inv.total
    }
    // 각 버킷 내부 정렬: 연체일 많은 순
    for (const k of Object.keys(buckets)) {
      (buckets as any)[k].invoices.sort((a: UnpaidInvoice, b: UnpaidInvoice) => getDaysOverdue(b.due_date) - getDaysOverdue(a.due_date))
    }
    return buckets
  }, [filtered])

  // 월별 집계 (세금계산서 발행 월 기준)
  const monthlyData = useMemo(() => {
    const groups = new Map<string, { month: string; invoices: UnpaidInvoice[]; total: number }>()
    for (const inv of filtered) {
      const ym = inv.tax_invoice_issued_at ? String(inv.tax_invoice_issued_at).substring(0, 7) : '미상'
      if (!groups.has(ym)) groups.set(ym, { month: ym, invoices: [], total: 0 })
      const g = groups.get(ym)!
      g.invoices.push(inv)
      g.total += inv.total
    }
    const arr = Array.from(groups.values())
    arr.forEach(g => g.invoices.sort((a, b) => getDaysOverdue(b.due_date) - getDaysOverdue(a.due_date)))
    // 최근 월이 맨 위
    return arr.sort((a, b) => b.month.localeCompare(a.month))
  }, [filtered])

  // 고객사별 집계
  const customerGroups = useMemo(() => {
    const groups = new Map<string, { customer_name: string; contact_person: string; contact_phone: string; invoices: UnpaidInvoice[]; total: number; maxDays: number }>()
    for (const inv of filtered) {
      if (!groups.has(inv.customer_id)) {
        groups.set(inv.customer_id, {
          customer_name: inv.customer_name,
          contact_person: inv.contact_person,
          contact_phone: inv.contact_phone,
          invoices: [],
          total: 0,
          maxDays: 0,
        })
      }
      const g = groups.get(inv.customer_id)!
      g.invoices.push(inv)
      g.total += inv.total
      g.maxDays = Math.max(g.maxDays, getDaysOverdue(inv.due_date))
    }
    const entries = Array.from(groups.entries())
    entries.forEach(([, g]) => g.invoices.sort((a, b) => getDaysOverdue(b.due_date) - getDaysOverdue(a.due_date)))
    // 미수금 큰 순
    return entries.sort(([, a], [, b]) => b.total - a.total)
  }, [filtered])

  // 상단 stat
  const totalUnpaid = filtered.reduce((s, i) => s + i.total, 0)
  const overdueInvs = filtered.filter(i => getDaysOverdue(i.due_date) > 0)
  const overdueAmount = overdueInvs.reduce((s, i) => s + i.total, 0)
  const avgDaysOverdue = overdueInvs.length > 0
    ? Math.round(overdueInvs.reduce((s, i) => s + getDaysOverdue(i.due_date), 0) / overdueInvs.length)
    : 0

  // 카드 클릭 → 해당 버킷 펼침 + 스크롤
  const jumpToBucket = (key: BucketKey) => {
    setExpandedBucket(key)
    // Next tick 후 스크롤 (아코디언 펼침 후)
    setTimeout(() => {
      bucketRefs.current[key]?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, 50)
  }

  const toggleBucket = (key: BucketKey) => {
    setExpandedBucket(prev => prev === key ? null : key)
  }

  if (loading) return <div className="p-8"><Loading /></div>

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">미납 현황</h1>
      </div>

      {/* ───── Summary stat cards ───── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4">
        <div className="stat-card">
          <div className="flex items-center gap-2 mb-1">
            <Clock className="w-4 h-4 text-status-blue" />
            <span className="stat-label">총 미수금</span>
          </div>
          <div className="stat-value">{formatCurrency(totalUnpaid)}</div>
          <div className="text-[11px] text-text-tertiary mt-1">{filtered.length}건</div>
        </div>
        <div className="stat-card">
          <div className="flex items-center gap-2 mb-1">
            <AlertTriangle className="w-4 h-4 text-status-red" />
            <span className="stat-label">연체 금액</span>
          </div>
          <div className="stat-value text-status-red">{formatCurrency(overdueAmount)}</div>
          <div className="text-[11px] text-text-tertiary mt-1">{overdueInvs.length}건</div>
        </div>
        <div className="stat-card">
          <div className="flex items-center gap-2 mb-1">
            <TrendingDown className="w-4 h-4 text-orange-600" />
            <span className="stat-label">평균 연체일</span>
          </div>
          <div className="stat-value text-orange-600">{avgDaysOverdue}<span className="text-base">일</span></div>
        </div>
        <div className="stat-card">
          <div className="flex items-center gap-2 mb-1">
            <Users className="w-4 h-4 text-primary-500" />
            <span className="stat-label">연체 고객사</span>
          </div>
          <div className="stat-value">{customerGroups.length}<span className="text-base">곳</span></div>
        </div>
      </div>

      {/* ───── View toggle + search ───── */}
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-0.5">
          <ViewTabBtn active={viewMode === 'aging'} onClick={() => setViewMode('aging')} icon={<List className="w-3.5 h-3.5" />} label="연체별" />
          <ViewTabBtn active={viewMode === 'monthly'} onClick={() => setViewMode('monthly')} icon={<Calendar className="w-3.5 h-3.5" />} label="월별" />
          <ViewTabBtn active={viewMode === 'customer'} onClick={() => setViewMode('customer')} icon={<Users className="w-3.5 h-3.5" />} label="고객사별" />
        </div>
        <div className="flex-1" />
        <div className="relative max-w-[280px]">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-text-placeholder" />
          <input
            className="w-full pl-9 pr-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-200"
            placeholder="고객사 / 청구번호 / 세금계산서 번호"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {/* ───── Aging 카드 (뷰 모드와 상관없이 항상 표시) ───── */}
      {viewMode === 'aging' && (
        <div className="grid grid-cols-5 gap-3 mb-4">
          {AGING_BUCKETS.map(b => {
            const data = agingData[b.key]
            const active = expandedBucket === b.key
            return (
              <button
                key={b.key}
                onClick={() => jumpToBucket(b.key)}
                className={`text-left p-3 rounded-lg border transition-all hover:shadow-md ${b.bg} ${active ? `ring-2 ${b.ring} shadow-md` : 'border-transparent'}`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className={`text-xs font-semibold ${b.color}`}>{b.label}</span>
                  <span className="text-[10px] text-text-tertiary">{b.desc}</span>
                </div>
                <div className={`text-lg font-bold ${b.color}`}>{data.invoices.length}건</div>
                <div className="text-xs text-text-secondary font-medium mt-0.5">{formatCurrency(data.total)}</div>
              </button>
            )
          })}
        </div>
      )}

      {/* ───── 본 내용 ───── */}
      {filtered.length === 0 ? (
        <EmptyState icon={FileText} title="미납 청구서가 없습니다" description="세금계산서가 발행된 청구서가 아직 미수납 상태가 없습니다." />
      ) : viewMode === 'aging' ? (
        <div className="space-y-3">
          {AGING_BUCKETS.map(b => {
            const data = agingData[b.key]
            const expanded = expandedBucket === b.key
            return (
              <div
                key={b.key}
                ref={el => { bucketRefs.current[b.key] = el }}
                className={`card overflow-hidden transition-all ${expanded ? `border-l-4 ${b.ring.replace('ring-', 'border-l-')}` : ''}`}
                style={{ scrollMarginTop: 12 }}
              >
                <button
                  onClick={() => toggleBucket(b.key)}
                  className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors"
                >
                  {expanded ? <ChevronDown className="w-4 h-4 text-text-secondary" /> : <ChevronRight className="w-4 h-4 text-text-secondary" />}
                  <span className={`text-sm font-semibold ${b.color}`}>{b.label}</span>
                  <span className="text-xs text-text-tertiary">{b.desc}</span>
                  <span className="flex-1" />
                  <span className="text-xs text-text-secondary">{data.invoices.length}건</span>
                  <span className={`text-sm font-bold ${b.color}`}>{formatCurrency(data.total)}</span>
                </button>
                {expanded && (
                  data.invoices.length === 0 ? (
                    <div className="px-4 py-6 text-center text-text-tertiary text-sm">이 구간에 청구서가 없습니다.</div>
                  ) : (
                    <InvoiceTable invoices={data.invoices} />
                  )
                )}
              </div>
            )
          })}
        </div>
      ) : viewMode === 'monthly' ? (
        <div className="space-y-3">
          {monthlyData.map(g => {
            const expanded = expandedMonth === g.month
            return (
              <div key={g.month} className="card overflow-hidden">
                <button
                  onClick={() => setExpandedMonth(expanded ? null : g.month)}
                  className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors"
                >
                  {expanded ? <ChevronDown className="w-4 h-4 text-text-secondary" /> : <ChevronRight className="w-4 h-4 text-text-secondary" />}
                  <Calendar className="w-4 h-4 text-primary-500" />
                  <span className="text-sm font-semibold">{g.month === '미상' ? '(세금계산서 발행일 없음)' : g.month.replace('-', '년 ') + '월'}</span>
                  <span className="flex-1" />
                  <span className="text-xs text-text-tertiary">{g.invoices.length}건</span>
                  <span className="text-sm font-bold text-primary-600">{formatCurrency(g.total)}</span>
                </button>
                {expanded && <InvoiceTable invoices={g.invoices} />}
              </div>
            )
          })}
        </div>
      ) : (
        <div className="space-y-3">
          {customerGroups.map(([id, g]) => {
            const expanded = expandedCustomer === id
            const bucketClass = g.maxDays > 90 ? 'text-red-700' : g.maxDays > 60 ? 'text-red-500' : g.maxDays > 30 ? 'text-orange-600' : g.maxDays > 0 ? 'text-amber-600' : 'text-status-blue'
            return (
              <div key={id} className="card overflow-hidden">
                <button
                  onClick={() => setExpandedCustomer(expanded ? null : id)}
                  className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors text-left"
                >
                  {expanded ? <ChevronDown className="w-4 h-4 text-text-secondary" /> : <ChevronRight className="w-4 h-4 text-text-secondary" />}
                  <Building2 className="w-4 h-4 text-primary-500" />
                  <div className="flex-1">
                    <div className="text-sm font-semibold">{g.customer_name}</div>
                    <div className="text-[11px] text-text-tertiary mt-0.5">
                      {g.contact_person && <span>{g.contact_person}</span>}
                      {g.contact_phone && <span className="ml-2 inline-flex items-center gap-1"><Phone className="w-2.5 h-2.5" />{g.contact_phone}</span>}
                    </div>
                  </div>
                  <span className="text-xs text-text-tertiary">{g.invoices.length}건</span>
                  {g.maxDays > 0 && <span className={`text-xs font-semibold ${bucketClass}`}>최장 {g.maxDays}일</span>}
                  <span className="text-sm font-bold text-primary-600">{formatCurrency(g.total)}</span>
                </button>
                {expanded && <InvoiceTable invoices={g.invoices} showCustomer={false} />}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

/* ─── Helper components ─── */

function ViewTabBtn({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${
        active ? 'bg-white text-text-primary shadow-sm' : 'text-text-secondary hover:text-text-primary'
      }`}
    >
      {icon}
      {label}
    </button>
  )
}

function InvoiceTable({ invoices, showCustomer = true }: { invoices: UnpaidInvoice[]; showCustomer?: boolean }) {
  return (
    <div className="overflow-x-auto border-t border-border-light">
      <table className="w-full text-sm" style={{ minWidth: '1100px' }}>
        <thead className="bg-gray-50 text-xs text-text-tertiary">
          <tr>
            <th className="px-3 py-2 text-left font-medium whitespace-nowrap">청구번호</th>
            {showCustomer && <th className="px-3 py-2 text-left font-medium whitespace-nowrap">고객사</th>}
            <th className="px-3 py-2 text-left font-medium whitespace-nowrap">담당자</th>
            <th className="px-3 py-2 text-left font-medium">현장 / 금액</th>
            <th className="px-3 py-2 text-center font-medium whitespace-nowrap">계산서<br/>발행일</th>
            <th className="px-3 py-2 text-center font-medium whitespace-nowrap">납기일</th>
            <th className="px-3 py-2 text-center font-medium whitespace-nowrap">연체일</th>
            <th className="px-3 py-2 text-right font-medium whitespace-nowrap">합계</th>
            <th className="px-3 py-2 text-left font-medium">비고</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border-light">
          {invoices.map(inv => {
            const days = getDaysOverdue(inv.due_date)
            const hasItems = inv.items && inv.items.length > 0
            return (
              <tr key={inv.id} className="hover:bg-gray-50/50 align-top">
                <td className="px-3 py-2 text-text-secondary font-mono text-xs">{inv.invoice_number || '-'}</td>
                {showCustomer && (
                  <td className="px-3 py-2">
                    <div className="font-medium">{inv.customer_name}</div>
                  </td>
                )}
                <td className="px-3 py-2">
                  {inv.contact_person ? (
                    <div className="text-sm">
                      <div className="font-medium text-text-primary">{inv.contact_person}</div>
                      {inv.contact_phone && (
                        <a href={`tel:${inv.contact_phone}`} className="text-[11px] text-text-tertiary hover:text-primary-500 inline-flex items-center gap-1 mt-0.5">
                          <Phone className="w-2.5 h-2.5" />{inv.contact_phone}
                        </a>
                      )}
                    </div>
                  ) : (
                    <span className="text-xs text-text-placeholder">-</span>
                  )}
                </td>
                <td className="px-3 py-2">
                  {hasItems ? (
                    <ul className="space-y-0.5">
                      {inv.items.map((it, i) => (
                        <li key={it.id || i} className="flex items-baseline gap-2 text-xs">
                          <span className="flex-1 text-text-secondary truncate" title={`${it.project_name || '-'}${it.service_type ? ` · ${it.service_type}` : ''}`}>
                            {it.project_name || '-'}
                            {it.service_type && <span className="text-text-tertiary ml-1">· {it.service_type}</span>}
                          </span>
                          <span className="font-medium text-text-primary whitespace-nowrap">{formatCurrency(it.amount)}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <span className="text-xs text-text-placeholder">(항목 없음)</span>
                  )}
                </td>
                <td className="px-3 py-2 text-center text-text-secondary text-xs whitespace-nowrap">
                  {inv.tax_invoice_issued_at ? formatDate(inv.tax_invoice_issued_at, 'yyyy-MM-dd') : '-'}
                </td>
                <td className="px-3 py-2 text-center text-text-secondary text-xs whitespace-nowrap">
                  {inv.due_date ? formatDate(inv.due_date, 'yyyy-MM-dd') : '-'}
                </td>
                <td className="px-3 py-2 text-center whitespace-nowrap">
                  {days > 0 ? (
                    <Badge className={
                      days > 90 ? 'bg-red-100 text-red-700' :
                      days > 60 ? 'bg-red-50 text-red-500' :
                      days > 30 ? 'bg-orange-50 text-orange-600' :
                      'bg-amber-50 text-amber-600'
                    }>
                      +{days}일
                    </Badge>
                  ) : (
                    <span className="text-xs text-text-placeholder">
                      {inv.due_date ? `${Math.abs(days)}일 남음` : '-'}
                    </span>
                  )}
                </td>
                <td className="px-3 py-2 text-right font-semibold whitespace-nowrap">{formatCurrency(inv.total)}</td>
                <td className="px-3 py-2 text-[11px] text-text-tertiary max-w-[260px]">
                  {inv.notes ? (
                    <span className="whitespace-pre-wrap line-clamp-3" title={inv.notes}>{inv.notes}</span>
                  ) : '-'}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
