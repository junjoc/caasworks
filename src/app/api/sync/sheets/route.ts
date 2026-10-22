import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { isSignedIn } from '@/lib/pipeline/read-leads'
import { runSheetSync } from '@/lib/sheet-sync'

// 매출 현황 [지금 동기화] (2026-10-22) — GET: 최근 실행 기록 · POST {apply, force}: 미리보기(apply=false) 또는 반영
export const dynamic = 'force-dynamic'
export const maxDuration = 300
const db = () => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

export async function GET() {
  if (!(await isSignedIn())) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const { data, error } = await db().from('sync_runs').select('id, created_at, trigger, applied, ok, held, ms, summary').eq('kind', 'revenue_sheet').order('created_at', { ascending: false }).limit(10)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ runs: data })
}

export async function POST(req: Request) {
  if (!(await isSignedIn())) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const { apply = false, force = false } = await req.json().catch(() => ({}))
  const res = await runSheetSync(db(), { apply: !!apply, force: !!force, trigger: apply ? 'button' : 'preview' })
  return NextResponse.json(res)
}
