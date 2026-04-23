import type { ComponentType } from 'react'
import type { WidgetMeta, WidgetSize } from './types'
import {
  NewLeadsWidget,
  MyLeadsWidget,
  OverdueActionsWidget,
  PreConversionWidget,
  MonthlyRevenueWidget,
  UnpaidAmountWidget,
  PipelineFunnelWidget,
  TodayTasksWidget,
  ConversionRateWidget,
  PlaceholderWidget,
} from '@/components/dashboard/widgets'

export interface WidgetDefinition extends WidgetMeta {
  component: ComponentType<{ size?: WidgetSize }>
}

// Widgets that are fully implemented get a real component;
// placeholders let the preset system reference them while we
// iterate — they show a "준비중" tile until implemented.
export const WIDGET_REGISTRY: WidgetDefinition[] = [
  // ── 세일즈 ────────────────────────────────────────────────
  {
    id: 'new_leads',
    title: '오늘 신규 리드',
    description: '오늘 유입된 리드 건수 (어제 대비)',
    category: '세일즈',
    defaultSize: 'S',
    availableSizes: ['S'],
    primaryHref: '/pipeline/list',
    component: NewLeadsWidget,
  },
  {
    id: 'my_leads',
    title: '내 담당 리드',
    description: '단계별 분포 (이탈/도입완료 제외)',
    category: '세일즈',
    defaultSize: 'M',
    availableSizes: ['M', 'L'],
    primaryHref: '/pipeline/board',
    component: MyLeadsWidget,
  },
  {
    id: 'overdue_actions',
    title: '기한 초과 액션',
    description: '액션 예정일이 지난 리드 목록',
    category: '세일즈',
    defaultSize: 'L',
    availableSizes: ['M', 'L'],
    primaryHref: '/pipeline/board',
    component: OverdueActionsWidget,
  },
  {
    id: 'pre_conversion',
    title: '도입직전 리드',
    description: '도입직전 단계 리드 목록',
    category: '세일즈',
    defaultSize: 'M',
    availableSizes: ['M', 'L'],
    primaryHref: '/pipeline/list?stage=도입직전',
    component: PreConversionWidget,
  },
  {
    id: 'pipeline_funnel',
    title: '파이프라인 단계 분포',
    description: '전체 리드의 단계별 분포 (가로 막대)',
    category: '세일즈',
    defaultSize: 'L',
    availableSizes: ['M', 'L'],
    primaryHref: '/pipeline/analytics',
    component: PipelineFunnelWidget,
  },
  {
    id: 'conversion_rate',
    title: '전환율 KPI',
    description: '종결 리드 중 도입완료 비율',
    category: '세일즈',
    defaultSize: 'S',
    availableSizes: ['S'],
    primaryHref: '/pipeline/analytics',
    component: ConversionRateWidget,
  },

  // ── 고객/매출 ────────────────────────────────────────────
  {
    id: 'monthly_revenue',
    title: '이번달 매출',
    description: '이번달 매출 합계와 지난달 대비',
    category: '고객/매출',
    defaultSize: 'M',
    availableSizes: ['S', 'M'],
    primaryHref: '/revenue',
    component: MonthlyRevenueWidget,
  },

  // ── 재무 ────────────────────────────────────────────────
  {
    id: 'unpaid_amount',
    title: '미납 금액',
    description: '미수금 총액과 건수',
    category: '재무',
    defaultSize: 'M',
    availableSizes: ['S', 'M'],
    primaryHref: '/finance/unpaid',
    component: UnpaidAmountWidget,
  },

  // ── 업무 ────────────────────────────────────────────────
  {
    id: 'today_tasks',
    title: '오늘 할일',
    description: '오늘 예정된 내 액션 목록',
    category: '업무',
    defaultSize: 'M',
    availableSizes: ['M', 'L'],
    primaryHref: '/work/today',
    component: TodayTasksWidget,
  },

  // ── Placeholders (미구현 — 준비중 표시) ──────────────────────
  {
    id: 'monthly_trend',
    title: '월별 매출 트렌드',
    description: '최근 12개월 매출 미니 차트',
    category: '고객/매출',
    defaultSize: 'L',
    availableSizes: ['M', 'L'],
    primaryHref: '/revenue',
    component: PlaceholderWidget('월별 매출 트렌드'),
  },
  {
    id: 'top_customers',
    title: '매출 상위 고객',
    description: '이번달 매출 Top 5 고객',
    category: '고객/매출',
    defaultSize: 'M',
    availableSizes: ['M', 'L'],
    primaryHref: '/customers/subscription',
    component: PlaceholderWidget('매출 상위 고객'),
  },
  {
    id: 'ad_spend',
    title: '이번달 광고비',
    description: '네이버/구글/메타 합계',
    category: '마케팅',
    defaultSize: 'M',
    availableSizes: ['S', 'M'],
    primaryHref: '/marketing/ads',
    component: PlaceholderWidget('이번달 광고비'),
  },
  {
    id: 'channel_top5',
    title: '유입 채널 Top 5',
    description: '이번달 리드 유입 채널별 건수',
    category: '마케팅',
    defaultSize: 'M',
    availableSizes: ['M', 'L'],
    primaryHref: '/marketing/analytics',
    component: PlaceholderWidget('유입 채널 Top 5'),
  },
  {
    id: 'cpl',
    title: 'CPL (리드당 비용)',
    description: '이번달 광고비 / 신규 리드 수',
    category: '마케팅',
    defaultSize: 'S',
    availableSizes: ['S'],
    primaryHref: '/marketing/analytics',
    component: PlaceholderWidget('CPL'),
  },
  {
    id: 'monthly_billing',
    title: '이번달 청구 예정',
    description: '이번달 발행 예정 청구 합계',
    category: '재무',
    defaultSize: 'M',
    availableSizes: ['S', 'M'],
    primaryHref: '/finance/invoices',
    component: PlaceholderWidget('이번달 청구 예정'),
  },
  {
    id: 'monthly_cost',
    title: '이번달 비용',
    description: '매입/비용 합계',
    category: '재무',
    defaultSize: 'S',
    availableSizes: ['S'],
    primaryHref: '/finance/costs',
    component: PlaceholderWidget('이번달 비용'),
  },
  {
    id: 'expiring_contracts',
    title: '계약 만료 임박',
    description: '30일 이내 만료 예정 계약',
    category: '재무',
    defaultSize: 'L',
    availableSizes: ['M', 'L'],
    primaryHref: '/contracts',
    component: PlaceholderWidget('계약 만료 임박'),
  },
  {
    id: 'active_sites',
    title: '활성 현장',
    description: '진행 중 현장 수',
    category: '업무',
    defaultSize: 'S',
    availableSizes: ['S'],
    primaryHref: '/operations/sites',
    component: PlaceholderWidget('활성 현장'),
  },
  {
    id: 'camera_shipments',
    title: '카메라 반출 현황',
    description: '반출 중인 카메라 수',
    category: '업무',
    defaultSize: 'M',
    availableSizes: ['M', 'L'],
    primaryHref: '/operations/camera-shipments',
    component: PlaceholderWidget('카메라 반출 현황'),
  },
  {
    id: 'equipment_status',
    title: '장비 상태',
    description: '장비별 사용 현황',
    category: '업무',
    defaultSize: 'M',
    availableSizes: ['M', 'L'],
    primaryHref: '/operations/equipment',
    component: PlaceholderWidget('장비 상태'),
  },
  {
    id: 'partner_orders',
    title: '협력사 발주',
    description: '최근 발주 건',
    category: '업무',
    defaultSize: 'L',
    availableSizes: ['M', 'L'],
    primaryHref: '/operations/orders',
    component: PlaceholderWidget('협력사 발주'),
  },
]

export function findWidget(id: string): WidgetDefinition | undefined {
  return WIDGET_REGISTRY.find(w => w.id === id)
}

export function widgetsByCategory() {
  const grouped: Record<string, WidgetDefinition[]> = {}
  WIDGET_REGISTRY.forEach(w => {
    if (!grouped[w.category]) grouped[w.category] = []
    grouped[w.category].push(w)
  })
  return grouped
}
