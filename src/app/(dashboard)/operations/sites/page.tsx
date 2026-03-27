'use client'

import { useEffect, useState, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Loading } from '@/components/ui/loading'
import { EmptyState } from '@/components/ui/empty-state'
import { formatDate } from '@/lib/utils'
import {
  MapPin, Search, Building2, Calendar, Filter, Map
} from 'lucide-react'

interface SiteProject {
  id: string
  project_name: string
  customer_id: string
  service_type: string | null
  site_category: string | null
  address: string | null
  project_start: string | null
  project_end: string | null
  status: string
  solutions: string | null
  notes: string | null
  customer?: {
    company_name: string
  }
}

const STATUS_COLORS: Record<string, string> = {
  active: 'bg-green-100 text-green-700',
  pending: 'bg-yellow-100 text-yellow-700',
  completed: 'bg-surface-tertiary text-gray-600',
  suspended: 'bg-red-100 text-red-700',
}

const STATUS_LABELS: Record<string, string> = {
  active: '운영중',
  pending: '대기',
  completed: '완료',
  suspended: '중단',
}

export default function SitesPage() {
  const [projects, setProjects] = useState<SiteProject[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('전체')
  const [serviceFilter, setServiceFilter] = useState('전체')
  const supabase = createClient()

  useEffect(() => {
    async function fetch() {
      const { data, error } = await supabase
        .from('projects')
        .select('*, customer:customers(company_name)')
        .order('project_start', { ascending: false })

      if (error) {
        // fallback without join
        const { data: fallback } = await supabase
          .from('projects')
          .select('*')
          .order('project_start', { ascending: false })
        setProjects(fallback || [])
      } else {
        setProjects(data || [])
      }
      setLoading(false)
    }
    fetch()
  }, [])

  const serviceTypes = useMemo(() => {
    const set = new Set<string>()
    projects.forEach(p => { if (p.service_type) set.add(p.service_type) })
    return Array.from(set)
  }, [projects])

  const filtered = useMemo(() => {
    return projects.filter(p => {
      const q = search.toLowerCase()
      const matchSearch = !q ||
        p.project_name.toLowerCase().includes(q) ||
        (p.customer?.company_name || '').toLowerCase().includes(q) ||
        (p.address || '').toLowerCase().includes(q)
      const matchStatus = statusFilter === '전체' || p.status === statusFilter
      const matchService = serviceFilter === '전체' || p.service_type === serviceFilter
      return matchSearch && matchStatus && matchService
    })
  }, [projects, search, statusFilter, serviceFilter])

  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = { active: 0, pending: 0, completed: 0, suspended: 0 }
    projects.forEach(p => { counts[p.status] = (counts[p.status] || 0) + 1 })
    return counts
  }, [projects])

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">현장 관리</h1>
      </div>

      {/* Status Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <div className="card p-4">
          <span className="text-xs text-text-secondary">전체 현장</span>
          <p className="text-2xl font-bold text-text-primary mt-1">{projects.length}</p>
        </div>
        <div className="card p-4">
          <span className="text-xs text-text-secondary">운영중</span>
          <p className="text-2xl font-bold text-status-green mt-1">{statusCounts.active || 0}</p>
        </div>
        <div className="card p-4">
          <span className="text-xs text-text-secondary">대기</span>
          <p className="text-2xl font-bold text-status-yellow mt-1">{statusCounts.pending || 0}</p>
        </div>
        <div className="card p-4">
          <span className="text-xs text-text-secondary">완료</span>
          <p className="text-2xl font-bold text-text-secondary mt-1">{statusCounts.completed || 0}</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-placeholder" />
          <input
            className="input-base pl-9"
            placeholder="현장명, 고객사, 주소 검색..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <div className="flex gap-1 bg-surface-tertiary rounded-lg p-1">
          {['전체', 'active', 'pending', 'completed'].map(s => (
            <button key={s} onClick={() => setStatusFilter(s)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                statusFilter === s ? 'bg-white text-text-primary shadow-sm' : 'text-text-secondary hover:text-text-primary'
              }`}>
              {s === '전체' ? '전체' : STATUS_LABELS[s] || s}
            </button>
          ))}
        </div>
        {serviceTypes.length > 0 && (
          <select className="input-base !w-auto text-sm"
            value={serviceFilter} onChange={e => setServiceFilter(e.target.value)}>
            <option value="전체">서비스 전체</option>
            {serviceTypes.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        )}
      </div>

      {/* Map placeholder */}
      <div className="card p-6 mb-4 flex items-center justify-center bg-surface-tertiary border-dashed">
        <div className="text-center text-text-secondary">
          <Map className="w-8 h-8 mx-auto mb-2 text-text-placeholder" />
          <p className="text-sm">지도 연동 예정</p>
        </div>
      </div>

      {/* Table */}
      {loading ? <Loading /> : filtered.length === 0 ? (
        <EmptyState icon={Building2} title="현장 데이터가 없습니다"
          description="프로젝트를 등록하면 여기에 표시됩니다" />
      ) : (
        <div className="table-container">
          <table className="data-table">
            <thead>
              <tr>
                <th style={{ width: '18%' }}>현장명</th>
                <th style={{ width: '14%' }}>고객사</th>
                <th style={{ width: '10%' }}>서비스</th>
                <th style={{ width: '14%' }}>솔루션</th>
                <th style={{ width: '20%' }}>주소</th>
                <th style={{ width: '14%' }}>기간</th>
                <th style={{ width: '10%' }}>상태</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(p => (
                <tr key={p.id}>
                  <td className="font-medium text-text-primary">{p.project_name}</td>
                  <td>{p.customer?.company_name || '-'}</td>
                  <td className="text-text-secondary">{p.service_type || '-'}</td>
                  <td className="text-text-secondary text-xs max-w-[150px] truncate">{p.solutions || '-'}</td>
                  <td className="text-text-secondary text-xs max-w-[200px] truncate">
                    {p.address ? (
                      <span className="flex items-center gap-1">
                        <MapPin className="w-3 h-3 flex-shrink-0" />
                        {p.address}
                      </span>
                    ) : '-'}
                  </td>
                  <td className="text-xs text-text-secondary whitespace-nowrap">
                    {p.project_start ? formatDate(p.project_start) : '-'}
                    {p.project_end ? ` ~ ${formatDate(p.project_end)}` : ''}
                  </td>
                  <td>
                    <Badge className={STATUS_COLORS[p.status] || 'bg-surface-tertiary text-gray-600'}>
                      {STATUS_LABELS[p.status] || p.status}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
