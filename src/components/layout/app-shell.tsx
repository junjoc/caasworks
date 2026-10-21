'use client'

import { useAuth } from '@/hooks/useAuth'
import { Sidebar } from './sidebar'
import { Header } from './header'
import { FeedbackFloatingButton } from '@/components/feedback/floating-button'

export function AppShell({ children }: { children: React.ReactNode }) {
  const { user, loading, signOut } = useAuth()

  return (
    <div className="h-screen bg-ds-bg overflow-hidden">
      <Sidebar user={user} onSignOut={signOut} />
      <div className="lg:ml-[var(--sidebar-width)] h-screen flex flex-col overflow-hidden">
        <Header user={user} />
        <main className="flex-1 px-5 pt-4 pb-5 overflow-auto">{children}</main>
      </div>
      <FeedbackFloatingButton />
    </div>
  )
}
