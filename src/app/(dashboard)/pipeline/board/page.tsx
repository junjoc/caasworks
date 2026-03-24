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
import { Plus, Clock, AlertCircle } from 'lucide-react'

const STAGES = ['신규리드', '컨택', '미팅', '제안', '계약', '도입완료']

function isOverdue(dateStr: string | null) {
  if (!dateStr) return false
  return new Date(dateStr) < new Date(new Date().toDateString())
}

function getCardBorderClass(lead: PipelineLead) {
  // Priority-based border colors
  if (lead.priority === '긴급') return 'border-l-4 border-l-red-500 border-t border-r border-b border-red-200 bg-red-50/40'
  if (lead.priority === '높음') return 'border-l-4 border-l-orange-400 border-t border-r border-b border-orange-200 bg-orange-50/30'
  // Overdue highlight even for normal priority
  if (isOverdue(lead.next_action_date)) return 'border-l-4 border-l-red-300 border-t border-r border-b border-gray-200 bg-white'
  return 'border border-gray-200 bg-white'
}

export default function PipelineBoardPage() {
  const [leads, setLeads] = useState<PipelineLead[]>([])
  const [loading, setLoading] = useState(true)
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [activityMap, setActivityMap] = useState<Record<string, { count: number; latest?: { type: string; title: string } }>>({})
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

    // Fetch latest activity per lead
    if (data && data.length > 0) {
      const leadIds = data.map((l: any) => l.id)
      const { data: activities } = await supabase
        .from('activity_logs')
        .select('lead_id, activity_type, title')
        .in('lead_id', leadIds)
        .order('performed_at', { ascending: false })

      const map: Record<string, { count: number; latest?: { type: string; title: string } }> = {}
      ;(activities || []).forEach((a: any) => {
        if (!map[a.lead_id]) {
          map[a.lead_id] = { count: 0, latest: { type: a.activity_type, title: a.title } }
        }
        map[a.lead_id].count++
      })
      setActivityMap(map)
    }

    setLoading(false)
  }

  const getLeadsByStage = (stage: string) =>
    leads.filter((l) => l.stage === stage)

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
    if (newStage === '계약' || newStage === '도입완료') {
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

  // Stats for header
  const overdueTotal = leads.filter(l => isOverdue(l.next_action_date)).length
  const urgentTotal = leads.filter(l => l.priority === '긴급').length

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">파이프라인 보드</h1>
          {(overdueTotal > 0 || urgentTotal > 0) && (
            <p className="text-sm text-gray-500 mt-1">
              {urgentTotal > 0 && (
                <span className="text-red-600 mr-3">
                  긴급 {urgentTotal}건
                </span>
              )}
              {overdueTotal > 0 && (
                <span className="text-red-500">
                  <AlertCircle className="w-3.5 h-3.5 inline mr-0.5" />
                  기한초과 {overdueTotal}건
                </span>
              )}
            </p>
          )}
        </div>
        <div className="flex gap-2">
          <Link href="/pipeline/list">
            <Button variant="secondary" size="sm">리스트뷰</Button>
          </Link>
          <Link href="/pipeline/new">
            <Button size="sm">
              <Plus className="w-4 h-4 mr-1" /> 새 리드
            </Button>
          </Link>
        </div>
      </div>

      <div className="flex gap-4 overflow-x-auto pb-4">
        {STAGES.map((stage) => {
          const stageLeads = getLeadsByStage(stage)
          const stageOverdue = stageLeads.filter(l => isOverdue(l.next_action_date)).length
          return (
            <div
              key={stage}
              onDragOver={handleDragOver}
              onDrop={(e) => handleDrop(e, stage)}
              className="flex-shrink-0 w-72 bg-gray-100 rounded-xl p-3"
            >
              <div className="flex items-center justify-between mb-3 px-1">
                <div className="flex items-center gap-2">
                  <Badge className={STAGE_COLORS[stage]}>{stage}</Badge>
                  <span className="text-sm text-gray-500">{stageLeads.length}</span>
                </div>
                {stageOverdue > 0 && (
                  <span className="text-[10px] text-red-500 flex items-center gap-0.5">
                    <AlertCircle className="w-3 h-3" />
                    {stageOverdue}
                  </span>
                )}
              </div>

              <div className="space-y-2 min-h-[200px]">
                {stageLeads.map((lead) => (
                  <div
                    key={lead.id}
                    draggable
                    onDragStart={(e) => handleDragStart(e, lead.id)}
                    className={`rounded-lg p-3 shadow-sm cursor-grab active:cursor-grabbing hover:shadow-md transition-shadow ${
                      draggingId === lead.id ? 'opacity-50' : ''
                    } ${getCardBorderClass(lead)}`}
                  >
                    <Link href={`/pipeline/${lead.id}`} className="block">
                      {/* 상단: 우선순위 + 사업분류 */}
                      <div className="flex items-center gap-1.5 mb-1.5">
                        {lead.priority && lead.priority !== '중간' && (
                          <Badge className={`${PRIORITY_COLORS[lead.priority]} text-[10px] px-1.5 py-0 border`}>
                            {lead.priority}
                          </Badge>
                        )}
                        {lead.industry && (
                          <span className="text-[10px] text-gray-400">{lead.industry}</span>
                        )}
                        {/* Overdue indicator at top-right */}
                        {isOverdue(lead.next_action_date) && (
                          <span className="ml-auto" title="기한 초과">
                            <AlertCircle className="w-3.5 h-3.5 text-red-500" />
                          </span>
                        )}
                      </div>

                      {/* 회사명 */}
                      <p className="font-medium text-sm text-gray-900 mb-0.5">
                        {lead.company_name}
                      </p>

                      {/* 문의자 */}
                      {lead.contact_person && (
                        <p className="text-xs text-gray-500">
                          {lead.contact_person}
                          {lead.contact_position && <span className="text-gray-400"> · {lead.contact_position}</span>}
                        </p>
                      )}

                      {/* 다음 액션 */}
                      {lead.next_action && (
                        <p className={`text-xs mt-1.5 truncate ${
                          isOverdue(lead.next_action_date) ? 'text-red-600 font-medium' : 'text-blue-600'
                        }`} title={lead.next_action}>
                          → {lead.next_action}
                        </p>
                      )}

                      {/* 최신 활동 */}
                      {activityMap[lead.id]?.latest && (
                        <div className="flex items-center gap-1 mt-1.5 text-[10px] text-gray-400">
                          <span>{ACTIVITY_TYPE_ICONS[activityMap[lead.id].latest!.type] || '💬'}</span>
                          <span className="truncate">{activityMap[lead.id].latest!.title}</span>
                          {activityMap[lead.id].count > 1 && (
                            <span className="ml-auto bg-gray-100 text-gray-500 px-1 rounded text-[9px]">+{activityMap[lead.id].count - 1}</span>
                          )}
                        </div>
                      )}

                      {/* 하단: 날짜 + 담당자 */}
                      <div className="flex items-center justify-between mt-2">
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs text-gray-400">
                            {lead.inquiry_date ? formatDate(lead.inquiry_date, 'M/d') : formatDate(lead.created_at, 'M/d')}
                          </span>
                          {lead.next_action_date && (
                            <span className={`text-xs flex items-center gap-0.5 ${
                              isOverdue(lead.next_action_date) ? 'text-red-500 font-semibold' : 'text-gray-400'
                            }`}>
                              <Clock className="w-3 h-3" />
                              {formatDate(lead.next_action_date, 'M/d')}
                            </span>
                          )}
                        </div>
                        {lead.assigned_user && (
                          <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded">
                            {lead.assigned_user.name}
                          </span>
                        )}
                      </div>
                    </Link>
                  </div>
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
