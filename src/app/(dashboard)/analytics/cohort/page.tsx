'use client'

// 분석 > 고객 생애주기 > 유입 코호트 — 레이아웃 정의 v1 "집계" 유형 (docs/design/레이아웃정의_v1.html §2)
// 제목줄(요약 한 줄) → 조건줄 → 주 표 2 : 보조 표 1. 월별은 선택 연도 12줄을 미리 깔고, 행 클릭 → 60vw 드로어에 회사 목록
import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import { fetchLifecycle, fmtWon, fmtPct, median, type LifecycleRow } from '@/lib/lifecycle'
import { KpiRow, Toolbar, Tabs, DsSelect, Check, Skeleton, Empty, StatusChip, Drawer, DsButton } from '@/components/ds'

type Group = 'month' | 'quarter'
const thisYear = String(new Date().getFullYear())
const HELP = '회사 단위 · 첫 리드의 유입월 기준 · 매출은 유입월부터 공급가(VAT 제외) 누적 · 소요일 = 유입일 → 도입일 · 유입 전 매출이 있던 기존 고객은 기본 제외'

interface Cohort { key: string; label: string; rows: LifecycleRow[]; n: number; won: number; days: number | null; total: number; rev_1: number | null; rev_3: number | null; rev_6: number | null; rev_12: number | null }

function build(key: string, label: string, rs: LifecycleRow[]): Cohort {
  const won = rs.filter(r => r.won)
  const cum = (f: 'rev_1' | 'rev_3' | 'rev_6' | 'rev_12') => (rs.length && rs.every(r => r[f] != null) ? rs.reduce((s, r) => s + (r[f] || 0), 0) : null)
  return { key, label, rows: rs, n: rs.length, won: won.length, days: median(won.map(r => r.days_to_convert).filter((d): d is number => d != null)), total: rs.reduce((s, r) => s + r.rev_total, 0), rev_1: cum('rev_1'), rev_3: cum('rev_3'), rev_6: cum('rev_6'), rev_12: cum('rev_12') }
}

function RateBar({ won, n }: { won: number; n: number }) {
  const p = n ? won / n : 0
  // 막대 칸 60 + 숫자 칸 52 고정 → 모든 행에서 막대 위치가 같다
  return <span className="inline-grid grid-cols-[60px_52px] items-center gap-2"><span className="block h-1.5 rounded-full bg-ds-line2 overflow-hidden"><span className="block h-full bg-ds-info rounded-full" style={{ width: `${Math.min(100, p * 300)}%` }} /></span><span className="text-right">{n ? fmtPct(won, n) : '—'}</span></span>
}

