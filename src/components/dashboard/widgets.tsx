'use client'

// All dashboard widget components in one file for easy import and
// to keep the widget-registry small. Each widget:
// - fetches its own data in a useEffect (independent, parallelizable)
// - renders loading/empty states gracefully
// - sized via the `size` prop (S/M/L)

import { useEffect, useMemo, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/hooks/useAuth'
import { formatCurrency, formatNumber, formatDate, STAGE_COLORS } from '@/lib/utils'
import type { WidgetSize } from '@/lib/dashboard/types'
import { AlertCircle, TrendingUp, TrendingDown, Clock } from 'lucide-react'

// Shared types
// Widget height/width is now managed by react-grid-layout externally.
// `size` is kept optional for legacy widgets that adapt their inner list
// length; default to 'M' when unknown.
export interface WidgetProps { size?: WidgetSize }

// Fallback: empty state message
const EmptyState = ({ msg }: { msg: string }) => (
  <div className="flex items-center justify-center h-full text-xs text-gray-400">{msg}</div>
)

// ──────────────────────────────────────────────────────────────
// 1. 오늘 신규 리드 — count of leads with inquiry_date = today
// ──────────────────────────────────────────────────────────────
export function NewLeadsWidget({ size }: WidgetProps) {
  const sb = useRef(createClient()).current
  const [data, setData] = useState<{ today: number; yesterday: number } | null>(null)
  useEffect(() => {
    (async () => {
      const today = new Date(); today.setHours(0,0,0,0)
      const tStr = today.toISOString().substring(0, 10)
      const yStr = new Date(today.getTime() - 86400000).toISOString().substring(0, 10)
      const [{ count: t }, { count: y }] = await Promise.all([
        sb.from('pipeline_leads').select('id', { count: 'exact', head: true }).eq('inquiry_date', tStr),
        sb.from('pipeline_leads').select('id', { count: 'exact', head: true }).eq('inquiry_date', yStr),
      ])
      setData({ today: t ?? 0, yesterday: y ?? 0 })
    })()
  }, [sb])
  if (!data) return <EmptyState msg="로딩..." />
  const delta = data.today - data.yesterday
  return (
    <div className="flex flex-col h-full justify-center">
      <div className="text-3xl font-bold text-text-primary">{formatNumber(data.today)}</div>
      <div className="text-[11px] text-text-tertiary mt-1">
        {delta === 0 ? '어제와 동일' : delta > 0
          ? <span className="text-green-600"><TrendingUp className="w-3 h-3 inline" /> 어제 대비 +{delta}</span>
          : <span className="text-red-500"><TrendingDown className="w-3 h-3 inline" /> 어제 대비 {delta}</span>
        }
      </div>
    </div>
  )
}

// ──────────────────────────────────────────────────────────────
// 2. 내 담당 리드 — stage-wise breakdown for current user
// ──────────────────────────────────────────────────────────────
export function MyLeadsWidget({ size }: WidgetProps) {
  const { user } = useAuth()
  const sb = useRef(createClient()).current
  const [counts, setCounts] = useState<Record<string, number> | null>(null)
  useEffect(() => {
    if (!user?.id) return
    ;(async () => {
      const { data } = await sb.from('pipeline_leads')
        .select('stage')
        .eq('assigned_to', user.id)
        .not('stage', 'in', '(도입완료,이탈)')
      const counts: Record<string, number> = {}
      ;(data || []).forEach((r: any) => { counts[r.stage] = (counts[r.stage] || 0) + 1 })
      setCounts(counts)
    })()
  }, [user?.id, sb])
  if (!counts) return <EmptyState msg="로딩..." />
  const total = Object.values(counts).reduce((a, b) => a + b, 0)
  if (total === 0) return <EmptyState msg="담당 리드 없음" />
  const stages = ['신규리드', '컨텍', '예정', '제안', '미팅', '도입직전']
  return (
    <div className="flex flex-col h-full">
      <div className="text-2xl font-bold text-text-primary mb-2">{formatNumber(total)}건</div>
      <div className="space-y-1 flex-1 overflow-y-auto">
        {stages.filter(s => counts[s]).map(s => (
          <div key={s} className="flex items-center justify-between text-xs">
            <span className={`px-1.5 py-0.5 rounded text-[10px] ${STAGE_COLORS[s] || 'bg-gray-100 text-gray-700'}`}>{s}</span>
            <span className="font-semibold text-text-secondary">{counts[s]}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ──────────────────────────────────────────────────────────────
// 3. 기한 초과 액션 — leads with next_action_date < today
// ──────────────────────────────────────────────────────────────
export function OverdueActionsWidget({ size }: WidgetProps) {
  const { user } = useAuth()
  const sb = useRef(createClient()).current
  const [rows, setRows] = useState<any[] | null>(null)
  useEffect(() => {
    (async () => {
      const today = new Date().toISOString().substring(0, 10)
      const q = sb.from('pipeline_leads')
        .select('id, company_name, next_action, next_action_date, stage, assigned_to')
        .not('next_action_date', 'is', null)
        .lt('next_action_date', today)
        .not('stage', 'in', '(도입완료,이탈)')
        .order('next_action_date')
        .limit(size === 'L' ? 10 : 5)
      if (user?.id) q.eq('assigned_to', user.id)
      const { data } = await q
      setRows(data || [])
    })()
  }, [sb, user?.id, size])
  if (!rows) return <EmptyState msg="로딩..." />
  if (rows.length === 0) return (
    <div className="flex items-center justify-center h-full text-xs text-green-600">
      ✓ 기한 초과 없음
    </div>
  )
  return (
    <div className="space-y-1 h-full overflow-y-auto">
      {rows.map(r => (
        <a key={r.id} href={`/pipeline/${r.id}`}
          className="flex items-center gap-2 py-1 px-1.5 rounded hover:bg-red-50 text-xs">
          <AlertCircle className="w-3 h-3 text-red-500 flex-shrink-0" />
          <span className="font-medium truncate flex-1">{r.company_name}</span>
          <span className="text-text-tertiary truncate max-w-[80px]">{r.next_action}</span>
          <span className="text-red-500 text-[10px] flex-shrink-0">{formatDate(r.next_action_date, 'M/d')}</span>
        </a>
      ))}
    </div>
  )
}

// ──────────────────────────────────────────────────────────────
// 4. 도입직전 리드
// ──────────────────────────────────────────────────────────────
export function PreConversionWidget({ size }: WidgetProps) {
  const sb = useRef(createClient()).current
  const [rows, setRows] = useState<any[] | null>(null)
  useEffect(() => {
    (async () => {
      const { data } = await sb.from('pipeline_leads')
        .select('id, company_name, industry, interest_service, updated_at')
        .eq('stage', '도입직전')
        .order('updated_at', { ascending: false })
        .limit(size === 'L' ? 10 : 5)
      setRows(data || [])
    })()
  }, [sb, size])
  if (!rows) return <EmptyState msg="로딩..." />
  if (rows.length === 0) return <EmptyState msg="도입직전 리드 없음" />
  return (
    <div className="space-y-1 h-full overflow-y-auto">
      {rows.map(r => (
        <a key={r.id} href={`/pipeline/${r.id}`}
          className="flex items-center gap-2 py-1 px-1.5 rounded hover:bg-green-50 text-xs">
          <span className="w-1.5 h-1.5 rounded-full bg-green-500 flex-shrink-0" />
          <span className="font-medium truncate flex-1">{r.company_name}</span>
          <span className="text-text-tertiary text-[10px] truncate max-w-[100px]">{r.interest_service || r.industry}</span>
        </a>
      ))}
    </div>
  )
}

// ──────────────────────────────────────────────────────────────
// 5. 이번달 매출
// ──────────────────────────────────────────────────────────────
export function MonthlyRevenueWidget({ size }: WidgetProps) {
  const sb = useRef(createClient()).current
  const [data, setData] = useState<{ current: number; previous: number } | null>(null)
  useEffect(() => {
    (async () => {
      const now = new Date()
      const year = now.getFullYear()
      const month = now.getMonth() + 1
      const prevMonth = month === 1 ? 12 : month - 1
      const prevYear = month === 1 ? year - 1 : year
      const [cur, prev] = await Promise.all([
        sb.from('monthly_revenues').select('amount').eq('year', year).eq('month', month),
        sb.from('monthly_revenues').select('amount').eq('year', prevYear).eq('month', prevMonth),
      ])
      const sum = (arr: any[] | null) => (arr || []).reduce((s, r) => s + Number(r.amount || 0), 0)
      setData({ current: sum(cur.data), previous: sum(prev.data) })
    })()
  }, [sb])
  if (!data) return <EmptyState msg="로딩..." />
  const delta = data.previous > 0 ? ((data.current - data.previous) / data.previous) * 100 : 0
  return (
    <div className="flex flex-col h-full justify-center">
      <div className="text-2xl font-bold text-text-primary">{formatCurrency(data.current)}</div>
      <div className="text-[11px] text-text-tertiary mt-1">
        이번달 · {delta === 0 ? '지난달과 동일' :
          delta > 0
            ? <span className="text-green-600">↑ {delta.toFixed(1)}% vs 지난달</span>
            : <span className="text-red-500">↓ {Math.abs(delta).toFixed(1)}% vs 지난달</span>
        }
      </div>
    </div>
  )
}

// ──────────────────────────────────────────────────────────────
// 6. 미납 금액/건수
// ──────────────────────────────────────────────────────────────
export function UnpaidAmountWidget({ size }: WidgetProps) {
  const sb = useRef(createClient()).current
  const [data, setData] = useState<{ amount: number; count: number } | null>(null)
  useEffect(() => {
    (async () => {
      const { data: inv } = await sb.from('invoices')
        .select('total_amount, status')
        .in('status', ['sent', 'overdue'])
      const rows = inv || []
      const amount = rows.reduce((s: number, r: any) => s + Number(r.total_amount || 0), 0)
      setData({ amount, count: rows.length })
    })()
  }, [sb])
  if (!data) return <EmptyState msg="로딩..." />
  return (
    <div className="flex flex-col h-full justify-center">
      <div className="text-2xl font-bold text-text-primary">{formatCurrency(data.amount)}</div>
      <div className="text-[11px] text-red-500 mt-1">미수금 · {data.count}건</div>
    </div>
  )
}

// ──────────────────────────────────────────────────────────────
// 7. 파이프라인 단계 분포
// ──────────────────────────────────────────────────────────────
export function PipelineFunnelWidget({ size }: WidgetProps) {
  const sb = useRef(createClient()).current
  const [counts, setCounts] = useState<Record<string, number> | null>(null)
  useEffect(() => {
    (async () => {
      const { data } = await sb.from('pipeline_leads').select('stage')
      const c: Record<string, number> = {}
      ;(data || []).forEach((r: any) => { c[r.stage] = (c[r.stage] || 0) + 1 })
      setCounts(c)
    })()
  }, [sb])
  if (!counts) return <EmptyState msg="로딩..." />
  const stages = ['신규리드', '컨텍', '예정', '제안', '미팅', '도입직전']
  const max = Math.max(...stages.map(s => counts[s] || 0), 1)
  return (
    <div className="space-y-1.5 flex flex-col h-full justify-center">
      {stages.map(s => {
        const n = counts[s] || 0
        const pct = (n / max) * 100
        return (
          <div key={s} className="flex items-center gap-2 text-[11px]">
            <span className="w-14 text-text-secondary">{s}</span>
            <div className="flex-1 bg-gray-100 rounded h-4 relative">
              <div className={`h-full rounded ${STAGE_COLORS[s]?.replace('text-', 'bg-').split(' ')[0] || 'bg-primary-400'}`}
                style={{ width: `${Math.max(pct, 2)}%` }} />
            </div>
            <span className="w-6 text-right font-semibold text-text-primary">{n}</span>
          </div>
        )
      })}
    </div>
  )
}

// ──────────────────────────────────────────────────────────────
// 8. 오늘 할일 — activity_logs scheduled for today
// ──────────────────────────────────────────────────────────────
export function TodayTasksWidget({ size }: WidgetProps) {
  const { user } = useAuth()
  const sb = useRef(createClient()).current
  const [rows, setRows] = useState<any[] | null>(null)
  useEffect(() => {
    (async () => {
      const today = new Date().toISOString().substring(0, 10)
      const q = sb.from('pipeline_leads')
        .select('id, company_name, next_action, next_action_date')
        .eq('next_action_date', today)
        .not('stage', 'in', '(도입완료,이탈)')
        .limit(size === 'L' ? 10 : 5)
      if (user?.id) q.eq('assigned_to', user.id)
      const { data } = await q
      setRows(data || [])
    })()
  }, [sb, user?.id, size])
  if (!rows) return <EmptyState msg="로딩..." />
  if (rows.length === 0) return (
    <div className="flex items-center justify-center h-full text-xs text-text-tertiary">
      오늘 예정된 액션 없음
    </div>
  )
  return (
    <div className="space-y-1 h-full overflow-y-auto">
      {rows.map(r => (
        <a key={r.id} href={`/pipeline/${r.id}`}
          className="flex items-center gap-2 py-1 px-1.5 rounded hover:bg-primary-50 text-xs">
          <Clock className="w-3 h-3 text-primary-500 flex-shrink-0" />
          <span className="font-medium truncate flex-1">{r.company_name}</span>
          <span className="text-text-tertiary truncate max-w-[120px]">{r.next_action}</span>
        </a>
      ))}
    </div>
  )
}

// ──────────────────────────────────────────────────────────────
// 9. 전환율 KPI (도입완료 / 총 종결)
// ──────────────────────────────────────────────────────────────
export function ConversionRateWidget({ size }: WidgetProps) {
  const sb = useRef(createClient()).current
  const [data, setData] = useState<{ rate: number; converted: number; total: number } | null>(null)
  useEffect(() => {
    (async () => {
      const { data: rows } = await sb.from('pipeline_leads')
        .select('stage')
        .in('stage', ['도입완료', '이탈'])
      const arr = rows || []
      const converted = arr.filter((r: any) => r.stage === '도입완료').length
      const total = arr.length
      const rate = total > 0 ? (converted / total) * 100 : 0
      setData({ rate, converted, total })
    })()
  }, [sb])
  if (!data) return <EmptyState msg="로딩..." />
  return (
    <div className="flex flex-col h-full justify-center">
      <div className="text-2xl font-bold text-text-primary">{data.rate.toFixed(1)}%</div>
      <div className="text-[11px] text-text-tertiary mt-1">
        전환율 · {data.converted}/{data.total}건
      </div>
    </div>
  )
}

// ──────────────────────────────────────────────────────────────
// Placeholder widgets (not yet fully implemented; show "준비중")
// ──────────────────────────────────────────────────────────────
export const PlaceholderWidget =
  (title: string) =>
  ({ size: _size }: WidgetProps) =>
    (
      <div className="flex flex-col items-center justify-center h-full text-xs text-text-tertiary gap-1">
        <span>🚧 {title}</span>
        <span className="text-[10px] text-text-placeholder">곧 출시</span>
      </div>
    )
