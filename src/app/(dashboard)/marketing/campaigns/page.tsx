'use client'

import { useEffect, useState, useMemo, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Modal } from '@/components/ui/modal'
import { Badge } from '@/components/ui/badge'
import { Loading } from '@/components/ui/loading'
import { EmptyState } from '@/components/ui/empty-state'
import { formatCurrency, formatDate } from '@/lib/utils'
import { toast } from 'sonner'
import {
  Plus, Megaphone, Pencil, Trash2,
  Calendar, DollarSign, Target, TrendingUp,
  ChevronDown, ChevronUp, BarChart3, Wallet
} from 'lucide-react'

interface Campaign {
  id: string
  name: string
  channel: string
  ad_type: string | null
  start_date: string
  end_date: string | null
  budget: number
  daily_budget: number
  actual_spend: number
  status: string
  target_audience: string | null
  goal: string | null
  results: string | null
  created_at: string
}

interface AdPerf {
  id: string
  date: string
  channel: string
  campaign_name: string
  campaign_id: string | null
  impressions: number
  clicks: number
  cost: number
  conversions: number
  ga_visits: number
  inquiry_clicks: number
  signups: number
  inquiries: number
  adoptions: number
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
  { value: '메타', label: '메타 (FB/IG)' },
  { value: '유튜브', label: '유튜브' },
  { value: '블로그', label: '블로그' },
  { value: '언론', label: '언론' },
  { value: '이벤트', label: '이벤트/행사' },
  { value: '이메일', label: '이메일' },
  { value: '오프라인', label: '오프라인' },
  { value: '기타', label: '기타' },
]

const AD_TYPE_OPTIONS = [
  { value: '', label: '선택 안함' },
  { value: '검색', label: '검색광고' },
  { value: 'SNS', label: 'SNS광고' },
  { value: '콘텐츠', label: '콘텐츠/블로그' },
  { value: '영상', label: '영상광고' },
  { value: '오프라인', label: '오프라인/행사' },
  { value: '기타', label: '기타' },
]

const emptyForm = {
  name: '',
  channel: '네이버',
  ad_type: '',
  start_date: new Date().toISOString().split('T')[0],
  end_date: '',
  budget: 0,
  daily_budget: 0,
  actual_spend: 0,
  status: '준비',
  target_audience: '',
  goal: '',
  results: '',
}

// 주차 번호 계산
function getWeekKey(dateStr: string) {
  const d = new Date(dateStr)
  const jan1 = new Date(d.getFullYear(), 0, 1)
  const diff = d.getTime() - jan1.getTime()
  const weekNum = Math.ceil((diff / 86400000 + jan1.getDay() + 1) / 7)
  return `${d.getFullYear()}-W${String(weekNum).padStart(2, '0')}`
}

