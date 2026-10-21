'use client'

import { useEffect, useState, useMemo, useCallback, Fragment } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { SearchSelect } from '@/components/ui/search-select'
import { Modal } from '@/components/ui/modal'
import { Loading } from '@/components/ui/loading'
import { EmptyState } from '@/components/ui/empty-state'
import { DateRangePicker, type DateRange } from '@/components/ui/date-range-picker'
import { formatCurrency, formatNumber, CHANNEL_SUB_SOURCES as SHARED_SUB_SOURCES } from '@/lib/utils'
import { toast } from 'sonner'
import { CompanyTagInput } from '@/components/ui/company-tag-input'
import { PageHeader, Toolbar, Tabs, DsButton, Skeleton, Empty, Drawer } from '@/components/ds'
import {
  Plus, BarChart3, TrendingUp, TrendingDown, MousePointerClick, Target,
  DollarSign, Trash2, Pencil, ChevronUp, ChevronDown,
  Users, MessageSquare, Building2, Wallet, Gauge, CalendarDays,
  RefreshCw, Link2, Lightbulb, AlertTriangle, CheckCircle2, Info
} from 'lucide-react'

// ─── Types ───────────────────────────────────────────────

interface AdPerformance {
  id: string
  date: string
  ad_type: string
  channel: string
  campaign_name: string
  adgroup_name: string | null
  campaign_id: string | null
  impressions: number
  clicks: number
  cost: number
  ga_visits: number
  inquiry_clicks: number
  signups: number
  inquiries: number
  adoptions: number
  signup_companies: string | null
  inquiry_companies: string | null
  adoption_companies: string | null
  notes: string | null
  created_at: string
}

interface CampaignOption {
  id: string
  name: string
  channel: string
  status: string
  budget?: number | null
}

interface AdGroupOption {
  id: string
  name: string
  campaign_id: string
  channel: string
  status: string
}

interface MarketingBudget {
  id: string
  year: number
  month: number
  channel: string
  budget_amount: number
}

type TabType = '전체' | '네이버' | '구글' | '메타' | '외주 블로그' | '콘텐츠' | '기타'
type SortField = 'date' | 'cost' | 'clicks' | 'signups'

// 10/21: 콘텐츠·기타(유입 기록)는 콘텐츠 성과 메뉴에서 본다 — 광고 성과는 광고비가 있는 채널만
const TABS: TabType[] = ['전체', '네이버', '구글', '메타', '외주 블로그']

const CHANNEL_OPTIONS = [
  { value: '네이버', label: '네이버' },
  { value: '구글', label: '구글' },
  { value: '메타', label: '메타 (FB/IG)' },
  { value: '유튜브', label: '유튜브' },
  { value: '검색유입', label: '검색유입 (오가닉)' },
  { value: '자사채널', label: '자사채널' },
  { value: '블로그', label: '블로그' },
  { value: '외주 블로그', label: '외주 블로그 (월 비용)' },
  { value: '언론', label: '언론' },
  { value: '이벤트', label: '이벤트/행사' },
  { value: '기타', label: '기타' },
]

const AD_TYPE_OPTIONS = [
  { value: '검색', label: '검색광고' },
  { value: '쇼핑', label: '쇼핑검색광고' },
  { value: 'SNS', label: 'SNS광고' },
  { value: '콘텐츠', label: '콘텐츠/유입' },
  { value: '영상', label: '영상광고' },
  { value: '오프라인', label: '오프라인/행사' },
  { value: '기타', label: '기타' },
]

// 채널별 서브소스 프리셋 (utils.ts 공유 + 광고성과 전용 확장)
const CHANNEL_SUB_SOURCES: Record<string, string[]> = {
  ...SHARED_SUB_SOURCES,
}

const CHANNEL_COLORS: Record<string, string> = {
  '네이버': 'bg-green-100 text-green-700',
  '구글': 'bg-blue-100 text-blue-700',
  '메타': 'bg-indigo-100 text-indigo-700',
  '유튜브': 'bg-red-100 text-red-700',
  '검색유입': 'bg-teal-100 text-teal-700',
  '자사채널': 'bg-cyan-100 text-cyan-700',
  '블로그': 'bg-emerald-100 text-emerald-700',
  '외주 블로그': 'bg-lime-100 text-lime-700',
  '언론': 'bg-purple-100 text-purple-700',
  '이벤트': 'bg-orange-100 text-orange-700',
  '기타': 'bg-gray-100 text-gray-700',
}

// 채널 → 탭 매핑
function channelToTab(channel: string): TabType {
  if (channel === '네이버') return '네이버'
  if (channel === '구글') return '구글'
  if (channel === '메타' || channel === '유튜브') return '메타'
  // 외주 블로그(팀부스터 등)는 월 비용이 있어서 광고처럼 비용 대비 문의·도입으로 본다
  if (channel === '외주 블로그') return '외주 블로그'
  if (channel === '블로그' || channel === '콘텐츠' || channel === '검색유입' || channel === '자사채널' || channel === '언론') return '콘텐츠'
  return '기타'
}

// 오가닉 채널 여부
function isOrganicChannel(channel: string) {
  return ['검색유입', '자사채널', '블로그', '언론'].includes(channel)
}

const emptyForm = {
  date: new Date().toISOString().split('T')[0],
  ad_type: '검색',
  channel: '네이버',
  campaign_name: '',
  campaign_id: '',
  adgroup_name: '',
  adgroup_id: '',
  impressions: 0,
  clicks: 0,
  cost: 0,
  ga_visits: 0,
  inquiry_clicks: 0,
  signups: 0,
  inquiries: 0,
  adoptions: 0,
  signup_companies: '',
  inquiry_companies: '',
  adoption_companies: '',
  notes: '',
}

// ─── Component ───────────────────────────────────────────

