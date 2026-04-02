'use client'

import React, { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Modal } from '@/components/ui/modal'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { formatDate } from '@/lib/utils'
import { Plus, Pencil, Trash2, ChevronDown, ChevronRight, Truck } from 'lucide-react'
import { toast } from 'sonner'
import type { CameraShipment, Product, Project, ShipmentStatus } from '@/types/database'

const STATUS_OPTIONS: { value: ShipmentStatus; label: string }[] = [
  { value: '준비중', label: '준비중' },
  { value: '출고완료', label: '출고완료' },
  { value: '배송중', label: '배송중' },
  { value: '설치완료', label: '설치완료' },
  { value: '회수요청', label: '회수요청' },
  { value: '회수완료', label: '회수완료' },
]

const STATUS_COLORS: Record<string, string> = {
  '준비중': 'bg-gray-100 text-gray-600',
  '출고완료': 'bg-blue-50 text-blue-600',
  '배송중': 'bg-yellow-50 text-yellow-600',
  '설치완료': 'bg-green-50 text-green-600',
  '회수요청': 'bg-red-50 text-red-600',
  '회수완료': 'bg-purple-50 text-purple-600',
}

const NEXT_STATUS: Record<string, ShipmentStatus> = {
  '준비중': '출고완료',
  '출고완료': '배송중',
  '배송중': '설치완료',
  '설치완료': '회수요청',
  '회수요청': '회수완료',
}

const INSTALLATION_OPTIONS = [
  { value: '브라켓', label: '브라켓' },
  { value: '삼각대', label: '삼각대' },
  { value: '안전바', label: '안전바' },
]

const POWER_OPTIONS = [
  { value: '리드선10m', label: '리드선10m' },
  { value: '리드선20m', label: '리드선20m' },
]

const SHIPPING_OPTIONS = [
  { value: '택배', label: '택배' },
  { value: '대면', label: '대면' },
  { value: '이동', label: '이동' },
]

interface Props {
  customerId: string
  customerName: string
  projects: Project[]
}

