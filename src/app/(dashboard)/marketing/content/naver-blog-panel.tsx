'use client'

// 콘텐츠 성과 > 네이버 탭: 네이버 블로그 통계 엑셀 업로드 + 월별 추이 + 글별 조회수 + 유입 검색어
// 10/21: 글별 표는 "연도 열 펼치기" — 한 해만 월별로, 나머지 해는 연 합계 한 칸, 누적은 맨 오른쪽 고정.
// 읽기는 /api/marketing/naver-blog/overview 한 번(서버가 계산). URL 은 제목 옆 링크 아이콘 → 작은 창.
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { Toolbar, KpiRow, DsButton, DsSelect, Skeleton, Empty, BasisNote, dsInput } from '@/components/ds'
import { Popover } from '@/components/ds/detail'
import { createClient } from '@/lib/supabase/client'
import { fetchJson, getCached, setCached } from '@/lib/swr-cache'
import { formatNumber, cn } from '@/lib/utils'
import { parseNaverBlogUrl } from '@/lib/naver-blog-url'
import { toast } from 'sonner'
import { Upload, ExternalLink, Link2, CheckCircle2, XCircle } from 'lucide-react'
import { ComposedChart, Bar, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from 'recharts'

type Row = { id: string; title: string; published_at: string | null; url: string | null; log_no: string | null; ys: Record<string, number>; tot: number; m: Record<string, number> }
type Trend = { month: string; views: number | null; visitors: number | null; avg_time_sec: number | null; mobile_ratio: number | null; pc_ratio: number | null }
type Res = { years: string[]; year: string; yearMonths: string[]; yt: Record<string, number>; mt: Record<string, number>; total: number; rows: Row[]; trend: Trend[]; inflowMonths: string[]; kw: string; inflow: { kind: 'route' | 'keyword'; name: string; ratio: number; rank: number | null }[]; linked: number }
interface UploadResult { file: string; ok: boolean; message: string }

const fmtSec = (s: number | null) => s == null ? '-' : `${Math.floor(s / 60)}분 ${s % 60}초`
const n = (v: number | undefined | null) => v ? formatNumber(v) : <span className="text-ds-fg3">—</span>
const HELP = '블로그 관리 > 통계에서 받은 월간 엑셀(조회수 순위 · 유입분석 · 순방문자수 · 평균사용시간 · 기기별분포). 여러 개를 한 번에 올려도 되고, 같은 달을 다시 올리면 그 달 값으로 바뀝니다. 글별 조회수는 월 조회수 순위(상위 약 100편)에 든 달만 집계됩니다.'

// 제목 옆 링크 아이콘 → 네이버 글 URL 넣는 작은 창
function UrlEdit({ row, onSaved }: { row: Row; onSaved: (url: string | null, logNo: string | null) => void }) {
  const [open, setOpen] = useState(false)
  const [v, setV] = useState(row.url || '')
  const save = async () => {
    const raw = v.trim()
    if (raw === (row.url || '')) { setOpen(false); return }
    let log_no: string | null = null
    if (raw) {
      const parsed = parseNaverBlogUrl(raw)
      if (!parsed?.logNo) { toast.error('네이버 블로그 글 주소가 아닙니다 (예: https://blog.naver.com/아이디/글번호)'); return }
      log_no = parsed.logNo
    }
    const { error } = await createClient().from('naver_blog_posts').update({ url: raw || null, log_no, updated_at: new Date().toISOString() }).eq('id', row.id)
    if (error) { toast.error('저장 실패: ' + error.message); return }
    onSaved(raw || null, log_no); setOpen(false)
    toast.success(raw ? `글번호 ${log_no} 저장` : 'URL 삭제')
  }
  return (
    <span className="relative inline-flex">
      <button onClick={() => { setV(row.url || ''); setOpen(true) }} title={row.url ? 'URL 수정' : 'URL 넣기 — 넣으면 마케팅 리포트 레퍼러에 글 제목이 보임'}
        className={cn('ml-1 inline-grid place-items-center w-5 h-5 rounded hover:bg-ds-subtle', row.url ? 'text-ds-accent' : 'text-ds-line')}><Link2 className="w-3.5 h-3.5" /></button>
      <Popover open={open} onClose={() => setOpen(false)} width={340}>
        <div className="grid gap-1.5 text-[12.5px]">
          <span className="text-ds-fg2">네이버 글 URL</span>
          <input autoFocus value={v} onChange={e => setV(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') save() }} placeholder="https://blog.naver.com/아이디/글번호" className={cn(dsInput, 'h-7 text-[12.5px]')} />
          <div className="flex gap-1.5 items-center">
            <DsButton size="sm" variant="primary" onClick={save}>저장</DsButton>
            {row.url && <a href={row.url} target="_blank" rel="noopener noreferrer" className="text-ds-accent text-[12px] inline-flex items-center gap-1">글 열기 <ExternalLink className="w-3 h-3" /></a>}
          </div>
        </div>
      </Popover>
    </span>
  )
}

export function NaverBlogPanel({ tabs }: { tabs: ReactNode }) {
  const [data, setData] = useState<Res | null>(null)
  const [year, setYear] = useState('')
  const [kw, setKw] = useState('')
  const [search, setSearch] = useState('')
  const [uploading, setUploading] = useState(false)
  const [results, setResults] = useState<UploadResult[]>([])
  const fileRef = useRef<HTMLInputElement>(null)

  const load = useCallback(async (fresh = false) => {
    const key = `naver:${year}:${kw}`
    const c = getCached<Res>(key)
    if (c && !fresh) setData(c)
    try {
      const j = await fetchJson<Res>(fresh ? `${key}:${Date.now()}` : key, `/api/marketing/naver-blog/overview?year=${year}&kw=${kw}`)
      setCached(key, j); setData(j)
    } catch (e) { toast.error('네이버 블로그 데이터를 불러오지 못했습니다: ' + (e as Error).message) }
  }, [year, kw])
  useEffect(() => { load() }, [load])

  async function handleUpload(files: FileList | null) {
    if (!files?.length) return
    setUploading(true)
    setResults([])
    try {
      const fd = new FormData()
      Array.from(files).forEach(f => fd.append('files', f))
      const res = await fetch('/api/marketing/naver-blog/upload', { method: 'POST', body: fd })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || '업로드 실패')
      const rs: UploadResult[] = json.results || []
      setResults(rs)
      const ok = rs.filter(r => r.ok).length
      if (ok === rs.length) toast.success(`${ok}개 파일 저장 완료`)
      else toast.error(`${rs.length}개 중 ${rs.length - ok}개 실패`)
      load(true)
    } catch (e) {
      toast.error((e as Error).message)
    }
    setUploading(false)
    if (fileRef.current) fileRef.current.value = ''
  }

  const head = (
    <>
      <Toolbar right={<>
        <DsButton variant="ghost" size="sm" title={HELP}>ⓘ 기준</DsButton>
        <input ref={fileRef} type="file" accept=".xlsx,.xls" multiple className="hidden" onChange={e => handleUpload(e.target.files)} />
        <DsButton size="sm" variant="primary" onClick={() => fileRef.current?.click()} loading={uploading} icon={<Upload className="w-3.5 h-3.5" />}>엑셀 업로드</DsButton>
      </>}>{tabs}</Toolbar>
      {results.length > 0 && (
        <ul className="mb-3 space-y-1 text-[12px]">
          {results.map(r => (
            <li key={r.file} className="flex items-start gap-1.5">
              {r.ok ? <CheckCircle2 className="w-3.5 h-3.5 text-ds-ok flex-shrink-0 mt-px" /> : <XCircle className="w-3.5 h-3.5 text-ds-bad flex-shrink-0 mt-px" />}
              <span className="text-ds-fg2">{r.file}</span><span className={r.ok ? 'text-ds-fg' : 'text-ds-bad'}>— {r.message}</span>
            </li>
          ))}
        </ul>
      )}
    </>
  )
  const Sec = ({ title, sub, right, children }: { title: string; sub?: string; right?: ReactNode; children: ReactNode }) => (
    <div className="mb-6"><div className="flex items-center gap-2 mb-2"><h2 className="text-[14px] font-medium text-ds-fg">{title}</h2>{sub && <span className="text-[12px] text-ds-fg3">{sub}</span>}<span className="ml-auto">{right}</span></div>{children}</div>
  )

  if (!data) return <>{head}<Skeleton rows={10} /></>
  if (!data.rows.length && !data.trend.length) return <>{head}<Empty text="네이버 블로그 통계가 없습니다 — 엑셀 업로드로 월간 통계를 올리세요" /></>

  const { trend, years, yearMonths } = data
  const open = data.year
  const latestWith = <K extends keyof Trend>(k: K) => [...trend].reverse().find(t => t[k] != null)
  const q = search.trim().toLowerCase()
  const rows = q ? data.rows.filter(r => r.title.toLowerCase().includes(q)) : data.rows
  const kwRows = data.inflow.filter(i => i.kind === 'keyword')
  const routeRows = data.inflow.filter(i => i.kind === 'route')
  const setUrl = (id: string) => (url: string | null, log_no: string | null) => setData(d => d && ({ ...d, rows: d.rows.map(r => r.id === id ? { ...r, url, log_no } : r), linked: d.linked + (log_no ? 1 : 0) - (d.rows.find(r => r.id === id)?.log_no ? 1 : 0) }))

  return (
    <div>
      {head}
      <KpiRow items={[
        { label: '조회수', value: formatNumber(latestWith('views')?.views || 0), sub: `상위 글 합 · ${latestWith('views')?.month || '—'}` },
        { label: '순방문자수', value: formatNumber(latestWith('visitors')?.visitors || 0), sub: latestWith('visitors')?.month || '—' },
        { label: '평균 사용시간', value: fmtSec(latestWith('avg_time_sec')?.avg_time_sec ?? null), sub: latestWith('avg_time_sec')?.month || '—' },
        { label: '모바일 비율', value: latestWith('mobile_ratio')?.mobile_ratio != null ? `${latestWith('mobile_ratio')!.mobile_ratio}%` : '—', sub: latestWith('mobile_ratio')?.month || '—' },
        { label: '누적 조회수', value: formatNumber(data.total), sub: `${years[0] || ''}~ 글 ${data.rows.length}편` },
      ]} />

      {trend.length > 0 && (
        <Sec title="월별 추이">
          <div className="grid lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] gap-5 items-start">
            <div className="ds-wrap p-3 h-64">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={trend} margin={{ left: 0, right: 10, top: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f2" />
                  <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                  <YAxis yAxisId="v" tick={{ fontSize: 12 }} />
                  <YAxis yAxisId="u" orientation="right" tick={{ fontSize: 12 }} />
                  <Tooltip formatter={(v: number) => formatNumber(v)} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar yAxisId="v" dataKey="views" name="조회수 (상위 글 합)" fill="#579bfc" radius={[3, 3, 0, 0]} />
                  <Line yAxisId="u" dataKey="visitors" name="순방문자수" stroke="#2563eb" strokeWidth={2} connectNulls={false} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
            <div className="ds-wrap max-h-64">
              <table className="ds-table is-fixed">
                <colgroup>{[18, 22, 20, 20, 20].map((w, i) => <col key={i} style={{ width: `${w}%` }} />)}</colgroup>
                <thead><tr><th>월</th><th>조회수</th><th>순방문자</th><th>평균 시간</th><th>모바일/PC</th></tr></thead>
                <tbody>{[...trend].reverse().map(t => (
                  <tr key={t.month} className="ds-row"><td className="!text-center">{t.month}</td><td className="num">{t.views != null ? formatNumber(t.views) : '—'}</td><td className="num">{t.visitors != null ? formatNumber(t.visitors) : '—'}</td><td className="num">{fmtSec(t.avg_time_sec)}</td><td className="num">{t.mobile_ratio != null ? `${t.mobile_ratio}/${t.pc_ratio ?? '-'}` : '—'}</td></tr>
                ))}</tbody>
              </table>
            </div>
          </div>
        </Sec>
      )}

      <Sec title="글별 조회수" sub={`${data.rows.length}편 · URL 연결 ${data.linked}편 · 연도 머리를 누르면 그해 월별`}
        right={<input value={search} onChange={e => setSearch(e.target.value)} placeholder="제목 검색" className={cn(dsInput, 'h-7 w-48 text-[12.5px]')} />}>
        <div className="ds-wrap max-h-[600px]">
          <table className="ds-table is-fixed">
            <colgroup>
              <col style={{ width: 260 }} /><col style={{ width: 72 }} />
              {years.flatMap(y => y === open ? [...yearMonths.map(m => <col key={m} style={{ width: 48 }} />), <col key={y} style={{ width: 64 }} />] : [<col key={y} style={{ width: 64 }} />])}
              <col style={{ width: 72 }} />
            </colgroup>
            <thead><tr>
              <th>제목</th><th>작성일</th>
              {years.flatMap(y => [
                ...(y === open ? yearMonths.map(m => <th key={m}>{Number(m.slice(5))}월</th>) : []),
                <th key={y} className={cn('g cursor-pointer select-none', y === open ? 'text-ds-fg' : 'text-ds-accent hover:bg-ds-accent-soft')} onClick={() => y !== open && setYear(y)} title={y === open ? `${y} 합계` : `${y}년 월별 펼치기`}>{y} {y === open ? '▾' : '▸'}</th>,
              ])}
              <th className="g">누적</th>
            </tr></thead>
            <tbody>
              <tr className="ds-sum top">
                <td>합계 <span className="text-ds-fg3 font-normal text-[12px] ml-1">{rows.length}편</span></td><td />
                {years.flatMap(y => [...(y === open ? yearMonths.map(m => <td key={m} className="num">{n(data.mt[m])}</td>) : []), <td key={y} className="num g">{n(data.yt[y])}</td>])}
                <td className="num g">{formatNumber(data.total)}</td>
              </tr>
              {rows.map(r => (
                <tr key={r.id} className="ds-row">
                  <td title={r.title}><span className="flex items-center min-w-0"><span className="truncate">{r.title}</span><UrlEdit row={r} onSaved={setUrl(r.id)} /></span></td>
                  <td className="c muted tabular-nums">{r.published_at ? r.published_at.slice(2).replace(/-/g, '.') : '—'}</td>
                  {years.flatMap(y => [...(y === open ? yearMonths.map(m => <td key={m} className="num">{n(r.m[m])}</td>) : []), <td key={y} className="num g">{n(r.ys[y])}</td>])}
                  <td className="num g font-medium">{formatNumber(r.tot)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Sec>

      {data.inflowMonths.length > 0 && (
        <Sec title="유입 검색어" sub="월 상위 50개"
          right={<DsSelect value={data.kw} onChange={e => setKw(e.target.value)} className="h-7 text-[12.5px]">{data.inflowMonths.map(m => <option key={m} value={m}>{m.slice(0, 7)}</option>)}</DsSelect>}>
          <div className="grid lg:grid-cols-[minmax(0,2fr)_minmax(280px,1fr)] gap-5 items-start">
            <div className="ds-wrap max-h-[520px]">
              <table className="ds-table is-fixed">
                <colgroup><col style={{ width: '12%' }} /><col style={{ width: '68%' }} /><col style={{ width: '20%' }} /></colgroup>
                <thead><tr><th>순위</th><th>검색어</th><th>비율</th></tr></thead>
                <tbody>{kwRows.map(k => <tr key={k.name} className="ds-row"><td className="num muted">{k.rank}</td><td>{k.name}</td><td className="num">{Number(k.ratio).toFixed(2)}%</td></tr>)}</tbody>
              </table>
            </div>
            <div className="ds-wrap">
              <table className="ds-table is-fixed">
                <colgroup><col style={{ width: '70%' }} /><col style={{ width: '30%' }} /></colgroup>
                <thead><tr><th>유입경로</th><th>비율</th></tr></thead>
                <tbody>{routeRows.map(r => <tr key={r.name} className="ds-row"><td>{r.name}</td><td className="num">{Number(r.ratio).toFixed(1)}%</td></tr>)}</tbody>
              </table>
            </div>
          </div>
        </Sec>
      )}
      <BasisNote text={HELP} />
    </div>
  )
}
