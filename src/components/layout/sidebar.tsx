'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import type { User } from '@/types/database'
import { createClient } from '@/lib/supabase/client'
import { NAV_MENU, roleCanAccess, ADMIN_ONLY_PATHS } from '@/lib/nav-menu'

// ──────────────────────────────────────────────────────────────
// TEMPORARY KILL-SWITCH — 2026-04-22
// Role-based menu filtering is currently BYPASSED so all logged-in
// users see every menu (including /settings/users, /settings/roles).
// This is an emergency measure while the 역할 관리 UI is being
// debugged. Set to `false` to re-enable proper role filtering.
// ──────────────────────────────────────────────────────────────
const DISABLE_ROLE_FILTERING = true
import {
  LayoutDashboard,
  Megaphone,
  Target,
  Users,
  Wallet,
  Package,
  MessageSquare,
  ClipboardList,
  Settings,
  ChevronDown,
  Menu,
  X,
  LogOut,
  BarChart3,
  UserCircle,
} from 'lucide-react'

// Icon color mapping for each nav section
const iconColors: Record<string, { color: string; bg: string }> = {
  '대시보드': { color: '#1890ff', bg: '#e8f4ff' },
  '분석': { color: '#8b5cf6', bg: '#f3e8ff' },
  '마케팅': { color: '#f97316', bg: '#fff7ed' },
  '세일즈': { color: '#7c3aed', bg: '#f3e8ff' },
  '고객관리': { color: '#0a54bf', bg: '#e8f4ff' },
  '재무관리': { color: '#10b981', bg: '#ecfdf5' },
  '운영관리': { color: '#f59e0b', bg: '#fef3c7' },
  'VoC/CS': { color: '#ec4899', bg: '#fce7f3' },
  '업무': { color: '#6366f1', bg: '#eef2ff' },
  '설정': { color: '#6b7280', bg: '#f3f4f6' },
}

const iconFor: Record<string, React.ReactNode> = {
  '대시보드': <LayoutDashboard className="w-[16px] h-[16px]" />,
  '분석': <BarChart3 className="w-[16px] h-[16px]" />,
  '마케팅': <Megaphone className="w-[16px] h-[16px]" />,
  '세일즈': <Target className="w-[16px] h-[16px]" />,
  '고객관리': <Users className="w-[16px] h-[16px]" />,
  '재무관리': <Wallet className="w-[16px] h-[16px]" />,
  '운영관리': <Package className="w-[16px] h-[16px]" />,
  'VoC/CS': <MessageSquare className="w-[16px] h-[16px]" />,
  '업무': <ClipboardList className="w-[16px] h-[16px]" />,
  '설정': <Settings className="w-[16px] h-[16px]" />,
}

interface SidebarProps {
  user: User | null
  onSignOut: () => void
}

