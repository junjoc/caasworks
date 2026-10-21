'use client'

import { Fragment, useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import type { User } from '@/types/database'
import { createClient } from '@/lib/supabase/client'
import { NAV_MENU, roleCanAccess, ADMIN_ONLY_PATHS } from '@/lib/nav-menu'

// Role-based menu filtering is active. The sidebar reads each
// user's role, looks up that role's allowed_paths in the `roles`
// table, and hides menu items the role can't access. Admins see
// everything. Seeded roles (admin/member/accountant) are bootstrapped
// with allowed_paths=["*"] so existing users retain full access by
// default — tighten per-role permissions in /settings/roles.
const DISABLE_ROLE_FILTERING = false
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
  MessageSquarePlus,
} from 'lucide-react'

// Icon color mapping for each nav section

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
  '피드백': <MessageSquarePlus className="w-[16px] h-[16px]" />,
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
    // TEMPORARY: grant ALL logged-in users full access, even if the
    // public.users row didn't load (e.g. auth id ↔ public.users id mismatch).
    // The AuthProvider's session check upstream already prevents unauth access.
    if (DISABLE_ROLE_FILTERING) return true
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

  // 레이아웃 정의 v1: 아이콘은 16px 선, 글자색 (색 타일 제거)
  const IconWrapper = ({ children, isItemActive }: { label: string; children: React.ReactNode; isItemActive: boolean }) => (
    <span className={cn('w-4 h-4 flex items-center justify-center flex-shrink-0', isItemActive ? 'text-ds-fg' : 'text-ds-fg2')}>{children}</span>
  )

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
              prefetch={false}
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
                hasActiveChild && 'font-semibold'
              )}
              style={{ width: 'calc(100% - 16px)' }}
            >
              <span className="flex items-center gap-2">
                <IconWrapper label={item.label} isItemActive={!!hasActiveChild}>
                  {iconFor[item.label]}
                </IconWrapper>
                {item.label}
              </span>
              <ChevronDown className={cn(
                'w-3.5 h-3.5 text-ds-fg3 transition-transform duration-200',
                !isExpanded && '-rotate-90'
              )} />
            </button>
            <div className={cn(
              'overflow-hidden transition-all duration-200',
              isExpanded ? 'max-h-[40rem] opacity-100' : 'max-h-0 opacity-0'
            )}>
              <div className="py-0.5">
                {item.children!.map((child, idx) => (
                  <Fragment key={child.href}>
                  {child.group && child.group !== item.children![idx - 1]?.group && (
                    <div className="pl-[38px] pr-3 pt-2 pb-0.5 text-[12px] font-medium text-ds-fg3">{child.group}</div>
                  )}
                  <Link
                    href={child.href}
                    prefetch={false}
                    onClick={() => setMobileOpen(false)}
                    className={cn(
                      'flex items-center pl-[30px] pr-3 h-[30px] mx-2 rounded-md text-[12.5px] transition-colors duration-75',
                      isActive(child.href)
                        ? 'text-ds-fg bg-ds-subtle font-semibold shadow-[inset_2px_0_0_var(--ds-accent)]'
                        : 'text-ds-fg2 hover:text-ds-fg hover:bg-ds-subtle'
                    )}
                  >
                    {child.label}
                  </Link>
                  </Fragment>
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
          'fixed top-0 left-0 z-40 h-screen bg-ds-bg border-r border-ds-line flex flex-col',
          'w-[var(--sidebar-width)] transition-transform duration-200',
          mobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        )}
      >
        {/* Logo */}
        <div className="flex items-center justify-between h-[var(--header-height)] px-4 border-b border-ds-line">
          <Link href="/" className="flex items-center gap-2.5">
            <img src="/logo.png" alt="CaasWorks" className="w-[22px] h-[22px] rounded-md" />
            <div>
              <span className="text-ds-fg font-semibold text-[13px] tracking-tight">CaasWorks</span>
              <span className="text-ds-fg3 text-[12px] ml-1.5">CRM</span>
            </div>
          </Link>
          <button
            onClick={() => setMobileOpen(false)}
            className="lg:hidden text-text-tertiary hover:text-text-primary"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {sidebarContent}

        {/* User info + logout */}
        {user && (
          <div className="h-[52px] px-3.5 border-t border-ds-line flex flex-col justify-center">
            <div className="flex items-center justify-between">
              <Link href="/profile" className="flex items-center gap-2.5 min-w-0 group" onClick={() => setMobileOpen(false)}>
                {user.avatar_url ? (
                  <img
                    src={user.avatar_url}
                    alt={user.name}
                    className="w-7 h-7 rounded-full object-cover flex-shrink-0"
                  />
                ) : (
                  <div className="w-7 h-7 rounded-full bg-ds-line flex items-center justify-center text-ds-fg2 text-[12px] font-semibold flex-shrink-0">
                    {user.name?.charAt(0) || 'U'}
                  </div>
                )}
                <div className="min-w-0">
                  <p className="text-[12.5px] text-ds-fg font-medium truncate group-hover:text-ds-accent">
                    {user.name}
                    {user.position && <span className="text-[10px] text-text-tertiary font-normal ml-1">· {user.position}</span>}
                  </p>
                  <p className="text-[12px] text-ds-fg3 truncate">{user.email}</p>
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
