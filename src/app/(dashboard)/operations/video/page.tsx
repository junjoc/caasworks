'use client'

import { useEffect, useState, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { DateRangePicker, type DateRange } from '@/components/ui/date-range-picker'
import { Textarea } from '@/components/ui/textarea'
import { Modal } from '@/components/ui/modal'
import { Badge } from '@/components/ui/badge'
import { Loading } from '@/components/ui/loading'
import { EmptyState } from '@/components/ui/empty-state'
import { formatDate } from '@/lib/utils'
import { toast } from 'sonner'
import {
  Plus, Video, Pencil, Trash2, Copy, Info,
  Search, Calendar, Film, HardDrive, Filter
} from 'lucide-react'

interface VideoRecord {
  id: string
  site_name: string
  recording_type: string
  date: string
  duration: string | null
  storage_location: string | null
  notes: string | null
  created_at: string
}

const RECORDING_TYPES = [
  { value: '전경', label: '전경' },
  { value: '상시', label: '상시' },
  { value: '중요공종', label: '중요공종' },
  { value: '검측', label: '검측' },
]

const TYPE_COLORS: Record<string, string> = {
  '전경': 'bg-blue-100 text-blue-700',
  '상시': 'bg-gray-100 text-gray-700',
  '중요공종': 'bg-orange-100 text-orange-700',
  '검측': 'bg-purple-100 text-purple-700',
}

const CREATE_TABLE_SQL = `-- Supabase SQL Editor에서 실행하세요
CREATE TABLE IF NOT EXISTS video_records (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  site_name TEXT NOT NULL,
  recording_type TEXT NOT NULL CHECK (recording_type IN ('전경', '상시', '중요공종', '검측')),
  date DATE NOT NULL,
  duration TEXT,
  storage_location TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE video_records ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all for authenticated" ON video_records
  FOR ALL USING (auth.role() = 'authenticated');`

const emptyForm = {
  site_name: '',
  recording_type: '전경',
  date: new Date().toISOString().split('T')[0],
  duration: '',
  storage_location: '',
  notes: '',
}

export default function VideoPage() {
  const [data, setData] = useState<VideoRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [tableExists, setTableExists] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('전체')
  const [dateRange, setDateRange] = useState<DateRange>({ from: '', to: '' })
  const supabase = createClient()

  useEffect(() => { fetchData() }, [])

  async function fetchData() {
    setLoading(true)
    const { data: rows, error } = await supabase
      .from('video_records')
      .select('*')
      .order('date', { ascending: false })

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

  const siteNames = useMemo(() => {
    const set = new Set<string>()
    data.forEach(d => set.add(d.site_name))
    return Array.from(set).sort()
  }, [data])

  const filtered = useMemo(() => {
    return data.filter(d => {
      const q = search.toLowerCase()
      const matchSearch = !q ||
        d.site_name.toLowerCase().includes(q) ||
        (d.notes || '').toLowerCase().includes(q) ||
        (d.storage_location || '').toLowerCase().includes(q)
      const matchType = typeFilter === '전체' || d.recording_type === typeFilter
      const matchDateFrom = !dateRange.from || d.date >= dateRange.from
      const matchDateTo = !dateRange.to || d.date <= dateRange.to
      return matchSearch && matchType && matchDateFrom && matchDateTo
    })
  }, [data, search, typeFilter, dateRange])

  const summary = useMemo(() => {
    const bySite: Record<string, number> = {}
    const byType: Record<string, number> = {}
    data.forEach(d => {
      bySite[d.site_name] = (bySite[d.site_name] || 0) + 1
      byType[d.recording_type] = (byType[d.recording_type] || 0) + 1
    })
    return { bySite, byType, total: data.length, siteCount: Object.keys(bySite).length }
  }, [data])

  function openAdd() {
    setEditId(null)
    setForm(emptyForm)
    setShowModal(true)
  }

  function openEdit(item: VideoRecord) {
    setEditId(item.id)
    setForm({
      site_name: item.site_name,
      recording_type: item.recording_type,
      date: item.date,
      duration: item.duration || '',
      storage_location: item.storage_location || '',
      notes: item.notes || '',
    })
    setShowModal(true)
  }

  async function handleSave() {
    if (!form.site_name.trim()) { toast.error('현장명을 입력하세요'); return }
    setSaving(true)
    const payload = {
      site_name: form.site_name.trim(),
      recording_type: form.recording_type,
      date: form.date,
      duration: form.duration || null,
      storage_location: form.storage_location || null,
      notes: form.notes || null,
    }

    if (editId) {
      const { error } = await supabase.from('video_records').update(payload).eq('id', editId)
      if (error) toast.error('수정 실패: ' + error.message)
      else toast.success('수정 완료')
    } else {
      const { error } = await supabase.from('video_records').insert(payload)
      if (error) toast.error('저장 실패: ' + error.message)
      else toast.success('저장 완료')
    }
    setSaving(false)
    setShowModal(false)
    fetchData()
  }

  async function handleDelete(id: string) {
    if (!confirm('삭제하시겠습니까?')) return
    const { error } = await supabase.from('video_records').delete().eq('id', id)
    if (error) toast.error('삭제 실패')
    else { toast.success('삭제 완료'); fetchData() }
  }

  if (!tableExists) {
    return (
      <div>
        <div className="page-header"><h1 className="page-title">영상 기록</h1></div>
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
        <h1 className="page-title">영상 기록</h1>
        <Button size="sm" onClick={openAdd}><Plus className="w-4 h-4 mr-1" /> 기록 추가</Button>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <div className="card p-4">
          <div className="flex items-center gap-2 mb-1">
            <Film className="w-4 h-4 text-blue-500" />
            <span className="text-xs text-text-secondary">총 영상</span>
          </div>
          <p className="text-2xl font-bold">{summary.total}건</p>
        </div>
        <div className="card p-4">
          <div className="flex items-center gap-2 mb-1">
            <HardDrive className="w-4 h-4 text-green-500" />
            <span className="text-xs text-text-secondary">현장 수</span>
          </div>
          <p className="text-2xl font-bold">{summary.siteCount}곳</p>
        </div>
        {RECORDING_TYPES.slice(0, 2).map(t => (
          <div key={t.value} className="card p-4">
            <span className="text-xs text-text-secondary">{t.label}</span>
            <p className="text-2xl font-bold mt-1">{summary.byType[t.value] || 0}건</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-tertiary" />
          <input className="input-base pl-9" placeholder="현장명, 비고 검색..."
            value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
          {['전체', ...RECORDING_TYPES.map(t => t.value)].map(s => (
            <button key={s} onClick={() => setTypeFilter(s)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                typeFilter === s ? 'bg-white text-text-primary shadow-sm' : 'text-text-secondary'
              }`}>{s}</button>
          ))}
        </div>
        <DateRangePicker value={dateRange} onChange={setDateRange} />
      </div>

      {/* Calendar view placeholder */}
      <div className="card p-4 mb-4 flex items-center justify-center bg-gray-50 border-dashed">
        <div className="text-center text-text-secondary">
          <Calendar className="w-8 h-8 mx-auto mb-2 text-text-placeholder" />
          <p className="text-sm">캘린더 뷰 연동 예정</p>
        </div>
      </div>

      {/* Table */}
      {loading ? <Loading /> : filtered.length === 0 ? (
        <EmptyState icon={Video} title="영상 기록이 없습니다"
          action={<Button size="sm" onClick={openAdd}><Plus className="w-4 h-4 mr-1" /> 기록 추가</Button>} />
      ) : (
        <div className="table-container">
          <table className="data-table">
            <thead>
              <tr>
                <th>날짜</th>
                <th>현장</th>
                <th>촬영 유형</th>
                <th>시간</th>
                <th>저장 위치</th>
                <th>비고</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {filtered.map(row => (
                <tr key={row.id}>
                  <td className="text-xs">{formatDate(row.date)}</td>
                  <td className="font-medium">{row.site_name}</td>
                  <td>
                    <Badge className={TYPE_COLORS[row.recording_type] || 'bg-gray-100 text-gray-700'}>
                      {row.recording_type}
                    </Badge>
                  </td>
                  <td className="text-text-secondary">{row.duration || '-'}</td>
                  <td className="text-xs text-text-secondary max-w-[150px] truncate">{row.storage_location || '-'}</td>
                  <td className="text-xs text-text-secondary max-w-[200px] truncate">{row.notes || '-'}</td>
                  <td>
                    <div className="flex gap-1 justify-end">
                      <button onClick={() => openEdit(row)} className="icon-btn"><Pencil className="w-3.5 h-3.5" /></button>
                      <button onClick={() => handleDelete(row.id)} className="icon-btn text-red-500"><Trash2 className="w-3.5 h-3.5" /></button>
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
        title={editId ? '영상 기록 수정' : '영상 기록 추가'}>
        <div className="grid grid-cols-2 gap-3">
          <Input label="현장명" value={form.site_name}
            onChange={e => setForm({ ...form, site_name: e.target.value })}
            placeholder="현장명 입력"
            list="site-names" />
          <datalist id="site-names">
            {siteNames.map(s => <option key={s} value={s} />)}
          </datalist>
          <Select label="촬영 유형" options={RECORDING_TYPES} value={form.recording_type}
            onChange={e => setForm({ ...form, recording_type: e.target.value })} />
          <Input label="날짜" type="date" value={form.date}
            onChange={e => setForm({ ...form, date: e.target.value })} />
          <Input label="시간 (예: 2시간30분)" value={form.duration}
            onChange={e => setForm({ ...form, duration: e.target.value })} />
          <div className="col-span-2">
            <Input label="저장 위치" value={form.storage_location}
              onChange={e => setForm({ ...form, storage_location: e.target.value })}
              placeholder="NAS, 클라우드 경로 등" />
          </div>
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