export function Sidebar({ user, onSignOut }: SidebarProps) {
  const pathname = usePathname()
  const [expandedItems, setExpandedItems] = useState<string[]>([])
  const [mobileOpen, setMobileOpen] = useState(false)
  const [allowedPaths, setAllowedPaths] = useState<string[] | null>(null)

  // Fetch the current user's role permissions
  useEffect(() => {
    if (!user?.role) {
      setAllowedPaths(null)
      return
    }
    // Admin role always gets everything
    if (user.role === 'admin') {
      setAllowedPaths(['*'])
      return
    }
    const sb = createClient()
    sb.from('roles').select('allowed_paths').eq('name', user.role).single().then(({ data }) => {
      const paths = (data?.allowed_paths as string[] | undefined) || []
      setAllowedPaths(paths)
    })
  }, [user?.role])

  // Auto-expand active parent on mount
  useEffect(() => {
    const activeParent = NAV_MENU.find(
      item => item.children?.some(c => pathname?.startsWith(c.href))
    )
    if (activeParent && !expandedItems.includes(activeParent.label)) {
      setExpandedItems(prev => [...prev, activeParent.label])
    }
  }, [pathname])

  const toggleExpanded = (label: string) => {
    setExpandedItems((prev) =>
      prev.includes(label) ? prev.filter((l) => l !== label) : [...prev, label]
    )
  }

  const isActive = (href: string) => {
    if (href === '/') return pathname === '/'
    return pathname === href
  }

  const isAdmin = user?.role === 'admin'

  // Child access check: admin-only paths (e.g. /settings/users, /settings/roles) require admin
  const canSeeChild = (href: string): boolean => {
    // TEMPORARY: grant all logged-in users full access (see kill-switch above)
    if (DISABLE_ROLE_FILTERING) return !!user
    if (ADMIN_ONLY_PATHS.includes(href)) return isAdmin
    return roleCanAccess(allowedPaths, href)
  }

  // Filter menu by role permissions
  const filteredItems = NAV_MENU
    .map(section => {
      if (section.href) {
        // Top-level leaf item
        return canSeeChild(section.href) ? section : null
      }
      // Section with children — filter children and keep only if any remain
      const visibleChildren = section.children?.filter(c => canSeeChild(c.href)) || []
      return visibleChildren.length > 0
        ? { ...section, children: visibleChildren }
        : null
    })
    .filter((s): s is NonNullable<typeof s> => s !== null)

  const IconWrapper = ({ label, children, isItemActive }: { label: string; children: React.ReactNode; isItemActive: boolean }) => {
    const colors = iconColors[label] || { color: '#6b7280', bg: '#f3f4f6' }
    return (
      <span
        className="w-6 h-6 rounded-md flex items-center justify-center flex-shrink-0 transition-colors"
        style={{
          backgroundColor: isItemActive ? colors.bg : colors.bg + '99',
          color: colors.color,
        }}
      >
        {children}
      </span>
    )
  }

  const sidebarContent = (
    <nav className="flex-1 py-2 overflow-y-auto">
      {filteredItems.map((item) => {
        const hasChildren = !!item.children && item.children.length > 0
        const isExpanded = expandedItems.includes(item.label)
        const hasActiveChild = hasChildren && item.children!.some((c) => isActive(c.href))

        if (!hasChildren && item.href) {
          const active = isActive(item.href)
          return (
            <Link
              key={item.label}
              href={item.href}
              onClick={() => setMobileOpen(false)}
              className={cn(
                'sidebar-link',
                active && 'sidebar-link-active'
              )}
            >
              <IconWrapper label={item.label} isItemActive={active}>
                {iconFor[item.label]}
              </IconWrapper>
              <span className="flex-1">{item.label}</span>
            </Link>
          )
        }

        return (
          <div key={item.label} className="mb-0.5">
            <button
              onClick={() => toggleExpanded(item.label)}
              className={cn(
                'sidebar-link w-full justify-between',
                hasActiveChild && 'text-primary-500 font-medium'
              )}
              style={{ width: 'calc(100% - 16px)' }}
            >
              <span className="flex items-center gap-2.5">
                <IconWrapper label={item.label} isItemActive={!!hasActiveChild}>
                  {iconFor[item.label]}
                </IconWrapper>
                {item.label}
              </span>
              <ChevronDown className={cn(
                'w-3.5 h-3.5 text-text-tertiary transition-transform duration-200',
                !isExpanded && '-rotate-90'
              )} />
            </button>
            <div className={cn(
              'overflow-hidden transition-all duration-200',
              isExpanded ? 'max-h-96 opacity-100' : 'max-h-0 opacity-0'
            )}>
              <div className="py-0.5">
                {item.children!.map((child) => (
                  <Link
                    key={child.href}
                    href={child.href}
                    onClick={() => setMobileOpen(false)}
                    className={cn(
                      'flex items-center gap-2 pl-12 pr-3 py-2 mx-2 rounded-md text-[13px] transition-all duration-100',
                      isActive(child.href)
                        ? 'text-primary-500 bg-primary-50 font-medium'
                        : 'text-text-secondary hover:text-text-primary hover:bg-surface-tertiary'
                    )}
                  >
                    <span className={cn(
                      'w-1.5 h-1.5 rounded-full transition-colors',
                      isActive(child.href) ? 'bg-primary-500' : 'bg-text-tertiary/40'
                    )} />
                    {child.label}
                  </Link>
                ))}
              </div>
            </div>
          </div>
        )
      })}
    </nav>
  )

  return (
    <>
      {/* Mobile hamburger */}
      <button
        onClick={() => setMobileOpen(true)}
        className="lg:hidden fixed top-2.5 left-3 z-50 p-2 rounded-lg bg-white text-text-secondary border border-border shadow-card"
      >
        <Menu className="w-5 h-5" />
      </button>

      {mobileOpen && (
        <div
          className="lg:hidden fixed inset-0 z-40 bg-black/40 backdrop-blur-sm"
          onClick={() => setMobileOpen(false)}
        />
      )}

      <aside
        className={cn(
          'fixed top-0 left-0 z-40 h-screen bg-white border-r border-border flex flex-col',
          'w-[var(--sidebar-width)] transition-transform duration-200',
          mobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        )}
      >
        {/* Logo */}
        <div className="flex items-center justify-between h-[var(--header-height)] px-4">
          <Link href="/" className="flex items-center gap-2.5">
            <img src="/logo.png" alt="CaasWorks" className="w-8 h-8 rounded-lg" />
            <div>
              <span className="text-text-primary font-bold text-sm tracking-tight">CaasWorks</span>
              <span className="text-text-tertiary text-[10px] font-medium ml-1.5">CRM</span>
            </div>
          </Link>
          <button
            onClick={() => setMobileOpen(false)}
            className="lg:hidden text-text-tertiary hover:text-text-primary"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="mx-4 border-t border-border-light" />

        {sidebarContent}

        {/* User info + logout */}
        {user && (
          <div className="mx-3 mb-3 p-3 rounded-lg bg-surface-tertiary">
            <div className="flex items-center justify-between">
              <Link href="/profile" className="flex items-center gap-2.5 min-w-0 group" onClick={() => setMobileOpen(false)}>
                {user.avatar_url ? (
                  <img
                    src={user.avatar_url}
                    alt={user.name}
                    className="w-8 h-8 rounded-full object-cover flex-shrink-0 border border-white/60 group-hover:border-primary-300 transition-colors"
                  />
                ) : (
                  <div className="w-8 h-8 rounded-full bg-primary-500 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                    {user.name?.charAt(0) || 'U'}
                  </div>
                )}
                <div className="min-w-0">
                  <p className="text-sm text-text-primary font-medium truncate group-hover:text-primary-600">
                    {user.name}
                    {user.position && <span className="text-[10px] text-text-tertiary font-normal ml-1">· {user.position}</span>}
                  </p>
                  <p className="text-[11px] text-text-tertiary truncate">{user.email}</p>
                </div>
              </Link>
              <div className="flex items-center gap-1 flex-shrink-0">
                <Link
                  href="/profile"
                  className="p-1.5 rounded-md text-text-tertiary hover:text-primary-600 hover:bg-surface-secondary transition-colors"
                  title="내 프로필"
                  onClick={() => setMobileOpen(false)}
                >
                  <UserCircle className="w-4 h-4" />
                </Link>
                <button
                  onClick={onSignOut}
                  className="p-1.5 rounded-md text-text-tertiary hover:text-status-red hover:bg-surface-secondary transition-colors"
                  title="로그아웃"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        )}
      </aside>
    </>
  )
}
