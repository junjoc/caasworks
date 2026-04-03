'use client'

import { useEffect, useState, useMemo, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Select } from '@/components/ui/select'
import { Loading } from '@/components/ui/loading'
import { EmptyState } from '@/components/ui/empty-state'
import { formatCurrency, formatNumber } from '@/lib/utils'
import { Modal } from '@/components/ui/modal'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import {
  BarChart3, ArrowRight, ArrowUpRight, ArrowDownRight, Minus,
  TrendingUp, TrendingDown, Target, Wallet, Users, MessageSquare,
  Building2, Percent, Calendar, ChevronDown, ChevronUp, Pencil, Plus,
  Sparkles, ClipboardCopy
} from 'lucide-react'
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, ComposedChart, Area,
  Cell, ReferenceLine
} from 'recharts'

/* ─── Types ─── */
interface AdPerformance {
  id: string
  date: string
  ad_type: string
  channel: string
  campaign_name: string
  campaign_id: string | null
  impressions: number
  clicks: number
  cost: number
  signups: number
  inquiries: number
  adoptions: number
}

interface YearlySummary {
  id: string
  year: number
  month: number
  google_cost: number
  meta_cost: number
  naver_cost: number
  other_cost: number
  signups: number
  paid_inquiries: number
  viral_inquiries: number
  adoptions: number
  monthly_revenue: number
  ad_revenue_ratio: number
}

interface BudgetRow {
  id: string
  year: number
  month: number
  channel: string
  budget_amount: number
}

interface MonthlyRevenue {
  year: number
  month: number
  amount: number
}

type GroupBy = 'weekly' | 'monthly' | 'quarterly' | 'yearly'
type ViewTab = 'overview' | 'budget' | 'channel' | 'campaign' | 'yearly'

/* ─── Constants ─── */
const CHANNEL_COLORS: Record<string, string> = {
  '네이버': '#60CA21',
  '구글': '#1890ff',
  '메타': '#b145ff',
  '유튜브': '#FF6661',
  '블로그': '#06D6A6',
  '검색유입': '#FFA940',
  '자사채널': '#36CFC9',
  '기타': '#777777',
}

const CHART_COLORS = ['#1890ff', '#b145ff', '#60CA21', '#FF6661', '#FFA940', '#06D6A6', '#36CFC9', '#777']

// 유료광고 채널 (나머지는 바이럴/자연검색)
const PAID_CHANNELS = new Set(['네이버', '구글', '메타', '유튜브', '기타'])

const GROUP_OPTIONS = [
  { value: 'weekly', label: '주간' },
  { value: 'monthly', label: '월간' },
  { value: 'quarterly', label: '분기' },
  { value: 'yearly', label: '연도' },
]

const TAB_ITEMS: { key: ViewTab; label: string }[] = [
  { key: 'overview', label: '종합 현황' },
  { key: 'budget', label: '예산 vs 실집행' },
  { key: 'channel', label: '채널 분석' },
  { key: 'campaign', label: '캠페인 비교' },
  { key: 'yearly', label: '연간 종합' },
]

/* ─── Helpers ─── */
function getWeekLabel(dateStr: string) {
  const d = new Date(dateStr)
  const jan1 = new Date(d.getFullYear(), 0, 1)
  const diff = d.getTime() - jan1.getTime()
  const weekNum = Math.ceil((diff / 86400000 + jan1.getDay() + 1) / 7)
  return `${d.getFullYear()}-W${String(weekNum).padStart(2, '0')}`
}

function getGroupKey(dateStr: string, groupBy: GroupBy): string {
  const d = new Date(dateStr)
  switch (groupBy) {
    case 'weekly': return getWeekLabel(dateStr)
    case 'monthly': return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    case 'quarterly': return `${d.getFullYear()}-Q${Math.ceil((d.getMonth() + 1) / 3)}`
    case 'yearly': return String(d.getFullYear())
  }
}

function getGroupLabel(key: string, groupBy: GroupBy): string {
  switch (groupBy) {
    case 'weekly': return key
    case 'monthly': {
      const [y, m] = key.split('-')
      return `${y}년 ${parseInt(m)}월`
    }
    case 'quarterly': return key.replace('-', '년 ')
    case 'yearly': return key + '년'
  }
}

function shortCurrency(v: number): string {
  if (Math.abs(v) >= 100000000) return `${(v / 100000000).toFixed(1)}억`
  if (Math.abs(v) >= 10000) return `${(v / 10000).toFixed(0)}만`
  return String(v)
}

function pctChange(cur: number, prev: number): number | null {
  if (!prev || prev === 0) return null
  return ((cur - prev) / prev) * 100
}

