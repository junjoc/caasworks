'use client'

import { useEffect, useState } from 'react'
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
import { ArrowLeft, Building2, CreditCard, FolderOpen, Receipt, Pencil, Trash2, Plus } from 'lucide-react'
import { toast } from 'sonner'

type Tab = 'info' | 'billing' | 'projects' | 'payments'

const STATUS_LABELS: Record<string, string> = {
  active: '활성',
  suspended: '일시중지',
  churned: '이탈',
}
const STATUS_COLORS: Record<string, string> = {
  active: 'bg-green-100 text-green-700',
  suspended: 'bg-yellow-100 text-yellow-700',
  churned: 'bg-red-100 text-red-700',
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

export default function CustomerDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const supabase = createClient()

  const [customer, setCustomer] = useState<Customer | null>(null)
  const [projects, setProjects] = useState<Project[]>([])
  const [revenues, setRevenues] = useState<MonthlyRevenue[]>([])
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
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

  useEffect(() => {
    fetchAll()
    supabase.from('users').select('*').eq('is_active', true).then(({ data }) => {
      setUsers(data || [])
    })
  }, [id])

  async function fetchAll() {
    const [custRes, projRes, revRes] = await Promise.all([
      supabase
        .from('customers')
        .select('*, assigned_user:users!customers_assigned_to_fkey(id, name)')
        .eq('id', id)
        .single(),
      supabase.from('projects').select('*').eq('customer_id', id).order('created_at', { ascending: false }),
      supabase.from('monthly_revenues').select('*').eq('customer_id', id).order('year', { ascending: false }).order('month', { ascending: false }),
    ])

    const cust = custRes.data
    setCustomer(cust)
    setProjects(projRes.data || [])
    setRevenues(revRes.data || [])
    setLoading(false)

    if (cust) {
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
      solutions: p.solutions ? p.solutions.split(',').map(s => s.trim()) : [],
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

  if (loading) return <PageLoading />
  if (!customer) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500">고객을 찾을 수 없습니다.</p>
        <Link href="/customers">
          <Button variant="secondary" className="mt-4">목록으로</Button>
        </Link>
      </div>
    )
  }

  const totalRevenue = revenues.reduce((sum, r) => sum + Number(r.amount), 0)

  const tabs: { key: Tab; label: string; icon: React.ReactNode }[] = [
    { key: 'info', label: '기본정보', icon: <Building2 className="w-4 h-4" /> },
    { key: 'billing', label: '과금/계약', icon: <CreditCard className="w-4 h-4" /> },
    { key: 'projects', label: `프로젝트 (${projects.length})`, icon: <FolderOpen className="w-4 h-4" /> },
    { key: 'payments', label: '매출이력', icon: <Receipt className="w-4 h-4" /> },
  ]

  return (
    <div>
      <div className="page-header">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/customers" className="text-gray-400 hover:text-gray-600">
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <h1 className="page-title">{customer.company_name}</h1>
            <Badge className={STATUS_COLORS[customer.status]}>
              {STATUS_LABELS[customer.status]}
            </Badge>
          </div>
          <Button variant="danger" size="sm" onClick={() => setDeleteModal(true)}>
            <Trash2 className="w-4 h-4 mr-1" />
            삭제
          </Button>
        </div>
      </div>

      {/* 요약 카드 */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <div className="stat-card">
          <div className="stat-label">누적 매출</div>
          <div className="stat-value">{formatCurrency(totalRevenue)}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">프로젝트</div>
          <div className="stat-value">{projects.length}건</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">영업 담당</div>
          <div className="stat-value text-lg">{customer.assigned_user?.name || '-'}</div>
        </div>
      </div>

      {/* 탭 */}
      <div className="border-b border-gray-200 mb-6">
        <nav className="flex gap-6">
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex items-center gap-2 pb-3 text-sm font-medium border-b-2 transition-colors ${
                tab === t.key
                  ? 'border-primary-600 text-primary-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {t.icon}
              {t.label}
            </button>
          ))}
        </nav>
      </div>

      {/* 기본정보 탭 */}
      {tab === 'info' && (
        <div className="card p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-gray-700">기본정보</h3>
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
                ['영업 담당자', customer.assigned_user?.name],
              ].map(([label, value]) => (
                <div key={label as string}>
                  <dt className="text-sm text-gray-500">{label}</dt>
                  <dd className="text-sm font-medium text-gray-900 mt-0.5">{(value as string) || '-'}</dd>
                </div>
              ))}
              {customer.notes && (
                <div className="sm:col-span-2">
                  <dt className="text-sm text-gray-500">특이사항</dt>
                  <dd className="text-sm text-gray-900 mt-0.5 whitespace-pre-wrap">{customer.notes}</dd>
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
            <h3 className="text-sm font-semibold text-gray-700">과금/계약 정보</h3>
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
                  <dt className="text-sm text-gray-500">{label}</dt>
                  <dd className="text-sm font-medium text-gray-900 mt-0.5">{(value as string) || '-'}</dd>
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
          <div className="table-container">
            <table className="data-table">
              <thead>
                <tr>
                  <th>프로젝트(현장)명</th>
                  <th>주소</th>
                  <th>투입 솔루션</th>
                  <th>기간</th>
                  <th>월 과금액</th>
                  <th>상태</th>
                  <th className="w-24">관리</th>
                </tr>
              </thead>
              <tbody>
                {projects.map((p) => (
                  <tr key={p.id}>
                    <td className="font-medium">{p.project_name}</td>
                    <td className="text-gray-500 text-xs max-w-[160px] truncate" title={p.address || ''}>{p.address || '-'}</td>
                    <td>
                      {p.solutions ? (
                        <div className="flex flex-wrap gap-1">
                          {p.solutions.split(',').map((s) => (
                            <span key={s.trim()} className="inline-block px-1.5 py-0.5 text-xs bg-blue-50 text-blue-700 rounded">
                              {s.trim()}
                            </span>
                          ))}
                        </div>
                      ) : p.service_type ? (
                        <span className="inline-block px-1.5 py-0.5 text-xs bg-gray-50 text-gray-600 rounded">{p.service_type}</span>
                      ) : '-'}
                    </td>
                    <td className="text-gray-500 text-xs">
                      {p.billing_start ? formatDate(p.billing_start) : ''}{p.billing_start && p.billing_end ? ' ~ ' : ''}{p.billing_end ? formatDate(p.billing_end) : p.billing_start ? ' ~' : '-'}
                    </td>
                    <td>{p.monthly_amount ? formatCurrency(Number(p.monthly_amount)) : '-'}</td>
                    <td>
                      <Badge className={p.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-700'}>
                        {p.status === 'active' ? '진행중' : p.status === 'completed' ? '완료' : p.status}
                      </Badge>
                    </td>
                    <td>
                      <div className="flex gap-1">
                        <button
                          onClick={() => openEditProject(p)}
                          className="p-1.5 text-gray-400 hover:text-primary-600 hover:bg-primary-50 rounded"
                          title="수정"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => setDeleteProjectModal(p)}
                          className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded"
                          title="삭제"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {projects.length === 0 && (
                  <tr>
                    <td colSpan={10} className="text-center text-gray-400 py-8">
                      등록된 프로젝트가 없습니다.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
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
                    <Badge className={r.is_confirmed ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}>
                      {r.is_confirmed ? '확인' : '미확인'}
                    </Badge>
                  </td>
                </tr>
              ))}
              {revenues.length === 0 && (
                <tr>
                  <td colSpan={4} className="text-center text-gray-400 py-8">
                    매출 이력이 없습니다.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* 삭제 확인 모달 */}
      <Modal open={deleteModal} onClose={() => setDeleteModal(false)} title="고객 삭제">
        <p className="text-sm text-gray-600 mb-4">
          <strong>{customer.company_name}</strong>을(를) 정말 삭제하시겠습니까?
          <br />
          <span className="text-red-500">연결된 프로젝트, 매출 데이터가 있으면 삭제가 실패할 수 있습니다.</span>
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
            <label className="block text-sm font-medium text-gray-700 mb-2">투입 솔루션</label>
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
                    className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
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
        <p className="text-sm text-gray-600 mb-4">
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
