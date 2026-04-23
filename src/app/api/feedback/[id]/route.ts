import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  )
}

// GET /api/feedback/[id] — returns feedback + comments
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const sb = getSupabase()
    const [{ data: fb, error: fbErr }, { data: comments, error: cErr }] = await Promise.all([
      sb.from('user_feedbacks')
        .select('*, created_by_user:users!user_feedbacks_created_by_fkey(id, name, avatar_url), assigned_to_user:users!user_feedbacks_assigned_to_fkey(id, name, avatar_url)')
        .eq('id', params.id).maybeSingle(),
      sb.from('feedback_comments')
        .select('*, author:users(id, name, avatar_url, role)')
        .eq('feedback_id', params.id).order('created_at', { ascending: true }),
    ])
    if (fbErr) return NextResponse.json({ error: fbErr.message }, { status: 500 })
    if (cErr) return NextResponse.json({ error: cErr.message }, { status: 500 })
    if (!fb) return NextResponse.json({ error: 'not found' }, { status: 404 })
    return NextResponse.json({ data: { ...fb, comments } })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

// PATCH /api/feedback/[id] — update status/assignee/dev-log fields
export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const body = await request.json()
    const sb = getSupabase()

    // Auto-set timestamps based on status transitions
    const updates: any = { ...body }
    if (body.status === 'planned' && !body.planned_at) updates.planned_at = new Date().toISOString()
    if (body.status === 'in_progress' && !body.started_at) updates.started_at = new Date().toISOString()
    if (body.status === 'done' && !body.completed_at) updates.completed_at = new Date().toISOString()

    const { data, error } = await sb.from('user_feedbacks').update(updates).eq('id', params.id).select().single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ data })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

// DELETE
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const sb = getSupabase()
    const { error } = await sb.from('user_feedbacks').delete().eq('id', params.id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
