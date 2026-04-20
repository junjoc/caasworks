'use client'

import { useEffect, useState, useMemo, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { DateRangePicker, type DateRange } from '@/components/ui/date-range-picker'
import { Loading } from '@/components/ui/loading'
import { formatNumber } from '@/lib/utils'
import { Sparkles, Clock, CalendarDays, TrendingUp, BarChart3, Target } from 'lucide-react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer
} from 'recharts'

interface InboundLead {
  inquiry_date: string | null
  inquiry_hour: number | null
  inquiry_channel: string | null
  stage: string | null
}

type StageFilter = '전체' | '도입완료' | '이탈'

const DAY_NAMES = ['월', '화', '수', '목', '금', '토', '일']
const HOUR_LABELS = ['새벽(0-6)', '아침(6-9)', '오전(9-12)', '오후(12-15)', '늦은오후(15-18)', '저녁(18-21)', '야간(21-24)']
const CHANNEL_COLORS: Record<string, string> = {
  '네이버': '#60CA21',
  '구글': '#1890ff',
  '메타': '#6366f1',
  '유튜브': '#ef4444',
  '검색유입': '#FFA940',
  '자사채널': '#6366f1',
  '블로그': '#06D6A6',
  '언론': '#a855f7',
  '대표전화': '#f59e0b',
  '개인전화': '#f59e0b',
  '추천': '#ec4899',
  '이벤트/행사': '#fb923c',
  '기타': '#94a3b8',
  // 레거시 호환
  '홈페이지': '#6366f1',
  '전화': '#f59e0b',
  '소개': '#ec4899',
  '검색채널': '#FFA940',
  '문의하기': '#6366f1',
  '공식홈페이지': '#6366f1',
}
const CHART_COLORS = ['#6366f1', '#f59e0b', '#60CA21', '#ec4899', '#06D6A6', '#1890ff', '#FFA940', '#94a3b8']

function getHourSlot(h: number): number {
  if (h < 6) return 0
  if (h < 9) return 1
  if (h < 12) return 2
  if (h < 15) return 3
  if (h < 18) return 4
  if (h < 21) return 5
  return 6
}

function getHourSlotLabel(h: number): string {
  if (h < 6) return '새벽'
  if (h < 9) return '아침'
  if (h < 12) return '오전'
  if (h < 15) return '오후'
  if (h < 18) return '늦은오후'
  if (h < 21) return '저녁'
  return '야간'
}

/* ─── Heatmap Component ─── */
function HeatmapGrid({ data }: { data: number[][] }) {
  const max = Math.max(...data.flat(), 1)

  return (
    <div className="overflow-x-auto">
      <div className="grid" style={{ gridTemplateColumns: 'auto repeat(24, 1fr)', gap: '2px', minWidth: '700px' }}>
        {/* Header row */}
        <div className="text-[10px] text-text-tertiary text-center" />
        {Array.from({ length: 24 }, (_, h) => (
          <div key={h} className="text-[10px] text-center text-text-tertiary py-0.5">
            {h}
          </div>
        ))}
        {/* Data rows */}
        {DAY_NAMES.map((day, di) => (
          <>
            <div key={`label-${di}`} className="text-xs font-medium text-text-secondary pr-2 flex items-center justify-end">
              {day}
            </div>
            {data[di].map((count, hi) => {
              const intensity = count / max
              const bg = count === 0
                ? '#f3f4f6'
                : `rgba(99, 102, 241, ${0.12 + intensity * 0.88})`
              const textColor = intensity > 0.5 ? '#fff' : intensity > 0.2 ? '#4338ca' : '#6b7280'
              return (
                <div
                  key={`${di}-${hi}`}
                  className="aspect-square rounded-sm flex items-center justify-center text-[9px] font-medium transition-colors cursor-default"
                  style={{ backgroundColor: bg, color: textColor }}
                  title={`${day}요일 ${hi}시: ${count}건`}
                >
                  {count > 0 ? count : ''}
                </div>
              )
            })}
          </>
        ))}
      </div>
      {/* Legend */}
      <div className="flex items-center justify-end gap-2 mt-2 text-[10px] text-text-tertiary">
        <span>적음</span>
        <div className="flex gap-0.5">
          {[0.1, 0.3, 0.5, 0.7, 0.9].map(v => (
            <div key={v} className="w-4 h-3 rounded-sm" style={{ backgroundColor: `rgba(99,102,241,${v})` }} />
          ))}
        </div>
        <span>많음</span>
      </div>
    </div>
  )
}

