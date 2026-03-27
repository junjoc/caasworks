'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/hooks/useAuth'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Loading } from '@/components/ui/loading'
import { STAGE_COLORS, PRIORITY_COLORS, ACTIVITY_TYPE_ICONS, formatDate } from '@/lib/utils'
import type { PipelineLead } from '@/types/database'
import { toast } from 'sonner'
import { Plus, Clock, AlertCircle, Search } from 'lucide-react'

const STAGES = ['신규리드', '컨텍', '제안', '미팅', '도입직전', '도입완료', '이탈']

// Stage-specific colors for column headers and accents
const STAGE_COLUMN_COLORS: Record<string, { bar: string; bg: string; headerBg: string }> = {
  '신규리드': { bar: 'bg-blue-400', bg: 'bg-blue-50/60', headerBg: 'bg-blue-50' },
  '컨텍': { bar: 'bg-indigo-400', bg: 'bg-indigo-50/60', headerBg: 'bg-indigo-50' },
  '미팅': { bar: 'bg-amber-400', bg: 'bg-amber-50/60', headerBg: 'bg-amber-50' },
  '제안': { bar: 'bg-orange-400', bg: 'bg-orange-50/60', headerBg: 'bg-orange-50' },
  '도입직전': { bar: 'bg-emerald-400', bg: 'bg-emerald-50/60', headerBg: 'bg-emerald-50' },
  '도입완료': { bar: 'bg-green-500', bg: 'bg-green-50/60', headerBg: 'bg-green-50' },
  '이탈': { bar: 'bg-gray-400', bg: 'bg-gray-50/80', headerBg: 'bg-gray-100' },
}

function isOverdue(dateStr: string | null) {
  if (!dateStr) return false
  return new Date(dateStr) < new Date(new Date().toDateString())
}

function getCardBorderClass(lead: PipelineLead) {
  if (lead.priority === '긴급') return 'border-l-4 border-l-red-500 border-t border-r border-b border-red-200 bg-red-50/40'
  if (lead.priority === '높음') return 'border-l-4 border-l-orange-400 border-t border-r border-b border-orange-200 bg-orange-50/30'
  if (isOverdue(lead.next_action_date)) return 'border-l-4 border-l-red-300 border-t border-r border-b border-gray-200 bg-white'
  return 'border border-border bg-white'
}

