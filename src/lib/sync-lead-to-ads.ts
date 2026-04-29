import { SupabaseClient } from '@supabase/supabase-js'

// 파이프라인 리드 유입채널 → 광고성과 채널/서브소스 매핑
// 채널 체계 통일 후: pipeline과 ad_performance가 같은 채널명 사용
// 레거시 채널명(문의하기, 검색채널 등)도 하위 호환 지원
function mapLeadChannelToAds(inquiryChannel: string, inquirySource: string): {
  channel: string
  campaign_name: string
} | null {
  const ch = (inquiryChannel || '').trim()
  const src = (inquirySource || '').trim()

  // 광고성과와 동일한 채널명인 경우 (통합 후)
  const directChannels = ['네이버', '구글', '메타', '유튜브', '검색유입', '자사채널', '블로그', '언론', '이벤트/행사']
  if (directChannels.includes(ch)) {
    // 서브소스(campaign_name) 결정
    if (ch === '검색유입') {
      if (src.includes('네이버') || src.toLowerCase().includes('naver'))
        return { channel: ch, campaign_name: '네이버' }
      if (src.includes('구글') || src.toLowerCase().includes('google'))
        return { channel: ch, campaign_name: '구글' }
      if (src.includes('AI') || src.includes('GPT') || src.includes('클로드') || src.includes('퍼플렉'))
        return { channel: ch, campaign_name: '생성형AI' }
      return { channel: ch, campaign_name: src || '기타' }
    }
    if (ch === '자사채널') {
      return { channel: ch, campaign_name: src || '홈페이지' }
    }
    if (ch === '블로그') {
      if (src.includes('네이버')) return { channel: ch, campaign_name: '네이버' }
      if (src.includes('티스토리')) return { channel: ch, campaign_name: '티스토리' }
      return { channel: ch, campaign_name: src || '기타' }
    }
    return { channel: ch, campaign_name: src || ch }
  }

  // 세일즈 전용 채널
  if (ch === '대표전화' || ch === '개인전화') {
    return { channel: '자사채널', campaign_name: ch }
  }
  if (ch === '추천') {
    return { channel: '기타', campaign_name: '추천' }
  }

  // --- 레거시 채널명 하위 호환 ---
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

    case '이용자 추천':
      return { channel: '기타', campaign_name: '추천' }

    case '박람회':
      return { channel: '이벤트/행사', campaign_name: '박람회' }

    default:
      if (!ch) return null
      return { channel: '기타', campaign_name: ch }
  }
}

/**
 * 리드가 등록/수정될 때 ad_performance 테이블의 해당 날짜/채널에
 * 문의 수(inquiries)와 회사명(inquiry_companies)을 자동 반영
 */
export async function syncLeadToAdPerformance(
  supabase: SupabaseClient,
  lead: {
    inquiry_date: string | null
    inquiry_channel: string
    inquiry_source: string
    company_name: string
    stage: string
  }
) {
  if (!lead.inquiry_date || !lead.inquiry_channel) return

  const mapping = mapLeadChannelToAds(lead.inquiry_channel, lead.inquiry_source)
  if (!mapping) return

  const date = lead.inquiry_date

  // 해당 날짜+채널+서브소스 행 찾기
  const { data: existing } = await supabase
    .from('ad_performance')
    .select('id, inquiries, inquiry_companies')
    .eq('date', date)
    .eq('channel', mapping.channel)
    .eq('campaign_name', mapping.campaign_name)
    .limit(1)

  if (existing && existing.length > 0) {
    // 기존 행에 문의 추가 (이미 있으면 inquiries 카운트만 skip, adoption 처리는 계속 진행)
    const row = existing[0]
    const currentCompanies = row.inquiry_companies || ''
    const companyList = currentCompanies ? currentCompanies.split(',').map((s: string) => s.trim()) : []

    // 새로운 회사일 때만 inquiry 카운트/리스트 업데이트
    if (!companyList.includes(lead.company_name)) {
      companyList.push(lead.company_name)
      await supabase
        .from('ad_performance')
        .update({
          inquiries: (row.inquiries || 0) + 1,
          inquiry_companies: companyList.join(', '),
        })
        .eq('id', row.id)
    }
  } else {
    // 해당 날짜/채널에 행이 없으면 새로 생성 (수동/리드연동이므로 data_source='manual')
    await supabase
      .from('ad_performance')
      .insert({
        date,
        channel: mapping.channel,
        ad_type: '콘텐츠',
        campaign_name: mapping.campaign_name,
        impressions: 0,
        clicks: 0,
        cost: 0,
        ga_visits: 0,
        inquiry_clicks: 0,
        signups: 0,
        inquiries: 1,
        adoptions: 0,
        inquiry_companies: lead.company_name,
        data_source: 'manual',
      })
  }

  // 도입 완료 스테이지면 adoptions도 업데이트
  if (lead.stage === '도입완료') {
    const { data: row } = await supabase
      .from('ad_performance')
      .select('id, adoptions, adoption_companies')
      .eq('date', date)
      .eq('channel', mapping.channel)
      .eq('campaign_name', mapping.campaign_name)
      .limit(1)

    if (row && row.length > 0) {
      const currentCompanies = row[0].adoption_companies || ''
      const companyList = currentCompanies ? currentCompanies.split(',').map((s: string) => s.trim()) : []
      if (!companyList.includes(lead.company_name)) {
        companyList.push(lead.company_name)
        await supabase
          .from('ad_performance')
          .update({
            adoptions: (row[0].adoptions || 0) + 1,
            adoption_companies: companyList.join(', '),
          })
          .eq('id', row[0].id)
      }
    }
  }
}

