'use client'

import { useEffect, useState, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { DateRangePicker, type DateRange } from '@/components/ui/date-range-picker'
import { Select } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Loading } from '@/components/ui/loading'
import { EmptyState } from '@/components/ui/empty-state'
import {
  formatDate,
  formatNumber,
  ACTIVITY_TYPE_LABELS,
  ACTIVITY_TYPE_ICONS,
  ACTIVITY_TYPE_COLORS,
  ACTIVITY_TYPE_OPTIONS,
} from '@/lib/utils'
import type { ActivityLog, User } from '@/types/database'
import {
  Activity, Search, Calendar, Filter, Clock,
  Phone, Mail, Users, FileText, ChevronDown, ChevronUp, BarChart3
} from 'lucide-react'

export default function ActivitiesPage() {
  const [activities, setActivities] = useState<ActivityLog[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('전체')
  const [dateRange, setDateRange] = useState<DateRange>({ from: '', to: '' })
  const [users, setUsers] = useState<{ id: string; name: string }[]>([])
  const [userFilter, setUserFilter] = useState('전체')
  const supabase = createClient()

  useEffect(() => {
    fetchActivities()
    fetchUsers()
  }, [])

  async function fetchActivities() {
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('activity_logs')
        .select('*, performed_by_user:users!activity_logs_performed_by_fkey(id, name)')
        .order('performed_at', { ascending: false })
        .limit(500)

      if (error) {
        // fallback without join
        const { data: fallback } = await supabase
          .from('activity_logs')
          .select('*')
          .order('performed_at', { ascending: false })
          .limit(500)
        setActivities(fallback || [])
      } else {
        setActivities(data || [])
      }
    } catch {
      setActivities([])
    }
    setLoading(false)
  }

  async function fetchUsers() {
    const { data } = await supabase.from('users').select('id, name').eq('is_active', true)
    setUsers(data || [])
  }

  const filtered = useMemo(() => {
    return activities.filter(a => {
      const q = search.toLowerCase()
      const matchSearch = !q ||
        (a.title || '').toLowerCase().includes(q) ||
        (a.description || '').toLowerCase().includes(q)
      const matchType = typeFilter === '전체' || a.activity_type === typeFilter
      const matchUser = userFilter === '전체' || a.performed_by === userFilter
      const actDate = a.performed_at.split('T')[0]
      const matchDateFrom = !dateRange.from || actDate >= dateRange.from
      const matchDateTo = !dateRange.to || actDate <= dateRange.to
      return matchSearch && matchType && matchUser && matchDateFrom && matchDateTo
    })
  }, [activities, search, typeFilter, userFilter, dateRange])

  // Summary stats
  const stats = useMemo(() => {
    const today = new Date().toISOString().split('T')[0]
    const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0]

    const todayCount = activities.filter(a => a.performed_at.startsWith(today)).length
    const weekCount = activities.filter(a => a.performed_at.split('T')[0] >= weekAgo).length

    const byType: Record<string, number> = {}
    activities.filter(a => a.performed_at.split('T')[0] >= weekAgo).forEach(a => {
      byType[a.activity_type] = (byType[a.activity_type] || 0) + 1
    })

    const topTypes = Object.entries(byType)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)

    return { todayCount, weekCount, byType, topTypes }
  }, [activities])

  // Group by date for timeline view
  const grouped = useMemo(() => {
    const groups: Record<string, typeof filtered> = {}
    filtered.forEach(a => {
      const date = a.performed_at.split('T')[0]
      if (!groups[date]) groups[date] = []
      groups[date].push(a)
    })
    return Object.entries(groups).sort(([a], [b]) => b.localeCompare(a))
  }, [filtered])

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">활동 로그</h1>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <div className="card p-4">
          <div className="flex items-center gap-2 mb-1">
            <Clock className="w-4 h-4 text-blue-500" />
            <span className="text-xs text-text-secondary">오늘</span>
          </div>
          <p className="text-2xl font-bold">{stats.todayCount}건</p>
        </div>
        <div className="card p-4">
          <div className="flex items-center gap-2 mb-1">
            <Calendar className="w-4 h-4 text-green-500" />
            <span className="text-xs text-text-secondary">이번 주</span>
          </div>
          <p className="text-2xl font-bold">{stats.weekCount}건</p>
        </div>
        <div className="card p-4 col-span-2">
          <div className="flex items-center gap-2 mb-2">
            <BarChart3 className="w-4 h-4 text-purple-500" />
            <span className="text-xs text-text-secondary">이번 주 유형별 (상위 5)</span>
          </div>
          <div className="flex gap-2 flex-wrap">
            {stats.topTypes.map(([type, count]) => (
              <span key={type} className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded bg-gray-50">
                <span>{ACTIVITY_TYPE_ICONS[type] || ''}</span>
                <span>{ACTIVITY_TYPE_LABELS[type] || type}</span>
                <span className="font-bold text-text-primary">{count}</span>
              </span>
            ))}
            {stats.topTypes.length === 0 && (
              <span className="text-xs text-text-secondary">데이터 없음</span>
            )}
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-placeholder" />
          <input className="input-base pl-9" placeholder="활동 제목, 내용 검색..."
            value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <select className="input-base !w-auto text-sm" value={typeFilter}
          onChange={e => setTypeFilter(e.target.value)}>
          <option value="전체">활동 유형 전체</option>
          {ACTIVITY_TYPE_OPTIONS.map(opt => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
        {users.length > 0 && (
          <select className="input-base !w-auto text-sm" value={userFilter}
            onChange={e => setUserFilter(e.target.value)}>
            <option value="전체">담당자 전체</option>
            {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
        )}
        <DateRangePicker value={dateRange} onChange={setDateRange} />
      </div>

      {/* Results count */}
      <p className="text-xs text-text-secondary mb-3">
        {filtered.length}건의 활동{search || typeFilter !== '전체' || userFilter !== '전체' || dateRange.from || dateRange.to ? ' (필터 적용)' : ''}
      </p>

      {/* Timeline View */}
      {loading ? <Loading /> : grouped.length === 0 ? (
        <EmptyState icon={Activity} title="활동 기록이 없습니다"
          description="파이프라인에서 활동을 기록하면 여기에 표시됩니다" />
      ) : (
        <div className="space-y-6">
          {grouped.map(([date, items]) => (
            <div key={date}>
              <div className="flex items-center gap-2 mb-3">
                <span className="text-sm font-semibold text-text-primary">
                  {formatDate(date, 'yyyy-MM-dd (EEEE)')}
                </span>
                <span className="text-xs text-text-secondary bg-gray-100 px-2 py-0.5 rounded-full">
                  {items.length}건
                </span>
              </div>
              <div className="space-y-1 pl-4 border-l-2 border-gray-200">
                {items.map(activity => {
                  const colorClass = ACTIVITY_TYPE_COLORS[activity.activity_type] || 'bg-surface-tertiary border-border text-text-secondary'
                  const icon = ACTIVITY_TYPE_ICONS[activity.activity_type] || ''
                  const label = ACTIVITY_TYPE_LABELS[activity.activity_type] || activity.activity_type
                  const time = formatDate(activity.performed_at, 'HH:mm')
                  const userName = (activity as any).performed_by_user?.name || ''

                  return (
                    <div key={activity.id}
                      className="relative flex items-start gap-3 py-2 pl-4 -ml-[9px]">
                      {/* Timeline dot */}
                      <div className={`w-4 h-4 rounded-full border-2 flex-shrink-0 mt-0.5 flex items-center justify-center text-[8px] ${colorClass}`}>
                        <span>{icon}</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-text-secondary">{time}</span>
                          <Badge className={`${colorClass} border text-xs`}>{label}</Badge>
                          {userName && (
                            <span className="text-xs text-text-secondary">{userName}</span>
                          )}
                        </div>
                        {activity.title && (
                          <p className="text-sm text-text-primary mt-0.5 font-medium">
                            {activity.title}
                          </p>
                        )}
                        {activity.description && (
                          <p className="text-xs text-text-secondary mt-0.5 line-clamp-2">
                            {activity.description}
                          </p>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
