'use client'

import { useEffect, useState, use } from 'react'
import Link from 'next/link'
import { useAuth } from '@/hooks/useAuth'
import { Loading } from '@/components/ui/loading'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { Select } from '@/components/ui/select'
import { formatDate, formatDateTime } from '@/lib/utils'
import type { UserFeedback, FeedbackStatus } from '@/types/database'
import { ArrowLeft, Zap, Bot, CheckCircle2, Clock } from 'lucide-react'
import { toast } from 'sonner'

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

export default function FeedbackDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const { user } = useAuth()
  const [item, setItem] = useState<UserFeedback | null>(null)
  const [loading, setLoading] = useState(true)
  const [newComment, setNewComment] = useState('')
  const [isDirective, setIsDirective] = useState(false)
  const [posting, setPosting] = useState(false)

  const isAdmin = user?.role === 'admin'

  const [fetchError, setFetchError] = useState<string | null>(null)

  const reload = async () => {
    setFetchError(null)
    try {
      const res = await fetch(`/api/feedback/${id}`)
      const r = await res.json()
      if (!res.ok || r.error) {
        setFetchError(r.error || `HTTP ${res.status}`)
        setItem(null)
      } else {
        setItem(r.data || null)
      }
    } catch (e: any) {
      setFetchError(e?.message || '네트워크 오류')
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
    if (r.error) toast.error(r.error)
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
    if (r.error) { toast.error(r.error); return }
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

  // 상태/카테고리/우선순위가 예상 밖 값인 경우 fallback
  const statusLabel = STATUS_LABELS[item.status as FeedbackStatus] || item.status || '-'
  const statusColor = STATUS_COLORS[item.status as FeedbackStatus] || 'bg-gray-100 text-gray-600'

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
              {item.category && <Badge className="bg-gray-100 text-gray-600">{item.category}</Badge>}
              {item.priority && <Badge className="bg-gray-100 text-gray-600">{item.priority}</Badge>}
            </div>
            <h1 className="page-title">{item.title || '(제목 없음)'}</h1>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 space-y-4">
          {/* Description */}
          {item.description && (
            <div className="card p-4">
              <div className="text-xs text-text-tertiary font-medium mb-1">설명</div>
              <p className="text-sm text-text-primary whitespace-pre-wrap">{item.description}</p>
            </div>
          )}

          {/* Timeline / comments */}
          <div className="card p-4">
            <div className="text-xs text-text-tertiary font-medium mb-3">타임라인</div>
            <div className="space-y-3">
              {(item.comments || []).map(c => {
                const accent = c.is_admin_directive
                  ? 'border-l-4 border-l-purple-400 bg-purple-50/50'
                  : c.is_claude_report
                    ? 'border-l-4 border-l-blue-400 bg-blue-50/50'
                    : 'border-l-2 border-l-gray-200'
                return (
                  <div key={c.id} className={`pl-3 py-2 ${accent} rounded`}>
                    <div className="flex items-center gap-2 text-[11px] mb-1">
                      {c.is_admin_directive && <Zap className="w-3 h-3 text-purple-500" />}
                      {c.is_claude_report && <Bot className="w-3 h-3 text-blue-500" />}
                      <span className="font-semibold text-text-primary">
                        {c.author?.name || (c.author_type === 'claude' ? 'Claude' : '익명')}
                      </span>
                      <span className="text-text-tertiary">{formatDateTime(c.created_at)}</span>
                      {c.is_admin_directive && (
                        <Badge className="bg-purple-100 text-purple-700 text-[10px]">⚡ 지시사항</Badge>
                      )}
                      {c.is_claude_report && (
                        <Badge className="bg-blue-100 text-blue-700 text-[10px]">🤖 Claude 작업</Badge>
                      )}
                    </div>
                    <p className="text-sm text-text-primary whitespace-pre-wrap">{c.comment}</p>
                  </div>
                )
              })}
              {(!item.comments || item.comments.length === 0) && (
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
          {item.resolution_summary && (
            <div className="card p-4 bg-green-50/50 border-green-200">
              <div className="flex items-center gap-2 mb-2">
                <CheckCircle2 className="w-4 h-4 text-green-600" />
                <span className="text-xs font-semibold text-green-800">해결 내역</span>
              </div>
              <p className="text-sm text-text-primary whitespace-pre-wrap mb-2">{item.resolution_summary}</p>
              {item.pr_urls && item.pr_urls.length > 0 && (
                <div className="text-xs text-text-secondary">
                  PR: {item.pr_urls.map((url, i) => (
                    <a key={i} href={url} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline mr-2">#{url.split('/').pop()}</a>
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
                value={item.status || 'submitted'}
                onChange={e => changeStatus(e.target.value as FeedbackStatus)}
                options={Object.entries(STATUS_LABELS).map(([v, l]) => ({ value: v, label: l }))}
              />
            ) : (
              <Badge className={statusColor}>{statusLabel}</Badge>
            )}
          </div>

          <div className="card p-4 space-y-2 text-xs">
            <div className="flex items-center gap-2 text-text-tertiary">
              <Clock className="w-3 h-3" /> 등록 {formatDateTime(item.created_at)}
            </div>
            {item.planned_at && (
              <div className="flex items-center gap-2 text-purple-600">
                <Clock className="w-3 h-3" /> 계획 {formatDateTime(item.planned_at)}
              </div>
            )}
            {item.started_at && (
              <div className="flex items-center gap-2 text-amber-600">
                <Clock className="w-3 h-3" /> 시작 {formatDateTime(item.started_at)}
              </div>
            )}
            {item.completed_at && (
              <div className="flex items-center gap-2 text-green-600">
                <CheckCircle2 className="w-3 h-3" /> 완료 {formatDateTime(item.completed_at)}
              </div>
            )}
            {item.target_page && (
              <div className="pt-2 border-t border-border-light">
                <span className="text-text-tertiary">관련 페이지:</span>{' '}
                <Link href={item.target_page} className="text-blue-600 hover:underline">{item.target_page}</Link>
              </div>
            )}
            {item.created_by_user && (
              <div>
                <span className="text-text-tertiary">등록자:</span> {item.created_by_user.name}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
