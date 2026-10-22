import { SupabaseClient } from '@supabase/supabase-js'
import campaignMap from '@/config/ad_campaign_map.json'
import { classifyLead } from '@/lib/inflow-taxonomy'

export interface AdMapping { channel: string; campaign_name: string; adgroup_name?: string }

// 광고 리드(utm_campaign) → 광고성과의 실제 캠페인·광고그룹 (src/config/ad_campaign_map.json)
const CAMPAIGN_MAP = campaignMap as unknown as Record<string, Record<string, { campaign_name: string; adgroup_name?: string }>>

// 광고그룹이 정해진 매핑이면 광고그룹까지 같은 행만 고른다
const adgroupFilter = (m: { adgroup_name?: string }) => (m.adgroup_name ? { adgroup_name: m.adgroup_name } : {})

// 파이프라인 리드 유입채널 → 광고성과 채널/서브소스 매핑
// 채널 체계 통일 후: pipeline과 ad_performance가 같은 채널명 사용
// 레거시 채널명(문의하기, 검색채널 등)도 하위 호환 지원
export function mapLeadChannelToAds(inquiryChannel: string, inquirySource: string): AdMapping | null {
  const ch = (inquiryChannel || '').trim()
  const src = (inquirySource || '').trim()

  const mapped = CAMPAIGN_MAP[ch]?.[src]
  if (mapped) return { channel: ch, ...mapped }

  // 광고성과와 동일한 채널명인 경우 (통합 후)
  const directChannels = ['네이버', '구글', '메타', '유튜브', '검색유입', '자사채널', '블로그', '외주 블로그', '언론', '이벤트/행사']
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
    .match(adgroupFilter(mapping))
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
        ...adgroupFilter(mapping),
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
      .match(adgroupFilter(mapping))
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
    .match(adgroupFilter(mapping))
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

    const key = `${mapping.channel}|${mapping.campaign_name}|${mapping.adgroup_name || ''}`
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
    const [channel, campaign_name, adgroup] = key.split('|')
    const ag = adgroupFilter({ adgroup_name: adgroup || undefined })

    const { data: existing } = await supabase
      .from('ad_performance')
      .select('id')
      .eq('date', date)
      .eq('channel', channel)
      .eq('campaign_name', campaign_name)
      .match(ag)
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
          ...ag,
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

/**
 * 유입 성과의 문의·도입을 리드에서 다시 맞춘다 (2026-10-22).
 * 문의 = 유입일이 그 날인 리드 1건 = 1 (리스트와 같은 기준). 유입일을 고치거나 리드를 지우면 따라감.
 * 도입 = 그 리드가 지금 "도입완료"면 그 리드의 유입일·유입 분류 칸에 1 (팀이 손으로 적던 값, 104건 중 102건 일치).
 *   팀이 적은 도입 중 도입완료 리드로 확인되지 않는 이름(리드 없이 계약한 고객, 도입 후 이탈 등)은 지우지 않고 남긴다.
 * 회사명 없이 광고 매체가 준 전환 수는 media_conversions 로 따로 둔다(문의에 안 더함).
 * 문의 기록이 있는 2026-01-01 이후만.
 */
export async function recomputeInquiries(supabase: SupabaseClient, from: string, to: string) {
  const start = from < '2026-01-01' ? '2026-01-01' : from
  if (start > to) return { changed: 0, created: 0 }
  const page = async <T,>(q: (a: number, b: number) => PromiseLike<{ data: T[] | null }>) => { let all: T[] = []; for (let o = 0; ; o += 1000) { const { data } = await q(o, o + 999); all = all.concat(data || []); if (!data || data.length < 1000) break } return all }
  const [leads, rows, wonAll] = await Promise.all([
    page<{ company_name: string; inquiry_date: string; inquiry_channel: string | null; inquiry_source: string | null; stage: string }>((a, b) => supabase.from('pipeline_leads').select('company_name, inquiry_date, inquiry_channel, inquiry_source, stage').gte('inquiry_date', start).lte('inquiry_date', to).order('id').range(a, b)),
    page<{ id: string; date: string; channel: string; campaign_name: string; adgroup_name: string | null; inquiries: number | null; inquiry_companies: string | null; adoptions: number | null; adoption_companies: string | null }>((a, b) => supabase.from('ad_performance').select('id, date, channel, campaign_name, adgroup_name, inquiries, inquiry_companies, adoptions, adoption_companies').gte('date', start).lte('date', to).order('id').range(a, b)),
    page<{ company_name: string }>((a, b) => supabase.from('pipeline_leads').select('company_name').eq('stage', '도입완료').gte('inquiry_date', '2026-01-01').order('id').range(a, b)),
  ])
  const norm = (v: string) => v.replace(/\(주\)|주식회사|㈜|\(유\)|유한회사|\(사\)|\s/g, '').toLowerCase()
  // 자동으로 붙는 도입 = 2026 이후 유입한 도입완료 리드. 그 전에 유입한 고객의 도입은 팀 기록을 그대로 둔다
  const wonNames = new Set(wonAll.map(l => norm(l.company_name)))
  const split = (s: string | null) => (s || '').split(',').map(x => x.trim()).filter(Boolean)
  const key = (d: string, ch: string, cp: string, ag?: string | null) => `${d}|${ch}|${cp}|${ag || ''}`
  const want = new Map<string, { date: string; channel: string; campaign_name: string; adgroup_name?: string; names: string[]; won: string[] }>()
  for (const l of leads) {
    const ch = l.inquiry_channel || '', src = l.inquiry_source || ''
    const f = classifyLead(ch, src)
    // 광고 캠페인 대응표 → 그 광고그룹 행 · 예전 채널 값 → 예전 행 · 10/21 새 분류("검색 › 네이버") → 분류 이름 행
    const m: AdMapping = CAMPAIGN_MAP[ch]?.[src] ? { channel: ch, ...CAMPAIGN_MAP[ch][src] } : (!src.includes('›') && mapLeadChannelToAds(ch, src)) || { channel: f.group, campaign_name: f.sub }
    const k = key(l.inquiry_date, m.channel, m.campaign_name, m.adgroup_name)
    if (!want.has(k)) want.set(k, { date: l.inquiry_date, ...m, names: [], won: [] })
    want.get(k)!.names.push(l.company_name)
    if (l.stage === '도입완료') want.get(k)!.won.push(l.company_name)
  }
  const byKey = new Map<string, typeof rows>()
  for (const r of rows) { const k = key(r.date, r.channel, r.campaign_name, r.adgroup_name); if (!byKey.has(k)) byKey.set(k, []); byKey.get(k)!.push(r) }
  // 팀이 적은 도입 중 리드로 확인 안 되는 이름 → 그 행에 그대로
  const keptWon = (r: (typeof rows)[number]) => split(r.adoption_companies).filter(n => !wonNames.has(norm(n)))
  const unnamedWon = (r: (typeof rows)[number]) => Math.max(0, (r.adoptions || 0) - split(r.adoption_companies).length) // 이름 없이 적힌 도입 수
  const ops: PromiseLike<unknown>[] = []
  let changed = 0, created = 0
  const used = new Set<string>()
  const patch = (r: (typeof rows)[number], inq: string[], won: string[]) => {
    const wonAllNames = Array.from(new Set([...won, ...keptWon(r)]))
    const next = { inquiries: inq.length, inquiry_companies: inq.length ? inq.join(', ') : null, adoptions: wonAllNames.length + unnamedWon(r), adoption_companies: wonAllNames.length ? wonAllNames.join(', ') : null }
    if ((r.inquiries || 0) !== next.inquiries || (r.inquiry_companies || null) !== next.inquiry_companies || (r.adoptions || 0) !== next.adoptions || (r.adoption_companies || null) !== next.adoption_companies) {
      changed++; ops.push(supabase.from('ad_performance').update(next).eq('id', r.id))
    }
  }
  for (const [k, w] of Array.from(want.entries())) {
    const cands = byKey.get(k) || []
    const row = cands.find(r => r.inquiry_companies) || cands[0]
    if (row) { used.add(row.id); patch(row, w.names, w.won) }
    else {
      created++
      ops.push(supabase.from('ad_performance').insert({ date: w.date, channel: w.channel, ad_type: '콘텐츠', campaign_name: w.campaign_name, ...adgroupFilter(w), impressions: 0, clicks: 0, cost: 0, ga_visits: 0, inquiry_clicks: 0, signups: 0, inquiries: w.names.length, adoptions: w.won.length, inquiry_companies: w.names.join(', '), adoption_companies: w.won.length ? w.won.join(', ') : null, data_source: 'manual' }))
    }
  }
  // 리드가 없어진 행(유입일 변경·삭제): 문의는 비우고, 도입은 리드로 확인 안 되는 팀 기록만 남김
  for (const r of rows) if (!used.has(r.id) && (r.inquiry_companies || r.adoption_companies)) patch(r, [], [])
  for (let i = 0; i < ops.length; i += 20) await Promise.all(ops.slice(i, i + 20))
  return { changed, created }
}
