import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// 콜드 스타트 완화: Vercel Serverless + Supabase RPC warmup.
// - 로그인 페이지가 백그라운드로 호출 (사용자가 로그인 진행 중에 warm)
// - Vercel Cron 이 주기적 호출 (fully idle 방지)

export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function GET() {
  const t0 = Date.now()
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  )
  // 3년치 RPC 각 1 row 씩 호출 → postgres 함수 planner 캐시 warm
  const results = await Promise.all([2024, 2025, 2026].map(y =>
    sb.rpc('get_revenue_page', { p_year: y, p_limit: 1, p_offset: 0 })
  ))
  const errors = results.filter(r => r.error).map(r => r.error?.message)
  return NextResponse.json({
    ok: errors.length === 0,
    ms: Date.now() - t0,
    errors,
  })
}
