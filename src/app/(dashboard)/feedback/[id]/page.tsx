'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useAuth } from '@/hooks/useAuth'
import { Loading } from '@/components/ui/loading'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { Select } from '@/components/ui/select'
import { formatDateTime } from '@/lib/utils'
import type { UserFeedback, FeedbackStatus } from '@/types/database'
import { ArrowLeft, Zap, Bot, CheckCircle2, Clock } from 'lucide-react'
import { toast } from 'sonner'

const STATUS_LABELS: Record<string, string> = {
  submitted: '접수', reviewing: '검토중', planned: '예정',
  in_progress: '진행중', done: '완료', wont_do: '반려',
}
const STATUS_COLORS: Record<string, string> = {
  submitted: 'bg-gray-100 text-gray-700',
  reviewing: 'bg-blue-100 text-blue-700',
  planned: 'bg-purple-100 text-purple-700',
  in_progress: 'bg-amber-100 text-amber-700',
  done: 'bg-green-100 text-green-700',
  wont_do: 'bg-red-100 text-red-700',
}

// 모든 값을 안전하게 문자열로 변환 — 객체/배열이면 JSON 으로
function safeString(v: unknown): string {
  if (v === null || v === undefined) return ''
  if (typeof v === 'string') return v
  if (typeof v === 'number' || typeof v === 'boolean') return String(v)
  try { return JSON.stringify(v) } catch { return String(v) }
}

