'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Modal } from '@/components/ui/modal'
import { Loading } from '@/components/ui/loading'
import { EmptyState } from '@/components/ui/empty-state'
import { formatCurrency, formatDate } from '@/lib/utils'
import { Users, RefreshCw, AlertTriangle, TrendingUp, Search, Pencil, Plus, CreditCard, Calendar, Camera } from 'lucide-react'
import { toast } from 'sonner'
import Link from 'next/link'

interface SubscriptionCustomer {
  id: string
  company_name: string
  contact_person: string | null
  contact_phone: string | null
  billing_type: string | null
  billing_start: string | null
  billing_end: string | null
  status: string
  service_type: string | null
  user_count: number | null
  notes: string | null
  // computed from projects
  monthly_total: number
  device_count: number
  project_count: number
  days_until_renewal: number | null
  churn_risk: 'low' | 'medium' | 'high'
  // Phase 6 enhancements
  serviceComposition: string
  hasPricingConfig: boolean
  annualLimit: { limit: number; used: number } | null
  cameraCount: number
}

const PLAN_OPTIONS = [
  { value: '월과금', label: '월과금' },
  { value: '연과금', label: '연과금' },
  { value: '건별과금', label: '건별과금' },
  { value: '무제한', label: '무제한' },
  { value: '맞춤', label: '맞춤형' },
]

const RISK_COLORS: Record<string, string> = {
  low: 'bg-status-green-bg text-status-green',
  medium: 'bg-status-yellow-bg text-status-yellow',
  high: 'bg-status-red-bg text-status-red',
}
const RISK_LABELS: Record<string, string> = {
  low: '안정',
  medium: '주의',
  high: '위험',
}

