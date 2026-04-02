import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

// 디버그 엔드포인트 — ad_performance 테이블 접근 테스트
export async function GET(request: NextRequest) {
  const url = new URL(request.url)
  const year = Number(url.searchParams.get('year')) || new Date().getFullYear()
  const month = Number(url.searchParams.get('month')) || (new Date().getMonth() + 1)

  const startDate = `${year}-${String(month).padStart(2, '0')}-01`
  const lastDay = new Date(year, month, 0).getDate()
  const endDate = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`

  const supabase = createClient(supabaseUrl, supabaseKey)

  // 1. ad_performance 조회
  const { data: adsData, error: adsError, count: adsCount } = await supabase
    .from('ad_performance')
    .select('*', { count: 'exact' })
    .gte('date', startDate)
    .lte('date', endDate)
    .order('date', { ascending: false })
    .limit(5)

  // 2. campaigns 조회
  const { data: campData, error: campError } = await supabase
    .from('campaigns')
    .select('id, name, channel, status')
    .limit(20)

  // 3. 테이블 컬럼 확인 (첫 행만)
  const { data: sampleRow, error: sampleError } = await supabase
    .from('ad_performance')
    .select('*')
    .limit(1)

  return NextResponse.json({
    keyType: supabaseKey.startsWith('sb_publishable') ? 'publishable' : supabaseKey.startsWith('eyJ') ? 'jwt/service' : 'unknown',
    ad_performance: {
      totalCount: adsCount,
      sampleCount: adsData?.length || 0,
      error: adsError ? { message: adsError.message, code: adsError.code, details: adsError.details, hint: adsError.hint } : null,
      columns: sampleRow && sampleRow.length > 0 ? Object.keys(sampleRow[0]) : [],
      sampleError: sampleError ? { message: sampleError.message, code: sampleError.code } : null,
      firstRow: adsData && adsData.length > 0 ? adsData[0] : null,
    },
    campaigns: {
      count: campData?.length || 0,
      error: campError ? { message: campError.message, code: campError.code } : null,
      data: campData?.slice(0, 5) || [],
    },
    dateRange: { startDate, endDate },
  })
}
