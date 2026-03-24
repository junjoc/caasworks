'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { PageLoading } from '@/components/ui/loading'
import { useAuth } from '@/hooks/useAuth'
import { formatCurrency, formatNumber } from '@/lib/utils'
import type {
  QuotationType, SupplyMethod, DiscountType,
  Product, ProductCategory
} from '@/types/database'

interface LeadOption {
  id: string
  company_name: string
  contact_person: string | null
  core_need: string | null
  stage: string
}

interface UserOption {
  id: string
  name: string
}
import { toast } from 'sonner'
import {
  ArrowLeft, Plus, Trash2, Save, Send, GripVertical, Search,
  ChevronDown, ChevronUp, X
} from 'lucide-react'

// --- Types ---
interface FormItem {
  _key: string // client-only key for react
  id?: string
  item_no: number
  category: string
  product_id: string | null
  item_name: string
  description: string
  unit_price: number
  quantity: number
  unit: string
  period_months: number | null
  supply_method: SupplyMethod | null
  amount: number
  cost_price: number | null
  notes: string
  sort_order: number
}

const DEFAULT_TERMS = `1. 본 견적서의 유효기간은 발행일로부터 30일입니다.
2. 상기 금액은 부가세 별도입니다.
3. 설치 후 장비에 대한 보증기간은 1년입니다.
4. 임대 장비의 소유권은 당사에 있으며, 계약 종료 시 반납해 주셔야 합니다.
5. 기타 문의사항은 담당자에게 연락 부탁드립니다.`

const SUPPLY_METHOD_OPTIONS: { value: SupplyMethod; label: string }[] = [
  { value: '구매', label: '구매' },
  { value: '임대', label: '임대' },
  { value: '구독', label: '구독' },
  { value: '약정', label: '약정' },
]

const UNIT_OPTIONS = [
  { value: '대', label: '대' },
  { value: '식', label: '식' },
  { value: '개', label: '개' },
  { value: '건', label: '건' },
  { value: '개월', label: '개월' },
  { value: 'EA', label: 'EA' },
]

const QUOTATION_TYPE_OPTIONS: { value: QuotationType; label: string }[] = [
  { value: '구매', label: '구매' },
  { value: '임대', label: '임대' },
  { value: '혼합', label: '혼합' },
  { value: '구독', label: '구독' },
]

const DISCOUNT_TYPE_OPTIONS: { value: DiscountType; label: string }[] = [
  { value: 'none', label: '할인 없음' },
  { value: 'rate', label: '할인율(%)' },
  { value: 'amount', label: '할인금액' },
  { value: 'target', label: '목표금액' },
]

function createEmptyItem(itemNo: number): FormItem {
  return {
    _key: crypto.randomUUID(),
    item_no: itemNo,
    category: '',
    product_id: null,
    item_name: '',
    description: '',
    unit_price: 0,
    quantity: 1,
    unit: '대',
    period_months: null,
    supply_method: null,
    amount: 0,
    cost_price: null,
    notes: '',
    sort_order: itemNo,
  }
}

function calcItemAmount(item: FormItem): number {
  const period = item.period_months && item.period_months > 0 ? item.period_months : 1
  return item.unit_price * item.quantity * period
}

interface QuotationFormProps {
  editId?: string
}

