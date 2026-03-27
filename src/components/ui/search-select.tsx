'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { cn } from '@/lib/utils'
import { Search, ChevronDown, X } from 'lucide-react'

interface Option {
  value: string
  label: string
  sub?: string
}

interface SearchSelectProps {
  label?: string
  placeholder?: string
  options: Option[]
  value: string
  onChange: (value: string) => void
  disabled?: boolean
  className?: string
  error?: string
}

export function SearchSelect({
  label,
  placeholder = '검색...',
  options,
  value,
  onChange,
  disabled,
  className,
  error,
}: SearchSelectProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const ref = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const selectedOption = options.find(o => o.value === value)

  const filtered = query
    ? options.filter(o =>
        o.label.toLowerCase().includes(query.toLowerCase()) ||
        (o.sub && o.sub.toLowerCase().includes(query.toLowerCase()))
      )
    : options

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
        setQuery('')
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const handleSelect = useCallback((val: string) => {
    onChange(val)
    setOpen(false)
    setQuery('')
  }, [onChange])

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation()
    onChange('')
    setQuery('')
  }

  return (
    <div ref={ref} className={cn('relative', className)}>
      {label && <label className="input-label">{label}</label>}

      {/* Trigger */}
      <div
        onClick={() => {
          if (disabled) return
          setOpen(!open)
          setTimeout(() => inputRef.current?.focus(), 50)
        }}
        className={cn(
          'input-base flex items-center gap-2 cursor-pointer',
          disabled && 'opacity-50 cursor-not-allowed',
          open && 'ring-2 ring-primary-200 border-primary-400',
          error && 'input-error',
        )}
      >
        <Search className="w-3.5 h-3.5 text-gray-400 shrink-0" />
        <span className={cn('flex-1 truncate text-sm', !selectedOption && 'text-gray-400')}>
          {selectedOption ? selectedOption.label : placeholder}
        </span>
        {value && !disabled && (
          <button onClick={handleClear} className="text-gray-300 hover:text-gray-500 shrink-0">
            <X className="w-3.5 h-3.5" />
          </button>
        )}
        <ChevronDown className={cn('w-3.5 h-3.5 text-gray-400 shrink-0 transition-transform', open && 'rotate-180')} />
      </div>

      {/* Dropdown */}
      {open && (
        <div className="absolute z-50 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden" style={{ maxHeight: '320px' }}>
          {/* Search input */}
          <div className="p-2 border-b border-gray-100">
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                ref={inputRef}
                type="text"
                className="w-full pl-8 pr-3 py-1.5 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-primary-200 focus:border-primary-400"
                placeholder="검색..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onClick={(e) => e.stopPropagation()}
              />
            </div>
          </div>

          {/* Options list */}
          <div className="overflow-y-auto" style={{ maxHeight: '260px' }}>
            {filtered.length === 0 ? (
              <div className="px-3 py-6 text-center text-sm text-gray-400">검색 결과가 없습니다</div>
            ) : (
              filtered.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => handleSelect(opt.value)}
                  className={cn(
                    'w-full text-left px-3 py-2 text-sm hover:bg-primary-50 transition-colors flex items-center justify-between',
                    opt.value === value && 'bg-primary-50 text-primary-600 font-medium'
                  )}
                >
                  <div className="min-w-0">
                    <span className="block truncate">{opt.label}</span>
                    {opt.sub && <span className="text-xs text-gray-400 truncate block">{opt.sub}</span>}
                  </div>
                  {opt.value === value && (
                    <span className="text-primary-500 text-xs shrink-0 ml-2">✓</span>
                  )}
                </button>
              ))
            )}
          </div>
        </div>
      )}

      {error && <p className="mt-1 text-xs text-status-red">{error}</p>}
    </div>
  )
}
