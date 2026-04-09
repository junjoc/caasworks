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
  VOC_CATEGORY_LABELS, VOC_PRIORITY_LABELS,
  formatDate, formatDateTime
} from '@/lib/utils'
import type { PipelineLead, PipelineHistory, User } from '@/types/database'
import { toast } from 'sonner'
import { ArrowLeft, Edit2, Save, X, Clock, AlertCircle, Plus, Send, MessageSquare, Link2, Building2, ExternalLink, Trash2, Pencil, Megaphone, FileText, BarChart3, Headphones, ChevronRight } from 'lucide-react'
import QuotationSection from '@/components/pipeline/QuotationSection'
import { syncLeadToAdPerformance } from '@/lib/sync-lead-to-ads'

const STAGES = ['신규리드', '컨텍', '제안', '미팅', '도입직전', '도입완료', '이탈']
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

  // Next action inline edit
  const [editingNextAction, setEditingNextAction] = useState(false)
  const [nextActionForm, setNextActionForm] = useState({ next_action: '', next_action_date: '' })
  const [savingNextAction, setSavingNextAction] = useState(false)

  // VoC ticket creation
  const [showVocForm, setShowVocForm] = useState(false)
  const [vocForm, setVocForm] = useState({
    category: 'inquiry',
    channel: 'phone',
    priority: 'normal',
    title: '',
    description: '',
  })
  const [submittingVoc, setSubmittingVoc] = useState(false)
  const [vocTickets, setVocTickets] = useState<any[]>([])

  // Drawer for side panels (견적서, 매출, VoC)
  const [drawer, setDrawer] = useState<'quotation' | 'revenue' | 'voc' | null>(null)

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

    // Fetch related VoC tickets
    if (leadRes.data?.customer_id) {
      const { data: vocData } = await supabase
        .from('voc_tickets')
        .select('id, ticket_number, title, status, priority, category, created_at')
        .eq('customer_id', leadRes.data.customer_id)
        .order('created_at', { ascending: false })
        .limit(5)
      setVocTickets(vocData || [])
    } else {
      setVocTickets([])
    }

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
    if (newStage === '도입직전' || newStage === '도입완료') updates.converted_at = new Date().toISOString()
    await supabase.from('pipeline_leads').update(updates).eq('id', id)

    // 도입완료 시 광고성과에 도입 데이터 반영
    if (newStage === '도입완료' && lead) {
      await syncLeadToAdPerformance(supabase, {
        inquiry_date: lead.inquiry_date || null,
        inquiry_channel: lead.inquiry_channel || '',
        inquiry_source: lead.inquiry_source || '',
        company_name: lead.company_name,
        stage: '도입완료',
      })
    }

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

  const saveNextAction = async () => {
    setSavingNextAction(true)
    const { error } = await supabase.from('pipeline_leads').update({
      next_action: nextActionForm.next_action || null,
      next_action_date: nextActionForm.next_action_date || null,
    }).eq('id', id)
    if (error) {
      toast.error('다음 액션 저장에 실패했습니다.')
    } else {
      toast.success('다음 액션이 저장되었습니다.')
      setEditingNextAction(false)
      fetchAll()
    }
    setSavingNextAction(false)
  }

  const startEditNextAction = () => {
    if (!lead) return
    setNextActionForm({
      next_action: lead.next_action || '',
      next_action_date: lead.next_action_date || '',
    })
    setEditingNextAction(true)
  }

  const clearNextAction = async () => {
    setSavingNextAction(true)
    await supabase.from('pipeline_leads').update({
      next_action: null,
      next_action_date: null,
    }).eq('id', id)
    toast.success('다음 액션이 초기화되었습니다.')
    setEditingNextAction(false)
    fetchAll()
    setSavingNextAction(false)
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

  const submitVocTicket = async () => {
    if (!user || !vocForm.title.trim()) {
      toast.error('제목을 입력해주세요.')
      return
    }
    if (!lead?.customer_id) {
      toast.error('고객사를 먼저 연결해주세요.')
      return
    }
    setSubmittingVoc(true)
    const { data: vocData, error } = await supabase
      .from('voc_tickets')
      .insert({
        customer_id: lead.customer_id,
        category: vocForm.category,
        channel: vocForm.channel,
        priority: vocForm.priority,
        title: vocForm.title,
        description: vocForm.description || null,
        reported_by: lead.contact_person || '',
        created_by: user.id,
        assigned_to: lead.assigned_to || null,
      })
      .select()
      .single()

    if (error) {
      toast.error('VoC 티켓 생성에 실패했습니다.')
    } else {
      // Also log this as an activity
      await supabase.from('activity_logs').insert({
        lead_id: id,
        customer_id: lead.customer_id,
        activity_type: 'NOTE',
        title: `VoC 티켓 생성: ${vocForm.title}`,
        description: `티켓 #${vocData.ticket_number} (${VOC_CATEGORY_LABELS[vocForm.category]})`,
        performed_by: user.id,
      })
      toast.success('VoC 티켓이 생성되었습니다.')
      setVocForm({ category: 'inquiry', channel: 'phone', priority: 'normal', title: '', description: '' })
      setShowVocForm(false)
      fetchAll()
    }
    setSubmittingVoc(false)
  }

  if (loading) return <PageLoading />
  if (!lead) {
    return (
      <div className="text-center py-12">
        <p className="text-text-secondary">리드를 찾을 수 없습니다.</p>
        <Link href="/pipeline/list"><Button variant="secondary" className="mt-4">목록으로</Button></Link>
      </div>
    )
  }

  const isOverdue = lead.next_action_date && new Date(lead.next_action_date) < new Date(new Date().toDateString())

  return (
    <div className="relative">
      {/* ===== Header ===== */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <Link href="/pipeline/list" className="text-text-tertiary hover:text-text-secondary">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <h1 className="text-lg font-bold text-text-primary">{lead.company_name}</h1>
          <Badge className={STAGE_COLORS[lead.stage]}>{lead.stage}</Badge>
          {lead.priority && lead.priority !== '중간' && <Badge className={`${PRIORITY_COLORS[lead.priority]} border`}>{lead.priority}</Badge>}
        </div>
        <div className="flex items-center gap-2">
          {/* 바로가기 버튼들 */}
          <button onClick={() => setDrawer('quotation')} className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-text-secondary bg-surface-tertiary hover:bg-primary-50 hover:text-primary-600 rounded-lg transition-colors">
            <FileText className="w-3.5 h-3.5" /> 견적서
          </button>
          <button onClick={() => setDrawer('voc')} className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-text-secondary bg-surface-tertiary hover:bg-orange-50 hover:text-orange-600 rounded-lg transition-colors">
            <Headphones className="w-3.5 h-3.5" /> VoC
          </button>
          {!editing && (
            <Button variant="secondary" size="sm" onClick={startEdit}>
              <Edit2 className="w-4 h-4 mr-1" /> 수정
            </Button>
          )}
        </div>
      </div>

      {/* ===== 3칸 레이아웃 ===== */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">

        {/* ── 좌측: 기본 정보 + 문의 (4칸) ── */}
        <div className="xl:col-span-4 space-y-4 min-w-0">
          {/* 단계 + 담당자 (컴팩트) */}
          <div className="card p-4">
            <div className="flex items-center gap-3 mb-3">
              <div className="flex-1">
                <label className="text-[11px] font-medium text-text-tertiary uppercase">단계</label>
                <div className="flex flex-wrap gap-1 mt-1">
                  {STAGES.map((stage) => (
                    <button key={stage} onClick={() => changeStage(stage)} disabled={lead.stage === stage}
                      className={`px-2 py-1 rounded text-[11px] transition-colors ${
                        lead.stage === stage
                          ? 'bg-primary-500 text-white font-semibold'
                          : 'bg-surface-tertiary text-text-tertiary hover:bg-primary-50 hover:text-primary-600'
                      }`}>{stage}</button>
                  ))}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-3 pt-3 border-t border-border-light">
              <div className="flex-1">
                <label className="text-[11px] font-medium text-text-tertiary uppercase">담당자</label>
                <Select value={lead.assigned_to || ''} onChange={(e) => changeAssigned(e.target.value)}
                  options={users.map((u) => ({ value: u.id, label: u.name }))} placeholder="선택" className="mt-1" />
              </div>
              <div className="flex-1">
                <label className="text-[11px] font-medium text-text-tertiary uppercase">우선순위</label>
                <Select value={lead.priority || '중간'} onChange={(e) => {
                  supabase.from('pipeline_leads').update({ priority: e.target.value }).eq('id', id).then(() => fetchAll())
                }}
                  options={PRIORITY_OPTIONS} className="mt-1" />
              </div>
            </div>
            {/* 다음 액션 + 액션일 */}
            <div className={`pt-3 border-t border-border-light ${
              isOverdue ? 'bg-red-50 -mx-4 px-4 -mb-4 pb-4 rounded-b-xl' : ''
            }`}>
              {editingNextAction ? (
                <div className="space-y-2">
                  <div className="flex items-center gap-3">
                    <div className="flex-1">
                      <label className="text-[11px] font-medium text-text-tertiary uppercase">다음 액션</label>
                      <Input
                        placeholder="예: 견적서 발송, 데모 일정 조율"
                        value={nextActionForm.next_action}
                        onChange={(e) => setNextActionForm({ ...nextActionForm, next_action: e.target.value })}
                        className="mt-1 text-sm"
                      />
                    </div>
                    <div className="w-36">
                      <label className="text-[11px] font-medium text-text-tertiary uppercase">액션일</label>
                      <Input
                        type="date"
                        value={nextActionForm.next_action_date}
                        onChange={(e) => setNextActionForm({ ...nextActionForm, next_action_date: e.target.value })}
                        className="mt-1 text-sm"
                      />
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button onClick={saveNextAction} loading={savingNextAction} size="sm">
                      <Save className="w-3.5 h-3.5 mr-1" /> 저장
                    </Button>
                    <Button variant="secondary" size="sm" onClick={() => setEditingNextAction(false)}>
                      <X className="w-3.5 h-3.5" />
                    </Button>
                    {(lead.next_action || lead.next_action_date) && (
                      <button onClick={clearNextAction} className="text-xs text-red-500 hover:text-red-700 ml-auto">초기화</button>
                    )}
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-3 cursor-pointer group" onClick={startEditNextAction}>
                  {isOverdue ? (
                    <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />
                  ) : (
                    <Clock className={`w-4 h-4 shrink-0 ${lead.next_action ? 'text-blue-500' : 'text-text-quaternary'}`} />
                  )}
                  {lead.next_action ? (
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-medium ${isOverdue ? 'text-red-700' : 'text-blue-700'}`}>
                        {lead.next_action}
                      </p>
                      {lead.next_action_date && (
                        <p className={`text-xs mt-0.5 ${isOverdue ? 'text-red-500 font-medium' : 'text-blue-500'}`}>
                          {isOverdue ? '⚠ 기한초과 · ' : ''}{formatDate(lead.next_action_date)}
                        </p>
                      )}
                    </div>
                  ) : (
                    <p className="text-sm text-text-quaternary group-hover:text-text-secondary transition-colors flex-1">
                      + 다음 액션을 지정하세요
                    </p>
                  )}
                  <Pencil className={`w-3.5 h-3.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity ${isOverdue ? 'text-red-400' : 'text-text-quaternary'}`} />
                </div>
              )}
            </div>
          </div>

          {/* 기본 정보 */}
          <div className="card p-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-text-primary">기본 정보</h2>
              {editing && (
                <div className="flex gap-1.5">
                  <Button onClick={saveEdit} loading={saving} size="sm"><Save className="w-3.5 h-3.5 mr-1" /> 저장</Button>
                  <Button variant="secondary" size="sm" onClick={() => setEditing(false)}><X className="w-3.5 h-3.5" /></Button>
                </div>
              )}
            </div>
            {editing ? (
              <div className="space-y-3">
                <Input label="회사명" value={editForm.company_name || ''} onChange={(e) => setEditForm({ ...editForm, company_name: e.target.value })} />
                <div className="grid grid-cols-2 gap-3">
                  <Select label="사업분류" value={editForm.industry || ''} onChange={(e) => setEditForm({ ...editForm, industry: e.target.value })} options={INDUSTRY_OPTIONS.map(i => ({ value: i, label: i }))} placeholder="업종" />
                  <Input label="핵심니즈" value={editForm.core_need || ''} onChange={(e) => setEditForm({ ...editForm, core_need: e.target.value })} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <Input label="문의자" value={editForm.contact_person || ''} onChange={(e) => setEditForm({ ...editForm, contact_person: e.target.value })} />
                  <Input label="직급" value={editForm.contact_position || ''} onChange={(e) => setEditForm({ ...editForm, contact_position: e.target.value })} />
                </div>
                <Input label="연락처" value={editForm.contact_phone || ''} onChange={(e) => setEditForm({ ...editForm, contact_phone: e.target.value })} />
                <Input label="이메일" value={editForm.contact_email || ''} onChange={(e) => setEditForm({ ...editForm, contact_email: e.target.value })} />
                <div className="grid grid-cols-2 gap-3">
                  <Input label="유입일" type="date" value={editForm.inquiry_date || ''} onChange={(e) => setEditForm({ ...editForm, inquiry_date: e.target.value })} />
                  <Select label="유입채널" value={editForm.inquiry_channel || ''} onChange={(e) => setEditForm({ ...editForm, inquiry_channel: e.target.value })} options={CHANNEL_OPTIONS.map(c => ({ value: c, label: c }))} placeholder="채널" />
                </div>
                <Input label="유입경로" value={editForm.inquiry_source || ''} onChange={(e) => setEditForm({ ...editForm, inquiry_source: e.target.value })} />
                <Textarea label="문의내용" value={editForm.inquiry_content || ''} onChange={(e) => setEditForm({ ...editForm, inquiry_content: e.target.value })} />
                <Textarea label="메모" value={editForm.notes || ''} onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })} />
              </div>
            ) : (
              <div className="space-y-2.5 text-sm">
                {[
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
                  <div key={label as string} className="flex items-baseline">
                    <dt className="w-16 shrink-0 text-xs text-text-tertiary">{label}</dt>
                    <dd className="text-sm text-text-primary">{(value as string) || '-'}</dd>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 문의내용 */}
          {(lead.inquiry_content || lead.notes) && !editing && (
            <div className="card p-4 overflow-hidden">
              {lead.inquiry_content && (
                <div className="mb-3">
                  <h3 className="text-xs font-semibold text-text-tertiary uppercase mb-1.5">문의내용</h3>
                  <p className="text-sm text-text-primary whitespace-pre-wrap break-all">{lead.inquiry_content}</p>
                </div>
              )}
              {lead.notes && (
                <div className={lead.inquiry_content ? 'pt-3 border-t border-border-light' : ''}>
                  <h3 className="text-xs font-semibold text-text-tertiary uppercase mb-1.5">메모</h3>
                  <p className="text-sm text-text-primary whitespace-pre-wrap break-all">{lead.notes}</p>
                </div>
              )}
            </div>
          )}

          {/* 고객사 연결 */}
          <div className="card p-4">
            <h3 className="text-xs font-semibold text-text-tertiary uppercase mb-2 flex items-center gap-1.5">
              <Link2 className="w-3.5 h-3.5" /> 고객사 연결
            </h3>
            {linkedCustomer ? (
              <div className="flex items-center justify-between bg-green-50 border border-green-200 rounded-lg px-3 py-2">
                <div>
                  <p className="text-sm font-medium text-green-800">{linkedCustomer.company_name}</p>
                  {linkedCustomer.customer_code && <p className="text-[10px] text-green-500 font-mono">ID: {linkedCustomer.customer_code}</p>}
                </div>
                <div className="flex items-center gap-1">
                  <Link href={`/customers/${linkedCustomer.id}`}>
                    <button className="p-1 hover:bg-green-100 rounded"><ExternalLink className="w-3.5 h-3.5 text-green-600" /></button>
                  </Link>
                  <button onClick={() => linkCustomer(null)} className="p-1 hover:bg-red-100 rounded"><X className="w-3.5 h-3.5 text-red-400" /></button>
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <Input placeholder="고객사 검색..." value={customerSearch} onChange={(e) => setCustomerSearch(e.target.value)} className="text-sm" />
                {customerSearch && (
                  <div className="max-h-36 overflow-y-auto border rounded-lg divide-y">
                    {filteredCustomers.length === 0 ? (
                      <p className="text-xs text-text-tertiary p-2">검색 결과 없음</p>
                    ) : (
                      filteredCustomers.map(c => (
                        <button key={c.id} onClick={() => { linkCustomer(c.id); setCustomerSearch('') }}
                          className="w-full text-left px-3 py-2 hover:bg-blue-50 transition-colors">
                          <p className="text-sm font-medium text-text-primary">{c.company_name}</p>
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* ── 중앙: 활동 타임라인 (5칸) ── */}
        <div className="xl:col-span-5 space-y-4">
          {/* 빠른 메모 입력 */}
          <div className="card p-4">
            <div className="flex gap-2">
              <div className="flex-1">
                <Textarea
                  placeholder="빠른 메모를 입력하세요..."
                  value={activityForm.activity_type === 'NOTE' ? activityForm.title : ''}
                  onChange={(e) => setActivityForm({ activity_type: 'NOTE', title: e.target.value, description: '' })}
                  className="text-sm !min-h-[60px]"
                />
              </div>
              <div className="flex flex-col gap-1.5 shrink-0">
                <Button size="sm" className="h-full"
                  onClick={() => { if (activityForm.title.trim()) submitActivity() }}>
                  <Send className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>
          </div>

          {/* 활동 타임라인 */}
          <div className="card p-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-text-primary">활동 타임라인</h2>
              <Button size="sm" variant="secondary" onClick={() => setShowActivityForm(!showActivityForm)}>
                <Plus className="w-3.5 h-3.5 mr-1" /> 활동 기록
              </Button>
            </div>

            {/* 활동 추가 폼 */}
            {showActivityForm && (
              <div className="mb-4 p-3 bg-surface-tertiary rounded-lg border space-y-2.5">
                <Select label="활동 유형" value={activityForm.activity_type}
                  onChange={(e) => setActivityForm({ ...activityForm, activity_type: e.target.value })}
                  options={ACTIVITY_TYPE_OPTIONS} />
                <Input label="제목" value={activityForm.title}
                  onChange={(e) => setActivityForm({ ...activityForm, title: e.target.value })}
                  placeholder="예: 견적서 발송 완료" required />
                <Textarea label="상세 내용" value={activityForm.description}
                  onChange={(e) => setActivityForm({ ...activityForm, description: e.target.value })}
                  placeholder="상세 내용 (선택)" />
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
              <p className="text-sm text-text-tertiary py-8 text-center">아직 활동 이력이 없습니다.</p>
            ) : (
              <div className="space-y-2">
                {timeline.map((item) => {
                  if (item.type === 'activity') {
                    const icon = ACTIVITY_TYPE_ICONS[item.activity_type || 'NOTE'] || '💬'
                    const color = ACTIVITY_TYPE_COLORS[item.activity_type || 'NOTE'] || ''
                    const label = ACTIVITY_TYPE_LABELS[item.activity_type || 'NOTE'] || item.activity_type
                    const isOwner = user && item.performed_by === user.id
                    const isEditingItem = editingActivityId === item.id

                    if (isEditingItem) {
                      return (
                        <div key={item.id} className="rounded-lg p-3 border bg-yellow-50 border-yellow-200 space-y-2.5">
                          <Select label="유형" value={editActivityForm.activity_type}
                            onChange={(e) => setEditActivityForm({ ...editActivityForm, activity_type: e.target.value })}
                            options={ACTIVITY_TYPE_OPTIONS} />
                          <Input label="제목" value={editActivityForm.title}
                            onChange={(e) => setEditActivityForm({ ...editActivityForm, title: e.target.value })} required />
                          <Textarea label="내용" value={editActivityForm.description}
                            onChange={(e) => setEditActivityForm({ ...editActivityForm, description: e.target.value })} />
                          <div className="flex gap-2">
                            <Button size="sm" onClick={saveActivityEdit} loading={savingActivity}><Save className="w-3 h-3 mr-1" /> 저장</Button>
                            <Button variant="secondary" size="sm" onClick={() => setEditingActivityId(null)}>취소</Button>
                          </div>
                        </div>
                      )
                    }

                    return (
                      <div key={item.id} className={`rounded-lg px-3 py-2.5 border ${color} group`}>
                        <div className="flex items-start gap-2">
                          <span className="text-sm mt-0.5">{icon}</span>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className="text-[11px] font-medium opacity-70">{label}</span>
                              <span className="text-[11px] opacity-40">{item.performer_name}</span>
                              <span className="text-[11px] opacity-30 ml-auto">{formatDate(item.timestamp, 'M/d HH:mm')}</span>
                              {isOwner && (
                                <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                                  <button onClick={() => startEditActivity(item)} className="p-0.5 rounded hover:bg-black/5"><Pencil className="w-3 h-3 text-text-tertiary" /></button>
                                  <button onClick={() => deleteActivity(item.id)} className="p-0.5 rounded hover:bg-red-50"><Trash2 className="w-3 h-3 text-text-tertiary hover:text-red-500" /></button>
                                </div>
                              )}
                            </div>
                            <p className="text-sm font-medium mt-0.5">{item.title}</p>
                            {item.description && <p className="text-xs mt-1 opacity-60 whitespace-pre-wrap">{item.description}</p>}
                          </div>
                        </div>
                      </div>
                    )
                  }

                  return (
                    <div key={item.id} className="flex items-center gap-2 px-3 py-1.5 text-xs text-text-tertiary">
                      <Clock className="w-3 h-3 text-text-placeholder shrink-0" />
                      <span className="font-medium text-text-secondary">{item.changed_by_name}</span>
                      <span>{item.field_changed === 'stage' ? '단계' : '담당자'}</span>
                      <span className="text-red-400 line-through">{item.old_value}</span>
                      <span>→</span>
                      <span className="text-green-600 font-medium">{item.new_value}</span>
                      <span className="ml-auto text-text-placeholder">{formatDate(item.timestamp, 'M/d HH:mm')}</span>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>

        {/* ── 우측: VoC + 바로가기 (3칸) ── */}
        <div className="xl:col-span-3 space-y-4">
          {/* VoC 연동 */}
          <div className="card p-4">
            <h3 className="text-xs font-semibold text-text-tertiary uppercase mb-2 flex items-center gap-1.5">
              <Megaphone className="w-3.5 h-3.5" /> VoC
            </h3>
            {!lead.customer_id ? (
              <p className="text-[11px] text-text-placeholder">고객사를 연결하면 VoC 티켓을 생성할 수 있습니다.</p>
            ) : (
              <div className="space-y-2">
                {vocTickets.length > 0 && (
                  <div className="space-y-1">
                    {vocTickets.map(ticket => (
                      <Link key={ticket.id} href={`/voc/${ticket.id}`} className="block">
                        <div className="flex items-center gap-1.5 px-2 py-1.5 rounded hover:bg-surface-tertiary transition-colors text-[11px]">
                          <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                            ticket.status === 'resolved' || ticket.status === 'closed' ? 'bg-green-400' :
                            ticket.priority === 'urgent' ? 'bg-red-400' : 'bg-blue-400'
                          }`} />
                          <span className="truncate text-text-secondary">{ticket.title}</span>
                        </div>
                      </Link>
                    ))}
                  </div>
                )}
                {showVocForm ? (
                  <div className="space-y-2 pt-2 border-t">
                    <Select label="카테고리" value={vocForm.category}
                      onChange={(e) => setVocForm({ ...vocForm, category: e.target.value })}
                      options={Object.entries(VOC_CATEGORY_LABELS).map(([v, l]) => ({ value: v, label: l }))} />
                    <div className="grid grid-cols-2 gap-2">
                      <Select label="채널" value={vocForm.channel}
                        onChange={(e) => setVocForm({ ...vocForm, channel: e.target.value })}
                        options={[{ value: 'phone', label: '전화' }, { value: 'email', label: '이메일' }, { value: 'message', label: '메시지' }, { value: 'meeting', label: '미팅' }, { value: 'other', label: '기타' }]} />
                      <Select label="우선순위" value={vocForm.priority}
                        onChange={(e) => setVocForm({ ...vocForm, priority: e.target.value })}
                        options={Object.entries(VOC_PRIORITY_LABELS).map(([v, l]) => ({ value: v, label: l }))} />
                    </div>
                    <Input label="제목" value={vocForm.title} onChange={(e) => setVocForm({ ...vocForm, title: e.target.value })} placeholder="이슈 제목" required />
                    <Textarea label="설명" value={vocForm.description} onChange={(e) => setVocForm({ ...vocForm, description: e.target.value })} placeholder="상세 내용 (선택)" />
                    <div className="flex gap-2">
                      <Button size="sm" onClick={submitVocTicket} loading={submittingVoc}>생성</Button>
                      <Button variant="secondary" size="sm" onClick={() => setShowVocForm(false)}>취소</Button>
                    </div>
                  </div>
                ) : (
                  <Button size="sm" variant="secondary" className="w-full text-xs" onClick={() => setShowVocForm(true)}>
                    <Plus className="w-3 h-3 mr-1" /> VoC 티켓 생성
                  </Button>
                )}
              </div>
            )}
          </div>

          {/* 관련 항목 바로가기 */}
          <div className="card p-4">
            <h3 className="text-xs font-semibold text-text-tertiary uppercase mb-2">관련 항목</h3>
            <div className="space-y-1">
              <button onClick={() => setDrawer('quotation')}
                className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-text-secondary hover:bg-primary-50 hover:text-primary-600 transition-colors">
                <FileText className="w-4 h-4" /> <span className="flex-1 text-left">견적서</span> <ChevronRight className="w-3.5 h-3.5 text-text-placeholder" />
              </button>
              {linkedCustomer && (
                <Link href={`/customers/${linkedCustomer.id}`}
                  className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-text-secondary hover:bg-green-50 hover:text-green-600 transition-colors">
                  <Building2 className="w-4 h-4" /> <span className="flex-1 text-left">고객 상세</span> <ChevronRight className="w-3.5 h-3.5 text-text-placeholder" />
                </Link>
              )}
              <button onClick={() => setDrawer('voc')}
                className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-text-secondary hover:bg-orange-50 hover:text-orange-600 transition-colors">
                <Headphones className="w-4 h-4" /> <span className="flex-1 text-left">VoC 티켓</span> <ChevronRight className="w-3.5 h-3.5 text-text-placeholder" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ===== Slide-over Drawer ===== */}
      {drawer && (
        <>
          {/* Backdrop */}
          <div className="fixed inset-0 bg-black/20 z-40" onClick={() => setDrawer(null)} />
          {/* Drawer panel */}
          <div className="fixed right-0 top-0 h-full w-[600px] max-w-[90vw] bg-white shadow-2xl z-50 flex flex-col animate-in slide-in-from-right duration-200">
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <h2 className="text-base font-semibold text-text-primary flex items-center gap-2">
                {drawer === 'quotation' && <><FileText className="w-5 h-5 text-primary-500" /> 견적서</>}
                {drawer === 'voc' && <><Headphones className="w-5 h-5 text-orange-500" /> VoC 티켓</>}
                {drawer === 'revenue' && <><BarChart3 className="w-5 h-5 text-green-500" /> 매출 현황</>}
                <span className="text-sm font-normal text-text-tertiary">— {lead.company_name}</span>
              </h2>
              <button onClick={() => setDrawer(null)} className="p-2 hover:bg-surface-tertiary rounded-lg transition-colors">
                <X className="w-5 h-5 text-text-secondary" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-6">
              {drawer === 'quotation' && user && (
                <QuotationSection leadId={id} companyName={lead.company_name} userId={user.id} />
              )}
              {drawer === 'voc' && (
                <div className="space-y-3">
                  {vocTickets.length === 0 ? (
                    <p className="text-sm text-text-tertiary text-center py-8">관련 VoC 티켓이 없습니다.</p>
                  ) : (
                    vocTickets.map(ticket => (
                      <Link key={ticket.id} href={`/voc/${ticket.id}`} className="block">
                        <div className="card p-4 hover:shadow-md transition-shadow">
                          <div className="flex items-center gap-2 mb-1">
                            <span className={`w-2 h-2 rounded-full ${
                              ticket.status === 'resolved' || ticket.status === 'closed' ? 'bg-green-400' :
                              ticket.priority === 'urgent' ? 'bg-red-400' : 'bg-blue-400'
                            }`} />
                            <span className="text-sm font-medium text-text-primary">{ticket.title}</span>
                            <span className="ml-auto text-xs text-text-placeholder">#{ticket.ticket_number}</span>
                          </div>
                          <div className="flex items-center gap-2 text-xs text-text-tertiary">
                            <span>{VOC_CATEGORY_LABELS[ticket.category] || ticket.category}</span>
                            <span>·</span>
                            <span>{formatDate(ticket.created_at, 'yyyy-MM-dd')}</span>
                          </div>
                        </div>
                      </Link>
                    ))
                  )}
                </div>
              )}
              {drawer === 'revenue' && (
                <p className="text-sm text-text-tertiary text-center py-8">매출 현황 연동 준비 중...</p>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
