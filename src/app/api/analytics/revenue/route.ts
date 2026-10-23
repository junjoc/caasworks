import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { unstable_cache } from 'next/cache'
import { isSignedIn } from '@/lib/pipeline/read-leads'
import { classifyLead } from '@/lib/inflow-taxonomy'

// 분석 › 매출 분석 (분석 재구성 v3 · 2026-10-23). 매출 = 매출 시트 동기화(monthly_revenues).
// 고객사의 첫 문의(가장 이른 리드)로 유입 분류 · 주제를 붙인다. 리드가 없는 고객사는 "출처 모름".
export const dynamic = 'force-dynamic'

export interface RevLine { c: string; svc: string; site: string; y: number; m: number; amt: number }
export interface RevCustomer { name: string; type: string; inflow: string; topic: string; linked: boolean; first_year: number | null }

const GENERIC = ['기타', '내용없음', '가격·견적', '도입문의']

async function readAll<T>(q: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> {
  let all: T[] = []
  for (let off = 0; ; off += 1000) {
    const { data, error } = await q(off, off + 999)
    if (error) throw new Error(error.message)
    all = all.concat(data || [])
    if (!data || data.length < 1000) break
  }
  return all
}

async function build() {
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)
  const [revs, projects, customers, leads] = await Promise.all([
    readAll<{ project_id: string; customer_id: string; year: number; month: number; amount: number }>((a, b) => sb.from('monthly_revenues').select('project_id, customer_id, year, month, amount').order('id').range(a, b)),
    readAll<{ id: string; service_type: string | null; site_category: string | null }>((a, b) => sb.from('projects').select('id, service_type, site_category').order('id').range(a, b)),
    readAll<{ id: string; company_name: string; company_type: string | null }>((a, b) => sb.from('customers').select('id, company_name, company_type').order('id').range(a, b)),
    readAll<{ customer_id: string | null; inquiry_date: string | null; created_at: string; inquiry_channel: string | null; inquiry_source: string | null; topic_tags: string[] | null }>((a, b) => sb.from('pipeline_leads').select('customer_id, inquiry_date, created_at, inquiry_channel, inquiry_source, topic_tags').not('customer_id', 'is', null).order('id').range(a, b)),
  ])
  const proj = new Map(projects.map(p => [p.id, p]))
  const first = new Map<string, (typeof leads)[number]>()
  for (const l of leads.sort((a, b) => (a.inquiry_date || a.created_at).localeCompare(b.inquiry_date || b.created_at))) if (l.customer_id && !first.has(l.customer_id)) first.set(l.customer_id, l)
  const firstYear = new Map<string, number>()
  for (const r of revs) if (Number(r.amount) > 0) firstYear.set(r.customer_id, Math.min(firstYear.get(r.customer_id) ?? 9999, r.year))
  const lines: RevLine[] = revs.filter(r => Number(r.amount)).map(r => {
    const p = proj.get(r.project_id)
    return { c: r.customer_id, svc: p?.service_type || '(없음)', site: p?.site_category || '(없음)', y: r.year, m: r.month, amt: Number(r.amount) }
  })
  const used = new Set(lines.map(l => l.c))
  const cust: Record<string, RevCustomer> = {}
  for (const c of customers) {
    if (!used.has(c.id)) continue
    const l = first.get(c.id)
    cust[c.id] = {
      name: c.company_name, type: c.company_type || '(빈칸)',
      inflow: l ? classifyLead(l.inquiry_channel, l.inquiry_source).group : '출처 모름',
      topic: l ? ((l.topic_tags || []).find(t => !GENERIC.includes(t)) || '주제 없음') : '출처 모름',
      linked: !!l, first_year: firstYear.get(c.id) ?? null,
    }
  }
  return { lines, customers: cust, generated_at: new Date().toISOString() }
}

const cached = unstable_cache(build, ['analytics-revenue'], { revalidate: 300 })

export async function GET(request: Request) {
  try {
    // 미들웨어가 /api 를 거르지 않아 로그인 확인을 여기서 (10/23 — 고객사 · 매출 · 문의 원문이 로그인 없이 열렸음)
    if (!(await isSignedIn())) return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 })
    const fresh = new URL(request.url).searchParams.get('fresh') === '1'
    return NextResponse.json(fresh ? await build() : await cached())
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
