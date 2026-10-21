'use client'

// 대시보드 — 디자인 정의 › 메뉴별 화면 › 대시보드 (2026-10-21 확정)
// 자유 드래그 없음: 프리셋(역할별) + 위젯 켜고 끄기. 툴바 → 숫자줄 → 12칸 격자 위젯.
// 데이터는 /api/dashboard 한 번 (서버 1분 캐시). 예전 react-grid-layout 대시보드를 대체.
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import Link from 'next/link'
import { useAuth } from '@/hooks/useAuth'
import { createClient } from '@/lib/supabase/client'
import { presetForRole } from '@/lib/dashboard/presets'
import { INFLOW_COLOR, type InflowGroup } from '@/lib/inflow-taxonomy'
import { Toolbar, Tabs, KpiRow, DsButton, Skeleton, StatusChip, Avatar, Check, stageTone, toneVar } from '@/components/ds'

type D = {
  today: string; month: number
  rev: [number, number][]
  topCust: { n: number; list: [string, number][] }
  unpaid: { sum: number; n: number; customers: number; over90: number; top: [string, number][] }
  bill: { n: number; sum: number; issued: number }
  ad: { cost: number; costPrev: number; ga: number }
  sitesBilled: number
  leads: { today: number; yday: number; month: number; prevMonth: number; yLeads: number; yWon: number; wonMonth: number; stages: Record<string, number>; preN: number; pre: [string, string, string, string][]; recent: [string, string, string, string][]; inflowMonth: [InflowGroup, number][]; overdueN: number; weekN: number; week: [string, string, string, string][] }
  mine: Record<string, { open: number; list: [string, string, string][] }>
  ms: number
}
type PresetKey = 'exec' | 'marketing' | 'sales' | 'support' | 'hardware'
const PRESETS: { key: PresetKey; label: string }[] = [{ key: 'exec', label: '경영진' }, { key: 'marketing', label: '마케팅' }, { key: 'sales', label: '세일즈' }, { key: 'support', label: '경영지원' }, { key: 'hardware', label: '하드웨어' }]
const STAGES = ['신규리드', '컨텍', '제안', '미팅', '도입직전', '예정', '도입완료', '이탈']

const man = (v: number) => (Math.abs(v) >= 1e8 ? `${(v / 1e8).toFixed(1).replace('.0', '')}억` : `${Math.round(v / 1e4).toLocaleString()}만`)
const won = (v: number) => Math.round(v).toLocaleString()

/* ─── 위젯 3종 ─── */
function Widget({ span, title, sub, href, more, children }: { span: 4 | 8 | 12; title: string; sub?: string; href?: string; more?: string; children: ReactNode }) {
  return (
    <div className={`border border-ds-line rounded-lg p-3.5 min-h-[220px] min-w-0 ${span === 8 ? 'lg:col-span-8' : span === 12 ? 'lg:col-span-12' : 'lg:col-span-4'}`}>
      <div className="flex items-center gap-2 mb-2">
        <h2 className="text-[14px] font-medium text-ds-fg">{title}</h2>
        {sub && <span className="text-[12px] text-ds-fg3 truncate">{sub}</span>}
        {href && <Link href={href} prefetch={false} className="ml-auto text-[11.5px] text-ds-accent hover:underline whitespace-nowrap">{more || '더 보기'} ›</Link>}
      </div>
      {children}
    </div>
  )
}
const Empty = ({ text }: { text: string }) => <div className="text-[12px] text-ds-fg3 py-6 leading-relaxed">{text}</div>
function List({ rows }: { rows: ReactNode[][] }) {
  if (!rows.length) return <Empty text="없음" />
  return (
    <table className="w-full text-[12.5px]"><tbody>
      {rows.map((r, i) => <tr key={i} className="border-b border-ds-line2 last:border-0">{r.map((c, j) => <td key={j} className={`h-8 px-1.5 ${j === 0 ? 'font-medium text-ds-fg max-w-0 w-full truncate' : 'whitespace-nowrap text-right tabular-nums'}`}>{c}</td>)}</tr>)}
    </tbody></table>
  )
}
function RevTrend({ rev, month }: { rev: [number, number][]; month: number }) {
  const mx = Math.max(1, ...rev.map(r => r[1]))
  return (
    <div className="flex items-end gap-1.5 h-[180px] pt-2">
      {rev.map(([m, v]) => (
        <div key={m} className="flex-1 h-full flex flex-col items-center justify-end gap-1" title={`${m}월 ${won(v)}원`}>
          <div className="w-full max-w-[40px] rounded-t-sm" style={{ height: `${Math.max(2, v / mx * 100)}%`, background: m === month ? 'var(--ds-accent)' : 'var(--ds-info)', opacity: m > month ? 0.45 : 1 }} />
          <span className="text-[10.5px] text-ds-fg3">{m}</span>
        </div>
      ))}
    </div>
  )
}
function Bars({ rows, label = 56 }: { rows: { k: string; v: number; color: string }[]; label?: number }) {
  const mx = Math.max(1, ...rows.map(r => r.v))
  return (
    <div className="grid gap-1">
      {rows.map(r => (
        <div key={r.k} className="grid items-center gap-2 h-6 text-[12px]" style={{ gridTemplateColumns: `${label}px 1fr 36px` }}>
          <span className="text-ds-fg2 truncate">{r.k}</span>
          <span className="block h-2 rounded-full bg-ds-line2 overflow-hidden"><span className="block h-full rounded-full" style={{ width: `${r.v / mx * 100}%`, background: r.color }} /></span>
          <b className="text-right font-medium text-ds-fg tabular-nums">{r.v || '—'}</b>
        </div>
      ))}
    </div>
  )
}

