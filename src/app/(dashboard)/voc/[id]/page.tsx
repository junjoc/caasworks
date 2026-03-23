'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/hooks/useAuth'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Select } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { PageLoading } from '@/components/ui/loading'
import {
  VOC_CATEGORY_LABELS,
  VOC_PRIORITY_LABELS,
  VOC_PRIORITY_COLORS,
  VOC_STATUS_LABELS,
  formatDate,
  formatDateTime,
} from '@/lib/utils'
import type { VocTicket, VocResponse, User } from '@/types/database'
import { toast } from 'sonner'
import { ArrowLeft, Send, Clock, User as UserIcon } from 'lucide-react'

const STATUS_OPTIONS = Object.entries(VOC_STATUS_LABELS).map(([v, l]) => ({ value: v, label: l }))

export default function VocDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { user } = useAuth()
  const supabase = createClient()

  const [ticket, setTicket] = useState<VocTicket | null>(null)
  const [responses, setResponses] = useState<VocResponse[]>([])
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [newResponse, setNewResponse] = useState('')
  const [sending, setSending] = useState(false)

  useEffect(() => {
    fetchAll()
  }, [id])

  async function fetchAll() {
    const [ticketRes, respRes, usersRes] = await Promise.all([
      supabase
        .from('voc_tickets')
        .select('*, customer:customers(company_name), assigned_user:users!voc_tickets_assigned_to_fkey(name)')
        .eq('id', id)
        .single(),
      supabase
        .from('voc_responses')
        .select('*, response_by_user:users!voc_responses_response_by_fkey(name)')
        .eq('ticket_id', id)
        .order('created_at', { ascending: true }),
      supabase.from('users').select('*').eq('is_active', true),
    ])

    setTicket(ticketRes.data)
    setResponses(respRes.data || [])
    setUsers(usersRes.data || [])
    setLoading(false)
  }

  const changeStatus = async (newStatus: string) => {
    const updates: Record<string, unknown> = { status: newStatus }
    if (newStatus === 'resolved') updates.resolved_at = new Date().toISOString()
    if (newStatus === 'closed') updates.closed_at = new Date().toISOString()

    await supabase.from('voc_tickets').update(updates).eq('id', id)
    toast.success(`상태가 "${VOC_STATUS_LABELS[newStatus]}"로 변경되었습니다.`)
    fetchAll()
  }

  const changeAssigned = async (userId: string) => {
    await supabase.from('voc_tickets').update({ assigned_to: userId || null }).eq('id', id)
    toast.success('담당자가 변경되었습니다.')
    fetchAll()
  }

  const addResponse = async () => {
    if (!newResponse.trim() || !user) return
    setSending(true)

    await supabase.from('voc_responses').insert({
      ticket_id: id,
      response_by: user.id,
      content: newResponse.trim(),
      response_type: 'note',
    })

    setNewResponse('')
    setSending(false)
    toast.success('대응 내역이 추가되었습니다.')
    fetchAll()
  }

  if (loading) return <PageLoading />
  if (!ticket) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500">티켓을 찾을 수 없습니다.</p>
        <Link href="/voc"><Button variant="secondary" className="mt-4">목록으로</Button></Link>
      </div>
    )
  }

  return (
    <div>
      <div className="page-header">
        <div className="flex items-center gap-3">
          <Link href="/voc" className="text-gray-400 hover:text-gray-600">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <h1 className="page-title">#{ticket.ticket_number} {ticket.title}</h1>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          {/* 티켓 내용 */}
          <div className="card p-6">
            <dl className="grid grid-cols-2 gap-4 mb-4">
              <div>
                <dt className="text-sm text-gray-500">고객사</dt>
                <dd className="text-sm font-medium">{ticket.customer?.company_name}</dd>
              </div>
              <div>
                <dt className="text-sm text-gray-500">문의자</dt>
                <dd className="text-sm font-medium">{ticket.reported_by || '-'}</dd>
              </div>
              <div>
                <dt className="text-sm text-gray-500">분류</dt>
                <dd className="text-sm">{VOC_CATEGORY_LABELS[ticket.category]}</dd>
              </div>
              <div>
                <dt className="text-sm text-gray-500">등록일</dt>
                <dd className="text-sm">{formatDateTime(ticket.created_at)}</dd>
              </div>
            </dl>
            {ticket.description && (
              <div className="mt-4 pt-4 border-t border-gray-100">
                <p className="text-sm text-gray-700 whitespace-pre-wrap">{ticket.description}</p>
              </div>
            )}
          </div>

          {/* 대응 타임라인 */}
          <div className="card p-6">
            <h2 className="text-lg font-semibold mb-4">대응 이력</h2>
            <div className="space-y-4 mb-6">
              {responses.map((r) => (
                <div key={r.id} className="flex gap-3">
                  <div className="w-8 h-8 rounded-full bg-primary-100 flex items-center justify-center shrink-0">
                    <UserIcon className="w-4 h-4 text-primary-600" />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sm font-medium">{r.response_by_user?.name}</span>
                      <span className="text-xs text-gray-400">{formatDateTime(r.created_at)}</span>
                    </div>
                    <p className="text-sm text-gray-700 whitespace-pre-wrap bg-gray-50 rounded-lg p-3">
                      {r.content}
                    </p>
                  </div>
                </div>
              ))}
              {responses.length === 0 && (
                <p className="text-sm text-gray-400 text-center py-4">대응 이력이 없습니다.</p>
              )}
            </div>

            {/* 대응 입력 */}
            <div className="border-t border-gray-200 pt-4">
              <Textarea
                value={newResponse}
                onChange={(e) => setNewResponse(e.target.value)}
                placeholder="대응 내용을 입력하세요..."
                rows={3}
              />
              <div className="flex justify-end mt-2">
                <Button onClick={addResponse} loading={sending} size="sm" disabled={!newResponse.trim()}>
                  <Send className="w-4 h-4 mr-1" /> 등록
                </Button>
              </div>
            </div>
          </div>
        </div>

        {/* 오른쪽 패널 */}
        <div className="space-y-6">
          <div className="card p-6">
            <h3 className="text-sm font-semibold text-gray-700 mb-3">상태</h3>
            <Select
              value={ticket.status}
              onChange={(e) => changeStatus(e.target.value)}
              options={STATUS_OPTIONS}
            />
          </div>

          <div className="card p-6">
            <h3 className="text-sm font-semibold text-gray-700 mb-3">우선순위</h3>
            <Badge className={VOC_PRIORITY_COLORS[ticket.priority]}>
              {VOC_PRIORITY_LABELS[ticket.priority]}
            </Badge>
          </div>

          <div className="card p-6">
            <h3 className="text-sm font-semibold text-gray-700 mb-3">담당자</h3>
            <Select
              value={ticket.assigned_to || ''}
              onChange={(e) => changeAssigned(e.target.value)}
              options={users.map((u) => ({ value: u.id, label: u.name }))}
              placeholder="담당자 선택"
            />
          </div>

          {ticket.resolved_at && (
            <div className="card p-6">
              <h3 className="text-sm font-semibold text-gray-700 mb-2">해결일</h3>
              <p className="text-sm">{formatDateTime(ticket.resolved_at)}</p>
            </div>
          )}

          {ticket.resolution_note && (
            <div className="card p-6">
              <h3 className="text-sm font-semibold text-gray-700 mb-2">처리 결과</h3>
              <p className="text-sm text-gray-700">{ticket.resolution_note}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
