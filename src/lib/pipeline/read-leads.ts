import { createClient } from '@supabase/supabase-js'
import { createServerSupabaseClient } from '@/lib/supabase/server'

// 세일즈 리스트·보드 API 공용: 로그인 여부는 쿠키로 확인하고, 읽기는 서버 키로 1,000행씩 병렬 (2026-10-21).
// 쿠키(사용자) 권한으로 읽으면 행마다 RLS 가 돌아 3~7초 걸렸다.
export async function isSignedIn() {
  const { data: { session } } = await createServerSupabaseClient().auth.getSession()
  return !!session
}

/** 2023~2025.1 인바운드 시트에서 가져온 기록 (10/22) — 메모 첫 줄 표시로 구분. 리스트 [이전 기록] 탭에만, 보드·KPI 제외 */
export const isLegacy = (l: Record<string, unknown>) => String(l.notes ?? '').startsWith('[이전 기록]')

export async function readLeads<T>(cols: string): Promise<T[]> {
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)
  // 건수 조회 없이 3묶음(3,000행)을 한 번에 — 넘치면 이어서
  const page = (i: number) => sb.from('pipeline_leads').select(cols).order('id').range(i * 1000, i * 1000 + 999)
  const res = await Promise.all([0, 1, 2].map(page))
  while (res[res.length - 1].data?.length === 1000) res.push(await page(res.length))
  const err = res.find(r => r.error)?.error
  if (err) throw new Error(err.message)
  return res.flatMap(r => (r.data || []) as unknown as T[])
}
