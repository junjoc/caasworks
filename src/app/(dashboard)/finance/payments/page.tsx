'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Loading } from '@/components/ui/loading'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { EmptyState } from '@/components/ui/empty-state'
import { formatCurrency, formatDate } from '@/lib/utils'
import { CreditCard, Search } from 'lucide-react'

export default function PaymentsPage() {
  const [invoices, setInvoices] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [year, setYear] = useState(new Date().getFullYear())
  const [searchQuery, setSearchQuery] = useState('')
  const supabase = createClient()

  useEffect(() => {
    async function fetch() {
      setLoading(true)
      const { data } = await supabase
        .from('invoices')
        .select('*, customer:customers(company_name)')
        .eq('year', year)
        .eq('status', 'paid')
        .order('paid_at', { ascending: false })
      setInvoices((data || []).map((inv: any) => ({
        ...inv,
        customer_name: inv.customer?.company_name || '(알수없음)',
      })))
      setLoading(false)
    }
    fetch()
  }, [year])

  const filtered = searchQuery
    ? invoices.filter(i => i.customer_name.toLowerCase().includes(searchQuery.toLowerCase()))
    : invoices

  const totalPaid = filtered.reduce((s, i) => s + Number(i.total || 0), 0)

  const yearOptions = Array.from({ length: 5 }, (_, i) => ({ value: String(new Date().getFullYear() - i), label: `${new Date().getFullYear() - i}년` }))

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">납부 관리</h1>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
        <div className="stat-card">
          <div className="flex items-center gap-2 mb-1"><CreditCard className="w-4 h-4 text-status-green" /><span className="stat-label">총 수납액</span></div>
          <div className="stat-value text-status-green">{formatCurrency(totalPaid)}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">수납 건수</div>
          <div className="stat-value">{filtered.length}건</div>
        </div>
      </div>

      <div className="flex items-center gap-3 mb-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-text-placeholder" />
          <Input placeholder="고객사 검색..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-9" />
        </div>
        <Select options={yearOptions} value={String(year)} onChange={(e) => setYear(Number(e.target.value))} className="w-28" />
      </div>

      {loading ? <Loading /> : filtered.length === 0 ? (
        <EmptyState icon={CreditCard} title="수납 이력이 없습니다" />
      ) : (
        <div className="table-container">
          <table className="data-table">
            <thead>
              <tr>
                <th style={{ width: '28%' }}>고객사</th>
                <th style={{ width: '18%' }}>청구번호</th>
                <th style={{ width: '14%' }} className="text-center">청구월</th>
                <th style={{ width: '22%' }} className="text-right">수납액</th>
                <th style={{ width: '18%' }} className="text-center">수납일</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((inv) => (
                <tr key={inv.id}>
                  <td className="font-medium col-truncate">{inv.customer_name}</td>
                  <td className="text-primary-400">{inv.invoice_number}</td>
                  <td className="text-center text-text-secondary">{inv.year}.{String(inv.month).padStart(2, '0')}</td>
                  <td className="text-right font-semibold text-status-green">{formatCurrency(inv.total)}</td>
                  <td className="text-center text-text-tertiary">{inv.paid_at ? formatDate(inv.paid_at) : '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
