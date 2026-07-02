import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// STEP 4-B: get_revenue_page RPC 래퍼.
// 매출현황 페이지가 3천개 프로젝트를 batch 로 fetch 하지 않고, 서버 페이지네이션으로 소량만 받게 함.

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  )
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const year = Number(searchParams.get('year')) || new Date().getFullYear()
    const limit = Math.min(Number(searchParams.get('limit')) || 1000, 5000)
    const offset = Number(searchParams.get('offset')) || 0
    const customer_id = searchParams.get('customer_id') || null
    const service_type = searchParams.get('service_type') || null
    const site_category = searchParams.get('site_category') || null

    const supabase = getSupabase()
    const { data, error } = await supabase.rpc('get_revenue_page', {
      p_year: year,
      p_limit: limit,
      p_offset: offset,
      p_customer_id: customer_id,
      p_service_type: service_type,
      p_site_category: site_category,
    })

    if (error) throw error
    return NextResponse.json({ rows: data, year, limit, offset })
  } catch (e: any) {
    console.error('[revenue/page]', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
