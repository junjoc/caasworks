'use client'

import { useState, useMemo } from 'react'
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'

export type PeriodMode = 'monthly' | 'weekly' | 'daily' | 'custom'

export interface PeriodValue {
  mode: PeriodMode
  year: number
  month: number       // 1-12
  week?: number       // 1-5 (week of month)
  day?: string        // YYYY-MM-DD
  customFrom?: string // YYYY-MM-DD
  customTo?: string   // YYYY-MM-DD
}

interface PeriodFilterProps {
  value: PeriodValue
  onChange: (value: PeriodValue) => void
  modes?: PeriodMode[]
  className?: string
}

const MODE_LABELS: Record<PeriodMode, string> = {
  monthly: '월별',
  weekly: '주별',
  daily: '일별',
  custom: '기간선택',
}

function getWeeksInMonth(year: number, month: number) {
  const firstDay = new Date(year, month - 1, 1)
  const lastDay = new Date(year, month, 0)
  const weeks: { label: string; start: string; end: string }[] = []

  let current = new Date(firstDay)
  // Start from Monday of the first week
  const firstMonday = new Date(current)
  if (firstMonday.getDay() !== 1) {
    firstMonday.setDate(firstMonday.getDate() - ((firstMonday.getDay() + 6) % 7))
  }
  current = firstMonday

  let weekNum = 1
  while (current <= lastDay || weekNum === 1) {
    const weekStart = new Date(current)
    const weekEnd = new Date(current)
    weekEnd.setDate(weekEnd.getDate() + 6)

    const fmt = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    const shortFmt = (d: Date) => `${d.getMonth() + 1}/${d.getDate()}`

    weeks.push({
      label: `${weekNum}주 (${shortFmt(weekStart)}~${shortFmt(weekEnd)})`,
      start: fmt(weekStart),
      end: fmt(weekEnd),
    })

    current.setDate(current.getDate() + 7)
    weekNum++
    if (weekNum > 6) break
  }

  return weeks
}

function getDaysInMonth(year: number, month: number) {
  return new Date(year, month, 0).getDate()
}

