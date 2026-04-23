import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  )
}

// GET /api/feedback?status=submitted&page=1&limit=50
export async function GET(request: NextRequest) {
  try {
    const sb = getSupabase()
    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status')
    const category = searchParams.get('category')
    const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 200)
    const offset = parseInt(searchParams.get('offset') || '0')

    let q = sb
      .from('user_feedbacks')
      .select('*, created_by_user:users!user_feedbacks_created_by_fkey(id, name, avatar_url), assigned_to_user:users!user_feedbacks_assigned_to_fkey(id, name, avatar_url)')
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1)

    if (status) q = q.eq('status', status)
    if (category) q = q.eq('category', category)

    const { data, error } = await q
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ data })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

// POST /api/feedback  { title, description, category?, priority?, target_page?, created_by? }
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    if (!body.title) return NextResponse.json({ error: 'title required' }, { status: 400 })
    const sb = getSupabase()
    const { data, error } = await sb.from('user_feedbacks').insert({
      title: body.title,
      description: body.description || null,
      category: body.category || 'feature',
      priority: body.priority || 'normal',
      target_page: body.target_page || null,
      created_by: body.created_by || null,
      status: 'submitted',
    }).select().single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ data })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
