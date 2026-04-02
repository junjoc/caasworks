import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

// 파이프라인 리드 → 광고성과 일괄 동기화
// 리드의 inquiry_channel → ad_performance의 channel/campaign_name 매핑

function mapLeadChannelToAds(inquiryChannel: string, inquirySource: string): {
  channel: string
  campaign_name: string
} | null {
  const ch = (inquiryChannel || '').trim()
  const src = (inquirySource || '').trim()

  switch (ch) {
    case '검색채널':
      if (src.includes('네이버') || src.toLowerCase().includes('naver'))
        return { channel: '검색유입', campaign_name: '네이버' }
      if (src.includes('구글') || src.toLowerCase().includes('google'))
        return { channel: '검색유입', campaign_name: '구글' }
      if (src.includes('AI') || src.includes('GPT') || src.includes('클로드') || src.includes('퍼플렉'))
        return { channel: '검색유입', campaign_name: '생성형AI' }
      return { channel: '검색유입', campaign_name: src || '기타' }
    case '문의하기':
    case '공식홈페이지':
      return { channel: '자사채널', campaign_name: '홈페이지' }
    case '대표전화':
    case '개인전화':
      return { channel: '자사채널', campaign_name: ch }
    case '이용자 추천':
      return { channel: '기타', campaign_name: '추천' }
    case '박람회':
      return { channel: '기타', campaign_name: '박람회' }
    case '블로그':
      if (src.includes('네이버')) return { channel: '블로그', campaign_name: '네이버' }
      if (src.includes('티스토리')) return { channel: '블로그', campaign_name: '티스토리' }
      return { channel: '블로그', campaign_name: src || '기타' }
    default:
      if (!ch) return null
      return { channel: '기타', campaign_name: ch }
  }
}

export async function POST(request: NextRequest) {
  try {
    const { startDate, endDate } = await request.json()

    if (!startDate || !endDate) {
      return NextResponse.json({ error: 'startDate, endDate 필수' }, { status: 400 })
    }

    const supabase = createClient(supabaseUrl, supabaseKey)

    // 해당 기간의 모든 리드 조회
    const { data: leads, error: leadsError } = await supabase
      .from('pipeline_leads')
      .select('company_name, inquiry_date, inquiry_channel, inquiry_source, stage')
      .gte('inquiry_date', startDate)
      .lte('inquiry_date', endDate)

    if (leadsError) {
      return NextResponse.json({ success: false, message: 'leads 조회 실패: ' + leadsError.message })
    }

    if (!leads || leads.length === 0) {
      return NextResponse.json({ success: true, message: '해당 기간 리드 없음', count: 0 })
    }

    // 날짜+채널별로 그룹핑
    const groups = new Map<string, {
      date: string; channel: string; campaign_name: string;
      inquiries: string[]; adoptions: string[]
    }>()

    for (const lead of leads) {
      if (!lead.inquiry_date || !lead.inquiry_channel) continue
      const mapping = mapLeadChannelToAds(lead.inquiry_channel, lead.inquiry_source)
      if (!mapping) continue

      const key = `${lead.inquiry_date}|${mapping.channel}|${mapping.campaign_name}`
      if (!groups.has(key)) {
        groups.set(key, {
          date: lead.inquiry_date,
          channel: mapping.channel,
          campaign_name: mapping.campaign_name,
          inquiries: [],
          adoptions: [],
        })
      }
      const g = groups.get(key)!
      if (!g.inquiries.includes(lead.company_name)) {
        g.inquiries.push(lead.company_name)
      }
      if (lead.stage === '도입완료' && !g.adoptions.includes(lead.company_name)) {
        g.adoptions.push(lead.company_name)
      }
    }

    // 각 그룹별로 ad_performance 업데이트
    let updatedCount = 0
    let createdCount = 0

    const entries = Array.from(groups.entries())
    for (const [, g] of entries) {
      const { data: existing } = await supabase
        .from('ad_performance')
        .select('id, inquiries, inquiry_companies, adoptions, adoption_companies')
        .eq('date', g.date)
        .eq('channel', g.channel)
        .eq('campaign_name', g.campaign_name)
        .limit(1)

      if (existing && existing.length > 0) {
        await supabase
          .from('ad_performance')
          .update({
            inquiries: g.inquiries.length,
            inquiry_companies: g.inquiries.join(', '),
            adoptions: g.adoptions.length,
            adoption_companies: g.adoptions.length > 0 ? g.adoptions.join(', ') : null,
          })
          .eq('id', existing[0].id)
        updatedCount++
      } else {
        await supabase
          .from('ad_performance')
          .insert({
            date: g.date,
            channel: g.channel,
            ad_type: '콘텐츠',
            campaign_name: g.campaign_name,
            impressions: 0,
            clicks: 0,
            cost: 0,
            ga_visits: 0,
            inquiry_clicks: 0,
            signups: 0,
            inquiries: g.inquiries.length,
            adoptions: g.adoptions.length,
            inquiry_companies: g.inquiries.join(', '),
            adoption_companies: g.adoptions.length > 0 ? g.adoptions.join(', ') : null,
          })
        createdCount++
      }
    }

    return NextResponse.json({
      success: true,
      message: `리드 ${leads.length}건 → 광고성과 반영 (업데이트 ${updatedCount}건, 신규 ${createdCount}건)`,
      count: leads.length,
      updated: updatedCount,
      created: createdCount,
      leads: leads.map(l => ({
        company: l.company_name,
        date: l.inquiry_date,
        channel: l.inquiry_channel,
        source: l.inquiry_source,
        stage: l.stage,
      })),
    })
  } catch (error) {
    console.error('Leads to ads sync error:', error)
    return NextResponse.json({ error: '동기화 실패' }, { status: 500 })
  }
}
