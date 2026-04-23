'use client'

import { useState } from 'react'
import { Modal } from '@/components/ui/modal'
import { Button } from '@/components/ui/button'
import { WIDGET_REGISTRY, widgetsByCategory } from '@/lib/dashboard/widget-registry'
import type { WidgetInstance } from '@/lib/dashboard/types'
import { Plus, Check } from 'lucide-react'

interface WidgetPickerProps {
  open: boolean
  onClose: () => void
  currentIds: string[]
  onAdd: (newInstances: WidgetInstance[]) => void
}

export function WidgetPicker({ open, onClose, currentIds, onAdd }: WidgetPickerProps) {
  const [selected, setSelected] = useState<Set<string>>(new Set())

  const handleToggle = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const handleAdd = () => {
    // Just pass ids — the parent places them in the grid.
    const items = Array.from(selected).map(id => ({ id }))
    onAdd(items as WidgetInstance[])
    setSelected(new Set())
    onClose()
  }

  const grouped = widgetsByCategory()

  return (
    <Modal open={open} onClose={onClose} title="위젯 추가" className="max-w-2xl">
      <div className="space-y-3">
        <p className="text-xs text-text-tertiary">
          추가할 위젯을 선택하세요. 카테고리별로 여러 개 선택 가능.
        </p>

        <div className="border border-gray-200 rounded-lg max-h-[400px] overflow-y-auto">
          {Object.entries(grouped).map(([cat, widgets]) => (
            <div key={cat} className="border-b border-gray-100 last:border-b-0">
              <div className="bg-gray-50 px-3 py-1.5 text-xs font-semibold text-text-secondary">
                {cat}
              </div>
              {widgets.map(w => {
                const isCurrent = currentIds.includes(w.id)
                const isSelected = selected.has(w.id)
                return (
                  <button
                    key={w.id}
                    onClick={() => !isCurrent && handleToggle(w.id)}
                    disabled={isCurrent}
                    className={`w-full flex items-start gap-2 px-3 py-2 text-left hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed ${
                      isSelected ? 'bg-primary-50' : ''
                    }`}
                  >
                    <div className="mt-0.5">
                      {isCurrent ? (
                        <Check className="w-4 h-4 text-green-600" />
                      ) : isSelected ? (
                        <div className="w-4 h-4 rounded border-2 border-primary-500 bg-primary-500 flex items-center justify-center">
                          <Check className="w-3 h-3 text-white" />
                        </div>
                      ) : (
                        <div className="w-4 h-4 rounded border-2 border-gray-300" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-text-primary flex items-center gap-2">
                        {w.title}
                        {isCurrent && <span className="text-[10px] text-green-600">추가됨</span>}
                      </div>
                      <div className="text-xs text-text-tertiary">{w.description}</div>
                    </div>
                    <span className="text-[10px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded flex-shrink-0 mt-1">
                      {w.defaultSize}
                    </span>
                  </button>
                )
              })}
            </div>
          ))}
        </div>

        <div className="flex items-center justify-between pt-2">
          <div className="text-xs text-text-tertiary">선택된 위젯: {selected.size}개</div>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={onClose}>취소</Button>
            <Button onClick={handleAdd} disabled={selected.size === 0}>
              <Plus className="w-4 h-4 mr-1" /> {selected.size}개 추가
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  )
}
