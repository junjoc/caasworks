'use client'

import { useAuth } from '@/hooks/useAuth'
import { Sidebar } from './sidebar'
import { Header } from './header'

export function AppShell({ children }: { children: React.ReactNode }) {
  const { user, loading, signOut } = useAuth()

  return (
    <div className="min-h-screen bg-surface-page">
      <Sidebar user={user} onSignOut={signOut} />
      <div className="lg:ml-[var(--sidebar-width)] min-h-screen flex flex-col">
        <Header user={user} />
        <main className="flex-1 p-5">{children}</main>
      </div>
    </div>
  )
}