export default function QuotationForm({ editId }: QuotationFormProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { user } = useAuth()
  const supabase = createClient()

  const copyFromId = searchParams.get('copy_from')
  const newVersionOfId = searchParams.get('new_version_of')
  const leadIdParam = searchParams.get('lead_id')

  const isEdit = !!editId
  const isCopy = !!copyFromId
  const isNewVersion = !!newVersionOfId

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  // Reference data
  const [products, setProducts] = useState<Product[]>([])
  const [categories, setCategories] = useState<ProductCategory[]>([])
  const [leads, setLeads] = useState<LeadOption[]>([])
  const [users, setUsers] = useState<UserOption[]>([])

  // Form state - header
  const [quotationNumber, setQuotationNumber] = useState('')
  const [quotationType, setQuotationType] = useState<QuotationType>('임대')
  const [customerName, setCustomerName] = useState('')
  const [contactPerson, setContactPerson] = useState('')
  const [projectName, setProjectName] = useState('')
  const [quotationDate, setQuotationDate] = useState(new Date().toISOString().split('T')[0])
  const [validUntil, setValidUntil] = useState(() => {
    const d = new Date()
    d.setMonth(d.getMonth() + 1)
    return d.toISOString().split('T')[0]
  })
  const [leadId, setLeadId] = useState<string | null>(null)
  const [version, setVersion] = useState(1)
  const [parentQuotationId, setParentQuotationId] = useState<string | null>(null)

  // Form state - items
  const [items, setItems] = useState<FormItem[]>([createEmptyItem(1)])

  // Form state - discount
  const [discountType, setDiscountType] = useState<DiscountType>('none')
  const [discountValue, setDiscountValue] = useState(0)
  const [vatIncluded, setVatIncluded] = useState(false)

  // Form state - extra
  const [deposit, setDeposit] = useState(0)
  const [depositNote, setDepositNote] = useState('')
  const [terms, setTerms] = useState(DEFAULT_TERMS)
  const [notes, setNotes] = useState('')

  // Lead search
  const [showLeadSearch, setShowLeadSearch] = useState(false)
  const [leadSearchQuery, setLeadSearchQuery] = useState('')

  // Product search dropdown
  const [activeProductSearch, setActiveProductSearch] = useState<string | null>(null)
  const [productSearchQuery, setProductSearchQuery] = useState('')

  // --- Calculations ---
  const subtotal = useMemo(() => items.reduce((sum, i) => sum + i.amount, 0), [items])

  const discountAmount = useMemo(() => {
    switch (discountType) {
      case 'none': return 0
      case 'rate': return Math.floor(subtotal * discountValue / 100)
      case 'amount': return discountValue
      case 'target': return Math.max(0, subtotal - discountValue)
      default: return 0
    }
  }, [discountType, discountValue, subtotal])

  const afterDiscount = subtotal - discountAmount
  const vat = vatIncluded ? 0 : Math.floor(afterDiscount * 0.1)
  const total = afterDiscount + vat

  // --- Data loading ---
  const loadReferenceData = useCallback(async () => {
    const [prodRes, catRes, leadRes, userRes] = await Promise.all([
      supabase.from('products').select('*, category:product_categories(id, name)').eq('is_active', true).order('sort_order'),
      supabase.from('product_categories').select('*').order('sort_order'),
      supabase.from('pipeline_leads').select('id, company_name, contact_person, core_need, stage').order('created_at', { ascending: false }).limit(200),
      supabase.from('users').select('id, name').eq('is_active', true),
    ])
    setProducts(prodRes.data || [])
    setCategories(catRes.data || [])
    setLeads(leadRes.data || [])
    setUsers(userRes.data || [])
  }, [supabase])

  const loadQuotation = useCallback(async (id: string) => {
    const { data: q } = await supabase
      .from('quotations')
      .select('*')
      .eq('id', id)
      .single()

    if (!q) {
      toast.error('견적서를 찾을 수 없습니다')
      router.push('/quotations')
      return
    }

    const { data: qItems } = await supabase
      .from('quotation_items')
      .select('*')
      .eq('quotation_id', id)
      .order('sort_order')

    // Fill form
    if (isEdit) {
      setQuotationNumber(q.quotation_number)
      setVersion(q.version)
      setParentQuotationId(q.parent_quotation_id)
    }

    if (isNewVersion) {
      setParentQuotationId(id)
      setVersion(q.version + 1)
      // Will generate new number on save
    }

    setQuotationType(q.quotation_type || '임대')
    setCustomerName(isCopy ? '' : q.customer_name)
    setContactPerson(isCopy ? '' : (q.contact_person || ''))
    setProjectName(q.project_name || '')
    setQuotationDate(isEdit ? q.quotation_date : new Date().toISOString().split('T')[0])
    setValidUntil(q.valid_until || '')
    setLeadId(isCopy ? null : (q.lead_id || null))
    setDiscountType(q.discount_type || 'none')
    setDiscountValue(q.discount_value || 0)
    setVatIncluded(q.vat_included || false)
    setDeposit(q.deposit || 0)
    setDepositNote(q.deposit_note || '')
    setTerms(q.terms || DEFAULT_TERMS)
    setNotes(q.notes || '')

    if (qItems && qItems.length > 0) {
      setItems(qItems.map((item: any, idx: number) => ({
        _key: crypto.randomUUID(),
        id: isEdit ? item.id : undefined,
        item_no: idx + 1,
        category: item.category || '',
        product_id: item.product_id,
        item_name: item.item_name,
        description: item.description || '',
        unit_price: item.unit_price,
        quantity: item.quantity,
        unit: item.unit || '대',
        period_months: item.period_months,
        supply_method: item.supply_method,
        amount: item.amount,
        cost_price: item.cost_price,
        notes: item.notes || '',
        sort_order: item.sort_order || idx + 1,
      })))
    }
  }, [supabase, isEdit, isCopy, isNewVersion, router])

  useEffect(() => {
    async function init() {
      setLoading(true)
      await loadReferenceData()

      const sourceId = editId || copyFromId || newVersionOfId
      if (sourceId) {
        await loadQuotation(sourceId)
      } else if (leadIdParam) {
        // Pre-fill from lead
        const lead = leads.find(l => l.id === leadIdParam)
        if (lead) {
          setLeadId(lead.id)
          setCustomerName(lead.company_name)
          setContactPerson(lead.contact_person || '')
          setProjectName(lead.core_need || '')
        } else {
          setLeadId(leadIdParam)
          // Fetch lead info
          const { data: leadData } = await supabase
            .from('pipeline_leads')
            .select('id, company_name, contact_person, core_need')
            .eq('id', leadIdParam)
            .single()
          if (leadData) {
            setCustomerName(leadData.company_name)
            setContactPerson(leadData.contact_person || '')
            setProjectName(leadData.core_need || '')
          }
        }
      }

      setLoading(false)
    }
    init()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editId, copyFromId, newVersionOfId, leadIdParam])

  // --- Item handlers ---
  const updateItem = (key: string, field: keyof FormItem, value: any) => {
    setItems(prev => prev.map(item => {
      if (item._key !== key) return item
      const updated = { ...item, [field]: value }
      updated.amount = calcItemAmount(updated)
      return updated
    }))
  }

  const addItem = () => {
    setItems(prev => [...prev, createEmptyItem(prev.length + 1)])
  }

  const removeItem = (key: string) => {
    setItems(prev => {
      const filtered = prev.filter(i => i._key !== key)
      return filtered.map((item, idx) => ({ ...item, item_no: idx + 1, sort_order: idx + 1 }))
    })
  }

  const moveItem = (key: string, direction: 'up' | 'down') => {
    setItems(prev => {
      const idx = prev.findIndex(i => i._key === key)
      if (idx < 0) return prev
      if (direction === 'up' && idx === 0) return prev
      if (direction === 'down' && idx === prev.length - 1) return prev
      const newItems = [...prev]
      const swapIdx = direction === 'up' ? idx - 1 : idx + 1
      ;[newItems[idx], newItems[swapIdx]] = [newItems[swapIdx], newItems[idx]]
      return newItems.map((item, i) => ({ ...item, item_no: i + 1, sort_order: i + 1 }))
    })
  }

  const selectProduct = (key: string, product: Product) => {
    setItems(prev => prev.map(item => {
      if (item._key !== key) return item
      const priceMap: Record<string, number | null> = {
        '구매': product.purchase_price,
        '임대': product.rental_price,
        '구독': product.subscription_price,
      }
      const method = product.default_supply_method as SupplyMethod | null
      const price = (method && priceMap[method]) || product.rental_price || product.purchase_price || 0
      const updated: FormItem = {
        ...item,
        product_id: product.id,
        item_name: product.name,
        description: product.description || '',
        unit_price: price || 0,
        unit: product.unit || '대',
        supply_method: method || null,
        cost_price: product.cost_price,
        category: product.category?.name || '',
      }
      updated.amount = calcItemAmount(updated)
      return updated
    }))
    setActiveProductSearch(null)
    setProductSearchQuery('')
  }

  // --- Lead selection ---
  const selectLead = (lead: LeadOption) => {
    setLeadId(lead.id)
    setCustomerName(lead.company_name)
    setContactPerson(lead.contact_person || '')
    if (!projectName) setProjectName(lead.core_need || '')
    setShowLeadSearch(false)
    setLeadSearchQuery('')
  }

  const filteredLeads = useMemo(() => {
    if (!leadSearchQuery) return leads.slice(0, 20)
    const q = leadSearchQuery.toLowerCase()
    return leads.filter(l =>
      l.company_name.toLowerCase().includes(q) ||
      (l.contact_person && l.contact_person.toLowerCase().includes(q))
    ).slice(0, 20)
  }, [leads, leadSearchQuery])

  const filteredProducts = useMemo(() => {
    if (!productSearchQuery) return products.slice(0, 30)
    const q = productSearchQuery.toLowerCase()
    return products.filter(p =>
      p.name.toLowerCase().includes(q) ||
      (p.description && p.description.toLowerCase().includes(q)) ||
      (p.category?.name && p.category.name.toLowerCase().includes(q))
    ).slice(0, 30)
  }, [products, productSearchQuery])

  // --- Generate quotation number ---
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

  // --- Save ---
  const handleSave = async (sendStatus?: 'sent') => {
    if (!customerName.trim()) {
      toast.error('수신처(고객사명)를 입력해주세요')
      return
    }
    if (items.length === 0 || !items.some(i => i.item_name.trim())) {
      toast.error('최소 1개의 항목을 입력해주세요')
      return
    }
    if (!user) {
      toast.error('로그인이 필요합니다')
      return
    }

    setSaving(true)
    try {
      const status = sendStatus || 'draft'
      let qNumber = quotationNumber

      if (!isEdit) {
        qNumber = await generateNumber()
      }

      const quotationData = {
        quotation_number: qNumber,
        lead_id: leadId || null,
        customer_name: customerName.trim(),
        contact_person: contactPerson.trim() || null,
        project_name: projectName.trim() || null,
        quotation_type: quotationType,
        version,
        parent_quotation_id: parentQuotationId,
        status,
        quotation_date: quotationDate,
        valid_until: validUntil || null,
        subtotal,
        discount_type: discountType,
        discount_value: discountValue,
        discount_amount: discountAmount,
        vat_included: vatIncluded,
        vat,
        total,
        deposit: deposit || 0,
        deposit_note: depositNote || null,
        notes: notes || null,
        terms: terms || null,
        created_by: user.id,
      }

      let quotationId: string

      if (isEdit) {
        const { error } = await supabase
          .from('quotations')
          .update(quotationData)
          .eq('id', editId)
        if (error) throw error
        quotationId = editId

        // Delete old items and re-insert
        await supabase.from('quotation_items').delete().eq('quotation_id', editId)
      } else {
        const { data: inserted, error } = await supabase
          .from('quotations')
          .insert(quotationData)
          .select('id')
          .single()
        if (error) throw error
        quotationId = inserted.id
      }

      // Insert items
      const validItems = items.filter(i => i.item_name.trim())
      if (validItems.length > 0) {
        const itemsToInsert = validItems.map((item, idx) => ({
          quotation_id: quotationId,
          item_no: idx + 1,
          category: item.category || null,
          product_id: item.product_id || null,
          item_name: item.item_name.trim(),
          description: item.description || null,
          unit_price: item.unit_price,
          quantity: item.quantity,
          unit: item.unit,
          period_months: item.period_months || null,
          supply_method: item.supply_method || null,
          amount: item.amount,
          cost_price: item.cost_price || null,
          notes: item.notes || null,
          sort_order: idx + 1,
        }))
        const { error: itemsError } = await supabase.from('quotation_items').insert(itemsToInsert)
        if (itemsError) throw itemsError
      }

      toast.success(isEdit ? '견적서가 수정되었습니다' : '견적서가 저장되었습니다')
      router.push(`/quotations/${quotationId}`)
    } catch (err: any) {
      console.error('Save error:', err)
      toast.error('저장 실패: ' + (err.message || ''))
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <PageLoading />

  return (
    <div className="max-w-6xl mx-auto">
      {/* Header */}
      <div className="page-header">
        <div className="flex items-center gap-3">
          <Link href="/quotations">
            <Button variant="ghost" size="sm"><ArrowLeft className="w-4 h-4" /></Button>
          </Link>
          <h1 className="page-title">
            {isEdit ? '견적서 수정' : isNewVersion ? '새 버전 작성' : isCopy ? '견적서 복사' : '견적서 작성'}
          </h1>
          {quotationNumber && (
            <span className="text-sm font-mono text-gray-500">{quotationNumber}</span>
          )}
          {version > 1 && (
            <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded">v{version}</span>
          )}
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => handleSave()} loading={saving} disabled={saving}>
            <Save className="w-4 h-4 mr-1" /> 초안 저장
          </Button>
          <Button onClick={() => handleSave('sent')} loading={saving} disabled={saving}>
            <Send className="w-4 h-4 mr-1" /> 발송 처리
          </Button>
        </div>
      </div>

      {/* Form Sections */}
      <div className="space-y-6">

        {/* Section 1: Header Info */}
        <div className="card p-6">
          <h2 className="text-base font-semibold mb-4">기본 정보</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {/* Quotation Type */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">견적 유형</label>
              <div className="flex gap-2">
                {QUOTATION_TYPE_OPTIONS.map(opt => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setQuotationType(opt.value)}
                    className={`px-3 py-1.5 text-sm rounded-lg border transition-colors ${
                      quotationType === opt.value
                        ? 'bg-primary-600 text-white border-primary-600'
                        : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Customer Name */}
            <div>
              <Input
                label="수신처 (고객사명) *"
                value={customerName}
                onChange={e => setCustomerName(e.target.value)}
                placeholder="고객사명 입력"
              />
            </div>

            {/* Contact Person */}
            <div>
              <Input
                label="담당자명"
                value={contactPerson}
                onChange={e => setContactPerson(e.target.value)}
                placeholder="고객 담당자"
              />
            </div>

            {/* Project Name */}
            <div>
              <Input
                label="공사명"
                value={projectName}
                onChange={e => setProjectName(e.target.value)}
                placeholder="공사명 / 프로젝트명"
              />
            </div>

            {/* Quotation Date */}
            <div>
              <Input
                label="견적일"
                type="date"
                value={quotationDate}
                onChange={e => setQuotationDate(e.target.value)}
              />
            </div>

            {/* Valid Until */}
            <div>
              <Input
                label="유효기간"
                type="date"
                value={validUntil}
                onChange={e => setValidUntil(e.target.value)}
              />
            </div>

            {/* Connected Lead */}
            <div className="relative">
              <label className="block text-sm font-medium text-gray-700 mb-1">연결 리드</label>
              {leadId ? (
                <div className="flex items-center gap-2 border rounded-lg px-3 py-2 bg-gray-50">
                  <span className="text-sm flex-1 truncate">
                    {leads.find(l => l.id === leadId)?.company_name || customerName}
                  </span>
                  <button
                    type="button"
                    onClick={() => { setLeadId(null) }}
                    className="text-gray-400 hover:text-gray-600"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setShowLeadSearch(!showLeadSearch)}
                  className="w-full text-left border rounded-lg px-3 py-2 text-sm text-gray-500 hover:bg-gray-50"
                >
                  파이프라인 리드 선택...
                </button>
              )}
              {showLeadSearch && (
                <div className="absolute z-30 top-full mt-1 left-0 w-80 bg-white border rounded-lg shadow-xl max-h-64 overflow-auto">
                  <div className="sticky top-0 bg-white p-2 border-b">
                    <Input
                      placeholder="회사명 검색..."
                      value={leadSearchQuery}
                      onChange={e => setLeadSearchQuery(e.target.value)}
                      className="text-sm"
                      autoFocus
                    />
                  </div>
                  {filteredLeads.map(lead => (
                    <button
                      key={lead.id}
                      type="button"
                      onClick={() => selectLead(lead)}
                      className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 border-b last:border-0"
                    >
                      <span className="font-medium">{lead.company_name}</span>
                      {lead.contact_person && (
                        <span className="text-gray-500 ml-2">{lead.contact_person}</span>
                      )}
                      <span className="text-xs text-gray-400 ml-2">{lead.stage}</span>
                    </button>
                  ))}
                  {filteredLeads.length === 0 && (
                    <div className="px-3 py-4 text-sm text-gray-500 text-center">검색 결과 없음</div>
                  )}
                </div>
              )}
            </div>

            {/* Assigned User (display only) */}
            <div>
              <Input
                label="견적 담당자"
                value={user?.name || ''}
                disabled
              />
            </div>
          </div>
        </div>

        {/* Section 2: Items */}
        <div className="card p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold">견적 항목</h2>
            <Button variant="secondary" size="sm" onClick={addItem}>
              <Plus className="w-4 h-4 mr-1" /> 항목 추가
            </Button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-gray-50">
                  <th className="px-2 py-2 text-center w-8">No</th>
                  <th className="px-2 py-2 text-left w-24">구분</th>
                  <th className="px-2 py-2 text-left min-w-[180px]">품명</th>
                  <th className="px-2 py-2 text-left min-w-[140px]">상세</th>
                  <th className="px-2 py-2 text-right w-28">단가</th>
                  <th className="px-2 py-2 text-center w-16">수량</th>
                  <th className="px-2 py-2 text-center w-16">단위</th>
                  <th className="px-2 py-2 text-center w-16">기간(월)</th>
                  <th className="px-2 py-2 text-center w-20">공급방식</th>
                  <th className="px-2 py-2 text-right w-28">공급가</th>
                  <th className="px-2 py-2 text-center w-20">비고</th>
                  <th className="px-2 py-2 text-center w-16"></th>
                </tr>
              </thead>
              <tbody>
                {items.map((item, idx) => (
                  <tr key={item._key} className="border-b hover:bg-gray-50 group">
                    <td className="px-2 py-1 text-center text-gray-500">
                      <div className="flex items-center gap-1">
                        <div className="flex flex-col opacity-0 group-hover:opacity-100">
                          <button
                            type="button"
                            onClick={() => moveItem(item._key, 'up')}
                            className="text-gray-400 hover:text-gray-600"
                            disabled={idx === 0}
                          >
                            <ChevronUp className="w-3 h-3" />
                          </button>
                          <button
                            type="button"
                            onClick={() => moveItem(item._key, 'down')}
                            className="text-gray-400 hover:text-gray-600"
                            disabled={idx === items.length - 1}
                          >
                            <ChevronDown className="w-3 h-3" />
                          </button>
                        </div>
                        <span>{item.item_no}</span>
                      </div>
                    </td>
                    <td className="px-2 py-1">
                      <input
                        className="w-full border rounded px-2 py-1 text-xs"
                        value={item.category}
                        onChange={e => updateItem(item._key, 'category', e.target.value)}
                        placeholder="카테고리"
                        list="category-list"
                      />
                    </td>
                    <td className="px-2 py-1 relative">
                      <div className="flex gap-1">
                        <input
                          className="flex-1 border rounded px-2 py-1 text-xs"
                          value={item.item_name}
                          onChange={e => updateItem(item._key, 'item_name', e.target.value)}
                          placeholder="품명 입력 또는 제품 선택"
                          onFocus={() => {
                            setActiveProductSearch(item._key)
                            setProductSearchQuery('')
                          }}
                        />
                        <button
                          type="button"
                          onClick={() => {
                            setActiveProductSearch(activeProductSearch === item._key ? null : item._key)
                            setProductSearchQuery('')
                          }}
                          className="text-gray-400 hover:text-gray-600 px-1"
                        >
                          <Search className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      {activeProductSearch === item._key && (
                        <div className="absolute z-30 top-full mt-1 left-0 w-96 bg-white border rounded-lg shadow-xl max-h-64 overflow-auto">
                          <div className="sticky top-0 bg-white p-2 border-b">
                            <input
                              className="w-full border rounded px-2 py-1 text-xs"
                              placeholder="제품 검색..."
                              value={productSearchQuery}
                              onChange={e => setProductSearchQuery(e.target.value)}
                              autoFocus
                            />
                          </div>
                          {filteredProducts.map(p => (
                            <button
                              key={p.id}
                              type="button"
                              onClick={() => selectProduct(item._key, p)}
                              className="w-full text-left px-3 py-2 text-xs hover:bg-gray-50 border-b last:border-0"
                            >
                              <div className="flex justify-between">
                                <span className="font-medium">{p.name}</span>
                                <span className="text-gray-500">
                                  {p.rental_price ? `임대 ${formatNumber(p.rental_price)}` : ''}
                                  {p.purchase_price ? ` / 구매 ${formatNumber(p.purchase_price)}` : ''}
                                </span>
                              </div>
                              {p.category?.name && (
                                <span className="text-gray-400">{p.category.name}</span>
                              )}
                            </button>
                          ))}
                          {filteredProducts.length === 0 && (
                            <div className="px-3 py-3 text-xs text-gray-500 text-center">제품 없음</div>
                          )}
                        </div>
                      )}
                    </td>
                    <td className="px-2 py-1">
                      <input
                        className="w-full border rounded px-2 py-1 text-xs"
                        value={item.description}
                        onChange={e => updateItem(item._key, 'description', e.target.value)}
                        placeholder="상세 설명"
                      />
                    </td>
                    <td className="px-2 py-1">
                      <input
                        className="w-full border rounded px-2 py-1 text-xs text-right"
                        type="number"
                        value={item.unit_price || ''}
                        onChange={e => updateItem(item._key, 'unit_price', Number(e.target.value))}
                        placeholder="0"
                      />
                    </td>
                    <td className="px-2 py-1">
                      <input
                        className="w-full border rounded px-2 py-1 text-xs text-center"
                        type="number"
                        min={1}
                        value={item.quantity || ''}
                        onChange={e => updateItem(item._key, 'quantity', Number(e.target.value))}
                      />
                    </td>
                    <td className="px-2 py-1">
                      <select
                        className="w-full border rounded px-1 py-1 text-xs"
                        value={item.unit}
                        onChange={e => updateItem(item._key, 'unit', e.target.value)}
                      >
                        {UNIT_OPTIONS.map(o => (
                          <option key={o.value} value={o.value}>{o.label}</option>
                        ))}
                      </select>
                    </td>
                    <td className="px-2 py-1">
                      <input
                        className="w-full border rounded px-2 py-1 text-xs text-center"
                        type="number"
                        min={0}
                        value={item.period_months ?? ''}
                        onChange={e => updateItem(item._key, 'period_months', e.target.value ? Number(e.target.value) : null)}
                        placeholder="-"
                      />
                    </td>
                    <td className="px-2 py-1">
                      <select
                        className="w-full border rounded px-1 py-1 text-xs"
                        value={item.supply_method || ''}
                        onChange={e => updateItem(item._key, 'supply_method', e.target.value || null)}
                      >
                        <option value="">-</option>
                        {SUPPLY_METHOD_OPTIONS.map(o => (
                          <option key={o.value} value={o.value}>{o.label}</option>
                        ))}
                      </select>
                    </td>
                    <td className="px-2 py-1 text-right font-medium text-xs">
                      {formatNumber(item.amount)}
                    </td>
                    <td className="px-2 py-1">
                      <input
                        className="w-full border rounded px-2 py-1 text-xs"
                        value={item.notes}
                        onChange={e => updateItem(item._key, 'notes', e.target.value)}
                        placeholder=""
                      />
                    </td>
                    <td className="px-2 py-1 text-center">
                      <button
                        type="button"
                        onClick={() => removeItem(item._key)}
                        className="text-gray-400 hover:text-red-500 p-1"
                        disabled={items.length <= 1}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-3">
            <Button variant="ghost" size="sm" onClick={addItem}>
              <Plus className="w-4 h-4 mr-1" /> 빈 행 추가
            </Button>
          </div>

          {/* Category datalist */}
          <datalist id="category-list">
            {categories.map(c => (
              <option key={c.id} value={c.name} />
            ))}
          </datalist>
        </div>

        {/* Section 3: Discount & Totals */}
        <div className="card p-6">
          <h2 className="text-base font-semibold mb-4">할인 및 합계</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Left: Discount controls */}
            <div className="space-y-4">
              <div>
                <Select
                  label="할인 유형"
                  value={discountType}
                  onChange={e => {
                    setDiscountType(e.target.value as DiscountType)
                    setDiscountValue(0)
                  }}
                  options={DISCOUNT_TYPE_OPTIONS}
                />
              </div>
              {discountType !== 'none' && (
                <div>
                  <Input
                    label={
                      discountType === 'rate' ? '할인율 (%)' :
                      discountType === 'amount' ? '할인금액' :
                      '목표금액'
                    }
                    type="number"
                    value={discountValue || ''}
                    onChange={e => setDiscountValue(Number(e.target.value))}
                    placeholder={discountType === 'rate' ? '10' : '0'}
                  />
                  {discountType === 'rate' && discountValue > 0 && (
                    <p className="text-xs text-gray-500 mt-1">
                      할인금액: {formatCurrency(discountAmount)}
                    </p>
                  )}
                  {discountType === 'target' && discountValue > 0 && (
                    <p className="text-xs text-gray-500 mt-1">
                      할인금액: {formatCurrency(discountAmount)} (소계 {formatCurrency(subtotal)} - 목표 {formatCurrency(discountValue)})
                    </p>
                  )}
                </div>
              )}
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="vatIncluded"
                  checked={vatIncluded}
                  onChange={e => setVatIncluded(e.target.checked)}
                  className="rounded"
                />
                <label htmlFor="vatIncluded" className="text-sm text-gray-700">
                  부가세 포함 (VAT 별도 표시 안함)
                </label>
              </div>
            </div>

            {/* Right: Totals summary */}
            <div className="bg-gray-50 rounded-lg p-4 space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">소계</span>
                <span className="font-medium">{formatCurrency(subtotal)}</span>
              </div>
              {discountAmount > 0 && (
                <div className="flex justify-between text-sm text-red-600">
                  <span>할인</span>
                  <span>-{formatCurrency(discountAmount)}</span>
                </div>
              )}
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">할인 후 금액</span>
                <span className="font-medium">{formatCurrency(afterDiscount)}</span>
              </div>
              {!vatIncluded && (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">부가세 (10%)</span>
                  <span>{formatCurrency(vat)}</span>
                </div>
              )}
              <hr />
              <div className="flex justify-between text-lg font-bold">
                <span>총합계</span>
                <span className="text-primary-600">{formatCurrency(total)}</span>
              </div>
              {vatIncluded && (
                <p className="text-xs text-gray-500">(부가세 포함)</p>
              )}
            </div>
          </div>
        </div>

        {/* Section 4: Deposit, Terms, Notes */}
        <div className="card p-6">
          <h2 className="text-base font-semibold mb-4">추가 정보</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Input
                label="보증금"
                type="number"
                value={deposit || ''}
                onChange={e => setDeposit(Number(e.target.value))}
                placeholder="0"
              />
            </div>
            <div>
              <Input
                label="보증금 메모"
                value={depositNote}
                onChange={e => setDepositNote(e.target.value)}
                placeholder="예: 카메라 반납 시 반환"
              />
            </div>
          </div>
          <div className="mt-4">
            <Textarea
              label="안내사항 / 약관"
              value={terms}
              onChange={e => setTerms(e.target.value)}
              rows={6}
            />
          </div>
          <div className="mt-4">
            <Textarea
              label="내부 메모 (고객에게 보이지 않음)"
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="내부 참고용 메모"
              rows={3}
            />
          </div>
        </div>

        {/* Bottom Actions */}
        <div className="flex justify-end gap-3 pb-8">
          <Link href="/quotations">
            <Button variant="secondary">취소</Button>
          </Link>
          <Button variant="secondary" onClick={() => handleSave()} loading={saving} disabled={saving}>
            <Save className="w-4 h-4 mr-1" /> 초안 저장
          </Button>
          <Button onClick={() => handleSave('sent')} loading={saving} disabled={saving}>
            <Send className="w-4 h-4 mr-1" /> 발송 처리
          </Button>
        </div>
      </div>

      {/* Click outside to close dropdowns */}
      {(showLeadSearch || activeProductSearch) && (
        <div
          className="fixed inset-0 z-20"
          onClick={() => {
            setShowLeadSearch(false)
            setActiveProductSearch(null)
          }}
        />
      )}
    </div>
  )
}