export default function DashboardPage() {
  const { user } = useAuth()
  const [d, setD] = useState<D | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [preset, setPreset] = useState<PresetKey | null>(null)
  const [hidden, setHidden] = useState<Record<string, string[]>>({})
  const [pick, setPick] = useState(false)
  const saved = useRef(false)

  useEffect(() => { fetch('/api/dashboard').then(r => r.json()).then(j => j.error ? setErr(j.error) : setD(j)).catch(e => setErr(String(e))) }, [])
  // 내 설정(마지막 프리셋·숨긴 위젯). 없으면 역할 프리셋
  useEffect(() => {
    if (!user || preset) return
    const cfg = (user as unknown as { dashboard_config?: { v?: number; preset?: PresetKey; hidden?: Record<string, string[]> } }).dashboard_config
    if (cfg?.v === 3) { setPreset(cfg.preset || (presetForRole(user.role).roleKey as PresetKey)); setHidden(cfg.hidden || {}) }
    else setPreset(presetForRole(user.role).roleKey as PresetKey)
  }, [user, preset])
  useEffect(() => {
    if (!user || !preset) return
    if (!saved.current) { saved.current = true; return }
    createClient().from('users').update({ dashboard_config: { v: 3, preset, hidden } }).eq('id', user.id).then(() => {})
  }, [preset, hidden, user])

  const p = preset || 'exec'
  const mine = user && d ? d.mine[user.id] : undefined
  const rate = d && d.leads.yLeads ? d.leads.yWon / d.leads.yLeads * 100 : 0

  // 프리셋 = 숫자줄 + 위젯 목록 (디자인 정의 시안 그대로)
  const view = useMemo(() => {
    if (!d) return null
    const r = Object.fromEntries(d.rev), m = d.month, prevM = m === 1 ? 12 : m - 1
    const K = {
      rev: { label: `${m}월 매출`, value: man(r[m] || 0), sub: `${prevM}월 ${man(r[prevM] || 0)}` },
      unpaid: { label: '미납', value: man(d.unpaid.sum), sub: `${d.unpaid.n}건 · ${d.unpaid.customers}곳`, tone: 'bad' as const },
      rate: { label: '도입률', value: `${rate.toFixed(1)}%`, sub: `올해 · ${d.leads.yWon}/${d.leads.yLeads}` },
      leadsM: { label: '신규 리드', value: String(d.leads.month), sub: `이번 달 전체 · 전월 ${d.leads.prevMonth}` },
      ad: { label: '광고비', value: man(d.ad.cost), sub: `이번 달 · 전월 ${man(d.ad.costPrev)}` },
    }
    const W: Record<string, { span: 4 | 8; title: string; sub?: string; href?: string; more?: string; body: ReactNode }> = {
      trend: { span: 8, title: '월별 매출', sub: `${new Date().getFullYear()} 공급가 · 이후 달은 계약 기준`, href: '/revenue', more: '매출 현황', body: <RevTrend rev={d.rev} month={m} /> },
      unpaidTop: { span: 4, title: '미납 상위', sub: `${d.unpaid.n}건`, href: '/finance/unpaid', more: '미납 현황', body: <List rows={d.unpaid.top.map(([n, v]) => [n, won(v)])} /> },
      topCust: { span: 4, title: `${m}월 매출 상위`, sub: `${d.topCust.n}곳 중`, href: '/revenue', more: '매출 현황', body: <List rows={d.topCust.list.map(([n, v]) => [n, won(v)])} /> },
      funnel: { span: 4, title: '단계 분포', sub: '올해 유입', href: '/pipeline/board', more: '보드뷰', body: <Bars rows={STAGES.map(s => ({ k: s, v: d.leads.stages[s] || 0, color: toneVar[stageTone(s)] }))} /> },
      inflow: { span: 4, title: '유입 분류', sub: '이번 달 리드', href: '/marketing/ads', more: '유입 성과', body: <Bars label={72} rows={d.leads.inflowMonth.map(([g, v]) => ({ k: g, v, color: INFLOW_COLOR[g] }))} /> },
      inflowWide: { span: 8, title: '유입 분류', sub: '이번 달 리드 · 11 분류 + 미분류', href: '/marketing/ads', more: '유입 성과', body: <Bars label={72} rows={d.leads.inflowMonth.map(([g, v]) => ({ k: g, v, color: INFLOW_COLOR[g] }))} /> },
      recent: { span: 4, title: '최근 리드', sub: `이번 달 ${d.leads.month}건 · 전체`, href: '/pipeline/list', more: '리스트', body: <List rows={d.leads.recent.map(([n, s, c, dt]) => [n, <StatusChip key="s" tone={stageTone(s)}>{s}</StatusChip>, <span key="c" className="text-ds-fg3">{c}</span>, dt])} /> },
      mine: { span: 4, title: '내 담당 리드', sub: `${mine?.open || 0}건`, href: '/pipeline/list', more: '리스트', body: mine?.list.length ? <List rows={mine.list.map(([n, s, dt]) => [n, <StatusChip key="s" tone={stageTone(s)}>{s}</StatusChip>, dt])} /> : <Empty text="진행 중인 담당 리드가 없습니다" /> },
      pre: { span: 4, title: '도입직전·예정', sub: `${d.leads.preN}건`, href: '/pipeline/board', more: '보드뷰', body: <List rows={d.leads.pre.map(([n, s, u]) => [n, <StatusChip key="s" tone={stageTone(s)}>{s}</StatusChip>, <Avatar key="a" name={u} />])} /> },
      week: { span: 4, title: '이번 주 액션', sub: `${d.leads.weekN}건`, href: '/work/today', more: '오늘 할일', body: d.leads.week.length ? <List rows={d.leads.week.map(([n, a, dt, u]) => [n, <span key="a" className="text-ds-fg2">{a}</span>, dt, u])} /> : <Empty text="다음 액션 날짜가 입력된 리드가 없습니다 — 리드에 다음 액션일을 적으면 여기 모입니다" /> },
      contracts: { span: 4, title: '계약 만료 임박', sub: '30일 안', href: '/contracts', more: '계약 관리', body: <Empty text="계약 기록이 아직 없습니다" /> },
      ops: { span: 4, title: '오늘 할일', href: '/work/today', more: '오늘 할일', body: <Empty text="운영 할일 기록 없음" /> },
      cams: { span: 4, title: '카메라 반출', href: '/operations/camera-shipments', more: '카메라 반출', body: <Empty text="반출 기록 0건 — 카메라 반출 메뉴에서 입력하면 표시됩니다" /> },
      orders: { span: 4, title: '협력사 발주', href: '/operations/orders', more: '협력사 발주', body: <Empty text="발주 기록 없음" /> },
    }
    const V: Record<PresetKey, { kpis: (typeof K[keyof typeof K] | { label: string; value: string; sub?: string; tone?: 'bad' })[]; widgets: string[] }> = {
      exec: { kpis: [K.rev, K.unpaid, K.rate, K.leadsM, K.ad], widgets: ['trend', 'funnel', 'topCust', 'unpaidTop', 'inflow'] },
      marketing: { kpis: [K.leadsM, K.rev, K.ad, { label: '유입', value: d.ad.ga.toLocaleString(), sub: 'GA 세션' }, { label: '리드당 비용', value: d.leads.month ? man(d.ad.cost / d.leads.month) : '—', sub: '광고비 ÷ 신규 리드' }], widgets: ['trend', 'recent', 'inflowWide', 'funnel'] },
      sales: { kpis: [K.rev, K.unpaid, { label: '오늘 신규 리드', value: String(d.leads.today), sub: `어제 ${d.leads.yday} · 이번 달 ${d.leads.month}` }, { label: '내 진행 리드', value: String(mine?.open || 0), sub: `${user?.name || ''} · 이탈·도입 제외` }, { label: '도입직전·예정', value: String(d.leads.preN), sub: '전체' }], widgets: ['trend', 'unpaidTop', 'mine', 'pre', 'week'] },
      support: { kpis: [K.unpaid, { label: '90일+ 연체', value: man(d.unpaid.over90), sub: '납기 90일 지남', tone: 'bad' }, { label: `${m}월 청구`, value: man(d.bill.sum), sub: `${d.bill.n}건 · 발행 ${d.bill.issued}` }, K.rev, { label: '이번 달 비용', value: '—', sub: '매입·비용 기록 없음' }], widgets: ['unpaidTop', 'trend', 'contracts', 'topCust'] },
      hardware: { kpis: [{ label: `${m}월 과금 현장`, value: String(d.sitesBilled), sub: `${m}월 매출 행 기준` }, { label: '카메라 반출', value: '—', sub: '반출 기록 0건' }, { label: '장비', value: '—', sub: '장비 기록 없음' }, { label: '협력사 발주', value: '—', sub: '발주 기록 없음' }], widgets: ['ops', 'cams', 'orders'] },
    }
    return { W, V }
  }, [d, mine, rate, user])

  const v = view?.V[p]
  const off = hidden[p] || []
  const shown = v ? v.widgets.filter(w => !off.includes(w)) : []

  return (
    <div>
      <Toolbar right={<>
        <DsButton variant="ghost" size="sm" title="역할 프리셋 + 위젯 켜고 끄기. 숫자는 1분마다 새로 계산됩니다. 매출은 공급가, 미납은 세금계산서 발행 후 미수납">ⓘ 기준</DsButton>
        <div className="relative">
          <DsButton size="sm" onClick={() => setPick(o => !o)}>위젯 선택</DsButton>
          {pick && v && view && (
            <div className="absolute right-0 top-9 z-30 w-56 p-2 bg-ds-bg border border-ds-line rounded-lg shadow-[0_8px_24px_rgba(0,0,0,.08)]" onMouseLeave={() => setPick(false)}>
              {v.widgets.map(w => (
                <div key={w} className="px-1.5 py-1"><Check label={view.W[w].title} checked={!off.includes(w)} onChange={on => setHidden(h => ({ ...h, [p]: on ? (h[p] || []).filter(x => x !== w) : [...(h[p] || []), w] }))} /></div>
              ))}
            </div>
          )}
        </div>
      </>}>
        <Tabs value={p} onChange={k => setPreset(k as PresetKey)} options={PRESETS.map(x => ({ value: x.key, label: x.label }))} />
      </Toolbar>

      {err ? <div className="text-[13px] text-ds-bad py-6">대시보드를 불러오지 못했습니다 — {err}</div> : !d || !v || !view ? <Skeleton rows={10} /> : (
        <>
          <KpiRow items={v.kpis} />
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
            {shown.map(w => { const x = view.W[w]; return <Widget key={w} span={x.span} title={x.title} sub={x.sub} href={x.href} more={x.more}>{x.body}</Widget> })}
          </div>
        </>
      )}
    </div>
  )
}
