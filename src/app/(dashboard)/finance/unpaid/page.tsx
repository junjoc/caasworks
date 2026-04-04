'use client'

import { useEffect, useState, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Loading } from '@/components/ui/loading'
import { EmptyState } from '@/components/ui/empty-state'
import { formatCurrency, formatDate } from '@/lib/utils'
import { AlertTriangle, Clock, Phone, Search, Building2, TrendingDown, ChevronDown, ChevronRight, ArrowUpRight } from 'lucide-react'
import { cn } from '@/lib/utils'

interface UnpaidInvoice {
  id: string
  invoice_number: string
  year: number
  month: number
  total: number
  due_date: string | null
  status: string
  customer_id: string
  customer_name: string
  contact_person: string
  contact_phone: string
  receiver_company: string
  notes: string | null
}

type ViewMode = 'aging' | 'customer' | 'list'
type SortMode = 'due_date' | 'amount' | 'days_overdue'

// Aging buckets
const AGING_BUCKETS = [
  { key: 'current', label: '미도래', color: 'text-status-blue', bg: 'bg-blue-50', border: 'border-blue-200', desc: '납기일 전' },
  { key: '1-30', label: '1~30일', color: 'text-status-yellow', bg: 'bg-amber-50', border: 'border-amber-200', desc: '소액 연체' },
  { key: '31-60', label: '31~60일', color: 'text-orange-600', bg: 'bg-orange-50', border: 'border-orange-200', desc: '주의 필요' },
  { key: '61-90', label: '61~90일', color: 'text-red-500', bg: 'bg-red-50', border: 'border-red-200', desc: '긴급' },
  { key: '90+', label: '90일+', color: 'text-red-700', bg: 'bg-red-100', border: 'border-red-300', desc: '장기 연체' },
] as const

function getDaysOverdue(dueDate: string | null): number {
  if (!dueDate) return 0
  return Math.floor((Date.now() - new Date(dueDate).getTime()) / 86400000)
}

