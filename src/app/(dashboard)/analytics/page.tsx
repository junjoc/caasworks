'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { formatCurrency, formatNumber } from '@/lib/utils'
import { useAuth } from '@/hooks/useAuth'
import { Loading } from '@/components/ui/loading'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend,
  PieChart, Pie, Cell, LineChart, Line, AreaChart, Area,
} from 'recharts'
import {
  Plus, X, GripVertical, Settings2, Filter, RotateCcw,
  TrendingUp, Building2, Users, Target, ArrowUpDown,
  BarChart3, PieChart as PieChartIcon, Activity, Calendar,
  Lock, Unlock,
} from 'lucide-react'
import { GridLayout, useContainerWidth } from 'react-grid-layout'
import type { LayoutItem, Layout } from 'react-grid-layout'
import 'react-grid-layout/css/styles.css'

// ── Widget Registry ──
type WidgetCategory = 'revenue' | 'sales' | 'customer' | 'operation'

interface WidgetConfig {
  id: string
  name: string
  description: string
  category: WidgetCategory
  defaultW: number
  defaultH: number
  minW?: number
  minH?: number
  icon: React.ReactNode
}

const WIDGET_REGISTRY: WidgetConfig[] = [
  // Revenue
  { id: 'revenue_ranking', name: '고객사 매출 순위', description: '이번달 매출 TOP 고객사', category: 'revenue', defaultW: 4, defaultH: 6, minW: 3, minH: 4, icon: <BarChart3 className="w-4 h-4" /> },
  { id: 'revenue_trend', name: '월별 매출 추이', description: '최근 12개월 매출 변화', category: 'revenue', defaultW: 8, defaultH: 5, minW: 4, minH: 4, icon: <TrendingUp className="w-4 h-4" /> },
  { id: 'revenue_by_type', name: '공공/민간 매출 비교', description: '공공 vs 민간 매출 비중', category: 'revenue', defaultW: 6, defaultH: 4, minW: 3, minH: 3, icon: <PieChartIcon className="w-4 h-4" /> },
  { id: 'revenue_by_service', name: '서비스별 매출', description: '서비스 타입별 매출 분포', category: 'revenue', defaultW: 6, defaultH: 5, minW: 3, minH: 3, icon: <BarChart3 className="w-4 h-4" /> },
  { id: 'revenue_growth', name: '고객사 매출 증감', description: '전월 대비 매출 변화 고객사', category: 'revenue', defaultW: 6, defaultH: 5, minW: 3, minH: 3, icon: <ArrowUpDown className="w-4 h-4" /> },
  // Sales
  { id: 'pipeline_funnel', name: '파이프라인 퍼널', description: '단계별 리드 수 & 전환율', category: 'sales', defaultW: 6, defaultH: 6, minW: 3, minH: 4, icon: <Target className="w-4 h-4" /> },
  { id: 'sales_by_person', name: '담당자별 성과', description: '담당자별 리드/전환 현황', category: 'sales', defaultW: 6, defaultH: 5, minW: 3, minH: 3, icon: <Users className="w-4 h-4" /> },
  { id: 'lead_source', name: '유입 채널 분석', description: '문의 채널별 리드 분포', category: 'sales', defaultW: 4, defaultH: 4, minW: 3, minH: 3, icon: <Activity className="w-4 h-4" /> },
  { id: 'lead_monthly', name: '월별 신규 리드', description: '월별 리드 유입 추이', category: 'sales', defaultW: 6, defaultH: 4, minW: 4, minH: 3, icon: <Calendar className="w-4 h-4" /> },
  { id: 'conversion_time', name: '전환 소요일', description: '리드→도입 평균 소요 기간', category: 'sales', defaultW: 4, defaultH: 5, minW: 3, minH: 4, icon: <Activity className="w-4 h-4" /> },
  // Customer
  { id: 'customer_by_type', name: '공공/민간 현장 현황', description: '공공/민간 발주별 현장 수 & 비율', category: 'customer', defaultW: 4, defaultH: 4, minW: 3, minH: 3, icon: <Building2 className="w-4 h-4" /> },
  { id: 'site_category_trend', name: '공사타입별 도입 흐름', description: '공사타입별 1년간 도입 추이', category: 'customer', defaultW: 8, defaultH: 5, minW: 4, minH: 4, icon: <TrendingUp className="w-4 h-4" /> },
  { id: 'customer_status', name: '고객 상태 분포', description: '활성/중단/해지 고객 현황', category: 'customer', defaultW: 4, defaultH: 4, minW: 3, minH: 3, icon: <PieChartIcon className="w-4 h-4" /> },
  { id: 'churn_risk', name: '과금 만료 임박', description: '30일 내 과금 만료 고객', category: 'customer', defaultW: 6, defaultH: 5, minW: 3, minH: 3, icon: <Calendar className="w-4 h-4" /> },
  // Operation
  { id: 'billing_type', name: '과금방식 분포', description: '과금방식별 고객 수', category: 'operation', defaultW: 4, defaultH: 4, minW: 3, minH: 3, icon: <PieChartIcon className="w-4 h-4" /> },
  { id: 'core_need', name: '핵심 수요 분석', description: '리드별 관심 분야 분포', category: 'operation', defaultW: 6, defaultH: 5, minW: 3, minH: 4, icon: <BarChart3 className="w-4 h-4" /> },
]

