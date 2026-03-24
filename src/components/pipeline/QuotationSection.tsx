'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Modal } from '@/components/ui/modal'
import { formatCurrency, formatDate } from '@/lib/utils'
import type { Quotation, QuotationItem, QuotationStatus } from '@/types/database'
import { toast } from 'sonner'
import {
  Plus, FileText, Trash2, Eye, Edit2, Send, CheckCircle, XCircle,
  Clock, Copy, ChevronDown, ChevronUp, Printer
} from 'lucide-react'

// ======== SQL for table creation (run in Supabase SQL editor) ========
/*
-- 견적서 테이블
CREATE TABLE quotations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  lead_id UUID NOT NULL REFERENCES pipeline_leads(id) ON DELETE CASCADE,
  quotation_number TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  subtotal BIGINT NOT NULL DEFAULT 0,
  vat BIGINT NOT NULL DEFAULT 0,
  total BIGINT NOT NULL DEFAULT 0,
  discount BIGINT NOT NULL DEFAULT 0,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'accepted', 'rejected', 'expired')),
  valid_until DATE,
  created_by UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 견적서 항목 테이블
CREATE TABLE quotation_items (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  quotation_id UUID NOT NULL REFERENCES quotations(id) ON DELETE CASCADE,
  item_name TEXT NOT NULL,
  description TEXT,
  quantity NUMERIC(10,2) NOT NULL DEFAULT 1,
  unit TEXT NOT NULL DEFAULT '식',
  unit_price BIGINT NOT NULL DEFAULT 0,
  amount BIGINT NOT NULL DEFAULT 0
);

-- 인덱스
CREATE INDEX idx_quotations_lead_id ON quotations(lead_id);
CREATE INDEX idx_quotation_items_quotation_id ON quotation_items(quotation_id);

-- RLS 정책
ALTER TABLE quotations ENABLE ROW LEVEL SECURITY;
ALTER TABLE quotation_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all for authenticated" ON quotations FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for authenticated" ON quotation_items FOR ALL USING (true) WITH CHECK (true);

-- 견적 번호 자동 생성 시퀀스 (연도별)
CREATE OR REPLACE FUNCTION generate_quotation_number()
RETURNS TEXT AS $$
DECLARE
  current_year TEXT;
  next_seq INT;
BEGIN
  current_year := TO_CHAR(NOW(), 'YYYY');
  SELECT COALESCE(MAX(
    CAST(SPLIT_PART(quotation_number, '-', 3) AS INT)
  ), 0) + 1
  INTO next_seq
  FROM quotations
  WHERE quotation_number LIKE 'Q-' || current_year || '-%';
  RETURN 'Q-' || current_year || '-' || LPAD(next_seq::TEXT, 3, '0');
END;
$$ LANGUAGE plpgsql;
*/

const STATUS_LABELS: Record<QuotationStatus, string> = {
  draft: '초안',
  sent: '발송',
  accepted: '수락',
  rejected: '거절',
  expired: '만료',
}

const STATUS_COLORS: Record<QuotationStatus, string> = {
  draft: 'bg-gray-100 text-gray-700',
  sent: 'bg-blue-100 text-blue-700',
  accepted: 'bg-green-100 text-green-700',
  rejected: 'bg-red-100 text-red-700',
  expired: 'bg-yellow-100 text-yellow-700',
}

const SERVICE_OPTIONS = [
  'AI CCTV',
  '스마트 안전장비',
  '동영상 기록관리',
  '공정관리 플랫폼',
  '중대재해예방',
  '운임비',
  '안전관리',
  '기타',
]

const UNIT_OPTIONS = [
  { value: '개월', label: '개월' },
  { value: '식', label: '식' },
  { value: '대', label: '대' },
  { value: '건', label: '건' },
]

interface EmptyItem {
  id: string
  item_name: string
  description: string
  quantity: number
  unit: string
  unit_price: number
  amount: number
}

function createEmptyItem(): EmptyItem {
  return {
    id: crypto.randomUUID(),
    item_name: '',
    description: '',
    quantity: 1,
    unit: '식',
    unit_price: 0,
    amount: 0,
  }
}

interface QuotationSectionProps {
  leadId: string
  companyName: string
  userId: string
}

