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

    const loginCustomerId = process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID

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
      `https://googleads.googleapis.com/v20/customers/${cleanCustomerId}/googleAds:searchStream`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${tokenData.access_token}`,
          'developer-token': developerToken,
          'Content-Type': 'application/json',
          // login-customer-id는 MCC 하위 계정 접근 시에만 필요 (직접 접근 가능한 경우 생략)
        },
        body: JSON.stringify({ query: gaqlQuery }),
      }
    )

    if (!adsRes.ok) {
      const errText = await adsRes.text()
      console.error('Google Ads API error:', errText)
      // 에러 상세 파싱
      let errorDetail = ''
      try {
        const errJson = JSON.parse(errText)
        errorDetail = errJson.error?.message || errJson.error?.status || errText.substring(0, 300)
      } catch {
        errorDetail = errText.substring(0, 300)
      }
      // 404 = Basic Access 미승인 또는 API 버전 문제
      const is404 = adsRes.status === 404
      const is403 = adsRes.status === 403
      return NextResponse.json({
        success: false,
        message: is404
          ? 'Google Ads API 접근 불가 — Basic Access 승인 대기 중입니다. Google Ads 콘솔에서 승인 상태를 확인해주세요.'
          : is403
          ? 'Google Ads API 권한 부족 — Developer Token 또는 계정 권한을 확인해주세요.'
          : `Google Ads API 오류 (${adsRes.status}): ${errorDetail}`,
        status: is404 ? 'pending_access' : 'api_error',
        debug: { httpStatus: adsRes.status, error: errorDetail },
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

    // ─── 캠페인 테이블에 구글 캠페인 등록/업데이트 ───
    const uniqueCampaignNames = Array.from(new Set(rows.map(r => r.campaign_name)))
    const campaignMap = new Map<string, string>() // name → db UUID

    for (const campName of uniqueCampaignNames) {
      // 이름으로 기존 캠페인 검색
      const { data: existing } = await supabase
        .from('campaigns').select('id').eq('name', campName).limit(1)

      if (existing && existing.length > 0) {
        campaignMap.set(campName, existing[0].id)
        // 채널 업데이트 (구글로 확인)
        await supabase.from('campaigns').update({
          channel: '구글',
          status: '진행중',
        }).eq('id', existing[0].id)
      } else {
        // 신규 캠페인 등록 — 해당 월 비용 합산으로 budget 추정
        const campRows = rows.filter(r => r.campaign_name === campName)
        const totalCost = campRows.reduce((sum, r) => sum + r.cost, 0)
        const { data: ins } = await supabase.from('campaigns').insert({
          name: campName,
          channel: '구글',
          status: '진행중',
          budget: totalCost,
        }).select('id').single()
        if (ins) campaignMap.set(campName, ins.id)
      }
    }

    console.log(`[Google Ads] 캠페인 ${campaignMap.size}개 등록/업데이트`)

    // ─── 기존 수동 입력 데이터 보존을 위해 먼저 조회 ───
    const { data: existingRows } = await supabase.from('ad_performance')
      .select('date, campaign_name, signups, inquiries, adoptions, signup_companies, inquiry_companies, adoption_companies, ga_visits, inquiry_clicks')
      .eq('channel', '구글').gte('date', startDate).lte('date', endDate)

    const manualDataMap = new Map<string, Record<string, any>>()
    existingRows?.forEach(r => {
      const key = `${r.date}|${r.campaign_name}`
      if ((r.signups || 0) > 0 || (r.inquiries || 0) > 0 || (r.adoptions || 0) > 0 ||
          (r.ga_visits || 0) > 0 || (r.inquiry_clicks || 0) > 0 ||
          r.signup_companies || r.inquiry_companies || r.adoption_companies) {
        manualDataMap.set(key, {
          signups: r.signups || 0,
          inquiries: r.inquiries || 0,
          adoptions: r.adoptions || 0,
          signup_companies: r.signup_companies || null,
          inquiry_companies: r.inquiry_companies || null,
          adoption_companies: r.adoption_companies || null,
          ga_visits: r.ga_visits || 0,
          inquiry_clicks: r.inquiry_clicks || 0,
        })
      }
    })

    const upsertRows = rows.map(r => {
      const manualKey = `${r.date}|${r.campaign_name}`
      const manual = manualDataMap.get(manualKey)
      return {
        date: r.date,
        channel: '구글',
        ad_type: '검색',
        campaign_name: r.campaign_name,
        campaign_id: campaignMap.get(r.campaign_name) || null,
        impressions: r.impressions,
        clicks: r.clicks,
        cost: r.cost,
        conversions: r.conversions,
        signups: manual?.signups || 0,
        inquiries: manual?.inquiries || 0,
        adoptions: manual?.adoptions || 0,
        ga_visits: manual?.ga_visits || 0,
        inquiry_clicks: manual?.inquiry_clicks || 0,
        signup_companies: manual?.signup_companies || null,
        inquiry_companies: manual?.inquiry_companies || null,
        adoption_companies: manual?.adoption_companies || null,
      }
    })

    // 기존 데이터 삭제 후 삽입 (수동 입력값은 위에서 보존됨)
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
