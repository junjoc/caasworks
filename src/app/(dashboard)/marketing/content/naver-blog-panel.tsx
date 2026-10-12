'use client'

// 콘텐츠 성과 > 네이버 탭: 네이버 블로그 통계 엑셀 업로드 + 글별 월 조회수 + 유입 검색어
import { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Loading } from '@/components/ui/loading'
import { EmptyState } from '@/components/ui/empty-state'
import { formatNumber } from '@/lib/utils'
import { parseNaverBlogUrl } from '@/lib/naver-blog-url'
import { toast } from 'sonner'
import { Upload, FileText, Eye, Users, Clock, Smartphone, ExternalLink, CheckCircle2, XCircle } from 'lucide-react'
import {
  ComposedChart, Bar, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend,
} from 'recharts'

interface Post { id: string; title: string; published_at: string | null; url: string | null; log_no: string | null }
interface PostView { post_id: string; month: string; views: number; rank: number | null }
interface Inflow { month: string; kind: 'route' | 'keyword'; name: string; ratio: number; rank: number | null }
interface Monthly { month: string; unique_visitors: number | null; avg_time_sec: number | null; mobile_ratio: number | null; pc_ratio: number | null }
interface UploadResult { file: string; ok: boolean; message: string }

const ym = (m: string) => m.slice(0, 7)
const fmtSec = (s: number | null) => s == null ? '-' : `${Math.floor(s / 60)}분 ${s % 60}초`

