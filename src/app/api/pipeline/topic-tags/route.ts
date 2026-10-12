import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { classifyTopics, TOPIC_TAGS } from '@/lib/topic-tags'

// 리드 주제 태그
// - { lead_ids, reset_manual? } : 규칙으로 재분류. 사람이 고친 리드(topic_tags_manual)는 reset_manual 일 때만.
// - { lead_id, tags }           : 사람이 직접 지정 → topic_tags_manual = true (이후 재분류에서 제외)

export async function POST(request: NextRequest) {
  const body = await request.json()
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  )

  if (body.lead_id && Array.isArray(body.tags)) {
    const tags = (body.tags as string[]).filter(t => TOPIC_TAGS.includes(t))
    const { error } = await sb.from('pipeline_leads')
      .update({ topic_tags: tags.length ? tags : null, topic_tags_manual: true })
      .eq('id', body.lead_id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ updated: 1 })
  }

  const ids: string[] = Array.isArray(body.lead_ids) ? body.lead_ids : []
  if (!ids.length) return NextResponse.json({ error: 'lead_ids 필요' }, { status: 400 })

  let updated = 0
  for (let i = 0; i < ids.length; i += 100) {
    const { data: leads, error } = await sb.from('pipeline_leads')
      .select('id, inquiry_content, core_need, notes, topic_tags_manual')
      .in('id', ids.slice(i, i + 100))
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    for (const l of leads || []) {
      if (l.topic_tags_manual && !body.reset_manual) continue
      const { error: upErr } = await sb.from('pipeline_leads')
        .update({ topic_tags: classifyTopics(l), topic_tags_manual: false })
        .eq('id', l.id)
      if (!upErr) updated++
    }
  }
  return NextResponse.json({ updated })
}