export default function PipelineBoardPage() {
  const [leads, setLeads] = useState<PipelineLead[]>([])
  const [loading, setLoading] = useState(true)
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [activityMap, setActivityMap] = useState<Record<string, { count: number; latest?: { type: string; title: string; date: string } }>>({})
  const [searchQuery, setSearchQuery] = useState('')
  const { user } = useAuth()
  const supabase = createClient()

  useEffect(() => {
    fetchLeads()
  }, [])

  async function fetchLeads() {
    const { data } = await supabase
      .from('pipeline_leads')
      .select('*, assigned_user:users!pipeline_leads_assigned_to_fkey(id, name)')
      .order('created_at', { ascending: false })

    setLeads(data || [])

    if (data && data.length > 0) {
      const leadIds = data.map((l: any) => l.id)
      const { data: activities } = await supabase
        .from('activity_logs')
        .select('lead_id, activity_type, title, performed_at')
        .in('lead_id', leadIds)
        .order('performed_at', { ascending: false })

      const map: Record<string, { count: number; latest?: { type: string; title: string; date: string } }> = {}
      ;(activities || []).forEach((a: any) => {
        if (!map[a.lead_id]) {
          map[a.lead_id] = { count: 0, latest: { type: a.activity_type, title: a.title, date: a.performed_at } }
        }
        map[a.lead_id].count++
      })
      setActivityMap(map)
    }

    setLoading(false)
  }

  const getLeadsByStage = (stage: string) => {
    let filtered = leads.filter((l) => l.stage === stage)
    if (searchQuery) {
      const q = searchQuery.toLowerCase().replace(/-/g, '')
      filtered = filtered.filter(l =>
        l.company_name.toLowerCase().includes(q) ||
        (l.contact_person || '').toLowerCase().includes(q) ||
        (l.contact_phone || '').replace(/-/g, '').includes(q) ||
        (l.next_action || '').toLowerCase().includes(q) ||
        (l.industry || '').toLowerCase().includes(q)
      )
    }
    return filtered
  }

  const handleDragStart = (e: React.DragEvent, leadId: string) => {
    setDraggingId(leadId)
    e.dataTransfer.setData('text/plain', leadId)
    e.dataTransfer.effectAllowed = 'move'
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
  }

  const handleDrop = async (e: React.DragEvent, newStage: string) => {
    e.preventDefault()
    const leadId = e.dataTransfer.getData('text/plain')
    const lead = leads.find((l) => l.id === leadId)
    if (!lead || lead.stage === newStage) {
      setDraggingId(null)
      return
    }

    setLeads((prev) =>
      prev.map((l) => (l.id === leadId ? { ...l, stage: newStage as PipelineLead['stage'] } : l))
    )
    setDraggingId(null)

    if (user) {
      await supabase.from('pipeline_history').insert({
        lead_id: leadId,
        field_changed: 'stage',
        old_value: lead.stage,
        new_value: newStage,
        changed_by: user.id,
      })
    }

    const updates: Record<string, unknown> = { stage: newStage }
    if (newStage === '도입직전' || newStage === '도입완료') {
      updates.converted_at = new Date().toISOString()
    }

    const { error } = await supabase
      .from('pipeline_leads')
      .update(updates)
      .eq('id', leadId)

    if (error) {
      toast.error('단계 변경에 실패했습니다.')
      fetchLeads()
    } else {
      toast.success(`"${lead.company_name}" → ${newStage}`)
    }
  }

  if (loading) return <Loading />

  const overdueTotal = leads.filter(l => isOverdue(l.next_action_date)).length
  const urgentTotal = leads.filter(l => l.priority === '긴급').length

  return (
    <div className="flex flex-col" style={{ height: 'calc(100vh - 56px - 48px)' }}>
      {/* Header - fixed */}
      <div className="flex items-center justify-between mb-4 flex-shrink-0">
        <div>
          <h1 className="page-title">파이프라인 보드</h1>
          {(overdueTotal > 0 || urgentTotal > 0) && (
            <p className="text-xs text-text-tertiary mt-1">
              {urgentTotal > 0 && (
                <span className="text-status-red font-semibold mr-3">
                  긴급 {urgentTotal}건
                </span>
              )}
              {overdueTotal > 0 && (
                <span className="text-status-red">
                  <AlertCircle className="w-3 h-3 inline mr-0.5" />
                  기한초과 {overdueTotal}건
                </span>
              )}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-text-tertiary" />
            <input
              className="pl-8 pr-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-200 w-48"
              placeholder="회사명, 담당자 검색..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <Link href="/pipeline/list">
            <Button variant="secondary" size="sm">리스트뷰</Button>
          </Link>
          <Link href="/pipeline/new">
            <Button size="sm" icon={<Plus className="w-4 h-4" />}>새 리드</Button>
          </Link>
        </div>
      </div>

      {/* Board - scrollable area */}
      <div className="flex gap-3 overflow-x-auto flex-1 pb-2">
        {STAGES.map((stage) => {
          const stageLeads = getLeadsByStage(stage)
          const stageOverdue = stageLeads.filter(l => isOverdue(l.next_action_date)).length
          const colors = STAGE_COLUMN_COLORS[stage] || STAGE_COLUMN_COLORS['이탈']
          return (
            <div
              key={stage}
              onDragOver={handleDragOver}
              onDrop={(e) => handleDrop(e, stage)}
              className={`flex-shrink-0 w-[240px] rounded-xl flex flex-col ${colors.bg}`}
            >
              {/* Column header with color bar */}
              <div className={`rounded-t-xl overflow-hidden`}>
                <div className={`h-1 ${colors.bar}`} />
                <div className={`flex items-center justify-between px-3 py-2.5 ${colors.headerBg}`}>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-text-primary">{stage}</span>
                    <span className="text-xs font-bold text-text-tertiary bg-white/80 px-1.5 py-0.5 rounded-full min-w-[20px] text-center">
                      {stageLeads.length}
                    </span>
                  </div>
                  {stageOverdue > 0 && (
                    <span className="text-[10px] text-status-red flex items-center gap-0.5">
                      <AlertCircle className="w-3 h-3" />
                      {stageOverdue}
                    </span>
                  )}
                </div>
              </div>

              {/* Cards - scrollable within column */}
              <div className="flex-1 overflow-y-auto p-2 space-y-2 min-h-0">
                {stageLeads.map((lead) => (
                  <div
                    key={lead.id}
                    draggable
                    onDragStart={(e) => handleDragStart(e, lead.id)}
                    className={`rounded-lg p-3 shadow-sm cursor-grab active:cursor-grabbing hover:shadow-md transition-all ${
                      draggingId === lead.id ? 'opacity-40 scale-95' : ''
                    } ${getCardBorderClass(lead)}`}
                  >
                    <Link href={`/pipeline/${lead.id}`} className="block">
                      {/* Top: priority + industry */}
                      <div className="flex items-center gap-1.5 mb-1.5">
                        {lead.priority && lead.priority !== '중간' && (
                          <Badge className={`${PRIORITY_COLORS[lead.priority]} text-[10px] px-1.5 py-0 border`}>
                            {lead.priority}
                          </Badge>
                        )}
                        {lead.industry && (
                          <span className="text-[10px] text-text-tertiary">{lead.industry}</span>
                        )}
                        {isOverdue(lead.next_action_date) && (
                          <span className="ml-auto" title="기한 초과">
                            <AlertCircle className="w-3.5 h-3.5 text-status-red" />
                          </span>
                        )}
                      </div>

                      {/* Company name */}
                      <p className="font-semibold text-sm text-text-primary mb-0.5">
                        {lead.company_name}
                      </p>

                      {/* Contact */}
                      {lead.contact_person && (
                        <p className="text-xs text-text-secondary">
                          {lead.contact_person}
                          {lead.contact_position && <span className="text-text-tertiary"> · {lead.contact_position}</span>}
                        </p>
                      )}

                      {/* Next action with date */}
                      {lead.next_action && (
                        <div className={`flex items-center gap-1 mt-1.5 text-xs ${
                          isOverdue(lead.next_action_date) ? 'text-status-red font-medium' : 'text-primary-500'
                        }`}>
                          <span className="truncate" title={lead.next_action}>→ {lead.next_action}</span>
                          {lead.next_action_date && (
                            <span className="ml-auto shrink-0 flex items-center gap-0.5 text-[10px]">
                              <Clock className="w-3 h-3" />
                              {formatDate(lead.next_action_date, 'M/d')}
                            </span>
                          )}
                        </div>
                      )}

                      {/* Latest activity */}
                      {activityMap[lead.id]?.latest && (
                        <div className="flex items-center gap-1 mt-1.5 text-[10px] text-text-tertiary">
                          <span>{ACTIVITY_TYPE_ICONS[activityMap[lead.id].latest!.type] || '💬'}</span>
                          <span className="truncate">{activityMap[lead.id].latest!.title}</span>
                          <span className="ml-auto shrink-0 flex items-center gap-1">
                            <span className="text-[9px] text-text-placeholder">{formatDate(activityMap[lead.id].latest!.date, 'M/d')}</span>
                            {activityMap[lead.id].count > 1 && (
                              <span className="bg-surface-tertiary text-text-tertiary px-1 rounded text-[9px]">+{activityMap[lead.id].count - 1}</span>
                            )}
                          </span>
                        </div>
                      )}

                      {/* Bottom: dates + assignee */}
                      <div className="flex items-center justify-between mt-2 pt-2 border-t border-border-light">
                        <div className="flex items-center gap-1.5">
                          <span className="text-[11px] text-text-tertiary" title="유입일">
                            {lead.inquiry_date ? formatDate(lead.inquiry_date, 'M/d') : formatDate(lead.created_at, 'M/d')}
                          </span>
                          {lead.updated_at && lead.updated_at !== lead.created_at && (
                            <span className="text-[10px] text-text-placeholder" title="최근 수정">
                              · {formatDate(lead.updated_at, 'M/d')}
                            </span>
                          )}
                        </div>
                        {lead.assigned_user && (
                          <span className="text-[11px] bg-surface-tertiary text-text-secondary px-1.5 py-0.5 rounded-md font-medium">
                            {lead.assigned_user.name}
                          </span>
                        )}
                      </div>
                    </Link>
                  </div>
                ))}

                {stageLeads.length === 0 && (
                  <div className="flex items-center justify-center h-24 text-xs text-text-placeholder">
                    드래그하여 이동
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
