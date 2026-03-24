'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Select } from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Loading } from '@/components/ui/loading'
import { EmptyState } from '@/components/ui/empty-state'
import { formatCurrency, formatDate, formatNumber } from '@/lib/utils'
import type { Quotation, QuotationStatus } from '@/types/database'

interface UserOption {
  id: string
  name: string
}
import { useAuth } from '@/hooks/useAuth'
import { toast } from 'sonner'
import {
  Plus, FileText, Search, Copy, GitBranch, Trash2, Eye,
  ChevronLeft, ChevronRight, MoreHorizontal
} from 'lucide-react'

const STATUS_LABELS: Record<QuotationStatus, string> = {
  draft: '초안',
  sent: '발송',
  accepted: '수락',
  rejected: '거절',
  expired: '만료',
}

const STATUS_COLORS: Record<QuotationStatus, string> = {
  draft: 'bg-gray-100 text-gray-700',
  sent: 'bg-blue-100 text-blue-700',
  accepted: 'bg-green-100 text-green-700',
  rejected: 'bg-red-100 text-red-700',
  expired: 'bg-orange-100 text-orange-700',
}

const TYPE_LABELS: Record<string, string> = {
  '구매': '구매',
  '임대': '임대',
  '혼합': '혼합',
  '구독': '구독',
}

const PAGE_SIZE = 20

