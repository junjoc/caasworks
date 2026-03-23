'use client'

import { LogOut, Bell } from 'lucide-react'
import type { User } from '@/types/database'

interface HeaderProps {
  user: User | null
  onSignOut: () => void
}

export function Header({ user, onSignOut }: HeaderProps) {
  const roleLabels: Record<string, string> = {
    admin: '관리자',
    member: '일반',
    accountant: '회계',
  }

  return (
    <header className="sticky top-0 z-30 bg-white border-b border-gray-200 h-16">
      <div className="flex items-center justify-end h-full px-6 gap-4">
        <button className="p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100">
          <Bell className="w-5 h-5" />
        </button>

        {user && (
          <div className="flex items-center gap-3">
            <div className="text-right hidden sm:block">
              <p className="text-sm font-medium text-gray-900">{user.name}</p>
              <p className="text-xs text-gray-500">{roleLabels[user.role] || user.role}</p>
            </div>
            <button
              onClick={onSignOut}
              className="p-2 text-gray-400 hover:text-red-600 rounded-lg hover:bg-gray-100"
              title="로그아웃"
            >
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        )}
      </div>
    </header>
  )
}