/* ─── Main Component ─── */
export default function AnalyticsPage() {
  const [adData, setAdData] = useState<AdPerformance[]>([])
  const [yearlySummary, setYearlySummary] = useState<YearlySummary[]>([])
  const [budgets, setBudgets] = useState<BudgetRow[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<ViewTab>('overview')
  const [year, setYear] = useState(() => new Date().getFullYear())
  const groupBy: GroupBy = 'monthly'  // 내부적으로 월간 고정
  const [editMonth, setEditMonth] = useState<number | null>(null)
  const [editForm, setEditForm] = useState({
    google_cost: 0, meta_cost: 0, naver_cost: 0, other_cost: 0,
    signups: 0, paid_inquiries: 0, viral_inquiries: 0, adoptions: 0,
    monthly_revenue: 0,
  })
  const [savingYearly, setSavingYearly] = useState(false)
  const supabase = createClient()

  const currentYear = new Date().getFullYear()
  const yearOptions = Array.from({ length: 4 }, (_, i) => ({
    value: String(currentYear - i), label: `${currentYear - i}년`
  }))

  const startDate = `${year}-01-01`
  const endDate = `${year}-12-31`

  /* ─── Data Fetch ─── */
  const fetchData = useCallback(async () => {
    setLoading(true)

    // Fetch ad_performance in batches (can be >1000)
    let allAds: AdPerformance[] = []
    let from = 0
    const batchSize = 1000
    while (true) {
      const { data } = await supabase
        .from('ad_performance')
        .select('*')
        .gte('date', startDate)
        .lte('date', endDate)
        .order('date', { ascending: true })
        .range(from, from + batchSize - 1)
      if (!data || data.length === 0) break
      allAds = allAds.concat(data)
      if (data.length < batchSize) break
      from += batchSize
    }

    const [summaryResult, budgetResult] = await Promise.all([
      supabase
        .from('marketing_yearly_summary')
        .select('*')
        .eq('year', year)
        .order('month', { ascending: true }),
      supabase
        .from('marketing_budgets')
        .select('*')
        .eq('year', year)
        .order('month', { ascending: true }),
    ])

    setAdData(allAds)
    setYearlySummary(summaryResult.data || [])
    setBudgets(budgetResult.data || [])
    setLoading(false)
  }, [year])

  useEffect(() => { fetchData() }, [fetchData])

  /* ─── Yearly Summary Edit ─── */
  function openYearlyEdit(month: number) {
    // Find existing data from yearlySummary or auto-aggregated
    const existing = yearlySummary.find(s => s.month === month)
    if (existing) {
      setEditForm({
        google_cost: existing.google_cost,
        meta_cost: existing.meta_cost,
        naver_cost: existing.naver_cost,
        other_cost: existing.other_cost,
        signups: existing.signups,
        paid_inquiries: existing.paid_inquiries,
        viral_inquiries: existing.viral_inquiries,
        adoptions: existing.adoptions,
        monthly_revenue: existing.monthly_revenue,
      })
    } else {
      // Pre-fill from ad_performance auto-aggregation
      const monthAds = adData.filter(d => new Date(d.date).getMonth() + 1 === month)
      const gCost = monthAds.filter(d => d.channel === '구글').reduce((s, d) => s + Number(d.cost), 0)
      const mCost = monthAds.filter(d => d.channel === '메타').reduce((s, d) => s + Number(d.cost), 0)
      const nCost = monthAds.filter(d => d.channel === '네이버').reduce((s, d) => s + Number(d.cost), 0)
      const oCost = monthAds.filter(d => !['구글', '메타', '네이버'].includes(d.channel)).reduce((s, d) => s + Number(d.cost), 0)
      setEditForm({
        google_cost: Math.round(gCost),
        meta_cost: Math.round(mCost),
        naver_cost: Math.round(nCost),
        other_cost: Math.round(oCost),
        signups: monthAds.reduce((s, d) => s + (d.signups || 0), 0),
        paid_inquiries: monthAds.reduce((s, d) => s + (d.inquiries || 0), 0),
        viral_inquiries: 0,
        adoptions: monthAds.reduce((s, d) => s + (d.adoptions || 0), 0),
        monthly_revenue: 0,
      })
    }
    setEditMonth(month)
  }

  async function saveYearlySummary() {
    if (editMonth === null) return
    setSavingYearly(true)
    const totalAdCost = editForm.google_cost + editForm.meta_cost + editForm.naver_cost + editForm.other_cost
    const adRatio = editForm.monthly_revenue > 0
      ? Number((totalAdCost / editForm.monthly_revenue * 100).toFixed(1))
      : 0

    const payload: Record<string, any> = {
      year,
      month: editMonth,
      google_cost: editForm.google_cost,
      meta_cost: editForm.meta_cost,
      naver_cost: editForm.naver_cost,
      other_cost: editForm.other_cost,
      signups: editForm.signups,
      paid_inquiries: editForm.paid_inquiries,
      viral_inquiries: editForm.viral_inquiries,
      adoptions: editForm.adoptions,
      ad_revenue_ratio: adRatio,
    }
    // monthly_revenue 컬럼이 있는 경우에만 포함
    if (editForm.monthly_revenue > 0) {
      payload.monthly_revenue = editForm.monthly_revenue
    }

    const existing = yearlySummary.find(s => s.month === editMonth)
    let err
    if (existing) {
      const { error } = await supabase.from('marketing_yearly_summary').update(payload).eq('id', existing.id)
      err = error
    } else {
      const { error } = await supabase.from('marketing_yearly_summary').insert(payload)
      err = error
    }

    if (err) {
      toast.error('저장 실패: ' + err.message)
    } else {
      toast.success(`${editMonth}월 데이터 저장 완료`)
      setEditMonth(null)
      fetchData()
    }
    setSavingYearly(false)
  }

  /* ─── Computed: KPI Summary ─── */
  const kpi = useMemo(() => {
    const totalCost = adData.reduce((s, d) => s + Number(d.cost), 0)
    const totalBudget = budgets.reduce((s, b) => s + b.budget_amount, 0)
    const totalImpressions = adData.reduce((s, d) => s + d.impressions, 0)
    const totalClicks = adData.reduce((s, d) => s + d.clicks, 0)
    const totalSignups = adData.reduce((s, d) => s + d.signups, 0)
    const totalInquiries = adData.reduce((s, d) => s + d.inquiries, 0)
    const totalAdoptions = adData.reduce((s, d) => s + d.adoptions, 0)
    const totalResults = totalSignups + totalInquiries + totalAdoptions
    const cpa = totalResults > 0 ? Math.round(totalCost / totalResults) : 0
    const ctr = totalImpressions > 0 ? (totalClicks / totalImpressions * 100) : 0
    const executionRate = totalBudget > 0 ? (totalCost / totalBudget * 100) : 0

    return {
      totalCost, totalBudget, totalImpressions, totalClicks,
      totalSignups, totalInquiries, totalAdoptions, totalResults,
      cpa, ctr, executionRate,
    }
  }, [adData, budgets])

  /* ─── Computed: Monthly Aggregation ─── */
  const monthlyData = useMemo(() => {
    const months = Array.from({ length: 12 }, (_, i) => {
      const m = i + 1
      const monthAds = adData.filter(d => new Date(d.date).getMonth() + 1 === m)
      const monthBudgets = budgets.filter(b => b.month === m)

      const cost = monthAds.reduce((s, d) => s + Number(d.cost), 0)
      const budget = monthBudgets.reduce((s, b) => s + b.budget_amount, 0)
      const impressions = monthAds.reduce((s, d) => s + d.impressions, 0)
      const clicks = monthAds.reduce((s, d) => s + d.clicks, 0)
      const signups = monthAds.reduce((s, d) => s + d.signups, 0)
      const inquiries = monthAds.reduce((s, d) => s + d.inquiries, 0)
      const adoptions = monthAds.reduce((s, d) => s + d.adoptions, 0)

      // Channel breakdown
      const byChannel: Record<string, { cost: number; budget: number }> = {}
      monthAds.forEach(d => {
        if (!byChannel[d.channel]) byChannel[d.channel] = { cost: 0, budget: 0 }
        byChannel[d.channel].cost += Number(d.cost)
      })
      monthBudgets.forEach(b => {
        if (!byChannel[b.channel]) byChannel[b.channel] = { cost: 0, budget: 0 }
        byChannel[b.channel].budget += b.budget_amount
      })

      return {
        month: m,
        label: `${m}월`,
        cost, budget, impressions, clicks, signups, inquiries, adoptions,
        results: signups + inquiries + adoptions,
        ctr: impressions > 0 ? (clicks / impressions * 100) : 0,
        cpa: (signups + inquiries + adoptions) > 0 ? Math.round(cost / (signups + inquiries + adoptions)) : 0,
        executionRate: budget > 0 ? (cost / budget * 100) : 0,
        byChannel,
      }
    })
    return months
  }, [adData, budgets])

  /* ─── Computed: Channel Comparison ─── */
  const channelComparison = useMemo(() => {
    const byChannel: Record<string, {
      cost: number; budget: number; signups: number; inquiries: number;
      adoptions: number; clicks: number; impressions: number
    }> = {}

    adData.forEach(d => {
      if (!byChannel[d.channel]) byChannel[d.channel] = { cost: 0, budget: 0, signups: 0, inquiries: 0, adoptions: 0, clicks: 0, impressions: 0 }
      byChannel[d.channel].cost += Number(d.cost)
      byChannel[d.channel].signups += d.signups
      byChannel[d.channel].inquiries += d.inquiries
      byChannel[d.channel].adoptions += d.adoptions
      byChannel[d.channel].clicks += d.clicks
      byChannel[d.channel].impressions += d.impressions
    })

    budgets.forEach(b => {
      if (!byChannel[b.channel]) byChannel[b.channel] = { cost: 0, budget: 0, signups: 0, inquiries: 0, adoptions: 0, clicks: 0, impressions: 0 }
      byChannel[b.channel].budget += b.budget_amount
    })

    return Object.entries(byChannel)
      .map(([channel, vals]) => {
        const totalResults = vals.signups + vals.inquiries + vals.adoptions
        return {
          channel,
          ...vals,
          totalResults,
          cpa: totalResults > 0 ? Math.round(vals.cost / totalResults) : 0,
          ctr: vals.impressions > 0 ? (vals.clicks / vals.impressions * 100) : 0,
          executionRate: vals.budget > 0 ? (vals.cost / vals.budget * 100) : 0,
        }
      })
      .sort((a, b) => b.cost - a.cost)
  }, [adData, budgets])

  /* ─── Computed: Campaign Comparison ─── */
  const campaignComparison = useMemo(() => {
    const groups: Record<string, {
      name: string; channel: string; cost: number; impressions: number; clicks: number;
      signups: number; inquiries: number; adoptions: number
    }> = {}

    adData.forEach(d => {
      const key = d.campaign_id || d.campaign_name
      if (!groups[key]) groups[key] = { name: d.campaign_name, channel: d.channel, cost: 0, impressions: 0, clicks: 0, signups: 0, inquiries: 0, adoptions: 0 }
      groups[key].cost += Number(d.cost)
      groups[key].impressions += d.impressions
      groups[key].clicks += d.clicks
      groups[key].signups += d.signups
      groups[key].inquiries += d.inquiries
      groups[key].adoptions += d.adoptions
    })

    return Object.values(groups)
      .map(v => ({
        ...v,
        totalResults: v.signups + v.inquiries + v.adoptions,
        ctr: v.impressions > 0 ? (v.clicks / v.impressions * 100) : 0,
        cpa: (v.signups + v.inquiries + v.adoptions) > 0
          ? Math.round(v.cost / (v.signups + v.inquiries + v.adoptions)) : 0,
      }))
      .sort((a, b) => b.cost - a.cost)
  }, [adData])

  /* ─── Computed: Conversion Funnel ─── */
  const funnel = useMemo(() => {
    const totalImpressions = adData.reduce((s, d) => s + d.impressions, 0)
    const totalClicks = adData.reduce((s, d) => s + d.clicks, 0)
    const totalSignups = adData.reduce((s, d) => s + d.signups, 0)
    const totalInquiries = adData.reduce((s, d) => s + d.inquiries, 0)
    const totalAdoptions = adData.reduce((s, d) => s + d.adoptions, 0)

    const steps = [
      { label: '노출', value: totalImpressions, color: '#93c5fd' },
      { label: '클릭', value: totalClicks, color: '#60a5fa' },
      { label: '가입사', value: totalSignups, color: '#1890ff' },
      { label: '문의사', value: totalInquiries, color: '#b145ff' },
      { label: '도입사', value: totalAdoptions, color: '#60CA21' },
    ]

    const rates: string[] = []
    for (let i = 1; i < steps.length; i++) {
      const prev = steps[i - 1].value
      rates.push(prev > 0 ? (steps[i].value / prev * 100).toFixed(2) + '%' : '-')
    }

    return { steps, rates }
  }, [adData])

  /* ─── Computed: Yearly Summary Table ─── */
  // If marketing_yearly_summary has data, use it; otherwise auto-aggregate from ad_performance
  const yearlyTableData = useMemo(() => {
    if (yearlySummary.length > 0) {
      // Use pre-aggregated summary data
      const rows = yearlySummary.map((row, idx) => {
        const totalAdCost = row.google_cost + row.meta_cost + row.naver_cost + row.other_cost
        const totalInquiries = row.paid_inquiries + row.viral_inquiries
        const prev = idx > 0 ? yearlySummary[idx - 1] : null
        const prevTotal = prev ? (prev.google_cost + prev.meta_cost + prev.naver_cost + prev.other_cost) : 0
        const monthBudget = budgets.filter(b => b.month === row.month).reduce((s, b) => s + b.budget_amount, 0)
        return {
          month: row.month, googleCost: row.google_cost, metaCost: row.meta_cost,
          naverCost: row.naver_cost, otherCost: row.other_cost, totalAdCost,
          budget: monthBudget,
          executionRate: monthBudget > 0 ? (totalAdCost / monthBudget * 100) : 0,
          signups: row.signups, paidInquiries: row.paid_inquiries,
          viralInquiries: row.viral_inquiries, totalInquiries, adoptions: row.adoptions,
          revenue: row.monthly_revenue, adRatio: row.ad_revenue_ratio,
          costChange: prev && prevTotal > 0 ? ((totalAdCost - prevTotal) / prevTotal * 100) : null,
        }
      })
      const totals = rows.reduce((acc, r) => ({
        googleCost: acc.googleCost + r.googleCost, metaCost: acc.metaCost + r.metaCost,
        naverCost: acc.naverCost + r.naverCost, otherCost: acc.otherCost + r.otherCost,
        totalAdCost: acc.totalAdCost + r.totalAdCost, budget: acc.budget + r.budget,
        signups: acc.signups + r.signups, paidInquiries: acc.paidInquiries + r.paidInquiries,
        viralInquiries: acc.viralInquiries + r.viralInquiries,
        totalInquiries: acc.totalInquiries + r.totalInquiries, adoptions: acc.adoptions + r.adoptions,
        revenue: acc.revenue + r.revenue,
      }), { googleCost: 0, metaCost: 0, naverCost: 0, otherCost: 0, totalAdCost: 0, budget: 0, signups: 0, paidInquiries: 0, viralInquiries: 0, totalInquiries: 0, adoptions: 0, revenue: 0 })
      return { rows, totals }
    }

    // Auto-aggregate from ad_performance data
    if (adData.length === 0) return null

    const monthMap: Record<number, {
      googleCost: number; metaCost: number; naverCost: number; otherCost: number;
      signups: number; paidInquiries: number; viralInquiries: number; adoptions: number; impressions: number; clicks: number
    }> = {}

    adData.forEach(d => {
      const month = new Date(d.date).getMonth() + 1
      if (!monthMap[month]) monthMap[month] = { googleCost: 0, metaCost: 0, naverCost: 0, otherCost: 0, signups: 0, paidInquiries: 0, viralInquiries: 0, adoptions: 0, impressions: 0, clicks: 0 }
      const cost = Number(d.cost) || 0
      if (d.channel === '구글') monthMap[month].googleCost += cost
      else if (d.channel === '메타') monthMap[month].metaCost += cost
      else if (d.channel === '네이버') monthMap[month].naverCost += cost
      else monthMap[month].otherCost += cost
      monthMap[month].signups += d.signups || 0
      // 유료광고 채널이면 유료문의, 아니면 바이럴
      const isPaid = PAID_CHANNELS.has(d.channel)
      monthMap[month].paidInquiries += isPaid ? (d.inquiries || 0) : 0
      monthMap[month].viralInquiries += isPaid ? 0 : (d.inquiries || 0)
      monthMap[month].adoptions += d.adoptions || 0
      monthMap[month].impressions += d.impressions || 0
      monthMap[month].clicks += d.clicks || 0
    })

    const monthNums = Object.keys(monthMap).map(Number).sort((a, b) => a - b)
    let prevTotal = 0
    const rows = monthNums.map(month => {
      const d = monthMap[month]
      const totalAdCost = d.googleCost + d.metaCost + d.naverCost + d.otherCost
      const monthBudget = budgets.filter(b => b.month === month).reduce((s, b) => s + b.budget_amount, 0)
      const costChange = prevTotal > 0 ? ((totalAdCost - prevTotal) / prevTotal * 100) : null
      prevTotal = totalAdCost
      return {
        month,
        googleCost: d.googleCost, metaCost: d.metaCost,
        naverCost: d.naverCost, otherCost: d.otherCost, totalAdCost,
        budget: monthBudget,
        executionRate: monthBudget > 0 ? (totalAdCost / monthBudget * 100) : 0,
        signups: d.signups, paidInquiries: d.paidInquiries,
        viralInquiries: d.viralInquiries, totalInquiries: d.paidInquiries + d.viralInquiries,
        adoptions: d.adoptions,
        revenue: 0, adRatio: 0,
        costChange,
      }
    })
    const totals = rows.reduce((acc, r) => ({
      googleCost: acc.googleCost + r.googleCost, metaCost: acc.metaCost + r.metaCost,
      naverCost: acc.naverCost + r.naverCost, otherCost: acc.otherCost + r.otherCost,
      totalAdCost: acc.totalAdCost + r.totalAdCost, budget: acc.budget + r.budget,
      signups: acc.signups + r.signups, paidInquiries: acc.paidInquiries + r.paidInquiries,
      viralInquiries: acc.viralInquiries + r.viralInquiries,
      totalInquiries: acc.totalInquiries + r.totalInquiries, adoptions: acc.adoptions + r.adoptions,
      revenue: acc.revenue + r.revenue,
    }), { googleCost: 0, metaCost: 0, naverCost: 0, otherCost: 0, totalAdCost: 0, budget: 0, signups: 0, paidInquiries: 0, viralInquiries: 0, totalInquiries: 0, adoptions: 0, revenue: 0 })
    return { rows, totals }
  }, [yearlySummary, budgets, adData])

  /* ─── Computed: Channel Trend ─── */
  const channelTrendData = useMemo(() => {
    const channels = Array.from(new Set(adData.map(d => d.channel)))
    const groups: Record<string, Record<string, number>> = {}
    adData.forEach(d => {
      const key = getGroupKey(d.date, groupBy)
      if (!groups[key]) groups[key] = {}
      groups[key][d.channel] = (groups[key][d.channel] || 0) + Number(d.cost)
    })
    const sorted = Object.entries(groups).sort((a, b) => a[0].localeCompare(b[0]))
    return {
      channels,
      data: sorted.map(([key, vals]) => {
        const row: Record<string, string | number> = {
          name: groupBy === 'monthly' ? key.split('-')[1] + '월' : getGroupLabel(key, groupBy),
        }
        channels.forEach(ch => { row[ch] = vals[ch] || 0 })
        return row
      }),
    }
  }, [adData, groupBy])

  /* ─── Subcomponents ─── */
  function ChangeIcon({ value }: { value: number | null }) {
    if (value === null) return <Minus className="w-3 h-3 text-gray-400" />
    if (value > 0) return <ArrowUpRight className="w-3 h-3 text-red-500" />
    if (value < 0) return <ArrowDownRight className="w-3 h-3 text-green-500" />
    return <Minus className="w-3 h-3 text-gray-400" />
  }

  function KpiCard({ icon: Icon, label, value, sub, color = 'text-text-primary' }: {
    icon: React.ElementType; label: string; value: string; sub?: string; color?: string
  }) {
    return (
      <div className="stat-card">
        <div className="flex items-center gap-2 mb-1">
          <div className="p-1.5 rounded-md bg-primary-50">
            <Icon className="w-4 h-4 text-primary-500" />
          </div>
          <span className="stat-label">{label}</span>
        </div>
        <span className={`stat-value ${color}`}>{value}</span>
        {sub && <span className="text-micro text-text-tertiary">{sub}</span>}
      </div>
    )
  }

  /* ─── Budget Chart Data ─── */
  const budgetChartData = useMemo(() => {
    return monthlyData.map(m => ({
      name: m.label,
      예산: m.budget,
      실집행: m.cost,
      집행률: m.executionRate,
    }))
  }, [monthlyData])

  /* ─── Budget Channel Breakdown ─── */
  const budgetByChannelMonth = useMemo(() => {
    const allChannels = new Set<string>()
    monthlyData.forEach(m => {
      Object.keys(m.byChannel).forEach(ch => allChannels.add(ch))
    })
    return { channels: Array.from(allChannels).sort(), monthlyData }
  }, [monthlyData])

  /* ─── Performance Trend ─── */
  const performanceTrend = useMemo(() => {
    return monthlyData.map(m => ({
      name: m.label,
      비용: m.cost,
      가입사: m.signups,
      문의사: m.inquiries,
      도입사: m.adoptions,
      CPA: m.cpa,
    }))
  }, [monthlyData])

  const maxFunnel = Math.max(...funnel.steps.map(s => s.value), 1)

  /* ─── AI 분석용 프롬프트 생성 ─── */
  function generateAIPrompt(): string {
    const lines: string[] = []
    lines.push(`당신은 B2B SaaS 마케팅 데이터 분석 전문가입니다.`)
    lines.push(`아래는 ${year}년 마케팅 성과 데이터입니다. 이 데이터를 기반으로 분석과 인사이트를 제공해주세요.\n`)

    // KPI 요약
    lines.push(`## ${year}년 KPI 요약`)
    lines.push(`- 총 광고비: ${formatCurrency(kpi.totalCost)} (예산: ${formatCurrency(kpi.totalBudget)}, 집행률: ${kpi.executionRate.toFixed(1)}%)`)
    lines.push(`- 가입사: ${kpi.totalSignups}건, 문의사: ${kpi.totalInquiries}건, 도입사: ${kpi.totalAdoptions}건`)
    lines.push(`- CPA: ${kpi.cpa > 0 ? formatCurrency(kpi.cpa) : '-'}, CTR: ${kpi.ctr.toFixed(2)}%\n`)

    // 월별 데이터
    lines.push(`## 월별 상세 데이터`)
    lines.push(`| 월 | 광고비 | 예산 | 집행률 | 노출 | 클릭 | CTR | 가입 | 문의 | 도입 | CPA |`)
    lines.push(`|---|---|---|---|---|---|---|---|---|---|---|`)
    monthlyData.forEach(m => {
      lines.push(`| ${m.label} | ${formatCurrency(m.cost)} | ${formatCurrency(m.budget)} | ${m.executionRate.toFixed(0)}% | ${m.impressions.toLocaleString()} | ${m.clicks.toLocaleString()} | ${m.ctr.toFixed(2)}% | ${m.signups} | ${m.inquiries} | ${m.adoptions} | ${m.cpa > 0 ? formatCurrency(m.cpa) : '-'} |`)
    })
    lines.push('')

    // 채널별 데이터
    lines.push(`## 채널별 광고비`)
    const channelTotals: Record<string, number> = {}
    adData.forEach(d => {
      channelTotals[d.channel] = (channelTotals[d.channel] || 0) + Number(d.cost)
    })
    Object.entries(channelTotals).sort((a, b) => b[1] - a[1]).forEach(([ch, cost]) => {
      const pct = kpi.totalCost > 0 ? (cost / kpi.totalCost * 100).toFixed(1) : '0'
      lines.push(`- ${ch}: ${formatCurrency(cost)} (${pct}%)`)
    })
    lines.push('')

    // 채널별 성과
    lines.push(`## 채널별 전환 성과`)
    lines.push(`| 채널 | 광고비 | 가입 | 문의 | 도입 | CPA |`)
    lines.push(`|---|---|---|---|---|---|`)
    const chPerf: Record<string, { cost: number; signups: number; inquiries: number; adoptions: number }> = {}
    adData.forEach(d => {
      if (!chPerf[d.channel]) chPerf[d.channel] = { cost: 0, signups: 0, inquiries: 0, adoptions: 0 }
      chPerf[d.channel].cost += Number(d.cost)
      chPerf[d.channel].signups += d.signups || 0
      chPerf[d.channel].inquiries += d.inquiries || 0
      chPerf[d.channel].adoptions += d.adoptions || 0
    })
    Object.entries(chPerf).sort((a, b) => b[1].cost - a[1].cost).forEach(([ch, v]) => {
      const total = v.signups + v.inquiries + v.adoptions
      const cpa = total > 0 ? formatCurrency(Math.round(v.cost / total)) : '-'
      lines.push(`| ${ch} | ${formatCurrency(v.cost)} | ${v.signups} | ${v.inquiries} | ${v.adoptions} | ${cpa} |`)
    })
    lines.push('')

    // 연간종합이 있으면 유료/바이럴 구분도 추가
    if (yearlyTableData) {
      lines.push(`## 유료광고 vs 바이럴 문의`)
      lines.push(`| 월 | 유료광고 문의 | 바이럴 문의 | 합계 |`)
      lines.push(`|---|---|---|---|`)
      yearlyTableData.rows.forEach(r => {
        lines.push(`| ${r.month}월 | ${r.paidInquiries} | ${r.viralInquiries} | ${r.totalInquiries} |`)
      })
      lines.push(`| 합계 | ${yearlyTableData.totals.paidInquiries} | ${yearlyTableData.totals.viralInquiries} | ${yearlyTableData.totals.totalInquiries} |`)
      lines.push('')
    }

    lines.push(`---`)
    lines.push(`위 데이터를 기반으로 다음을 분석해주세요:`)
    lines.push(`1. 전체적인 마케팅 성과 평가`)
    lines.push(`2. 채널별 효율 비교 및 최적의 채널 추천`)
    lines.push(`3. 월별 추이 분석 (성장세/하락세)`)
    lines.push(`4. CPA 개선 방안`)
    lines.push(`5. 예산 재배분 제안`)

    return lines.join('\n')
  }

  async function handleCopyAIPrompt() {
    const prompt = generateAIPrompt()
    try {
      await navigator.clipboard.writeText(prompt)
      toast.success('AI 분석 프롬프트가 클립보드에 복사되었습니다. Claude에 붙여넣기하세요!')
    } catch {
      toast.error('복사 실패')
    }
  }

  if (loading) return <div className="p-8"><Loading /></div>

  return (
    <div>
      {/* ─── Header ─── */}
      <div className="page-header">
        <div>
          <h1 className="page-title">마케팅 분석</h1>
          <p className="page-subtitle">{year}년 마케팅 성과 종합 대시보드</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleCopyAIPrompt}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg
                       bg-gradient-to-r from-violet-500 to-purple-600 text-white
                       hover:from-violet-600 hover:to-purple-700 transition-all shadow-sm"
            title="현재 데이터를 AI 분석용 프롬프트로 복사합니다"
          >
            <Sparkles className="w-3.5 h-3.5" />
            AI 분석 복사
          </button>
          <Select
            options={yearOptions}
            value={String(year)}
            onChange={e => setYear(Number(e.target.value))}
            className="!w-28"
          />
        </div>
      </div>

      {/* ─── KPI Cards ─── */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
        <KpiCard icon={Wallet} label="총 광고비" value={shortCurrency(kpi.totalCost)}
          sub={kpi.totalBudget > 0 ? `예산 ${shortCurrency(kpi.totalBudget)}` : undefined} />
        <KpiCard icon={Target} label="예산 집행률" value={kpi.executionRate > 0 ? `${kpi.executionRate.toFixed(1)}%` : '-'}
          sub={kpi.totalBudget > 0 ? `${shortCurrency(kpi.totalCost)} / ${shortCurrency(kpi.totalBudget)}` : '예산 미설정'}
          color={kpi.executionRate > 100 ? 'text-red-500' : kpi.executionRate > 80 ? 'text-orange-500' : 'text-text-primary'} />
        <KpiCard icon={Users} label="가입사" value={formatNumber(kpi.totalSignups)} />
        <KpiCard icon={MessageSquare} label="문의사" value={formatNumber(kpi.totalInquiries)} />
        <KpiCard icon={Building2} label="도입사" value={formatNumber(kpi.totalAdoptions)}
          color="text-green-600" />
        <KpiCard icon={TrendingUp} label="CPA" value={kpi.cpa > 0 ? shortCurrency(kpi.cpa) : '-'}
          sub={`CTR ${kpi.ctr.toFixed(2)}%`} />
      </div>

      {/* ─── Tab Navigation ─── */}
      <div className="tab-nav mb-6">
        {TAB_ITEMS.map(tab => (
          <button key={tab.key}
            className={`tab-item ${activeTab === tab.key ? 'tab-item-active' : ''}`}
            onClick={() => setActiveTab(tab.key)}>
            {tab.label}
          </button>
        ))}
      </div>

      {/* ═══ TAB: 종합 현황 ═══ */}
      {activeTab === 'overview' && (
        <>
          {adData.length === 0 ? (
            <EmptyState icon={BarChart3} title="해당 연도 광고 데이터가 없습니다"
              description="광고 성과 페이지에서 데이터를 입력하세요" />
          ) : (
            <>
              {/* 월별 비용 + 성과 추이 */}
              <div className="grid lg:grid-cols-2 gap-6 mb-6">
                <div className="card p-5">
                  <h3 className="text-sm font-semibold text-text-primary mb-4">월별 광고비 추이</h3>
                  <ResponsiveContainer width="100%" height={280}>
                    <ComposedChart data={budgetChartData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                      <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} tickFormatter={v => shortCurrency(v)} />
                      <Tooltip formatter={(value: number, name: string) =>
                        name === '집행률' ? `${(value as number).toFixed(1)}%` : formatCurrency(value)
                      } />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      <Bar dataKey="예산" fill="#e5e7eb" radius={[2, 2, 0, 0]} />
                      <Bar dataKey="실집행" fill="#1890ff" radius={[2, 2, 0, 0]} />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>

                <div className="card p-5">
                  <h3 className="text-sm font-semibold text-text-primary mb-4">월별 성과 추이</h3>
                  <ResponsiveContainer width="100%" height={280}>
                    <ComposedChart data={performanceTrend}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                      <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                      <YAxis yAxisId="left" tick={{ fontSize: 11 }} />
                      <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11 }}
                        tickFormatter={v => shortCurrency(v)} />
                      <Tooltip formatter={(value: number, name: string) =>
                        name === 'CPA' ? formatCurrency(value) : formatNumber(value)
                      } />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      <Bar yAxisId="left" dataKey="가입사" fill="#1890ff" radius={[2, 2, 0, 0]} />
                      <Bar yAxisId="left" dataKey="문의사" fill="#b145ff" radius={[2, 2, 0, 0]} />
                      <Bar yAxisId="left" dataKey="도입사" fill="#60CA21" radius={[2, 2, 0, 0]} />
                      <Line yAxisId="right" type="monotone" dataKey="CPA" stroke="#FF6661"
                        strokeWidth={2} dot={{ r: 3 }} />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* 전환 퍼널 */}
              <div className="card p-5 mb-6">
                <h3 className="text-sm font-semibold text-text-primary mb-4">
                  전환 퍼널
                  <span className="ml-2 text-xs font-normal text-text-secondary">
                    (총 광고비: {formatCurrency(kpi.totalCost)})
                  </span>
                </h3>
                <div className="space-y-2">
                  {funnel.steps.map((step, i) => (
                    <div key={step.label} className="flex items-center gap-3">
                      <span className="text-xs text-text-secondary w-12 text-right font-medium">{step.label}</span>
                      <div className="flex-1 bg-gray-100 rounded-full h-8 relative overflow-hidden">
                        <div className="h-8 rounded-full transition-all flex items-center px-3"
                          style={{
                            width: `${Math.max((step.value / maxFunnel) * 100, 6)}%`,
                            backgroundColor: step.color,
                          }}>
                          <span className="text-xs text-white font-bold">{formatNumber(step.value)}</span>
                        </div>
                      </div>
                      {i < funnel.rates.length && (
                        <div className="flex items-center gap-1 w-20">
                          <ArrowRight className="w-3 h-3 text-gray-400" />
                          <span className="text-xs font-medium text-text-secondary">{funnel.rates[i]}</span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* 채널별 비용 트렌드 */}
              <div className="card p-5 mb-6">
                <h3 className="text-sm font-semibold text-text-primary mb-4">
                  월별 채널별 비용 추이
                </h3>
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={channelTrendData.data}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} tickFormatter={v => shortCurrency(v)} />
                    <Tooltip formatter={(value: number) => formatCurrency(value)} labelStyle={{ fontWeight: 600 }} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    {channelTrendData.channels.map(ch => (
                      <Line key={ch} type="monotone" dataKey={ch}
                        stroke={CHANNEL_COLORS[ch] || '#6B7280'}
                        strokeWidth={2} dot={{ r: 3 }} />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </>
          )}
        </>
      )}

      {/* ═══ TAB: 예산 vs 실집행 ═══ */}
      {activeTab === 'budget' && (
        <>
          {/* 월별 예산 vs 실집행 차트 */}
          <div className="card p-5 mb-6">
            <h3 className="text-sm font-semibold text-text-primary mb-4">월별 예산 vs 실집행</h3>
            <ResponsiveContainer width="100%" height={320}>
              <ComposedChart data={budgetChartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis yAxisId="left" tick={{ fontSize: 11 }} tickFormatter={v => shortCurrency(v)} />
                <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11 }}
                  tickFormatter={v => `${v}%`} domain={[0, 'auto']} />
                <Tooltip formatter={(value: number, name: string) =>
                  name === '집행률' ? `${(value as number).toFixed(1)}%` : formatCurrency(value)
                } />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar yAxisId="left" dataKey="예산" fill="#e5e7eb" radius={[2, 2, 0, 0]} />
                <Bar yAxisId="left" dataKey="실집행" fill="#1890ff" radius={[2, 2, 0, 0]} />
                <Line yAxisId="right" type="monotone" dataKey="집행률" stroke="#FF6661"
                  strokeWidth={2} dot={{ r: 4 }} />
                <ReferenceLine yAxisId="right" y={100} stroke="#ef4444" strokeDasharray="4 4" />
              </ComposedChart>
            </ResponsiveContainer>
          </div>

          {/* 채널별 예산 vs 실집행 요약 */}
          <div className="card p-5 mb-6">
            <h3 className="text-sm font-semibold text-text-primary mb-4">채널별 예산 집행 현황</h3>
            <div className="table-container">
              <table className="data-table text-xs">
                <thead>
                  <tr>
                    <th>채널</th>
                    <th className="text-right">연간 예산</th>
                    <th className="text-right">실집행</th>
                    <th className="text-right">잔액</th>
                    <th className="text-right">집행률</th>
                    <th className="w-32">진행 바</th>
                  </tr>
                </thead>
                <tbody>
                  {channelComparison.filter(c => c.budget > 0 || c.cost > 0).map(row => {
                    const remaining = row.budget - row.cost
                    const rate = row.executionRate
                    return (
                      <tr key={row.channel}>
                        <td>
                          <span className="flex items-center gap-2">
                            <span className="w-3 h-3 rounded-full" style={{ backgroundColor: CHANNEL_COLORS[row.channel] || '#6B7280' }} />
                            <span className="font-medium">{row.channel}</span>
                          </span>
                        </td>
                        <td className="text-right">{formatCurrency(row.budget)}</td>
                        <td className="text-right font-medium">{formatCurrency(row.cost)}</td>
                        <td className={`text-right ${remaining < 0 ? 'text-red-500 font-medium' : ''}`}>
                          {formatCurrency(remaining)}
                        </td>
                        <td className="text-right">
                          <span className={rate > 100 ? 'text-red-500 font-bold' : rate > 80 ? 'text-orange-500 font-medium' : ''}>
                            {rate > 0 ? `${rate.toFixed(1)}%` : '-'}
                          </span>
                        </td>
                        <td>
                          <div className="w-full bg-gray-100 rounded-full h-2">
                            <div className="h-2 rounded-full transition-all"
                              style={{
                                width: `${Math.min(rate, 100)}%`,
                                backgroundColor: rate > 100 ? '#ef4444' : rate > 80 ? '#f59e0b' : '#1890ff'
                              }} />
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                  {/* Total */}
                  <tr className="bg-gray-50 font-bold border-t-2 border-gray-300">
                    <td>합계</td>
                    <td className="text-right">{formatCurrency(kpi.totalBudget)}</td>
                    <td className="text-right">{formatCurrency(kpi.totalCost)}</td>
                    <td className={`text-right ${(kpi.totalBudget - kpi.totalCost) < 0 ? 'text-red-500' : ''}`}>
                      {formatCurrency(kpi.totalBudget - kpi.totalCost)}
                    </td>
                    <td className="text-right">
                      {kpi.executionRate > 0 ? `${kpi.executionRate.toFixed(1)}%` : '-'}
                    </td>
                    <td>
                      <div className="w-full bg-gray-100 rounded-full h-2">
                        <div className="h-2 rounded-full transition-all"
                          style={{
                            width: `${Math.min(kpi.executionRate, 100)}%`,
                            backgroundColor: kpi.executionRate > 100 ? '#ef4444' : '#1890ff'
                          }} />
                      </div>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* 월별 상세 예산 실행 테이블 */}
          <div className="card p-5 mb-6">
            <h3 className="text-sm font-semibold text-text-primary mb-4">월별 예산 집행 상세</h3>
            <div className="table-container">
              <table className="data-table text-xs">
                <thead>
                  <tr>
                    <th>월</th>
                    <th className="text-right">예산</th>
                    <th className="text-right">실집행</th>
                    <th className="text-right">잔액</th>
                    <th className="text-right">집행률</th>
                    <th className="text-right">가입사</th>
                    <th className="text-right">문의사</th>
                    <th className="text-right">도입사</th>
                    <th className="text-right">CPA</th>
                  </tr>
                </thead>
                <tbody>
                  {monthlyData.map(m => {
                    const remaining = m.budget - m.cost
                    return (
                      <tr key={m.month}>
                        <td className="font-medium">{m.label}</td>
                        <td className="text-right">{m.budget > 0 ? formatCurrency(m.budget) : '-'}</td>
                        <td className="text-right font-medium">{m.cost > 0 ? formatCurrency(m.cost) : '-'}</td>
                        <td className={`text-right ${remaining < 0 ? 'text-red-500' : ''}`}>
                          {m.budget > 0 ? formatCurrency(remaining) : '-'}
                        </td>
                        <td className="text-right">
                          <span className={m.executionRate > 100 ? 'text-red-500 font-bold' : m.executionRate > 80 ? 'text-orange-500' : ''}>
                            {m.executionRate > 0 ? `${m.executionRate.toFixed(1)}%` : '-'}
                          </span>
                        </td>
                        <td className="text-right text-blue-600">{m.signups || '-'}</td>
                        <td className="text-right text-purple-600">{m.inquiries || '-'}</td>
                        <td className="text-right text-green-600">{m.adoptions || '-'}</td>
                        <td className="text-right">{m.cpa > 0 ? formatCurrency(m.cpa) : '-'}</td>
                      </tr>
                    )
                  })}
                  <tr className="bg-gray-50 font-bold border-t-2 border-gray-300">
                    <td>합계</td>
                    <td className="text-right">{formatCurrency(kpi.totalBudget)}</td>
                    <td className="text-right">{formatCurrency(kpi.totalCost)}</td>
                    <td className={`text-right ${(kpi.totalBudget - kpi.totalCost) < 0 ? 'text-red-500' : ''}`}>
                      {kpi.totalBudget > 0 ? formatCurrency(kpi.totalBudget - kpi.totalCost) : '-'}
                    </td>
                    <td className="text-right">{kpi.executionRate > 0 ? `${kpi.executionRate.toFixed(1)}%` : '-'}</td>
                    <td className="text-right text-blue-600">{kpi.totalSignups}</td>
                    <td className="text-right text-purple-600">{kpi.totalInquiries}</td>
                    <td className="text-right text-green-600">{kpi.totalAdoptions}</td>
                    <td className="text-right">{kpi.cpa > 0 ? formatCurrency(kpi.cpa) : '-'}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* ═══ TAB: 채널 분석 ═══ */}
      {activeTab === 'channel' && (
        <>
          {adData.length === 0 ? (
            <EmptyState icon={BarChart3} title="해당 연도 광고 데이터가 없습니다"
              description="광고 성과 페이지에서 데이터를 입력하세요" />
          ) : (
            <>
              {/* 채널별 비용 vs 성과 테이블 */}
              <div className="card p-5 mb-6">
                <h3 className="text-sm font-semibold text-text-primary mb-4">채널별 비용 vs 성과</h3>
                <div className="table-container">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>채널</th>
                        <th className="text-right">예산</th>
                        <th className="text-right">실집행</th>
                        <th className="text-right">집행률</th>
                        <th className="text-right">클릭수</th>
                        <th className="text-right">CTR</th>
                        <th className="text-right">가입사</th>
                        <th className="text-right">문의사</th>
                        <th className="text-right">도입사</th>
                        <th className="text-right">CPA</th>
                      </tr>
                    </thead>
                    <tbody>
                      {channelComparison.map(row => (
                        <tr key={row.channel}>
                          <td>
                            <span className="flex items-center gap-2">
                              <span className="w-3 h-3 rounded-full" style={{ backgroundColor: CHANNEL_COLORS[row.channel] || '#6B7280' }} />
                              <span className="font-medium">{row.channel}</span>
                            </span>
                          </td>
                          <td className="text-right">{row.budget > 0 ? formatCurrency(row.budget) : '-'}</td>
                          <td className="text-right font-medium">{formatCurrency(row.cost)}</td>
                          <td className="text-right">
                            <span className={row.executionRate > 100 ? 'text-red-500 font-medium' : ''}>
                              {row.executionRate > 0 ? `${row.executionRate.toFixed(1)}%` : '-'}
                            </span>
                          </td>
                          <td className="text-right">{formatNumber(row.clicks)}</td>
                          <td className="text-right">{row.ctr.toFixed(2)}%</td>
                          <td className="text-right text-blue-600 font-medium">{row.signups}</td>
                          <td className="text-right text-purple-600 font-medium">{row.inquiries}</td>
                          <td className="text-right text-green-600 font-medium">{row.adoptions}</td>
                          <td className="text-right">{row.cpa > 0 ? formatCurrency(row.cpa) : '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* 채널별 비용 + 비교 차트 */}
              <div className="grid lg:grid-cols-2 gap-6 mb-6">
                <div className="card p-5">
                  <h3 className="text-sm font-semibold text-text-primary mb-4">채널별 비용 비교</h3>
                  <ResponsiveContainer width="100%" height={280}>
                    <BarChart data={channelComparison} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                      <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={v => shortCurrency(v)} />
                      <YAxis dataKey="channel" type="category" tick={{ fontSize: 11 }} width={60} />
                      <Tooltip formatter={(value: number) => formatCurrency(value)} />
                      <Bar dataKey="cost" name="비용" radius={[0, 4, 4, 0]}>
                        {channelComparison.map((entry, i) => (
                          <Cell key={i} fill={CHANNEL_COLORS[entry.channel] || '#6B7280'} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                <div className="card p-5">
                  <h3 className="text-sm font-semibold text-text-primary mb-4">채널별 CPA 비교</h3>
                  <ResponsiveContainer width="100%" height={280}>
                    <BarChart data={channelComparison.filter(c => c.cpa > 0)} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                      <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={v => shortCurrency(v)} />
                      <YAxis dataKey="channel" type="category" tick={{ fontSize: 11 }} width={60} />
                      <Tooltip formatter={(value: number) => formatCurrency(value)} />
                      <Bar dataKey="cpa" name="CPA" radius={[0, 4, 4, 0]}>
                        {channelComparison.filter(c => c.cpa > 0).map((entry, i) => (
                          <Cell key={i} fill={CHANNEL_COLORS[entry.channel] || '#6B7280'} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* 채널별 비용 트렌드 */}
              <div className="card p-5 mb-6">
                <h3 className="text-sm font-semibold text-text-primary mb-4">
                  월별 채널별 비용 추이
                </h3>
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={channelTrendData.data}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} tickFormatter={v => shortCurrency(v)} />
                    <Tooltip formatter={(value: number) => formatCurrency(value)} labelStyle={{ fontWeight: 600 }} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    {channelTrendData.channels.map(ch => (
                      <Line key={ch} type="monotone" dataKey={ch}
                        stroke={CHANNEL_COLORS[ch] || '#6B7280'}
                        strokeWidth={2} dot={{ r: 3 }} />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </>
          )}
        </>
      )}

      {/* ═══ TAB: 캠페인 비교 ═══ */}
      {activeTab === 'campaign' && (
        <>
          {campaignComparison.length === 0 ? (
            <EmptyState icon={BarChart3} title="해당 연도 캠페인 데이터가 없습니다"
              description="광고 성과 페이지에서 데이터를 입력하세요" />
          ) : (
            <>
              <div className="card p-5 mb-6">
                <h3 className="text-sm font-semibold text-text-primary mb-4">
                  캠페인별 성과 비교
                  <span className="ml-2 text-xs font-normal text-text-secondary">
                    (총 {campaignComparison.length}개 캠페인)
                  </span>
                </h3>
                <div className="table-container">
                  <table className="data-table text-xs">
                    <thead>
                      <tr>
                        <th>캠페인</th>
                        <th>채널</th>
                        <th className="text-right">비용</th>
                        <th className="text-right">노출</th>
                        <th className="text-right">클릭</th>
                        <th className="text-right">CTR</th>
                        <th className="text-right">가입</th>
                        <th className="text-right">문의</th>
                        <th className="text-right">도입</th>
                        <th className="text-right">결과합계</th>
                        <th className="text-right">CPA</th>
                      </tr>
                    </thead>
                    <tbody>
                      {campaignComparison.map((c, i) => (
                        <tr key={i}>
                          <td className="font-medium max-w-[200px] truncate" title={c.name}>{c.name}</td>
                          <td>
                            <span className="inline-flex items-center gap-1">
                              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: CHANNEL_COLORS[c.channel] || '#6B7280' }} />
                              <span className="text-text-secondary">{c.channel}</span>
                            </span>
                          </td>
                          <td className="text-right font-medium">{formatCurrency(c.cost)}</td>
                          <td className="text-right">{formatNumber(c.impressions)}</td>
                          <td className="text-right">{formatNumber(c.clicks)}</td>
                          <td className="text-right">{c.ctr.toFixed(2)}%</td>
                          <td className="text-right text-blue-600">{c.signups || '-'}</td>
                          <td className="text-right text-purple-600">{c.inquiries || '-'}</td>
                          <td className="text-right text-green-600">{c.adoptions || '-'}</td>
                          <td className="text-right font-medium">{c.totalResults || '-'}</td>
                          <td className="text-right">{c.cpa > 0 ? formatCurrency(c.cpa) : '-'}</td>
                        </tr>
                      ))}
                      <tr className="bg-gray-50 font-bold border-t-2 border-gray-300">
                        <td>합계</td>
                        <td />
                        <td className="text-right">{formatCurrency(campaignComparison.reduce((s, c) => s + c.cost, 0))}</td>
                        <td className="text-right">{formatNumber(campaignComparison.reduce((s, c) => s + c.impressions, 0))}</td>
                        <td className="text-right">{formatNumber(campaignComparison.reduce((s, c) => s + c.clicks, 0))}</td>
                        <td className="text-right">
                          {(() => {
                            const ti = campaignComparison.reduce((s, c) => s + c.impressions, 0)
                            const tc = campaignComparison.reduce((s, c) => s + c.clicks, 0)
                            return ti > 0 ? (tc / ti * 100).toFixed(2) + '%' : '-'
                          })()}
                        </td>
                        <td className="text-right text-blue-600">{campaignComparison.reduce((s, c) => s + c.signups, 0)}</td>
                        <td className="text-right text-purple-600">{campaignComparison.reduce((s, c) => s + c.inquiries, 0)}</td>
                        <td className="text-right text-green-600">{campaignComparison.reduce((s, c) => s + c.adoptions, 0)}</td>
                        <td className="text-right">{campaignComparison.reduce((s, c) => s + c.totalResults, 0)}</td>
                        <td />
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Top 10 캠페인 비용 차트 */}
              <div className="card p-5 mb-6">
                <h3 className="text-sm font-semibold text-text-primary mb-4">TOP 10 캠페인 비용</h3>
                <ResponsiveContainer width="100%" height={Math.max(300, Math.min(campaignComparison.length, 10) * 36)}>
                  <BarChart data={campaignComparison.slice(0, 10)} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={v => shortCurrency(v)} />
                    <YAxis dataKey="name" type="category" tick={{ fontSize: 10 }} width={140}
                      tickFormatter={(v: string) => v.length > 20 ? v.substring(0, 20) + '...' : v} />
                    <Tooltip formatter={(value: number) => formatCurrency(value)} />
                    <Bar dataKey="cost" name="비용" fill="#1890ff" radius={[0, 4, 4, 0]}>
                      {campaignComparison.slice(0, 10).map((entry, i) => (
                        <Cell key={i} fill={CHANNEL_COLORS[entry.channel] || '#1890ff'} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </>
          )}
        </>
      )}

      {/* ═══ TAB: 연간 종합 ═══ */}
      {activeTab === 'yearly' && (
        <>
          {yearlyTableData ? (
            <div className="card p-5 mb-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold text-text-primary">{year}년 마케팅 연간 현황</h3>
                <div className="flex items-center gap-2">
                  {/* 데이터 없는 월 추가 버튼 */}
                  {(() => {
                    const existingMonths = new Set(yearlyTableData.rows.map(r => r.month))
                    const missingMonths = Array.from({ length: 12 }, (_, i) => i + 1).filter(m => !existingMonths.has(m))
                    if (missingMonths.length === 0) return null
                    return (
                      <select
                        className="text-xs px-2 py-1.5 border border-border rounded-md bg-surface"
                        defaultValue=""
                        onChange={e => { if (e.target.value) openYearlyEdit(Number(e.target.value)); e.target.value = '' }}
                      >
                        <option value="" disabled>+ 월 추가</option>
                        {missingMonths.map(m => <option key={m} value={m}>{m}월</option>)}
                      </select>
                    )
                  })()}
                </div>
              </div>
              <div className="table-container">
                <table className="data-table text-xs">
                  <thead>
                    <tr>
                      <th className="w-[40px]"></th>
                      <th>월</th>
                      <th className="text-right">예산</th>
                      <th className="text-right">구글</th>
                      <th className="text-right">메타</th>
                      <th className="text-right">네이버</th>
                      <th className="text-right">기타</th>
                      <th className="text-right font-bold">전체 광고비</th>
                      <th className="text-right">집행률</th>
                      <th className="text-right">전월비</th>
                      <th className="text-right">가입사</th>
                      <th className="text-right">유료문의</th>
                      <th className="text-right">바이럴</th>
                      <th className="text-right">도입사</th>
                      <th className="text-right">매출</th>
                      <th className="text-right">광고비율</th>
                    </tr>
                  </thead>
                  <tbody>
                    {yearlyTableData.rows.map(row => (
                      <tr key={row.month} className="hover:bg-surface-secondary/50">
                        <td className="text-center">
                          <button onClick={() => openYearlyEdit(row.month)}
                            className="p-1 rounded hover:bg-blue-50 text-text-tertiary hover:text-blue-500 transition-colors"
                            title="수정">
                            <Pencil className="w-3 h-3" />
                          </button>
                        </td>
                        <td className="font-medium">{row.month}월</td>
                        <td className="text-right text-text-secondary">{row.budget > 0 ? formatCurrency(row.budget) : '-'}</td>
                        <td className="text-right">{formatCurrency(row.googleCost)}</td>
                        <td className="text-right">{formatCurrency(row.metaCost)}</td>
                        <td className="text-right">{formatCurrency(row.naverCost)}</td>
                        <td className="text-right">{formatCurrency(row.otherCost)}</td>
                        <td className="text-right font-bold">{formatCurrency(row.totalAdCost)}</td>
                        <td className="text-right">
                          <span className={row.executionRate > 100 ? 'text-red-500 font-medium' : row.executionRate > 80 ? 'text-orange-500' : ''}>
                            {row.executionRate > 0 ? `${row.executionRate.toFixed(0)}%` : '-'}
                          </span>
                        </td>
                        <td className="text-right">
                          <span className="inline-flex items-center gap-0.5">
                            <ChangeIcon value={row.costChange} />
                            {row.costChange !== null ? `${Math.abs(row.costChange).toFixed(0)}%` : '-'}
                          </span>
                        </td>
                        <td className="text-right text-blue-600">{row.signups}</td>
                        <td className="text-right text-purple-600">{row.paidInquiries}</td>
                        <td className="text-right text-purple-400">{row.viralInquiries}</td>
                        <td className="text-right text-green-600 font-medium">{row.adoptions}</td>
                        <td className="text-right font-medium">{formatCurrency(row.revenue)}</td>
                        <td className="text-right">
                          <span className={row.adRatio > 10 ? 'text-red-500 font-medium' : ''}>
                            {row.adRatio.toFixed(1)}%
                          </span>
                        </td>
                      </tr>
                    ))}
                    <tr className="bg-gray-50 font-bold border-t-2 border-gray-300">
                      <td></td>
                      <td>합계</td>
                      <td className="text-right">{formatCurrency(yearlyTableData.totals.budget)}</td>
                      <td className="text-right">{formatCurrency(yearlyTableData.totals.googleCost)}</td>
                      <td className="text-right">{formatCurrency(yearlyTableData.totals.metaCost)}</td>
                      <td className="text-right">{formatCurrency(yearlyTableData.totals.naverCost)}</td>
                      <td className="text-right">{formatCurrency(yearlyTableData.totals.otherCost)}</td>
                      <td className="text-right">{formatCurrency(yearlyTableData.totals.totalAdCost)}</td>
                      <td className="text-right">
                        {yearlyTableData.totals.budget > 0
                          ? `${(yearlyTableData.totals.totalAdCost / yearlyTableData.totals.budget * 100).toFixed(0)}%`
                          : '-'}
                      </td>
                      <td />
                      <td className="text-right text-blue-600">{yearlyTableData.totals.signups}</td>
                      <td className="text-right text-purple-600">{yearlyTableData.totals.paidInquiries}</td>
                      <td className="text-right text-purple-400">{yearlyTableData.totals.viralInquiries}</td>
                      <td className="text-right text-green-600">{yearlyTableData.totals.adoptions}</td>
                      <td className="text-right">{formatCurrency(yearlyTableData.totals.revenue)}</td>
                      <td className="text-right">
                        {yearlyTableData.totals.revenue > 0
                          ? (yearlyTableData.totals.totalAdCost / yearlyTableData.totals.revenue * 100).toFixed(1) + '%'
                          : '-'}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <EmptyState icon={Calendar} title={`${year}년 연간 현황 데이터가 없습니다`}
              description="월별 데이터를 직접 입력하세요"
              action={
                <Button size="sm" onClick={() => openYearlyEdit(1)}>
                  <Plus className="w-4 h-4 mr-1" /> 1월부터 입력 시작
                </Button>
              } />
          )}

          {/* 연간 현황 차트: 광고비 vs 매출 */}
          {yearlyTableData && (
            <div className="grid lg:grid-cols-2 gap-6 mb-6">
              <div className="card p-5">
                <h3 className="text-sm font-semibold text-text-primary mb-4">월별 광고비 vs 매출</h3>
                <ResponsiveContainer width="100%" height={280}>
                  <ComposedChart data={yearlyTableData.rows.map(r => ({
                    name: `${r.month}월`,
                    광고비: r.totalAdCost,
                    매출: r.revenue,
                    광고비율: r.adRatio,
                  }))}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                    <YAxis yAxisId="left" tick={{ fontSize: 11 }} tickFormatter={v => shortCurrency(v)} />
                    <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11 }}
                      tickFormatter={v => `${v}%`} />
                    <Tooltip formatter={(value: number, name: string) =>
                      name === '광고비율' ? `${(value as number).toFixed(1)}%` : formatCurrency(value)
                    } />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Bar yAxisId="left" dataKey="광고비" fill="#FF6661" radius={[2, 2, 0, 0]} />
                    <Bar yAxisId="left" dataKey="매출" fill="#60CA21" radius={[2, 2, 0, 0]} />
                    <Line yAxisId="right" type="monotone" dataKey="광고비율" stroke="#b145ff"
                      strokeWidth={2} dot={{ r: 3 }} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>

              <div className="card p-5">
                <h3 className="text-sm font-semibold text-text-primary mb-4">월별 전환 추이</h3>
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={yearlyTableData.rows.map(r => ({
                    name: `${r.month}월`,
                    가입사: r.signups,
                    유료문의: r.paidInquiries,
                    바이럴: r.viralInquiries,
                    도입사: r.adoptions,
                  }))}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Bar dataKey="가입사" stackId="a" fill="#1890ff" />
                    <Bar dataKey="유료문의" stackId="a" fill="#b145ff" />
                    <Bar dataKey="바이럴" stackId="a" fill="#d8b4fe" />
                    <Bar dataKey="도입사" fill="#60CA21" radius={[2, 2, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}
        </>
      )}

      {/* ═══ 연간종합 편집 모달 ═══ */}
      <Modal open={editMonth !== null} onClose={() => setEditMonth(null)}
        title={`${year}년 ${editMonth}월 데이터 편집`} size="lg">
        {editMonth !== null && (
          <>
            <div className="space-y-4">
              {/* 광고비 */}
              <div className="p-3 bg-blue-50/50 rounded-lg border border-blue-100">
                <p className="text-xs font-semibold text-blue-700 mb-2">채널별 광고비</p>
                <div className="grid grid-cols-4 gap-3">
                  {[
                    { key: 'google_cost', label: '구글' },
                    { key: 'meta_cost', label: '메타' },
                    { key: 'naver_cost', label: '네이버' },
                    { key: 'other_cost', label: '기타' },
                  ].map(f => (
                    <div key={f.key}>
                      <label className="text-[11px] font-medium text-text-secondary mb-1 block">{f.label}</label>
                      <input type="number" value={(editForm as any)[f.key] || ''}
                        onChange={e => setEditForm(prev => ({ ...prev, [f.key]: Number(e.target.value) }))}
                        className="w-full px-3 py-2 text-sm border border-border rounded-md" placeholder="0" />
                    </div>
                  ))}
                </div>
                <p className="text-[11px] text-text-tertiary mt-2">
                  합계: <strong className="text-text-primary">{formatCurrency(editForm.google_cost + editForm.meta_cost + editForm.naver_cost + editForm.other_cost)}</strong>
                </p>
              </div>

              {/* 전환 성과 */}
              <div className="p-3 bg-purple-50/50 rounded-lg border border-purple-100">
                <p className="text-xs font-semibold text-purple-700 mb-2">전환 성과</p>
                <div className="grid grid-cols-4 gap-3">
                  <div>
                    <label className="text-[11px] font-medium text-text-secondary mb-1 block">가입사</label>
                    <input type="number" value={editForm.signups || ''}
                      onChange={e => setEditForm(f => ({ ...f, signups: Number(e.target.value) }))}
                      className="w-full px-3 py-2 text-sm border border-border rounded-md" placeholder="0" />
                  </div>
                  <div>
                    <label className="text-[11px] font-medium text-text-secondary mb-1 block">유료광고 문의</label>
                    <input type="number" value={editForm.paid_inquiries || ''}
                      onChange={e => setEditForm(f => ({ ...f, paid_inquiries: Number(e.target.value) }))}
                      className="w-full px-3 py-2 text-sm border border-border rounded-md" placeholder="0" />
                    <p className="text-[9px] text-text-tertiary mt-0.5">네이버/구글/메타/유튜브</p>
                  </div>
                  <div>
                    <label className="text-[11px] font-medium text-text-secondary mb-1 block">바이럴 문의</label>
                    <input type="number" value={editForm.viral_inquiries || ''}
                      onChange={e => setEditForm(f => ({ ...f, viral_inquiries: Number(e.target.value) }))}
                      className="w-full px-3 py-2 text-sm border border-border rounded-md" placeholder="0" />
                    <p className="text-[9px] text-text-tertiary mt-0.5">자연검색/블로그/자사채널/AI</p>
                  </div>
                  <div>
                    <label className="text-[11px] font-medium text-text-secondary mb-1 block">도입사</label>
                    <input type="number" value={editForm.adoptions || ''}
                      onChange={e => setEditForm(f => ({ ...f, adoptions: Number(e.target.value) }))}
                      className="w-full px-3 py-2 text-sm border border-border rounded-md" placeholder="0" />
                  </div>
                </div>
              </div>

              {/* 매출 */}
              <div className="p-3 bg-green-50/50 rounded-lg border border-green-100">
                <p className="text-xs font-semibold text-green-700 mb-2">매출</p>
                <div className="grid grid-cols-4 gap-3">
                  <div className="col-span-2">
                    <label className="text-[11px] font-medium text-text-secondary mb-1 block">월 매출</label>
                    <input type="number" value={editForm.monthly_revenue || ''}
                      onChange={e => setEditForm(f => ({ ...f, monthly_revenue: Number(e.target.value) }))}
                      className="w-full px-3 py-2 text-sm border border-border rounded-md" placeholder="0" />
                  </div>
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-4 pt-3 border-t border-border-light">
              <Button variant="secondary" onClick={() => setEditMonth(null)}>취소</Button>
              <Button onClick={saveYearlySummary} loading={savingYearly}>저장</Button>
            </div>
          </>
        )}
      </Modal>
    </div>
  )
}
