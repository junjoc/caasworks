'use client'

// 분석 > 고객 생애주기 > 채널별 생애 가치: 첫 유입 채널별 회사 수 → 도입 → 누적 매출 → 회사당 매출 → 광고비 대비
import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Loading } from '@/components/ui/loading'
import { toast } from 'sonner'
import { Info, ExternalLink } from 'lucide-react'
import { fetchLifecycle, fmtWon, fmtPct, median, type LifecycleRow } from '@/lib/lifecycle'

export default function ChannelValuePage() {
  const [rows, setRows] = useState<LifecycleRow[]>([])
  const [adCost, setAdCost] = useState<Record<string, Record<string, number>>>({})
  const [loading, setLoading] = useState(true)
  const [year, setYear] = useState('all')
  const [sub, setSub] = useState(false) // 유입경로까지 나눠 보기
  const [includeExisting, setIncludeExisting] = useState(false)
  const [open, setOpen] = useState<string | null>(null)

  useEffect(() => { fetchLifecycle().then(d => { setRows(d.rows); setAdCost(d.ad_cost || {}) }).catch(e => toast.error(e.message)).finally(() => setLoading(false)) }, [])

  const years = useMemo(() => Array.from(new Set(rows.map(r => r.inquiry_date.slice(0, 4)))).sort().reverse(), [rows])
  const filtered = useMemo(() => rows.filter(r => (includeExisting || !r.existing_customer) && (year === 'all' || r.inquiry_date.startsWith(year))), [rows, includeExisting, year])
  const costOf = (channel: string) => { const c = adCost[channel]; if (!c) return 0; return year === 'all' ? Object.values(c).reduce((a, b) => a + b, 0) : (c[year] || 0) }

  const table = useMemo(() => {
    const m = new Map<string, LifecycleRow[]>()
    for (const r of filtered) { const k = sub ? `${r.inquiry_channel || '(미입력)'} › ${r.inquiry_source || '-'}` : (r.inquiry_channel || '(미입력)'); (m.get(k) || m.set(k, []).get(k)!).push(r) }
    return Array.from(m.entries()).map(([k, rs]) => {
      const won = rs.filter(r => r.won), rev = rs.reduce((s, r) => s + r.rev_total, 0)
      const cost = sub ? 0 : costOf(k)
      return { key: k, rows: rs, n: rs.length, won: won.length, rev, perWon: won.length ? rev / won.length : null, days: median(won.map(r => r.days_to_convert).filter((d): d is number => d != null)), cost, roas: cost ? rev / cost : null }
    }).sort((a, b) => b.rev - a.rev)
  }, [filtered, sub, adCost, year])
  const tot = { n: table.reduce((s, t) => s + t.n, 0), won: table.reduce((s, t) => s + t.won, 0), rev: table.reduce((s, t) => s + t.rev, 0), cost: table.reduce((s, t) => s + t.cost, 0) }
  const sel = table.find(t => t.key === open)

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">채널별 생애 가치</h1>
        <div className="flex items-center gap-2 flex-wrap text-sm">
          <select value={year} onChange={e => { setYear(e.target.value); setOpen(null) }} className="input-base !py-1.5 !w-28 text-sm">
            <option value="all">전체 연도</option>{years.map(y => <option key={y} value={y}>{y}년 유입</option>)}
          </select>
          <label className="flex items-center gap-1.5 text-xs text-text-secondary cursor-pointer"><input type="checkbox" checked={sub} onChange={e => { setSub(e.target.checked); setOpen(null) }} className="w-3 h-3" /> 유입경로까지</label>
          <label className="flex items-center gap-1.5 text-xs text-text-secondary cursor-pointer"><input type="checkbox" checked={includeExisting} onChange={e => setIncludeExisting(e.target.checked)} className="w-3 h-3" /> 기존 고객 포함</label>
        </div>
      </div>
      <div className="flex items-start gap-2 text-xs text-text-secondary bg-blue-50 border border-blue-100 rounded-lg px-3 py-2 mb-4">
        <Info className="w-3.5 h-3.5 mt-0.5 flex-shrink-0 text-blue-500" />
        <div>첫 리드의 유입 채널 기준입니다. 매출은 유입 이후 공급가 누적. 광고비는 광고 성과에 입력된 그 채널의 비용(선택 연도 기준)이고, 광고비가 없는 채널은 "매출/광고비"를 비우지 않고 "-"로 둡니다. 유입 당시 비용(2023~2025)이 광고 성과에 없으면 광고비가 실제보다 작게 보입니다.</div>
      </div>
      {loading ? <Loading /> : (
        <>
          <div className="card p-4 mb-4">
            <div className="table-container">
              <table className="data-table">
                <thead><tr><th>채널{sub ? ' › 유입경로' : ''}</th><th className="text-right">회사</th><th className="text-right">도입</th><th className="text-right">도입률</th><th className="text-right">소요일 중앙값</th><th className="text-right">누적 매출</th><th className="text-right">도입 회사당</th><th className="text-right">광고비</th><th className="text-right" title="누적 매출 ÷ 광고비">매출/광고비</th></tr></thead>
                <tbody>
                  {table.map(t => (
                    <tr key={t.key} onClick={() => setOpen(open === t.key ? null : t.key)} className={`cursor-pointer ${open === t.key ? 'bg-primary-50' : ''}`}>
                      <td className="font-medium">{t.key}</td><td className="text-right">{t.n}</td><td className="text-right">{t.won}</td><td className="text-right">{fmtPct(t.won, t.n)}</td>
                      <td className="text-right">{t.days != null ? `${t.days}일` : '-'}</td><td className="text-right font-medium">{fmtWon(t.rev)}</td><td className="text-right">{fmtWon(t.perWon)}</td>
                      <td className="text-right">{t.cost ? fmtWon(t.cost) : '-'}</td><td className="text-right">{t.roas != null ? `${t.roas.toFixed(1)}배` : '-'}</td>
                    </tr>
                  ))}
                  <tr className="font-semibold bg-gray-50"><td>합계</td><td className="text-right">{tot.n}</td><td className="text-right">{tot.won}</td><td className="text-right">{fmtPct(tot.won, tot.n)}</td><td></td><td className="text-right">{fmtWon(tot.rev)}</td><td className="text-right">{tot.won ? fmtWon(tot.rev / tot.won) : '-'}</td><td className="text-right">{tot.cost ? fmtWon(tot.cost) : '-'}</td><td className="text-right">{tot.cost ? `${(tot.rev / tot.cost).toFixed(1)}배` : '-'}</td></tr>
                </tbody>
              </table>
            </div>
          </div>
          {sel && (
            <div className="card p-4">
              <p className="text-sm font-medium mb-2">{sel.key} — {sel.n}곳</p>
              <div className="table-container max-h-[480px] overflow-auto">
                <table className="data-table">
                  <thead><tr><th>회사</th><th>유입일</th><th>유입경로</th><th>도입일</th><th className="text-right">소요일</th><th>서비스</th><th className="text-right">누적 매출</th></tr></thead>
                  <tbody>
                    {[...sel.rows].sort((a, b) => b.rev_total - a.rev_total).map(r => (
                      <tr key={r.key}>
                        <td className="font-medium">{r.customer_id ? <Link href={`/analytics/company/${r.customer_id}`} className="hover:text-primary-600">{r.company_name} <ExternalLink className="w-3 h-3 inline" /></Link> : r.company_name}</td>
                        <td className="whitespace-nowrap">{r.inquiry_date}</td><td>{r.inquiry_source || '-'}</td><td className="whitespace-nowrap">{r.converted_at || (r.won ? '도입' : '-')}</td><td className="text-right">{r.days_to_convert ?? '-'}</td>
                        <td className="text-xs">{r.services.join(', ') || '-'}</td><td className="text-right font-medium">{fmtWon(r.rev_total)}</td>
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