export default function CohortPage() {
  const [rows, setRows] = useState<LifecycleRow[]>([])
  const [loading, setLoading] = useState(true)
  const [group, setGroup] = useState<Group>('month')
  const [year, setYear] = useState(thisYear)
  const [channel, setChannel] = useState('all')
  const [includeExisting, setIncludeExisting] = useState(false)
  const [open, setOpen] = useState<string | null>(null)

  useEffect(() => { fetchLifecycle().then(d => setRows(d.rows)).catch(e => toast.error(e.message)).finally(() => setLoading(false)) }, [])

  const years = useMemo(() => Array.from(new Set(rows.map(r => r.inquiry_date.slice(0, 4)))).sort().reverse(), [rows])
  // 연도·기존 고객 조건만 적용한 집합 (채널 보조 표용)
  const base = useMemo(() => rows.filter(r => (includeExisting || !r.existing_customer) && (year === 'all' || r.inquiry_date.startsWith(year))), [rows, includeExisting, year])
  const filtered = useMemo(() => base.filter(r => channel === 'all' || (r.inquiry_channel || '(미입력)') === channel), [base, channel])

  const cohorts = useMemo(() => {
    const m = new Map<string, LifecycleRow[]>()
    const keyOf = (r: LifecycleRow) => group === 'month' ? r.inquiry_month : `${r.inquiry_month.slice(0, 4)}-Q${Math.ceil(Number(r.inquiry_month.slice(5, 7)) / 3)}`
    for (const r of filtered) { const k = keyOf(r); (m.get(k) || m.set(k, []).get(k)!).push(r) }
    if (group === 'month' && year !== 'all') {
      // 선택 연도 12줄을 미리 깔아 추이가 보이게 (빈 달은 —)
      return Array.from({ length: 12 }, (_, i) => { const k = `${year}-${String(i + 1).padStart(2, '0')}`; return build(k, `${i + 1}월`, m.get(k) || []) })
    }
    return Array.from(m.entries()).sort((a, b) => b[0].localeCompare(a[0])).map(([k, rs]) => build(k, k, rs))
  }, [filtered, group, year])

  const channels = useMemo(() => {
    const m = new Map<string, LifecycleRow[]>()
    for (const r of base) { const k = r.inquiry_channel || '(미입력)'; (m.get(k) || m.set(k, []).get(k)!).push(r) }
    return Array.from(m.entries()).map(([k, rs]) => ({ key: k, n: rs.length, won: rs.filter(r => r.won).length, rev: rs.reduce((s, r) => s + r.rev_total, 0) })).sort((a, b) => b.rev - a.rev)
  }, [base])

  const tot = build('all', '합계', filtered)
  const sel = cohorts.find(c => c.key === open)
  const setGroupAnd = (g: Group) => { setGroup(g); setOpen(null); if (g === 'quarter' && year !== 'all') setYear('all'); if (g === 'month' && year === 'all') setYear(thisYear) }
  const scope = year === 'all' ? '전체' : `${year}`

  return (
    <div>
      <Toolbar right={<><Check label="기존 고객 포함" checked={includeExisting} onChange={setIncludeExisting} /><DsButton variant="ghost" size="sm" title={HELP}>ⓘ 기준</DsButton></>}>
        <Tabs value={group} onChange={setGroupAnd} options={[{ value: 'month', label: '월별' }, { value: 'quarter', label: '분기별' }]} />
        <DsSelect value={year} onChange={e => { setYear(e.target.value); setOpen(null) }}>{group === 'quarter' && <option value="all">전체 연도</option>}{years.map(y => <option key={y} value={y}>{y}년</option>)}</DsSelect>
        <DsSelect value={channel} onChange={e => { setChannel(e.target.value); setOpen(null) }}><option value="all">채널 전체</option>{channels.map(c => <option key={c.key} value={c.key}>{c.key}</option>)}</DsSelect>
      </Toolbar>
      <KpiRow items={[
        { label: `${scope} 유입`, value: `${tot.n.toLocaleString()}곳` },
        { label: '도입', value: `${tot.won}곳`, sub: `도입률 ${fmtPct(tot.won, tot.n)}` },
        { label: '소요일 중앙값', value: tot.days != null ? `${tot.days}일` : '—' },
        { label: '누적 매출', value: `${fmtWon(tot.total)}원`, sub: '유입 이후 공급가' },
        { label: '도입당', value: tot.won ? `${fmtWon(tot.total / tot.won)}원` : '—' },
      ]} />

      {loading ? <Skeleton rows={8} /> : tot.n === 0 && cohorts.every(c => c.n === 0) ? <Empty text="조건에 맞는 유입이 없습니다" /> : (
        <div className="grid lg:grid-cols-[minmax(0,2fr)_minmax(320px,1fr)] gap-5 items-start">
          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-2 h-5"><h2 className="text-[14px] font-medium text-ds-fg">유입{group === 'month' ? '월' : '분기'}별</h2><span className="text-[12px] text-ds-fg3">{channel === 'all' ? '전체 채널' : channel} · 행을 누르면 회사 목록</span></div>
          <div className={`ds-wrap ${group === 'quarter' ? 'max-h-[70vh]' : ''}`}>
            <table className="ds-table is-clickable is-fixed">
              <colgroup><col style={{ width: '12%' }} /><col style={{ width: '10%' }} /><col style={{ width: '10%' }} /><col style={{ width: '20%' }} /><col style={{ width: '14%' }} /><col style={{ width: '18%' }} /><col style={{ width: '16%' }} /></colgroup>
              <thead><tr><th>유입{group === 'month' ? '월' : '분기'}</th><th>유입</th><th>도입</th><th>도입률</th><th>소요일 중앙값</th><th>누적 매출</th><th>도입당</th></tr></thead>
              <tbody>
                <tr className="ds-sum top"><td>합계</td><td className="num">{tot.n}</td><td className="num">{tot.won}</td><td className="num">{fmtPct(tot.won, tot.n)}</td><td className="num">{tot.days != null ? `${tot.days}일` : '—'}</td><td className="num">{fmtWon(tot.total)}</td><td className="num">{tot.won ? fmtWon(tot.total / tot.won) : '—'}</td></tr>

                {cohorts.map(c => c.n === 0 ? (
                  <tr key={c.key} className="ds-row"><td className="muted">{c.label}</td><td className="num muted">—</td><td className="num muted">—</td><td className="num muted">—</td><td className="num muted">—</td><td className="num muted">—</td><td className="num muted">—</td></tr>
                ) : (
                  <tr key={c.key} className={`ds-row ${open === c.key ? 'is-active' : ''}`} onClick={() => setOpen(c.key)}>
                    <td className="font-medium">{c.label}</td><td className="num">{c.n}</td><td className="num">{c.won}</td><td className="num"><RateBar won={c.won} n={c.n} /></td>
                    <td className="num">{c.days != null ? `${c.days}일` : '—'}</td><td className="num font-medium">{fmtWon(c.total)}</td><td className="num">{c.won ? fmtWon(c.total / c.won) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          </div>

          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-2 h-5"><h2 className="text-[14px] font-medium text-ds-fg">채널별</h2><span className="text-[12px] text-ds-fg3">{scope} 유입 · 매출순 · 누르면 그 채널만</span></div>
            <div className="ds-wrap max-h-[502px]">
              <table className="ds-table is-clickable is-fixed">
                <colgroup><col style={{ width: '34%' }} /><col style={{ width: '18%' }} /><col style={{ width: '18%' }} /><col style={{ width: '30%' }} /></colgroup>
                <thead><tr><th>채널</th><th>유입</th><th>도입</th><th>누적 매출</th></tr></thead>
                <tbody>
                  {channels.map(c => (
                    <tr key={c.key} className={`ds-row ${channel === c.key ? 'is-active' : ''}`} onClick={() => { setChannel(channel === c.key ? 'all' : c.key); setOpen(null) }}>
                      <td className="font-medium">{c.key}</td><td className="num">{c.n}</td><td className="num">{c.won}</td><td className="num font-medium">{fmtWon(c.rev)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      <Drawer open={!!sel} onClose={() => setOpen(null)} width="60vw" title={sel ? `${sel.label} 유입 ${sel.n}곳${channel !== 'all' ? ` · ${channel}` : ''}` : ''}
        meta={sel ? <>도입 {sel.won}곳 · 누적 매출 {fmtWon(sel.total)}원 · 유입 후 1개월 {fmtWon(sel.rev_1)} · 3개월 {fmtWon(sel.rev_3)} · 6개월 {fmtWon(sel.rev_6)} · 12개월 {fmtWon(sel.rev_12)}</> : ''}>
        {sel && (
          <div className="p-4">
            <div className="ds-wrap max-h-[calc(100vh-140px)]">
              <table className="ds-table">
                <thead><tr><th>회사</th><th>단계</th><th>유입일</th><th>채널</th><th>업종</th><th>도입일</th><th>소요일</th><th>서비스</th><th>누적 매출</th></tr></thead>
                <tbody>
                  {[...sel.rows].sort((a, b) => b.rev_total - a.rev_total).map(r => (
                    <tr key={r.key} className="ds-row">
                      <td className="font-medium">{r.customer_id ? <Link href={`/analytics/company/${r.customer_id}`} prefetch={false} className="hover:text-ds-accent">{r.company_name}</Link> : <>{r.company_name} <span className="text-[11px] text-ds-fg3">미연결</span></>}</td>
                      <td className="c"><StatusChip tone={r.won ? 'ok' : 'info'}>{r.won ? '도입완료' : '진행'}</StatusChip></td>
                      <td className="c muted">{r.inquiry_date}</td><td>{r.inquiry_channel || '—'}{r.inquiry_source ? <span className="text-ds-fg3"> / {r.inquiry_source}</span> : ''}</td><td>{r.industry || '—'}</td>
                      <td className="c muted">{r.converted_at || '—'}</td><td className="num">{r.days_to_convert ?? '—'}</td>
                      <td className="text-[12px] text-ds-fg2 max-w-[220px] truncate" title={r.services.join(', ')}>{r.services.join(', ') || '—'}</td><td className="num font-medium">{fmtWon(r.rev_total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </Drawer>
    </div>
  )
}