/* ─── Main Tab ─── */
export default function InboundTimeTab() {
  const [leads, setLeads] = useState<InboundLead[]>([])
  const [allLeads, setAllLeads] = useState<InboundLead[]>([])
  const [loading, setLoading] = useState(true)
  const [dateRange, setDateRange] = useState<DateRange>({ from: '', to: '' })
  const [stageFilter, setStageFilter] = useState<StageFilter>('전체')
  const supabase = createClient()

  const fetchData = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase
      .from('pipeline_leads')
      .select('inquiry_date, inquiry_hour, inquiry_channel, stage')
      .order('inquiry_date', { ascending: true })

    setAllLeads(data || [])
    setLoading(false)
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  // 날짜 + 단계 필터 적용
  useEffect(() => {
    let filtered = allLeads
    if (dateRange.from && dateRange.to) {
      filtered = filtered.filter(l => {
        const d = l.inquiry_date || ''
        return d >= dateRange.from && d <= dateRange.to
      })
    }
    if (stageFilter !== '전체') {
      filtered = filtered.filter(l => l.stage === stageFilter)
    }
    setLeads(filtered)
  }, [allLeads, dateRange, stageFilter])

  // 도입/이탈 비교 데이터
  const stageComparison = useMemo(() => {
    let base = allLeads
    if (dateRange.from && dateRange.to) {
      base = base.filter(l => {
        const d = l.inquiry_date || ''
        return d >= dateRange.from && d <= dateRange.to
      })
    }
    const adopted = base.filter(l => l.stage === '도입완료' && l.inquiry_hour !== null)
    const churned = base.filter(l => l.stage === '이탈' && l.inquiry_hour !== null)

    // 요일별
    const adoptedDow = Array(7).fill(0)
    const churnedDow = Array(7).fill(0)
    adopted.forEach(l => { if (l.inquiry_date) { adoptedDow[(new Date(l.inquiry_date + 'T00:00:00').getDay() + 6) % 7]++ } })
    churned.forEach(l => { if (l.inquiry_date) { churnedDow[(new Date(l.inquiry_date + 'T00:00:00').getDay() + 6) % 7]++ } })

    const dowData = DAY_NAMES.map((name, i) => ({
      name,
      도입완료: adoptedDow[i],
      이탈: churnedDow[i],
    }))

    // 시간대별
    const adoptedHour = Array(7).fill(0)
    const churnedHour = Array(7).fill(0)
    adopted.forEach(l => { adoptedHour[getHourSlot(l.inquiry_hour!)]++ })
    churned.forEach(l => { churnedHour[getHourSlot(l.inquiry_hour!)]++ })

    const slotData = HOUR_LABELS.map((label, i) => ({
      label: label.split('(')[0],
      도입완료: adoptedHour[i],
      이탈: churnedHour[i],
    }))

    // 시간별 상세
    const adoptedHourDetail = Array(24).fill(0)
    const churnedHourDetail = Array(24).fill(0)
    adopted.forEach(l => { adoptedHourDetail[l.inquiry_hour!]++ })
    churned.forEach(l => { churnedHourDetail[l.inquiry_hour!]++ })

    const hourDetail = Array.from({ length: 24 }, (_, h) => ({
      label: `${h}시`,
      도입완료: adoptedHourDetail[h],
      이탈: churnedHourDetail[h],
    }))

    // 전환율 by 시간대
    const convBySlot = HOUR_LABELS.map((label, i) => {
      const total = adoptedHour[i] + churnedHour[i]
      return {
        label: label.split('(')[0],
        전환율: total > 0 ? Math.round(adoptedHour[i] / total * 100) : 0,
        total,
      }
    })

    return { dowData, slotData, hourDetail, convBySlot, adoptedCount: adopted.length, churnedCount: churned.length }
  }, [allLeads, dateRange])

  const withHour = useMemo(() => leads.filter(l => l.inquiry_hour !== null), [leads])

  // ─── 요일별 데이터 ───
  const dayOfWeekData = useMemo(() => {
    const counts = Array(7).fill(0)
    leads.forEach(l => {
      if (l.inquiry_date) {
        const dow = new Date(l.inquiry_date + 'T00:00:00').getDay() // 0=Sun
        const reindexed = (dow + 6) % 7 // 0=Mon
        counts[reindexed]++
      }
    })
    return DAY_NAMES.map((name, i) => ({ name, count: counts[i] }))
  }, [leads])

  // ─── 시간별 데이터 ───
  const hourData = useMemo(() => {
    const counts = Array(24).fill(0)
    withHour.forEach(l => { counts[l.inquiry_hour!]++ })
    return counts.map((count, h) => ({ hour: h, label: `${h}시`, count }))
  }, [withHour])

  // ─── 시간대 그룹 데이터 ───
  const timeSlotData = useMemo(() => {
    const slots = Array(7).fill(0)
    withHour.forEach(l => { slots[getHourSlot(l.inquiry_hour!)]++ })
    return HOUR_LABELS.map((label, i) => ({ label, count: slots[i] }))
  }, [withHour])

  // ─── 히트맵 데이터 (요일 x 시간) ───
  const heatmapData = useMemo(() => {
    const matrix: number[][] = Array.from({ length: 7 }, () => Array(24).fill(0))
    withHour.forEach(l => {
      if (l.inquiry_date) {
        const dow = new Date(l.inquiry_date + 'T00:00:00').getDay()
        const reindexed = (dow + 6) % 7
        matrix[reindexed][l.inquiry_hour!]++
      }
    })
    return matrix
  }, [withHour])

  // ─── 채널별 시간 패턴 ───
  const channelTimeData = useMemo(() => {
    const map: Record<string, number[]> = {}
    withHour.forEach(l => {
      const ch = l.inquiry_channel || '기타'
      if (!map[ch]) map[ch] = Array(24).fill(0)
      map[ch][l.inquiry_hour!]++
    })
    // 상위 6개 채널만
    const sorted = Object.entries(map).sort((a, b) => b[1].reduce((s, v) => s + v, 0) - a[1].reduce((s, v) => s + v, 0))
    const top = sorted.slice(0, 6)
    return Object.fromEntries(top)
  }, [withHour])

  // ─── 채널별 시간대 요약 ───
  const channelSlotSummary = useMemo(() => {
    const result: { channel: string; total: number; slots: number[] }[] = []
    Object.entries(channelTimeData).forEach(([ch, hours]) => {
      const slots = Array(7).fill(0)
      hours.forEach((c, h) => { slots[getHourSlot(h)] += c })
      result.push({ channel: ch, total: hours.reduce((s, v) => s + v, 0), slots })
    })
    return result.sort((a, b) => b.total - a.total)
  }, [channelTimeData])

  // ─── 자동 인사이트 ───
  const insights = useMemo(() => {
    const lines: { type: 'positive' | 'info' | 'warning'; text: string }[] = []
    if (leads.length === 0) return lines

    // 피크 요일
    const peakDay = dayOfWeekData.reduce((a, b) => a.count > b.count ? a : b)
    const avgDay = leads.length / 7
    if (peakDay.count > 0) {
      lines.push({ type: 'positive', text: `${peakDay.name}요일에 문의가 가장 많습니다 (${peakDay.count}건, 평균 대비 ${Math.round(peakDay.count / avgDay * 100 - 100)}% 높음)` })
    }

    // 가장 적은 요일
    const minDay = dayOfWeekData.reduce((a, b) => a.count < b.count ? a : b)
    if (minDay.count >= 0 && minDay.name !== peakDay.name) {
      lines.push({ type: 'info', text: `${minDay.name}요일이 가장 적습니다 (${minDay.count}건)` })
    }

    // 피크 시간대
    if (withHour.length > 0) {
      const peakHour = hourData.reduce((a, b) => a.count > b.count ? a : b)
      const slotName = getHourSlotLabel(peakHour.hour)
      lines.push({ type: 'positive', text: `${slotName} ${peakHour.hour}시에 가장 활발합니다 (${peakHour.count}건)` })

      // 야간 비율
      const nightCount = hourData.filter(h => h.hour >= 21 || h.hour < 6).reduce((s, h) => s + h.count, 0)
      const total = withHour.length
      if (total > 0 && nightCount > 0) {
        const pct = (nightCount / total * 100).toFixed(1)
        if (nightCount / total > 0.1) {
          lines.push({ type: 'warning', text: `야간(21시~06시) 문의가 전체의 ${pct}%입니다 — 자동 응답 시스템 검토 필요` })
        } else {
          lines.push({ type: 'info', text: `야간 문의 비율: ${pct}%` })
        }
      }

      // 점심시간 패턴
      const lunchCount = hourData.filter(h => h.hour >= 12 && h.hour < 14).reduce((s, h) => s + h.count, 0)
      if (total > 0 && lunchCount / total > 0.15) {
        lines.push({ type: 'info', text: `점심시간(12~14시) 문의가 ${(lunchCount / total * 100).toFixed(1)}%로 높습니다` })
      }

      // 주말 비율
      const weekendCount = dayOfWeekData.slice(5).reduce((s, d) => s + d.count, 0) // 토,일
      const weekdayCount = dayOfWeekData.slice(0, 5).reduce((s, d) => s + d.count, 0)
      if (leads.length > 0) {
        const weekendPct = (weekendCount / leads.length * 100).toFixed(1)
        if (weekendCount / leads.length > 0.15) {
          lines.push({ type: 'warning', text: `주말 문의가 ${weekendPct}%입니다 — 주말 응대 체계 점검 필요` })
        }
      }

      // 채널별 특이 패턴
      Object.entries(channelTimeData).forEach(([ch, hours]) => {
        const chTotal = hours.reduce((a, b) => a + b, 0)
        if (chTotal < 5) return
        const chNight = hours.filter((_, h) => h >= 21 || h < 6).reduce((a, b) => a + b, 0)
        if (chNight / chTotal > 0.2) {
          lines.push({ type: 'info', text: `${ch} 채널은 야간 문의 비율이 높습니다 (${(chNight / chTotal * 100).toFixed(0)}%)` })
        }
      })
    }

    // 시간 데이터 없는 건
    const noHourCount = leads.length - withHour.length
    if (noHourCount > 0) {
      lines.push({ type: 'info', text: `${noHourCount}건은 시간 정보가 없어 시간대 분석에서 제외됨 (일과중 문의로 추정)` })
    }

    // 도입/이탈 비교 인사이트
    if (stageComparison.adoptedCount > 0 && stageComparison.churnedCount > 0) {
      // 전환율 가장 높은 시간대
      const bestSlot = stageComparison.convBySlot.filter(d => d.total >= 5).sort((a, b) => b.전환율 - a.전환율)[0]
      if (bestSlot) {
        lines.push({ type: 'positive', text: `${bestSlot.label} 시간대 문의의 전환율이 ${bestSlot.전환율}%로 가장 높습니다` })
      }
      // 전환율 가장 낮은 시간대
      const worstSlot = stageComparison.convBySlot.filter(d => d.total >= 5).sort((a, b) => a.전환율 - b.전환율)[0]
      if (worstSlot && worstSlot.label !== bestSlot?.label) {
        lines.push({ type: 'warning', text: `${worstSlot.label} 시간대는 전환율 ${worstSlot.전환율}%로 낮습니다 — 응대 전략 개선 필요` })
      }
    }

    return lines
  }, [leads, withHour, dayOfWeekData, hourData, channelTimeData, stageComparison])

  if (loading) return <Loading />

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <DateRangePicker value={dateRange} onChange={setDateRange} />
          <div className="flex gap-1 bg-gray-100 rounded-lg p-0.5">
            {(['전체', '도입완료', '이탈'] as StageFilter[]).map(sf => (
              <button key={sf} onClick={() => setStageFilter(sf)}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                  stageFilter === sf
                    ? sf === '도입완료' ? 'bg-green-500 text-white shadow-sm'
                      : sf === '이탈' ? 'bg-red-400 text-white shadow-sm'
                      : 'bg-white text-text-primary shadow-sm'
                    : 'text-text-secondary hover:text-text-primary'
                }`}>
                {sf}
              </button>
            ))}
          </div>
          <span className="text-xs text-text-tertiary">
            {leads.length}건 · 시간정보 {withHour.length}건
          </span>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <div className="card p-4">
          <div className="flex items-center gap-2 mb-1">
            <BarChart3 className="w-4 h-4 text-indigo-500" />
            <span className="text-xs text-text-secondary">총 인바운드</span>
          </div>
          <p className="text-xl font-bold">{formatNumber(leads.length)}건</p>
        </div>
        <div className="card p-4">
          <div className="flex items-center gap-2 mb-1">
            <CalendarDays className="w-4 h-4 text-blue-500" />
            <span className="text-xs text-text-secondary">피크 요일</span>
          </div>
          <p className="text-xl font-bold">
            {dayOfWeekData.reduce((a, b) => a.count > b.count ? a : b).name}요일
          </p>
          <p className="text-xs text-text-tertiary">{dayOfWeekData.reduce((a, b) => a.count > b.count ? a : b).count}건</p>
        </div>
        <div className="card p-4">
          <div className="flex items-center gap-2 mb-1">
            <Clock className="w-4 h-4 text-orange-500" />
            <span className="text-xs text-text-secondary">피크 시간</span>
          </div>
          {withHour.length > 0 ? (
            <>
              <p className="text-xl font-bold">{hourData.reduce((a, b) => a.count > b.count ? a : b).hour}시</p>
              <p className="text-xs text-text-tertiary">{hourData.reduce((a, b) => a.count > b.count ? a : b).count}건</p>
            </>
          ) : (
            <p className="text-sm text-text-tertiary">데이터 없음</p>
          )}
        </div>
        <div className="card p-4">
          <div className="flex items-center gap-2 mb-1">
            <TrendingUp className="w-4 h-4 text-green-500" />
            <span className="text-xs text-text-secondary">일평균</span>
          </div>
          {leads.length > 0 ? (
            <>
              <p className="text-xl font-bold">
                {(() => {
                  const dates = new Set(leads.map(l => l.inquiry_date).filter(Boolean))
                  return dates.size > 0 ? (leads.length / dates.size).toFixed(1) : '0'
                })()}건
              </p>
              <p className="text-xs text-text-tertiary">{new Set(leads.map(l => l.inquiry_date).filter(Boolean)).size}일간</p>
            </>
          ) : (
            <p className="text-sm text-text-tertiary">-</p>
          )}
        </div>
      </div>

      {/* 자동 인사이트 */}
      {insights.length > 0 && (
        <div className="card p-5 mb-6 bg-gradient-to-r from-violet-50/80 to-indigo-50/50 border-violet-100">
          <h3 className="text-sm font-semibold flex items-center gap-1.5 mb-3 text-violet-700">
            <Sparkles className="w-4 h-4" /> 자동 인사이트
          </h3>
          <div className="space-y-2">
            {insights.map((ins, i) => (
              <div key={i} className={`flex items-start gap-2 text-sm ${
                ins.type === 'positive' ? 'text-green-700' :
                ins.type === 'warning' ? 'text-amber-700' :
                'text-text-secondary'
              }`}>
                <span className="mt-0.5">
                  {ins.type === 'positive' ? '✅' : ins.type === 'warning' ? '⚠️' : 'ℹ️'}
                </span>
                <span>{ins.text}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Row 1: 요일별 + 시간대별 차트 */}
      <div className="grid lg:grid-cols-2 gap-6 mb-6">
        <div className="card p-5">
          <h3 className="text-sm font-semibold mb-4">요일별 문의 건수</h3>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={dayOfWeekData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="name" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip formatter={(v: number) => [`${v}건`, '문의']} />
              <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                {dayOfWeekData.map((_, i) => (
                  <rect key={i} fill={i >= 5 ? '#f59e0b' : '#6366f1'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          <p className="text-[10px] text-text-tertiary text-center mt-1">토/일은 주말 (노란색)</p>
        </div>

        <div className="card p-5">
          <h3 className="text-sm font-semibold mb-4">시간대별 문의 건수</h3>
          {withHour.length > 0 ? (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={timeSlotData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="label" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v: number) => [`${v}건`, '문의']} />
                <Bar dataKey="count" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-[280px] text-sm text-text-tertiary">
              시간 데이터를 백필하면 표시됩니다
            </div>
          )}
        </div>
      </div>

      {/* Row 2: 히트맵 */}
      {withHour.length > 0 && (
        <div className="card p-5 mb-6">
          <h3 className="text-sm font-semibold mb-4">요일 × 시간 히트맵</h3>
          <p className="text-xs text-text-tertiary mb-3">색이 진할수록 문의가 많은 시간대입니다</p>
          <HeatmapGrid data={heatmapData} />
        </div>
      )}

      {/* Row 3: 시간별 상세 차트 */}
      {withHour.length > 0 && (
        <div className="card p-5 mb-6">
          <h3 className="text-sm font-semibold mb-4">시간별 문의 분포 (0~23시)</h3>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={hourData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="label" tick={{ fontSize: 10 }} interval={0} angle={-45} textAnchor="end" height={50} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip formatter={(v: number) => [`${v}건`, '문의']} />
              <Bar dataKey="count" fill="#6366f1" radius={[3, 3, 0, 0]}>
                {hourData.map((d, i) => (
                  <rect key={i} fill={d.hour >= 9 && d.hour < 18 ? '#6366f1' : d.hour >= 18 || d.hour < 6 ? '#f59e0b' : '#8b5cf6'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          <div className="flex items-center justify-center gap-4 mt-2 text-[10px] text-text-tertiary">
            <span className="flex items-center gap-1"><span className="w-3 h-2 rounded-sm bg-[#6366f1]" /> 업무시간(9-18)</span>
            <span className="flex items-center gap-1"><span className="w-3 h-2 rounded-sm bg-[#8b5cf6]" /> 아침/저녁(6-9,18-21)</span>
            <span className="flex items-center gap-1"><span className="w-3 h-2 rounded-sm bg-[#f59e0b]" /> 새벽/야간</span>
          </div>
        </div>
      )}

      {/* Row 4: 채널별 시간 패턴 */}
      {Object.keys(channelTimeData).length > 0 && (
        <div className="card p-5">
          <h3 className="text-sm font-semibold mb-4">채널별 시간대 분포</h3>
          <div className="overflow-x-auto">
            <table className="data-table text-sm">
              <thead>
                <tr>
                  <th className="text-left">채널</th>
                  <th className="text-right">전체</th>
                  {HOUR_LABELS.map(l => (
                    <th key={l} className="text-right text-[10px]">{l.split('(')[0]}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {channelSlotSummary.map(row => (
                  <tr key={row.channel}>
                    <td className="font-medium">{row.channel}</td>
                    <td className="text-right font-bold">{row.total}</td>
                    {row.slots.map((c, i) => {
                      const pct = row.total > 0 ? c / row.total : 0
                      return (
                        <td key={i} className="text-right" style={{
                          backgroundColor: pct > 0.2 ? `rgba(99,102,241,${pct * 0.5})` : undefined
                        }}>
                          {c > 0 ? c : '-'}
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ─── 도입 vs 이탈 비교 섹션 ─── */}
      {(stageComparison.adoptedCount > 0 || stageComparison.churnedCount > 0) && (
        <>
          <div className="mt-8 mb-4">
            <h2 className="text-base font-bold text-text-primary flex items-center gap-2">
              <Target className="w-5 h-5 text-indigo-500" />
              도입완료 vs 이탈 비교
            </h2>
            <p className="text-xs text-text-tertiary mt-1">
              도입완료 {stageComparison.adoptedCount}건 · 이탈 {stageComparison.churnedCount}건 (시간정보 있는 건만)
            </p>
          </div>

          {/* 비교 Row 1: 요일별 + 시간대별 */}
          <div className="grid lg:grid-cols-2 gap-6 mb-6">
            <div className="card p-5">
              <h3 className="text-sm font-semibold mb-4">요일별 도입/이탈 비교</h3>
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={stageComparison.dowData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="도입완료" fill="#22c55e" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="이탈" fill="#f87171" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="card p-5">
              <h3 className="text-sm font-semibold mb-4">시간대별 도입/이탈 비교</h3>
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={stageComparison.slotData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="label" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="도입완료" fill="#22c55e" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="이탈" fill="#f87171" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* 비교 Row 2: 시간별 상세 + 전환율 */}
          <div className="grid lg:grid-cols-2 gap-6 mb-6">
            <div className="card p-5">
              <h3 className="text-sm font-semibold mb-4">시간별 도입/이탈 상세 (0~23시)</h3>
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={stageComparison.hourDetail}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="label" tick={{ fontSize: 9 }} interval={1} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="도입완료" stackId="a" fill="#22c55e" />
                  <Bar dataKey="이탈" stackId="a" fill="#f87171" />
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="card p-5">
              <h3 className="text-sm font-semibold mb-4">시간대별 전환율 (도입 / (도입+이탈))</h3>
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={stageComparison.convBySlot.filter(d => d.total > 0)}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="label" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 11 }} domain={[0, 100]} tickFormatter={v => `${v}%`} />
                  <Tooltip formatter={(v: number) => [`${v}%`, '전환율']} />
                  <Bar dataKey="전환율" radius={[4, 4, 0, 0]}>
                    {stageComparison.convBySlot.filter(d => d.total > 0).map((d, i) => (
                      <rect key={i} fill={d.전환율 >= 50 ? '#22c55e' : d.전환율 >= 30 ? '#f59e0b' : '#f87171'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
              <div className="flex items-center justify-center gap-4 mt-2 text-[10px] text-text-tertiary">
                <span className="flex items-center gap-1"><span className="w-3 h-2 rounded-sm bg-green-500" /> 50%+</span>
                <span className="flex items-center gap-1"><span className="w-3 h-2 rounded-sm bg-amber-500" /> 30-50%</span>
                <span className="flex items-center gap-1"><span className="w-3 h-2 rounded-sm bg-red-400" /> 30% 미만</span>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
