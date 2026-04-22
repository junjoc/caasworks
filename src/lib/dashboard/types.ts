// Dashboard widget types — shared between registry, presets, and UI.

export type WidgetSize = 'S' | 'M' | 'L'
// S = 1x1 (단일 KPI 숫자 + 라벨)
// M = 2x1 (KPI + 미니차트 또는 Top 5 리스트)
// L = 2x2 (전체 차트 또는 긴 리스트)

export type WidgetCategory = '세일즈' | '마케팅' | '고객/매출' | '재무' | 'VoC' | '업무'

// Widget metadata for the registry.
// Each widget component receives only { size } as prop;
// its own internal fetch decides what data to display.
export interface WidgetMeta {
  id: string
  title: string
  description: string       // shown in the "위젯 추가" modal
  category: WidgetCategory
  defaultSize: WidgetSize
  availableSizes: WidgetSize[]
  primaryHref: string       // click-through destination
  // Optional: role/permission gate. If provided, only shown to users
  // whose role label or key appears here.
  roles?: string[]
}

// Per-widget instance in a user's dashboard config
export interface WidgetInstance {
  id: string
  size: WidgetSize
  order: number
}

export interface DashboardConfig {
  widgets: WidgetInstance[]
  presetName?: string       // which preset was last applied (for "reset" button)
}

export interface RolePreset {
  roleKey: string           // 'exec' / 'marketing' / 'sales' / 'support' / 'hardware'
  label: string
  description: string
  widgetIds: Array<{ id: string; size: WidgetSize }>
}