export default function AdsPage() {
  const [data, setData] = useState<AdPerformance[]>([])
  const [budgets, setBudgets] = useState<MarketingBudget[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<TabType>('전체')
  const [dateRange, setDateRange] = useState<DateRange>(() => {
    const now = new Date()
    const y = now.getFullYear()
    const m = now.getMonth() + 1
    const first = `${y}-${String(m).padStart(2, '0')}-01`
    const last = `${y}-${String(m).padStart(2, '0')}-${String(new Date(y, m, 0).getDate()).padStart(2, '0')}`
    return { from: first, to: last }
  })
  const [showModal, setShowModal] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  const [sortField, setSortField] = useState<SortField>('date')
  const [sortAsc, setSortAsc] = useState(false)
  const [campaigns, setCampaigns] = useState<CampaignOption[]>([])
  const [adgroups, setAdgroups] = useState<AdGroupOption[]>([])
  const [syncing, setSyncing] = useState<string | null>(null)
  const [syncOpen, setSyncOpen] = useState(false)
  const [foldedCh, setFoldedCh] = useState<Set<string>>(new Set())
  const [openKey, setOpenKey] = useState<string | null>(null)
  const [companyOptions, setCompanyOptions] = useState<{value: string, label: string, sub?: string}[]>([])
  const [dateLeadOptions, setDateLeadOptions] = useState<{value: string, label: string, sub?: string}[]>([])
  const supabase = createClient()

  // Derive year/month from date range for sync and budget
  const fromDate = new Date(dateRange.from)
  const year = fromDate.getFullYear()
  const m = fromDate.getMonth() + 1

  // Fetch campaigns + adgroups + company list for dropdown
  useEffect(() => {
    async function fetchCampaignsAndAdgroups() {
      const [campResult, agResult, leadsResult] = await Promise.all([
        supabase.from('campaigns').select('id, name, channel, status, budget')
          .in('status', ['진행중', '준비']).order('name'),
        supabase.from('ad_groups').select('id, name, campaign_id, channel, status')
          .eq('status', 'active').order('name'),
        supabase.from('pipeline_leads').select('id, company_name, stage, inquiry_source')
          .order('company_name').limit(2000),
      ])
      setCampaigns(campResult.data || [])
      setAdgroups(agResult.data || [])
      setCompanyOptions((leadsResult.data || []).map(l => ({
        value: l.id,
        label: l.company_name,
        sub: `${l.stage}${l.inquiry_source ? ' · ' + l.inquiry_source : ''}`,
      })))
    }
    fetchCampaignsAndAdgroups()
  }, [])

  const campaignOptions = useMemo(() =>
    campaigns
      .filter(c => !form.channel || c.channel === form.channel)
      .map(c => ({
        value: c.id,
        label: c.name,
        sub: `${c.channel} · ${c.status}`,
      })),
    [campaigns, form.channel]
  )

  // 광고그룹 옵션 (선택된 캠페인에 따라 필터)
  const adgroupOptions = useMemo(() =>
    adgroups
      .filter(ag => !form.campaign_id || ag.campaign_id === form.campaign_id)
      .map(ag => ({
        value: ag.id,
        label: ag.name,
        sub: campaigns.find(c => c.id === ag.campaign_id)?.name || '',
      })),
    [adgroups, form.campaign_id, campaigns]
  )

  // Auto sync handlers
  async function handleSync(platform: 'google' | 'naver' | 'ga4' | 'ga4-sources' | 'all') {
    setSyncing(platform)
    try {
      if (platform === 'all') {
        // 전체 동기화 — 선택 기간의 모든 월 병렬 처리
        const fromD = new Date(dateRange.from)
        const toD = new Date(dateRange.to)
        const months: { year: number; month: number }[] = []
        let cur = new Date(fromD.getFullYear(), fromD.getMonth(), 1)
        while (cur <= toD) {
          months.push({ year: cur.getFullYear(), month: cur.getMonth() + 1 })
          cur.setMonth(cur.getMonth() + 1)
        }

        toast.info(`${months.length}개월 동기화 시작...`)

        let googleTotal = 0, naverTotal = 0, googleOk = true, naverOk = true

        // 구글 + 네이버: 월별 병렬 처리
        for (const mo of months) {
          toast.loading(`${mo.year}년 ${mo.month}월 동기화 중...`, { id: 'sync-progress' })

          const [gRes, nRes] = await Promise.allSettled([
            fetch('/api/marketing/sync/google-ads', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(mo),
            }).then(r => r.json()),
            fetch('/api/marketing/sync/naver-ads', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(mo),
            }).then(r => r.json()),
          ])

          if (gRes.status === 'fulfilled' && gRes.value.success) googleTotal += (gRes.value.count || 0)
          else if (gRes.status === 'fulfilled' && gRes.value.status !== 'not_configured') googleOk = false

          if (nRes.status === 'fulfilled' && nRes.value.success) naverTotal += (nRes.value.count || 0)
          else if (nRes.status === 'fulfilled' && nRes.value.status !== 'not_configured') naverOk = false
        }

        // GA4 콘텐츠 + 유입소스: 병렬
        toast.loading('GA4 동기화 중...', { id: 'sync-progress' })
        const [ga4Res, srcRes] = await Promise.allSettled([
          fetch('/api/marketing/sync/ga4-content', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ startDate: dateRange.from, endDate: dateRange.to }),
          }).then(r => r.json()),
          fetch('/api/marketing/sync/ga4-sources', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ startDate: dateRange.from, endDate: dateRange.to }),
          }).then(r => r.json()),
        ])

        const ga4Result = ga4Res.status === 'fulfilled' && ga4Res.value.success ? `${ga4Res.value.count || 0}건` : 'failed'
        const sourcesResult = srcRes.status === 'fulfilled' && srcRes.value.success ? `${srcRes.value.count || 0}건` : 'failed'

        toast.dismiss('sync-progress')
        toast.success(`${months.length}개월 동기화 완료 — 구글: ${googleOk ? googleTotal + '건' : 'failed'}, 네이버: ${naverOk ? naverTotal + '건' : 'failed'}, GA4: ${ga4Result}, 유입소스: ${sourcesResult}`)
        fetchData()
      } else if (platform === 'ga4') {
        const res = await fetch('/api/marketing/sync/ga4-content', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ startDate: dateRange.from, endDate: dateRange.to }),
        })
        const result = await res.json()
        if (result.success) {
          toast.success(`GA4 콘텐츠 동기화 완료: ${result.count || 0}건`)
        } else {
          toast.info(result.message || '동기화 준비 중')
        }
      } else if (platform === 'ga4-sources') {
        const res = await fetch('/api/marketing/sync/ga4-sources', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ startDate: dateRange.from, endDate: dateRange.to }),
        })
        const result = await res.json()
        if (result.success) {
          toast.success(`유입 소스 동기화 완료: ${result.count || 0}건`)
          fetchData()
        } else {
          toast.info(result.message || '동기화 준비 중')
        }
      } else {
        // 구글/네이버 개별 동기화 — 선택 기간의 모든 월
        const endpoint = platform === 'google' ? 'google-ads' : 'naver-ads'
        const label = platform === 'google' ? '구글' : '네이버'
        const fromD = new Date(dateRange.from)
        const toD = new Date(dateRange.to)
        const months: { year: number; month: number }[] = []
        let cur = new Date(fromD.getFullYear(), fromD.getMonth(), 1)
        while (cur <= toD) {
          months.push({ year: cur.getFullYear(), month: cur.getMonth() + 1 })
          cur.setMonth(cur.getMonth() + 1)
        }

        let totalCount = 0
        let ok = true
        for (const mo of months) {
          try {
            const res = await fetch(`/api/marketing/sync/${endpoint}`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(mo),
            })
            const r = await res.json()
            if (r.success) totalCount += (r.count || 0)
            else if (r.status !== 'not_configured') ok = false
          } catch { ok = false }
        }

        if (ok) {
          toast.success(`${label} 광고 ${months.length}개월 동기화 완료: ${totalCount}건`)
          fetchData()
          const [campRes, agRes] = await Promise.all([
            supabase.from('campaigns').select('id, name, channel, status').in('status', ['진행중', '준비']).order('name'),
            supabase.from('ad_groups').select('id, name, campaign_id, channel, status').eq('status', 'active').order('name'),
          ])
          setCampaigns(campRes.data || [])
          setAdgroups(agRes.data || [])
        } else {
          toast.info(`${label} 광고 동기화 일부 실패`)
        }
      }
    } catch {
      toast.error('동기화 실패')
    }
    setSyncing(null)
  }

  const fetchData = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)

    // Fetch budgets for all months covered by the date range
    const fromD = new Date(dateRange.from)
    const toD = new Date(dateRange.to)
    const budgetMonths: { year: number; month: number }[] = []
    const cur = new Date(fromD.getFullYear(), fromD.getMonth(), 1)
    while (cur <= toD) {
      budgetMonths.push({ year: cur.getFullYear(), month: cur.getMonth() + 1 })
      cur.setMonth(cur.getMonth() + 1)
    }

    // 광고 데이터(1,000행 단위)와 예산을 동시에 읽는다 (2026-10-21: 순차 → 병렬)
    const fetchAds = async () => {
      let allAds: AdPerformance[] = []
      let offset = 0
      const batchSize = 1000
      while (true) {
        const { data: batch } = await supabase
          .from('ad_performance')
          .select('*')
          .gte('date', dateRange.from)
          .lte('date', dateRange.to)
          .order('date', { ascending: false })
          .range(offset, offset + batchSize - 1)
        if (!batch || batch.length === 0) break
        allAds = allAds.concat(batch)
        if (batch.length < batchSize) break
        offset += batchSize
      }
      return allAds
    }
    const budgetPromises = budgetMonths.map(bm =>
      supabase.from('marketing_budgets').select('*').eq('year', bm.year).eq('month', bm.month)
    )
    const [allAds, budgetResults] = await Promise.all([fetchAds(), Promise.all(budgetPromises)])
    const allBudgets: MarketingBudget[] = budgetResults.flatMap(r => r.data || [])

    const adsResult = { data: allAds, error: null as any }
    const budgetResult = { data: allBudgets, error: null as any }

    if (adsResult.error) {
      console.error('ad_performance fetch error:', JSON.stringify(adsResult.error))
      toast.error(`광고 데이터 로드 실패: ${adsResult.error.message || adsResult.error.code || '알 수 없는 오류'}`)
      setData([])
    } else {
      console.log(`ad_performance loaded: ${adsResult.data?.length || 0}건`)
      setData(adsResult.data || [])
    }

    if (budgetResult.error) {
      console.error('marketing_budgets fetch error:', budgetResult.error)
      setBudgets([])
    } else {
      setBudgets(budgetResult.data || [])
    }
    if (!silent) setLoading(false)
  }, [dateRange.from, dateRange.to])

  useEffect(() => { fetchData() }, [fetchData])

  // ─── Filtered & sorted data ─────────────────────────────

  const filtered = useMemo(() => {
    const items = tab === '전체'
      ? [...data]
      : data.filter(d => channelToTab(d.channel) === tab)
    items.sort((a, b) => {
      const aVal = a[sortField] as number | string
      const bVal = b[sortField] as number | string
      if (aVal < bVal) return sortAsc ? -1 : 1
      if (aVal > bVal) return sortAsc ? 1 : -1
      // 보조 정렬: 날짜(내림) → 채널 → 캠페인명 → 광고그룹명
      if (a.date !== b.date) return a.date > b.date ? -1 : 1
      if (a.channel !== b.channel) return a.channel < b.channel ? -1 : 1
      if (a.campaign_name !== b.campaign_name) return a.campaign_name < b.campaign_name ? -1 : 1
      const agA = a.adgroup_name || ''
      const agB = b.adgroup_name || ''
      return agA < agB ? -1 : agA > agB ? 1 : 0
    })
    return items
  }, [data, tab, sortField, sortAsc])

  // ─── Budget summary ─────────────────────────────────────

  const budgetSummary = useMemo(() => {
    // 10/21: 예산 = 진행 중 캠페인 월 예산 합 × 기간 개월 수 (입력을 캠페인 관리 한 곳으로). 비어 있으면 월 예산 입력값
    const fromM = new Date(dateRange.from), toM = new Date(dateRange.to)
    const months = Math.max(1, (toM.getFullYear() - fromM.getFullYear()) * 12 + toM.getMonth() - fromM.getMonth() + 1)
    const campBudget = campaigns.filter(c => c.status === '진행중' && (tab === '전체' || channelToTab(c.channel) === tab)).reduce((s, c) => s + (Number(c.budget) || 0), 0) * months
    const totalBudget = campBudget || budgets.reduce((s, b) => s + b.budget_amount, 0)
    const tabItems = tab === '전체'
      ? data
      : data.filter(d => channelToTab(d.channel) === tab)
    const totalSpent = tabItems.reduce((s, d) => s + d.cost, 0)
    // Calculate days in range
    const fromD = new Date(dateRange.from)
    const toD = new Date(dateRange.to)
    const totalDays = Math.round((toD.getTime() - fromD.getTime()) / 86400000) + 1
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const daysPassed = today > toD ? totalDays : today < fromD ? 0 : Math.round((today.getTime() - fromD.getTime()) / 86400000) + 1
    const burnRate = totalBudget > 0 ? (totalSpent / totalBudget * 100) : 0
    const timeRate = totalDays > 0 ? (daysPassed / totalDays * 100) : 0
    return { totalBudget, totalSpent, burnRate, timeRate, daysPassed, daysInMonth: totalDays }
  }, [budgets, data, tab, dateRange, campaigns])

  // ─── Performance KPIs ───────────────────────────────────

  const kpi = useMemo(() => {
    const items = tab === '전체' ? data : data.filter(d => channelToTab(d.channel) === tab)
    const totalCost = items.reduce((s, d) => s + d.cost, 0)
    const totalImpressions = items.reduce((s, d) => s + d.impressions, 0)
    const totalClicks = items.reduce((s, d) => s + d.clicks, 0)
    const totalGaVisits = items.reduce((s, d) => s + (d.ga_visits || 0), 0)
    const totalInquiryClicks = items.reduce((s, d) => s + (d.inquiry_clicks || 0), 0)
    const totalSignups = items.reduce((s, d) => s + d.signups, 0)
    const totalInquiries = items.reduce((s, d) => s + d.inquiries, 0)
    const totalAdoptions = items.reduce((s, d) => s + d.adoptions, 0)
    const ctr = totalImpressions > 0 ? (totalClicks / totalImpressions * 100) : 0
    const cpc = totalClicks > 0 ? Math.round(totalCost / totalClicks) : 0
    const cpa = (totalSignups + totalInquiries + totalAdoptions) > 0
      ? Math.round(totalCost / (totalSignups + totalInquiries + totalAdoptions))
      : 0
    return { totalCost, totalImpressions, totalClicks, totalGaVisits, totalInquiryClicks, ctr, cpc, totalSignups, totalInquiries, totalAdoptions, cpa }
  }, [data, tab])

  // ─── Channel subtotals ─────────────────────────────────

  const channelSubtotals = useMemo(() => {
    const items = tab === '전체' ? data : data.filter(d => channelToTab(d.channel) === tab)
    const groups: Record<string, { cost: number; impressions: number; clicks: number; ga_visits: number; inquiry_clicks: number; signups: number; inquiries: number; adoptions: number; count: number }> = {}
    items.forEach(d => {
      if (!groups[d.channel]) groups[d.channel] = { cost: 0, impressions: 0, clicks: 0, ga_visits: 0, inquiry_clicks: 0, signups: 0, inquiries: 0, adoptions: 0, count: 0 }
      groups[d.channel].cost += d.cost
      groups[d.channel].impressions += d.impressions
      groups[d.channel].clicks += d.clicks
      groups[d.channel].ga_visits += (d.ga_visits || 0)
      groups[d.channel].inquiry_clicks += (d.inquiry_clicks || 0)
      groups[d.channel].signups += d.signups
      groups[d.channel].inquiries += d.inquiries
      groups[d.channel].adoptions += d.adoptions
      groups[d.channel].count++
    })
    return groups
  }, [data, tab])

  // ─── Auto Insights ─────────────────────────────────────

  interface Insight {
    type: 'danger' | 'warning' | 'success' | 'info'
    icon: React.ReactNode
    title: string
    description: string
  }

  const insights = useMemo<Insight[]>(() => {
    if (data.length === 0) return []
    const result: Insight[] = []
    const items = tab === '전체' ? data : data.filter(d => channelToTab(d.channel) === tab)
    if (items.length === 0) return []

    // 1. 예산 소진율 vs 기간 경과율 비교
    if (budgetSummary.totalBudget > 0) {
      const gap = budgetSummary.burnRate - budgetSummary.timeRate
      if (gap > 20) {
        result.push({
          type: 'danger',
          icon: <AlertTriangle className="w-4 h-4" />,
          title: '예산 초과 소진 경고',
          description: `소진율 ${budgetSummary.burnRate.toFixed(0)}%이지만 기간 경과는 ${budgetSummary.timeRate.toFixed(0)}%입니다. 현재 속도면 예산이 조기 소진됩니다.`,
        })
      } else if (gap < -30 && budgetSummary.timeRate > 50) {
        result.push({
          type: 'info',
          icon: <Info className="w-4 h-4" />,
          title: '예산 집행 부족',
          description: `기간 ${budgetSummary.timeRate.toFixed(0)}% 경과했으나 소진율은 ${budgetSummary.burnRate.toFixed(0)}%입니다. 남은 예산 활용 전략이 필요합니다.`,
        })
      }
    }

    // 2. 채널별 CPC 비교 — 가장 비싼 vs 가장 저렴한
    const channelCpcs = Object.entries(channelSubtotals)
      .filter(([_, t]) => t.clicks > 10 && t.cost > 0)
      .map(([ch, t]) => ({ channel: ch, cpc: Math.round(t.cost / t.clicks), clicks: t.clicks, cost: t.cost }))
      .sort((a, b) => a.cpc - b.cpc)

    if (channelCpcs.length >= 2) {
      const cheapest = channelCpcs[0]
      const expensive = channelCpcs[channelCpcs.length - 1]
      if (expensive.cpc > cheapest.cpc * 2.5) {
        result.push({
          type: 'warning',
          icon: <TrendingUp className="w-4 h-4" />,
          title: `${expensive.channel} CPC가 ${cheapest.channel}의 ${(expensive.cpc / cheapest.cpc).toFixed(1)}배`,
          description: `${expensive.channel} CPC ${formatCurrency(expensive.cpc)} vs ${cheapest.channel} ${formatCurrency(cheapest.cpc)}. 예산 재배분을 검토하세요.`,
        })
      }
    }

    // 3. CTR 낮은 채널 경고
    Object.entries(channelSubtotals).forEach(([ch, t]) => {
      if (t.impressions > 500 && t.clicks > 0) {
        const ctr = t.clicks / t.impressions * 100
        if (ctr < 0.5 && !isOrganicChannel(ch)) {
          result.push({
            type: 'warning',
            icon: <MousePointerClick className="w-4 h-4" />,
            title: `${ch} CTR ${ctr.toFixed(2)}% — 소재 점검 필요`,
            description: `노출 ${formatNumber(t.impressions)}회 대비 클릭이 매우 낮습니다. 광고 소재/키워드 변경을 검토하세요.`,
          })
        }
      }
    })

    // 4. 전환(가입+문의+도입) 없는 채널 중 비용 높은 것
    Object.entries(channelSubtotals).forEach(([ch, t]) => {
      const conversions = t.signups + t.inquiries + t.adoptions
      if (t.cost > 500000 && conversions === 0) {
        result.push({
          type: 'danger',
          icon: <AlertTriangle className="w-4 h-4" />,
          title: `${ch} ${formatCurrency(t.cost)} 집행, 전환 0건`,
          description: `비용 대비 전환이 없습니다. 캠페인 목표/타겟 재검토가 필요합니다.`,
        })
      }
    })

    // 5. 가장 효율적인 채널 (CPA 최저)
    const channelCpas = Object.entries(channelSubtotals)
      .filter(([_, t]) => (t.signups + t.inquiries + t.adoptions) > 0 && t.cost > 0)
      .map(([ch, t]) => ({
        channel: ch,
        cpa: Math.round(t.cost / (t.signups + t.inquiries + t.adoptions)),
        conversions: t.signups + t.inquiries + t.adoptions,
      }))
      .sort((a, b) => a.cpa - b.cpa)

    if (channelCpas.length > 0) {
      const best = channelCpas[0]
      result.push({
        type: 'success',
        icon: <CheckCircle2 className="w-4 h-4" />,
        title: `${best.channel} CPA ${formatCurrency(best.cpa)} — 가장 효율적`,
        description: `${best.conversions}건 전환, 결과당 비용이 가장 낮습니다. 이 채널에 예산 확대를 고려하세요.`,
      })
    }

    // 6. GA유입 대비 문의클릭 전환율
    if (kpi.totalGaVisits > 50) {
      const gaToInquiry = kpi.totalInquiryClicks / kpi.totalGaVisits * 100
      if (gaToInquiry < 1) {
        result.push({
          type: 'info',
          icon: <TrendingDown className="w-4 h-4" />,
          title: `사이트 유입 → 문의 전환율 ${gaToInquiry.toFixed(1)}%`,
          description: `GA유입 ${formatNumber(kpi.totalGaVisits)}건 중 문의클릭 ${formatNumber(kpi.totalInquiryClicks)}건. 랜딩페이지/CTA 개선으로 전환율을 높일 수 있습니다.`,
        })
      } else if (gaToInquiry > 5) {
        result.push({
          type: 'success',
          icon: <CheckCircle2 className="w-4 h-4" />,
          title: `사이트 문의 전환율 ${gaToInquiry.toFixed(1)}% — 우수`,
          description: `GA유입 대비 문의클릭 비율이 높습니다. 현재 랜딩페이지/CTA가 효과적입니다.`,
        })
      }
    }

    // 7. 오가닉 vs 유료 비중
    const organicVisits = Object.entries(channelSubtotals)
      .filter(([ch]) => isOrganicChannel(ch))
      .reduce((s, [_, t]) => s + t.ga_visits, 0)
    const paidVisits = Object.entries(channelSubtotals)
      .filter(([ch]) => !isOrganicChannel(ch))
      .reduce((s, [_, t]) => s + t.ga_visits, 0)
    const totalVisits = organicVisits + paidVisits
    if (totalVisits > 50 && organicVisits > 0) {
      const organicPct = organicVisits / totalVisits * 100
      if (organicPct > 60) {
        result.push({
          type: 'success',
          icon: <CheckCircle2 className="w-4 h-4" />,
          title: `오가닉 유입 ${organicPct.toFixed(0)}% — 건강한 비중`,
          description: `유료 광고 의존도가 낮고 자연 유입이 높습니다. 콘텐츠 전략이 효과적입니다.`,
        })
      } else if (organicPct < 20 && paidVisits > 100) {
        result.push({
          type: 'info',
          icon: <Info className="w-4 h-4" />,
          title: `유료 광고 의존도 ${(100 - organicPct).toFixed(0)}%`,
          description: `오가닉 유입이 ${organicPct.toFixed(0)}%로 낮습니다. SEO/콘텐츠 마케팅으로 자연 유입을 늘리면 장기적으로 비용 절감됩니다.`,
        })
      }
    }

    return result
  }, [data, tab, kpi, channelSubtotals, budgetSummary])

  // ─── Actions ────────────────────────────────────────────

  function openAdd() {
    setEditId(null)
    setForm(emptyForm)
    fetchLeadsForDate(emptyForm.date)
    setShowModal(true)
  }

  // 해당 날짜에 유입된 리드만 가져오기
  async function fetchLeadsForDate(dateStr: string) {
    if (!dateStr) { setDateLeadOptions([]); return }
    // inquiry_date(유입일) 기준으로 필터 — created_at이 아닌 실제 유입일
    const { data } = await supabase.from('pipeline_leads')
      .select('id, company_name, stage, inquiry_source, inquiry_channel')
      .eq('inquiry_date', dateStr)
      .order('company_name')
      .limit(200)
    setDateLeadOptions((data || []).map(l => ({
      value: l.id,
      label: l.company_name,
      sub: `${l.stage}${l.inquiry_channel ? ' · ' + l.inquiry_channel : ''}${l.inquiry_source ? ' · ' + l.inquiry_source : ''}`,
    })))
  }

  function openEdit(item: AdPerformance) {
    setEditId(item.id)
    setForm({
      date: item.date,
      ad_type: item.ad_type || '검색',
      channel: item.channel,
      campaign_name: item.campaign_name,
      campaign_id: item.campaign_id || '',
      adgroup_name: item.adgroup_name || '',
      adgroup_id: (item as any).adgroup_id || '',
      impressions: item.impressions,
      clicks: item.clicks,
      cost: item.cost,
      ga_visits: item.ga_visits || 0,
      inquiry_clicks: item.inquiry_clicks || 0,
      signups: item.signups || 0,
      inquiries: item.inquiries || 0,
      adoptions: item.adoptions || 0,
      signup_companies: item.signup_companies || '',
      inquiry_companies: item.inquiry_companies || '',
      adoption_companies: item.adoption_companies || '',
      notes: item.notes || '',
    })
    fetchLeadsForDate(item.date)
    setShowModal(true)
  }

  // 마케팅 데이터 → pipeline_leads 스테이지 연동
  async function syncLeadsFromMarketing(payload: Record<string, any>) {
    const channel = payload.channel || ''
    const campaignName = payload.campaign_name || ''

    // 문의사 → 컨택 스테이지로 업데이트 (신규리드인 경우만)
    if (payload.inquiry_companies) {
      const companies = payload.inquiry_companies.split(',').map((s: string) => s.trim()).filter(Boolean)
      for (const name of companies) {
        const { data: leads } = await supabase.from('pipeline_leads')
          .select('id, stage')
          .eq('company_name', name)
          .in('stage', ['신규리드'])
          .limit(1)
        if (leads && leads.length > 0) {
          await supabase.from('pipeline_leads')
            .update({
              stage: '컨택',
              inquiry_source: channel,
              notes: `마케팅 문의 (${campaignName}, ${payload.date})`,
            })
            .eq('id', leads[0].id)
        }
      }
    }

    // 도입사 → 도입완료 스테이지로 업데이트
    if (payload.adoption_companies) {
      const companies = payload.adoption_companies.split(',').map((s: string) => s.trim()).filter(Boolean)
      for (const name of companies) {
        const { data: leads } = await supabase.from('pipeline_leads')
          .select('id, stage')
          .eq('company_name', name)
          .not('stage', 'eq', '도입완료')
          .limit(1)
        if (leads && leads.length > 0) {
          await supabase.from('pipeline_leads')
            .update({
              stage: '도입완료',
              converted_at: new Date(payload.date).toISOString(),
            })
            .eq('id', leads[0].id)
        }
      }
    }
  }

  async function updateCampaignSpend(campaignId: string | null) {
    if (!campaignId) return
    const { data: rows } = await supabase
      .from('ad_performance')
      .select('cost')
      .eq('campaign_id', campaignId)
    const totalSpend = (rows || []).reduce((s, r) => s + (Number(r.cost) || 0), 0)
    await supabase
      .from('campaigns')
      .update({ actual_spend: totalSpend })
      .eq('id', campaignId)
  }

  async function handleSave() {
    if (!form.campaign_name.trim()) {
      toast.error(isOrganicChannel(form.channel) ? '소스를 선택하세요' : '캠페인명을 입력하세요')
      return
    }
    setSaving(true)
    // campaign_id로 campaign_name 자동 채움
    let campaignName = form.campaign_name.trim()
    if (form.campaign_id) {
      const c = campaigns.find(c => c.id === form.campaign_id)
      if (c) campaignName = c.name
    }
    // 광고그룹명 자동 채움
    let adgroupName = form.adgroup_name?.trim() || null
    if (form.adgroup_id) {
      const ag = adgroups.find(a => a.id === form.adgroup_id)
      if (ag) adgroupName = ag.name
    }

    const payload: Record<string, any> = {
      date: form.date,
      ad_type: form.ad_type,
      channel: form.channel,
      campaign_name: campaignName,
      campaign_id: form.campaign_id || null,
      adgroup_name: adgroupName,
      adgroup_id: form.adgroup_id || null,
      impressions: Number(form.impressions) || 0,
      clicks: Number(form.clicks) || 0,
      cost: Number(form.cost) || 0,
      ga_visits: Number(form.ga_visits) || 0,
      inquiry_clicks: Number(form.inquiry_clicks) || 0,
      signups: Number(form.signups) || 0,
      inquiries: Number(form.inquiries) || 0,
      adoptions: Number(form.adoptions) || 0,
      signup_companies: form.signup_companies?.trim() || null,
      inquiry_companies: form.inquiry_companies?.trim() || null,
      adoption_companies: form.adoption_companies?.trim() || null,
      notes: form.notes?.trim() || null,
    }

    let saveOk = false
    if (editId) {
      const { error } = await supabase.from('ad_performance').update(payload).eq('id', editId)
      if (error) toast.error('수정 실패: ' + error.message)
      else { toast.success('수정 완료'); saveOk = true }
    } else {
      payload.data_source = 'manual'
      const { error } = await supabase.from('ad_performance').insert(payload)
      if (error) toast.error('저장 실패: ' + error.message)
      else { toast.success('저장 완료'); saveOk = true }
    }
    if (saveOk && payload.campaign_id) {
      await updateCampaignSpend(payload.campaign_id)
    }
    setSaving(false)
    setShowModal(false)
    // 마케팅 데이터 → 고객 데이터 연동 (백그라운드)
    if (saveOk) {
      syncLeadsFromMarketing(payload)
    }
    fetchData(true)
  }

  async function handleDelete(id: string) {
    if (!confirm('삭제하시겠습니까?')) return
    const row = data.find(d => d.id === id)
    const { error } = await supabase.from('ad_performance').delete().eq('id', id)
    if (error) toast.error('삭제 실패')
    else {
      toast.success('삭제 완료')
      if (row?.campaign_id) await updateCampaignSpend(row.campaign_id)
      fetchData(true)
    }
  }

  function toggleSort(field: SortField) {
    if (sortField === field) setSortAsc(!sortAsc)
    else { setSortField(field); setSortAsc(true) }
  }

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return null
    return sortAsc ? <ChevronUp className="w-3 h-3 inline ml-0.5" /> : <ChevronDown className="w-3 h-3 inline ml-0.5" />
  }

  // ─── Render ─────────────────────────────────────────────

  // ─── 광고 표: 광고비·노출이 있는 행만, 채널 › 캠페인 › 광고그룹 기간 합계 (10/21) ───
  type AdTot = { cost: number; impressions: number; clicks: number; ga: number; inqClicks: number; inquiries: number; adoptions: number }
  const isAdRow = (d: AdPerformance) => d.ad_type !== '콘텐츠' || d.cost > 0 || d.impressions > 0
  const AD_CH_COLOR: Record<string, string> = { '네이버': 'var(--ds-ok)', '구글': 'var(--ds-info)', '메타': 'var(--ds-info)', '유튜브': 'var(--ds-bad)', '외주 블로그': 'var(--ds-warn)' }
  const add = (t: AdTot, d: AdPerformance) => { t.cost += d.cost; t.impressions += d.impressions; t.clicks += d.clicks; t.ga += d.ga_visits || 0; t.inqClicks += d.inquiry_clicks || 0; t.inquiries += d.inquiries; t.adoptions += d.adoptions }
  const zero = (): AdTot => ({ cost: 0, impressions: 0, clicks: 0, ga: 0, inqClicks: 0, inquiries: 0, adoptions: 0 })
  const { adGroups, adTotal, rowByKey } = useMemo(() => {
    const items = data.filter(d => isAdRow(d) && (tab === '전체' || channelToTab(d.channel) === tab))
    const rows = new Map<string, AdTot & { key: string; ch: string; campaign: string; campaignId: string | null; adgroup: string; type: string; days: AdPerformance[] }>()
    for (const d of items) {
      const key = `${d.channel}|${d.campaign_name}|${d.adgroup_name || ''}`
      if (!rows.has(key)) rows.set(key, { key, ch: d.channel, campaign: d.campaign_name, campaignId: d.campaign_id, adgroup: d.adgroup_name || '', type: d.ad_type, days: [], ...zero() })
      const r = rows.get(key)!; add(r, d); r.days.push(d); if (d.campaign_id) r.campaignId = d.campaign_id
    }
    const byCh = new Map<string, typeof rowList>()
    const rowList = Array.from(rows.values())
    for (const r of rowList) { r.days.sort((a, b) => b.date.localeCompare(a.date)); (byCh.get(r.ch) || byCh.set(r.ch, []).get(r.ch)!).push(r) }
    const total = zero(); items.forEach(d => add(total, d))
    const groups = Array.from(byCh.entries()).map(([ch, rs]) => { const tot = zero(); rs.forEach(r => r.days.forEach(d => add(tot, d))); return { ch, rows: rs.sort((a, b) => b.cost - a.cost), tot } }).sort((a, b) => b.tot.cost - a.tot.cost)
    return { adGroups: groups, adTotal: total, rowByKey: rows }
  }, [data, tab])
  const openRow = openKey ? rowByKey.get(openKey) || null : null
  const AdNums = ({ t }: { t: AdTot }) => (<>
    <td className="num font-medium">{t.cost ? formatCurrency(t.cost) : '—'}</td>
    <td className="num">{t.impressions ? formatNumber(t.impressions) : '—'}</td>
    <td className="num">{t.clicks ? formatNumber(t.clicks) : '—'}</td>
    <td className="num muted">{t.impressions > 0 ? (t.clicks / t.impressions * 100).toFixed(2) + '%' : '—'}</td>
    <td className="num muted">{t.impressions > 0 ? formatCurrency(Math.round(t.cost / t.impressions * 1000)) : '—'}</td>
    <td className="num">{t.ga || '—'}</td>
    <td className="num">{t.inqClicks || '—'}</td>
    <td className="num">{t.inquiries || '—'}</td>
    <td className="num">{t.adoptions || '—'}</td>
  </>)

  const SYNCS: { key: string; label: string }[] = [{ key: 'all', label: '전체 동기화' }, { key: 'google', label: '구글' }, { key: 'naver', label: '네이버' }, { key: 'ga4', label: 'GA4' }, { key: 'ga4-sources', label: '유입소스' }]
  const dot = { danger: 'var(--ds-bad)', warning: 'var(--ds-warn)', success: 'var(--ds-ok)', info: 'var(--ds-info)' } as const
  const Kpi = ({ label, value, sub, bar }: { label: string; value: string; sub?: string; bar?: number }) => (
    <div className="py-2.5 pr-4 md:pl-4 md:border-l border-ds-line2 first:border-l-0 first:pl-0 min-w-0">
      <div className="text-[12px] text-ds-fg3">{label}</div>
      <b className="text-[18px] font-semibold tabular-nums text-ds-fg">{value}</b>
      {bar != null && <div className="h-1 rounded-full bg-ds-line2 mt-1 max-w-[160px]"><div className="h-1 rounded-full bg-ds-warn" style={{ width: `${Math.min(bar, 100)}%` }} /></div>}
      {sub && <div className="text-[11.5px] text-ds-fg3 truncate mt-0.5">{sub}</div>}
    </div>
  )

  // 레이아웃 정의 v1 "집계" 유형: 제목줄 → 탭·동기화 → 숫자줄(5) → 표. 색은 상태에만
  return (
    <div>
      <PageHeader title="광고 성과"
        actions={<>
          <DateRangePicker value={dateRange} onChange={setDateRange} />
          <div className="relative">
            <DsButton size="sm" loading={!!syncing} onClick={() => setSyncOpen(o => !o)} icon={<RefreshCw className="w-3.5 h-3.5" />}>{syncing ? '동기화 중' : '동기화'}</DsButton>
            {syncOpen && !syncing && (
              <div className="absolute right-0 top-9 z-30 w-36 py-1 bg-ds-bg border border-ds-line rounded-lg shadow-[0_8px_24px_rgba(0,0,0,.08)]" onMouseLeave={() => setSyncOpen(false)}>
                {SYNCS.map(s => <button key={s.key} onClick={() => { setSyncOpen(false); handleSync(s.key as Parameters<typeof handleSync>[0]) }} className="w-full text-left px-3 h-8 text-[13px] text-ds-fg hover:bg-ds-subtle">{s.label}</button>)}
              </div>
            )}
          </div>
          <DsButton size="sm" variant="primary" onClick={openAdd} icon={<Plus className="w-3.5 h-3.5" />}>데이터 입력</DsButton>
        </>} />

      <Toolbar>
        <Tabs value={tab} onChange={v => setTab(v)} options={TABS.map(t => ({ value: t, label: t }))} />
      </Toolbar>

      <div className="grid grid-cols-2 md:grid-cols-5 border-y border-ds-line mb-4">
        <Kpi label="집행비" value={formatCurrency(budgetSummary.totalSpent)} bar={budgetSummary.burnRate}
          sub={`예산 ${formatCurrency(budgetSummary.totalBudget)} · 소진 ${budgetSummary.burnRate.toFixed(1)}% · 기간 ${budgetSummary.daysPassed}/${budgetSummary.daysInMonth}일`} />
        <Kpi label="클릭" value={formatNumber(kpi.totalClicks)} sub={`노출 ${formatNumber(kpi.totalImpressions)} · CTR ${kpi.ctr.toFixed(2)}% · CPC ${formatCurrency(kpi.cpc)}`} />
        <Kpi label="GA 유입" value={formatNumber(kpi.totalGaVisits)} sub={`문의 클릭 ${formatNumber(kpi.totalInquiryClicks)}`} />
        <Kpi label="문의사" value={formatNumber(kpi.totalInquiries)} sub={`가입사 ${formatNumber(kpi.totalSignups)}`} />
        <Kpi label="도입사" value={formatNumber(kpi.totalAdoptions)} sub={kpi.cpa > 0 ? `결과당 ${formatCurrency(kpi.cpa)}` : undefined} />
      </div>

      {loading ? <Skeleton rows={10} /> : adGroups.length === 0 ? (
        <Empty text="이 기간에 광고비가 쓰인 기록이 없습니다" action={<DsButton size="sm" onClick={openAdd}>데이터 입력</DsButton>} />
      ) : (
        <div className="ds-wrap max-h-[calc(100vh-300px)]">
          <table className="ds-table is-clickable is-fixed">
            <colgroup>{[22, 15, 6, 10, 8, 6, 6, 7, 6, 6, 4, 4].map((w, i) => <col key={i} style={{ width: `${w}%` }} />)}</colgroup>
            <thead><tr><th>캠페인</th><th>광고그룹</th><th>유형</th><th>비용</th><th>노출</th><th>클릭</th><th>CTR</th><th>CPM</th><th>GA 유입</th><th>문의 클릭</th><th>문의</th><th>도입</th></tr></thead>
            <tbody>
              {adGroups.map(g => {
                const color = AD_CH_COLOR[g.ch] || 'var(--ds-na)'
                const isFolded = foldedCh.has(g.ch)
                return (
                  <Fragment key={g.ch}>
                    <tr className="cursor-pointer select-none [&>td]:!h-[42px] [&>td]:!bg-ds-bg [&>td]:border-b [&>td]:border-ds-line [&>td]:text-[13.5px] [&>td]:font-semibold"
                      onClick={() => setFoldedCh(f => { const n = new Set(f); n.has(g.ch) ? n.delete(g.ch) : n.add(g.ch); return n })} title={isFolded ? '펼치기' : '접기'}>
                      <td colSpan={2} style={{ boxShadow: `inset 4px 0 0 ${color}`, paddingLeft: 12 }}>
                        <span className="inline-flex items-center gap-1.5"><ChevronDown className={`w-4 h-4 text-ds-fg3 transition-transform ${isFolded ? '-rotate-90' : ''}`} />{g.ch}<span className="text-ds-fg3 font-normal text-[11.5px] ml-1">{g.rows.length}개 광고그룹</span></span>
                      </td>
                      <td />
                      <AdNums t={g.tot} />
                    </tr>
                    {!isFolded && g.rows.map(r => (
                      <tr key={r.key} className={`ds-row ${openKey === r.key ? 'is-active' : ''}`} onClick={() => setOpenKey(r.key)}>
                        <td className="font-medium" style={{ boxShadow: `inset 4px 0 0 ${color}`, paddingLeft: 16 }} title={r.campaign}>
                          {r.campaign}{!r.campaignId && <Link2 className="w-3 h-3 inline ml-1 text-ds-warn" aria-label="캠페인 연결 안 됨" />}
                        </td>
                        <td className="muted" title={r.adgroup}>{r.adgroup || '—'}</td>
                        <td className="c muted">{r.type}</td>
                        <AdNums t={r} />
                      </tr>
                    ))}
                  </Fragment>
                )
              })}
              <tr className="ds-sum"><td colSpan={3}>광고 합계</td><AdNums t={adTotal} /></tr>
            </tbody>
          </table>
        </div>
      )}

      <Drawer open={!!openRow} onClose={() => setOpenKey(null)} width="60vw"
        title={openRow ? `${openRow.campaign}${openRow.adgroup ? ' › ' + openRow.adgroup : ''}` : ''}
        meta={openRow ? `${openRow.ch} · ${openRow.type} · ${openRow.days.length}일 · 비용 ${formatCurrency(openRow.cost)} · 클릭 ${formatNumber(openRow.clicks)} · 문의 ${openRow.inquiries}` : ''}>
        {openRow && (
          <div className="p-4">
            <div className="ds-wrap">
              <table className="ds-table is-fixed">
                <colgroup>{[12, 13, 11, 9, 9, 11, 9, 9, 7, 10].map((w, i) => <col key={i} style={{ width: `${w}%` }} />)}</colgroup>
                <thead><tr><th>날짜</th><th>비용</th><th>노출</th><th>클릭</th><th>CTR</th><th>GA 유입</th><th>문의 클릭</th><th>문의</th><th>도입</th><th></th></tr></thead>
                <tbody>
                  {openRow.days.map(d => (
                    <tr key={d.id} className="ds-row group">
                      <td className="c">{d.date.slice(5).replace('-', '.')}</td>
                      <td className="num">{formatCurrency(d.cost)}</td><td className="num">{formatNumber(d.impressions)}</td><td className="num">{formatNumber(d.clicks)}</td>
                      <td className="num muted">{d.impressions > 0 ? (d.clicks / d.impressions * 100).toFixed(2) + '%' : '—'}</td>
                      <td className="num">{d.ga_visits || '—'}</td><td className="num">{d.inquiry_clicks || '—'}</td>
                      <td className="num" title={d.inquiry_companies || ''}>{d.inquiries || '—'}</td><td className="num" title={d.adoption_companies || ''}>{d.adoptions || '—'}</td>
                      <td className="c"><span className="inline-flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onClick={() => openEdit(d)} className="icon-btn" title="수정"><Pencil className="w-3.5 h-3.5" /></button>
                        <button onClick={() => handleDelete(d.id)} className="icon-btn hover:!text-ds-bad" title="삭제"><Trash2 className="w-3.5 h-3.5" /></button>
                      </span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </Drawer>

      {!loading && insights.length > 0 && (
        <div className="mt-6">
          <div className="flex items-baseline gap-2 mb-2"><h2 className="text-[14px] font-medium text-ds-fg">자동 인사이트</h2><span className="text-[12px] text-ds-fg3">{insights.length}건</span></div>
          <div className="ds-wrap divide-y divide-ds-line2">
            {insights.map((insight, i) => (
              <div key={i} className="flex items-start gap-2.5 px-3 py-2.5">
                <span className="mt-1.5 w-2 h-2 rounded-full flex-shrink-0" style={{ background: dot[insight.type] }} />
                <div className="min-w-0">
                  <p className="text-[13px] font-medium text-ds-fg">{insight.title}</p>
                  <p className="text-[12px] text-ds-fg2 mt-0.5">{insight.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Modal */}
      <Modal open={showModal} onClose={() => setShowModal(false)}
        title={editId ? '데이터 수정' : '데이터 입력'}>
        <div className="grid grid-cols-2 gap-3">
          <Input label="날짜" type="date" value={form.date}
            onChange={e => { setForm({ ...form, date: e.target.value }); fetchLeadsForDate(e.target.value) }} />
          <Select label="광고유형" options={AD_TYPE_OPTIONS} value={form.ad_type}
            onChange={e => setForm({ ...form, ad_type: e.target.value })} />
          <Select label="채널" options={CHANNEL_OPTIONS} value={form.channel}
            onChange={e => {
              const newChannel = e.target.value
              const subSources = CHANNEL_SUB_SOURCES[newChannel]
              const currentCampaign = campaigns.find(c => c.id === form.campaign_id)
              const keepCampaign = currentCampaign && currentCampaign.channel === newChannel
              setForm({
                ...form,
                channel: newChannel,
                ad_type: isOrganicChannel(newChannel) ? '콘텐츠' : form.ad_type,
                campaign_id: keepCampaign ? form.campaign_id : '',
                campaign_name: subSources ? subSources[0] : (keepCampaign ? form.campaign_name : ''),
              })
            }} />
          {/* 서브소스 프리셋 (오가닉 채널) */}
          {CHANNEL_SUB_SOURCES[form.channel] && (
            <Select label="소스" options={CHANNEL_SUB_SOURCES[form.channel].map(s => ({ value: s, label: s }))}
              value={form.campaign_name}
              onChange={e => setForm({ ...form, campaign_name: e.target.value })} />
          )}
          {/* 유료 광고 전용 필드 */}
          {!isOrganicChannel(form.channel) && (
            <>
              <div className="col-span-2">
                <SearchSelect label="캠페인" placeholder="캠페인 선택..."
                  options={campaignOptions} value={form.campaign_id}
                  onChange={val => {
                    const c = campaigns.find(c => c.id === val)
                    setForm({
                      ...form,
                      campaign_id: val,
                      campaign_name: c ? c.name : form.campaign_name,
                      channel: c ? c.channel : form.channel,
                      adgroup_id: '',
                      adgroup_name: '',
                    })
                  }} />
              </div>
              <div className="col-span-2">
                <SearchSelect label="광고그룹" placeholder="광고그룹 선택..."
                  options={adgroupOptions} value={form.adgroup_id}
                  onChange={val => {
                    const ag = adgroups.find(a => a.id === val)
                    setForm({
                      ...form,
                      adgroup_id: val,
                      adgroup_name: ag ? ag.name : form.adgroup_name,
                      ...(ag && !form.campaign_id ? {
                        campaign_id: ag.campaign_id,
                        campaign_name: campaigns.find(c => c.id === ag.campaign_id)?.name || form.campaign_name,
                      } : {}),
                    })
                  }} />
              </div>
              <Input label="캠페인명 (직접 입력)" value={form.campaign_name}
                onChange={e => setForm({ ...form, campaign_name: e.target.value })}
                placeholder="캠페인 미선택 시 직접 입력" />
              <Input label="광고그룹명 (직접 입력)" value={form.adgroup_name}
                onChange={e => setForm({ ...form, adgroup_name: e.target.value })}
                placeholder="광고그룹 미선택 시 직접 입력" />
            </>
          )}
          {/* 비용/노출/클릭 — 오가닉은 비용만 (보통 0) */}
          {!isOrganicChannel(form.channel) ? (
            <>
              <Input label="비용 (원)" type="number" value={form.cost}
                onChange={e => setForm({ ...form, cost: Number(e.target.value) })} />
              <Input label="노출수" type="number" value={form.impressions}
                onChange={e => setForm({ ...form, impressions: Number(e.target.value) })} />
              <Input label="클릭수" type="number" value={form.clicks}
                onChange={e => setForm({ ...form, clicks: Number(e.target.value) })} />
              <Input label="GA유입" type="number" value={form.ga_visits}
                onChange={e => setForm({ ...form, ga_visits: Number(e.target.value) })} />
              <Input label="문의클릭" type="number" value={form.inquiry_clicks}
                onChange={e => setForm({ ...form, inquiry_clicks: Number(e.target.value) })} />
            </>
          ) : (
            <div className="col-span-2 p-3 bg-teal-50/50 rounded-lg border border-teal-100">
              <p className="text-xs text-teal-600 mb-2 font-medium">유입 추적 (비용 없는 오가닉 채널)</p>
              <div className="grid grid-cols-2 gap-2">
                <Input label="GA유입 (세션)" type="number" value={form.ga_visits}
                  onChange={e => setForm({ ...form, ga_visits: Number(e.target.value) })} />
                <Input label="문의클릭 (이벤트)" type="number" value={form.inquiry_clicks}
                  onChange={e => setForm({ ...form, inquiry_clicks: Number(e.target.value) })} />
              </div>
            </div>
          )}
          <div className="col-span-2 p-3 bg-blue-50/50 rounded-lg border border-blue-100 space-y-2">
            <p className="text-xs font-medium text-blue-600">가입/문의</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Input label="가입사 수" type="number" value={form.signups}
                  onChange={e => setForm({ ...form, signups: Number(e.target.value) })} />
                <CompanyTagInput label="가입 회사명" options={companyOptions}
                  value={form.signup_companies}
                  onChange={v => setForm({ ...form, signup_companies: v })}
                  placeholder="회사 검색..." />
              </div>
              <div className="space-y-2">
                <Input label="문의사 수" type="number" value={form.inquiries}
                  onChange={e => setForm({ ...form, inquiries: Number(e.target.value) })} />
                <CompanyTagInput label={`문의 회사명${dateLeadOptions.length > 0 ? ` (${dateLeadOptions.length}건)` : ''}`} options={dateLeadOptions}
                  value={form.inquiry_companies}
                  onChange={v => setForm({ ...form, inquiry_companies: v })}
                  placeholder="당일 리드에서 선택..." />
              </div>
            </div>
          </div>
          <div className="col-span-2 p-3 bg-green-50/50 rounded-lg border border-green-100 space-y-2">
            <p className="text-xs font-medium text-green-600">도입</p>
            <div className="grid grid-cols-2 gap-3">
              <Input label="도입사 수" type="number" value={form.adoptions}
                onChange={e => setForm({ ...form, adoptions: Number(e.target.value) })} />
              <CompanyTagInput label="도입 회사명" options={dateLeadOptions}
                value={form.adoption_companies}
                onChange={v => setForm({ ...form, adoption_companies: v })}
                placeholder="당일 리드에서 선택..." />
            </div>
          </div>
          <Input label="비고" value={form.notes}
            onChange={e => setForm({ ...form, notes: e.target.value })}
            placeholder="메모" />
        </div>
        <div className="flex justify-end gap-2 mt-4 pt-3 border-t border-border-light">
          <Button variant="secondary" onClick={() => setShowModal(false)}>취소</Button>
          <Button onClick={handleSave} loading={saving}>{editId ? '수정' : '저장'}</Button>
        </div>
      </Modal>
    </div>
  )
}
