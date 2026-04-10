'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { DateRangePicker, type DateRange } from '@/components/ui/date-range-picker'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { SearchSelect } from '@/components/ui/search-select'
import { Textarea } from '@/components/ui/textarea'
import { Modal } from '@/components/ui/modal'
import { Loading } from '@/components/ui/loading'
import { formatCurrency, formatDate } from '@/lib/utils'
import { Plus, FileText, Search, Pencil, Trash2, CheckCircle, Clock, AlertTriangle, XCircle, Eye, Upload, Download, Paperclip } from 'lucide-react'
import { toast } from 'sonner'
import Link from 'next/link'

// SQL for contracts table (run in Supabase if not exists):
/*
CREATE TABLE IF NOT EXISTS contracts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  contract_number TEXT NOT NULL,
  customer_id UUID REFERENCES customers(id),
  quotation_id UUID REFERENCES quotations(id),
  title TEXT NOT NULL,
  parties TEXT,
  contract_type TEXT DEFAULT '서비스',
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'expired', 'terminated', 'renewed')),
  start_date DATE,
  end_date DATE,
  total_amount NUMERIC DEFAULT 0,
  monthly_amount NUMERIC DEFAULT 0,
  auto_renewal BOOLEAN DEFAULT false,
  renewal_period_months INT DEFAULT 12,
  payment_terms TEXT,
  terms TEXT,
  notes TEXT,
  signed_at TIMESTAMPTZ,
  terminated_at TIMESTAMPTZ,
  created_by TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE contracts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated crud contracts" ON contracts FOR ALL TO authenticated USING (true) WITH CHECK (true);
*/

const STATUS_COLORS: Record<string, string> = {
  draft: 'bg-gray-100 text-text-secondary',
  active: 'bg-green-100 text-green-700',
  expired: 'bg-yellow-100 text-yellow-700',
  terminated: 'bg-red-100 text-red-700',
  renewed: 'bg-blue-100 text-blue-700',
}
const STATUS_LABELS: Record<string, string> = {
  draft: '초안',
  active: '진행중',
  expired: '만료',
  terminated: '해지',
  renewed: '갱신',
}
const STATUS_FLOW_LABELS: Record<string, string> = {
  draft: '초안',
  active: '체결',
  expired: '만료',
  terminated: '해지',
}

interface Contract {
  id: string
  contract_number: string
  customer_id: string | null
  quotation_id: string | null
  title: string
  parties: string | null
  contract_type: string | null
  status: string
  start_date: string | null
  end_date: string | null
  total_amount: number
  monthly_amount: number
  auto_renewal: boolean
  renewal_period_months: number | null
  payment_terms: string | null
  terms: string | null
  notes: string | null
  file_url: string | null
  file_name: string | null
  signed_at: string | null
  created_at: string
  // joined
  customer_name?: string
  quotation_number?: string
}

