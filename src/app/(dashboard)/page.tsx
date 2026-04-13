'use client'

import { useEffect, useState, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { formatCurrency, formatNumber, STAGE_COLORS } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Loading } from '@/components/ui/loading'
import Link from 'next/link'
import { useAuth } from '@/hooks/useAuth'
import {
  TrendingUp,
  TrendingDown,
  Users,
  GitBranch,
  FileText,
  AlertCircle,
  DollarSign,
  ArrowRight,
  ChevronRight,
  ChevronLeft,
  Calendar,
} from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from 'recharts'

interface DashboardData {
  monthlyRevenue: number
  prevMonthRevenue: number
  newLeadsCount: number
  convertedCount: number
  unpaidInvoices: number
  unpaidAmount: number
  pipelineByStage: { stage: string; count: number }[]
  recentLeads: { id: string; company_name: string; stage: string; created_at: string; quote_amount: number; assigned_name: string | null }[]
  recentConversions: { id: string; company_name: string; converted_at: string; quote_amount: number; deal_amount: number; assigned_name: string | null }[]
  salesByStage: { stage: string; count: number; amount: number }[]
  rawLeads: { id: string; stage: string; inquiry_date: string }[]
  quoteByLead: Record<string, { quote: number; accepted: number }>
  pendingItems: {
    unassignedLeads: number
    unpaidOver30: number
    openVocTickets: number
    expiringBilling: number
  }
  monthlyTrend: { month: string; revenue: number; prevRevenue: number }[]
  newCompanyRevenue: number
  actionDueLeads: { id: string; company_name: string; next_action: string | null; next_action_date: string; stage: string; assigned_to: string | null; assigned_name: string | null }[]
}

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [salesYear, setSalesYear] = useState(new Date().getFullYear())
  const [salesMonth, setSalesMonth] = useState<number | null>(null)
  const [showAllActions, setShowAllActions] = useState(false)
  // 카드별 월 오프셋 (0=이번달, -1=지난달, ...)
  const [revOffset, setRevOffset] = useState(0)
  const [leadOffset, setLeadOffset] = useState(0)
  const [convOffset, setConvOffset] = useState(0)
  const { user } = useAuth()
  const supabase = createClient()

  useEffect(() => {
    fetchDashboard()
  }, [])

  async function fetchDashboard() {
    try {
    const now = new Date()
    const year = now.getFullYear()
    const month = now.getMonth() + 1
    const prevMonth = month === 1 ? 12 : month - 1
    const prevYear = month === 1 ? year - 1 : year
    // 로컬 시간 기준 오늘 날짜 (toISOString은 UTC 반환하므로 사용 안 함)
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`

    const withTimeout = <T,>(promise: Promise<T>, ms = 8000): Promise<T> =>
      Promise.race([
        promise,
        new Promise<T>((_, reject) => setTimeout(() => reject(new Error('timeout')), ms))
      ])

    const [
      revenueRes,
      prevRevenueRes,
      leadsRes,
      convertedRes,
      invoicesRes,
      pipelineRes,
      recentRes,
      unassignedRes,
      vocRes,
      recentConvRes,
      quotationsRes,
      yearRevenueRes,
      prevYearRevenueRes,
      actionDueRes,
    ] = await withTimeout(Promise.all([
      supabase.from('monthly_revenues').select('amount').eq('year', year).eq('month', month).limit(5000),
      supabase.from('monthly_revenues').select('amount').eq('year', prevYear).eq('month', prevMonth).limit(5000),
      supabase.from('pipeline_leads').select('id', { count: 'exact' })
        .eq('inquiry_date', today),
      supabase.from('pipeline_leads').select('id', { count: 'exact' })
        .eq('stage', '도입완료')
        .gte('inquiry_date', `${year}-${String(month).padStart(2, '0')}-01`)
        .lt('inquiry_date', `${month === 12 ? year + 1 : year}-${String(month === 12 ? 1 : month + 1).padStart(2, '0')}-01`),
      supabase.from('invoices').select('total').in('status', ['sent', 'overdue']),
      supabase.from('pipeline_leads').select('id, stage, inquiry_date'),
      supabase.from('pipeline_leads')
        .select('id, company_name, stage, created_at, assigned_user:users!pipeline_leads_assigned_to_fkey(name)')
        .order('created_at', { ascending: false })
        .limit(6),
      supabase.from('pipeline_leads').select('id', { count: 'exact' }).is('assigned_to', null),
      supabase.from('voc_tickets').select('id', { count: 'exact' })
        .in('status', ['received', 'reviewing', 'in_progress']),
      supabase.from('pipeline_leads')
        .select('id, company_name, converted_at, assigned_user:users!pipeline_leads_assigned_to_fkey(name)')
        .eq('stage', '도입완료')
        .not('converted_at', 'is', null)
        .order('converted_at', { ascending: false })
        .limit(6),
      supabase.from('quotations')
        .select('lead_id, total_amount, status')
        .in('status', ['accepted', 'sent', 'draft']),
      // 올해/전년도 매출: placeholder (pagination으로 별도 fetch)
      Promise.resolve({ data: [] }),
      Promise.resolve({ data: [] }),
      // 오늘/기한초과 리드 (알림용)
      supabase.from('pipeline_leads')
        .select('id, company_name, next_action, next_action_date, stage, assigned_to, assigned_user:users!pipeline_leads_assigned_to_fkey(name)')
        .not('next_action_date', 'is', null)
        .lte('next_action_date', today)
        .not('stage', 'in', '("도입완료","이탈")')
        .order('next_action_date', { ascending: true })
        .limit(30),
    ]))

    // Paginated fetch for yearly revenue (bypasses Supabase 1000-row limit)
    const fetchAllRevenue = async (y: number) => {
      let all: any[] = []
      let from = 0
      while (true) {
        const { data } = await supabase.from('monthly_revenues').select('month, amount').eq('year', y).range(from, from + 999)
        if (!data || data.length === 0) break
        all = all.concat(data)
        if (data.length < 1000) break
        from += 1000
      }
      return all
    }
    const [yearRevenueAll, prevYearRevenueAll] = await Promise.all([
      fetchAllRevenue(year),
      fetchAllRevenue(year - 1),
    ])
    const monthlyRevenue = (revenueRes.data || []).reduce((sum: number, r: any) => sum + Number(r.amount), 0)
    const prevMonthRevenue = (prevRevenueRes.data || []).reduce((sum: number, r: any) => sum + Number(r.amount), 0)

    const stageCounts: Record<string, number> = {}
    ;(pipelineRes.data || []).forEach((l) => {
      stageCounts[l.stage] = (stageCounts[l.stage] || 0) + 1
    })
    const pipelineByStage = ['신규리드', '컨텍', '제안', '미팅', '도입직전', '도입완료'].map((stage) => ({
      stage,
      count: stageCounts[stage] || 0,
    }))

    const unpaidInvoiceData = invoicesRes.data || []

    // Build quote amount map by lead_id (최신/최대 견적 금액)
    const quoteByLead: Record<string, { quote: number; accepted: number }> = {}
    ;(quotationsRes.data || []).forEach((q: any) => {
      if (!q.lead_id) return
      if (!quoteByLead[q.lead_id]) quoteByLead[q.lead_id] = { quote: 0, accepted: 0 }
      const amt = Number(q.total_amount) || 0
      if (amt > quoteByLead[q.lead_id].quote) quoteByLead[q.lead_id].quote = amt
      if (q.status === 'accepted' && amt > quoteByLead[q.lead_id].accepted) quoteByLead[q.lead_id].accepted = amt
    })

    // Sales by stage (전체 리드의 견적 금액 합산)
    const salesByStageMap: Record<string, { count: number; amount: number }> = {}
    ;(pipelineRes.data || []).forEach((l: any) => {
      if (!salesByStageMap[l.stage]) salesByStageMap[l.stage] = { count: 0, amount: 0 }
      salesByStageMap[l.stage].count++
      salesByStageMap[l.stage].amount += quoteByLead[l.id]?.quote || 0
    })
    const salesByStage = ['신규리드', '컨텍', '제안', '미팅', '도입직전', '도입완료'].map(stage => ({
      stage,
      count: salesByStageMap[stage]?.count || 0,
      amount: salesByStageMap[stage]?.amount || 0,
    }))

    // 월별 매출 추이 (전년 대비)
    const yearByMonth: Record<number, number> = {}
    ;(yearRevenueAll).forEach((r: any) => {
      yearByMonth[r.month] = (yearByMonth[r.month] || 0) + Number(r.amount)
    })
    const prevYearByMonth: Record<number, number> = {}
    ;(prevYearRevenueAll).forEach((r: any) => {
      prevYearByMonth[r.month] = (prevYearByMonth[r.month] || 0) + Number(r.amount)
    })
    // 올해는 현재 월까지만, 전년도는 12개월 전체 표시
    const trendMonths = year === new Date().getFullYear() ? month : 12
    const monthlyTrend = Array.from({ length: trendMonths }, (_, i) => ({
      month: `${i + 1}월`,
      revenue: yearByMonth[i + 1] || 0,
      prevRevenue: prevYearByMonth[i + 1] || 0,
    }))

    // 이번 달 신규 회사 매출 기여
    const newCompanyRevenue = 0 // TODO: 신규 고객 매출 별도 계산

    setData({
      monthlyRevenue,
      prevMonthRevenue,
      newLeadsCount: leadsRes.count || 0,
      convertedCount: convertedRes.count || 0,
      unpaidInvoices: unpaidInvoiceData.length,
      unpaidAmount: unpaidInvoiceData.reduce((sum, inv) => sum + Number(inv.total), 0),
      pipelineByStage,
      salesByStage,
      rawLeads: (pipelineRes.data || []).map((l: any) => ({ id: l.id, stage: l.stage, inquiry_date: l.inquiry_date })),
      quoteByLead,
      recentLeads: (recentRes.data || []).map((l: any) => ({
        ...l,
        quote_amount: quoteByLead[l.id]?.quote || 0,
        assigned_name: l.assigned_user?.name || null,
      })),
      recentConversions: (recentConvRes.data || []).map((c: any) => ({
        ...c,
        quote_amount: quoteByLead[c.id]?.quote || 0,
        deal_amount: quoteByLead[c.id]?.accepted || 0,
        assigned_name: c.assigned_user?.name || null,
      })),
      pendingItems: {
        unassignedLeads: unassignedRes.count || 0,
        unpaidOver30: 0,
        openVocTickets: vocRes.count || 0,
        expiringBilling: 0,
      },
      monthlyTrend,
      newCompanyRevenue,
      actionDueLeads: (actionDueRes.data || []).map((l: any) => ({
        id: l.id,
        company_name: l.company_name,
        next_action: l.next_action,
        next_action_date: l.next_action_date,
        stage: l.stage,
        assigned_to: l.assigned_to || null,
        assigned_name: l.assigned_user?.name || null,
      })),
    })
    setLoading(false)
    } catch (err) {
      console.error('Dashboard fetch error:', err)
      setData({
        monthlyRevenue: 0, prevMonthRevenue: 0, newLeadsCount: 0, convertedCount: 0,
        unpaidInvoices: 0, unpaidAmount: 0, pipelineByStage: [], salesByStage: [], rawLeads: [], quoteByLead: {},
        recentLeads: [], recentConversions: [],
        pendingItems: { unassignedLeads: 0, unpaidOver30: 0, openVocTickets: 0, expiringBilling: 0 },
        monthlyTrend: [], newCompanyRevenue: 0, actionDueLeads: [],
      })
      setLoading(false)
    }
  }

  // 세일즈 현황: 연도/월 필터링 (hooks must be before early returns)
  const filteredSalesByStage = useMemo(() => {
    if (!data) return []
    const filtered = data.rawLeads.filter(l => {
      if (!l.inquiry_date) return false
      const y = parseInt(l.inquiry_date.substring(0, 4))
      const m = parseInt(l.inquiry_date.substring(5, 7))
      if (y !== salesYear) return false
      if (salesMonth !== null && m !== salesMonth) return false
      return true
    })
    const stageMap: Record<string, { count: number; amount: number }> = {}
    filtered.forEach(l => {
      if (!stageMap[l.stage]) stageMap[l.stage] = { count: 0, amount: 0 }
      stageMap[l.stage].count++
      stageMap[l.stage].amount += data.quoteByLead[l.id]?.quote || 0
    })
    return ['신규리드', '컨텍', '제안', '미팅', '도입직전', '도입완료'].map(stage => ({
      stage,
      count: stageMap[stage]?.count || 0,
      amount: stageMap[stage]?.amount || 0,
    }))
  }, [data, salesYear, salesMonth])

  const filteredSalesTotal = filteredSalesByStage.reduce((s, i) => s + i.count, 0)

  // 카드별 오프셋 월 계산 helper
  function offsetMonth(offset: number) {
    const now = new Date()
    const d = new Date(now.getFullYear(), now.getMonth() + offset, 1)
    return { year: d.getFullYear(), month: d.getMonth() + 1 }
  }
  function offsetLabel(offset: number) {
    if (offset === 0) return '이번 달'
    const { month } = offsetMonth(offset)
    return `${month}월`
  }

  // 매출 카드: 오프셋 월의 매출
  const revCard = useMemo(() => {
    if (!data) return { value: 0, label: '이번 달 매출', prev: 0 }
    const { month } = offsetMonth(revOffset)
    const cur = data.monthlyTrend.find(t => t.month === `${month}월`)
    const prevM = data.monthlyTrend.find(t => {
      const pm = month === 1 ? 12 : month - 1
      return t.month === `${pm}월`
    })
    return {
      value: revOffset === 0 ? data.monthlyRevenue : (cur?.revenue || 0),
      label: `${offsetLabel(revOffset)} 매출`,
      prev: revOffset === 0 ? data.prevMonthRevenue : (prevM?.revenue || 0),
    }
  }, [data, revOffset])

  // 신규리드 카드: 오프셋에 따라 오늘(0) 또는 해당 월
  const leadCard = useMemo(() => {
    if (!data) return { value: 0, label: '오늘 신규 리드' }
    if (leadOffset === 0) {
      return { value: data.newLeadsCount, label: '오늘 신규 리드' }
    }
    const { year, month } = offsetMonth(leadOffset)
    const prefix = `${year}-${String(month).padStart(2, '0')}`
    const count = data.rawLeads.filter(l => l.inquiry_date && l.inquiry_date.startsWith(prefix)).length
    return { value: count, label: `${month}월 신규 리드` }
  }, [data, leadOffset])

  // 도입전환 카드: 오프셋에 따라 해당 월
  const convCard = useMemo(() => {
    if (!data) return { value: 0, label: '이번 달 전환' }
    if (convOffset === 0) {
      return { value: data.convertedCount, label: '이번 달 전환' }
    }
    const { year, month } = offsetMonth(convOffset)
    const prefix = `${year}-${String(month).padStart(2, '0')}`
    const count = data.rawLeads.filter(l =>
      l.stage === '도입완료' &&
      l.inquiry_date && l.inquiry_date.startsWith(prefix)
    ).length
    return { value: count, label: `${month}월 전환` }
  }, [data, convOffset])

  if (loading) return <Loading />
  if (!data) return <Loading />

  const SHORT_STAGE: Record<string, string> = {
    '신규리드': '신규', '컨텍': '컨택', '제안': '제안', '미팅': '미팅',
    '도입직전': '직전', '도입완료': '도입', '이탈': '이탈',
  }

  const revenueChange = revCard.prev > 0
    ? ((revCard.value - revCard.prev) / revCard.prev * 100)
    : 0

  const pipelineTotal = data.pipelineByStage.reduce((sum, i) => sum + i.count, 0)

  const stageBarColors: Record<string, string> = {
    '신규리드': 'bg-status-blue',
    '컨텍': 'bg-status-purple',
    '미팅': 'bg-status-yellow',
    '제안': 'bg-orange-400',
    '도입직전': 'bg-status-green',
    '도입완료': 'bg-emerald-600',
  }

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        {/* 매출 카드 */}
        <div className="stat-card">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg flex items-center justify-center text-primary-600 bg-primary-50">
                <DollarSign className="w-4 h-4" />
              </div>
              <span className="stat-label">{revCard.label}</span>
            </div>
            <div className="flex items-center gap-0.5">
              <button onClick={() => setRevOffset(o => o - 1)} className="p-0.5 rounded hover:bg-surface-secondary text-text-tertiary hover:text-text-primary transition-colors">
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>
              <button onClick={() => setRevOffset(o => o + 1)} className="p-0.5 rounded hover:bg-surface-secondary text-text-tertiary hover:text-text-primary transition-colors" disabled={revOffset >= 0}>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
          <div className="stat-value">{formatCurrency(revCard.value)}</div>
          {revenueChange !== 0 && (
            <div className={revenueChange > 0 ? 'stat-change-up' : 'stat-change-down'}>
              {revenueChange > 0 ? (
                <><TrendingUp className="w-3 h-3" /> +{revenueChange.toFixed(1)}%</>
              ) : (
                <><TrendingDown className="w-3 h-3" /> {revenueChange.toFixed(1)}%</>
              )}
            </div>
          )}
        </div>

        {/* 신규 리드 카드 */}
        <div className="stat-card">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg flex items-center justify-center text-status-blue bg-status-blue-bg">
                <GitBranch className="w-4 h-4" />
              </div>
              <span className="stat-label">{leadCard.label}</span>
            </div>
            <div className="flex items-center gap-0.5">
              <button onClick={() => setLeadOffset(o => o - 1)} className="p-0.5 rounded hover:bg-surface-secondary text-text-tertiary hover:text-text-primary transition-colors">
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>
              <button onClick={() => setLeadOffset(o => o + 1)} className="p-0.5 rounded hover:bg-surface-secondary text-text-tertiary hover:text-text-primary transition-colors" disabled={leadOffset >= 0}>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
          <div className="stat-value">{formatNumber(leadCard.value)}건</div>
        </div>

        {/* 도입 전환 카드 */}
        <div className="stat-card">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg flex items-center justify-center text-status-green bg-status-green-bg">
                <Users className="w-4 h-4" />
              </div>
              <span className="stat-label">{convCard.label}</span>
            </div>
            <div className="flex items-center gap-0.5">
              <button onClick={() => setConvOffset(o => o - 1)} className="p-0.5 rounded hover:bg-surface-secondary text-text-tertiary hover:text-text-primary transition-colors">
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>
              <button onClick={() => setConvOffset(o => o + 1)} className="p-0.5 rounded hover:bg-surface-secondary text-text-tertiary hover:text-text-primary transition-colors" disabled={convOffset >= 0}>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
          <div className="stat-value">{formatNumber(convCard.value)}건</div>
        </div>

        {/* 미납 청구서 카드 */}
        <div className="stat-card">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center text-status-yellow bg-status-yellow-bg">
              <FileText className="w-4 h-4" />
            </div>
            <span className="stat-label">미납 청구서</span>
          </div>
          <div className="stat-value">{formatNumber(data.unpaidInvoices)}건</div>
          <p className="text-xs text-text-tertiary">{formatCurrency(data.unpaidAmount)}</p>
        </div>

        {/* 미처리 VoC 카드 */}
        <div className="stat-card">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center text-status-red bg-status-red-bg">
              <AlertCircle className="w-4 h-4" />
            </div>
            <span className="stat-label">미처리 VoC</span>
          </div>
          <div className="stat-value">{formatNumber(data.pendingItems.openVocTickets)}건</div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Sales Status */}
        <div className="card lg:col-span-1">
          <div className="card-header">
            <span className="card-header-title">인바운드 현황</span>
            <Link href="/pipeline/board" className="text-xs text-primary-600 hover:text-primary-700 font-medium flex items-center gap-0.5">
              보기 <ChevronRight className="w-3 h-3" />
            </Link>
          </div>
          <div className="card-body">
            {/* Year selector */}
            <div className="flex items-center gap-1 mb-3">
              {[new Date().getFullYear() - 1, new Date().getFullYear()].map(y => (
                <button
                  key={y}
                  onClick={() => { setSalesYear(y); setSalesMonth(null) }}
                  className={`px-2.5 py-1 text-[11px] font-medium rounded-md transition-colors ${
                    salesYear === y ? 'bg-primary-500 text-white' : 'bg-surface-tertiary text-text-tertiary hover:bg-surface-secondary'
                  }`}
                >
                  {y}년
                </button>
              ))}
              <span className="text-[10px] text-text-placeholder ml-1">
                {salesMonth ? `${salesMonth}월` : '누적'}
              </span>
            </div>

            <div className="space-y-2.5">
              {filteredSalesByStage.map((item) => {
                const pct = filteredSalesTotal > 0 ? (item.count / filteredSalesTotal) * 100 : 0
                return (
                  <div key={item.stage}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-medium text-text-secondary">{item.stage}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-text-tertiary">{item.amount > 0 ? formatCurrency(item.amount) : ''}</span>
                        <span className="text-xs font-bold text-text-primary w-6 text-right">{item.count}</span>
                      </div>
                    </div>
                    <div className="bg-surface-tertiary rounded-full h-1.5 overflow-hidden">
                      <div
                        className={`h-1.5 rounded-full transition-all duration-500 ${stageBarColors[item.stage] || 'bg-primary-500'}`}
                        style={{ width: `${Math.max(pct, 2)}%` }}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
            <div className="mt-3 pt-3 border-t border-border-light flex justify-between text-xs">
              <span className="text-text-secondary font-medium">합계</span>
              <span className="font-bold text-text-primary">
                {filteredSalesByStage.reduce((s, i) => s + i.count, 0)}건 / {formatCurrency(filteredSalesByStage.reduce((s, i) => s + i.amount, 0))}
              </span>
            </div>

            {/* Month selector */}
            <div className="mt-3 pt-3 border-t border-border-light">
              <div className="grid grid-cols-7 gap-1">
                <button
                  onClick={() => setSalesMonth(null)}
                  className={`py-1 text-[10px] font-medium rounded transition-colors ${
                    salesMonth === null ? 'bg-primary-500 text-white' : 'bg-surface-tertiary text-text-tertiary hover:bg-surface-secondary'
                  }`}
                >
                  전체
                </button>
                {Array.from({ length: 12 }, (_, i) => i + 1).map(m => (
                  <button
                    key={m}
                    onClick={() => setSalesMonth(m)}
                    className={`py-1 text-[10px] font-medium rounded transition-colors ${
                      salesMonth === m ? 'bg-primary-500 text-white' : 'bg-surface-tertiary text-text-tertiary hover:bg-surface-secondary'
                    }`}
                  >
                    {m}월
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Recent Leads */}
        <div className="card">
          <div className="card-header">
            <span className="card-header-title">최근 리드</span>
            <Link href="/pipeline/list" className="text-xs text-primary-500 hover:text-primary-500 font-medium flex items-center gap-0.5">
              전체보기 <ChevronRight className="w-3 h-3" />
            </Link>
          </div>
          <div className="divide-y divide-border-light">
            {data.recentLeads.map((lead) => (
              <Link key={lead.id} href={`/pipeline/${lead.id}`} className="grid grid-cols-[1fr_auto_auto] items-center gap-2 px-4 py-2.5 hover:bg-primary-50/30 transition-colors">
                <div className="min-w-0">
                  <span className="text-body-sm font-medium text-text-primary block truncate">{lead.company_name}</span>
                  {lead.assigned_name && <span className="text-micro text-text-tertiary">{lead.assigned_name}</span>}
                </div>
                <span className={`text-micro px-1.5 py-0.5 rounded whitespace-nowrap ${STAGE_COLORS[lead.stage]}`}>
                  {SHORT_STAGE[lead.stage] || lead.stage}
                </span>
                <span className="text-micro text-text-tertiary w-10 text-right">
                  {new Date(lead.created_at).toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric' })}
                </span>
              </Link>
            ))}
            {data.recentLeads.length === 0 && (
              <div className="text-center text-text-placeholder py-12 text-body-sm">등록된 리드가 없습니다.</div>
            )}
          </div>
        </div>

        {/* Recent Conversions */}
        <div className="card">
          <div className="card-header">
            <span className="card-header-title">최근 도입</span>
            <Link href="/customers" className="text-xs text-primary-500 hover:text-primary-500 font-medium flex items-center gap-0.5">
              고객관리 <ChevronRight className="w-3 h-3" />
            </Link>
          </div>
          <div className="divide-y divide-border-light">
            {data.recentConversions.map((conv) => (
              <Link key={conv.id} href={`/pipeline/${conv.id}`} className="grid grid-cols-[1fr_auto_auto] items-center gap-2 px-4 py-2.5 hover:bg-primary-50/30 transition-colors">
                <div className="min-w-0">
                  <span className="text-body-sm font-medium text-text-primary block truncate">{conv.company_name}</span>
                  {conv.assigned_name && <span className="text-micro text-text-tertiary">{conv.assigned_name}</span>}
                </div>
                <span className="text-body-sm font-semibold text-primary-500 whitespace-nowrap">
                  {conv.deal_amount > 0 ? formatCurrency(conv.deal_amount) : '-'}
                </span>
                <span className="text-micro text-text-tertiary w-10 text-right">
                  {conv.converted_at ? new Date(conv.converted_at).toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric' }) : '-'}
                </span>
              </Link>
            ))}
            {data.recentConversions.length === 0 && (
              <div className="text-center text-text-placeholder py-12 text-body-sm">최근 도입 이력이 없습니다.</div>
            )}
          </div>
        </div>
      </div>

      {/* Action Due Alerts */}
      {data.actionDueLeads.length > 0 && (() => {
        const myActions = data.actionDueLeads.filter(l => l.assigned_to === user?.id)
        const othersActions = data.actionDueLeads.filter(l => l.assigned_to !== user?.id)
        const displayLeads = showAllActions ? data.actionDueLeads : (myActions.length > 0 ? myActions : data.actionDueLeads)
        const title = showAllActions ? '전체 액션' : (myActions.length > 0 ? '내 오늘의 액션' : '오늘의 액션')
        return (
        <div className="card border-l-4 border-l-status-red">
          <div className="card-header">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-status-red" />
              <span className="card-header-title text-status-red">{title} ({displayLeads.length}건)</span>
              {myActions.length > 0 && othersActions.length > 0 && (
                <button
                  onClick={() => setShowAllActions(!showAllActions)}
                  className="text-xs text-text-tertiary hover:text-primary-500 font-medium ml-1"
                >
                  {showAllActions ? '내 것만' : `전체 ${data.actionDueLeads.length}건`}
                </button>
              )}
            </div>
            <Link href="/pipeline/list" className="text-xs text-primary-500 hover:text-primary-500 font-medium flex items-center gap-0.5">
              전체보기 <ChevronRight className="w-3 h-3" />
            </Link>
          </div>
          <div className="divide-y divide-border-light">
            {displayLeads.map((lead) => {
              const isOverdue = new Date(lead.next_action_date) < new Date(new Date().toDateString())
              const nowLocal = new Date()
              const todayLocal = `${nowLocal.getFullYear()}-${String(nowLocal.getMonth() + 1).padStart(2, '0')}-${String(nowLocal.getDate()).padStart(2, '0')}`
              const isToday = lead.next_action_date === todayLocal
              return (
                <Link key={lead.id} href={`/pipeline/${lead.id}`} className="flex items-center gap-3 px-4 py-2.5 hover:bg-red-50/30 transition-colors">
                  <span className={`w-2 h-2 rounded-full shrink-0 ${isOverdue ? 'bg-status-red' : 'bg-status-yellow'}`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-body-sm font-medium text-text-primary truncate">{lead.company_name}</span>
                      <span className={`text-micro px-1.5 py-0.5 rounded ${STAGE_COLORS[lead.stage]}`}>
                        {SHORT_STAGE[lead.stage] || lead.stage}
                      </span>
                    </div>
                    {lead.next_action && (
                      <span className="text-micro text-text-tertiary">→ {lead.next_action}</span>
                    )}
                  </div>
                  <div className="text-right shrink-0">
                    <span className={`text-micro font-medium ${isOverdue ? 'text-status-red' : 'text-status-yellow'}`}>
                      {isToday ? '오늘' : `${Math.ceil((Date.now() - new Date(lead.next_action_date).getTime()) / 86400000)}일 초과`}
                    </span>
                    {lead.assigned_name && (
                      <span className="text-micro text-text-tertiary block">{lead.assigned_name}</span>
                    )}
                  </div>
                </Link>
              )
            })}
          </div>
        </div>
        )
      })()}

      {/* Revenue Trend Chart */}
      {data.monthlyTrend.length > 0 && (
        <div className="card">
          <div className="card-header">
            <span className="card-header-title">매출 현황 (전년 대비)</span>
            <span className="text-caption text-text-tertiary">{new Date().getFullYear()}년 vs {new Date().getFullYear() - 1}년</span>
          </div>
          <div className="card-body">
            <div className="h-[280px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.monthlyTrend} barCategoryGap="20%">
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f1f5" />
                  <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#9699a6' }} axisLine={{ stroke: '#e6e9ef' }} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: '#9699a6' }} axisLine={false} tickLine={false} tickFormatter={(v) => v >= 10000 ? `${(v / 10000).toFixed(0)}만` : v >= 1000 ? `${(v / 1000).toFixed(0)}천` : String(v)} />
                  <Tooltip
                    contentStyle={{ borderRadius: 8, border: '1px solid #e6e9ef', fontSize: 12, boxShadow: '0 4px 12px rgba(0,0,0,0.06)' }}
                    formatter={(value: number) => [formatCurrency(value), '']}
                    labelStyle={{ fontWeight: 600, marginBottom: 4 }}
                  />
                  <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="prevRevenue" name={`${new Date().getFullYear() - 1}년`} fill="#d0d4de" radius={[3, 3, 0, 0]} />
                  <Bar dataKey="revenue" name={`${new Date().getFullYear()}년`} fill="#1890ff" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            {/* 연간 합계 */}
            <div className="grid grid-cols-3 gap-4 mt-4 pt-4 border-t border-border-light">
              <div className="text-center">
                <p className="text-caption text-text-tertiary">올해 누적</p>
                <p className="text-heading-md text-primary-500 mt-1">
                  {formatCurrency(data.monthlyTrend.reduce((s, m) => s + m.revenue, 0))}
                </p>
              </div>
              <div className="text-center">
                <p className="text-caption text-text-tertiary">전년 누적</p>
                <p className="text-heading-md text-text-tertiary mt-1">
                  {formatCurrency(data.monthlyTrend.reduce((s, m) => s + m.prevRevenue, 0))}
                </p>
              </div>
              <div className="text-center">
                <p className="text-caption text-text-tertiary">전년 대비</p>
                {(() => {
                  const thisYear = data.monthlyTrend.reduce((s, m) => s + m.revenue, 0)
                  const lastYear = data.monthlyTrend.reduce((s, m) => s + m.prevRevenue, 0)
                  const diff = lastYear > 0 ? ((thisYear - lastYear) / lastYear * 100) : 0
                  return (
                    <p className={`text-heading-md mt-1 ${diff >= 0 ? 'text-status-green' : 'text-status-red'}`}>
                      {diff >= 0 ? '+' : ''}{diff.toFixed(1)}%
                    </p>
                  )
                })()}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Pending Items */}
      <div className="card">
        <div className="card-header">
          <span className="card-header-title">미처리 항목</span>
        </div>
        <div className="card-body">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {[
              { value: data.pendingItems.unassignedLeads, label: '담당자 미지정 리드', color: 'text-status-yellow', bg: 'bg-status-yellow-bg' },
              { value: data.unpaidInvoices, label: '미납 청구서', color: 'text-status-red', bg: 'bg-status-red-bg' },
              { value: data.pendingItems.openVocTickets, label: '미처리 VoC', color: 'text-status-purple', bg: 'bg-status-purple-bg' },
              { value: data.pendingItems.expiringBilling, label: '과금 만료 임박', color: 'text-status-blue', bg: 'bg-status-blue-bg' },
            ].map((item, idx) => (
              <div key={idx} className={`text-center p-4 rounded-xl ${item.bg}`}>
                <p className={`text-2xl font-bold ${item.color}`}>{item.value}</p>
                <p className="text-xs text-text-secondary mt-1 font-medium">{item.label}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
