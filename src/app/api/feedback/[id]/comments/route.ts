import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  )
}

// POST /api/feedback/[id]/comments
// Body: { comment, author_id, is_admin_directive?, is_claude_report? }
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const body = await request.json()
    if (!body.comment) return NextResponse.json({ error: 'comment required' }, { status: 400 })
    const sb = getSupabase()

    // Determine author_type from user role
    let authorType: 'user' | 'admin' | 'claude' = 'user'
    if (body.is_claude_report) authorType = 'claude'
    else if (body.author_id) {
      const { data: user } = await sb.from('users').select('role').eq('id', body.author_id).maybeSingle()
      if (user?.role === 'admin') authorType = 'admin'
    }

    const { data, error } = await sb.from('feedback_comments').insert({
      feedback_id: params.id,
      author_id: body.author_id || null,
      author_type: authorType,
      comment: body.comment,
      is_admin_directive: !!body.is_admin_directive,
      is_claude_report: !!body.is_claude_report,
    }).select().single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ data })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
