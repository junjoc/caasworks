'use client'

import { useEffect, useState, useMemo } from 'react'
import { DateRangePicker, type DateRange } from '@/components/ui/date-range-picker'
import { createClient } from '@/lib/supabase/client'
import { Loading } from '@/components/ui/loading'
import { useAuth } from '@/hooks/useAuth'
import {
  Globe,
  ArrowRight,
  LogOut,
  LogIn,
  TrendingDown,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  Clock,
  Users,
  Eye,
  MousePointerClick,
} from 'lucide-react'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
  Sankey, Treemap,
} from 'recharts'

interface LandingPage {
  landingPage: string
  channel: string
  sessions: number
  activeUsers: number
  bounceRate: number
  avgDuration: number
  engagedSessions: number
  pageViews: number
}

interface PageData {
  pagePath: string
  pageViews: number
  sessions: number
  activeUsers: number
  avgDuration: number
  bounceRate: number
  engagedSessions: number
  entrances: number
}

interface ExitPage extends PageData {
  exitRate: number
  nonEngagedSessions: number
}

interface ChannelData {
  channel: string
  sessions: number
  activeUsers: number
  bounceRate: number
  avgDuration: number
  engagedSessions: number
  pageViews: number
  conversions: number
}

interface JourneyData {
  landingPages: LandingPage[]
  pages: PageData[]
  channels: ChannelData[]
  exitPages: ExitPage[]
}

