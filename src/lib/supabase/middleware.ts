import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  // Skip auth check for static assets and API routes
  const path = request.nextUrl.pathname
  if (path.startsWith('/_next') || path.startsWith('/favicon') || path.includes('.')) {
    return supabaseResponse
  }

  try {
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return request.cookies.getAll()
          },
          setAll(cookiesToSet: any[]) {
            cookiesToSet.forEach(({ name, value }) =>
              request.cookies.set(name, value)
            )
            supabaseResponse = NextResponse.next({ request })
            cookiesToSet.forEach(({ name, value, options }) =>
              supabaseResponse.cookies.set(name, value, {
                ...options,
                // Keep sessions alive for a long time
                maxAge: options?.maxAge ?? 60 * 60 * 24 * 365,
                sameSite: 'lax',
                secure: process.env.NODE_ENV === 'production',
                path: '/',
              })
            )
          },
        },
      }
    )

    // 10/21 속도: getUser() 는 화면 이동마다 Supabase 인증 서버를 다녀와 0.2~0.3초씩 걸렸다.
    // 여기서는 쿠키의 세션만 읽는다(만료 때만 갱신 요청). 데이터 보호는 API·RLS 몫, 미들웨어는 로그인 화면 이동만 담당.
    const sessionResult = await Promise.race([
      supabase.auth.getSession(),
      new Promise<{ data: { session: null } }>((resolve) =>
        setTimeout(() => resolve({ data: { session: null } }), 3000)
      ),
    ])

    const user = sessionResult.data.session?.user ?? null

    // Only redirect to login if we're sure there's no session cookie at all
    const hasSessionCookie = request.cookies.getAll().some(c => c.name.startsWith('sb-'))

    if (!user && !hasSessionCookie && !path.startsWith('/login')) {
      const url = request.nextUrl.clone()
      url.pathname = '/login'
      return NextResponse.redirect(url)
    }

    if (user && path.startsWith('/login')) {
      const url = request.nextUrl.clone()
      url.pathname = '/'
      return NextResponse.redirect(url)
    }
  } catch (error) {
    // If Supabase is completely down, just serve the page
    console.error('Middleware auth error:', error)
  }

  return supabaseResponse
}
