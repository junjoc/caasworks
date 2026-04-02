'use client'

import { useEffect, useState, useMemo, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { SearchSelect } from '@/components/ui/search-select'
import { Modal } from '@/components/ui/modal'
import { Loading } from '@/components/ui/loading'
import { EmptyState } from '@/components/ui/empty-state'
import { formatCurrency, formatNumber } from '@/lib/utils'
import { toast } from 'sonner'
import { CompanyTagInput } from '@/components/ui/company-tag-input'
import {
  Plus, BarChart3, TrendingUp, MousePointerClick, Target,
  DollarSign, Trash2, Pencil, ChevronUp, ChevronDown,
  Users, MessageSquare, Building2, Wallet, Gauge, CalendarDays,
  RefreshCw, Link2
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

type TabType = '전체' | '네이버' | '구글' | '메타' | '콘텐츠' | '기타'
type SortField = 'date' | 'cost' | 'clicks' | 'signups'

const TABS: TabType[] = ['전체', '네이버', '구글', '메타', '콘텐츠', '기타']

const CHANNEL_OPTIONS = [
  { value: '네이버', label: '네이버' },
  { value: '구글', label: '구글' },
  { value: '메타', label: '메타 (FB/IG)' },
  { value: '유튜브', label: '유튜브' },
  { value: '블로그', label: '블로그' },
  { value: '언론', label: '언론' },
  { value: '이벤트', label: '이벤트/행사' },
  { value: '기타', label: '기타' },
]

const AD_TYPE_OPTIONS = [
  { value: '검색', label: '검색광고' },
  { value: 'SNS', label: 'SNS광고' },
  { value: '콘텐츠', label: '콘텐츠/블로그' },
  { value: '영상', label: '영상광고' },
  { value: '오프라인', label: '오프라인/행사' },
  { value: '기타', label: '기타' },
]

const CHANNEL_COLORS: Record<string, string> = {
  '네이버': 'bg-green-100 text-green-700',
  '구글': 'bg-blue-100 text-blue-700',
  '메타': 'bg-indigo-100 text-indigo-700',
  '유튜브': 'bg-red-100 text-red-700',
  '블로그': 'bg-emerald-100 text-emerald-700',
  '언론': 'bg-purple-100 text-purple-700',
  '이벤트': 'bg-orange-100 text-orange-700',
  '기타': 'bg-gray-100 text-gray-700',
}

// 채널 → 탭 매핑
function channelToTab(channel: string): TabType {
  if (channel === '네이버') return '네이버'
  if (channel === '구글') return '구글'
  if (channel === '메타' || channel === '유튜브') return '메타'
  if (channel === '블로그' || channel === '콘텐츠') return '콘텐츠'
  return '기타'
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
  const [month, setMonth] = useState(() => {
    const now = new Date()
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
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
  const [companyOptions, setCompanyOptions] = useState<{value: string, label: string, sub?: string}[]>([])
  const [dateLeadOptions, setDateLeadOptions] = useState<{value: string, label: string, sub?: string}[]>([])
  const supabase = createClient()

  const [year, m] = month.split('-').map(Number)

  // Fetch campaigns + adgroups + company list for dropdown
  useEffect(() => {
    async function fetchCampaignsAndAdgroups() {
      const [campResult, agResult, leadsResult] = await Promise.all([
        supabase.from('campaigns').select('id, name, channel, status')
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
  async function handleSync(platform: 'google' | 'naver' | 'ga4' | 'all') {
    setSyncing(platform)
    try {
      if (platform === 'all') {
        // 전체 동기화 (Cron과 동일)
        const res = await fetch('/api/cron/daily-sync')
        const result = await res.json()
        if (result.success) {
          toast.success(`전체 동기화 완료 — 구글: ${result.summary?.google_ads}, 네이버: ${result.summary?.naver_ads}, GA4: ${result.summary?.ga4_content}`)
          fetchData()
        } else {
          toast.error('전체 동기화 실패')
        }
      } else if (platform === 'ga4') {
        const startDate = `${year}-${String(m).padStart(2, '0')}-01`
        const lastDay = new Date(year, m, 0).getDate()
        const endDate = `${year}-${String(m).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`
        const res = await fetch('/api/marketing/sync/ga4-content', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ startDate, endDate }),
        })
        const result = await res.json()
        if (result.success) {
          toast.success(`GA4 콘텐츠 동기화 완료: ${result.count || 0}건`)
        } else {
          toast.info(result.message || '동기화 준비 중')
        }
      } else {
        const res = await fetch(`/api/marketing/sync/${platform === 'google' ? 'google-ads' : 'naver-ads'}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ year, month: m }),
        })
        const result = await res.json()
        if (result.success) {
          toast.success(`${platform === 'google' ? '구글' : '네이버'} 광고 동기화 완료: ${result.count || 0}건`)
          fetchData()
          // 동기화 후 캠페인/광고그룹 목록도 새로고침
          const [campRes, agRes] = await Promise.all([
            supabase.from('campaigns').select('id, name, channel, status').in('status', ['진행중', '준비']).order('name'),
            supabase.from('ad_groups').select('id, name, campaign_id, channel, status').eq('status', 'active').order('name'),
          ])
          setCampaigns(campRes.data || [])
          setAdgroups(agRes.data || [])
        } else {
          toast.info(result.message || '동기화 준비 중')
        }
      }
    } catch {
      toast.error('동기화 실패')
    }
    setSyncing(null)
  }

  const fetchData = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    const startDate = `${year}-${String(m).padStart(2, '0')}-01`
    const endDate = `${year}-${String(m).padStart(2, '0')}-31`

    const [adsResult, budgetResult] = await Promise.all([
      supabase
        .from('ad_performance')
        .select('*')
        .gte('date', startDate)
        .lte('date', endDate)
        .order('date', { ascending: false }),
      supabase
        .from('marketing_budgets')
        .select('*')
        .eq('year', year)
        .eq('month', m),
    ])

    if (adsResult.error) {
      console.error('ad_performance fetch error:', adsResult.error)
      setData([])
    } else {
      setData(adsResult.data || [])
    }

    if (budgetResult.error) {
      console.error('marketing_budgets fetch error:', budgetResult.error)
      setBudgets([])
    } else {
      setBudgets(budgetResult.data || [])
    }
    if (!silent) setLoading(false)
  }, [year, m])

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
    const totalBudget = budgets.reduce((s, b) => s + b.budget_amount, 0)
    const tabItems = tab === '전체'
      ? data
      : data.filter(d => channelToTab(d.channel) === tab)
    const totalSpent = tabItems.reduce((s, d) => s + d.cost, 0)
    const daysInMonth = new Date(year, m, 0).getDate()
    const today = new Date()
    const daysPassed = (today.getFullYear() === year && today.getMonth() + 1 === m)
      ? today.getDate()
      : (new Date(year, m - 1, 1) > today ? 0 : daysInMonth)
    const burnRate = totalBudget > 0 ? (totalSpent / totalBudget * 100) : 0
    const timeRate = (daysPassed / daysInMonth * 100)
    return { totalBudget, totalSpent, burnRate, timeRate, daysPassed, daysInMonth }
  }, [budgets, data, tab, year, m])

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
    // created_at은 TIMESTAMPTZ이므로 날짜 범위로 필터
    const startOfDay = `${dateStr}T00:00:00`
    const endOfDay = `${dateStr}T23:59:59`
    const { data } = await supabase.from('pipeline_leads')
      .select('id, company_name, stage, inquiry_source, inquiry_channel')
      .gte('created_at', startOfDay)
      .lte('created_at', endOfDay)
      .order('company_name')
      .limit(200)
    setDateLeadOptions((data || []).map(l => ({
      value: l.id,
      label: l.company_name,
      sub: `${l.stage}${l.inquiry_source ? ' · ' + l.inquiry_source : ''}`,
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
      toast.error('캠페인명을 입력하세요')
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
      const { error } = await supabase.from('ad_performance').insert(payload)
      if (error) toast.error('저장 실패: ' + error.message)
      else { toast.success('저장 완료'); saveOk = true }
    }
    if (saveOk && payload.campaign_id) {
      await updateCampaignSpend(payload.campaign_id)
    }
    // 마케팅 데이터 → 고객 데이터 연동
    if (saveOk) {
      await syncLeadsFromMarketing(payload)
    }
    setSaving(false)
    setShowModal(false)
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

  return (
    <div>
      {/* Header */}
      <div className="page-header">
        <h1 className="page-title">광고 성과</h1>
        <div className="flex items-center gap-2 flex-wrap">
          <Input type="month" value={month} onChange={e => setMonth(e.target.value)}
            className="!w-40" />
          <Button size="sm" variant="primary" onClick={() => handleSync('all')}
            loading={syncing === 'all'} disabled={!!syncing}>
            <RefreshCw className="w-3.5 h-3.5 mr-1" /> 전체 동기화
          </Button>
          <Button size="sm" variant="secondary" onClick={() => handleSync('google')}
            loading={syncing === 'google'} disabled={!!syncing}>
            <RefreshCw className="w-3.5 h-3.5 mr-1" /> 구글
          </Button>
          <Button size="sm" variant="secondary" onClick={() => handleSync('naver')}
            loading={syncing === 'naver'} disabled={!!syncing}>
            <RefreshCw className="w-3.5 h-3.5 mr-1" /> 네이버
          </Button>
          <Button size="sm" variant="secondary" onClick={() => handleSync('ga4')}
            loading={syncing === 'ga4'} disabled={!!syncing}>
            <RefreshCw className="w-3.5 h-3.5 mr-1" /> GA4
          </Button>
          <Button size="sm" onClick={openAdd}>
            <Plus className="w-4 h-4 mr-1" /> 데이터 입력
          </Button>
        </div>
      </div>

      {/* Channel Tabs */}
      <div className="flex gap-1 mb-4 bg-gray-100 rounded-lg p-1 w-fit overflow-x-auto">
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors whitespace-nowrap ${
              tab === t ? 'bg-white text-text-primary shadow-sm' : 'text-text-secondary hover:text-text-primary'
            }`}>
            {t}
          </button>
        ))}
      </div>

      {/* Budget Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <div className="card p-4">
          <div className="flex items-center gap-2 mb-1">
            <Wallet className="w-4 h-4 text-blue-500" />
            <span className="text-xs text-text-secondary">월간 예산</span>
          </div>
          <p className="text-lg font-bold text-text-primary">{formatCurrency(budgetSummary.totalBudget)}</p>
        </div>
        <div className="card p-4">
          <div className="flex items-center gap-2 mb-1">
            <DollarSign className="w-4 h-4 text-green-500" />
            <span className="text-xs text-text-secondary">집행비</span>
          </div>
          <p className="text-lg font-bold text-text-primary">{formatCurrency(budgetSummary.totalSpent)}</p>
        </div>
        <div className="card p-4">
          <div className="flex items-center gap-2 mb-1">
            <Gauge className="w-4 h-4 text-orange-500" />
            <span className="text-xs text-text-secondary">소진율</span>
          </div>
          <p className="text-lg font-bold text-text-primary">{budgetSummary.burnRate.toFixed(1)}%</p>
          <div className="w-full bg-gray-200 rounded-full h-1.5 mt-1">
            <div className="bg-orange-500 h-1.5 rounded-full transition-all" style={{ width: `${Math.min(budgetSummary.burnRate, 100)}%` }} />
          </div>
        </div>
        <div className="card p-4">
          <div className="flex items-center gap-2 mb-1">
            <CalendarDays className="w-4 h-4 text-purple-500" />
            <span className="text-xs text-text-secondary">기간 경과율</span>
          </div>
          <p className="text-lg font-bold text-text-primary">{budgetSummary.timeRate.toFixed(1)}%</p>
          <p className="text-xs text-text-secondary">{budgetSummary.daysPassed}/{budgetSummary.daysInMonth}일</p>
        </div>
      </div>

      {/* Performance KPI Cards */}
      <div className="grid grid-cols-3 md:grid-cols-9 gap-3 mb-6">
        <div className="card p-3">
          <span className="text-xs text-text-secondary">총 비용</span>
          <p className="text-sm font-bold text-text-primary mt-0.5">{formatCurrency(kpi.totalCost)}</p>
          <p className="text-[10px] text-text-secondary">CPC {formatCurrency(kpi.cpc)}</p>
        </div>
        <div className="card p-3">
          <span className="text-xs text-text-secondary">노출수</span>
          <p className="text-sm font-bold text-text-primary mt-0.5">{formatNumber(kpi.totalImpressions)}</p>
        </div>
        <div className="card p-3">
          <span className="text-xs text-text-secondary">클릭수</span>
          <p className="text-sm font-bold text-text-primary mt-0.5">{formatNumber(kpi.totalClicks)}</p>
        </div>
        <div className="card p-3">
          <span className="text-xs text-text-secondary">CTR</span>
          <p className="text-sm font-bold text-text-primary mt-0.5">{kpi.ctr.toFixed(2)}%</p>
        </div>
        <div className="card p-3">
          <span className="text-xs text-text-secondary flex items-center gap-1"><TrendingUp className="w-3 h-3" /> GA유입</span>
          <p className="text-sm font-bold text-cyan-600 mt-0.5">{formatNumber(kpi.totalGaVisits)}</p>
        </div>
        <div className="card p-3">
          <span className="text-xs text-text-secondary flex items-center gap-1"><MousePointerClick className="w-3 h-3" /> 문의클릭</span>
          <p className="text-sm font-bold text-amber-600 mt-0.5">{formatNumber(kpi.totalInquiryClicks)}</p>
        </div>
        <div className="card p-3">
          <span className="text-xs text-text-secondary flex items-center gap-1"><Users className="w-3 h-3" /> 가입사</span>
          <p className="text-sm font-bold text-blue-600 mt-0.5">{formatNumber(kpi.totalSignups)}</p>
        </div>
        <div className="card p-3">
          <span className="text-xs text-text-secondary flex items-center gap-1"><MessageSquare className="w-3 h-3" /> 문의사</span>
          <p className="text-sm font-bold text-purple-600 mt-0.5">{formatNumber(kpi.totalInquiries)}</p>
        </div>
        <div className="card p-3">
          <span className="text-xs text-text-secondary flex items-center gap-1"><Building2 className="w-3 h-3" /> 도입사</span>
          <p className="text-sm font-bold text-green-600 mt-0.5">{formatNumber(kpi.totalAdoptions)}</p>
          {kpi.cpa > 0 && <p className="text-[10px] text-text-secondary">결과당 {formatCurrency(kpi.cpa)}</p>}
        </div>
      </div>

      {/* Data Table */}
      {loading ? <Loading /> : filtered.length === 0 ? (
        <EmptyState icon={BarChart3} title="데이터가 없습니다"
          description="광고 성과 데이터를 입력하세요"
          action={<Button size="sm" onClick={openAdd}><Plus className="w-4 h-4 mr-1" /> 데이터 입력</Button>} />
      ) : (
        <div className="table-container overflow-x-auto">
          <table className="data-table w-full min-w-[1200px]">
            <thead>
              <tr>
                <th className="cursor-pointer w-[80px]" onClick={() => toggleSort('date')}>
                  날짜 <SortIcon field="date" />
                </th>
                <th className="w-[60px]">유형</th>
                <th className="w-[60px]">채널</th>
                <th className="w-[140px]">캠페인명</th>
                <th className="w-[120px]">광고그룹</th>
                <th className="text-right w-[100px] cursor-pointer" onClick={() => toggleSort('cost')}>
                  비용 <SortIcon field="cost" />
                </th>
                <th className="text-right w-[80px]">노출</th>
                <th className="text-right w-[70px] cursor-pointer" onClick={() => toggleSort('clicks')}>
                  클릭 <SortIcon field="clicks" />
                </th>
                <th className="text-right w-[60px]">CTR</th>
                <th className="text-right w-[80px]">CPM</th>
                <th className="text-right w-[60px]">GA유입</th>
                <th className="text-right w-[60px]">문의클릭</th>
                <th className="text-right w-[50px] cursor-pointer" onClick={() => toggleSort('signups')}>
                  가입 <SortIcon field="signups" />
                </th>
                <th className="text-right w-[50px]">문의</th>
                <th className="text-right w-[50px]">도입</th>
                <th className="w-[60px]" />
              </tr>
            </thead>
            <tbody>
              {filtered.map(row => {
                const ctr = row.impressions > 0 ? (row.clicks / row.impressions * 100).toFixed(2) : '0.00'
                const cpm = row.impressions > 0 ? Math.round(row.cost / row.impressions * 1000) : 0
                return (
                  <tr key={row.id}>
                    <td className="whitespace-nowrap">{row.date.slice(5)}</td>
                    <td>
                      <span className="text-xs text-text-secondary">{row.ad_type}</span>
                    </td>
                    <td>
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                        CHANNEL_COLORS[row.channel] || 'bg-gray-100 text-gray-700'
                      }`}>{row.channel}</span>
                    </td>
                    <td className="font-medium" title={row.campaign_name}>
                      <div className="truncate max-w-[160px]">
                        {row.campaign_name}
                        {!row.campaign_id && (
                          <button onClick={() => openEdit(row)} title="캠페인 연결"
                            className="ml-1 text-orange-400 hover:text-orange-600 inline">
                            <Link2 className="w-3 h-3 inline" />
                          </button>
                        )}
                      </div>
                    </td>
                    <td title={row.adgroup_name || ''}>
                      <div className="truncate max-w-[140px] text-text-secondary text-xs">
                        {row.adgroup_name || '-'}
                      </div>
                    </td>
                    <td className="text-right font-medium">{formatCurrency(row.cost)}</td>
                    <td className="text-right text-gray-500">{formatNumber(row.impressions)}</td>
                    <td className="text-right">{formatNumber(row.clicks)}</td>
                    <td className="text-right text-gray-500">{ctr}%</td>
                    <td className="text-right text-gray-500">{formatCurrency(cpm)}</td>
                    <td className="text-right text-cyan-600 font-medium">{row.ga_visits || '-'}</td>
                    <td className="text-right text-amber-600 font-medium">{row.inquiry_clicks || '-'}</td>
                    <td className="text-right text-blue-600 font-medium cursor-help" title={row.signup_companies || ''}>{row.signups || '-'}</td>
                    <td className="text-right text-purple-600 font-medium cursor-help" title={row.inquiry_companies || ''}>{row.inquiries || '-'}</td>
                    <td className="text-right text-green-600 font-medium cursor-help" title={row.adoption_companies || ''}>{row.adoptions || '-'}</td>
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

              {/* Channel Subtotals */}
              {Object.keys(channelSubtotals).length > 1 && (
                <>
                  {Object.entries(channelSubtotals).map(([ch, totals]) => {
                    const subCtr = totals.impressions > 0 ? (totals.clicks / totals.impressions * 100).toFixed(2) : '0.00'
                    const subCpm = totals.impressions > 0 ? Math.round(totals.cost / totals.impressions * 1000) : 0
                    return (
                      <tr key={`sub-${ch}`} className="bg-gray-50 font-semibold text-sm border-t border-border-light">
                        <td colSpan={4}>
                          <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                            CHANNEL_COLORS[ch] || 'bg-gray-100 text-gray-700'
                          }`}>{ch} 합계</span>
                        </td>
                        <td className="text-right text-gray-500 text-xs">{totals.count}건</td>
                        <td className="text-right">{formatCurrency(totals.cost)}</td>
                        <td className="text-right text-gray-500">{formatNumber(totals.impressions)}</td>
                        <td className="text-right">{formatNumber(totals.clicks)}</td>
                        <td className="text-right text-gray-500">{subCtr}%</td>
                        <td className="text-right text-gray-500">{formatCurrency(subCpm)}</td>
                        <td className="text-right text-cyan-600">{totals.ga_visits}</td>
                        <td className="text-right text-amber-600">{totals.inquiry_clicks}</td>
                        <td className="text-right text-blue-600">{totals.signups}</td>
                        <td className="text-right text-purple-600">{totals.inquiries}</td>
                        <td className="text-right text-green-600">{totals.adoptions}</td>
                        <td />
                      </tr>
                    )
                  })}
                </>
              )}

              {/* Grand Total */}
              <tr className="bg-gray-100 font-bold text-sm border-t-2 border-gray-300">
                <td colSpan={5}>전체 합계</td>
                <td className="text-right">{formatCurrency(kpi.totalCost)}</td>
                <td className="text-right">{formatNumber(kpi.totalImpressions)}</td>
                <td className="text-right">{formatNumber(kpi.totalClicks)}</td>
                <td className="text-right">{kpi.ctr.toFixed(2)}%</td>
                <td className="text-right">
                  {kpi.totalImpressions > 0 ? formatCurrency(Math.round(kpi.totalCost / kpi.totalImpressions * 1000)) : '-'}
                </td>
                <td className="text-right text-cyan-600">{kpi.totalGaVisits}</td>
                <td className="text-right text-amber-600">{kpi.totalInquiryClicks}</td>
                <td className="text-right text-blue-600">{kpi.totalSignups}</td>
                <td className="text-right text-purple-600">{kpi.totalInquiries}</td>
                <td className="text-right text-green-600">{kpi.totalAdoptions}</td>
                <td />
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {/* Modal */}
      <Modal open={showModal} onClose={() => setShowModal(false)}
        title={editId ? '광고 데이터 수정' : '광고 데이터 입력'}>
        <div className="grid grid-cols-2 gap-3">
          <Input label="날짜" type="date" value={form.date}
            onChange={e => { setForm({ ...form, date: e.target.value }); fetchLeadsForDate(e.target.value) }} />
          <Select label="광고유형" options={AD_TYPE_OPTIONS} value={form.ad_type}
            onChange={e => setForm({ ...form, ad_type: e.target.value })} />
          <Select label="채널" options={CHANNEL_OPTIONS} value={form.channel}
            onChange={e => {
              const newChannel = e.target.value
              const currentCampaign = campaigns.find(c => c.id === form.campaign_id)
              const keepCampaign = currentCampaign && currentCampaign.channel === newChannel
              setForm({
                ...form,
                channel: newChannel,
                campaign_id: keepCampaign ? form.campaign_id : '',
                campaign_name: keepCampaign ? form.campaign_name : '',
              })
            }} />
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
                  adgroup_id: '', // 캠페인 변경 시 광고그룹 초기화
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
                  // 캠페인 미선택 시 광고그룹의 캠페인으로 자동 설정
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
          <div className="col-span-2 grid grid-cols-6 gap-2 p-3 bg-blue-50/50 rounded-lg border border-blue-100">
            <Input label="가입사 수" type="number" value={form.signups}
              onChange={e => setForm({ ...form, signups: Number(e.target.value) })} />
            <CompanyTagInput label="가입 회사명" options={companyOptions}
              value={form.signup_companies}
              onChange={v => setForm({ ...form, signup_companies: v })}
              placeholder="회사 검색..." className="col-span-2" />
            <Input label="문의사 수" type="number" value={form.inquiries}
              onChange={e => setForm({ ...form, inquiries: Number(e.target.value) })} />
            <CompanyTagInput label={`문의 회사명 (${form.date} 리드${dateLeadOptions.length > 0 ? ' ' + dateLeadOptions.length + '건' : ''})`} options={dateLeadOptions}
              value={form.inquiry_companies}
              onChange={v => setForm({ ...form, inquiry_companies: v })}
              placeholder="당일 리드에서 선택..." className="col-span-2" />
          </div>
          <div className="col-span-2 grid grid-cols-3 gap-2 p-3 bg-green-50/50 rounded-lg border border-green-100">
            <Input label="도입사 수" type="number" value={form.adoptions}
              onChange={e => setForm({ ...form, adoptions: Number(e.target.value) })} />
            <CompanyTagInput label={`도입 회사명 (${form.date} 리드)`} options={dateLeadOptions}
              value={form.adoption_companies}
              onChange={v => setForm({ ...form, adoption_companies: v })}
              placeholder="당일 리드에서 선택..." className="col-span-2" />
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
