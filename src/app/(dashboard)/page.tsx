'use client'

// ─── 위젯 기반 대시보드 (자유 그리드 배치/리사이즈) ───
// react-grid-layout 기반. 사용자가 편집 모드에서 드래그로 위치/크기 조절.
// DB users.dashboard_config 또는 localStorage에 저장.
// v1 (size:S/M/L) 형식 자동 변환.

import { useEffect, useMemo, useState, useCallback } from 'react'
// eslint-disable-next-line @typescript-eslint/no-explicit-any
import GridLayoutRaw from 'react-grid-layout'
import 'react-grid-layout/css/styles.css'
import 'react-resizable/css/styles.css'
// The @types/react-grid-layout package is outdated relative to the runtime;
// use `any` to avoid prop-name mismatches (cols, rowHeight, etc.).
const GridLayout = GridLayoutRaw as any

import { useAuth } from '@/hooks/useAuth'
import { createClient } from '@/lib/supabase/client'
import { Loading } from '@/components/ui/loading'
import { Button } from '@/components/ui/button'
import { WidgetCard } from '@/components/dashboard/widget-card'
import { WidgetPicker } from '@/components/dashboard/widget-picker'
import { findWidget } from '@/lib/dashboard/widget-registry'
import { presetForRole, DASHBOARD_PRESETS } from '@/lib/dashboard/presets'
import type { DashboardConfig, WidgetInstance } from '@/lib/dashboard/types'
import { SIZE_TO_GRID, GRID_COLS, GRID_ROW_HEIGHT } from '@/lib/dashboard/types'
import { toast } from 'sonner'
import { Settings, Plus, RotateCcw } from 'lucide-react'

const STORAGE_KEY = 'caasworks:dashboard_config:v2'

function loadLocalConfig(userId: string): DashboardConfig | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem(`${STORAGE_KEY}:${userId}`)
    if (!raw) return null
    return JSON.parse(raw) as DashboardConfig
  } catch { return null }
}

function saveLocalConfig(userId: string, cfg: DashboardConfig) {
  if (typeof window === 'undefined') return
  try { localStorage.setItem(`${STORAGE_KEY}:${userId}`, JSON.stringify(cfg)) } catch {}
}

// Auto-layout helper: places widgets lacking x/y sequentially in a row.
// Converts legacy {size, order} to grid {x, y, w, h}.
function normalizeLayout(widgets: WidgetInstance[]): WidgetInstance[] {
  let nextX = 0, nextY = 0
  return widgets
    .slice()
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    .map(w => {
      // Already has grid coords
      if (typeof w.x === 'number' && typeof w.y === 'number' && w.w && w.h) return w
      // Convert from legacy size
      const def = w.size ? SIZE_TO_GRID[w.size] : SIZE_TO_GRID['M']
      const gridW = def.w
      const gridH = def.h * 2  // legacy h=1/2 → new h=2/4
      if (nextX + gridW > GRID_COLS) { nextX = 0; nextY += 2 }
      const placed: WidgetInstance = { id: w.id, x: nextX, y: nextY, w: gridW, h: gridH }
      nextX += gridW
      return placed
    })
}

// Find next empty spot for a new widget
function findNextSlot(widgets: WidgetInstance[], w: number, h: number): { x: number; y: number } {
  const maxY = widgets.reduce((m, wi) => Math.max(m, (wi.y ?? 0) + (wi.h ?? 2)), 0)
  return { x: 0, y: maxY }
}

