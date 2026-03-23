'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Loading } from '@/components/ui/loading'
import { EmptyState } from '@/components/ui/empty-state'
import { STAGE_COLORS, PRIORITY_COLORS, formatDate } from '@/lib/utils'
import type { PipelineLead } from '@/types/database'
import { Plus, Search, GitBranch, AlertCircle, Clock, ChevronDown, ChevronUp } from 'lucide-react'

const STAGES = ['전체', '신규리드', '컨택', '미팅', '제안', '계약', '도입완료']
const PRIORITIES = ['전체', '긴급', '높음', '중간', '낮음']

function getActionDateClass(dateStr: string | null) {
  if (!dateStr) return ''
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const target = new Date(dateStr)
  const diff = Math.floor((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
  if (diff < 0) return 'text-red-600 font-semibold' // overdue
  if (diff === 0) return 'text-orange-600 font-semibold' // today
  if (diff <= 3) return 'text-yellow-600' // soon
  return 'text-gray-500'
}

export default function PipelineListPage() {
  const [leads, setLeads] = useState<PipelineLead[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [stageFilter, setStageFilter] = useState('전체')
  const [priorityFilter, setPriorityFilter] = useState('전체')
  const [sortField, setSortField] = useState<'next_action_date' | 'created_at'>('created_at')
  const [sortAsc, setSortAsc] = useState(false)
  const supabase = createClient()

  useEffect(() => {
    fetchLeads()
  }, [stageFilter])

  async function fetchLeads() {
    setLoading(true)
    let query = supabase
      .from('pipeline_leads')
      .select('*, assigned_user:users!pipeline_leads_assigned_to_fkey(id, name)')
      .order('created_at', { ascending: false })
      .limit(200)

    if (stageFilter !== '전체') {
      query = query.eq('stage', stageFilter)
    }

    const { data, error } = await query
    if (error) {
      console.error('Pipeline query error:', error)
      // Fallback without join
      const { data: fallback } = await supabase
        .from('pipeline_leads')
        .select('*')
        .order('created_at', { ascending: false })
      setLeads(fallback || [])
    } else {
      setLeads(data || [])
    }
    setLoading(false)
  }

  const filteredLeads = leads
    .filter((lead) => {
      const matchSearch =
        lead.company_name.toLowerCase().includes(search.toLowerCase()) ||
        (lead.contact_person || '').toLowerCase().includes(search.toLowerCase()) ||
        (lead.industry || '').toLowerCase().includes(search.toLowerCase())
      const matchPriority = priorityFilter === '전체' || lead.priority === priorityFilter
      return matchSearch && matchPriority
    })
    .sort((a, b) => {
      if (sortField === 'next_action_date') {
        const aVal = a.next_action_date || '9999-12-31'
        const bVal = b.next_action_date || '9999-12-31'
        return sortAsc ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal)
      }
      return sortAsc
        ? a.created_at.localeCompare(b.created_at)
        : b.created_at.localeCompare(a.created_at)
    })

  const toggleSort = (field: 'next_action_date' | 'created_at') => {
    if (sortField === field) setSortAsc(!sortAsc)
    else { setSortField(field); setSortAsc(true) }
  }

  const SortIcon = ({ field }: { field: string }) => {
    if (sortField !== field) return null
    return sortAsc ? <ChevronUp className="w-3 h-3 inline ml-0.5" /> : <ChevronDown className="w-3 h-3 inline ml-0.5" />
  }

  // Stats
  const overdueCount = leads.filter(l => {
    if (!l.next_action_date) return false
    return new Date(l.next_action_date) < new Date(new Date().toDateString())
  }).length

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">파이프라인 트래커</h1>
          <p className="text-sm text-gray-500 mt-1">
            총 {filteredLeads.length}건
            {overdueCount > 0 && (
              <span className="text-red-600 ml-2">
                <AlertCircle className="w-3.5 h-3.5 inline mr-0.5" />
                기한 초과 {overdueCount}건
              </span>
            )}
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/pipeline/board">
            <Button variant="secondary" size="sm">보드뷰</Button>
          </Link>
          <Link href="/pipeline/new">
            <Button size="sm">
              <Plus className="w-4 h-4 mr-1" /> 새 리드
            </Button>
          </Link>
        </div>
      </div>

      {/* 필터 */}
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <Input
            placeholder="회사명, 문의자, 사업분류 검색..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>
        <Select
          value={stageFilter}
          onChange={(e) => setStageFilter(e.target.value)}
          options={STAGES.map((s) => ({ value: s, label: s }))}
          className="w-32"
        />
        <Select
          value={priorityFilter}
          onChange={(e) => setPriorityFilter(e.target.value)}
          options={PRIORITIES.map((p) => ({ value: p, label: p === '전체' ? '우선순위' : p }))}
          className="w-32"
        />
      </div>

      {/* 테이블 */}
      {loading ? (
        <Loading />
      ) : filteredLeads.length === 0 ? (
        <EmptyState
          icon={GitBranch}
          title="리드가 없습니다"
          description="새 리드를 등록해보세요."
          action={
            <Link href="/pipeline/new">
              <Button size="sm">
                <Plus className="w-4 h-4 mr-1" /> 새 리드 등록
              </Button>
            </Link>
          }
        />
      ) : (
        <div className="table-container">
          <table className="data-table">
            <thead>
              <tr>
                <th className="w-12">No.</th>
                <th>단계</th>
                <th>우선순위</th>
                <th>회사명</th>
                <th>사업분류</th>
                <th>문의자</th>
                <th>연락처</th>
                <th>유입채널</th>
                <th
                  className="cursor-pointer select-none"
                  onClick={() => toggleSort('created_at')}
                >
                  유입일 <SortIcon field="created_at" />
                </th>
                <th>다음 액션</th>
                <th
                  className="cursor-pointer select-none"
                  onClick={() => toggleSort('next_action_date')}
                >
                  액션예정일 <SortIcon field="next_action_date" />
                </th>
                <th>담당자</th>
              </tr>
            </thead>
            <tbody>
              {filteredLeads.map((lead) => (
                <tr key={lead.id} className={
                  lead.priority === '긴급' ? 'bg-red-50/50' : ''
                }>
                  <td className="text-gray-400 text-xs">{lead.lead_number}</td>
                  <td>
                    <Badge className={`${STAGE_COLORS[lead.stage]} text-xs`}>{lead.stage}</Badge>
                  </td>
                  <td>
                    {lead.priority && (
                      <Badge className={`${PRIORITY_COLORS[lead.priority] || ''} text-xs border`}>
                        {lead.priority}
                      </Badge>
                    )}
                  </td>
                  <td>
                    <Link
                      href={`/pipeline/${lead.id}`}
                      className="font-medium text-primary-600 hover:underline"
                    >
                      {lead.company_name}
                    </Link>
                  </td>
                  <td className="text-gray-500 text-xs">{lead.industry || '-'}</td>
                  <td>
                    <div className="text-sm">{lead.contact_person || '-'}</div>
                    {lead.contact_position && (
                      <div className="text-xs text-gray-400">{lead.contact_position}</div>
                    )}
                  </td>
                  <td className="text-xs text-gray-500">{lead.contact_phone || '-'}</td>
                  <td className="text-xs text-gray-500">{lead.inquiry_channel || lead.inquiry_source || '-'}</td>
                  <td className="text-xs text-gray-500">
                    {lead.inquiry_date ? formatDate(lead.inquiry_date) : formatDate(lead.created_at)}
                  </td>
                  <td>
                    {lead.next_action ? (
                      <div className="text-xs text-gray-700 max-w-[140px] truncate" title={lead.next_action}>
                        {lead.next_action}
                      </div>
                    ) : (
                      <span className="text-xs text-gray-300">-</span>
                    )}
                  </td>
                  <td>
                    {lead.next_action_date ? (
                      <div className={`text-xs flex items-center gap-1 ${getActionDateClass(lead.next_action_date)}`}>
                        <Clock className="w-3 h-3" />
                        {formatDate(lead.next_action_date)}
                      </div>
                    ) : (
                      <span className="text-xs text-gray-300">-</span>
                    )}
                  </td>
                  <td className="text-xs text-gray-500">{lead.assigned_user?.name || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