export default function QuotationSection({ leadId, companyName, userId }: QuotationSectionProps) {
  const supabase = createClient()
  const [quotations, setQuotations] = useState<Quotation[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  // Modal states
  const [showFormModal, setShowFormModal] = useState(false)
  const [showPreviewModal, setShowPreviewModal] = useState(false)
  const [editingQuotation, setEditingQuotation] = useState<Quotation | null>(null)
  const [previewQuotation, setPreviewQuotation] = useState<Quotation | null>(null)
  const [saving, setSaving] = useState(false)

  // Form state
  const [formTitle, setFormTitle] = useState('')
  const [formItems, setFormItems] = useState<EmptyItem[]>([createEmptyItem()])
  const [formDiscount, setFormDiscount] = useState(0)
  const [formNotes, setFormNotes] = useState('')
  const [formValidUntil, setFormValidUntil] = useState('')

  const fetchQuotations = useCallback(async () => {
    const { data, error } = await supabase
      .from('quotations')
      .select('*, creator:users!quotations_created_by_fkey(id, name)')
      .eq('lead_id', leadId)
      .order('created_at', { ascending: false })

    if (!error && data) {
      // Fetch items for each quotation
      const quotationsWithItems = await Promise.all(
        data.map(async (q: any) => {
          const { data: items } = await supabase
            .from('quotation_items')
            .select('*')
            .eq('quotation_id', q.id)
            .order('id')
          return { ...q, items: items || [] } as Quotation
        })
      )
      setQuotations(quotationsWithItems)
    }
    setLoading(false)
  }, [leadId, supabase])

  useEffect(() => {
    fetchQuotations()
  }, [fetchQuotations])

  // Calculations
  const calcSubtotal = (items: EmptyItem[]) => items.reduce((sum, i) => sum + i.amount, 0)
  const calcVat = (subtotal: number, discount: number) => Math.floor((subtotal - discount) * 0.1)
  const calcTotal = (subtotal: number, discount: number, vat: number) => subtotal - discount + vat

  const updateItemAmount = (items: EmptyItem[], index: number, field: string, value: any): EmptyItem[] => {
    const updated = [...items]
    ;(updated[index] as any)[field] = value
    updated[index].amount = updated[index].quantity * updated[index].unit_price
    return updated
  }

  // Generate quotation number
  const generateNumber = async (): Promise<string> => {
    const year = new Date().getFullYear()
    const prefix = `Q-${year}-`
    const { data } = await supabase
      .from('quotations')
      .select('quotation_number')
      .like('quotation_number', `${prefix}%`)
      .order('quotation_number', { ascending: false })
      .limit(1)

    if (data && data.length > 0) {
      const lastNum = parseInt(data[0].quotation_number.split('-')[2], 10)
      return `${prefix}${String(lastNum + 1).padStart(3, '0')}`
    }
    return `${prefix}001`
  }

  // Open create modal
  const openCreateModal = () => {
    setEditingQuotation(null)
    setFormTitle('')
    setFormItems([createEmptyItem()])
    setFormDiscount(0)
    setFormNotes('')
    // Default valid_until: 30 days from now
    const d = new Date()
    d.setDate(d.getDate() + 30)
    setFormValidUntil(d.toISOString().split('T')[0])
    setShowFormModal(true)
  }

  // Open edit modal
  const openEditModal = (q: Quotation) => {
    setEditingQuotation(q)
    setFormTitle(q.title)
    setFormItems(
      q.items.map(i => ({
        id: i.id,
        item_name: i.item_name,
        description: i.description || '',
        quantity: i.quantity,
        unit: i.unit,
        unit_price: i.unit_price,
        amount: i.amount,
      }))
    )
    setFormDiscount(q.discount)
    setFormNotes(q.notes || '')
    setFormValidUntil(q.valid_until || '')
    setShowFormModal(true)
  }

  // Save quotation
  const saveQuotation = async () => {
    if (!formTitle.trim()) {
      toast.error('견적 제목을 입력해주세요.')
      return
    }
    if (formItems.some(i => !i.item_name)) {
      toast.error('모든 항목의 서비스명을 선택해주세요.')
      return
    }

    setSaving(true)
    const subtotal = calcSubtotal(formItems)
    const vat = calcVat(subtotal, formDiscount)
    const total = calcTotal(subtotal, formDiscount, vat)

    try {
      if (editingQuotation) {
        // Update existing
        const { error } = await supabase
          .from('quotations')
          .update({
            title: formTitle,
            subtotal,
            vat,
            total,
            discount: formDiscount,
            notes: formNotes || null,
            valid_until: formValidUntil || null,
            updated_at: new Date().toISOString(),
          })
          .eq('id', editingQuotation.id)

        if (error) throw error

        // Delete old items and insert new
        await supabase
          .from('quotation_items')
          .delete()
          .eq('quotation_id', editingQuotation.id)

        const { error: itemsError } = await supabase
          .from('quotation_items')
          .insert(
            formItems.map(i => ({
              quotation_id: editingQuotation.id,
              item_name: i.item_name,
              description: i.description || null,
              quantity: i.quantity,
              unit: i.unit,
              unit_price: i.unit_price,
              amount: i.amount,
            }))
          )

        if (itemsError) throw itemsError
        toast.success('견적서가 수정되었습니다.')
      } else {
        // Create new
        const quotationNumber = await generateNumber()
        const { data: newQ, error } = await supabase
          .from('quotations')
          .insert({
            lead_id: leadId,
            quotation_number: quotationNumber,
            title: formTitle,
            subtotal,
            vat,
            total,
            discount: formDiscount,
            notes: formNotes || null,
            valid_until: formValidUntil || null,
            status: 'draft',
            created_by: userId,
          })
          .select()
          .single()

        if (error) throw error

        const { error: itemsError } = await supabase
          .from('quotation_items')
          .insert(
            formItems.map(i => ({
              quotation_id: newQ.id,
              item_name: i.item_name,
              description: i.description || null,
              quantity: i.quantity,
              unit: i.unit,
              unit_price: i.unit_price,
              amount: i.amount,
            }))
          )

        if (itemsError) throw itemsError
        toast.success(`견적서 ${quotationNumber}이 생성되었습니다.`)
      }

      setShowFormModal(false)
      fetchQuotations()
    } catch (err: any) {
      toast.error(`저장 실패: ${err.message}`)
    }
    setSaving(false)
  }

  // Change status
  const changeStatus = async (quotationId: string, newStatus: QuotationStatus) => {
    const { error } = await supabase
      .from('quotations')
      .update({ status: newStatus, updated_at: new Date().toISOString() })
      .eq('id', quotationId)

    if (error) {
      toast.error('상태 변경에 실패했습니다.')
    } else {
      toast.success(`상태가 "${STATUS_LABELS[newStatus]}"(으)로 변경되었습니다.`)
      fetchQuotations()
    }
  }

  // Delete quotation
  const deleteQuotation = async (quotationId: string) => {
    if (!window.confirm('이 견적서를 삭제하시겠습니까?')) return
    const { error } = await supabase
      .from('quotations')
      .delete()
      .eq('id', quotationId)

    if (error) {
      toast.error('삭제에 실패했습니다.')
    } else {
      toast.success('견적서가 삭제되었습니다.')
      fetchQuotations()
    }
  }

  // Duplicate quotation
  const duplicateQuotation = async (q: Quotation) => {
    const newNumber = await generateNumber()
    const { data: newQ, error } = await supabase
      .from('quotations')
      .insert({
        lead_id: leadId,
        quotation_number: newNumber,
        title: `${q.title} (복사)`,
        subtotal: q.subtotal,
        vat: q.vat,
        total: q.total,
        discount: q.discount,
        notes: q.notes,
        valid_until: q.valid_until,
        status: 'draft',
        created_by: userId,
      })
      .select()
      .single()

    if (error) {
      toast.error('복제에 실패했습니다.')
      return
    }

    await supabase.from('quotation_items').insert(
      q.items.map(i => ({
        quotation_id: newQ.id,
        item_name: i.item_name,
        description: i.description,
        quantity: i.quantity,
        unit: i.unit,
        unit_price: i.unit_price,
        amount: i.amount,
      }))
    )

    toast.success(`견적서가 복제되었습니다. (${newNumber})`)
    fetchQuotations()
  }

  // Current form calculations
  const currentSubtotal = calcSubtotal(formItems)
  const currentVat = calcVat(currentSubtotal, formDiscount)
  const currentTotal = calcTotal(currentSubtotal, formDiscount, currentVat)

  return (
    <div className="card p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <FileText className="w-5 h-5 text-gray-400" />
          견적서
          {quotations.length > 0 && (
            <span className="text-sm font-normal text-gray-400">({quotations.length})</span>
          )}
        </h2>
        <Button size="sm" onClick={openCreateModal}>
          <Plus className="w-4 h-4 mr-1" /> 견적서 작성
        </Button>
      </div>

      {loading ? (
        <p className="text-sm text-gray-400">로딩 중...</p>
      ) : quotations.length === 0 ? (
        <div className="text-center py-8 text-gray-400">
          <FileText className="w-8 h-8 mx-auto mb-2 opacity-50" />
          <p className="text-sm">아직 견적서가 없습니다.</p>
          <p className="text-xs mt-1">"견적서 작성" 버튼으로 첫 견적서를 만들어보세요.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {quotations.map((q) => {
            const isExpanded = expandedId === q.id
            return (
              <div key={q.id} className="border rounded-lg overflow-hidden">
                {/* Header row */}
                <div
                  className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-gray-50 transition-colors"
                  onClick={() => setExpandedId(isExpanded ? null : q.id)}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-mono text-gray-400">{q.quotation_number}</span>
                      <Badge className={STATUS_COLORS[q.status]}>{STATUS_LABELS[q.status]}</Badge>
                    </div>
                    <p className="text-sm font-medium text-gray-900 mt-0.5 truncate">{q.title}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-semibold text-gray-900">{formatCurrency(q.total)}</p>
                    {q.valid_until && (
                      <p className="text-xs text-gray-400 mt-0.5">
                        ~{formatDate(q.valid_until)}
                      </p>
                    )}
                  </div>
                  {isExpanded ? (
                    <ChevronUp className="w-4 h-4 text-gray-400 shrink-0" />
                  ) : (
                    <ChevronDown className="w-4 h-4 text-gray-400 shrink-0" />
                  )}
                </div>

                {/* Expanded detail */}
                {isExpanded && (
                  <div className="border-t px-4 py-3 bg-gray-50 space-y-3">
                    {/* Items table */}
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="text-xs text-gray-500 border-b">
                            <th className="text-left py-1.5 font-medium">서비스명</th>
                            <th className="text-right py-1.5 font-medium w-16">수량</th>
                            <th className="text-center py-1.5 font-medium w-12">단위</th>
                            <th className="text-right py-1.5 font-medium w-24">단가</th>
                            <th className="text-right py-1.5 font-medium w-24">금액</th>
                          </tr>
                        </thead>
                        <tbody>
                          {q.items.map((item) => (
                            <tr key={item.id} className="border-b border-gray-100">
                              <td className="py-1.5">
                                <p className="font-medium text-gray-800">{item.item_name}</p>
                                {item.description && (
                                  <p className="text-xs text-gray-400">{item.description}</p>
                                )}
                              </td>
                              <td className="text-right py-1.5">{item.quantity}</td>
                              <td className="text-center py-1.5">{item.unit}</td>
                              <td className="text-right py-1.5">{formatCurrency(item.unit_price)}</td>
                              <td className="text-right py-1.5 font-medium">{formatCurrency(item.amount)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    {/* Totals */}
                    <div className="flex justify-end">
                      <div className="text-sm space-y-1 w-48">
                        <div className="flex justify-between">
                          <span className="text-gray-500">소계</span>
                          <span>{formatCurrency(q.subtotal)}</span>
                        </div>
                        {q.discount > 0 && (
                          <div className="flex justify-between text-red-500">
                            <span>할인</span>
                            <span>-{formatCurrency(q.discount)}</span>
                          </div>
                        )}
                        <div className="flex justify-between">
                          <span className="text-gray-500">부가세(10%)</span>
                          <span>{formatCurrency(q.vat)}</span>
                        </div>
                        <div className="flex justify-between font-semibold text-base border-t pt-1">
                          <span>합계</span>
                          <span>{formatCurrency(q.total)}</span>
                        </div>
                      </div>
                    </div>

                    {q.notes && (
                      <p className="text-xs text-gray-500 bg-white p-2 rounded border">
                        {q.notes}
                      </p>
                    )}

                    {/* Actions */}
                    <div className="flex flex-wrap items-center gap-2 pt-2 border-t">
                      {/* Status transitions */}
                      {q.status === 'draft' && (
                        <Button size="sm" onClick={(e) => { e.stopPropagation(); changeStatus(q.id, 'sent') }}>
                          <Send className="w-3.5 h-3.5 mr-1" /> 발송
                        </Button>
                      )}
                      {q.status === 'sent' && (
                        <>
                          <Button size="sm" onClick={(e) => { e.stopPropagation(); changeStatus(q.id, 'accepted') }}>
                            <CheckCircle className="w-3.5 h-3.5 mr-1" /> 수락
                          </Button>
                          <Button size="sm" variant="danger" onClick={(e) => { e.stopPropagation(); changeStatus(q.id, 'rejected') }}>
                            <XCircle className="w-3.5 h-3.5 mr-1" /> 거절
                          </Button>
                          <Button size="sm" variant="secondary" onClick={(e) => { e.stopPropagation(); changeStatus(q.id, 'expired') }}>
                            <Clock className="w-3.5 h-3.5 mr-1" /> 만료
                          </Button>
                        </>
                      )}

                      <div className="flex-1" />

                      <Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); setPreviewQuotation(q); setShowPreviewModal(true) }}>
                        <Eye className="w-3.5 h-3.5 mr-1" /> 미리보기
                      </Button>
                      {q.status === 'draft' && (
                        <Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); openEditModal(q) }}>
                          <Edit2 className="w-3.5 h-3.5 mr-1" /> 수정
                        </Button>
                      )}
                      <Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); duplicateQuotation(q) }}>
                        <Copy className="w-3.5 h-3.5 mr-1" /> 복제
                      </Button>
                      <Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); deleteQuotation(q.id) }} className="text-red-500 hover:text-red-700 hover:bg-red-50">
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* ====== Create/Edit Modal ====== */}
      <Modal
        open={showFormModal}
        onClose={() => setShowFormModal(false)}
        title={editingQuotation ? '견적서 수정' : '견적서 작성'}
        className="max-w-3xl"
      >
        <div className="space-y-4">
          <Input
            label="견적 제목"
            value={formTitle}
            onChange={(e) => setFormTitle(e.target.value)}
            placeholder="예: AI CCTV 도입 견적"
            required
          />

          {/* Items */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium text-gray-700">항목</label>
              <button
                type="button"
                onClick={() => setFormItems([...formItems, createEmptyItem()])}
                className="text-xs text-primary-600 hover:text-primary-700 font-medium flex items-center gap-0.5"
              >
                <Plus className="w-3.5 h-3.5" /> 항목 추가
              </button>
            </div>
            <div className="space-y-2">
              {formItems.map((item, idx) => (
                <div key={item.id} className="flex items-start gap-2 p-3 bg-gray-50 rounded-lg border">
                  <div className="flex-1 grid grid-cols-12 gap-2">
                    {/* Service name */}
                    <div className="col-span-4">
                      <Select
                        value={item.item_name}
                        onChange={(e) => setFormItems(prev => {
                          const updated = [...prev]
                          updated[idx].item_name = e.target.value
                          return updated
                        })}
                        options={SERVICE_OPTIONS.map(s => ({ value: s, label: s }))}
                        placeholder="서비스 선택"
                      />
                    </div>
                    {/* Description */}
                    <div className="col-span-8">
                      <input
                        type="text"
                        value={item.description}
                        onChange={(e) => setFormItems(prev => {
                          const updated = [...prev]
                          updated[idx].description = e.target.value
                          return updated
                        })}
                        placeholder="설명 (선택)"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                      />
                    </div>
                    {/* Quantity */}
                    <div className="col-span-2">
                      <input
                        type="number"
                        value={item.quantity}
                        onChange={(e) => setFormItems(updateItemAmount(formItems, idx, 'quantity', parseFloat(e.target.value) || 0))}
                        placeholder="수량"
                        min={0}
                        step={1}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-right focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                      />
                      <span className="text-[10px] text-gray-400 ml-1">수량</span>
                    </div>
                    {/* Unit */}
                    <div className="col-span-2">
                      <Select
                        value={item.unit}
                        onChange={(e) => setFormItems(prev => {
                          const updated = [...prev]
                          updated[idx].unit = e.target.value
                          return updated
                        })}
                        options={UNIT_OPTIONS}
                      />
                    </div>
                    {/* Unit price */}
                    <div className="col-span-4">
                      <input
                        type="number"
                        value={item.unit_price || ''}
                        onChange={(e) => setFormItems(updateItemAmount(formItems, idx, 'unit_price', parseInt(e.target.value) || 0))}
                        placeholder="단가"
                        min={0}
                        step={1000}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-right focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                      />
                      <span className="text-[10px] text-gray-400 ml-1">단가</span>
                    </div>
                    {/* Amount (readonly) */}
                    <div className="col-span-4 flex items-center">
                      <span className="text-sm font-medium text-gray-700 w-full text-right">
                        {formatCurrency(item.amount)}
                      </span>
                    </div>
                  </div>
                  {formItems.length > 1 && (
                    <button
                      type="button"
                      onClick={() => setFormItems(formItems.filter((_, i) => i !== idx))}
                      className="mt-2 text-gray-300 hover:text-red-500 transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Totals */}
          <div className="bg-gray-50 rounded-lg p-4 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">소계</span>
              <span className="font-medium">{formatCurrency(currentSubtotal)}</span>
            </div>
            <div className="flex justify-between text-sm items-center">
              <span className="text-gray-500">할인</span>
              <div className="flex items-center gap-2">
                <span className="text-red-500">-</span>
                <input
                  type="number"
                  value={formDiscount || ''}
                  onChange={(e) => setFormDiscount(parseInt(e.target.value) || 0)}
                  min={0}
                  step={10000}
                  className="w-32 px-2 py-1 border border-gray-300 rounded text-sm text-right focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                  placeholder="0"
                />
              </div>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">부가세 (10%)</span>
              <span>{formatCurrency(currentVat)}</span>
            </div>
            <div className="flex justify-between text-base font-semibold border-t pt-2">
              <span>합계</span>
              <span className="text-primary-600">{formatCurrency(currentTotal)}</span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Input
              label="유효기간"
              type="date"
              value={formValidUntil}
              onChange={(e) => setFormValidUntil(e.target.value)}
            />
            <div /> {/* spacer */}
          </div>

          <Textarea
            label="메모"
            value={formNotes}
            onChange={(e) => setFormNotes(e.target.value)}
            placeholder="추가 메모 (선택)"
          />

          <div className="flex gap-2 pt-2 border-t">
            <Button onClick={saveQuotation} loading={saving}>
              {editingQuotation ? '수정 저장' : '견적서 저장'}
            </Button>
            <Button variant="secondary" onClick={() => setShowFormModal(false)}>
              취소
            </Button>
          </div>
        </div>
      </Modal>

      {/* ====== Preview Modal ====== */}
      <Modal
        open={showPreviewModal}
        onClose={() => setShowPreviewModal(false)}
        title="견적서 미리보기"
        className="max-w-2xl"
      >
        {previewQuotation && (
          <div id="quotation-print-area">
            <div className="space-y-6 print:p-8">
              {/* Header */}
              <div className="text-center border-b pb-4">
                <h2 className="text-2xl font-bold text-gray-900">견 적 서</h2>
                <p className="text-sm text-gray-500 mt-1">{previewQuotation.quotation_number}</p>
              </div>

              {/* Info */}
              <div className="grid grid-cols-2 gap-6 text-sm">
                <div>
                  <h4 className="font-semibold text-gray-700 mb-2 border-b pb-1">수신</h4>
                  <p className="font-medium text-gray-900">{companyName} 귀중</p>
                </div>
                <div className="text-right">
                  <h4 className="font-semibold text-gray-700 mb-2 border-b pb-1">발신</h4>
                  <p className="font-medium text-gray-900">CaaS.Works</p>
                  <p className="text-gray-500 text-xs mt-0.5">(주) 아이콘</p>
                </div>
              </div>

              <div>
                <p className="text-sm">
                  <span className="text-gray-500">견적 제목:</span>{' '}
                  <span className="font-medium">{previewQuotation.title}</span>
                </p>
                {previewQuotation.valid_until && (
                  <p className="text-sm mt-1">
                    <span className="text-gray-500">유효기간:</span>{' '}
                    {formatDate(previewQuotation.valid_until)}까지
                  </p>
                )}
              </div>

              {/* Items */}
              <table className="w-full text-sm border">
                <thead>
                  <tr className="bg-gray-100 text-gray-700">
                    <th className="border px-3 py-2 text-left w-8">No</th>
                    <th className="border px-3 py-2 text-left">서비스명</th>
                    <th className="border px-3 py-2 text-right w-16">수량</th>
                    <th className="border px-3 py-2 text-center w-12">단위</th>
                    <th className="border px-3 py-2 text-right w-28">단가</th>
                    <th className="border px-3 py-2 text-right w-28">금액</th>
                  </tr>
                </thead>
                <tbody>
                  {previewQuotation.items.map((item, idx) => (
                    <tr key={item.id}>
                      <td className="border px-3 py-2 text-center text-gray-500">{idx + 1}</td>
                      <td className="border px-3 py-2">
                        <p className="font-medium">{item.item_name}</p>
                        {item.description && (
                          <p className="text-xs text-gray-400">{item.description}</p>
                        )}
                      </td>
                      <td className="border px-3 py-2 text-right">{item.quantity}</td>
                      <td className="border px-3 py-2 text-center">{item.unit}</td>
                      <td className="border px-3 py-2 text-right">{formatCurrency(item.unit_price)}</td>
                      <td className="border px-3 py-2 text-right font-medium">{formatCurrency(item.amount)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-gray-50">
                    <td colSpan={5} className="border px-3 py-2 text-right font-medium">소계</td>
                    <td className="border px-3 py-2 text-right font-medium">{formatCurrency(previewQuotation.subtotal)}</td>
                  </tr>
                  {previewQuotation.discount > 0 && (
                    <tr>
                      <td colSpan={5} className="border px-3 py-2 text-right font-medium text-red-500">할인</td>
                      <td className="border px-3 py-2 text-right font-medium text-red-500">-{formatCurrency(previewQuotation.discount)}</td>
                    </tr>
                  )}
                  <tr className="bg-gray-50">
                    <td colSpan={5} className="border px-3 py-2 text-right font-medium">부가세 (10%)</td>
                    <td className="border px-3 py-2 text-right font-medium">{formatCurrency(previewQuotation.vat)}</td>
                  </tr>
                  <tr className="bg-primary-50">
                    <td colSpan={5} className="border px-3 py-2 text-right font-bold text-lg">합계</td>
                    <td className="border px-3 py-2 text-right font-bold text-lg text-primary-700">{formatCurrency(previewQuotation.total)}</td>
                  </tr>
                </tfoot>
              </table>

              {previewQuotation.notes && (
                <div className="border rounded p-3">
                  <p className="text-xs text-gray-500 font-medium mb-1">비고</p>
                  <p className="text-sm text-gray-700 whitespace-pre-wrap">{previewQuotation.notes}</p>
                </div>
              )}
            </div>

            <div className="flex gap-2 pt-4 border-t mt-4 print:hidden">
              <Button
                size="sm"
                variant="secondary"
                onClick={() => {
                  const printContent = document.getElementById('quotation-print-area')
                  if (!printContent) return
                  const win = window.open('', '_blank')
                  if (!win) return
                  win.document.write(`
                    <html>
                      <head>
                        <title>견적서 - ${previewQuotation.quotation_number}</title>
                        <style>
                          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; padding: 40px; color: #111; }
                          table { border-collapse: collapse; width: 100%; }
                          th, td { border: 1px solid #ddd; padding: 8px 12px; }
                          th { background: #f5f5f5; }
                          .text-right { text-align: right; }
                          .text-center { text-align: center; }
                          .text-left { text-align: left; }
                          .font-medium { font-weight: 500; }
                          .font-bold { font-weight: 700; }
                          .text-sm { font-size: 14px; }
                          .text-xs { font-size: 12px; color: #888; }
                          @media print { body { padding: 20px; } }
                        </style>
                      </head>
                      <body>${printContent.innerHTML}</body>
                    </html>
                  `)
                  win.document.close()
                  win.print()
                }}
              >
                <Printer className="w-3.5 h-3.5 mr-1" /> 인쇄
              </Button>
              <Button size="sm" variant="secondary" onClick={() => setShowPreviewModal(false)}>
                닫기
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