export default function DashboardPage() {
  const { user, loading: authLoading } = useAuth()
  const [config, setConfig] = useState<DashboardConfig | null>(null)
  const [editing, setEditing] = useState(false)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [dbColumnMissing, setDbColumnMissing] = useState(false)
  const [containerWidth, setContainerWidth] = useState(1200)

  // Track container width for responsive grid
  useEffect(() => {
    const update = () => {
      const el = document.getElementById('dashboard-grid-container')
      if (el) setContainerWidth(el.clientWidth)
    }
    update()
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [config])

  // Initial load
  useEffect(() => {
    if (!user?.id) return
    const sb = createClient()
    ;(async () => {
      const { data, error } = await sb.from('users').select('dashboard_config').eq('id', user.id).maybeSingle()
      if (error && /column .* does not exist/i.test(error.message)) setDbColumnMissing(true)
      const dbCfg = (data as any)?.dashboard_config as DashboardConfig | null
      if (dbCfg && Array.isArray(dbCfg.widgets)) {
        setConfig({ ...dbCfg, widgets: normalizeLayout(dbCfg.widgets) })
        return
      }
      const local = loadLocalConfig(user.id)
      if (local) { setConfig({ ...local, widgets: normalizeLayout(local.widgets) }); return }
      const preset = presetForRole(user.role)
      const widgets = normalizeLayout(preset.widgetIds.map(w => ({ ...w }) as WidgetInstance))
      setConfig({ widgets, presetName: preset.roleKey })
    })()
  }, [user?.id, user?.role])

  const persist = useCallback(async (cfg: DashboardConfig) => {
    setConfig(cfg)
    if (!user?.id) return
    saveLocalConfig(user.id, cfg)
    if (!dbColumnMissing) {
      const sb = createClient()
      const { error } = await sb.from('users').update({ dashboard_config: cfg }).eq('id', user.id)
      if (error && /column .* does not exist/i.test(error.message)) setDbColumnMissing(true)
    }
  }, [user?.id, dbColumnMissing])

  // react-grid-layout layout change handler
  const handleLayoutChange = useCallback((newLayout: readonly any[]) => {
    if (!config || !editing) return
    const updated = config.widgets.map(wi => {
      const l = newLayout.find(n => n.i === wi.id)
      if (!l) return wi
      return { ...wi, x: l.x, y: l.y, w: l.w, h: l.h }
    })
    persist({ ...config, widgets: updated })
  }, [config, editing, persist])

  const handleRemove = (id: string) => {
    if (!config) return
    persist({ ...config, widgets: config.widgets.filter(w => w.id !== id) })
  }

  const handleAdd = (newIds: { id: string }[]) => {
    if (!config) return
    let nextY = config.widgets.reduce((m, wi) => Math.max(m, (wi.y ?? 0) + (wi.h ?? 2)), 0)
    let nextX = 0
    const additions: WidgetInstance[] = newIds.map(({ id }) => {
      const w = 6, h = 2
      if (nextX + w > GRID_COLS) { nextX = 0; nextY += 2 }
      const item: WidgetInstance = { id, x: nextX, y: nextY, w, h }
      nextX += w
      return item
    })
    persist({ ...config, widgets: [...config.widgets, ...additions] })
  }

  const handleApplyPreset = (roleKey: string) => {
    const preset = DASHBOARD_PRESETS.find(p => p.roleKey === roleKey)
    if (!preset) return
    if (!confirm(`"${preset.label}" 프리셋을 적용하시겠습니까?\n현재 배치가 덮어씌워집니다.`)) return
    const widgets = normalizeLayout(preset.widgetIds.map(w => ({ ...w }) as WidgetInstance))
    persist({ widgets, presetName: preset.roleKey })
    toast.success(`${preset.label} 프리셋이 적용되었습니다.`)
  }

  const currentIds = useMemo(() => config?.widgets.map(w => w.id) || [], [config])

  if (authLoading || !config) return <Loading />

  // Build react-grid-layout input from widgets
  const layout = config.widgets.map(wi => ({
    i: wi.id,
    x: wi.x ?? 0,
    y: wi.y ?? 0,
    w: wi.w ?? 6,
    h: wi.h ?? 2,
    minW: 2,
    minH: 1,
    maxW: 12,
    maxH: 8,
  }))

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">대시보드</h1>
          <p className="text-xs text-text-tertiary mt-0.5">
            안녕하세요, {user?.name}님 · {editing ? '드래그로 이동, 모서리로 크기 조절' : '위젯 클릭 시 해당 기능으로 이동'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {editing ? (
            <>
              <Button size="sm" variant="secondary" onClick={() => setPickerOpen(true)}>
                <Plus className="w-4 h-4 mr-1" /> 위젯 추가
              </Button>
              <Button size="sm" onClick={() => setEditing(false)}>완료</Button>
            </>
          ) : (
            <Button size="sm" variant="secondary" onClick={() => setEditing(true)}>
              <Settings className="w-4 h-4 mr-1" /> 편집
            </Button>
          )}
        </div>
      </div>

      {editing && (
        <div className="card p-3 mb-4 bg-amber-50 border-amber-200">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="text-xs text-amber-800">
              📝 편집 모드 — 위젯을 드래그하여 이동, 모서리를 끌어서 크기 조절
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs text-text-secondary">프리셋:</span>
              {DASHBOARD_PRESETS.map(p => (
                <button
                  key={p.roleKey}
                  onClick={() => handleApplyPreset(p.roleKey)}
                  className="text-[11px] px-2 py-1 rounded bg-white border border-amber-300 hover:bg-amber-100"
                >
                  <RotateCcw className="w-3 h-3 inline mr-0.5" />
                  {p.label}
                </button>
              ))}
            </div>
          </div>
          {dbColumnMissing && (
            <div className="text-[11px] text-amber-700 mt-2 border-t border-amber-200 pt-2">
              ⚠ DB 저장 컬럼이 없어 브라우저에만 저장됩니다. migration 006 실행 후 자동 DB 저장.
            </div>
          )}
        </div>
      )}

      <div id="dashboard-grid-container" className="w-full">
        {config.widgets.length === 0 ? (
          <div className="card p-8 text-center">
            <p className="text-sm text-text-tertiary mb-3">위젯이 없습니다.</p>
            <Button onClick={() => { setEditing(true); setPickerOpen(true) }}>
              <Plus className="w-4 h-4 mr-1" /> 위젯 추가
            </Button>
          </div>
        ) : (
          <GridLayout
            className="layout"
            layout={layout}
            cols={GRID_COLS}
            rowHeight={GRID_ROW_HEIGHT}
            width={containerWidth}
            onLayoutChange={handleLayoutChange}
            isDraggable={editing}
            isResizable={editing}
            draggableHandle=".drag-handle"
            margin={[12, 12]}
            containerPadding={[0, 0]}
            useCSSTransforms
          >
            {config.widgets.map(wi => {
              const widget = findWidget(wi.id)
              if (!widget) return null
              const Comp = widget.component
              return (
                <div key={wi.id} className="group">
                  <WidgetCard
                    title={widget.title}
                    href={editing ? undefined : widget.primaryHref}
                    editable={editing}
                    onRemove={() => handleRemove(wi.id)}
                  >
                    <Comp />
                  </WidgetCard>
                </div>
              )
            })}
          </GridLayout>
        )}
      </div>

      <WidgetPicker
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        currentIds={currentIds}
        onAdd={handleAdd}
      />
    </div>
  )
}
