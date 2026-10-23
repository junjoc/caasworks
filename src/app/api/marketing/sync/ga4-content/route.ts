import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { google } from 'googleapis'
import { gaSegmentFilter, andFilters } from '@/lib/ga-segment'
import { fetchBlogPublishDate } from '@/lib/blog-publish-date'
import { denyIfNotSignedIn } from '@/lib/api-auth'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

// GA4 Data API — 콘텐츠(블로그) 성과 조회
// 환경변수: GOOGLE_SERVICE_ACCOUNT_KEY (base64), GA4_PROPERTY_ID
// 글×날짜 행을 content_performance_daily 에 쌓고(기간별 집계용), content_performance 는 글 목록(제목·URL·발행일·누적)으로 쓴다.

const PUBLISH_DATE_FETCH_LIMIT = 40 // 한 번 동기화에 발행일을 가져올 글 수 (글 페이지를 하나씩 읽음)

export async function POST(request: NextRequest) {
  const denied = await denyIfNotSignedIn(request); if (denied) return denied
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

    // /blog/ 글 + 마케팅 사이트(www.caas.works)만
    const blogFilter = andFilters(
      { filter: { fieldName: 'pagePath', stringFilter: { matchType: 'BEGINS_WITH', value: '/blog/' } } },
      gaSegmentFilter('marketing', 'pagePath'),
    )

    // GA4 runReport 1 — 글×날짜 (기간별 집계용). 90일이면 보통 수천 행
    const dailyRows: { page_path: string; date: string; page_views: number; sessions: number; active_users: number }[] = []
    for (let offset = 0; ; offset += 10000) {
      const r = await analyticsData.properties.runReport({
        property: `properties/${propertyId}`,
        requestBody: {
          dateRanges: [{ startDate, endDate }],
          dimensions: [{ name: 'date' }, { name: 'pagePath' }],
          metrics: [{ name: 'screenPageViews' }, { name: 'sessions' }, { name: 'activeUsers' }],
          dimensionFilter: blogFilter,
          limit: '10000',
          offset: String(offset),
        },
      })
      const rows = r.data.rows || []
      for (const row of rows) {
        const d = row.dimensionValues?.[0]?.value || ''
        dailyRows.push({
          page_path: row.dimensionValues?.[1]?.value || '',
          date: d.length === 8 ? `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}` : d,
          page_views: Number(row.metricValues?.[0]?.value) || 0,
          sessions: Number(row.metricValues?.[1]?.value) || 0,
          active_users: Number(row.metricValues?.[2]?.value) || 0,
        })
      }
      if (rows.length < 10000) break
    }

    // GA4 runReport 2 — 글 목록(제목) + 기간 합계
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
        dimensionFilter: blogFilter,
        orderBys: [
          { metric: { metricName: 'screenPageViews' }, desc: true },
        ],
        limit: '1000',
      },
    })

    const rows = response.data.rows || []
    // 같은 글이 제목만 다르게(제목 수정 등) 여러 행으로 오면 조회가 많은 제목 하나로 합친다
    const byPath = new Map<string, { page_path: string; title: string; page_views: number; sessions: number; active_users: number }>()
    for (const row of rows) {
      const page_path = row.dimensionValues?.[0]?.value || ''
      const item = {
        page_path,
        title: row.dimensionValues?.[1]?.value || '(제목 없음)',
        page_views: Number(row.metricValues?.[0]?.value) || 0,
        sessions: Number(row.metricValues?.[1]?.value) || 0,
        active_users: Number(row.metricValues?.[2]?.value) || 0,
      }
      const ex = byPath.get(page_path)
      if (!ex) byPath.set(page_path, item)
      else { ex.page_views += item.page_views; ex.sessions += item.sessions; ex.active_users += item.active_users }
    }
    const contentData = Array.from(byPath.values())

    // 앱(app.caas.works) 경로 제외 필터 (P0-4). 마케팅 사이트 콘텐츠만 저장.
    const APP_PATH_PATTERNS = [
      /^\/cctv\//i, /^\/companies\//i, /^\/proxy\//i,
      /^\/control-dashboard/i, /^\/chat/i,
      /^\/users\//i, /^\/signup/i, /^\/login/i,
      /^\/fire-detections\//i, /^\/action\//i,
    ]
    const isAppPath = (p: string) => APP_PATH_PATTERNS.some(re => re.test(p))

    // 404/외부링크/무효 title 필터 (Q3 팀 관찰 2026-07-03)
    const isInvalidTitle = (t: string) => {
      const s = (t || '').toLowerCase()
      return s.includes('찾을 수 없음') || s.includes('not found') || s.includes('404')
        || s === '(제목 없음)' || s.trim() === ''
    }
    // page_path 가 외부 URL 이거나 http(s):// 로 시작하면 스킵
    const isExternalPath = (p: string) => /^https?:\/\//i.test(p) || p.includes('://')

    // Supabase에 upsert (page_path 기준)
    const supabase = createClient(supabaseUrl, supabaseKey)
    let savedCount = 0
    let skippedApp = 0
    let skipped404 = 0
    let skippedExternal = 0
    const errors: string[] = []
    const validPaths = new Set<string>()

    // 발행일이 비어 있는 글은 글 페이지에서 읽어온다 (한 번에 PUBLISH_DATE_FETCH_LIMIT 개까지)
    const { data: existing } = await supabase.from('content_performance').select('page_path, published_at').eq('channel', 'caasworks_blog')
    const hasDate = new Map((existing || []).map(r => [r.page_path, !!r.published_at]))
    let dateFetched = 0

    for (const item of contentData) {
      if (!item.page_path) continue
      if (isAppPath(item.page_path)) { skippedApp++; continue }
      if (isExternalPath(item.page_path)) { skippedExternal++; continue }
      if (isInvalidTitle(item.title)) { skipped404++; continue }
      validPaths.add(item.page_path)

      let published_at: string | null | undefined
      if (!hasDate.get(item.page_path) && dateFetched < PUBLISH_DATE_FETCH_LIMIT) {
        dateFetched++
        published_at = await fetchBlogPublishDate(item.page_path)
      }

      const { error } = await supabase
        .from('content_performance')
        .upsert({
          page_path: item.page_path,
          title: item.title,
          url: `https://caas.works${item.page_path}`,
          channel: 'caasworks_blog',
          // 기간 합계는 content_performance_daily 에서 계산. 여기 값은 마지막 동기화 범위의 합(참고용)
          page_views: item.page_views,
          sessions: item.sessions,
          active_users: item.active_users,
          ...(published_at ? { published_at } : {}),
          last_synced_at: new Date().toISOString(),
          is_manual: false,
        }, {
          onConflict: 'page_path',
        })
      if (error) {
        console.error(`[GA4 Content] upsert 실패 (${item.page_path}):`, error.message)
        errors.push(`${item.page_path}: ${error.message}`)
      } else {
        savedCount++
      }
    }

    // 글×날짜 행 upsert (유효한 글만, 500행씩)
    const daily = dailyRows.filter(r => validPaths.has(r.page_path)).map(r => ({ ...r, synced_at: new Date().toISOString() }))
    let dailySaved = 0
    for (let i = 0; i < daily.length; i += 500) {
      const { error } = await supabase.from('content_performance_daily').upsert(daily.slice(i, i + 500), { onConflict: 'page_path,date' })
      if (error) { errors.push(`daily: ${error.message}`); break }
      dailySaved += Math.min(500, daily.length - i)
    }

    return NextResponse.json({
      success: true,
      message: `GA4 콘텐츠 ${savedCount}/${contentData.length}건 · 일별 ${dailySaved}행 저장 (${startDate}~${endDate}, 앱 ${skippedApp} / 404 ${skipped404} / 외부 ${skippedExternal} 제외, 발행일 ${dateFetched}건 조회)`,
      count: savedCount,
      daily_count: dailySaved,
      published_dates_fetched: dateFetched,
      skipped_app: skippedApp,
      skipped_404: skipped404,
      skipped_external: skippedExternal,
      errors: errors.length > 0 ? errors.slice(0, 5) : undefined,
      data: contentData.filter(d => validPaths.has(d.page_path)),
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
