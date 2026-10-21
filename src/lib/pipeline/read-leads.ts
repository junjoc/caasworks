import { createClient } from '@supabase/supabase-js'
import { createServerSupabaseClient } from '@/lib/supabase/server'

// 세일즈 리스트·보드 API 공용: 로그인 여부는 쿠키로 확인하고, 읽기는 서버 키로 1,000행씩 병렬 (2026-10-21).
// 쿠키(사용자) 권한으로 읽으면 행마다 RLS 가 돌아 3~7초 걸렸다.
export async function isSignedIn() {
  const { data: { session } } = await createServerSupabaseClient().auth.getSession()
  return !!session
}

export async function readLeads<T>(cols: string): Promise<T[]> {
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)
  const { count, error: ce } = await sb.from('pipeline_leads').select('id', { count: 'exact', head: true })
  if (ce) throw new Error(ce.message)
  const n = Math.max(1, Math.ceil((count || 0) / 1000))
  const res = await Promise.all(Array.from({ length: n }, (_, i) => sb.from('pipeline_leads').select(cols).order('id').range(i * 1000, i * 1000 + 999)))
  const err = res.find(r => r.error)?.error
  if (err) throw new Error(err.message)
  return res.flatMap(r => (r.data || []) as unknown as T[])
}
