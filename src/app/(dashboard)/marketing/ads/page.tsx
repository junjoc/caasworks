'use client'

import { useEffect, useState, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Modal } from '@/components/ui/modal'
import { Loading } from '@/components/ui/loading'
import { EmptyState } from '@/components/ui/empty-state'
import { formatCurrency, formatDate, formatNumber } from '@/lib/utils'
import { toast } from 'sonner'
import {
  Plus, BarChart3, TrendingUp, MousePointerClick, Target,
  DollarSign, Trash2, Pencil, Copy, ChevronUp, ChevronDown, Info
} from 'lucide-react'

interface AdPerformance {
  id: string
  date: string
  channel: string
  campaign_name: string
  impressions: number
  clicks: number
  cost: number
  conversions: number
  created_at: string
}

type TabType = '전체' | '네이버' | '구글'

const CHANNEL_OPTIONS = [
  { value: '네이버', label: '네이버' },
  { value: '구글', label: '구글' },
]

const CREATE_TABLE_SQL = `-- Supabase SQL Editor에서 실행하세요
CREATE TABLE IF NOT EXISTS ad_performance (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  date DATE NOT NULL,
  channel TEXT NOT NULL CHECK (channel IN ('네이버', '구글')),
  campaign_name TEXT NOT NULL,
  impressions INTEGER DEFAULT 0,
  clicks INTEGER DEFAULT 0,
  cost INTEGER DEFAULT 0,
  conversions INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE ad_performance ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all for authenticated" ON ad_performance
  FOR ALL USING (auth.role() = 'authenticated');`

const emptyForm = {
  date: new Date().toISOString().split('T')[0],
  channel: '네이버',
  campaign_name: '',
  impressions: 0,
  clicks: 0,
  cost: 0,
  conversions: 0,
}

