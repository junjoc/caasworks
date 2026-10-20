'use client'

// 분석 > 고객 생애주기 > 유입 코호트 (디자인 정의 v1 시범 적용)
// 유입월(분기)별 리드 수·도입 수·유입 후 N개월 누적 매출(공급가). 행 클릭 → 그 코호트 회사 목록
import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import { fetchLifecycle, fmtWon, fmtPct, type LifecycleRow } from '@/lib/lifecycle'
import { PageHeader, Toolbar, Tabs, DsSelect, Check, Skeleton, Empty, SectionTitle, StatusChip } from '@/components/ds'

type Group = 'month' | 'quarter'
const groupKey = (m: string, g: Group) => (g === 'month' ? m : `${m.slice(0, 4)}-Q${Math.ceil(Number(m.slice(5, 7)) / 3)}`)

export default function CohortPage() {
  const [rows, setRows] = useState<LifecycleRow[]>([])
  const [loading, setLoading] = useState(true)
  const [group, setGroup] = useState<Group>('month')
  const [year, setYear] = useState('all')
  const [channel, setChannel] = useState('all')
  const [includeExisting, setIncludeExisting] = useState(false)
  const [open, setOpen] = useState<string | null>(null)

  useEffect(() => { fetchLifecycle().then(d => setRows(d.rows)).catch(e => toast.error(e.message)).finally(() => setLoading(false)) }, [])

  const years = useMemo(() => Array.from(new Set(rows.map(r => r.inquiry_date.slice(0, 4)))).sort().reverse(), [rows])
  const channels = useMemo(() => Array.from(new Set(rows.map(r => r.inquiry_channel || '(미입력)'))).sort(), [rows])
  const filtered = useMemo(() => rows.filter(r => (includeExisting || !r.existing_customer) && (year === 'all' || r.inquiry_date.startsWith(year)) && (channel === 'all' || (r.inquiry_channel || '(미입력)') === channel)), [rows, includeExisting, year, channel])

  const cohorts = useMemo(() => {
    const m = new Map<string, LifecycleRow[]>()
    for (const r of filtered) { const k = groupKey(r.inquiry_month, group); (m.get(k) || m.set(k, []).get(k)!).push(r) }
    return Array.from(m.entries()).sort((a, b) => b[0].localeCompare(a[0])).map(([k, rs]) => {
      const cum = (f: 'rev_1' | 'rev_3' | 'rev_6' | 'rev_12') => (rs.every(r => r[f] != null) ? rs.reduce((s, r) => s + (r[f] || 0), 0) : null)
      return { key: k, rows: rs, n: rs.length, won: rs.filter(r => r.won).length, rev_1: cum('rev_1'), rev_3: cum('rev_3'), rev_6: cum('rev_6'), rev_12: cum('rev_12'), total: rs.reduce((s, r) => s + r.rev_total, 0), withRev: rs.filter(r => r.rev_total > 0).length }
    })
  }, [filtered, group])
  const sum = (f: 'n' | 'won' | 'total' | 'withRev') => cohorts.reduce((s, c) => s + c[f], 0)
  const sel = cohorts.find(c => c.key === open)

  return (
    <div>
      <PageHeader title="유입 코호트"
        kpis={[{ label: '유입 회사', value: sum('n') }, { label: '도입', value: `${sum('won')} (${fmtPct(sum('won'), sum('n'))})` }, { label: '매출 발생', value: sum('withRev') }, { label: '누적 매출', value: `${fmtWon(sum('total'))}원` }]}
        subtitle="회사 단위 · 첫 리드의 유입월 기준 · 매출은 유입월부터 공급가(VAT 제외) · N개월은 유입월 포함 누적, 아직 안 지난 코호트는 — · 유입 전 매출이 있던 기존 고객은 기본 제외" />
      <Toolbar right={<>
        <DsSelect value={year} onChange={e => setYear(e.target.value)}><option value="all">전체 연도</option>{years.map(y => <option key={y} value={y}>{y}년 유입</option>)}</DsSelect>
        <DsSelect value={channel} onChange={e => setChannel(e.target.value)}><option value="all">전체 채널</option>{channels.map(c => <option key={c} value={c}>{c}</option>)}</DsSelect>
        <Check label="기존 고객 포함" checked={includeExisting} onChange={setIncludeExisting} />
      </>}>
        <Tabs value={group} onChange={g => { setGroup(g); setOpen(null) }} options={[{ value: 'month', label: '월별' }, { value: 'quarter', label: '분기별' }]} />
      </Toolbar>

      {loading ? <Skeleton rows={8} /> : cohorts.length === 0 ? <Empty text="조건에 맞는 유입이 없습니다" /> : (
        <div className="ds-wrap">
          <table className="ds-table is-clickable">
            <thead><tr>
              <th>유입{group === 'month' ? '월' : '분기'}</th><th className="num">회사</th><th className="num">도입</th><th className="num">도입률</th>
              <th className="num">1개월</th><th className="num">3개월</th><th className="num">6개월</th><th className="num">12개월</th><th className="num">현재까지</th><th className="num" title="누적 매출 ÷ 도입 회사">도입 회사당</th>
            </tr></thead>
            <tbody>
              {cohorts.map(c => (
                <tr key={c.key} className={`ds-row ${open === c.key ? 'is-active' : ''}`} onClick={() => setOpen(open === c.key ? null : c.key)}>
                  <td className="font-medium">{c.key}</td><td className="num">{c.n}</td><td className="num">{c.won}</td><td className="num">{fmtPct(c.won, c.n)}</td>
                  <td className="num">{fmtWon(c.rev_1)}</td><td className="num">{fmtWon(c.rev_3)}</td><td className="num">{fmtWon(c.rev_6)}</td><td className="num">{fmtWon(c.rev_12)}</td>
                  <td className="num font-medium">{fmtWon(c.total)}</td><td className="num">{c.won ? fmtWon(c.total / c.won) : '—'}</td>
                </tr>
              ))}
              <tr className="ds-sum"><td>합계</td><td className="num">{sum('n')}</td><td className="num">{sum('won')}</td><td className="num">{fmtPct(sum('won'), sum('n'))}</td><td colSpan={4}></td><td className="num">{fmtWon(sum('total'))}</td><td className="num">{sum('won') ? fmtWon(sum('total') / sum('won')) : '—'}</td></tr>
            </tbody>
          </table>
        </div>
      )}

      {sel && (
        <>
          <SectionTitle>{sel.key} 유입 회사 {sel.n}곳</SectionTitle>
          <div className="ds-wrap max-h-[520px] overflow-auto">
            <table className="ds-table">
              <thead><tr><th>회사</th><th>유입일</th><th>채널</th><th>업종</th><th className="text-center">상태</th><th>도입일</th><th className="num">소요일</th><th>서비스</th><th className="num">누적 매출</th><th className="num">리드</th></tr></thead>
              <tbody>
                {[...sel.rows].sort((a, b) => b.rev_total - a.rev_total).map(r => (
                  <tr key={r.key} className="ds-row">
                    <td className="font-medium">{r.customer_id ? <Link href={`/analytics/company/${r.customer_id}`} className="hover:text-ds-accent">{r.company_name}</Link> : <>{r.company_name} <span className="text-[11px] text-ds-fg3">미연결</span></>}</td>
                    <td className="muted">{r.inquiry_date}</td><td className="muted">{r.inquiry_channel || '—'}{r.inquiry_source ? ` / ${r.inquiry_source}` : ''}</td><td>{r.industry || '—'}</td>
                    <td><StatusChip cell tone={r.won ? 'ok' : 'info'}>{r.won ? '도입완료' : '진행'}</StatusChip></td>
                    <td className="muted">{r.converted_at || '—'}</td><td className="num">{r.days_to_convert ?? '—'}</td>
                    <td className="text-[12px] text-ds-fg2">{r.services.join(', ') || '—'}</td><td className="num font-medium">{fmtWon(r.rev_total)}</td><td className="num muted">{r.lead_count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}
