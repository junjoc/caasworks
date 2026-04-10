import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { google } from 'googleapis'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

// GA4 Data API — 페이지별 유입/이탈 분석 데이터
// 랜딩페이지별 유입 채널, 페이지별 조회수/세션/바운스율

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    // 날짜 미지정 시 최근 90일 기본값
    const today = new Date()
    const ago90 = new Date(today)
    ago90.setDate(ago90.getDate() - 90)
    const toYMD = (d: Date) => d.toISOString().split('T')[0]

    const startDate = body.startDate || toYMD(ago90)
    const endDate = body.endDate || toYMD(today)

    const serviceAccountKeyBase64 = process.env.GOOGLE_SERVICE_ACCOUNT_KEY
    const propertyId = process.env.GA4_PROPERTY_ID || '455467446'

    if (!serviceAccountKeyBase64) {
      return NextResponse.json({
        success: false,
        message: 'Google 서비스 계정 키가 설정되지 않았습니다.',
        status: 'not_configured',
      })
    }

    let credentials
    try {
      const decoded = Buffer.from(serviceAccountKeyBase64, 'base64').toString('utf-8')
      credentials = JSON.parse(decoded)
    } catch {
      return NextResponse.json({
        success: false,
        message: 'GOOGLE_SERVICE_ACCOUNT_KEY 파싱 실패',
        status: 'config_error',
      })
    }

    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ['https://www.googleapis.com/auth/analytics.readonly'],
    })

    const analyticsData = google.analyticsdata({ version: 'v1beta', auth })

    // ─── Report 1: 랜딩페이지별 채널 유입 ───
    const landingReport = await analyticsData.properties.runReport({
      property: `properties/${propertyId}`,
      requestBody: {
        dateRanges: [{ startDate, endDate }],
        dimensions: [
          { name: 'landingPage' },
          { name: 'sessionDefaultChannelGroup' },
        ],
        metrics: [
          { name: 'sessions' },
          { name: 'activeUsers' },
          { name: 'bounceRate' },
          { name: 'averageSessionDuration' },
          { name: 'engagedSessions' },
          { name: 'screenPageViews' },
        ],
        orderBys: [
          { metric: { metricName: 'sessions' }, desc: true },
        ],
        limit: '500',
      },
    })

    // ─── Report 2: 전체 페이지별 조회 데이터 ───
    const pageReport = await analyticsData.properties.runReport({
      property: `properties/${propertyId}`,
      requestBody: {
        dateRanges: [{ startDate, endDate }],
        dimensions: [
          { name: 'pagePath' },
        ],
        metrics: [
          { name: 'screenPageViews' },
          { name: 'sessions' },
          { name: 'activeUsers' },
          { name: 'averageSessionDuration' },
          { name: 'bounceRate' },
          { name: 'engagedSessions' },
        ],
        orderBys: [
          { metric: { metricName: 'screenPageViews' }, desc: true },
        ],
        limit: '500',
      },
    })

    // ─── Report 3: 채널별 전체 요약 ───
    const channelReport = await analyticsData.properties.runReport({
      property: `properties/${propertyId}`,
      requestBody: {
        dateRanges: [{ startDate, endDate }],
        dimensions: [
          { name: 'sessionDefaultChannelGroup' },
        ],
        metrics: [
          { name: 'sessions' },
          { name: 'activeUsers' },
          { name: 'bounceRate' },
          { name: 'averageSessionDuration' },
          { name: 'engagedSessions' },
          { name: 'screenPageViews' },
          { name: 'conversions' },
        ],
        orderBys: [
          { metric: { metricName: 'sessions' }, desc: true },
        ],
      },
    })

    // ─── Parse results ───
    const landingPages = (landingReport.data.rows || []).map(row => ({
      landingPage: row.dimensionValues?.[0]?.value || '',
      channel: row.dimensionValues?.[1]?.value || '',
      sessions: Number(row.metricValues?.[0]?.value) || 0,
      activeUsers: Number(row.metricValues?.[1]?.value) || 0,
      bounceRate: Number(row.metricValues?.[2]?.value) || 0,
      avgDuration: Number(row.metricValues?.[3]?.value) || 0,
      engagedSessions: Number(row.metricValues?.[4]?.value) || 0,
      pageViews: Number(row.metricValues?.[5]?.value) || 0,
    }))

    const pages = (pageReport.data.rows || []).map(row => ({
      pagePath: row.dimensionValues?.[0]?.value || '',
      pageViews: Number(row.metricValues?.[0]?.value) || 0,
      sessions: Number(row.metricValues?.[1]?.value) || 0,
      activeUsers: Number(row.metricValues?.[2]?.value) || 0,
      avgDuration: Number(row.metricValues?.[3]?.value) || 0,
      bounceRate: Number(row.metricValues?.[4]?.value) || 0,
      engagedSessions: Number(row.metricValues?.[5]?.value) || 0,
      entrances: 0,
    }))

    const channels = (channelReport.data.rows || []).map(row => ({
      channel: row.dimensionValues?.[0]?.value || '',
      sessions: Number(row.metricValues?.[0]?.value) || 0,
      activeUsers: Number(row.metricValues?.[1]?.value) || 0,
      bounceRate: Number(row.metricValues?.[2]?.value) || 0,
      avgDuration: Number(row.metricValues?.[3]?.value) || 0,
      engagedSessions: Number(row.metricValues?.[4]?.value) || 0,
      pageViews: Number(row.metricValues?.[5]?.value) || 0,
      conversions: Number(row.metricValues?.[6]?.value) || 0,
    }))

    // ─── 이탈 페이지 추정: 바운스율 높은 + 진입은 많은데 engagement 낮은 페이지 ───
    const exitPages = pages
      .filter(p => p.sessions > 0)
      .map(p => ({
        ...p,
        exitRate: p.sessions > 0 ? ((p.sessions - p.engagedSessions) / p.sessions * 100) : 0,
        nonEngagedSessions: p.sessions - p.engagedSessions,
      }))
      .sort((a, b) => b.nonEngagedSessions - a.nonEngagedSessions)

    // ─── Supabase traffic_analytics에 페이지별 데이터 저장 ───
    const supabase = createClient(supabaseUrl, supabaseKey)

    // 기존 데이터 삭제 (해당 기간)
    await supabase.from('traffic_analytics')
      .delete()
      .gte('analytics_date', startDate)
      .lte('analytics_date', endDate)

    // 채널 요약 데이터 저장
    if (channels.length > 0) {
      const rows = channels.map(ch => ({
        analytics_date: startDate,
        source: ch.channel,
        sessions: ch.sessions,
        users: ch.activeUsers,
        page_views: ch.pageViews,
        bounce_rate: Math.round(ch.bounceRate * 100) / 100,
        conversion_rate: ch.sessions > 0 ? Math.round(ch.conversions / ch.sessions * 10000) / 100 : 0,
        conversions: ch.conversions,
        notes: JSON.stringify({
          avgDuration: Math.round(ch.avgDuration),
          engagedSessions: ch.engagedSessions,
          engagementRate: ch.sessions > 0 ? Math.round(ch.engagedSessions / ch.sessions * 100) : 0,
        }),
      }))
      await supabase.from('traffic_analytics').insert(rows)
    }

    return NextResponse.json({
      success: true,
      data: {
        landingPages,
        pages,
        channels,
        exitPages: exitPages.slice(0, 30),
      },
      summary: {
        totalSessions: channels.reduce((s, c) => s + c.sessions, 0),
        totalUsers: channels.reduce((s, c) => s + c.activeUsers, 0),
        totalPageViews: channels.reduce((s, c) => s + c.pageViews, 0),
        avgBounceRate: channels.length > 0
          ? Math.round(channels.reduce((s, c) => s + c.bounceRate * c.sessions, 0) / channels.reduce((s, c) => s + c.sessions, 0) * 100) / 100
          : 0,
        landingPageCount: new Set(landingPages.map(l => l.landingPage)).size,
        channelCount: channels.length,
      },
    })
  } catch (err: any) {
    console.error('[GA4 Pages Sync Error]', err)
    return NextResponse.json({
      success: false,
      message: err.message || 'GA4 페이지 데이터 조회 실패',
    }, { status: 500 })
  }
}