export default function CustomerShipmentsTab({ customerId, customerName, projects }: Props) {
  const supabase = createClient()
  const [shipments, setShipments] = useState<CameraShipment[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [expandedId, setExpandedId] = useState<string | null>(null)

  // Modal
  const [modal, setModal] = useState(false)
  const [editing, setEditing] = useState<CameraShipment | null>(null)
  const [saving, setSaving] = useState(false)
  const [useCustomProduct, setUseCustomProduct] = useState(false)
  const [form, setForm] = useState({
    project_id: '',
    product_id: '',
    product_name: '',
    product_spec: '',
    recipient_name: '',
    recipient_phone: '',
    recipient_address: '',
    requested_ship_date: '',
    installation_type: '',
    power_type: '',
    quantity: '1',
    shipping_method: '',
    billing_method: '',
    shipped_date: '',
    tracking_number: '',
    notes: '',
  })

  const fetchData = useCallback(async () => {
    setLoading(true)
    const [sRes, pRes] = await Promise.all([
      supabase.from('camera_shipments')
        .select('*, project:projects(id, project_name), product:products(id, name)')
        .eq('customer_id', customerId)
        .order('created_at', { ascending: false }),
      supabase.from('products').select('*, category:product_categories(id, name)').eq('is_active', true).order('sort_order'),
    ])
    setShipments(sRes.data || [])
    setProducts(pRes.data || [])
    setLoading(false)
  }, [customerId])

  useEffect(() => { fetchData() }, [fetchData])

  function openModal(item?: CameraShipment) {
    if (item) {
      setEditing(item)
      setUseCustomProduct(!item.product_id)
      setForm({
        project_id: item.project_id || '',
        product_id: item.product_id || '',
        product_name: item.product_name || '',
        product_spec: item.product_spec || '',
        recipient_name: item.recipient_name || '',
        recipient_phone: item.recipient_phone || '',
        recipient_address: item.recipient_address || '',
        requested_ship_date: item.requested_ship_date || '',
        installation_type: item.installation_type || '',
        power_type: item.power_type || '',
        quantity: String(item.quantity),
        shipping_method: item.shipping_method || '',
        billing_method: item.billing_method || '',
        shipped_date: item.shipped_date || '',
        tracking_number: item.tracking_number || '',
        notes: item.notes || '',
      })
    } else {
      setEditing(null)
      setUseCustomProduct(false)
      setForm({ project_id: '', product_id: '', product_name: '', product_spec: '', recipient_name: '', recipient_phone: '', recipient_address: '', requested_ship_date: '', installation_type: '', power_type: '', quantity: '1', shipping_method: '', billing_method: '', shipped_date: '', tracking_number: '', notes: '' })
    }
    setModal(true)
  }

  async function handleSave() {
    setSaving(true)
    const prod = products.find(p => p.id === form.product_id)
    const payload = {
      customer_id: customerId,
      project_id: form.project_id || null,
      product_id: useCustomProduct ? null : (form.product_id || null),
      product_name: useCustomProduct ? form.product_name : (prod?.name || null),
      product_spec: form.product_spec || null,
      recipient_name: form.recipient_name || null,
      recipient_phone: form.recipient_phone || null,
      recipient_address: form.recipient_address || null,
      requested_ship_date: form.requested_ship_date || null,
      installation_type: form.installation_type || null,
      power_type: form.power_type || null,
      quantity: Number(form.quantity) || 1,
      shipping_method: form.shipping_method || null,
      billing_method: form.billing_method || null,
      shipped_date: form.shipped_date || null,
      tracking_number: form.tracking_number || null,
      notes: form.notes || null,
    }
    const { error } = editing
      ? await supabase.from('camera_shipments').update(payload).eq('id', editing.id)
      : await supabase.from('camera_shipments').insert({ ...payload, status: '준비중' })

    if (error) toast.error('저장 실패: ' + error.message)
    else { toast.success(editing ? '수정됨' : '반출 등록됨'); setModal(false); fetchData() }
    setSaving(false)
  }

  async function quickStatusChange(item: CameraShipment) {
    const next = NEXT_STATUS[item.status]
    if (!next) return
    const updates: any = { status: next }
    if (next === '출고완료') updates.shipped_date = new Date().toISOString().split('T')[0]
    if (next === '설치완료') updates.installation_confirmed = true
    const { error } = await supabase.from('camera_shipments').update(updates).eq('id', item.id)
    if (error) toast.error('상태 변경 실패')
    else { toast.success(`${next}(으)로 변경됨`); fetchData() }
  }

  async function deleteShipment(id: string) {
    if (!confirm('이 반출 기록을 삭제하시겠습니까?')) return
    const { error } = await supabase.from('camera_shipments').delete().eq('id', id)
    if (error) toast.error('삭제 실패')
    else { toast.success('삭제됨'); fetchData() }
  }

  const filtered = statusFilter === 'all' ? shipments : shipments.filter(s => s.status === statusFilter)
  const statusCounts = shipments.reduce((acc, s) => { acc[s.status] = (acc[s.status] || 0) + 1; return acc }, {} as Record<string, number>)

  if (loading) return <div className="card p-6 text-center text-text-tertiary">로딩 중...</div>

  return (
    <div className="space-y-4">
      {/* 통계 + 필터 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button onClick={() => setStatusFilter('all')} className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${statusFilter === 'all' ? 'bg-gray-800 text-white' : 'bg-bg-secondary text-text-secondary hover:bg-gray-200'}`}>
            전체 ({shipments.length})
          </button>
          {STATUS_OPTIONS.map(s => statusCounts[s.value] ? (
            <button key={s.value} onClick={() => setStatusFilter(s.value)} className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${statusFilter === s.value ? 'bg-gray-800 text-white' : STATUS_COLORS[s.value]}`}>
              {s.label} ({statusCounts[s.value]})
            </button>
          ) : null)}
        </div>
        <Button size="sm" onClick={() => openModal()}>
          <Plus className="w-3.5 h-3.5 mr-1" /> 반출 등록
        </Button>
      </div>

      {/* 목록 */}
      {filtered.length === 0 ? (
        <div className="card p-6 text-center text-text-tertiary text-sm">반출 기록이 없습니다.</div>
      ) : (
        <div className="card">
          <div className="table-container">
            <table className="data-table">
              <thead>
                <tr>
                  <th className="px-3 py-2 text-xs w-[30px]"></th>
                  <th className="px-3 py-2 text-xs font-medium text-text-secondary">프로젝트</th>
                  <th className="px-3 py-2 text-xs font-medium text-text-secondary">상품</th>
                  <th className="px-3 py-2 text-xs font-medium text-text-secondary">수령인</th>
                  <th className="px-3 py-2 text-xs font-medium text-text-secondary text-center">수량</th>
                  <th className="px-3 py-2 text-xs font-medium text-text-secondary text-center">상태</th>
                  <th className="px-3 py-2 text-xs font-medium text-text-secondary">희망출고일</th>
                  <th className="px-3 py-2 text-xs font-medium text-text-secondary text-center w-[140px]">관리</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(item => {
                  const isExpanded = expandedId === item.id
                  return (
                    <React.Fragment key={item.id}>
                      <tr className="hover:bg-bg-secondary cursor-pointer" onClick={() => setExpandedId(isExpanded ? null : item.id)}>
                        <td className="px-3 py-2">
                          {isExpanded ? <ChevronDown className="w-3.5 h-3.5 text-text-tertiary" /> : <ChevronRight className="w-3.5 h-3.5 text-text-tertiary" />}
                        </td>
                        <td className="px-3 py-2 text-sm">{(item as any).project?.project_name || '-'}</td>
                        <td className="px-3 py-2 text-sm">{item.product_name || (item as any).product?.name || '-'}</td>
                        <td className="px-3 py-2 text-sm">{item.recipient_name || '-'}</td>
                        <td className="px-3 py-2 text-sm text-center">{item.quantity}</td>
                        <td className="px-3 py-2 text-center">
                          <Badge className={STATUS_COLORS[item.status] || ''}>{item.status}</Badge>
                        </td>
                        <td className="px-3 py-2 text-xs text-text-tertiary">{item.requested_ship_date ? formatDate(item.requested_ship_date) : '-'}</td>
                        <td className="px-3 py-2 text-center" onClick={e => e.stopPropagation()}>
                          <div className="flex items-center justify-center gap-1">
                            {NEXT_STATUS[item.status] && (
                              <button onClick={() => quickStatusChange(item)} className="px-2 py-0.5 text-[10px] font-medium bg-brand-primary text-white rounded hover:opacity-80" title={`→ ${NEXT_STATUS[item.status]}`}>
                                → {NEXT_STATUS[item.status]}
                              </button>
                            )}
                            <button onClick={() => openModal(item)} className="p-1 hover:bg-bg-secondary rounded">
                              <Pencil className="w-3.5 h-3.5 text-text-tertiary" />
                            </button>
                            <button onClick={() => deleteShipment(item.id)} className="p-1 hover:bg-bg-secondary rounded">
                              <Trash2 className="w-3.5 h-3.5 text-status-red" />
                            </button>
                          </div>
                        </td>
                      </tr>
                      {isExpanded && (
                        <tr>
                          <td colSpan={8} className="bg-bg-secondary px-6 py-3">
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                              <div><span className="text-text-tertiary">주소:</span> <span className="ml-1">{item.recipient_address || '-'}</span></div>
                              <div><span className="text-text-tertiary">연락처:</span> <span className="ml-1">{item.recipient_phone || '-'}</span></div>
                              <div><span className="text-text-tertiary">설치타입:</span> <span className="ml-1">{item.installation_type || '-'}</span></div>
                              <div><span className="text-text-tertiary">전력:</span> <span className="ml-1">{item.power_type || '-'}</span></div>
                              <div><span className="text-text-tertiary">배송수단:</span> <span className="ml-1">{item.shipping_method || '-'}</span></div>
                              <div><span className="text-text-tertiary">발송일:</span> <span className="ml-1">{item.shipped_date ? formatDate(item.shipped_date) : '-'}</span></div>
                              <div><span className="text-text-tertiary">송장번호:</span> <span className="ml-1">{item.tracking_number || '-'}</span></div>
                              <div><span className="text-text-tertiary">설치확인:</span> <span className="ml-1">{item.installation_confirmed ? '✅' : '-'}</span></div>
                              {(item.return_quantity > 0 || item.return_requested_date) && (
                                <>
                                  <div><span className="text-text-tertiary">회수수량:</span> <span className="ml-1">{item.return_quantity}</span></div>
                                  <div><span className="text-text-tertiary">회수요청일:</span> <span className="ml-1">{item.return_requested_date ? formatDate(item.return_requested_date) : '-'}</span></div>
                                  <div><span className="text-text-tertiary">회수완료일:</span> <span className="ml-1">{item.return_completed_date ? formatDate(item.return_completed_date) : '-'}</span></div>
                                  <div><span className="text-text-tertiary">회수직원:</span> <span className="ml-1">{item.return_staff || '-'}</span></div>
                                </>
                              )}
                              {item.notes && <div className="col-span-4"><span className="text-text-tertiary">메모:</span> <span className="ml-1">{item.notes}</span></div>}
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal */}
      <Modal open={modal} onClose={() => setModal(false)} title={editing ? '반출 정보 수정' : '카메라 반출 등록'} size="lg">
        <div className="space-y-4 max-h-[70vh] overflow-y-auto">
          <Select label="프로젝트 (선택사항)" options={[{ value: '', label: '프로젝트 없음 (미생성/출고용)' }, ...projects.map(p => ({ value: p.id, label: p.project_name }))]} value={form.project_id} onChange={e => setForm(f => ({ ...f, project_id: e.target.value }))} />

          <div className="flex items-center gap-3 mb-2">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="radio" checked={!useCustomProduct} onChange={() => setUseCustomProduct(false)} />
              <span className="text-sm">등록 상품에서 선택</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="radio" checked={useCustomProduct} onChange={() => setUseCustomProduct(true)} />
              <span className="text-sm">특수 제작 / 직접 입력</span>
            </label>
          </div>

          {!useCustomProduct ? (
            <Select label="상품 선택" options={[{ value: '', label: '상품을 선택하세요' }, ...products.map(p => ({ value: p.id, label: `${p.name} (${(p as any).category?.name || ''})` }))]} value={form.product_id} onChange={e => setForm(f => ({ ...f, product_id: e.target.value }))} />
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <Input label="상품명 *" value={form.product_name} onChange={e => setForm(f => ({ ...f, product_name: e.target.value }))} placeholder="예: 특수 제작 카메라" />
              <Input label="스펙 메모" value={form.product_spec} onChange={e => setForm(f => ({ ...f, product_spec: e.target.value }))} placeholder="상세 스펙" />
            </div>
          )}

          <div className="border-t border-border-secondary pt-4">
            <p className="text-xs font-medium text-text-secondary mb-3">수령 정보</p>
            <div className="grid grid-cols-2 gap-3">
              <Input label="수령인" value={form.recipient_name} onChange={e => setForm(f => ({ ...f, recipient_name: e.target.value }))} />
              <Input label="연락처" value={form.recipient_phone} onChange={e => setForm(f => ({ ...f, recipient_phone: e.target.value }))} />
            </div>
            <Input label="주소" value={form.recipient_address} onChange={e => setForm(f => ({ ...f, recipient_address: e.target.value }))} className="mt-3" />
          </div>

          <div className="border-t border-border-secondary pt-4">
            <p className="text-xs font-medium text-text-secondary mb-3">설치/배송 정보</p>
            <div className="grid grid-cols-3 gap-3">
              <Select label="설치타입" options={[{ value: '', label: '선택' }, ...INSTALLATION_OPTIONS]} value={form.installation_type} onChange={e => setForm(f => ({ ...f, installation_type: e.target.value }))} />
              <Select label="전력" options={[{ value: '', label: '선택' }, ...POWER_OPTIONS]} value={form.power_type} onChange={e => setForm(f => ({ ...f, power_type: e.target.value }))} />
              <Input label="수량" type="number" value={form.quantity} onChange={e => setForm(f => ({ ...f, quantity: e.target.value }))} />
            </div>
            <div className="grid grid-cols-3 gap-3 mt-3">
              <Select label="배송수단" options={[{ value: '', label: '선택' }, ...SHIPPING_OPTIONS]} value={form.shipping_method} onChange={e => setForm(f => ({ ...f, shipping_method: e.target.value }))} />
              <Input label="희망 출고일" type="date" value={form.requested_ship_date} onChange={e => setForm(f => ({ ...f, requested_ship_date: e.target.value }))} />
              <Input label="과금방식" value={form.billing_method} onChange={e => setForm(f => ({ ...f, billing_method: e.target.value }))} placeholder="메모" />
            </div>
          </div>

          {editing && (
            <div className="border-t border-border-secondary pt-4">
              <p className="text-xs font-medium text-text-secondary mb-3">배송 추적</p>
              <div className="grid grid-cols-2 gap-3">
                <Input label="발송일" type="date" value={form.shipped_date} onChange={e => setForm(f => ({ ...f, shipped_date: e.target.value }))} />
                <Input label="송장번호" value={form.tracking_number} onChange={e => setForm(f => ({ ...f, tracking_number: e.target.value }))} />
              </div>
            </div>
          )}

          <Textarea label="메모" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={2} />

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setModal(false)}>취소</Button>
            <Button onClick={handleSave} loading={saving}>{editing ? '수정' : '등록'}</Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
