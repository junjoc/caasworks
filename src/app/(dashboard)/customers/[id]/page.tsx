'use client'

import React from 'react'
import { useEffect, useState, useMemo } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Modal } from '@/components/ui/modal'
import { PageLoading } from '@/components/ui/loading'
import { formatDate, formatCurrency } from '@/lib/utils'
import type { Customer, Project, MonthlyRevenue, User } from '@/types/database'
import { ArrowLeft, Building2, CreditCard, FolderOpen, Receipt, Pencil, Trash2, Plus, FileText, Upload, Download, Eye, X } from 'lucide-react'
import { toast } from 'sonner'

type Tab = 'info' | 'billing' | 'projects' | 'payments' | 'documents'

interface CustomerDocument {
  id: string
  customer_id: string
  doc_type: 'business_registration' | 'bank_account' | 'contract' | 'other'
  title: string
  file_url: string | null
  file_name: string | null
  version: number
  metadata: Record<string, any>
  notes: string | null
  uploaded_by: string | null
  created_at: string
}

const DOC_TYPE_LABELS: Record<string, string> = {
  business_registration: '사업자등록증',
  bank_account: '통장사본',
  contract: '계약서',
  other: '기타',
}

const DOC_TYPE_ICONS: Record<string, string> = {
  business_registration: '🏢',
  bank_account: '🏦',
  contract: '📝',
  other: '📎',
}

const STATUS_LABELS: Record<string, string> = {
  active: '활성',
  suspended: '일시중지',
  churned: '이탈',
}
const STATUS_COLORS: Record<string, string> = {
  active: 'bg-status-green-bg text-status-green',
  suspended: 'bg-status-yellow-bg text-status-yellow',
  churned: 'bg-status-red-bg text-status-red',
}

const STATUS_OPTIONS = [
  { value: 'active', label: '활성' },
  { value: 'suspended', label: '일시중지' },
  { value: 'churned', label: '이탈' },
]

const COMPANY_TYPE_OPTIONS = [
  { value: '법인', label: '법인' },
  { value: '개인', label: '개인' },
  { value: '공공기관', label: '공공기관' },
  { value: '기타', label: '기타' },
]

const BILLING_TYPE_OPTIONS = [
  { value: '월과금', label: '월과금' },
  { value: '연과금', label: '연과금' },
  { value: '건별과금', label: '건별과금' },
  { value: '기타', label: '기타' },
]

const PROJECT_STATUS_OPTIONS = [
  { value: 'active', label: '진행중' },
  { value: 'completed', label: '완료' },
  { value: 'suspended', label: '중단' },
]

const SOLUTION_OPTIONS = [
  'AI CCTV',
  '스마트 안전장비',
  '동영상 기록관리',
  '공정관리 플랫폼',
  '중대재해예방',
]