export default function CampaignsPage() {
  const [data, setData] = useState<Campaign[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  const [statusFilter, setStatusFilter] = useState('전체')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [perfData, setPerfData] = useState<AdPerf[]>([])
  const [perfLoading, setPerfLoading] = useState(false)
  const supabase = createClient()

  useEffect(() => { fetchData() }, [])

  async function fetchData() {
    setLoading(true)
    const { data: rows, error } = await supabase
      .from('campaigns')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) {
      console.error('campaigns fetch error:', error)
      setData([])
    } else {
      setData(rows || [])
    }
    setLoading(false)
  }

  const fetchPerfData = useCallback(async (campaignId: string) => {
    setPerfLoading(true)
    const { data: rows, error } = await supabase
      .from('ad_performance')
      .select('*')
      .eq('campaign_id', campaignId)
      .order('date', { ascending: false })

    if (error) {
      console.error('perf fetch error:', error)
      setPerfData([])
    } else {
      setPerfData(rows || [])
    }
    setPerfLoading(false)
  }, [])

  function toggleExpand(campaignId: string) {
    if (expandedId === campaignId) {
      setExpandedId(null)
      setPerfData([])
    } else {
      setExpandedId(campaignId)
      fetchPerfData(campaignId)
    }
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
      ad_type: item.ad_type || '',
      start_date: item.start_date,
      end_date: item.end_date || '',
      budget: item.budget,
      daily_budget: item.daily_budget || 0,
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
      ad_type: form.ad_type || null,
      start_date: form.start_date,
      end_date: form.end_date || null,
      budget: Number(form.budget) || 0,
      daily_budget: Number(form.daily_budget) || 0,
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

  // 인라인 상세 패널 데이터 계산
  const perfSummary = useMemo(() => {
    if (perfData.length === 0) return null
    const totalCost = perfData.reduce((s, d) => s + Number(d.cost), 0)
    const totalClicks = perfData.reduce((s, d) => s + d.clicks, 0)
    const totalImpressions = perfData.reduce((s, d) => s + d.impressions, 0)
    const totalGaVisits = perfData.reduce((s, d) => s + (d.ga_visits || 0), 0)
    const totalInquiryClicks = perfData.reduce((s, d) => s + (d.inquiry_clicks || 0), 0)
    const totalSignups = perfData.reduce((s, d) => s + d.signups, 0)
    const totalInquiries = perfData.reduce((s, d) => s + d.inquiries, 0)
    const totalAdoptions = perfData.reduce((s, d) => s + d.adoptions, 0)
    const ctr = totalImpressions > 0 ? (totalClicks / totalImpressions * 100) : 0
    return { totalCost, totalClicks, totalImpressions, totalGaVisits, totalInquiryClicks, totalSignups, totalInquiries, totalAdoptions, ctr }
  }, [perfData])

  // 주간 소계
  const weeklyData = useMemo(() => {
    const weeks: Record<string, { cost: number; clicks: number; impressions: number; ga_visits: number; inquiry_clicks: number; signups: number; inquiries: number; adoptions: number; days: number }> = {}
    perfData.forEach(d => {
      const wk = getWeekKey(d.date)
      if (!weeks[wk]) weeks[wk] = { cost: 0, clicks: 0, impressions: 0, ga_visits: 0, inquiry_clicks: 0, signups: 0, inquiries: 0, adoptions: 0, days: 0 }
      weeks[wk].cost += Number(d.cost)
      weeks[wk].clicks += d.clicks
      weeks[wk].impressions += d.impressions
      weeks[wk].ga_visits += (d.ga_visits || 0)
      weeks[wk].inquiry_clicks += (d.inquiry_clicks || 0)
      weeks[wk].signups += d.signups
      weeks[wk].inquiries += d.inquiries
      weeks[wk].adoptions += d.adoptions
      weeks[wk].days += 1
    })
    return Object.entries(weeks).sort((a, b) => b[0].localeCompare(a[0]))
  }, [perfData])

  // 최근 7일 일별 비용 (바 차트용)
  const last7Days = useMemo(() => {
    return perfData.slice(0, 7).reverse()
  }, [perfData])

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
            const isExpanded = expandedId === campaign.id
            return (
              <div key={campaign.id} className="card overflow-hidden">
                {/* Campaign Header */}
                <div className="p-4 hover:bg-surface-secondary/50 transition-colors cursor-pointer"
                  onClick={() => toggleExpand(campaign.id)}>
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-semibold text-text-primary">{campaign.name}</h3>
                        <Badge className={STATUS_COLORS[campaign.status]}>{campaign.status}</Badge>
                        <span className="text-xs px-2 py-0.5 bg-gray-100 text-gray-600 rounded">{campaign.channel}</span>
                        {campaign.ad_type && (
                          <span className="text-xs px-2 py-0.5 bg-blue-50 text-blue-600 rounded">{campaign.ad_type}</span>
                        )}
                      </div>
                      <div className="flex items-center gap-4 text-xs text-text-secondary">
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          {campaign.start_date ? formatDate(campaign.start_date) : '-'} ~ {campaign.end_date ? formatDate(campaign.end_date) : '진행중'}
                        </span>
                        {campaign.daily_budget > 0 && (
                          <span className="flex items-center gap-1">
                            <Wallet className="w-3 h-3" />
                            일 예산: {formatCurrency(campaign.daily_budget)}
                          </span>
                        )}
                        {campaign.target_audience && <span>대상: {campaign.target_audience}</span>}
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <button onClick={(e) => { e.stopPropagation(); openEdit(campaign) }}
                        className="icon-btn"><Pencil className="w-3.5 h-3.5" /></button>
                      <button onClick={(e) => { e.stopPropagation(); handleDelete(campaign.id) }}
                        className="icon-btn text-red-500"><Trash2 className="w-3.5 h-3.5" /></button>
                      {isExpanded
                        ? <ChevronUp className="w-4 h-4 text-text-tertiary ml-1" />
                        : <ChevronDown className="w-4 h-4 text-text-tertiary ml-1" />}
                    </div>
                  </div>

                  {/* Budget Bar */}
                  <div className="mt-2">
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
                </div>

                {/* Expanded Detail Panel */}
                {isExpanded && (
                  <div className="border-t border-border-light bg-surface-secondary/30">
                    {perfLoading ? (
                      <div className="p-6"><Loading /></div>
                    ) : perfData.length === 0 ? (
                      <div className="p-6 text-center text-sm text-text-secondary">
                        이 캠페인에 연결된 광고 성과 데이터가 없습니다.
                        <br />
                        <span className="text-xs">광고 성과 페이지에서 데이터를 입력할 때 이 캠페인을 선택해주세요.</span>
                      </div>
                    ) : (
                      <div className="p-4 space-y-4">
                        {/* Monthly KPI */}
                        {perfSummary && (
                          <div className="grid grid-cols-3 md:grid-cols-9 gap-2">
                            {[
                              { label: '총 비용', value: formatCurrency(perfSummary.totalCost), color: 'text-blue-600' },
                              { label: '노출', value: perfSummary.totalImpressions.toLocaleString(), color: 'text-gray-600' },
                              { label: '클릭', value: perfSummary.totalClicks.toLocaleString(), color: 'text-indigo-600' },
                              { label: 'CTR', value: perfSummary.ctr.toFixed(2) + '%', color: 'text-teal-600' },
                              { label: 'GA유입', value: String(perfSummary.totalGaVisits), color: 'text-cyan-600' },
                              { label: '문의클릭', value: String(perfSummary.totalInquiryClicks), color: 'text-amber-600' },
                              { label: '가입', value: String(perfSummary.totalSignups), color: 'text-green-600' },
                              { label: '문의', value: String(perfSummary.totalInquiries), color: 'text-orange-600' },
                              { label: '도입', value: String(perfSummary.totalAdoptions), color: 'text-purple-600' },
                            ].map(kpi => (
                              <div key={kpi.label} className="bg-white rounded-lg p-2.5 text-center">
                                <p className="text-[10px] text-text-secondary mb-0.5">{kpi.label}</p>
                                <p className={`text-sm font-bold ${kpi.color}`}>{kpi.value}</p>
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Daily Budget vs Spend - Last 7 days bar chart */}
                        {campaign.daily_budget > 0 && last7Days.length > 0 && (
                          <div className="bg-white rounded-lg p-3">
                            <h4 className="text-xs font-semibold text-text-primary mb-2 flex items-center gap-1">
                              <BarChart3 className="w-3.5 h-3.5" /> 최근 7일 일 예산 대비 소진
                            </h4>
                            <div className="flex items-end gap-1.5 h-24">
                              {last7Days.map(d => {
                                const pct = campaign.daily_budget > 0
                                  ? Math.min((Number(d.cost) / campaign.daily_budget) * 100, 150)
                                  : 0
                                const isOver = Number(d.cost) > campaign.daily_budget
                                return (
                                  <div key={d.date} className="flex-1 flex flex-col items-center gap-0.5">
                                    <span className="text-[9px] text-text-secondary">
                                      {Math.round(Number(d.cost) / 10000)}만
                                    </span>
                                    <div className="w-full relative" style={{ height: '60px' }}>
                                      {/* Budget line */}
                                      <div className="absolute bottom-0 left-0 right-0 border-t border-dashed border-red-300"
                                        style={{ bottom: `${Math.min((campaign.daily_budget / (campaign.daily_budget * 1.5)) * 60, 60)}px` }} />
                                      <div className={`absolute bottom-0 left-0 right-0 rounded-t transition-all ${
                                        isOver ? 'bg-red-400' : 'bg-blue-400'
                                      }`}
                                        style={{ height: `${Math.min(pct / 150 * 60, 60)}px` }} />
                                    </div>
                                    <span className="text-[9px] text-text-tertiary">
                                      {new Date(d.date).getDate()}일
                                    </span>
                                  </div>
                                )
                              })}
                            </div>
                            <div className="flex items-center gap-3 mt-1.5 text-[10px] text-text-secondary">
                              <span className="flex items-center gap-1">
                                <span className="w-2 h-2 rounded-sm bg-blue-400" /> 소진
                              </span>
                              <span className="flex items-center gap-1">
                                <span className="w-2 h-2 rounded-sm bg-red-400" /> 초과
                              </span>
                              <span className="flex items-center gap-1">
                                <span className="w-4 border-t border-dashed border-red-300" /> 일 예산
                              </span>
                            </div>
                          </div>
                        )}

                        {/* Weekly Subtotals */}
                        {weeklyData.length > 0 && (
                          <div className="bg-white rounded-lg p-3">
                            <h4 className="text-xs font-semibold text-text-primary mb-2">주간 소계</h4>
                            <div className="overflow-x-auto">
                              <table className="w-full text-xs">
                                <thead>
                                  <tr className="border-b border-border-light">
                                    <th className="text-left py-1.5 px-2 text-text-secondary font-medium">주차</th>
                                    <th className="text-right py-1.5 px-2 text-text-secondary font-medium">비용</th>
                                    <th className="text-right py-1.5 px-2 text-text-secondary font-medium">클릭</th>
                                    <th className="text-right py-1.5 px-2 text-text-secondary font-medium">노출</th>
                                    <th className="text-right py-1.5 px-2 text-text-secondary font-medium">GA유입</th>
                                    <th className="text-right py-1.5 px-2 text-text-secondary font-medium">문의클릭</th>
                                    <th className="text-right py-1.5 px-2 text-text-secondary font-medium">가입</th>
                                    <th className="text-right py-1.5 px-2 text-text-secondary font-medium">문의</th>
                                    <th className="text-right py-1.5 px-2 text-text-secondary font-medium">도입</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {weeklyData.map(([week, wk]) => (
                                    <tr key={week} className="border-b border-border-light/50 hover:bg-surface-secondary/50">
                                      <td className="py-1.5 px-2 font-medium">{week} ({wk.days}일)</td>
                                      <td className="text-right py-1.5 px-2">{formatCurrency(wk.cost)}</td>
                                      <td className="text-right py-1.5 px-2">{wk.clicks.toLocaleString()}</td>
                                      <td className="text-right py-1.5 px-2">{wk.impressions.toLocaleString()}</td>
                                      <td className="text-right py-1.5 px-2">{wk.ga_visits}</td>
                                      <td className="text-right py-1.5 px-2">{wk.inquiry_clicks}</td>
                                      <td className="text-right py-1.5 px-2">{wk.signups}</td>
                                      <td className="text-right py-1.5 px-2">{wk.inquiries}</td>
                                      <td className="text-right py-1.5 px-2">{wk.adoptions}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        )}

                        {/* Daily Performance Table */}
                        <div className="bg-white rounded-lg p-3">
                          <h4 className="text-xs font-semibold text-text-primary mb-2">일별 성과 ({perfData.length}건)</h4>
                          <div className="overflow-x-auto max-h-64 overflow-y-auto">
                            <table className="w-full text-xs">
                              <thead className="sticky top-0 bg-white">
                                <tr className="border-b border-border-light">
                                  <th className="text-left py-1.5 px-2 text-text-secondary font-medium">날짜</th>
                                  <th className="text-right py-1.5 px-2 text-text-secondary font-medium">비용</th>
                                  <th className="text-right py-1.5 px-2 text-text-secondary font-medium">노출</th>
                                  <th className="text-right py-1.5 px-2 text-text-secondary font-medium">클릭</th>
                                  <th className="text-right py-1.5 px-2 text-text-secondary font-medium">CTR</th>
                                  <th className="text-right py-1.5 px-2 text-text-secondary font-medium">GA유입</th>
                                  <th className="text-right py-1.5 px-2 text-text-secondary font-medium">문의클릭</th>
                                  <th className="text-right py-1.5 px-2 text-text-secondary font-medium">가입</th>
                                  <th className="text-right py-1.5 px-2 text-text-secondary font-medium">문의</th>
                                  <th className="text-right py-1.5 px-2 text-text-secondary font-medium">도입</th>
                                </tr>
                              </thead>
                              <tbody>
                                {perfData.map(d => {
                                  const ctr = d.impressions > 0 ? (d.clicks / d.impressions * 100) : 0
                                  const isOverBudget = campaign.daily_budget > 0 && Number(d.cost) > campaign.daily_budget
                                  return (
                                    <tr key={d.id} className={`border-b border-border-light/50 hover:bg-surface-secondary/50 ${
                                      isOverBudget ? 'bg-red-50/50' : ''
                                    }`}>
                                      <td className="py-1.5 px-2 font-medium">{formatDate(d.date)}</td>
                                      <td className={`text-right py-1.5 px-2 ${isOverBudget ? 'text-red-600 font-medium' : ''}`}>
                                        {formatCurrency(Number(d.cost))}
                                      </td>
                                      <td className="text-right py-1.5 px-2">{d.impressions.toLocaleString()}</td>
                                      <td className="text-right py-1.5 px-2">{d.clicks.toLocaleString()}</td>
                                      <td className="text-right py-1.5 px-2">{ctr.toFixed(2)}%</td>
                                      <td className="text-right py-1.5 px-2">{d.ga_visits || 0}</td>
                                      <td className="text-right py-1.5 px-2">{d.inquiry_clicks || 0}</td>
                                      <td className="text-right py-1.5 px-2">{d.signups}</td>
                                      <td className="text-right py-1.5 px-2">{d.inquiries}</td>
                                      <td className="text-right py-1.5 px-2">{d.adoptions}</td>
                                    </tr>
                                  )
                                })}
                              </tbody>
                            </table>
                          </div>
                        </div>
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
              placeholder="예: 2026 상반기 네이버 브랜드검색" />
          </div>
          <Select label="채널" options={CHANNEL_OPTIONS} value={form.channel}
            onChange={e => setForm({ ...form, channel: e.target.value })} />
          <Select label="광고유형" options={AD_TYPE_OPTIONS} value={form.ad_type}
            onChange={e => setForm({ ...form, ad_type: e.target.value })} />
          <Select label="상태" options={STATUS_OPTIONS} value={form.status}
            onChange={e => setForm({ ...form, status: e.target.value })} />
          <div />
          <Input label="시작일" type="date" value={form.start_date}
            onChange={e => setForm({ ...form, start_date: e.target.value })} />
          <Input label="종료일" type="date" value={form.end_date}
            onChange={e => setForm({ ...form, end_date: e.target.value })} />
          <Input label="월 예산 (원)" type="number" value={form.budget}
            onChange={e => setForm({ ...form, budget: Number(e.target.value) })} />
          <Input label="일 예산 (원)" type="number" value={form.daily_budget}
            onChange={e => setForm({ ...form, daily_budget: Number(e.target.value) })} />
          <Input label="누적 집행액 (원)" type="number" value={form.actual_spend}
            onChange={e => setForm({ ...form, actual_spend: Number(e.target.value) })}
            placeholder="동기화 시 자동 계산" />
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
