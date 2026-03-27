'use client'

import { useEffect, useState, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Modal } from '@/components/ui/modal'
import { Badge } from '@/components/ui/badge'
import { Loading } from '@/components/ui/loading'
import { EmptyState } from '@/components/ui/empty-state'
import { formatDate } from '@/lib/utils'
import { toast } from 'sonner'
import {
  Plus, HardDrive, Search, Pencil, Trash2, Copy, Info,
  Package, ArrowUpRight, ArrowDownLeft, Wrench, PackageCheck
} from 'lucide-react'

interface Equipment {
  id: string
  equipment_type: string
  serial_number: string
  status: string
  current_site: string | null
  customer: string | null
  deploy_date: string | null
  return_date: string | null
  notes: string | null
  created_at: string
}

const EQUIP_TYPES = [
  { value: 'CCTV 고정형', label: 'CCTV 고정형' },
  { value: 'CCTV 이동형', label: 'CCTV 이동형' },
  { value: 'CCTV 열화상', label: 'CCTV 열화상' },
  { value: '안전모', label: '안전모' },
  { value: '안전밴드', label: '안전밴드' },
  { value: 'NVR', label: 'NVR' },
  { value: '모니터', label: '모니터' },
  { value: '기타', label: '기타' },
]

const STATUS_OPTIONS = [
  { value: '재고', label: '재고' },
  { value: '출고', label: '출고' },
  { value: '회수', label: '회수' },
  { value: '수리', label: '수리' },
]

const STATUS_COLORS: Record<string, string> = {
  '재고': 'bg-green-100 text-green-700',
  '출고': 'bg-blue-100 text-blue-700',
  '회수': 'bg-yellow-100 text-yellow-700',
  '수리': 'bg-red-100 text-red-700',
}

const STATUS_ICONS: Record<string, typeof Package> = {
  '재고': PackageCheck,
  '출고': ArrowUpRight,
  '회수': ArrowDownLeft,
  '수리': Wrench,
}

const CREATE_TABLE_SQL = `-- Supabase SQL Editor에서 실행하세요
CREATE TABLE IF NOT EXISTS equipment (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  equipment_type TEXT NOT NULL,
  serial_number TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT '재고' CHECK (status IN ('재고', '출고', '회수', '수리')),
  current_site TEXT,
  customer TEXT,
  deploy_date DATE,
  return_date DATE,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE equipment ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all for authenticated" ON equipment
  FOR ALL USING (auth.role() = 'authenticated');`

const emptyForm = {
  equipment_type: 'CCTV 고정형',
  serial_number: '',
  status: '재고',
  current_site: '',
  customer: '',
  deploy_date: '',
  return_date: '',
  notes: '',
}

