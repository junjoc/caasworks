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
  Plus, Megaphone, Pencil, Trash2, Copy, Info,
  Calendar, DollarSign, Target, TrendingUp
} from 'lucide-react'

interface Campaign {
  id: string
  name: string
  channel: string
  start_date: string
  end_date: string | null
  budget: number
  actual_spend: number
  status: string
  target_audience: string | null
  goal: string | null
  results: string | null
  created_at: string
}

const STATUS_OPTIONS = [
  { value: '준비', label: '준비' },
  { value: '진행중', label: '진행중' },
  { value: '종료', label: '종료' },
  { value: '중단', label: '중단' },
]

const STATUS_COLORS: Record<string, string> = {
  '준비': 'bg-gray-100 text-gray-700',
  '진행중': 'bg-blue-100 text-blue-700',
  '종료': 'bg-green-100 text-green-700',
  '중단': 'bg-red-100 text-red-700',
}

const CHANNEL_OPTIONS = [
  { value: '네이버', label: '네이버' },
  { value: '구글', label: '구글' },
  { value: 'SNS', label: 'SNS' },
  { value: '이메일', label: '이메일' },
  { value: '오프라인', label: '오프라인' },
  { value: '기타', label: '기타' },
]

const CREATE_TABLE_SQL = `-- Supabase SQL Editor에서 실행하세요
CREATE TABLE IF NOT EXISTS campaigns (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  channel TEXT NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE,
  budget INTEGER DEFAULT 0,
  actual_spend INTEGER DEFAULT 0,
  status TEXT NOT NULL DEFAULT '준비' CHECK (status IN ('준비', '진행중', '종료', '중단')),
  target_audience TEXT,
  goal TEXT,
  results TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE campaigns ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all for authenticated" ON campaigns
  FOR ALL USING (auth.role() = 'authenticated');`

const emptyForm = {
  name: '',
  channel: '네이버',
  start_date: new Date().toISOString().split('T')[0],
  end_date: '',
  budget: 0,
  actual_spend: 0,
  status: '준비',
  target_audience: '',
  goal: '',
  results: '',
}

