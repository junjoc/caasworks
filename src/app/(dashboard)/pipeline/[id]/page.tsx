'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Select } from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { PageLoading } from '@/components/ui/loading'
import { useAuth } from '@/hooks/useAuth'
import { STAGE_COLORS, PRIORITY_COLORS, INDUSTRY_OPTIONS, CHANNEL_OPTIONS, formatDate, formatDateTime } from '@/lib/utils'
import type { PipelineLead, PipelineHistory, User } from '@/types/database'
import { toast } from 'sonner'
import { ArrowLeft, Edit2, Save, X, Clock, AlertCircle } from 'lucide-react'

const STAGES = ['신규리드', '컨택', '미팅', '제안', '계약', '도입완료']
const PRIORITY_OPTIONS = [
  { value: '긴급', label: '긴급' },
  { value: '높음', label: '높음' },
  { value: '중간', label: '중간' },
  { value: '낮음', label: '낮음' },
]

export default function LeadDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const { user } = useAuth()
  const supabase = createClient()

  const [lead, setLead] = useState<PipelineLead | null>(null)
  const [history, setHistory] = useState<PipelineHistory[]>([])
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(false)
  const [editForm, setEditForm] = useState<Partial<PipelineLead>>({})
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    fetchAll()
  }, [id])

  async function fetchAll() {
    const [leadRes, historyRes, usersRes] = await Promise.all([
      supabase
        .from('pipeline_leads')
        .select('*, assigned_user:users!pipeline_leads_assigned_to_fkey(id, name)')
        .eq('id', id)
        .single(),
      supabase
        .from('pipeline_history')
        .select('*, changed_by_user:users!pipeline_history_changed_by_fkey(id, name)')
        .eq('lead_id', id)
        .order('changed_at', { ascending: false }),
      supabase.from('users').select('*').eq('is_active', true),
    ])

    setLead(leadRes.data)
    setHistory(historyRes.data || [])
    setUsers(usersRes.data || [])
    setLoading(false)
  }

  const startEdit = () => {
    if (!lead) return
    setEditForm({
      company_name: lead.company_name,
      contact_person: lead.contact_person,
      contact_phone: lead.contact_phone,
      contact_email: lead.contact_email,
      contact_position: lead.contact_position,
      industry: lead.industry,
      core_need: lead.core_need,
      inquiry_source: lead.inquiry_source,
      inquiry_channel: lead.inquiry_channel,
      inquiry_content: lead.inquiry_content,
      inquiry_date: lead.inquiry_date,
      priority: lead.priority,
      next_action: lead.next_action,
      next_action_date: lead.next_action_date,
      notes: lead.notes,
    })
    setEditing(true)
  }

  const saveEdit = async () => {
    setSaving(true)
    const { error } = await supabase
      .from('pipeline_leads')
      .update(editForm)
      .eq('id', id)

    if (error) {
      toast.error('수정에 실패했습니다.')
    } else {
      toast.success('수정되었습니다.')
      setEditing(false)
      fetchAll()
    }
    setSaving(false)
  }

  const changeStage = async (newStage: string) => {
    if (!lead || !user) return
    const oldStage = lead.stage

    await supabase.from('pipeline_history').insert({
      lead_id: id,
      field_changed: 'stage',
      old_value: oldStage,
      new_value: newStage,
      changed_by: user.id,
    })

    const updates: Record<string, unknown> = { stage: newStage }
    if (newStage === '계약' || newStage === '도입완료') {
      updates.converted_at = new Date().toISOString()
    }

    await supabase.from('pipeline_leads').update(updates).eq('id', id)
    toast.success(`단계가 "${newStage}"로 변경되었습니다.`)
    fetchAll()
  }

  const changeAssigned = async (userId: string) => {
    if (!lead || !user) return
    await supabase.from('pipeline_history').insert({
      lead_id: id,
      field_changed: 'assigned_to',
      old_value: lead.assigned_to || '(없음)',
      new_value: userId || '(없음)',
      changed_by: user.id,
    })
    await supabase
      .from('pipeline_leads')
      .update({ assigned_to: userId || null })
      .eq('id', id)
    toast.success('담당자가 변경되었습니다.')
    fetchAll()
  }

  if (loading) return <PageLoading />
  if (!lead) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500">리드를 찾을 수 없습니다.</p>
        <Link href="/pipeline/list">
          <Button variant="secondary" className="mt-4">목록으로</Button>
        </Link>
      </div>
    )
  }

  const isOverdue = lead.next_action_date && new Date(lead.next_action_date) < new Date(new Date().toDateString())

  return (
    <div>
      <div className="page-header">
        <div className="flex items-center gap-3">
          <Link href="/pipeline/list" className="text-gray-400 hover:text-gray-600">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <h1 className="page-title">{lead.company_name}</h1>
          <Badge className={STAGE_COLORS[lead.stage]}>{lead.stage}</Badge>
          {lead.priority && (
            <Badge className={`${PRIORITY_COLORS[lead.priority]} border`}>{lead.priority}</Badge>
          )}
        </div>
        {!editing && (
          <Button variant="secondary" size="sm" onClick={startEdit}>
            <Edit2 className="w-4 h-4 mr-1" /> 수정
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* 기본 정보 */}
        <div className="lg:col-span-2 space-y-6">
          {/* 액션 알림 */}
          {lead.next_action && (
            <div className={`rounded-lg p-4 flex items-start gap-3 ${
              isOverdue ? 'bg-red-50 border border-red-200' : 'bg-blue-50 border border-blue-200'
            }`}>
              {isOverdue ? (
                <AlertCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
              ) : (
                <Clock className="w-5 h-5 text-blue-500 shrink-0 mt-0.5" />
              )}
              <div>
                <p className={`text-sm font-medium ${isOverdue ? 'text-red-700' : 'text-blue-700'}`}>
                  다음 액션: {lead.next_action}
                </p>
                {lead.next_action_date && (
                  <p className={`text-xs mt-0.5 ${isOverdue ? 'text-red-500' : 'text-blue-500'}`}>
                    {isOverdue ? '기한 초과: ' : '예정일: '}{formatDate(lead.next_action_date)}
                  </p>
                )}
              </div>
            </div>
          )}

          <div className="card p-6">
            <h2 className="text-lg font-semibold mb-4">기본 정보</h2>
            {editing ? (
              <div className="space-y-4">
                {/* 관리 섹션 */}
                <div className="pb-4 border-b">
                  <h3 className="text-xs font-semibold text-gray-500 uppercase mb-3">관리</h3>
                  <div className="grid grid-cols-3 gap-4">
                    <Select
                      label="우선순위"
                      value={editForm.priority || '중간'}
                      onChange={(e) => setEditForm({ ...editForm, priority: e.target.value as any })}
                      options={PRIORITY_OPTIONS}
                    />
                    <Input
                      label="다음 액션"
                      value={editForm.next_action || ''}
                      onChange={(e) => setEditForm({ ...editForm, next_action: e.target.value })}
                      placeholder="예: 견적서 발송"
                    />
                    <Input
                      label="액션 예정일"
                      type="date"
                      value={editForm.next_action_date || ''}
                      onChange={(e) => setEditForm({ ...editForm, next_action_date: e.target.value })}
                    />
                  </div>
                </div>

                {/* 유입 정보 */}
                <div className="pb-4 border-b">
                  <h3 className="text-xs font-semibold text-gray-500 uppercase mb-3">유입 정보</h3>
                  <div className="grid grid-cols-3 gap-4">
                    <Input
                      label="유입일"
                      type="date"
                      value={editForm.inquiry_date || ''}
                      onChange={(e) => setEditForm({ ...editForm, inquiry_date: e.target.value })}
                    />
                    <Select
                      label="유입채널"
                      value={editForm.inquiry_channel || ''}
                      onChange={(e) => setEditForm({ ...editForm, inquiry_channel: e.target.value })}
                      options={CHANNEL_OPTIONS.map(c => ({ value: c, label: c }))}
                      placeholder="채널 선택"
                    />
                    <Input
                      label="유입경로"
                      value={editForm.inquiry_source || ''}
                      onChange={(e) => setEditForm({ ...editForm, inquiry_source: e.target.value })}
                    />
                  </div>
                </div>

                {/* 고객 정보 */}
                <Input
                  label="회사명"
                  value={editForm.company_name || ''}
                  onChange={(e) => setEditForm({ ...editForm, company_name: e.target.value })}
                />
                <div className="grid grid-cols-2 gap-4">
                  <Select
                    label="사업분류"
                    value={editForm.industry || ''}
                    onChange={(e) => setEditForm({ ...editForm, industry: e.target.value })}
                    options={INDUSTRY_OPTIONS.map(i => ({ value: i, label: i }))}
                    placeholder="업종 선택"
                  />
                  <Input
                    label="핵심니즈"
                    value={editForm.core_need || ''}
                    onChange={(e) => setEditForm({ ...editForm, core_need: e.target.value })}
                  />
                </div>
                <div className="grid grid-cols-3 gap-4">
                  <Input
                    label="문의자"
                    value={editForm.contact_person || ''}
                    onChange={(e) => setEditForm({ ...editForm, contact_person: e.target.value })}
                  />
                  <Input
                    label="직급"
                    value={editForm.contact_position || ''}
                    onChange={(e) => setEditForm({ ...editForm, contact_position: e.target.value })}
                  />
                  <Input
                    label="연락처"
                    value={editForm.contact_phone || ''}
                    onChange={(e) => setEditForm({ ...editForm, contact_phone: e.target.value })}
                  />
                </div>
                <Input
                  label="이메일"
                  value={editForm.contact_email || ''}
                  onChange={(e) => setEditForm({ ...editForm, contact_email: e.target.value })}
                />
                <Textarea
                  label="문의내용"
                  value={editForm.inquiry_content || ''}
                  onChange={(e) => setEditForm({ ...editForm, inquiry_content: e.target.value })}
                />
                <Textarea
                  label="메모"
                  value={editForm.notes || ''}
                  onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })}
                />
                <div className="flex gap-2">
                  <Button onClick={saveEdit} loading={saving} size="sm">
                    <Save className="w-4 h-4 mr-1" /> 저장
                  </Button>
                  <Button variant="secondary" size="sm" onClick={() => setEditing(false)}>
                    <X className="w-4 h-4 mr-1" /> 취소
                  </Button>
                </div>
              </div>
            ) : (
              <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {[
                  ['우선순위', lead.priority],
                  ['사업분류', lead.industry],
                  ['문의자', lead.contact_person ? `${lead.contact_person}${lead.contact_position ? ' (' + lead.contact_position + ')' : ''}` : null],
                  ['연락처', lead.contact_phone],
                  ['이메일', lead.contact_email],
                  ['핵심니즈', lead.core_need],
                  ['유입채널', lead.inquiry_channel],
                  ['유입경로', lead.inquiry_source],
                  ['유입일', lead.inquiry_date ? formatDate(lead.inquiry_date) : null],
                  ['등록일', formatDate(lead.created_at)],
                ].map(([label, value]) => (
                  <div key={label as string}>
                    <dt className="text-sm text-gray-500">{label}</dt>
                    <dd className="text-sm font-medium text-gray-900 mt-0.5">
                      {label === '우선순위' && value ? (
                        <Badge className={`${PRIORITY_COLORS[value as string] || ''} border`}>{value}</Badge>
                      ) : (
                        (value as string) || '-'
                      )}
                    </dd>
                  </div>
                ))}
                {lead.inquiry_content && (
                  <div className="sm:col-span-2">
                    <dt className="text-sm text-gray-500">문의내용</dt>
                    <dd className="text-sm text-gray-900 mt-0.5 whitespace-pre-wrap">
                      {lead.inquiry_content}
                    </dd>
                  </div>
                )}
                {lead.notes && (
                  <div className="sm:col-span-2">
                    <dt className="text-sm text-gray-500">메모</dt>
                    <dd className="text-sm text-gray-900 mt-0.5 whitespace-pre-wrap">
                      {lead.notes}
                    </dd>
                  </div>
                )}
              </dl>
            )}
          </div>

          {/* 변경 이력 */}
          <div className="card p-6">
            <h2 className="text-lg font-semibold mb-4">변경 이력</h2>
            {history.length === 0 ? (
              <p className="text-sm text-gray-400">변경 이력이 없습니다.</p>
            ) : (
              <div className="space-y-3">
                {history.map((h) => (
                  <div key={h.id} className="flex items-start gap-3 text-sm">
                    <Clock className="w-4 h-4 text-gray-400 mt-0.5 shrink-0" />
                    <div>
                      <span className="font-medium">{h.changed_by_user?.name || '시스템'}</span>
                      {' '}
                      <span className="text-gray-500">
                        {h.field_changed === 'stage' ? '단계를' : '담당자를'}
                      </span>
                      {' '}
                      <span className="text-red-500 line-through">{h.old_value}</span>
                      {' → '}
                      <span className="text-green-600 font-medium">{h.new_value}</span>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {formatDateTime(h.changed_at)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* 오른쪽 패널 */}
        <div className="space-y-6">
          {/* 단계 변경 */}
          <div className="card p-6">
            <h3 className="text-sm font-semibold text-gray-700 mb-3">단계 변경</h3>
            <div className="space-y-2">
              {STAGES.map((stage) => (
                <button
                  key={stage}
                  onClick={() => changeStage(stage)}
                  disabled={lead.stage === stage}
                  className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
                    lead.stage === stage
                      ? 'bg-primary-50 text-primary-700 font-medium border border-primary-200'
                      : 'hover:bg-gray-50 text-gray-600'
                  }`}
                >
                  {stage}
                </button>
              ))}
            </div>
          </div>

          {/* 담당자 */}
          <div className="card p-6">
            <h3 className="text-sm font-semibold text-gray-700 mb-3">담당자</h3>
            <Select
              value={lead.assigned_to || ''}
              onChange={(e) => changeAssigned(e.target.value)}
              options={users.map((u) => ({ value: u.id, label: u.name }))}
              placeholder="담당자 선택"
            />
          </div>

          {/* 고객사 ID */}
          {lead.customer_code && (
            <div className="card p-6">
              <h3 className="text-sm font-semibold text-gray-700 mb-2">고객사 ID</h3>
              <p className="text-sm font-mono text-gray-900">{lead.customer_code}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