export default function FeedbackDetailPage({ params }: { params: { id: string } }) {
  const { id } = params
  const { user } = useAuth()
  const [item, setItem] = useState<UserFeedback | null>(null)
  const [loading, setLoading] = useState(true)
  const [newComment, setNewComment] = useState('')
  const [isDirective, setIsDirective] = useState(false)
  const [posting, setPosting] = useState(false)
  const [fetchError, setFetchError] = useState<string | null>(null)

  const isAdmin = user?.role === 'admin'

  const reload = async () => {
    setFetchError(null)
    try {
      const res = await fetch(`/api/feedback/${id}`)
      const r = await res.json()
      if (!res.ok || r.error) {
        setFetchError(safeString(r.error) || `HTTP ${res.status}`)
        setItem(null)
      } else {
        setItem(r.data || null)
      }
    } catch (e: any) {
      setFetchError(safeString(e?.message) || '네트워크 오류')
      setItem(null)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { reload() }, [id])

  const changeStatus = async (status: FeedbackStatus) => {
    const r = await fetch(`/api/feedback/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    }).then(r => r.json())
    if (r.error) toast.error(safeString(r.error))
    else { toast.success('상태가 변경되었습니다.'); reload() }
  }

  const postComment = async () => {
    if (!newComment.trim()) return
    setPosting(true)
    const r = await fetch(`/api/feedback/${id}/comments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        comment: newComment, author_id: user?.id, is_admin_directive: isDirective,
      }),
    }).then(r => r.json())
    setPosting(false)
    if (r.error) { toast.error(safeString(r.error)); return }
    setNewComment('')
    setIsDirective(false)
    await reload()
    toast.success('댓글이 등록되었습니다.')
  }

  if (loading) return <Loading />
  if (fetchError) {
    return (
      <div className="max-w-xl mx-auto p-8">
        <Link href="/feedback" className="inline-flex items-center gap-1 text-text-tertiary hover:text-text-primary mb-4">
          <ArrowLeft className="w-4 h-4" /> 목록으로
        </Link>
        <div className="card p-6 border-l-4 border-l-status-red">
          <h2 className="text-base font-semibold mb-2">피드백을 불러오지 못했습니다</h2>
          <p className="text-sm text-text-secondary mb-4">{fetchError}</p>
          <button onClick={() => { setLoading(true); reload() }} className="px-3 py-1.5 text-xs font-medium bg-primary-500 text-white rounded hover:bg-primary-600">
            다시 시도
          </button>
        </div>
      </div>
    )
  }
  if (!item) return <div className="p-8 text-center text-text-tertiary">피드백을 찾을 수 없습니다.</div>

  // 모든 표시 값을 안전한 문자열로 명시 변환
  const status = safeString(item.status)
  const statusLabel = STATUS_LABELS[status] || status || '-'
  const statusColor = STATUS_COLORS[status] || 'bg-gray-100 text-gray-600'
  const title = safeString(item.title) || '(제목 없음)'
  const description = safeString(item.description)
  const category = safeString(item.category)
  const priority = safeString(item.priority)
  const targetPage = safeString(item.target_page)
  const resolutionSummary = safeString(item.resolution_summary)
  const createdAt = formatDateTime(item.created_at)
  const plannedAt = formatDateTime(item.planned_at)
  const startedAt = formatDateTime(item.started_at)
  const completedAt = formatDateTime(item.completed_at)
  const createdByName = safeString((item as any).created_by_user?.name)
  // 댓글 정규화
  const comments: any[] = Array.isArray((item as any).comments) ? (item as any).comments : []
  // pr_urls 정규화
  const prUrls: string[] = Array.isArray(item.pr_urls)
    ? item.pr_urls.filter((u): u is string => typeof u === 'string')
    : []

  return (
    <div>
      <div className="page-header">
        <div className="flex items-center gap-2">
          <Link href="/feedback" className="text-text-tertiary hover:text-text-primary">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Badge className={statusColor}>{statusLabel}</Badge>
              {category && <Badge className="bg-gray-100 text-gray-600">{category}</Badge>}
              {priority && <Badge className="bg-gray-100 text-gray-600">{priority}</Badge>}
            </div>
            <h1 className="page-title">{title}</h1>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 space-y-4">
          {/* Description */}
          {description && (
            <div className="card p-4">
              <div className="text-xs text-text-tertiary font-medium mb-1">설명</div>
              <p className="text-sm text-text-primary whitespace-pre-wrap">{description}</p>
            </div>
          )}

          {/* Timeline / comments */}
          <div className="card p-4">
            <div className="text-xs text-text-tertiary font-medium mb-3">타임라인</div>
            <div className="space-y-3">
              {comments.map(c => {
                const accent = c?.is_admin_directive
                  ? 'border-l-4 border-l-purple-400 bg-purple-50/50'
                  : c?.is_claude_report
                    ? 'border-l-4 border-l-blue-400 bg-blue-50/50'
                    : 'border-l-2 border-l-gray-200'
                const authorName = safeString(c?.author?.name) || (c?.author_type === 'claude' ? 'Claude' : '익명')
                const commentTime = formatDateTime(c?.created_at)
                const commentText = safeString(c?.comment)
                return (
                  <div key={safeString(c?.id) || Math.random()} className={`pl-3 py-2 ${accent} rounded`}>
                    <div className="flex items-center gap-2 text-[11px] mb-1">
                      {c?.is_admin_directive && <Zap className="w-3 h-3 text-purple-500" />}
                      {c?.is_claude_report && <Bot className="w-3 h-3 text-blue-500" />}
                      <span className="font-semibold text-text-primary">{authorName}</span>
                      <span className="text-text-tertiary">{commentTime}</span>
                      {c?.is_admin_directive && (
                        <Badge className="bg-purple-100 text-purple-700 text-[10px]">⚡ 지시사항</Badge>
                      )}
                      {c?.is_claude_report && (
                        <Badge className="bg-blue-100 text-blue-700 text-[10px]">🤖 Claude 작업</Badge>
                      )}
                    </div>
                    <p className="text-sm text-text-primary whitespace-pre-wrap">{commentText}</p>
                  </div>
                )
              })}
              {comments.length === 0 && (
                <p className="text-sm text-text-tertiary text-center py-4">아직 댓글이 없습니다.</p>
              )}
            </div>

            {/* Comment composer */}
            <div className="mt-4 pt-4 border-t border-border-light space-y-2">
              <Textarea
                value={newComment}
                onChange={(e) => setNewComment(e.target.value)}
                placeholder={isAdmin ? '댓글 또는 Claude에게 지시할 내용을 입력하세요...' : '댓글을 입력하세요...'}
                rows={3}
              />
              <div className="flex items-center justify-between">
                {isAdmin && (
                  <label className="flex items-center gap-1.5 text-xs text-purple-700">
                    <input type="checkbox" checked={isDirective} onChange={e => setIsDirective(e.target.checked)} />
                    <Zap className="w-3 h-3" /> Claude에게 지시 (다음 자동 실행 때 처리됨)
                  </label>
                )}
                <div className="ml-auto">
                  <Button size="sm" onClick={postComment} loading={posting} disabled={!newComment.trim()}>
                    댓글 등록
                  </Button>
                </div>
              </div>
            </div>
          </div>

          {/* Resolution (for done items) */}
          {resolutionSummary && (
            <div className="card p-4 bg-green-50/50 border-green-200">
              <div className="flex items-center gap-2 mb-2">
                <CheckCircle2 className="w-4 h-4 text-green-600" />
                <span className="text-xs font-semibold text-green-800">해결 내역</span>
              </div>
              <p className="text-sm text-text-primary whitespace-pre-wrap mb-2">{resolutionSummary}</p>
              {prUrls.length > 0 && (
                <div className="text-xs text-text-secondary">
                  PR: {prUrls.map((url, i) => (
                    <a key={i} href={url} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline mr-2">
                      #{safeString(url.split('/').pop())}
                    </a>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right sidebar - status + dates */}
        <div className="space-y-4">
          <div className="card p-4">
            <div className="text-xs text-text-tertiary font-medium mb-2">상태</div>
            {isAdmin ? (
              <Select
                value={status || 'submitted'}
                onChange={e => changeStatus(e.target.value as FeedbackStatus)}
                options={Object.entries(STATUS_LABELS).map(([v, l]) => ({ value: v, label: l }))}
              />
            ) : (
              <Badge className={statusColor}>{statusLabel}</Badge>
            )}
          </div>

          <div className="card p-4 space-y-2 text-xs">
            {createdAt && (
              <div className="flex items-center gap-2 text-text-tertiary">
                <Clock className="w-3 h-3" /> 등록 {createdAt}
              </div>
            )}
            {plannedAt && (
              <div className="flex items-center gap-2 text-purple-600">
                <Clock className="w-3 h-3" /> 계획 {plannedAt}
              </div>
            )}
            {startedAt && (
              <div className="flex items-center gap-2 text-amber-600">
                <Clock className="w-3 h-3" /> 시작 {startedAt}
              </div>
            )}
            {completedAt && (
              <div className="flex items-center gap-2 text-green-600">
                <CheckCircle2 className="w-3 h-3" /> 완료 {completedAt}
              </div>
            )}
            {targetPage && (
              <div className="pt-2 border-t border-border-light">
                <span className="text-text-tertiary">관련 페이지:</span>{' '}
                <Link href={targetPage} className="text-blue-600 hover:underline">{targetPage}</Link>
              </div>
            )}
            {createdByName && (
              <div>
                <span className="text-text-tertiary">등록자:</span> {createdByName}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
