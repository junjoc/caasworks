// 네이버 블로그 통계 엑셀(블로그 관리 > 통계 > 다운로드) 해석·저장. 서버에서만 사용.
// 파일마다 상단 메타 줄 수가 달라서(6~7줄) 헤더는 첫 칸 값으로 찾는다.
import * as XLSX from 'xlsx'
import type { SupabaseClient } from '@supabase/supabase-js'

export type NaverBlogParsed =
  | { kind: 'views'; month: string; posts: { rank: number; title: string; views: number; published_at: string | null }[] }
  | { kind: 'inflow'; month: string; routes: { name: string; ratio: number }[]; keywords: { name: string; ratio: number }[] }
  | { kind: 'visitors'; months: { month: string; unique_visitors: number }[] }
  | { kind: 'avgtime'; months: { month: string; avg_time_sec: number }[] }
  | { kind: 'device'; month: string; mobile_ratio: number | null; pc_ratio: number | null }

const KEYWORD_LIMIT = 50
const num = (v: unknown) => Number(String(v ?? '').replace(/[,%\s]/g, '')) || 0
const cleanTitle = (t: unknown) => String(t ?? '').replace(/\s+/g, ' ').trim()

// "2026.09.01. 월간" / "2026-09-01~2026-09-30" → "2026-09-01"
function monthOf(v: unknown): string | null {
  const m = String(v ?? '').match(/(\d{4})[.-](\d{1,2})/)
  return m ? `${m[1]}-${m[2].padStart(2, '0')}-01` : null
}
// "2025.12.15. (월)" → "2025-12-15"
function dateOf(v: unknown): string | null {
  const m = String(v ?? '').match(/(\d{4})[.-](\d{1,2})[.-](\d{1,2})/)
  return m ? `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}` : null
}
// "6m 35s" → 395
function secondsOf(v: unknown): number {
  const s = String(v ?? '')
  const h = Number(s.match(/(\d+)\s*h/)?.[1] || 0), m = Number(s.match(/(\d+)\s*m/)?.[1] || 0), sec = Number(s.match(/(\d+)\s*s/)?.[1] || 0)
  return h * 3600 + m * 60 + sec
}

export function parseNaverBlogFile(buf: ArrayBuffer | Buffer, filename: string): NaverBlogParsed {
  const wb = XLSX.read(buf, { type: 'buffer' })
  const rows = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: null })
  const meta = (key: string) => rows.find(r => r[0] === key)?.[1]
  const dataName = String(meta('데이터명') ?? '')
  const headerAt = (first: string) => rows.findIndex(r => r[0] === first)
  const body = (h: number) => rows.slice(h + 1).filter(r => r[0] != null && String(r[0]).trim() !== '')
  const month = monthOf(meta('데이터 기간')) || monthOf(filename)

  if (dataName === '조회수 순위') {
    if (!month) throw new Error('데이터 기간(월)을 찾지 못했습니다')
    const posts = body(headerAt('순위')).map(r => ({
      rank: num(r[0]), title: cleanTitle(r[1]), views: num(r[2]), published_at: dateOf(r[3]),
    })).filter(p => p.title)
    return { kind: 'views', month, posts }
  }
  if (dataName === '유입분석') {
    if (!month) throw new Error('데이터 기간(월)을 찾지 못했습니다')
    const routeMap = new Map<string, number>()
    const kwMap = new Map<string, number>()
    for (const r of body(headerAt('유입경로'))) {
      const route = String(r[0]).trim()
      routeMap.set(route, num(r[1]))
      const detail = String(r[2] ?? '').trim()
      // 검색 계열 경로의 세부 항목만 검색어 (블로그·Google·기타 경로의 세부 항목은 URL)
      // "기타" 는 네이버가 작은 검색어를 묶은 항목이라 검색어가 아니다
      if (route.includes('검색') && detail && detail !== '기타' && !/^https?:\/\//i.test(detail)) {
        kwMap.set(detail, (kwMap.get(detail) || 0) + num(r[3]))
      }
    }
    const routes = Array.from(routeMap, ([name, ratio]) => ({ name, ratio })).sort((a, b) => b.ratio - a.ratio)
    const keywords = Array.from(kwMap, ([name, ratio]) => ({ name, ratio: Math.round(ratio * 100) / 100 }))
      .sort((a, b) => b.ratio - a.ratio).slice(0, KEYWORD_LIMIT)
    return { kind: 'inflow', month, routes, keywords }
  }
  if (dataName === '순방문자수') {
    const h = headerAt('기간')
    const total = rows[h].findIndex(c => c === '전체')
    const months = body(h).map(r => ({ month: monthOf(r[0])!, unique_visitors: num(r[total]) })).filter(m => m.month)
    return { kind: 'visitors', months }
  }
  if (dataName === '평균사용시간') {
    const h = headerAt('기간')
    const months = body(h).map(r => ({ month: monthOf(r[0])!, avg_time_sec: secondsOf(r[2]) })).filter(m => m.month)
    return { kind: 'avgtime', months }
  }
  if (dataName === '기기별분포') {
    if (!month) throw new Error('데이터 기간(월)을 찾지 못했습니다')
    const r = body(headerAt('구분'))
    const ratio = (k: string) => { const x = r.find(row => String(row[0]).toLowerCase() === k); return x ? num(x[2]) : null }
    return { kind: 'device', month, mobile_ratio: ratio('mobile'), pc_ratio: ratio('pc') }
  }
  throw new Error(`지원하지 않는 파일입니다 (데이터명: ${dataName || '없음'})`)
}