export default function SubscriptionPage() {
  const [customers, setCustomers] = useState<SubscriptionCustomer[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [riskFilter, setRiskFilter] = useState('전체')
  const [editModal, setEditModal] = useState(false)
  const [editingCustomer, setEditingCustomer] = useState<SubscriptionCustomer | null>(null)
  const [saving, setSaving] = useState(false)
  const supabase = createClient()

  const [form, setForm] = useState({
    billing_type: '',
    billing_start: '',
    billing_end: '',
    service_type: '',
    user_count: '',
    notes: '',
  })

  const fetchSubscriptionCustomers = useCallback(async () => {
    setLoading(true)
    try {
      // Fetch active customers with billing info
      const { data: custData } = await supabase
        .from('customers')
        .select('*')
        .eq('status', 'active')
        .order('company_name')

      // Fetch all active projects
      const { data: projData } = await supabase
        .from('projects')
        .select('*')
        .eq('status', 'active')

      // Fetch service pricing for all customers
      const { data: pricingData } = await supabase
        .from('customer_service_pricing')
        .select('*')
        .eq('is_active', true)

      // Fetch camera shipments (active ones)
      const { data: shipmentData } = await supabase
        .from('camera_shipments')
        .select('customer_id, quantity, status')
        .in('status', ['준비중', '출고완료', '배송중', '설치완료'])

      const projects = projData || []
      const pricing = pricingData || []
      const shipments = shipmentData || []
      const now = new Date()

      const enriched: SubscriptionCustomer[] = (custData || [])
        .filter(c => {
          // Only include customers with billing or active projects
          const custProjects = projects.filter(p => p.customer_id === c.id)
          return c.billing_type || custProjects.length > 0
        })
        .map(c => {
          const custProjects = projects.filter(p => p.customer_id === c.id)
          const monthlyTotal = custProjects.reduce((sum, p) => sum + (Number(p.monthly_amount) || 0), 0)
          const deviceCount = custProjects.length

          // Calculate days until renewal/end
          let daysUntilRenewal: number | null = null
          if (c.billing_end) {
            const endDate = new Date(c.billing_end)
            daysUntilRenewal = Math.ceil((endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
          }

          // Churn risk assessment
          let churnRisk: 'low' | 'medium' | 'high' = 'low'
          if (daysUntilRenewal !== null && daysUntilRenewal <= 30) churnRisk = 'high'
          else if (daysUntilRenewal !== null && daysUntilRenewal <= 90) churnRisk = 'medium'
          else if (monthlyTotal === 0) churnRisk = 'medium'

          // Service composition from customer_service_pricing
          const custPricing = pricing.filter(p => p.customer_id === c.id)
          let serviceComposition = ''
          if (custPricing.length > 0) {
            serviceComposition = custPricing
              .map(p => p.quantity > 1 ? `${p.service_name} ×${p.quantity}` : p.service_name)
              .join(', ')
            const totalFromPricing = custPricing.reduce((sum, p) => sum + (Number(p.unit_price) * (p.quantity || 1)), 0)
            if (totalFromPricing > 0) serviceComposition += ` = 월 ${formatCurrency(totalFromPricing)}`
          }

          // Annual project limit
          const annualService = custPricing.find(p => p.billing_type === 'annual' && p.annual_project_limit)
          let annualLimit: { limit: number; used: number } | null = null
          if (annualService) {
            annualLimit = {
              limit: annualService.annual_project_limit,
              used: custProjects.length,
            }
          }

          // Camera count
          const custShipments = shipments.filter(s => s.customer_id === c.id)
          const cameraCount = custShipments.reduce((sum, s) => sum + (s.quantity || 1), 0)

          return {
            id: c.id,
            company_name: c.company_name,
            contact_person: c.contact_person,
            contact_phone: c.contact_phone,
            billing_type: c.billing_type,
            billing_start: c.billing_start,
            billing_end: c.billing_end,
            status: c.status,
            service_type: c.service_type,
            user_count: c.user_count,
            notes: c.notes,
            monthly_total: monthlyTotal,
            device_count: deviceCount,
            project_count: custProjects.length,
            days_until_renewal: daysUntilRenewal,
            churn_risk: churnRisk,
            serviceComposition,
            hasPricingConfig: custPricing.length > 0,
            annualLimit,
            cameraCount,
          }
        })

      setCustomers(enriched)
    } catch (err) {
      console.error('fetch error:', err)
      toast.error('데이터를 불러오는 중 오류가 발생했습니다.')
    }
    setLoading(false)
  }, [])

  useEffect(() => { fetchSubscriptionCustomers() }, [fetchSubscriptionCustomers])

  // Filtered
  const filtered = useMemo(() => {
    let result = customers
    if (riskFilter !== '전체') result = result.filter(c => c.churn_risk === riskFilter)
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      result = result.filter(c =>
        c.company_name.toLowerCase().includes(q) ||
        c.contact_person?.toLowerCase().includes(q) ||
        c.service_type?.toLowerCase().includes(q)
      )
    }
    return result
  }, [customers, riskFilter, searchQuery])

  // Stats
  const totalMRR = customers.reduce((s, c) => s + c.monthly_total, 0)
  const totalCustomers = customers.length
  const highRisk = customers.filter(c => c.churn_risk === 'high').length
  const renewalSoon = customers.filter(c => c.days_until_renewal !== null && c.days_until_renewal <= 60 && c.days_until_renewal > 0).length

  const openEdit = (cust: SubscriptionCustomer) => {
    setEditingCustomer(cust)
    setForm({
      billing_type: cust.billing_type || '',
      billing_start: cust.billing_start || '',
      billing_end: cust.billing_end || '',
      service_type: cust.service_type || '',
      user_count: cust.user_count ? String(cust.user_count) : '',
      notes: cust.notes || '',
    })
    setEditModal(true)
  }

  const handleSave = async () => {
    if (!editingCustomer) return
    setSaving(true)
    const { error } = await supabase
      .from('customers')
      .update({
        billing_type: form.billing_type || null,
        billing_start: form.billing_start || null,
        billing_end: form.billing_end || null,
        service_type: form.service_type || null,
        user_count: form.user_count ? Number(form.user_count) : null,
        notes: form.notes || null,
      })
      .eq('id', editingCustomer.id)

    if (error) {
      toast.error('저장에 실패했습니다.')
    } else {
      toast.success('구독 정보가 수정되었습니다.')
      setEditModal(false)
      fetchSubscriptionCustomers()
    }
    setSaving(false)
  }

  const riskFilterOptions = [
    { value: '전체', label: '전체' },
    { value: 'low', label: '안정' },
    { value: 'medium', label: '주의' },
    { value: 'high', label: '위험' },
  ]

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">구독 고객 관리</h1>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 mb-6">
        <div className="stat-card">
          <div className="flex items-center gap-2 mb-1"><Users className="w-4 h-4 text-primary-500" /><span className="stat-label">구독 고객수</span></div>
          <div className="stat-value">{totalCustomers}개사</div>
        </div>
        <div className="stat-card">
          <div className="flex items-center gap-2 mb-1"><TrendingUp className="w-4 h-4 text-green-500" /><span className="stat-label">월 반복매출 (MRR)</span></div>
          <div className="stat-value text-green-600">{formatCurrency(totalMRR)}</div>
        </div>
        <div className="stat-card">
          <div className="flex items-center gap-2 mb-1"><RefreshCw className="w-4 h-4 text-yellow-500" /><span className="stat-label">갱신 예정 (60일내)</span></div>
          <div className="stat-value text-yellow-600">{renewalSoon}건</div>
        </div>
        <div className="stat-card">
          <div className="flex items-center gap-2 mb-1"><AlertTriangle className="w-4 h-4 text-red-500" /><span className="stat-label">이탈 위험</span></div>
          <div className="stat-value text-red-600">{highRisk}건</div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 mb-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-text-placeholder" />
          <Input
            placeholder="고객사, 담당자, 서비스 검색..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select options={riskFilterOptions} value={riskFilter} onChange={(e) => setRiskFilter(e.target.value)} className="w-28" />
      </div>

      {/* Table */}
      {loading ? <Loading /> : filtered.length === 0 ? (
        <EmptyState icon={Users} title="구독 고객이 없습니다" description="활성 고객 중 과금 정보가 있는 고객이 여기에 표시됩니다." />
      ) : (
        <div className="table-container">
          <table className="data-table" style={{ minWidth: '1000px' }}>
            <thead>
              <tr>
                <th style={{ width: '18%' }}>고객사</th>
                <th style={{ width: '8%' }}>과금유형</th>
                <th style={{ width: '20%' }}>서비스 구성</th>
                <th style={{ width: '10%' }} className="text-right">월 과금액</th>
                <th style={{ width: '8%' }} className="text-center">프로젝트</th>
                <th style={{ width: '10%' }} className="text-center">현황</th>
                <th style={{ width: '12%' }} className="text-center">과금기간</th>
                <th style={{ width: '6%' }} className="text-center">갱신</th>
                <th style={{ width: '5%' }} className="text-center">위험</th>
                <th style={{ width: '4%' }} className="text-center"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((cust) => (
                <tr key={cust.id}>
                  <td className="col-company">
                    <Link href={`/customers/${cust.id}`} className="font-medium text-primary-500 hover:text-primary-500 hover:underline truncate block">{cust.company_name}</Link>
                    {cust.contact_person && <div className="text-micro text-text-tertiary truncate">{cust.contact_person}</div>}
                  </td>
                  <td>
                    <Badge className="badge-blue">{cust.billing_type || '-'}</Badge>
                  </td>
                  <td>
                    {cust.serviceComposition ? (
                      <span className="text-xs text-text-secondary">{cust.serviceComposition}</span>
                    ) : !cust.hasPricingConfig ? (
                      <Badge className="bg-amber-50 text-amber-600 text-[10px]">단가 미설정</Badge>
                    ) : (
                      <span className="text-xs text-text-tertiary">{cust.service_type || '-'}</span>
                    )}
                  </td>
                  <td className="col-amount font-semibold">{formatCurrency(cust.monthly_total)}</td>
                  <td className="col-status">{cust.project_count}건</td>
                  <td className="text-center">
                    <div className="flex flex-col items-center gap-1">
                      {cust.annualLimit && (
                        <div className="w-full max-w-[100px]">
                          <div className="flex items-center justify-between text-[10px] mb-0.5">
                            <span className={cust.annualLimit.used >= cust.annualLimit.limit ? 'text-red-600 font-medium' : 'text-text-tertiary'}>
                              {cust.annualLimit.used}/{cust.annualLimit.limit}
                            </span>
                          </div>
                          <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all ${cust.annualLimit.used >= cust.annualLimit.limit ? 'bg-red-500' : cust.annualLimit.used >= cust.annualLimit.limit * 0.9 ? 'bg-amber-500' : 'bg-primary-500'}`}
                              style={{ width: `${Math.min(100, (cust.annualLimit.used / cust.annualLimit.limit) * 100)}%` }}
                            />
                          </div>
                        </div>
                      )}
                      {cust.cameraCount > 0 && (
                        <Badge className="bg-blue-50 text-blue-600 text-[10px]">카메라 {cust.cameraCount}대</Badge>
                      )}
                    </div>
                  </td>
                  <td className="col-status text-caption text-text-tertiary">
                    {cust.billing_start ? formatDate(cust.billing_start, 'yy.MM.dd') : '-'}
                    {cust.billing_start && cust.billing_end ? ' ~ ' : ''}
                    {cust.billing_end ? formatDate(cust.billing_end, 'yy.MM.dd') : ''}
                  </td>
                  <td className="col-status">
                    {cust.days_until_renewal !== null ? (
                      <span className={`text-body-sm font-medium ${cust.days_until_renewal <= 30 ? 'text-status-red' : cust.days_until_renewal <= 90 ? 'text-status-yellow' : 'text-text-secondary'}`}>
                        {cust.days_until_renewal > 0 ? `${cust.days_until_renewal}일` : '만료'}
                      </span>
                    ) : '-'}
                  </td>
                  <td className="col-status">
                    <Badge className={RISK_COLORS[cust.churn_risk]}>{RISK_LABELS[cust.churn_risk]}</Badge>
                  </td>
                  <td className="col-action">
                    <button onClick={() => openEdit(cust)} className="icon-btn mx-auto">
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Edit Modal */}
      <Modal open={editModal} onClose={() => setEditModal(false)} title={`구독 정보 수정 - ${editingCustomer?.company_name || ''}`}>
        <div className="space-y-4">
          <Select
            label="과금유형"
            value={form.billing_type}
            onChange={(e) => setForm(f => ({ ...f, billing_type: e.target.value }))}
            options={PLAN_OPTIONS}
            placeholder="과금유형 선택"
          />
          <Input
            label="서비스 유형"
            value={form.service_type}
            onChange={(e) => setForm(f => ({ ...f, service_type: e.target.value }))}
            placeholder="AI CCTV, 안전장비 등"
          />
          <div className="grid grid-cols-2 gap-4">
            <Input
              label="과금 시작일"
              type="date"
              value={form.billing_start}
              onChange={(e) => setForm(f => ({ ...f, billing_start: e.target.value }))}
            />
            <Input
              label="과금 종료일"
              type="date"
              value={form.billing_end}
              onChange={(e) => setForm(f => ({ ...f, billing_end: e.target.value }))}
            />
          </div>
          <Input
            label="이용유저 수"
            type="number"
            value={form.user_count}
            onChange={(e) => setForm(f => ({ ...f, user_count: e.target.value }))}
          />
          <Textarea
            label="특이사항 (일할계산, 무제한, 맞춤 등)"
            value={form.notes}
            onChange={(e) => setForm(f => ({ ...f, notes: e.target.value }))}
            placeholder="특이사항 메모"
          />
          <div className="flex gap-3 justify-end pt-2">
            <Button variant="secondary" size="sm" onClick={() => setEditModal(false)}>취소</Button>
            <Button size="sm" loading={saving} onClick={handleSave}>저장</Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
