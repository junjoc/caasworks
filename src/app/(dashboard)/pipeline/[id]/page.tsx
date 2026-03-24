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
import {
  STAGE_COLORS, PRIORITY_COLORS, INDUSTRY_OPTIONS, CHANNEL_OPTIONS,
  ACTIVITY_TYPE_LABELS, ACTIVITY_TYPE_ICONS, ACTIVITY_TYPE_COLORS, ACTIVITY_TYPE_OPTIONS,
  formatDate, formatDateTime
} from '@/lib/utils'
import type { PipelineLead, PipelineHistory, User } from '@/types/database'
import { toast } from 'sonner'
import { ArrowLeft, Edit2, Save, X, Clock, AlertCircle, Plus, Send, MessageSquare, Link2, Building2, ExternalLink, Trash2, Pencil } from 'lucide-react'

const STAGES = ['신규리드', '컨택', '미팅', '제안', '계약', '도입완료']
const PRIORITY_OPTIONS = [
  { value: '긴급', label: '긴급' },
  { value: '높음', label: '높음' },
  { value: '중간', label: '중간' },
  { value: '낮음', label: '낮음' },
]

interface ActivityLog {
  id: string
  activity_type: string
  title: string | null
  description: string | null
  performed_by: string
  performed_at: string
  performer?: { id: string; name: string }
}

// Unified timeline item
interface TimelineItem {
  id: string
  type: 'stage_change' | 'assignment' | 'activity'
  timestamp: string
  // stage change
  field_changed?: string
  old_value?: string
  new_value?: string
  changed_by_name?: string
  // activity
  activity_type?: string
  title?: string
  description?: string
  performer_name?: string
  performed_by?: string
}

