'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import type { User } from '@/types/database'
import {
  LayoutDashboard,
  GitBranch,
  Users,
  DollarSign,
  FileText,
  MessageSquare,
  TrendingUp,
  Award,
  Calendar,
  Settings,
  ChevronDown,
  ChevronRight,
  Activity,
  Menu,
  X,
} from 'lucide-react'

interface NavItem {
  label: string
  href?: string
  icon: React.ReactNode
  roles?: string[]
  children?: { label: string; href: string; roles?: string[] }[]
}

const navItems: NavItem[] = [
  {
    label: '대시보드',
    href: '/',
    icon: <LayoutDashboard className="w-5 h-5" />,
  },
  {
    label: '파이프라인',
    icon: <GitBranch className="w-5 h-5" />,
    roles: ['admin', 'member'],
    children: [
      { label: '보드뷰', href: '/pipeline/board' },
      { label: '리스트', href: '/pipeline/list' },
    ],
  },
  {
    label: '고객관리',
    icon: <Users className="w-5 h-5" />,
    children: [
      { label: '고객 목록', href: '/customers' },
      { label: '매출 현황', href: '/revenue' },
      { label: '미팅 관리', href: '/meetings' },
    ],
  },
  {
    label: 'VoC/CS',
    icon: <MessageSquare className="w-5 h-5" />,
    roles: ['admin', 'member'],
    children: [
      { label: '티켓 목록', href: '/voc' },
      { label: 'VoC 분석', href: '/voc/analytics', roles: ['admin'] },
      { label: 'SLA 현황', href: '/voc/sla', roles: ['admin'] },
    ],
  },
  {
    label: '청구/납부',
    icon: <FileText className="w-5 h-5" />,
    roles: ['admin', 'accountant'],
    children: [
      { label: '청구서', href: '/invoices' },
      { label: '납부 관리', href: '/payments' },
      { label: '세금계산서', href: '/tax-invoices' },
      { label: '재무 현황', href: '/finance' },
    ],
  },
  {
    label: '인센티브',
    icon: <Award className="w-5 h-5" />,
    roles: ['admin', 'member'],
    children: [
      { label: '내 실적', href: '/incentive' },
      { label: '전체 현황', href: '/incentive/all', roles: ['admin'] },
    ],
  },
  {
    label: '분석',
    icon: <TrendingUp className="w-5 h-5" />,
    roles: ['admin'],
    children: [
      { label: '코호트', href: '/analytics/cohort' },
      { label: '전환 분석', href: '/analytics/conversion' },
      { label: '마케팅 ROI', href: '/analytics/marketing' },
      { label: '서비스 현황', href: '/analytics/services' },
    ],
  },
  {
    label: '활동 로그',
    href: '/activities',
    icon: <Activity className="w-5 h-5" />,
    roles: ['admin', 'member'],
  },
  {
    label: '팀 일정',
    icon: <Calendar className="w-5 h-5" />,
    children: [
      { label: '캘린더', href: '/team/calendar' },
      { label: '휴가 관리', href: '/team/leave' },
    ],
  },
  {
    label: '설정',
    icon: <Settings className="w-5 h-5" />,
    roles: ['admin'],
    children: [
      { label: '사용자', href: '/settings/users' },
      { label: '인센티브', href: '/settings/incentive' },
      { label: '청구서', href: '/settings/invoice' },
      { label: 'SLA 정책', href: '/settings/sla' },
      { label: '마케팅비', href: '/settings/marketing' },
      { label: 'Slack 연동', href: '/settings/slack' },
      { label: '제품/서비스', href: '/settings/products' },
      { label: '알림 설정', href: '/settings/notifications' },
      { label: '감사 로그', href: '/settings/audit-log' },
    ],
  },
]

interface SidebarProps {
  user: User | null
}

