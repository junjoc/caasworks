import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { denyIfNotSignedIn } from '@/lib/api-auth'

// 마케팅 연간 비교: CRM 전환(2026.5~) 이후 달은 시트 대신 CRM 데이터로 월 요약을 만든다.
// 광고비 = ad_performance (채널별 합), 문의 = pipeline_leads 문의일 기준, 도입 = 도입완료일(converted_at) 기준.
// 가입은 CRM 에 거의 없어 비워 둔다 (팀 결정 2026-10-20).
export const dynamic = 'force-dynamic'

const META = ['메타', '유튜브']
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

export async function GET(request: NextRequest) {
  const denied = await denyIfNotSignedIn(request); if (denied) return denied
  const from = request.nextUrl.searchParams.get('from') || '2026-05-01' // CRM 전환 월
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)
  try {
    const ads = await readAll<{ date: string; channel: string; cost: number; inquiries: number }>((a, b) =>
      sb.from('ad_performance').select('date, channel, cost, inquiries').gte('date', from).order('id').range(a, b))
    const leads = await readAll<{ inquiry_date: string | null; converted_at: string | null; stage: string; inquiry_channel: string | null }>((a, b) =>
      sb.from('pipeline_leads').select('inquiry_date, converted_at, stage, inquiry_channel').gte('inquiry_date', from).order('id').range(a, b))
    const won = await readAll<{ converted_at: string | null }>((a, b) =>
      sb.from('pipeline_leads').select('converted_at').eq('stage', '도입완료').gte('converted_at', from).order('id').range(a, b))

    const PAID = ['네이버', '구글', '메타', '유튜브']
    const months = new Map<string, { year: number; month: number; cost_google: number; cost_meta: number; cost_naver: number; cost_other: number; cost_total: number; inquiries: number; inquiries_paid: number; inquiries_viral: number; adoptions: number }>()
    const get = (ym: string) => {
      if (!months.has(ym)) months.set(ym, { year: Number(ym.slice(0, 4)), month: Number(ym.slice(5, 7)), cost_google: 0, cost_meta: 0, cost_naver: 0, cost_other: 0, cost_total: 0, inquiries: 0, inquiries_paid: 0, inquiries_viral: 0, adoptions: 0 })
      return months.get(ym)!
    }
    for (const a of ads) {
      const m = get(a.date.slice(0, 7)); const c = Number(a.cost) || 0
      if (!c) continue
      if (a.channel === '구글') m.cost_google += c
      else if (a.channel === '네이버') m.cost_naver += c
      else if (META.includes(a.channel)) m.cost_meta += c
      else m.cost_other += c
      m.cost_total += c
    }
    for (const l of leads) {
      if (!l.inquiry_date) continue
      const m = get(l.inquiry_date.slice(0, 7))
      m.inquiries++
      if (PAID.includes(l.inquiry_channel || '')) m.inquiries_paid++; else m.inquiries_viral++
    }
    for (const w of won) if (w.converted_at) get(w.converted_at.slice(0, 7)).adoptions++

    const rows = Array.from(months.values()).sort((a, b) => a.year - b.year || a.month - b.month)
      .map(r => ({ ...r, budget_total: null, signups: null, meetings: null, revenue: null, source: 'crm' }))
    return NextResponse.json({ from, rows })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
