'use client'

import { useEffect, useState, useMemo, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Loading } from '@/components/ui/loading'
import { EmptyState } from '@/components/ui/empty-state'
import { formatCurrency, formatNumber } from '@/lib/utils'
import {
  BarChart3, ArrowRight, ArrowUpRight, ArrowDownRight, Minus,
  Users, MessageSquare, Building2
} from 'lucide-react'
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer
} from 'recharts'

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

type GroupBy = 'weekly' | 'monthly' | 'quarterly' | 'yearly'

const CHANNEL_COLORS: Record<string, string> = {
  '네이버': '#2DB400',
  '구글': '#4285F4',
  '메타': '#6366F1',
  '유튜브': '#EF4444',
  '블로그': '#10B981',
  '기타': '#6B7280',
}

const GROUP_OPTIONS = [
  { value: 'weekly', label: '주간' },
  { value: 'monthly', label: '월간' },
  { value: 'quarterly', label: '분기' },
  { value: 'yearly', label: '연도' },
]

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

export default function AnalyticsPage() {
  const [adData, setAdData] = useState<AdPerformance[]>([])
  const [yearlySummary, setYearlySummary] = useState<YearlySummary[]>([])
  const [loading, setLoading] = useState(true)
  const [groupBy, setGroupBy] = useState<GroupBy>('monthly')
  const [startDate, setStartDate] = useState(() => {
    const d = new Date()
    return `${d.getFullYear()}-01-01`
  })
  const [endDate, setEndDate] = useState(() => {
    const d = new Date()
    return d.toISOString().split('T')[0]
  })
  const supabase = createClient()

  const year = new Date(startDate).getFullYear()

  const fetchData = useCallback(async () => {
    setLoading(true)
    const [adsResult, summaryResult] = await Promise.all([
      supabase
        .from('ad_performance')
        .select('*')
        .gte('date', startDate)
        .lte('date', endDate)
        .order('date', { ascending: true }),
      supabase
        .from('marketing_yearly_summary')
        .select('*')
        .eq('year', year)
        .order('month', { ascending: true }),
    ])

    setAdData(adsResult.data || [])
    setYearlySummary(summaryResult.data || [])
    setLoading(false)
  }, [startDate, endDate, year])

  useEffect(() => { fetchData() }, [fetchData])

  // 기간 그루핑 집계
  const groupedData = useMemo(() => {
    const groups: Record<string, {
      cost: number; impressions: number; clicks: number;
      signups: number; inquiries: number; adoptions: number; days: number
    }> = {}

    adData.forEach(d => {
      const key = getGroupKey(d.date, groupBy)
      if (!groups[key]) groups[key] = { cost: 0, impressions: 0, clicks: 0, signups: 0, inquiries: 0, adoptions: 0, days: 0 }
      groups[key].cost += Number(d.cost)
      groups[key].impressions += d.impressions
      groups[key].clicks += d.clicks
      groups[key].signups += d.signups
      groups[key].inquiries += d.inquiries
      groups[key].adoptions += d.adoptions
      groups[key].days += 1
    })

    return Object.entries(groups)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([key, vals]) => ({
        key,
        label: getGroupLabel(key, groupBy),
        ...vals,
        ctr: vals.impressions > 0 ? (vals.clicks / vals.impressions * 100) : 0,
        cpa: (vals.signups + vals.inquiries + vals.adoptions) > 0
          ? Math.round(vals.cost / (vals.signups + vals.inquiries + vals.adoptions))
          : 0,
      }))
  }, [adData, groupBy])

  // 캠페인별 성과 비교
  const campaignComparison = useMemo(() => {
    const groups: Record<string, {
      name: string; cost: number; impressions: number; clicks: number;
      signups: number; inquiries: number; adoptions: number
    }> = {}

    adData.forEach(d => {
      const key = d.campaign_id || d.campaign_name
      if (!groups[key]) groups[key] = { name: d.campaign_name, cost: 0, impressions: 0, clicks: 0, signups: 0, inquiries: 0, adoptions: 0 }
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
        ctr: v.impressions > 0 ? (v.clicks / v.impressions * 100) : 0,
        cpa: (v.signups + v.inquiries + v.adoptions) > 0
          ? Math.round(v.cost / (v.signups + v.inquiries + v.adoptions))
          : 0,
      }))
      .sort((a, b) => b.cost - a.cost)
  }, [adData])

  // 전환 퍼널
  const funnel = useMemo(() => {
    const totalImpressions = adData.reduce((s, d) => s + d.impressions, 0)
    const totalClicks = adData.reduce((s, d) => s + d.clicks, 0)
    const totalSignups = adData.reduce((s, d) => s + d.signups, 0)
    const totalInquiries = adData.reduce((s, d) => s + d.inquiries, 0)
    const totalAdoptions = adData.reduce((s, d) => s + d.adoptions, 0)
    const totalCost = adData.reduce((s, d) => s + Number(d.cost), 0)

    const steps = [
      { label: '노출', value: totalImpressions, color: 'bg-blue-400' },
      { label: '클릭', value: totalClicks, color: 'bg-blue-500' },
      { label: '가입사', value: totalSignups, color: 'bg-indigo-500' },
      { label: '문의사', value: totalInquiries, color: 'bg-purple-500' },
      { label: '도입사', value: totalAdoptions, color: 'bg-green-500' },
    ]

    const rates: string[] = []
    for (let i = 1; i < steps.length; i++) {
      const prev = steps[i - 1].value
      rates.push(prev > 0 ? (steps[i].value / prev * 100).toFixed(2) + '%' : '-')
    }

    return { steps, rates, totalCost }
  }, [adData])

  const maxFunnel = Math.max(...funnel.steps.map(s => s.value), 1)

  // 채널별 비교
  const channelComparison = useMemo(() => {
    const byChannel: Record<string, { cost: number; signups: number; inquiries: number; adoptions: number; clicks: number; impressions: number }> = {}
    adData.forEach(d => {
      if (!byChannel[d.channel]) byChannel[d.channel] = { cost: 0, signups: 0, inquiries: 0, adoptions: 0, clicks: 0, impressions: 0 }
      byChannel[d.channel].cost += Number(d.cost)
      byChannel[d.channel].signups += d.signups
      byChannel[d.channel].inquiries += d.inquiries
      byChannel[d.channel].adoptions += d.adoptions
      byChannel[d.channel].clicks += d.clicks
      byChannel[d.channel].impressions += d.impressions
    })
    return Object.entries(byChannel)
      .map(([channel, vals]) => {
        const totalResults = vals.signups + vals.inquiries + vals.adoptions
        return {
          채널: channel,
          비용: vals.cost,
          가입사: vals.signups,
          문의사: vals.inquiries,
          도입사: vals.adoptions,
          클릭수: vals.clicks,
          결과당비용: totalResults > 0 ? Math.round(vals.cost / totalResults) : 0,
          CTR: vals.impressions > 0 ? (vals.clicks / vals.impressions * 100) : 0,
        }
      })
      .sort((a, b) => b.비용 - a.비용)
  }, [adData])

  // 그루핑된 차트 데이터
  const chartData = useMemo(() => {
    return groupedData.map(g => ({
      name: groupBy === 'monthly' ? g.key.split('-')[1] + '월' : g.label,
      비용: g.cost,
      가입사: g.signups,
      문의사: g.inquiries,
      도입사: g.adoptions,
    }))
  }, [groupedData, groupBy])

  // 채널별 비용 트렌드
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

  // 연간 현황
  const yearlyTableData = useMemo(() => {
    if (yearlySummary.length === 0) return null
    const rows = yearlySummary.map((row, idx) => {
      const totalAdCost = row.google_cost + row.meta_cost + row.naver_cost + row.other_cost
      const totalInquiries = row.paid_inquiries + row.viral_inquiries
      const prev = idx > 0 ? yearlySummary[idx - 1] : null
      const prevTotal = prev ? (prev.google_cost + prev.meta_cost + prev.naver_cost + prev.other_cost) : 0
      return {
        month: row.month, googleCost: row.google_cost, metaCost: row.meta_cost,
        naverCost: row.naver_cost, otherCost: row.other_cost, totalAdCost,
        signups: row.signups, paidInquiries: row.paid_inquiries,
        viralInquiries: row.viral_inquiries, totalInquiries, adoptions: row.adoptions,
        revenue: row.monthly_revenue, adRatio: row.ad_revenue_ratio,
        costChange: prev && prevTotal > 0 ? ((totalAdCost - prevTotal) / prevTotal * 100) : null,
      }
    })
    const totals = rows.reduce((acc, r) => ({
      googleCost: acc.googleCost + r.googleCost, metaCost: acc.metaCost + r.metaCost,
      naverCost: acc.naverCost + r.naverCost, otherCost: acc.otherCost + r.otherCost,
      totalAdCost: acc.totalAdCost + r.totalAdCost, signups: acc.signups + r.signups,
      paidInquiries: acc.paidInquiries + r.paidInquiries, viralInquiries: acc.viralInquiries + r.viralInquiries,
      totalInquiries: acc.totalInquiries + r.totalInquiries, adoptions: acc.adoptions + r.adoptions,
      revenue: acc.revenue + r.revenue,
    }), { googleCost: 0, metaCost: 0, naverCost: 0, otherCost: 0, totalAdCost: 0, signups: 0, paidInquiries: 0, viralInquiries: 0, totalInquiries: 0, adoptions: 0, revenue: 0 })
    return { rows, totals }
  }, [yearlySummary])

  function ChangeIcon({ value }: { value: number | null }) {
    if (value === null) return <Minus className="w-3 h-3 text-gray-400" />
    if (value > 0) return <ArrowUpRight className="w-3 h-3 text-red-500" />
    if (value < 0) return <ArrowDownRight className="w-3 h-3 text-green-500" />
    return <Minus className="w-3 h-3 text-gray-400" />
  }

  if (loading) return <div className="p-8"><Loading /></div>

  return (
    <div>
      {/* Header with period controls */}
      <div className="page-header">
        <h1 className="page-title">마케팅 분석</h1>
        <div className="flex items-center gap-2 flex-wrap">
          <Select options={GROUP_OPTIONS} value={groupBy}
            onChange={e => setGroupBy(e.target.value as GroupBy)} className="!w-28" />
          <Input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="!w-36" />
          <span className="text-text-secondary text-sm">~</span>
          <Input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="!w-36" />
        </div>
      </div>

      {adData.length === 0 ? (
        <EmptyState icon={BarChart3} title="해당 기간 광고 데이터가 없습니다"
          description="광고 성과 페이지에서 데이터를 입력하세요" />
      ) : (
        <>
          {/* 기간별 집계 테이블 */}
          <div className="card p-5 mb-6">
            <h3 className="text-sm font-semibold text-text-primary mb-4">
              {GROUP_OPTIONS.find(o => o.value === groupBy)?.label} 집계
            </h3>
            <div className="table-container overflow-x-auto">
              <table className="data-table text-xs">
                <thead>
                  <tr>
                    <th>기간</th>
                    <th className="text-right">비용</th>
                    <th className="text-right">노출</th>
                    <th className="text-right">클릭</th>
                    <th className="text-right">CTR</th>
                    <th className="text-right">가입</th>
                    <th className="text-right">문의</th>
                    <th className="text-right">도입</th>
                    <th className="text-right">CPA</th>
                  </tr>
                </thead>
                <tbody>
                  {groupedData.map(g => (
                    <tr key={g.key}>
                      <td className="font-medium whitespace-nowrap">{g.label}</td>
                      <td className="text-right font-medium">{formatCurrency(g.cost)}</td>
                      <td className="text-right">{formatNumber(g.impressions)}</td>
                      <td className="text-right">{formatNumber(g.clicks)}</td>
                      <td className="text-right">{g.ctr.toFixed(2)}%</td>
                      <td className="text-right text-blue-600">{g.signups}</td>
                      <td className="text-right text-purple-600">{g.inquiries}</td>
                      <td className="text-right text-green-600">{g.adoptions}</td>
                      <td className="text-right">{g.cpa > 0 ? formatCurrency(g.cpa) : '-'}</td>
                    </tr>
                  ))}
                  {/* Grand Total */}
                  <tr className="bg-gray-100 font-bold border-t-2 border-gray-300">
                    <td>합계</td>
                    <td className="text-right">{formatCurrency(groupedData.reduce((s, g) => s + g.cost, 0))}</td>
                    <td className="text-right">{formatNumber(groupedData.reduce((s, g) => s + g.impressions, 0))}</td>
                    <td className="text-right">{formatNumber(groupedData.reduce((s, g) => s + g.clicks, 0))}</td>
                    <td className="text-right">
                      {(() => {
                        const ti = groupedData.reduce((s, g) => s + g.impressions, 0)
                        const tc = groupedData.reduce((s, g) => s + g.clicks, 0)
                        return ti > 0 ? (tc / ti * 100).toFixed(2) + '%' : '-'
                      })()}
                    </td>
                    <td className="text-right text-blue-600">{groupedData.reduce((s, g) => s + g.signups, 0)}</td>
                    <td className="text-right text-purple-600">{groupedData.reduce((s, g) => s + g.inquiries, 0)}</td>
                    <td className="text-right text-green-600">{groupedData.reduce((s, g) => s + g.adoptions, 0)}</td>
                    <td />
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* 캠페인별 성과 비교 */}
          {campaignComparison.length > 0 && (
            <div className="card p-5 mb-6">
              <h3 className="text-sm font-semibold text-text-primary mb-4">캠페인별 성과 비교</h3>
              <div className="table-container overflow-x-auto">
                <table className="data-table text-xs">
                  <thead>
                    <tr>
                      <th>캠페인</th>
                      <th className="text-right">비용</th>
                      <th className="text-right">노출</th>
                      <th className="text-right">클릭</th>
                      <th className="text-right">CTR</th>
                      <th className="text-right">가입</th>
                      <th className="text-right">문의</th>
                      <th className="text-right">도입</th>
                      <th className="text-right">CPA</th>
                    </tr>
                  </thead>
                  <tbody>
                    {campaignComparison.map(c => (
                      <tr key={c.name}>
                        <td className="font-medium max-w-[200px] truncate">{c.name}</td>
                        <td className="text-right font-medium">{formatCurrency(c.cost)}</td>
                        <td className="text-right">{formatNumber(c.impressions)}</td>
                        <td className="text-right">{formatNumber(c.clicks)}</td>
                        <td className="text-right">{c.ctr.toFixed(2)}%</td>
                        <td className="text-right text-blue-600">{c.signups}</td>
                        <td className="text-right text-purple-600">{c.inquiries}</td>
                        <td className="text-right text-green-600">{c.adoptions}</td>
                        <td className="text-right">{c.cpa > 0 ? formatCurrency(c.cpa) : '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* 전환 퍼널 */}
          <div className="card p-5 mb-6">
            <h3 className="text-sm font-semibold text-text-primary mb-4">
              전환 퍼널
              <span className="ml-2 text-xs font-normal text-text-secondary">
                (총 광고비: {formatCurrency(funnel.totalCost)})
              </span>
            </h3>
            <div className="space-y-2">
              {funnel.steps.map((step, i) => (
                <div key={step.label} className="flex items-center gap-3">
                  <span className="text-xs text-text-secondary w-12 text-right font-medium">{step.label}</span>
                  <div className="flex-1 bg-gray-100 rounded-full h-8 relative overflow-hidden">
                    <div className={`h-8 rounded-full ${step.color} transition-all flex items-center px-3`}
                      style={{ width: `${Math.max((step.value / maxFunnel) * 100, 6)}%` }}>
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

          <div className="grid lg:grid-cols-2 gap-6 mb-6">
            {/* 채널별 비용 추이 */}
            <div className="card p-5">
              <h3 className="text-sm font-semibold text-text-primary mb-4">
                {GROUP_OPTIONS.find(o => o.value === groupBy)?.label} 비용 추이 (채널별)
              </h3>
              <ResponsiveContainer width="100%" height={280}>
                <LineChart data={channelTrendData.data}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `${(v / 10000).toFixed(0)}만`} />
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

            {/* 성과 추이 */}
            <div className="card p-5">
              <h3 className="text-sm font-semibold text-text-primary mb-4">
                {GROUP_OPTIONS.find(o => o.value === groupBy)?.label} 성과 추이
              </h3>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="가입사" fill="#3B82F6" radius={[2, 2, 0, 0]} />
                  <Bar dataKey="문의사" fill="#8B5CF6" radius={[2, 2, 0, 0]} />
                  <Bar dataKey="도입사" fill="#10B981" radius={[2, 2, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* 채널별 ROI */}
          <div className="card p-5 mb-6">
            <h3 className="text-sm font-semibold text-text-primary mb-4">채널별 비용 vs 성과</h3>
            <div className="table-container">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>채널</th>
                    <th className="text-right">비용</th>
                    <th className="text-right">클릭수</th>
                    <th className="text-right">CTR</th>
                    <th className="text-right">가입사</th>
                    <th className="text-right">문의사</th>
                    <th className="text-right">도입사</th>
                    <th className="text-right">결과당 비용</th>
                  </tr>
                </thead>
                <tbody>
                  {channelComparison.map(row => (
                    <tr key={row.채널}>
                      <td>
                        <span className="flex items-center gap-2">
                          <span className="w-3 h-3 rounded-full" style={{ backgroundColor: CHANNEL_COLORS[row.채널] || '#6B7280' }} />
                          <span className="font-medium">{row.채널}</span>
                        </span>
                      </td>
                      <td className="text-right font-medium">{formatCurrency(row.비용)}</td>
                      <td className="text-right">{formatNumber(row.클릭수)}</td>
                      <td className="text-right">{row.CTR.toFixed(2)}%</td>
                      <td className="text-right text-blue-600 font-medium">{row.가입사}</td>
                      <td className="text-right text-purple-600 font-medium">{row.문의사}</td>
                      <td className="text-right text-green-600 font-medium">{row.도입사}</td>
                      <td className="text-right">{row.결과당비용 > 0 ? formatCurrency(row.결과당비용) : '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* 채널별 비용 바 차트 */}
          <div className="card p-5 mb-6">
            <h3 className="text-sm font-semibold text-text-primary mb-4">채널별 비용 비교</h3>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={channelComparison} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={v => `${(v / 10000).toFixed(0)}만`} />
                <YAxis dataKey="채널" type="category" tick={{ fontSize: 11 }} width={60} />
                <Tooltip formatter={(value: number) => formatCurrency(value)} />
                <Bar dataKey="비용" fill="#3B82F6" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </>
      )}

      {/* 연간 현황 테이블 */}
      {yearlyTableData && (
        <div className="card p-5 mb-6">
          <h3 className="text-sm font-semibold text-text-primary mb-4">{year}년 마케팅 연간 현황</h3>
          <div className="table-container overflow-x-auto">
            <table className="data-table text-xs">
              <thead>
                <tr>
                  <th>월</th>
                  <th className="text-right">구글</th>
                  <th className="text-right">메타</th>
                  <th className="text-right">네이버</th>
                  <th className="text-right">기타</th>
                  <th className="text-right font-bold">전체 광고비</th>
                  <th className="text-right">전월비</th>
                  <th className="text-right">가입사</th>
                  <th className="text-right">유료문의</th>
                  <th className="text-right">바이럴문의</th>
                  <th className="text-right">도입사</th>
                  <th className="text-right">매출</th>
                  <th className="text-right">광고비비율</th>
                </tr>
              </thead>
              <tbody>
                {yearlyTableData.rows.map(row => (
                  <tr key={row.month}>
                    <td className="font-medium">{row.month}월</td>
                    <td className="text-right">{formatCurrency(row.googleCost)}</td>
                    <td className="text-right">{formatCurrency(row.metaCost)}</td>
                    <td className="text-right">{formatCurrency(row.naverCost)}</td>
                    <td className="text-right">{formatCurrency(row.otherCost)}</td>
                    <td className="text-right font-bold">{formatCurrency(row.totalAdCost)}</td>
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
                <tr className="bg-gray-100 font-bold border-t-2 border-gray-300">
                  <td>합계</td>
                  <td className="text-right">{formatCurrency(yearlyTableData.totals.googleCost)}</td>
                  <td className="text-right">{formatCurrency(yearlyTableData.totals.metaCost)}</td>
                  <td className="text-right">{formatCurrency(yearlyTableData.totals.naverCost)}</td>
                  <td className="text-right">{formatCurrency(yearlyTableData.totals.otherCost)}</td>
                  <td className="text-right">{formatCurrency(yearlyTableData.totals.totalAdCost)}</td>
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
      )}
    </div>
  )
}
