'use client'

import { useEffect, useState, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Loading } from '@/components/ui/loading'
import { Select } from '@/components/ui/select'
import { STAGE_COLORS, formatNumber } from '@/lib/utils'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
  Cell, Legend, PieChart, Pie, Treemap,
} from 'recharts'
import {
  Lightbulb, AlertTriangle, CheckCircle2, Info, TrendingDown, TrendingUp,
  Users, Target, Clock, ArrowRight, Filter, ChevronDown, ChevronUp,
} from 'lucide-react'

// ─── Types ──────────────────────────────────────────────

interface Lead {
  id: string
  company_name: string
  stage: string
  assigned_to: string | null
  inquiry_channel: string | null
  industry: string | null
  interest_service: string | null
  inquiry_date: string | null
  created_at: string
  updated_at: string | null
  converted_at: string | null
  next_action_date: string | null
  priority: string | null
}

interface UserInfo {
  id: string
  name: string
}

interface Insight {
  type: 'danger' | 'warning' | 'success' | 'info'
  icon: React.ReactNode
  title: string
  description: string
}

// ─── Constants ──────────────────────────────────────────

const STAGE_ORDER = ['신규리드', '컨텍', '예정', '제안', '미팅', '도입직전', '도입완료', '이탈']
const ACTIVE_STAGES = ['신규리드', '컨텍', '예정', '제안', '미팅', '도입직전']
const FUNNEL_COLORS = ['#94a3b8', '#60a5fa', '#06b6d4', '#a78bfa', '#fbbf24', '#34d399', '#10b981', '#f87171']
// 장기 방치 판단 기준 (단계별). 예정은 설계 단계 문의 등이라 6개월 정상.
const STUCK_DAYS_BY_STAGE: Record<string, number> = {
  '신규리드': 90, '컨텍': 90, '제안': 90, '미팅': 90, '도입직전': 90,
  '예정': 180,
}
const isLongIdle = (stage: string, days: number) => days > (STUCK_DAYS_BY_STAGE[stage] ?? 90)
const INDUSTRY_COLORS = ['#3b82f6', '#8b5cf6', '#f59e0b', '#10b981', '#ef4444', '#ec4899', '#06b6d4', '#f97316', '#6366f1', '#14b8a6']

// ─── Component ──────────────────────────────────────────

