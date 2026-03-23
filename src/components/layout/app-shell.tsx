'use client'

import { useAuth } from '@/hooks/useAuth'
import { Sidebar } from './sidebar'
import { Header } from './header'
import { PageLoading } from '@/components/ui/loading'

export function AppShell({ children }: { children: React.ReactNode }) {
  const { user, loading, signOut } = useAuth()

  if (loading) {
    return <PageLoading />
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Sidebar user={user} />
      <div className="lg:ml-[var(--sidebar-width)]">
        <Header user={user} onSignOut={signOut} />
        <main className="p-6">{children}</main>
      </div>
    </div>
  )
}
