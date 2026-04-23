'use client'

import { useEffect, useState, useMemo } from 'react'
import Link from 'next/link'
import { useAuth } from '@/hooks/useAuth'
import { Loading } from '@/components/ui/loading'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { formatDate } from '@/lib/utils'
import type { UserFeedback, FeedbackStatus, FeedbackCategory } from '@/types/database'
import { ArrowRight, Search, Filter, BookOpen } from 'lucide-react'

const STATUS_LABELS: Record<FeedbackStatus, string> = {
  submitted: '접수', reviewing: '검토중', planned: '예정',
  in_progress: '진행중', done: '완료', wont_do: '반려',
}
const STATUS_COLORS: Record<FeedbackStatus, string> = {
  submitted: 'bg-gray-100 text-gray-700',
  reviewing: 'bg-blue-100 text-blue-700',
  planned: 'bg-purple-100 text-purple-700',
  in_progress: 'bg-amber-100 text-amber-700',
  done: 'bg-green-100 text-green-700',
  wont_do: 'bg-red-100 text-red-700',
}
const CATEGORY_LABELS: Record<FeedbackCategory, string> = {
  bug: '🐛 버그', feature: '✨ 기능', improvement: '🔧 개선', question: '❓ 질문',
}
const PRIORITY_COLORS: Record<string, string> = {
  high: 'bg-red-100 text-red-700', normal: 'bg-yellow-100 text-yellow-700', low: 'bg-gray-100 text-gray-500',
}

export default function FeedbackListPage() {
  const { user } = useAuth()
  const [items, setItems] = useState<UserFeedback[]>([])
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState('')
  const [filterStatus, setFilterStatus] = useState<string>('전체')
  const [filterCategory, setFilterCategory] = useState<string>('전체')
  const [onlyMine, setOnlyMine] = useState(false)

  useEffect(() => {
    fetch('/api/feedback?limit=200').then(r => r.json()).then(r => {
      setItems(r.data || []); setLoading(false)
    })
  }, [])

  const filtered = useMemo(() => {
    let r = items
    if (filterStatus !== '전체') r = r.filter(i => i.status === filterStatus)
    if (filterCategory !== '전체') r = r.filter(i => i.category === filterCategory)
    if (onlyMine && user?.id) r = r.filter(i => i.created_by === user.id)
    if (q.trim()) {
      const s = q.toLowerCase()
      r = r.filter(i => i.title.toLowerCase().includes(s) || (i.description || '').toLowerCase().includes(s))
    }
    return r
  }, [items, filterStatus, filterCategory, onlyMine, q, user?.id])

  if (loading) return <Loading />

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">피드백 / 요청사항</h1>
          <p className="text-xs text-text-tertiary mt-0.5">
            버그 · 기능 요청 · 개선사항 — 총 {items.length}건 / 표시 {filtered.length}건
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/feedback/changelog">
            <Button variant="secondary" size="sm">
              <BookOpen className="w-4 h-4 mr-1" /> 개발일지
            </Button>
          </Link>
        </div>
      </div>

      {/* Filters */}
      <div className="card p-3 mb-4 flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-tertiary" />
          <input
            type="text" placeholder="제목 / 설명 검색..." value={q} onChange={e => setQ(e.target.value)}
            className="w-full pl-8 pr-2 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-200"
          />
        </div>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
          className="px-2 py-1.5 text-sm border border-gray-200 rounded-lg bg-white">
          <option value="전체">상태 전체</option>
          {Object.entries(STATUS_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <select value={filterCategory} onChange={e => setFilterCategory(e.target.value)}
          className="px-2 py-1.5 text-sm border border-gray-200 rounded-lg bg-white">
          <option value="전체">카테고리 전체</option>
          {Object.entries(CATEGORY_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <label className="flex items-center gap-1 text-sm text-text-secondary ml-2">
          <input type="checkbox" checked={onlyMine} onChange={e => setOnlyMine(e.target.checked)} />
          내가 등록한 것만
        </label>
      </div>

      {/* List */}
      <div className="space-y-2">
        {filtered.length === 0 ? (
          <div className="card p-8 text-center text-sm text-text-tertiary">
            해당하는 피드백이 없습니다.
          </div>
        ) : filtered.map(item => (
          <Link key={item.id} href={`/feedback/${item.id}`} className="block">
            <div className="card p-3 hover:shadow-card-hover transition-shadow">
              <div className="flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <Badge className={STATUS_COLORS[item.status]}>{STATUS_LABELS[item.status]}</Badge>
                    <Badge className={PRIORITY_COLORS[item.priority]}>{item.priority}</Badge>
                    <span className="text-[11px] text-text-tertiary">{CATEGORY_LABELS[item.category]}</span>
                    {item.target_page && (
                      <code className="text-[10px] bg-gray-100 px-1 py-0.5 rounded text-gray-500">{item.target_page}</code>
                    )}
                  </div>
                  <h3 className="text-sm font-semibold text-text-primary">{item.title}</h3>
                  {item.description && (
                    <p className="text-xs text-text-tertiary mt-1 line-clamp-2">{item.description}</p>
                  )}
                  <div className="flex items-center gap-3 mt-2 text-[11px] text-text-tertiary">
                    {item.created_by_user && <span>· {item.created_by_user.name}</span>}
                    <span>· {formatDate(item.created_at, 'M/d HH:mm')}</span>
                    {item.completed_at && (
                      <span className="text-green-600">· 완료 {formatDate(item.completed_at, 'M/d')}</span>
                    )}
                  </div>
                </div>
                <ArrowRight className="w-4 h-4 text-text-tertiary flex-shrink-0 mt-1" />
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}
