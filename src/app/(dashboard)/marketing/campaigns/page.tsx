'use client'

import { useEffect, useState, useMemo, useCallback, Fragment } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Modal } from '@/components/ui/modal'
import { Badge } from '@/components/ui/badge'
import { Loading } from '@/components/ui/loading'
import { EmptyState } from '@/components/ui/empty-state'
import { DatePicker } from '@/components/ui/date-picker'
import { DateRangePicker, type DateRange } from '@/components/ui/date-range-picker'
import { formatCurrency, formatDate } from '@/lib/utils'
import { toast } from 'sonner'
import { PageHeader, Toolbar, Tabs, DsButton, Skeleton, Empty, StatusChip, Drawer } from '@/components/ds'
import {
  Plus, Megaphone, Pencil, Trash2,
  Calendar, DollarSign, Target, TrendingUp,
  ChevronDown, ChevronUp, BarChart3, Wallet,
  PlusCircle, Save
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
  { value: '외주 블로그', label: '외주 블로그' },
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
  const [showMonthlyCostForm, setShowMonthlyCostForm] = useState(false)
  const [monthlyCostForm, setMonthlyCostForm] = useState({
    date: new Date().toISOString().split('T')[0],
    cost: 0,
    ga_visits: 0,
    inquiry_clicks: 0,
    signups: 0,
    inquiries: 0,
    adoptions: 0,
    notes: '',
  })
  const [savingMonthlyCost, setSavingMonthlyCost] = useState(false)
  // 기간 필터 (기본: 이번 달)
  const [dateRange, setDateRange] = useState<DateRange>({ from: '', to: '' })
  const supabase = createClient()
  // 캠페인별 성과 합계 (누적·이번 달) — 표 한 줄에 쓰는 값. 한 번만 읽는다
  const [folded, setFolded] = useState<Set<string>>(new Set())
  const [agg, setAgg] = useState<Record<string, { cost: number; month: number; clicks: number; inq: number; ad: number }>>({})

  useEffect(() => { fetchData() }, [])

  async function fetchAgg() {
    const ym = new Date().toISOString().slice(0, 7)
    const out: Record<string, { cost: number; month: number; clicks: number; inq: number; ad: number }> = {}
    for (let i = 0; i < 30; i++) {
      const { data: rows } = await supabase.from('ad_performance').select('campaign_id, date, cost, clicks, inquiries, adoptions').not('campaign_id', 'is', null).range(i * 1000, i * 1000 + 999)
      for (const r of rows || []) {
        const a = out[r.campaign_id] ||= { cost: 0, month: 0, clicks: 0, inq: 0, ad: 0 }
        const cost = Number(r.cost) || 0
        a.cost += cost; if (String(r.date).startsWith(ym)) a.month += cost
        a.clicks += Number(r.clicks) || 0; a.inq += Number(r.inquiries) || 0; a.ad += Number(r.adoptions) || 0
      }
      if (!rows || rows.length < 1000) break
    }
    setAgg(out)
  }

  async function fetchData() {
    setLoading(true)
    fetchAgg() // 저장·삭제 뒤에도 합계가 같이 갱신되게
    const { data: rows, error } = await supabase
      .from('campaigns')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) {
      console.error('campaigns fetch error:', error)
      setData([])
    } else {
      const today = new Date().toISOString().split('T')[0]
      // end_date가 지난 '진행중' 캠페인을 자동으로 '종료' 처리
      const expiredIds = (rows || [])
        .filter(r => r.status === '진행중' && r.end_date && r.end_date < today)
        .map(r => r.id)

      if (expiredIds.length > 0) {
        await supabase.from('campaigns').update({ status: '종료' }).in('id', expiredIds)
        // 업데이트 반영
        const updated = (rows || []).map(r =>
          expiredIds.includes(r.id) ? { ...r, status: '종료' } : r
        )
        setData(updated)
      } else {
        setData(rows || [])
      }
    }
    setLoading(false)
  }

  const fetchPerfData = useCallback(async (campaignId: string) => {
    setPerfLoading(true)
    const { data: rows, error } = await supabase
      .from('ad_performance')
      .select('*')
      .eq('campaign_id', campaignId)
      .gte('date', dateRange.from)
      .lte('date', dateRange.to)
      .order('date', { ascending: false })

    if (error) {
      console.error('perf fetch error:', error)
      setPerfData([])
    } else {
      setPerfData(rows || [])
    }
    setPerfLoading(false)
  }, [dateRange])

  function toggleExpand(campaignId: string) {
    if (expandedId === campaignId) {
      setExpandedId(null)
      setPerfData([])
    } else {
      setExpandedId(campaignId)
      fetchPerfData(campaignId)
    }
  }

  // Re-fetch when dateRange changes and a campaign is expanded
  useEffect(() => {
    if (expandedId) fetchPerfData(expandedId)
  }, [dateRange])

  const filtered = useMemo(() => {
    let items = data

    // 상태 필터
    if (statusFilter !== '전체') {
      items = items.filter(d => d.status === statusFilter)
    }

    // 날짜 범위 필터: 선택 기간에 활동하지 않은 캠페인 제외
    if (dateRange.from && dateRange.to) {
      items = items.filter(d => {
        if (!d.start_date) return true
        const campStart = d.start_date
        // 종료/중단 캠페인: end_date 없으면 start_date를 종료일로 간주
        const campEnd = d.end_date
          || (d.status === '종료' || d.status === '중단' ? d.start_date : '9999-12-31')
        return campStart <= dateRange.to && campEnd >= dateRange.from
      })
    }

    return items
  }, [data, statusFilter, dateRange])

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

  // 월 비용 등록: 해당 월 1일에 비용만 기록
  async function handleRegisterMonthlyCost(campaign: Campaign, monthStr: string) {
    setSavingMonthlyCost(true)
    const [y, mo] = monthStr.split('-').map(Number)
    const dateStr = `${y}-${String(mo).padStart(2, '0')}-01`

    // Check if cost entry already exists for this campaign + month 1st
    const { data: existing } = await supabase
      .from('ad_performance')
      .select('id')
      .eq('campaign_id', campaign.id)
      .eq('date', dateStr)
      .gt('cost', 0)
      .limit(1)

    if (existing && existing.length > 0) {
      toast.info(`${y}년 ${mo}월 비용이 이미 등록되어 있습니다`)
      setSavingMonthlyCost(false)
      return
    }

    const { error } = await supabase.from('ad_performance').insert({
      date: dateStr,
      channel: campaign.channel || '콘텐츠',
      ad_type: campaign.ad_type || '콘텐츠',
      campaign_name: campaign.name,
      campaign_id: campaign.id,
      impressions: 0, clicks: 0,
      cost: campaign.budget || 0,
      ga_visits: 0, inquiry_clicks: 0,
      signups: 0, inquiries: 0, adoptions: 0,
      notes: `${campaign.name} ${y}년 ${mo}월 월정액`,
    })

    if (error) {
      toast.error('등록 실패: ' + error.message)
    } else {
      toast.success(`${y}년 ${mo}월 비용 ${formatCurrency(campaign.budget)} 등록 완료`)
      // Update campaign actual_spend
      const { data: allPerf } = await supabase
        .from('ad_performance').select('cost').eq('campaign_id', campaign.id)
      const totalSpend = (allPerf || []).reduce((s: number, r: any) => s + (Number(r.cost) || 0), 0)
      await supabase.from('campaigns').update({ actual_spend: totalSpend }).eq('id', campaign.id)
      fetchPerfData(campaign.id)
      fetchData()
    }
    setSavingMonthlyCost(false)
  }

  // 성과 삭제
  async function handleDeletePerf(perfId: string, campaignId: string) {
    if (!confirm('이 성과 기록을 삭제하시겠습니까?')) return
    const { error } = await supabase.from('ad_performance').delete().eq('id', perfId)
    if (error) {
      toast.error('삭제 실패: ' + error.message)
    } else {
      toast.success('삭제 완료')
      // Update campaign actual_spend
      const { data: allPerf } = await supabase
        .from('ad_performance').select('cost').eq('campaign_id', campaignId)
      const totalSpend = (allPerf || []).reduce((s: number, r: any) => s + (Number(r.cost) || 0), 0)
      await supabase.from('campaigns').update({ actual_spend: totalSpend }).eq('id', campaignId)
      fetchPerfData(campaignId)
      fetchData()
    }
  }

  // 일별 성과 등록: 해당 날짜에 성과만 기록 (비용 0)
  async function handleSaveResult(campaign: Campaign) {
    if (!monthlyCostForm.date) {
      toast.error('날짜를 선택하세요')
      return
    }
    if (!monthlyCostForm.signups && !monthlyCostForm.inquiries && !monthlyCostForm.adoptions) {
      toast.error('성과를 입력하세요')
      return
    }
    setSavingMonthlyCost(true)
    const dateStr = monthlyCostForm.date

    // Check if entry exists for this campaign + date
    const { data: existing } = await supabase
      .from('ad_performance')
      .select('id, cost, ga_visits, inquiry_clicks, signups, inquiries, adoptions')
      .eq('campaign_id', campaign.id)
      .eq('date', dateStr)
      .limit(1)

    const existingRow = existing?.[0]
    const payload = {
      date: dateStr,
      channel: campaign.channel || '콘텐츠',
      ad_type: campaign.ad_type || '콘텐츠',
      campaign_name: campaign.name,
      campaign_id: campaign.id,
      impressions: 0, clicks: 0,
      cost: existingRow ? Number(existingRow.cost) : 0,  // preserve existing cost
      ga_visits: Number(monthlyCostForm.ga_visits) || (existingRow?.ga_visits || 0),
      inquiry_clicks: existingRow?.inquiry_clicks || 0,
      signups: Number(monthlyCostForm.signups) || 0,
      inquiries: Number(monthlyCostForm.inquiries) || 0,
      adoptions: Number(monthlyCostForm.adoptions) || 0,
      notes: monthlyCostForm.notes || `${campaign.name} 성과`,
    }

    let err
    if (existingRow) {
      const { error } = await supabase.from('ad_performance').update(payload).eq('id', existingRow.id)
      err = error
    } else {
      const { error } = await supabase.from('ad_performance').insert(payload)
      err = error
    }

    if (err) {
      toast.error('저장 실패: ' + err.message)
    } else {
      toast.success(`${dateStr} 성과 등록 완료`)
      setShowMonthlyCostForm(false)
      fetchPerfData(campaign.id)
    }
    setSavingMonthlyCost(false)
  }

  // 월별 비용 등록 현황 (어떤 월이 이미 등록됐는지)
  const registeredCostMonths = useMemo(() => {
    const months = new Set<string>()
    perfData.forEach(d => {
      if (Number(d.cost) > 0) {
        const m = d.date.substring(0, 7) // YYYY-MM
        months.add(m)
      }
    })
    return months
  }, [perfData])

  // 월 비용 등록 + 성과 등록 패널
  function CampaignCostPanel({ campaign }: { campaign: Campaign }) {
    const inputCls = "w-full px-2 py-1.5 text-xs border border-border rounded-md focus:outline-none focus:ring-1 focus:ring-primary-300"
    const now = new Date()
    const months = Array.from({ length: 6 }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    })

    return (
      <div className="space-y-3">
        {/* 월 비용 등록 (월정액) */}
        {campaign.budget > 0 && (
          <div className="bg-white rounded-lg p-3 border border-border-light">
            <h4 className="text-xs font-semibold text-text-primary mb-2 flex items-center gap-1.5">
              <Wallet className="w-3.5 h-3.5 text-blue-500" />
              월 비용 등록
              <span className="text-[10px] font-normal text-text-tertiary ml-1">
                (월정액 {formatCurrency(campaign.budget)})
              </span>
            </h4>
            <div className="flex flex-wrap gap-1.5">
              {months.map(m => {
                const [y, mo] = m.split('-')
                const isRegistered = registeredCostMonths.has(m)
                return (
                  <button key={m}
                    onClick={() => !isRegistered && handleRegisterMonthlyCost(campaign, m)}
                    disabled={isRegistered || savingMonthlyCost}
                    className={`px-3 py-1.5 text-xs rounded-md transition-colors flex items-center gap-1 ${
                      isRegistered
                        ? 'bg-green-50 text-green-600 border border-green-200 cursor-default'
                        : 'bg-blue-50 text-blue-600 border border-blue-200 hover:bg-blue-100 cursor-pointer'
                    }`}>
                    {isRegistered ? '✓' : <PlusCircle className="w-3 h-3" />}
                    {parseInt(mo)}월
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {/* 일별 성과 등록 */}
        <div className="bg-white rounded-lg p-3 border border-border-light">
          <h4 className="text-xs font-semibold text-text-primary mb-2 flex items-center gap-1.5">
            <Target className="w-3.5 h-3.5 text-green-500" />
            성과 등록
            <span className="text-[10px] font-normal text-text-tertiary ml-1">
              (발생일에 문의/도입 기록)
            </span>
          </h4>
          <div className="flex flex-wrap items-end gap-2">
            <div className="w-[140px]">
              <DatePicker label="발생일" value={monthlyCostForm.date}
                onChange={v => setMonthlyCostForm(f => ({ ...f, date: v }))} />
            </div>
            <div className="w-[80px]">
              <label className="text-[10px] font-semibold text-text-secondary mb-0.5 block">GA유입</label>
              <input type="number" value={monthlyCostForm.ga_visits || ''}
                onChange={e => setMonthlyCostForm(f => ({ ...f, ga_visits: Number(e.target.value) }))}
                className={inputCls} placeholder="0" />
            </div>
            <div className="w-[80px]">
              <label className="text-[10px] font-semibold text-text-secondary mb-0.5 block">가입사</label>
              <input type="number" value={monthlyCostForm.signups || ''}
                onChange={e => setMonthlyCostForm(f => ({ ...f, signups: Number(e.target.value) }))}
                className={inputCls} placeholder="0" />
            </div>
            <div className="w-[80px]">
              <label className="text-[10px] font-semibold text-text-secondary mb-0.5 block">문의사</label>
              <input type="number" value={monthlyCostForm.inquiries || ''}
                onChange={e => setMonthlyCostForm(f => ({ ...f, inquiries: Number(e.target.value) }))}
                className={inputCls} placeholder="0" />
            </div>
            <div className="w-[80px]">
              <label className="text-[10px] font-semibold text-text-secondary mb-0.5 block">도입사</label>
              <input type="number" value={monthlyCostForm.adoptions || ''}
                onChange={e => setMonthlyCostForm(f => ({ ...f, adoptions: Number(e.target.value) }))}
                className={inputCls} placeholder="0" />
            </div>
            <div>
              <button onClick={() => handleSaveResult(campaign)}
                disabled={savingMonthlyCost}
                className="px-4 py-1.5 text-xs font-semibold text-white bg-primary-500 rounded-md hover:bg-primary-600 transition-colors disabled:opacity-50 flex items-center justify-center gap-1">
                <Save className="w-3 h-3" />
                {savingMonthlyCost ? '...' : '등록'}
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // 레이아웃 정의 v1: 채널별 그룹 표 (docs/design/레이아웃정의_v1.html §7 A안). 행 클릭 → 60vw 드로어에 성과·비용 등록
  const CH_ORDER = ['네이버', '구글', '메타', '외주 블로그', '콘텐츠', '이벤트', '기타']
  const CH_COLOR: Record<string, string> = { '네이버': 'var(--ds-ok)', '구글': 'var(--ds-info)', '메타': 'var(--ds-info)', '외주 블로그': 'var(--ds-warn)' }
  const statusTone = (s: string) => (s === '진행중' ? 'ok' : s === '준비' ? 'warn' : 'na') as 'ok' | 'warn' | 'na'
  const grouped = (() => {
    const m = new Map<string, Campaign[]>()
    for (const c of filtered) { const k = c.channel || '기타'; (m.get(k) || m.set(k, []).get(k)!).push(c) }
    const live = (c: Campaign) => (c.status === '진행중' ? 0 : c.status === '준비' ? 1 : 2)
    return Array.from(m.entries())
      .sort((x, y) => (CH_ORDER.indexOf(x[0]) + 1 || 99) - (CH_ORDER.indexOf(y[0]) + 1 || 99))
      .map(([ch, cs]) => ({ ch, cs: [...cs].sort((a, b) => live(a) - live(b) || (agg[b.id]?.cost || 0) - (agg[a.id]?.cost || 0)) }))
  })()
  const counts = (s: string) => (s === '전체' ? data.length : data.filter(d => d.status === s).length)
  const liveBudget = data.filter(d => d.status === '진행중').reduce((s, d) => s + (d.budget || 0), 0)
  const allCost = Object.values(agg).reduce((s, a) => s + a.cost, 0)
  const thisMonthCost = Object.values(agg).reduce((s, a) => s + a.month, 0)
  const selCampaign = data.find(c => c.id === expandedId) || null
  const toggleGroup = (ch: string) => setFolded(f => { const n = new Set(f); n.has(ch) ? n.delete(ch) : n.add(ch); return n })
  const n = (v: number) => (v ? v.toLocaleString() : '—')

  return (
    <div>
      <PageHeader title="캠페인 관리"
        kpis={[{ label: '캠페인', value: data.length }, { label: '진행', value: summaryStats.activeCount }, { label: '진행 중 월 예산', value: formatCurrency(liveBudget) }, { label: '이번 달 집행', value: formatCurrency(thisMonthCost) }, { label: '누적 집행', value: formatCurrency(allCost) }]}
        actions={<DsButton size="sm" variant="primary" onClick={openAdd} icon={<Plus className="w-3.5 h-3.5" />}>새 캠페인</DsButton>} />
      <Toolbar right={<DateRangePicker value={dateRange} onChange={setDateRange} />}>
        <Tabs value={statusFilter} onChange={setStatusFilter} options={['전체', '진행중', '준비', '중단', '종료'].map(s => ({ value: s, label: s, count: counts(s) }))} />
      </Toolbar>

      {loading ? <Skeleton rows={10} /> : filtered.length === 0 ? (
        <Empty text="캠페인이 없습니다" action={<DsButton size="sm" onClick={openAdd}>새 캠페인</DsButton>} />
      ) : (
        <div className="ds-wrap max-h-[calc(100vh-220px)]">
          <table className="ds-table is-clickable is-fixed">
            <colgroup>{[24, 8, 12, 9, 13, 10, 7, 6, 5, 6].map((w, i) => <col key={i} style={{ width: `${w}%` }} />)}</colgroup>
            <thead><tr><th>캠페인</th><th>상태</th><th>기간</th><th>월 예산</th><th title="이번 달 집행 ÷ 월 예산">이번 달 집행</th><th>누적 집행</th><th>클릭</th><th>문의</th><th>도입</th><th>문의당</th></tr></thead>
            <tbody>
              {(() => {
                const all = grouped.flatMap(x => x.cs)
                const s = (k: 'cost' | 'month' | 'clicks' | 'inq' | 'ad') => all.reduce((v, c) => v + (agg[c.id]?.[k] || 0), 0)
                const live = all.filter(c => c.status === '진행중')
                const inq = s('inq'), cost = s('cost')
                return (
                  <tr className="ds-sum top">
                    <td>전체 합계 <span className="text-ds-fg3 font-normal text-[11.5px] ml-1">{all.length}개</span></td>
                    <td className="c !font-normal text-ds-fg3 !text-[12px]">{live.length ? `진행 ${live.length}` : '—'}</td>
                    <td />
                    <td className="num">{n(live.reduce((v, c) => v + (c.budget || 0), 0))}</td>
                    <td className="num">{n(s('month'))}</td>
                    <td className="num">{n(cost)}</td>
                    <td className="num">{n(s('clicks'))}</td>
                    <td className="num">{n(inq)}</td>
                    <td className="num">{n(s('ad'))}</td>
                    <td className="num !font-normal text-ds-fg3">{inq ? Math.round(cost / inq / 10000).toLocaleString() + '만' : '—'}</td>
                  </tr>
                )
              })()}
              {grouped.map(({ ch, cs }) => {
                const g = CH_COLOR[ch] || 'var(--ds-na)'
                // 채널 머리 줄 = 그 채널의 합계 줄 (접어도 열마다 합계가 보이게, 10/21)
                const sum = (k: 'cost' | 'month' | 'clicks' | 'inq' | 'ad') => cs.reduce((s, c) => s + (agg[c.id]?.[k] || 0), 0)
                const liveN = cs.filter(c => c.status === '진행중').length
                const gBudget = cs.filter(c => c.status === '진행중').reduce((s, c) => s + (c.budget || 0), 0)
                const gCost = sum('cost'), gMonth = sum('month'), gInq = sum('inq')
                const isFolded = folded.has(ch)
                return (
                  <Fragment key={ch}>
                    <tr className="cursor-pointer select-none [&>td]:!h-[42px] [&>td]:!bg-ds-bg [&>td]:border-b [&>td]:border-ds-line [&>td]:text-[13.5px] [&>td]:font-semibold" onClick={() => toggleGroup(ch)} title={isFolded ? '펼치기' : '접기'}>
                      <td style={{ boxShadow: `inset 4px 0 0 ${g}`, paddingLeft: 12 }}>
                        <span className="inline-flex items-center gap-1.5">
                          <ChevronDown className={`w-4 h-4 text-ds-fg3 transition-transform ${isFolded ? '-rotate-90' : ''}`} />
                          {ch}<span className="text-ds-fg3 font-normal text-[11.5px] ml-1">{cs.length}개 · 진행 {liveN}</span>
                        </span>
                      </td>
                      <td className="c !font-normal text-ds-fg3 !text-[12px]">{liveN ? `진행 ${liveN}` : '—'}</td>
                      <td />{/* 기간 칸 자리 — 빠지면 합계가 한 칸씩 밀린다 */}
                      <td className="num">{n(gBudget)}</td>
                      <td className="num">{n(gMonth)}</td>
                      <td className="num">{n(gCost)}</td>
                      <td className="num">{n(sum('clicks'))}</td>
                      <td className="num">{n(gInq)}</td>
                      <td className="num">{n(sum('ad'))}</td>
                      <td className="num !font-normal text-ds-fg3">{gInq ? Math.round(gCost / gInq / 10000).toLocaleString() + '만' : '—'}</td>
                    </tr>
                    {!folded.has(ch) && cs.map(c => {
                      const a = agg[c.id] || { cost: 0, month: 0, clicks: 0, inq: 0, ad: 0 }
                      const off = c.status !== '진행중' && c.status !== '준비'
                      const pct = c.budget > 0 ? a.month / c.budget * 100 : null
                      return (
                        <tr key={c.id} className={`ds-row group ${expandedId === c.id ? 'is-active' : ''} ${off ? 'text-ds-fg3' : ''}`} onClick={() => toggleExpand(c.id)}>
                          <td className={off ? '' : 'font-medium'} style={{ boxShadow: `inset 4px 0 0 ${g}`, paddingLeft: 16 }} title={c.name}>
                            {c.name}
                            <span className="ml-2 inline-flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity align-middle">
                              <button onClick={e => { e.stopPropagation(); openEdit(c) }} className="icon-btn" title="수정"><Pencil className="w-3.5 h-3.5" /></button>
                              <button onClick={e => { e.stopPropagation(); handleDelete(c.id) }} className="icon-btn hover:!text-ds-bad" title="삭제"><Trash2 className="w-3.5 h-3.5" /></button>
                            </span>
                          </td>
                          <td className="c"><span className={off ? 'opacity-70' : ''}><StatusChip tone={statusTone(c.status)}>{c.status}</StatusChip></span></td>
                          <td className="c muted text-[12px]">{c.start_date ? `${c.start_date.slice(2).replace(/-/g, '.')} ~ ${c.end_date ? c.end_date.slice(2).replace(/-/g, '.') : ''}` : '—'}</td>
                          <td className="num">{c.budget ? c.budget.toLocaleString() : '—'}</td>
                          <td className="num">
                            {/* 막대 칸 44 고정 + 숫자 칸 오른쪽 정렬 — 숫자 길이와 상관없이 막대 위치 고정 */}
                            <span className="grid grid-cols-[44px_1fr] items-center gap-2">
                              <span className="block h-1 rounded-full bg-ds-line2 overflow-hidden" title={pct != null ? `월 예산의 ${Math.round(pct)}%` : '월 예산 없음'}>{pct != null && !off && <span className="block h-full rounded-full" style={{ width: `${Math.min(pct, 100)}%`, background: pct > 100 ? 'var(--ds-bad)' : pct > 90 ? 'var(--ds-warn)' : 'var(--ds-info)' }} />}</span>
                              <span>{n(a.month)}</span>
                            </span>
                          </td>
                          <td className="num font-medium">{n(a.cost)}</td>
                          <td className="num">{n(a.clicks)}</td>
                          <td className="num">{n(a.inq)}</td>
                          <td className="num">{n(a.ad)}</td>
                          <td className="num muted">{a.inq ? Math.round(a.cost / a.inq / 10000).toLocaleString() + '만' : '—'}</td>
                        </tr>
                      )
                    })}
                  </Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      <Drawer open={!!selCampaign} onClose={() => { setExpandedId(null); setPerfData([]) }} width="60vw"
        title={selCampaign ? <span className="inline-flex items-center gap-2">{selCampaign.name}<StatusChip tone={statusTone(selCampaign.status)}>{selCampaign.status}</StatusChip></span> : ''}
        meta={selCampaign ? `${selCampaign.channel}${selCampaign.ad_type ? ' · ' + selCampaign.ad_type : ''} · ${selCampaign.start_date || '—'} ~ ${selCampaign.end_date || ''}${selCampaign.daily_budget ? ' · 일 예산 ' + formatCurrency(selCampaign.daily_budget) : ''}${selCampaign.target_audience ? ' · 대상 ' + selCampaign.target_audience : ''}` : ''}
        footer={selCampaign ? <><DsButton size="sm" variant="danger" onClick={() => handleDelete(selCampaign.id)}>삭제</DsButton><span className="flex-1" /><DsButton size="sm" onClick={() => openEdit(selCampaign)}>수정</DsButton></> : undefined}>
        {selCampaign && (() => { const campaign = selCampaign; return (
                  <div>
                    {perfLoading ? (
                      <div className="p-6"><Loading /></div>
                    ) : perfData.length === 0 ? (
                      <div className="p-4 space-y-4">
                        <div className="text-center text-sm text-text-secondary mb-2">
                          선택 기간에 연결된 유입 성과 데이터가 없습니다.
                        </div>
                        <CampaignCostPanel campaign={campaign} />
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

                        {/* 비용/성과 등록 패널 */}
                        <CampaignCostPanel campaign={campaign} />

                        {/* Daily Performance Table */}
                        <div className="bg-white rounded-lg p-3">
                          <h4 className="text-xs font-semibold text-text-primary mb-2">일별 성과 ({perfData.length}건)</h4>
                          <div className="overflow-x-auto max-h-64 overflow-y-auto">
                            <table className="w-full text-xs">
                              <thead className="sticky top-0 bg-white">
                                <tr className="border-b border-border-light">
                                  <th className="text-left py-1.5 px-2 text-text-secondary font-medium w-[90px]">날짜</th>
                                  <th className="text-right py-1.5 px-2 text-text-secondary font-medium">비용</th>
                                  <th className="text-right py-1.5 px-2 text-text-secondary font-medium">노출</th>
                                  <th className="text-right py-1.5 px-2 text-text-secondary font-medium">클릭</th>
                                  <th className="text-right py-1.5 px-2 text-text-secondary font-medium">CTR</th>
                                  <th className="text-right py-1.5 px-2 text-text-secondary font-medium">GA유입</th>
                                  <th className="text-right py-1.5 px-2 text-text-secondary font-medium">문의클릭</th>
                                  <th className="text-right py-1.5 px-2 text-text-secondary font-medium">가입</th>
                                  <th className="text-right py-1.5 px-2 text-text-secondary font-medium">문의</th>
                                  <th className="text-right py-1.5 px-2 text-text-secondary font-medium">도입</th>
                                  <th className="text-center py-1.5 px-2 text-text-secondary font-medium w-[70px]">관리</th>
                                </tr>
                              </thead>
                              <tbody>
                                {perfData.map(d => {
                                  const ctr = d.impressions > 0 ? (d.clicks / d.impressions * 100) : 0
                                  const isOverBudget = campaign.daily_budget > 0 && Number(d.cost) > campaign.daily_budget
                                  return (
                                    <tr key={d.id} className={`border-b border-border-light/50 hover:bg-surface-secondary/50 cursor-pointer ${
                                      isOverBudget ? 'bg-red-50/50' : ''
                                    }`}
                                      onClick={() => {
                                        setMonthlyCostForm({
                                          date: d.date,
                                          cost: Number(d.cost),
                                          ga_visits: d.ga_visits || 0,
                                          inquiry_clicks: d.inquiry_clicks || 0,
                                          signups: d.signups || 0,
                                          inquiries: d.inquiries || 0,
                                          adoptions: d.adoptions || 0,
                                          notes: '',
                                        })
                                        setShowMonthlyCostForm(true)
                                      }}
                                      title="클릭하여 수정"
                                    >
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
                                      <td className="text-center py-1.5 px-1">
                                        <div className="flex items-center justify-center gap-0.5">
                                          <button
                                            onClick={(e) => {
                                              e.stopPropagation()
                                              setMonthlyCostForm({
                                                date: d.date,
                                                cost: Number(d.cost),
                                                ga_visits: d.ga_visits || 0,
                                                inquiry_clicks: d.inquiry_clicks || 0,
                                                signups: d.signups || 0,
                                                inquiries: d.inquiries || 0,
                                                adoptions: d.adoptions || 0,
                                                notes: '',
                                              })
                                              setShowMonthlyCostForm(true)
                                            }}
                                            className="p-1 rounded hover:bg-blue-50 text-blue-500 transition-colors"
                                            title="수정"
                                          >
                                            <Pencil className="w-3 h-3" />
                                          </button>
                                          <button
                                            onClick={(e) => {
                                              e.stopPropagation()
                                              handleDeletePerf(d.id, campaign.id)
                                            }}
                                            className="p-1 rounded hover:bg-red-50 text-red-500 transition-colors"
                                            title="삭제"
                                          >
                                            <Trash2 className="w-3 h-3" />
                                          </button>
                                        </div>
                                      </td>
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
        ) })()}
      </Drawer>

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
          <DatePicker label="시작일" value={form.start_date}
            onChange={v => setForm({ ...form, start_date: v })} />
          <DatePicker label="종료일" value={form.end_date}
            onChange={v => setForm({ ...form, end_date: v })} />
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
