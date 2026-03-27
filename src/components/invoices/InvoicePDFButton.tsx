'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Download } from 'lucide-react'

interface InvoicePDFButtonProps {
  invoice: any
  items: any[]
  className?: string
}

export function InvoicePDFButton({ invoice, items, className }: InvoicePDFButtonProps) {
  const [loading, setLoading] = useState(false)

  const handleDownload = async (e: React.MouseEvent) => {
    e.stopPropagation()
    e.preventDefault()
    setLoading(true)

    try {
      // Dynamic import to avoid SSR issues
      const { pdf } = await import('@react-pdf/renderer')
      const { InvoicePDFDocument } = await import('./InvoicePDF')

      const data = {
        invoice_number: invoice.invoice_number || '',
        year: invoice.year,
        month: invoice.month,
        created_at: invoice.created_at ? new Date(invoice.created_at).toLocaleDateString('ko-KR') : new Date().toLocaleDateString('ko-KR'),
        customer_name: invoice.customer_name || invoice.customer?.company_name || '',
        receiver_contact: invoice.receiver_contact || '',
        due_date: invoice.due_date ? new Date(invoice.due_date).toLocaleDateString('ko-KR') : '',
        bank_info: invoice.bank_info || '',
        sender_company: invoice.sender_company || '(주)아이콘',
        sender_biz_no: invoice.sender_biz_no || '153-87-01774',
        sender_ceo: invoice.sender_ceo || '김종민',
        sender_address: invoice.sender_address || '서울특별시 강남구 도곡로7길 6 한은빌딩 2층',
        sender_contact_name: invoice.sender_contact_name || '',
        sender_contact_info: invoice.sender_contact_info || '',
        subtotal: Number(invoice.subtotal) || 0,
        vat: Number(invoice.vat) || 0,
        total: Number(invoice.total) || 0,
        items: (items || []).map((it: any) => ({
          project_name: it.project_name || '',
          service_type: it.service_type || '',
          period: it.period || '1',
          quantity: Number(it.quantity) || 1,
          unit_price: Number(it.unit_price) || 0,
          amount: Number(it.amount) || 0,
          notes: it.notes || '',
        })),
        logo_url: undefined,
      }

      const fileName = `[${data.customer_name}] ${data.year}년 ${data.month}월 청구서.pdf`

      const blob = await pdf(<InvoicePDFDocument data={data} />).toBlob()
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = fileName
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(url)
    } catch (err) {
      console.error('PDF generation error:', err)
      alert('PDF 생성 중 오류가 발생했습니다.')
    }

    setLoading(false)
  }

  return (
    <button
      onClick={handleDownload}
      disabled={loading}
      className="p-1 text-gray-400 hover:text-primary-600 rounded disabled:opacity-50"
      title="PDF 다운로드"
    >
      {loading ? (
        <div className="w-3.5 h-3.5 border-2 border-gray-300 border-t-primary-600 rounded-full animate-spin" />
      ) : (
        <Download className="w-3.5 h-3.5" />
      )}
    </button>
  )
}