export function NaverBlogPanel() {
  const supabase = createClient()
  const [loading, setLoading] = useState(true)
  const [posts, setPosts] = useState<Post[]>([])
  const [views, setViews] = useState<PostView[]>([])
  const [inflow, setInflow] = useState<Inflow[]>([])
  const [monthly, setMonthly] = useState<Monthly[]>([])
  const [uploading, setUploading] = useState(false)
  const [results, setResults] = useState<UploadResult[]>([])
  const [search, setSearch] = useState('')
  const [kwMonth, setKwMonth] = useState('')
  const [urlDraft, setUrlDraft] = useState<Record<string, string>>({})
  const fileRef = useRef<HTMLInputElement>(null)

  // 기본 1000행 제한이 있어서 나눠 읽는다
  async function readAll<T>(table: string, cols: string, order: string): Promise<T[]> {
    let all: T[] = []
    for (let off = 0; ; off += 1000) {
      const { data, error } = await supabase.from(table).select(cols).order(order).range(off, off + 999)
      if (error) throw error
      all = all.concat((data || []) as T[])
      if (!data || data.length < 1000) break
    }
    return all
  }

  const fetchAll = useCallback(async () => {
    setLoading(true)
    try {
      const [p, v, i, m] = await Promise.all([
        readAll<Post>('naver_blog_posts', 'id, title, published_at, url, log_no', 'id'),
        readAll<PostView>('naver_blog_post_views', 'post_id, month, views, rank', 'month'),
        readAll<Inflow>('naver_blog_inflow', 'month, kind, name, ratio, rank', 'month'),
        readAll<Monthly>('naver_blog_monthly', 'month, unique_visitors, avg_time_sec, mobile_ratio, pc_ratio', 'month'),
      ])
      setPosts(p); setViews(v); setInflow(i); setMonthly(m)
    } catch (e) {
      toast.error('네이버 블로그 데이터를 불러오지 못했습니다: ' + (e as { message?: string }).message)
    }
    setLoading(false)
  }, [])

  useEffect(() => { fetchAll() }, [fetchAll])

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
      fetchAll()
    } catch (e) {
      toast.error((e as Error).message)
    }
    setUploading(false)
    if (fileRef.current) fileRef.current.value = ''
  }

  async function saveUrl(post: Post) {
    const raw = (urlDraft[post.id] ?? '').trim()
    if (raw === (post.url || '')) return
    let log_no: string | null = null
    if (raw) {
      const parsed = parseNaverBlogUrl(raw)
      if (!parsed?.logNo) { toast.error('네이버 블로그 글 주소가 아닙니다 (예: https://blog.naver.com/아이디/글번호)'); return }
      log_no = parsed.logNo
    }
    const { error } = await supabase.from('naver_blog_posts')
      .update({ url: raw || null, log_no, updated_at: new Date().toISOString() }).eq('id', post.id)
    if (error) { toast.error('저장 실패: ' + error.message); return }
    setPosts(ps => ps.map(p => p.id === post.id ? { ...p, url: raw || null, log_no } : p))
    toast.success(raw ? `글번호 ${log_no} 저장` : 'URL 삭제')
  }

  // 업로드된 달 (오래된 → 최근)
  const viewMonths = useMemo(() => Array.from(new Set(views.map(v => v.month))).sort(), [views])
  const inflowMonths = useMemo(() => Array.from(new Set(inflow.map(i => i.month))).sort().reverse(), [inflow])
  useEffect(() => { if (!kwMonth && inflowMonths.length) setKwMonth(inflowMonths[0]) }, [inflowMonths, kwMonth])

  const rows = useMemo(() => {
    const byPost = new Map<string, Map<string, number>>()
    for (const v of views) {
      if (!byPost.has(v.post_id)) byPost.set(v.post_id, new Map())
      byPost.get(v.post_id)!.set(v.month, v.views)
    }
    const q = search.trim().toLowerCase()
    return posts
      .filter(p => !q || p.title.toLowerCase().includes(q))
      .map(p => {
        const m = byPost.get(p.id) || new Map<string, number>()
        return { post: p, months: m, total: Array.from(m.values()).reduce((s, n) => s + n, 0) }
      })
      .sort((a, b) => b.total - a.total)
  }, [posts, views, search])

  // 월별 추이: 상위 글 조회수 합 + 순방문자수
  const trend = useMemo(() => {
    const all = Array.from(new Set([...viewMonths, ...monthly.map(m => m.month)])).sort()
    const mMap = new Map(monthly.map(m => [m.month, m]))
    return all.map(month => ({
      month: ym(month),
      views: views.filter(v => v.month === month).reduce((s, v) => s + v.views, 0) || null,
      visitors: mMap.get(month)?.unique_visitors ?? null,
      avg_time_sec: mMap.get(month)?.avg_time_sec ?? null,
      mobile_ratio: mMap.get(month)?.mobile_ratio ?? null,
      pc_ratio: mMap.get(month)?.pc_ratio ?? null,
    }))
  }, [viewMonths, monthly, views])

  const latestWith = <K extends keyof (typeof trend)[number]>(k: K) => [...trend].reverse().find(t => t[k] != null)
  const kwRows = inflow.filter(i => i.month === kwMonth && i.kind === 'keyword').sort((a, b) => (a.rank ?? 0) - (b.rank ?? 0))
  const routeRows = inflow.filter(i => i.month === kwMonth && i.kind === 'route').sort((a, b) => (a.rank ?? 0) - (b.rank ?? 0))
  const linked = posts.filter(p => p.log_no).length

  const uploadBox = (
    <div className="card p-4 mb-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <p className="text-sm font-medium">네이버 블로그 통계 업로드</p>
          <p className="text-xs text-text-secondary mt-0.5">
            블로그 관리 &gt; 통계에서 받은 월간 엑셀 (조회수 순위 · 유입분석 · 순방문자수 · 평균사용시간 · 기기별분포). 여러 개를 한 번에 올려도 되고, 같은 달을 다시 올리면 그 달 값으로 바뀝니다.
          </p>
        </div>
        <input ref={fileRef} type="file" accept=".xlsx,.xls" multiple className="hidden"
          onChange={e => handleUpload(e.target.files)} />
        <Button size="sm" onClick={() => fileRef.current?.click()} loading={uploading}>
          <Upload className="w-3.5 h-3.5 mr-1" /> 엑셀 업로드
        </Button>
      </div>
      {results.length > 0 && (
        <ul className="mt-3 space-y-1 text-xs">
          {results.map(r => (
            <li key={r.file} className="flex items-start gap-1.5">
              {r.ok ? <CheckCircle2 className="w-3.5 h-3.5 text-green-600 flex-shrink-0 mt-px" /> : <XCircle className="w-3.5 h-3.5 text-red-500 flex-shrink-0 mt-px" />}
              <span className="text-text-secondary">{r.file}</span>
              <span className={r.ok ? 'text-text-primary' : 'text-red-600'}>— {r.message}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )

  if (loading) return <>{uploadBox}<Loading /></>
  if (!posts.length && !monthly.length && !inflow.length) {
    return <>{uploadBox}<EmptyState icon={FileText} title="네이버 블로그 통계가 없습니다" description="위에서 월간 통계 엑셀을 업로드하세요" /></>
  }

  return (
    <div>
      {uploadBox}

      {/* KPI: 가장 최근 달 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <div className="card p-4">
          <div className="flex items-center gap-2 mb-1"><Eye className="w-4 h-4 text-green-500" /><span className="text-xs text-text-secondary">조회수 (상위 글 합, {latestWith('views') ? latestWith('views')!.month : '-'})</span></div>
          <p className="text-lg font-bold">{formatNumber(latestWith('views')?.views || 0)}</p>
        </div>
        <div className="card p-4">
          <div className="flex items-center gap-2 mb-1"><Users className="w-4 h-4 text-purple-500" /><span className="text-xs text-text-secondary">순방문자수 ({latestWith('visitors')?.month || '-'})</span></div>
          <p className="text-lg font-bold">{formatNumber(latestWith('visitors')?.visitors || 0)}</p>
        </div>
        <div className="card p-4">
          <div className="flex items-center gap-2 mb-1"><Clock className="w-4 h-4 text-orange-500" /><span className="text-xs text-text-secondary">평균 사용시간 ({latestWith('avg_time_sec')?.month || '-'})</span></div>
          <p className="text-lg font-bold">{fmtSec(latestWith('avg_time_sec')?.avg_time_sec ?? null)}</p>
        </div>
        <div className="card p-4">
          <div className="flex items-center gap-2 mb-1"><Smartphone className="w-4 h-4 text-blue-500" /><span className="text-xs text-text-secondary">모바일 비율 ({latestWith('mobile_ratio')?.month || '-'})</span></div>
          <p className="text-lg font-bold">{latestWith('mobile_ratio')?.mobile_ratio != null ? `${latestWith('mobile_ratio')!.mobile_ratio}%` : '-'}</p>
        </div>
      </div>

      {/* 월별 추이 */}
      {trend.length > 0 && (
        <div className="card p-4 mb-4">
          <p className="text-sm font-medium mb-2">월별 추이</p>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={trend} margin={{ left: 0, right: 10, top: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                <YAxis yAxisId="v" tick={{ fontSize: 11 }} />
                <YAxis yAxisId="u" orientation="right" tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v: number) => formatNumber(v)} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar yAxisId="v" dataKey="views" name="조회수 (상위 글 합)" fill="#22c55e" radius={[3, 3, 0, 0]} />
                <Line yAxisId="u" dataKey="visitors" name="순방문자수" stroke="#8b5cf6" strokeWidth={2} connectNulls={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          <div className="table-container mt-3">
            <table className="data-table">
              <thead>
                <tr><th>월</th><th className="text-right">조회수 (상위 글 합)</th><th className="text-right">순방문자수</th><th className="text-right">평균 사용시간</th><th className="text-right">모바일 / PC</th></tr>
              </thead>
              <tbody>
                {[...trend].reverse().map(t => (
                  <tr key={t.month}>
                    <td>{t.month}</td>
                    <td className="text-right">{t.views != null ? formatNumber(t.views) : '-'}</td>
                    <td className="text-right">{t.visitors != null ? formatNumber(t.visitors) : '-'}</td>
                    <td className="text-right">{fmtSec(t.avg_time_sec)}</td>
                    <td className="text-right">{t.mobile_ratio != null ? `${t.mobile_ratio}% / ${t.pc_ratio ?? '-'}%` : '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 글별 월 조회수 */}
      <div className="card p-4 mb-4">
        <div className="flex items-center justify-between gap-3 mb-2 flex-wrap">
          <div>
            <p className="text-sm font-medium">글별 월 조회수 <span className="text-text-tertiary font-normal">({rows.length}편 · URL 연결 {linked}편)</span></p>
            <p className="text-xs text-text-secondary mt-0.5">월 조회수 순위(상위 약 100편)에 든 달만 집계됩니다. URL 칸에 네이버 글 주소를 넣으면 마케팅 리포트 레퍼러에 글 제목이 표시됩니다.</p>
          </div>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="제목 검색"
            className="input-base !py-1.5 text-sm !w-48" />
        </div>
        <div className="table-container max-h-[600px] overflow-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th className="min-w-[260px]">제목</th>
                <th className="text-right whitespace-nowrap">작성일</th>
                {viewMonths.map(m => <th key={m} className="text-right whitespace-nowrap">{ym(m)}</th>)}
                <th className="text-right whitespace-nowrap">누적</th>
                <th className="min-w-[220px]">네이버 글 URL</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ post, months, total }) => (
                <tr key={post.id}>
                  <td className="max-w-[360px]">
                    <div className="flex items-center gap-1">
                      <span className="truncate" title={post.title}>{post.title}</span>
                      {post.url && <a href={post.url} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:text-blue-700 flex-shrink-0"><ExternalLink className="w-3 h-3" /></a>}
                    </div>
                  </td>
                  <td className="text-right text-xs text-text-secondary whitespace-nowrap">{post.published_at || '-'}</td>
                  {viewMonths.map(m => <td key={m} className="text-right">{months.has(m) ? formatNumber(months.get(m)!) : <span className="text-text-tertiary">-</span>}</td>)}
                  <td className="text-right font-medium">{formatNumber(total)}</td>
                  <td>
                    <input
                      value={urlDraft[post.id] ?? post.url ?? ''}
                      onChange={e => setUrlDraft(d => ({ ...d, [post.id]: e.target.value }))}
                      onBlur={() => saveUrl(post)}
                      onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
                      placeholder="https://blog.naver.com/…"
                      className="w-full text-xs px-2 py-1 border border-border-light rounded focus:outline-none focus:border-blue-400" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* 유입 검색어 */}
      {inflowMonths.length > 0 && (
        <div className="card p-4">
          <div className="flex items-center justify-between gap-3 mb-2 flex-wrap">
            <p className="text-sm font-medium">유입 검색어 <span className="text-text-tertiary font-normal">(월 상위 50개)</span></p>
            <select value={kwMonth} onChange={e => setKwMonth(e.target.value)} className="input-base !py-1.5 text-sm !w-32">
              {inflowMonths.map(m => <option key={m} value={m}>{ym(m)}</option>)}
            </select>
          </div>
          <div className="grid md:grid-cols-3 gap-4">
            <div className="md:col-span-2 table-container max-h-[520px] overflow-auto">
              <table className="data-table">
                <thead><tr><th className="w-12 text-right">순위</th><th>검색어</th><th className="text-right">비율</th></tr></thead>
                <tbody>
                  {kwRows.map(k => (
                    <tr key={k.name}><td className="text-right text-text-tertiary">{k.rank}</td><td>{k.name}</td><td className="text-right">{Number(k.ratio).toFixed(2)}%</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="table-container">
              <table className="data-table">
                <thead><tr><th>유입경로</th><th className="text-right">비율</th></tr></thead>
                <tbody>
                  {routeRows.map(r => (
                    <tr key={r.name}><td>{r.name}</td><td className="text-right">{Number(r.ratio).toFixed(1)}%</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