export default function EquipmentPage() {
  const [data, setData] = useState<Equipment[]>([])
  const [loading, setLoading] = useState(true)
  const [tableExists, setTableExists] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('전체')
  const [typeFilter, setTypeFilter] = useState('전체')
  const supabase = createClient()

  useEffect(() => { fetchData() }, [])

  async function fetchData() {
    setLoading(true)
    const { data: rows, error } = await supabase
      .from('equipment')
      .select('*')
      .order('created_at', { ascending: false })

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
        d.serial_number.toLowerCase().includes(q) ||
        d.equipment_type.toLowerCase().includes(q) ||
        (d.current_site || '').toLowerCase().includes(q) ||
        (d.customer || '').toLowerCase().includes(q)
      const matchStatus = statusFilter === '전체' || d.status === statusFilter
      const matchType = typeFilter === '전체' || d.equipment_type === typeFilter
      return matchSearch && matchStatus && matchType
    })
  }, [data, search, statusFilter, typeFilter])

  const summary = useMemo(() => {
    return {
      total: data.length,
      deployed: data.filter(d => d.status === '출고').length,
      inStock: data.filter(d => d.status === '재고').length,
      repair: data.filter(d => d.status === '수리').length,
    }
  }, [data])

  function openAdd() {
    setEditId(null)
    setForm(emptyForm)
    setShowModal(true)
  }

  function openEdit(item: Equipment) {
    setEditId(item.id)
    setForm({
      equipment_type: item.equipment_type,
      serial_number: item.serial_number,
      status: item.status,
      current_site: item.current_site || '',
      customer: item.customer || '',
      deploy_date: item.deploy_date || '',
      return_date: item.return_date || '',
      notes: item.notes || '',
    })
    setShowModal(true)
  }

  async function handleSave() {
    if (!form.serial_number.trim()) { toast.error('시리얼 번호를 입력하세요'); return }
    setSaving(true)
    const payload = {
      equipment_type: form.equipment_type,
      serial_number: form.serial_number.trim(),
      status: form.status,
      current_site: form.current_site || null,
      customer: form.customer || null,
      deploy_date: form.deploy_date || null,
      return_date: form.return_date || null,
      notes: form.notes || null,
    }

    if (editId) {
      const { error } = await supabase.from('equipment').update(payload).eq('id', editId)
      if (error) toast.error('수정 실패: ' + error.message)
      else toast.success('수정 완료')
    } else {
      const { error } = await supabase.from('equipment').insert(payload)
      if (error) toast.error('저장 실패: ' + error.message)
      else toast.success('저장 완료')
    }
    setSaving(false)
    setShowModal(false)
    fetchData()
  }

  async function quickStatusChange(id: string, newStatus: string) {
    const update: Record<string, unknown> = { status: newStatus }
    if (newStatus === '출고') update.deploy_date = new Date().toISOString().split('T')[0]
    if (newStatus === '회수' || newStatus === '재고') update.return_date = new Date().toISOString().split('T')[0]

    const { error } = await supabase.from('equipment').update(update).eq('id', id)
    if (error) toast.error('상태 변경 실패')
    else { toast.success(`${newStatus}(으)로 변경됨`); fetchData() }
  }

  async function handleDelete(id: string) {
    if (!confirm('삭제하시겠습니까?')) return
    const { error } = await supabase.from('equipment').delete().eq('id', id)
    if (error) toast.error('삭제 실패')
    else { toast.success('삭제 완료'); fetchData() }
  }

  if (!tableExists) {
    return (
      <div>
        <div className="page-header"><h1 className="page-title">장비 반출</h1></div>
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
        <h1 className="page-title">장비 반출</h1>
        <Button size="sm" onClick={openAdd}><Plus className="w-4 h-4 mr-1" /> 장비 등록</Button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <div className="card p-4">
          <div className="flex items-center gap-2 mb-1">
            <HardDrive className="w-4 h-4 text-blue-500" />
            <span className="text-xs text-text-secondary">전체 장비</span>
          </div>
          <p className="text-2xl font-bold">{summary.total}</p>
        </div>
        <div className="card p-4">
          <div className="flex items-center gap-2 mb-1">
            <ArrowUpRight className="w-4 h-4 text-blue-500" />
            <span className="text-xs text-text-secondary">출고중</span>
          </div>
          <p className="text-2xl font-bold text-blue-600">{summary.deployed}</p>
        </div>
        <div className="card p-4">
          <div className="flex items-center gap-2 mb-1">
            <PackageCheck className="w-4 h-4 text-green-500" />
            <span className="text-xs text-text-secondary">재고</span>
          </div>
          <p className="text-2xl font-bold text-green-600">{summary.inStock}</p>
        </div>
        <div className="card p-4">
          <div className="flex items-center gap-2 mb-1">
            <Wrench className="w-4 h-4 text-red-500" />
            <span className="text-xs text-text-secondary">수리중</span>
          </div>
          <p className="text-2xl font-bold text-red-600">{summary.repair}</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-tertiary" />
          <input className="input-base pl-9" placeholder="시리얼, 장비타입, 현장, 고객사 검색..."
            value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <div className="flex gap-1 bg-surface-tertiary rounded-lg p-1">
          {['전체', '재고', '출고', '회수', '수리'].map(s => (
            <button key={s} onClick={() => setStatusFilter(s)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                statusFilter === s ? 'bg-white text-text-primary shadow-sm' : 'text-text-secondary'
              }`}>{s}</button>
          ))}
        </div>
        <select className="input-base !w-auto text-sm"
          value={typeFilter} onChange={e => setTypeFilter(e.target.value)}>
          <option value="전체">장비 전체</option>
          {EQUIP_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
      </div>

      {/* Table */}
      {loading ? <Loading /> : filtered.length === 0 ? (
        <EmptyState icon={HardDrive} title="장비가 없습니다"
          action={<Button size="sm" onClick={openAdd}><Plus className="w-4 h-4 mr-1" /> 장비 등록</Button>} />
      ) : (
        <div className="table-container">
          <table className="data-table">
            <thead>
              <tr>
                <th>장비타입</th>
                <th>시리얼번호</th>
                <th>상태</th>
                <th>현장</th>
                <th>고객사</th>
                <th>출고일</th>
                <th>회수일</th>
                <th>액션</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(item => (
                <tr key={item.id}>
                  <td className="font-medium">{item.equipment_type}</td>
                  <td className="text-xs font-mono text-gray-600">{item.serial_number}</td>
                  <td>
                    <Badge className={STATUS_COLORS[item.status]}>{item.status}</Badge>
                  </td>
                  <td className="text-text-secondary">{item.current_site || '-'}</td>
                  <td className="text-text-secondary">{item.customer || '-'}</td>
                  <td className="text-xs text-text-secondary">{item.deploy_date ? formatDate(item.deploy_date) : '-'}</td>
                  <td className="text-xs text-text-secondary">{item.return_date ? formatDate(item.return_date) : '-'}</td>
                  <td>
                    <div className="flex gap-1">
                      {item.status === '재고' && (
                        <Button size="sm" variant="ghost" className="!px-2 !py-1 text-xs"
                          onClick={() => quickStatusChange(item.id, '출고')}>
                          <ArrowUpRight className="w-3 h-3 mr-0.5" /> 출고
                        </Button>
                      )}
                      {item.status === '출고' && (
                        <Button size="sm" variant="ghost" className="!px-2 !py-1 text-xs"
                          onClick={() => quickStatusChange(item.id, '재고')}>
                          <ArrowDownLeft className="w-3 h-3 mr-0.5" /> 회수
                        </Button>
                      )}
                      <button onClick={() => openEdit(item)} className="icon-btn"><Pencil className="w-3.5 h-3.5" /></button>
                      <button onClick={() => handleDelete(item.id)} className="icon-btn text-red-500"><Trash2 className="w-3.5 h-3.5" /></button>
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
        title={editId ? '장비 수정' : '장비 등록'}>
        <div className="grid grid-cols-2 gap-3">
          <Select label="장비 타입" options={EQUIP_TYPES} value={form.equipment_type}
            onChange={e => setForm({ ...form, equipment_type: e.target.value })} />
          <Input label="시리얼 번호" value={form.serial_number}
            onChange={e => setForm({ ...form, serial_number: e.target.value })}
            placeholder="예: CAM-2024-001" />
          <Select label="상태" options={STATUS_OPTIONS} value={form.status}
            onChange={e => setForm({ ...form, status: e.target.value })} />
          <Input label="현장명" value={form.current_site}
            onChange={e => setForm({ ...form, current_site: e.target.value })} />
          <Input label="고객사" value={form.customer}
            onChange={e => setForm({ ...form, customer: e.target.value })} />
          <Input label="비고" value={form.notes}
            onChange={e => setForm({ ...form, notes: e.target.value })} />
          <Input label="출고일" type="date" value={form.deploy_date}
            onChange={e => setForm({ ...form, deploy_date: e.target.value })} />
          <Input label="회수일" type="date" value={form.return_date}
            onChange={e => setForm({ ...form, return_date: e.target.value })} />
        </div>
        <div className="flex justify-end gap-2 mt-4 pt-3 border-t border-border-light">
          <Button variant="secondary" onClick={() => setShowModal(false)}>취소</Button>
          <Button onClick={handleSave} loading={saving}>{editId ? '수정' : '저장'}</Button>
        </div>
      </Modal>
    </div>
  )
}
