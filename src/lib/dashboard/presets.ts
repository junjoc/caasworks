import type { RolePreset } from './types'

// 5개 역할 기본 대시보드 프리셋 (12-column grid, row height 80px)
// 각 위젯은 {id, x, y, w, h} — w는 column span (1~12), h는 row span (1~4)
//
// 레이아웃 가이드:
//   S = w:3 h:2   (작은 KPI)
//   M = w:6 h:2   (중간 - 리스트/차트)
//   L = w:6 h:4   (큰 차트/리스트)
//   XL= w:12 h:3  (와이드 차트)

export const DASHBOARD_PRESETS: RolePreset[] = [
  {
    roleKey: 'exec',
    label: '경영진',
    description: '전사 핵심 지표 — 매출, 영업이익률, 미납, 전환율',
    widgetIds: [
      { id: 'monthly_revenue',  x: 0, y: 0, w: 3, h: 2 },
      { id: 'unpaid_amount',    x: 3, y: 0, w: 3, h: 2 },
      { id: 'conversion_rate',  x: 6, y: 0, w: 3, h: 2 },
      { id: 'top_customers',    x: 9, y: 0, w: 3, h: 2 },
      { id: 'pipeline_funnel',  x: 0, y: 2, w: 6, h: 4 },
      { id: 'monthly_trend',    x: 6, y: 2, w: 6, h: 4 },
    ],
  },
  {
    roleKey: 'marketing',
    label: '마케팅',
    description: '광고/유입/캠페인 중심 지표',
    widgetIds: [
      { id: 'ad_spend',         x: 0, y: 0, w: 3, h: 2 },
      { id: 'new_leads',        x: 3, y: 0, w: 3, h: 2 },
      { id: 'cpl',              x: 6, y: 0, w: 3, h: 2 },
      { id: 'channel_top5',     x: 9, y: 0, w: 3, h: 2 },
      { id: 'pipeline_funnel',  x: 0, y: 2, w: 6, h: 4 },
      { id: 'monthly_trend',    x: 6, y: 2, w: 6, h: 4 },
    ],
  },
  {
    roleKey: 'sales',
    label: '세일즈',
    description: '내 담당 리드, 액션, 도입직전 건',
    widgetIds: [
      { id: 'new_leads',        x: 0, y: 0, w: 3, h: 2 },
      { id: 'my_leads',         x: 3, y: 0, w: 6, h: 2 },
      { id: 'conversion_rate',  x: 9, y: 0, w: 3, h: 2 },
      { id: 'overdue_actions',  x: 0, y: 2, w: 6, h: 3 },
      { id: 'pre_conversion',   x: 6, y: 2, w: 6, h: 3 },
      { id: 'today_tasks',      x: 0, y: 5, w: 6, h: 3 },
      { id: 'pipeline_funnel',  x: 6, y: 5, w: 6, h: 3 },
    ],
  },
  {
    roleKey: 'support',
    label: '경영지원',
    description: '청구/미납/비용/계약 관리',
    widgetIds: [
      { id: 'unpaid_amount',        x: 0, y: 0, w: 3, h: 2 },
      { id: 'monthly_billing',      x: 3, y: 0, w: 3, h: 2 },
      { id: 'monthly_cost',         x: 6, y: 0, w: 3, h: 2 },
      { id: 'monthly_revenue',      x: 9, y: 0, w: 3, h: 2 },
      { id: 'expiring_contracts',   x: 0, y: 2, w: 12, h: 4 },
    ],
  },
  {
    roleKey: 'hardware',
    label: '하드웨어',
    description: '카메라 반출, 장비, 협력사 발주',
    widgetIds: [
      { id: 'active_sites',       x: 0, y: 0, w: 3, h: 2 },
      { id: 'camera_shipments',   x: 3, y: 0, w: 6, h: 2 },
      { id: 'equipment_status',   x: 9, y: 0, w: 3, h: 2 },
      { id: 'today_tasks',        x: 0, y: 2, w: 6, h: 4 },
      { id: 'partner_orders',     x: 6, y: 2, w: 6, h: 4 },
    ],
  },
]

export function findPreset(roleKey: string): RolePreset | undefined {
  return DASHBOARD_PRESETS.find(p => p.roleKey === roleKey)
}

export function presetForRole(roleName: string | null | undefined): RolePreset {
  if (!roleName) return DASHBOARD_PRESETS[0]
  const direct = findPreset(roleName)
  if (direct) return direct
  const r = roleName.toLowerCase()
  if (r === 'admin') return DASHBOARD_PRESETS[0]
  if (r.includes('market')) return DASHBOARD_PRESETS[1]
  if (r.includes('sales') || r === 'member') return DASHBOARD_PRESETS[2]
  if (r.includes('account') || r.includes('support') || r.includes('finance')) return DASHBOARD_PRESETS[3]
  if (r.includes('hardware') || r.includes('hw') || r.includes('operat')) return DASHBOARD_PRESETS[4]
  return DASHBOARD_PRESETS[0]
}
