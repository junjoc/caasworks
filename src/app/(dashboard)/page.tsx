'use client'

// ─── 사용자별 커스터마이즈 가능한 위젯 기반 대시보드 ───
// 첫 방문 시: 사용자의 role에 맞는 프리셋이 자동 적용
// 편집 모드: 위젯 추가/제거/크기 조정 가능 (localStorage 저장)
// DB `users.dashboard_config` 컬럼이 있으면 DB에 저장, 없으면 로컬 폴백

import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { createClient } from '@/lib/supabase/client'
import { Loading } from '@/components/ui/loading'
import { Button } from '@/components/ui/button'
import { WidgetCard } from '@/components/dashboard/widget-card'
import { WidgetPicker } from '@/components/dashboard/widget-picker'
import { findWidget } from '@/lib/dashboard/widget-registry'
import { presetForRole, DASHBOARD_PRESETS } from '@/lib/dashboard/presets'
import type { DashboardConfig, WidgetInstance, WidgetSize } from '@/lib/dashboard/types'
import { toast } from 'sonner'
import { Settings, Plus, RotateCcw } from 'lucide-react'

const STORAGE_KEY = 'caasworks:dashboard_config:v1'

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

export default function DashboardPage() {
  const { user, loading: authLoading } = useAuth()
  const [config, setConfig] = useState<DashboardConfig | null>(null)
  const [editing, setEditing] = useState(false)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [dbColumnMissing, setDbColumnMissing] = useState(false)

  // Initial load: try DB first, then localStorage, then preset
  useEffect(() => {
    if (!user?.id) return
    const sb = createClient()
    ;(async () => {
      // Try DB
      const { data, error } = await sb.from('users').select('dashboard_config').eq('id', user.id).maybeSingle()
      if (error && /column .* does not exist/i.test(error.message)) {
        setDbColumnMissing(true)
      }
      const dbCfg = (data as any)?.dashboard_config as DashboardConfig | null
      if (dbCfg && Array.isArray(dbCfg.widgets)) {
        setConfig(dbCfg)
        return
      }
      // Fall back to local
      const local = loadLocalConfig(user.id)
      if (local) { setConfig(local); return }
      // Fall back to preset based on role
      const preset = presetForRole(user.role)
      const widgets: WidgetInstance[] = preset.widgetIds.map((w, i) => ({
        id: w.id, size: w.size, order: i,
      }))
      setConfig({ widgets, presetName: preset.roleKey })
    })()
  }, [user?.id, user?.role])

  const persist = async (cfg: DashboardConfig) => {
    setConfig(cfg)
    if (!user?.id) return
    // Always save local
    saveLocalConfig(user.id, cfg)
    // Try DB (no-op if column missing)
    if (!dbColumnMissing) {
      const sb = createClient()
      const { error } = await sb.from('users').update({ dashboard_config: cfg }).eq('id', user.id)
      if (error && /column .* does not exist/i.test(error.message)) {
        setDbColumnMissing(true)
      }
    }
  }

  const handleRemove = (id: string) => {
    if (!config) return
    persist({ ...config, widgets: config.widgets.filter(w => w.id !== id) })
  }

  const handleResize = (id: string, size: WidgetSize) => {
    if (!config) return
    persist({ ...config, widgets: config.widgets.map(w => w.id === id ? { ...w, size } : w) })
  }

  const handleAdd = (newInstances: WidgetInstance[]) => {
    if (!config) return
    persist({ ...config, widgets: [...config.widgets, ...newInstances] })
  }

  const handleApplyPreset = (roleKey: string) => {
    if (!confirm(`"${DASHBOARD_PRESETS.find(p => p.roleKey === roleKey)?.label}" 프리셋을 적용하시겠습니까?\n현재 위젯이 덮어씌워집니다.`)) return
    const preset = DASHBOARD_PRESETS.find(p => p.roleKey === roleKey)
    if (!preset) return
    const widgets: WidgetInstance[] = preset.widgetIds.map((w, i) => ({
      id: w.id, size: w.size, order: i,
    }))
    persist({ widgets, presetName: preset.roleKey })
    toast.success(`${preset.label} 프리셋이 적용되었습니다.`)
  }

  const currentIds = useMemo(() => config?.widgets.map(w => w.id) || [], [config])

  if (authLoading || !config) return <Loading />

  const sortedWidgets = [...config.widgets].sort((a, b) => a.order - b.order)

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">대시보드</h1>
          <p className="text-xs text-text-tertiary mt-0.5">
            안녕하세요, {user?.name}님 · 위젯을 클릭하면 해당 기능으로 이동합니다
          </p>
        </div>
        <div className="flex items-center gap-2">
          {editing ? (
            <>
              <Button size="sm" variant="secondary" onClick={() => setPickerOpen(true)}>
                <Plus className="w-4 h-4 mr-1" /> 위젯 추가
              </Button>
              <Button size="sm" onClick={() => setEditing(false)}>
                완료
              </Button>
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
              📝 편집 모드 — 위젯 우측 상단 <strong>크기(S/M/L)</strong> 클릭 시 크기 변경, <strong>X</strong> 클릭 시 제거
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs text-text-secondary">프리셋 적용:</span>
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
              ⚠ DB 저장 컬럼이 아직 없어서 브라우저에 저장됩니다. migration 006 실행 후 자동으로 DB 저장됩니다.
            </div>
          )}
        </div>
      )}

      {sortedWidgets.length === 0 ? (
        <div className="card p-8 text-center">
          <p className="text-sm text-text-tertiary mb-3">위젯이 없습니다.</p>
          <Button onClick={() => { setEditing(true); setPickerOpen(true) }}>
            <Plus className="w-4 h-4 mr-1" /> 위젯 추가
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-4 auto-rows-[160px] gap-3">
          {sortedWidgets.map(w => {
            const widget = findWidget(w.id)
            if (!widget) return null
            const Comp = widget.component
            return (
              <WidgetCard
                key={w.id}
                title={widget.title}
                href={editing ? undefined : widget.primaryHref}
                size={w.size}
                editable={editing}
                availableSizes={widget.availableSizes}
                onRemove={() => handleRemove(w.id)}
                onResize={(s) => handleResize(w.id, s)}
              >
                <Comp size={w.size} />
              </WidgetCard>
            )
          })}
        </div>
      )}

      <WidgetPicker
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        currentIds={currentIds}
        onAdd={handleAdd}
      />
    </div>
  )
}
