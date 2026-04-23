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

// Per-widget instance in a user's dashboard config.
// v1 had {size, order}; v2 uses explicit grid coordinates x/y/w/h.
// Both shapes are supported — old configs auto-convert on first load.
export interface WidgetInstance {
  id: string
  // v2 (grid-based, preferred)
  x?: number     // column index (0-11)
  y?: number     // row index
  w?: number     // width in columns
  h?: number     // height in rows (each row ~160px)
  // v1 (legacy — auto-converted if present)
  size?: WidgetSize
  order?: number
}

// Default grid column span for each legacy size
export const SIZE_TO_GRID: Record<WidgetSize, { w: number; h: number }> = {
  'S': { w: 3, h: 1 },
  'M': { w: 6, h: 1 },
  'L': { w: 6, h: 2 },
}

export const GRID_COLS = 12
export const GRID_ROW_HEIGHT = 80  // px — actual row height in the dashboard

export interface DashboardConfig {
  widgets: WidgetInstance[]
  presetName?: string       // which preset was last applied (for "reset" button)
}

export interface RolePreset {
  roleKey: string           // 'exec' / 'marketing' / 'sales' / 'support' / 'hardware'
  label: string
  description: string
  widgetIds: Array<{
    id: string
    // Grid coords (preferred)
    x?: number; y?: number; w?: number; h?: number
    // Legacy
    size?: WidgetSize
  }>
}