export default function AdsPage() {
  const [data, setData] = useState<AdPerformance[]>([])
  const [loading, setLoading] = useState(true)
  const [tableExists, setTableExists] = useState(true)
  const [tab, setTab] = useState<TabType>('전체')
  const [month, setMonth] = useState(() => {
    const now = new Date()
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  })
  const [showModal, setShowModal] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  const [sortField, setSortField] = useState<'date' | 'cost' | 'clicks'>('date')
  const [sortAsc, setSortAsc] = useState(false)
  const [showSql, setShowSql] = useState(false)
  const supabase = createClient()

  useEffect(() => { fetchData() }, [month])

  async function fetchData() {
    setLoading(true)
    const [year, m] = month.split('-')
    const startDate = `${year}-${m}-01`
    const endDate = `${year}-${m}-31`

    const { data: rows, error } = await supabase
      .from('ad_performance')
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

  const filtered = useMemo(() => {
    let items = tab === '전체' ? data : data.filter(d => d.channel === tab)
    items.sort((a, b) => {
      const aVal = a[sortField] as number | string
      const bVal = b[sortField] as number | string
      if (aVal < bVal) return sortAsc ? -1 : 1
      if (aVal > bVal) return sortAsc ? 1 : -1
      return 0
    })
    return items
  }, [data, tab, sortField, sortAsc])

  const summary = useMemo(() => {
    const items = tab === '전체' ? data : data.filter(d => d.channel === tab)
    const totalSpend = items.reduce((s, d) => s + d.cost, 0)
    const totalClicks = items.reduce((s, d) => s + d.clicks, 0)
    const totalConversions = items.reduce((s, d) => s + d.conversions, 0)
    const totalImpressions = items.reduce((s, d) => s + d.impressions, 0)
    return {
      totalSpend,
      totalClicks,
      totalConversions,
      totalImpressions,
      cpc: totalClicks > 0 ? Math.round(totalSpend / totalClicks) : 0,
      ctr: totalImpressions > 0 ? ((totalClicks / totalImpressions) * 100).toFixed(1) : '0.0',
      convRate: totalClicks > 0 ? ((totalConversions / totalClicks) * 100).toFixed(1) : '0.0',
    }
  }, [data, tab])

  // daily chart data (last 14 days max)
  const chartData = useMemo(() => {
    const items = tab === '전체' ? data : data.filter(d => d.channel === tab)
    const byDate: Record<string, { cost: number; conversions: number }> = {}
    items.forEach(d => {
      if (!byDate[d.date]) byDate[d.date] = { cost: 0, conversions: 0 }
      byDate[d.date].cost += d.cost
      byDate[d.date].conversions += d.conversions
    })
    return Object.entries(byDate)
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-14)
  }, [data, tab])

  const maxCost = Math.max(...chartData.map(([, v]) => v.cost), 1)
  const maxConv = Math.max(...chartData.map(([, v]) => v.conversions), 1)

  function openAdd() {
    setEditId(null)
    setForm(emptyForm)
    setShowModal(true)
  }

  function openEdit(item: AdPerformance) {
    setEditId(item.id)
    setForm({
      date: item.date,
      channel: item.channel,
      campaign_name: item.campaign_name,
      impressions: item.impressions,
      clicks: item.clicks,
      cost: item.cost,
      conversions: item.conversions,
    })
    setShowModal(true)
  }

  async function handleSave() {
    if (!form.campaign_name.trim()) {
      toast.error('캠페인명을 입력하세요')
      return
    }
    setSaving(true)
    const payload = {
      date: form.date,
      channel: form.channel,
      campaign_name: form.campaign_name.trim(),
      impressions: Number(form.impressions) || 0,
      clicks: Number(form.clicks) || 0,
      cost: Number(form.cost) || 0,
      conversions: Number(form.conversions) || 0,
    }

    if (editId) {
      const { error } = await supabase.from('ad_performance').update(payload).eq('id', editId)
      if (error) toast.error('수정 실패: ' + error.message)
      else toast.success('수정 완료')
    } else {
      const { error } = await supabase.from('ad_performance').insert(payload)
      if (error) toast.error('저장 실패: ' + error.message)
      else toast.success('저장 완료')
    }
    setSaving(false)
    setShowModal(false)
    fetchData()
  }

  async function handleDelete(id: string) {
    if (!confirm('삭제하시겠습니까?')) return
    const { error } = await supabase.from('ad_performance').delete().eq('id', id)
    if (error) toast.error('삭제 실패')
    else { toast.success('삭제 완료'); fetchData() }
  }

  function toggleSort(field: typeof sortField) {
    if (sortField === field) setSortAsc(!sortAsc)
    else { setSortField(field); setSortAsc(true) }
  }

  const SortIcon = ({ field }: { field: typeof sortField }) => {
    if (sortField !== field) return null
    return sortAsc ? <ChevronUp className="w-3 h-3 inline ml-0.5" /> : <ChevronDown className="w-3 h-3 inline ml-0.5" />
  }

  if (!tableExists) {
    return (
      <div>
        <div className="page-header">
          <h1 className="page-title">광고 성과</h1>
        </div>
        <div className="card p-6">
          <div className="flex items-start gap-3 mb-4">
            <Info className="w-5 h-5 text-amber-500 mt-0.5 flex-shrink-0" />
            <div>
              <h3 className="font-semibold text-text-primary mb-1">테이블 생성 필요</h3>
              <p className="text-sm text-text-secondary mb-3">
                광고 성과 데이터를 저장할 테이블이 없습니다. 아래 SQL을 Supabase SQL Editor에서 실행하세요.
              </p>
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
        <h1 className="page-title">광고 성과</h1>
        <div className="flex items-center gap-2">
          <Input type="month" value={month} onChange={e => setMonth(e.target.value)}
            className="!w-40" />
          <Button size="sm" onClick={openAdd}>
            <Plus className="w-4 h-4 mr-1" /> 데이터 입력
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-4 bg-gray-100 rounded-lg p-1 w-fit">
        {(['전체', '네이버', '구글'] as TabType[]).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${
              tab === t ? 'bg-white text-text-primary shadow-sm' : 'text-text-secondary hover:text-text-primary'
            }`}>
            {t}
          </button>
        ))}
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <div className="card p-4">
          <div className="flex items-center gap-2 mb-1">
            <DollarSign className="w-4 h-4 text-blue-500" />
            <span className="text-xs text-text-secondary">총 광고비</span>
          </div>
          <p className="text-lg font-bold text-text-primary">{formatCurrency(summary.totalSpend)}</p>
        </div>
        <div className="card p-4">
          <div className="flex items-center gap-2 mb-1">
            <MousePointerClick className="w-4 h-4 text-green-500" />
            <span className="text-xs text-text-secondary">총 클릭 / CPC</span>
          </div>
          <p className="text-lg font-bold text-text-primary">{formatNumber(summary.totalClicks)}</p>
          <p className="text-xs text-text-secondary">CPC {formatCurrency(summary.cpc)}</p>
        </div>
        <div className="card p-4">
          <div className="flex items-center gap-2 mb-1">
            <TrendingUp className="w-4 h-4 text-purple-500" />
            <span className="text-xs text-text-secondary">CTR</span>
          </div>
          <p className="text-lg font-bold text-text-primary">{summary.ctr}%</p>
          <p className="text-xs text-text-secondary">노출 {formatNumber(summary.totalImpressions)}</p>
        </div>
        <div className="card p-4">
          <div className="flex items-center gap-2 mb-1">
            <Target className="w-4 h-4 text-orange-500" />
            <span className="text-xs text-text-secondary">전환 / 전환율</span>
          </div>
          <p className="text-lg font-bold text-text-primary">{formatNumber(summary.totalConversions)}</p>
          <p className="text-xs text-text-secondary">전환율 {summary.convRate}%</p>
        </div>
      </div>

      {/* Chart */}
      {chartData.length > 0 && (
        <div className="card p-4 mb-6">
          <h3 className="text-sm font-semibold text-text-primary mb-3">일별 광고비 / 전환</h3>
          <div className="flex items-end gap-1 h-32">
            {chartData.map(([date, vals]) => (
              <div key={date} className="flex-1 flex flex-col items-center gap-0.5 group relative">
                <div className="w-full flex flex-col items-center gap-0.5">
                  <div className="w-full bg-blue-400 rounded-t-sm transition-all"
                    style={{ height: `${Math.max((vals.cost / maxCost) * 80, 2)}px` }}
                    title={`광고비: ${formatCurrency(vals.cost)}`} />
                  <div className="w-full bg-orange-400 rounded-t-sm transition-all"
                    style={{ height: `${Math.max((vals.conversions / maxConv) * 40, 2)}px` }}
                    title={`전환: ${vals.conversions}`} />
                </div>
                <span className="text-[9px] text-text-secondary mt-1 hidden md:block">
                  {date.slice(5)}
                </span>
              </div>
            ))}
          </div>
          <div className="flex gap-4 mt-2 text-xs text-text-secondary">
            <span className="flex items-center gap-1"><span className="w-3 h-2 bg-blue-400 rounded-sm" /> 광고비</span>
            <span className="flex items-center gap-1"><span className="w-3 h-2 bg-orange-400 rounded-sm" /> 전환</span>
          </div>
        </div>
      )}

      {/* Table */}
      {loading ? <Loading /> : filtered.length === 0 ? (
        <EmptyState icon={BarChart3} title="데이터가 없습니다"
          description="광고 성과 데이터를 입력하세요"
          action={<Button size="sm" onClick={openAdd}><Plus className="w-4 h-4 mr-1" /> 데이터 입력</Button>} />
      ) : (
        <div className="table-container">
          <table className="data-table">
            <thead>
              <tr>
                <th className="cursor-pointer" onClick={() => toggleSort('date')}>
                  날짜 <SortIcon field="date" />
                </th>
                <th>채널</th>
                <th>캠페인명</th>
                <th className="text-right">노출</th>
                <th className="text-right cursor-pointer" onClick={() => toggleSort('clicks')}>
                  클릭 <SortIcon field="clicks" />
                </th>
                <th className="text-right cursor-pointer" onClick={() => toggleSort('cost')}>
                  비용 <SortIcon field="cost" />
                </th>
                <th className="text-right">전환</th>
                <th className="text-right">CPC</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {filtered.map(row => {
                const cpc = row.clicks > 0 ? Math.round(row.cost / row.clicks) : 0
                return (
                  <tr key={row.id}>
                    <td>{formatDate(row.date)}</td>
                    <td>
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                        row.channel === '네이버' ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'
                      }`}>{row.channel}</span>
                    </td>
                    <td className="font-medium">{row.campaign_name}</td>
                    <td className="text-right text-gray-500">{formatNumber(row.impressions)}</td>
                    <td className="text-right">{formatNumber(row.clicks)}</td>
                    <td className="text-right font-medium">{formatCurrency(row.cost)}</td>
                    <td className="text-right">{row.conversions}</td>
                    <td className="text-right text-gray-500">{formatCurrency(cpc)}</td>
                    <td>
                      <div className="flex gap-1 justify-end">
                        <button onClick={() => openEdit(row)} className="icon-btn" title="수정">
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => handleDelete(row.id)} className="icon-btn text-red-500" title="삭제">
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

      {/* Modal */}
      <Modal open={showModal} onClose={() => setShowModal(false)}
        title={editId ? '광고 데이터 수정' : '광고 데이터 입력'}>
        <div className="grid grid-cols-2 gap-3">
          <Input label="날짜" type="date" value={form.date}
            onChange={e => setForm({ ...form, date: e.target.value })} />
          <Select label="채널" options={CHANNEL_OPTIONS} value={form.channel}
            onChange={e => setForm({ ...form, channel: e.target.value })} />
          <div className="col-span-2">
            <Input label="캠페인명" value={form.campaign_name}
              onChange={e => setForm({ ...form, campaign_name: e.target.value })}
              placeholder="예: 브랜드검색_CCTV_2024" />
          </div>
          <Input label="노출수" type="number" value={form.impressions}
            onChange={e => setForm({ ...form, impressions: Number(e.target.value) })} />
          <Input label="클릭수" type="number" value={form.clicks}
            onChange={e => setForm({ ...form, clicks: Number(e.target.value) })} />
          <Input label="비용 (원)" type="number" value={form.cost}
            onChange={e => setForm({ ...form, cost: Number(e.target.value) })} />
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