const CATEGORY_LABELS: Record<WidgetCategory, { label: string; color: string }> = {
  revenue: { label: '매출', color: '#10b981' },
  sales: { label: '세일즈', color: '#7c3aed' },
  customer: { label: '고객', color: '#0a54bf' },
  operation: { label: '운영', color: '#f59e0b' },
}

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16', '#f97316', '#6366f1']

// ── Default Layout (react-grid-layout format) ──
interface SavedLayout {
  widgetIds: string[]
  gridLayout: LayoutItem[]
}

function generateDefaultLayout(): SavedLayout {
  const defaultWidgets = [
    'revenue_ranking', 'revenue_by_type', 'revenue_trend', 'customer_by_type',
    'pipeline_funnel', 'sales_by_person', 'site_category_trend', 'customer_status',
    'lead_source', 'lead_monthly', 'core_need',
  ]

  const gridLayout: LayoutItem[] = []
  let x = 0, y = 0

  defaultWidgets.forEach((wid) => {
    const config = WIDGET_REGISTRY.find(w => w.id === wid)
    if (!config) return
    const w = config.defaultW
    const h = config.defaultH

    if (x + w > 12) { x = 0; y += 5 }

    gridLayout.push({
      i: wid, x, y, w, h,
      minW: config.minW || 3,
      minH: config.minH || 3,
    })
    x += w
    if (x >= 12) { x = 0; y += h }
  })

  return { widgetIds: defaultWidgets, gridLayout }
}

const STORAGE_KEY = 'caasworks_analytics_v2'

