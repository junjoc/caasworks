'use client'

import { useState, useRef, useEffect } from 'react'
import { cn } from '@/lib/utils'
import { ChevronDown } from 'lucide-react'

export interface DropdownOptionGroup {
  label: string
  options: { value: string; label: string }[]
}

interface DropdownSelectProps {
  value: string
  onChange: (value: string) => void
  groups?: DropdownOptionGroup[]
  options?: { value: string; label: string }[]
  label?: string
  placeholder?: string
  className?: string
}

export function DropdownSelect({
  value,
  onChange,
  groups,
  options,
  label,
  placeholder = '선택',
  className,
}: DropdownSelectProps) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  // Find display label for current value
  const allOptions = groups
    ? groups.flatMap(g => g.options)
    : options || []
  const selectedOption = allOptions.find(o => o.value === value)
  const displayLabel = selectedOption?.label || placeholder

  // Close on click outside
  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  return (
    <div ref={ref} className={cn('relative', className)}>
      {label && (
        <label className="input-label">{label}</label>
      )}
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={cn(
          'input-base w-full text-left flex items-center justify-between gap-2',
          !selectedOption && 'text-text-placeholder'
        )}
      >
        <span className="truncate">{displayLabel}</span>
        <ChevronDown className={cn('w-4 h-4 text-text-tertiary shrink-0 transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-50 max-h-[280px] overflow-y-auto py-1">
          {groups ? (
            groups.map((group) => (
              <div key={group.label}>
                <div className="px-3 py-1.5 text-[11px] font-semibold text-text-tertiary uppercase tracking-wide bg-surface-tertiary">
                  {group.label}
                </div>
                {group.options.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => { onChange(opt.value); setOpen(false) }}
                    className={cn(
                      'w-full text-left px-3 py-2 text-sm hover:bg-primary-50 hover:text-primary-700 transition-colors',
                      value === opt.value ? 'bg-primary-50 text-primary-700 font-medium' : 'text-text-primary'
                    )}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            ))
          ) : (
            options?.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => { onChange(opt.value); setOpen(false) }}
                className={cn(
                  'w-full text-left px-3 py-2 text-sm hover:bg-primary-50 hover:text-primary-700 transition-colors',
                  value === opt.value ? 'bg-primary-50 text-primary-700 font-medium' : 'text-text-primary'
                )}
              >
                {opt.label}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  )
}
