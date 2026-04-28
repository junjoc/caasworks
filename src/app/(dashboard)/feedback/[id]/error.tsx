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
    // 콘솔에 전체 스택 출력 — 사용자가 F12 눌러서 알려줄 수 있게
    console.error('[Feedback Detail Error]', error)
    console.error('[Stack]', error?.stack)
  }, [error])

  return (
    <div className="max-w-2xl mx-auto p-8">
      <Link href="/feedback" className="inline-flex items-center gap-1 text-text-tertiary hover:text-text-primary mb-4">
        <ArrowLeft className="w-4 h-4" /> 목록으로
      </Link>
      <div className="card p-6">
        <div className="flex items-center gap-2 mb-3">
          <AlertTriangle className="w-5 h-5 text-status-red" />
          <h2 className="text-base font-semibold">피드백 상세를 열 수 없습니다</h2>
        </div>
        <p className="text-sm text-text-secondary mb-2">
          {error?.message || '알 수 없는 오류가 발생했습니다.'}
        </p>
        {error?.digest && (
          <p className="text-xs text-text-tertiary font-mono mb-2">digest: {error.digest}</p>
        )}
        {error?.stack && (
          <details className="mt-3">
            <summary className="text-xs text-text-tertiary cursor-pointer hover:text-text-primary">
              상세 스택 트레이스 보기 (개발자에게 전달)
            </summary>
            <pre className="text-[10px] bg-gray-50 p-2 rounded mt-1 overflow-auto max-h-60 whitespace-pre-wrap break-all">
              {error.stack}
            </pre>
          </details>
        )}
        <div className="flex gap-2 mt-4">
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
