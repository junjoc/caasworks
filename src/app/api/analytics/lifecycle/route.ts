import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { unstable_cache } from 'next/cache'

// 고객 생애주기 기준 데이터 (서버 집계). 코호트·전환 소요 기간·채널별 생애 가치 화면이 같이 쓴다.
// 한 회사 = 한 행: 첫 리드(유입일·채널) → 도입(converted_at) → 유입월 이후 월별 매출(공급가).
// 집계는 여기서 끝내고 화면은 결과만 받는다. 5분 캐시.
export const dynamic = 'force-dynamic'

export interface LifecycleRow {
  key: string                      // customer_id 또는 lead_id
  customer_id: string | null
  company_name: string
  company_type: string | null
  inquiry_date: string             // 첫 리드 유입일
  inquiry_month: string            // YYYY-MM
  inquiry_channel: string | null
  inquiry_source: string | null
  industry: string | null
  site_category: string | null
  conversion_probability: string | null
  assigned_to: string | null       // 담당자 이름
  lead_count: number
  won: boolean
  converted_at: string | null      // YYYY-MM-DD
  days_to_convert: number | null
  services: string[]
  existing_customer: boolean       // 유입월 이전에 매출이 있던 고객 (코호트 기본 제외)
  months_elapsed: number           // 유입월부터 이번 달까지 경과 개월 (0 = 이번 달 유입)
  rev_by_month: Record<string, number>  // 유입월 이후 YYYY-MM → 금액
  rev_total: number
  rev_1: number | null; rev_3: number | null; rev_6: number | null; rev_12: number | null  // 유입 후 N개월 누적 (경과 전이면 null)
}

const ym = (d: string) => d.slice(0, 7)
const monthDiff = (a: string, b: string) => (Number(b.slice(0, 4)) - Number(a.slice(0, 4))) * 12 + (Number(b.slice(5, 7)) - Number(a.slice(5, 7)))

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
  const t0 = Date.now()
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)
  const [leads, customers, projects, revs, users] = await Promise.all([
    readAll<{ id: string; customer_id: string | null; company_name: string; inquiry_date: string | null; created_at: string; inquiry_channel: string | null; inquiry_source: string | null; industry: string | null; site_category: string | null; conversion_probability: string | null; assigned_to: string | null; stage: string; converted_at: string | null }>(
      (a, b) => sb.from('pipeline_leads').select('id, customer_id, company_name, inquiry_date, created_at, inquiry_channel, inquiry_source, industry, site_category, conversion_probability, assigned_to, stage, converted_at').order('id').range(a, b)),
    readAll<{ id: string; company_name: string; company_type: string | null }>((a, b) => sb.from('customers').select('id, company_name, company_type').order('id').range(a, b)),
    readAll<{ customer_id: string; service_type: string | null }>((a, b) => sb.from('projects').select('customer_id, service_type').order('id').range(a, b)),
    readAll<{ customer_id: string; year: number; month: number; amount: number }>((a, b) => sb.from('monthly_revenues').select('customer_id, year, month, amount').order('id').range(a, b)),
    readAll<{ id: string; name: string }>((a, b) => sb.from('users').select('id, name').order('id').range(a, b)),
  ])
  const custMap = new Map(customers.map(c => [c.id, c]))
  const userName = new Map(users.map(u => [u.id, u.name]))
  const services = new Map<string, Set<string>>()
  for (const p of projects) { if (!p.service_type) continue; if (!services.has(p.customer_id)) services.set(p.customer_id, new Set()); services.get(p.customer_id)!.add(p.service_type) }
  const revByCust = new Map<string, Map<string, number>>()
  for (const r of revs) {
    const k = `${r.year}-${String(r.month).padStart(2, '0')}`
    if (!revByCust.has(r.customer_id)) revByCust.set(r.customer_id, new Map())
    const m = revByCust.get(r.customer_id)!
    m.set(k, (m.get(k) || 0) + Number(r.amount))
  }

  // 회사(연결된 리드는 customer_id, 아니면 리드 자체) 단위로 묶고 첫 리드를 생애주기 시작으로
  const groups = new Map<string, typeof leads>()
  for (const l of leads) {
    const key = l.customer_id || `lead:${l.id}`
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push(l)
  }
  const thisMonth = new Date().toISOString().slice(0, 7)
  const rows: LifecycleRow[] = []
  for (const [key, ls] of Array.from(groups.entries())) {
    const dated = ls.map(l => ({ ...l, d: l.inquiry_date || l.created_at.slice(0, 10) })).sort((a, b) => a.d.localeCompare(b.d))
    const first = dated[0]
    const wonLeads = dated.filter(l => l.stage === '도입완료')
    const won = wonLeads.length > 0
    const conv = wonLeads.map(l => l.converted_at?.slice(0, 10)).filter((d): d is string => !!d && d >= first.d).sort()[0] || null
    const cust = first.customer_id ? custMap.get(first.customer_id) : undefined
    const inqMonth = ym(first.d)
    const revMap = first.customer_id ? revByCust.get(first.customer_id) : undefined
    const rev_by_month: Record<string, number> = {}
    let existing = false, total = 0
    if (revMap) for (const [m, amt] of Array.from(revMap.entries())) {
      if (m < inqMonth) { if (amt > 0) existing = true; continue }
      rev_by_month[m] = amt; total += amt
    }
    const elapsed = monthDiff(inqMonth, thisMonth)
    const cum = (n: number) => {
      if (elapsed < n - 1) return null // 아직 N개월이 안 지남 (유입월 포함 N개월)
      let s = 0
      for (const [m, amt] of Object.entries(rev_by_month)) if (monthDiff(inqMonth, m) < n) s += amt
      return s
    }
    rows.push({
      key, customer_id: first.customer_id, company_name: cust?.company_name || first.company_name, company_type: cust?.company_type || null,
      inquiry_date: first.d, inquiry_month: inqMonth, inquiry_channel: first.inquiry_channel, inquiry_source: first.inquiry_source,
      industry: first.industry, site_category: first.site_category, conversion_probability: first.conversion_probability,
      assigned_to: first.assigned_to ? userName.get(first.assigned_to) || null : null,
      lead_count: ls.length, won, converted_at: conv,
      days_to_convert: conv ? Math.round((new Date(conv).getTime() - new Date(first.d).getTime()) / 86400000) : null,
      services: Array.from(services.get(first.customer_id || '') || []),
      existing_customer: existing, months_elapsed: elapsed, rev_by_month, rev_total: total,
      rev_1: cum(1), rev_3: cum(3), rev_6: cum(6), rev_12: cum(12),
    })
  }
  rows.sort((a, b) => b.inquiry_date.localeCompare(a.inquiry_date))
  return { rows, generated_at: new Date().toISOString(), ms: Date.now() - t0, counts: { leads: leads.length, companies: rows.length, won: rows.filter(r => r.won).length } }
}

const cached = unstable_cache(build, ['analytics-lifecycle'], { revalidate: 300 })

export async function GET(request: Request) {
  try {
    const fresh = new URL(request.url).searchParams.get('fresh') === '1'
    const data = fresh ? await build() : await cached()
    return NextResponse.json(data)
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
