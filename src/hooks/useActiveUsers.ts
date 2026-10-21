'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

// 활성 사용자 목록 — 앱에서 한 번만 읽는다 (2026-10-21 속도: 화면마다 users 를 따로 읽던 것)
type U = { id: string; name: string }
let cached: U[] | null = null
let pending: Promise<U[]> | null = null
function load() {
  if (!pending) pending = Promise.resolve(createClient().from('users').select('id, name').eq('is_active', true).order('name'))
    .then(({ data }) => (cached = (data || []) as U[]))
    .catch(() => { pending = null; return [] as U[] })
  return pending
}
export function useActiveUsers() {
  const [users, setUsers] = useState<U[]>(cached || [])
  useEffect(() => { if (!cached) load().then(setUsers) }, [])
  return users
}
