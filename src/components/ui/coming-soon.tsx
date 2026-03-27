'use client'

import { Construction } from 'lucide-react'

interface ComingSoonProps {
  title?: string
  description?: string
}

export function ComingSoon({ title = '준비 중입니다', description = '이 기능은 곧 제공될 예정입니다.' }: ComingSoonProps) {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <div className="w-14 h-14 rounded-2xl bg-primary-50 flex items-center justify-center mb-4">
        <Construction className="w-7 h-7 text-primary-400" />
      </div>
      <h2 className="text-heading-lg text-text-primary mb-2">{title}</h2>
      <p className="text-body-sm text-text-tertiary max-w-md">{description}</p>
    </div>
  )
}
