'use client'

// 마케팅 > 연간 비교: 2023~2026.4 현황표(시트 업로드) + 2026.5~ CRM 데이터를 같은 월 요약으로 놓고 연도별 비교
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Loading } from '@/components/ui/loading'
import { EmptyState } from '@/components/ui/empty-state'
import { formatNumber } from '@/lib/utils'
import { toast } from 'sonner'
import { Upload, Info, CheckCircle2, XCircle, BarChart3 } from 'lucide-react'
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend,
} from 'recharts'

interface MonthRow {
  year: number; month: number
  cost_google: number; cost_meta: number; cost_naver: number; cost_other: number; cost_total: number
  budget_total: number | null
  signups: number | null; inquiries_paid: number | null; inquiries_viral: number | null; inquiries: number | null
  adoptions: number | null; meetings: number | null; revenue: number | null
  source: string
}
interface ChannelRow { year: number; month: number; ad_type: string; channel: string; campaign: string | null; cost: number; impressions: number; clicks: number; inquiries: number | null; adoptions: number | null }
interface UploadResult { file: string; ok: boolean; message: string; warnings?: string[] }

type Metric = 'cost_total' | 'inquiries' | 'adoptions' | 'cpl' | 'cpa'
const METRICS: { key: Metric; label: string; fmt: (v: number) => string }[] = [
  { key: 'cost_total', label: '광고비', fmt: v => `${formatNumber(Math.round(v))}원` },
  { key: 'inquiries', label: '문의', fmt: v => `${formatNumber(v)}건` },
  { key: 'adoptions', label: '도입', fmt: v => `${formatNumber(v)}건` },
  { key: 'cpl', label: '문의당 광고비', fmt: v => `${formatNumber(Math.round(v))}원` },
  { key: 'cpa', label: '도입당 광고비', fmt: v => `${formatNumber(Math.round(v))}원` },
]
const YEAR_COLORS = ['#94a3b8', '#60a5fa', '#f59e0b', '#22c55e', '#a855f7', '#ef4444']
const won = (v: number | null | undefined) => (v == null ? '-' : `${formatNumber(Math.round(v))}`)
const pct = (cur: number | null, prev: number | null) => (cur == null || !prev ? null : (cur - prev) / prev)
const Delta = ({ v }: { v: number | null }) => v == null ? <span className="text-text-tertiary">-</span>
  : <span className={v > 0 ? 'text-red-600' : v < 0 ? 'text-blue-600' : 'text-text-tertiary'}>{v > 0 ? '+' : ''}{(v * 100).toFixed(0)}%</span>
const metricOf = (r: { cost_total: number; inquiries: number | null; adoptions: number | null }, m: Metric): number | null => {
  if (m === 'cost_total') return r.cost_total
  if (m === 'inquiries') return r.inquiries
  if (m === 'adoptions') return r.adoptions
  if (m === 'cpl') return r.inquiries ? r.cost_total / r.inquiries : null
  return r.adoptions ? r.cost_total / r.adoptions : null
}

