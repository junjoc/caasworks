'use client'

// 분석 › 매출 분석 — 분석 재구성 v3 (디자인 정의 #m-analytics-v3 · 5). 손익 분석 자리
// 질문: 매출이 어디서 · 무엇으로 · 누구에게서 나오나. 월 매출 → 서비스 · 첫 문의 유입 · 첫 문의 주제 3표. 줄을 누르면 고객사 드로어
import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import { KpiRow, Toolbar, DsSelect, Skeleton, Empty, Drawer, BasisNote } from '@/components/ds'
import type { RevLine, RevCustomer } from '@/app/api/analytics/revenue/route'

type Dim = 'svc' | 'inflow' | 'topic' | 'site' | 'month'
type Pick = { dim: Dim; key: string; label: string } | null
const now = new Date(Date.now() + 9 * 3600 * 1000)
const thisYear = now.getUTCFullYear(), thisMonth = now.getUTCMonth() + 1
const eok = (v: number) => `${(v / 1e8).toFixed(2)}억`
const man = (v: number) => Math.round(v / 1e4).toLocaleString()
const HELP = '매출 = 매출 시트 「현장별 전체 매출」(CRM 이 매일 08시 동기화) · 올해 남은 달은 시트에 이미 잡힌 예정 매출(선납 · 계약)이라 빗금 · 첫 문의 = 고객사의 가장 이른 리드 — 기존 고객의 추가 현장 매출도 처음 들어온 경로로 셈 · 리드가 없는 고객사 = 출처 모름 · 연결률 = 리드와 이어진 고객사 매출 ÷ 전체 · 신규 = 그해 처음 매출이 난 고객사'

