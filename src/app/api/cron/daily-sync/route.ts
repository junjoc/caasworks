import { NextRequest, NextResponse } from 'next/server'

// Vercel Cron Job — 매일 자동 동기화 (구글 광고 + 네이버 광고 + GA4 콘텐츠)
// vercel.json에서 매일 오전 7시(KST) 실행 설정

const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL || process.env.VERCEL_URL
  ? `https://${process.env.VERCEL_URL}`
  : 'http://localhost:3000'

function getBaseUrl() {
  if (process.env.NEXT_PUBLIC_SITE_URL) return process.env.NEXT_PUBLIC_SITE_URL
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`
  return 'http://localhost:3000'
}

export async function GET(request: NextRequest) {
  // Vercel Cron 인증 (CRON_SECRET 설정 시)
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret) {
    const authHeader = request.headers.get('authorization')
    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  const now = new Date()
  // KST (UTC+9)
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000)
  const year = kst.getFullYear()
  const month = kst.getMonth() + 1

  const baseUrl = getBaseUrl()
  const results: Record<string, any> = {}

  console.log(`[Daily Sync] ${year}년 ${month}월 동기화 시작 — ${kst.toISOString()}`)

  // 1. 구글 광고 동기화
  try {
    const res = await fetch(`${baseUrl}/api/marketing/sync/google-ads`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ year, month }),
    })
    results.google_ads = await res.json()
    console.log(`[Daily Sync] 구글 광고:`, results.google_ads.message || results.google_ads.error)
  } catch (err) {
    results.google_ads = { success: false, error: String(err) }
    console.error('[Daily Sync] 구글 광고 실패:', err)
  }

  // 2. 네이버 광고 동기화
  try {
    const res = await fetch(`${baseUrl}/api/marketing/sync/naver-ads`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ year, month }),
    })
    results.naver_ads = await res.json()
    console.log(`[Daily Sync] 네이버 광고:`, results.naver_ads.message || results.naver_ads.error)
  } catch (err) {
    results.naver_ads = { success: false, error: String(err) }
    console.error('[Daily Sync] 네이버 광고 실패:', err)
  }

  // 3. GA4 콘텐츠 동기화 (당월 1일 ~ 오늘)
  try {
    const startDate = `${year}-${String(month).padStart(2, '0')}-01`
    const endDate = `${year}-${String(month).padStart(2, '0')}-${String(kst.getDate()).padStart(2, '0')}`
    const res = await fetch(`${baseUrl}/api/marketing/sync/ga4-content`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ startDate, endDate }),
    })
    results.ga4_content = await res.json()
    console.log(`[Daily Sync] GA4 콘텐츠:`, results.ga4_content.message || results.ga4_content.error)
  } catch (err) {
    results.ga4_content = { success: false, error: String(err) }
    console.error('[Daily Sync] GA4 콘텐츠 실패:', err)
  }

  // 4. 전월 데이터도 월초(1~3일)에는 보정 동기화
  if (kst.getDate() <= 3) {
    const prevMonth = month === 1 ? 12 : month - 1
    const prevYear = month === 1 ? year - 1 : year

    try {
      const res = await fetch(`${baseUrl}/api/marketing/sync/google-ads`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ year: prevYear, month: prevMonth }),
      })
      results.google_ads_prev = await res.json()
    } catch (err) {
      results.google_ads_prev = { success: false, error: String(err) }
    }

    try {
      const res = await fetch(`${baseUrl}/api/marketing/sync/naver-ads`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ year: prevYear, month: prevMonth }),
      })
      results.naver_ads_prev = await res.json()
    } catch (err) {
      results.naver_ads_prev = { success: false, error: String(err) }
    }
  }

  const summary = {
    synced_at: kst.toISOString(),
    year,
    month,
    google_ads: results.google_ads?.success ? `${results.google_ads.count}건` : results.google_ads?.message || 'failed',
    naver_ads: results.naver_ads?.success ? `${results.naver_ads.count}건` : results.naver_ads?.message || 'failed',
    ga4_content: results.ga4_content?.success ? `${results.ga4_content.count}건` : results.ga4_content?.message || 'failed',
  }

  console.log(`[Daily Sync] 완료:`, JSON.stringify(summary))

  return NextResponse.json({
    success: true,
    message: '일일 동기화 완료',
    summary,
    details: results,
  })
}
