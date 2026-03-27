'use client'

import { forwardRef, type TextareaHTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string
  error?: string
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, label, error, id, ...props }, ref) => {
    return (
      <div>
        {label && (
          <label htmlFor={id} className="input-label">
            {label}
          </label>
        )}
        <textarea
          ref={ref}
          id={id}
          className={cn(
            'input-base resize-none',
            error && 'input-error',
            className
          )}
          rows={4}
          {...props}
        />
        {error && <p className="mt-1 text-xs text-status-red">{error}</p>}
      </div>
    )
  }
)

Textarea.displayName = 'Textarea'
