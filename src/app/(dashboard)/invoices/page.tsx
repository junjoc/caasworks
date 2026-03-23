'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Select } from '@/components/ui/select'
import { Loading } from '@/components/ui/loading'
import { EmptyState } from '@/components/ui/empty-state'
import { formatCurrency, formatDate } from '@/lib/utils'
import type { Invoice } from '@/types/database'
import { Plus, FileText } from 'lucide-react'

const STATUS_LABELS: Record<string, string> = {
  draft: '초안',
  confirmed: '확정',
  sent: '발송',
  paid: '입금완료',
  overdue: '연체',
}
const STATUS_COLORS: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-700',
  confirmed: 'bg-blue-100 text-blue-700',
  sent: 'bg-yellow-100 text-yellow-700',
  paid: 'bg-green-100 text-green-700',
  overdue: 'bg-red-100 text-red-700',
}

export default function InvoicesPage() {
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState('')
  const supabase = createClient()

  useEffect(() => {
    fetchInvoices()
  }, [statusFilter])

  async function fetchInvoices() {
    setLoading(true)
    let query = supabase
      .from('invoices')
      .select('*, customer:customers(company_name)')
      .order('created_at', { ascending: false })

    if (statusFilter) query = query.eq('status', statusFilter)

    const { data } = await query
    setInvoices(data || [])
    setLoading(false)
  }

  const statusOptions = [
    { value: '', label: '전체' },
    ...Object.entries(STATUS_LABELS).map(([v, l]) => ({ value: v, label: l })),
  ]

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">청구서 관리</h1>
        <Link href="/invoices/new">
          <Button size="sm"><Plus className="w-4 h-4 mr-1" /> 새 청구서</Button>
        </Link>
      </div>

      <div className="mb-4">
        <Select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          options={statusOptions}
          className="w-40"
        />
      </div>

      {loading ? (
        <Loading />
      ) : invoices.length === 0 ? (
        <EmptyState icon={FileText} title="청구서가 없습니다" />
      ) : (
        <div className="table-container">
          <table className="data-table">
            <thead>
              <tr>
                <th>청구서 번호</th>
                <th>고객사</th>
                <th>기간</th>
                <th>합계</th>
                <th>상태</th>
                <th>납부기한</th>
              </tr>
            </thead>
            <tbody>
              {invoices.map((inv) => (
                <tr key={inv.id}>
                  <td>
                    <Link href={`/invoices/${inv.id}`} className="font-medium text-primary-600 hover:underline">
                      {inv.invoice_number || '-'}
                    </Link>
                  </td>
                  <td>{inv.customer?.company_name || '-'}</td>
                  <td>{inv.year}년 {inv.month}월</td>
                  <td className="font-medium">{formatCurrency(Number(inv.total))}</td>
                  <td>
                    <Badge className={STATUS_COLORS[inv.status]}>
                      {STATUS_LABELS[inv.status]}
                    </Badge>
                  </td>
                  <td className="text-gray-500">
                    {inv.due_date ? formatDate(inv.due_date) : '-'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
