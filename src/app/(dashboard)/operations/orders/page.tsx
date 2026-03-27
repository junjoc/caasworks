'use client'

import { useEffect, useState, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Modal } from '@/components/ui/modal'
import { Badge } from '@/components/ui/badge'
import { Loading } from '@/components/ui/loading'
import { EmptyState } from '@/components/ui/empty-state'
import { formatCurrency, formatDate, formatNumber } from '@/lib/utils'
import { toast } from 'sonner'
import {
  Plus, ShoppingCart, Pencil, Trash2, Copy, Info,
  Package, Truck, CheckCircle, Clock, ArrowRight, Search
} from 'lucide-react'

interface PurchaseOrder {
  id: string
  order_number: string
  supplier: string
  items: string
  quantity: number
  unit_price: number
  total: number
  order_date: string
  expected_delivery: string | null
  actual_delivery: string | null
  status: string
  notes: string | null
  created_at: string
}

const STATUS_OPTIONS = [
  { value: '요청', label: '요청' },
  { value: '승인', label: '승인' },
  { value: '발주', label: '발주' },
  { value: '배송중', label: '배송중' },
  { value: '입고완료', label: '입고완료' },
]

const STATUS_COLORS: Record<string, string> = {
  '요청': 'bg-gray-100 text-gray-700',
  '승인': 'bg-blue-100 text-blue-700',
  '발주': 'bg-purple-100 text-purple-700',
  '배송중': 'bg-orange-100 text-orange-700',
  '입고완료': 'bg-green-100 text-green-700',
}

const STATUS_FLOW = ['요청', '승인', '발주', '배송중', '입고완료']

const CREATE_TABLE_SQL = `-- Supabase SQL Editor에서 실행하세요
CREATE TABLE IF NOT EXISTS purchase_orders (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  order_number TEXT NOT NULL,
  supplier TEXT NOT NULL,
  items TEXT NOT NULL,
  quantity INTEGER DEFAULT 1,
  unit_price INTEGER DEFAULT 0,
  total INTEGER DEFAULT 0,
  order_date DATE NOT NULL,
  expected_delivery DATE,
  actual_delivery DATE,
  status TEXT NOT NULL DEFAULT '요청' CHECK (status IN ('요청', '승인', '발주', '배송중', '입고완료')),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE purchase_orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all for authenticated" ON purchase_orders
  FOR ALL USING (auth.role() = 'authenticated');`

const emptyForm = {
  order_number: '',
  supplier: '',
  items: '',
  quantity: 1,
  unit_price: 0,
  total: 0,
  order_date: new Date().toISOString().split('T')[0],
  expected_delivery: '',
  actual_delivery: '',
  status: '요청',
  notes: '',
}