export default function AnalyticsDashboardPage() {
  const { user } = useAuth()
  const supabase = createClient()
  const [widgetIds, setWidgetIds] = useState<string[]>([])
  const [gridLayout, setGridLayout] = useState<LayoutItem[]>([])
  const [editMode, setEditMode] = useState(false)
  const [showAddWidget, setShowAddWidget] = useState(false)
  const [loading, setLoading] = useState(true)
  const [widgetData, setWidgetData] = useState<Record<string, any>>({})
  const [globalFilter, setGlobalFilter] = useState({ year: new Date().getFullYear(), month: new Date().getMonth() + 1 })
  const initialized = useRef(false)
  const { containerRef, width: containerWidth, mounted: containerMounted } = useContainerWidth()

  // Load layout from localStorage
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved) {
      try {
        const parsed: SavedLayout = JSON.parse(saved)
        setWidgetIds(parsed.widgetIds)
        setGridLayout(parsed.gridLayout)
      } catch {
        const def = generateDefaultLayout()
        setWidgetIds(def.widgetIds)
        setGridLayout(def.gridLayout)
      }
    } else {
      const def = generateDefaultLayout()
      setWidgetIds(def.widgetIds)
      setGridLayout(def.gridLayout)
    }
    initialized.current = true
  }, [])

  // Save layout
  useEffect(() => {
    if (!initialized.current) return
    if (widgetIds.length > 0) {
      const saved: SavedLayout = { widgetIds, gridLayout }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(saved))
    }
  }, [widgetIds, gridLayout])

  // Fetch all widget data
  useEffect(() => {
    if (widgetIds.length > 0) fetchAllData()
  }, [widgetIds, globalFilter])

  async function fetchAllData() {
    setLoading(true)
    const data: Record<string, any> = {}

    try {
      const promises: Promise<void>[] = []

      if (widgetIds.includes('revenue_ranking')) promises.push(fetchRevenueRanking(data))
      if (widgetIds.includes('revenue_trend')) promises.push(fetchRevenueTrend(data))
      if (widgetIds.includes('revenue_by_type')) promises.push(fetchRevenueByType(data))
      if (widgetIds.includes('revenue_by_service')) promises.push(fetchRevenueByService(data))
      if (widgetIds.includes('revenue_growth')) promises.push(fetchRevenueGrowth(data))
      if (widgetIds.includes('pipeline_funnel')) promises.push(fetchPipelineFunnel(data))
      if (widgetIds.includes('sales_by_person')) promises.push(fetchSalesByPerson(data))
      if (widgetIds.includes('lead_source')) promises.push(fetchLeadSource(data))
      if (widgetIds.includes('lead_monthly')) promises.push(fetchLeadMonthly(data))
      if (widgetIds.includes('conversion_time')) promises.push(fetchConversionTime(data))
      if (widgetIds.includes('customer_by_type')) promises.push(fetchCustomerByType(data))
      if (widgetIds.includes('site_category_trend')) promises.push(fetchSiteCategoryTrend(data))
      if (widgetIds.includes('customer_status')) promises.push(fetchCustomerStatus(data))
      if (widgetIds.includes('churn_risk')) promises.push(fetchChurnRisk(data))
      if (widgetIds.includes('billing_type')) promises.push(fetchBillingType(data))
      if (widgetIds.includes('core_need')) promises.push(fetchCoreNeed(data))

      await Promise.all(promises)
    } catch (e) {
      console.error('Analytics data fetch error:', e)
    }

    setWidgetData(data)
    setLoading(false)
  }

  // ── Data Fetchers (same logic as before) ──

  async function fetchRevenueRanking(data: Record<string, any>) {
    const { year, month } = globalFilter
    const { data: revenues } = await supabase
      .from('monthly_revenues')
      .select('amount, customer_id, customers(company_name, company_type)')
      .eq('year', year)
      .eq('month', month)
      .limit(5000)

    if (revenues) {
      const byCustomer: Record<string, { name: string; type: string; amount: number }> = {}
      revenues.forEach((r: any) => {
        const cid = r.customer_id
        const name = r.customers?.company_name || '미지정'
        const type = r.customers?.company_type || '-'
        if (!byCustomer[cid]) byCustomer[cid] = { name, type, amount: 0 }
        byCustomer[cid].amount += Number(r.amount) || 0
      })
      data.revenue_ranking = Object.values(byCustomer)
        .sort((a, b) => b.amount - a.amount)
        .slice(0, 15)
    }
  }

  async function fetchAllRevByYear(y: number) {
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

  async function fetchRevenueTrend(data: Record<string, any>) {
    const { year } = globalFilter
    const [cur, prev] = await Promise.all([fetchAllRevByYear(year), fetchAllRevByYear(year - 1)])

    const months: { month: string; current: number; previous: number }[] = []
    for (let m = 1; m <= 12; m++) {
      const curAmt = (cur || []).filter((r: any) => r.month === m).reduce((s: number, r: any) => s + (Number(r.amount) || 0), 0)
      const prevAmt = (prev || []).filter((r: any) => r.month === m).reduce((s: number, r: any) => s + (Number(r.amount) || 0), 0)
      months.push({ month: `${m}월`, current: curAmt, previous: prevAmt })
    }
    data.revenue_trend = months
  }

  async function fetchRevenueByType(data: Record<string, any>) {
    const { year, month } = globalFilter
    const { data: revenues } = await supabase
      .from('monthly_revenues')
      .select('amount, project_id, projects(site_category)')
      .eq('year', year)
      .eq('month', month)
      .limit(5000)

    if (revenues) {
      const byType: Record<string, number> = {}
      revenues.forEach((r: any) => {
        const type = r.projects?.site_category || '미분류'
        byType[type] = (byType[type] || 0) + (Number(r.amount) || 0)
      })
      data.revenue_by_type = Object.entries(byType).map(([name, value]) => ({ name, value }))
    }
  }

  async function fetchRevenueByService(data: Record<string, any>) {
    const { year, month } = globalFilter
    const { data: revenues } = await supabase
      .from('monthly_revenues')
      .select('amount, project_id, projects(service_type)')
      .eq('year', year)
      .eq('month', month)
      .limit(5000)

    if (revenues) {
      const bySvc: Record<string, number> = {}
      revenues.forEach((r: any) => {
        const svc = r.projects?.service_type || '미분류'
        bySvc[svc] = (bySvc[svc] || 0) + (Number(r.amount) || 0)
      })
      data.revenue_by_service = Object.entries(bySvc)
        .map(([name, value]) => ({ name, value }))
        .sort((a, b) => b.value - a.value)
        .slice(0, 10)
    }
  }

  async function fetchRevenueGrowth(data: Record<string, any>) {
    const { year, month } = globalFilter
    const prevMonth = month === 1 ? 12 : month - 1
    const prevYear = month === 1 ? year - 1 : year

    const [{ data: cur }, { data: prev }] = await Promise.all([
      supabase.from('monthly_revenues').select('amount, customer_id, customers(company_name)').eq('year', year).eq('month', month).limit(5000),
      supabase.from('monthly_revenues').select('amount, customer_id, customers(company_name)').eq('year', prevYear).eq('month', prevMonth).limit(5000),
    ])

    const curMap: Record<string, { name: string; amount: number }> = {}
    const prevMap: Record<string, number> = {}
    ;(cur || []).forEach((r: any) => {
      const cid = r.customer_id
      if (!curMap[cid]) curMap[cid] = { name: r.customers?.company_name || '미지정', amount: 0 }
      curMap[cid].amount += Number(r.amount) || 0
    })
    ;(prev || []).forEach((r: any) => {
      prevMap[r.customer_id] = (prevMap[r.customer_id] || 0) + (Number(r.amount) || 0)
    })

    data.revenue_growth = Object.entries(curMap).map(([cid, { name, amount }]) => ({
      name,
      current: amount,
      previous: prevMap[cid] || 0,
      diff: amount - (prevMap[cid] || 0),
    }))
      .sort((a, b) => b.diff - a.diff)
      .slice(0, 10)
  }

  async function fetchPipelineFunnel(data: Record<string, any>) {
    const { data: leads } = await supabase.from('pipeline_leads').select('stage')
    if (leads) {
      const stages = ['신규리드', '컨택', '미팅', '제안', '도입직전', '도입완료', '이탈']
      const counts: Record<string, number> = {}
      leads.forEach((l: any) => { counts[l.stage] = (counts[l.stage] || 0) + 1 })
      data.pipeline_funnel = stages.map(s => ({ stage: s, count: counts[s] || 0 }))
    }
  }

  async function fetchSalesByPerson(data: Record<string, any>) {
    const [{ data: leads }, { data: users }] = await Promise.all([
      supabase.from('pipeline_leads').select('stage, assigned_to'),
      supabase.from('users').select('id, name'),
    ])
    if (leads && users) {
      const userMap = Object.fromEntries(users.map((u: any) => [u.id, u.name]))
      const byPerson: Record<string, { name: string; total: number; converted: number; active: number }> = {}
      leads.forEach((l: any) => {
        const uid = l.assigned_to || 'unassigned'
        const name = uid === 'unassigned' ? '미배정' : (userMap[uid] || '알 수 없음')
        if (!byPerson[uid]) byPerson[uid] = { name, total: 0, converted: 0, active: 0 }
        byPerson[uid].total++
        if (l.stage === '도입완료') byPerson[uid].converted++
        if (!['도입완료', '이탈'].includes(l.stage)) byPerson[uid].active++
      })
      data.sales_by_person = Object.values(byPerson).sort((a, b) => b.total - a.total)
    }
  }

  async function fetchLeadSource(data: Record<string, any>) {
    const { data: leads } = await supabase.from('pipeline_leads').select('inquiry_channel')
    if (leads) {
      const bySource: Record<string, number> = {}
      leads.forEach((l: any) => {
        const ch = l.inquiry_channel || '미분류'
        bySource[ch] = (bySource[ch] || 0) + 1
      })
      data.lead_source = Object.entries(bySource)
        .map(([name, value]) => ({ name, value }))
        .sort((a, b) => b.value - a.value)
    }
  }

  async function fetchLeadMonthly(data: Record<string, any>) {
    const { data: leads } = await supabase.from('pipeline_leads').select('created_at')
    if (leads) {
      const byMonth: Record<string, number> = {}
      leads.forEach((l: any) => {
        if (!l.created_at) return
        const d = new Date(l.created_at)
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
        byMonth[key] = (byMonth[key] || 0) + 1
      })
      data.lead_monthly = Object.entries(byMonth)
        .sort(([a], [b]) => a.localeCompare(b))
        .slice(-12)
        .map(([month, count]) => ({ month: month.replace(/^\d{4}-/, '').replace(/^0/, '') + '월', count }))
    }
  }

  async function fetchConversionTime(data: Record<string, any>) {
    const { data: leads } = await supabase
      .from('pipeline_leads')
      .select('created_at, converted_at')
      .eq('stage', '도입완료')
      .not('converted_at', 'is', null)
    if (leads) {
      const days = leads.map((l: any) => {
        const created = new Date(l.created_at)
        const converted = new Date(l.converted_at)
        return Math.ceil((converted.getTime() - created.getTime()) / (1000 * 60 * 60 * 24))
      }).filter(d => d > 0 && d < 3650)

      const avg = days.length > 0 ? Math.round(days.reduce((a, b) => a + b, 0) / days.length) : 0
      const median = days.length > 0 ? days.sort((a, b) => a - b)[Math.floor(days.length / 2)] : 0

      const ranges = [
        { label: '1주 이내', min: 0, max: 7 },
        { label: '1-2주', min: 8, max: 14 },
        { label: '2-4주', min: 15, max: 30 },
        { label: '1-3개월', min: 31, max: 90 },
        { label: '3-6개월', min: 91, max: 180 },
        { label: '6개월+', min: 181, max: 9999 },
      ]
      data.conversion_time = {
        avg, median, total: days.length,
        distribution: ranges.map(r => ({
          label: r.label,
          count: days.filter(d => d >= r.min && d <= r.max).length,
        })),
      }
    }
  }

  async function fetchCustomerByType(data: Record<string, any>) {
    const { data: projects } = await supabase.from('projects').select('site_category, status')
    if (projects) {
      const byType: Record<string, { total: number; active: number }> = {}
      projects.forEach((p: any) => {
        const type = p.site_category || '미분류'
        if (!byType[type]) byType[type] = { total: 0, active: 0 }
        byType[type].total++
        if (p.status === 'active') byType[type].active++
      })
      data.customer_by_type = Object.entries(byType).map(([name, v]) => ({ name, ...v }))
    }
  }

  async function fetchSiteCategoryTrend(data: Record<string, any>) {
    const { data: projects } = await supabase
      .from('projects')
      .select('site_category, billing_start, created_at')

    if (projects) {
      const now = new Date()
      const months: string[] = []
      for (let i = 11; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
        months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
      }

      const categories = new Set<string>()
      const byMonthCat: Record<string, Record<string, number>> = {}
      months.forEach(m => { byMonthCat[m] = {} })

      projects.forEach((p: any) => {
        const cat = p.site_category || '미분류'
        categories.add(cat)
        const startDate = p.billing_start || p.created_at
        if (!startDate) return
        const d = new Date(startDate)
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
        if (byMonthCat[key]) {
          byMonthCat[key][cat] = (byMonthCat[key][cat] || 0) + 1
        }
      })

      data.site_category_trend = {
        months: months.map(m => m.replace(/^\d{4}-/, '').replace(/^0/, '') + '월'),
        categories: Array.from(categories).slice(0, 8),
        series: months.map(m => {
          const row: any = { month: m.replace(/^\d{4}-/, '').replace(/^0/, '') + '월' }
          categories.forEach(c => { row[c] = byMonthCat[m][c] || 0 })
          return row
        }),
      }
    }
  }

  async function fetchCustomerStatus(data: Record<string, any>) {
    const { data: customers } = await supabase.from('customers').select('status')
    if (customers) {
      const byStatus: Record<string, number> = {}
      customers.forEach((c: any) => {
        const s = c.status || 'active'
        byStatus[s] = (byStatus[s] || 0) + 1
      })
      const labels: Record<string, string> = { active: '활성', suspended: '중단', churned: '해지' }
      data.customer_status = Object.entries(byStatus).map(([k, v]) => ({ name: labels[k] || k, value: v }))
    }
  }

  async function fetchChurnRisk(data: Record<string, any>) {
    const now = new Date()
    const future30 = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)
    const { data: customers } = await supabase
      .from('customers')
      .select('company_name, company_type, billing_end, billing_type')
      .eq('status', 'active')
      .not('billing_end', 'is', null)
      .lte('billing_end', future30.toISOString().split('T')[0])
      .order('billing_end', { ascending: true })
      .limit(20)
    data.churn_risk = customers || []
  }

  async function fetchBillingType(data: Record<string, any>) {
    const { data: customers } = await supabase.from('customers').select('billing_type').eq('status', 'active')
    if (customers) {
      const byType: Record<string, number> = {}
      customers.forEach((c: any) => {
        const bt = c.billing_type || '미분류'
        byType[bt] = (byType[bt] || 0) + 1
      })
      data.billing_type = Object.entries(byType).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value)
    }
  }

  async function fetchCoreNeed(data: Record<string, any>) {
    const { data: leads } = await supabase.from('pipeline_leads').select('core_need')
    if (leads) {
      const byNeed: Record<string, number> = {}
      leads.forEach((l: any) => {
        if (!l.core_need) return
        const need = l.core_need.split('>')[0]?.trim() || l.core_need
        byNeed[need] = (byNeed[need] || 0) + 1
      })
      data.core_need = Object.entries(byNeed)
        .map(([name, value]) => ({ name, value }))
        .sort((a, b) => b.value - a.value)
        .slice(0, 10)
    }
  }

  // ── Layout Management ──
  function addWidget(widgetId: string) {
    const config = WIDGET_REGISTRY.find(w => w.id === widgetId)
    if (!config || widgetIds.includes(widgetId)) return

    // Find lowest y position to place new widget
    const maxY = gridLayout.reduce((max, item) => Math.max(max, item.y + item.h), 0)
    const newLayoutItem: LayoutItem = {
      i: widgetId,
      x: 0,
      y: maxY,
      w: config.defaultW,
      h: config.defaultH,
      minW: config.minW || 3,
      minH: config.minH || 3,
    }

    setWidgetIds(prev => [...prev, widgetId])
    setGridLayout(prev => [...prev, newLayoutItem])
    setShowAddWidget(false)
  }

  function removeWidget(widgetId: string) {
    setWidgetIds(prev => prev.filter(id => id !== widgetId))
    setGridLayout(prev => prev.filter(item => item.i !== widgetId))
  }

  function onLayoutChange(newLayout: Layout) {
    setGridLayout([...newLayout])
  }

  function resetLayout() {
    const def = generateDefaultLayout()
    setWidgetIds(def.widgetIds)
    setGridLayout(def.gridLayout)
    localStorage.removeItem(STORAGE_KEY)
  }

  // ── Render Widgets ──
  function renderWidget(widgetId: string) {
    const d = widgetData[widgetId]
    if (!d) return <div className="flex items-center justify-center h-full text-text-tertiary text-sm">데이터 없음</div>

    switch (widgetId) {
      case 'revenue_ranking':
        return (
          <div className="space-y-2 overflow-y-auto h-full">
            {d.map((item: any, i: number) => (
              <div key={i} className="flex items-center gap-3">
                <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${i < 3 ? 'bg-primary-500 text-white' : 'bg-surface-tertiary text-text-secondary'}`}>
                  {i + 1}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-text-primary truncate">{item.name}</span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-surface-tertiary text-text-tertiary">{item.type}</span>
                  </div>
                </div>
                <span className="text-sm font-semibold text-text-primary whitespace-nowrap">{formatCurrency(item.amount)}</span>
              </div>
            ))}
          </div>
        )

      case 'revenue_trend':
        return (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={d} margin={{ top: 5, right: 20, bottom: 5, left: 10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="month" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={(v: number) => `${(v / 10000).toFixed(0)}만`} />
              <Tooltip formatter={(v: number) => formatCurrency(v)} />
              <Legend />
              <Bar dataKey="current" name={`${globalFilter.year}년`} fill="#1890ff" radius={[4, 4, 0, 0]} />
              <Bar dataKey="previous" name={`${globalFilter.year - 1}년`} fill="#D9D9D9" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )

      case 'revenue_by_type': {
        const total = d.reduce((s: number, item: any) => s + item.value, 0)
        return (
          <div className="flex items-center gap-6 h-full">
            <ResponsiveContainer width="50%" height="100%">
              <PieChart>
                <Pie data={d} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius="70%" innerRadius="40%">
                  {d.map((_: any, i: number) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip formatter={(v: number) => formatCurrency(v)} />
              </PieChart>
            </ResponsiveContainer>
            <div className="flex-1 space-y-2">
              {d.map((item: any, i: number) => (
                <div key={i} className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-sm" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                  <span className="text-sm text-text-secondary flex-1">{item.name}</span>
                  <span className="text-sm font-medium">{total > 0 ? Math.round(item.value / total * 100) : 0}%</span>
                </div>
              ))}
            </div>
          </div>
        )
      }

      case 'revenue_by_service':
        return (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={d} layout="vertical" margin={{ top: 5, right: 20, bottom: 5, left: 80 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={(v: number) => `${(v / 10000).toFixed(0)}만`} />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 12 }} width={75} />
              <Tooltip formatter={(v: number) => formatCurrency(v)} />
              <Bar dataKey="value" fill="#b145ff" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )

      case 'revenue_growth':
        return (
          <div className="space-y-2 overflow-y-auto h-full">
            {d.map((item: any, i: number) => (
              <div key={i} className="flex items-center gap-3">
                <span className="text-sm text-text-primary flex-1 truncate">{item.name}</span>
                <span className="text-xs text-text-tertiary">{formatCurrency(item.previous)} →</span>
                <span className="text-sm font-medium">{formatCurrency(item.current)}</span>
                <span className={`text-xs font-semibold px-1.5 py-0.5 rounded ${item.diff > 0 ? 'text-green-700 bg-green-50' : item.diff < 0 ? 'text-red-700 bg-red-50' : 'text-gray-500 bg-gray-50'}`}>
                  {item.diff > 0 ? '+' : ''}{formatCurrency(item.diff)}
                </span>
              </div>
            ))}
          </div>
        )

      case 'pipeline_funnel': {
        const stageColors: Record<string, string> = {
          '신규리드': '#9ca3af', '컨택': '#3b82f6', '미팅': '#f59e0b', '제안': '#8b5cf6',
          '도입직전': '#10b981', '도입완료': '#059669', '이탈': '#ef4444',
        }
        const maxCount = Math.max(...d.map((s: any) => s.count), 1)
        return (
          <div className="space-y-2.5 overflow-y-auto h-full">
            {d.map((item: any, i: number) => (
              <div key={i}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm text-text-secondary">{item.stage}</span>
                  <span className="text-sm font-semibold">{formatNumber(item.count)}</span>
                </div>
                <div className="h-5 bg-surface-tertiary rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{
                      width: `${(item.count / maxCount) * 100}%`,
                      backgroundColor: stageColors[item.stage] || '#6b7280',
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        )
      }

      case 'sales_by_person':
        return (
          <div className="space-y-3 overflow-y-auto h-full">
            {d.map((p: any, i: number) => (
              <div key={i} className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-primary-100 flex items-center justify-center text-primary-600 text-xs font-bold flex-shrink-0">
                  {p.name.charAt(0)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-text-primary">{p.name}</div>
                  <div className="text-xs text-text-tertiary">진행 {p.active} | 전환 {p.converted}</div>
                </div>
                <div className="text-right">
                  <div className="text-sm font-semibold">{p.total}건</div>
                  <div className="text-xs text-text-tertiary">전환율 {p.total > 0 ? Math.round(p.converted / p.total * 100) : 0}%</div>
                </div>
              </div>
            ))}
          </div>
        )

      case 'lead_source': {
        const srcTotal = d.reduce((s: number, item: any) => s + item.value, 0)
        return (
          <div className="space-y-2 overflow-y-auto h-full">
            {d.map((item: any, i: number) => (
              <div key={i} className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-sm" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                <span className="text-sm text-text-secondary flex-1">{item.name}</span>
                <span className="text-sm font-medium">{item.value}건</span>
                <span className="text-xs text-text-tertiary">({srcTotal > 0 ? Math.round(item.value / srcTotal * 100) : 0}%)</span>
              </div>
            ))}
          </div>
        )
      }

      case 'lead_monthly':
        return (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={d} margin={{ top: 5, right: 20, bottom: 5, left: 10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="month" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip />
              <Area type="monotone" dataKey="count" name="신규 리드" stroke="#b145ff" fill="#b145ff" fillOpacity={0.15} />
            </AreaChart>
          </ResponsiveContainer>
        )

      case 'conversion_time':
        return (
          <div className="h-full overflow-y-auto">
            <div className="grid grid-cols-3 gap-3 mb-4">
              <div className="text-center p-3 bg-surface-tertiary rounded-lg">
                <div className="text-2xl font-bold text-primary-500">{d.avg}</div>
                <div className="text-xs text-text-tertiary">평균(일)</div>
              </div>
              <div className="text-center p-3 bg-surface-tertiary rounded-lg">
                <div className="text-2xl font-bold text-green-600">{d.median}</div>
                <div className="text-xs text-text-tertiary">중앙값(일)</div>
              </div>
              <div className="text-center p-3 bg-surface-tertiary rounded-lg">
                <div className="text-2xl font-bold text-text-primary">{d.total}</div>
                <div className="text-xs text-text-tertiary">전환 건수</div>
              </div>
            </div>
            <div className="space-y-1.5">
              {d.distribution.map((item: any, i: number) => (
                <div key={i} className="flex items-center gap-2">
                  <span className="text-xs text-text-tertiary w-16">{item.label}</span>
                  <div className="flex-1 h-4 bg-surface-tertiary rounded-full overflow-hidden">
                    <div className="h-full bg-primary-500 rounded-full" style={{ width: `${d.total > 0 ? (item.count / d.total) * 100 : 0}%` }} />
                  </div>
                  <span className="text-xs font-medium w-8 text-right">{item.count}</span>
                </div>
              ))}
            </div>
          </div>
        )

      case 'customer_by_type': {
        const custTotal = d.reduce((s: number, item: any) => s + item.total, 0)
        return (
          <div className="space-y-4 overflow-y-auto h-full">
            {d.map((item: any, i: number) => (
              <div key={i} className="p-3 bg-surface-tertiary rounded-lg">
                <div className="flex justify-between items-center mb-1">
                  <span className="text-sm font-medium">{item.name}</span>
                  <span className="text-lg font-bold">{item.total}건</span>
                </div>
                <div className="flex justify-between text-xs text-text-tertiary">
                  <span>활성 {item.active}건</span>
                  <span>전체의 {custTotal > 0 ? Math.round(item.total / custTotal * 100) : 0}%</span>
                </div>
              </div>
            ))}
          </div>
        )
      }

      case 'site_category_trend':
        return (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={d.series} margin={{ top: 5, right: 20, bottom: 5, left: 10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="month" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              {d.categories.map((cat: string, i: number) => (
                <Bar key={cat} dataKey={cat} stackId="a" fill={COLORS[i % COLORS.length]} />
              ))}
            </BarChart>
          </ResponsiveContainer>
        )

      case 'customer_status': {
        const statusColors: Record<string, string> = { '활성': '#10b981', '중단': '#f59e0b', '해지': '#ef4444' }
        const stTotal = d.reduce((s: number, item: any) => s + item.value, 0)
        return (
          <div className="flex items-center gap-6 h-full">
            <ResponsiveContainer width="45%" height="100%">
              <PieChart>
                <Pie data={d} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius="70%" innerRadius="40%">
                  {d.map((item: any, i: number) => <Cell key={i} fill={statusColors[item.name] || COLORS[i]} />)}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
            <div className="flex-1 space-y-2">
              {d.map((item: any, i: number) => (
                <div key={i} className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full" style={{ backgroundColor: statusColors[item.name] || COLORS[i] }} />
                  <span className="text-sm flex-1">{item.name}</span>
                  <span className="text-sm font-semibold">{item.value}</span>
                  <span className="text-xs text-text-tertiary">({stTotal > 0 ? Math.round(item.value / stTotal * 100) : 0}%)</span>
                </div>
              ))}
            </div>
          </div>
        )
      }

      case 'churn_risk':
        return (
          <div className="space-y-2 overflow-y-auto h-full">
            {d.length === 0 ? (
              <p className="text-sm text-text-tertiary text-center py-4">30일 내 만료 예정 고객 없음</p>
            ) : d.map((c: any, i: number) => {
              const daysLeft = Math.ceil((new Date(c.billing_end).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
              return (
                <div key={i} className="flex items-center gap-3 p-2 rounded-lg bg-surface-tertiary">
                  <div className="flex-1">
                    <div className="text-sm font-medium">{c.company_name}</div>
                    <div className="text-xs text-text-tertiary">{c.company_type} · {c.billing_type}</div>
                  </div>
                  <span className={`text-xs font-semibold px-2 py-1 rounded-full ${daysLeft <= 7 ? 'bg-red-100 text-red-700' : daysLeft <= 14 ? 'bg-yellow-100 text-yellow-700' : 'bg-blue-100 text-blue-700'}`}>
                    {daysLeft <= 0 ? '만료됨' : `D-${daysLeft}`}
                  </span>
                </div>
              )
            })}
          </div>
        )

      case 'billing_type': {
        const btTotal = d.reduce((s: number, item: any) => s + item.value, 0)
        return (
          <div className="space-y-2 overflow-y-auto h-full">
            {d.map((item: any, i: number) => (
              <div key={i} className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-sm" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                <span className="text-sm text-text-secondary flex-1">{item.name}</span>
                <span className="text-sm font-medium">{item.value}개사</span>
                <span className="text-xs text-text-tertiary">({btTotal > 0 ? Math.round(item.value / btTotal * 100) : 0}%)</span>
              </div>
            ))}
          </div>
        )
      }

      case 'core_need':
        return (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={d} layout="vertical" margin={{ top: 5, right: 20, bottom: 5, left: 80 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis type="number" tick={{ fontSize: 11 }} />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 12 }} width={75} />
              <Tooltip />
              <Bar dataKey="value" name="리드 수" fill="#FCBA16" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )

      default:
        return <div className="text-sm text-text-tertiary text-center py-8">위젯 렌더링 오류</div>
    }
  }

  return (
    <div>
      {/* Header */}
      <div className="page-header flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="page-title">분석 대시보드</h1>
          <p className="text-sm text-text-tertiary mt-0.5">위젯을 드래그하여 이동하고, 모서리를 잡아 크기를 조절하세요</p>
        </div>
        <div className="flex items-center gap-2">
          {/* Global Filter */}
          <select
            className="input-field text-sm !w-auto !py-1.5"
            value={globalFilter.year}
            onChange={e => setGlobalFilter(f => ({ ...f, year: Number(e.target.value) }))}
          >
            {[2024, 2025, 2026].map(y => <option key={y} value={y}>{y}년</option>)}
          </select>
          <select
            className="input-field text-sm !w-auto !py-1.5"
            value={globalFilter.month}
            onChange={e => setGlobalFilter(f => ({ ...f, month: Number(e.target.value) }))}
          >
            {Array.from({ length: 12 }, (_, i) => <option key={i + 1} value={i + 1}>{i + 1}월</option>)}
          </select>

          <div className="w-px h-6 bg-border mx-1" />

          <button
            onClick={() => setShowAddWidget(true)}
            className="btn-primary text-sm !py-1.5 flex items-center gap-1.5"
          >
            <Plus className="w-4 h-4" /> 위젯 추가
          </button>
          <button
            onClick={() => setEditMode(!editMode)}
            className={`btn-secondary text-sm !py-1.5 flex items-center gap-1.5 ${editMode ? 'ring-2 ring-primary-300 bg-primary-50' : ''}`}
          >
            {editMode ? <Unlock className="w-4 h-4" /> : <Lock className="w-4 h-4" />}
            {editMode ? '편집 완료' : '배치 편집'}
          </button>
          <button
            onClick={resetLayout}
            className="btn-secondary text-sm !py-1.5 flex items-center gap-1.5"
            title="기본 배치로 초기화"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Widget Grid */}
      {loading && widgetIds.length > 0 && <Loading />}

      <div ref={containerRef as any} style={{ minHeight: widgetIds.length > 0 ? 200 : 0 }}>
        {!loading && containerMounted && containerWidth > 0 && widgetIds.length > 0 && (
          <GridLayout
            layout={gridLayout}
            width={containerWidth}
            onLayoutChange={onLayoutChange}
            gridConfig={{
              cols: 12,
              rowHeight: 50,
              margin: [16, 16] as const,
              containerPadding: [0, 0] as const,
              maxRows: Infinity,
            }}
            dragConfig={{
              enabled: editMode,
              handle: '.widget-drag-handle',
              bounded: false,
              threshold: 3,
            }}
            resizeConfig={{
              enabled: editMode,
              handles: ['se'] as const,
            }}
          >
            {widgetIds.map((widgetId) => {
              const config = WIDGET_REGISTRY.find(w => w.id === widgetId)
              if (!config) return <div key={widgetId} />
              const catInfo = CATEGORY_LABELS[config.category]

              return (
                <div
                  key={widgetId}
                  className={`bg-white rounded-xl border border-border shadow-sm ${editMode ? 'ring-2 ring-dashed ring-primary-200' : ''}`}
                  style={{ display: 'flex', flexDirection: 'column', height: '100%' }}
                >
                  {/* Widget Header */}
                  <div className={`flex items-center justify-between px-4 pt-3 pb-2 flex-shrink-0 widget-drag-handle ${editMode ? 'cursor-move' : ''}`}>
                    <div className="flex items-center gap-2">
                      {editMode && <GripVertical className="w-4 h-4 text-text-tertiary" />}
                      <span className="text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded" style={{ backgroundColor: catInfo.color + '15', color: catInfo.color }}>
                        {catInfo.label}
                      </span>
                      <h3 className="text-sm font-semibold text-text-primary">{config.name}</h3>
                    </div>
                    {editMode && (
                      <button
                        onClick={() => removeWidget(widgetId)}
                        className="p-1 rounded hover:bg-red-50 text-text-tertiary hover:text-red-500"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                  {/* Widget Body */}
                  <div className="px-4 pb-3 overflow-hidden" style={{ flex: 1, minHeight: 0 }}>
                    {renderWidget(widgetId)}
                  </div>
                </div>
              )
            })}
          </GridLayout>
        )}
      </div>

      {/* Add Widget Modal */}
      {showAddWidget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => setShowAddWidget(false)}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[80vh] overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <h2 className="text-lg font-semibold">위젯 추가</h2>
              <button onClick={() => setShowAddWidget(false)} className="p-1 rounded hover:bg-surface-tertiary">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 overflow-y-auto max-h-[60vh]">
              {(['revenue', 'sales', 'customer', 'operation'] as WidgetCategory[]).map(cat => {
                const catWidgets = WIDGET_REGISTRY.filter(w => w.category === cat)
                const catInfo = CATEGORY_LABELS[cat]
                return (
                  <div key={cat} className="mb-6">
                    <h3 className="text-sm font-semibold mb-3" style={{ color: catInfo.color }}>{catInfo.label} 분석</h3>
                    <div className="grid grid-cols-2 gap-2">
                      {catWidgets.map(w => {
                        const isAdded = widgetIds.includes(w.id)
                        return (
                          <button
                            key={w.id}
                            onClick={() => !isAdded && addWidget(w.id)}
                            disabled={isAdded}
                            className={`text-left p-3 rounded-lg border transition-all ${isAdded ? 'bg-surface-tertiary border-border opacity-50 cursor-not-allowed' : 'border-border hover:border-primary-300 hover:bg-primary-50/30'}`}
                          >
                            <div className="flex items-center gap-2 mb-1">
                              <span style={{ color: catInfo.color }}>{w.icon}</span>
                              <span className="text-sm font-medium">{w.name}</span>
                              {isAdded && <span className="text-[10px] bg-primary-100 text-primary-600 px-1.5 rounded">추가됨</span>}
                            </div>
                            <p className="text-xs text-text-tertiary">{w.description}</p>
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
