'use client'

import { useEffect, useState, useMemo } from 'react'
import Link from 'next/link'
import { Loading } from '@/components/ui/loading'
import { Badge } from '@/components/ui/badge'
import { formatDate } from '@/lib/utils'
import type { UserFeedback } from '@/types/database'
import { ArrowLeft, CheckCircle2 } from 'lucide-react'

const CATEGORY_LABELS: Record<string, string> = {
  bug: '🐛 버그 수정', feature: '✨ 신규 기능', improvement: '🔧 개선', question: '❓ 질문',
}

// Group by YYYY-MM
function groupByMonth(items: UserFeedback[]): Record<string, UserFeedback[]> {
  const g: Record<string, UserFeedback[]> = {}
  for (const it of items) {
    const key = (it.completed_at || it.updated_at).substring(0, 7)
    if (!g[key]) g[key] = []
    g[key].push(it)
  }
  return g
}

export default function ChangelogPage() {
  const [items, setItems] = useState<UserFeedback[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/feedback?status=done&limit=500').then(r => r.json()).then(r => {
      const data: UserFeedback[] = (r.data || []).filter((i: UserFeedback) => i.completed_at)
      // Sort by completed_at desc
      data.sort((a, b) => (b.completed_at || '').localeCompare(a.completed_at || ''))
      setItems(data)
      setLoading(false)
    })
  }, [])

  const grouped = useMemo(() => groupByMonth(items), [items])
  const months = useMemo(() => Object.keys(grouped).sort().reverse(), [grouped])

  if (loading) return <Loading />

  return (
    <div>
      <div className="page-header">
        <div className="flex items-center gap-2">
          <Link href="/feedback" className="text-text-tertiary hover:text-text-primary">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="page-title">개발일지</h1>
            <p className="text-xs text-text-tertiary mt-0.5">
              완료된 피드백/요청을 시간순으로 — 총 {items.length}건
            </p>
          </div>
        </div>
      </div>

      {items.length === 0 ? (
        <div className="card p-8 text-center text-sm text-text-tertiary">
          아직 완료된 건이 없습니다.
        </div>
      ) : (
        <div className="space-y-6">
          {months.map(m => (
            <div key={m}>
              <h2 className="text-sm font-bold text-text-primary mb-2 pb-1 border-b border-gray-200">
                {m} <span className="text-xs font-normal text-text-tertiary ml-2">({grouped[m].length}건)</span>
              </h2>
              <div className="space-y-2">
                {grouped[m].map(item => (
                  <Link key={item.id} href={`/feedback/${item.id}`} className="block">
                    <div className="card p-3 hover:shadow-card-hover transition-shadow">
                      <div className="flex items-start gap-3">
                        <CheckCircle2 className="w-4 h-4 text-green-600 flex-shrink-0 mt-0.5" />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1 flex-wrap">
                            <span className="text-[11px] text-text-tertiary">{CATEGORY_LABELS[item.category] || item.category}</span>
                            <span className="text-[11px] text-green-600 font-medium">
                              완료 {item.completed_at ? formatDate(item.completed_at, 'M/d') : ''}
                            </span>
                          </div>
                          <h3 className="text-sm font-semibold text-text-primary">{item.title}</h3>
                          {item.resolution_summary && (
                            <p className="text-xs text-text-secondary mt-1">{item.resolution_summary}</p>
                          )}
                          {item.pr_urls && item.pr_urls.length > 0 && (
                            <div className="text-[11px] text-blue-600 mt-1">
                              {item.pr_urls.map((u, i) => (
                                <a key={i} href={u} target="_blank" rel="noreferrer" className="hover:underline mr-2">
                                  #{u.split('/').pop()}
                                </a>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
