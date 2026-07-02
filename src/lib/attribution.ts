// STEP 3-B: 관통(Attribution) 표준화 유틸
// utm/referrer/landing → 표준 inquiry_channel 매핑

export type InquiryChannel =
  | '유료검색_네이버' | '유료검색_구글'
  | '오가닉_네이버' | '오가닉_구글' | '오가닉_기타'
  | '블로그_네이버' | '블로그_티스토리' | '블로그_기타'
  | '직접' | '추천'
  | '전화_대표' | '전화_개인'
  | '이메일' | '해피톡'
  | '가입사' | '행사방문'
  | '이벤트' | '자사채널' | '기타'

export interface AttributionInput {
  utm_source?: string | null
  utm_medium?: string | null
  utm_campaign?: string | null
  referrer?: string | null
  landing_page?: string | null
  inquiry_source?: string | null   // Slack 인입에서 오는 초기 채널
  inquiry_channel?: string | null
}

/**
 * utm/referrer 등에서 표준 채널 도출.
 * 우선순위: utm_medium > referrer > inquiry_source > inquiry_channel
 */
export function normalizeInquiryChannel(a: AttributionInput): InquiryChannel {
  const source = (a.utm_source || '').toLowerCase()
  const medium = (a.utm_medium || '').toLowerCase()
  const ref = (a.referrer || '').toLowerCase()
  const existing = (a.inquiry_channel || a.inquiry_source || '').trim()

  // 1. utm_medium 기반 (가장 정확)
  if (medium === 'cpc' || medium === 'ppc' || medium === 'paidsearch' || medium === 'sa') {
    if (source.includes('naver')) return '유료검색_네이버'
    if (source.includes('google')) return '유료검색_구글'
  }
  if (medium === 'organic' || medium === 'seo') {
    if (source.includes('naver')) return '오가닉_네이버'
    if (source.includes('google')) return '오가닉_구글'
    return '오가닉_기타'
  }
  if (medium === 'referral') return '추천'
  if (medium === 'email') return '이메일'
  if (medium === 'social') return '자사채널'
  if (medium === 'blog') {
    if (source.includes('naver')) return '블로그_네이버'
    if (source.includes('tistory')) return '블로그_티스토리'
    return '블로그_기타'
  }

  // 2. referrer 기반 (utm 없을 때)
  if (ref.includes('naver.com') || ref.includes('search.naver')) {
    if (ref.includes('cr') || ref.includes('ad.')) return '유료검색_네이버'
    return '오가닉_네이버'
  }
  if (ref.includes('google.com') || ref.includes('google.co.kr')) {
    if (ref.includes('adurl') || ref.includes('/aclk')) return '유료검색_구글'
    return '오가닉_구글'
  }
  if (ref.includes('blog.naver.com') || ref.includes('m.blog.naver.com')) return '블로그_네이버'
  if (ref.includes('tistory.com')) return '블로그_티스토리'
  if (ref.includes('daum.net') || ref.includes('search.daum')) return '오가닉_기타'

  // 3. inquiry_source / inquiry_channel 기존 값 (Slack 인입)
  if (existing) {
    if (existing.includes('대표전화')) return '전화_대표'
    if (existing.includes('개인전화')) return '전화_개인'
    if (existing === '해피톡') return '해피톡'
    if (existing === '이메일') return '이메일'
    if (existing === '가입사') return '가입사'
    if (existing === '행사방문') return '행사방문'
    if (existing === '추천') return '추천'
    if (existing === '블로그') return '블로그_기타'
    if (existing === '검색유입') return '오가닉_기타'
    if (existing === '자사채널') return '자사채널'
    if (existing === '기타') return '기타'
  }

  // 4. 직접 유입 (referrer 없음)
  if (!ref) return '직접'

  return '기타'
}

/**
 * 최초 유입 스냅샷 생성 (first_touch JSONB 용)
 */
export function buildFirstTouch(input: AttributionInput & { session_id?: string | null }): Record<string, unknown> {
  const ft: Record<string, unknown> = {
    captured_at: new Date().toISOString(),
  }
  if (input.session_id) ft.session_id = input.session_id
  if (input.utm_source) ft.utm_source = input.utm_source
  if (input.utm_medium) ft.utm_medium = input.utm_medium
  if (input.utm_campaign) ft.utm_campaign = input.utm_campaign
  if (input.landing_page) ft.landing_page = input.landing_page
  if (input.referrer) ft.referrer = input.referrer
  return ft
}
