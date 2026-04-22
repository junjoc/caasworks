import type { RolePreset, WidgetSize } from './types'

// 5개 역할 기본 대시보드 프리셋
// 위젯 ID는 widget-registry.ts와 일치해야 함

export const DASHBOARD_PRESETS: RolePreset[] = [
  {
    roleKey: 'exec',
    label: '경영진',
    description: '전사 핵심 지표 — 매출, 영업이익률, 미납, 전환율',
    widgetIds: [
      { id: 'monthly_revenue', size: 'M' },
      { id: 'unpaid_amount', size: 'M' },
      { id: 'conversion_rate', size: 'S' },
      { id: 'pipeline_funnel', size: 'L' },
      { id: 'top_customers', size: 'M' },
      { id: 'monthly_trend', size: 'L' },
    ],
  },
  {
    roleKey: 'marketing',
    label: '마케팅',
    description: '광고/유입/캠페인 중심 지표',
    widgetIds: [
      { id: 'ad_spend', size: 'M' },
      { id: 'new_leads', size: 'S' },
      { id: 'channel_top5', size: 'M' },
      { id: 'cpl', size: 'S' },
      { id: 'pipeline_funnel', size: 'L' },
      { id: 'monthly_trend', size: 'L' },
    ],
  },
  {
    roleKey: 'sales',
    label: '세일즈',
    description: '내 담당 리드, 액션, 도입직전 건',
    widgetIds: [
      { id: 'my_leads', size: 'M' },
      { id: 'new_leads', size: 'S' },
      { id: 'overdue_actions', size: 'L' },
      { id: 'pre_conversion', size: 'M' },
      { id: 'today_tasks', size: 'M' },
      { id: 'pipeline_funnel', size: 'L' },
    ],
  },
  {
    roleKey: 'support',
    label: '경영지원',
    description: '청구/미납/비용/계약 관리',
    widgetIds: [
      { id: 'unpaid_amount', size: 'M' },
      { id: 'monthly_billing', size: 'M' },
      { id: 'monthly_cost', size: 'S' },
      { id: 'expiring_contracts', size: 'L' },
      { id: 'monthly_revenue', size: 'M' },
    ],
  },
  {
    roleKey: 'hardware',
    label: '하드웨어',
    description: '카메라 반출, 장비, 협력사 발주',
    widgetIds: [
      { id: 'active_sites', size: 'S' },
      { id: 'camera_shipments', size: 'M' },
      { id: 'equipment_status', size: 'M' },
      { id: 'partner_orders', size: 'L' },
      { id: 'today_tasks', size: 'M' },
    ],
  },
]

export function findPreset(roleKey: string): RolePreset | undefined {
  return DASHBOARD_PRESETS.find(p => p.roleKey === roleKey)
}

// Given a role name from public.users.role, return the matching preset.
// Role keys in DB may be 'admin', 'member', 'accountant', or custom ones
// like 'sales_manager'. We try direct match first; fall back to keyword
// match; else return 'exec' preset as a safe default for admins.
export function presetForRole(roleName: string | null | undefined): RolePreset {
  if (!roleName) return DASHBOARD_PRESETS[0]
  // Direct roleKey match
  const direct = findPreset(roleName)
  if (direct) return direct
  // Keyword-based match
  const r = roleName.toLowerCase()
  if (r === 'admin') return DASHBOARD_PRESETS[0]           // 경영진
  if (r.includes('market')) return DASHBOARD_PRESETS[1]
  if (r.includes('sales') || r === 'member') return DASHBOARD_PRESETS[2]
  if (r.includes('account') || r.includes('support') || r.includes('finance')) return DASHBOARD_PRESETS[3]
  if (r.includes('hardware') || r.includes('hw') || r.includes('operat')) return DASHBOARD_PRESETS[4]
  return DASHBOARD_PRESETS[0]
}
