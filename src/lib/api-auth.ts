import { NextResponse } from 'next/server'
import { isSignedIn } from '@/lib/pipeline/read-leads'

// /api 는 미들웨어가 거르지 않는다 (src/middleware.ts matcher 에서 api/ 제외) → 라우트마다 이걸 먼저 부른다 (2026-10-23).
// 통과: 로그인한 사용자(쿠키) 또는 서버끼리 부르는 요청(Authorization: Bearer CRON_SECRET — 매일 동기화가 광고 · GA 동기화를 부를 때).
// 막힌 요청이면 401 응답을, 통과면 null 을 돌려준다.
export async function denyIfNotSignedIn(request: Request): Promise<NextResponse | null> {
  const secret = process.env.CRON_SECRET?.trim()
  if (secret && request.headers.get('authorization') === `Bearer ${secret}`) return null
  if (await isSignedIn()) return null
  return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 })
}

// 서버끼리 부를 때 붙이는 머리 (매일 동기화 → 광고 · GA 동기화)
export const internalAuthHeader = (): Record<string, string> => {
  const secret = process.env.CRON_SECRET?.trim()
  return secret ? { Authorization: `Bearer ${secret}` } : {}
}
