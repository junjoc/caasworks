import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import crypto from 'crypto'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

// 네이버 검색광고 API 동기화 (StatReport 방식)
// 환경변수: NAVER_ADS_API_KEY, NAVER_ADS_SECRET_KEY, NAVER_ADS_CUSTOMER_ID

const BASE_URL = 'https://api.searchad.naver.com'

function generateSignature(timestamp: string, method: string, path: string, secretKey: string) {
  const message = `${timestamp}.${method}.${path}`
  return crypto.createHmac('sha256', secretKey).update(message).digest('base64')
}

function makeHeaders(apiKey: string, secretKey: string, customerId: string, method: string, path: string) {
  const timestamp = String(Date.now())
  const signature = generateSignature(timestamp, method, path, secretKey)
  return {
    'X-API-KEY': apiKey,
    'X-CUSTOMER': customerId,
    'X-Signature': signature,
    'X-Timestamp': timestamp,
    'Content-Type': 'application/json',
  }
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

export async function POST(request: NextRequest) {
  try {
    const { year, month } = await request.json()

    if (!year || !month) {
      return NextResponse.json({ error: 'year, month 필수' }, { status: 400 })
    }

    const apiKey = process.env.NAVER_ADS_API_KEY
    const secretKey = process.env.NAVER_ADS_SECRET_KEY
    const customerId = process.env.NAVER_ADS_CUSTOMER_ID

    if (!apiKey || !secretKey || !customerId) {
      return NextResponse.json({
        success: false,
        message: '네이버 광고 API 키가 설정되지 않았습니다. 환경변수(NAVER_ADS_API_KEY, NAVER_ADS_SECRET_KEY, NAVER_ADS_CUSTOMER_ID)를 설정하세요.',
        status: 'not_configured',
      })
    }

    // 1. 캠페인 목록 가져오기
    const campaignPath = '/ncc/campaigns'
    const campaignsRes = await fetch(`${BASE_URL}${campaignPath}`, {
      headers: makeHeaders(apiKey, secretKey, customerId, 'GET', campaignPath),
    })

    if (!campaignsRes.ok) {
      const errText = await campaignsRes.text()
      console.error('Naver campaigns API error:', campaignsRes.status, errText)
      return NextResponse.json({
        success: false,
        message: `네이버 캠페인 목록 조회 실패 (${campaignsRes.status}): ${errText.substring(0, 200)}`,
        status: 'api_error',
      })
    }

    const naverCampaigns = await campaignsRes.json()

    // 캠페인 ID → 이름 매핑
    const naverCampaignMap = new Map<string, string>()
    naverCampaigns.forEach((c: { nccCampaignId: string; name: string }) =>
      naverCampaignMap.set(c.nccCampaignId, c.name)
    )

    const campaignIds = naverCampaigns.map((c: { nccCampaignId: string }) => c.nccCampaignId)

    if (campaignIds.length === 0) {
      return NextResponse.json({
        success: true,
        message: '네이버 광고 캠페인이 없습니다',
        count: 0,
      })
    }

    // 2. StatReport 생성 요청
    const startDate = `${year}-${String(month).padStart(2, '0')}-01`
    const lastDay = new Date(year, month, 0).getDate()
    const endDate = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`

    const statReportPath = '/stat-reports'
    const reportBody = {
      reportTp: 'AD',
      statDt: startDate.replace(/-/g, ''),
      endDt: endDate.replace(/-/g, ''),
    }

    const createRes = await fetch(`${BASE_URL}${statReportPath}`, {
      method: 'POST',
      headers: makeHeaders(apiKey, secretKey, customerId, 'POST', statReportPath),
      body: JSON.stringify(reportBody),
    })

    if (!createRes.ok) {
      const errText = await createRes.text()
      console.error('Naver stat-report create error:', createRes.status, errText)

      // stat-reports 실패 시 /stats 엔드포인트 fallback 시도
      return await tryStatsEndpoint(
        apiKey, secretKey, customerId, campaignIds, naverCampaignMap,
        startDate, endDate, year, month
      )
    }

    const reportJob = await createRes.json()
    const reportJobId = reportJob.reportJobId

    if (!reportJobId) {
      console.error('No reportJobId returned:', JSON.stringify(reportJob))
      // fallback to /stats
      return await tryStatsEndpoint(
        apiKey, secretKey, customerId, campaignIds, naverCampaignMap,
        startDate, endDate, year, month
      )
    }

    // 3. 보고서 완료 대기 (polling)
    let downloadUrl: string | null = null
    for (let i = 0; i < 30; i++) {
      await sleep(2000)

      const statusPath = `/stat-reports/${reportJobId}`
      const statusRes = await fetch(`${BASE_URL}${statusPath}`, {
        headers: makeHeaders(apiKey, secretKey, customerId, 'GET', statusPath),
      })

      if (!statusRes.ok) continue

      const statusData = await statusRes.json()
      if (statusData.status === 'BUILT' && statusData.downloadUrl) {
        downloadUrl = statusData.downloadUrl
        break
      } else if (statusData.status === 'REGIST' || statusData.status === 'RUNNING') {
        continue
      } else if (statusData.status === 'ERROR') {
        console.error('Naver report error:', JSON.stringify(statusData))
        break
      }
    }

    if (!downloadUrl) {
      // StatReport 타임아웃 → /stats 엔드포인트 fallback
      return await tryStatsEndpoint(
        apiKey, secretKey, customerId, campaignIds, naverCampaignMap,
        startDate, endDate, year, month
      )
    }

    // 4. CSV 다운로드 및 파싱
    // 다운로드 URL이 상대 경로일 수 있음
    const fullDownloadUrl = downloadUrl.startsWith('http')
      ? downloadUrl
      : `${BASE_URL}${downloadUrl}`

    const dlPath = new URL(fullDownloadUrl).pathname
    const csvRes = await fetch(fullDownloadUrl, {
      headers: makeHeaders(apiKey, secretKey, customerId, 'GET', dlPath),
    })
    if (!csvRes.ok) {
      const dlErr = await csvRes.text()
      console.error('CSV download error:', csvRes.status, dlErr, 'URL:', fullDownloadUrl)
      return NextResponse.json({
        success: false,
        message: `보고서 다운로드 실패 (${csvRes.status}): ${dlErr.substring(0, 200)}`,
        downloadUrl: fullDownloadUrl,
        status: 'download_error',
      })
    }

    const csvText = await csvRes.text()
    const rows = parseNaverCsv(csvText, naverCampaignMap)

    if (rows.length === 0) {
      return NextResponse.json({
        success: true,
        message: '해당 기간 데이터 없음',
        count: 0,
      })
    }

    // 5. Supabase에 저장
    return await saveToSupabase(rows, startDate, endDate)

  } catch (error) {
    console.error('Naver Ads sync error:', error)
    return NextResponse.json({ error: '동기화 실패: ' + (error instanceof Error ? error.message : String(error)) }, { status: 500 })
  }
}

// /stats 실시간 엔드포인트 (fallback)
async function tryStatsEndpoint(
  apiKey: string,
  secretKey: string,
  customerId: string,
  campaignIds: string[],
  naverCampaignMap: Map<string, string>,
  startDate: string,
  endDate: string,
  year: number,
  month: number,
) {
  const statPath = '/stats'
  const fields = '["impCnt","clkCnt","salesAmt","convCnt"]'
  const timeRange = `{"since":"${startDate}","until":"${endDate}"}`

  // 각 캠페인별로 개별 호출 (id 단일 파라미터)
  const allRows: Array<{
    date: string
    campaign_name: string
    impressions: number
    clicks: number
    cost: number
    conversions: number
  }> = []

  for (const campaignId of campaignIds) {
    try {
      const statsUrl = `https://api.searchad.naver.com${statPath}?id=${campaignId}&fields=${encodeURIComponent(fields)}&timeRange=${encodeURIComponent(timeRange)}&datePreset=custom&timeIncrement=1`

      const statsRes = await fetch(statsUrl, {
        headers: makeHeaders(apiKey, secretKey, customerId, 'GET', statPath),
      })

      if (!statsRes.ok) {
        const errText = await statsRes.text()
        console.error(`Naver stats error for ${campaignId}:`, statsRes.status, errText)
        continue
      }

      const statsData = await statsRes.json()
      const campaignName = naverCampaignMap.get(campaignId) || campaignId

      // /stats 응답 형식: { data: [...] } 또는 직접 배열
      const dataArray = Array.isArray(statsData) ? statsData : statsData.data
      if (Array.isArray(dataArray)) {
        for (const stat of dataArray) {
          allRows.push({
            date: stat.statDt || stat.date || startDate,
            campaign_name: campaignName,
            impressions: Number(stat.impCnt) || 0,
            clicks: Number(stat.clkCnt) || 0,
            cost: Number(stat.salesAmt) || 0,
            conversions: Number(stat.convCnt) || 0,
          })
        }
      }
    } catch (err) {
      console.error(`Stats error for campaign ${campaignId}:`, err)
    }
  }

  if (allRows.length === 0) {
    // 최종 fallback: 캠페인 목록만으로 기본 데이터 생성
    return NextResponse.json({
      success: true,
      message: `네이버 캠페인 ${campaignIds.length}개 확인됨 (성과 데이터 API 접근 불가 - 수동 입력 필요)`,
      count: 0,
      campaigns: Array.from(naverCampaignMap.entries()).map(([id, name]) => ({ id, name })),
      status: 'partial',
    })
  }

  return await saveToSupabase(allRows, startDate, endDate)
}

