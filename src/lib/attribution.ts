// STEP 3-B: 관통(Attribution) 표준화 유틸
// 팀 결정 (2026-07-03): 표준 채널 14종 통일

export type InquiryChannel =
  | '유료검색_네이버' | '유료검색_구글'
  | '오가닉검색'
  | '블로그'
  | '직접' | '추천/외부링크'
  | '전화_대표' | '전화_개인'
  | '이벤트/행사' | '채팅상담'
  | '이메일' | '제품가입'
  | 'AI어시스턴트' | '기타/미분류'

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
 * utm/referrer/기존 값에서 표준 채널(14종) 도출.
 * 우선순위: utm > referrer > inquiry_source / inquiry_channel
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
    return '유료검색_구글'  // 소스 불명 시 구글로 기본 (팀 결정 필요 시 변경)
  }
  if (medium === 'organic' || medium === 'seo') return '오가닉검색'
  if (medium === 'referral') return '추천/외부링크'
  if (medium === 'email') return '이메일'
  if (medium === 'social') return '기타/미분류'  // SNS 는 팀 논의 후 별도 신설 예정
  if (medium === 'blog') return '블로그'

  // 2. referrer 기반 (utm 없을 때)
  if (ref.includes('naver.com') || ref.includes('search.naver')) {
    if (ref.includes('cr') || ref.includes('ad.')) return '유료검색_네이버'
    return '오가닉검색'
  }
  if (ref.includes('google.com') || ref.includes('google.co.kr')) {
    if (ref.includes('adurl') || ref.includes('/aclk')) return '유료검색_구글'
    return '오가닉검색'
  }
  if (ref.includes('blog.naver.com') || ref.includes('m.blog.naver.com')) return '블로그'
  if (ref.includes('tistory.com')) return '블로그'
  if (ref.includes('daum.net') || ref.includes('search.daum')) return '오가닉검색'
  // AI 어시스턴트 refer (chat.openai.com, claude.ai, gemini.google.com, perplexity)
  if (ref.includes('openai.com') || ref.includes('chatgpt.com')
      || ref.includes('claude.ai') || ref.includes('gemini.google')
      || ref.includes('perplexity.ai') || ref.includes('bard.google')) {
    return 'AI어시스턴트'
  }

  // 3. inquiry_source / inquiry_channel 기존 값 (Slack 인입 등 수기)
  //    팀 매핑 표 (2026-07-03) 기준
  if (existing) {
    // 전화
    if (existing.includes('대표전화')) return '전화_대표'
    if (existing.includes('개인전화')) return '전화_개인'
    // 채팅
    if (existing === '해피톡' || existing === '채팅상담') return '채팅상담'
    // 이메일
    if (existing === '이메일') return '이메일'
    // 제품가입 (기존: 가입사)
    if (existing === '가입사' || existing === '제품가입') return '제품가입'
    // 이벤트/행사 (기존: 행사방문)
    if (existing === '행사방문' || existing === '이벤트' || existing === '이벤트/행사') return '이벤트/행사'
    // 추천/외부링크
    if (existing === '추천' || existing === '외부링크' || existing === '추천/외부링크') return '추천/외부링크'
    // 블로그
    if (existing.includes('블로그')) return '블로그'
    // 오가닉/유료 (구분 없을 때는 오가닉 우선. 국장 확정 후 재분류 대상)
    if (existing === '검색유입' || existing === '오가닉_네이버' || existing === '오가닉_구글'
        || existing === '오가닉_기타' || existing.includes('오가닉') || existing.includes('검색')) return '오가닉검색'
    // 유료검색
    if (existing.includes('유료검색_네이버')) return '유료검색_네이버'
    if (existing.includes('유료검색_구글')) return '유료검색_구글'
    // AI
    if (existing === 'AI어시스턴트' || existing === 'AI Assistant') return 'AI어시스턴트'
    // 자사채널 (팀 애매 표시. 임시로 직접으로 통합. 국장 확정 후 재분류)
    if (existing === '자사채널') return '직접'
    if (existing === '직접') return '직접'
    // 기타
    if (existing === '기타' || existing === '기타/미분류' || existing === '(not set)' || existing === '미분류') return '기타/미분류'
  }

  // 4. 직접 유입 (referrer 없음)
  if (!ref) return '직접'

  return '기타/미분류'
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