function getAgingBucket(daysOverdue: number): string {
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
  const [sortMode, setSortMode] = useState<SortMode>('days_overdue')
  const [search, setSearch] = useState('')
  const [expandedCustomers, setExpandedCustomers] = useState<Set<string>>(new Set())
  const supabase = createClient()

  useEffect(() => {
    async function fetch() {
      const { data } = await supabase
        .from('invoices')
        .select('*, customer:customers(company_name, contact_person, contact_phone)')
        .in('status', ['sent', 'overdue'])
        .order('due_date', { ascending: true })
      setInvoices((data || []).map((inv: any) => ({
        id: inv.id,
        invoice_number: inv.invoice_number,
        year: inv.year,
        month: inv.month,
        total: Number(inv.total || 0),
        due_date: inv.due_date,
        status: inv.status,
        customer_id: inv.customer_id,
        customer_name: inv.customer?.company_name || '(알수없음)',
        contact_person: inv.customer?.contact_person || '',
        contact_phone: inv.customer?.contact_phone || '',
        receiver_company: inv.receiver_company || '',
        notes: inv.notes || null,
      })))
      setLoading(false)
    }
    fetch()
  }, [])

  // Filtered
  const filtered = useMemo(() => {
    if (!search) return invoices
    const q = search.toLowerCase()
    return invoices.filter(inv =>
      inv.customer_name.toLowerCase().includes(q) ||
      inv.receiver_company.toLowerCase().includes(q) ||
      inv.invoice_number?.toLowerCase().includes(q)
    )
  }, [invoices, search])

  // Sorted
  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      if (sortMode === 'amount') return b.total - a.total
      if (sortMode === 'days_overdue') return getDaysOverdue(b.due_date) - getDaysOverdue(a.due_date)
      // due_date
      if (!a.due_date) return 1
      if (!b.due_date) return -1
      return new Date(a.due_date).getTime() - new Date(b.due_date).getTime()
    })
  }, [filtered, sortMode])

  // Stats
  const totalUnpaid = filtered.reduce((s, i) => s + i.total, 0)
  const overdueInvs = filtered.filter(i => getDaysOverdue(i.due_date) > 0)
  const overdueAmount = overdueInvs.reduce((s, i) => s + i.total, 0)
  const avgDaysOverdue = overdueInvs.length > 0
    ? Math.round(overdueInvs.reduce((s, i) => s + getDaysOverdue(i.due_date), 0) / overdueInvs.length)
    : 0

  // Aging analysis
  const agingData = useMemo(() => {
    const buckets: Record<string, { invoices: UnpaidInvoice[]; total: number }> = {}
    for (const b of AGING_BUCKETS) {
      buckets[b.key] = { invoices: [], total: 0 }
    }
    for (const inv of filtered) {
      const days = getDaysOverdue(inv.due_date)
      const bucket = getAgingBucket(days)
      buckets[bucket].invoices.push(inv)
      buckets[bucket].total += inv.total
    }
    return buckets
  }, [filtered])

  // Customer grouping
  const customerGroups = useMemo(() => {
    const groups: Record<string, { customer_name: string; contact_person: string; contact_phone: string; invoices: UnpaidInvoice[]; total: number; maxDays: number }> = {}
    for (const inv of filtered) {
      if (!groups[inv.customer_id]) {
        groups[inv.customer_id] = {
          customer_name: inv.customer_name,
          contact_person: inv.contact_person,
          contact_phone: inv.contact_phone,
          invoices: [],
          total: 0,
          maxDays: 0,
        }
      }
      groups[inv.customer_id].invoices.push(inv)
      groups[inv.customer_id].total += inv.total
      groups[inv.customer_id].maxDays = Math.max(groups[inv.customer_id].maxDays, getDaysOverdue(inv.due_date))
    }
    return Object.entries(groups).sort(([, a], [, b]) => b.total - a.total)
  }, [filtered])

  const toggleCustomer = (id: string) => {
    setExpandedCustomers(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  if (loading) return <div className="p-8"><Loading /></div>

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">미납 현황</h1>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        <div className="stat-card">
          <div className="flex items-center gap-2 mb-1">
            <Clock className="w-4 h-4 text-status-blue" />
            <span className="stat-label">총 미수금</span>
          </div>
          <div className="stat-value text-status-blue">{formatCurrency(totalUnpaid)}</div>
          <div className="text-xs text-text-tertiary mt-1">{filtered.length}건</div>
        </div>
        <div className="stat-card">
          <div className="flex items-center gap-2 mb-1">
            <AlertTriangle className="w-4 h-4 text-status-red" />
            <span className="stat-label">연체 금액</span>
          </div>
          <div className="stat-value text-status-red">{formatCurrency(overdueAmount)}</div>
          <div className="text-xs text-text-tertiary mt-1">{overdueInvs.length}건</div>
        </div>
        <div className="stat-card">
          <div className="flex items-center gap-2 mb-1">
            <TrendingDown className="w-4 h-4 text-orange-500" />
            <span className="stat-label">평균 연체일</span>
          </div>
          <div className="stat-value text-orange-600">{avgDaysOverdue}일</div>
        </div>
        <div className="stat-card">
          <div className="flex items-center gap-2 mb-1">
            <Building2 className="w-4 h-4 text-text-secondary" />
            <span className="stat-label">미납 고객</span>
          </div>
          <div className="stat-value">{customerGroups.length}사</div>
        </div>
      </div>

      {/* Aging bar chart */}
      <div className="card p-4 mb-6">
        <h3 className="text-sm font-semibold text-text-primary mb-3">연체 구간별 분석 (Aging)</h3>

        {/* Stacked bar */}
        {totalUnpaid > 0 && (
          <div className="flex rounded-lg overflow-hidden h-8 mb-4">
            {AGING_BUCKETS.map(bucket => {
              const data = agingData[bucket.key]
              const pct = (data.total / totalUnpaid) * 100
              if (pct < 0.5) return null
              return (
                <div
                  key={bucket.key}
                  className={cn('flex items-center justify-center text-[10px] font-bold transition-all', bucket.bg, bucket.color)}
                  style={{ width: `${Math.max(pct, 3)}%` }}
                  title={`${bucket.label}: ${formatCurrency(data.total)} (${data.invoices.length}건)`}
                >
                  {pct >= 8 && `${Math.round(pct)}%`}
                </div>
              )
            })}
          </div>
        )}

        {/* Bucket cards */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          {AGING_BUCKETS.map(bucket => {
            const data = agingData[bucket.key]
            return (
              <div key={bucket.key} className={cn('rounded-lg border p-3', bucket.border, bucket.bg)}>
                <div className="flex items-center justify-between mb-1">
                  <span className={cn('text-xs font-semibold', bucket.color)}>{bucket.label}</span>
                  <span className="text-[10px] text-text-tertiary">{data.invoices.length}건</span>
                </div>
                <div className={cn('text-base font-bold', bucket.color)}>{formatCurrency(data.total)}</div>
                <div className="text-[10px] text-text-tertiary mt-0.5">{bucket.desc}</div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <div className="relative flex-1 max-w-sm">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-text-placeholder" />
          <Input
            placeholder="고객사 검색..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>

        {/* View mode toggle */}
        <div className="flex rounded-lg border border-border overflow-hidden">
          {([
            { key: 'aging', label: '구간별' },
            { key: 'customer', label: '고객별' },
            { key: 'list', label: '리스트' },
          ] as const).map(v => (
            <button
              key={v.key}
              onClick={() => setViewMode(v.key)}
              className={cn(
                'px-3 py-1.5 text-xs font-medium transition-colors',
                viewMode === v.key ? 'bg-primary-500 text-white' : 'bg-white text-text-secondary hover:bg-gray-50'
              )}
            >
              {v.label}
            </button>
          ))}
        </div>

        {/* Sort */}
        {viewMode === 'list' && (
          <select
            value={sortMode}
            onChange={e => setSortMode(e.target.value as SortMode)}
            className="text-xs border border-border rounded-md px-2 py-1.5 bg-white text-text-secondary focus:outline-none focus:ring-1 focus:ring-primary-200"
          >
            <option value="days_overdue">연체일순</option>
            <option value="amount">금액순</option>
            <option value="due_date">납기일순</option>
          </select>
        )}
      </div>

      {filtered.length === 0 ? (
        <EmptyState icon={AlertTriangle} title="미납 청구서가 없습니다" description="모든 청구서가 납부 완료되었습니다." />
      ) : viewMode === 'aging' ? (
        /* ── Aging View ── */
        <div className="space-y-4">
          {AGING_BUCKETS.map(bucket => {
            const data = agingData[bucket.key]
            if (data.invoices.length === 0) return null
            return (
              <div key={bucket.key} className="card overflow-hidden">
                <div className={cn('px-4 py-3 flex items-center justify-between', bucket.bg)}>
                  <div className="flex items-center gap-2">
                    <span className={cn('text-sm font-bold', bucket.color)}>{bucket.label}</span>
                    <span className="text-xs text-text-tertiary">{bucket.desc}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-text-secondary">{data.invoices.length}건</span>
                    <span className={cn('text-sm font-bold', bucket.color)}>{formatCurrency(data.total)}</span>
                  </div>
                </div>
                <table className="data-table">
                  <thead>
                    <tr>
                      <th style={{ width: '25%' }}>고객사</th>
                      <th style={{ width: '12%' }} className="text-center">청구월</th>
                      <th style={{ width: '18%' }} className="text-right">청구액</th>
                      <th style={{ width: '12%' }} className="text-center">납기일</th>
                      <th style={{ width: '10%' }} className="text-center">연체일</th>
                      <th style={{ width: '23%' }}>담당자</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.invoices
                      .sort((a, b) => getDaysOverdue(b.due_date) - getDaysOverdue(a.due_date))
                      .map(inv => {
                        const days = getDaysOverdue(inv.due_date)
                        return (
                          <tr key={inv.id}>
                            <td className="font-medium truncate">{inv.customer_name}</td>
                            <td className="text-center text-text-secondary">{inv.year}.{String(inv.month).padStart(2, '0')}</td>
                            <td className="text-right font-semibold">{formatCurrency(inv.total)}</td>
                            <td className="text-center text-text-tertiary">{inv.due_date ? formatDate(inv.due_date, 'M/d') : '-'}</td>
                            <td className="text-center">
                              {days > 0 ? (
                                <span className={cn('font-semibold', days > 60 ? 'text-red-600' : days > 30 ? 'text-orange-500' : 'text-status-yellow')}>
                                  {days}일
                                </span>
                              ) : (
                                <span className="text-status-blue text-xs">D-{Math.abs(days)}</span>
                              )}
                            </td>
                            <td>
                              <div className="flex items-center gap-2 text-xs">
                                <span className="text-text-secondary">{inv.contact_person || '-'}</span>
                                {inv.contact_phone && (
                                  <a href={`tel:${inv.contact_phone}`} className="text-primary-500 hover:text-primary-600 flex items-center gap-0.5">
                                    <Phone className="w-3 h-3" />
                                    <span className="hidden sm:inline">{inv.contact_phone}</span>
                                  </a>
                                )}
                              </div>
                            </td>
                          </tr>
                        )
                      })}
                  </tbody>
                </table>
              </div>
            )
          })}
        </div>
      ) : viewMode === 'customer' ? (
        /* ── Customer View ── */
        <div className="space-y-2">
          {customerGroups.map(([custId, group]) => {
            const isExpanded = expandedCustomers.has(custId)
            const maxBucket = AGING_BUCKETS.find(b => b.key === getAgingBucket(group.maxDays)) || AGING_BUCKETS[0]
            return (
              <div key={custId} className="card overflow-hidden">
                <button
                  onClick={() => toggleCustomer(custId)}
                  className="w-full px-4 py-3 flex items-center gap-3 hover:bg-gray-50 transition-colors"
                >
                  {isExpanded ? <ChevronDown className="w-4 h-4 text-text-tertiary" /> : <ChevronRight className="w-4 h-4 text-text-tertiary" />}
                  <div className="flex-1 flex items-center gap-3 min-w-0">
                    <span className="font-semibold text-sm text-text-primary truncate">{group.customer_name}</span>
                    <Badge className={cn('text-[10px]', maxBucket.bg, maxBucket.color, maxBucket.border)}>
                      {group.maxDays > 0 ? `${group.maxDays}일 연체` : '미도래'}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-4 flex-shrink-0">
                    <span className="text-xs text-text-tertiary">{group.invoices.length}건</span>
                    <span className="text-sm font-bold text-text-primary">{formatCurrency(group.total)}</span>
                    {group.contact_person && (
                      <div className="flex items-center gap-1 text-xs text-text-secondary">
                        <span>{group.contact_person}</span>
                        {group.contact_phone && (
                          <a
                            href={`tel:${group.contact_phone}`}
                            onClick={e => e.stopPropagation()}
                            className="text-primary-500"
                          >
                            <Phone className="w-3 h-3" />
                          </a>
                        )}
                      </div>
                    )}
                  </div>
                </button>
                {isExpanded && (
                  <div className="border-t border-border-light">
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th style={{ width: '12%' }} className="text-center">청구월</th>
                          <th style={{ width: '30%' }}>비고</th>
                          <th style={{ width: '18%' }} className="text-right">청구액</th>
                          <th style={{ width: '14%' }} className="text-center">납기일</th>
                          <th style={{ width: '12%' }} className="text-center">연체일</th>
                          <th style={{ width: '14%' }} className="text-center">상태</th>
                        </tr>
                      </thead>
                      <tbody>
                        {group.invoices
                          .sort((a, b) => getDaysOverdue(b.due_date) - getDaysOverdue(a.due_date))
                          .map(inv => {
                            const days = getDaysOverdue(inv.due_date)
                            return (
                              <tr key={inv.id}>
                                <td className="text-center text-text-secondary">{inv.year}.{String(inv.month).padStart(2, '0')}</td>
                                <td className="text-text-tertiary text-xs truncate">{inv.notes || '-'}</td>
                                <td className="text-right font-semibold">{formatCurrency(inv.total)}</td>
                                <td className="text-center text-text-tertiary">{inv.due_date ? formatDate(inv.due_date, 'M/d') : '-'}</td>
                                <td className="text-center">
                                  {days > 0 ? (
                                    <span className={cn('font-semibold', days > 60 ? 'text-red-600' : days > 30 ? 'text-orange-500' : 'text-status-yellow')}>
                                      {days}일
                                    </span>
                                  ) : (
                                    <span className="text-status-blue text-xs">D-{Math.abs(days)}</span>
                                  )}
                                </td>
                                <td className="text-center">
                                  <Badge className={inv.status === 'overdue' ? 'badge-red' : 'badge-blue'}>
                                    {inv.status === 'overdue' ? '연체' : '발송'}
                                  </Badge>
                                </td>
                              </tr>
                            )
                          })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      ) : (
        /* ── List View ── */
        <div className="table-container">
          <table className="data-table">
            <thead>
              <tr>
                <th style={{ width: '22%' }}>고객사</th>
                <th style={{ width: '10%' }} className="text-center">청구월</th>
                <th style={{ width: '16%' }} className="text-right">청구액</th>
                <th style={{ width: '12%' }} className="text-center">납기일</th>
                <th style={{ width: '10%' }} className="text-center">연체일</th>
                <th style={{ width: '10%' }} className="text-center">상태</th>
                <th style={{ width: '20%' }}>담당자</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((inv) => {
                const days = getDaysOverdue(inv.due_date)
                return (
                  <tr key={inv.id} className={days > 60 ? 'bg-red-50/50' : days > 30 ? 'bg-orange-50/40' : days > 0 ? 'bg-amber-50/30' : ''}>
                    <td className="font-medium truncate">{inv.customer_name}</td>
                    <td className="text-center text-text-secondary">{inv.year}.{String(inv.month).padStart(2, '0')}</td>
                    <td className="text-right font-semibold">{formatCurrency(inv.total)}</td>
                    <td className="text-center text-text-tertiary">{inv.due_date ? formatDate(inv.due_date, 'M/d') : '-'}</td>
                    <td className="text-center">
                      {days > 0 ? (
                        <span className={cn('font-semibold', days > 60 ? 'text-red-600' : days > 30 ? 'text-orange-500' : 'text-status-yellow')}>
                          {days}일
                        </span>
                      ) : (
                        <span className="text-status-blue text-xs">D-{Math.abs(days)}</span>
                      )}
                    </td>
                    <td className="text-center">
                      <Badge className={inv.status === 'overdue' ? 'badge-red' : 'badge-blue'}>
                        {inv.status === 'overdue' ? '연체' : '발송'}
                      </Badge>
                    </td>
                    <td>
                      <div className="flex items-center gap-2 text-xs">
                        <span className="text-text-secondary">{inv.contact_person || '-'}</span>
                        {inv.contact_phone && (
                          <a href={`tel:${inv.contact_phone}`} className="text-primary-500 hover:text-primary-600 flex items-center gap-0.5">
                            <Phone className="w-3 h-3" />
                            <span className="hidden sm:inline">{inv.contact_phone}</span>
                          </a>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
