import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { google } from 'googleapis'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

// GA4 Data API — 유입 소스별 일별 데이터 조회
// 검색유입(네이버/구글/생성형AI), 자사채널(홈페이지/깃북/해피톡), 블로그(네이버/티스토리/아이콘)
// → ad_performance 테이블에 오가닉 채널 데이터로 저장

// ─── 소스 매핑 규칙 ───
interface ChannelMapping {
  channel: string      // ad_performance.channel
  campaign_name: string // ad_performance.campaign_name (서브소스)
}

function mapSourceToChannel(source: string, medium: string): ChannelMapping | null {
  const src = (source || '').toLowerCase()
  const med = (medium || '').toLowerCase()

  // ─── 검색유입 (오가닉 검색) ───
  if (med === 'organic' || med === 'organic search') {
    if (src.includes('naver') || src.includes('search.naver')) {
      return { channel: '검색유입', campaign_name: '네이버' }
    }
    if (src.includes('google')) {
      return { channel: '검색유입', campaign_name: '구글' }
    }
    if (src.includes('daum') || src.includes('zum') || src.includes('bing') || src.includes('yahoo')) {
      return { channel: '검색유입', campaign_name: '기타' }
    }
    // 기타 오가닉 검색
    return { channel: '검색유입', campaign_name: '기타' }
  }

  // ─── 생성형AI 검색 ───
  if (
    src.includes('chatgpt') || src.includes('openai') ||
    src.includes('perplexity') || src.includes('claude') || src.includes('anthropic') ||
    src.includes('bard') || src.includes('gemini') ||
    src.includes('copilot') || src.includes('bing-chat') ||
    src.includes('you.com') || src.includes('phind') ||
    src.includes('ai-search') || src.includes('searchgpt')
  ) {
    return { channel: '검색유입', campaign_name: '생성형AI' }
  }

  // ─── 자사채널 ───
  // 직접 유입 (direct)
  if (src === '(direct)' && (med === '(none)' || med === 'none')) {
    return { channel: '자사채널', campaign_name: '홈페이지' }
  }
  // caas.works 자체 도메인 유입
  if (src.includes('caas.works') || src.includes('caasworks')) {
    return { channel: '자사채널', campaign_name: '홈페이지' }
  }
  // 깃북
  if (src.includes('gitbook') || src.includes('docs.caas')) {
    return { channel: '자사채널', campaign_name: '깃북' }
  }
  // 해피톡 / 채널톡
  if (src.includes('happytalk') || src.includes('channel.io') || src.includes('채널톡')) {
    return { channel: '자사채널', campaign_name: '해피톡' }
  }

  // ─── 블로그 (referral) ───
  if (med === 'referral' || med === 'social') {
    if (src.includes('blog.naver') || src.includes('m.blog.naver') || (src.includes('naver') && !src.includes('search'))) {
      return { channel: '블로그', campaign_name: '네이버' }
    }
    if (src.includes('tistory')) {
      return { channel: '블로그', campaign_name: '티스토리' }
    }
    if (src.includes('brunch')) {
      return { channel: '블로그', campaign_name: '기타' }
    }
    // 아이콘 (icon.kr 등)
    if (src.includes('icon')) {
      return { channel: '블로그', campaign_name: '아이콘' }
    }
  }

  // ─── 언론 ───
  if (med === 'referral') {
    const newsKeywords = ['news', 'press', 'media', 'herald', 'chosun', 'donga', 'joongang', 'hani', 'khan', 'mk', 'sedaily', 'etnews', 'zdnet', 'bloter', 'venturesquare', 'platum', 'byline']
    if (newsKeywords.some(kw => src.includes(kw))) {
      return { channel: '언론', campaign_name: src }
    }
  }

  // 매핑 안 되는 소스는 null (무시)
  return null
}

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

    // GA4 runReport — 소스/매체별 일별 유입 데이터
    const response = await analyticsData.properties.runReport({
      property: `properties/${propertyId}`,
      requestBody: {
        dateRanges: [{ startDate, endDate }],
        dimensions: [
          { name: 'date' },           // YYYYMMDD
          { name: 'sessionSource' },   // naver, google, (direct), ...
          { name: 'sessionMedium' },   // organic, referral, (none), ...
        ],
        metrics: [
          { name: 'sessions' },        // 세션 수 → ga_visits로 사용
          { name: 'activeUsers' },     // 활성 사용자
          { name: 'screenPageViews' }, // 페이지뷰
          { name: 'conversions' },     // 전환 (설정된 경우)
        ],
        orderBys: [
          { dimension: { dimensionName: 'date' }, desc: true },
        ],
        limit: '10000',
      },
    })

    const gaRows = response.data.rows || []
    console.log(`[GA4 Sources] ${gaRows.length}개 소스/매체 행 조회`)

    // ─── GA4 데이터를 채널별로 집계 ───
    // 키: date|channel|campaign_name → { ga_visits, active_users, page_views, sources }
    const aggregated = new Map<string, {
      date: string
      channel: string
      campaign_name: string
      ga_visits: number
      active_users: number
      page_views: number
      conversions: number
      sources: Map<string, number>  // 실제 소스명 → 세션 수 (비고용)
    }>()

    for (const row of gaRows) {
      const rawDate = row.dimensionValues?.[0]?.value || ''   // YYYYMMDD
      const source = row.dimensionValues?.[1]?.value || ''
      const medium = row.dimensionValues?.[2]?.value || ''
      const sessions = Number(row.metricValues?.[0]?.value) || 0
      const users = Number(row.metricValues?.[1]?.value) || 0
      const views = Number(row.metricValues?.[2]?.value) || 0
      const convs = Number(row.metricValues?.[3]?.value) || 0

      // 날짜 변환 YYYYMMDD → YYYY-MM-DD
      const dateStr = rawDate.length === 8
        ? `${rawDate.slice(0, 4)}-${rawDate.slice(4, 6)}-${rawDate.slice(6, 8)}`
        : rawDate

      const mapping = mapSourceToChannel(source, medium)
      if (!mapping) continue

      const key = `${dateStr}|${mapping.channel}|${mapping.campaign_name}`
      const existing = aggregated.get(key)

      if (existing) {
        existing.ga_visits += sessions
        existing.active_users += users
        existing.page_views += views
        existing.conversions += convs
        // 실제 소스 추적 (기타/생성형AI 등에서 상세 내역 파악용)
        existing.sources.set(source, (existing.sources.get(source) || 0) + sessions)
      } else {
        const sources = new Map<string, number>()
        sources.set(source, sessions)
        aggregated.set(key, {
          date: dateStr,
          channel: mapping.channel,
          campaign_name: mapping.campaign_name,
          ga_visits: sessions,
          active_users: users,
          page_views: views,
          conversions: convs,
          sources,
        })
      }
    }

    console.log(`[GA4 Sources] ${aggregated.size}개 채널/소스 집계`)

    if (aggregated.size === 0) {
      return NextResponse.json({
        success: true,
        message: '해당 기간 유입 데이터 없음',
        count: 0,
      })
    }

    // ─── Supabase에 저장 ───
    const supabase = createClient(supabaseUrl, supabaseKey)
    const organicChannels = ['검색유입', '자사채널', '블로그', '언론']

    // 기존 수동 입력 데이터(문의/도입 등) 보존을 위해 먼저 조회
    const { data: existingRows } = await supabase.from('ad_performance')
      .select('date, channel, campaign_name, signups, inquiries, adoptions, signup_companies, inquiry_companies, adoption_companies, inquiry_clicks')
      .in('channel', organicChannels)
      .gte('date', startDate)
      .lte('date', endDate)

    const manualDataMap = new Map<string, Record<string, any>>()
    existingRows?.forEach(r => {
      const key = `${r.date}|${r.channel}|${r.campaign_name}`
      if ((r.signups || 0) > 0 || (r.inquiries || 0) > 0 || (r.adoptions || 0) > 0 ||
          (r.inquiry_clicks || 0) > 0 ||
          r.signup_companies || r.inquiry_companies || r.adoption_companies) {
        manualDataMap.set(key, {
          signups: r.signups || 0,
          inquiries: r.inquiries || 0,
          adoptions: r.adoptions || 0,
          inquiry_clicks: r.inquiry_clicks || 0,
          signup_companies: r.signup_companies || null,
          inquiry_companies: r.inquiry_companies || null,
          adoption_companies: r.adoption_companies || null,
        })
      }
    })

    // 기존 오가닉 채널 데이터 삭제 (수동 입력은 위에서 보존)
    await supabase.from('ad_performance')
      .delete()
      .in('channel', organicChannels)
      .gte('date', startDate)
      .lte('date', endDate)

    // 삽입할 행 생성
    const insertRows = Array.from(aggregated.values()).map(r => {
      const key = `${r.date}|${r.channel}|${r.campaign_name}`
      const manual = manualDataMap.get(key)

      // 비고(notes)에 실제 유입 소스 상세 기록 (기타/생성형AI 등)
      let notes: string | null = null
      if (r.sources.size > 0 && (r.campaign_name === '기타' || r.campaign_name === '생성형AI')) {
        const sourceList = Array.from(r.sources.entries())
          .sort((a, b) => b[1] - a[1])
          .map(([src, cnt]) => `${src}(${cnt})`)
          .join(', ')
        notes = sourceList
      }

      return {
        date: r.date,
        channel: r.channel,
        ad_type: '콘텐츠',
        campaign_name: r.campaign_name,
        campaign_id: null,
        impressions: 0,                  // 오가닉은 노출 없음
        clicks: 0,                       // 오가닉은 광고 클릭 없음
        cost: 0,                         // 오가닉은 비용 0
        conversions: r.conversions,
        ga_visits: r.ga_visits,          // 세션 수
        inquiry_clicks: manual?.inquiry_clicks || 0,
        signups: manual?.signups || 0,
        inquiries: manual?.inquiries || 0,
        adoptions: manual?.adoptions || 0,
        signup_companies: manual?.signup_companies || null,
        inquiry_companies: manual?.inquiry_companies || null,
        adoption_companies: manual?.adoption_companies || null,
        notes,
      }
    })

    const { error: insertError } = await supabase
      .from('ad_performance')
      .insert(insertRows)

    if (insertError) {
      console.error('[GA4 Sources] DB 저장 실패:', insertError.message)
      return NextResponse.json({
        success: false,
        message: 'DB 저장 실패: ' + insertError.message,
        status: 'db_error',
      })
    }

    // ─── 결과 요약 ───
    const summary: Record<string, number> = {}
    for (const r of insertRows) {
      const label = `${r.channel}/${r.campaign_name}`
      summary[label] = (summary[label] || 0) + r.ga_visits
    }

    return NextResponse.json({
      success: true,
      message: `유입 소스 ${insertRows.length}건 동기화 완료`,
      count: insertRows.length,
      summary,
    })
  } catch (error: unknown) {
    console.error('GA4 sources sync error:', error)
    const message = error instanceof Error ? error.message : '알 수 없는 오류'

    if (message.includes('403') || message.includes('permission')) {
      return NextResponse.json({
        success: false,
        message: 'GA4 속성에 서비스 계정 권한이 없습니다.',
        status: 'permission_error',
      })
    }

    return NextResponse.json({ error: '동기화 실패: ' + message }, { status: 500 })
  }
}
