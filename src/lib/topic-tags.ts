// 리드 주제 태그 자동 분류. 규칙은 src/config/topic_tags.json (마케팅팀 수정용).
// scripts/marketing/backfill-topic-tags.mjs 가 같은 로직을 쓴다 — 바꾸면 둘 다 바꿀 것.
import rules from '@/config/topic_tags.json'

interface TopicRule { tag: string; keywords: string[] }

export const TOPIC_TAGS: string[] = [...(rules.tags as TopicRule[]).map(r => r.tag), rules.fallback, rules.empty_label]
export const TOPIC_FALLBACK: string = rules.fallback
export const TOPIC_EMPTY: string = rules.empty_label

// URL 과 "레퍼러 주소:" 줄은 분류 대상에서 뺀다 (주소 속 영문이 AI/LH 등에 걸리는 것 방지)
function cleanText(parts: (string | null | undefined)[]): string {
  return parts
    .filter(Boolean)
    .join('\n')
    .split('\n')
    .filter(line => !/^\s*(레퍼러 주소|실제 레퍼러)\s*:/.test(line))
    .join('\n')
    .replace(/https?:\/\/\S+/gi, ' ')
}

function matches(text: string, lower: string, kw: string): boolean {
  // 영문/숫자/하이픈만으로 된 짧은 약어는 다른 영단어 안에 묻힌 경우를 제외
  if (/^[A-Za-z0-9-]+$/.test(kw)) {
    const re = new RegExp(`(?<![A-Za-z])${kw.replace(/[-]/g, '\\-')}(?![A-Za-z])`, 'i')
    return re.test(text)
  }
  return lower.includes(kw.toLowerCase())
}

// 분류할 실제 문장이 없는지: 폼이 붙이는 utm/landing_page 줄, Slack 자동등록 메모는 내용이 아니다
function isEmptyBody(text: string): boolean {
  return !text
    .replace(/>?\s*(utm_\w+|landing_page)\s*:\s*\S*/gi, ' ')
    .replace(/\[Slack 문의알림\]\s*자동등록/g, ' ')
    .replace(/[>\s|-]+/g, '')
}

export function classifyTopics(parts: { inquiry_content?: string | null; core_need?: string | null; notes?: string | null }): string[] {
  const text = cleanText([parts.inquiry_content, parts.core_need, parts.notes])
  if (isEmptyBody(text)) return [rules.empty_label]
  const lower = text.toLowerCase()
  const tags = (rules.tags as TopicRule[])
    .filter(r => r.keywords.some(kw => matches(text, lower, kw)))
    .map(r => r.tag)
  return tags.length ? tags : [rules.fallback]
}

// 저장 직후 자동 분류. 사람이 고친 태그는 건드리지 않는다.
// 리드 저장과 분리된 별도 update 라서 실패해도(컬럼 없음 등) 저장 자체는 영향 없음.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function autoTagLead(sb: any, leadId: string): Promise<void> {
  try {
    const { data, error } = await sb.from('pipeline_leads')
      .select('inquiry_content, core_need, notes, topic_tags_manual').eq('id', leadId).single()
    if (error || !data || data.topic_tags_manual) return
    await sb.from('pipeline_leads').update({ topic_tags: classifyTopics(data) }).eq('id', leadId)
  } catch {
    // 태그는 부가 정보라 실패해도 무시
  }
}
