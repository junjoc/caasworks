'use client'

import { useEffect, useState, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Modal } from '@/components/ui/modal'
import { Loading } from '@/components/ui/loading'
import { EmptyState } from '@/components/ui/empty-state'
import { formatNumber } from '@/lib/utils'
import { toast } from 'sonner'
import {
  Plus, BarChart3, Users, Clock, TrendingUp, Globe,
  Pencil, Trash2, Copy, Info, ArrowRight, ChevronRight
} from 'lucide-react'

interface TrafficData {
  id: string
  date: string
  source: string
  sessions: number
  users: number
  bounce_rate: number
  avg_duration: number
  conversions: number
  created_at: string
}

const SOURCE_OPTIONS = [
  { value: 'organic', label: '자연검색 (Organic)' },
  { value: 'paid', label: '유료검색 (Paid)' },
  { value: 'direct', label: '직접유입 (Direct)' },
  { value: 'referral', label: '추천 (Referral)' },
  { value: 'social', label: '소셜 (Social)' },
]

const SOURCE_LABELS: Record<string, string> = {
  organic: '자연검색',
  paid: '유료검색',
  direct: '직접유입',
  referral: '추천',
  social: '소셜',
}

const SOURCE_COLORS: Record<string, string> = {
  organic: 'bg-green-500',
  paid: 'bg-blue-500',
  direct: 'bg-purple-500',
  referral: 'bg-orange-500',
  social: 'bg-pink-500',
}

const CREATE_TABLE_SQL = `-- Supabase SQL Editor에서 실행하세요
CREATE TABLE IF NOT EXISTS traffic_analytics (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  date DATE NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('organic', 'paid', 'direct', 'referral', 'social')),
  sessions INTEGER DEFAULT 0,
  users INTEGER DEFAULT 0,
  bounce_rate NUMERIC(5,2) DEFAULT 0,
  avg_duration INTEGER DEFAULT 0,
  conversions INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE traffic_analytics ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all for authenticated" ON traffic_analytics
  FOR ALL USING (auth.role() = 'authenticated');`

const emptyForm = {
  date: new Date().toISOString().split('T')[0],
  source: 'organic',
  sessions: 0,
  users: 0,
  bounce_rate: 0,
  avg_duration: 0,
  conversions: 0,
}

