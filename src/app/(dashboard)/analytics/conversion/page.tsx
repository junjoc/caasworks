'use client'

// 분석 > 세일즈 > 전환 소요 기간 (디자인 정의 v1 시범 적용)
// 유입일 → 도입일 구간별 회사 수·매출, 축(채널/발주유형/업종/서비스/담당자/도입가능성/고객 타입)별 비교. 칸 클릭 → 회사 목록
import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import { fetchLifecycle, fmtWon, BUCKETS, bucketOf, AXES, axisValues, median, type AxisKey, type LifecycleRow } from '@/lib/lifecycle'
import { PageHeader, Toolbar, DsSelect, Check, Skeleton, Empty, SectionTitle, Avatar } from '@/components/ds'

export default function ConversionPage() {
  const [rows, setRows] = useState<LifecycleRow[]>([])
  const [loading, setLoading] = useState(true)
  const [axis, setAxis] = useState<AxisKey>('inquiry_channel')
  const [year, setYear] = useState('all')
  const [includeExisting, setIncludeExisting] = useState(false)
  const [sel, setSel] = useState<{ axis: string; bucket: string } | null>(null)

  useEffect(() => { fetchLifecycle().then(d => setRows(d.rows)).catch(e => toast.error(e.message)).finally(() => setLoading(false)) }, [])

  const years = useMemo(() => Array.from(new Set(rows.map(r => r.inquiry_date.slice(0, 4)))).sort().reverse(), [rows])
  const won = useMemo(() => rows.filter(r => r.won && r.days_to_convert != null && (includeExisting || !r.existing_customer) && (year === 'all' || r.inquiry_date.startsWith(year))), [rows, includeExisting, year])
  const noDate = useMemo(() => rows.filter(r => r.won && r.days_to_convert == null && (year === 'all' || r.inquiry_date.startsWith(year))).length, [rows, year])
  const buckets = useMemo(() => BUCKETS.map(b => { const rs = won.filter(r => bucketOf(r.days_to_convert!) === b.key); return { ...b, n: rs.length, rev: rs.reduce((s, r) => s + r.rev_total, 0) } }), [won])
  const matrix = useMemo(() => {
    const m = new Map<string, Record<string, LifecycleRow[]>>()
    for (const r of won) for (const v of axisValues(r, axis)) { if (!m.has(v)) m.set(v, {}); (m.get(v)![bucketOf(r.days_to_convert!)] ||= []).push(r) }
    return Array.from(m.entries()).map(([v, byB]) => { const all = Object.values(byB).flat(); return { value: v, byB, n: all.length, median: median(all.map(r => r.days_to_convert!)), rev: all.reduce((s, r) => s + r.rev_total, 0) } }).sort((a, b) => b.n - a.n)
  }, [won, axis])
  const selRows = sel ? (sel.axis === '*' ? won.filter(r => bucketOf(r.days_to_convert!) === sel.bucket) : (matrix.find(m => m.value === sel.axis)?.byB[sel.bucket] || [])) : []
  const axisLabel = AXES.find(a => a.key === axis)!.label
  const med = median(won.map(r => r.days_to_convert!))
  const maxN = Math.max(1, ...buckets.map(b => b.n))

  return (
    <div>
      <PageHeader title="전환 소요 기간"
        kpis={[{ label: '도입 회사', value: won.length }, { label: '소요일 중앙값', value: med != null ? `${med}일` : '—' }, { label: '평균', value: won.length ? `${(won.reduce((s, r) => s + r.days_to_convert!, 0) / won.length).toFixed(0)}일` : '—' }, { label: '누적 매출', value: `${fmtWon(won.reduce((s, r) => s + r.rev_total, 0))}원` }]}
        subtitle={<>소요 기간 = 첫 리드 유입일 → 도입일(단계 이력, 없으면 고객사 과금 시작일) · 매출은 유입 이후 공급가 누적 · 칸을 누르면 그 회사들이 아래에{noDate > 0 && <> · <span className="text-ds-warn">도입일을 모르는 {noDate}곳 제외</span></>}</>} />
      <Toolbar right={<>
        <DsSelect value={year} onChange={e => { setYear(e.target.value); setSel(null) }}><option value="all">전체 연도</option>{years.map(y => <option key={y} value={y}>{y}년 유입</option>)}</DsSelect>
        <Check label="기존 고객 포함" checked={includeExisting} onChange={setIncludeExisting} />
      </>}>
        <span className="text-[12px] text-ds-fg2">축</span>
        <DsSelect value={axis} onChange={e => { setAxis(e.target.value as AxisKey); setSel(null) }}>{AXES.map(a => <option key={a.key} value={a.key}>{a.label}</option>)}</DsSelect>
      </Toolbar>

      {loading ? <Skeleton rows={8} /> : won.length === 0 ? <Empty text="소요일을 알 수 있는 도입 회사가 없습니다" /> : (
        <>
          {/* 구간 요약: 막대는 inline, 차트 라이브러리 없이 */}
          <div className="ds-wrap mb-6">
            <table className="ds-table is-clickable">
              <thead><tr><th>구간</th><th className="num">회사</th><th className="num">비중</th><th style={{ width: 220 }}></th><th className="num">누적 매출</th><th className="num">회사당</th></tr></thead>
              <tbody>
                {buckets.map(b => (
                  <tr key={b.key} className={`ds-row ${sel?.axis === '*' && sel.bucket === b.key ? 'is-active' : ''}`} onClick={() => setSel({ axis: '*', bucket: b.key })}>
                    <td className="font-medium">{b.label}</td><td className="num">{b.n}</td><td className="num">{won.length ? `${(b.n / won.length * 100).toFixed(0)}%` : '—'}</td>
                    <td><div className="h-2 rounded-sm bg-ds-info" style={{ width: `${b.n / maxN * 100}%`, minWidth: b.n ? 4 : 0 }} /></td>
                    <td className="num font-medium">{fmtWon(b.rev)}</td><td className="num">{b.n ? fmtWon(b.rev / b.n) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <SectionTitle>{axisLabel}별 소요 기간 <span className="text-ds-fg3 font-normal text-[12px]">칸: 회사 수 / 누적 매출</span></SectionTitle>
          <div className="ds-wrap">
            <table className="ds-table">
              <thead><tr><th>{axisLabel}</th><th className="num">회사</th><th className="num">중앙값</th>{BUCKETS.map(b => <th key={b.key} className="num">{b.label}</th>)}<th className="num">누적 매출</th></tr></thead>
              <tbody>
                {matrix.map(m => (
                  <tr key={m.value} className="ds-row">
                    <td className="font-medium">{m.value}</td><td className="num">{m.n}</td><td className="num">{m.median ?? '—'}일</td>
                    {BUCKETS.map(b => { const rs = m.byB[b.key] || []; const active = sel?.axis === m.value && sel.bucket === b.key
                      return <td key={b.key} onClick={() => rs.length && setSel({ axis: m.value, bucket: b.key })} className={`num ${rs.length ? 'cursor-pointer' : 'muted'} ${active ? '!bg-ds-accent-soft' : ''}`}>
                        {rs.length ? <>{rs.length} <span className="text-[11px] text-ds-fg3">/ {fmtWon(rs.reduce((s, r) => s + r.rev_total, 0))}</span></> : '—'}
                      </td> })}
                    <td className="num font-medium">{fmtWon(m.rev)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {axis === 'service' && <p className="text-[11px] text-ds-fg3 mt-1.5">서비스가 여러 개인 회사는 각 서비스 줄에 모두 들어갑니다.</p>}

          {sel && (
            <>
              <SectionTitle>{sel.axis === '*' ? '전체' : sel.axis} · {BUCKETS.find(b => b.key === sel.bucket)?.label} — {selRows.length}곳, 누적 매출 {fmtWon(selRows.reduce((s, r) => s + r.rev_total, 0))}원</SectionTitle>
              <div className="ds-wrap max-h-[480px] overflow-auto">
                <table className="ds-table">
                  <thead><tr><th>회사</th><th>유입일</th><th>도입일</th><th className="num">소요일</th><th>채널</th><th>업종</th><th>발주유형</th><th>서비스</th><th>담당</th><th className="num">누적 매출</th></tr></thead>
                  <tbody>
                    {[...selRows].sort((a, b) => a.days_to_convert! - b.days_to_convert!).map(r => (
                      <tr key={r.key} className="ds-row">
                        <td className="font-medium">{r.customer_id ? <Link href={`/analytics/company/${r.customer_id}`} className="hover:text-ds-accent">{r.company_name}</Link> : r.company_name}</td>
                        <td className="muted">{r.inquiry_date}</td><td className="muted">{r.converted_at}</td><td className="num">{r.days_to_convert}</td>
                        <td className="muted">{r.inquiry_channel || '—'}</td><td>{r.industry || '—'}</td><td>{r.site_category || '—'}</td><td className="text-[12px] text-ds-fg2">{r.services.join(', ') || '—'}</td><td><Avatar name={r.assigned_to} /></td>
                        <td className="num font-medium">{fmtWon(r.rev_total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </>
      )}
    </div>
  )
}