function CustomerDetailContent() {
  const params = useParams<{ id: string }>()
  const id = params?.id
  const router = useRouter()
  const supabase = createClient()

  const [customer, setCustomer] = useState<Customer | null>(null)
  const [projects, setProjects] = useState<Project[]>([])
  const [revenues, setRevenues] = useState<MonthlyRevenue[]>([])
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState<Tab>('info')

  // Edit states
  const [editingInfo, setEditingInfo] = useState(false)
  const [editingBilling, setEditingBilling] = useState(false)
  const [savingInfo, setSavingInfo] = useState(false)
  const [savingBilling, setSavingBilling] = useState(false)

  // Delete modal
  const [deleteModal, setDeleteModal] = useState(false)
  const [deleting, setDeleting] = useState(false)

  // Project modal
  const [projectModal, setProjectModal] = useState(false)
  const [editingProject, setEditingProject] = useState<Project | null>(null)
  const [savingProject, setSavingProject] = useState(false)
  const [expandedProjects, setExpandedProjects] = useState<string[]>([])
  const [deleteProjectModal, setDeleteProjectModal] = useState<Project | null>(null)
  const [deletingProject, setDeletingProject] = useState(false)

  // Form states
  const [infoForm, setInfoForm] = useState({
    company_name: '',
    company_type: '',
    contact_person: '',
    contact_phone: '',
    contact_email: '',
    customer_code: '',
    business_reg_no: '',
    status: 'active',
    assigned_to: '',
    notes: '',
  })

  const [billingForm, setBillingForm] = useState({
    billing_type: '',
    service_type: '',
    user_count: '',
    billing_start: '',
    billing_end: '',
    invoice_email: '',
    invoice_contact: '',
    invoice_phone: '',
    tax_invoice_email: '',
    deposit_amount: '',
  })

  const [projectForm, setProjectForm] = useState({
    project_name: '',
    service_type: '',
    site_category: '',
    billing_start: '',
    billing_end: '',
    monthly_amount: '',
    status: 'active',
    notes: '',
    address: '',
    created_by: '',
    solutions: [] as string[],
    project_start: '',
    project_end: '',
  })

  // Document states
  const [documents, setDocuments] = useState<CustomerDocument[]>([])
  const [docUploading, setDocUploading] = useState(false)
  const [docUploadType, setDocUploadType] = useState<string>('business_registration')
  const [docUploadTitle, setDocUploadTitle] = useState('')
  const [docUploadNotes, setDocUploadNotes] = useState('')
  const [docModalOpen, setDocModalOpen] = useState(false)
  const [savingDocMeta, setSavingDocMeta] = useState(false)

  // Business registration metadata
  const [bizMetaForm, setBizMetaForm] = useState({
    biz_number: '',
    company_name: '',
    representative: '',
    address: '',
    biz_type: '',
    biz_category: '',
  })
  const [editingBizMeta, setEditingBizMeta] = useState(false)

  // Bank account metadata
  const [bankMetaForm, setBankMetaForm] = useState({
    bank_name: '',
    account_number: '',
    account_holder: '',
  })
  const [editingBankMeta, setEditingBankMeta] = useState(false)

  useEffect(() => {
    if (!id) return
    fetchAll()
    fetchDocuments()
    supabase.from('users').select('*').eq('is_active', true).then(({ data }) => {
      setUsers(data || [])
    })
  }, [id])

  async function fetchDocuments() {
    if (!id) return
    try {
      const { data, error } = await supabase
        .from('customer_documents')
        .select('*')
        .eq('customer_id', id)
        .order('doc_type')
        .order('version', { ascending: false })
      if (!error && data) {
        setDocuments(data as CustomerDocument[])
        // Load metadata from latest business_registration doc
        const bizDoc = data.find((d: any) => d.doc_type === 'business_registration')
        if (bizDoc?.metadata) {
          const m = bizDoc.metadata as any
          setBizMetaForm({
            biz_number: m.biz_number || '',
            company_name: m.company_name || '',
            representative: m.representative || '',
            address: m.address || '',
            biz_type: m.biz_type || '',
            biz_category: m.biz_category || '',
          })
        }
        // Load metadata from latest bank_account doc
        const bankDoc = data.find((d: any) => d.doc_type === 'bank_account')
        if (bankDoc?.metadata) {
          const m = bankDoc.metadata as any
          setBankMetaForm({
            bank_name: m.bank_name || '',
            account_number: m.account_number || '',
            account_holder: m.account_holder || '',
          })
        }
      }
    } catch (err) {
      console.error('fetchDocuments error:', err)
    }
  }

  async function fetchAll() {
    if (!id) {
      setError('고객 ID가 올바르지 않습니다.')
      setLoading(false)
      return
    }
    try {
      setError(null)
      const [custRes, projRes, revRes] = await Promise.all([
        supabase
          .from('customers')
          .select('*')
          .eq('id', id)
          .single(),
        supabase.from('projects').select('*').eq('customer_id', id).order('created_at', { ascending: false }),
        supabase.from('monthly_revenues').select('*').eq('customer_id', id).order('year', { ascending: false }).order('month', { ascending: false }),
      ])

      if (custRes.error) {
        console.error('Customer fetch error:', custRes.error)
        setError('고객 정보를 불러올 수 없습니다.')
        setLoading(false)
        return
      }

      const cust = custRes.data
      if (!cust) {
        setError('고객을 찾을 수 없습니다.')
        setLoading(false)
        return
      }
      setCustomer(cust)
      setProjects(projRes.data || [])
      setRevenues(revRes.data || [])
      setLoading(false)

      setInfoForm({
        company_name: cust.company_name || '',
        company_type: cust.company_type || '',
        contact_person: cust.contact_person || '',
        contact_phone: cust.contact_phone || '',
        contact_email: cust.contact_email || '',
        customer_code: cust.customer_code || '',
        business_reg_no: cust.business_reg_no || '',
        status: cust.status || 'active',
        assigned_to: cust.assigned_to || '',
        notes: cust.notes || '',
      })
      setBillingForm({
        billing_type: cust.billing_type || '',
        service_type: cust.service_type || '',
        user_count: cust.user_count ? String(cust.user_count) : '',
        billing_start: cust.billing_start || '',
        billing_end: cust.billing_end || '',
        invoice_email: cust.invoice_email || '',
        invoice_contact: cust.invoice_contact || '',
        invoice_phone: cust.invoice_phone || '',
        tax_invoice_email: cust.tax_invoice_email || '',
        deposit_amount: cust.deposit_amount ? String(cust.deposit_amount) : '',
      })
    } catch (err) {
      console.error('fetchAll error:', err)
      setError('데이터를 불러오는 중 오류가 발생했습니다.')
      setLoading(false)
    }
  }

  // --- Info save ---
  async function handleSaveInfo() {
    if (!infoForm.company_name.trim()) {
      toast.error('회사명은 필수입니다.')
      return
    }
    setSavingInfo(true)
    const { error } = await supabase
      .from('customers')
      .update({
        company_name: infoForm.company_name,
        company_type: infoForm.company_type || null,
        contact_person: infoForm.contact_person || null,
        contact_phone: infoForm.contact_phone || null,
        contact_email: infoForm.contact_email || null,
        customer_code: infoForm.customer_code || null,
        business_reg_no: infoForm.business_reg_no || null,
        status: infoForm.status,
        assigned_to: infoForm.assigned_to || null,
        notes: infoForm.notes || null,
      })
      .eq('id', id)

    if (error) {
      toast.error('저장에 실패했습니다.')
    } else {
      toast.success('기본정보가 수정되었습니다.')
      setEditingInfo(false)
      fetchAll()
    }
    setSavingInfo(false)
  }

  // --- Billing save ---
  async function handleSaveBilling() {
    setSavingBilling(true)
    const { error } = await supabase
      .from('customers')
      .update({
        billing_type: billingForm.billing_type || null,
        service_type: billingForm.service_type || null,
        user_count: billingForm.user_count ? Number(billingForm.user_count) : null,
        billing_start: billingForm.billing_start || null,
        billing_end: billingForm.billing_end || null,
        invoice_email: billingForm.invoice_email || null,
        invoice_contact: billingForm.invoice_contact || null,
        invoice_phone: billingForm.invoice_phone || null,
        tax_invoice_email: billingForm.tax_invoice_email || null,
        deposit_amount: billingForm.deposit_amount ? Number(billingForm.deposit_amount) : null,
      })
      .eq('id', id)

    if (error) {
      toast.error('저장에 실패했습니다.')
    } else {
      toast.success('과금/계약 정보가 수정되었습니다.')
      setEditingBilling(false)
      fetchAll()
    }
    setSavingBilling(false)
  }

  // --- Delete customer ---
  async function handleDelete() {
    setDeleting(true)
    const { error } = await supabase.from('customers').delete().eq('id', id)
    if (error) {
      toast.error('삭제에 실패했습니다. 연결된 데이터가 있을 수 있습니다.')
      setDeleting(false)
      setDeleteModal(false)
      return
    }
    toast.success('고객이 삭제되었습니다.')
    router.push('/customers')
  }

  // --- Project modal ---
  function openNewProject() {
    setEditingProject(null)
    setProjectForm({
      project_name: '',
      service_type: '',
      site_category: '',
      billing_start: '',
      billing_end: '',
      monthly_amount: '',
      status: 'active',
      notes: '',
      address: '',
      created_by: '',
      solutions: [],
      project_start: '',
      project_end: '',
    })
    setProjectModal(true)
  }

  function openEditProject(p: Project) {
    setEditingProject(p)
    setProjectForm({
      project_name: p.project_name || '',
      service_type: p.service_type || '',
      site_category: p.site_category || '',
      billing_start: p.billing_start || '',
      billing_end: p.billing_end || '',
      monthly_amount: p.monthly_amount ? String(p.monthly_amount) : '',
      status: p.status || 'active',
      notes: p.notes || '',
      address: p.address || '',
      created_by: p.created_by || '',
      solutions: (p.solutions && typeof p.solutions === 'string') ? p.solutions.split(',').map(s => s.trim()).filter(Boolean) : [],
      project_start: p.project_start || '',
      project_end: p.project_end || '',
    })
    setProjectModal(true)
  }

  async function handleSaveProject() {
    if (!projectForm.project_name.trim()) {
      toast.error('프로젝트명은 필수입니다.')
      return
    }

    setSavingProject(true)
    const payload = {
      customer_id: id,
      project_name: projectForm.project_name,
      service_type: projectForm.service_type || null,
      site_category: projectForm.site_category || null,
      billing_start: projectForm.billing_start || null,
      billing_end: projectForm.billing_end || null,
      monthly_amount: projectForm.monthly_amount ? Number(projectForm.monthly_amount) : null,
      status: projectForm.status,
      notes: projectForm.notes || null,
      address: projectForm.address || null,
      created_by: projectForm.created_by || null,
      solutions: projectForm.solutions.length > 0 ? projectForm.solutions.join(',') : null,
      project_start: projectForm.project_start || null,
      project_end: projectForm.project_end || null,
      source: (editingProject?.source || 'manual') as string,
    }

    let error
    if (editingProject) {
      ;({ error } = await supabase.from('projects').update(payload).eq('id', editingProject.id))
    } else {
      ;({ error } = await supabase.from('projects').insert(payload))
    }

    if (error) {
      toast.error('프로젝트 저장에 실패했습니다.')
    } else {
      toast.success(editingProject ? '프로젝트가 수정되었습니다.' : '프로젝트가 추가되었습니다.')
      setProjectModal(false)
      fetchAll()
    }
    setSavingProject(false)
  }

  // --- Document upload ---
  async function handleDocUpload(file: File, docType: string, title: string, notes?: string) {
    if (!id) return
    setDocUploading(true)
    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('folder', `customers/${id}/${docType}`)

      const res = await fetch('/api/upload', { method: 'POST', body: formData })
      const result = await res.json()

      if (!res.ok) {
        toast.error('파일 업로드에 실패했습니다: ' + (result.error || ''))
        setDocUploading(false)
        return
      }

      // Get current max version for this doc type
      const existingDocs = documents.filter(d => d.doc_type === docType)
      const maxVersion = existingDocs.length > 0 ? Math.max(...existingDocs.map(d => d.version)) : 0

      const { error } = await supabase.from('customer_documents').insert({
        customer_id: id,
        doc_type: docType,
        title: title || DOC_TYPE_LABELS[docType] || file.name,
        file_url: result.url,
        file_name: file.name,
        version: maxVersion + 1,
        metadata: docType === 'business_registration' ? bizMetaForm : docType === 'bank_account' ? bankMetaForm : {},
        notes: notes || null,
      })

      if (error) {
        toast.error('문서 저장에 실패했습니다.')
      } else {
        toast.success('문서가 업로드되었습니다.')
        fetchDocuments()
      }
    } catch (err: any) {
      toast.error('업로드 중 오류가 발생했습니다.')
      console.error(err)
    }
    setDocUploading(false)
    setDocModalOpen(false)
  }

  async function handleSaveBizMeta() {
    const bizDoc = documents.find(d => d.doc_type === 'business_registration')
    setSavingDocMeta(true)
    if (bizDoc) {
      const { error } = await supabase.from('customer_documents').update({
        metadata: bizMetaForm,
      }).eq('id', bizDoc.id)
      if (error) toast.error('저장에 실패했습니다.')
      else { toast.success('사업자 정보가 저장되었습니다.'); setEditingBizMeta(false); fetchDocuments() }
    } else {
      // Create a metadata-only document entry
      const { error } = await supabase.from('customer_documents').insert({
        customer_id: id,
        doc_type: 'business_registration',
        title: '사업자등록증 정보',
        metadata: bizMetaForm,
        version: 1,
      })
      if (error) toast.error('저장에 실패했습니다.')
      else { toast.success('사업자 정보가 저장되었습니다.'); setEditingBizMeta(false); fetchDocuments() }
    }
    setSavingDocMeta(false)
  }

  async function handleSaveBankMeta() {
    const bankDoc = documents.find(d => d.doc_type === 'bank_account')
    setSavingDocMeta(true)
    if (bankDoc) {
      const { error } = await supabase.from('customer_documents').update({
        metadata: bankMetaForm,
      }).eq('id', bankDoc.id)
      if (error) toast.error('저장에 실패했습니다.')
      else { toast.success('계좌 정보가 저장되었습니다.'); setEditingBankMeta(false); fetchDocuments() }
    } else {
      const { error } = await supabase.from('customer_documents').insert({
        customer_id: id,
        doc_type: 'bank_account',
        title: '통장사본 정보',
        metadata: bankMetaForm,
        version: 1,
      })
      if (error) toast.error('저장에 실패했습니다.')
      else { toast.success('계좌 정보가 저장되었습니다.'); setEditingBankMeta(false); fetchDocuments() }
    }
    setSavingDocMeta(false)
  }

  async function handleDeleteDoc(doc: CustomerDocument) {
    if (!confirm(`"${doc.title}" 문서를 삭제하시겠습니까?`)) return
    const { error } = await supabase.from('customer_documents').delete().eq('id', doc.id)
    if (error) toast.error('삭제에 실패했습니다.')
    else { toast.success('문서가 삭제되었습니다.'); fetchDocuments() }
  }

  async function handleDeleteProject() {
    if (!deleteProjectModal) return
    setDeletingProject(true)
    const { error } = await supabase.from('projects').delete().eq('id', deleteProjectModal.id)
    if (error) {
      toast.error('프로젝트 삭제에 실패했습니다.')
    } else {
      toast.success('프로젝트가 삭제되었습니다.')
      fetchAll()
    }
    setDeletingProject(false)
    setDeleteProjectModal(null)
  }

  // useMemo must be called before any early returns (React hooks rule)
  const totalRevenue = revenues.reduce((sum, r) => sum + Number(r.amount), 0)
  const projectGroups = useMemo(() => {
    return projects.reduce<Record<string, Project[]>>((acc, p) => {
      const name = p.project_name || '(미지정)'
      const dashIdx = name.lastIndexOf(' - ')
      const key = dashIdx > 0 ? name.substring(0, dashIdx) : name
      if (!acc[key]) acc[key] = []
      acc[key].push(p)
      return acc
    }, {})
  }, [projects])
  const projectGroupCount = Object.keys(projectGroups).length

  if (loading) return <PageLoading />
  if (error || !customer) {
    return (
      <div className="text-center py-12">
        <p className="text-text-secondary">{error || '고객을 찾을 수 없습니다.'}</p>
        <Link href="/customers">
          <Button variant="secondary" className="mt-4">목록으로</Button>
        </Link>
      </div>
    )
  }

  const docsByType = documents.reduce<Record<string, CustomerDocument[]>>((acc, d) => {
    if (!acc[d.doc_type]) acc[d.doc_type] = []
    acc[d.doc_type].push(d)
    return acc
  }, {})

  const tabs: { key: Tab; label: string; icon: React.ReactNode }[] = [
    { key: 'info', label: '기본정보', icon: <Building2 className="w-4 h-4" /> },
    { key: 'billing', label: '과금/계약', icon: <CreditCard className="w-4 h-4" /> },
    { key: 'projects', label: `프로젝트 (${projectGroupCount})`, icon: <FolderOpen className="w-4 h-4" /> },
    { key: 'payments', label: '매출이력', icon: <Receipt className="w-4 h-4" /> },
    { key: 'documents', label: `문서 (${documents.filter(d => d.file_url).length})`, icon: <FileText className="w-4 h-4" /> },
  ]

  return (
    <div>
      <div className="page-header">
        <div className="flex items-center gap-3">
          <Link href="/customers" className="text-text-tertiary hover:text-text-primary">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <h1 className="page-title">{customer.company_name}</h1>
          <Badge className={STATUS_COLORS[customer.status] || 'badge-gray'}>
            {STATUS_LABELS[customer.status] || customer.status || '미지정'}
          </Badge>
        </div>
        <Button variant="danger" size="sm" onClick={() => setDeleteModal(true)}>
          <Trash2 className="w-4 h-4 mr-1" />
          삭제
        </Button>
      </div>

      {/* 요약 카드 */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <div className="stat-card">
          <div className="stat-label">누적 매출</div>
          <div className="stat-value">{formatCurrency(totalRevenue)}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">프로젝트</div>
          <div className="stat-value">{projectGroupCount}건</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">영업 담당</div>
          <div className="stat-value text-lg">{users.find(u => u.id === customer.assigned_to)?.name || '-'}</div>
        </div>
      </div>

      {/* 탭 */}
      <div className="tab-nav mb-6">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`tab-item ${tab === t.key ? 'tab-item-active' : ''}`}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>

      {/* 기본정보 탭 */}
      {tab === 'info' && (
        <div className="card p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-text-secondary">기본정보</h3>
            {!editingInfo ? (
              <Button variant="secondary" size="sm" onClick={() => setEditingInfo(true)}>
                <Pencil className="w-4 h-4 mr-1" />
                수정
              </Button>
            ) : (
              <div className="flex gap-2">
                <Button size="sm" loading={savingInfo} onClick={handleSaveInfo}>저장</Button>
                <Button variant="secondary" size="sm" onClick={() => { setEditingInfo(false); fetchAll() }}>취소</Button>
              </div>
            )}
          </div>

          {!editingInfo ? (
            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {[
                ['회사명', customer.company_name],
                ['타입', customer.company_type],
                ['담당자', customer.contact_person],
                ['연락처', customer.contact_phone],
                ['이메일', customer.contact_email],
                ['고객사 ID', customer.customer_code],
                ['사업자등록번호', customer.business_reg_no],
                ['상태', STATUS_LABELS[customer.status]],
                ['영업 담당자', users.find(u => u.id === customer.assigned_to)?.name],
              ].map(([label, value]) => (
                <div key={label as string}>
                  <dt className="text-sm text-text-secondary">{label}</dt>
                  <dd className="text-sm font-medium text-text-primary mt-0.5">{(value as string) || '-'}</dd>
                </div>
              ))}
              {customer.notes && (
                <div className="sm:col-span-2">
                  <dt className="text-sm text-text-secondary">특이사항</dt>
                  <dd className="text-sm text-text-primary mt-0.5 whitespace-pre-wrap">{customer.notes}</dd>
                </div>
              )}
            </dl>
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Input
                  label="회사명 *"
                  value={infoForm.company_name}
                  onChange={(e) => setInfoForm(f => ({ ...f, company_name: e.target.value }))}
                />
                <Select
                  label="타입"
                  value={infoForm.company_type}
                  onChange={(e) => setInfoForm(f => ({ ...f, company_type: e.target.value }))}
                  options={COMPANY_TYPE_OPTIONS}
                  placeholder="타입 선택"
                />
                <Input
                  label="담당자"
                  value={infoForm.contact_person}
                  onChange={(e) => setInfoForm(f => ({ ...f, contact_person: e.target.value }))}
                />
                <Input
                  label="연락처"
                  value={infoForm.contact_phone}
                  onChange={(e) => setInfoForm(f => ({ ...f, contact_phone: e.target.value }))}
                />
                <Input
                  label="이메일"
                  type="email"
                  value={infoForm.contact_email}
                  onChange={(e) => setInfoForm(f => ({ ...f, contact_email: e.target.value }))}
                />
                <Input
                  label="고객사 ID"
                  value={infoForm.customer_code}
                  onChange={(e) => setInfoForm(f => ({ ...f, customer_code: e.target.value }))}
                />
                <Input
                  label="사업자등록번호"
                  value={infoForm.business_reg_no}
                  onChange={(e) => setInfoForm(f => ({ ...f, business_reg_no: e.target.value }))}
                />
                <Select
                  label="상태"
                  value={infoForm.status}
                  onChange={(e) => setInfoForm(f => ({ ...f, status: e.target.value }))}
                  options={STATUS_OPTIONS}
                />
                <Select
                  label="영업 담당자"
                  value={infoForm.assigned_to}
                  onChange={(e) => setInfoForm(f => ({ ...f, assigned_to: e.target.value }))}
                  options={users.map(u => ({ value: u.id, label: u.name }))}
                  placeholder="담당자 선택"
                />
              </div>
              <Textarea
                label="특이사항"
                value={infoForm.notes}
                onChange={(e) => setInfoForm(f => ({ ...f, notes: e.target.value }))}
              />
            </div>
          )}
        </div>
      )}

      {/* 과금/계약 탭 */}
      {tab === 'billing' && (
        <div className="card p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-text-secondary">과금/계약 정보</h3>
            {!editingBilling ? (
              <Button variant="secondary" size="sm" onClick={() => setEditingBilling(true)}>
                <Pencil className="w-4 h-4 mr-1" />
                수정
              </Button>
            ) : (
              <div className="flex gap-2">
                <Button size="sm" loading={savingBilling} onClick={handleSaveBilling}>저장</Button>
                <Button variant="secondary" size="sm" onClick={() => { setEditingBilling(false); fetchAll() }}>취소</Button>
              </div>
            )}
          </div>

          {!editingBilling ? (
            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {[
                ['과금방식', customer.billing_type],
                ['이용 서비스', customer.service_type],
                ['이용유저 수', customer.user_count ? `${customer.user_count}명` : null],
                ['과금 시작일', customer.billing_start ? formatDate(customer.billing_start) : null],
                ['과금 종료일', customer.billing_end ? formatDate(customer.billing_end) : null],
                ['청구서 이메일', customer.invoice_email],
                ['청구 담당자', customer.invoice_contact],
                ['청구 연락처', customer.invoice_phone],
                ['세금계산서 이메일', customer.tax_invoice_email],
                ['보증금', customer.deposit_amount ? formatCurrency(Number(customer.deposit_amount)) : null],
              ].map(([label, value]) => (
                <div key={label as string}>
                  <dt className="text-sm text-text-secondary">{label}</dt>
                  <dd className="text-sm font-medium text-text-primary mt-0.5">{(value as string) || '-'}</dd>
                </div>
              ))}
            </dl>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Select
                label="과금방식"
                value={billingForm.billing_type}
                onChange={(e) => setBillingForm(f => ({ ...f, billing_type: e.target.value }))}
                options={BILLING_TYPE_OPTIONS}
                placeholder="과금방식 선택"
              />
              <Input
                label="이용 서비스"
                value={billingForm.service_type}
                onChange={(e) => setBillingForm(f => ({ ...f, service_type: e.target.value }))}
              />
              <Input
                label="이용유저 수"
                type="number"
                value={billingForm.user_count}
                onChange={(e) => setBillingForm(f => ({ ...f, user_count: e.target.value }))}
              />
              <Input
                label="과금 시작일"
                type="date"
                value={billingForm.billing_start}
                onChange={(e) => setBillingForm(f => ({ ...f, billing_start: e.target.value }))}
              />
              <Input
                label="과금 종료일"
                type="date"
                value={billingForm.billing_end}
                onChange={(e) => setBillingForm(f => ({ ...f, billing_end: e.target.value }))}
              />
              <Input
                label="청구서 이메일"
                type="email"
                value={billingForm.invoice_email}
                onChange={(e) => setBillingForm(f => ({ ...f, invoice_email: e.target.value }))}
              />
              <Input
                label="청구 담당자"
                value={billingForm.invoice_contact}
                onChange={(e) => setBillingForm(f => ({ ...f, invoice_contact: e.target.value }))}
              />
              <Input
                label="청구 연락처"
                value={billingForm.invoice_phone}
                onChange={(e) => setBillingForm(f => ({ ...f, invoice_phone: e.target.value }))}
              />
              <Input
                label="세금계산서 이메일"
                type="email"
                value={billingForm.tax_invoice_email}
                onChange={(e) => setBillingForm(f => ({ ...f, tax_invoice_email: e.target.value }))}
              />
              <Input
                label="보증금"
                type="number"
                value={billingForm.deposit_amount}
                onChange={(e) => setBillingForm(f => ({ ...f, deposit_amount: e.target.value }))}
              />
            </div>
          )}
        </div>
      )}

      {/* 프로젝트 탭 */}
      {tab === 'projects' && (
        <div>
          <div className="flex justify-end mb-3">
            <Button size="sm" onClick={openNewProject}>
              <Plus className="w-4 h-4 mr-1" />
              프로젝트 추가
            </Button>
          </div>
          {(() => {
            const grouped = projectGroups
            const groupKeys = Object.keys(grouped)
            if (groupKeys.length === 0) {
              return <div className="text-center text-text-tertiary py-12">등록된 프로젝트가 없습니다.</div>
            }
            return (
              <div className="space-y-3">
                {groupKeys.map((projectName) => {
                  const items = grouped[projectName]
                  const isOpen = expandedProjects.includes(projectName)
                  const totalAmount = items.reduce((sum, p) => sum + (Number(p.monthly_amount) || 0), 0)
                  const allSolutions = Array.from(new Set(
                    items.flatMap(p => {
                      if (p.solutions) return p.solutions.split(',').map(s => s.trim())
                      const fromName = (() => { const n = p.project_name || ''; const i = n.lastIndexOf(' - '); return i > 0 ? n.substring(i + 3) : null })()
                      if (fromName) return [fromName]
                      if (p.service_type) return [p.service_type]
                      return []
                    })
                  ))
                  const firstItem = items[0]
                  const hasActive = items.some(p => p.status === 'active')

                  return (
                    <div key={projectName} className="border border-border rounded-lg overflow-hidden">
                      {/* 프로젝트 헤더 (클릭으로 확장/축소) */}
                      <div
                        className="flex items-center gap-3 px-4 py-3 bg-surface-tertiary cursor-pointer hover:bg-surface-secondary transition-colors"
                        onClick={() => setExpandedProjects(prev =>
                          prev.includes(projectName) ? prev.filter(n => n !== projectName) : [...prev, projectName]
                        )}
                      >
                        <span className={`text-text-tertiary transition-transform ${isOpen ? 'rotate-90' : ''}`}>▶</span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-text-primary">{projectName}</span>
                            <Badge className={hasActive ? 'bg-status-green-bg text-status-green' : 'bg-status-gray-bg text-text-secondary'}>
                              {hasActive ? '진행중' : '종료'}
                            </Badge>
                            <span className="text-xs text-text-tertiary">서비스 {allSolutions.length}개</span>
                          </div>
                          {firstItem.address && (
                            <div className="text-xs text-text-secondary mt-0.5">{firstItem.address}</div>
                          )}
                        </div>
                        <div className="flex flex-wrap gap-1 max-w-[300px]">
                          {allSolutions.slice(0, 4).map(s => (
                            <span key={s} className="px-1.5 py-0.5 text-xs bg-status-blue-bg text-status-blue rounded">{s}</span>
                          ))}
                          {allSolutions.length > 4 && (
                            <span className="px-1.5 py-0.5 text-xs bg-status-gray-bg text-text-secondary rounded">+{allSolutions.length - 4}</span>
                          )}
                        </div>
                        <div className="text-right min-w-[100px]">
                          <div className="font-semibold text-sm">{formatCurrency(totalAmount)}</div>
                          <div className="text-xs text-text-tertiary">월 합계</div>
                        </div>
                      </div>

                      {/* 확장 영역: 서비스 목록 */}
                      {isOpen && (
                        <div className="border-t border-border">
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="bg-white border-b border-border-light">
                                <th className="text-left px-4 py-2 text-xs text-text-secondary font-medium">서비스(솔루션)</th>
                                <th className="text-left px-4 py-2 text-xs text-text-secondary font-medium">현장구분</th>
                                <th className="text-left px-4 py-2 text-xs text-text-secondary font-medium">기간</th>
                                <th className="text-left px-4 py-2 text-xs text-text-secondary font-medium">월 과금액</th>
                                <th className="text-left px-4 py-2 text-xs text-text-secondary font-medium">상태</th>
                                <th className="text-left px-4 py-2 text-xs text-text-secondary font-medium w-20">관리</th>
                              </tr>
                            </thead>
                            <tbody>
                              {items.map((p) => {
                                const fromName = (() => { const n = p.project_name || ''; const i = n.lastIndexOf(' - '); return i > 0 ? n.substring(i + 3) : null })()
                                const services = p.solutions ? p.solutions.split(',').map(s => s.trim()) : fromName ? [fromName] : p.service_type ? [p.service_type] : ['(미지정)']
                                return (
                                  <tr key={p.id} className="border-b border-border-light hover:bg-primary-50/30">
                                    <td className="px-4 py-2.5">
                                      <div className="flex flex-wrap gap-1">
                                        {services.map(s => (
                                          <span key={s} className="px-2 py-0.5 text-xs bg-status-blue-bg text-status-blue rounded font-medium">{s}</span>
                                        ))}
                                      </div>
                                    </td>
                                    <td className="px-4 py-2.5 text-text-secondary">{p.site_category || '-'}</td>
                                    <td className="px-4 py-2.5 text-text-secondary text-xs">
                                      {p.billing_start ? formatDate(p.billing_start) : ''}{p.billing_start && p.billing_end ? ' ~ ' : ''}{p.billing_end ? formatDate(p.billing_end) : p.billing_start ? ' ~' : '-'}
                                    </td>
                                    <td className="px-4 py-2.5 font-medium">{p.monthly_amount ? formatCurrency(Number(p.monthly_amount)) : '-'}</td>
                                    <td className="px-4 py-2.5">
                                      <Badge className={p.status === 'active' ? 'bg-status-green-bg text-status-green' : 'bg-status-gray-bg text-text-secondary'}>
                                        {p.status === 'active' ? '진행중' : p.status === 'completed' ? '완료' : p.status}
                                      </Badge>
                                    </td>
                                    <td className="px-4 py-2.5">
                                      <div className="flex gap-1">
                                        <button onClick={() => openEditProject(p)} className="p-1 text-text-tertiary hover:text-primary-500 rounded" title="수정">
                                          <Pencil className="w-3.5 h-3.5" />
                                        </button>
                                        <button onClick={() => setDeleteProjectModal(p)} className="p-1 text-text-tertiary hover:text-status-red rounded" title="삭제">
                                          <Trash2 className="w-3.5 h-3.5" />
                                        </button>
                                      </div>
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
                })}
              </div>
            )
          })()}
        </div>
      )}

      {/* 매출이력 탭 */}
      {tab === 'payments' && (
        <div className="table-container">
          <table className="data-table">
            <thead>
              <tr>
                <th>연도</th>
                <th>월</th>
                <th>금액</th>
                <th>입금확인</th>
              </tr>
            </thead>
            <tbody>
              {revenues.map((r) => (
                <tr key={r.id}>
                  <td>{r.year}</td>
                  <td>{r.month}월</td>
                  <td className="font-medium">{formatCurrency(Number(r.amount))}</td>
                  <td>
                    <Badge className={r.is_confirmed ? 'bg-status-green-bg text-status-green' : 'bg-status-yellow-bg text-status-yellow'}>
                      {r.is_confirmed ? '확인' : '미확인'}
                    </Badge>
                  </td>
                </tr>
              ))}
              {revenues.length === 0 && (
                <tr>
                  <td colSpan={4} className="text-center text-text-tertiary py-8">
                    매출 이력이 없습니다.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* 문서 탭 */}
      {tab === 'documents' && (
        <div className="space-y-6">
          {/* 사업자등록증 섹션 */}
          <div className="card p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-text-secondary flex items-center gap-2">
                <span>🏢</span> 사업자등록증
              </h3>
              <div className="flex gap-2">
                {!editingBizMeta ? (
                  <Button variant="secondary" size="sm" onClick={() => setEditingBizMeta(true)}>
                    <Pencil className="w-3.5 h-3.5 mr-1" /> 정보 수정
                  </Button>
                ) : (
                  <div className="flex gap-2">
                    <Button size="sm" loading={savingDocMeta} onClick={handleSaveBizMeta}>저장</Button>
                    <Button variant="secondary" size="sm" onClick={() => setEditingBizMeta(false)}>취소</Button>
                  </div>
                )}
                <label className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-primary-50 text-primary-600 rounded-lg cursor-pointer hover:bg-primary-100 transition-colors">
                  <Upload className="w-3.5 h-3.5" />
                  파일 업로드
                  <input
                    type="file"
                    className="hidden"
                    accept=".pdf,.jpg,.jpeg,.png"
                    onChange={(e) => {
                      const file = e.target.files?.[0]
                      if (file) handleDocUpload(file, 'business_registration', '사업자등록증')
                      e.target.value = ''
                    }}
                    disabled={docUploading}
                  />
                </label>
              </div>
            </div>

            {/* 사업자 정보 필드 */}
            {!editingBizMeta ? (
              <dl className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
                {[
                  ['사업자번호', bizMetaForm.biz_number],
                  ['상호', bizMetaForm.company_name],
                  ['대표자', bizMetaForm.representative],
                  ['주소', bizMetaForm.address],
                  ['업태', bizMetaForm.biz_type],
                  ['종목', bizMetaForm.biz_category],
                ].map(([label, value]) => (
                  <div key={label as string}>
                    <dt className="text-xs text-text-tertiary">{label}</dt>
                    <dd className="text-sm font-medium text-text-primary mt-0.5">{(value as string) || '-'}</dd>
                  </div>
                ))}
              </dl>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
                <Input label="사업자번호" value={bizMetaForm.biz_number} onChange={(e) => setBizMetaForm(f => ({ ...f, biz_number: e.target.value }))} placeholder="000-00-00000" />
                <Input label="상호" value={bizMetaForm.company_name} onChange={(e) => setBizMetaForm(f => ({ ...f, company_name: e.target.value }))} />
                <Input label="대표자" value={bizMetaForm.representative} onChange={(e) => setBizMetaForm(f => ({ ...f, representative: e.target.value }))} />
                <Input label="주소" value={bizMetaForm.address} onChange={(e) => setBizMetaForm(f => ({ ...f, address: e.target.value }))} />
                <Input label="업태" value={bizMetaForm.biz_type} onChange={(e) => setBizMetaForm(f => ({ ...f, biz_type: e.target.value }))} />
                <Input label="종목" value={bizMetaForm.biz_category} onChange={(e) => setBizMetaForm(f => ({ ...f, biz_category: e.target.value }))} />
              </div>
            )}

            {/* 업로드된 파일 목록 */}
            {(docsByType['business_registration'] || []).filter(d => d.file_url).length > 0 && (
              <div className="border-t border-border pt-3">
                <div className="text-xs text-text-tertiary mb-2">업로드 파일 (버전 이력)</div>
                <div className="space-y-1.5">
                  {(docsByType['business_registration'] || []).filter(d => d.file_url).map(doc => (
                    <div key={doc.id} className="flex items-center gap-3 px-3 py-2 bg-surface-tertiary rounded-lg text-sm">
                      <FileText className="w-4 h-4 text-text-tertiary flex-shrink-0" />
                      <span className="flex-1 truncate">{doc.file_name || doc.title}</span>
                      <Badge className="bg-blue-50 text-blue-600 text-xs">v{doc.version}</Badge>
                      <span className="text-xs text-text-tertiary">{formatDate(doc.created_at)}</span>
                      {doc.file_url && (
                        <a href={doc.file_url} target="_blank" rel="noopener noreferrer" className="p-1 text-text-tertiary hover:text-primary-500" title="보기/다운로드">
                          <Download className="w-3.5 h-3.5" />
                        </a>
                      )}
                      <button onClick={() => handleDeleteDoc(doc)} className="p-1 text-text-tertiary hover:text-status-red" title="삭제">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* 통장사본 섹션 */}
          <div className="card p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-text-secondary flex items-center gap-2">
                <span>🏦</span> 통장사본
              </h3>
              <div className="flex gap-2">
                {!editingBankMeta ? (
                  <Button variant="secondary" size="sm" onClick={() => setEditingBankMeta(true)}>
                    <Pencil className="w-3.5 h-3.5 mr-1" /> 정보 수정
                  </Button>
                ) : (
                  <div className="flex gap-2">
                    <Button size="sm" loading={savingDocMeta} onClick={handleSaveBankMeta}>저장</Button>
                    <Button variant="secondary" size="sm" onClick={() => setEditingBankMeta(false)}>취소</Button>
                  </div>
                )}
                <label className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-primary-50 text-primary-600 rounded-lg cursor-pointer hover:bg-primary-100 transition-colors">
                  <Upload className="w-3.5 h-3.5" />
                  파일 업로드
                  <input
                    type="file"
                    className="hidden"
                    accept=".pdf,.jpg,.jpeg,.png"
                    onChange={(e) => {
                      const file = e.target.files?.[0]
                      if (file) handleDocUpload(file, 'bank_account', '통장사본')
                      e.target.value = ''
                    }}
                    disabled={docUploading}
                  />
                </label>
              </div>
            </div>

            {/* 계좌 정보 필드 */}
            {!editingBankMeta ? (
              <dl className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
                {[
                  ['은행명', bankMetaForm.bank_name],
                  ['계좌번호', bankMetaForm.account_number],
                  ['예금주', bankMetaForm.account_holder],
                ].map(([label, value]) => (
                  <div key={label as string}>
                    <dt className="text-xs text-text-tertiary">{label}</dt>
                    <dd className="text-sm font-medium text-text-primary mt-0.5">{(value as string) || '-'}</dd>
                  </div>
                ))}
              </dl>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
                <Input label="은행명" value={bankMetaForm.bank_name} onChange={(e) => setBankMetaForm(f => ({ ...f, bank_name: e.target.value }))} placeholder="우리은행" />
                <Input label="계좌번호" value={bankMetaForm.account_number} onChange={(e) => setBankMetaForm(f => ({ ...f, account_number: e.target.value }))} placeholder="000-000000-00000" />
                <Input label="예금주" value={bankMetaForm.account_holder} onChange={(e) => setBankMetaForm(f => ({ ...f, account_holder: e.target.value }))} />
              </div>
            )}

            {/* 업로드된 파일 목록 */}
            {(docsByType['bank_account'] || []).filter(d => d.file_url).length > 0 && (
              <div className="border-t border-border pt-3">
                <div className="text-xs text-text-tertiary mb-2">업로드 파일</div>
                <div className="space-y-1.5">
                  {(docsByType['bank_account'] || []).filter(d => d.file_url).map(doc => (
                    <div key={doc.id} className="flex items-center gap-3 px-3 py-2 bg-surface-tertiary rounded-lg text-sm">
                      <FileText className="w-4 h-4 text-text-tertiary flex-shrink-0" />
                      <span className="flex-1 truncate">{doc.file_name || doc.title}</span>
                      <span className="text-xs text-text-tertiary">{formatDate(doc.created_at)}</span>
                      {doc.file_url && (
                        <a href={doc.file_url} target="_blank" rel="noopener noreferrer" className="p-1 text-text-tertiary hover:text-primary-500" title="보기/다운로드">
                          <Download className="w-3.5 h-3.5" />
                        </a>
                      )}
                      <button onClick={() => handleDeleteDoc(doc)} className="p-1 text-text-tertiary hover:text-status-red" title="삭제">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* 계약서 섹션 */}
          <div className="card p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-text-secondary flex items-center gap-2">
                <span>📝</span> 계약서
              </h3>
              <label className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-primary-50 text-primary-600 rounded-lg cursor-pointer hover:bg-primary-100 transition-colors">
                <Upload className="w-3.5 h-3.5" />
                파일 업로드
                <input
                  type="file"
                  className="hidden"
                  accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
                  onChange={(e) => {
                    const file = e.target.files?.[0]
                    if (file) handleDocUpload(file, 'contract', `계약서 - ${file.name}`)
                    e.target.value = ''
                  }}
                  disabled={docUploading}
                />
              </label>
            </div>

            {(docsByType['contract'] || []).filter(d => d.file_url).length > 0 ? (
              <div className="space-y-1.5">
                {(docsByType['contract'] || []).filter(d => d.file_url).map(doc => (
                  <div key={doc.id} className="flex items-center gap-3 px-3 py-2 bg-surface-tertiary rounded-lg text-sm">
                    <FileText className="w-4 h-4 text-text-tertiary flex-shrink-0" />
                    <span className="flex-1 truncate">{doc.file_name || doc.title}</span>
                    <span className="text-xs text-text-tertiary">{formatDate(doc.created_at)}</span>
                    {doc.file_url && (
                      <a href={doc.file_url} target="_blank" rel="noopener noreferrer" className="p-1 text-text-tertiary hover:text-primary-500" title="보기/다운로드">
                        <Download className="w-3.5 h-3.5" />
                      </a>
                    )}
                    <button onClick={() => handleDeleteDoc(doc)} className="p-1 text-text-tertiary hover:text-status-red" title="삭제">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-text-tertiary text-center py-6">업로드된 계약서가 없습니다.</p>
            )}
          </div>

          {/* 기타 문서 섹션 */}
          <div className="card p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-text-secondary flex items-center gap-2">
                <span>📎</span> 기타 문서
              </h3>
              <label className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-primary-50 text-primary-600 rounded-lg cursor-pointer hover:bg-primary-100 transition-colors">
                <Upload className="w-3.5 h-3.5" />
                파일 업로드
                <input
                  type="file"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0]
                    if (file) handleDocUpload(file, 'other', file.name)
                    e.target.value = ''
                  }}
                  disabled={docUploading}
                />
              </label>
            </div>

            {(docsByType['other'] || []).filter(d => d.file_url).length > 0 ? (
              <div className="space-y-1.5">
                {(docsByType['other'] || []).filter(d => d.file_url).map(doc => (
                  <div key={doc.id} className="flex items-center gap-3 px-3 py-2 bg-surface-tertiary rounded-lg text-sm">
                    <FileText className="w-4 h-4 text-text-tertiary flex-shrink-0" />
                    <span className="flex-1 truncate">{doc.file_name || doc.title}</span>
                    <span className="text-xs text-text-tertiary">{formatDate(doc.created_at)}</span>
                    {doc.file_url && (
                      <a href={doc.file_url} target="_blank" rel="noopener noreferrer" className="p-1 text-text-tertiary hover:text-primary-500" title="보기/다운로드">
                        <Download className="w-3.5 h-3.5" />
                      </a>
                    )}
                    <button onClick={() => handleDeleteDoc(doc)} className="p-1 text-text-tertiary hover:text-status-red" title="삭제">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-text-tertiary text-center py-6">업로드된 기타 문서가 없습니다.</p>
            )}
          </div>

          {docUploading && (
            <div className="fixed inset-0 bg-black/20 flex items-center justify-center z-50">
              <div className="bg-white rounded-lg p-6 shadow-xl flex items-center gap-3">
                <div className="w-5 h-5 border-2 border-gray-300 border-t-primary-600 rounded-full animate-spin" />
                <span className="text-sm">파일 업로드 중...</span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 삭제 확인 모달 */}
      <Modal open={deleteModal} onClose={() => setDeleteModal(false)} title="고객 삭제">
        <p className="text-sm text-text-secondary mb-4">
          <strong>{customer.company_name}</strong>을(를) 정말 삭제하시겠습니까?
          <br />
          <span className="text-status-red">연결된 프로젝트, 매출 데이터가 있으면 삭제가 실패할 수 있습니다.</span>
        </p>
        <div className="flex gap-3 justify-end">
          <Button variant="secondary" size="sm" onClick={() => setDeleteModal(false)}>취소</Button>
          <Button variant="danger" size="sm" loading={deleting} onClick={handleDelete}>삭제</Button>
        </div>
      </Modal>

      {/* 프로젝트 추가/수정 모달 */}
      <Modal
        open={projectModal}
        onClose={() => setProjectModal(false)}
        title={editingProject ? '프로젝트 수정' : '프로젝트 추가'}
      >
        <div className="space-y-4">
          <Input
            label="프로젝트명 *"
            value={projectForm.project_name}
            onChange={(e) => setProjectForm(f => ({ ...f, project_name: e.target.value }))}
            placeholder="프로젝트명을 입력하세요"
          />
          <Input
            label="주소"
            value={projectForm.address}
            onChange={(e) => setProjectForm(f => ({ ...f, address: e.target.value }))}
            placeholder="프로젝트 주소"
          />
          <Input
            label="생성자"
            value={projectForm.created_by}
            onChange={(e) => setProjectForm(f => ({ ...f, created_by: e.target.value }))}
            placeholder="생성자 이름"
          />
          {/* 투입 솔루션 체크박스 */}
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-2">투입 솔루션</label>
            <div className="flex flex-wrap gap-3">
              {SOLUTION_OPTIONS.map((sol) => (
                <label key={sol} className="flex items-center gap-1.5 text-sm cursor-pointer">
                  <input
                    type="checkbox"
                    checked={projectForm.solutions.includes(sol)}
                    onChange={(e) => {
                      setProjectForm(f => ({
                        ...f,
                        solutions: e.target.checked
                          ? [...f.solutions, sol]
                          : f.solutions.filter(s => s !== sol),
                      }))
                    }}
                    className="rounded border-gray-300 text-primary-400 focus:ring-primary-500"
                  />
                  {sol}
                </label>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Input
              label="현장구분"
              value={projectForm.site_category}
              onChange={(e) => setProjectForm(f => ({ ...f, site_category: e.target.value }))}
              placeholder="건축/토목/플랜트 등"
            />
            <Select
              label="상태"
              value={projectForm.status}
              onChange={(e) => setProjectForm(f => ({ ...f, status: e.target.value }))}
              options={PROJECT_STATUS_OPTIONS}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Input
              label="프로젝트 시작일"
              type="date"
              value={projectForm.project_start}
              onChange={(e) => setProjectForm(f => ({ ...f, project_start: e.target.value }))}
            />
            <Input
              label="프로젝트 종료일"
              type="date"
              value={projectForm.project_end}
              onChange={(e) => setProjectForm(f => ({ ...f, project_end: e.target.value }))}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Input
              label="과금 시작일"
              type="date"
              value={projectForm.billing_start}
              onChange={(e) => setProjectForm(f => ({ ...f, billing_start: e.target.value }))}
            />
            <Input
              label="과금 종료일"
              type="date"
              value={projectForm.billing_end}
              onChange={(e) => setProjectForm(f => ({ ...f, billing_end: e.target.value }))}
            />
          </div>
          <Input
            label="월 과금액"
            type="number"
            value={projectForm.monthly_amount}
            onChange={(e) => setProjectForm(f => ({ ...f, monthly_amount: e.target.value }))}
            placeholder="0"
          />
          <Textarea
            label="메모"
            value={projectForm.notes}
            onChange={(e) => setProjectForm(f => ({ ...f, notes: e.target.value }))}
            placeholder="추가 메모"
          />
          <div className="flex gap-3 justify-end pt-2">
            <Button variant="secondary" size="sm" onClick={() => setProjectModal(false)}>취소</Button>
            <Button size="sm" loading={savingProject} onClick={handleSaveProject}>
              {editingProject ? '수정' : '추가'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* 프로젝트 삭제 확인 모달 */}
      <Modal open={!!deleteProjectModal} onClose={() => setDeleteProjectModal(null)} title="프로젝트 삭제">
        <p className="text-sm text-text-secondary mb-4">
          <strong>{deleteProjectModal?.project_name}</strong>을(를) 정말 삭제하시겠습니까?
        </p>
        <div className="flex gap-3 justify-end">
          <Button variant="secondary" size="sm" onClick={() => setDeleteProjectModal(null)}>취소</Button>
          <Button variant="danger" size="sm" loading={deletingProject} onClick={handleDeleteProject}>삭제</Button>
        </div>
      </Modal>
    </div>
  )
}

// Error Boundary wrapper
class CustomerErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean; error?: Error }> {
  constructor(props: { children: React.ReactNode }) {
    super(props)
    this.state = { hasError: false }
  }
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error }
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="p-8 text-center">
          <p className="text-status-red font-semibold mb-2">페이지 로딩 중 오류가 발생했습니다.</p>
          <p className="text-sm text-text-secondary mb-4">{this.state.error?.message}</p>
          <button onClick={() => window.location.reload()} className="px-4 py-2 bg-primary-400 text-white rounded-lg text-sm hover:bg-primary-500">
            새로고침
          </button>
        </div>
      )
    }
    return this.props.children
  }
}

export default function CustomerDetailPage() {
  return (
    <CustomerErrorBoundary>
      <CustomerDetailContent />
    </CustomerErrorBoundary>
  )
}
