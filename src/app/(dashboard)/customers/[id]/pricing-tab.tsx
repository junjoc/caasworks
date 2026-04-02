'use client'

import React, { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Modal } from '@/components/ui/modal'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { formatCurrency } from '@/lib/utils'
import { Plus, Pencil, Trash2, X, Package, Star } from 'lucide-react'
import { toast } from 'sonner'
import type { CustomerServicePricing, CustomerDefaultSolution, Product, Project } from '@/types/database'

const SOLUTION_OPTIONS = [
  'AI CCTV',
  '스마트 안전장비',
  '동영상 기록관리',
  '공정관리 플랫폼',
  '중대재해예방',
]

const BILLING_TYPE_OPTIONS = [
  { value: 'monthly', label: '월간' },
  { value: 'annual', label: '연간선납' },
  { value: 'one-time', label: '일회성' },
]

interface Props {
  customerId: string
  projects: Project[]
}

export default function CustomerPricingTab({ customerId, projects }: Props) {
  const supabase = createClient()
  const [pricings, setPricings] = useState<CustomerServicePricing[]>([])
  const [solutions, setSolutions] = useState<CustomerDefaultSolution[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)

  // Pricing modal
  const [pricingModal, setPricingModal] = useState(false)
  const [editingPricing, setEditingPricing] = useState<CustomerServicePricing | null>(null)
  const [saving, setSaving] = useState(false)
  const [pricingForm, setPricingForm] = useState({
    product_id: '',
    service_name: '',
    unit_price: '',
    quantity: '1',
    billing_type: 'monthly' as string,
    annual_amount: '',
    annual_project_limit: '',
    annual_start_date: '',
    notes: '',
  })

  // Solution modal
  const [solutionModal, setSolutionModal] = useState(false)
  const [solutionForm, setSolutionForm] = useState({
    solution_name: '',
    custom_name: '',
    is_required: true,
    notes: '',
  })

  const fetchData = useCallback(async () => {
    setLoading(true)
    const [pRes, sRes, prodRes] = await Promise.all([
      supabase.from('customer_service_pricing').select('*, product:products(id, name, subscription_price, rental_price)').eq('customer_id', customerId).order('created_at'),
      supabase.from('customer_default_solutions').select('*').eq('customer_id', customerId).order('sort_order'),
      supabase.from('products').select('*, category:product_categories(id, name)').eq('is_active', true).order('sort_order'),
    ])
    setPricings(pRes.data || [])
    setSolutions(sRes.data || [])
    setProducts(prodRes.data || [])
    setLoading(false)
  }, [customerId])

  useEffect(() => { fetchData() }, [fetchData])

  // --- Pricing CRUD ---
  function openPricingModal(item?: CustomerServicePricing) {
    if (item) {
      setEditingPricing(item)
      setPricingForm({
        product_id: item.product_id || '',
        service_name: item.service_name,
        unit_price: String(item.unit_price),
        quantity: String(item.quantity),
        billing_type: item.billing_type,
        annual_amount: item.annual_amount ? String(item.annual_amount) : '',
        annual_project_limit: item.annual_project_limit ? String(item.annual_project_limit) : '',
        annual_start_date: item.annual_start_date || '',
        notes: item.notes || '',
      })
    } else {
      setEditingPricing(null)
      setPricingForm({ product_id: '', service_name: '', unit_price: '', quantity: '1', billing_type: 'monthly', annual_amount: '', annual_project_limit: '', annual_start_date: '', notes: '' })
    }
    setPricingModal(true)
  }

  async function handleSavePricing() {
    if (!pricingForm.service_name.trim()) { toast.error('서비스명을 입력하세요.'); return }
    if (!pricingForm.unit_price) { toast.error('단가를 입력하세요.'); return }
    setSaving(true)
    const payload = {
      customer_id: customerId,
      product_id: pricingForm.product_id || null,
      service_name: pricingForm.service_name.trim(),
      unit_price: Number(pricingForm.unit_price),
      quantity: Number(pricingForm.quantity) || 1,
      billing_type: pricingForm.billing_type,
      annual_amount: pricingForm.annual_amount ? Number(pricingForm.annual_amount) : null,
      annual_project_limit: pricingForm.annual_project_limit ? Number(pricingForm.annual_project_limit) : null,
      annual_start_date: pricingForm.annual_start_date || null,
      notes: pricingForm.notes || null,
    }

    const { error } = editingPricing
      ? await supabase.from('customer_service_pricing').update(payload).eq('id', editingPricing.id)
      : await supabase.from('customer_service_pricing').insert(payload)

    if (error) { toast.error('저장 실패: ' + error.message) }
    else { toast.success(editingPricing ? '수정되었습니다.' : '추가되었습니다.'); setPricingModal(false); fetchData() }
    setSaving(false)
  }

  async function toggleActive(item: CustomerServicePricing) {
    const { error } = await supabase.from('customer_service_pricing').update({ is_active: !item.is_active }).eq('id', item.id)
    if (error) toast.error('변경 실패')
    else { toast.success(item.is_active ? '비활성화됨' : '활성화됨'); fetchData() }
  }

  async function deletePricing(id: string) {
    if (!confirm('이 서비스 단가를 삭제하시겠습니까?')) return
    const { error } = await supabase.from('customer_service_pricing').delete().eq('id', id)
    if (error) toast.error('삭제 실패')
    else { toast.success('삭제됨'); fetchData() }
  }

  // --- Solution CRUD ---
  async function handleAddSolution() {
    const name = solutionForm.solution_name === '__custom__' ? solutionForm.custom_name.trim() : solutionForm.solution_name
    if (!name) { toast.error('솔루션을 선택하거나 입력하세요.'); return }
    const { error } = await supabase.from('customer_default_solutions').insert({
      customer_id: customerId,
      solution_name: name,
      is_required: solutionForm.is_required,
      notes: solutionForm.notes || null,
      sort_order: solutions.length,
    })
    if (error) { toast.error(error.message.includes('unique') ? '이미 등록된 솔루션입니다.' : '추가 실패') }
    else { toast.success('솔루션 추가됨'); setSolutionModal(false); fetchData() }
  }

  async function deleteSolution(id: string) {
    const { error } = await supabase.from('customer_default_solutions').delete().eq('id', id)
    if (error) toast.error('삭제 실패')
    else { toast.success('삭제됨'); fetchData() }
  }

  // Compute
  const activePricings = pricings.filter(p => p.is_active)
  const monthlyTotal = activePricings.filter(p => p.billing_type === 'monthly').reduce((s, p) => s + p.unit_price * p.quantity, 0)
  const annualPricings = activePricings.filter(p => p.billing_type === 'annual')

  // Annual project count
  const annualProjectCounts = annualPricings.map(ap => {
    if (!ap.annual_start_date || !ap.annual_project_limit) return null
    const start = new Date(ap.annual_start_date)
    const end = new Date(start)
    end.setFullYear(end.getFullYear() + 1)
    const count = projects.filter(p => {
      const created = new Date(p.created_at)
      return created >= start && created < end
    }).length
    return { ...ap, currentCount: count }
  }).filter(Boolean) as (CustomerServicePricing & { currentCount: number })[]

  function handleProductSelect(productId: string) {
    const prod = products.find(p => p.id === productId)
    if (prod) {
      setPricingForm(prev => ({
        ...prev,
        product_id: productId,
        service_name: prod.name,
        unit_price: String(prod.subscription_price || prod.rental_price || 0),
      }))
    }
  }

  if (loading) return <div className="card p-6 text-center text-text-tertiary">로딩 중...</div>

  return (
    <div className="space-y-6">
      {/* ① 서비스 단가 */}
      <div className="card p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-text-secondary">서비스 단가</h3>
          <Button size="sm" onClick={() => openPricingModal()}>
            <Plus className="w-3.5 h-3.5 mr-1" /> 서비스 추가
          </Button>
        </div>

        {pricings.length === 0 ? (
          <p className="text-sm text-text-tertiary text-center py-8">등록된 서비스 단가가 없습니다.</p>
        ) : (
          <div className="table-container">
            <table className="data-table">
              <thead>
                <tr>
                  <th className="px-3 py-2 text-xs font-medium text-text-secondary">서비스명</th>
                  <th className="px-3 py-2 text-xs font-medium text-text-secondary text-right">단가</th>
                  <th className="px-3 py-2 text-xs font-medium text-text-secondary text-center">수량</th>
                  <th className="px-3 py-2 text-xs font-medium text-text-secondary text-right">월합계</th>
                  <th className="px-3 py-2 text-xs font-medium text-text-secondary text-center">과금</th>
                  <th className="px-3 py-2 text-xs font-medium text-text-secondary">메모</th>
                  <th className="px-3 py-2 text-xs font-medium text-text-secondary text-center w-[120px]">관리</th>
                </tr>
              </thead>
              <tbody>
                {pricings.map(item => {
                  const standardPrice = (item as any).product?.subscription_price || (item as any).product?.rental_price
                  const isDiscount = standardPrice && item.unit_price < standardPrice
                  return (
                    <tr key={item.id} className={!item.is_active ? 'opacity-40' : ''}>
                      <td className="px-3 py-2 text-sm">
                        {item.service_name}
                        {isDiscount && <Badge className="ml-1.5 bg-red-50 text-red-600 text-[10px]">특별단가</Badge>}
                      </td>
                      <td className="px-3 py-2 text-sm text-right font-medium">{formatCurrency(item.unit_price)}</td>
                      <td className="px-3 py-2 text-sm text-center">{item.quantity}</td>
                      <td className="px-3 py-2 text-sm text-right font-medium">{formatCurrency(item.unit_price * item.quantity)}</td>
                      <td className="px-3 py-2 text-center">
                        <Badge className={item.billing_type === 'annual' ? 'bg-purple-50 text-purple-600' : item.billing_type === 'one-time' ? 'bg-gray-100 text-gray-600' : 'bg-blue-50 text-blue-600'}>
                          {item.billing_type === 'monthly' ? '월간' : item.billing_type === 'annual' ? '연간' : '일회성'}
                        </Badge>
                      </td>
                      <td className="px-3 py-2 text-xs text-text-tertiary max-w-[150px] truncate">{item.notes || '-'}</td>
                      <td className="px-3 py-2 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <button onClick={() => openPricingModal(item)} className="p-1 hover:bg-bg-secondary rounded" title="수정">
                            <Pencil className="w-3.5 h-3.5 text-text-tertiary" />
                          </button>
                          <button onClick={() => toggleActive(item)} className="p-1 hover:bg-bg-secondary rounded" title={item.is_active ? '비활성화' : '활성화'}>
                            {item.is_active ? <X className="w-3.5 h-3.5 text-text-tertiary" /> : <Package className="w-3.5 h-3.5 text-status-green" />}
                          </button>
                          <button onClick={() => deletePricing(item.id)} className="p-1 hover:bg-bg-secondary rounded" title="삭제">
                            <Trash2 className="w-3.5 h-3.5 text-status-red" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-border-primary">
                  <td className="px-3 py-2 text-sm font-semibold" colSpan={3}>월 총 청구 예상액</td>
                  <td className="px-3 py-2 text-sm font-bold text-right text-brand-primary">{formatCurrency(monthlyTotal)}</td>
                  <td colSpan={3}></td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      {/* ② 연간선납 계약 현황 */}
      {annualProjectCounts.length > 0 && (
        <div className="card p-6">
          <h3 className="text-sm font-semibold text-text-secondary mb-4">연간선납 계약 현황</h3>
          <div className="space-y-4">
            {annualProjectCounts.map(ap => {
              const limit = ap.annual_project_limit || 0
              const pct = limit > 0 ? Math.round((ap.currentCount / limit) * 100) : 0
              const isOver = ap.currentCount > limit
              const isNear = pct >= 90 && !isOver
              const startDate = ap.annual_start_date ? new Date(ap.annual_start_date) : null
              const endDate = startDate ? new Date(startDate.getFullYear() + 1, startDate.getMonth(), startDate.getDate()) : null
              return (
                <div key={ap.id} className="p-4 bg-bg-secondary rounded-lg">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium">{ap.service_name}</span>
                    <div className="flex items-center gap-2">
                      {ap.annual_amount && <span className="text-xs text-text-tertiary">연납 {formatCurrency(ap.annual_amount)}</span>}
                      {startDate && endDate && (
                        <span className="text-xs text-text-tertiary">
                          {startDate.getFullYear()}.{String(startDate.getMonth()+1).padStart(2,'0')} ~ {endDate.getFullYear()}.{String(endDate.getMonth()+1).padStart(2,'0')}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="flex-1 bg-gray-200 rounded-full h-2.5">
                      <div
                        className={`h-2.5 rounded-full ${isOver ? 'bg-red-500' : isNear ? 'bg-yellow-500' : 'bg-blue-500'}`}
                        style={{ width: `${Math.min(pct, 100)}%` }}
                      />
                    </div>
                    <span className={`text-sm font-medium whitespace-nowrap ${isOver ? 'text-red-600' : isNear ? 'text-yellow-600' : 'text-text-primary'}`}>
                      {ap.currentCount} / {limit}개
                    </span>
                  </div>
                  {isOver && <p className="text-xs text-red-600 mt-1 font-medium">프로젝트 한도를 초과했습니다. 추가 과금 대상입니다.</p>}
                  {isNear && <p className="text-xs text-yellow-600 mt-1">프로젝트 한도 잔여 {limit - ap.currentCount}개</p>}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ③ 기본 솔루션 프리셋 */}
      <div className="card p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-sm font-semibold text-text-secondary">기본 솔루션 프리셋</h3>
            <p className="text-xs text-text-tertiary mt-0.5">새 프로젝트 생성 시 자동으로 체크됩니다.</p>
          </div>
          <Button size="sm" onClick={() => {
            setSolutionForm({ solution_name: '', custom_name: '', is_required: true, notes: '' })
            setSolutionModal(true)
          }}>
            <Plus className="w-3.5 h-3.5 mr-1" /> 솔루션 추가
          </Button>
        </div>
        {solutions.length === 0 ? (
          <p className="text-sm text-text-tertiary text-center py-4">등록된 기본 솔루션이 없습니다.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {solutions.map(s => (
              <div key={s.id} className="flex items-center gap-1.5 px-3 py-1.5 bg-bg-secondary rounded-full border border-border-secondary">
                <Star className={`w-3 h-3 ${s.is_required ? 'text-yellow-500 fill-yellow-500' : 'text-gray-400'}`} />
                <span className="text-sm">{s.solution_name}</span>
                <span className="text-[10px] text-text-tertiary">({s.is_required ? '필수' : '권장'})</span>
                <button onClick={() => deleteSolution(s.id)} className="ml-1 p-0.5 hover:bg-red-50 rounded-full">
                  <X className="w-3 h-3 text-text-tertiary hover:text-red-500" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Pricing Modal */}
      <Modal open={pricingModal} onClose={() => setPricingModal(false)} title={editingPricing ? '서비스 단가 수정' : '서비스 단가 추가'}>
        <div className="space-y-4">
          <div>
            <label className="input-label">상품에서 선택 (선택사항)</label>
            <select
              className="input-base w-full"
              value={pricingForm.product_id}
              onChange={e => handleProductSelect(e.target.value)}
            >
              <option value="">직접 입력</option>
              {products.map(p => (
                <option key={p.id} value={p.id}>{p.name} ({formatCurrency(p.subscription_price || p.rental_price || 0)}/월)</option>
              ))}
            </select>
          </div>
          <Input label="서비스명 *" value={pricingForm.service_name} onChange={e => setPricingForm(f => ({ ...f, service_name: e.target.value }))} placeholder="예: 반출카메라, 플랫폼 구독" />
          <div className="grid grid-cols-2 gap-3">
            <Input label="단가 (월) *" type="number" value={pricingForm.unit_price} onChange={e => setPricingForm(f => ({ ...f, unit_price: e.target.value }))} placeholder="150000" />
            <Input label="수량" type="number" value={pricingForm.quantity} onChange={e => setPricingForm(f => ({ ...f, quantity: e.target.value }))} />
          </div>
          <Select label="과금 방식" options={BILLING_TYPE_OPTIONS} value={pricingForm.billing_type} onChange={e => setPricingForm(f => ({ ...f, billing_type: e.target.value }))} />
          {pricingForm.billing_type === 'annual' && (
            <div className="p-3 bg-purple-50 rounded-lg space-y-3">
              <p className="text-xs font-medium text-purple-700">연간선납 상세</p>
              <Input label="연납 총액" type="number" value={pricingForm.annual_amount} onChange={e => setPricingForm(f => ({ ...f, annual_amount: e.target.value }))} placeholder="예: 12000000" />
              <Input label="연간 프로젝트 한도" type="number" value={pricingForm.annual_project_limit} onChange={e => setPricingForm(f => ({ ...f, annual_project_limit: e.target.value }))} placeholder="예: 72" />
              <Input label="계약 시작일" type="date" value={pricingForm.annual_start_date} onChange={e => setPricingForm(f => ({ ...f, annual_start_date: e.target.value }))} />
            </div>
          )}
          <Textarea label="메모" value={pricingForm.notes} onChange={e => setPricingForm(f => ({ ...f, notes: e.target.value }))} rows={2} />
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setPricingModal(false)}>취소</Button>
            <Button onClick={handleSavePricing} loading={saving}>{editingPricing ? '수정' : '추가'}</Button>
          </div>
        </div>
      </Modal>

      {/* Solution Modal */}
      <Modal open={solutionModal} onClose={() => setSolutionModal(false)} title="기본 솔루션 추가">
        <div className="space-y-4">
          <div>
            <label className="input-label">솔루션 선택</label>
            <select className="input-base w-full" value={solutionForm.solution_name} onChange={e => setSolutionForm(f => ({ ...f, solution_name: e.target.value }))}>
              <option value="">선택하세요</option>
              {SOLUTION_OPTIONS.filter(o => !solutions.some(s => s.solution_name === o)).map(o => (
                <option key={o} value={o}>{o}</option>
              ))}
              <option value="__custom__">직접 입력...</option>
            </select>
          </div>
          {solutionForm.solution_name === '__custom__' && (
            <Input label="솔루션명 직접 입력" value={solutionForm.custom_name} onChange={e => setSolutionForm(f => ({ ...f, custom_name: e.target.value }))} placeholder="솔루션명" />
          )}
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={solutionForm.is_required} onChange={e => setSolutionForm(f => ({ ...f, is_required: e.target.checked }))} className="rounded" />
              <span className="text-sm">필수 솔루션 (해제 시 경고)</span>
            </label>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setSolutionModal(false)}>취소</Button>
            <Button onClick={handleAddSolution}>추가</Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
