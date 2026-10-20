'use client'

// 분석 > 고객 생애주기 > 유입 코호트: 유입월(또는 분기)별로 리드 수·도입 수·유입 후 N개월 누적 매출(공급가)
import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Loading } from '@/components/ui/loading'
import { toast } from 'sonner'
import { Info, ExternalLink } from 'lucide-react'
import { fetchLifecycle, fmtWon, fmtPct, type LifecycleRow } from '@/lib/lifecycle'

type Group = 'month' | 'quarter'
const groupKey = (m: string, g: Group) => (g === 'month' ? m : `${m.slice(0, 4)}-Q${Math.ceil(Number(m.slice(5, 7)) / 3)}`)

export default function CohortPage() {
  const [rows, setRows] = useState<LifecycleRow[]>([])
  const [loading, setLoading] = useState(true)
  const [group, setGroup] = useState<Group>('month')
  const [year, setYear] = useState<string>('all')
  const [channel, setChannel] = useState<string>('all')
  const [includeExisting, setIncludeExisting] = useState(false)
  const [open, setOpen] = useState<string | null>(null)

  useEffect(() => {
    fetchLifecycle().then(d => setRows(d.rows)).catch(e => toast.error(e.message)).finally(() => setLoading(false))
  }, [])

  const years = useMemo(() => Array.from(new Set(rows.map(r => r.inquiry_date.slice(0, 4)))).sort().reverse(), [rows])
  const channels = useMemo(() => Array.from(new Set(rows.map(r => r.inquiry_channel || '(미입력)'))).sort(), [rows])
  const filtered = useMemo(() => rows.filter(r =>
    (includeExisting || !r.existing_customer) && (year === 'all' || r.inquiry_date.startsWith(year)) && (channel === 'all' || (r.inquiry_channel || '(미입력)') === channel)
  ), [rows, includeExisting, year, channel])

  const cohorts = useMemo(() => {
    const m = new Map<string, LifecycleRow[]>()
    for (const r of filtered) { const k = groupKey(r.inquiry_month, group); if (!m.has(k)) m.set(k, []); m.get(k)!.push(r) }
    return Array.from(m.entries()).sort((a, b) => b[0].localeCompare(a[0])).map(([k, rs]) => {
      const won = rs.filter(r => r.won)
      // N개월 누적: 코호트의 모든 회사가 N개월을 지났을 때만 합산 (아니면 '-')
      const cum = (f: 'rev_1' | 'rev_3' | 'rev_6' | 'rev_12') => (rs.every(r => r[f] != null) ? rs.reduce((s, r) => s + (r[f] || 0), 0) : null)
      return { key: k, rows: rs, n: rs.length, won: won.length, rev_1: cum('rev_1'), rev_3: cum('rev_3'), rev_6: cum('rev_6'), rev_12: cum('rev_12'), total: rs.reduce((s, r) => s + r.rev_total, 0), withRev: rs.filter(r => r.rev_total > 0).length }
    })
  }, [filtered, group])

  const sum = (f: 'n' | 'won' | 'total' | 'withRev') => cohorts.reduce((s, c) => s + c[f], 0)
  const sel = cohorts.find(c => c.key === open)

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">유입 코호트</h1>
        <div className="flex items-center gap-2 flex-wrap text-sm">
          <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
            {(['month', 'quarter'] as Group[]).map(g => (
              <button key={g} onClick={() => { setGroup(g); setOpen(null) }} className={`px-2.5 py-1 text-xs font-medium rounded-md ${group === g ? 'bg-white shadow-sm' : 'text-text-secondary'}`}>{g === 'month' ? '월별' : '분기별'}</button>
            ))}
          </div>
          <select value={year} onChange={e => setYear(e.target.value)} className="input-base !py-1.5 !w-28 text-sm">
            <option value="all">전체 연도</option>{years.map(y => <option key={y} value={y}>{y}년 유입</option>)}
          </select>
          <select value={channel} onChange={e => setChannel(e.target.value)} className="input-base !py-1.5 !w-36 text-sm">
            <option value="all">전체 채널</option>{channels.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <label className="flex items-center gap-1.5 text-xs text-text-secondary cursor-pointer">
            <input type="checkbox" checked={includeExisting} onChange={e => setIncludeExisting(e.target.checked)} className="w-3 h-3" /> 기존 고객 포함
          </label>
        </div>
      </div>

      <div className="flex items-start gap-2 text-xs text-text-secondary bg-blue-50 border border-blue-100 rounded-lg px-3 py-2 mb-4">
        <Info className="w-3.5 h-3.5 mt-0.5 flex-shrink-0 text-blue-500" />
        <div>
          회사 단위입니다. 같은 회사의 여러 리드는 첫 리드의 유입월로 묶이고, 매출은 유입월부터의 공급가(VAT 제외) 합입니다.
          "N개월"은 유입월을 포함해 N개월 동안의 누적이고, 그 기간이 아직 안 지난 코호트는 "-"로 둡니다.
          유입 전에 이미 매출이 있던 회사(기존 고객)는 기본으로 뺍니다. 리드와 고객사가 연결되지 않은 회사는 매출 0으로 잡힙니다.
        </div>
      </div>

      {loading ? <Loading /> : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
            {[
              ['유입 회사', `${sum('n')}곳`], ['도입', `${sum('won')}곳 (${fmtPct(sum('won'), sum('n'))})`],
              ['매출 발생 회사', `${sum('withRev')}곳`], ['누적 매출 (공급가)', `${fmtWon(sum('total'))}원`],
            ].map(([k, v]) => <div key={k} className="card p-4"><p className="text-xs text-text-secondary mb-1">{k}</p><p className="text-lg font-bold">{v}</p></div>)}
          </div>

          <div className="card p-4 mb-4">
            <div className="table-container">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>유입{group === 'month' ? '월' : '분기'}</th><th className="text-right">회사</th><th className="text-right">도입</th><th className="text-right">도입률</th>
                    <th className="text-right">1개월</th><th className="text-right">3개월</th><th className="text-right">6개월</th><th className="text-right">12개월</th>
                    <th className="text-right">현재까지 누적</th><th className="text-right" title="누적 매출 ÷ 도입 회사">도입 회사당</th>
                  </tr>
                </thead>
                <tbody>
                  {cohorts.map(c => (
                    <tr key={c.key} onClick={() => setOpen(open === c.key ? null : c.key)} className={`cursor-pointer ${open === c.key ? 'bg-primary-50' : ''}`}>
                      <td className="font-medium">{c.key}</td>
                      <td className="text-right">{c.n}</td><td className="text-right">{c.won}</td><td className="text-right">{fmtPct(c.won, c.n)}</td>
                      <td className="text-right">{fmtWon(c.rev_1)}</td><td className="text-right">{fmtWon(c.rev_3)}</td><td className="text-right">{fmtWon(c.rev_6)}</td><td className="text-right">{fmtWon(c.rev_12)}</td>
                      <td className="text-right font-medium">{fmtWon(c.total)}</td>
                      <td className="text-right">{c.won ? fmtWon(c.total / c.won) : '-'}</td>
                    </tr>
                  ))}
                  <tr className="font-semibold bg-gray-50">
                    <td>합계</td><td className="text-right">{sum('n')}</td><td className="text-right">{sum('won')}</td><td className="text-right">{fmtPct(sum('won'), sum('n'))}</td>
                    <td colSpan={4}></td><td className="text-right">{fmtWon(sum('total'))}</td><td className="text-right">{sum('won') ? fmtWon(sum('total') / sum('won')) : '-'}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {sel && (
            <div className="card p-4">
              <p className="text-sm font-medium mb-2">{sel.key} 유입 회사 {sel.n}곳</p>
              <div className="table-container max-h-[520px] overflow-auto">
                <table className="data-table">
                  <thead><tr><th>회사</th><th>유입일</th><th>채널</th><th>업종</th><th>도입일</th><th className="text-right">소요일</th><th>서비스</th><th className="text-right">누적 매출</th><th className="text-right">리드</th></tr></thead>
                  <tbody>
                    {[...sel.rows].sort((a, b) => b.rev_total - a.rev_total).map(r => (
                      <tr key={r.key}>
                        <td className="font-medium">
                          {r.customer_id ? <Link href={`/customers/${r.customer_id}`} className="hover:text-primary-600">{r.company_name} <ExternalLink className="w-3 h-3 inline" /></Link> : <span>{r.company_name} <span className="text-[10px] text-text-tertiary">(고객 미연결)</span></span>}
                        </td>
                        <td className="whitespace-nowrap">{r.inquiry_date}</td><td>{r.inquiry_channel || '-'}</td><td>{r.industry || '-'}</td>
                        <td className="whitespace-nowrap">{r.converted_at || (r.won ? '도입(일자 없음)' : '-')}</td>
                        <td className="text-right">{r.days_to_convert ?? '-'}</td>
                        <td className="text-xs">{r.services.join(', ') || '-'}</td>
                        <td className="text-right font-medium">{fmtWon(r.rev_total)}</td>
                        <td className="text-right text-text-secondary">{r.lead_count}</td>
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