/**
 * 도입완료 → 다른 stage 로 빠질 때 광고 성과의 adoption 카운트/리스트에서 제거.
 * inquiry_companies 는 유지 (문의 사실은 변경 안됨), adoption 부분만 되돌림.
 */
export async function revertLeadFromAdPerformance(
  supabase: SupabaseClient,
  lead: {
    inquiry_date: string | null
    inquiry_channel: string
    inquiry_source: string
    company_name: string
  }
) {
  if (!lead.inquiry_date || !lead.inquiry_channel) return

  const mapping = mapLeadChannelToAds(lead.inquiry_channel, lead.inquiry_source)
  if (!mapping) return

  const { data: existing } = await supabase
    .from('ad_performance')
    .select('id, adoptions, adoption_companies')
    .eq('date', lead.inquiry_date)
    .eq('channel', mapping.channel)
    .eq('campaign_name', mapping.campaign_name)
    .limit(1)

  if (!existing || existing.length === 0) return

  const row = existing[0]
  const list = row.adoption_companies ? row.adoption_companies.split(',').map((s: string) => s.trim()) : []
  const idx = list.indexOf(lead.company_name)
  if (idx === -1) return  // 이미 없음

  list.splice(idx, 1)
  const newAdoptions = Math.max(0, (row.adoptions || 0) - 1)
  await supabase
    .from('ad_performance')
    .update({
      adoptions: newAdoptions,
      adoption_companies: list.length > 0 ? list.join(', ') : null,
    })
    .eq('id', row.id)
}

/**
 * 해당 날짜의 모든 리드를 기반으로 ad_performance를 재계산
 * (동기화 후 정합성 보장용)
 */
export async function recalcAdPerformanceFromLeads(
  supabase: SupabaseClient,
  date: string
) {
  // 해당 날짜의 모든 리드 조회
  const { data: leads } = await supabase
    .from('pipeline_leads')
    .select('company_name, inquiry_channel, inquiry_source, stage')
    .eq('inquiry_date', date)

  if (!leads || leads.length === 0) return

  // 채널별로 그룹핑
  const groups = new Map<string, { inquiries: string[]; adoptions: string[] }>()

  for (const lead of leads) {
    const mapping = mapLeadChannelToAds(lead.inquiry_channel, lead.inquiry_source)
    if (!mapping) continue

    const key = `${mapping.channel}|${mapping.campaign_name}`
    if (!groups.has(key)) {
      groups.set(key, { inquiries: [], adoptions: [] })
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
  const entries = Array.from(groups.entries())
  for (const [key, g] of entries) {
    const [channel, campaign_name] = key.split('|')

    const { data: existing } = await supabase
      .from('ad_performance')
      .select('id')
      .eq('date', date)
      .eq('channel', channel)
      .eq('campaign_name', campaign_name)
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
    } else {
      await supabase
        .from('ad_performance')
        .insert({
          date,
          channel,
          ad_type: '콘텐츠',
          campaign_name,
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
          data_source: 'manual',
        })
    }
  }
}
