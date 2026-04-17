'use client'

import { forwardRef, type SelectHTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

export interface SelectOptionGroup {
  label: string
  options: { value: string; label: string }[]
}

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string
  error?: string
  options?: { value: string; label: string }[]
  groups?: SelectOptionGroup[]
  placeholder?: string
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, label, error, id, options, groups, placeholder, ...props }, ref) => {
    return (
      <div>
        {label && (
          <label htmlFor={id} className="input-label">
            {label}
          </label>
        )}
        <select
          ref={ref}
          id={id}
          className={cn(
            'input-base',
            error && 'input-error',
            className
          )}
          {...props}
        >
          {placeholder && <option value="">{placeholder}</option>}
          {groups ? (
            groups.map((group) => (
              <optgroup key={group.label} label={group.label}>
                {group.options.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </optgroup>
            ))
          ) : (
            options?.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))
          )}
        </select>
        {error && <p className="mt-1 text-xs text-status-red">{error}</p>}
      </div>
    )
  }
)

Select.displayName = 'Select'
