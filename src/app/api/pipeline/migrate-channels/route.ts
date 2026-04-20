import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

/**
 * 기존 파이프라인 리드의 레거시 채널명을 통합 채널명으로 일괄 변환
 * POST /api/pipeline/migrate-channels
 */

const LEGACY_MAP: Record<string, string> = {
  '문의하기': '자사채널',
  '공식홈페이지': '자사채널',
  '검색채널': '검색유입',
  '이용자 추천': '추천',
  '박람회': '이벤트/행사',
}

export async function POST(request: NextRequest) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  )

  const results: { channel: string; count: number }[] = []

  for (const [oldCh, newCh] of Object.entries(LEGACY_MAP)) {
    const { data, error } = await supabase
      .from('pipeline_leads')
      .update({ inquiry_channel: newCh })
      .eq('inquiry_channel', oldCh)
      .select('id')

    if (error) {
      return NextResponse.json({ error: `Failed to migrate "${oldCh}": ${error.message}` }, { status: 500 })
    }

    results.push({ channel: `${oldCh} → ${newCh}`, count: data?.length || 0 })
  }

  const totalMigrated = results.reduce((s, r) => s + r.count, 0)

  return NextResponse.json({
    success: true,
    total_migrated: totalMigrated,
    details: results,
  })
}