export default function AnalyticsPage() {
  const [data, setData] = useState<TrafficData[]>([])
  const [loading, setLoading] = useState(true)
  const [tableExists, setTableExists] = useState(true)
  const [month, setMonth] = useState(() => {
    const now = new Date()
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  })
  const [showModal, setShowModal] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  const supabase = createClient()

  useEffect(() => { fetchData() }, [month])

  async function fetchData() {
    setLoading(true)
    const [year, m] = month.split('-')
    const startDate = `${year}-${m}-01`
    const endDate = `${year}-${m}-31`

    const { data: rows, error } = await supabase
      .from('traffic_analytics')
      .select('*')
      .gte('date', startDate)
      .lte('date', endDate)
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

  const summary = useMemo(() => {
    const totalSessions = data.reduce((s, d) => s + d.sessions, 0)
    const totalUsers = data.reduce((s, d) => s + d.users, 0)
    const totalConversions = data.reduce((s, d) => s + d.conversions, 0)
    const avgBounce = data.length > 0
      ? (data.reduce((s, d) => s + d.bounce_rate, 0) / data.length).toFixed(1)
      : '0.0'
    const convRate = totalSessions > 0
      ? ((totalConversions / totalSessions) * 100).toFixed(1)
      : '0.0'
    return { totalSessions, totalUsers, totalConversions, avgBounce, convRate }
  }, [data])

  // Source breakdown
  const sourceBreakdown = useMemo(() => {
    const bySource: Record<string, { sessions: number; conversions: number }> = {}
    data.forEach(d => {
      if (!bySource[d.source]) bySource[d.source] = { sessions: 0, conversions: 0 }
      bySource[d.source].sessions += d.sessions
      bySource[d.source].conversions += d.conversions
    })
    const maxSessions = Math.max(...Object.values(bySource).map(v => v.sessions), 1)
    return Object.entries(bySource)
      .sort(([, a], [, b]) => b.sessions - a.sessions)
      .map(([source, vals]) => ({
        source,
        ...vals,
        pct: summary.totalSessions > 0
          ? ((vals.sessions / summary.totalSessions) * 100).toFixed(1)
          : '0',
        barWidth: (vals.sessions / maxSessions) * 100,
      }))
  }, [data, summary])

  // Top source
  const topSource = sourceBreakdown.length > 0 ? sourceBreakdown[0].source : '-'

  // Funnel data (simple mock based on real conversion data)
  const funnelSteps = useMemo(() => {
    const sessions = summary.totalSessions
    // Estimate funnel: 유입 → 문의 (30%) → 리드 (50%) → 견적 (40%) → 계약 (30%)
    const inquiries = Math.round(sessions * 0.03)
    const leads = Math.round(inquiries * 0.5)
    const quotes = Math.round(leads * 0.4)
    const contracts = summary.totalConversions || Math.round(quotes * 0.3)
    return [
      { label: '유입', value: sessions, color: 'bg-blue-500' },
      { label: '문의', value: inquiries, color: 'bg-indigo-500' },
      { label: '리드', value: leads, color: 'bg-purple-500' },
      { label: '견적', value: quotes, color: 'bg-orange-500' },
      { label: '계약', value: contracts, color: 'bg-green-500' },
    ]
  }, [summary])

  const maxFunnel = Math.max(...funnelSteps.map(s => s.value), 1)

  function openAdd() {
    setEditId(null)
    setForm(emptyForm)
    setShowModal(true)
  }

  function openEdit(item: TrafficData) {
    setEditId(item.id)
    setForm({
      date: item.date,
      source: item.source,
      sessions: item.sessions,
      users: item.users,
      bounce_rate: item.bounce_rate,
      avg_duration: item.avg_duration,
      conversions: item.conversions,
    })
    setShowModal(true)
  }

  async function handleSave() {
    setSaving(true)
    const payload = {
      date: form.date,
      source: form.source,
      sessions: Number(form.sessions) || 0,
      users: Number(form.users) || 0,
      bounce_rate: Number(form.bounce_rate) || 0,
      avg_duration: Number(form.avg_duration) || 0,
      conversions: Number(form.conversions) || 0,
    }

    if (editId) {
      const { error } = await supabase.from('traffic_analytics').update(payload).eq('id', editId)
      if (error) toast.error('수정 실패: ' + error.message)
      else toast.success('수정 완료')
    } else {
      const { error } = await supabase.from('traffic_analytics').insert(payload)
      if (error) toast.error('저장 실패: ' + error.message)
      else toast.success('저장 완료')
    }
    setSaving(false)
    setShowModal(false)
    fetchData()
  }

  async function handleDelete(id: string) {
    if (!confirm('삭제하시겠습니까?')) return
    const { error } = await supabase.from('traffic_analytics').delete().eq('id', id)
    if (error) toast.error('삭제 실패')
    else { toast.success('삭제 완료'); fetchData() }
  }

  if (!tableExists) {
    return (
      <div>
        <div className="page-header"><h1 className="page-title">유입 분석</h1></div>
        <div className="card p-6">
          <div className="flex items-start gap-3 mb-4">
            <Info className="w-5 h-5 text-amber-500 mt-0.5 flex-shrink-0" />
            <div>
              <h3 className="font-semibold text-text-primary mb-1">테이블 생성 필요</h3>
              <p className="text-sm text-text-secondary mb-3">아래 SQL을 Supabase SQL Editor에서 실행하세요.</p>
            </div>
          </div>
          <pre className="bg-gray-900 text-green-400 text-xs p-4 rounded-lg overflow-x-auto whitespace-pre">
            {CREATE_TABLE_SQL}
          </pre>
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
        <h1 className="page-title">유입 분석</h1>
        <div className="flex items-center gap-2">
          <Input type="month" value={month} onChange={e => setMonth(e.target.value)} className="!w-40" />
          <Button size="sm" onClick={openAdd}><Plus className="w-4 h-4 mr-1" /> 데이터 입력</Button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
        <div className="card p-4">
          <div className="flex items-center gap-2 mb-1">
            <Globe className="w-4 h-4 text-blue-500" />
            <span className="text-xs text-text-secondary">총 세션</span>
          </div>
          <p className="text-lg font-bold">{formatNumber(summary.totalSessions)}</p>
        </div>
        <div className="card p-4">
          <div className="flex items-center gap-2 mb-1">
            <Users className="w-4 h-4 text-green-500" />
            <span className="text-xs text-text-secondary">사용자</span>
          </div>
          <p className="text-lg font-bold">{formatNumber(summary.totalUsers)}</p>
        </div>
        <div className="card p-4">
          <div className="flex items-center gap-2 mb-1">
            <TrendingUp className="w-4 h-4 text-purple-500" />
            <span className="text-xs text-text-secondary">전환율</span>
          </div>
          <p className="text-lg font-bold">{summary.convRate}%</p>
        </div>
        <div className="card p-4">
          <div className="flex items-center gap-2 mb-1">
            <Clock className="w-4 h-4 text-orange-500" />
            <span className="text-xs text-text-secondary">이탈률</span>
          </div>
          <p className="text-lg font-bold">{summary.avgBounce}%</p>
        </div>
        <div className="card p-4">
          <div className="flex items-center gap-2 mb-1">
            <BarChart3 className="w-4 h-4 text-pink-500" />
            <span className="text-xs text-text-secondary">주요 소스</span>
          </div>
          <p className="text-lg font-bold">{SOURCE_LABELS[topSource] || '-'}</p>
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-4 mb-6">
        {/* Source Breakdown */}
        <div className="card p-4">
          <h3 className="text-sm font-semibold text-text-primary mb-3">유입 소스별 세션</h3>
          {sourceBreakdown.length === 0 ? (
            <p className="text-sm text-text-secondary py-4 text-center">데이터 없음</p>
          ) : (
            <div className="space-y-3">
              {sourceBreakdown.map(s => (
                <div key={s.source}>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="font-medium text-text-primary">{SOURCE_LABELS[s.source]}</span>
                    <span className="text-text-secondary">{formatNumber(s.sessions)} ({s.pct}%)</span>
                  </div>
                  <div className="w-full bg-gray-100 rounded-full h-2">
                    <div className={`h-2 rounded-full ${SOURCE_COLORS[s.source] || 'bg-gray-400'} transition-all`}
                      style={{ width: `${s.barWidth}%` }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Conversion Funnel */}
        <div className="card p-4">
          <h3 className="text-sm font-semibold text-text-primary mb-3">전환 퍼널</h3>
          <div className="space-y-2">
            {funnelSteps.map((step, i) => (
              <div key={step.label} className="flex items-center gap-2">
                <span className="text-xs text-text-secondary w-10 text-right">{step.label}</span>
                <div className="flex-1 flex items-center gap-2">
                  <div className="flex-1 bg-gray-100 rounded-full h-6 relative overflow-hidden">
                    <div className={`h-6 rounded-full ${step.color} transition-all flex items-center justify-end pr-2`}
                      style={{ width: `${Math.max((step.value / maxFunnel) * 100, 8)}%` }}>
                      <span className="text-xs text-white font-medium">{formatNumber(step.value)}</span>
                    </div>
                  </div>
                  {i < funnelSteps.length - 1 && (
                    <ChevronRight className="w-3 h-3 text-gray-300 flex-shrink-0" />
                  )}
                </div>
              </div>
            ))}
          </div>
          <p className="text-xs text-text-secondary mt-3">* 문의~견적 수치는 유입 대비 추정치입니다</p>
        </div>
      </div>

      {/* Data Table */}
      {loading ? <Loading /> : data.length === 0 ? (
        <EmptyState icon={BarChart3} title="유입 데이터가 없습니다"
          description="GA4 데이터를 입력하세요"
          action={<Button size="sm" onClick={openAdd}><Plus className="w-4 h-4 mr-1" /> 데이터 입력</Button>} />
      ) : (
        <div className="table-container">
          <table className="data-table">
            <thead>
              <tr>
                <th>날짜</th>
                <th>소스</th>
                <th className="text-right">세션</th>
                <th className="text-right">사용자</th>
                <th className="text-right">이탈률</th>
                <th className="text-right">평균 체류(초)</th>
                <th className="text-right">전환</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {data.map(row => (
                <tr key={row.id}>
                  <td>{row.date}</td>
                  <td>
                    <span className="flex items-center gap-1.5">
                      <span className={`w-2 h-2 rounded-full ${SOURCE_COLORS[row.source] || 'bg-gray-400'}`} />
                      {SOURCE_LABELS[row.source]}
                    </span>
                  </td>
                  <td className="text-right">{formatNumber(row.sessions)}</td>
                  <td className="text-right">{formatNumber(row.users)}</td>
                  <td className="text-right">{row.bounce_rate}%</td>
                  <td className="text-right">{row.avg_duration}초</td>
                  <td className="text-right">{row.conversions}</td>
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
        title={editId ? '유입 데이터 수정' : '유입 데이터 입력'}>
        <div className="grid grid-cols-2 gap-3">
          <Input label="날짜" type="date" value={form.date}
            onChange={e => setForm({ ...form, date: e.target.value })} />
          <Select label="소스" options={SOURCE_OPTIONS} value={form.source}
            onChange={e => setForm({ ...form, source: e.target.value })} />
          <Input label="세션" type="number" value={form.sessions}
            onChange={e => setForm({ ...form, sessions: Number(e.target.value) })} />
          <Input label="사용자" type="number" value={form.users}
            onChange={e => setForm({ ...form, users: Number(e.target.value) })} />
          <Input label="이탈률 (%)" type="number" step="0.1" value={form.bounce_rate}
            onChange={e => setForm({ ...form, bounce_rate: Number(e.target.value) })} />
          <Input label="평균 체류시간 (초)" type="number" value={form.avg_duration}
            onChange={e => setForm({ ...form, avg_duration: Number(e.target.value) })} />
          <Input label="전환수" type="number" value={form.conversions}
            onChange={e => setForm({ ...form, conversions: Number(e.target.value) })} />
        </div>
        <div className="flex justify-end gap-2 mt-4 pt-3 border-t border-border-light">
          <Button variant="secondary" onClick={() => setShowModal(false)}>취소</Button>
          <Button onClick={handleSave} loading={saving}>{editId ? '수정' : '저장'}</Button>
        </div>
      </Modal>
    </div>
  )
}