export function Sidebar({ user }: SidebarProps) {
  const pathname = usePathname()
  const [expandedItems, setExpandedItems] = useState<string[]>([])
  const [mobileOpen, setMobileOpen] = useState(false)

  const toggleExpanded = (label: string) => {
    setExpandedItems((prev) =>
      prev.includes(label) ? prev.filter((l) => l !== label) : [...prev, label]
    )
  }

  const isActive = (href: string) => {
    if (href === '/') return pathname === '/'
    return pathname.startsWith(href)
  }

  const filteredItems = navItems.filter((item) => {
    if (!item.roles) return true
    return user && item.roles.includes(user.role)
  })

  const sidebarContent = (
    <nav className="flex-1 py-4 space-y-1 overflow-y-auto">
      {filteredItems.map((item) => {
        const hasChildren = item.children && item.children.length > 0
        const isExpanded = expandedItems.includes(item.label) ||
          (hasChildren && item.children!.some((c) => isActive(c.href)))

        if (!hasChildren && item.href) {
          return (
            <Link
              key={item.label}
              href={item.href}
              onClick={() => setMobileOpen(false)}
              className={cn(
                'flex items-center gap-3 px-4 py-2.5 mx-2 rounded-lg text-sm transition-colors',
                isActive(item.href)
                  ? 'bg-sidebar-active text-sidebar-text-active'
                  : 'text-sidebar-text hover:bg-sidebar-hover hover:text-sidebar-text-active'
              )}
            >
              {item.icon}
              {item.label}
            </Link>
          )
        }

        return (
          <div key={item.label}>
            <button
              onClick={() => toggleExpanded(item.label)}
              className={cn(
                'flex items-center justify-between w-full px-4 py-2.5 mx-2 rounded-lg text-sm transition-colors',
                'text-sidebar-text hover:bg-sidebar-hover hover:text-sidebar-text-active',
                'pr-6'
              )}
              style={{ width: 'calc(100% - 16px)' }}
            >
              <span className="flex items-center gap-3">
                {item.icon}
                {item.label}
              </span>
              {isExpanded ? (
                <ChevronDown className="w-4 h-4" />
              ) : (
                <ChevronRight className="w-4 h-4" />
              )}
            </button>
            {isExpanded && (
              <div className="ml-4 space-y-0.5">
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
                        'flex items-center gap-3 pl-10 pr-4 py-2 mx-2 rounded-lg text-sm transition-colors',
                        isActive(child.href)
                          ? 'bg-sidebar-active text-sidebar-text-active'
                          : 'text-sidebar-text hover:bg-sidebar-hover hover:text-sidebar-text-active'
                      )}
                    >
                      {child.label}
                    </Link>
                  ))}
              </div>
            )}
          </div>
        )
      })}
    </nav>
  )

  return (
    <>
      {/* 모바일 햄버거 */}
      <button
        onClick={() => setMobileOpen(true)}
        className="lg:hidden fixed top-3 left-3 z-50 p-2 rounded-lg bg-sidebar-bg text-white"
      >
        <Menu className="w-5 h-5" />
      </button>

      {/* 모바일 오버레이 */}
      {mobileOpen && (
        <div
          className="lg:hidden fixed inset-0 z-40 bg-black/50"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* 사이드바 */}
      <aside
        className={cn(
          'fixed top-0 left-0 z-40 h-screen bg-sidebar-bg flex flex-col',
          'w-[var(--sidebar-width)] transition-transform duration-200',
          mobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        )}
      >
        {/* 로고 */}
        <div className="flex items-center justify-between h-16 px-4 border-b border-gray-700">
          <Link href="/" className="text-white font-bold text-lg">
            CaaS.Works
          </Link>
          <button
            onClick={() => setMobileOpen(false)}
            className="lg:hidden text-gray-400 hover:text-white"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {sidebarContent}

        {/* 사용자 정보 */}
        {user && (
          <div className="px-4 py-3 border-t border-gray-700">
            <p className="text-sm text-white font-medium truncate">{user.name}</p>
            <p className="text-xs text-sidebar-text truncate">{user.email}</p>
          </div>
        )}
      </aside>
    </>
  )
}
