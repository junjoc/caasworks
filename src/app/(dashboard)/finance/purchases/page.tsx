'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Loading } from '@/components/ui/loading'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { DateRangePicker, type DateRange } from '@/components/ui/date-range-picker'
import { Plus, Search } from 'lucide-react'
import { formatDate, formatCurrency } from '@/lib/utils'

interface Purchase {
  id: string
  purchase_date: string | null
  vendor: string | null
  item: string | null
  category: string | null
  quantity: number | null
  unit_price: number | null
  total_amount: number | null
  vat: number | null
  invoice_no: string | null
  payment_date: string | null
  status: string
  notes: string | null
}

const STATUS_COLORS: Record<string, string> = {
  ordered: 'bg-gray-100 text-gray-700',
  received: 'bg-blue-100 text-blue-700',
  paid: 'bg-green-100 text-green-700',
  cancelled: 'bg-red-100 text-red-700',
}
const STATUS_LABELS: Record<string, string> = {
  ordered: '발주', received: '입고', paid: '결제완료', cancelled: '취소',
}

export default function PurchasesPage() {
  const [items, setItems] = useState<Purchase[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [q, setQ] = useState('')
  const [dateRange, setDateRange] = useState<DateRange>({ from: '', to: '' })
  const [statusFilter, setStatusFilter] = useState('전체')

  useEffect(() => {
    const sb = createClient()
    sb.from('purchases').select('*').order('purchase_date', { ascending: false }).then(({ data, error }) => {
      if (error) {
        setError(error.message.includes('does not exist')
          ? '⚠ purchases 테이블이 없습니다. migration 007을 실행해 주세요.'
          : error.message)
      } else {
        setItems(data || [])
      }
      setLoading(false)
    })
  }, [])

  const filtered = items.filter(i => {
    if (statusFilter !== '전체' && i.status !== statusFilter) return false
    if (dateRange.from && dateRange.to && i.purchase_date) {
      if (i.purchase_date < dateRange.from || i.purchase_date > dateRange.to) return false
    }
    if (q && !JSON.stringify(i).toLowerCase().includes(q.toLowerCase())) return false
    return true
  })

  const totalAmount = filtered.reduce((s, i) => s + Number(i.total_amount || 0), 0)
  const paidAmount = filtered.filter(i => i.status === 'paid').reduce((s, i) => s + Number(i.total_amount || 0), 0)

  if (loading) return <Loading />

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">매입/비용</h1>
          <p className="text-xs text-text-tertiary mt-0.5">
            {filtered.length}건 · 총액 {formatCurrency(totalAmount)} · 결제완료 {formatCurrency(paidAmount)}
          </p>
        </div>
        <Button size="sm"><Plus className="w-4 h-4 mr-1" /> 매입 등록</Button>
      </div>

      {error && (
        <div className="card p-4 mb-4 bg-amber-50 border-amber-200 text-sm text-amber-800">
          {error}
        </div>
      )}

      <div className="card p-3 mb-4 flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-tertiary" />
          <input type="text" placeholder="검색..." value={q} onChange={e => setQ(e.target.value)}
            className="w-full pl-8 pr-2 py-1.5 text-sm border border-gray-200 rounded-lg" />
        </div>
        <DateRangePicker value={dateRange} onChange={setDateRange} />
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
          className="px-2 py-1.5 text-sm border border-gray-200 rounded-lg bg-white">
          <option value="전체">상태 전체</option>
          {Object.entries(STATUS_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      </div>

      <div className="table-container">
        <table className="data-table">
          <thead>
            <tr>
              <th>매입일</th><th>협력사</th><th>품목</th><th>카테고리</th>
              <th className="text-right">수량</th><th className="text-right">단가</th>
              <th className="text-right">총액</th><th>결제일</th><th>상태</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan={9} className="text-center text-text-tertiary py-6">등록된 매입건이 없습니다.</td></tr>
            ) : filtered.map(p => (
              <tr key={p.id}>
                <td>{p.purchase_date ? formatDate(p.purchase_date, 'yyyy-MM-dd') : '-'}</td>
                <td>{p.vendor || '-'}</td>
                <td className="font-medium">{p.item || '-'}</td>
                <td>{p.category || '-'}</td>
                <td className="text-right">{p.quantity ?? '-'}</td>
                <td className="text-right">{p.unit_price ? formatCurrency(p.unit_price) : '-'}</td>
                <td className="text-right font-semibold">{p.total_amount ? formatCurrency(p.total_amount) : '-'}</td>
                <td className="text-text-tertiary">{p.payment_date ? formatDate(p.payment_date, 'yyyy-MM-dd') : '-'}</td>
                <td><Badge className={STATUS_COLORS[p.status] || ''}>{STATUS_LABELS[p.status] || p.status}</Badge></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
