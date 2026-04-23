'use client'

// Widget card shell — no longer manages its own grid size.
// With react-grid-layout, the wrapper sets explicit width/height
// and the card fills 100% of its assigned grid cell.

import Link from 'next/link'
import { ExternalLink, X, Loader2, GripVertical } from 'lucide-react'

interface WidgetCardProps {
  title: string
  href?: string
  loading?: boolean
  children: React.ReactNode
  editable?: boolean
  onRemove?: () => void
}

export function WidgetCard({
  title, href, loading, children, editable, onRemove,
}: WidgetCardProps) {
  const body = (
    <div className="card h-full w-full flex flex-col p-3 transition-shadow hover:shadow-card-hover overflow-hidden">
      <div className="flex items-center justify-between mb-2 flex-shrink-0">
        <div className="flex items-center gap-1 min-w-0">
          {editable && (
            <span className="drag-handle cursor-move text-gray-400 hover:text-gray-600 flex-shrink-0" title="드래그하여 이동">
              <GripVertical className="w-3.5 h-3.5" />
            </span>
          )}
          <div className="text-xs font-semibold text-text-secondary tracking-tight truncate">{title}</div>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
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

  if (href && !editable) {
    return (
      <Link href={href} className="block h-full w-full group">
        {body}
      </Link>
    )
  }
  return <div className="h-full w-full">{body}</div>
}
