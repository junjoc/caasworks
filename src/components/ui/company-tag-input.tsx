'use client'

import { useState, useRef, useEffect } from 'react'
import { cn } from '@/lib/utils'
import { Search, X, Building2 } from 'lucide-react'

interface CompanyOption {
  value: string
  label: string
  sub?: string
}

interface CompanyTagInputProps {
  label?: string
  placeholder?: string
  options: CompanyOption[]
  value: string  // comma-separated company names
  onChange: (value: string) => void
  className?: string
}

export function CompanyTagInput({
  label,
  placeholder = '회사 검색...',
  options,
  value,
  onChange,
  className,
}: CompanyTagInputProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const ref = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Parse comma-separated value into array
  const selected = value ? value.split(',').map(s => s.trim()).filter(Boolean) : []

  const filtered = query
    ? options.filter(o =>
        o.label.toLowerCase().includes(query.toLowerCase()) &&
        !selected.includes(o.label)
      ).slice(0, 20)
    : options.filter(o => !selected.includes(o.label)).slice(0, 20)

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

  const addCompany = (name: string) => {
    const next = [...selected, name]
    onChange(next.join(', '))
    setQuery('')
  }

  const removeCompany = (name: string) => {
    const next = selected.filter(s => s !== name)
    onChange(next.join(', '))
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && query.trim()) {
      e.preventDefault()
      // Allow adding custom name not in list
      addCompany(query.trim())
    }
  }

  return (
    <div ref={ref} className={cn('relative', className)}>
      {label && <label className="input-label">{label}</label>}

      {/* Tags + input */}
      <div
        onClick={() => {
          setOpen(true)
          setTimeout(() => inputRef.current?.focus(), 50)
        }}
        className={cn(
          'input-base min-h-[36px] max-h-[100px] overflow-y-auto flex flex-wrap items-center gap-1 cursor-text py-1 px-2',
          open && 'ring-2 ring-primary-200 border-primary-500',
        )}
      >
        {selected.map(name => (
          <span
            key={name}
            className="inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-blue-50 text-blue-700 text-xs rounded-md border border-blue-200"
          >
            <Building2 className="w-3 h-3" />
            <span className="max-w-[120px] truncate">{name}</span>
            <button
              onClick={(e) => { e.stopPropagation(); removeCompany(name); }}
              className="text-blue-400 hover:text-blue-600 ml-0.5"
            >
              <X className="w-3 h-3" />
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          type="text"
          className="flex-1 min-w-[80px] text-sm outline-none bg-transparent py-0.5"
          placeholder={selected.length === 0 ? placeholder : '추가...'}
          value={query}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
          onKeyDown={handleKeyDown}
          onFocus={() => setOpen(true)}
        />
      </div>

      {/* Dropdown */}
      {open && (query || filtered.length > 0) && (
        <div className="absolute z-50 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden">
          <div className="overflow-y-auto" style={{ maxHeight: '200px' }}>
            {filtered.length === 0 && query ? (
              <button
                type="button"
                onClick={() => addCompany(query.trim())}
                className="w-full text-left px-3 py-2 text-sm hover:bg-primary-50 text-gray-600"
              >
                <span className="text-primary-500 font-medium">&quot;{query}&quot;</span> 직접 추가
              </button>
            ) : (
              filtered.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => addCompany(opt.label)}
                  className="w-full text-left px-3 py-2 text-sm hover:bg-primary-50 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <Building2 className="w-3.5 h-3.5 text-gray-400" />
                    <div className="min-w-0">
                      <span className="block truncate font-medium">{opt.label}</span>
                      {opt.sub && <span className="text-xs text-gray-400 truncate block">{opt.sub}</span>}
                    </div>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}
