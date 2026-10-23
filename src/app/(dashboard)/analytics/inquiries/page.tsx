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
const HELP = '문의 1건 = 1행 (리스트 · 유입 성과와 같은 건수) · 주제 = 리드 주제 태그(한 문의에 여러 개) · 도입률 = 도입 ÷ (도입 + 이탈), 진행 중은 빼고 셈 · 자주 나오는 질문 = 원문 단어 규칙(src/config/inquiry_questions.json), 한 문의가 여러 질문 · 공공 · 민간 = 리드 현장 분류(빈칸은 어느 쪽에도 안 셈, 도입 + 이탈 5건 미만은 —) · 도입까지 = 문의일 → 도입일 중앙값 · 최근 4주 = 이번 주 포함 4주, 그 전 4주와 비교 · 판단 카드는 숫자 사실만 (판단은 사람이) · 연락처 · 실명은 보여 주지 않음'

// 날짜 문자열만으로 계산 (toISOString 은 한국 시간 자정을 전날로 바꿈)
const monday = (d: string) => { const x = new Date(Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10))); x.setUTCDate(x.getUTCDate() - (x.getUTCDay() + 6) % 7); return x.toISOString().slice(0, 10) }
const today = () => { const t = new Date(Date.now() + 9 * 3600 * 1000); return t.toISOString().slice(0, 10) }
const periodKey = (d: string, p: Period) => p === 'week' ? monday(d) : p === 'month' ? d.slice(0, 7) : p === 'quarter' ? `${d.slice(0, 4)}-Q${Math.ceil(Number(d.slice(5, 7)) / 3)}` : d.slice(0, 4)
const periodLabel = (k: string, p: Period) => p === 'week' ? `${k.slice(5).replace('-', '.')} 주` : p === 'month' ? `${Number(k.slice(5))}월` : p === 'quarter' ? k.slice(5) : `${k}년`
const pct = (w: number, l: number) => (w + l ? Math.round(w / (w + l) * 100) : null)
const median = (a: number[]) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)] }
// 이번 주(0) 기준 몇 주 전인지 — "최근 4주" = 0~3, "그 전 4주" = 4~7
const weeksAgo = (d: string) => Math.floor((Date.parse(monday(today())) - Date.parse(monday(d))) / (7 * 86400000))
const rateTxt = (w: number, l: number) => { const p = pct(w, l); return p == null ? '—' : `${p}%` }

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
    type X = { n: number; w: number; l: number; pw: number; pl: number; mw: number; ml: number; days: number[]; now: number; prev: number; g: Map<string, number> }
    const m = new Map<string, X>()
    const wk = weeksAgo
    for (const r of base) for (const t of r.topics) {
      const x = m.get(t) || m.set(t, { n: 0, w: 0, l: 0, pw: 0, pl: 0, mw: 0, ml: 0, days: [], now: 0, prev: 0, g: new Map() }).get(t)!
      const won = r.stage === '도입완료', lost = r.stage === '이탈'
      x.n++; if (won) x.w++; if (lost) x.l++
      if (r.site_category === '공공') { if (won) x.pw++; if (lost) x.pl++ } else if (r.site_category === '민간') { if (won) x.mw++; if (lost) x.ml++ }
      if (r.days != null) x.days.push(r.days)
      const a = wk(r.inquiry_date); if (a < 4) x.now++; else if (a < 8) x.prev++
      x.g.set(r.inflow, (x.g.get(r.inflow) || 0) + 1)
    }
    return Array.from(m.entries()).map(([k, x]) => ({ k, ...x, med: median(x.days), top: Array.from(x.g.entries()).sort((a, b) => b[1] - a[1]).slice(0, 2).map(e => e[0]).join(' · ') }))
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

  const specific = useMemo(() => {
    const real = (r: InquiryRow) => r.topics.filter(t => !NO_TOPIC.includes(t)).length
    const G: [string, (r: InquiryRow) => boolean][] = [['원문 없음', r => !r.has_body], ['주제를 못 잡음', r => r.has_body && real(r) === 0], ['주제 1개', r => real(r) === 1], ['주제 2개 이상', r => real(r) >= 2]]
    return G.map(([k, f]) => { const rs = base.filter(f); return { k, n: rs.length, w: rs.filter(r => r.stage === '도입완료').length, l: rs.filter(r => r.stage === '이탈').length } })
  }, [base])
  const pairs = useMemo(() => {
    const m = new Map<string, { n: number; w: number; l: number }>()
    for (const r of base) {
      const ts = r.topics.filter(t => !NO_TOPIC.includes(t)).sort()
      for (let i = 0; i < ts.length; i++) for (let j = i + 1; j < ts.length; j++) {
        const k = `${ts[i]} + ${ts[j]}`, x = m.get(k) || m.set(k, { n: 0, w: 0, l: 0 }).get(k)!
        x.n++; if (r.stage === '도입완료') x.w++; if (r.stage === '이탈') x.l++
      }
    }
    return Array.from(m.entries()).map(([k, x]) => ({ k, ...x })).filter(x => x.n >= 5).sort((a, b) => b.n - a.n).slice(0, 8)
  }, [base])
  const site = useMemo(() => {
    const f = (c: string) => { const rs = base.filter(r => r.site_category === c); return { w: rs.filter(r => r.stage === '도입완료').length, l: rs.filter(r => r.stage === '이탈').length } }
    return { pub: f('공공'), pri: f('민간') }
  }, [base])
  const rising = topics.filter(t => !NO_TOPIC.includes(t.k) && t.now - t.prev >= 3).sort((a, b) => (b.now - b.prev) - (a.now - a.prev))[0]
  const sp2 = specific[3], sp0 = specific[1]

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

      {!loading && base.length > 0 && (
        <div className="grid md:grid-cols-3 gap-3 mb-5">
          {[
            { t: `공공 문의 도입률 ${rateTxt(site.pub.w, site.pub.l)} · 민간 ${rateTxt(site.pri.w, site.pri.l)}`, d: '같은 주제라도 공공이 높음 — 주제 표의 공공 · 민간 칸', tone: 'border-ds-info' },
            { t: `주제 2개 이상 ${rateTxt(sp2.w, sp2.l)} · 주제 못 잡음 ${rateTxt(sp0.w, sp0.l)}`, d: '구체적으로 물을수록 도입 — 아래 「문의가 구체적일수록」', tone: 'border-ds-warn' },
            rising ? { t: `최근 4주 ${rising.k} ${rising.prev} → ${rising.now}건`, d: '그 전 4주보다 가장 많이 늘어난 주제', tone: 'border-ds-warn' } : { t: '최근 4주 크게 늘어난 주제 없음', d: '그 전 4주 대비 3건 이상 늘어난 주제가 없음', tone: 'border-ds-line' },
          ].map((c, i) => <div key={i} className={`border-l-[3px] ${c.tone} pl-3 py-0.5`}><p className="text-[13px] font-medium text-ds-fg">{c.t}</p><p className="text-[12px] text-ds-fg3">{c.d}</p></div>)}
        </div>
      )}

      {loading ? <Skeleton rows={8} /> : base.length === 0 ? <Empty text="조건에 맞는 문의가 없습니다" /> : (
        <div className="grid lg:grid-cols-[minmax(0,1.4fr)_minmax(360px,1fr)] gap-5 items-start">
          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-2 h-5"><h2 className="text-[14px] font-medium text-ds-fg">주제 × 도입</h2><span className="text-[12px] text-ds-fg3">도입률 순 (도입 + 이탈 5건 미만은 아래) · 누르면 원문 목록</span></div>
            <div className="ds-wrap">
              <table className="ds-table is-clickable is-fixed is-clip">
                <colgroup><col style={{ width: '19%' }} /><col style={{ width: '8%' }} /><col style={{ width: '17%' }} /><col style={{ width: '8%' }} /><col style={{ width: '8%' }} /><col style={{ width: '10%' }} /><col style={{ width: '11%' }} /><col style={{ width: '19%' }} /></colgroup>
                <thead><tr><th>주제</th><th>문의</th><th>도입률</th><th>공공</th><th>민간</th><th>도입까지</th><th>최근 4주</th><th>많이 들어온 곳</th></tr></thead>
                <tbody>
                  {topics.map(t => (
                    <tr key={t.k} className={`ds-row ${pick?.kind === 'topic' && pick.key === t.k ? 'is-active' : ''}`} onClick={() => setPick({ kind: 'topic', key: t.k, label: `주제 ${t.k}` })}>
                      <td className={NO_TOPIC.includes(t.k) ? 'muted' : 'font-medium'} title={t.k}>{t.k}</td><td className="num">{t.n}</td>
                      <td className="num" title={`도입 ${t.w} · 이탈 ${t.l}`}><Rate w={t.w} l={t.l} /></td>
                      <td className={`num ${t.pw + t.pl < MIN ? 'muted' : ''}`} title={`공공 도입 ${t.pw} · 이탈 ${t.pl}`}>{t.pw + t.pl < MIN ? '—' : rateTxt(t.pw, t.pl)}</td><td className={`num ${t.mw + t.ml < MIN ? 'muted' : ''}`} title={`민간 도입 ${t.mw} · 이탈 ${t.ml}`}>{t.mw + t.ml < MIN ? '—' : rateTxt(t.mw, t.ml)}</td>
                      <td className="num" title={`도입 ${t.days.length}건의 중앙값`}>{t.med != null ? `${t.med}일` : '—'}</td>
                      <td className="num" title={`그 전 4주 ${t.prev}건 → 최근 4주 ${t.now}건`}>{t.prev} → <b className={t.now - t.prev >= 3 ? 'text-ds-fg' : 'font-normal'}>{t.now}</b></td>
                      <td className="text-[12px] text-ds-fg2" title={t.top}>{t.top}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="grid md:grid-cols-2 gap-5 mt-5">
              <div className="min-w-0">
                <div className="flex items-center gap-2 mb-2 h-5"><h2 className="text-[14px] font-medium text-ds-fg">문의가 구체적일수록</h2><span className="text-[12px] text-ds-fg3">잡힌 주제 수</span></div>
                <div className="ds-wrap"><table className="ds-table is-fixed is-clip">
                  <colgroup><col style={{ width: '42%' }} /><col style={{ width: '18%' }} /><col style={{ width: '40%' }} /></colgroup>
                  <thead><tr><th>문의</th><th>건수</th><th>도입률</th></tr></thead>
                  <tbody>{specific.map(x => <tr key={x.k} className="ds-row" title={`도입 ${x.w} · 이탈 ${x.l}`}><td>{x.k}</td><td className="num">{x.n}</td><td className="num"><Rate w={x.w} l={x.l} /></td></tr>)}</tbody>
                </table></div>
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2 mb-2 h-5"><h2 className="text-[14px] font-medium text-ds-fg">함께 묻는 주제</h2><span className="text-[12px] text-ds-fg3">5건 이상 조합</span></div>
                <div className="ds-wrap"><table className="ds-table is-fixed is-clip">
                  <colgroup><col style={{ width: '50%' }} /><col style={{ width: '14%' }} /><col style={{ width: '36%' }} /></colgroup>
                  <thead><tr><th>조합</th><th>건수</th><th>도입률</th></tr></thead>
                  <tbody>{pairs.map(x => <tr key={x.k} className="ds-row" title={`도입 ${x.w} · 이탈 ${x.l}`}><td title={x.k}>{x.k}</td><td className="num">{x.n}</td><td className="num"><Rate w={x.w} l={x.l} /></td></tr>)}</tbody>
                </table></div>
              </div>
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
