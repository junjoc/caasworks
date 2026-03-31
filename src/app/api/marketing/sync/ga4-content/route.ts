import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { google } from 'googleapis'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

// GA4 Data API — 콘텐츠(블로그) 성과 조회
// 환경변수: GOOGLE_SERVICE_ACCOUNT_KEY (base64), GA4_PROPERTY_ID

export async function POST(request: NextRequest) {
  try {
    const { startDate, endDate } = await request.json()

    if (!startDate || !endDate) {
      return NextResponse.json({ error: 'startDate, endDate 필수' }, { status: 400 })
    }

    const serviceAccountKeyBase64 = process.env.GOOGLE_SERVICE_ACCOUNT_KEY
    const propertyId = process.env.GA4_PROPERTY_ID || '455467446'

    if (!serviceAccountKeyBase64) {
      return NextResponse.json({
        success: false,
        message: 'Google 서비스 계정 키가 설정되지 않았습니다. 환경변수(GOOGLE_SERVICE_ACCOUNT_KEY)를 확인하세요.',
        status: 'not_configured',
      })
    }

    // 서비스 계정 인증
    let credentials
    try {
      const decoded = Buffer.from(serviceAccountKeyBase64, 'base64').toString('utf-8')
      credentials = JSON.parse(decoded)
    } catch {
      return NextResponse.json({
        success: false,
        message: 'GOOGLE_SERVICE_ACCOUNT_KEY 파싱 실패 (올바른 base64 JSON인지 확인)',
        status: 'config_error',
      })
    }

    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ['https://www.googleapis.com/auth/analytics.readonly'],
    })

    const analyticsData = google.analyticsdata({ version: 'v1beta', auth })

    // GA4 runReport — 블로그 페이지 성과
    const response = await analyticsData.properties.runReport({
      property: `properties/${propertyId}`,
      requestBody: {
        dateRanges: [{ startDate, endDate }],
        dimensions: [
          { name: 'pagePath' },
          { name: 'pageTitle' },
        ],
        metrics: [
          { name: 'screenPageViews' },
          { name: 'sessions' },
          { name: 'activeUsers' },
        ],
        dimensionFilter: {
          filter: {
            fieldName: 'pagePath',
            stringFilter: {
              matchType: 'BEGINS_WITH',
              value: '/blog/',
            },
          },
        },
        orderBys: [
          { metric: { metricName: 'screenPageViews' }, desc: true },
        ],
        limit: '100',
      },
    })

    const rows = response.data.rows || []
    const contentData = rows.map(row => ({
      page_path: row.dimensionValues?.[0]?.value || '',
      title: row.dimensionValues?.[1]?.value || '(제목 없음)',
      page_views: Number(row.metricValues?.[0]?.value) || 0,
      sessions: Number(row.metricValues?.[1]?.value) || 0,
      active_users: Number(row.metricValues?.[2]?.value) || 0,
    }))

    // Supabase에 upsert (page_path 기준)
    const supabase = createClient(supabaseUrl, supabaseKey)

    for (const item of contentData) {
      if (!item.page_path) continue
      await supabase
        .from('content_performance')
        .upsert({
          page_path: item.page_path,
          title: item.title,
          url: `https://caas.works${item.page_path}`,
          channel: 'caasworks_blog',
          page_views: item.page_views,
          sessions: item.sessions,
          active_users: item.active_users,
          last_synced_at: new Date().toISOString(),
          is_manual: false,
        }, {
          onConflict: 'page_path',
        })
    }

    return NextResponse.json({
      success: true,
      message: `GA4 콘텐츠 ${contentData.length}건 동기화 완료`,
      count: contentData.length,
      data: contentData,
    })
  } catch (error: unknown) {
    console.error('GA4 content sync error:', error)
    const message = error instanceof Error ? error.message : '알 수 없는 오류'

    // GA4 권한 오류 안내
    if (message.includes('403') || message.includes('permission')) {
      return NextResponse.json({
        success: false,
        message: 'GA4 속성에 서비스 계정 권한이 없습니다. GA4 관리 > 속성 > 속성 액세스 관리에서 서비스 계정(crm-calendar@certain-rune-491109-q5.iam.gserviceaccount.com)에 뷰어 권한을 추가해주세요.',
        status: 'permission_error',
      })
    }

    return NextResponse.json({ error: '동기화 실패: ' + message }, { status: 500 })
  }
}
