'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import type { User } from '@/types/database'
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

interface NavItem {
  label: string
  href?: string
  icon: React.ReactNode
  roles?: string[]
  badge?: number
  children?: { label: string; href: string; roles?: string[] }[]
}

const navItems: NavItem[] = [
  {
    label: '대시보드',
    href: '/',
    icon: <LayoutDashboard className="w-[16px] h-[16px]" />,
  },
  {
    label: '분석',
    href: '/analytics',
    icon: <BarChart3 className="w-[16px] h-[16px]" />,
  },
  {
    label: '마케팅',
    icon: <Megaphone className="w-[16px] h-[16px]" />,
    roles: ['admin'],
    children: [
      { label: '캠페인 관리', href: '/marketing/campaigns' },
      { label: '광고 성과', href: '/marketing/ads' },
      { label: '콘텐츠 성과', href: '/marketing/content' },
      { label: '방문자 여정', href: '/marketing/journey' },
      { label: '마케팅 분석', href: '/marketing/analytics' },
    ],
  },
  {
    label: '세일즈',
    icon: <Target className="w-[16px] h-[16px]" />,
    children: [
      { label: '보드뷰', href: '/pipeline/board' },
      { label: '리스트', href: '/pipeline/list' },
      { label: '견적서', href: '/quotations' },
      { label: '견적 모의계산', href: '/quotations/simulator' },
      { label: '단가표', href: '/quotations/price-list' },
    ],
  },
  {
    label: '고객관리',
    icon: <Users className="w-[16px] h-[16px]" />,
    children: [
      { label: '매출 현황', href: '/revenue' },
      { label: '과금 고객', href: '/customers/subscription' },
      { label: '전체 고객', href: '/customers' },
      { label: '계약 관리', href: '/contracts' },
    ],
  },
  {
    label: '재무관리',
    icon: <Wallet className="w-[16px] h-[16px]" />,
    roles: ['admin', 'accountant'],
    children: [
      { label: '청구/계산서', href: '/finance/invoices' },
      { label: '미납 현황', href: '/finance/unpaid' },
      { label: '납부 관리', href: '/finance/payments' },
      { label: '매입/비용', href: '/finance/costs' },
      { label: '손익 분석', href: '/finance/analysis' },
    ],
  },
  {
    label: '운영관리',
    icon: <Package className="w-[16px] h-[16px]" />,
    children: [
      { label: '현장 관리', href: '/operations/sites' },
      { label: '카메라 반출', href: '/operations/camera-shipments' },
      { label: '장비 관리', href: '/operations/equipment' },
      { label: '협력사 발주', href: '/operations/orders' },
    ],
  },
  {
    label: 'VoC/CS',
    icon: <MessageSquare className="w-[16px] h-[16px]" />,
    children: [
      { label: '티켓 목록', href: '/voc' },
      { label: 'SLA 현황', href: '/voc/sla', roles: ['admin'] },
    ],
  },
  {
    label: '업무',
    icon: <ClipboardList className="w-[16px] h-[16px]" />,
    children: [
      { label: '오늘 할일', href: '/work/today' },
      { label: '활동 로그', href: '/activities' },
      { label: '업무보고', href: '/work/report' },
      { label: '캘린더', href: '/team/calendar' },
      { label: '미팅 관리', href: '/meetings' },
    ],
  },
  {
    label: '설정',
    icon: <Settings className="w-[16px] h-[16px]" />,
    roles: ['admin'],
    children: [
      { label: '팀원 관리', href: '/settings/users' },
      { label: '제품/서비스', href: '/settings/products' },
      { label: '견적서 템플릿', href: '/settings/templates' },
      { label: 'Slack 연동', href: '/settings/slack' },
      { label: '알림 설정', href: '/settings/notifications' },
    ],
  },
]

interface SidebarProps {
  user: User | null
  onSignOut: () => void
}

export function Sidebar({ user, onSignOut }: SidebarProps) {
  const pathname = usePathname()
  const [expandedItems, setExpandedItems] = useState<string[]>([])
  const [mobileOpen, setMobileOpen] = useState(false)

  // Auto-expand active parent on mount
  useEffect(() => {
    const activeParent = navItems.find(
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
    // Exact match for leaf menu items (prevent /customers matching /customers/subscription)
    return pathname === href
  }

  const filteredItems = navItems.filter((item) => {
    if (!item.roles) return true
    return user && item.roles.includes(user.role)
  })

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
        const hasChildren = item.children && item.children.length > 0
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
                {item.icon}
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
                  {item.icon}
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
                {item.children!
                  .filter((child) => {
                    if (!child.roles) return true
                    return user && child.roles.includes(user.role)
                  })
                  .map((child) => (
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
      {/* Mobile hamburger - positioned inside header area */}
      <button
        onClick={() => setMobileOpen(true)}
        className="lg:hidden fixed top-2.5 left-3 z-50 p-2 rounded-lg bg-white text-text-secondary border border-border shadow-card"
      >
        <Menu className="w-5 h-5" />
      </button>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="lg:hidden fixed inset-0 z-40 bg-black/40 backdrop-blur-sm"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar */}
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

        {/* Divider */}
        <div className="mx-4 border-t border-border-light" />

        {sidebarContent}

        {/* User info + logout */}
        {user && (
          <div className="mx-3 mb-3 p-3 rounded-lg bg-surface-tertiary">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-8 h-8 rounded-full bg-primary-500 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                  {user.name?.charAt(0) || 'U'}
                </div>
                <div className="min-w-0">
                  <p className="text-sm text-text-primary font-medium truncate">{user.name}</p>
                  <p className="text-[11px] text-text-tertiary truncate">{user.email}</p>
                </div>
              </div>
              <button
                onClick={onSignOut}
                className="p-1.5 rounded-md text-text-tertiary hover:text-status-red hover:bg-surface-secondary transition-colors flex-shrink-0"
                title="로그아웃"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </aside>
    </>
  )
}
