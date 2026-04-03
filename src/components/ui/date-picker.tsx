'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react'

interface DatePickerProps {
  value: string  // YYYY-MM-DD or ''
  onChange: (date: string) => void
  label?: string
  placeholder?: string
  className?: string
}

function toYMD(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const MONTH_NAMES = ['1월', '2월', '3월', '4월', '5월', '6월', '7월', '8월', '9월', '10월', '11월', '12월']
const DAYS = ['일', '월', '화', '수', '목', '금', '토']

export function DatePicker({ value, onChange, label, placeholder = '날짜 선택', className = '' }: DatePickerProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [viewYear, setViewYear] = useState(() => {
    if (value) return new Date(value).getFullYear()
    return new Date().getFullYear()
  })
  const [viewMonth, setViewMonth] = useState(() => {
    if (value) return new Date(value).getMonth()
    return new Date().getMonth()
  })
  const [dropdownPos, setDropdownPos] = useState({ top: 0, left: 0 })
  const ref = useRef<HTMLDivElement>(null)
  const btnRef = useRef<HTMLButtonElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)

  const updatePosition = useCallback(() => {
    if (btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect()
      setDropdownPos({
        top: rect.bottom + 4,
        left: rect.left,
      })
    }
  }, [])

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (
        ref.current && !ref.current.contains(e.target as Node) &&
        dropdownRef.current && !dropdownRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false)
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClick)
      return () => document.removeEventListener('mousedown', handleClick)
    }
  }, [isOpen])

  useEffect(() => {
    if (isOpen) {
      updatePosition()
      if (value) {
        const d = new Date(value)
        setViewYear(d.getFullYear())
        setViewMonth(d.getMonth())
      }
    }
  }, [isOpen])

  function navPrev() {
    if (viewMonth === 0) { setViewMonth(11); setViewYear(viewYear - 1) }
    else setViewMonth(viewMonth - 1)
  }
  function navNext() {
    if (viewMonth === 11) { setViewMonth(0); setViewYear(viewYear + 1) }
    else setViewMonth(viewMonth + 1)
  }

  const firstDay = new Date(viewYear, viewMonth, 1).getDay()
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate()
  const todayStr = toYMD(new Date())

  const cells: (number | null)[] = []
  for (let i = 0; i < firstDay; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(d)

  function handleSelect(dateStr: string) {
    onChange(dateStr)
    setIsOpen(false)
  }

  const displayValue = value
    ? (() => {
        const d = new Date(value)
        return `${d.getFullYear()}.${d.getMonth() + 1}.${d.getDate()}`
      })()
    : ''

  const calendarDropdown = isOpen ? createPortal(
    <div
      ref={dropdownRef}
      className="fixed z-[9999] bg-surface rounded-xl border border-border-light shadow-lg p-4"
      style={{ top: dropdownPos.top, left: dropdownPos.left, minWidth: 280 }}
    >
      {/* Navigation */}
      <div className="flex items-center justify-between mb-2">
        <button type="button" onClick={navPrev} className="p-1 rounded hover:bg-gray-100 transition-colors">
          <ChevronLeft className="w-4 h-4 text-text-secondary" />
        </button>
        <span className="text-sm font-semibold text-text-primary">
          {viewYear}년 {MONTH_NAMES[viewMonth]}
        </span>
        <button type="button" onClick={navNext} className="p-1 rounded hover:bg-gray-100 transition-colors">
          <ChevronRight className="w-4 h-4 text-text-secondary" />
        </button>
      </div>

      {/* Day headers */}
      <div className="grid grid-cols-7 gap-0 mb-1">
        {DAYS.map(d => (
          <div key={d} className="text-center text-[10px] font-medium text-text-tertiary py-1">
            {d}
          </div>
        ))}
      </div>

      {/* Days grid */}
      <div className="grid grid-cols-7 gap-0">
        {cells.map((day, i) => {
          if (day === null) return <div key={`e${i}`} className="h-8" />

          const dateStr = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
          const isSelected = dateStr === value
          const isToday = dateStr === todayStr

          return (
            <div key={dateStr}
              className="h-8 flex items-center justify-center cursor-pointer"
              onClick={() => handleSelect(dateStr)}
            >
              <span className={`w-7 h-7 flex items-center justify-center rounded-full text-xs transition-all
                ${isSelected ? 'bg-primary-500 text-white font-bold' : ''}
                ${!isSelected && isToday ? 'ring-1 ring-primary-300 text-primary-600 font-medium' : ''}
                ${!isSelected && !isToday ? 'hover:bg-gray-100 text-text-primary' : ''}
              `}>
                {day}
              </span>
            </div>
          )
        })}
      </div>

      {/* Quick actions */}
      <div className="flex gap-2 mt-3 pt-2 border-t border-border-light">
        <button type="button" onClick={() => handleSelect(todayStr)}
          className="flex-1 px-2 py-1 text-[10px] font-medium text-primary-600 bg-primary-50 rounded hover:bg-primary-100 transition-colors">
          오늘
        </button>
        {value && (
          <button type="button" onClick={() => { onChange(''); setIsOpen(false) }}
            className="flex-1 px-2 py-1 text-[10px] font-medium text-text-secondary bg-gray-50 rounded hover:bg-gray-100 transition-colors">
            초기화
          </button>
        )}
      </div>
    </div>,
    document.body
  ) : null

  return (
    <div ref={ref} className={`relative ${className}`}>
      {label && <label className="input-label">{label}</label>}
      <button
        ref={btnRef}
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 w-full px-3 py-2 rounded-md border border-border bg-surface text-body-sm
                   hover:bg-surface-tertiary transition-colors cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary-200
                   text-left"
      >
        <CalendarDays className="w-4 h-4 text-text-tertiary flex-shrink-0" />
        <span className={value ? 'text-text-primary' : 'text-text-placeholder'}>
          {displayValue || placeholder}
        </span>
      </button>

      {calendarDropdown}
    </div>
  )
}
