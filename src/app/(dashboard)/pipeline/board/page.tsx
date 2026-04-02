'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/hooks/useAuth'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Loading } from '@/components/ui/loading'
import { STAGE_COLORS, PRIORITY_COLORS, ACTIVITY_TYPE_ICONS, formatDate } from '@/lib/utils'
import type { PipelineLead } from '@/types/database'
import { toast } from 'sonner'
import { Plus, Clock, AlertCircle, Search, CheckSquare, Square, X, ArrowRight, UserPlus } from 'lucide-react'
import { syncLeadToAdPerformance } from '@/lib/sync-lead-to-ads'

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

function getCardBorderClass(lead: PipelineLead, isSelected: boolean) {
  if (isSelected) return 'border-2 border-primary-500 bg-primary-50/30 ring-1 ring-primary-200'
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
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [selectionMode, setSelectionMode] = useState(false)
  const [showStageMenu, setShowStageMenu] = useState(false)
  const [showAssignMenu, setShowAssignMenu] = useState(false)
  const [users, setUsers] = useState<{ id: string; name: string }[]>([])
  const [bulkLoading, setBulkLoading] = useState(false)
  const { user } = useAuth()
  const supabase = createClient()

  useEffect(() => {
    fetchLeads()
    fetchUsers()
  }, [])

  async function fetchUsers() {
    const { data } = await supabase.from('users').select('id, name').eq('is_active', true)
    setUsers(data || [])
  }

  async function fetchLeads() {
    const { data } = await supabase
      .from('pipeline_leads')
      .select('*, assigned_user:users!pipeline_leads_assigned_to_fkey(id, name)')
      .order('created_at', { ascending: false })

    setLeads(data || [])

    if (data && data.length > 0) {
      // Fetch all activity_logs with lead_id (not using .in() to avoid URL length limit with 700+ leads)
      const { data: activities } = await supabase
        .from('activity_logs')
        .select('lead_id, activity_type, title, performed_at')
        .not('lead_id', 'is', null)
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
    // 정렬: 액션일 기한초과 → 액션일 오늘/미래(날짜 순) → 액션일 없는 카드(생성일 역순)
    filtered.sort((a, b) => {
      const aDate = a.next_action_date
      const bDate = b.next_action_date
      // 둘 다 없으면 생성일 역순
      if (!aDate && !bDate) return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      // 액션일 있는 것이 위로
      if (!aDate) return 1
      if (!bDate) return -1
      // 둘 다 있으면 날짜 순 (가까운 순)
      return new Date(aDate).getTime() - new Date(bDate).getTime()
    })
    return filtered
  }

  // Selection handlers
  const toggleSelect = useCallback((leadId: string, e?: React.MouseEvent) => {
    e?.preventDefault()
    e?.stopPropagation()
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(leadId)) {
        next.delete(leadId)
      } else {
        next.add(leadId)
      }
      if (next.size === 0) setSelectionMode(false)
      return next
    })
  }, [])

  const toggleSelectAll = useCallback((stage: string) => {
    const stageLeads = getLeadsByStage(stage)
    const stageIds = stageLeads.map(l => l.id)
    const allSelected = stageIds.every(id => selectedIds.has(id))

    setSelectedIds(prev => {
      const next = new Set(prev)
      if (allSelected) {
        stageIds.forEach(id => next.delete(id))
      } else {
        stageIds.forEach(id => next.add(id))
      }
      if (next.size === 0) setSelectionMode(false)
      return next
    })
  }, [leads, searchQuery, selectedIds])

  const clearSelection = () => {
    setSelectedIds(new Set())
    setSelectionMode(false)
    setShowStageMenu(false)
    setShowAssignMenu(false)
  }

  // Bulk actions
  const bulkMoveStage = async (newStage: string) => {
    if (selectedIds.size === 0) return
    setBulkLoading(true)
    setShowStageMenu(false)

    const ids = Array.from(selectedIds)
    const selectedLeads = leads.filter(l => ids.includes(l.id))

    // Optimistic update
    setLeads(prev =>
      prev.map(l => ids.includes(l.id) ? { ...l, stage: newStage as PipelineLead['stage'] } : l)
    )

    // Record history for each lead
    if (user) {
      const historyRecords = selectedLeads
        .filter(l => l.stage !== newStage)
        .map(l => ({
          lead_id: l.id,
          field_changed: 'stage',
          old_value: l.stage,
          new_value: newStage,
          changed_by: user.id,
        }))
      if (historyRecords.length > 0) {
        await supabase.from('pipeline_history').insert(historyRecords)
      }
    }

    const updates: Record<string, unknown> = { stage: newStage }
    if (newStage === '도입직전' || newStage === '도입완료') {
      updates.converted_at = new Date().toISOString()
    }

    const { error } = await supabase
      .from('pipeline_leads')
      .update(updates)
      .in('id', ids)

    if (error) {
      toast.error('일괄 단계 변경에 실패했습니다.')
      fetchLeads()
    } else {
      toast.success(`${ids.length}건 → ${newStage} 이동 완료`)
    }

    setBulkLoading(false)
    clearSelection()
  }

  const bulkAssign = async (userId: string, userName: string) => {
    if (selectedIds.size === 0) return
    setBulkLoading(true)
    setShowAssignMenu(false)

    const ids = Array.from(selectedIds)

    // Optimistic update
    setLeads(prev =>
      prev.map(l => ids.includes(l.id) ? { ...l, assigned_to: userId, assigned_user: { ...l.assigned_user, id: userId, name: userName } as any } : l)
    )

    const { error } = await supabase
      .from('pipeline_leads')
      .update({ assigned_to: userId })
      .in('id', ids)

    if (error) {
      toast.error('일괄 담당자 변경에 실패했습니다.')
      fetchLeads()
    } else {
      toast.success(`${ids.length}건 담당자 → ${userName} 배정 완료`)
    }

    setBulkLoading(false)
    clearSelection()
  }

  const handleDragStart = (e: React.DragEvent, leadId: string) => {
    if (selectionMode) {
      e.preventDefault()
      return
    }
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
      // 도입완료 시 광고성과에 도입 데이터 반영
      if (newStage === '도입완료') {
        await syncLeadToAdPerformance(supabase, {
          inquiry_date: lead.inquiry_date || null,
          inquiry_channel: lead.inquiry_channel || '',
          inquiry_source: lead.inquiry_source || '',
          company_name: lead.company_name,
          stage: '도입완료',
        })
      }
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
          <button
            onClick={() => {
              if (selectionMode) {
                clearSelection()
              } else {
                setSelectionMode(true)
              }
            }}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg border transition-colors ${
              selectionMode
                ? 'bg-primary-50 border-primary-300 text-primary-700 font-medium'
                : 'border-gray-200 text-text-secondary hover:bg-gray-50'
            }`}
          >
            <CheckSquare className="w-3.5 h-3.5" />
            선택
          </button>
          <Link href="/pipeline/list">
            <Button variant="secondary" size="sm">리스트뷰</Button>
          </Link>
          <Link href="/pipeline/new">
            <Button size="sm" icon={<Plus className="w-4 h-4" />}>새 리드</Button>
          </Link>
        </div>
      </div>

      {/* Bulk action bar */}
      {selectedIds.size > 0 && (
        <div className="flex items-center gap-3 mb-3 px-4 py-2.5 bg-primary-50 border border-primary-200 rounded-xl flex-shrink-0 animate-in slide-in-from-top-2">
          <span className="text-sm font-semibold text-primary-700">
            {selectedIds.size}건 선택됨
          </span>
          <div className="h-4 w-px bg-primary-200" />

          {/* Stage move */}
          <div className="relative">
            <button
              onClick={() => { setShowStageMenu(!showStageMenu); setShowAssignMenu(false) }}
              disabled={bulkLoading}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-white border border-primary-200 rounded-lg hover:bg-primary-50 text-primary-700 font-medium disabled:opacity-50"
            >
              <ArrowRight className="w-3.5 h-3.5" />
              단계 이동
            </button>
            {showStageMenu && (
              <div className="absolute top-full left-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-50 py-1 min-w-[140px]">
                {STAGES.map(stage => (
                  <button
                    key={stage}
                    onClick={() => bulkMoveStage(stage)}
                    className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 flex items-center gap-2"
                  >
                    <span className={`w-2 h-2 rounded-full ${STAGE_COLUMN_COLORS[stage]?.bar || 'bg-gray-400'}`} />
                    {stage}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Assign */}
          <div className="relative">
            <button
              onClick={() => { setShowAssignMenu(!showAssignMenu); setShowStageMenu(false) }}
              disabled={bulkLoading}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-white border border-primary-200 rounded-lg hover:bg-primary-50 text-primary-700 font-medium disabled:opacity-50"
            >
              <UserPlus className="w-3.5 h-3.5" />
              담당자 배정
            </button>
            {showAssignMenu && (
              <div className="absolute top-full left-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-50 py-1 min-w-[140px]">
                {users.map(u => (
                  <button
                    key={u.id}
                    onClick={() => bulkAssign(u.id, u.name)}
                    className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50"
                  >
                    {u.name}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="ml-auto">
            <button
              onClick={clearSelection}
              className="flex items-center gap-1 px-2 py-1 text-xs text-text-tertiary hover:text-text-primary"
            >
              <X className="w-3.5 h-3.5" />
              선택 해제
            </button>
          </div>
        </div>
      )}

      {/* Board - scrollable area */}
      <div className="flex gap-3 overflow-x-auto flex-1 pb-2">
        {STAGES.map((stage) => {
          const stageLeads = getLeadsByStage(stage)
          const stageOverdue = stageLeads.filter(l => isOverdue(l.next_action_date)).length
          const colors = STAGE_COLUMN_COLORS[stage] || STAGE_COLUMN_COLORS['이탈']
          const stageIds = stageLeads.map(l => l.id)
          const allStageSelected = stageIds.length > 0 && stageIds.every(id => selectedIds.has(id))
          const someStageSelected = stageIds.some(id => selectedIds.has(id))
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
                    {selectionMode && stageLeads.length > 0 && (
                      <button
                        onClick={() => toggleSelectAll(stage)}
                        className="flex items-center"
                      >
                        {allStageSelected ? (
                          <CheckSquare className="w-4 h-4 text-primary-500" />
                        ) : someStageSelected ? (
                          <div className="w-4 h-4 border-2 border-primary-500 rounded bg-primary-100 flex items-center justify-center">
                            <div className="w-2 h-0.5 bg-primary-500 rounded" />
                          </div>
                        ) : (
                          <Square className="w-4 h-4 text-gray-400" />
                        )}
                      </button>
                    )}
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
                {stageLeads.map((lead) => {
                  const isSelected = selectedIds.has(lead.id)
                  return (
                    <div
                      key={lead.id}
                      draggable={!selectionMode}
                      onDragStart={(e) => handleDragStart(e, lead.id)}
                      onClick={selectionMode ? (e) => toggleSelect(lead.id, e) : undefined}
                      className={`rounded-lg p-3 shadow-sm transition-all ${
                        selectionMode ? 'cursor-pointer' : 'cursor-grab active:cursor-grabbing'
                      } hover:shadow-md ${
                        draggingId === lead.id ? 'opacity-40 scale-95' : ''
                      } ${getCardBorderClass(lead, isSelected)}`}
                    >
                      {selectionMode ? (
                        // Selection mode: card content without Link
                        <div>
                          {/* Checkbox + top row */}
                          <div className="flex items-center gap-1.5 mb-1.5">
                            <span className="shrink-0" onClick={(e) => { e.stopPropagation(); toggleSelect(lead.id, e) }}>
                              {isSelected ? (
                                <CheckSquare className="w-4 h-4 text-primary-500" />
                              ) : (
                                <Square className="w-4 h-4 text-gray-300" />
                              )}
                            </span>
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
                          <p className="font-semibold text-sm text-text-primary mb-0.5">{lead.company_name}</p>
                          {lead.contact_person && (
                            <p className="text-xs text-text-secondary">
                              {lead.contact_person}
                              {lead.contact_position && <span className="text-text-tertiary"> · {lead.contact_position}</span>}
                            </p>
                          )}
                          <div className="flex items-center justify-between mt-2 pt-2 border-t border-border-light">
                            <span className="text-[11px] text-text-tertiary">
                              {lead.inquiry_date ? formatDate(lead.inquiry_date, 'M/d') : formatDate(lead.created_at, 'M/d')}
                            </span>
                            {lead.assigned_user && (
                              <span className="text-[11px] bg-surface-tertiary text-text-secondary px-1.5 py-0.5 rounded-md font-medium">
                                {lead.assigned_user.name}
                              </span>
                            )}
                          </div>
                        </div>
                      ) : (
                        // Normal mode: card with Link
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
                      )}
                    </div>
                  )
                })}

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

      {/* Click outside to close menus */}
      {(showStageMenu || showAssignMenu) && (
        <div
          className="fixed inset-0 z-40"
          onClick={() => { setShowStageMenu(false); setShowAssignMenu(false) }}
        />
      )}
    </div>
  )
}