export default function PipelineAnalyticsPage() {
  const [leads, setLeads] = useState<Lead[]>([])
  const [users, setUsers] = useState<UserInfo[]>([])
  const [loading, setLoading] = useState(true)

  // Filters
  const [filterAssignee, setFilterAssignee] = useState('전체')
  const [filterIndustry, setFilterIndustry] = useState('전체')
  const [filterChannel, setFilterChannel] = useState('전체')
  const [filterPeriod, setFilterPeriod] = useState('전체')

  // Collapse
  const [expandedSections, setExpandedSections] = useState<string[]>([
    'funnel', 'assignee', 'industry', 'channel', 'aging', 'insights'
  ])

  const supabase = createClient()

  useEffect(() => {
    fetchData()
  }, [])

  async function fetchData() {
    setLoading(true)
    const [leadsRes, usersRes] = await Promise.all([
      supabase.from('pipeline_leads').select('id, company_name, stage, assigned_to, inquiry_channel, industry, interest_service, inquiry_date, created_at, updated_at, converted_at, next_action_date, priority'),
      supabase.from('users').select('id, name'),
    ])
    setLeads(leadsRes.data || [])
    setUsers(usersRes.data || [])
    setLoading(false)
  }

  // ─── Helpers ────────────────────────────────────────────

  const userName = (id: string | null) => {
    if (!id) return '미배정'
    return users.find(u => u.id === id)?.name || '미배정'
  }

  const toggleSection = (s: string) => {
    setExpandedSections(prev => prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s])
  }

  const today = useMemo(() => {
    const n = new Date()
    return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`
  }, [])

  // ─── Filter ─────────────────────────────────────────────

  const filtered = useMemo(() => {
    let result = leads
    if (filterAssignee !== '전체') {
      result = result.filter(l => userName(l.assigned_to) === filterAssignee)
    }
    if (filterIndustry !== '전체') {
      result = result.filter(l => (l.industry || '미분류') === filterIndustry)
    }
    if (filterChannel !== '전체') {
      result = result.filter(l => (l.inquiry_channel || '미분류') === filterChannel)
    }
    if (filterPeriod !== '전체') {
      const now = new Date()
      let start: Date
      if (filterPeriod === '최근 30일') {
        start = new Date(now); start.setDate(start.getDate() - 30)
      } else if (filterPeriod === '최근 90일') {
        start = new Date(now); start.setDate(start.getDate() - 90)
      } else if (filterPeriod === '올해') {
        start = new Date(now.getFullYear(), 0, 1)
      } else {
        start = new Date(now.getFullYear() - 1, 0, 1)
      }
      const startStr = start.toISOString().split('T')[0]
      result = result.filter(l => (l.inquiry_date || l.created_at.substring(0, 10)) >= startStr)
    }
    return result
  }, [leads, filterAssignee, filterIndustry, filterChannel, filterPeriod, users])

  // ─── Filter Options ─────────────────────────────────────

  const assigneeOptions = useMemo(() => {
    const set = new Set(leads.map(l => userName(l.assigned_to)))
    return ['전체', ...Array.from(set).sort()]
  }, [leads, users])

  const industryOptions = useMemo(() => {
    const set = new Set(leads.map(l => l.industry || '미분류'))
    return ['전체', ...Array.from(set).sort()]
  }, [leads])

  const channelOptions = useMemo(() => {
    const set = new Set(leads.map(l => l.inquiry_channel || '미분류'))
    return ['전체', ...Array.from(set).sort()]
  }, [leads])

  // ─── 1. Funnel Analysis ─────────────────────────────────

  const funnelData = useMemo(() => {
    const counts: Record<string, number> = {}
    STAGE_ORDER.forEach(s => counts[s] = 0)
    filtered.forEach(l => { if (counts[l.stage] !== undefined) counts[l.stage]++ })

    // Cumulative funnel: how many reached each stage or beyond
    const cumulativeCounts = STAGE_ORDER.map((stage, idx) => {
      // For funnel: count of leads that are at this stage or have passed it
      // 이탈 is separate — we track active funnel stages only
      if (stage === '이탈') return { stage, count: counts['이탈'], pct: 0 }
      const passedStages = STAGE_ORDER.slice(idx).filter(s => s !== '이탈')
      const reached = passedStages.reduce((sum, s) => sum + (counts[s] || 0), 0)
      return { stage, count: reached, pct: 0 }
    }).filter(d => d.stage !== '이탈')

    const total = cumulativeCounts[0]?.count || 1
    cumulativeCounts.forEach(d => d.pct = Math.round(d.count / total * 100))

    return cumulativeCounts
  }, [filtered])

  const stageDistribution = useMemo(() => {
    const counts: Record<string, number> = {}
    STAGE_ORDER.forEach(s => counts[s] = 0)
    filtered.forEach(l => { if (counts[l.stage] !== undefined) counts[l.stage]++ })
    return STAGE_ORDER.map((stage, i) => ({
      stage,
      count: counts[stage],
      color: FUNNEL_COLORS[i],
    }))
  }, [filtered])

  // ─── 2. Assignee Analysis ──────────────────────────────

  const assigneeData = useMemo(() => {
    const map: Record<string, Record<string, number>> = {}
    filtered.forEach(l => {
      const name = userName(l.assigned_to)
      if (!map[name]) map[name] = {}
      map[name][l.stage] = (map[name][l.stage] || 0) + 1
    })

    return Object.entries(map).map(([name, stages]) => {
      const total = Object.values(stages).reduce((s, v) => s + v, 0)
      const converted = stages['도입완료'] || 0
      const lost = stages['이탈'] || 0
      const active = total - converted - lost
      const convRate = (converted + lost) > 0 ? Math.round(converted / (converted + lost) * 100) : 0
      return { name, total, converted, lost, active, convRate, stages }
    }).sort((a, b) => b.total - a.total)
  }, [filtered, users])

  // ─── 3. Industry Analysis ──────────────────────────────

  const industryData = useMemo(() => {
    const map: Record<string, Record<string, number>> = {}
    filtered.forEach(l => {
      const ind = l.industry || '미분류'
      if (!map[ind]) map[ind] = {}
      map[ind][l.stage] = (map[ind][l.stage] || 0) + 1
    })

    return Object.entries(map).map(([industry, stages]) => {
      const total = Object.values(stages).reduce((s, v) => s + v, 0)
      const converted = stages['도입완료'] || 0
      const lost = stages['이탈'] || 0
      const convRate = (converted + lost) > 0 ? Math.round(converted / (converted + lost) * 100) : 0
      return { industry, total, converted, lost, convRate, stages }
    }).sort((a, b) => b.total - a.total)
  }, [filtered])

  // ─── 4. Channel Analysis ───────────────────────────────

  const channelData = useMemo(() => {
    const map: Record<string, Record<string, number>> = {}
    filtered.forEach(l => {
      const ch = l.inquiry_channel || '미분류'
      if (!map[ch]) map[ch] = {}
      map[ch][l.stage] = (map[ch][l.stage] || 0) + 1
    })

    return Object.entries(map).map(([channel, stages]) => {
      const total = Object.values(stages).reduce((s, v) => s + v, 0)
      const converted = stages['도입완료'] || 0
      const lost = stages['이탈'] || 0
      const active = total - converted - lost
      const convRate = (converted + lost) > 0 ? Math.round(converted / (converted + lost) * 100) : 0
      return { channel, total, converted, lost, active, convRate }
    }).sort((a, b) => b.total - a.total)
  }, [filtered])

  // ─── 5. Aging Analysis ──────────────────────────────────

  const agingData = useMemo(() => {
    const activeLeads = filtered.filter(l => ACTIVE_STAGES.includes(l.stage))
    const now = new Date()

    const buckets = ACTIVE_STAGES.map(stage => {
      const stageLeads = activeLeads.filter(l => l.stage === stage)
      const ages = stageLeads.map(l => {
        const d = l.inquiry_date || l.created_at.substring(0, 10)
        return Math.max(0, Math.round((now.getTime() - new Date(d).getTime()) / 86400000))
      })
      const within30 = ages.filter(a => a <= 30).length
      const d31_60 = ages.filter(a => a > 30 && a <= 60).length
      const d61_90 = ages.filter(a => a > 60 && a <= 90).length
      const over90 = ages.filter(a => a > 90).length
      const avgAge = ages.length > 0 ? Math.round(ages.reduce((s, a) => s + a, 0) / ages.length) : 0

      return { stage, total: stageLeads.length, within30, d31_60, d61_90, over90, avgAge }
    })

    return buckets
  }, [filtered])

  // Stuck leads detail (단계별 기준: 예정 180일+, 나머지 90일+ 방치)
  const stuckLeads = useMemo(() => {
    const now = new Date()
    return filtered
      .filter(l => ACTIVE_STAGES.includes(l.stage))
      .map(l => {
        const d = l.inquiry_date || l.created_at.substring(0, 10)
        const days = Math.max(0, Math.round((now.getTime() - new Date(d).getTime()) / 86400000))
        return { ...l, days }
      })
      .filter(l => isLongIdle(l.stage, l.days))
      .sort((a, b) => b.days - a.days)
      .slice(0, 10)
  }, [filtered])

  // ─── 6. Monthly Trend ──────────────────────────────────
  // 유입(신규): inquiry_date 월 기준
  // 도입: converted_at 월 기준 (실제 도입 시점)
  // 이탈: updated_at 월 기준 (이탈 처리한 시점 근사)

  const monthlyTrend = useMemo(() => {
    const months: Record<string, { month: string; 신규: number; 도입: number; 이탈: number }> = {}
    const ensure = (m: string) => {
      if (!months[m]) months[m] = { month: m, 신규: 0, 도입: 0, 이탈: 0 }
      return months[m]
    }

    filtered.forEach(l => {
      // 신규 (유입): 유입일 기준
      const inquiryDate = l.inquiry_date || l.created_at?.substring(0, 10)
      if (inquiryDate) ensure(inquiryDate.substring(0, 7)).신규++

      // 도입: 실제 전환 시점(converted_at) 기준
      if (l.stage === '도입완료' && l.converted_at) {
        ensure(l.converted_at.substring(0, 7)).도입++
      }

      // 이탈: updated_at 기준 (이탈 처리 시점 근사)
      if (l.stage === '이탈' && l.updated_at) {
        ensure(l.updated_at.substring(0, 7)).이탈++
      }
    })

    return Object.values(months).sort((a, b) => a.month.localeCompare(b.month)).slice(-12)
  }, [filtered])

  // ─── 7. Conversion Time Analysis ──────────────────────

  const conversionTimeData = useMemo(() => {
    const converted = filtered.filter(l => l.stage === '도입완료' && l.converted_at && l.inquiry_date)
    const days = converted.map(l => {
      return Math.max(0, Math.round((new Date(l.converted_at!).getTime() - new Date(l.inquiry_date!).getTime()) / 86400000))
    }).filter(d => d < 365)

    if (days.length === 0) return null

    const buckets = [
      { label: '7일 이내', count: days.filter(d => d <= 7).length },
      { label: '8~30일', count: days.filter(d => d > 7 && d <= 30).length },
      { label: '31~60일', count: days.filter(d => d > 30 && d <= 60).length },
      { label: '61~90일', count: days.filter(d => d > 60 && d <= 90).length },
      { label: '90일+', count: days.filter(d => d > 90).length },
    ]

    return {
      avg: Math.round(days.reduce((s, d) => s + d, 0) / days.length),
      median: days.sort((a, b) => a - b)[Math.floor(days.length / 2)],
      total: days.length,
      buckets,
    }
  }, [filtered])

  // ─── 8. Auto Insights ──────────────────────────────────

  const insights = useMemo<Insight[]>(() => {
    if (filtered.length === 0) return []
    const result: Insight[] = []
    const total = filtered.length
    const active = filtered.filter(l => ACTIVE_STAGES.includes(l.stage))
    const converted = filtered.filter(l => l.stage === '도입완료')
    const lost = filtered.filter(l => l.stage === '이탈')
    const now = new Date()

    // 1. 전체 전환율
    const closed = converted.length + lost.length
    if (closed > 10) {
      const rate = Math.round(converted.length / closed * 100)
      if (rate >= 30) {
        result.push({
          type: 'success', icon: <CheckCircle2 className="w-4 h-4" />,
          title: `전환율 ${rate}% — 양호`,
          description: `종료된 ${formatNumber(closed)}건 중 ${formatNumber(converted.length)}건 도입완료. 세일즈 프로세스가 잘 동작하고 있습니다.`,
        })
      } else if (rate < 15) {
        result.push({
          type: 'danger', icon: <AlertTriangle className="w-4 h-4" />,
          title: `전환율 ${rate}% — 점검 필요`,
          description: `종료 ${formatNumber(closed)}건 중 도입완료 ${formatNumber(converted.length)}건. 이탈 원인 분석과 초기 리드 스크리닝 강화를 검토하세요.`,
        })
      }
    }

    // 2. 퍼널 병목 감지 — 단계별 이탈 비율
    const stageCounts: Record<string, number> = {}
    filtered.forEach(l => { stageCounts[l.stage] = (stageCounts[l.stage] || 0) + 1 })
    const activeStageData = ACTIVE_STAGES.map(s => ({ stage: s, count: stageCounts[s] || 0 }))
    const biggestStage = activeStageData.reduce((max, d) => d.count > max.count ? d : max, activeStageData[0])
    if (biggestStage && biggestStage.count > active.length * 0.5 && active.length > 10) {
      result.push({
        type: 'warning', icon: <TrendingDown className="w-4 h-4" />,
        title: `'${biggestStage.stage}' 단계에 ${Math.round(biggestStage.count / active.length * 100)}% 집중`,
        description: `활성 리드 ${formatNumber(active.length)}건 중 ${formatNumber(biggestStage.count)}건이 '${biggestStage.stage}'에 머물고 있습니다. 이 단계의 진행을 가속할 방법을 검토하세요.`,
      })
    }

    // 3. 장기 방치 리드 (단계별 기준: 예정 180일+, 나머지 90일+)
    const stuckCount = active.filter(l => {
      const d = l.inquiry_date || l.created_at.substring(0, 10)
      const days = Math.round((now.getTime() - new Date(d).getTime()) / 86400000)
      return isLongIdle(l.stage, days)
    }).length
    if (stuckCount > 0) {
      const pct = Math.round(stuckCount / Math.max(active.length, 1) * 100)
      result.push({
        type: stuckCount > 20 ? 'danger' : 'warning',
        icon: <Clock className="w-4 h-4" />,
        title: `장기 방치 리드 ${formatNumber(stuckCount)}건 (활성의 ${pct}%)`,
        description: `기준(예정 180일 / 나머지 90일) 이상 진행이 없는 리드입니다. 재접촉하거나 이탈 처리하세요.`,
      })
    }

    // 4. 미배정 리드
    const unassigned = active.filter(l => !l.assigned_to)
    if (unassigned.length > 0) {
      result.push({
        type: unassigned.length > 10 ? 'warning' : 'info',
        icon: <Users className="w-4 h-4" />,
        title: `미배정 리드 ${formatNumber(unassigned.length)}건`,
        description: `담당자가 배정되지 않은 활성 리드가 있습니다. 빠른 배정으로 대응 속도를 높이세요.`,
      })
    }

    // 5. 담당자별 불균형
    if (assigneeData.length >= 2) {
      const activeAssignees = assigneeData.filter(a => a.name !== '미배정' && a.active > 0)
      if (activeAssignees.length >= 2) {
        const max = activeAssignees.reduce((m, a) => a.active > m.active ? a : m, activeAssignees[0])
        const min = activeAssignees.reduce((m, a) => a.active < m.active ? a : m, activeAssignees[0])
        if (max.active > min.active * 3 && max.active > 10) {
          result.push({
            type: 'info', icon: <Users className="w-4 h-4" />,
            title: `담당자 리드 편차: ${max.name} ${max.active}건 vs ${min.name} ${min.active}건`,
            description: `활성 리드가 특정 담당자에게 집중되어 있습니다. 리드 재분배를 고려하세요.`,
          })
        }
      }
    }

    // 6. 최고 전환율 채널
    const chWithConv = channelData.filter(c => (c.converted + c.lost) >= 5)
    if (chWithConv.length > 0) {
      const best = chWithConv.reduce((m, c) => c.convRate > m.convRate ? c : m, chWithConv[0])
      const worst = chWithConv.reduce((m, c) => c.convRate < m.convRate ? c : m, chWithConv[0])
      if (best.convRate > 0) {
        result.push({
          type: 'success', icon: <Target className="w-4 h-4" />,
          title: `'${best.channel}' 전환율 ${best.convRate}% — 최고 채널`,
          description: `${formatNumber(best.converted + best.lost)}건 중 ${formatNumber(best.converted)}건 도입. 이 채널의 인바운드를 늘리는 전략을 고려하세요.`,
        })
      }
      if (worst.convRate < best.convRate && worst.convRate < 15 && worst.total >= 20) {
        result.push({
          type: 'warning', icon: <TrendingDown className="w-4 h-4" />,
          title: `'${worst.channel}' 전환율 ${worst.convRate}% — 최저 채널`,
          description: `유입은 ${formatNumber(worst.total)}건으로 많지만 전환이 낮습니다. 리드 품질 또는 대응 프로세스를 점검하세요.`,
        })
      }
    }

    // 7. 최고 전환율 업종
    const indWithConv = industryData.filter(d => (d.converted + d.lost) >= 5)
    if (indWithConv.length > 0) {
      const best = indWithConv.reduce((m, d) => d.convRate > m.convRate ? d : m, indWithConv[0])
      if (best.convRate > 0) {
        result.push({
          type: 'success', icon: <CheckCircle2 className="w-4 h-4" />,
          title: `'${best.industry}' 업종 전환율 ${best.convRate}% — 핵심 타깃`,
          description: `이 업종에서의 세일즈 성과가 가장 높습니다. 유사 업종 타깃팅을 강화하세요.`,
        })
      }
    }

    // 8. 후속조치 지연
    const overdue = active.filter(l => l.next_action_date && l.next_action_date < today)
    if (overdue.length > 0) {
      result.push({
        type: 'danger', icon: <Clock className="w-4 h-4" />,
        title: `후속조치 지연 ${formatNumber(overdue.length)}건`,
        description: `예정된 후속조치 일자가 지난 리드가 있습니다. 즉시 대응이 필요합니다.`,
      })
    }

    // 9. 후속조치 미설정
    const noAction = active.filter(l => !l.next_action_date)
    if (noAction.length > active.length * 0.5 && noAction.length > 5) {
      result.push({
        type: 'info', icon: <Info className="w-4 h-4" />,
        title: `활성 리드의 ${Math.round(noAction.length / Math.max(active.length, 1) * 100)}%가 후속조치 미설정`,
        description: `${formatNumber(noAction.length)}건의 리드에 다음 액션이 설정되지 않았습니다. 후속조치를 설정하면 리드 관리가 체계적으로 됩니다.`,
      })
    }

    // 10. 이번달 신규 리드 트렌드
    const thisMonth = today.substring(0, 7)
    const lastMonth = (() => {
      const d = new Date(); d.setMonth(d.getMonth() - 1)
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    })()
    const thisMonthCount = filtered.filter(l => (l.inquiry_date || '').startsWith(thisMonth)).length
    const lastMonthCount = filtered.filter(l => (l.inquiry_date || '').startsWith(lastMonth)).length
    if (lastMonthCount > 0) {
      const change = Math.round((thisMonthCount - lastMonthCount) / lastMonthCount * 100)
      if (change > 20) {
        result.push({
          type: 'success', icon: <TrendingUp className="w-4 h-4" />,
          title: `이번달 신규 유입 +${change}% (${formatNumber(lastMonthCount)}→${formatNumber(thisMonthCount)}건)`,
          description: `지난달 대비 인바운드가 증가하고 있습니다. 현재 마케팅 전략이 효과적입니다.`,
        })
      } else if (change < -20) {
        result.push({
          type: 'warning', icon: <TrendingDown className="w-4 h-4" />,
          title: `이번달 신규 유입 ${change}% (${formatNumber(lastMonthCount)}→${formatNumber(thisMonthCount)}건)`,
          description: `지난달 대비 인바운드가 감소하고 있습니다. 마케팅 채널 점검이 필요합니다.`,
        })
      }
    }

    return result
  }, [filtered, assigneeData, channelData, industryData, today])

  // ─── Summary KPIs ──────────────────────────────────────

  const kpis = useMemo(() => {
    const total = filtered.length
    const active = filtered.filter(l => ACTIVE_STAGES.includes(l.stage)).length
    const converted = filtered.filter(l => l.stage === '도입완료').length
    const lost = filtered.filter(l => l.stage === '이탈').length
    const closed = converted + lost
    const convRate = closed > 0 ? Math.round(converted / closed * 100) : 0
    return { total, active, converted, lost, convRate }
  }, [filtered])

  // ─── Section Header ────────────────────────────────────

  const SectionHeader = ({ id, title, count }: { id: string; title: string; count?: number }) => (
    <button
      onClick={() => toggleSection(id)}
      className="flex items-center justify-between w-full card-header cursor-pointer hover:bg-bg-secondary/50 transition-colors"
    >
      <span className="card-header-title">{title} {count !== undefined && <span className="text-text-tertiary font-normal">({count})</span>}</span>
      {expandedSections.includes(id) ? <ChevronUp className="w-4 h-4 text-text-tertiary" /> : <ChevronDown className="w-4 h-4 text-text-tertiary" />}
    </button>
  )

  // ─── Render ─────────────────────────────────────────────

  if (loading) return <Loading />

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-text-primary">세일즈 파이프라인 분석</h1>
          <p className="text-body-sm text-text-secondary mt-1">유입부터 도입까지 전체 흐름을 분석합니다</p>
        </div>
      </div>

      {/* Filters */}
      <div className="card">
        <div className="card-body">
          <div className="flex items-center gap-2 flex-wrap">
            <Filter className="w-4 h-4 text-text-tertiary" />
            <div className="w-32">
              <Select label="" value={filterPeriod} onChange={(e) => setFilterPeriod(e.target.value)}
                options={['전체', '최근 30일', '최근 90일', '올해', '작년'].map(v => ({ value: v, label: v }))} />
            </div>
            <div className="w-32">
              <Select label="" value={filterAssignee} onChange={(e) => setFilterAssignee(e.target.value)}
                options={assigneeOptions.map(v => ({ value: v, label: v }))} />
            </div>
            <div className="w-32">
              <Select label="" value={filterIndustry} onChange={(e) => setFilterIndustry(e.target.value)}
                options={industryOptions.map(v => ({ value: v, label: v }))} />
            </div>
            <div className="w-32">
              <Select label="" value={filterChannel} onChange={(e) => setFilterChannel(e.target.value)}
                options={channelOptions.map(v => ({ value: v, label: v }))} />
            </div>
            <span className="text-[11px] text-text-tertiary ml-2">{formatNumber(filtered.length)}건</span>
          </div>
        </div>
      </div>

      {/* KPI Summary */}
      <div className="grid grid-cols-5 gap-3">
        {[
          { label: '전체 리드', value: formatNumber(kpis.total), color: 'text-text-primary' },
          { label: '진행중', value: formatNumber(kpis.active), color: 'text-blue-600' },
          { label: '도입완료', value: formatNumber(kpis.converted), color: 'text-green-600' },
          { label: '이탈', value: formatNumber(kpis.lost), color: 'text-red-500' },
          { label: '전환율', value: `${kpis.convRate}%`, color: kpis.convRate >= 25 ? 'text-green-600' : kpis.convRate >= 15 ? 'text-yellow-600' : 'text-red-500' },
        ].map(kpi => (
          <div key={kpi.label} className="card text-center py-4">
            <p className="text-micro text-text-tertiary">{kpi.label}</p>
            <p className={`text-2xl font-bold mt-1 ${kpi.color}`}>{kpi.value}</p>
          </div>
        ))}
      </div>

      {/* Auto Insights */}
      {insights.length > 0 && (
        <div className="card">
          <SectionHeader id="insights" title="자동 인사이트" count={insights.length} />
          {expandedSections.includes('insights') && (
            <div className="card-body space-y-2">
              {insights.map((insight, i) => {
                const styles = { danger: 'bg-red-50 border-red-200', warning: 'bg-yellow-50 border-yellow-200', success: 'bg-green-50 border-green-200', info: 'bg-blue-50 border-blue-200' }
                const iconColors = { danger: 'text-red-500', warning: 'text-yellow-600', success: 'text-green-500', info: 'text-blue-500' }
                const titleColors = { danger: 'text-red-700', warning: 'text-yellow-700', success: 'text-green-700', info: 'text-blue-700' }
                const descColors = { danger: 'text-red-600', warning: 'text-yellow-600', success: 'text-green-600', info: 'text-blue-600' }
                return (
                  <div key={i} className={`flex items-start gap-2.5 p-3 rounded-lg border ${styles[insight.type]}`}>
                    <span className={`mt-0.5 flex-shrink-0 ${iconColors[insight.type]}`}>{insight.icon}</span>
                    <div className="min-w-0">
                      <p className={`text-xs font-bold ${titleColors[insight.type]}`}>{insight.title}</p>
                      <p className={`text-[11px] mt-0.5 ${descColors[insight.type]}`}>{insight.description}</p>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* Funnel */}
      <div className="card">
        <SectionHeader id="funnel" title="세일즈 퍼널" />
        {expandedSections.includes('funnel') && (
          <div className="card-body">
            {/* Funnel Visual */}
            <div className="space-y-1.5 mb-6">
              {funnelData.map((d, i) => (
                <div key={d.stage} className="flex items-center gap-3">
                  <span className="w-16 text-xs text-text-secondary text-right flex-shrink-0">{d.stage}</span>
                  <div className="flex-1 h-8 bg-bg-secondary rounded relative overflow-hidden">
                    <div
                      className="h-full rounded transition-all duration-500"
                      style={{
                        width: `${Math.max(d.pct, 2)}%`,
                        backgroundColor: FUNNEL_COLORS[i],
                      }}
                    />
                    <span className="absolute inset-0 flex items-center px-3 text-xs font-medium">
                      {formatNumber(d.count)}건 ({d.pct}%)
                    </span>
                  </div>
                </div>
              ))}
            </div>

            {/* Stage Distribution Bar */}
            <p className="text-xs text-text-tertiary mb-2">현재 단계별 분포</p>
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={stageDistribution} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis type="number" tick={{ fontSize: 11 }} />
                  <YAxis type="category" dataKey="stage" tick={{ fontSize: 11 }} width={60} />
                  <Tooltip formatter={(v: number) => [`${formatNumber(v)}건`, '건수']} />
                  <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                    {stageDistribution.map((d, i) => (
                      <Cell key={i} fill={d.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}
      </div>

      {/* Assignee Performance */}
      <div className="card">
        <SectionHeader id="assignee" title="담당자별 성과" count={assigneeData.length} />
        {expandedSections.includes('assignee') && (
          <div className="card-body">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border-light">
                    <th className="text-left py-2 px-3 text-text-tertiary font-medium">담당자</th>
                    <th className="text-center py-2 px-2 text-text-tertiary font-medium">전체</th>
                    <th className="text-center py-2 px-2 text-text-tertiary font-medium">진행중</th>
                    <th className="text-center py-2 px-2 text-text-tertiary font-medium">도입</th>
                    <th className="text-center py-2 px-2 text-text-tertiary font-medium">이탈</th>
                    <th className="text-center py-2 px-2 text-text-tertiary font-medium">전환율</th>
                    <th className="text-left py-2 px-2 text-text-tertiary font-medium w-1/3">단계 분포</th>
                  </tr>
                </thead>
                <tbody>
                  {assigneeData.map(a => (
                    <tr key={a.name} className="border-b border-border-light/50 hover:bg-bg-secondary/30">
                      <td className="py-2.5 px-3 font-medium text-text-primary">{a.name}</td>
                      <td className="text-center py-2.5 px-2">{formatNumber(a.total)}</td>
                      <td className="text-center py-2.5 px-2 text-blue-600">{formatNumber(a.active)}</td>
                      <td className="text-center py-2.5 px-2 text-green-600">{formatNumber(a.converted)}</td>
                      <td className="text-center py-2.5 px-2 text-red-500">{formatNumber(a.lost)}</td>
                      <td className="text-center py-2.5 px-2">
                        <span className={`font-bold ${a.convRate >= 25 ? 'text-green-600' : a.convRate >= 15 ? 'text-yellow-600' : 'text-red-500'}`}>
                          {a.convRate}%
                        </span>
                      </td>
                      <td className="py-2.5 px-2">
                        <div className="flex h-4 rounded overflow-hidden">
                          {STAGE_ORDER.map((stage, i) => {
                            const count = a.stages[stage] || 0
                            if (count === 0) return null
                            const pct = count / a.total * 100
                            return (
                              <div
                                key={stage}
                                className="h-full"
                                style={{ width: `${pct}%`, backgroundColor: FUNNEL_COLORS[i], minWidth: pct > 0 ? '2px' : 0 }}
                                title={`${stage}: ${count}건`}
                              />
                            )
                          })}
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

      {/* Industry Analysis */}
      <div className="card">
        <SectionHeader id="industry" title="업종별 분석" count={industryData.length} />
        {expandedSections.includes('industry') && (
          <div className="card-body">
            <div className="grid grid-cols-2 gap-4">
              {/* Chart */}
              <div className="h-72">
                <p className="text-xs text-text-tertiary mb-2">업종별 리드 수</p>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={industryData.slice(0, 10)} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis type="number" tick={{ fontSize: 10 }} />
                    <YAxis type="category" dataKey="industry" tick={{ fontSize: 10 }} width={80} />
                    <Tooltip formatter={(v: number) => [`${formatNumber(v)}건`, '건수']} />
                    <Bar dataKey="total" radius={[0, 4, 4, 0]}>
                      {industryData.slice(0, 10).map((_, i) => (
                        <Cell key={i} fill={INDUSTRY_COLORS[i % INDUSTRY_COLORS.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* Table */}
              <div className="overflow-y-auto max-h-72">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border-light">
                      <th className="text-left py-1.5 px-2 text-text-tertiary font-medium">업종</th>
                      <th className="text-center py-1.5 px-2 text-text-tertiary font-medium">전체</th>
                      <th className="text-center py-1.5 px-2 text-text-tertiary font-medium">도입</th>
                      <th className="text-center py-1.5 px-2 text-text-tertiary font-medium">전환율</th>
                    </tr>
                  </thead>
                  <tbody>
                    {industryData.map(d => (
                      <tr key={d.industry} className="border-b border-border-light/50">
                        <td className="py-1.5 px-2 text-text-primary">{d.industry}</td>
                        <td className="text-center py-1.5 px-2">{formatNumber(d.total)}</td>
                        <td className="text-center py-1.5 px-2 text-green-600">{formatNumber(d.converted)}</td>
                        <td className="text-center py-1.5 px-2">
                          <span className={`font-bold ${d.convRate >= 25 ? 'text-green-600' : d.convRate >= 15 ? 'text-yellow-600' : 'text-text-secondary'}`}>
                            {d.convRate}%
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Channel Efficiency */}
      <div className="card">
        <SectionHeader id="channel" title="유입채널별 전환 효율" count={channelData.length} />
        {expandedSections.includes('channel') && (
          <div className="card-body">
            <div className="h-64 mb-4">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={channelData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="channel" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} />
                  <Tooltip />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="converted" name="도입" stackId="a" fill="#10b981" radius={[0, 0, 0, 0]} />
                  <Bar dataKey="active" name="진행중" stackId="a" fill="#60a5fa" />
                  <Bar dataKey="lost" name="이탈" stackId="a" fill="#f87171" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border-light">
                    <th className="text-left py-1.5 px-3 text-text-tertiary font-medium">채널</th>
                    <th className="text-center py-1.5 px-2 text-text-tertiary font-medium">전체</th>
                    <th className="text-center py-1.5 px-2 text-text-tertiary font-medium">진행중</th>
                    <th className="text-center py-1.5 px-2 text-text-tertiary font-medium">도입</th>
                    <th className="text-center py-1.5 px-2 text-text-tertiary font-medium">이탈</th>
                    <th className="text-center py-1.5 px-2 text-text-tertiary font-medium">전환율</th>
                  </tr>
                </thead>
                <tbody>
                  {channelData.map(c => (
                    <tr key={c.channel} className="border-b border-border-light/50 hover:bg-bg-secondary/30">
                      <td className="py-2 px-3 font-medium text-text-primary">{c.channel}</td>
                      <td className="text-center py-2 px-2">{formatNumber(c.total)}</td>
                      <td className="text-center py-2 px-2 text-blue-600">{formatNumber(c.active)}</td>
                      <td className="text-center py-2 px-2 text-green-600">{formatNumber(c.converted)}</td>
                      <td className="text-center py-2 px-2 text-red-500">{formatNumber(c.lost)}</td>
                      <td className="text-center py-2 px-2">
                        <span className={`font-bold ${c.convRate >= 25 ? 'text-green-600' : c.convRate >= 15 ? 'text-yellow-600' : 'text-text-secondary'}`}>
                          {c.convRate}%
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Aging Analysis */}
      <div className="card">
        <SectionHeader id="aging" title="리드 에이징 분석" />
        {expandedSections.includes('aging') && (
          <div className="card-body">
            {/* Aging Heatmap Table */}
            <div className="overflow-x-auto mb-6">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border-light">
                    <th className="text-left py-2 px-3 text-text-tertiary font-medium">단계</th>
                    <th className="text-center py-2 px-2 text-text-tertiary font-medium">전체</th>
                    <th className="text-center py-2 px-2 text-text-tertiary font-medium">30일 이내</th>
                    <th className="text-center py-2 px-2 text-text-tertiary font-medium">31~60일</th>
                    <th className="text-center py-2 px-2 text-text-tertiary font-medium">61~90일</th>
                    <th className="text-center py-2 px-2 text-text-tertiary font-medium">90일+</th>
                    <th className="text-center py-2 px-2 text-text-tertiary font-medium">평균 체류일</th>
                  </tr>
                </thead>
                <tbody>
                  {agingData.map(d => (
                    <tr key={d.stage} className="border-b border-border-light/50">
                      <td className="py-2.5 px-3">
                        <span className={`text-micro px-1.5 py-0.5 rounded ${STAGE_COLORS[d.stage]}`}>{d.stage}</span>
                      </td>
                      <td className="text-center py-2.5 px-2 font-medium">{d.total}</td>
                      <td className="text-center py-2.5 px-2">
                        <span className={d.within30 > 0 ? 'text-green-600' : ''}>{d.within30}</span>
                      </td>
                      <td className="text-center py-2.5 px-2">
                        <span className={d.d31_60 > 0 ? 'text-yellow-600 font-medium' : ''}>{d.d31_60}</span>
                      </td>
                      <td className="text-center py-2.5 px-2">
                        <span className={d.d61_90 > 0 ? 'text-orange-600 font-medium' : ''}>{d.d61_90}</span>
                      </td>
                      <td className="text-center py-2.5 px-2">
                        <span className={d.over90 > 0 ? 'text-red-600 font-bold' : ''}>{d.over90}</span>
                      </td>
                      <td className="text-center py-2.5 px-2">
                        <span className={`font-medium ${d.avgAge > 60 ? 'text-red-500' : d.avgAge > 30 ? 'text-yellow-600' : 'text-green-600'}`}>
                          {d.avgAge}일
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Stuck Leads */}
            {stuckLeads.length > 0 && (
              <>
                <p className="text-xs text-text-tertiary mb-2">90일+ 장기 방치 리드 (상위 10건)</p>
                <div className="space-y-1">
                  {stuckLeads.map(l => (
                    <a key={l.id} href={`/pipeline/${l.id}`}
                      className="flex items-center justify-between py-2 px-3 rounded hover:bg-bg-secondary/50 transition-colors text-xs">
                      <div className="flex items-center gap-2">
                        <span className={`text-micro px-1.5 py-0.5 rounded ${STAGE_COLORS[l.stage]}`}>{l.stage}</span>
                        <span className="font-medium text-text-primary">{l.company_name}</span>
                        <span className="text-text-tertiary">{userName(l.assigned_to)}</span>
                      </div>
                      <span className="text-red-500 font-bold">{l.days}일</span>
                    </a>
                  ))}
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* Monthly Trend */}
      {monthlyTrend.length > 1 && (
        <div className="card">
          <div className="card-header">
            <span className="card-header-title">월별 트렌드</span>
          </div>
          <div className="card-body">
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={monthlyTrend}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} />
                  <Tooltip />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="신규" fill="#60a5fa" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="도입" fill="#10b981" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="이탈" fill="#f87171" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}

      {/* Conversion Time */}
      {conversionTimeData && (
        <div className="card">
          <div className="card-header">
            <span className="card-header-title">전환 소요 기간</span>
          </div>
          <div className="card-body">
            <div className="grid grid-cols-3 gap-4 mb-4">
              <div className="text-center">
                <p className="text-micro text-text-tertiary">평균</p>
                <p className="text-xl font-bold text-text-primary">{conversionTimeData.avg}일</p>
              </div>
              <div className="text-center">
                <p className="text-micro text-text-tertiary">중앙값</p>
                <p className="text-xl font-bold text-text-primary">{conversionTimeData.median}일</p>
              </div>
              <div className="text-center">
                <p className="text-micro text-text-tertiary">도입완료 건수</p>
                <p className="text-xl font-bold text-green-600">{conversionTimeData.total}건</p>
              </div>
            </div>
            <div className="h-40">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={conversionTimeData.buckets}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="label" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} />
                  <Tooltip formatter={(v: number) => [`${v}건`, '건수']} />
                  <Bar dataKey="count" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
