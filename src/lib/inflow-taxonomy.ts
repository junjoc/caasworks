// 유입 분류 11 (2026-10-21 확정) — 대분류 › 세부. 모든 대분류에 '기타'
// 저장된 값(리드 inquiry_channel/inquiry_source, GA 유입 행 channel/campaign_name)은 그대로 두고,
// 이 변환표로 읽어서 11개 분류로 보여준다. 저장 값 자체를 바꾸는 이전 작업은 다음 단계.
//
// 원칙: "어떻게 알게 됐나"(유입 경로)를 먼저 본다. 경로를 모를 때만 "어떻게 연락했나"(직접 연락)로 분류.
//   예) 대표전화 | 검색채널 → 검색 › 기타,  대표전화 | (빈값) → 직접 연락 › 대표전화

export const INFLOW_GROUPS = [
  { key: '검색', subs: ['네이버', '구글', '다음', '빙', '기타'] },
  { key: '생성형 AI', subs: ['ChatGPT', 'Gemini', 'Claude', 'Perplexity', 'Copilot', '기타'] },
  { key: '자사 채널', subs: ['홈페이지', '깃북', '해피톡', '기타'] },
  { key: '자사 블로그', subs: ['카스웍스 블로그', '네이버', '티스토리', '기타'] },
  { key: '외주 블로그', subs: ['팀부스터', '인플루언서', '기타'] },
  { key: '외부 글', subs: ['네이버', '티스토리', '브런치', '기타'] },
  { key: '언론·뉴스', subs: ['네이버 뉴스', '다음 뉴스', '언론사', '기타'] },
  { key: '커뮤니티', subs: ['네이버 카페', '다음 카페', '기타'] },
  { key: '소셜', subs: ['유튜브', '인스타그램', '페이스북', '링크드인', '카카오', '기타'] },
  { key: '광고', subs: ['네이버', '구글', '메타', '기타'] },
  { key: '직접 연락', subs: ['대표전화', '개인전화', '이메일', '추천', '행사', '기타'] },
] as const
export type InflowGroup = (typeof INFLOW_GROUPS)[number]['key'] | '미분류'
export interface Inflow { group: InflowGroup; sub: string; raw: string }

const has = (s: string, ...ks: string[]) => ks.some(k => s.includes(k))
const AI: [string[], string][] = [[['chatgpt', 'openai', 'searchgpt'], 'ChatGPT'], [['gemini', 'bard'], 'Gemini'], [['claude', 'anthropic'], 'Claude'], [['perplexity'], 'Perplexity'], [['copilot', 'bing-chat'], 'Copilot']]

/** 경로 글자(출처·유입경로)만 보고 분류. 모르면 null */
function bySource(srcRaw: string): Omit<Inflow, 'raw'> | null {
  const s = srcRaw.toLowerCase().trim()
  if (!s || s === '(빈값)' || s === '알수없음' || s === '기타') return null
  for (const [ks, name] of AI) if (has(s, ...ks)) return { group: '생성형 AI', sub: name }
  if (s === '생성형ai' || s.includes('생성형')) return { group: '생성형 AI', sub: '기타' }
  if (has(s, 'n_smart', 'n_video', 'n_ai', 'n_smc', '스마트스토어', '블로그 광고', '파워링크', '검색광고')) return { group: '광고', sub: '네이버' }
  if (has(s, 'gdn', 'google ads', '구글 광고')) return { group: '광고', sub: '구글' }
  if (s === '광고' || has(s, '쿠팡')) return { group: '광고', sub: '기타' }
  if (has(s, 'boosterlink', '팀부스터')) return { group: '외주 블로그', sub: '팀부스터' }
  if (s.includes('인플루언서')) return { group: '외주 블로그', sub: '인플루언서' }
  if (has(s, 'news.naver', '네이버 뉴스')) return { group: '언론·뉴스', sub: '네이버 뉴스' }
  if (has(s, 'news.daum', 'v.daum', '다음 뉴스')) return { group: '언론·뉴스', sub: '다음 뉴스' }
  if (has(s, '언론', '보도', '기사')) return { group: '언론·뉴스', sub: '기타' }
  if (has(s, 'cafe.naver', '네이버 카페')) return { group: '커뮤니티', sub: '네이버 카페' }
  if (has(s, 'cafe.daum', '다음 카페')) return { group: '커뮤니티', sub: '다음 카페' }
  if (has(s, 'youtube', '유튜브')) return { group: '소셜', sub: '유튜브' }
  if (has(s, 'instagram', '인스타')) return { group: '소셜', sub: '인스타그램' }
  if (has(s, 'facebook', '페이스북')) return { group: '소셜', sub: '페이스북' }
  if (has(s, 'linkedin', '링크드인')) return { group: '소셜', sub: '링크드인' }
  if (has(s, 'kakao', '카카오')) return { group: '소셜', sub: '카카오' }
  if (s === 'sns') return { group: '소셜', sub: '기타' }
  if (has(s, 'caas.works/blog', '카스웍스 블로그')) return { group: '자사 블로그', sub: '카스웍스 블로그' }
  if (has(s, 'blog.naver.com/caasworks') || s === '자사') return { group: '자사 블로그', sub: '네이버' }
  if (s === '블로그' || s === '자사 블로그') return { group: '자사 블로그', sub: '기타' }
  if (has(s, 'tistory', '티스토리')) return { group: '외부 글', sub: '티스토리' }
  if (has(s, 'brunch', '브런치')) return { group: '외부 글', sub: '브런치' }
  if (has(s, 'blog.naver', '네이버 블로그')) return { group: '외부 글', sub: '네이버' }
  if (has(s, 'gitbook', '깃북')) return { group: '자사 채널', sub: '깃북' }
  if (has(s, 'happytalk', '해피톡', 'channel.io')) return { group: '자사 채널', sub: '해피톡' }
  if (has(s, '공식홈페이지', '홈페이지', 'caas.works', 'caasworks', '(direct)')) return { group: '자사 채널', sub: '홈페이지' }
  if (has(s, 'naver', '네이버')) return { group: '검색', sub: '네이버' }
  if (has(s, 'google', '구글')) return { group: '검색', sub: '구글' }
  if (has(s, 'daum', '다음')) return { group: '검색', sub: '다음' }
  if (has(s, 'bing', '빙')) return { group: '검색', sub: '빙' }
  if (has(s, '검색')) return { group: '검색', sub: '기타' }
  if (has(s, '추천', '기존고객', '기존 고객', '이전 고객', '설계유입', '설계 유입', '가입사')) return { group: '직접 연락', sub: '추천' }
  if (has(s, '박람회', '세미나', '웨비나', '행사')) return { group: '직접 연락', sub: '행사' }
  if (has(s, '메일', 'email')) return { group: '직접 연락', sub: '이메일' }
  if (has(s, '대표전화')) return { group: '직접 연락', sub: '대표전화' }
  if (has(s, '개인전화')) return { group: '직접 연락', sub: '개인전화' }
  return null
}

