'use client'

import React, { useEffect, useState, useCallback, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { SearchSelect } from '@/components/ui/search-select'
import { Textarea } from '@/components/ui/textarea'
import { Modal } from '@/components/ui/modal'
import { Loading } from '@/components/ui/loading'
import { EmptyState } from '@/components/ui/empty-state'
import { formatCurrency, formatDate } from '@/lib/utils'
import { Plus, FileText, Check, Clock, AlertCircle, Search, Pencil, Trash2, X, Download, Info, ChevronLeft, ChevronRight, ChevronDown, Calendar, List } from 'lucide-react'
import { DateRangePicker, type DateRange } from '@/components/ui/date-range-picker'
import { toast } from 'sonner'
import { InvoicePDFButton } from '@/components/invoices/InvoicePDFButton'

const STATUS_COLORS: Record<string, string> = {
  draft: 'bg-status-gray-bg text-text-secondary',
  sent: 'bg-status-blue-bg text-status-blue',
  paid: 'bg-status-green-bg text-status-green',
  overdue: 'bg-status-red-bg text-status-red',
  cancelled: 'bg-status-gray-bg text-text-tertiary',
}
const STATUS_LABELS: Record<string, string> = {
  draft: '초안', sent: '발송', paid: '수납완료', overdue: '연체', cancelled: '취소',
}

interface InvoiceItem {
  id?: string
  project_name: string
  service_type: string
  period: string
  quantity: number
  unit_price: number
  amount: number
  notes: string
}

const emptyItem = (): InvoiceItem => ({
  project_name: '', service_type: '', period: '', quantity: 1, unit_price: 0, amount: 0, notes: '',
})

export default function InvoicesPage() {
  const [invoices, setInvoices] = useState<any[]>([])
  const [customers, setCustomers] = useState<any[]>([])
  const [projects, setProjects] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [year, setYear] = useState(new Date().getFullYear())
  const [month, setMonth] = useState(new Date().getMonth() + 1)
  const [viewAll, setViewAll] = useState(false)
  const [statusFilter, setStatusFilter] = useState('전체')
  const [dateRange, setDateRange] = useState<DateRange>({ from: '', to: '' })
  const [searchQuery, setSearchQuery] = useState('')
  const [groupByDate, setGroupByDate] = useState(false)
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({})
  const [modalOpen, setModalOpen] = useState(false)
  const [editingInvoice, setEditingInvoice] = useState<any>(null)
  const [saving, setSaving] = useState(false)
  const [deleteModal, setDeleteModal] = useState<any>(null)
  const [deleting, setDeleting] = useState(false)
  const supabase = createClient()

  // Payment due rules for auto-calculation
  const [dueRules, setDueRules] = useState<any[]>([])
  const [customerInvoiceGrouping, setCustomerInvoiceGrouping] = useState<string>('combined')

  // Form state
  const [form, setForm] = useState({
    customer_id: '',
    invoice_number: '',
    year: new Date().getFullYear(),
    month: new Date().getMonth() + 1,
    status: 'draft' as string,
    due_date: '',
    bank_info: '',
    notes: '',
  })
  const [items, setItems] = useState<InvoiceItem[]>([emptyItem()])

  const fetchInvoices = useCallback(async () => {
    setLoading(true)
    let query = supabase
      .from('invoices')
      .select('*, customer:customers(company_name), items:invoice_items(*)')
      .order('sent_at', { ascending: false, nullsFirst: false })
      .order('year', { ascending: false })
      .order('month', { ascending: false })

    // Date range mode — bypass year/month selectors entirely
    const dateRangeActive = !!(dateRange.from && dateRange.to)
    if (dateRangeActive) {
      // Fetch invoices whose issue date falls in the range.
      // We match by year/month composite since issue_date may be null.
      const fromY = parseInt(dateRange.from.substring(0, 4))
      const toY = parseInt(dateRange.to.substring(0, 4))
      if (fromY === toY) query = query.eq('year', fromY)
      else query = query.gte('year', fromY).lte('year', toY)
    } else {
      query = query.eq('year', year)
      if (!viewAll) query = query.eq('month', month)
    }

    if (statusFilter !== '전체') query = query.eq('status', statusFilter)

    const { data } = await query
    setInvoices((data || []).map((inv: any) => ({
      ...inv,
      customer_name: inv.customer?.company_name || '(알수없음)',
      _items: inv.items || [],
    })))
    setLoading(false)
  }, [year, month, viewAll, statusFilter, dateRange.from, dateRange.to])

  const fetchCustomers = useCallback(async () => {
    const { data } = await supabase.from('customers').select('id, company_name').eq('status', 'active').order('company_name')
    setCustomers(data || [])
  }, [])

  useEffect(() => { fetchInvoices() }, [fetchInvoices])
  useEffect(() => { fetchCustomers() }, [fetchCustomers])

  // When customer changes, fetch their projects
  const fetchProjectsForCustomer = async (customerId: string) => {
    if (!customerId) { setProjects([]); return }
    const { data } = await supabase.from('projects').select('*').eq('customer_id', customerId).eq('status', 'active').order('project_name')
    setProjects(data || [])
  }

  // Calculate due date from rule and billing month/year
  const calculateDueDate = (ruleType: string, fixedDay: number | null, billingYear: number, billingMonth: number): string => {
    if (ruleType === 'same_month_end') {
      const d = new Date(billingYear, billingMonth, 0) // last day of billing month
      return d.toISOString().split('T')[0]
    }
    if (ruleType === 'next_month_end') {
      const d = new Date(billingYear, billingMonth + 1, 0) // last day of billing month + 1
      return d.toISOString().split('T')[0]
    }
    if (ruleType === 'next_next_month_end') {
      const d = new Date(billingYear, billingMonth + 2, 0) // last day of billing month + 2
      return d.toISOString().split('T')[0]
    }
    if (ruleType === 'fixed_day' && fixedDay) {
      // next month, fixed day
      let m = billingMonth + 1
      let y = billingYear
      if (m > 12) { m = 1; y++ }
      const lastDay = new Date(y, m, 0).getDate()
      const day = Math.min(fixedDay, lastDay)
      return `${y}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    }
    return '' // custom or unknown
  }

  const fetchDueRulesForCustomer = async (customerId: string) => {
    if (!customerId) { setDueRules([]); return }
    const { data } = await supabase
      .from('payment_due_rules')
      .select('*, project:projects(id, project_name)')
      .eq('customer_id', customerId)
    setDueRules(data || [])
    // Also fetch invoice_grouping
    const { data: custData } = await supabase
      .from('customers')
      .select('invoice_grouping')
      .eq('id', customerId)
      .single()
    setCustomerInvoiceGrouping(custData?.invoice_grouping || 'combined')
  }

  const handleCustomerChange = (customerId: string) => {
    setForm(f => ({ ...f, customer_id: customerId }))
    fetchProjectsForCustomer(customerId)
    fetchDueRulesForCustomer(customerId)
    // Auto populate items from projects - group by site name
    if (customerId) {
      Promise.all([
        supabase.from('projects').select('*').eq('customer_id', customerId).eq('status', 'active').order('project_name'),
        supabase.from('payment_due_rules').select('*').eq('customer_id', customerId),
      ]).then(([projRes, rulesRes]) => {
        const data = projRes.data
        const rules = rulesRes.data || []
        // Auto-calculate due date from default (company-level) rule
        const defaultRule = rules.find((r: any) => !r.project_id)
        if (defaultRule) {
          const dueDate = calculateDueDate(defaultRule.rule_type, defaultRule.fixed_day, form.year, form.month)
          if (dueDate) {
            setForm(f => ({ ...f, due_date: dueDate }))
          }
        }
        if (data && data.length > 0) {
          const newItems = data.map(p => {
            const fullName = p.project_name || ''
            const dashIdx = fullName.indexOf(' - ')
            const siteName = dashIdx > 0 ? fullName.substring(0, dashIdx) : fullName
            const serviceName = dashIdx > 0 ? fullName.substring(dashIdx + 3) : (p.service_type || '')
            return {
              project_name: siteName,
              service_type: serviceName || p.service_type || (p.solutions ? String(p.solutions).split(',')[0]?.trim() : '') || '',
              period: `${form.year}.${String(form.month).padStart(2, '0')}`,
              quantity: 1,
              unit_price: Number(p.monthly_amount) || 0,
              amount: Number(p.monthly_amount) || 0,
              notes: '',
            }
          })
          // Sort by project_name so same sites are grouped together
          newItems.sort((a, b) => a.project_name.localeCompare(b.project_name))
          setItems(newItems)
        }
      })
    }
  }

  // Calculate totals
  const subtotal = items.reduce((sum, item) => sum + Number(item.amount || 0), 0)
  const vat = Math.round(subtotal * 0.1)
  const total = subtotal + vat

  const openNewInvoice = () => {
    setEditingInvoice(null)
    const now = new Date()
    setForm({
      customer_id: '',
      invoice_number: `INV-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getTime()).slice(-4)}`,
      year: now.getFullYear(),
      month: now.getMonth() + 1,
      status: 'draft',
      due_date: '',
      bank_info: '카스웍스(주) 기업은행 000-000000-00-000',
      notes: '',
    })
    setItems([emptyItem()])
    setProjects([])
    setModalOpen(true)
  }

  const openEditInvoice = async (inv: any) => {
    setEditingInvoice(inv)
    setForm({
      customer_id: inv.customer_id || '',
      invoice_number: inv.invoice_number || '',
      year: inv.year,
      month: inv.month,
      status: inv.status || 'draft',
      due_date: inv.due_date || '',
      bank_info: inv.bank_info || '',
      notes: inv.notes || '',
    })
    // Fetch items
    const { data: itemsData } = await supabase
      .from('invoice_items')
      .select('*')
      .eq('invoice_id', inv.id)
      .order('item_no')
    if (itemsData && itemsData.length > 0) {
      setItems(itemsData.map((it: any) => ({
        id: it.id,
        project_name: it.project_name || '',
        service_type: it.service_type || '',
        period: it.period || '',
        quantity: it.quantity || 1,
        unit_price: it.unit_price || 0,
        amount: it.amount || 0,
        notes: it.notes || '',
      })))
    } else {
      setItems([emptyItem()])
    }
    if (inv.customer_id) fetchProjectsForCustomer(inv.customer_id)
    setModalOpen(true)
  }

  const updateItem = (index: number, field: keyof InvoiceItem, value: any) => {
    setItems(prev => {
      const updated = [...prev]
      updated[index] = { ...updated[index], [field]: value }
      // Auto-calculate amount
      if (field === 'quantity' || field === 'unit_price') {
        updated[index].amount = Number(updated[index].quantity || 0) * Number(updated[index].unit_price || 0)
      }
      return updated
    })
  }

  const addItem = () => setItems(prev => [...prev, emptyItem()])
  const removeItem = (index: number) => {
    if (items.length <= 1) return
    setItems(prev => prev.filter((_, i) => i !== index))
  }

  const handleSave = async () => {
    if (!form.customer_id) { toast.error('고객사를 선택해주세요.'); return }
    if (items.every(it => !it.project_name && !it.amount)) { toast.error('항목을 하나 이상 입력해주세요.'); return }

    setSaving(true)
    try {
      const payload = {
        customer_id: form.customer_id,
        invoice_number: form.invoice_number,
        year: form.year,
        month: form.month,
        status: form.status,
        subtotal,
        vat,
        total,
        due_date: form.due_date || null,
        bank_info: form.bank_info || null,
        notes: form.notes || null,
      }

      let invoiceId: string
      if (editingInvoice) {
        const { error } = await supabase.from('invoices').update(payload).eq('id', editingInvoice.id)
        if (error) throw error
        invoiceId = editingInvoice.id
        // Delete old items
        await supabase.from('invoice_items').delete().eq('invoice_id', invoiceId)
      } else {
        const { data, error } = await supabase.from('invoices').insert(payload).select().single()
        if (error) throw error
        invoiceId = data.id
      }

      // Insert items
      const validItems = items.filter(it => it.project_name || it.amount)
      if (validItems.length > 0) {
        const { error: itemsError } = await supabase.from('invoice_items').insert(
          validItems.map((it, idx) => ({
            invoice_id: invoiceId,
            item_no: idx + 1,
            project_name: it.project_name || null,
            service_type: it.service_type || null,
            period: it.period || null,
            quantity: Number(it.quantity) || 1,
            unit_price: Number(it.unit_price) || 0,
            amount: Number(it.amount) || 0,
            notes: it.notes || null,
          }))
        )
        if (itemsError) throw itemsError
      }

      toast.success(editingInvoice ? '청구서가 수정되었습니다.' : '청구서가 생성되었습니다.')
      setModalOpen(false)
      fetchInvoices()
    } catch (err: any) {
      console.error('Save error:', err)
      toast.error('저장에 실패했습니다: ' + (err?.message || ''))
    }
    setSaving(false)
  }

  const handleDelete = async () => {
    if (!deleteModal) return
    setDeleting(true)
    try {
      await supabase.from('invoice_items').delete().eq('invoice_id', deleteModal.id)
      const { error } = await supabase.from('invoices').delete().eq('id', deleteModal.id)
      if (error) throw error
      toast.success('청구서가 삭제되었습니다.')
      setDeleteModal(null)
      fetchInvoices()
    } catch (err: any) {
      toast.error('삭제에 실패했습니다.')
    }
    setDeleting(false)
  }

  const handleStatusChange = async (inv: any, newStatus: string) => {
    const updateData: any = { status: newStatus }
    if (newStatus === 'paid') updateData.paid_at = new Date().toISOString()
    if (newStatus === 'sent') updateData.sent_at = new Date().toISOString()
    const { error } = await supabase.from('invoices').update(updateData).eq('id', inv.id)
    if (error) { toast.error('상태 변경 실패'); return }
    toast.success(`상태가 '${STATUS_LABELS[newStatus]}'(으)로 변경되었습니다.`)
    fetchInvoices()
  }

  const dateFiltered = useMemo(() => {
    if (!dateRange.from || !dateRange.to) return invoices
    return invoices.filter(inv => {
      // Build a date string from year/month (use due_date if available, otherwise year-month-01)
      const invDate = inv.due_date || `${inv.year}-${String(inv.month).padStart(2,'0')}-01`
      return invDate >= dateRange.from && invDate <= dateRange.to
    })
  }, [invoices, dateRange])

  const filtered = searchQuery
    ? dateFiltered.filter(inv =>
        inv.customer_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        inv.invoice_number?.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : dateFiltered

  // 청구일(sent_at) 기준 그룹핑: 같은 날짜의 청구서들을 묶어서 표시
  // 정렬: 날짜 desc (null은 맨 아래)
  const dateGroups = useMemo(() => {
    const groups: Record<string, { date: string; label: string; invoices: any[]; total: number; count: number }> = {}
    filtered.forEach(inv => {
      const rawDate = inv.sent_at ? String(inv.sent_at).substring(0, 10) : ''
      const key = rawDate || '__unsent__'
      const label = rawDate ? rawDate : '미발송'
      if (!groups[key]) {
        groups[key] = { date: rawDate, label, invoices: [], total: 0, count: 0 }
      }
      groups[key].invoices.push(inv)
      groups[key].total += Number(inv.total || 0)
      groups[key].count += 1
    })
    // sort by date desc (empty/unsent at bottom)
    return Object.values(groups).sort((a, b) => {
      if (!a.date && !b.date) return 0
      if (!a.date) return 1
      if (!b.date) return -1
      return b.date.localeCompare(a.date)
    })
  }, [filtered])

  const toggleGroup = (key: string) => {
    setCollapsedGroups(prev => ({ ...prev, [key]: !prev[key] }))
  }

  const totalAmount = invoices.reduce((s, i) => s + Number(i.total || 0), 0)
  const paidAmount = invoices.filter(i => i.status === 'paid').reduce((s, i) => s + Number(i.total || 0), 0)
  const unpaidAmount = invoices.filter(i => ['sent', 'overdue'].includes(i.status)).reduce((s, i) => s + Number(i.total || 0), 0)
  const overdueCount = invoices.filter(i => i.status === 'overdue').length

  const yearOptions = Array.from({ length: 5 }, (_, i) => ({ value: String(new Date().getFullYear() - i), label: `${new Date().getFullYear() - i}년` }))
  const statusOptions = [
    { value: '전체', label: '전체' }, { value: 'draft', label: '초안' },
    { value: 'sent', label: '발송' }, { value: 'paid', label: '수납완료' }, { value: 'overdue', label: '연체' },
  ]
  const monthOptions = Array.from({ length: 12 }, (_, i) => ({ value: String(i + 1), label: `${i + 1}월` }))
  const statusFormOptions = [
    { value: 'draft', label: '초안' }, { value: 'sent', label: '발송' },
    { value: 'paid', label: '수납완료' }, { value: 'overdue', label: '연체' }, { value: 'cancelled', label: '취소' },
  ]

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">청구/계산서 관리</h1>
        <Button size="sm" onClick={openNewInvoice}><Plus className="w-4 h-4 mr-1" /> 청구서 생성</Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 mb-6">
        <div className="stat-card">
          <div className="flex items-center gap-2 mb-1"><FileText className="w-4 h-4 text-primary-500" /><span className="stat-label">총 청구액</span></div>
          <div className="stat-value">{formatCurrency(totalAmount)}</div>
        </div>
        <div className="stat-card">
          <div className="flex items-center gap-2 mb-1"><Check className="w-4 h-4 text-green-500" /><span className="stat-label">수납 완료</span></div>
          <div className="stat-value text-green-600">{formatCurrency(paidAmount)}</div>
        </div>
        <div className="stat-card">
          <div className="flex items-center gap-2 mb-1"><Clock className="w-4 h-4 text-blue-500" /><span className="stat-label">미수금</span></div>
          <div className="stat-value text-blue-600">{formatCurrency(unpaidAmount)}</div>
        </div>
        <div className="stat-card">
          <div className="flex items-center gap-2 mb-1"><AlertCircle className="w-4 h-4 text-red-500" /><span className="stat-label">연체</span></div>
          <div className="stat-value text-red-600">{overdueCount}건</div>
        </div>
      </div>

      <div className="flex items-center gap-3 mb-4 flex-wrap">
        {/* Year tabs */}
        <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-0.5">
          {[2025, 2026].map(y => (
            <button
              key={y}
              onClick={() => setYear(y)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                year === y ? 'bg-white text-text-primary shadow-sm' : 'text-text-secondary hover:text-text-primary'
              }`}
            >
              {y}년
            </button>
          ))}
        </div>

        {/* Month navigation */}
        <div className="flex items-center gap-1">
          <button
            onClick={() => {
              if (viewAll) return
              if (month === 1) { setYear(y => y - 1); setMonth(12) }
              else { setMonth(m => m - 1) }
            }}
            className="p-1.5 rounded-md hover:bg-gray-100 transition-colors"
          >
            <ChevronLeft className="w-4 h-4 text-text-secondary" />
          </button>
          <span className="text-sm font-semibold text-text-primary min-w-[80px] text-center">
            {viewAll ? '전체' : `${month}월`}
          </span>
          <button
            onClick={() => {
              if (viewAll) return
              if (month === 12) { setYear(y => y + 1); setMonth(1) }
              else { setMonth(m => m + 1) }
            }}
            className="p-1.5 rounded-md hover:bg-gray-100 transition-colors"
          >
            <ChevronRight className="w-4 h-4 text-text-secondary" />
          </button>
        </div>

        {/* View all toggle */}
        <button
          onClick={() => setViewAll(v => !v)}
          className={`px-3 py-1.5 text-xs font-medium rounded-md border transition-colors ${
            viewAll ? 'bg-primary-500 text-white border-primary-500' : 'bg-white text-text-secondary border-border hover:bg-gray-50'
          }`}
        >
          연간 전체
        </button>

        <DateRangePicker value={dateRange} onChange={setDateRange} />

        {/* 그룹 보기 토글 */}
        <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-0.5" title="청구일별로 묶어서 보기">
          <button
            onClick={() => setGroupByDate(false)}
            className={`flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${
              !groupByDate ? 'bg-white text-text-primary shadow-sm' : 'text-text-secondary hover:text-text-primary'
            }`}
          >
            <List className="w-3.5 h-3.5" />
            목록
          </button>
          <button
            onClick={() => setGroupByDate(true)}
            className={`flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${
              groupByDate ? 'bg-white text-text-primary shadow-sm' : 'text-text-secondary hover:text-text-primary'
            }`}
          >
            <Calendar className="w-3.5 h-3.5" />
            청구일별
          </button>
        </div>

        <div className="flex-1" />

        <div className="relative max-w-[240px]">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-text-placeholder" />
          <input className="w-full pl-9 pr-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-200" placeholder="고객사 검색..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
        </div>
        <Select options={statusOptions} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="w-28" />
      </div>

      {loading ? <Loading /> : filtered.length === 0 ? (
        <EmptyState icon={FileText} title="등록된 청구서가 없습니다" description="상단의 '청구서 생성' 버튼으로 새 청구서를 만들 수 있습니다." />
      ) : (
        <div className="table-container">
          <table className="data-table" style={{ minWidth: '900px' }}>
            <thead>
              <tr>
                <th style={{ width: '10%' }} className="text-center">청구일</th>
                <th style={{ width: '20%' }}>고객사</th>
                <th style={{ width: '8%' }} className="text-center">청구월</th>
                <th style={{ width: '12%' }} className="text-right">공급가</th>
                <th style={{ width: '10%' }} className="text-right">VAT</th>
                <th style={{ width: '12%' }} className="text-right">합계</th>
                <th style={{ width: '8%' }} className="text-center">상태</th>
                <th style={{ width: '8%' }} className="text-center">납기일</th>
                <th style={{ width: '12%' }} className="text-center">관리</th>
              </tr>
            </thead>
            <tbody>
              {groupByDate ? (
                // 청구일별 그룹핑 뷰
                dateGroups.map(g => {
                  const key = g.date || '__unsent__'
                  const collapsed = !!collapsedGroups[key]
                  return (
                    <React.Fragment key={key}>
                      <tr
                        className="bg-gray-50 hover:bg-gray-100 cursor-pointer border-t-2 border-gray-300"
                        onClick={() => toggleGroup(key)}
                      >
                        <td colSpan={9} className="px-3 py-2">
                          <div className="flex items-center gap-3">
                            <ChevronDown className={`w-4 h-4 text-text-secondary transition-transform ${collapsed ? '-rotate-90' : ''}`} />
                            <Calendar className="w-4 h-4 text-primary-500" />
                            <span className="font-semibold text-text-primary">{g.label}</span>
                            <Badge className="bg-primary-50 text-primary-700">{g.count}건</Badge>
                            <span className="flex-1" />
                            <span className="text-sm font-semibold text-primary-600">합계 {formatCurrency(g.total)}</span>
                          </div>
                        </td>
                      </tr>
                      {!collapsed && g.invoices.map(inv => (
                        <tr key={inv.id}>
                          <td className="text-center text-text-secondary">{inv.sent_at ? formatDate(inv.sent_at, 'yyyy-MM-dd') : '-'}</td>
                          <td className="font-medium text-primary-500 cursor-pointer col-truncate" onClick={() => openEditInvoice(inv)}>{inv.customer_name}</td>
                          <td className="text-center text-text-secondary">{inv.year}.{String(inv.month).padStart(2, '0')}</td>
                          <td className="text-right text-text-secondary">{formatCurrency(inv.subtotal)}</td>
                          <td className="text-right text-text-tertiary">{formatCurrency(inv.vat)}</td>
                          <td className="text-right font-semibold">{formatCurrency(inv.total)}</td>
                          <td className="text-center">
                            <Badge className={STATUS_COLORS[inv.status] || 'badge-gray'}>{STATUS_LABELS[inv.status] || inv.status}</Badge>
                          </td>
                          <td className="text-center text-text-tertiary">{inv.due_date ? formatDate(inv.due_date, 'M/d') : '-'}</td>
                          <td className="text-center">
                            <div className="flex items-center justify-center gap-1">
                              <button onClick={() => openEditInvoice(inv)} className="icon-btn" title="수정">
                                <Pencil className="w-3.5 h-3.5" />
                              </button>
                              {inv.status === 'draft' && (
                                <button onClick={() => handleStatusChange(inv, 'sent')} className="p-1 text-text-tertiary hover:text-status-blue rounded" title="발송처리">
                                  <FileText className="w-3.5 h-3.5" />
                                </button>
                              )}
                              {inv.status === 'sent' && (
                                <button onClick={() => handleStatusChange(inv, 'paid')} className="p-1 text-text-tertiary hover:text-status-green rounded" title="수납처리">
                                  <Check className="w-3.5 h-3.5" />
                                </button>
                              )}
                              <InvoicePDFButton invoice={inv} items={inv._items || []} className="!p-1 !px-1" />
                              <button onClick={() => setDeleteModal(inv)} className="p-1 text-text-tertiary hover:text-status-red rounded" title="삭제">
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </React.Fragment>
                  )
                })
              ) : (
                filtered.map((inv) => (
                  <tr key={inv.id}>
                    <td className="text-center text-text-secondary">{inv.sent_at ? formatDate(inv.sent_at, 'yyyy-MM-dd') : '-'}</td>
                    <td className="font-medium text-primary-500 cursor-pointer col-truncate" onClick={() => openEditInvoice(inv)}>{inv.customer_name}</td>
                    <td className="text-center text-text-secondary">{inv.year}.{String(inv.month).padStart(2, '0')}</td>
                    <td className="text-right text-text-secondary">{formatCurrency(inv.subtotal)}</td>
                    <td className="text-right text-text-tertiary">{formatCurrency(inv.vat)}</td>
                    <td className="text-right font-semibold">{formatCurrency(inv.total)}</td>
                    <td className="text-center">
                      <Badge className={STATUS_COLORS[inv.status] || 'badge-gray'}>{STATUS_LABELS[inv.status] || inv.status}</Badge>
                    </td>
                    <td className="text-center text-text-tertiary">{inv.due_date ? formatDate(inv.due_date, 'M/d') : '-'}</td>
                    <td className="text-center">
                      <div className="flex items-center justify-center gap-1">
                        <button onClick={() => openEditInvoice(inv)} className="icon-btn" title="수정">
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        {inv.status === 'draft' && (
                          <button onClick={() => handleStatusChange(inv, 'sent')} className="p-1 text-text-tertiary hover:text-status-blue rounded" title="발송처리">
                            <FileText className="w-3.5 h-3.5" />
                          </button>
                        )}
                        {inv.status === 'sent' && (
                          <button onClick={() => handleStatusChange(inv, 'paid')} className="p-1 text-text-tertiary hover:text-status-green rounded" title="수납처리">
                            <Check className="w-3.5 h-3.5" />
                          </button>
                        )}
                        <InvoicePDFButton invoice={inv} items={inv._items || []} className="!p-1 !px-1" />
                        <button onClick={() => setDeleteModal(inv)} className="p-1 text-text-tertiary hover:text-status-red rounded" title="삭제">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Invoice Create/Edit Modal */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editingInvoice ? '청구서 수정' : '청구서 생성'} size="xl">
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <SearchSelect
              label="고객사 *"
              value={form.customer_id}
              onChange={(val) => handleCustomerChange(val)}
              options={customers.map(c => ({ value: c.id, label: c.company_name }))}
              placeholder="고객사 검색..."
            />
            <Input
              label="청구번호"
              value={form.invoice_number}
              onChange={(e) => setForm(f => ({ ...f, invoice_number: e.target.value }))}
            />
            <Select
              label="상태"
              value={form.status}
              onChange={(e) => setForm(f => ({ ...f, status: e.target.value }))}
              options={statusFormOptions}
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
            <Select
              label="청구 연도"
              value={String(form.year)}
              onChange={(e) => setForm(f => ({ ...f, year: Number(e.target.value) }))}
              options={yearOptions}
            />
            <Select
              label="청구 월"
              value={String(form.month)}
              onChange={(e) => setForm(f => ({ ...f, month: Number(e.target.value) }))}
              options={monthOptions}
            />
            <Input
              label="납기일"
              type="date"
              value={form.due_date}
              onChange={(e) => setForm(f => ({ ...f, due_date: e.target.value }))}
            />
            <Input
              label="입금계좌"
              value={form.bank_info}
              onChange={(e) => setForm(f => ({ ...f, bank_info: e.target.value }))}
            />
          </div>

          {/* 납기일 가이드 + 청구 방식 */}
          {form.customer_id && dueRules.length > 0 && (
            <div className="p-3 rounded-lg bg-blue-50 border border-blue-100 space-y-1">
              {(() => {
                const defaultRule = dueRules.find((r: any) => !r.project_id)
                const projectRules = dueRules.filter((r: any) => r.project_id)
                const ruleLabel = (r: any) => {
                  if (r.rule_type === 'fixed_day' && r.fixed_day) return `매월 ${r.fixed_day}일`
                  const labels: Record<string, string> = { next_month_end: '익월 말일', next_next_month_end: '익익월 말일', same_month_end: '당월 말일', custom: r.description || '직접 입력' }
                  return labels[r.rule_type] || r.rule_type
                }
                return (
                  <>
                    {defaultRule && (
                      <p className="text-xs text-blue-700">
                        <span className="font-medium">※ 회사 기본 납기:</span> {ruleLabel(defaultRule)}
                        {form.due_date && <span className="ml-1 text-blue-500">→ {form.due_date}</span>}
                      </p>
                    )}
                    {projectRules.map((r: any) => (
                      <p key={r.id} className="text-xs text-amber-700">
                        <span className="font-medium">※ {r.project?.project_name?.split(' - ')[0] || '현장'}:</span> {ruleLabel(r)} (예외)
                      </p>
                    ))}
                    <p className="text-xs text-blue-600 mt-1">
                      <span className="font-medium">청구 방식:</span> {customerInvoiceGrouping === 'per_project' ? '현장별 분리 청구' : '합산 청구 (회사 1장)'}
                    </p>
                  </>
                )
              })()}
            </div>
          )}

          {/* Items */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="input-label">청구 항목</label>
              <Button variant="ghost" size="sm" onClick={addItem}><Plus className="w-3.5 h-3.5 mr-1" />항목 추가</Button>
            </div>
            <div className="border rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="text-left px-3 py-2 text-xs font-medium text-gray-500 w-8">#</th>
                    <th className="text-left px-3 py-2 text-xs font-medium text-gray-500">프로젝트명</th>
                    <th className="text-left px-3 py-2 text-xs font-medium text-gray-500 w-28">서비스유형</th>
                    <th className="text-left px-3 py-2 text-xs font-medium text-gray-500 w-24">기간</th>
                    <th className="text-right px-3 py-2 text-xs font-medium text-gray-500 w-16">수량</th>
                    <th className="text-right px-3 py-2 text-xs font-medium text-gray-500 w-28">단가</th>
                    <th className="text-right px-3 py-2 text-xs font-medium text-gray-500 w-28">금액</th>
                    <th className="w-8"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {items.map((item, idx) => {
                    // Check if this is the first item of a project group
                    const prevProject = idx > 0 ? items[idx - 1].project_name : null
                    const isFirstOfGroup = item.project_name !== prevProject
                    // Count how many items share this project name (for rowspan)
                    const groupCount = isFirstOfGroup ? items.filter((it, i) => i >= idx && it.project_name === item.project_name).length : 0
                    return (
                    <tr key={idx} className={isFirstOfGroup && idx > 0 ? 'border-t-2 border-gray-300' : ''}>
                      <td className="px-3 py-2 text-text-placeholder text-xs">{idx + 1}</td>
                      {isFirstOfGroup ? (
                        <td className="px-1 py-1 align-top" rowSpan={groupCount > 1 ? groupCount : undefined}>
                          <input
                            className="w-full px-2 py-1.5 text-sm border rounded focus:outline-none focus:ring-1 focus:ring-primary-200 font-medium"
                            value={item.project_name}
                            onChange={(e) => {
                              // Update all items in this group
                              const oldName = item.project_name
                              setItems(prev => prev.map(it => it.project_name === oldName ? { ...it, project_name: e.target.value } : it))
                            }}
                            placeholder="프로젝트(현장)명"
                            list={`projects-list-${idx}`}
                          />
                          {projects.length > 0 && (
                            <datalist id={`projects-list-${idx}`}>
                              {Array.from(new Set(projects.map(p => {
                                const n = p.project_name || ''
                                const d = n.indexOf(' - ')
                                return d > 0 ? n.substring(0, d) : n
                              }))).map(name => <option key={name} value={name} />)}
                            </datalist>
                          )}
                          {groupCount > 1 && (
                            <span className="text-[10px] text-text-placeholder ml-1">{groupCount}개 서비스</span>
                          )}
                        </td>
                      ) : null}
                      <td className="px-1 py-1">
                        <input
                          className="w-full px-2 py-1.5 text-sm border rounded focus:outline-none focus:ring-1 focus:ring-primary-200"
                          value={item.service_type}
                          onChange={(e) => updateItem(idx, 'service_type', e.target.value)}
                          placeholder="서비스"
                        />
                      </td>
                      <td className="px-1 py-1">
                        <input
                          className="w-full px-2 py-1.5 text-sm border rounded focus:outline-none focus:ring-1 focus:ring-primary-200"
                          value={item.period}
                          onChange={(e) => updateItem(idx, 'period', e.target.value)}
                          placeholder="2026.03"
                        />
                      </td>
                      <td className="px-1 py-1">
                        <input
                          type="number"
                          className="w-full px-2 py-1.5 text-sm border rounded text-right focus:outline-none focus:ring-1 focus:ring-primary-200"
                          value={item.quantity}
                          onChange={(e) => updateItem(idx, 'quantity', Number(e.target.value))}
                          min={1}
                        />
                      </td>
                      <td className="px-1 py-1">
                        <input
                          type="number"
                          className="w-full px-2 py-1.5 text-sm border rounded text-right focus:outline-none focus:ring-1 focus:ring-primary-200"
                          value={item.unit_price}
                          onChange={(e) => updateItem(idx, 'unit_price', Number(e.target.value))}
                        />
                      </td>
                      <td className="px-3 py-2 text-right font-medium text-sm">{formatCurrency(item.amount)}</td>
                      <td className="px-1 py-1">
                        {items.length > 1 && (
                          <button onClick={() => removeItem(idx)} className="p-1 text-gray-300 hover:text-red-500">
                            <X className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </td>
                    </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            {/* Totals */}
            <div className="mt-3 flex justify-end">
              <div className="w-64 space-y-1 text-sm">
                <div className="flex justify-between"><span className="text-gray-500">공급가</span><span className="font-medium">{formatCurrency(subtotal)}</span></div>
                <div className="flex justify-between"><span className="text-gray-500">VAT (10%)</span><span className="font-medium">{formatCurrency(vat)}</span></div>
                <div className="flex justify-between border-t pt-1 mt-1"><span className="font-semibold">합계</span><span className="font-bold text-primary-600">{formatCurrency(total)}</span></div>
              </div>
            </div>
          </div>

          <Textarea
            label="비고"
            value={form.notes}
            onChange={(e) => setForm(f => ({ ...f, notes: e.target.value }))}
            placeholder="추가 메모사항"
          />

          <div className="flex gap-3 justify-end pt-2">
            <Button variant="secondary" size="sm" onClick={() => setModalOpen(false)}>취소</Button>
            <Button size="sm" loading={saving} onClick={handleSave}>
              {editingInvoice ? '수정' : '생성'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Delete Modal */}
      <Modal open={!!deleteModal} onClose={() => setDeleteModal(null)} title="청구서 삭제">
        <p className="text-sm text-gray-600 mb-4">
          <strong>{deleteModal?.invoice_number}</strong>을(를) 정말 삭제하시겠습니까?
        </p>
        <div className="flex gap-3 justify-end">
          <Button variant="secondary" size="sm" onClick={() => setDeleteModal(null)}>취소</Button>
          <Button variant="danger" size="sm" loading={deleting} onClick={handleDelete}>삭제</Button>
        </div>
      </Modal>
    </div>
  )
}
