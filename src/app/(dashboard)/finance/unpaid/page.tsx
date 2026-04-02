'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Badge } from '@/components/ui/badge'
import { Select } from '@/components/ui/select'
import { Loading } from '@/components/ui/loading'
import { EmptyState } from '@/components/ui/empty-state'
import { formatCurrency, formatDate } from '@/lib/utils'
import { AlertTriangle, Clock, Phone } from 'lucide-react'

export default function UnpaidPage() {
  const [invoices, setInvoices] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  useEffect(() => {
    async function fetch() {
      const { data } = await supabase
        .from('invoices')
        .select('*, customer:customers(company_name, contact_person, contact_phone)')
        .in('status', ['sent', 'overdue'])
        .order('due_date', { ascending: true })
      setInvoices((data || []).map((inv: any) => ({
        ...inv,
        customer_name: inv.customer?.company_name || '(알수없음)',
        contact_person: inv.customer?.contact_person || '',
        contact_phone: inv.customer?.contact_phone || '',
      })))
      setLoading(false)
    }
    fetch()
  }, [])

  const totalUnpaid = invoices.reduce((s, i) => s + Number(i.total || 0), 0)
  const overdueInvoices = invoices.filter(i => i.status === 'overdue')
  const overdueAmount = overdueInvoices.reduce((s, i) => s + Number(i.total || 0), 0)

  const getDaysOverdue = (dueDate: string) => {
    const diff = Math.floor((Date.now() - new Date(dueDate).getTime()) / 86400000)
    return diff > 0 ? diff : 0
  }

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">미납 현황</h1>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <div className="stat-card">
          <div className="flex items-center gap-2 mb-1"><Clock className="w-4 h-4 text-status-blue" /><span className="stat-label">총 미수금</span></div>
          <div className="stat-value text-status-blue">{formatCurrency(totalUnpaid)}</div>
        </div>
        <div className="stat-card">
          <div className="flex items-center gap-2 mb-1"><AlertTriangle className="w-4 h-4 text-status-red" /><span className="stat-label">연체 금액</span></div>
          <div className="stat-value text-status-red">{formatCurrency(overdueAmount)}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">연체 건수</div>
          <div className="stat-value text-status-red">{overdueInvoices.length}건</div>
        </div>
      </div>

      {loading ? <Loading /> : invoices.length === 0 ? (
        <EmptyState icon={AlertTriangle} title="미납 청구서가 없습니다" />
      ) : (
        <div className="table-container">
          <table className="data-table">
            <thead>
              <tr>
                <th style={{ width: '20%' }}>고객사</th>
                <th style={{ width: '12%' }}>청구번호</th>
                <th style={{ width: '10%' }} className="text-center">청구월</th>
                <th style={{ width: '14%' }} className="text-right">청구액</th>
                <th style={{ width: '12%' }} className="text-center">납기일</th>
                <th style={{ width: '10%' }} className="text-center">연체일</th>
                <th style={{ width: '10%' }} className="text-center">상태</th>
                <th style={{ width: '12%' }}>담당자</th>
              </tr>
            </thead>
            <tbody>
              {invoices.map((inv) => {
                const daysOver = inv.due_date ? getDaysOverdue(inv.due_date) : 0
                return (
                  <tr key={inv.id} className={daysOver > 30 ? 'bg-status-red-bg/30' : daysOver > 0 ? 'bg-status-yellow-bg/30' : ''}>
                    <td className="font-medium col-truncate">{inv.customer_name}</td>
                    <td className="text-primary-500">{inv.invoice_number}</td>
                    <td className="text-center text-text-secondary">{inv.year}.{String(inv.month).padStart(2, '0')}</td>
                    <td className="text-right font-semibold">{formatCurrency(inv.total)}</td>
                    <td className="text-center text-text-tertiary">{inv.due_date ? formatDate(inv.due_date, 'M/d') : '-'}</td>
                    <td className="text-center">
                      {daysOver > 0 ? (
                        <span className={`font-semibold ${daysOver > 30 ? 'text-status-red' : 'text-status-yellow'}`}>
                          {daysOver}일
                        </span>
                      ) : '-'}
                    </td>
                    <td className="text-center">
                      <Badge className={inv.status === 'overdue' ? 'badge-red' : 'badge-blue'}>
                        {inv.status === 'overdue' ? '연체' : '발송'}
                      </Badge>
                    </td>
                    <td>
                      {inv.contact_person && (
                        <div className="text-caption">
                          <span>{inv.contact_person}</span>
                          {inv.contact_phone && (
                            <a href={`tel:${inv.contact_phone}`} className="text-primary-500 ml-1">
                              <Phone className="w-3 h-3 inline" />
                            </a>
                          )}
                        </div>
                      )}
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