// CSV 파싱 (네이버 StatReport v2 형식 — 헤더 없음, 탭 구분)
// AD 보고서 컬럼 순서:
// 0:statDt  1:customerId  2:nccCampaignId  3:nccAdgroupId  4:nccKeywordId
// 5:nccAdId  6:businessChannelId  7:queryType  8:pcMobileType
// 9:impCnt  10:clkCnt  11:salesAmt  12:recentAvgRnk  13:recentAvgCpc
function parseNaverCsv(csvText: string, naverCampaignMap: Map<string, string>) {
  const lines = csvText.trim().split('\n')
  if (lines.length === 0) return []

  // 날짜+캠페인별 집계 (키워드/디바이스별 행을 합산)
  const aggregated = new Map<string, {
    date: string
    campaign_name: string
    impressions: number
    clicks: number
    cost: number
  }>()

  for (const line of lines) {
    if (!line.trim()) continue
    const cols = line.split('\t').map(c => c.trim().replace(/"/g, ''))
    if (cols.length < 12) continue

    const dateStr = cols[0]
    const campaignId = cols[2]

    // 날짜 포맷 변환: 20260301 → 2026-03-01
    const formattedDate = dateStr.length === 8
      ? `${dateStr.slice(0,4)}-${dateStr.slice(4,6)}-${dateStr.slice(6,8)}`
      : dateStr.includes('-') ? dateStr : ''

    if (!formattedDate) continue

    const key = `${formattedDate}_${campaignId}`
    const existing = aggregated.get(key) || {
      date: formattedDate,
      campaign_name: naverCampaignMap.get(campaignId) || campaignId,
      impressions: 0,
      clicks: 0,
      cost: 0,
    }

    existing.impressions += Number(cols[9]) || 0
    existing.clicks += Number(cols[10]) || 0
    existing.cost += Math.round(Number(cols[11]) || 0)
    aggregated.set(key, existing)
  }

  return Array.from(aggregated.values()).map(r => ({
    ...r,
    conversions: 0, // AD 보고서에는 전환 데이터 미포함 — 별도 전환 보고서 필요
  }))
}

// Supabase 저장
async function saveToSupabase(
  rows: Array<{
    date: string
    campaign_name: string
    impressions: number
    clicks: number
    cost: number
    conversions: number
  }>,
  startDate: string,
  endDate: string,
) {
  const supabase = createClient(supabaseUrl, supabaseKey)

  // campaigns 테이블에서 이름 → id 매핑
  const { data: campaigns } = await supabase
    .from('campaigns')
    .select('id, name')

  const campaignMap = new Map<string, string>()
  campaigns?.forEach(c => campaignMap.set(c.name, c.id))

  const upsertRows = rows.map(r => ({
    date: r.date,
    channel: '네이버',
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

  // 기존 데이터 삭제 후 삽입 (해당 월, 네이버 채널)
  await supabase
    .from('ad_performance')
    .delete()
    .eq('channel', '네이버')
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
    message: `네이버 광고 ${rows.length}건 동기화 완료`,
    count: rows.length,
  })
}
