'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { PageLoading } from '@/components/ui/loading'
import { formatCurrency, formatDate } from '@/lib/utils'
import type { Invoice, InvoiceItem } from '@/types/database'
import { ArrowLeft } from 'lucide-react'

const STATUS_LABELS: Record<string, string> = {
  draft: '초안', confirmed: '확정', sent: '발송', paid: '입금완료', overdue: '연체',
}
const STATUS_COLORS: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-700', confirmed: 'bg-blue-100 text-blue-700',
  sent: 'bg-yellow-100 text-yellow-700', paid: 'bg-green-100 text-green-700',
  overdue: 'bg-red-100 text-red-700',
}

export default function InvoiceDetailPage() {
  const { id } = useParams<{ id: string }>()
  const [invoice, setInvoice] = useState<Invoice | null>(null)
  const [items, setItems] = useState<InvoiceItem[]>([])
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  useEffect(() => {
    Promise.all([
      supabase.from('invoices').select('*, customer:customers(company_name)').eq('id', id).single(),
      supabase.from('invoice_items').select('*').eq('invoice_id', id).order('item_no'),
    ]).then(([invRes, itemRes]) => {
      setInvoice(invRes.data)
      setItems(itemRes.data || [])
      setLoading(false)
    })
  }, [id])

  if (loading) return <PageLoading />
  if (!invoice) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500">청구서를 찾을 수 없습니다.</p>
        <Link href="/invoices"><Button variant="secondary" className="mt-4">목록으로</Button></Link>
      </div>
    )
  }

  return (
    <div>
      <div className="page-header">
        <div className="flex items-center gap-3">
          <Link href="/invoices" className="text-gray-400 hover:text-gray-600">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <h1 className="page-title">{invoice.invoice_number || '청구서'}</h1>
          <Badge className={STATUS_COLORS[invoice.status]}>{STATUS_LABELS[invoice.status]}</Badge>
        </div>
      </div>

      {/* 청구서 미리보기 */}
      <div className="card p-8 max-w-3xl mx-auto">
        <div className="text-center mb-8">
          <h2 className="text-2xl font-bold">청 구 서</h2>
          <p className="text-gray-500 mt-1">{invoice.year}년 {invoice.month}월</p>
        </div>

        <div className="grid grid-cols-2 gap-8 mb-8">
          {/* 발신 */}
          <div>
            <h3 className="text-sm font-semibold text-gray-500 mb-2">발신</h3>
            <dl className="space-y-1 text-sm">
              <dd className="font-medium">{invoice.sender_company || '-'}</dd>
              <dd>{invoice.sender_biz_no}</dd>
              <dd>{invoice.sender_ceo}</dd>
              <dd>{invoice.sender_address}</dd>
              <dd>{invoice.sender_contact_name} {invoice.sender_contact_info}</dd>
            </dl>
          </div>
          {/* 수신 */}
          <div>
            <h3 className="text-sm font-semibold text-gray-500 mb-2">수신</h3>
            <dl className="space-y-1 text-sm">
              <dd className="font-medium">{invoice.receiver_company || invoice.customer?.company_name}</dd>
              <dd>{invoice.receiver_biz_no}</dd>
              <dd>{invoice.receiver_contact}</dd>
              <dd>{invoice.receiver_email}</dd>
            </dl>
          </div>
        </div>

        {/* 항목 테이블 */}
        <table className="w-full text-sm border border-gray-300 mb-6">
          <thead className="bg-gray-100">
            <tr>
              <th className="border border-gray-300 px-3 py-2 text-left">No</th>
              <th className="border border-gray-300 px-3 py-2 text-left">프로젝트</th>
              <th className="border border-gray-300 px-3 py-2 text-left">서비스</th>
              <th className="border border-gray-300 px-3 py-2 text-left">기간</th>
              <th className="border border-gray-300 px-3 py-2 text-right">수량</th>
              <th className="border border-gray-300 px-3 py-2 text-right">단가</th>
              <th className="border border-gray-300 px-3 py-2 text-right">금액</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id}>
                <td className="border border-gray-300 px-3 py-2">{item.item_no}</td>
                <td className="border border-gray-300 px-3 py-2">{item.project_name}</td>
                <td className="border border-gray-300 px-3 py-2">{item.service_type}</td>
                <td className="border border-gray-300 px-3 py-2">{item.period}</td>
                <td className="border border-gray-300 px-3 py-2 text-right">{item.quantity}</td>
                <td className="border border-gray-300 px-3 py-2 text-right">{formatCurrency(Number(item.unit_price))}</td>
                <td className="border border-gray-300 px-3 py-2 text-right">{formatCurrency(Number(item.amount))}</td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr>
                <td colSpan={7} className="border border-gray-300 px-3 py-4 text-center text-gray-400">
                  항목이 없습니다.
                </td>
              </tr>
            )}
          </tbody>
        </table>

        {/* 합계 */}
        <div className="flex justify-end">
          <dl className="w-64 space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-gray-500">공급가</dt>
              <dd className="font-medium">{formatCurrency(Number(invoice.subtotal))}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-gray-500">VAT</dt>
              <dd className="font-medium">{formatCurrency(Number(invoice.vat))}</dd>
            </div>
            <div className="flex justify-between border-t pt-2 text-base">
              <dt className="font-semibold">합계</dt>
              <dd className="font-bold text-primary-600">{formatCurrency(Number(invoice.total))}</dd>
            </div>
          </dl>
        </div>

        {/* 납부 정보 */}
        {(invoice.due_date || invoice.bank_info) && (
          <div className="mt-8 pt-6 border-t border-gray-200">
            <h3 className="text-sm font-semibold text-gray-500 mb-2">납부 정보</h3>
            <div className="text-sm space-y-1">
              {invoice.due_date && <p>납부기한: {formatDate(invoice.due_date)}</p>}
              {invoice.bank_info && <p>납부계좌: {invoice.bank_info}</p>}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
