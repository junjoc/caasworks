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
import {
  VOC_CATEGORY_LABELS,
  VOC_PRIORITY_LABELS,
  VOC_PRIORITY_COLORS,
  VOC_STATUS_LABELS,
  formatDate,
} from '@/lib/utils'
import type { VocTicket } from '@/types/database'
import { Plus, Search, MessageSquare } from 'lucide-react'

export default function VocListPage() {
  const [tickets, setTickets] = useState<VocTicket[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const supabase = createClient()

  useEffect(() => {
    fetchTickets()
  }, [statusFilter])

  async function fetchTickets() {
    setLoading(true)
    let query = supabase
      .from('voc_tickets')
      .select('*, customer:customers(company_name), assigned_user:users!voc_tickets_assigned_to_fkey(name)')
      .order('created_at', { ascending: false })

    if (statusFilter) {
      query = query.eq('status', statusFilter)
    }

    const { data } = await query
    setTickets(data || [])
    setLoading(false)
  }

  const filtered = tickets.filter((t) =>
    t.title.toLowerCase().includes(search.toLowerCase()) ||
    (t.customer?.company_name || '').toLowerCase().includes(search.toLowerCase())
  )

  const statusOptions = [
    { value: '', label: '전체 상태' },
    ...Object.entries(VOC_STATUS_LABELS).map(([v, l]) => ({ value: v, label: l })),
  ]

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">VoC/CS</h1>
        <Link href="/voc/new">
          <Button size="sm">
            <Plus className="w-4 h-4 mr-1" /> 새 티켓
          </Button>
        </Link>
      </div>

      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-placeholder" />
          <Input
            placeholder="제목 또는 고객사 검색..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>
        <Select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          options={statusOptions}
          className="w-40"
        />
      </div>

      {loading ? (
        <Loading />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={MessageSquare}
          title="VoC 티켓이 없습니다"
          action={
            <Link href="/voc/new">
              <Button size="sm"><Plus className="w-4 h-4 mr-1" /> 새 티켓 등록</Button>
            </Link>
          }
        />
      ) : (
        <div className="table-container">
          <table className="data-table">
            <thead>
              <tr>
                <th style={{ width: '7%' }}>No.</th>
                <th style={{ width: '25%' }}>제목</th>
                <th style={{ width: '15%' }}>고객사</th>
                <th style={{ width: '10%' }}>분류</th>
                <th style={{ width: '10%' }}>우선순위</th>
                <th style={{ width: '10%' }}>상태</th>
                <th style={{ width: '10%' }}>담당자</th>
                <th style={{ width: '13%' }}>등록일</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((t) => (
                <tr key={t.id}>
                  <td className="text-text-tertiary">{t.ticket_number}</td>
                  <td className="col-truncate">
                    <Link href={`/voc/${t.id}`} className="font-medium text-primary-400 hover:text-primary-500 hover:underline">
                      {t.title}
                    </Link>
                  </td>
                  <td className="col-truncate">{t.customer?.company_name || '-'}</td>
                  <td className="text-text-secondary">{VOC_CATEGORY_LABELS[t.category]}</td>
                  <td>
                    <Badge className={VOC_PRIORITY_COLORS[t.priority]}>
                      {VOC_PRIORITY_LABELS[t.priority]}
                    </Badge>
                  </td>
                  <td>
                    <Badge className="badge-gray">
                      {VOC_STATUS_LABELS[t.status]}
                    </Badge>
                  </td>
                  <td className="text-text-secondary">{t.assigned_user?.name || '-'}</td>
                  <td className="text-text-tertiary">{formatDate(t.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
