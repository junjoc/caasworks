import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// STEP 4-B: 매출 요약 (v_revenue_yearly, v_revenue_monthly 노출).
// 대시보드/매출현황 요약 카드가 3천개 프로젝트 fetch 없이 서버 집계만 로드.

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  )
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const year = searchParams.get('year')
    const supabase = getSupabase()

    const [yearlyRes, monthlyRes] = await Promise.all([
      supabase.from('v_revenue_yearly').select('*').order('year', { ascending: false }),
      year
        ? supabase.from('v_revenue_monthly').select('*').eq('year', Number(year)).order('month')
        : supabase.from('v_revenue_monthly').select('*').order('year', { ascending: false }).order('month'),
    ])

    if (yearlyRes.error) throw yearlyRes.error
    if (monthlyRes.error) throw monthlyRes.error

    return NextResponse.json({
      yearly: yearlyRes.data,
      monthly: monthlyRes.data,
    })
  } catch (e: any) {
    console.error('[revenue/summary]', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
