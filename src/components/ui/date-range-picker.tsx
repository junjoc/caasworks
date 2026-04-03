'use client'

import { useState, useRef, useEffect, useMemo } from 'react'
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react'

/* ─── Types ─── */
export interface DateRange {
  from: string  // YYYY-MM-DD
  to: string    // YYYY-MM-DD
}

interface DateRangePickerProps {
  value: DateRange
  onChange: (range: DateRange) => void
  className?: string
}

/* ─── Presets ─── */
const PRESETS = [
  { key: 'today', label: '오늘' },
  { key: 'yesterday', label: '어제' },
  { key: 'last7', label: '최근 7일' },
  { key: 'last14', label: '최근 14일' },
  { key: 'last28', label: '최근 28일' },
  { key: 'thisMonth', label: '이번 달' },
  { key: 'lastMonth', label: '지난 달' },
  { key: 'last3Months', label: '최근 3개월' },
  { key: 'thisYear', label: '올해' },
  { key: 'custom', label: '맞춤 설정' },
] as const

type PresetKey = typeof PRESETS[number]['key']

function toYMD(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function getPresetRange(key: PresetKey): DateRange | null {
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  switch (key) {
    case 'today':
      return { from: toYMD(today), to: toYMD(today) }
    case 'yesterday': {
      const d = new Date(today)
      d.setDate(d.getDate() - 1)
      return { from: toYMD(d), to: toYMD(d) }
    }
    case 'last7': {
      const d = new Date(today)
      d.setDate(d.getDate() - 6)
      return { from: toYMD(d), to: toYMD(today) }
    }
    case 'last14': {
      const d = new Date(today)
      d.setDate(d.getDate() - 13)
      return { from: toYMD(d), to: toYMD(today) }
    }
    case 'last28': {
      const d = new Date(today)
      d.setDate(d.getDate() - 27)
      return { from: toYMD(d), to: toYMD(today) }
    }
    case 'thisMonth': {
      const first = new Date(today.getFullYear(), today.getMonth(), 1)
      return { from: toYMD(first), to: toYMD(today) }
    }
    case 'lastMonth': {
      const first = new Date(today.getFullYear(), today.getMonth() - 1, 1)
      const last = new Date(today.getFullYear(), today.getMonth(), 0)
      return { from: toYMD(first), to: toYMD(last) }
    }
    case 'last3Months': {
      const d = new Date(today)
      d.setMonth(d.getMonth() - 3)
      d.setDate(d.getDate() + 1)
      return { from: toYMD(d), to: toYMD(today) }
    }
    case 'thisYear': {
      const first = new Date(today.getFullYear(), 0, 1)
      return { from: toYMD(first), to: toYMD(today) }
    }
    case 'custom':
      return null
  }
}

function detectPreset(range: DateRange): PresetKey {
  for (const p of PRESETS) {
    if (p.key === 'custom') continue
    const pr = getPresetRange(p.key)
    if (pr && pr.from === range.from && pr.to === range.to) return p.key
  }
  return 'custom'
}

function formatDisplayRange(range: DateRange): string {
  const from = new Date(range.from)
  const to = new Date(range.to)
  const fmtDate = (d: Date) => `${d.getFullYear()}.${d.getMonth() + 1}.${d.getDate()}`

  if (range.from === range.to) return fmtDate(from)

  // Same year
  if (from.getFullYear() === to.getFullYear()) {
    // Same month
    if (from.getMonth() === to.getMonth()) {
      return `${from.getFullYear()}.${from.getMonth() + 1}.${from.getDate()} ~ ${to.getDate()}`
    }
    return `${from.getMonth() + 1}.${from.getDate()} ~ ${to.getMonth() + 1}.${to.getDate()}, ${from.getFullYear()}`
  }
  return `${fmtDate(from)} ~ ${fmtDate(to)}`
}

/* ─── Calendar Grid Component ─── */
function CalendarMonth({
  year, month, rangeFrom, rangeTo, hoverDate,
  onDateClick, onDateHover,
}: {
  year: number
  month: number // 0-based
  rangeFrom: string | null
  rangeTo: string | null
  hoverDate: string | null
  onDateClick: (dateStr: string) => void
  onDateHover: (dateStr: string | null) => void
}) {
  const DAYS = ['일', '월', '화', '수', '목', '금', '토']
  const firstDay = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const todayStr = toYMD(new Date())

  const cells: (number | null)[] = []
  for (let i = 0; i < firstDay; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(d)

  const effectiveTo = rangeTo || hoverDate

  function isInRange(dateStr: string): boolean {
    if (!rangeFrom || !effectiveTo) return false
    const start = rangeFrom < effectiveTo ? rangeFrom : effectiveTo
    const end = rangeFrom < effectiveTo ? effectiveTo : rangeFrom
    return dateStr >= start && dateStr <= end
  }

  function isStart(dateStr: string): boolean {
    if (!rangeFrom || !effectiveTo) return dateStr === rangeFrom
    const start = rangeFrom < effectiveTo ? rangeFrom : effectiveTo
    return dateStr === start
  }

  function isEnd(dateStr: string): boolean {
    if (!rangeFrom || !effectiveTo) return false
    const end = rangeFrom < effectiveTo ? effectiveTo : rangeFrom
    return dateStr === end
  }

  return (
    <div className="select-none">
      <div className="grid grid-cols-7 gap-0 mb-1">
        {DAYS.map(d => (
          <div key={d} className="text-center text-[10px] font-medium text-text-tertiary py-1">
            {d}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-0">
        {cells.map((day, i) => {
          if (day === null) return <div key={`e${i}`} className="h-8" />

          const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
          const isToday = dateStr === todayStr
          const inRange = isInRange(dateStr)
          const start = isStart(dateStr)
          const end = isEnd(dateStr)
          const isSingle = rangeFrom === dateStr && (!effectiveTo || effectiveTo === rangeFrom)

          return (
            <div key={dateStr}
              className={`relative h-8 flex items-center justify-center cursor-pointer transition-colors
                ${inRange && !start && !end ? 'bg-primary-50' : ''}
                ${start && effectiveTo && rangeFrom !== effectiveTo ? 'bg-gradient-to-r from-transparent to-primary-50 via-primary-50' : ''}
                ${end && effectiveTo && rangeFrom !== effectiveTo ? 'bg-gradient-to-l from-transparent to-primary-50 via-primary-50' : ''}
              `}
              onClick={() => onDateClick(dateStr)}
              onMouseEnter={() => onDateHover(dateStr)}
            >
              <span className={`w-7 h-7 flex items-center justify-center rounded-full text-xs transition-all
                ${(start || end || isSingle) ? 'bg-primary-500 text-white font-bold' : ''}
                ${!start && !end && !isSingle && inRange ? 'text-primary-700 font-medium' : ''}
                ${!start && !end && !isSingle && !inRange ? 'hover:bg-gray-100 text-text-primary' : ''}
                ${isToday && !start && !end && !isSingle ? 'ring-1 ring-primary-300' : ''}
              `}>
                {day}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

/* ─── Main DateRangePicker ─── */
export function DateRangePicker({ value, onChange, className = '' }: DateRangePickerProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [selectedPreset, setSelectedPreset] = useState<PresetKey>(() => detectPreset(value))
  const [tempFrom, setTempFrom] = useState<string | null>(value.from)
  const [tempTo, setTempTo] = useState<string | null>(value.to)
  const [hoverDate, setHoverDate] = useState<string | null>(null)
  const [pickingStart, setPickingStart] = useState(true) // true = next click sets 'from'

  // Calendar navigation: show two consecutive months
  const [viewYear, setViewYear] = useState(() => {
    const d = new Date(value.to || value.from)
    return d.getFullYear()
  })
  const [viewMonth, setViewMonth] = useState(() => {
    const d = new Date(value.to || value.from)
    // Show the month before the end date as left calendar
    return d.getMonth() === 0 ? 11 : d.getMonth() - 1
  })

  const ref = useRef<HTMLDivElement>(null)

  // Close on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClick)
      return () => document.removeEventListener('mousedown', handleClick)
    }
  }, [isOpen])

  // When opening, sync temp state
  useEffect(() => {
    if (isOpen) {
      setTempFrom(value.from)
      setTempTo(value.to)
      setSelectedPreset(detectPreset(value))
      setPickingStart(true)
      const d = new Date(value.to || value.from)
      const m = d.getMonth() === 0 ? 11 : d.getMonth() - 1
      setViewMonth(m)
      setViewYear(m === 11 && d.getMonth() === 0 ? d.getFullYear() - 1 : d.getFullYear())
    }
  }, [isOpen])

  const rightMonth = viewMonth === 11 ? 0 : viewMonth + 1
  const rightYear = viewMonth === 11 ? viewYear + 1 : viewYear

  function navPrev() {
    if (viewMonth === 0) { setViewMonth(11); setViewYear(viewYear - 1) }
    else setViewMonth(viewMonth - 1)
  }

  function navNext() {
    if (viewMonth === 11) { setViewMonth(0); setViewYear(viewYear + 1) }
    else setViewMonth(viewMonth + 1)
  }

  const MONTH_NAMES = ['1월', '2월', '3월', '4월', '5월', '6월', '7월', '8월', '9월', '10월', '11월', '12월']

  function handlePresetClick(key: PresetKey) {
    setSelectedPreset(key)
    if (key === 'custom') {
      setPickingStart(true)
      setTempFrom(null)
      setTempTo(null)
      return
    }
    const range = getPresetRange(key)
    if (range) {
      setTempFrom(range.from)
      setTempTo(range.to)
    }
  }

  function handleDateClick(dateStr: string) {
    setSelectedPreset('custom')
    if (pickingStart || !tempFrom) {
      // Set start
      setTempFrom(dateStr)
      setTempTo(null)
      setPickingStart(false)
    } else {
      // Set end
      if (dateStr < tempFrom) {
        // Clicked before start — swap
        setTempTo(tempFrom)
        setTempFrom(dateStr)
      } else {
        setTempTo(dateStr)
      }
      setPickingStart(true)
    }
  }

  function handleApply() {
    if (tempFrom && tempTo) {
      const from = tempFrom < tempTo ? tempFrom : tempTo
      const to = tempFrom < tempTo ? tempTo : tempFrom
      onChange({ from, to })
      setIsOpen(false)
    } else if (tempFrom) {
      onChange({ from: tempFrom, to: tempFrom })
      setIsOpen(false)
    }
  }

  function handleCancel() {
    setIsOpen(false)
  }

  const displayLabel = formatDisplayRange(value)
  const presetLabel = PRESETS.find(p => p.key === detectPreset(value))?.label || '맞춤'

  return (
    <div ref={ref} className={`relative ${className}`}>
      {/* Trigger Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-3 py-1.5 rounded-md border border-border bg-surface text-body-sm
                   hover:bg-surface-tertiary transition-colors cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary-200"
      >
        <CalendarDays className="w-4 h-4 text-text-tertiary" />
        <span className="text-text-primary font-medium whitespace-nowrap">{displayLabel}</span>
        <span className="text-[10px] text-text-tertiary bg-gray-100 px-1.5 py-0.5 rounded">
          {presetLabel}
        </span>
      </button>

      {/* Dropdown Panel */}
      {isOpen && (
        <div className="absolute top-full right-0 mt-1 z-50 bg-surface rounded-xl border border-border-light shadow-lg
                        flex overflow-hidden" style={{ minWidth: 620 }}>
          {/* Left: Presets */}
          <div className="w-36 border-r border-border-light py-2 bg-surface-tertiary/50 flex-shrink-0">
            {PRESETS.map(p => (
              <button key={p.key}
                onClick={() => handlePresetClick(p.key)}
                className={`w-full text-left px-4 py-2 text-xs transition-colors
                  ${selectedPreset === p.key
                    ? 'bg-primary-50 text-primary-600 font-semibold border-r-2 border-primary-500'
                    : 'text-text-secondary hover:bg-surface-tertiary hover:text-text-primary'}
                `}>
                {p.label}
              </button>
            ))}
          </div>

          {/* Right: Calendar + Controls */}
          <div className="flex-1 p-4">
            {/* Display selected range */}
            <div className="flex items-center gap-2 mb-3 text-xs">
              <div className="flex-1 px-3 py-1.5 rounded-md border border-border bg-white text-center font-medium">
                {tempFrom || '시작일'}
              </div>
              <span className="text-text-tertiary">~</span>
              <div className="flex-1 px-3 py-1.5 rounded-md border border-border bg-white text-center font-medium">
                {tempTo || '종료일'}
              </div>
            </div>

            {/* Calendar Navigation */}
            <div className="flex items-center justify-between mb-2">
              <button onClick={navPrev} className="p-1 rounded hover:bg-gray-100 transition-colors">
                <ChevronLeft className="w-4 h-4 text-text-secondary" />
              </button>
              <div className="flex gap-16 text-sm font-semibold text-text-primary">
                <span>{viewYear}년 {MONTH_NAMES[viewMonth]}</span>
                <span>{rightYear}년 {MONTH_NAMES[rightMonth]}</span>
              </div>
              <button onClick={navNext} className="p-1 rounded hover:bg-gray-100 transition-colors">
                <ChevronRight className="w-4 h-4 text-text-secondary" />
              </button>
            </div>

            {/* Two Calendars */}
            <div className="flex gap-4">
              <div className="flex-1">
                <CalendarMonth
                  year={viewYear} month={viewMonth}
                  rangeFrom={tempFrom} rangeTo={tempTo}
                  hoverDate={!tempTo ? hoverDate : null}
                  onDateClick={handleDateClick}
                  onDateHover={setHoverDate}
                />
              </div>
              <div className="w-px bg-border-light" />
              <div className="flex-1">
                <CalendarMonth
                  year={rightYear} month={rightMonth}
                  rangeFrom={tempFrom} rangeTo={tempTo}
                  hoverDate={!tempTo ? hoverDate : null}
                  onDateClick={handleDateClick}
                  onDateHover={setHoverDate}
                />
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex justify-end gap-2 mt-4 pt-3 border-t border-border-light">
              <button onClick={handleCancel}
                className="px-4 py-1.5 text-xs font-medium text-text-secondary rounded-md
                           hover:bg-gray-100 transition-colors">
                취소
              </button>
              <button onClick={handleApply}
                className="px-4 py-1.5 text-xs font-semibold text-white bg-primary-500 rounded-md
                           hover:bg-primary-600 transition-colors disabled:opacity-50"
                disabled={!tempFrom}>
                적용
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
