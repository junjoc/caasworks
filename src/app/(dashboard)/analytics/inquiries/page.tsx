'use client'

// 분석 › 문의 내용 — 분석 재구성 v3 (디자인 정의 #m-analytics-v3 · 4). 마케팅 리포트 대체
// 질문: 무엇을 묻고 · 어떤 주제가 도입으로 가나. 주제 × 도입률(2) : 기간 · 자주 나오는 질문(1). 칸을 누르면 원문 목록 드로어
import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import { KpiRow, Toolbar, Tabs, DsSelect, Skeleton, Empty, StatusChip, Drawer, BasisNote, stageTone } from '@/components/ds'
import type { InquiryRow } from '@/app/api/analytics/inquiries/route'

type Period = 'week' | 'month' | 'quarter' | 'year'
type Pick = { kind: 'topic' | 'q' | 'period'; key: string; label: string } | null
const thisYear = String(new Date().getFullYear())
const NO_TOPIC = ['기타', '내용없음']
const MIN = 5  // 도입 + 이탈이 이보다 적으면 도입률을 믿기 어려워 아래로
const HELP = '문의 1건 = 1행 (리스트 · 유입 성과와 같은 건수) · 주제 = 리드 주제 태그(한 문의에 여러 개) · 도입률 = 도입 ÷ (도입 + 이탈), 진행 중은 빼고 셈 · 자주 나오는 질문 = 원문 단어 규칙(src/config/inquiry_questions.json), 한 문의가 여러 질문 · 연락처 · 실명은 보여 주지 않음'

// 날짜 문자열만으로 계산 (toISOString 은 한국 시간 자정을 전날로 바꿈)
const monday = (d: string) => { const x = new Date(Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10))); x.setUTCDate(x.getUTCDate() - (x.getUTCDay() + 6) % 7); return x.toISOString().slice(0, 10) }
const today = () => { const t = new Date(Date.now() + 9 * 3600 * 1000); return t.toISOString().slice(0, 10) }
const periodKey = (d: string, p: Period) => p === 'week' ? monday(d) : p === 'month' ? d.slice(0, 7) : p === 'quarter' ? `${d.slice(0, 4)}-Q${Math.ceil(Number(d.slice(5, 7)) / 3)}` : d.slice(0, 4)
const periodLabel = (k: string, p: Period) => p === 'week' ? `${k.slice(5).replace('-', '.')} 주` : p === 'month' ? `${Number(k.slice(5))}월` : p === 'quarter' ? k.slice(5) : `${k}년`
const pct = (w: number, l: number) => (w + l ? Math.round(w / (w + l) * 100) : null)

function Rate({ w, l }: { w: number; l: number }) {
  const p = pct(w, l)
  return <span className="flex items-center gap-2"><span className="flex-1 min-w-0"><span className="block h-1.5 rounded-full bg-ds-line2 overflow-hidden"><span className="block h-full bg-ds-info rounded-full" style={{ width: `${p ?? 0}%` }} /></span></span><span className="w-9 shrink-0 text-right">{p == null ? '—' : `${p}%`}</span></span>
}

