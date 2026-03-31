import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

// Google Ads API 동기화
// 환경변수: GOOGLE_ADS_CUSTOMER_ID, GOOGLE_ADS_DEVELOPER_TOKEN, GOOGLE_ADS_REFRESH_TOKEN, GOOGLE_ADS_CLIENT_ID, GOOGLE_ADS_CLIENT_SECRET

export async function POST(request: NextRequest) {
  try {
    const { year, month } = await request.json()

    if (!year || !month) {
      return NextResponse.json({ error: 'year, month 필수' }, { status: 400 })
    }

    // API 키 확인
    const customerId = process.env.GOOGLE_ADS_CUSTOMER_ID
    const developerToken = process.env.GOOGLE_ADS_DEVELOPER_TOKEN
    const refreshToken = process.env.GOOGLE_ADS_REFRESH_TOKEN
    const clientId = process.env.GOOGLE_ADS_CLIENT_ID
    const clientSecret = process.env.GOOGLE_ADS_CLIENT_SECRET

    if (!customerId || !developerToken || !refreshToken) {
      return NextResponse.json({
        success: false,
        message: 'Google Ads API 키가 설정되지 않았습니다. 환경변수(GOOGLE_ADS_CUSTOMER_ID, GOOGLE_ADS_DEVELOPER_TOKEN, GOOGLE_ADS_REFRESH_TOKEN)를 설정하세요.',
        status: 'not_configured',
      })
    }

    // 1. OAuth2 액세스 토큰 획득
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId || '',
        client_secret: clientSecret || '',
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
      }),
    })
    const tokenData = await tokenRes.json()

    if (!tokenData.access_token) {
      return NextResponse.json({
        success: false,
        message: 'Google OAuth 토큰 갱신 실패: ' + (tokenData.error_description || tokenData.error),
        status: 'auth_error',
      })
    }

    // 2. Google Ads API 쿼리 — 캠페인별 일별 성과
    const startDate = `${year}-${String(month).padStart(2, '0')}-01`
    const lastDay = new Date(year, month, 0).getDate()
    const endDate = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`

    const gaqlQuery = `
      SELECT
        campaign.id,
        campaign.name,
        segments.date,
        metrics.impressions,
        metrics.clicks,
        metrics.cost_micros,
        metrics.conversions
      FROM campaign
      WHERE segments.date BETWEEN '${startDate}' AND '${endDate}'
        AND campaign.status != 'REMOVED'
      ORDER BY segments.date DESC
    `

    const cleanCustomerId = customerId.replace(/-/g, '')
    const adsRes = await fetch(
      `https://googleads.googleapis.com/v17/customers/${cleanCustomerId}/googleAds:searchStream`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${tokenData.access_token}`,
          'developer-token': developerToken,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ query: gaqlQuery }),
      }
    )

    if (!adsRes.ok) {
      const errText = await adsRes.text()
      console.error('Google Ads API error:', errText)
      return NextResponse.json({
        success: false,
        message: 'Google Ads API 호출 실패',
        status: 'api_error',
      })
    }

    const adsData = await adsRes.json()
    const rows: Array<{
      date: string
      campaign_name: string
      impressions: number
      clicks: number
      cost: number
      conversions: number
    }> = []

    // searchStream은 배열 형태로 결과 반환
    if (Array.isArray(adsData)) {
      for (const batch of adsData) {
        if (batch.results) {
          for (const result of batch.results) {
            rows.push({
              date: result.segments.date,
              campaign_name: result.campaign.name,
              impressions: Number(result.metrics.impressions) || 0,
              clicks: Number(result.metrics.clicks) || 0,
              cost: Math.round((Number(result.metrics.costMicros) || 0) / 1_000_000),
              conversions: Math.round(Number(result.metrics.conversions) || 0),
            })
          }
        }
      }
    }

    if (rows.length === 0) {
      return NextResponse.json({
        success: true,
        message: '해당 기간 데이터 없음',
        count: 0,
      })
    }

    // 3. Supabase에 upsert
    const supabase = createClient(supabaseUrl, supabaseKey)

    // campaigns 테이블에서 이름 → id 매핑
    const { data: campaigns } = await supabase
      .from('campaigns')
      .select('id, name')

    const campaignMap = new Map<string, string>()
    campaigns?.forEach(c => campaignMap.set(c.name, c.id))

    const upsertRows = rows.map(r => ({
      date: r.date,
      channel: '구글',
      ad_type: '검색',
      campaign_name: r.campaign_name,
      campaign_id: campaignMap.get(r.campaign_name) || null,
      impressions: r.impressions,
      clicks: r.clicks,
      cost: r.cost,
      conversions: r.conversions,
      signups: 0,
      inquiries: 0,
      adoptions: 0,
    }))

    // 기존 데이터 삭제 후 삽입 (해당 월, 구글 채널)
    await supabase
      .from('ad_performance')
      .delete()
      .eq('channel', '구글')
      .gte('date', startDate)
      .lte('date', endDate)

    const { error: insertError } = await supabase
      .from('ad_performance')
      .insert(upsertRows)

    if (insertError) {
      return NextResponse.json({
        success: false,
        message: '데이터 저장 실패: ' + insertError.message,
        status: 'db_error',
      })
    }

    return NextResponse.json({
      success: true,
      message: `구글 광고 ${rows.length}건 동기화 완료`,
      count: rows.length,
    })
  } catch (error) {
    console.error('Google Ads sync error:', error)
    return NextResponse.json({ error: '동기화 실패' }, { status: 500 })
  }
}