export default function MarketingHistoryPage() {
  const supabase = createClient()
  const [loading, setLoading] = useState(true)
  const [sheetRows, setSheetRows] = useState<MonthRow[]>([])
  const [crmRows, setCrmRows] = useState<MonthRow[]>([])
  const [crmFrom, setCrmFrom] = useState<string | null>(null)
  const [channelRows, setChannelRows] = useState<ChannelRow[]>([])
  const [metric, setMetric] = useState<Metric>('cost_total')
  const [year, setYear] = useState<number>(new Date().getFullYear())
  const [uploading, setUploading] = useState(false)
  const [results, setResults] = useState<UploadResult[]>([])
  const fileRef = useRef<HTMLInputElement>(null)

  const fetchAll = useCallback(async () => {
    setLoading(true)
    try {
      const { data: s, error } = await supabase.from('marketing_monthly_history').select('*').order('year').order('month')
      if (error) throw error
      const sheet = (s || []).map(r => ({ ...r, cost_google: +r.cost_google, cost_meta: +r.cost_meta, cost_naver: +r.cost_naver, cost_other: +r.cost_other, cost_total: +r.cost_total })) as MonthRow[]
      setSheetRows(sheet)
      // CRM 구간: 시트의 마지막 달 다음 달부터
      const last = sheet[sheet.length - 1]
      const from = last ? `${last.month === 12 ? last.year + 1 : last.year}-${String(last.month === 12 ? 1 : last.month + 1).padStart(2, '0')}-01` : '2026-05-01'
      setCrmFrom(from)
      const res = await fetch(`/api/marketing/history/crm?from=${from}`)
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'CRM 집계 실패')
      setCrmRows(json.rows || [])
      let ch: ChannelRow[] = []
      for (let off = 0; ; off += 1000) {
        const { data: c, error: e } = await supabase.from('marketing_monthly_channel_history')
          .select('year, month, ad_type, channel, campaign, cost, impressions, clicks, inquiries, adoptions').order('year').order('month').range(off, off + 999)
        if (e) throw e
        ch = ch.concat((c || []).map(r => ({ ...r, cost: +r.cost })))
        if (!c || c.length < 1000) break
      }
      setChannelRows(ch)
    } catch (e) {
      toast.error('불러오기 실패: ' + (e as { message?: string }).message)
    }
    setLoading(false)
  }, [])
  useEffect(() => { fetchAll() }, [fetchAll])

  async function handleUpload(files: FileList | null) {
    if (!files?.length) return
    setUploading(true); setResults([])
    try {
      const fd = new FormData()
      Array.from(files).forEach(f => fd.append('files', f))
      const res = await fetch('/api/marketing/history/upload', { method: 'POST', body: fd })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || '업로드 실패')
      const rs: UploadResult[] = json.results || []
      setResults(rs)
      const ok = rs.filter(r => r.ok).length
      if (ok === rs.length) toast.success(`${ok}개 파일 저장 완료`); else toast.error(`${rs.length}개 중 ${rs.length - ok}개 실패`)
      fetchAll()
    } catch (e) { toast.error((e as Error).message) }
    setUploading(false)
    if (fileRef.current) fileRef.current.value = ''
  }

  // 시트 + CRM 합치기 (같은 달이 둘 다 있으면 시트 우선)
  const rows = useMemo(() => {
    const m = new Map<string, MonthRow>()
    for (const r of crmRows) m.set(`${r.year}-${r.month}`, r)
    for (const r of sheetRows) m.set(`${r.year}-${r.month}`, r)
    return Array.from(m.values()).sort((a, b) => a.year - b.year || a.month - b.month)
  }, [sheetRows, crmRows])
  const years = useMemo(() => Array.from(new Set(rows.map(r => r.year))).sort(), [rows])
  useEffect(() => { if (years.length && !years.includes(year)) setYear(years[years.length - 1]) }, [years, year])

  // 연도별 합계
  const yearly = useMemo(() => years.map(y => {
    const rs = rows.filter(r => r.year === y)
    const sum = (k: keyof MonthRow) => rs.reduce((a, r) => a + (Number(r[k]) || 0), 0)
    const has = (k: keyof MonthRow) => rs.some(r => r[k] != null)
    return {
      year: y, months: rs.length, cost_total: sum('cost_total'), cost_google: sum('cost_google'), cost_naver: sum('cost_naver'), cost_meta: sum('cost_meta'), cost_other: sum('cost_other'),
      inquiries: has('inquiries') ? sum('inquiries') : null, adoptions: has('adoptions') ? sum('adoptions') : null,
      signups: has('signups') ? sum('signups') : null, meetings: has('meetings') ? sum('meetings') : null,
      crmMonths: rs.filter(r => r.source === 'crm').length,
    }
  }), [rows, years])

  // 월별 추이 (연도별 선)
  const trend = useMemo(() => Array.from({ length: 12 }, (_, i) => {
    const o: Record<string, number | string | null> = { month: `${i + 1}월` }
    for (const y of years) { const r = rows.find(x => x.year === y && x.month === i + 1); o[String(y)] = r ? metricOf(r, metric) : null }
    return o
  }), [rows, years, metric])

  const yearRows = rows.filter(r => r.year === year)
  const prevYearRows = rows.filter(r => r.year === year - 1)
  const yearChannels = useMemo(() => {
    const m = new Map<string, { ad_type: string; channel: string; cost: number; impressions: number; clicks: number; inquiries: number; adoptions: number }>()
    for (const c of channelRows.filter(c => c.year === year)) {
      const k = `${c.ad_type}|${c.channel}`
      const v = m.get(k) || { ad_type: c.ad_type, channel: c.channel, cost: 0, impressions: 0, clicks: 0, inquiries: 0, adoptions: 0 }
      v.cost += c.cost; v.impressions += c.impressions; v.clicks += c.clicks; v.inquiries += c.inquiries || 0; v.adoptions += c.adoptions || 0
      m.set(k, v)
    }
    return Array.from(m.values()).filter(v => v.cost || v.inquiries || v.adoptions).sort((a, b) => b.cost - a.cost)
  }, [channelRows, year])
  const fmt = METRICS.find(m => m.key === metric)!.fmt

  const uploadBox = (
    <div className="card p-4 mb-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <p className="text-sm font-medium">연간 현황표 업로드</p>
          <p className="text-xs text-text-secondary mt-0.5">구글 시트 "N년 마케팅 현황"을 xlsx 로 내려받아 올리세요 (연도별 파일, 여러 개 가능). 같은 연도를 다시 올리면 그 연도 데이터가 바뀝니다.</p>
        </div>
        <input ref={fileRef} type="file" accept=".xlsx,.xls" multiple className="hidden" onChange={e => handleUpload(e.target.files)} />
        <Button size="sm" onClick={() => fileRef.current?.click()} loading={uploading}><Upload className="w-3.5 h-3.5 mr-1" /> 엑셀 업로드</Button>
      </div>
      {results.length > 0 && (
        <ul className="mt-3 space-y-1 text-xs">
          {results.map(r => (
            <li key={r.file}>
              <div className="flex items-start gap-1.5">
                {r.ok ? <CheckCircle2 className="w-3.5 h-3.5 text-green-600 flex-shrink-0 mt-px" /> : <XCircle className="w-3.5 h-3.5 text-red-500 flex-shrink-0 mt-px" />}
                <span className="text-text-secondary">{r.file}</span><span className={r.ok ? '' : 'text-red-600'}>— {r.message}</span>
              </div>
              {r.warnings?.map(w => <div key={w} className="ml-5 text-text-tertiary">· {w}</div>)}
            </li>
          ))}
        </ul>
      )}
    </div>
  )

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title flex items-center gap-2"><BarChart3 className="w-6 h-6" /> 마케팅 연간 비교</h1>
        {years.length > 0 && (
          <label className="flex items-center gap-2 text-sm">
            <span className="text-text-secondary">상세 연도</span>
            <select value={year} onChange={e => setYear(Number(e.target.value))} className="input-base !py-1.5 !w-28 text-sm">
              {years.map(y => <option key={y} value={y}>{y}년</option>)}
            </select>
          </label>
        )}
      </div>
      {uploadBox}
      <div className="flex items-start gap-2 text-xs text-text-secondary bg-blue-50 border border-blue-100 rounded-lg px-3 py-2 mb-4">
        <Info className="w-3.5 h-3.5 mt-0.5 flex-shrink-0 text-blue-500" />
        <div>
          광고비는 실 집행비(구글·네이버·메타/유튜브·기타), 문의는 유료광고+바이럴 합계입니다. {crmFrom && <>CRM 전환 이후(<span className="font-medium text-text-primary">{crmFrom.slice(0, 7)}~</span>)는 시트 대신 CRM 의 광고성과(비용)와 파이프라인(문의일 기준 문의, 도입완료일 기준 도입)으로 계산합니다.</>}
          가입수·미팅수는 연도에 따라 없을 수 있어 비워 둡니다.
        </div>
      </div>

      {loading ? <Loading /> : rows.length === 0 ? (
        <EmptyState icon={BarChart3} title="아직 데이터가 없습니다" description="위에서 연간 현황표 xlsx 를 업로드하세요" />
      ) : (
        <>
          {/* 연도별 요약 */}
          <div className="card p-4 mb-4">
            <p className="text-sm font-medium mb-2">연도별 요약</p>
            <div className="table-container">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>연도</th><th className="text-right">개월</th><th className="text-right">광고비</th><th className="text-right">전년 대비</th>
                    <th className="text-right">문의</th><th className="text-right">전년 대비</th><th className="text-right">도입</th><th className="text-right">전년 대비</th>
                    <th className="text-right" title="광고비 ÷ 문의">문의당 광고비</th><th className="text-right" title="광고비 ÷ 도입">도입당 광고비</th><th className="text-right" title="도입 ÷ 문의">문의→도입</th>
                    <th className="text-right">가입</th><th className="text-right">미팅</th>
                  </tr>
                </thead>
                <tbody>
                  {yearly.map((y, i) => {
                    const p = yearly[i - 1]
                    return (
                      <tr key={y.year} className={y.year === year ? 'bg-primary-50' : ''}>
                        <td className="font-medium cursor-pointer" onClick={() => setYear(y.year)}>{y.year}{y.crmMonths > 0 && <span className="ml-1 text-[10px] text-text-tertiary">(CRM {y.crmMonths}개월 포함)</span>}</td>
                        <td className="text-right text-text-secondary">{y.months}</td>
                        <td className="text-right font-medium">{won(y.cost_total)}</td><td className="text-right"><Delta v={p ? pct(y.cost_total, p.cost_total) : null} /></td>
                        <td className="text-right">{y.inquiries ?? '-'}</td><td className="text-right"><Delta v={p ? pct(y.inquiries, p.inquiries) : null} /></td>
                        <td className="text-right">{y.adoptions ?? '-'}</td><td className="text-right"><Delta v={p ? pct(y.adoptions, p.adoptions) : null} /></td>
                        <td className="text-right">{y.inquiries ? won(y.cost_total / y.inquiries) : '-'}</td>
                        <td className="text-right">{y.adoptions ? won(y.cost_total / y.adoptions) : '-'}</td>
                        <td className="text-right">{y.inquiries && y.adoptions != null ? `${(y.adoptions / y.inquiries * 100).toFixed(1)}%` : '-'}</td>
                        <td className="text-right text-text-secondary">{y.signups ?? '-'}</td><td className="text-right text-text-secondary">{y.meetings ?? '-'}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <p className="text-[11px] text-text-tertiary mt-2">개월 수가 12가 아닌 연도는 연간 합계가 아니라 그 기간 합계입니다. 전년 대비는 개월 수가 달라도 단순 비교한 값입니다.</p>
          </div>

          {/* 월별 추이 */}
          <div className="card p-4 mb-4">
            <div className="flex items-center justify-between gap-3 mb-2 flex-wrap">
              <p className="text-sm font-medium">월별 추이 (연도별)</p>
              <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
                {METRICS.map(m => (
                  <button key={m.key} onClick={() => setMetric(m.key)}
                    className={`px-2.5 py-1 text-xs font-medium rounded-md ${metric === m.key ? 'bg-white shadow-sm text-text-primary' : 'text-text-secondary hover:text-text-primary'}`}>{m.label}</button>
                ))}
              </div>
            </div>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={trend} margin={{ left: 10, right: 10, top: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
                  <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={v => formatNumber(v)} width={70} />
                  <Tooltip formatter={(v: number) => fmt(v)} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  {years.map((y, i) => <Line key={y} dataKey={String(y)} name={String(y)} stroke={YEAR_COLORS[i % YEAR_COLORS.length]} strokeWidth={y === year ? 3 : 1.5} dot={{ r: 2 }} connectNulls={false} />)}
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="grid lg:grid-cols-2 gap-4 mb-4">
            {/* 채널별 광고비 비중 */}
            <div className="card p-4">
              <p className="text-sm font-medium mb-2">연도별 채널 광고비</p>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={yearly} margin={{ left: 10, right: 10, top: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
                    <XAxis dataKey="year" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} tickFormatter={v => formatNumber(v)} width={80} />
                    <Tooltip formatter={(v: number) => `${formatNumber(Math.round(v))}원`} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Bar dataKey="cost_google" name="구글" stackId="c" fill="#1890ff" />
                    <Bar dataKey="cost_naver" name="네이버" stackId="c" fill="#60CA21" />
                    <Bar dataKey="cost_meta" name="메타·유튜브" stackId="c" fill="#b145ff" />
                    <Bar dataKey="cost_other" name="기타(외주 블로그 등)" stackId="c" fill="#999" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
            {/* 선택 연도 채널 상세 */}
            <div className="card p-4">
              <p className="text-sm font-medium mb-2">{year}년 광고유형·채널별 <span className="text-text-tertiary font-normal">(월 상세 시트 기준)</span></p>
              {yearChannels.length === 0 ? <p className="text-xs text-text-tertiary">이 연도는 상세 시트 데이터가 없습니다{yearRows.some(r => r.source === 'crm') ? ' (CRM 구간은 광고 성과 화면에서 보세요)' : ''}.</p> : (
                <div className="table-container max-h-64 overflow-auto">
                  <table className="data-table">
                    <thead><tr><th>유형</th><th>채널</th><th className="text-right">비용</th><th className="text-right">노출</th><th className="text-right">클릭</th><th className="text-right">문의</th><th className="text-right">도입</th></tr></thead>
                    <tbody>
                      {yearChannels.map(c => (
                        <tr key={`${c.ad_type}|${c.channel}`}><td className="text-xs">{c.ad_type}</td><td>{c.channel}</td><td className="text-right">{won(c.cost)}</td><td className="text-right">{formatNumber(c.impressions)}</td><td className="text-right">{formatNumber(c.clicks)}</td><td className="text-right">{c.inquiries || '-'}</td><td className="text-right">{c.adoptions || '-'}</td></tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>

          {/* 월별 표 */}
          <div className="card p-4">
            <div className="flex items-center justify-between gap-3 mb-2 flex-wrap">
              <p className="text-sm font-medium">{year}년 월별 상세</p>
              <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
                {years.map(y => (
                  <button key={y} onClick={() => setYear(y)}
                    className={`px-2.5 py-1 text-xs font-medium rounded-md ${year === y ? 'bg-white shadow-sm text-text-primary' : 'text-text-secondary hover:text-text-primary'}`}>{y}</button>
                ))}
              </div>
            </div>
            <div className="table-container">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>월</th><th>출처</th>
                    <th className="text-right">구글</th><th className="text-right">네이버</th><th className="text-right">메타·유튜브</th><th className="text-right">기타</th>
                    <th className="text-right">광고비</th><th className="text-right">전월</th><th className="text-right">전년 동월</th>
                    <th className="text-right">문의</th><th className="text-right text-text-tertiary">유료/바이럴</th><th className="text-right">전년 동월</th>
                    <th className="text-right">도입</th><th className="text-right">문의당 광고비</th><th className="text-right">가입</th><th className="text-right">미팅</th>
                  </tr>
                </thead>
                <tbody>
                  {yearRows.map((r, i) => {
                    const prev = yearRows[i - 1] || rows.find(x => x.year === r.year - 1 && x.month === 12 && r.month === 1)
                    const py = prevYearRows.find(x => x.month === r.month)
                    return (
                      <tr key={r.month}>
                        <td className="font-medium">{r.month}월</td>
                        <td><span className={`px-1.5 py-0.5 rounded text-[10px] ${r.source === 'crm' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-text-secondary'}`}>{r.source === 'crm' ? 'CRM' : '시트'}</span></td>
                        <td className="text-right text-text-secondary">{won(r.cost_google)}</td><td className="text-right text-text-secondary">{won(r.cost_naver)}</td>
                        <td className="text-right text-text-secondary">{won(r.cost_meta)}</td><td className="text-right text-text-secondary">{won(r.cost_other)}</td>
                        <td className="text-right font-medium">{won(r.cost_total)}</td>
                        <td className="text-right"><Delta v={prev ? pct(r.cost_total, prev.cost_total) : null} /></td>
                        <td className="text-right"><Delta v={py ? pct(r.cost_total, py.cost_total) : null} /></td>
                        <td className="text-right font-medium">{r.inquiries ?? '-'}</td>
                        <td className="text-right text-text-tertiary text-xs">{r.inquiries_paid ?? '-'} / {r.inquiries_viral ?? '-'}</td>
                        <td className="text-right"><Delta v={py ? pct(r.inquiries, py.inquiries) : null} /></td>
                        <td className="text-right">{r.adoptions ?? '-'}</td>
                        <td className="text-right">{r.inquiries ? won(r.cost_total / r.inquiries) : '-'}</td>
                        <td className="text-right text-text-secondary">{r.signups ?? '-'}</td><td className="text-right text-text-secondary">{r.meetings ?? '-'}</td>
                      </tr>
                    )
                  })}
                  {yearRows.length > 0 && (() => {
                    const sum = (k: keyof MonthRow) => yearRows.reduce((a, r) => a + (Number(r[k]) || 0), 0)
                    const has = (k: keyof MonthRow) => yearRows.some(r => r[k] != null)
                    return (
                      <tr className="font-semibold bg-gray-50">
                        <td>합계</td><td></td>
                        <td className="text-right">{won(sum('cost_google'))}</td><td className="text-right">{won(sum('cost_naver'))}</td><td className="text-right">{won(sum('cost_meta'))}</td><td className="text-right">{won(sum('cost_other'))}</td>
                        <td className="text-right">{won(sum('cost_total'))}</td><td></td><td></td>
                        <td className="text-right">{has('inquiries') ? sum('inquiries') : '-'}</td>
                        <td className="text-right text-text-tertiary text-xs">{has('inquiries_paid') ? `${sum('inquiries_paid')} / ${sum('inquiries_viral')}` : '-'}</td><td></td>
                        <td className="text-right">{has('adoptions') ? sum('adoptions') : '-'}</td>
                        <td className="text-right">{sum('inquiries') ? won(sum('cost_total') / sum('inquiries')) : '-'}</td>
                        <td className="text-right">{has('signups') ? sum('signups') : '-'}</td><td className="text-right">{has('meetings') ? sum('meetings') : '-'}</td>
                      </tr>
                    )
                  })()}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
