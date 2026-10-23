import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { unstable_cache } from 'next/cache'
import { isSignedIn } from '@/lib/pipeline/read-leads'
import { classifyLead } from '@/lib/inflow-taxonomy'
import questions from '@/config/inquiry_questions.json'

// 분석 › 문의 내용 (분석 재구성 v3 · 2026-10-23). 문의 1건 = 1행, 주제 태그 · 유입 분류 · 자주 나오는 질문.
// 연락처 · 실명은 보내지 않는다 (마케팅팀 원칙). 원문은 레퍼러 · utm 줄을 뺀 앞부분만.
export const dynamic = 'force-dynamic'

export interface InquiryRow {
  id: string
  inquiry_date: string
  company_name: string
  stage: string
  topics: string[]
  inflow: string       // 유입 분류 11 + 미분류
  inflow_sub: string
  industry: string | null
  site_category: string | null
  questions: string[]  // src/config/inquiry_questions.json
  snippet: string      // 원문 앞 200자
  has_body: boolean
  days: number | null  // 문의 → 도입 일수 (도입완료만)
}

const QS = (questions.questions as { key: string; keywords: string[] }[]).map(q => ({
  key: q.key,
  res: q.keywords.map(k => /^[A-Za-z0-9-]+$/.test(k) ? new RegExp(`(?<![A-Za-z])${k}(?![A-Za-z])`, 'i') : new RegExp(k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))),
}))

// 원문에서 분류 대상이 아닌 줄(레퍼러 · utm · 자동 등록 메모)을 뺀다
const body = (t: string | null) => (t || '').split('\n')
  .filter(l => !/^\s*>?\s*(레퍼러 주소|실제 레퍼러|utm_\w+|landing_page|referrer)\s*:/i.test(l))
  .join('\n').replace(/https?:\/\/\S+/g, ' ').replace(/^>\s?/gm, '').trim()

async function build() {
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)
  type L = { id: string; inquiry_date: string | null; created_at: string; company_name: string; stage: string; topic_tags: string[] | null; inquiry_channel: string | null; inquiry_source: string | null; industry: string | null; site_category: string | null; inquiry_content: string | null; converted_at: string | null }
  let leads: L[] = []
  for (let off = 0; ; off += 1000) {
    const { data, error } = await sb.from('pipeline_leads').select('id, inquiry_date, created_at, company_name, stage, topic_tags, inquiry_channel, inquiry_source, industry, site_category, inquiry_content, converted_at').order('id').range(off, off + 999)
    if (error) throw new Error(error.message)
    leads = leads.concat((data || []) as L[])
    if (!data || data.length < 1000) break
  }
  const rows: InquiryRow[] = leads.map(l => {
    const text = body(l.inquiry_content)
    const f = classifyLead(l.inquiry_channel, l.inquiry_source)
    return {
      id: l.id, inquiry_date: l.inquiry_date || l.created_at.slice(0, 10), company_name: l.company_name, stage: l.stage,
      topics: l.topic_tags || [], inflow: f.group, inflow_sub: f.sub, industry: l.industry, site_category: l.site_category,
      questions: text ? QS.filter(q => q.res.some(re => re.test(text))).map(q => q.key) : [],
      snippet: text.slice(0, 200), has_body: !!text.replace(/\[Slack 문의알림\]\s*자동등록/g, '').trim(),
      days: l.stage === '도입완료' && l.converted_at ? Math.max(0, Math.round((new Date(l.converted_at.slice(0, 10)).getTime() - new Date(l.inquiry_date || l.created_at.slice(0, 10)).getTime()) / 86400000)) : null,
    }
  }).sort((a, b) => b.inquiry_date.localeCompare(a.inquiry_date))
  return { rows, questions: QS.map(q => q.key), generated_at: new Date().toISOString() }
}

const cached = unstable_cache(build, ['analytics-inquiries-v2'], { revalidate: 300 })

export async function GET(request: Request) {
  try {
    // 미들웨어가 /api 를 거르지 않아 로그인 확인을 여기서 (10/23 — 고객사 · 매출 · 문의 원문이 로그인 없이 열렸음)
    if (!(await isSignedIn())) return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 })
    const fresh = new URL(request.url).searchParams.get('fresh') === '1'
    return NextResponse.json(fresh ? await build() : await cached())
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