// 페이지 경로를 읽기 쉽게 변환
function prettyPath(path: string): string {
  if (path === '/' || path === '/index') return '홈 (메인)'
  if (path.startsWith('/blog/')) return '블로그: ' + path.replace('/blog/', '').substring(0, 12) + '...'
  if (path === '/blog') return '블로그 목록'
  if (path === '/pricing') return '가격'
  if (path === '/contact') return '문의하기'
  if (path === '/about') return '회사소개'
  if (path === '/features') return '기능소개'
  if (path === '/demo') return '데모 신청'
  if (path === '/signup') return '회원가입'
  if (path === '/login') return '로그인'
  if (path.startsWith('/docs')) return '가이드: ' + path.replace('/docs', '').replace(/^\//, '')
  if (path.startsWith('/product')) return '제품: ' + path.replace('/product', '').replace(/^\//, '')
  return path.length > 35 ? path.substring(0, 35) + '...' : path
}

// 채널명 한국어 매핑
function channelKo(ch: string): string {
  const map: Record<string, string> = {
    'Organic Search': '검색 (오가닉)',
    'Direct': '직접 유입',
    'Referral': '외부 링크',
    'Organic Social': 'SNS (오가닉)',
    'Paid Search': '검색 광고',
    'Paid Social': 'SNS 광고',
    'Email': '이메일',
    'Display': '디스플레이 광고',
    'Unassigned': '미분류',
    'Cross-network': '크로스 네트워크',
  }
  return map[ch] || ch
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}초`
  const m = Math.floor(seconds / 60)
  const s = Math.round(seconds % 60)
  return `${m}분 ${s}초`
}

function formatPercent(rate: number): string {
  return `${(rate * 100).toFixed(1)}%`
}

export default function JourneyPage() {
  const [data, setData] = useState<JourneyData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [dateRange, setDateRange] = useState<DateRange>(() => {
    const now = new Date()
    const first = new Date(now.getFullYear(), now.getMonth(), 1)
    return {
      from: `${first.getFullYear()}-${String(first.getMonth()+1).padStart(2,'0')}-01`,
      to: `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`,
    }
  })
  const [channelFilter, setChannelFilter] = useState<string>('all')
  const [expandedSection, setExpandedSection] = useState<string[]>(['funnel', 'landing', 'exit'])
  const { user } = useAuth()

  const fetchData = async () => {
    setLoading(true)
    setError(null)
    const startDate = dateRange.from || undefined
    const endDate = dateRange.to || undefined

    try {
      const res = await fetch('/api/marketing/sync/ga4-pages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ startDate, endDate }),
      })
      const json = await res.json()
      if (json.success && json.data) {
        setData(json.data)
      } else {
        setError(json.message || '데이터 조회 실패')
      }
    } catch (err: any) {
      setError(err.message || '요청 실패')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchData()
  }, [dateRange.from, dateRange.to])

  const toggleSection = (s: string) => {
    setExpandedSection(prev =>
      prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s]
    )
  }

  // ─── 채널 요약 ───
  const channelSummary = useMemo(() => {
    if (!data) return []
    return data.channels
      .sort((a, b) => b.sessions - a.sessions)
      .map(ch => ({
        ...ch,
        channelKo: channelKo(ch.channel),
        engagementRate: ch.sessions > 0 ? ch.engagedSessions / ch.sessions : 0,
      }))
  }, [data])

  const totalSessions = channelSummary.reduce((s, c) => s + c.sessions, 0)
  const totalUsers = channelSummary.reduce((s, c) => s + c.activeUsers, 0)
  const totalPageViews = channelSummary.reduce((s, c) => s + c.pageViews, 0)
  const avgBounce = totalSessions > 0
    ? channelSummary.reduce((s, c) => s + c.bounceRate * c.sessions, 0) / totalSessions
    : 0

  // ─── 랜딩페이지 (채널 필터) ───
  const filteredLanding = useMemo(() => {
    if (!data) return []
    const filtered = channelFilter === 'all'
      ? data.landingPages
      : data.landingPages.filter(l => l.channel === channelFilter)

    // 페이지별 합산
    const map = new Map<string, { sessions: number; bounceRate: number; avgDuration: number; engaged: number; channels: Set<string> }>()
    filtered.forEach(l => {
      const existing = map.get(l.landingPage)
      if (existing) {
        existing.bounceRate = (existing.bounceRate * existing.sessions + l.bounceRate * l.sessions) / (existing.sessions + l.sessions)
        existing.avgDuration = (existing.avgDuration * existing.sessions + l.avgDuration * l.sessions) / (existing.sessions + l.sessions)
        existing.sessions += l.sessions
        existing.engaged += l.engagedSessions
        existing.channels.add(l.channel)
      } else {
        map.set(l.landingPage, {
          sessions: l.sessions,
          bounceRate: l.bounceRate,
          avgDuration: l.avgDuration,
          engaged: l.engagedSessions,
          channels: new Set([l.channel]),
        })
      }
    })

    return Array.from(map.entries())
      .map(([page, d]) => ({
        page,
        prettyName: prettyPath(page),
        sessions: d.sessions,
        bounceRate: d.bounceRate,
        engagementRate: d.sessions > 0 ? d.engaged / d.sessions : 0,
        avgDuration: d.avgDuration,
        channels: Array.from(d.channels),
      }))
      .sort((a, b) => b.sessions - a.sessions)
  }, [data, channelFilter])

  // ─── 이탈 페이지 ───
  const exitPages = useMemo(() => {
    if (!data) return []
    return data.exitPages
      .filter(p => p.nonEngagedSessions > 0)
      .slice(0, 20)
  }, [data])

  // ─── 페이지별 흐름 (Sankey-like) ───
  const channelToLandingFlow = useMemo(() => {
    if (!data) return []
    const flowMap = new Map<string, number>()
    data.landingPages.forEach(l => {
      const key = `${channelKo(l.channel)}→${prettyPath(l.landingPage)}`
      flowMap.set(key, (flowMap.get(key) || 0) + l.sessions)
    })
    return Array.from(flowMap.entries())
      .map(([key, sessions]) => {
        const [from, to] = key.split('→')
        return { from, to, sessions }
      })
      .sort((a, b) => b.sessions - a.sessions)
      .slice(0, 15)
  }, [data])

  if (!user) return <Loading />

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-text-primary">방문자 여정 분석</h2>
          <p className="text-xs text-text-tertiary mt-0.5">유입 채널 &rarr; 랜딩 페이지 &rarr; 이탈 페이지 흐름 분석</p>
        </div>
        <div className="flex items-center gap-2">
          <DateRangePicker value={dateRange} onChange={setDateRange} />
          <button
            onClick={fetchData}
            disabled={loading}
            className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg bg-primary-500 text-white hover:bg-primary-600 disabled:opacity-50"
          >
            <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
            {loading ? '조회 중...' : 'GA4 데이터 조회'}
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">{error}</div>
      )}

      {loading && !data && <Loading />}

      {data && (
        <>
          {/* KPI 카드 */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="stat-card">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg flex items-center justify-center text-primary-600 bg-primary-50">
                  <Users className="w-4 h-4" />
                </div>
                <span className="stat-label">총 세션</span>
              </div>
              <div className="stat-value">{totalSessions.toLocaleString()}</div>
              <p className="text-xs text-text-tertiary">{totalUsers.toLocaleString()} 사용자</p>
            </div>
            <div className="stat-card">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg flex items-center justify-center text-status-blue bg-status-blue-bg">
                  <Eye className="w-4 h-4" />
                </div>
                <span className="stat-label">페이지뷰</span>
              </div>
              <div className="stat-value">{totalPageViews.toLocaleString()}</div>
              <p className="text-xs text-text-tertiary">세션당 {totalSessions > 0 ? (totalPageViews / totalSessions).toFixed(1) : 0}페이지</p>
            </div>
            <div className="stat-card">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg flex items-center justify-center text-status-red bg-status-red-bg">
                  <LogOut className="w-4 h-4" />
                </div>
                <span className="stat-label">바운스율</span>
              </div>
              <div className="stat-value">{formatPercent(avgBounce)}</div>
              <p className="text-xs text-text-tertiary">1페이지만 보고 이탈</p>
            </div>
            <div className="stat-card">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg flex items-center justify-center text-status-green bg-status-green-bg">
                  <Clock className="w-4 h-4" />
                </div>
                <span className="stat-label">평균 체류</span>
              </div>
              <div className="stat-value">
                {totalSessions > 0
                  ? formatDuration(channelSummary.reduce((s, c) => s + c.avgDuration * c.sessions, 0) / totalSessions)
                  : '-'}
              </div>
            </div>
          </div>

          {/* ─── 1. 채널별 유입 흐름 ─── */}
          <div className="card">
            <button
              onClick={() => toggleSection('funnel')}
              className="card-header w-full flex items-center justify-between cursor-pointer"
            >
              <span className="card-header-title flex items-center gap-2">
                <Globe className="w-4 h-4" />
                채널별 유입 현황
              </span>
              {expandedSection.includes('funnel') ? <ChevronUp className="w-4 h-4 text-text-tertiary" /> : <ChevronDown className="w-4 h-4 text-text-tertiary" />}
            </button>
            {expandedSection.includes('funnel') && (
              <div className="card-body">
                {/* 채널별 바 차트 */}
                <div className="h-64 mb-4">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={channelSummary.slice(0, 8)} layout="vertical" margin={{ left: 100, right: 20 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                      <XAxis type="number" tick={{ fontSize: 11 }} />
                      <YAxis
                        type="category"
                        dataKey="channelKo"
                        tick={{ fontSize: 11 }}
                        width={95}
                      />
                      <Tooltip
                        formatter={(val: number, name: string) => [val.toLocaleString(), name === 'sessions' ? '세션' : name === 'engagedSessions' ? '참여 세션' : name]}
                        contentStyle={{ fontSize: 12 }}
                      />
                      <Bar dataKey="sessions" name="세션" fill="#6366f1" radius={[0, 4, 4, 0]} />
                      <Bar dataKey="engagedSessions" name="참여 세션" fill="#22c55e" radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                {/* 채널별 테이블 */}
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-border-light">
                        <th className="text-left py-2 px-2 font-semibold text-text-secondary">채널</th>
                        <th className="text-right py-2 px-2 font-semibold text-text-secondary">세션</th>
                        <th className="text-right py-2 px-2 font-semibold text-text-secondary">사용자</th>
                        <th className="text-right py-2 px-2 font-semibold text-text-secondary">바운스율</th>
                        <th className="text-right py-2 px-2 font-semibold text-text-secondary">참여율</th>
                        <th className="text-right py-2 px-2 font-semibold text-text-secondary">평균 체류</th>
                        <th className="text-right py-2 px-2 font-semibold text-text-secondary">페이지뷰</th>
                      </tr>
                    </thead>
                    <tbody>
                      {channelSummary.map(ch => (
                        <tr
                          key={ch.channel}
                          className="border-b border-border-light hover:bg-surface-secondary cursor-pointer transition-colors"
                          onClick={() => setChannelFilter(channelFilter === ch.channel ? 'all' : ch.channel)}
                        >
                          <td className="py-2 px-2 font-medium">
                            <span className={channelFilter === ch.channel ? 'text-primary-600' : 'text-text-primary'}>
                              {ch.channelKo}
                            </span>
                            {channelFilter === ch.channel && <span className="text-[10px] text-primary-500 ml-1">필터 중</span>}
                          </td>
                          <td className="text-right py-2 px-2 font-bold text-text-primary">{ch.sessions.toLocaleString()}</td>
                          <td className="text-right py-2 px-2 text-text-secondary">{ch.activeUsers.toLocaleString()}</td>
                          <td className="text-right py-2 px-2">
                            <span className={ch.bounceRate > 0.6 ? 'text-red-600 font-medium' : ch.bounceRate > 0.4 ? 'text-yellow-600' : 'text-green-600'}>
                              {formatPercent(ch.bounceRate)}
                            </span>
                          </td>
                          <td className="text-right py-2 px-2">
                            <span className={ch.engagementRate > 0.5 ? 'text-green-600 font-medium' : 'text-text-tertiary'}>
                              {formatPercent(ch.engagementRate)}
                            </span>
                          </td>
                          <td className="text-right py-2 px-2 text-text-secondary">{formatDuration(ch.avgDuration)}</td>
                          <td className="text-right py-2 px-2 text-text-secondary">{ch.pageViews.toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>

          {/* ─── 2. 유입 흐름: 채널 → 랜딩페이지 ─── */}
          <div className="card">
            <button
              onClick={() => toggleSection('flow')}
              className="card-header w-full flex items-center justify-between cursor-pointer"
            >
              <span className="card-header-title flex items-center gap-2">
                <ArrowRight className="w-4 h-4" />
                유입 흐름 (채널 &rarr; 랜딩페이지)
              </span>
              {expandedSection.includes('flow') ? <ChevronUp className="w-4 h-4 text-text-tertiary" /> : <ChevronDown className="w-4 h-4 text-text-tertiary" />}
            </button>
            {expandedSection.includes('flow') && (
              <div className="card-body">
                <div className="space-y-1.5">
                  {channelToLandingFlow.map((flow, i) => {
                    const maxSessions = channelToLandingFlow[0]?.sessions || 1
                    const pct = (flow.sessions / maxSessions) * 100
                    return (
                      <div key={i} className="flex items-center gap-2 text-xs">
                        <span className="w-24 text-right text-text-secondary font-medium truncate">{flow.from}</span>
                        <ArrowRight className="w-3 h-3 text-text-placeholder flex-shrink-0" />
                        <div className="flex-1 relative">
                          <div
                            className="absolute inset-y-0 left-0 bg-primary-100 rounded-r"
                            style={{ width: `${Math.max(pct, 2)}%` }}
                          />
                          <div className="relative flex items-center justify-between py-1.5 px-2">
                            <span className="text-text-primary font-medium truncate">{flow.to}</span>
                            <span className="text-text-secondary font-bold ml-2">{flow.sessions}</span>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>

          {/* ─── 3. 랜딩페이지 분석 ─── */}
          <div className="card">
            <button
              onClick={() => toggleSection('landing')}
              className="card-header w-full flex items-center justify-between cursor-pointer"
            >
              <span className="card-header-title flex items-center gap-2">
                <LogIn className="w-4 h-4" />
                랜딩 페이지 분석 (방문자가 처음 보는 페이지)
                {channelFilter !== 'all' && (
                  <span className="text-[10px] bg-primary-100 text-primary-700 px-2 py-0.5 rounded-full">
                    {channelKo(channelFilter)}
                  </span>
                )}
              </span>
              {expandedSection.includes('landing') ? <ChevronUp className="w-4 h-4 text-text-tertiary" /> : <ChevronDown className="w-4 h-4 text-text-tertiary" />}
            </button>
            {expandedSection.includes('landing') && (
              <div className="card-body">
                {channelFilter !== 'all' && (
                  <button
                    onClick={() => setChannelFilter('all')}
                    className="text-[10px] text-primary-600 hover:text-primary-700 mb-2"
                  >
                    필터 해제 &times;
                  </button>
                )}
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-border-light">
                        <th className="text-left py-2 px-2 font-semibold text-text-secondary">페이지</th>
                        <th className="text-right py-2 px-2 font-semibold text-text-secondary">세션</th>
                        <th className="text-right py-2 px-2 font-semibold text-text-secondary">바운스율</th>
                        <th className="text-right py-2 px-2 font-semibold text-text-secondary">참여율</th>
                        <th className="text-right py-2 px-2 font-semibold text-text-secondary">평균 체류</th>
                        <th className="text-left py-2 px-2 font-semibold text-text-secondary">바운스 시각화</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredLanding.slice(0, 25).map(lp => (
                        <tr key={lp.page} className="border-b border-border-light hover:bg-surface-secondary transition-colors">
                          <td className="py-2 px-2">
                            <span className="font-medium text-text-primary">{lp.prettyName}</span>
                            <span className="text-[10px] text-text-placeholder block">{lp.page}</span>
                          </td>
                          <td className="text-right py-2 px-2 font-bold text-text-primary">{lp.sessions}</td>
                          <td className="text-right py-2 px-2">
                            <span className={lp.bounceRate > 0.7 ? 'text-red-600 font-bold' : lp.bounceRate > 0.5 ? 'text-yellow-600 font-medium' : 'text-green-600'}>
                              {formatPercent(lp.bounceRate)}
                            </span>
                          </td>
                          <td className="text-right py-2 px-2">
                            <span className={lp.engagementRate > 0.5 ? 'text-green-600' : 'text-text-tertiary'}>
                              {formatPercent(lp.engagementRate)}
                            </span>
                          </td>
                          <td className="text-right py-2 px-2 text-text-secondary">{formatDuration(lp.avgDuration)}</td>
                          <td className="py-2 px-2 w-32">
                            <div className="flex items-center gap-1">
                              <div className="flex-1 bg-surface-tertiary rounded-full h-2 overflow-hidden">
                                <div
                                  className={`h-2 rounded-full ${lp.bounceRate > 0.7 ? 'bg-red-500' : lp.bounceRate > 0.5 ? 'bg-yellow-500' : 'bg-green-500'}`}
                                  style={{ width: `${lp.bounceRate * 100}%` }}
                                />
                              </div>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>

          {/* ─── 4. 이탈 페이지 분석 ─── */}
          <div className="card">
            <button
              onClick={() => toggleSection('exit')}
              className="card-header w-full flex items-center justify-between cursor-pointer"
            >
              <span className="card-header-title flex items-center gap-2">
                <LogOut className="w-4 h-4" />
                이탈 페이지 (방문자가 떠나는 페이지)
              </span>
              {expandedSection.includes('exit') ? <ChevronUp className="w-4 h-4 text-text-tertiary" /> : <ChevronDown className="w-4 h-4 text-text-tertiary" />}
            </button>
            {expandedSection.includes('exit') && (
              <div className="card-body">
                <p className="text-[11px] text-text-tertiary mb-3">
                  참여하지 않고 이탈한 세션이 많은 페이지 순. 이탈율이 높은 페이지의 콘텐츠/UX를 개선하면 전환율 향상에 효과적입니다.
                </p>
                <div className="space-y-2">
                  {exitPages.map((ep, i) => {
                    const maxNon = exitPages[0]?.nonEngagedSessions || 1
                    return (
                      <div key={ep.pagePath} className="flex items-center gap-3">
                        <span className="w-5 text-right text-[10px] text-text-placeholder font-mono">{i + 1}</span>
                        <div className="flex-1">
                          <div className="flex items-center justify-between mb-0.5">
                            <span className="text-xs font-medium text-text-primary">{prettyPath(ep.pagePath)}</span>
                            <div className="flex items-center gap-3 text-[10px]">
                              <span className="text-red-600 font-bold">{ep.nonEngagedSessions}건 이탈</span>
                              <span className="text-text-tertiary">이탈율 {(ep.exitRate).toFixed(1)}%</span>
                              <span className="text-text-tertiary">조회 {ep.pageViews}</span>
                            </div>
                          </div>
                          <div className="bg-surface-tertiary rounded-full h-1.5 overflow-hidden">
                            <div
                              className="h-1.5 rounded-full bg-red-400"
                              style={{ width: `${(ep.nonEngagedSessions / maxNon) * 100}%` }}
                            />
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>

          {/* ─── 5. 인사이트 요약 ─── */}
          <div className="card">
            <div className="card-header">
              <span className="card-header-title flex items-center gap-2">
                <TrendingDown className="w-4 h-4" />
                자동 인사이트
              </span>
            </div>
            <div className="card-body space-y-2">
              {/* 바운스율 높은 채널 */}
              {channelSummary.filter(c => c.bounceRate > 0.6 && c.sessions > 10).map(ch => (
                <div key={ch.channel} className="flex items-start gap-2 p-2 bg-red-50 rounded-lg">
                  <span className="text-red-500 mt-0.5">&#9888;</span>
                  <div className="text-xs">
                    <span className="font-bold text-red-700">{ch.channelKo}</span>
                    <span className="text-red-600"> 채널 바운스율 {formatPercent(ch.bounceRate)} ({ch.sessions}세션) — 랜딩 페이지 최적화 필요</span>
                  </div>
                </div>
              ))}

              {/* 바운스율 높은 랜딩페이지 (세션 많은 것) */}
              {filteredLanding.filter(lp => lp.bounceRate > 0.7 && lp.sessions > 10).slice(0, 3).map(lp => (
                <div key={lp.page} className="flex items-start gap-2 p-2 bg-yellow-50 rounded-lg">
                  <span className="text-yellow-500 mt-0.5">&#9888;</span>
                  <div className="text-xs">
                    <span className="font-bold text-yellow-700">{lp.prettyName}</span>
                    <span className="text-yellow-600"> 바운스율 {formatPercent(lp.bounceRate)} ({lp.sessions}세션) — 콘텐츠/CTA 개선 추천</span>
                  </div>
                </div>
              ))}

              {/* 참여율 높은 채널 (좋은 신호) */}
              {channelSummary.filter(c => c.engagementRate > 0.5 && c.sessions > 10).slice(0, 2).map(ch => (
                <div key={ch.channel} className="flex items-start gap-2 p-2 bg-green-50 rounded-lg">
                  <span className="text-green-500 mt-0.5">&#10004;</span>
                  <div className="text-xs">
                    <span className="font-bold text-green-700">{ch.channelKo}</span>
                    <span className="text-green-600"> 참여율 {formatPercent(ch.engagementRate)} — 효과적인 유입 채널</span>
                  </div>
                </div>
              ))}

              {channelSummary.length === 0 && (
                <p className="text-xs text-text-tertiary">데이터를 조회하면 자동 인사이트가 표시됩니다.</p>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
