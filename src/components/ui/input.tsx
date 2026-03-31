'use client'

import { forwardRef, type InputHTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, label, error, id, type, onFocus, ...props }, ref) => {
    const handleFocus = (e: React.FocusEvent<HTMLInputElement>) => {
      if (type === 'number') {
        e.target.select()
      }
      onFocus?.(e)
    }
    return (
      <div>
        {label && (
          <label htmlFor={id} className="input-label">
            {label}
          </label>
        )}
        <input
          ref={ref}
          id={id}
          type={type}
          className={cn(
            'input-base',
            error && 'input-error',
            className
          )}
          onFocus={handleFocus}
          {...props}
        />
        {error && <p className="mt-1 text-xs text-status-red">{error}</p>}
      </div>
    )
  }
)

Input.displayName = 'Input'
