import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import crypto from 'crypto'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

// 네이버 검색광고 API 동기화
// 캠페인 → 광고그룹 → /stats 엔드포인트로 일별 성과 수집
// /stats?ids=agId1,agId2,...&fields=[...]&timeRange={since,until}

const BASE_URL = 'https://api.searchad.naver.com'

function generateSignature(ts: string, method: string, path: string, secret: string) {
  return crypto.createHmac('sha256', secret).update(`${ts}.${method}.${path}`).digest('base64')
}

function makeHeaders(apiKey: string, secret: string, cid: string, method: string, path: string) {
  const ts = String(Date.now())
  return {
    'X-API-KEY': apiKey, 'X-CUSTOMER': cid,
    'X-Signature': generateSignature(ts, method, path, secret),
    'X-Timestamp': ts, 'Content-Type': 'application/json',
  }
}

interface DebugLog { step: string; status: number | string; detail: string }

interface StatRow { date: string; campNaverId: string; agNaverId: string; impressions: number; clicks: number; cost: number; conversions: number }

export async function POST(request: NextRequest) {
  const debug: DebugLog[] = []

  try {
    const { year, month } = await request.json()
    if (!year || !month) return NextResponse.json({ error: 'year, month 필수' }, { status: 400 })

    const apiKey = process.env.NAVER_ADS_API_KEY
    const secret = process.env.NAVER_ADS_SECRET_KEY
    const cid = process.env.NAVER_ADS_CUSTOMER_ID
    if (!apiKey || !secret || !cid) {
      return NextResponse.json({ success: false, message: 'API 키 미설정', status: 'not_configured' })
    }

    const supabase = createClient(supabaseUrl, supabaseKey)

    // ─── 1. 캠페인 목록 ───
    const campRes = await fetch(`${BASE_URL}/ncc/campaigns`, {
      headers: makeHeaders(apiKey, secret, cid, 'GET', '/ncc/campaigns'),
    })
    if (!campRes.ok) {
      const err = await campRes.text()
      return NextResponse.json({ success: false, message: `캠페인 조회 실패`, debug: [{ step: 'campaigns', status: campRes.status, detail: err.substring(0, 200) }] })
    }
    const naverCamps = await campRes.json()
    const campNameMap = new Map<string, string>() // naverId → name
    naverCamps.forEach((c: any) => campNameMap.set(c.nccCampaignId, c.name))
    debug.push({ step: 'campaigns', status: 200, detail: `${naverCamps.length}개` })

    // ─── 2. 광고그룹 목록 ───
    const agNameMap = new Map<string, string>() // naverId → name
    const agCampMap = new Map<string, string>() // agNaverId → campNaverId
    for (const camp of naverCamps) {
      try {
        const res = await fetch(`${BASE_URL}/ncc/adgroups?nccCampaignId=${camp.nccCampaignId}`, {
          headers: makeHeaders(apiKey, secret, cid, 'GET', '/ncc/adgroups'),
        })
        if (!res.ok) continue
        const groups = await res.json()
        if (Array.isArray(groups)) {
          groups.forEach((g: any) => {
            agNameMap.set(g.nccAdgroupId, g.name)
            agCampMap.set(g.nccAdgroupId, camp.nccCampaignId)
          })
        }
      } catch { /* skip */ }
    }
    debug.push({ step: 'adgroups', status: 200, detail: `${agNameMap.size}개` })

    // ─── 3. DB에 캠페인 등록/업데이트 ───
    const statusMap: Record<string, string> = { ELIGIBLE: '진행중', PAUSED: '중단', PENDING: '준비', FINISHED: '종료' }
    const dbCampIdMap = new Map<string, string>() // naverId → db UUID

    for (const camp of naverCamps) {
      // 이름으로 기존 캠페인 검색
      const { data: existing } = await supabase
        .from('campaigns').select('id').eq('name', camp.name).limit(1)

      if (existing && existing.length > 0) {
        dbCampIdMap.set(camp.nccCampaignId, existing[0].id)
        await supabase.from('campaigns').update({
          status: statusMap[camp.status] || '준비',
          channel: '네이버',
        }).eq('id', existing[0].id)
      } else {
        const { data: ins } = await supabase.from('campaigns').insert({
          name: camp.name,
          channel: '네이버',
          status: statusMap[camp.status] || '준비',
          budget: (camp.dailyBudget || 0) * 30,
        }).select('id').single()
        if (ins) dbCampIdMap.set(camp.nccCampaignId, ins.id)
      }
    }
    debug.push({ step: 'db-campaigns', status: 'ok', detail: `${dbCampIdMap.size}개` })

    // ─── 4. DB에 광고그룹 등록 (ad_groups 테이블 있을 때만) ───
    let hasAdGroupsTable = false
    const dbAgIdMap = new Map<string, string>() // naverId → db UUID

    // ad_groups 테이블 존재 여부 확인
    const { error: agTableErr } = await supabase.from('ad_groups').select('id').limit(1)
    hasAdGroupsTable = !agTableErr

    if (hasAdGroupsTable) {
      const agEntries = Array.from(agNameMap.entries())
      for (const [naverId, name] of agEntries) {
        const campNaverId = agCampMap.get(naverId)
        const dbCampId = campNaverId ? dbCampIdMap.get(campNaverId) : null
        if (!dbCampId) continue

        const { data: existing } = await supabase
          .from('ad_groups').select('id')
          .eq('campaign_id', dbCampId).eq('name', name).limit(1)

        if (existing && existing.length > 0) {
          dbAgIdMap.set(naverId, existing[0].id)
        } else {
          const { data: ins } = await supabase.from('ad_groups').insert({
            campaign_id: dbCampId,
            name: name,
            channel: '네이버',
            status: 'active',
          }).select('id').single()
          if (ins) dbAgIdMap.set(naverId, ins.id)
        }
      }
      debug.push({ step: 'db-adgroups', status: 'ok', detail: `${dbAgIdMap.size}개` })
    } else {
      debug.push({ step: 'db-adgroups', status: 'skip', detail: 'ad_groups 테이블 없음' })
    }

    // ─── 5. 날짜 범위 ───
    const mm = String(month).padStart(2, '0')
    const startDate = `${year}-${mm}-01`
    const lastDay = new Date(year, month, 0).getDate()
    const endDate = `${year}-${mm}-${String(lastDay).padStart(2, '0')}`

    // ─── 6. /stats 엔드포인트로 일별 광고그룹 성과 수집 ───
    const allAgIds = Array.from(agNameMap.keys())
    if (allAgIds.length === 0) {
      const campDetails = naverCamps.map((c: any) => ({ name: c.name, status: c.status, type: c.campaignTp }))
      return NextResponse.json({
        success: true,
        message: `캠페인 ${naverCamps.length}개 등록 완료 (광고그룹 없음)`,
        count: 0, campaigns: campDetails, status: 'partial', debug,
      })
    }

    const idsParam = allAgIds.join(',')
    const fieldsParam = JSON.stringify(['impCnt', 'clkCnt', 'salesAmt'])
    const rows: StatRow[] = []

    debug.push({ step: 'stats-start', status: 'ok', detail: `${allAgIds.length}개 광고그룹, ${lastDay}일 조회` })

    for (let day = 1; day <= lastDay; day++) {
      const dateStr = `${year}-${mm}-${String(day).padStart(2, '0')}`
      const timeRange = JSON.stringify({ since: dateStr, until: dateStr })
      const queryStr = `ids=${encodeURIComponent(idsParam)}&fields=${encodeURIComponent(fieldsParam)}&timeRange=${encodeURIComponent(timeRange)}`
      const statsPath = '/stats'
      const fullUrl = `${BASE_URL}${statsPath}?${queryStr}`

      try {
        const res = await fetch(fullUrl, {
          headers: makeHeaders(apiKey, secret, cid, 'GET', statsPath),
        })

        if (!res.ok) {
          const errText = await res.text()
          debug.push({ step: `stats-${dateStr}`, status: res.status, detail: errText.substring(0, 150) })
          continue
        }

        const json = await res.json()
        const dataArr = json.data
        if (!Array.isArray(dataArr) || dataArr.length === 0) continue

        for (const item of dataArr) {
          const impCnt = Number(item.impCnt) || 0
          const clkCnt = Number(item.clkCnt) || 0
          const salesAmt = Math.round(Number(item.salesAmt) || 0)

          // 데이터가 모두 0이면 스킵
          if (impCnt === 0 && clkCnt === 0 && salesAmt === 0) continue

          const agNaverId = item.id
          const campNaverId = agCampMap.get(agNaverId) || ''

          rows.push({
            date: dateStr,
            campNaverId,
            agNaverId,
            impressions: impCnt,
            clicks: clkCnt,
            cost: salesAmt,
            conversions: 0,
          })
        }
      } catch (err) {
        debug.push({ step: `stats-${dateStr}`, status: 'error', detail: err instanceof Error ? err.message : String(err) })
      }
    }

    debug.push({ step: 'stats-done', status: 'ok', detail: `${rows.length}건 수집` })

    if (rows.length === 0) {
      const campDetails = naverCamps.map((c: any) => ({ name: c.name, status: c.status, type: c.campaignTp }))
      return NextResponse.json({
        success: true,
        message: `캠페인 ${naverCamps.length}개, 광고그룹 ${agNameMap.size}개 등록 완료 (해당 월 성과 데이터 없음)`,
        count: 0, campaigns: campDetails, status: 'partial', debug,
      })
    }

    // ─── 7. ad_performance 저장 ───
    // 컬럼 존재 여부에 따라 동적 구성
    const { error: colCheck } = await supabase.from('ad_performance').select('adgroup_name').limit(1)
    const hasAdgroupNameCol = !colCheck
    const { error: colCheck2 } = await supabase.from('ad_performance').select('adgroup_id').limit(1)
    const hasAdgroupIdCol = !colCheck2

    // ─── 기존 수동 입력 데이터 보존을 위해 먼저 조회 ───
    const { data: existingRows } = await supabase.from('ad_performance')
      .select('date, campaign_name, adgroup_name, signups, inquiries, adoptions, signup_companies, inquiry_companies, adoption_companies, ga_visits, inquiry_clicks')
      .eq('channel', '네이버').gte('date', startDate).lte('date', endDate)

    // 키: date|campaign_name|adgroup_name → 수동 입력 값
    const manualDataMap = new Map<string, Record<string, any>>()
    existingRows?.forEach(r => {
      const key = `${r.date}|${r.campaign_name}|${r.adgroup_name || ''}`
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
    debug.push({ step: 'preserve-manual', status: 'ok', detail: `수동 입력 ${manualDataMap.size}건 보존` })

    const upsertRows = rows.map(r => {
      const campName = campNameMap.get(r.campNaverId) || r.campNaverId
      const agName = hasAdgroupNameCol ? (agNameMap.get(r.agNaverId) || r.agNaverId) : ''
      const manualKey = `${r.date}|${campName}|${agName}`
      const manual = manualDataMap.get(manualKey)

      const row: Record<string, any> = {
        date: r.date,
        channel: '네이버',
        ad_type: '검색',
        campaign_name: campName,
        campaign_id: dbCampIdMap.get(r.campNaverId) || null,
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
      // 광고그룹명 컬럼 있으면 추가
      if (hasAdgroupNameCol) {
        row.adgroup_name = agNameMap.get(r.agNaverId) || r.agNaverId
      }
      // 광고그룹 ID 컬럼 있으면 추가
      if (hasAdgroupIdCol && dbAgIdMap.has(r.agNaverId)) {
        row.adgroup_id = dbAgIdMap.get(r.agNaverId)
      }
      // adgroup_name 컬럼 없으면 notes에 저장
      if (!hasAdgroupNameCol) {
        row.notes = `광고그룹: ${agNameMap.get(r.agNaverId) || r.agNaverId}`
      }
      return row
    })

    // 기존 네이버 데이터 삭제 후 삽입 (수동 입력값은 위에서 보존됨)
    await supabase.from('ad_performance').delete()
      .eq('channel', '네이버').gte('date', startDate).lte('date', endDate)

    const { error: insertErr } = await supabase.from('ad_performance').insert(upsertRows)
    if (insertErr) {
      debug.push({ step: 'db-insert', status: 'error', detail: insertErr.message })
      return NextResponse.json({ success: false, message: 'DB 저장 실패: ' + insertErr.message, debug })
    }

    // 요약
    const summary = new Map<string, { campaign: string; impressions: number; clicks: number; cost: number }>()
    upsertRows.forEach((r: any) => {
      const name = r.adgroup_name || r.notes?.replace('광고그룹: ', '') || '?'
      const ex = summary.get(name) || { campaign: r.campaign_name, impressions: 0, clicks: 0, cost: 0 }
      ex.impressions += r.impressions; ex.clicks += r.clicks; ex.cost += r.cost
      summary.set(name, ex)
    })

    return NextResponse.json({
      success: true,
      message: `네이버 광고 ${rows.length}건 동기화 완료 (${summary.size}개 광고그룹)`,
      count: rows.length,
      campaigns_synced: dbCampIdMap.size,
      adgroups_synced: dbAgIdMap.size,
      adgroup_summary: Array.from(summary.entries()).map(([name, s]) => ({ name, ...s })),
      debug,
    })

  } catch (error) {
    console.error('Naver Ads sync error:', error)
    return NextResponse.json({
      error: '동기화 실패: ' + (error instanceof Error ? error.message : String(error)),
      debug,
    }, { status: 500 })
  }
}