export default function InquiriesPage() {
  const [rows, setRows] = useState<InquiryRow[]>([])
  const [qKeys, setQKeys] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [period, setPeriod] = useState<Period>('week')
  const [year, setYear] = useState(thisYear)
  const [inflow, setInflow] = useState('all')
  const [industry, setIndustry] = useState('all')
  const [pick, setPick] = useState<Pick>(null)

  useEffect(() => {
    fetch('/api/analytics/inquiries').then(r => r.json()).then(d => { if (d.error) throw new Error(d.error); setRows(d.rows); setQKeys(d.questions) })
      .catch(e => toast.error(e.message)).finally(() => setLoading(false))
  }, [])

  const years = useMemo(() => Array.from(new Set(rows.map(r => r.inquiry_date.slice(0, 4)))).sort().reverse(), [rows])
  const inflows = useMemo(() => Array.from(new Set(rows.map(r => r.inflow))).sort(), [rows])
  const industries = useMemo(() => Array.from(new Set(rows.map(r => r.industry || '(빈칸)'))).sort(), [rows])
  const base = useMemo(() => rows.filter(r => (year === 'all' || r.inquiry_date.startsWith(year)) && (inflow === 'all' || r.inflow === inflow) && (industry === 'all' || (r.industry || '(빈칸)') === industry)), [rows, year, inflow, industry])

  const topics = useMemo(() => {
    const m = new Map<string, { n: number; w: number; l: number; g: Map<string, number> }>()
    for (const r of base) for (const t of r.topics) {
      const x = m.get(t) || m.set(t, { n: 0, w: 0, l: 0, g: new Map() }).get(t)!
      x.n++; if (r.stage === '도입완료') x.w++; if (r.stage === '이탈') x.l++
      x.g.set(r.inflow, (x.g.get(r.inflow) || 0) + 1)
    }
    return Array.from(m.entries()).map(([k, x]) => ({ k, ...x, top: Array.from(x.g.entries()).sort((a, b) => b[1] - a[1]).slice(0, 2).map(e => e[0]).join(' · ') }))
      .sort((a, b) => (NO_TOPIC.includes(a.k) ? 2 : a.w + a.l < MIN ? 1 : 0) - (NO_TOPIC.includes(b.k) ? 2 : b.w + b.l < MIN ? 1 : 0) || (pct(b.w, b.l) ?? -1) - (pct(a.w, a.l) ?? -1) || b.n - a.n)
  }, [base])

  const periods = useMemo(() => {
    const m = new Map<string, InquiryRow[]>()
    for (const r of base) { const k = periodKey(r.inquiry_date, period); (m.get(k) || m.set(k, []).get(k)!).push(r) }
    const keys = Array.from(m.keys()).sort().reverse().slice(0, period === 'week' ? 8 : period === 'month' ? 12 : 8)
    return keys.map(k => {
      const rs = m.get(k)!, tc = new Map<string, number>()
      for (const r of rs) for (const t of r.topics) if (!NO_TOPIC.includes(t)) tc.set(t, (tc.get(t) || 0) + 1)
      return { k, n: rs.length, top: Array.from(tc.entries()).sort((a, b) => b[1] - a[1]).slice(0, 2).map(([t, c]) => `${t} ${c}`).join(' · ') }
    })
  }, [base, period])
  const pmax = Math.max(1, ...periods.map(p => p.n))

  const qs = useMemo(() => qKeys.map(k => { const rs = base.filter(r => r.questions.includes(k)); return { k, n: rs.length, w: rs.filter(r => r.stage === '도입완료').length } }).sort((a, b) => b.n - a.n), [base, qKeys])

  const won = base.filter(r => r.stage === '도입완료').length, lost = base.filter(r => r.stage === '이탈').length
  const best = topics.filter(t => !NO_TOPIC.includes(t.k) && t.w + t.l >= 10)[0]
  const most = [...topics].filter(t => !NO_TOPIC.includes(t.k)).sort((a, b) => b.n - a.n)[0]
  const etc = topics.find(t => t.k === '기타')?.n || 0
  const withText = base.filter(r => r.snippet).length
  const thisWeek = base.filter(r => periodKey(r.inquiry_date, 'week') === monday(today())).length
  const scope = year === 'all' ? '전체' : `${year}년`

  const list = useMemo(() => !pick ? [] : base.filter(r => pick.kind === 'topic' ? r.topics.includes(pick.key) : pick.kind === 'q' ? r.questions.includes(pick.key) : periodKey(r.inquiry_date, period) === pick.key), [pick, base, period])

  return (
    <div>
      <Toolbar>
        <Tabs value={period} onChange={v => { setPeriod(v); setPick(null) }} options={[{ value: 'week', label: '주' }, { value: 'month', label: '월' }, { value: 'quarter', label: '분기' }, { value: 'year', label: '연' }]} />
        <DsSelect value={year} onChange={e => { setYear(e.target.value); setPick(null) }}><option value="all">전체 연도</option>{years.map(y => <option key={y} value={y}>{y}년</option>)}</DsSelect>
        <DsSelect value={inflow} onChange={e => { setInflow(e.target.value); setPick(null) }}><option value="all">유입 분류 전체</option>{inflows.map(v => <option key={v} value={v}>{v}</option>)}</DsSelect>
        <DsSelect value={industry} onChange={e => { setIndustry(e.target.value); setPick(null) }}><option value="all">업종 전체</option>{industries.map(v => <option key={v} value={v}>{v}</option>)}</DsSelect>
      </Toolbar>
      <KpiRow items={[
        { label: `${scope} 문의`, value: `${base.length.toLocaleString()}건`, sub: `이번 주 ${thisWeek} · 도입 ${won} · 이탈 ${lost}` },
        { label: '도입률 높은 주제', value: best ? `${best.k} ${pct(best.w, best.l)}%` : '—', sub: '도입 + 이탈 10건 이상' },
        { label: '가장 많이 묻는 주제', value: most ? most.k : '—', sub: most ? `${most.n}건 · 도입률 ${pct(most.w, most.l) ?? '—'}%` : undefined },
        { label: '주제 "기타"', value: `${etc}건`, sub: '태그 규칙 보강 대상', tone: etc > base.length * 0.2 ? 'bad' : undefined },
        { label: '원문 있는 문의', value: `${withText}건`, sub: '연락처 · 실명 숨김' },
      ]} />

      {loading ? <Skeleton rows={8} /> : base.length === 0 ? <Empty text="조건에 맞는 문의가 없습니다" /> : (
        <div className="grid lg:grid-cols-[minmax(0,1.4fr)_minmax(360px,1fr)] gap-5 items-start">
          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-2 h-5"><h2 className="text-[14px] font-medium text-ds-fg">주제 × 도입</h2><span className="text-[12px] text-ds-fg3">도입률 순 (도입 + 이탈 5건 미만은 아래) · 누르면 원문 목록</span></div>
            <div className="ds-wrap">
              <table className="ds-table is-clickable is-fixed is-clip">
                <colgroup><col style={{ width: '22%' }} /><col style={{ width: '11%' }} /><col style={{ width: '10%' }} /><col style={{ width: '10%' }} /><col style={{ width: '22%' }} /><col style={{ width: '25%' }} /></colgroup>
                <thead><tr><th>주제</th><th>문의</th><th>도입</th><th>이탈</th><th>도입률</th><th>많이 들어온 곳</th></tr></thead>
                <tbody>
                  {topics.map(t => (
                    <tr key={t.k} className={`ds-row ${pick?.kind === 'topic' && pick.key === t.k ? 'is-active' : ''}`} onClick={() => setPick({ kind: 'topic', key: t.k, label: `주제 ${t.k}` })}>
                      <td className={NO_TOPIC.includes(t.k) ? 'muted' : 'font-medium'}>{t.k}</td><td className="num">{t.n}</td><td className="num">{t.w}</td><td className="num">{t.l}</td>
                      <td className="num"><Rate w={t.w} l={t.l} /></td><td className="text-[12px] text-ds-fg2" title={t.top}>{t.top}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="min-w-0 space-y-5">
            <div>
              <div className="flex items-center gap-2 mb-2 h-5"><h2 className="text-[14px] font-medium text-ds-fg">{period === 'week' ? '주간 — 주간 §0' : period === 'month' ? '월별' : period === 'quarter' ? '분기별' : '연도별'}</h2><span className="text-[12px] text-ds-fg3">{period === 'week' ? '월요일 시작 · 최근 8주' : '최근 순'}</span></div>
              <div className="ds-wrap">
                <table className="ds-table is-clickable is-fixed is-clip">
                  <colgroup><col style={{ width: '20%' }} /><col style={{ width: '12%' }} /><col style={{ width: '20%' }} /><col style={{ width: '48%' }} /></colgroup>
                  <thead><tr><th>기간</th><th>문의</th><th></th><th>주제 상위 2</th></tr></thead>
                  <tbody>
                    {periods.map(p => (
                      <tr key={p.k} className={`ds-row ${pick?.kind === 'period' && pick.key === p.k ? 'is-active' : ''}`} onClick={() => setPick({ kind: 'period', key: p.k, label: periodLabel(p.k, period) })}>
                        <td>{periodLabel(p.k, period)}</td><td className="num font-medium">{p.n}</td>
                        <td><span className="block h-1.5 rounded-full bg-ds-line2 overflow-hidden"><span className="block h-full bg-ds-info rounded-full" style={{ width: `${p.n / pmax * 100}%` }} /></span></td>
                        <td className="text-[12px] text-ds-fg2" title={p.top}>{p.top || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            <div>
              <div className="flex items-center gap-2 mb-2 h-5"><h2 className="text-[14px] font-medium text-ds-fg">자주 나오는 질문</h2><span className="text-[12px] text-ds-fg3">FAQ · 용어 글 후보 · 원문 단어 기준</span></div>
              <div className="ds-wrap">
                <table className="ds-table is-clickable is-fixed is-clip">
                  <colgroup><col style={{ width: '56%' }} /><col style={{ width: '22%' }} /><col style={{ width: '22%' }} /></colgroup>
                  <thead><tr><th>질문</th><th>문의</th><th>도입</th></tr></thead>
                  <tbody>
                    {qs.map(q => (
                      <tr key={q.k} className={`ds-row ${pick?.kind === 'q' && pick.key === q.k ? 'is-active' : ''}`} onClick={() => setPick({ kind: 'q', key: q.k, label: q.k })}>
                        <td className="font-medium">{q.k}</td><td className="num">{q.n}</td><td className="num">{q.w}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}

      <BasisNote text={HELP} />

      <Drawer open={!!pick} onClose={() => setPick(null)} width="min(1100px, 92vw)" title={pick ? `${pick.label} · 문의 ${list.length}건` : ''}
        meta={pick ? <>도입 {list.filter(r => r.stage === '도입완료').length} · 이탈 {list.filter(r => r.stage === '이탈').length} · {scope}{inflow !== 'all' ? ` · ${inflow}` : ''}</> : ''}>
        {pick && (
          <div className="p-4">
            <div className="ds-wrap max-h-[calc(100vh-140px)]">
              <table className="ds-table is-fixed is-clip">
                <colgroup><col style={{ width: '10%' }} /><col style={{ width: '17%' }} /><col style={{ width: '9%' }} /><col style={{ width: '13%' }} /><col style={{ width: '15%' }} /><col style={{ width: '36%' }} /></colgroup>
                <thead><tr><th>유입일</th><th>회사</th><th>단계</th><th>유입</th><th>주제</th><th>원문</th></tr></thead>
                <tbody>
                  {list.map(r => (
                    <tr key={r.id} className="ds-row">
                      <td className="c muted">{r.inquiry_date}</td>
                      <td className="font-medium" title={r.company_name}><Link href={`/pipeline/${r.id}`} prefetch={false} className="hover:text-ds-accent">{r.company_name}</Link></td>
                      <td className="c"><StatusChip tone={stageTone(r.stage)}>{r.stage}</StatusChip></td>
                      <td title={`${r.inflow} › ${r.inflow_sub}`}>{r.inflow}<span className="text-ds-fg3"> › {r.inflow_sub}</span></td>
                      <td className="text-[12px] text-ds-fg2" title={r.topics.join(', ')}>{r.topics.join(', ')}</td>
                      <td className="text-[12px] text-ds-fg2" title={r.snippet}>{r.snippet || '—'}</td>
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
