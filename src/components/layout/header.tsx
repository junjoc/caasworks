'use client'

import { useEffect, useState } from 'react'
import { Bell, Search, Minus, Plus, Type } from 'lucide-react'
import { usePathname } from 'next/navigation'
import type { User } from '@/types/database'

interface HeaderProps {
  user: User | null
}

const pageTitles: Record<string, string> = {
  '/': '대시보드',
  // 마케팅
  '/marketing/ads': '광고 성과',
  '/marketing/analytics': '유입 분석',
  '/marketing/campaigns': '캠페인 관리',
  // 세일즈
  '/pipeline/board': '세일즈 · 보드뷰',
  '/pipeline/list': '세일즈 · 리스트',
  '/quotations': '견적서 관리',
  '/quotations/simulator': '견적 모의계산',
  '/quotations/price-list': '단가표',
  // 고객관리
  '/customers': '고객 목록',
  '/revenue': '매출 현황',
  '/contracts': '계약 관리',
  // 재무관리
  '/finance/invoices': '청구/계산서',
  '/finance/unpaid': '미납 현황',
  '/finance/payments': '납부 관리',
  '/finance/costs': '매입/비용',
  '/finance/analysis': '손익 분석',
  // 운영관리
  '/operations/sites': '현장 관리',
  '/operations/equipment': '장비 반출',
  '/operations/orders': '협력사 발주',
  '/operations/video': '영상 기록',
  // VoC
  '/voc': 'VoC/CS 티켓',
  '/voc/sla': 'SLA 현황',
  // 업무
  '/work/today': '오늘 할일',
  '/activities': '활동 로그',
  '/work/report': '업무보고',
  '/team/calendar': '팀 캘린더',
  '/meetings': '미팅 관리',
  // 설정
  '/settings/users': '팀원 관리',
  '/settings/products': '제품/서비스',
  '/settings/templates': '견적서 템플릿',
  '/settings/slack': 'Slack 연동',
  '/settings/notifications': '알림 설정',
}

const FONT_SIZES = [13, 14, 15, 16] // Available font sizes
const DEFAULT_FONT_SIZE = 14

export function Header({ user }: HeaderProps) {
  const pathname = usePathname()
  const [fontSize, setFontSize] = useState(DEFAULT_FONT_SIZE)

  // Load saved font size from localStorage
  useEffect(() => {
    const saved = localStorage.getItem('crm-font-size')
    if (saved) {
      const size = parseInt(saved)
      if (FONT_SIZES.includes(size)) {
        setFontSize(size)
        document.documentElement.style.fontSize = `${size}px`
      }
    }
  }, [])

  const changeFontSize = (delta: number) => {
    const currentIdx = FONT_SIZES.indexOf(fontSize)
    const newIdx = Math.max(0, Math.min(FONT_SIZES.length - 1, currentIdx + delta))
    const newSize = FONT_SIZES[newIdx]
    setFontSize(newSize)
    document.documentElement.style.fontSize = `${newSize}px`
    localStorage.setItem('crm-font-size', String(newSize))
  }

  const getTitle = () => {
    if (pageTitles[pathname]) return pageTitles[pathname]
    if (pathname.startsWith('/pipeline/')) return '파이프라인'
    if (pathname.startsWith('/customers/')) return '고객 상세'
    if (pathname.startsWith('/quotations/')) return '견적서'
    if (pathname.startsWith('/voc/')) return 'VoC/CS'
    if (pathname.startsWith('/settings/')) return '설정'
    return ''
  }

  return (
    <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-sm border-b border-border-light h-[var(--header-height)]">
      <div className="flex items-center justify-between h-full px-6">
        {/* Left: page title */}
        <h1 className="text-heading-md text-text-primary pl-10 lg:pl-0">{getTitle()}</h1>

        {/* Right: actions */}
        <div className="flex items-center gap-1">
          {/* Font size controls */}
          <div className="flex items-center gap-0 mr-1 border border-border rounded-md overflow-hidden">
            <button
              onClick={() => changeFontSize(-1)}
              disabled={fontSize <= FONT_SIZES[0]}
              className="px-1.5 py-1 text-text-tertiary hover:bg-surface-tertiary hover:text-text-primary disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              title="글자 작게"
            >
              <Minus className="w-3 h-3" />
            </button>
            <span className="px-1.5 py-1 text-micro text-text-secondary border-x border-border bg-surface-tertiary/50 min-w-[28px] text-center">
              {fontSize}
            </span>
            <button
              onClick={() => changeFontSize(1)}
              disabled={fontSize >= FONT_SIZES[FONT_SIZES.length - 1]}
              className="px-1.5 py-1 text-text-tertiary hover:bg-surface-tertiary hover:text-text-primary disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              title="글자 크게"
            >
              <Plus className="w-3 h-3" />
            </button>
          </div>

          <button className="icon-btn" title="검색">
            <Search className="w-4 h-4" />
          </button>
          <button className="icon-btn relative" title="알림">
            <Bell className="w-4 h-4" />
          </button>
        </div>
      </div>
    </header>
  )
}
