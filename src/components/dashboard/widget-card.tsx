'use client'

import Link from 'next/link'
import { ExternalLink, X, Loader2 } from 'lucide-react'
import type { WidgetSize } from '@/lib/dashboard/types'

interface WidgetCardProps {
  title: string
  href?: string
  size: WidgetSize
  loading?: boolean
  children: React.ReactNode
  // Edit mode
  editable?: boolean
  onRemove?: () => void
  onResize?: (size: WidgetSize) => void
  availableSizes?: WidgetSize[]
}

// Grid span mapping — 4-column grid on desktop, stacks on mobile.
const sizeClass: Record<WidgetSize, string> = {
  'S': 'col-span-2 sm:col-span-1 row-span-1',
  'M': 'col-span-2 sm:col-span-2 row-span-1',
  'L': 'col-span-2 sm:col-span-2 row-span-2',
}

export function WidgetCard({
  title, href, size, loading, children, editable, onRemove, onResize, availableSizes
}: WidgetCardProps) {
  const body = (
    <div className="card h-full flex flex-col p-4 transition-shadow hover:shadow-card-hover">
      <div className="flex items-center justify-between mb-2">
        <div className="text-xs font-semibold text-text-secondary tracking-tight">{title}</div>
        <div className="flex items-center gap-1">
          {editable && availableSizes && availableSizes.length > 1 && (
            <div className="flex items-center gap-0.5">
              {availableSizes.map(s => (
                <button
                  key={s}
                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); onResize?.(s) }}
                  className={`text-[10px] px-1.5 py-0.5 rounded ${
                    s === size ? 'bg-primary-500 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
          )}
          {editable && onRemove && (
            <button
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); onRemove() }}
              className="p-0.5 rounded text-gray-400 hover:text-red-500 hover:bg-red-50"
              title="위젯 제거"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
          {!editable && href && (
            <ExternalLink className="w-3 h-3 text-gray-300 group-hover:text-primary-500" />
          )}
        </div>
      </div>
      <div className="flex-1 min-h-0 relative">
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-white/60 backdrop-blur-sm z-10">
            <Loader2 className="w-5 h-5 text-primary-500 animate-spin" />
          </div>
        )}
        {children}
      </div>
    </div>
  )

  const classes = `${sizeClass[size]} group`

  if (href && !editable) {
    return (
      <Link href={href} className={classes}>
        {body}
      </Link>
    )
  }
  return <div className={classes}>{body}</div>
}
