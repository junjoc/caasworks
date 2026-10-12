// 리드 유입채널 판정.
// 저장 기준은 화면 분류(CHANNEL_OPTIONS + CHANNEL_SUB_SOURCES): 리드 화면과 광고성과 연동(sync-lead-to-ads)이 이 값에 의존한다.
// 팀이 정한 14종 표준은 리포트에서 묶어 보여줄 때만 쓴다 (2026-10-12 결정).

export interface AttributionInput {
  utm_source?: string | null
  utm_medium?: string | null
  utm_campaign?: string | null
  referrer?: string | null
  landing_page?: string | null
}

export interface LeadChannel {
  channel: string
  source: string
}

const AI_HOSTS = ['chatgpt.com', 'openai.com', 'claude.ai', 'gemini.google', 'perplexity.ai', 'vertexaisearch.cloud.google.com', 'copilot.microsoft.com']

function hostOf(url: string): string | null {
  try { return new URL(url).host.toLowerCase() } catch { return null }
}

export function inferLeadChannel(a: AttributionInput): LeadChannel {
  const source = (a.utm_source || '').toLowerCase()
  const medium = (a.utm_medium || '').toLowerCase()

  if (source || medium) {
    const paid = ['cpc', 'ppc', 'paidsearch', 'sa', 'paid'].includes(medium)
    if (source.includes('naver')) return paid ? { channel: '네이버', source: '검색광고' } : { channel: '검색유입', source: '네이버' }
    if (source.includes('google')) return paid ? { channel: '구글', source: '검색광고' } : { channel: '검색유입', source: '구글' }
    if (['facebook', 'instagram', 'meta'].some(s => source.includes(s))) return { channel: '메타', source: source.includes('instagram') ? '인스타그램' : '페이스북' }
    if (source.includes('youtube')) return { channel: '유튜브', source: paid ? '광고' : '오가닉' }
    if (medium === 'blog') return { channel: '블로그', source: source.includes('tistory') ? '티스토리' : '네이버' }
  }

  const ref = (a.referrer || '').trim()
  const host = ref ? hostOf(ref) : null
  // 레퍼러가 비었거나 "없음(다이렉트)" 같은 텍스트면 직접 방문
  if (!host) return { channel: '자사채널', source: '홈페이지' }

  if (host.endsWith('blog.naver.com')) return { channel: '블로그', source: '네이버' }
  if (host.endsWith('tistory.com')) return { channel: '블로그', source: '티스토리' }
  if (host.endsWith('search.naver.com')) return { channel: '검색유입', source: '네이버' }
  if (AI_HOSTS.some(h => host.includes(h))) return { channel: '검색유입', source: '생성형AI' }
  // 구글 오가닉은 경로 없이 https://www.google.com/ 으로만 넘어온다
  if (/(^|\.)google\.(com|co\.kr)$/.test(host)) return { channel: '검색유입', source: '구글' }
  if (host.endsWith('daum.net') || host.endsWith('bing.com')) return { channel: '검색유입', source: '기타' }
  if (host.endsWith('youtube.com')) return { channel: '유튜브', source: '오가닉' }
  if (host.endsWith('instagram.com')) return { channel: '메타', source: '인스타그램' }
  if (host.endsWith('facebook.com')) return { channel: '메타', source: '페이스북' }
  if (host.endsWith('caas.works') || host.endsWith('caas.co.kr') || host.includes('caasworks')) return { channel: '자사채널', source: '홈페이지' }

  return { channel: '자사채널', source: '기타' }
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