export default function QuotationsPage() {
  const router = useRouter()
  const { user } = useAuth()
  const supabase = createClient()

  const [quotations, setQuotations] = useState<Quotation[]>([])
  const [users, setUsers] = useState<UserOption[]>([])
  const [loading, setLoading] = useState(true)
  const [totalCount, setTotalCount] = useState(0)
  const [page, setPage] = useState(0)

  // Filters
  const [statusFilter, setStatusFilter] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [assigneeFilter, setAssigneeFilter] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [searchInput, setSearchInput] = useState('')

  // Action menu
  const [activeMenu, setActiveMenu] = useState<string | null>(null)

  const fetchUsers = useCallback(async () => {
    const { data } = await supabase.from('users').select('id, name').eq('is_active', true)
    setUsers(data || [])
  }, [supabase])

  const fetchQuotations = useCallback(async () => {
    setLoading(true)

    let countQuery = supabase
      .from('quotations')
      .select('id', { count: 'exact', head: true })

    let query = supabase
      .from('quotations')
      .select('*, creator:users!quotations_created_by_fkey(id, name), lead:pipeline_leads(id, company_name)')
      .order('created_at', { ascending: false })
      .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1)

    if (statusFilter) {
      query = query.eq('status', statusFilter)
      countQuery = countQuery.eq('status', statusFilter)
    }
    if (typeFilter) {
      query = query.eq('quotation_type', typeFilter)
      countQuery = countQuery.eq('quotation_type', typeFilter)
    }
    if (assigneeFilter) {
      query = query.eq('created_by', assigneeFilter)
      countQuery = countQuery.eq('created_by', assigneeFilter)
    }
    if (searchQuery) {
      const search = `%${searchQuery}%`
      query = query.or(`customer_name.ilike.${search},quotation_number.ilike.${search},project_name.ilike.${search}`)
      countQuery = countQuery.or(`customer_name.ilike.${search},quotation_number.ilike.${search},project_name.ilike.${search}`)
    }

    const [{ data }, { count }] = await Promise.all([query, countQuery])
    setQuotations((data as Quotation[]) || [])
    setTotalCount(count || 0)
    setLoading(false)
  }, [supabase, page, statusFilter, typeFilter, assigneeFilter, searchQuery])

  useEffect(() => {
    fetchUsers()
  }, [fetchUsers])

  useEffect(() => {
    fetchQuotations()
  }, [fetchQuotations])

  useEffect(() => {
    setPage(0)
  }, [statusFilter, typeFilter, assigneeFilter, searchQuery])

  const handleSearch = () => {
    setSearchQuery(searchInput)
  }

  const handleDelete = async (id: string) => {
    if (!confirm('이 견적서를 삭제하시겠습니까?')) return
    const { error } = await supabase.from('quotations').delete().eq('id', id)
    if (error) {
      toast.error('삭제 실패')
    } else {
      toast.success('삭제되었습니다')
      fetchQuotations()
    }
    setActiveMenu(null)
  }

  const handleCopy = async (q: Quotation) => {
    router.push(`/quotations/new?copy_from=${q.id}`)
    setActiveMenu(null)
  }

  const handleNewVersion = async (q: Quotation) => {
    router.push(`/quotations/new?new_version_of=${q.id}`)
    setActiveMenu(null)
  }

  const totalPages = Math.ceil(totalCount / PAGE_SIZE)

  const statusOptions = [
    { value: '', label: '전체 상태' },
    ...Object.entries(STATUS_LABELS).map(([v, l]) => ({ value: v, label: l })),
  ]
  const typeOptions = [
    { value: '', label: '전체 유형' },
    ...Object.entries(TYPE_LABELS).map(([v, l]) => ({ value: v, label: l })),
  ]
  const assigneeOptions = [
    { value: '', label: '전체 담당자' },
    ...users.map((u) => ({ value: u.id, label: u.name })),
  ]

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">견적서 관리</h1>
        <Link href="/quotations/new">
          <Button size="sm"><Plus className="w-4 h-4 mr-1" /> 견적서 작성</Button>
        </Link>
      </div>

      {/* Filters */}
      <div className="mb-4 flex flex-wrap gap-3 items-end">
        <Select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          options={statusOptions}
          className="w-36"
        />
        <Select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          options={typeOptions}
          className="w-36"
        />
        <Select
          value={assigneeFilter}
          onChange={(e) => setAssigneeFilter(e.target.value)}
          options={assigneeOptions}
          className="w-40"
        />
        <div className="flex gap-2">
          <Input
            placeholder="견적번호, 수신처, 공사명 검색"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            className="w-64"
          />
          <Button variant="secondary" size="sm" onClick={handleSearch}>
            <Search className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Table */}
      {loading ? (
        <Loading />
      ) : quotations.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="견적서가 없습니다"
          description="새 견적서를 작성해보세요"
          action={
            <Link href="/quotations/new">
              <Button size="sm"><Plus className="w-4 h-4 mr-1" /> 견적서 작성</Button>
            </Link>
          }
        />
      ) : (
        <>
          <div className="card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-gray-50">
                    <th className="text-left px-4 py-3 font-medium text-gray-600">견적번호</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">수신처</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">공사명</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">유형</th>
                    <th className="text-center px-4 py-3 font-medium text-gray-600">버전</th>
                    <th className="text-right px-4 py-3 font-medium text-gray-600">합계금액</th>
                    <th className="text-center px-4 py-3 font-medium text-gray-600">상태</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">담당자</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">견적일</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">유효기간</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">리드</th>
                    <th className="text-center px-4 py-3 font-medium text-gray-600 w-12"></th>
                  </tr>
                </thead>
                <tbody>
                  {quotations.map((q) => (
                    <tr
                      key={q.id}
                      className="border-b hover:bg-gray-50 cursor-pointer"
                      onClick={() => router.push(`/quotations/${q.id}`)}
                    >
                      <td className="px-4 py-3 font-mono text-xs text-primary-600 font-medium">
                        {q.quotation_number}
                      </td>
                      <td className="px-4 py-3 font-medium">{q.customer_name}</td>
                      <td className="px-4 py-3 text-gray-600 max-w-[200px] truncate">
                        {q.project_name || '-'}
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-xs px-2 py-0.5 rounded bg-gray-100 text-gray-700">
                          {q.quotation_type}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center text-gray-500">v{q.version}</td>
                      <td className="px-4 py-3 text-right font-medium">{formatCurrency(q.total)}</td>
                      <td className="px-4 py-3 text-center">
                        <Badge className={STATUS_COLORS[q.status]}>
                          {STATUS_LABELS[q.status]}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-gray-600">{q.creator?.name || '-'}</td>
                      <td className="px-4 py-3 text-gray-500 text-xs">
                        {formatDate(q.quotation_date)}
                      </td>
                      <td className="px-4 py-3 text-gray-500 text-xs">
                        {q.valid_until ? formatDate(q.valid_until) : '-'}
                      </td>
                      <td className="px-4 py-3">
                        {q.lead ? (
                          <Link
                            href={`/pipeline/${q.lead_id}`}
                            onClick={(e) => e.stopPropagation()}
                            className="text-xs text-primary-600 hover:underline flex items-center gap-1"
                          >
                            <GitBranch className="w-3 h-3" />
                            {(q.lead as any)?.company_name || '리드'}
                          </Link>
                        ) : (
                          <span className="text-xs text-gray-400">-</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center relative">
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            setActiveMenu(activeMenu === q.id ? null : q.id)
                          }}
                          className="p-1 rounded hover:bg-gray-200"
                        >
                          <MoreHorizontal className="w-4 h-4 text-gray-500" />
                        </button>
                        {activeMenu === q.id && (
                          <div className="absolute right-4 top-10 z-20 bg-white border rounded-lg shadow-lg py-1 min-w-[140px]">
                            <button
                              onClick={(e) => { e.stopPropagation(); router.push(`/quotations/${q.id}`) }}
                              className="w-full text-left px-4 py-2 text-sm hover:bg-gray-50 flex items-center gap-2"
                            >
                              <Eye className="w-4 h-4" /> 상세보기
                            </button>
                            <button
                              onClick={(e) => { e.stopPropagation(); handleCopy(q) }}
                              className="w-full text-left px-4 py-2 text-sm hover:bg-gray-50 flex items-center gap-2"
                            >
                              <Copy className="w-4 h-4" /> 복사
                            </button>
                            <button
                              onClick={(e) => { e.stopPropagation(); handleNewVersion(q) }}
                              className="w-full text-left px-4 py-2 text-sm hover:bg-gray-50 flex items-center gap-2"
                            >
                              <GitBranch className="w-4 h-4" /> 새 버전
                            </button>
                            <hr className="my-1" />
                            <button
                              onClick={(e) => { e.stopPropagation(); handleDelete(q.id) }}
                              className="w-full text-left px-4 py-2 text-sm hover:bg-red-50 text-red-600 flex items-center gap-2"
                            >
                              <Trash2 className="w-4 h-4" /> 삭제
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-4 text-sm text-gray-600">
              <span>총 {formatNumber(totalCount)}건</span>
              <div className="flex items-center gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={page === 0}
                  onClick={() => setPage((p) => p - 1)}
                >
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                <span>{page + 1} / {totalPages}</span>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={page >= totalPages - 1}
                  onClick={() => setPage((p) => p + 1)}
                >
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            </div>
          )}
        </>
      )}

      {/* Click outside to close menu */}
      {activeMenu && (
        <div className="fixed inset-0 z-10" onClick={() => setActiveMenu(null)} />
      )}
    </div>
  )
}