export async function saveNaverBlogParsed(sb: SupabaseClient, p: NaverBlogParsed): Promise<string> {
  if (p.kind === 'views') {
    // 글은 제목으로 매칭. URL/logNo 는 사람이 입력한 값을 유지해야 해서 제목·작성일만 upsert
    const uniq = Array.from(new Map(p.posts.map(x => [x.title, x])).values())
    // 저장하면서 id 를 바로 받는다 (제목 100개를 조회 조건에 넣으면 주소 길이 제한에 걸림)
    const { data: saved, error: upErr } = await sb.from('naver_blog_posts')
      .upsert(uniq.map(x => ({ title: x.title, published_at: x.published_at })), { onConflict: 'title' })
      .select('id, title')
    if (upErr) throw upErr
    const ids = new Map<string, string>((saved || []).map(d => [d.title, d.id]))
    // 같은 달을 다시 올리면 그 달 값으로 교체
    const { error: delErr } = await sb.from('naver_blog_post_views').delete().eq('month', p.month)
    if (delErr) throw delErr
    const views = uniq.filter(x => ids.has(x.title)).map(x => ({ post_id: ids.get(x.title)!, month: p.month, views: x.views, rank: x.rank }))
    const { error } = await sb.from('naver_blog_post_views').insert(views)
    if (error) throw error
    return `${p.month.slice(0, 7)} 글 ${views.length}편 조회수`
  }
  if (p.kind === 'inflow') {
    const { error: delErr } = await sb.from('naver_blog_inflow').delete().eq('month', p.month)
    if (delErr) throw delErr
    const rows = [
      ...p.routes.map((r, i) => ({ month: p.month, kind: 'route', name: r.name, ratio: r.ratio, rank: i + 1 })),
      ...p.keywords.map((r, i) => ({ month: p.month, kind: 'keyword', name: r.name, ratio: r.ratio, rank: i + 1 })),
    ]
    const { error } = await sb.from('naver_blog_inflow').insert(rows)
    if (error) throw error
    return `${p.month.slice(0, 7)} 유입경로 ${p.routes.length}개 · 검색어 ${p.keywords.length}개`
  }
  if (p.kind === 'visitors' || p.kind === 'avgtime') {
    const now = new Date().toISOString()
    const { error } = await sb.from('naver_blog_monthly')
      .upsert(p.months.map(m => ({ ...m, updated_at: now })), { onConflict: 'month' })
    if (error) throw error
    return `${p.kind === 'visitors' ? '순방문자수' : '평균사용시간'} ${p.months.length}개월`
  }
  const { error } = await sb.from('naver_blog_monthly')
    .upsert({ month: p.month, mobile_ratio: p.mobile_ratio, pc_ratio: p.pc_ratio, updated_at: new Date().toISOString() }, { onConflict: 'month' })
  if (error) throw error
  return `${p.month.slice(0, 7)} 기기별 비율`
}
