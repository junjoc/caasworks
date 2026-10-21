'use client'

import { useEffect } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { Sidebar } from './sidebar'
import { Header } from './header'
import { FeedbackFloatingButton } from '@/components/feedback/floating-button'

export function AppShell({ children }: { children: React.ReactNode }) {
  const { user, loading, signOut } = useAuth()

  // 10/21 속도: 서버 함수는 몇 분 쉬면 잠들어 첫 호출이 1~4초. CRM 을 열어 둔 동안 주요 API 를 4분마다 깨워 둔다(창이 보일 때만).
  useEffect(() => {
    const post = (u: string) => fetch(u, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"warm":true}' }).catch(() => {})
    const ping = () => {
      if (document.visibilityState !== 'visible') return
      post('/api/pipeline/leads'); post('/api/pipeline/board')
      fetch('/api/pipeline/lead/warm').catch(() => {}); fetch('/api/dashboard').catch(() => {})
    }
    ping()
    const t = setInterval(ping, 4 * 60 * 1000)
    document.addEventListener('visibilitychange', ping)
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', ping) }
  }, [])

  return (
    <div className="h-screen bg-ds-bg overflow-hidden">
      <Sidebar user={user} onSignOut={signOut} />
      <div className="lg:ml-[var(--sidebar-width)] h-screen flex flex-col overflow-hidden">
        <Header user={user} />
        <main className="flex-1 px-5 pt-4 pb-16 overflow-auto scroll-stable">{/* pb-16: 오른쪽 아래 피드백 버튼이 표 끝(페이지 화살표)을 가리지 않게 */}{children}</main>
      </div>
      <FeedbackFloatingButton />
    </div>
  )
}