export default function LeadDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const { user } = useAuth()
  const supabase = createClient()

  const [lead, setLead] = useState<PipelineLead | null>(null)
  const [timeline, setTimeline] = useState<TimelineItem[]>([])
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(false)
  const [editForm, setEditForm] = useState<Partial<PipelineLead>>({})
  const [saving, setSaving] = useState(false)

  // Customer matching
  const [customers, setCustomers] = useState<any[]>([])
  const [customerSearch, setCustomerSearch] = useState('')
  const [linkedCustomer, setLinkedCustomer] = useState<any>(null)

  // Activity form
  const [showActivityForm, setShowActivityForm] = useState(false)
  const [activityForm, setActivityForm] = useState({
    activity_type: 'NOTE',
    title: '',
    description: '',
  })
  const [submittingActivity, setSubmittingActivity] = useState(false)

  // Activity edit
  const [editingActivityId, setEditingActivityId] = useState<string | null>(null)
  const [editActivityForm, setEditActivityForm] = useState({
    activity_type: '',
    title: '',
    description: '',
  })
  const [savingActivity, setSavingActivity] = useState(false)

  useEffect(() => {
    fetchAll()
  }, [id])

  async function fetchAll() {
    const [leadRes, historyRes, activitiesRes, usersRes, customersRes] = await Promise.all([
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
      supabase
        .from('activity_logs')
        .select('*, performer:users!activity_logs_performed_by_fkey(id, name)')
        .eq('lead_id', id)
        .order('performed_at', { ascending: false }),
      supabase.from('users').select('*').eq('is_active', true),
      supabase.from('customers').select('id, company_name, company_type, customer_code').order('company_name'),
    ])

    setLead(leadRes.data)
    setUsers(usersRes.data || [])
    setCustomers(customersRes.data || [])

    // Load linked customer if exists
    if (leadRes.data?.customer_id) {
      const linked = (customersRes.data || []).find((c: any) => c.id === leadRes.data.customer_id)
      setLinkedCustomer(linked || null)
    } else {
      setLinkedCustomer(null)
    }

    // Build unified timeline
    const items: TimelineItem[] = []

    // Add pipeline history items
    ;(historyRes.data || []).forEach((h: any) => {
      items.push({
        id: h.id,
        type: h.field_changed === 'stage' ? 'stage_change' : 'assignment',
        timestamp: h.changed_at,
        field_changed: h.field_changed,
        old_value: h.old_value,
        new_value: h.new_value,
        changed_by_name: h.changed_by_user?.name || '시스템',
      })
    })

    // Add activity log items
    ;(activitiesRes.data || []).forEach((a: any) => {
      items.push({
        id: a.id,
        type: 'activity',
        timestamp: a.performed_at,
        activity_type: a.activity_type,
        title: a.title,
        description: a.description,
        performer_name: a.performer?.name || '시스템',
        performed_by: a.performed_by,
      })
    })

    // Sort by timestamp descending (newest first)
    items.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
    setTimeline(items)
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
    const { error } = await supabase.from('pipeline_leads').update(editForm).eq('id', id)
    if (error) toast.error('수정에 실패했습니다.')
    else { toast.success('수정되었습니다.'); setEditing(false); fetchAll() }
    setSaving(false)
  }

  const changeStage = async (newStage: string) => {
    if (!lead || !user) return
    await supabase.from('pipeline_history').insert({
      lead_id: id, field_changed: 'stage',
      old_value: lead.stage, new_value: newStage, changed_by: user.id,
    })
    const updates: Record<string, unknown> = { stage: newStage }
    if (newStage === '계약' || newStage === '도입완료') updates.converted_at = new Date().toISOString()
    await supabase.from('pipeline_leads').update(updates).eq('id', id)
    toast.success(`단계가 "${newStage}"로 변경되었습니다.`)
    fetchAll()
  }

  const changeAssigned = async (userId: string) => {
    if (!lead || !user) return
    const oldName = users.find(u => u.id === lead.assigned_to)?.name || '(없음)'
    const newName = users.find(u => u.id === userId)?.name || '(없음)'
    await supabase.from('pipeline_history').insert({
      lead_id: id, field_changed: 'assigned_to',
      old_value: oldName, new_value: newName, changed_by: user.id,
    })
    await supabase.from('pipeline_leads').update({ assigned_to: userId || null }).eq('id', id)
    toast.success('담당자가 변경되었습니다.')
    fetchAll()
  }

  const linkCustomer = async (customerId: string | null) => {
    const { error } = await supabase
      .from('pipeline_leads')
      .update({ customer_id: customerId })
      .eq('id', id)
    if (error) {
      toast.error('고객사 연결에 실패했습니다.')
    } else {
      toast.success(customerId ? '고객사가 연결되었습니다.' : '고객사 연결이 해제되었습니다.')
      fetchAll()
    }
  }

  const filteredCustomers = customers.filter(c =>
    c.company_name.toLowerCase().includes(customerSearch.toLowerCase()) ||
    (c.customer_code || '').includes(customerSearch)
  ).slice(0, 10)

  const submitActivity = async () => {
    if (!user || !activityForm.title.trim()) {
      toast.error('제목을 입력해주세요.')
      return
    }
    setSubmittingActivity(true)
    const { error } = await supabase.from('activity_logs').insert({
      lead_id: id,
      customer_id: lead?.customer_id || null,
      activity_type: activityForm.activity_type,
      title: activityForm.title,
      description: activityForm.description || null,
      performed_by: user.id,
    })
    if (error) {
      toast.error('활동 기록에 실패했습니다.')
    } else {
      toast.success('활동이 기록되었습니다.')
      setActivityForm({ activity_type: 'NOTE', title: '', description: '' })
      setShowActivityForm(false)
      fetchAll()
    }
    setSubmittingActivity(false)
  }

  // Activity edit/delete handlers
  const startEditActivity = (item: TimelineItem) => {
    setEditingActivityId(item.id)
    setEditActivityForm({
      activity_type: item.activity_type || 'NOTE',
      title: item.title || '',
      description: item.description || '',
    })
  }

  const saveActivityEdit = async () => {
    if (!editingActivityId || !editActivityForm.title.trim()) {
      toast.error('제목을 입력해주세요.')
      return
    }
    setSavingActivity(true)
    const { error } = await supabase
      .from('activity_logs')
      .update({
        activity_type: editActivityForm.activity_type,
        title: editActivityForm.title,
        description: editActivityForm.description || null,
      })
      .eq('id', editingActivityId)

    if (error) {
      toast.error('활동 수정에 실패했습니다.')
    } else {
      toast.success('활동이 수정되었습니다.')
      setEditingActivityId(null)
      fetchAll()
    }
    setSavingActivity(false)
  }

  const deleteActivity = async (activityId: string) => {
    const confirmed = window.confirm('이 활동 기록을 삭제하시겠습니까?')
    if (!confirmed) return

    const { error } = await supabase
      .from('activity_logs')
      .delete()
      .eq('id', activityId)

    if (error) {
      toast.error('활동 삭제에 실패했습니다.')
    } else {
      toast.success('활동이 삭제되었습니다.')
      fetchAll()
    }
  }

  if (loading) return <PageLoading />
  if (!lead) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500">리드를 찾을 수 없습니다.</p>
        <Link href="/pipeline/list"><Button variant="secondary" className="mt-4">목록으로</Button></Link>
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
          {lead.priority && <Badge className={`${PRIORITY_COLORS[lead.priority]} border`}>{lead.priority}</Badge>}
        </div>
        {!editing && (
          <Button variant="secondary" size="sm" onClick={startEdit}>
            <Edit2 className="w-4 h-4 mr-1" /> 수정
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          {/* 액션 알림 */}
          {lead.next_action && (
            <div className={`rounded-lg p-4 flex items-start gap-3 ${isOverdue ? 'bg-red-50 border border-red-200' : 'bg-blue-50 border border-blue-200'}`}>
              {isOverdue ? <AlertCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" /> : <Clock className="w-5 h-5 text-blue-500 shrink-0 mt-0.5" />}
              <div>
                <p className={`text-sm font-medium ${isOverdue ? 'text-red-700' : 'text-blue-700'}`}>다음 액션: {lead.next_action}</p>
                {lead.next_action_date && <p className={`text-xs mt-0.5 ${isOverdue ? 'text-red-500' : 'text-blue-500'}`}>{isOverdue ? '기한 초과: ' : '예정일: '}{formatDate(lead.next_action_date)}</p>}
              </div>
            </div>
          )}

          {/* 기본 정보 */}
          <div className="card p-6">
            <h2 className="text-lg font-semibold mb-4">기본 정보</h2>
            {editing ? (
              <div className="space-y-4">
                <div className="pb-4 border-b">
                  <h3 className="text-xs font-semibold text-gray-500 uppercase mb-3">관리</h3>
                  <div className="grid grid-cols-3 gap-4">
                    <Select label="우선순위" value={editForm.priority || '중간'} onChange={(e) => setEditForm({ ...editForm, priority: e.target.value as any })} options={PRIORITY_OPTIONS} />
                    <Input label="다음 액션" value={editForm.next_action || ''} onChange={(e) => setEditForm({ ...editForm, next_action: e.target.value })} placeholder="예: 견적서 발송" />
                    <Input label="액션 예정일" type="date" value={editForm.next_action_date || ''} onChange={(e) => setEditForm({ ...editForm, next_action_date: e.target.value })} />
                  </div>
                </div>
                <div className="pb-4 border-b">
                  <h3 className="text-xs font-semibold text-gray-500 uppercase mb-3">유입 정보</h3>
                  <div className="grid grid-cols-3 gap-4">
                    <Input label="유입일" type="date" value={editForm.inquiry_date || ''} onChange={(e) => setEditForm({ ...editForm, inquiry_date: e.target.value })} />
                    <Select label="유입채널" value={editForm.inquiry_channel || ''} onChange={(e) => setEditForm({ ...editForm, inquiry_channel: e.target.value })} options={CHANNEL_OPTIONS.map(c => ({ value: c, label: c }))} placeholder="채널 선택" />
                    <Input label="유입경로" value={editForm.inquiry_source || ''} onChange={(e) => setEditForm({ ...editForm, inquiry_source: e.target.value })} />
                  </div>
                </div>
                <Input label="회사명" value={editForm.company_name || ''} onChange={(e) => setEditForm({ ...editForm, company_name: e.target.value })} />
                <div className="grid grid-cols-2 gap-4">
                  <Select label="사업분류" value={editForm.industry || ''} onChange={(e) => setEditForm({ ...editForm, industry: e.target.value })} options={INDUSTRY_OPTIONS.map(i => ({ value: i, label: i }))} placeholder="업종 선택" />
                  <Input label="핵심니즈" value={editForm.core_need || ''} onChange={(e) => setEditForm({ ...editForm, core_need: e.target.value })} />
                </div>
                <div className="grid grid-cols-3 gap-4">
                  <Input label="문의자" value={editForm.contact_person || ''} onChange={(e) => setEditForm({ ...editForm, contact_person: e.target.value })} />
                  <Input label="직급" value={editForm.contact_position || ''} onChange={(e) => setEditForm({ ...editForm, contact_position: e.target.value })} />
                  <Input label="연락처" value={editForm.contact_phone || ''} onChange={(e) => setEditForm({ ...editForm, contact_phone: e.target.value })} />
                </div>
                <Input label="이메일" value={editForm.contact_email || ''} onChange={(e) => setEditForm({ ...editForm, contact_email: e.target.value })} />
                <Textarea label="문의내용" value={editForm.inquiry_content || ''} onChange={(e) => setEditForm({ ...editForm, inquiry_content: e.target.value })} />
                <Textarea label="메모" value={editForm.notes || ''} onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })} />
                <div className="flex gap-2">
                  <Button onClick={saveEdit} loading={saving} size="sm"><Save className="w-4 h-4 mr-1" /> 저장</Button>
                  <Button variant="secondary" size="sm" onClick={() => setEditing(false)}><X className="w-4 h-4 mr-1" /> 취소</Button>
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
                      {label === '우선순위' && value ? <Badge className={`${PRIORITY_COLORS[value as string] || ''} border`}>{value}</Badge> : (value as string) || '-'}
                    </dd>
                  </div>
                ))}
                {lead.inquiry_content && (
                  <div className="sm:col-span-2">
                    <dt className="text-sm text-gray-500">문의내용</dt>
                    <dd className="text-sm text-gray-900 mt-0.5 whitespace-pre-wrap">{lead.inquiry_content}</dd>
                  </div>
                )}
                {lead.notes && (
                  <div className="sm:col-span-2">
                    <dt className="text-sm text-gray-500">메모</dt>
                    <dd className="text-sm text-gray-900 mt-0.5 whitespace-pre-wrap">{lead.notes}</dd>
                  </div>
                )}
              </dl>
            )}
          </div>

          {/* ====== 활동 타임라인 ====== */}
          <div className="card p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">활동 타임라인</h2>
              <Button size="sm" onClick={() => setShowActivityForm(!showActivityForm)}>
                <Plus className="w-4 h-4 mr-1" /> 활동 기록
              </Button>
            </div>

            {/* 활동 추가 폼 */}
            {showActivityForm && (
              <div className="mb-6 p-4 bg-gray-50 rounded-lg border space-y-3">
                <Select
                  label="활동 유형"
                  value={activityForm.activity_type}
                  onChange={(e) => setActivityForm({ ...activityForm, activity_type: e.target.value })}
                  options={ACTIVITY_TYPE_OPTIONS}
                />
                <Input
                  label="제목"
                  value={activityForm.title}
                  onChange={(e) => setActivityForm({ ...activityForm, title: e.target.value })}
                  placeholder="예: 견적서 발송 완료"
                  required
                />
                <Textarea
                  label="상세 내용"
                  value={activityForm.description}
                  onChange={(e) => setActivityForm({ ...activityForm, description: e.target.value })}
                  placeholder="상세 내용을 입력하세요 (선택)"
                />
                <div className="flex gap-2">
                  <Button size="sm" onClick={submitActivity} loading={submittingActivity}>
                    <Send className="w-3.5 h-3.5 mr-1" /> 기록
                  </Button>
                  <Button variant="secondary" size="sm" onClick={() => setShowActivityForm(false)}>취소</Button>
                </div>
              </div>
            )}

            {/* 타임라인 목록 */}
            {timeline.length === 0 ? (
              <p className="text-sm text-gray-400">활동 이력이 없습니다. "활동 기록" 버튼으로 첫 활동을 기록해보세요.</p>
            ) : (
              <div className="space-y-3">
                {timeline.map((item) => {
                  if (item.type === 'activity') {
                    const icon = ACTIVITY_TYPE_ICONS[item.activity_type || 'NOTE'] || '💬'
                    const color = ACTIVITY_TYPE_COLORS[item.activity_type || 'NOTE'] || ''
                    const label = ACTIVITY_TYPE_LABELS[item.activity_type || 'NOTE'] || item.activity_type
                    const isOwner = user && item.performed_by === user.id
                    const isEditing = editingActivityId === item.id

                    if (isEditing) {
                      return (
                        <div key={item.id} className="rounded-lg p-4 border bg-yellow-50 border-yellow-200 space-y-3">
                          <Select
                            label="활동 유형"
                            value={editActivityForm.activity_type}
                            onChange={(e) => setEditActivityForm({ ...editActivityForm, activity_type: e.target.value })}
                            options={ACTIVITY_TYPE_OPTIONS}
                          />
                          <Input
                            label="제목"
                            value={editActivityForm.title}
                            onChange={(e) => setEditActivityForm({ ...editActivityForm, title: e.target.value })}
                            required
                          />
                          <Textarea
                            label="상세 내용"
                            value={editActivityForm.description}
                            onChange={(e) => setEditActivityForm({ ...editActivityForm, description: e.target.value })}
                          />
                          <div className="flex gap-2">
                            <Button size="sm" onClick={saveActivityEdit} loading={savingActivity}>
                              <Save className="w-3.5 h-3.5 mr-1" /> 저장
                            </Button>
                            <Button variant="secondary" size="sm" onClick={() => setEditingActivityId(null)}>
                              취소
                            </Button>
                          </div>
                        </div>
                      )
                    }

                    return (
                      <div key={item.id} className={`rounded-lg p-3 border ${color} group`}>
                        <div className="flex items-start gap-2">
                          <span className="text-base mt-0.5">{icon}</span>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-medium opacity-70">{label}</span>
                              <span className="text-xs opacity-50">·</span>
                              <span className="text-xs opacity-50">{item.performer_name}</span>
                              {/* 수정/삭제 버튼 */}
                              {isOwner && (
                                <div className="ml-auto flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                  <button
                                    onClick={() => startEditActivity(item)}
                                    className="p-1 rounded hover:bg-black/5 text-gray-400 hover:text-gray-600"
                                    title="수정"
                                  >
                                    <Pencil className="w-3 h-3" />
                                  </button>
                                  <button
                                    onClick={() => deleteActivity(item.id)}
                                    className="p-1 rounded hover:bg-red-50 text-gray-400 hover:text-red-500"
                                    title="삭제"
                                  >
                                    <Trash2 className="w-3 h-3" />
                                  </button>
                                </div>
                              )}
                            </div>
                            <p className="text-sm font-medium mt-0.5">{item.title}</p>
                            {item.description && (
                              <p className="text-xs mt-1 opacity-70 whitespace-pre-wrap">{item.description}</p>
                            )}
                            <p className="text-xs opacity-40 mt-1">{formatDateTime(item.timestamp)}</p>
                          </div>
                        </div>
                      </div>
                    )
                  }

                  // Stage change or assignment
                  return (
                    <div key={item.id} className="flex items-start gap-3 text-sm px-3 py-2">
                      <Clock className="w-4 h-4 text-gray-300 mt-0.5 shrink-0" />
                      <div>
                        <span className="font-medium text-gray-600">{item.changed_by_name}</span>
                        {' '}
                        <span className="text-gray-400">
                          {item.field_changed === 'stage' ? '단계를' : '담당자를'}
                        </span>
                        {' '}
                        <span className="text-red-400 line-through text-xs">{item.old_value}</span>
                        {' → '}
                        <span className="text-green-600 font-medium text-xs">{item.new_value}</span>
                        <p className="text-xs text-gray-300 mt-0.5">{formatDateTime(item.timestamp)}</p>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>

        {/* 오른쪽 패널 */}
        <div className="space-y-6">
          <div className="card p-6">
            <h3 className="text-sm font-semibold text-gray-700 mb-3">단계 변경</h3>
            <div className="space-y-2">
              {STAGES.map((stage) => (
                <button key={stage} onClick={() => changeStage(stage)} disabled={lead.stage === stage}
                  className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
                    lead.stage === stage ? 'bg-primary-50 text-primary-700 font-medium border border-primary-200' : 'hover:bg-gray-50 text-gray-600'
                  }`}>{stage}</button>
              ))}
            </div>
          </div>

          <div className="card p-6">
            <h3 className="text-sm font-semibold text-gray-700 mb-3">담당자</h3>
            <Select value={lead.assigned_to || ''} onChange={(e) => changeAssigned(e.target.value)}
              options={users.map((u) => ({ value: u.id, label: u.name }))} placeholder="담당자 선택" />
          </div>

          {/* 빠른 메모 */}
          <div className="card p-6">
            <h3 className="text-sm font-semibold text-gray-700 mb-3">빠른 메모</h3>
            <div className="space-y-2">
              <Textarea
                placeholder="메모를 입력하고 Enter..."
                value={activityForm.activity_type === 'NOTE' ? activityForm.title : ''}
                onChange={(e) => setActivityForm({ activity_type: 'NOTE', title: e.target.value, description: '' })}
                className="text-sm"
              />
              <Button size="sm" variant="secondary" className="w-full"
                onClick={() => { if (activityForm.title.trim()) submitActivity() }}>
                <MessageSquare className="w-3.5 h-3.5 mr-1" /> 메모 추가
              </Button>
            </div>
          </div>

          {/* 고객사 연결 */}
          <div className="card p-6">
            <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-1.5">
              <Link2 className="w-4 h-4" /> 고객사 연결
            </h3>

            {linkedCustomer ? (
              <div className="space-y-3">
                <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-sm font-medium text-green-800">{linkedCustomer.company_name}</p>
                      {linkedCustomer.company_type && (
                        <p className="text-xs text-green-600 mt-0.5">{linkedCustomer.company_type}</p>
                      )}
                      {linkedCustomer.customer_code && (
                        <p className="text-xs text-green-500 font-mono mt-1">ID: {linkedCustomer.customer_code}</p>
                      )}
                    </div>
                    <Link href={`/customers/${linkedCustomer.id}`}>
                      <Button variant="ghost" size="sm"><ExternalLink className="w-3.5 h-3.5" /></Button>
                    </Link>
                  </div>
                </div>
                <button
                  onClick={() => linkCustomer(null)}
                  className="text-xs text-red-400 hover:text-red-600"
                >
                  연결 해제
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                <p className="text-xs text-gray-400 mb-2">
                  문의사: <span className="font-medium text-gray-600">{lead.company_name}</span>
                </p>
                <Input
                  placeholder="고객사 검색..."
                  value={customerSearch}
                  onChange={(e) => setCustomerSearch(e.target.value)}
                  className="text-sm"
                />
                {customerSearch && (
                  <div className="max-h-48 overflow-y-auto border rounded-lg divide-y">
                    {filteredCustomers.length === 0 ? (
                      <p className="text-xs text-gray-400 p-2">검색 결과 없음</p>
                    ) : (
                      filteredCustomers.map(c => (
                        <button
                          key={c.id}
                          onClick={() => { linkCustomer(c.id); setCustomerSearch('') }}
                          className="w-full text-left px-3 py-2 hover:bg-blue-50 transition-colors"
                        >
                          <p className="text-sm font-medium text-gray-800">{c.company_name}</p>
                          <p className="text-xs text-gray-400">
                            {c.company_type || ''}
                            {c.customer_code && <span className="ml-2 font-mono">ID: {c.customer_code}</span>}
                          </p>
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