/** 리드: 유입경로(source)를 먼저, 모르면 유입채널(channel)로 */
export function classifyLead(channel: string | null | undefined, source: string | null | undefined): Inflow {
  const ch = (channel || '').trim(), src = (source || '').trim()
  const raw = [ch, src].filter(Boolean).join(' / ') || '(미입력)'
  const viaSource = bySource(src)
  if (viaSource) {
    // "검색유입 | 네이버" 처럼 채널이 검색이면 네이버는 블로그가 아니라 검색
    if (ch === '검색유입' && viaSource.group === '외부 글') return { group: '검색', sub: viaSource.sub, raw }
    if (ch === '블로그' && viaSource.group === '검색' && viaSource.sub === '네이버') return { group: '자사 블로그', sub: '네이버', raw }
    if (ch === '외주 블로그') return { group: '외주 블로그', sub: viaSource.group === '외주 블로그' ? viaSource.sub : '기타', raw }
    return { ...viaSource, raw }
  }
  // 경로를 모름 → 채널로
  const C: Record<string, Omit<Inflow, 'raw'>> = {
    '대표전화': { group: '직접 연락', sub: '대표전화' }, '개인전화': { group: '직접 연락', sub: '개인전화' },
    '이메일': { group: '직접 연락', sub: '이메일' }, '추천': { group: '직접 연락', sub: '추천' }, '가입사': { group: '직접 연락', sub: '추천' },
    '행사방문': { group: '직접 연락', sub: '행사' }, '이벤트/행사': { group: '직접 연락', sub: '행사' },
    '해피톡': { group: '자사 채널', sub: '해피톡' }, '자사채널': { group: '자사 채널', sub: '기타' },
    '검색유입': { group: '검색', sub: '기타' }, '블로그': { group: '자사 블로그', sub: '기타' }, '외주 블로그': { group: '외주 블로그', sub: '기타' },
    '언론': { group: '언론·뉴스', sub: '기타' }, '네이버': { group: '광고', sub: '네이버' }, '구글': { group: '광고', sub: '구글' }, '메타': { group: '광고', sub: '메타' },
    '유튜브': { group: '소셜', sub: '유튜브' },
  }
  if (C[ch]) return { ...C[ch], raw }
  const viaCh = bySource(ch)
  if (viaCh) return { ...viaCh, raw }
  return { group: '미분류', sub: ch || '(미입력)', raw }
}

/** GA 유입 행(ad_performance 비광고): channel / campaign_name / notes(실제 출처) */
export function classifyGa(channel: string, sub: string, notes?: string | null): Inflow {
  const raw = `${channel} / ${sub}`
  if (channel === '검색유입') {
    if (sub === '생성형AI') { const s = bySource(notes || ''); return { group: '생성형 AI', sub: s && s.group === '생성형 AI' ? s.sub : '기타', raw } }
    if (sub === '네이버' || sub === '구글') return { group: '검색', sub, raw }
    if (sub === '기타' && notes) { const s = bySource(notes); if (s && (s.group === '검색' || s.group === '생성형 AI')) return { ...s, raw } }
    return { group: '검색', sub: '기타', raw }
  }
  if (channel === '블로그') return sub === '자사' || sub === '네이버' ? { group: '자사 블로그', sub: '네이버', raw } : sub === '티스토리' ? { group: '외부 글', sub: '티스토리', raw } : { group: '자사 블로그', sub: '기타', raw }
  return classifyLead(channel, sub)
}

export const INFLOW_ORDER: InflowGroup[] = [...INFLOW_GROUPS.map(g => g.key), '미분류']