export default function CampaignsPage() {
  const [data, setData] = useState<Campaign[]>([])
  const [loading, setLoading] = useState(true)
  const [tableExists, setTableExists] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  const [statusFilter, setStatusFilter] = useState('전체')
  const supabase = createClient()

  useEffect(() => { fetchData() }, [])

  async function fetchData() {
    setLoading(true)
    const { data: rows, error } = await supabase
      .from('campaigns')
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
    if (statusFilter === '전체') return data
    return data.filter(d => d.status === statusFilter)
  }, [data, statusFilter])

  const summaryStats = useMemo(() => {
    const totalBudget = data.reduce((s, d) => s + d.budget, 0)
    const totalSpend = data.reduce((s, d) => s + d.actual_spend, 0)
    const activeCount = data.filter(d => d.status === '진행중').length
    return { totalBudget, totalSpend, activeCount, total: data.length }
  }, [data])

  function openAdd() {
    setEditId(null)
    setForm(emptyForm)
    setShowModal(true)
  }

  function openEdit(item: Campaign) {
    setEditId(item.id)
    setForm({
      name: item.name,
      channel: item.channel,
      start_date: item.start_date,
      end_date: item.end_date || '',
      budget: item.budget,
      actual_spend: item.actual_spend,
      status: item.status,
      target_audience: item.target_audience || '',
      goal: item.goal || '',
      results: item.results || '',
    })
    setShowModal(true)
  }

  async function handleSave() {
    if (!form.name.trim()) { toast.error('캠페인명을 입력하세요'); return }
    setSaving(true)
    const payload = {
      name: form.name.trim(),
      channel: form.channel,
      start_date: form.start_date,
      end_date: form.end_date || null,
      budget: Number(form.budget) || 0,
      actual_spend: Number(form.actual_spend) || 0,
      status: form.status,
      target_audience: form.target_audience || null,
      goal: form.goal || null,
      results: form.results || null,
    }

    if (editId) {
      const { error } = await supabase.from('campaigns').update(payload).eq('id', editId)
      if (error) toast.error('수정 실패: ' + error.message)
      else toast.success('수정 완료')
    } else {
      const { error } = await supabase.from('campaigns').insert(payload)
      if (error) toast.error('저장 실패: ' + error.message)
      else toast.success('저장 완료')
    }
    setSaving(false)
    setShowModal(false)
    fetchData()
  }

  async function handleDelete(id: string) {
    if (!confirm('삭제하시겠습니까?')) return
    const { error } = await supabase.from('campaigns').delete().eq('id', id)
    if (error) toast.error('삭제 실패')
    else { toast.success('삭제 완료'); fetchData() }
  }

  if (!tableExists) {
    return (
      <div>
        <div className="page-header"><h1 className="page-title">캠페인 관리</h1></div>
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
              onClick={() => { navigator.clipboard.writeText(CREATE_TABLE_SQL); toast.success('SQL 복사됨') }}>
              SQL 복사
            </Button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">캠페인 관리</h1>
        <Button size="sm" onClick={openAdd}><Plus className="w-4 h-4 mr-1" /> 새 캠페인</Button>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <div className="card p-4">
          <div className="flex items-center gap-2 mb-1">
            <Megaphone className="w-4 h-4 text-blue-500" />
            <span className="text-xs text-text-secondary">전체 캠페인</span>
          </div>
          <p className="text-lg font-bold">{summaryStats.total}개</p>
          <p className="text-xs text-text-secondary">진행중 {summaryStats.activeCount}개</p>
        </div>
        <div className="card p-4">
          <div className="flex items-center gap-2 mb-1">
            <DollarSign className="w-4 h-4 text-green-500" />
            <span className="text-xs text-text-secondary">총 예산</span>
          </div>
          <p className="text-lg font-bold">{formatCurrency(summaryStats.totalBudget)}</p>
        </div>
        <div className="card p-4">
          <div className="flex items-center gap-2 mb-1">
            <TrendingUp className="w-4 h-4 text-orange-500" />
            <span className="text-xs text-text-secondary">총 집행액</span>
          </div>
          <p className="text-lg font-bold">{formatCurrency(summaryStats.totalSpend)}</p>
        </div>
        <div className="card p-4">
          <div className="flex items-center gap-2 mb-1">
            <Target className="w-4 h-4 text-purple-500" />
            <span className="text-xs text-text-secondary">예산 소진율</span>
          </div>
          <p className="text-lg font-bold">
            {summaryStats.totalBudget > 0
              ? ((summaryStats.totalSpend / summaryStats.totalBudget) * 100).toFixed(0)
              : 0}%
          </p>
        </div>
      </div>

      {/* Filter */}
      <div className="flex gap-1 mb-4 bg-gray-100 rounded-lg p-1 w-fit">
        {['전체', '준비', '진행중', '종료', '중단'].map(s => (
          <button key={s} onClick={() => setStatusFilter(s)}
            className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
              statusFilter === s ? 'bg-white text-text-primary shadow-sm' : 'text-text-secondary hover:text-text-primary'
            }`}>
            {s}
          </button>
        ))}
      </div>

      {/* List */}
      {loading ? <Loading /> : filtered.length === 0 ? (
        <EmptyState icon={Megaphone} title="캠페인이 없습니다"
          action={<Button size="sm" onClick={openAdd}><Plus className="w-4 h-4 mr-1" /> 새 캠페인</Button>} />
      ) : (
        <div className="space-y-3">
          {filtered.map(campaign => {
            const budgetPct = campaign.budget > 0
              ? Math.min((campaign.actual_spend / campaign.budget) * 100, 100)
              : 0
            const roi = campaign.actual_spend > 0 && campaign.results
              ? '결과 입력됨'
              : '-'
            return (
              <div key={campaign.id} className="card p-4 hover:shadow-md transition-shadow">
                <div className="flex items-start justify-between mb-2">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-semibold text-text-primary">{campaign.name}</h3>
                      <Badge className={STATUS_COLORS[campaign.status]}>{campaign.status}</Badge>
                      <span className="text-xs px-2 py-0.5 bg-gray-100 text-gray-600 rounded">{campaign.channel}</span>
                    </div>
                    <div className="flex items-center gap-4 text-xs text-text-secondary">
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        {formatDate(campaign.start_date)} ~ {campaign.end_date ? formatDate(campaign.end_date) : '진행중'}
                      </span>
                      {campaign.target_audience && <span>대상: {campaign.target_audience}</span>}
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <button onClick={() => openEdit(campaign)} className="icon-btn"><Pencil className="w-3.5 h-3.5" /></button>
                    <button onClick={() => handleDelete(campaign.id)} className="icon-btn text-red-500"><Trash2 className="w-3.5 h-3.5" /></button>
                  </div>
                </div>

                {/* Budget Bar */}
                <div className="mt-3">
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-text-secondary">예산 대비 집행</span>
                    <span className="font-medium">
                      {formatCurrency(campaign.actual_spend)} / {formatCurrency(campaign.budget)}
                    </span>
                  </div>
                  <div className="w-full bg-gray-100 rounded-full h-2">
                    <div className={`h-2 rounded-full transition-all ${
                      budgetPct > 90 ? 'bg-red-500' : budgetPct > 70 ? 'bg-yellow-500' : 'bg-blue-500'
                    }`} style={{ width: `${budgetPct}%` }} />
                  </div>
                </div>

                {/* Goal / Results */}
                {(campaign.goal || campaign.results) && (
                  <div className="mt-3 pt-3 border-t border-border-light grid grid-cols-2 gap-3 text-xs">
                    {campaign.goal && (
                      <div>
                        <span className="text-text-secondary">목표:</span>{' '}
                        <span className="text-text-primary">{campaign.goal}</span>
                      </div>
                    )}
                    {campaign.results && (
                      <div>
                        <span className="text-text-secondary">결과:</span>{' '}
                        <span className="text-text-primary">{campaign.results}</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Modal */}
      <Modal open={showModal} onClose={() => setShowModal(false)}
        title={editId ? '캠페인 수정' : '새 캠페인'} size="lg">
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <Input label="캠페인명" value={form.name}
              onChange={e => setForm({ ...form, name: e.target.value })}
              placeholder="예: 2024 상반기 네이버 브랜드검색" />
          </div>
          <Select label="채널" options={CHANNEL_OPTIONS} value={form.channel}
            onChange={e => setForm({ ...form, channel: e.target.value })} />
          <Select label="상태" options={STATUS_OPTIONS} value={form.status}
            onChange={e => setForm({ ...form, status: e.target.value })} />
          <Input label="시작일" type="date" value={form.start_date}
            onChange={e => setForm({ ...form, start_date: e.target.value })} />
          <Input label="종료일" type="date" value={form.end_date}
            onChange={e => setForm({ ...form, end_date: e.target.value })} />
          <Input label="예산 (원)" type="number" value={form.budget}
            onChange={e => setForm({ ...form, budget: Number(e.target.value) })} />
          <Input label="집행액 (원)" type="number" value={form.actual_spend}
            onChange={e => setForm({ ...form, actual_spend: Number(e.target.value) })} />
          <div className="col-span-2">
            <Input label="타겟 대상" value={form.target_audience}
              onChange={e => setForm({ ...form, target_audience: e.target.value })}
              placeholder="예: 건설사 안전관리자" />
          </div>
          <div className="col-span-2">
            <Textarea label="목표" value={form.goal}
              onChange={e => setForm({ ...form, goal: e.target.value })}
              placeholder="캠페인 목표 (예: 리드 50건 확보)" rows={2} />
          </div>
          <div className="col-span-2">
            <Textarea label="결과" value={form.results}
              onChange={e => setForm({ ...form, results: e.target.value })}
              placeholder="캠페인 결과 요약" rows={2} />
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
