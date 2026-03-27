'use client'

import { useState, useEffect } from 'react'
import { pdf } from '@react-pdf/renderer'
import { Button } from '@/components/ui/button'
import { Download, FileText } from 'lucide-react'
import { TemplateA } from './TemplateA'
import { TemplateB } from './TemplateB'
import { createClient } from '@/lib/supabase/client'
import type { Quotation, QuotationItem } from '@/types/database'

interface TemplateConfig {
  logo_left_url: string | null
  logo_right_url: string | null
  stamp_url: string | null
  company_name: string
  biz_number: string
  ceo_name: string
  company_address: string
  company_phone: string
  bank_info: string
  default_notes: string | null
  footer_left: string | null
  footer_right: string | null
  title_format: string | null
}

interface Props {
  quotation: Quotation
  items: QuotationItem[]
}

export default function PDFDownloadButton({ quotation, items }: Props) {
  const [generating, setGenerating] = useState(false)
  const [showMenu, setShowMenu] = useState(false)
  const [templates, setTemplates] = useState<(TemplateConfig & { id: string; name: string; layout_type: string })[]>([])
  const supabase = createClient()

  useEffect(() => {
    supabase.from('quotation_templates').select('*').order('is_default', { ascending: false }).then(({ data }) => {
      if (data) setTemplates(data as any)
    })
  }, [])

  const buildPdfData = (tpl?: TemplateConfig) => ({
    quotation_date: quotation.quotation_date,
    recipient_company: quotation.customer_name,
    contact_person: quotation.contact_person,
    project_name: quotation.project_name,
    validity: quotation.valid_until ? `${quotation.valid_until}까지` : '견적일로부터 1개월',
    quotation_type: quotation.quotation_type,
    title: tpl?.title_format || null,
    total_amount: Number(quotation.subtotal) || 0,
    discount_amount: Number(quotation.discount_amount) || 0,
    discount_type: quotation.discount_type,
    discount_value: Number(quotation.discount_value) || 0,
    vat_amount: Number(quotation.vat) || 0,
    final_amount: Number(quotation.total) || 0,
    // terms = 안내사항 (고객 보임), notes = 내부 메모 (PDF에 표시 안 함)
    notes: quotation.terms || tpl?.default_notes || null,
    assigned_user: (quotation as any).creator ? { name: (quotation as any).creator.name, email: (quotation as any).creator.email, phone: (quotation as any).creator.phone } : null,
    // Template config
    logo_left_url: tpl?.logo_left_url || null,
    logo_right_url: tpl?.logo_right_url || null,
    stamp_url: tpl?.stamp_url || null,
    company: tpl ? {
      name: tpl.company_name,
      bizNo: tpl.biz_number,
      ceo: tpl.ceo_name,
      address: tpl.company_address,
      phone: tpl.company_phone,
      bank: tpl.bank_info,
    } : undefined,
    footer_left: tpl?.footer_left || null,
    footer_right: tpl?.footer_right || null,
    items: items.map(i => ({
      item_no: i.item_no,
      category: i.category,
      item_name: i.item_name,
      description: i.description,
      unit_price: Number(i.unit_price) || null,
      quantity: Number(i.quantity) || null,
      unit: i.unit,
      period_months: Number(i.period_months) || null,
      supply_method: i.supply_method,
      amount: Number(i.amount) || null,
      notes: i.notes,
    })),
  })

  const handleDownload = async (tplId: string, layoutType: string) => {
    setGenerating(true)
    setShowMenu(false)
    try {
      const tpl = templates.find(t => t.id === tplId)
      const data = buildPdfData(tpl)
      const doc = layoutType === 'B' ? <TemplateB data={data} /> : <TemplateA data={data} />
      const blob = await pdf(doc).toBlob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      const fileName = `[${quotation.customer_name || '견적서'}] 카스웍스 견적서 - ${quotation.quotation_number}.pdf`
      a.href = url
      a.download = fileName
      a.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      console.error('PDF generation error:', err)
      alert('PDF 생성 중 오류가 발생했습니다.')
    }
    setGenerating(false)
  }

  return (
    <div className="relative">
      <Button
        variant="secondary"
        size="sm"
        onClick={() => setShowMenu(!showMenu)}
        disabled={generating}
      >
        {generating ? (
          <>
            <div className="w-4 h-4 mr-1 border-2 border-gray-300 border-t-primary-600 rounded-full animate-spin" />
            생성 중...
          </>
        ) : (
          <>
            <Download className="w-4 h-4 mr-1" /> PDF
          </>
        )}
      </Button>

      {showMenu && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setShowMenu(false)} />
          <div className="absolute right-0 top-full mt-1 z-20 bg-white border rounded-lg shadow-lg py-1 w-64">
            <div className="px-3 py-1.5 text-[10px] text-gray-400 font-semibold uppercase">템플릿 선택</div>
            {templates.map(tpl => (
              <button
                key={tpl.id}
                className="w-full text-left px-4 py-2.5 text-sm hover:bg-blue-50 flex items-center gap-2"
                onClick={() => handleDownload(tpl.id, tpl.layout_type)}
              >
                <FileText className={`w-4 h-4 ${tpl.layout_type === 'A' ? 'text-blue-500' : tpl.layout_type === 'B' ? 'text-green-500' : 'text-purple-500'}`} />
                <div>
                  <p className="font-medium text-gray-900">{tpl.name}</p>
                  {tpl.logo_left_url && <p className="text-[10px] text-gray-400">로고 포함</p>}
                </div>
              </button>
            ))}
            {templates.length === 0 && (
              <>
                <button
                  className="w-full text-left px-4 py-2.5 text-sm hover:bg-blue-50 flex items-center gap-2"
                  onClick={() => handleDownload('default-a', 'A')}
                >
                  <FileText className="w-4 h-4 text-blue-500" />
                  <p className="font-medium text-gray-900">기본 양식 A</p>
                </button>
                <button
                  className="w-full text-left px-4 py-2.5 text-sm hover:bg-green-50 flex items-center gap-2"
                  onClick={() => handleDownload('default-b', 'B')}
                >
                  <FileText className="w-4 h-4 text-green-500" />
                  <p className="font-medium text-gray-900">기본 양식 B</p>
                </button>
              </>
            )}
          </div>
        </>
      )}
    </div>
  )
}