export default function RevenueAnalysisPage() {
  const [lines, setLines] = useState<RevLine[]>([])
  const [cust, setCust] = useState<Record<string, RevCustomer>>({})
  const [loading, setLoading] = useState(true)
  const [year, setYear] = useState(thisYear)
  const [ctype, setCtype] = useState('all')
  const [site, setSite] = useState('all')
  const [pick, setPick] = useState<Pick>(null)

  useEffect(() => {
    fetch('/api/analytics/revenue').then(r => r.json()).then(d => { if (d.error) throw new Error(d.error); setLines(d.lines); setCust(d.customers) })
      .catch(e => toast.error(e.message)).finally(() => setLoading(false))
  }, [])

  const years = useMemo(() => Array.from(new Set(lines.map(l => l.y))).sort((a, b) => b - a), [lines])
  const types = useMemo(() => Array.from(new Set(Object.values(cust).map(c => c.type))).sort(), [cust])
  const base = useMemo(() => lines.filter(l => l.y === year && (ctype === 'all' || cust[l.c]?.type === ctype) && (site === 'all' || l.site === site)), [lines, year, ctype, site, cust])
  const total = base.reduce((s, l) => s + l.amt, 0)

  const keyOf = (l: RevLine, d: Dim) => d === 'svc' ? l.svc : d === 'site' ? l.site : d === 'month' ? String(l.m) : (cust[l.c]?.[d] ?? '출처 모름')
  const groupBy = (d: Dim) => {
    const m = new Map<string, number>()
    for (const l of base) { const k = keyOf(l, d); m.set(k, (m.get(k) || 0) + l.amt) }
    return Array.from(m.entries()).sort((a, b) => b[1] - a[1])
  }
  const months = useMemo(() => { const a = Array(12).fill(0); for (const l of base) a[l.m - 1] += l.amt; return a }, [base])
  const svc = useMemo(() => groupBy('svc'), [base]) // eslint-disable-line react-hooks/exhaustive-deps
  const inflow = useMemo(() => groupBy('inflow'), [base, cust]) // eslint-disable-line react-hooks/exhaustive-deps
  const topic = useMemo(() => groupBy('topic'), [base, cust]) // eslint-disable-line react-hooks/exhaustive-deps
  const sites = useMemo(() => groupBy('site'), [base]) // eslint-disable-line react-hooks/exhaustive-deps

  const custs = new Set(base.map(l => l.c))
  const newRev = base.filter(l => cust[l.c]?.first_year === year).reduce((s, l) => s + l.amt, 0)
  const linkedRev = base.filter(l => cust[l.c]?.linked).reduce((s, l) => s + l.amt, 0)
  const linkedCust = Array.from(custs).filter(c => cust[c]?.linked).length
  const future = year === thisYear ? months.slice(thisMonth).reduce((s, v) => s + v, 0) : 0
  const pub = sites.find(s => s[0] === '공공')?.[1] || 0
  const mMax = Math.max(1, ...months)
  const pct = (v: number) => (total ? `${Math.round(v / total * 100)}%` : '—')

  const drawerRows = useMemo(() => {
    if (!pick) return []
    const m = new Map<string, number>()
    for (const l of base) if (keyOf(l, pick.dim) === pick.key) m.set(l.c, (m.get(l.c) || 0) + l.amt)
    return Array.from(m.entries()).sort((a, b) => b[1] - a[1])
  }, [pick, base, cust]) // eslint-disable-line react-hooks/exhaustive-deps
  const drawerTotal = drawerRows.reduce((s, r) => s + r[1], 0)

  const Table = ({ title, sub, dim, rows, head }: { title: string; sub: string; dim: Dim; rows: [string, number][]; head: string }) => {
    const top = Math.max(1, ...rows.filter(r => r[0] !== '출처 모름').map(r => r[1]))
    return (
      <div className="min-w-0">
        <div className="flex items-center gap-2 mb-2 h-5"><h2 className="text-[14px] font-medium text-ds-fg">{title}</h2><span className="text-[12px] text-ds-fg3">{sub}</span></div>
        <div className="ds-wrap max-h-[420px]">
          <table className="ds-table is-clickable is-fixed is-clip">
            <colgroup><col style={{ width: '40%' }} /><col style={{ width: '20%' }} /><col style={{ width: '14%' }} /><col style={{ width: '26%' }} /></colgroup>
            <thead><tr><th>{head}</th><th>매출(만)</th><th>비중</th><th></th></tr></thead>
            <tbody>
              {rows.map(([k, v]) => (
                <tr key={k} className={`ds-row ${k === '출처 모름' ? 'bg-ds-subtle' : ''} ${pick?.dim === dim && pick.key === k ? 'is-active' : ''}`} onClick={() => setPick({ dim, key: k, label: `${title} · ${k}` })}>
                  <td className={k === '출처 모름' ? 'muted' : 'font-medium'} title={k}>{k}</td><td className="num">{man(v)}</td><td className="num">{pct(v)}</td>
                  <td>{k !== '출처 모름' && <span className="block h-1.5 rounded-full bg-ds-line2 overflow-hidden"><span className="block h-full bg-ds-info rounded-full" style={{ width: `${v / top * 100}%` }} /></span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    )
  }

  return (
    <div>
      <Toolbar>
        <DsSelect value={year} onChange={e => { setYear(Number(e.target.value)); setPick(null) }}>{years.map(y => <option key={y} value={y}>{y}년</option>)}</DsSelect>
        <DsSelect value={ctype} onChange={e => { setCtype(e.target.value); setPick(null) }}><option value="all">고객 유형 전체</option>{types.map(t => <option key={t} value={t}>{t}</option>)}</DsSelect>
        <DsSelect value={site} onChange={e => { setSite(e.target.value); setPick(null) }}><option value="all">공공 · 민간 전체</option><option value="공공">공공</option><option value="민간">민간</option></DsSelect>
      </Toolbar>
      <KpiRow items={[
        { label: `${year} 매출 (시트)`, value: eok(total), sub: future ? `남은 달 예정 ${eok(future)} 포함` : undefined },
        year === thisYear ? { label: `${thisMonth}월`, value: eok(months[thisMonth - 1]), sub: `${thisMonth - 1}월 ${eok(months[thisMonth - 2] || 0)}` } : { label: '월 평균', value: eok(total / 12) },
        { label: '매출 고객사', value: `${custs.size}곳`, sub: `신규 고객 매출 ${pct(newRev)}` },
        { label: '공공 현장 매출', value: pct(pub), sub: `${eok(pub)} · 민간 ${eok(total - pub)}` },
        { label: '리드 연결률', value: pct(linkedRev), sub: `매출 기준 · 고객 ${linkedCust}/${custs.size}`, tone: total && linkedRev / total < 0.8 ? 'bad' : undefined },
      ]} />

      {loading ? <Skeleton rows={8} /> : !total ? <Empty text="조건에 맞는 매출이 없습니다" /> : (
        <>
          <div className="mb-5">
            <div className="flex items-center gap-2 mb-2 h-5"><h2 className="text-[14px] font-medium text-ds-fg">월 매출</h2><span className="text-[12px] text-ds-fg3">백만 원 · {year === thisYear ? '빗금 = 시트에 잡힌 예정' : ''} · 막대를 누르면 고객사</span></div>
            <div className="grid grid-cols-12 gap-2 h-[150px] items-end border-b border-ds-line pb-1">
              {months.map((v, i) => {
                const fut = year === thisYear && i + 1 > thisMonth
                return (
                  <button key={i} type="button" onClick={() => v && setPick({ dim: 'month', key: String(i + 1), label: `${i + 1}월` })} className="h-full flex flex-col justify-end items-center gap-1 group" title={`${i + 1}월 ${v.toLocaleString()}원`}>
                    <span className="text-[11px] text-ds-fg2">{v ? Math.round(v / 1e6) : ''}</span>
                    <span className={`w-full rounded-t ${fut ? 'opacity-50' : 'bg-ds-info'} group-hover:opacity-80`} style={{ height: `${v / mMax * 110}px`, ...(fut ? { background: 'repeating-linear-gradient(45deg, var(--ds-info) 0 3px, transparent 3px 6px)', border: '1px solid var(--ds-info)' } : {}) }} />
                  </button>
                )
              })}
            </div>
            <div className="grid grid-cols-12 gap-2 mt-1">{months.map((_, i) => <span key={i} className="text-center text-[11px] text-ds-fg3">{i + 1}</span>)}</div>
          </div>
          <div className="grid lg:grid-cols-3 gap-5 items-start">
            <Table title="서비스별" sub="누르면 고객사" dim="svc" rows={svc} head="서비스" />
            <Table title="첫 문의 유입 분류별" sub="고객사의 가장 이른 리드" dim="inflow" rows={inflow} head="유입 분류" />
            <Table title="첫 문의 주제별" sub="기타 · 가격만이면 주제 없음" dim="topic" rows={topic} head="주제" />
          </div>
        </>
      )}

      <BasisNote text={HELP} />

      <Drawer open={!!pick} onClose={() => setPick(null)} width="min(900px, 92vw)" title={pick ? `${pick.label} · 고객사 ${drawerRows.length}곳` : ''} meta={pick ? <>{year}년 매출 {drawerTotal.toLocaleString()}원</> : ''}>
        {pick && (
          <div className="p-4">
            <div className="ds-wrap max-h-[calc(100vh-140px)]">
              <table className="ds-table is-fixed is-clip">
                <colgroup><col style={{ width: '28%' }} /><col style={{ width: '16%' }} /><col style={{ width: '16%' }} /><col style={{ width: '16%' }} /><col style={{ width: '14%' }} /><col style={{ width: '10%' }} /></colgroup>
                <thead><tr><th>고객사</th><th>고객 유형</th><th>첫 문의 유입</th><th>첫 문의 주제</th><th>매출(만)</th><th>비중</th></tr></thead>
                <tbody>
                  {drawerRows.map(([c, v]) => (
                    <tr key={c} className="ds-row">
                      <td className="font-medium" title={cust[c]?.name}><Link href={`/analytics/company/${c}`} prefetch={false} className="hover:text-ds-accent">{cust[c]?.name || c}</Link></td>
                      <td className="text-[12px] text-ds-fg2" title={cust[c]?.type}>{cust[c]?.type}</td>
                      <td className={cust[c]?.linked ? '' : 'muted'}>{cust[c]?.inflow}</td><td className="text-[12px] text-ds-fg2" title={cust[c]?.topic}>{cust[c]?.topic}</td>
                      <td className="num font-medium">{man(v)}</td><td className="num">{drawerTotal ? `${Math.round(v / drawerTotal * 100)}%` : '—'}</td>
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
