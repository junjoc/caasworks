// Shared navigation menu structure
// Used by: sidebar (rendering), roles settings page (permission picker)
//
// Each menu item has a `href` — this is the permission key.
// In the `roles` table, `allowed_paths` is a list of these hrefs.
// Special value "*" means all paths allowed (admin).

export interface NavChild {
  label: string
  href: string
}

export interface NavSection {
  label: string
  href?: string           // for top-level leaf items (대시보드, 분석)
  children?: NavChild[]   // for grouped sections
}

export const NAV_MENU: NavSection[] = [
  { label: '대시보드', href: '/' },
  { label: '분석', href: '/analytics' },
  {
    label: '마케팅',
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
    children: [
      { label: '보드뷰', href: '/pipeline/board' },
      { label: '리스트', href: '/pipeline/list' },
      { label: '파이프라인 분석', href: '/pipeline/analytics' },
      { label: '견적서', href: '/quotations' },
      { label: '견적 모의계산', href: '/quotations/simulator' },
      { label: '단가표', href: '/quotations/price-list' },
    ],
  },
  {
    label: '고객관리',
    children: [
      { label: '매출 현황', href: '/revenue' },
      { label: '과금 고객', href: '/customers/subscription' },
      { label: '전체 고객', href: '/customers' },
      { label: '계약 관리', href: '/contracts' },
    ],
  },
  {
    label: '재무관리',
    children: [
      { label: '청구/계산서', href: '/finance/invoices' },
      { label: '미납 현황', href: '/finance/unpaid' },
      { label: '납부 관리', href: '/finance/payments' },
      { label: '매입/비용', href: '/finance/purchases' },
      { label: '손익 분석', href: '/finance/analysis' },
    ],
  },
  {
    label: '운영관리',
    children: [
      { label: '현장 관리', href: '/operations/sites' },
      { label: '카메라 반출', href: '/operations/camera-shipments' },
      { label: '자산 관리', href: '/operations/assets' },
      { label: '재고 관리', href: '/operations/inventory' },
      { label: '장비 관리', href: '/operations/equipment' },
      { label: '협력사 발주', href: '/operations/orders' },
    ],
  },
  {
    label: 'VoC/CS',
    children: [
      { label: '티켓 목록', href: '/voc' },
      { label: 'SLA 현황', href: '/voc/sla' },
    ],
  },
  {
    label: '업무',
    children: [
      { label: '오늘 할일', href: '/work/today' },
      { label: '활동 로그', href: '/activities' },
      { label: '업무보고', href: '/work/report' },
      { label: '캘린더', href: '/team/calendar' },
      { label: '미팅 관리', href: '/meetings' },
    ],
  },
  {
    label: '피드백',
    children: [
      { label: '요청사항', href: '/feedback' },
      { label: '개발일지', href: '/feedback/changelog' },
    ],
  },
  {
    label: '설정',
    children: [
      { label: '사용자 관리', href: '/settings/users' },
      { label: '역할 관리', href: '/settings/roles' },
      { label: '제품/서비스', href: '/settings/products' },
      { label: '견적서 템플릿', href: '/settings/templates' },
      { label: 'Slack 연동', href: '/settings/slack' },
      { label: '알림 설정', href: '/settings/notifications' },
    ],
  },
]

// Flatten menu to get all permission keys (for admin role's "*" shortcut check and validation)
export function allMenuPaths(): string[] {
  const paths: string[] = []
  NAV_MENU.forEach(section => {
    if (section.href) paths.push(section.href)
    section.children?.forEach(c => paths.push(c.href))
  })
  return paths
}

// Check if a role's allowed_paths grants access to a specific href
export function roleCanAccess(allowedPaths: string[] | null | undefined, href: string): boolean {
  if (!allowedPaths) return false
  if (allowedPaths.includes('*')) return true
  return allowedPaths.includes(href)
}

// Position options (직급)
export const POSITION_OPTIONS = [
  '사원', '주임', '대리', '과장', '차장',
  '부장', '이사', '상무', '전무', '대표',
] as const

export type Position = typeof POSITION_OPTIONS[number]

// Settings pages that are admin-only regardless of role config
// (allows listing 팀원 관리 / 역할 관리 even if not explicitly granted)
export const ADMIN_ONLY_PATHS = ['/settings/users', '/settings/roles']