export default function ContractsPage() {
  const [contracts, setContracts] = useState<Contract[]>([])
  const [customers, setCustomers] = useState<any[]>([])
  const [quotations, setQuotations] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [tableExists, setTableExists] = useState(true)
  const [dateRange, setDateRange] = useState<DateRange>({ from: '', to: '' })
  const [statusFilter, setStatusFilter] = useState('전체')
  const [searchQuery, setSearchQuery] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [editingContract, setEditingContract] = useState<Contract | null>(null)
  const [saving, setSaving] = useState(false)
  const [deleteModal, setDeleteModal] = useState<Contract | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [detailModal, setDetailModal] = useState<Contract | null>(null)
  const [fileUploading, setFileUploading] = useState(false)
  const supabase = createClient()

  const [form, setForm] = useState({
    contract_number: '',
    customer_id: '',
    quotation_id: '',
    title: '',
    parties: '',
    contract_type: '서비스',
    status: 'draft',
    start_date: '',
    end_date: '',
    total_amount: '',
    monthly_amount: '',
    auto_renewal: false,
    renewal_period_months: '12',
    payment_terms: '',
    terms: '',
    notes: '',
    file_url: '',
    file_name: '',
  })

  const fetchContracts = useCallback(async () => {
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('contracts')
        .select('*, customer:customers(company_name), quotation:quotations(quotation_number)')
        .order('created_at', { ascending: false })

      if (error) {
        if (error.code === '42P01' || error.message?.includes('relation') || error.message?.includes('does not exist')) {
          setTableExists(false)
          setContracts([])
        } else {
          console.error('Fetch error:', error)
        }
      } else {
        setTableExists(true)
        setContracts((data || []).map((c: any) => ({
          ...c,
          customer_name: c.customer?.company_name || '(미지정)',
          quotation_number: c.quotation?.quotation_number || null,
        })))
      }
    } catch (err) {
      console.error('fetchContracts error:', err)
    }
    setLoading(false)
  }, [])

  const fetchCustomers = useCallback(async () => {
    const { data } = await supabase.from('customers').select('id, company_name').order('company_name')
    setCustomers(data || [])
  }, [])

  const fetchQuotations = useCallback(async () => {
    const { data } = await supabase.from('quotations').select('id, quotation_number, customer_name, total').eq('status', 'accepted').order('created_at', { ascending: false })
    setQuotations(data || [])
  }, [])

  useEffect(() => {
    fetchContracts()
    fetchCustomers()
    fetchQuotations()
  }, [fetchContracts, fetchCustomers, fetchQuotations])

  // Filter
  const filtered = useMemo(() => {
    let result = contracts
    if (statusFilter !== '전체') result = result.filter(c => c.status === statusFilter)
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      result = result.filter(c =>
        c.title.toLowerCase().includes(q) ||
        c.customer_name?.toLowerCase().includes(q) ||
        c.contract_number.toLowerCase().includes(q)
      )
    }
    // DateRange filter by start_date
    if (dateRange.from && dateRange.to) {
      result = result.filter(c => {
        const d = c.start_date
        if (!d) return false
        return d >= dateRange.from && d <= dateRange.to
      })
    }
    return result
  }, [contracts, statusFilter, searchQuery, dateRange])

  // Stats
  const totalContracts = contracts.length
  const activeContracts = contracts.filter(c => c.status === 'active').length
  const expiringContracts = contracts.filter(c => {
    if (c.status !== 'active' || !c.end_date) return false
    const daysLeft = Math.ceil((new Date(c.end_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
    return daysLeft <= 60 && daysLeft > 0
  }).length
  const totalContractValue = contracts.filter(c => c.status === 'active').reduce((s, c) => s + Number(c.total_amount || 0), 0)

  const openNew = () => {
    setEditingContract(null)
    const now = new Date()
    setForm({
      contract_number: `CT-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getTime()).slice(-4)}`,
      customer_id: '',
      quotation_id: '',
      title: '',
      parties: '',
      contract_type: '서비스',
      status: 'draft',
      start_date: '',
      end_date: '',
      total_amount: '',
      monthly_amount: '',
      auto_renewal: false,
      renewal_period_months: '12',
      payment_terms: '',
      terms: '',
      notes: '',
      file_url: '',
      file_name: '',
    })
    setModalOpen(true)
  }

  const openEdit = (contract: Contract) => {
    setEditingContract(contract)
    setForm({
      contract_number: contract.contract_number,
      customer_id: contract.customer_id || '',
      quotation_id: contract.quotation_id || '',
      title: contract.title,
      parties: contract.parties || '',
      contract_type: contract.contract_type || '서비스',
      status: contract.status,
      start_date: contract.start_date || '',
      end_date: contract.end_date || '',
      total_amount: contract.total_amount ? String(contract.total_amount) : '',
      monthly_amount: contract.monthly_amount ? String(contract.monthly_amount) : '',
      auto_renewal: contract.auto_renewal || false,
      renewal_period_months: contract.renewal_period_months ? String(contract.renewal_period_months) : '12',
      payment_terms: contract.payment_terms || '',
      terms: contract.terms || '',
      notes: contract.notes || '',
      file_url: contract.file_url || '',
      file_name: contract.file_name || '',
    })
    setModalOpen(true)
  }

  // When quotation is selected, auto-fill from it
  const handleQuotationChange = (qId: string) => {
    setForm(f => ({ ...f, quotation_id: qId }))
    if (qId) {
      const q = quotations.find((qt: any) => qt.id === qId)
      if (q) {
        setForm(f => ({
          ...f,
          quotation_id: qId,
          title: q.customer_name ? `${q.customer_name} 서비스 계약` : f.title,
          total_amount: q.total ? String(q.total) : f.total_amount,
        }))
      }
    }
  }

  const handleSave = async () => {
    if (!form.title.trim()) { toast.error('계약명을 입력해주세요.'); return }

    setSaving(true)
    try {
      const payload: any = {
        contract_number: form.contract_number,
        customer_id: form.customer_id || null,
        quotation_id: form.quotation_id || null,
        title: form.title,
        parties: form.parties || null,
        contract_type: form.contract_type || null,
        status: form.status,
        start_date: form.start_date || null,
        end_date: form.end_date || null,
        total_amount: form.total_amount ? Number(form.total_amount) : 0,
        monthly_amount: form.monthly_amount ? Number(form.monthly_amount) : 0,
        auto_renewal: form.auto_renewal,
        renewal_period_months: form.renewal_period_months ? Number(form.renewal_period_months) : null,
        payment_terms: form.payment_terms || null,
        terms: form.terms || null,
        notes: form.notes || null,
        file_url: form.file_url || null,
        file_name: form.file_name || null,
      }

      if (form.status === 'active' && !editingContract?.signed_at) {
        payload.signed_at = new Date().toISOString()
      }
      if (form.status === 'terminated') {
        payload.terminated_at = new Date().toISOString()
      }

      if (editingContract) {
        const { error } = await supabase.from('contracts').update(payload).eq('id', editingContract.id)
        if (error) throw error
      } else {
        const { error } = await supabase.from('contracts').insert(payload)
        if (error) throw error
      }

      toast.success(editingContract ? '계약이 수정되었습니다.' : '계약이 생성되었습니다.')
      setModalOpen(false)
      fetchContracts()
    } catch (err: any) {
      console.error('Save error:', err)
      toast.error('저장에 실패했습니다: ' + (err?.message || ''))
    }
    setSaving(false)
  }

  const handleDelete = async () => {
    if (!deleteModal) return
    setDeleting(true)
    const { error } = await supabase.from('contracts').delete().eq('id', deleteModal.id)
    if (error) {
      toast.error('삭제에 실패했습니다.')
    } else {
      toast.success('계약이 삭제되었습니다.')
      setDeleteModal(null)
      fetchContracts()
    }
    setDeleting(false)
  }

  const handleStatusChange = async (contract: Contract, newStatus: string) => {
    const updateData: any = { status: newStatus }
    if (newStatus === 'active') updateData.signed_at = new Date().toISOString()
    if (newStatus === 'terminated') updateData.terminated_at = new Date().toISOString()

    const { error } = await supabase.from('contracts').update(updateData).eq('id', contract.id)
    if (error) {
      toast.error('상태 변경에 실패했습니다.')
    } else {
      toast.success(`상태가 '${STATUS_LABELS[newStatus]}'(으)로 변경되었습니다.`)
      fetchContracts()
    }
  }

  const handleFileUpload = async (file: File) => {
    setFileUploading(true)
    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('folder', 'contracts')

      const res = await fetch('/api/upload', { method: 'POST', body: formData })
      const result = await res.json()

      if (!res.ok) {
        toast.error('파일 업로드에 실패했습니다: ' + (result.error || ''))
      } else {
        setForm(f => ({ ...f, file_url: result.url, file_name: file.name }))
        toast.success('파일이 업로드되었습니다.')
      }
    } catch (err: any) {
      toast.error('업로드 중 오류가 발생했습니다.')
      console.error(err)
    }
    setFileUploading(false)
  }

  const handleFileUploadForContract = async (contract: Contract, file: File) => {
    setFileUploading(true)
    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('folder', 'contracts')

      const res = await fetch('/api/upload', { method: 'POST', body: formData })
      const result = await res.json()

      if (!res.ok) {
        toast.error('파일 업로드에 실패했습니다.')
      } else {
        const { error } = await supabase.from('contracts').update({
          file_url: result.url,
          file_name: file.name,
        }).eq('id', contract.id)

        if (error) {
          toast.error('계약서 파일 연결에 실패했습니다.')
        } else {
          toast.success('계약서 파일이 업로드되었습니다.')
          fetchContracts()
        }
      }
    } catch (err: any) {
      toast.error('업로드 중 오류가 발생했습니다.')
    }
    setFileUploading(false)
  }

  const statusFilterOptions = [
    { value: '전체', label: '전체' },
    { value: 'draft', label: '초안' },
    { value: 'active', label: '진행중' },
    { value: 'expired', label: '만료' },
    { value: 'terminated', label: '해지' },
  ]
  const statusFormOptions = [
    { value: 'draft', label: '초안' },
    { value: 'active', label: '체결(진행중)' },
    { value: 'expired', label: '만료' },
    { value: 'terminated', label: '해지' },
    { value: 'renewed', label: '갱신' },
  ]
  const contractTypeOptions = [
    { value: '서비스', label: '서비스 계약' },
    { value: '구매', label: '구매 계약' },
    { value: '임대', label: '임대 계약' },
    { value: '유지보수', label: '유지보수 계약' },
    { value: '기타', label: '기타' },
  ]
  const renewalOptions = [
    { value: '6', label: '6개월' },
    { value: '12', label: '12개월' },
    { value: '24', label: '24개월' },
    { value: '36', label: '36개월' },
  ]

  if (!tableExists) {
    return (
      <div>
        <div className="page-header">
          <h1 className="page-title">계약 관리</h1>
        </div>
        <div className="card p-12 text-center">
          <FileText className="w-12 h-12 text-text-placeholder mx-auto mb-4" />
          <p className="text-text-secondary mb-2">계약 관리 테이블이 아직 생성되지 않았습니다.</p>
          <p className="text-sm text-text-tertiary mb-4">Supabase에서 contracts 테이블을 먼저 생성해주세요.</p>
          <pre className="text-xs text-left bg-surface-tertiary p-4 rounded-lg max-w-lg mx-auto overflow-auto text-text-secondary">
{`CREATE TABLE contracts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  contract_number TEXT NOT NULL,
  customer_id UUID REFERENCES customers(id),
  quotation_id UUID REFERENCES quotations(id),
  title TEXT NOT NULL,
  parties TEXT,
  contract_type TEXT DEFAULT '서비스',
  status TEXT NOT NULL DEFAULT 'draft',
  start_date DATE,
  end_date DATE,
  total_amount NUMERIC DEFAULT 0,
  monthly_amount NUMERIC DEFAULT 0,
  auto_renewal BOOLEAN DEFAULT false,
  renewal_period_months INT DEFAULT 12,
  payment_terms TEXT,
  terms TEXT,
  notes TEXT,
  signed_at TIMESTAMPTZ,
  terminated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);`}
          </pre>
        </div>
      </div>
    )
  }

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">계약 관리</h1>
        <Button size="sm" onClick={openNew}><Plus className="w-4 h-4 mr-1" /> 계약 생성</Button>
      </div>

      {/* Status Flow */}
      <div className="card p-4 mb-6">
        <div className="flex items-center justify-center gap-2 text-sm">
          {['draft', 'active', 'expired', 'terminated'].map((s, idx) => (
            <div key={s} className="flex items-center gap-2">
              <div className={`px-3 py-1.5 rounded-full text-xs font-medium ${STATUS_COLORS[s]}`}>
                {STATUS_FLOW_LABELS[s]}
                <span className="ml-1.5 font-bold">{contracts.filter(c => c.status === s).length}</span>
              </div>
              {idx < 3 && <span className="text-text-placeholder">→</span>}
            </div>
          ))}
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 mb-6">
        <div className="stat-card">
          <div className="flex items-center gap-2 mb-1"><FileText className="w-4 h-4 text-primary-500" /><span className="stat-label">전체 계약</span></div>
          <div className="stat-value">{totalContracts}건</div>
        </div>
        <div className="stat-card">
          <div className="flex items-center gap-2 mb-1"><CheckCircle className="w-4 h-4 text-green-500" /><span className="stat-label">진행중</span></div>
          <div className="stat-value text-green-600">{activeContracts}건</div>
        </div>
        <div className="stat-card">
          <div className="flex items-center gap-2 mb-1"><Clock className="w-4 h-4 text-yellow-500" /><span className="stat-label">만료 예정 (60일내)</span></div>
          <div className="stat-value text-status-yellow">{expiringContracts}건</div>
        </div>
        <div className="stat-card">
          <div className="flex items-center gap-2 mb-1"><AlertTriangle className="w-4 h-4 text-blue-500" /><span className="stat-label">계약 총액 (진행중)</span></div>
          <div className="stat-value text-blue-600">{formatCurrency(totalContractValue)}</div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 mb-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary" />
          <input className="w-full pl-9 pr-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-200" placeholder="계약명, 고객사, 계약번호 검색..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
        </div>
        <Select options={statusFilterOptions} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="w-28" />
        <DateRangePicker value={dateRange} onChange={setDateRange} />
      </div>

      {/* Table */}
      {loading ? <Loading /> : filtered.length === 0 ? (
        <div className="card p-12 text-center">
          <FileText className="w-12 h-12 text-text-placeholder mx-auto mb-4" />
          <p className="text-text-secondary mb-2">등록된 계약이 없습니다.</p>
          <p className="text-sm text-text-tertiary">상단의 &apos;계약 생성&apos; 버튼으로 새 계약을 만들 수 있습니다.</p>
        </div>
      ) : (
        <div className="table-container">
          <table className="data-table" style={{ minWidth: '900px' }}>
            <thead>
              <tr>
                <th style={{ width: '10%' }}>계약번호</th>
                <th style={{ width: '18%' }}>계약명</th>
                <th style={{ width: '14%' }}>고객사</th>
                <th style={{ width: '7%' }} className="text-center">유형</th>
                <th style={{ width: '8%' }} className="text-center">상태</th>
                <th style={{ width: '16%' }} className="text-center">기간</th>
                <th style={{ width: '12%' }} className="text-right">계약금액</th>
                <th style={{ width: '8%' }} className="text-center">자동갱신</th>
                <th style={{ width: '8%' }} className="text-center">관리</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((contract) => {
                const daysLeft = contract.end_date
                  ? Math.ceil((new Date(contract.end_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
                  : null

                return (
                  <tr key={contract.id} className="hover:bg-primary-50/30 transition-colors">
                    <td className="px-4 py-3 font-medium text-primary-500 cursor-pointer" onClick={() => setDetailModal(contract)}>
                      <div className="flex items-center gap-1.5">
                        {contract.contract_number}
                        {contract.file_url && <span title="파일 첨부됨"><Paperclip className="w-3 h-3 text-text-tertiary" /></span>}
                      </div>
                    </td>
                    <td className="px-4 py-3 font-medium">{contract.title}</td>
                    <td className="px-4 py-3 text-text-secondary">{contract.customer_name}</td>
                    <td className="px-4 py-3 text-center text-xs text-text-secondary">{contract.contract_type || '-'}</td>
                    <td className="px-4 py-3 text-center">
                      <Badge className={STATUS_COLORS[contract.status]}>{STATUS_LABELS[contract.status]}</Badge>
                    </td>
                    <td className="px-4 py-3 text-center text-xs text-text-secondary">
                      {contract.start_date ? formatDate(contract.start_date, 'yy.MM.dd') : '-'}
                      {contract.start_date && contract.end_date ? ' ~ ' : ''}
                      {contract.end_date ? formatDate(contract.end_date, 'yy.MM.dd') : ''}
                      {daysLeft !== null && daysLeft > 0 && daysLeft <= 60 && contract.status === 'active' && (
                        <div className="text-status-yellow text-xs font-medium mt-0.5">{daysLeft}일 남음</div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold">{formatCurrency(contract.total_amount)}</td>
                    <td className="px-4 py-3 text-center">
                      {contract.auto_renewal ? (
                        <Badge className="bg-blue-100 text-blue-700">{contract.renewal_period_months}개월</Badge>
                      ) : (
                        <span className="text-text-tertiary text-xs">미설정</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <div className="flex items-center justify-center gap-1">
                        <button onClick={() => setDetailModal(contract)} className="p-1 text-text-tertiary hover:text-primary-500 rounded" title="상세"><Eye className="w-3.5 h-3.5" /></button>
                        <button onClick={() => openEdit(contract)} className="p-1 text-text-tertiary hover:text-primary-500 rounded" title="수정"><Pencil className="w-3.5 h-3.5" /></button>
                        {contract.status === 'draft' && (
                          <button onClick={() => handleStatusChange(contract, 'active')} className="p-1 text-text-tertiary hover:text-status-green rounded" title="체결"><CheckCircle className="w-3.5 h-3.5" /></button>
                        )}
                        {contract.status === 'active' && (
                          <button onClick={() => handleStatusChange(contract, 'terminated')} className="p-1 text-text-tertiary hover:text-status-red rounded" title="해지"><XCircle className="w-3.5 h-3.5" /></button>
                        )}
                        <button onClick={() => setDeleteModal(contract)} className="p-1 text-text-tertiary hover:text-status-red rounded" title="삭제"><Trash2 className="w-3.5 h-3.5" /></button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Create/Edit Modal */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editingContract ? '계약 수정' : '계약 생성'} size="lg">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Input
              label="계약번호"
              value={form.contract_number}
              onChange={(e) => setForm(f => ({ ...f, contract_number: e.target.value }))}
            />
            <Select
              label="상태"
              value={form.status}
              onChange={(e) => setForm(f => ({ ...f, status: e.target.value }))}
              options={statusFormOptions}
            />
          </div>
          <Input
            label="계약명 *"
            value={form.title}
            onChange={(e) => setForm(f => ({ ...f, title: e.target.value }))}
            placeholder="계약 제목"
          />
          <div className="grid grid-cols-2 gap-4">
            <SearchSelect
              label="고객사"
              value={form.customer_id}
              onChange={(val) => setForm(f => ({ ...f, customer_id: val }))}
              options={customers.map(c => ({ value: c.id, label: c.company_name }))}
              placeholder="고객사 검색..."
            />
            <Select
              label="연결 견적서 (수주 견적)"
              value={form.quotation_id}
              onChange={(e) => handleQuotationChange(e.target.value)}
              options={quotations.map((q: any) => ({ value: q.id, label: `${q.quotation_number} - ${q.customer_name}` }))}
              placeholder="견적서 선택 (선택사항)"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Select
              label="계약 유형"
              value={form.contract_type}
              onChange={(e) => setForm(f => ({ ...f, contract_type: e.target.value }))}
              options={contractTypeOptions}
            />
            <Input
              label="계약 당사자"
              value={form.parties}
              onChange={(e) => setForm(f => ({ ...f, parties: e.target.value }))}
              placeholder="카스웍스(주) ↔ ○○건설(주)"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Input
              label="계약 시작일"
              type="date"
              value={form.start_date}
              onChange={(e) => setForm(f => ({ ...f, start_date: e.target.value }))}
            />
            <Input
              label="계약 종료일"
              type="date"
              value={form.end_date}
              onChange={(e) => setForm(f => ({ ...f, end_date: e.target.value }))}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Input
              label="계약 총액"
              type="number"
              value={form.total_amount}
              onChange={(e) => setForm(f => ({ ...f, total_amount: e.target.value }))}
              placeholder="0"
            />
            <Input
              label="월 과금액"
              type="number"
              value={form.monthly_amount}
              onChange={(e) => setForm(f => ({ ...f, monthly_amount: e.target.value }))}
              placeholder="0"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.auto_renewal}
                  onChange={(e) => setForm(f => ({ ...f, auto_renewal: e.target.checked }))}
                  className="rounded border-gray-300 text-primary-500 focus:ring-primary-500"
                />
                자동갱신
              </label>
            </div>
            {form.auto_renewal && (
              <Select
                label="갱신 주기"
                value={form.renewal_period_months}
                onChange={(e) => setForm(f => ({ ...f, renewal_period_months: e.target.value }))}
                options={renewalOptions}
              />
            )}
          </div>
          <Input
            label="결제 조건"
            value={form.payment_terms}
            onChange={(e) => setForm(f => ({ ...f, payment_terms: e.target.value }))}
            placeholder="매월 말일 청구, 익월 15일 납부"
          />
          <Textarea
            label="계약 조건"
            value={form.terms}
            onChange={(e) => setForm(f => ({ ...f, terms: e.target.value }))}
            placeholder="주요 계약 조건 기재"
          />
          <Textarea
            label="비고"
            value={form.notes}
            onChange={(e) => setForm(f => ({ ...f, notes: e.target.value }))}
            placeholder="메모"
          />

          {/* 계약서 파일 업로드 */}
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1.5">계약서 파일</label>
            {form.file_url ? (
              <div className="flex items-center gap-3 px-3 py-2.5 bg-surface-tertiary rounded-lg text-sm">
                <Paperclip className="w-4 h-4 text-text-tertiary flex-shrink-0" />
                <span className="flex-1 truncate">{form.file_name || '첨부파일'}</span>
                <a href={form.file_url} target="_blank" rel="noopener noreferrer" className="p-1 text-primary-500 hover:text-primary-600" title="보기/다운로드">
                  <Download className="w-4 h-4" />
                </a>
                <button
                  type="button"
                  onClick={() => setForm(f => ({ ...f, file_url: '', file_name: '' }))}
                  className="p-1 text-text-tertiary hover:text-status-red"
                  title="제거"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <label className="flex items-center justify-center gap-2 px-4 py-3 border-2 border-dashed border-border rounded-lg cursor-pointer hover:border-primary-300 hover:bg-primary-50/50 transition-colors">
                <Upload className="w-4 h-4 text-text-tertiary" />
                <span className="text-sm text-text-secondary">
                  {fileUploading ? '업로드 중...' : 'PDF 또는 이미지 파일을 선택하세요'}
                </span>
                <input
                  type="file"
                  className="hidden"
                  accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
                  onChange={(e) => {
                    const file = e.target.files?.[0]
                    if (file) handleFileUpload(file)
                    e.target.value = ''
                  }}
                  disabled={fileUploading}
                />
              </label>
            )}
          </div>

          <div className="flex gap-3 justify-end pt-2">
            <Button variant="secondary" size="sm" onClick={() => setModalOpen(false)}>취소</Button>
            <Button size="sm" loading={saving} onClick={handleSave}>{editingContract ? '수정' : '생성'}</Button>
          </div>
        </div>
      </Modal>

      {/* Detail Modal */}
      <Modal open={!!detailModal} onClose={() => setDetailModal(null)} title="계약 상세" size="lg">
        {detailModal && (
          <div className="space-y-4">
            <dl className="grid grid-cols-2 gap-4">
              {[
                ['계약번호', detailModal.contract_number],
                ['계약명', detailModal.title],
                ['고객사', detailModal.customer_name],
                ['계약유형', detailModal.contract_type],
                ['상태', STATUS_LABELS[detailModal.status]],
                ['계약 당사자', detailModal.parties],
                ['시작일', detailModal.start_date ? formatDate(detailModal.start_date) : '-'],
                ['종료일', detailModal.end_date ? formatDate(detailModal.end_date) : '-'],
                ['계약 총액', formatCurrency(detailModal.total_amount)],
                ['월 과금액', formatCurrency(detailModal.monthly_amount)],
                ['자동갱신', detailModal.auto_renewal ? `${detailModal.renewal_period_months}개월` : '미설정'],
                ['결제조건', detailModal.payment_terms],
              ].map(([label, value]) => (
                <div key={label as string}>
                  <dt className="text-xs text-text-secondary">{label}</dt>
                  <dd className="text-sm font-medium text-gray-900 mt-0.5">{(value as string) || '-'}</dd>
                </div>
              ))}
            </dl>
            {detailModal.terms && (
              <div>
                <dt className="text-xs text-text-secondary mb-1">계약 조건</dt>
                <dd className="text-sm text-gray-700 whitespace-pre-wrap bg-surface-tertiary p-3 rounded-lg">{detailModal.terms}</dd>
              </div>
            )}
            {detailModal.notes && (
              <div>
                <dt className="text-xs text-text-secondary mb-1">비고</dt>
                <dd className="text-sm text-gray-700 whitespace-pre-wrap">{detailModal.notes}</dd>
              </div>
            )}
            {detailModal.quotation_number && (
              <div>
                <dt className="text-xs text-text-secondary mb-1">연결 견적서</dt>
                <dd>
                  <Link href={`/quotations/${detailModal.quotation_id}`} className="text-sm text-primary-500 hover:underline">
                    {detailModal.quotation_number}
                  </Link>
                </dd>
              </div>
            )}

            {/* 계약서 파일 */}
            <div className="border-t border-border pt-4">
              <dt className="text-xs text-text-secondary mb-2">계약서 파일</dt>
              {detailModal.file_url ? (
                <div className="flex items-center gap-3 px-3 py-2.5 bg-surface-tertiary rounded-lg text-sm">
                  <Paperclip className="w-4 h-4 text-text-tertiary flex-shrink-0" />
                  <span className="flex-1 truncate font-medium">{detailModal.file_name || '첨부파일'}</span>
                  <a href={detailModal.file_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-primary-50 text-primary-600 rounded-lg hover:bg-primary-100 transition-colors">
                    <Download className="w-3.5 h-3.5" />
                    다운로드
                  </a>
                </div>
              ) : (
                <div className="flex items-center gap-3">
                  <span className="text-sm text-text-tertiary">첨부된 파일 없음</span>
                  <label className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-primary-50 text-primary-600 rounded-lg cursor-pointer hover:bg-primary-100 transition-colors">
                    <Upload className="w-3.5 h-3.5" />
                    파일 업로드
                    <input
                      type="file"
                      className="hidden"
                      accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
                      onChange={(e) => {
                        const file = e.target.files?.[0]
                        if (file) handleFileUploadForContract(detailModal, file)
                        e.target.value = ''
                      }}
                      disabled={fileUploading}
                    />
                  </label>
                </div>
              )}
            </div>

            <div className="flex gap-3 justify-end pt-2">
              <Button variant="secondary" size="sm" onClick={() => setDetailModal(null)}>닫기</Button>
              <Button size="sm" onClick={() => { setDetailModal(null); openEdit(detailModal) }}>수정</Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Delete Modal */}
      <Modal open={!!deleteModal} onClose={() => setDeleteModal(null)} title="계약 삭제">
        <p className="text-sm text-text-secondary mb-4">
          <strong>{deleteModal?.title}</strong> ({deleteModal?.contract_number})을(를) 정말 삭제하시겠습니까?
        </p>
        <div className="flex gap-3 justify-end">
          <Button variant="secondary" size="sm" onClick={() => setDeleteModal(null)}>취소</Button>
          <Button variant="danger" size="sm" loading={deleting} onClick={handleDelete}>삭제</Button>
        </div>
      </Modal>
    </div>
  )
}