export function PeriodFilter({ value, onChange, modes = ['monthly', 'weekly', 'daily', 'custom'], className }: PeriodFilterProps) {
  const [customOpen, setCustomOpen] = useState(false)
  const [tempFrom, setTempFrom] = useState(value.customFrom || '')
  const [tempTo, setTempTo] = useState(value.customTo || '')

  const monthOptions = useMemo(() =>
    Array.from({ length: 12 }, (_, i) => ({ value: i + 1, label: `${i + 1}월` })),
    []
  )

  const weeks = useMemo(() =>
    getWeeksInMonth(value.year, value.month),
    [value.year, value.month]
  )

  const daysInMonth = useMemo(() =>
    getDaysInMonth(value.year, value.month),
    [value.year, value.month]
  )

  const handlePrev = () => {
    if (value.mode === 'monthly' || value.mode === 'weekly') {
      if (value.month === 1) {
        onChange({ ...value, year: value.year - 1, month: 12 })
      } else {
        onChange({ ...value, month: value.month - 1 })
      }
    } else if (value.mode === 'daily' && value.day) {
      const d = new Date(value.day)
      d.setDate(d.getDate() - 1)
      const newDay = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
      onChange({ ...value, day: newDay, year: d.getFullYear(), month: d.getMonth() + 1 })
    }
  }

  const handleNext = () => {
    if (value.mode === 'monthly' || value.mode === 'weekly') {
      if (value.month === 12) {
        onChange({ ...value, year: value.year + 1, month: 1 })
      } else {
        onChange({ ...value, month: value.month + 1 })
      }
    } else if (value.mode === 'daily' && value.day) {
      const d = new Date(value.day)
      d.setDate(d.getDate() + 1)
      const newDay = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
      onChange({ ...value, day: newDay, year: d.getFullYear(), month: d.getMonth() + 1 })
    }
  }

  const displayLabel = (() => {
    if (value.mode === 'monthly') return `${value.year}년 ${value.month}월`
    if (value.mode === 'weekly' && value.week && weeks[value.week - 1]) {
      return `${value.year}년 ${value.month}월 ${weeks[value.week - 1].label}`
    }
    if (value.mode === 'daily' && value.day) {
      const d = new Date(value.day)
      return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일`
    }
    if (value.mode === 'custom' && value.customFrom && value.customTo) {
      return `${value.customFrom} ~ ${value.customTo}`
    }
    return `${value.year}년 ${value.month}월`
  })()

  return (
    <div className={cn('flex items-center gap-2 flex-wrap', className)}>
      {/* Mode selector */}
      <div className="flex rounded-lg border border-border overflow-hidden">
        {modes.map(mode => (
          <button
            key={mode}
            onClick={() => {
              const now = new Date()
              const base: PeriodValue = { ...value, mode }
              if (mode === 'daily' && !value.day) {
                base.day = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
              }
              if (mode === 'weekly' && !value.week) {
                base.week = 1
              }
              onChange(base)
            }}
            className={cn(
              'px-3 py-1.5 text-xs font-medium transition-colors',
              value.mode === mode
                ? 'bg-primary-500 text-white'
                : 'bg-white text-text-secondary hover:bg-gray-50'
            )}
          >
            {MODE_LABELS[mode]}
          </button>
        ))}
      </div>

      {/* Period navigation */}
      {value.mode !== 'custom' && (
        <div className="flex items-center gap-1">
          <button onClick={handlePrev} className="p-1.5 rounded-md hover:bg-gray-100 transition-colors">
            <ChevronLeft className="w-4 h-4 text-text-secondary" />
          </button>
          <span className="text-sm font-semibold text-text-primary min-w-[160px] text-center">
            {displayLabel}
          </span>
          <button onClick={handleNext} className="p-1.5 rounded-md hover:bg-gray-100 transition-colors">
            <ChevronRight className="w-4 h-4 text-text-secondary" />
          </button>
        </div>
      )}

      {/* Year selector for monthly/weekly */}
      {(value.mode === 'monthly' || value.mode === 'weekly') && (
        <select
          value={value.year}
          onChange={e => onChange({ ...value, year: Number(e.target.value) })}
          className="text-xs border border-border rounded-md px-2 py-1.5 bg-white text-text-secondary focus:outline-none focus:ring-1 focus:ring-primary-200"
        >
          {Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - i).map(y => (
            <option key={y} value={y}>{y}년</option>
          ))}
        </select>
      )}

      {/* Month quick select for monthly */}
      {value.mode === 'monthly' && (
        <select
          value={value.month}
          onChange={e => onChange({ ...value, month: Number(e.target.value) })}
          className="text-xs border border-border rounded-md px-2 py-1.5 bg-white text-text-secondary focus:outline-none focus:ring-1 focus:ring-primary-200"
        >
          {monthOptions.map(m => (
            <option key={m.value} value={m.value}>{m.label}</option>
          ))}
        </select>
      )}

      {/* Week selector */}
      {value.mode === 'weekly' && (
        <select
          value={value.week || 1}
          onChange={e => onChange({ ...value, week: Number(e.target.value) })}
          className="text-xs border border-border rounded-md px-2 py-1.5 bg-white text-text-secondary focus:outline-none focus:ring-1 focus:ring-primary-200"
        >
          {weeks.map((w, i) => (
            <option key={i} value={i + 1}>{w.label}</option>
          ))}
        </select>
      )}

      {/* Daily date input */}
      {value.mode === 'daily' && (
        <input
          type="date"
          value={value.day || ''}
          onChange={e => {
            const d = new Date(e.target.value)
            onChange({ ...value, day: e.target.value, year: d.getFullYear(), month: d.getMonth() + 1 })
          }}
          className="text-xs border border-border rounded-md px-2 py-1.5 bg-white text-text-secondary focus:outline-none focus:ring-1 focus:ring-primary-200"
        />
      )}

      {/* Custom range */}
      {value.mode === 'custom' && (
        <div className="flex items-center gap-2">
          <input
            type="date"
            value={value.customFrom || ''}
            onChange={e => onChange({ ...value, customFrom: e.target.value })}
            className="text-xs border border-border rounded-md px-2 py-1.5 bg-white text-text-secondary focus:outline-none focus:ring-1 focus:ring-primary-200"
          />
          <span className="text-text-tertiary text-xs">~</span>
          <input
            type="date"
            value={value.customTo || ''}
            onChange={e => onChange({ ...value, customTo: e.target.value })}
            className="text-xs border border-border rounded-md px-2 py-1.5 bg-white text-text-secondary focus:outline-none focus:ring-1 focus:ring-primary-200"
          />
        </div>
      )}
    </div>
  )
}

/** Utility: get date range from PeriodValue */
export function getPeriodDateRange(period: PeriodValue): { from: string; to: string } {
  const { mode, year, month, week, day, customFrom, customTo } = period

  if (mode === 'monthly') {
    const from = `${year}-${String(month).padStart(2, '0')}-01`
    const lastDay = new Date(year, month, 0).getDate()
    const to = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`
    return { from, to }
  }

  if (mode === 'weekly' && week) {
    const weeks = getWeeksInMonth(year, month)
    const w = weeks[week - 1]
    if (w) return { from: w.start, to: w.end }
  }

  if (mode === 'daily' && day) {
    return { from: day, to: day }
  }

  if (mode === 'custom' && customFrom && customTo) {
    return { from: customFrom, to: customTo }
  }

  // Fallback: current month
  const from = `${year}-${String(month).padStart(2, '0')}-01`
  const lastDay = new Date(year, month, 0).getDate()
  const to = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`
  return { from, to }
}