export default function OrdersPage() {
  const [data, setData] = useState<PurchaseOrder[]>([])
  const [loading, setLoading] = useState(true)
  const [tableExists, setTableExists] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  const [statusFilter, setStatusFilter] = useState('전체')
  const [search, setSearch] = useState('')
  const supabase = createClient()

  useEffect(() => { fetchData() }, [])

  async function fetchData() {
    setLoading(true)
    const { data: rows, error } = await supabase
      .from('purchase_orders')
      .select('*')
      .order('order_date', { ascending: false })

    if (error) {
      if (error.code === '42P01' || error.message?.includes('does not exist')) {
        setTableExists(false)
      }
      setData([])
    } else {
      setTableExists(true)
      setData(rows || [])
    }
    setLoading(false)
  }

  const filtered = useMemo(() => {
    return data.filter(d => {
      const q = search.toLowerCase()
      const matchSearch = !q ||
        d.order_number.toLowerCase().includes(q) ||
        d.supplier.toLowerCase().includes(q) ||
        d.items.toLowerCase().includes(q)
      const matchStatus = statusFilter === '전체' || d.status === statusFilter
      return matchSearch && matchStatus
    })
  }, [data, search, statusFilter])

  const summary = useMemo(() => {
    const now = new Date()
    const thisMonth = data.filter(d => {
      const orderDate = new Date(d.order_date)
      return orderDate.getMonth() === now.getMonth() && orderDate.getFullYear() === now.getFullYear()
    })
    const pending = data.filter(d => d.status !== '입고완료')
    const totalAmount = thisMonth.reduce((s, d) => s + d.total, 0)
    return {
      thisMonthCount: thisMonth.length,
      pendingCount: pending.length,
      totalAmount,
    }
  }, [data])

  function openAdd() {
    setEditId(null)
    const nextNum = `PO-${new Date().getFullYear()}-${String(data.length + 1).padStart(3, '0')}`
    setForm({ ...emptyForm, order_number: nextNum })
    setShowModal(true)
  }

  function openEdit(item: PurchaseOrder) {
    setEditId(item.id)
    setForm({
      order_number: item.order_number,
      supplier: item.supplier,
      items: item.items,
      quantity: item.quantity,
      unit_price: item.unit_price,
      total: item.total,
      order_date: item.order_date,
      expected_delivery: item.expected_delivery || '',
      actual_delivery: item.actual_delivery || '',
      status: item.status,
      notes: item.notes || '',
    })
    setShowModal(true)
  }

  async function handleSave() {
    if (!form.supplier.trim() || !form.items.trim()) {
      toast.error('협력사와 품목을 입력하세요')
      return
    }
    setSaving(true)
    const payload = {
      order_number: form.order_number.trim(),
      supplier: form.supplier.trim(),
      items: form.items.trim(),
      quantity: Number(form.quantity) || 1,
      unit_price: Number(form.unit_price) || 0,
      total: Number(form.total) || (Number(form.quantity) * Number(form.unit_price)),
      order_date: form.order_date,
      expected_delivery: form.expected_delivery || null,
      actual_delivery: form.actual_delivery || null,
      status: form.status,
      notes: form.notes || null,
    }

    if (editId) {
      const { error } = await supabase.from('purchase_orders').update(payload).eq('id', editId)
      if (error) toast.error('수정 실패: ' + error.message)
      else toast.success('수정 완료')
    } else {
      const { error } = await supabase.from('purchase_orders').insert(payload)
      if (error) toast.error('저장 실패: ' + error.message)
      else toast.success('저장 완료')
    }
    setSaving(false)
    setShowModal(false)
    fetchData()
  }

  async function advanceStatus(id: string, currentStatus: string) {
    const idx = STATUS_FLOW.indexOf(currentStatus)
    if (idx < 0 || idx >= STATUS_FLOW.length - 1) return
    const newStatus = STATUS_FLOW[idx + 1]
    const update: Record<string, unknown> = { status: newStatus }
    if (newStatus === '입고완료') update.actual_delivery = new Date().toISOString().split('T')[0]

    const { error } = await supabase.from('purchase_orders').update(update).eq('id', id)
    if (error) toast.error('상태 변경 실패')
    else { toast.success(`${newStatus}(으)로 변경`); fetchData() }
  }

  async function handleDelete(id: string) {
    if (!confirm('삭제하시겠습니까?')) return
    const { error } = await supabase.from('purchase_orders').delete().eq('id', id)
    if (error) toast.error('삭제 실패')
    else { toast.success('삭제 완료'); fetchData() }
  }

  if (!tableExists) {
    return (
      <div>
        <div className="page-header"><h1 className="page-title">협력사 발주</h1></div>
        <div className="card p-6">
          <div className="flex items-start gap-3 mb-4">
            <Info className="w-5 h-5 text-amber-500 mt-0.5 flex-shrink-0" />
            <div>
              <h3 className="font-semibold text-text-primary mb-1">테이블 생성 필요</h3>
              <p className="text-sm text-text-secondary mb-3">아래 SQL을 Supabase SQL Editor에서 실행하세요.</p>
            </div>
          </div>
          <pre className="bg-gray-900 text-green-400 text-xs p-4 rounded-lg overflow-x-auto whitespace-pre">{CREATE_TABLE_SQL}</pre>
          <div className="mt-4">
            <Button size="sm" variant="secondary" icon={<Copy className="w-4 h-4" />}
              onClick={() => { navigator.clipboard.writeText(CREATE_TABLE_SQL); toast.success('SQL 복사됨') }}>SQL 복사</Button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">협력사 발주</h1>
        <Button size="sm" onClick={openAdd}><Plus className="w-4 h-4 mr-1" /> 새 발주</Button>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        <div className="card p-4">
          <div className="flex items-center gap-2 mb-1">
            <ShoppingCart className="w-4 h-4 text-blue-500" />
            <span className="text-xs text-text-secondary">이번 달 발주</span>
          </div>
          <p className="text-2xl font-bold">{summary.thisMonthCount}건</p>
        </div>
        <div className="card p-4">
          <div className="flex items-center gap-2 mb-1">
            <Truck className="w-4 h-4 text-orange-500" />
            <span className="text-xs text-text-secondary">입고 대기</span>
          </div>
          <p className="text-2xl font-bold text-orange-600">{summary.pendingCount}건</p>
        </div>
        <div className="card p-4">
          <div className="flex items-center gap-2 mb-1">
            <Package className="w-4 h-4 text-green-500" />
            <span className="text-xs text-text-secondary">이번 달 금액</span>
          </div>
          <p className="text-lg font-bold">{formatCurrency(summary.totalAmount)}</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-tertiary" />
          <input className="input-base pl-9" placeholder="발주번호, 협력사, 품목 검색..."
            value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
          {['전체', ...STATUS_FLOW].map(s => (
            <button key={s} onClick={() => setStatusFilter(s)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                statusFilter === s ? 'bg-white text-text-primary shadow-sm' : 'text-text-secondary'
              }`}>{s}</button>
          ))}
        </div>
      </div>

      {/* Table */}
      {loading ? <Loading /> : filtered.length === 0 ? (
        <EmptyState icon={ShoppingCart} title="발주가 없습니다"
          action={<Button size="sm" onClick={openAdd}><Plus className="w-4 h-4 mr-1" /> 새 발주</Button>} />
      ) : (
        <div className="table-container">
          <table className="data-table">
            <thead>
              <tr>
                <th>발주번호</th>
                <th>협력사</th>
                <th>품목</th>
                <th className="text-right">수량</th>
                <th className="text-right">금액</th>
                <th>발주일</th>
                <th>납품예정</th>
                <th>상태</th>
                <th>액션</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(order => (
                <tr key={order.id}>
                  <td className="font-mono text-xs">{order.order_number}</td>
                  <td className="font-medium">{order.supplier}</td>
                  <td className="text-text-secondary max-w-[150px] truncate">{order.items}</td>
                  <td className="text-right">{formatNumber(order.quantity)}</td>
                  <td className="text-right font-medium">{formatCurrency(order.total)}</td>
                  <td className="text-xs text-text-secondary">{formatDate(order.order_date)}</td>
                  <td className="text-xs text-text-secondary">{order.expected_delivery ? formatDate(order.expected_delivery) : '-'}</td>
                  <td>
                    {/* Status flow visualization */}
                    <div className="flex items-center gap-0.5">
                      {STATUS_FLOW.map((step, i) => {
                        const currentIdx = STATUS_FLOW.indexOf(order.status)
                        const isActive = i <= currentIdx
                        return (
                          <div key={step} className="flex items-center">
                            <div className={`w-2 h-2 rounded-full ${isActive ? 'bg-blue-500' : 'bg-gray-200'}`}
                              title={step} />
                            {i < STATUS_FLOW.length - 1 && (
                              <div className={`w-2 h-0.5 ${i < currentIdx ? 'bg-blue-500' : 'bg-gray-200'}`} />
                            )}
                          </div>
                        )
                      })}
                      <span className="ml-1.5">
                        <Badge className={STATUS_COLORS[order.status]}>{order.status}</Badge>
                      </span>
                    </div>
                  </td>
                  <td>
                    <div className="flex gap-1">
                      {order.status !== '입고완료' && (
                        <Button size="sm" variant="ghost" className="!px-2 !py-1 text-xs"
                          onClick={() => advanceStatus(order.id, order.status)}>
                          <ArrowRight className="w-3 h-3" />
                        </Button>
                      )}
                      <button onClick={() => openEdit(order)} className="icon-btn"><Pencil className="w-3.5 h-3.5" /></button>
                      <button onClick={() => handleDelete(order.id)} className="icon-btn text-red-500"><Trash2 className="w-3.5 h-3.5" /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal */}
      <Modal open={showModal} onClose={() => setShowModal(false)}
        title={editId ? '발주 수정' : '새 발주'} size="lg">
        <div className="grid grid-cols-2 gap-3">
          <Input label="발주번호" value={form.order_number}
            onChange={e => setForm({ ...form, order_number: e.target.value })} />
          <Input label="협력사" value={form.supplier}
            onChange={e => setForm({ ...form, supplier: e.target.value })}
            placeholder="협력사명 입력" />
          <div className="col-span-2">
            <Input label="품목" value={form.items}
              onChange={e => setForm({ ...form, items: e.target.value })}
              placeholder="발주 품목 (예: CCTV 카메라 PTZ-200)" />
          </div>
          <Input label="수량" type="number" value={form.quantity}
            onChange={e => {
              const qty = Number(e.target.value)
              setForm({ ...form, quantity: qty, total: qty * form.unit_price })
            }} />
          <Input label="단가 (원)" type="number" value={form.unit_price}
            onChange={e => {
              const price = Number(e.target.value)
              setForm({ ...form, unit_price: price, total: form.quantity * price })
            }} />
          <Input label="합계 (원)" type="number" value={form.total}
            onChange={e => setForm({ ...form, total: Number(e.target.value) })} />
          <Select label="상태" options={STATUS_OPTIONS} value={form.status}
            onChange={e => setForm({ ...form, status: e.target.value })} />
          <Input label="발주일" type="date" value={form.order_date}
            onChange={e => setForm({ ...form, order_date: e.target.value })} />
          <Input label="납품예정일" type="date" value={form.expected_delivery}
            onChange={e => setForm({ ...form, expected_delivery: e.target.value })} />
          <Input label="실제 납품일" type="date" value={form.actual_delivery}
            onChange={e => setForm({ ...form, actual_delivery: e.target.value })} />
          <div className="col-span-2">
            <Textarea label="비고" value={form.notes}
              onChange={e => setForm({ ...form, notes: e.target.value })} rows={2} />
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-4 pt-3 border-t border-border-light">
          <Button variant="secondary" onClick={() => setShowModal(false)}>취소</Button>
          <Button onClick={handleSave} loading={saving}>{editId ? '수정' : '저장'}</Button>
        </div>
      </Modal>
    </div>
  )
}
