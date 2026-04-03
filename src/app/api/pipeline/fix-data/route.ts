import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  )
}

export async function POST(request: NextRequest) {
  try {
    const { action } = await request.json()
    const supabase = getSupabase()

    if (action === 'fix-teambooster-march') {
      // 팀부스터 캠페인의 3월 ad_performance 데이터에서 channel '블로그' → '기타' 수정

      // 1. 팀부스터 캠페인 ID 찾기
      const { data: campaigns } = await supabase
        .from('marketing_campaigns')
        .select('id, campaign_name, channel')
        .ilike('campaign_name', '%팀부스터%')

      if (!campaigns || campaigns.length === 0) {
        return NextResponse.json({ error: '팀부스터 캠페인을 찾을 수 없습니다' }, { status: 404 })
      }

      const campaignIds = campaigns.map(c => c.id)

      // 2. 3월 데이터에서 channel이 '블로그'인 것을 찾아서 '기타'로 수정
      const { data: marchData, error: fetchError } = await supabase
        .from('ad_performance')
        .select('id, date, channel, campaign_name, cost')
        .in('campaign_id', campaignIds)
        .gte('date', '2026-03-01')
        .lte('date', '2026-03-31')
        .eq('channel', '블로그')

      if (fetchError) {
        return NextResponse.json({ error: fetchError.message }, { status: 500 })
      }

      if (!marchData || marchData.length === 0) {
        // campaign_id가 없을 수 있으므로 campaign_name으로도 검색
        const { data: byName, error: nameError } = await supabase
          .from('ad_performance')
          .select('id, date, channel, campaign_name, cost')
          .ilike('campaign_name', '%팀부스터%')
          .gte('date', '2026-03-01')
          .lte('date', '2026-03-31')
          .eq('channel', '블로그')

        if (nameError || !byName || byName.length === 0) {
          // 더 넓은 범위로 검색
          const { data: allMarch } = await supabase
            .from('ad_performance')
            .select('id, date, channel, campaign_name, cost, campaign_id')
            .gte('date', '2026-03-01')
            .lte('date', '2026-03-31')
            .eq('channel', '블로그')

          return NextResponse.json({
            message: '팀부스터 3월 블로그 채널 데이터를 찾을 수 없습니다',
            campaigns,
            allBlogMarch: allMarch,
          })
        }

        // campaign_name으로 찾은 데이터 수정
        for (const row of byName) {
          await supabase
            .from('ad_performance')
            .update({ channel: '기타' })
            .eq('id', row.id)
        }

        return NextResponse.json({
          success: true,
          message: `${byName.length}건 수정 완료 (campaign_name 기준)`,
          fixed: byName,
        })
      }

      // campaign_id로 찾은 데이터 수정
      for (const row of marchData) {
        await supabase
          .from('ad_performance')
          .update({ channel: '기타' })
          .eq('id', row.id)
      }

      return NextResponse.json({
        success: true,
        message: `${marchData.length}건 수정 완료`,
        fixed: marchData,
      })
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  } catch (error: any) {
    console.error('Fix data error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
