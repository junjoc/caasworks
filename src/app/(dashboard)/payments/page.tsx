'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Badge } from '@/components/ui/badge'
import { Loading } from '@/components/ui/loading'
import { EmptyState } from '@/components/ui/empty-state'
import { formatCurrency, formatDate } from '@/lib/utils'
import { CreditCard } from 'lucide-react'

const STATUS_LABELS: Record<string, string> = { pending: '대기', paid: '완료', overdue: '연체' }
const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-700',
  paid: 'bg-green-100 text-green-700',
  overdue: 'bg-red-100 text-red-700',
}

export default function PaymentsPage() {
  const [payments, setPayments] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  useEffect(() => {
    supabase
      .from('payments')
      .select('*, customer:customers(company_name)')
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        setPayments(data || [])
        setLoading(false)
      })
  }, [])

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">납부 관리</h1>
      </div>

      {loading ? (
        <Loading />
      ) : payments.length === 0 ? (
        <EmptyState icon={CreditCard} title="납부 이력이 없습니다" />
      ) : (
        <div className="table-container">
          <table className="data-table">
            <thead>
              <tr>
                <th>고객사</th>
                <th>발행일</th>
                <th>예정일</th>
                <th>입금일</th>
                <th>금액</th>
                <th>입금자</th>
                <th>상태</th>
              </tr>
            </thead>
            <tbody>
              {payments.map((p) => (
                <tr key={p.id}>
                  <td className="font-medium">{p.customer?.company_name || '-'}</td>
                  <td className="text-gray-500">{p.invoice_date ? formatDate(p.invoice_date) : '-'}</td>
                  <td className="text-gray-500">{p.due_date ? formatDate(p.due_date) : '-'}</td>
                  <td className="text-gray-500">{p.paid_date ? formatDate(p.paid_date) : '-'}</td>
                  <td className="font-medium">{formatCurrency(Number(p.amount))}</td>
                  <td>{p.payer_name || '-'}</td>
                  <td>
                    <Badge className={STATUS_COLORS[p.status]}>{STATUS_LABELS[p.status]}</Badge>
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
