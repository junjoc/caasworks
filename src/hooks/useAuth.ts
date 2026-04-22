'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { User } from '@/types/database'

export function useAuth() {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const supabaseRef = useRef(createClient())
  const mountedRef = useRef(true)

  // Fetch user from public.users by auth id first; fall back to email if
  // no row exists with that id (auth.users ↔ public.users id mismatch is
  // common when users were seeded before their Google OAuth login).
  const fetchUser = useCallback(async (authUserId: string, email: string | null | undefined) => {
    try {
      const sb = supabaseRef.current
      const { data: byId } = await sb.from('users').select('*').eq('id', authUserId).maybeSingle()
      if (byId) {
        if (mountedRef.current) setUser(byId)
        return
      }
      if (email) {
        const { data: byEmail } = await sb.from('users').select('*').eq('email', email).maybeSingle()
        if (byEmail && mountedRef.current) setUser(byEmail)
      }
    } catch {
      // silently fail - user table might be slow
    }
  }, [])

  useEffect(() => {
    const supabase = supabaseRef.current
    mountedRef.current = true

    // Fast path: getSession reads from cookie, no network
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user && mountedRef.current) {
        fetchUser(session.user.id, session.user.email)
      }
      if (mountedRef.current) setLoading(false)
    }).catch(() => {
      if (mountedRef.current) setLoading(false)
    })

    // Listen for auth changes (login/logout)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!mountedRef.current) return
      if (session?.user) {
        fetchUser(session.user.id, session.user.email)
      } else {
        setUser(null)
      }
      setLoading(false)
    })

    // Safety: never hang more than 2 seconds
    const timeout = setTimeout(() => {
      if (mountedRef.current) setLoading(false)
    }, 2000)

    return () => {
      mountedRef.current = false
      clearTimeout(timeout)
      subscription.unsubscribe()
    }
  }, [fetchUser])

  const signOut = useCallback(async () => {
    await supabaseRef.current.auth.signOut()
    window.location.href = '/login'
  }, [])

  return { user, loading, signOut }
}
