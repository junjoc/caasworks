'use client'

import Link from 'next/link'
import { useEffect } from 'react'
import { AlertTriangle, ArrowLeft } from 'lucide-react'

export default function FeedbackDetailError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('[Feedback Detail Error]', error)
  }, [error])

  return (
    <div className="max-w-xl mx-auto p-8">
      <Link href="/feedback" className="inline-flex items-center gap-1 text-text-tertiary hover:text-text-primary mb-4">
        <ArrowLeft className="w-4 h-4" /> 목록으로
      </Link>
      <div className="card p-6">
        <div className="flex items-center gap-2 mb-3">
          <AlertTriangle className="w-5 h-5 text-status-red" />
          <h2 className="text-base font-semibold">피드백 상세를 열 수 없습니다</h2>
        </div>
        <p className="text-sm text-text-secondary mb-4">
          {error?.message || '알 수 없는 오류가 발생했습니다.'}
        </p>
        {error?.digest && (
          <p className="text-xs text-text-tertiary font-mono mb-4">{error.digest}</p>
        )}
        <div className="flex gap-2">
          <button
            onClick={reset}
            className="px-3 py-1.5 text-xs font-medium bg-primary-500 text-white rounded hover:bg-primary-600"
          >
            다시 시도
          </button>
          <Link
            href="/feedback"
            className="px-3 py-1.5 text-xs font-medium border border-border rounded hover:bg-gray-50"
          >
            목록으로
          </Link>
        </div>
      </div>
    </div>
  )
}
