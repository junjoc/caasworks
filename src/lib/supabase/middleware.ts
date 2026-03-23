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
              supabaseResponse.cookies.set(name, value, options)
            )
          },
        },
      }
    )

    // Add 3 second timeout - don't block page load if Supabase is slow
    const userResult = await Promise.race([
      supabase.auth.getUser(),
      new Promise<{ data: { user: null } }>((resolve) =>
        setTimeout(() => resolve({ data: { user: null } }), 3000)
      ),
    ])

    const user = userResult.data.user

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
