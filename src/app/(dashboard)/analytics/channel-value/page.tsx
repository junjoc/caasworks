'use client'

// 분석 > 고객 생애주기 > 채널별 생애 가치 (디자인 정의 v1). 행 클릭 → 오른쪽 넓은 드로어에 회사 목록
import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import { fetchLifecycle, fmtWon, fmtPct, median, type LifecycleRow } from '@/lib/lifecycle'
import { classifyLead, INFLOW_ORDER } from '@/lib/inflow-taxonomy'

// 11개 분류에서 광고비를 붙일 수 있는 분류 → 광고 성과의 채널
const COST_CH: Record<string, string[]> = { '광고': ['네이버', '구글', '메타', '유튜브'], '외주 블로그': ['외주 블로그'] }
import { KpiRow, Toolbar, DsSelect, Check, Skeleton, Empty, StatusChip, Drawer, DsButton, BasisNote } from '@/components/ds'

export default function ChannelValuePage() {
  const [rows, setRows] = useState<LifecycleRow[]>([])
  const [adCost, setAdCost] = useState<Record<string, Record<string, number>>>({})
  const [loading, setLoading] = useState(true)
  const [year, setYear] = useState('all')
  const [sub, setSub] = useState(false)
  const [mode, setMode] = useState<'11' | 'raw'>('11')
  const [includeExisting, setIncludeExisting] = useState(false)
  const [open, setOpen] = useState<string | null>(null)

  useEffect(() => { fetchLifecycle().then(d => { setRows(d.rows); setAdCost(d.ad_cost || {}) }).catch(e => toast.error(e.message)).finally(() => setLoading(false)) }, [])

  const years = useMemo(() => Array.from(new Set(rows.map(r => r.inquiry_date.slice(0, 4)))).sort().reverse(), [rows])
  const filtered = useMemo(() => rows.filter(r => (includeExisting || !r.existing_customer) && (year === 'all' || r.inquiry_date.startsWith(year))), [rows, includeExisting, year])
  const cost1 = (ch: string) => { const c = adCost[ch]; if (!c) return 0; return year === 'all' ? Object.values(c).reduce((a, b) => a + b, 0) : (c[year] || 0) }
  const costOf = (k: string) => (mode === '11' ? (COST_CH[k] || []).reduce((s, ch) => s + cost1(ch), 0) : cost1(k))
  const table = useMemo(() => {
    const m = new Map<string, LifecycleRow[]>()
    for (const r of filtered) {
      let k: string
      if (mode === '11') { const f = classifyLead(r.inquiry_channel, r.inquiry_source); k = sub ? `${f.group} › ${f.sub}` : f.group }
      else k = sub ? `${r.inquiry_channel || '(미입력)'} › ${r.inquiry_source || '—'}` : (r.inquiry_channel || '(미입력)')
      ;(m.get(k) || m.set(k, []).get(k)!).push(r)
    }
    return Array.from(m.entries()).map(([k, rs]) => {
      const won = rs.filter(r => r.won), rev = rs.reduce((s, r) => s + r.rev_total, 0), cost = sub ? 0 : costOf(k)
      return { key: k, rows: rs, n: rs.length, won: won.length, rev, perWon: won.length ? rev / won.length : null, days: median(won.map(r => r.days_to_convert).filter((d): d is number => d != null)), cost, roas: cost ? rev / cost : null }
    }).sort((a, b) => mode === '11' && !sub ? INFLOW_ORDER.indexOf(a.key as never) - INFLOW_ORDER.indexOf(b.key as never) : b.rev - a.rev)
  }, [filtered, sub, adCost, year, mode])
  const tot = { n: table.reduce((s, t) => s + t.n, 0), won: table.reduce((s, t) => s + t.won, 0), rev: table.reduce((s, t) => s + t.rev, 0), cost: table.reduce((s, t) => s + t.cost, 0) }
  const sel = table.find(t => t.key === open)

  const HELP = '문의 1건 = 1행, 그 문의의 유입 채널 기준 (같은 회사 재문의는 그 문의 채널로, 매출은 다음 문의 전까지만 — 겹쳐 세지 않음) · 매출은 유입 이후 공급가 누적 · 광고비는 유입 성과에 입력된 그 채널 비용(선택 연도) · 2023~2025 광고비는 아직 연결 전이라 그 해는 — · 행을 누르면 회사 목록'
  return (
    <div>
      <Toolbar right={<>
        <DsSelect value={mode} onChange={e => { setMode(e.target.value as '11' | 'raw'); setOpen(null) }}><option value="11">유입 분류 11</option><option value="raw">저장된 채널값</option></DsSelect>
        <DsSelect value={year} onChange={e => { setYear(e.target.value); setOpen(null) }}><option value="all">전체 연도</option>{years.map(y => <option key={y} value={y}>{y}년 유입</option>)}</DsSelect>
        <Check label="세부까지" checked={sub} onChange={v => { setSub(v); setOpen(null) }} />
        <Check label="기존 고객 포함" checked={includeExisting} onChange={setIncludeExisting} />
        <DsButton variant="ghost" size="sm" title={HELP}>ⓘ 기준</DsButton>
      </>} />
      <KpiRow items={[
        { label: '유입', value: `${tot.n.toLocaleString()}건` },
        { label: '도입', value: `${tot.won}건`, sub: `도입률 ${fmtPct(tot.won, tot.n)}` },
        { label: '누적 매출', value: `${fmtWon(tot.rev)}원`, sub: '유입 이후 공급가' },
        { label: '광고비', value: tot.cost ? `${fmtWon(tot.cost)}원` : '—', sub: '광고·외주 블로그' },
        { label: '매출/광고비', value: tot.cost ? `${(tot.rev / tot.cost).toFixed(1)}배` : '—' },
      ]} />

      {loading ? <Skeleton rows={8} /> : table.length === 0 ? <Empty text="조건에 맞는 유입이 없습니다" /> : (
        <div className="ds-wrap max-h-[70vh] min-w-[880px]">
          <table className="ds-table is-clickable is-fixed">
            <colgroup>{[18, 8, 8, 9, 11, 13, 12, 11, 10].map((w, i) => <col key={i} style={{ width: `${w}%` }} />)}</colgroup>
            <thead><tr><th>{mode === '11' ? '유입 분류' : '채널'}{sub ? ' › 세부' : ''}</th><th>회사</th><th>도입</th><th>도입률</th><th>소요일 중앙값</th><th>누적 매출</th><th>도입 회사당</th><th>광고비</th><th title="누적 매출 ÷ 광고비">매출/광고비</th></tr></thead>
            <tbody>
              <tr className="ds-sum top"><td>합계</td><td className="num">{tot.n}</td><td className="num">{tot.won}</td><td className="num">{fmtPct(tot.won, tot.n)}</td><td></td><td className="num">{fmtWon(tot.rev)}</td><td className="num">{tot.won ? fmtWon(tot.rev / tot.won) : '—'}</td><td className="num">{tot.cost ? fmtWon(tot.cost) : '—'}</td><td className="num">{tot.cost ? `${(tot.rev / tot.cost).toFixed(1)}배` : '—'}</td></tr>

              {table.map(t => (
                <tr key={t.key} className={`ds-row ${open === t.key ? 'is-active' : ''}`} onClick={() => setOpen(t.key)}>
                  <td className="font-medium" title={t.key}>{t.key}</td><td className="num">{t.n}</td><td className="num">{t.won}</td><td className="num">{fmtPct(t.won, t.n)}</td>
                  <td className="num">{t.days != null ? `${t.days}일` : '—'}</td><td className="num font-medium">{fmtWon(t.rev)}</td><td className="num">{fmtWon(t.perWon)}</td>
                  <td className="num">{t.cost ? fmtWon(t.cost) : '—'}</td><td className="num">{t.roas != null ? `${t.roas.toFixed(1)}배` : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <BasisNote text={HELP} />

      <Drawer open={!!sel} onClose={() => setOpen(null)} width="60vw" title={sel ? `${sel.key} — ${sel.n}건` : ''} meta={sel ? `도입 ${sel.won}건 · 누적 매출 ${fmtWon(sel.rev)}원` : ''}>
        {sel && (
          <div className="p-4">
            <div className="ds-wrap max-h-[calc(100vh-140px)]">
              <table className="ds-table">
                <thead><tr><th>회사</th><th>유입일</th><th>유입경로</th><th>상태</th><th>도입일</th><th>소요일</th><th>서비스</th><th>누적 매출</th></tr></thead>
                <tbody>
                  {[...sel.rows].sort((a, b) => b.rev_total - a.rev_total).map(r => (
                    <tr key={r.key} className="ds-row">
                      <td className="font-medium">{r.customer_id ? <Link href={`/analytics/company/${r.customer_id}`} className="hover:text-ds-accent">{r.company_name}</Link> : r.company_name}</td>
                      <td className="c muted">{r.inquiry_date}</td><td>{r.inquiry_source || '—'}</td>
                      <td><StatusChip cell tone={r.won ? 'ok' : 'info'}>{r.won ? '도입완료' : '진행'}</StatusChip></td>
                      <td className="c muted">{r.converted_at || '—'}</td><td className="num">{r.days_to_convert ?? '—'}</td>
                      <td className="text-[12px] text-ds-fg2">{r.services.join(', ') || '—'}</td><td className="num font-medium">{fmtWon(r.rev_total)}</td>
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
