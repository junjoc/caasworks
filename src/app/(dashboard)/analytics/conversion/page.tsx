'use client'

// 분석 > 세일즈 > 전환 소요 기간: 유입일 → 도입일 구간별 건수·평균·매출, 축(발주유형/업종/서비스/채널/담당자/도입가능성)별로 비교
import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Loading } from '@/components/ui/loading'
import { toast } from 'sonner'
import { Info, ExternalLink } from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'
import { fetchLifecycle, fmtWon, BUCKETS, bucketOf, AXES, axisValues, median, type AxisKey, type LifecycleRow } from '@/lib/lifecycle'

export default function ConversionPage() {
  const [rows, setRows] = useState<LifecycleRow[]>([])
  const [loading, setLoading] = useState(true)
  const [axis, setAxis] = useState<AxisKey>('inquiry_channel')
  const [year, setYear] = useState('all')
  const [includeExisting, setIncludeExisting] = useState(false)
  const [sel, setSel] = useState<{ axis: string; bucket: string } | null>(null)

  useEffect(() => { fetchLifecycle().then(d => setRows(d.rows)).catch(e => toast.error(e.message)).finally(() => setLoading(false)) }, [])

  const years = useMemo(() => Array.from(new Set(rows.map(r => r.inquiry_date.slice(0, 4)))).sort().reverse(), [rows])
  // 도입완료 + 도입일 있는 회사만 (소요 기간을 알 수 있는 건)
  const won = useMemo(() => rows.filter(r => r.won && r.days_to_convert != null && (includeExisting || !r.existing_customer) && (year === 'all' || r.inquiry_date.startsWith(year))), [rows, includeExisting, year])
  const noDate = useMemo(() => rows.filter(r => r.won && r.days_to_convert == null && (year === 'all' || r.inquiry_date.startsWith(year))).length, [rows, year])

  const overall = useMemo(() => ({
    n: won.length, median: median(won.map(r => r.days_to_convert!)), avg: won.length ? won.reduce((s, r) => s + r.days_to_convert!, 0) / won.length : null,
    buckets: BUCKETS.map(b => { const rs = won.filter(r => bucketOf(r.days_to_convert!) === b.key); return { ...b, n: rs.length, rev: rs.reduce((s, r) => s + r.rev_total, 0) } }),
  }), [won])

  // 축 × 구간
  const matrix = useMemo(() => {
    const m = new Map<string, Record<string, LifecycleRow[]>>()
    for (const r of won) for (const v of axisValues(r, axis)) {
      if (!m.has(v)) m.set(v, {})
      const b = bucketOf(r.days_to_convert!)
      ;(m.get(v)![b] ||= []).push(r)
    }
    return Array.from(m.entries()).map(([v, byB]) => {
      const all = Object.values(byB).flat()
      return { value: v, byB, n: all.length, median: median(all.map(r => r.days_to_convert!)), rev: all.reduce((s, r) => s + r.rev_total, 0) }
    }).sort((a, b) => b.n - a.n)
  }, [won, axis])

  const selRows = sel ? (sel.axis === '*' ? won.filter(r => bucketOf(r.days_to_convert!) === sel.bucket) : (matrix.find(m => m.value === sel.axis)?.byB[sel.bucket] || [])) : []
  const axisLabel = AXES.find(a => a.key === axis)!.label

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">전환 소요 기간</h1>
        <div className="flex items-center gap-2 flex-wrap text-sm">
          <select value={axis} onChange={e => { setAxis(e.target.value as AxisKey); setSel(null) }} className="input-base !py-1.5 !w-44 text-sm">
            {AXES.map(a => <option key={a.key} value={a.key}>{a.label}</option>)}
          </select>
          <select value={year} onChange={e => { setYear(e.target.value); setSel(null) }} className="input-base !py-1.5 !w-28 text-sm">
            <option value="all">전체 연도</option>{years.map(y => <option key={y} value={y}>{y}년 유입</option>)}
          </select>
          <label className="flex items-center gap-1.5 text-xs text-text-secondary cursor-pointer">
            <input type="checkbox" checked={includeExisting} onChange={e => setIncludeExisting(e.target.checked)} className="w-3 h-3" /> 기존 고객 포함
          </label>
        </div>
      </div>

      <div className="flex items-start gap-2 text-xs text-text-secondary bg-blue-50 border border-blue-100 rounded-lg px-3 py-2 mb-4">
        <Info className="w-3.5 h-3.5 mt-0.5 flex-shrink-0 text-blue-500" />
        <div>
          소요 기간 = 첫 리드 유입일 → 도입일. 도입일은 단계 변경 이력이 있으면 그 날짜, 없으면 고객사 과금 시작일입니다. 매출은 유입 이후 공급가 누적.
          칸을 누르면 그 회사들이 아래에 나옵니다. {noDate > 0 && <span className="text-orange-600">도입일을 모르는 도입 회사 {noDate}곳은 제외됩니다.</span>}
        </div>
      </div>

      {loading ? <Loading /> : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
            <div className="card p-4"><p className="text-xs text-text-secondary mb-1">도입 회사 (소요일 있음)</p><p className="text-lg font-bold">{overall.n}곳</p></div>
            <div className="card p-4"><p className="text-xs text-text-secondary mb-1">소요일 중앙값</p><p className="text-lg font-bold">{overall.median ?? '-'}일</p></div>
            <div className="card p-4"><p className="text-xs text-text-secondary mb-1">소요일 평균</p><p className="text-lg font-bold">{overall.avg != null ? overall.avg.toFixed(0) : '-'}일</p></div>
            <div className="card p-4"><p className="text-xs text-text-secondary mb-1">누적 매출 (공급가)</p><p className="text-lg font-bold">{fmtWon(won.reduce((s, r) => s + r.rev_total, 0))}원</p></div>
          </div>

          <div className="grid lg:grid-cols-2 gap-4 mb-4">
            <div className="card p-4">
              <p className="text-sm font-medium mb-2">구간별 도입 회사 수</p>
              <div className="h-52">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={overall.buckets} margin={{ left: 0, right: 10, top: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
                    <XAxis dataKey="label" tick={{ fontSize: 11 }} /><YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                    <Tooltip formatter={(v: number) => `${v}곳`} />
                    <Bar dataKey="n" fill="#60a5fa" radius={[3, 3, 0, 0]} onClick={(d: { key: string }) => setSel({ axis: '*', bucket: d.key })} cursor="pointer" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
            <div className="card p-4">
              <p className="text-sm font-medium mb-2">구간별 누적 매출</p>
              <div className="table-container">
                <table className="data-table">
                  <thead><tr><th>구간</th><th className="text-right">회사</th><th className="text-right">비중</th><th className="text-right">누적 매출</th><th className="text-right">회사당</th></tr></thead>
                  <tbody>
                    {overall.buckets.map(b => (
                      <tr key={b.key} onClick={() => setSel({ axis: '*', bucket: b.key })} className={`cursor-pointer ${sel?.axis === '*' && sel.bucket === b.key ? 'bg-primary-50' : ''}`}>
                        <td>{b.label}</td><td className="text-right">{b.n}</td><td className="text-right">{overall.n ? `${(b.n / overall.n * 100).toFixed(0)}%` : '-'}</td>
                        <td className="text-right font-medium">{fmtWon(b.rev)}</td><td className="text-right">{b.n ? fmtWon(b.rev / b.n) : '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <div className="card p-4 mb-4">
            <p className="text-sm font-medium mb-2">{axisLabel}별 소요 기간 <span className="text-text-tertiary font-normal">(칸: 회사 수 / 누적 매출)</span></p>
            <div className="table-container">
              <table className="data-table">
                <thead>
                  <tr><th>{axisLabel}</th><th className="text-right">회사</th><th className="text-right">중앙값</th>{BUCKETS.map(b => <th key={b.key} className="text-right">{b.label}</th>)}<th className="text-right">누적 매출</th></tr>
                </thead>
                <tbody>
                  {matrix.map(m => (
                    <tr key={m.value}>
                      <td className="font-medium">{m.value}</td><td className="text-right">{m.n}</td><td className="text-right">{m.median ?? '-'}일</td>
                      {BUCKETS.map(b => { const rs = m.byB[b.key] || []; const active = sel?.axis === m.value && sel.bucket === b.key
                        return <td key={b.key} onClick={() => rs.length && setSel({ axis: m.value, bucket: b.key })} className={`text-right ${rs.length ? 'cursor-pointer hover:bg-gray-50' : 'text-text-tertiary'} ${active ? 'bg-primary-50' : ''}`}>
                          {rs.length ? <>{rs.length} <span className="text-[10px] text-text-tertiary">/ {fmtWon(rs.reduce((s, r) => s + r.rev_total, 0))}</span></> : '-'}
                        </td> })}
                      <td className="text-right font-medium">{fmtWon(m.rev)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {axis === 'service' && <p className="text-[11px] text-text-tertiary mt-2">서비스가 여러 개인 회사는 각 서비스 줄에 모두 들어갑니다 (회사 수 합이 전체보다 클 수 있음).</p>}
          </div>

          {sel && (
            <div className="card p-4">
              <p className="text-sm font-medium mb-2">{sel.axis === '*' ? '전체' : sel.axis} · {BUCKETS.find(b => b.key === sel.bucket)?.label} — {selRows.length}곳, 누적 매출 {fmtWon(selRows.reduce((s, r) => s + r.rev_total, 0))}원</p>
              <div className="table-container max-h-[480px] overflow-auto">
                <table className="data-table">
                  <thead><tr><th>회사</th><th>유입일</th><th>도입일</th><th className="text-right">소요일</th><th>채널</th><th>업종</th><th>발주유형</th><th>서비스</th><th>담당자</th><th className="text-right">누적 매출</th></tr></thead>
                  <tbody>
                    {[...selRows].sort((a, b) => a.days_to_convert! - b.days_to_convert!).map(r => (
                      <tr key={r.key}>
                        <td className="font-medium">{r.customer_id ? <Link href={`/customers/${r.customer_id}`} className="hover:text-primary-600">{r.company_name} <ExternalLink className="w-3 h-3 inline" /></Link> : r.company_name}</td>
                        <td className="whitespace-nowrap">{r.inquiry_date}</td><td className="whitespace-nowrap">{r.converted_at}</td><td className="text-right">{r.days_to_convert}</td>
                        <td>{r.inquiry_channel || '-'}</td><td>{r.industry || '-'}</td><td>{r.site_category || '-'}</td><td className="text-xs">{r.services.join(', ') || '-'}</td><td>{r.assigned_to || '-'}</td>
                        <td className="text-right font-medium">{fmtWon(r.rev_total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
