'use client'

import { useEffect, useState, useMemo, useCallback } from 'react'
import { DateRangePicker, type DateRange } from '@/components/ui/date-range-picker'
import { createClient } from '@/lib/supabase/client'
import { Loading } from '@/components/ui/loading'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { EmptyState } from '@/components/ui/empty-state'
import { formatCurrency, formatDate } from '@/lib/utils'
import { CreditCard, Search, ChevronLeft, ChevronRight, TrendingUp, Calendar } from 'lucide-react'

export default function PaymentsPage() {
  const [invoices, setInvoices] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [year, setYear] = useState(new Date().getFullYear())
  const [month, setMonth] = useState(new Date().getMonth() + 1)
  const [viewAll, setViewAll] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [dateRange, setDateRange] = useState<DateRange>({ from: '', to: '' })
  const supabase = createClient()

  const fetchPayments = useCallback(async () => {
    setLoading(true)
    let query = supabase
      .from('invoices')
      .select('*, customer:customers(company_name)')
      .eq('status', 'paid')
      .order('paid_at', { ascending: false })

    if (viewAll) {
      query = query.eq('year', year)
    } else {
      query = query.eq('year', year).eq('month', month)
    }

    const { data } = await query
    setInvoices((data || []).map((inv: any) => ({
      ...inv,
      customer_name: inv.customer?.company_name || '(알수없음)',
    })))
    setLoading(false)
  }, [year, month, viewAll])

  useEffect(() => { fetchPayments() }, [fetchPayments])

  const dateFiltered = useMemo(() => {
    if (!dateRange.from || !dateRange.to) return invoices
    return invoices.filter(i => {
      const paidDate = i.paid_at ? i.paid_at.split('T')[0] : `${i.year}-${String(i.month).padStart(2,'0')}-01`
      return paidDate >= dateRange.from && paidDate <= dateRange.to
    })
  }, [invoices, dateRange])

  const filtered = searchQuery
    ? dateFiltered.filter(i => i.customer_name.toLowerCase().includes(searchQuery.toLowerCase()))
    : dateFiltered

  const totalPaid = filtered.reduce((s, i) => s + Number(i.total || 0), 0)

  // Monthly trend (when viewing all year)
  const monthlyTrend = useMemo(() => {
    if (!viewAll) return null
    const months: Record<number, number> = {}
    for (let m = 1; m <= 12; m++) months[m] = 0
    for (const inv of invoices) {
      months[inv.month] = (months[inv.month] || 0) + Number(inv.total || 0)
    }
    return months
  }, [viewAll, invoices])

  const handlePrev = () => {
    if (viewAll) { setYear(y => y - 1) }
    else if (month === 1) { setYear(y => y - 1); setMonth(12) }
    else { setMonth(m => m - 1) }
  }

  const handleNext = () => {
    if (viewAll) { setYear(y => y + 1) }
    else if (month === 12) { setYear(y => y + 1); setMonth(1) }
    else { setMonth(m => m + 1) }
  }

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">납부 관리</h1>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <div className="stat-card">
          <div className="flex items-center gap-2 mb-1"><CreditCard className="w-4 h-4 text-status-green" /><span className="stat-label">총 수납액</span></div>
          <div className="stat-value text-status-green">{formatCurrency(totalPaid)}</div>
        </div>
        <div className="stat-card">
          <div className="flex items-center gap-2 mb-1"><Calendar className="w-4 h-4 text-text-secondary" /><span className="stat-label">수납 건수</span></div>
          <div className="stat-value">{filtered.length}건</div>
        </div>
        <div className="stat-card">
          <div className="flex items-center gap-2 mb-1"><TrendingUp className="w-4 h-4 text-primary-500" /><span className="stat-label">건당 평균</span></div>
          <div className="stat-value text-primary-600">{filtered.length > 0 ? formatCurrency(Math.round(totalPaid / filtered.length)) : '-'}</div>
        </div>
      </div>

      {/* Monthly trend bar when viewing all year */}
      {viewAll && monthlyTrend && (
        <div className="card p-4 mb-6">
          <h3 className="text-sm font-semibold text-text-primary mb-3">월별 수납 추이</h3>
          <div className="flex items-end gap-1 h-24">
            {Object.entries(monthlyTrend).map(([m, amount]) => {
              const maxAmount = Math.max(...Object.values(monthlyTrend), 1)
              const height = (amount / maxAmount) * 100
              return (
                <div key={m} className="flex-1 flex flex-col items-center gap-1">
                  <div
                    className="w-full bg-primary-400 rounded-t-sm transition-all hover:bg-primary-500"
                    style={{ height: `${Math.max(height, 2)}%` }}
                    title={`${m}월: ${formatCurrency(amount)}`}
                  />
                  <span className="text-[10px] text-text-tertiary">{m}월</span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      <div className="flex items-center gap-3 mb-4 flex-wrap">
        {/* Year tabs */}
        <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-0.5">
          {[2025, 2026].map(y => (
            <button
              key={y}
              onClick={() => setYear(y)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                year === y ? 'bg-white text-text-primary shadow-sm' : 'text-text-secondary hover:text-text-primary'
              }`}
            >
              {y}년
            </button>
          ))}
        </div>

        {/* Month navigation */}
        <div className="flex items-center gap-1">
          <button onClick={handlePrev} className="p-1.5 rounded-md hover:bg-gray-100 transition-colors">
            <ChevronLeft className="w-4 h-4 text-text-secondary" />
          </button>
          <span className="text-sm font-semibold text-text-primary min-w-[80px] text-center">
            {viewAll ? '전체' : `${month}월`}
          </span>
          <button onClick={handleNext} className="p-1.5 rounded-md hover:bg-gray-100 transition-colors">
            <ChevronRight className="w-4 h-4 text-text-secondary" />
          </button>
        </div>

        <button
          onClick={() => setViewAll(v => !v)}
          className={`px-3 py-1.5 text-xs font-medium rounded-md border transition-colors ${
            viewAll ? 'bg-primary-500 text-white border-primary-500' : 'bg-white text-text-secondary border-border hover:bg-gray-50'
          }`}
        >
          연간 전체
        </button>

        <DateRangePicker value={dateRange} onChange={setDateRange} />

        <div className="flex-1" />

        <div className="relative max-w-[240px]">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-text-placeholder" />
          <Input placeholder="고객사 검색..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-9" />
        </div>
      </div>

      {loading ? <Loading /> : filtered.length === 0 ? (
        <EmptyState icon={CreditCard} title="수납 이력이 없습니다" />
      ) : (
        <div className="table-container">
          <table className="data-table">
            <thead>
              <tr>
                <th style={{ width: '30%' }}>고객사</th>
                <th style={{ width: '14%' }} className="text-center">청구월</th>
                <th style={{ width: '24%' }} className="text-right">수납액</th>
                <th style={{ width: '18%' }} className="text-center">수납일</th>
                <th style={{ width: '14%' }} className="text-center">비고</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((inv) => (
                <tr key={inv.id}>
                  <td className="font-medium col-truncate">{inv.customer_name}</td>
                  <td className="text-center text-text-secondary">{inv.year}.{String(inv.month).padStart(2, '0')}</td>
                  <td className="text-right font-semibold text-status-green">{formatCurrency(inv.total)}</td>
                  <td className="text-center text-text-tertiary">{inv.paid_at ? formatDate(inv.paid_at) : '-'}</td>
                  <td className="text-center text-text-tertiary text-xs truncate">{inv.notes || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
