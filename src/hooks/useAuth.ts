'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { User } from '@/types/database'

// 앱 전체에서 사용자 정보를 한 번만 읽는다 (2026-10-21).
// 전에는 useAuth 를 쓰는 컴포넌트마다 users 테이블을 따로 읽어서 한 화면에 같은 요청이 6~9번 나갔다.
let cachedUser: User | null = null
let cachedLoading = true
let started = false
const listeners = new Set<() => void>()
const notify = () => listeners.forEach(l => l())

async function loadUser(authUserId: string, email: string | null | undefined) {
  const sb = createClient()
  try {
    const { data: byId } = await sb.from('users').select('*').eq('id', authUserId).maybeSingle()
    if (byId) { cachedUser = byId; return }
    // auth.users ↔ public.users id 가 다른 경우(구글 로그인 전에 시드된 사용자) 이메일로
    if (email) {
      const { data: byEmail } = await sb.from('users').select('*').eq('email', email).maybeSingle()
      if (byEmail) cachedUser = byEmail
    }
  } catch { /* users 테이블이 느려도 화면은 띄운다 */ }
}

function start() {
  if (started) return
  started = true
  const supabase = createClient()
  // 세션은 쿠키에서 읽어 네트워크 없이 바로. 예전과 같이 loading 은 세션 확인 직후 false (사용자 행은 뒤따라 채워진다)
  supabase.auth.getSession().then(({ data: { session } }) => {
    cachedLoading = false; notify()
    if (session?.user) loadUser(session.user.id, session.user.email).then(notify)
  }).catch(() => { cachedLoading = false; notify() })
  // 로그인/로그아웃/프로필 변경만 반영 (INITIAL_SESSION·토큰 갱신은 다시 읽지 않는다)
  supabase.auth.onAuthStateChange((event, session) => {
    if (event === 'SIGNED_OUT') { cachedUser = null; cachedLoading = false; notify(); return }
    if (event !== 'SIGNED_IN' && event !== 'USER_UPDATED') return
    if (session?.user && (!cachedUser || cachedUser.id !== session.user.id || event === 'USER_UPDATED')) loadUser(session.user.id, session.user.email).then(notify)
  })
}

export function useAuth() {
  const [, force] = useState(0)
  useEffect(() => {
    const l = () => force(n => n + 1)
    listeners.add(l)
    start()
    return () => { listeners.delete(l) }
  }, [])
  const signOut = useCallback(async () => {
    await createClient().auth.signOut()
    cachedUser = null
    window.location.href = '/login'
  }, [])
  return { user: cachedUser, loading: cachedLoading, signOut }
}
