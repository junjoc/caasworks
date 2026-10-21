import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { isSignedIn } from '@/lib/pipeline/read-leads'

// 콘텐츠 성과 › 네이버 — 서버에서 계산해 화면에 필요한 것만 (2026-10-21)
// 글별: 연 합계 · 누적 · 펼친 해(year)의 월별만. 유입 검색어는 고른 달(kw)만. 데이터가 쌓여도 화면이 받는 양은 거의 같다.
export const dynamic = 'force-dynamic'

async function readAll<T>(q: (a: number, b: number) => PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>): Promise<T[]> {
  const res = await Promise.all([0, 1, 2].map(i => q(i * 1000, i * 1000 + 999)))
  while (res[res.length - 1].data?.length === 1000) res.push(await q(res.length * 1000, res.length * 1000 + 999))
  const err = res.find(r => r.error)?.error
  if (err) throw new Error(err.message)
  return res.flatMap(r => (r.data || []) as T[])
}

export async function GET(req: Request) {
  try {
    const u = new URL(req.url)
    if (u.searchParams.get('warm')) return NextResponse.json({ ok: true })
    if (!(await isSignedIn())) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
    const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)
    const [posts, views, monthly, inflowMonthsRaw] = await Promise.all([
      readAll<{ id: string; title: string; published_at: string | null; url: string | null; log_no: string | null }>((a, b) => sb.from('naver_blog_posts').select('id, title, published_at, url, log_no').order('id').range(a, b)),
      readAll<{ post_id: string; month: string; views: number }>((a, b) => sb.from('naver_blog_post_views').select('post_id, month, views').order('month').order('post_id').range(a, b)),
      readAll<{ month: string; unique_visitors: number | null; avg_time_sec: number | null; mobile_ratio: number | null; pc_ratio: number | null }>((a, b) => sb.from('naver_blog_monthly').select('month, unique_visitors, avg_time_sec, mobile_ratio, pc_ratio').order('month').range(a, b)),
      readAll<{ month: string }>((a, b) => sb.from('naver_blog_inflow').select('month').order('month').range(a, b)),
    ])
    const ym = (m: string) => m.slice(0, 7)
    const months = Array.from(new Set(views.map(v => ym(v.month)))).sort()
    const years = Array.from(new Set(months.map(m => m.slice(0, 4)))).sort()
    const year = years.includes(u.searchParams.get('year') || '') ? u.searchParams.get('year')! : years[years.length - 1] || String(new Date().getFullYear())

    // 글별 연 합계 · 누적 · 펼친 해 월별
    const per = new Map<string, { ys: Record<string, number>; tot: number; m: Record<string, number> }>()
    const mt: Record<string, number> = {}
    for (const v of views) {
      const m = ym(v.month), y = m.slice(0, 4), n = Number(v.views) || 0
      const p = per.get(v.post_id) || { ys: {}, tot: 0, m: {} }
      p.ys[y] = (p.ys[y] || 0) + n; p.tot += n
      if (y === year) p.m[m] = n
      per.set(v.post_id, p)
      mt[m] = (mt[m] || 0) + n
    }
    const rows = posts.map(p => ({ ...p, ...(per.get(p.id) || { ys: {}, tot: 0, m: {} }) })).sort((a, b) => b.tot - a.tot)
    const yt: Record<string, number> = {}
    for (const m of months) yt[m.slice(0, 4)] = (yt[m.slice(0, 4)] || 0) + (mt[m] || 0)

    // 월별 추이 (차트·표·숫자줄)
    const mMap = new Map(monthly.map(m => [ym(m.month), m]))
    const trendMonths = Array.from(new Set([...months, ...monthly.map(m => ym(m.month))])).sort()
    const trend = trendMonths.map(m => ({ month: m, views: mt[m] ?? null, visitors: mMap.get(m)?.unique_visitors ?? null, avg_time_sec: mMap.get(m)?.avg_time_sec ?? null, mobile_ratio: mMap.get(m)?.mobile_ratio ?? null, pc_ratio: mMap.get(m)?.pc_ratio ?? null }))

    // 유입 검색어: 고른 달만
    const inflowMonths = Array.from(new Set(inflowMonthsRaw.map(i => i.month))).sort().reverse()
    const kw = inflowMonths.includes(u.searchParams.get('kw') || '') ? u.searchParams.get('kw')! : inflowMonths[0] || ''
    const { data: inflow } = kw ? await sb.from('naver_blog_inflow').select('kind, name, ratio, rank').eq('month', kw).order('rank') : { data: [] }

    return NextResponse.json({
      years, year, yearMonths: months.filter(m => m.startsWith(year)), yt, mt, total: Object.values(yt).reduce((s, n) => s + n, 0),
      rows, trend, inflowMonths, kw, inflow: inflow || [], linked: posts.filter(p => p.log_no).length,
    })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
