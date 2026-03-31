'use client'

import { useEffect, useState, useMemo, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Modal } from '@/components/ui/modal'
import { Loading } from '@/components/ui/loading'
import { EmptyState } from '@/components/ui/empty-state'
import { formatNumber } from '@/lib/utils'
import { toast } from 'sonner'
import {
  FileText, RefreshCw, Plus, Eye, Users, Clock,
  ExternalLink, ArrowUpDown
} from 'lucide-react'

interface ContentItem {
  id: string
  title: string
  url: string | null
  page_path: string | null
  channel: string
  page_views: number
  sessions: number
  active_users: number
  published_at: string | null
  last_synced_at: string | null
  is_manual: boolean
  created_at: string
}

type SortField = 'page_views' | 'published_at' | 'sessions'
type ChannelFilter = 'all' | 'caasworks_blog' | 'naver_blog'

const CHANNEL_LABELS: Record<string, string> = {
  caasworks_blog: '카스웍스',
  naver_blog: '네이버',
}

const emptyForm = {
  title: '',
  url: '',
  channel: 'naver_blog',
  page_views: 0,
  published_at: '',
}

export default function ContentPage() {
  const [data, setData] = useState<ContentItem[]>([])
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [showModal, setShowModal] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  const [channelFilter, setChannelFilter] = useState<ChannelFilter>('all')
  const [sortField, setSortField] = useState<SortField>('page_views')
  const [sortAsc, setSortAsc] = useState(false)
  const [startDate, setStartDate] = useState(() => {
    const d = new Date()
    d.setMonth(d.getMonth() - 3)
    return d.toISOString().split('T')[0]
  })
  const [endDate, setEndDate] = useState(() => new Date().toISOString().split('T')[0])
  const supabase = createClient()

  const fetchData = useCallback(async () => {
    setLoading(true)
    const { data: rows, error } = await supabase
      .from('content_performance')
      .select('*')
      .order('page_views', { ascending: false })

    if (error) {
      console.error('content fetch error:', error)
      setData([])
    } else {
      setData(rows || [])
    }
    setLoading(false)
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  // GA4 동기화
  async function handleSync() {
    setSyncing(true)
    try {
      const res = await fetch('/api/marketing/sync/ga4-content', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ startDate, endDate }),
      })
      const result = await res.json()
      if (result.success) {
        toast.success(result.message)
        fetchData()
      } else {
        toast.error(result.message || '동기화 실패')
      }
    } catch {
      toast.error('동기화 중 오류 발생')
    }
    setSyncing(false)
  }

  // 네이버 수동 입력
  async function handleSaveManual() {
    if (!form.title.trim()) { toast.error('제목을 입력하세요'); return }
    setSaving(true)
    const { error } = await supabase.from('content_performance').insert({
      title: form.title.trim(),
      url: form.url || null,
      channel: form.channel,
      page_views: Number(form.page_views) || 0,
      published_at: form.published_at || null,
      is_manual: true,
    })
    if (error) toast.error('저장 실패: ' + error.message)
    else { toast.success('저장 완료'); setShowModal(false); fetchData() }
    setSaving(false)
  }

  const filtered = useMemo(() => {
    let items = channelFilter === 'all' ? [...data] : data.filter(d => d.channel === channelFilter)
    items.sort((a, b) => {
      let aVal: number | string = 0
      let bVal: number | string = 0
      if (sortField === 'page_views') { aVal = a.page_views; bVal = b.page_views }
      else if (sortField === 'sessions') { aVal = a.sessions; bVal = b.sessions }
      else if (sortField === 'published_at') { aVal = a.published_at || ''; bVal = b.published_at || '' }
      if (aVal < bVal) return sortAsc ? -1 : 1
      if (aVal > bVal) return sortAsc ? 1 : -1
      return 0
    })
    return items
  }, [data, channelFilter, sortField, sortAsc])

  const kpi = useMemo(() => {
    const totalViews = filtered.reduce((s, d) => s + d.page_views, 0)
    const totalSessions = filtered.reduce((s, d) => s + d.sessions, 0)
    const totalUsers = filtered.reduce((s, d) => s + d.active_users, 0)
    return { totalContent: filtered.length, totalViews, totalSessions, totalUsers }
  }, [filtered])

  function toggleSort(field: SortField) {
    if (sortField === field) setSortAsc(!sortAsc)
    else { setSortField(field); setSortAsc(false) }
  }

  return (
    <div>
      {/* Header */}
      <div className="page-header">
        <h1 className="page-title">콘텐츠 성과</h1>
        <div className="flex items-center gap-2 flex-wrap">
          <Input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="!w-36" />
          <span className="text-text-secondary text-sm">~</span>
          <Input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="!w-36" />
          <Button size="sm" variant="secondary" onClick={handleSync} loading={syncing}>
            <RefreshCw className="w-3.5 h-3.5 mr-1" /> GA4 동기화
          </Button>
          <Button size="sm" onClick={() => { setForm(emptyForm); setShowModal(true) }}>
            <Plus className="w-4 h-4 mr-1" /> 콘텐츠 추가
          </Button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <div className="card p-4">
          <div className="flex items-center gap-2 mb-1">
            <FileText className="w-4 h-4 text-blue-500" />
            <span className="text-xs text-text-secondary">총 콘텐츠</span>
          </div>
          <p className="text-lg font-bold">{kpi.totalContent}개</p>
        </div>
        <div className="card p-4">
          <div className="flex items-center gap-2 mb-1">
            <Eye className="w-4 h-4 text-green-500" />
            <span className="text-xs text-text-secondary">총 조회수</span>
          </div>
          <p className="text-lg font-bold">{formatNumber(kpi.totalViews)}</p>
        </div>
        <div className="card p-4">
          <div className="flex items-center gap-2 mb-1">
            <Clock className="w-4 h-4 text-orange-500" />
            <span className="text-xs text-text-secondary">총 세션</span>
          </div>
          <p className="text-lg font-bold">{formatNumber(kpi.totalSessions)}</p>
        </div>
        <div className="card p-4">
          <div className="flex items-center gap-2 mb-1">
            <Users className="w-4 h-4 text-purple-500" />
            <span className="text-xs text-text-secondary">총 사용자</span>
          </div>
          <p className="text-lg font-bold">{formatNumber(kpi.totalUsers)}</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 mb-4">
        <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
          {[
            { value: 'all' as ChannelFilter, label: '전체' },
            { value: 'caasworks_blog' as ChannelFilter, label: '카스웍스' },
            { value: 'naver_blog' as ChannelFilter, label: '네이버' },
          ].map(f => (
            <button key={f.value} onClick={() => setChannelFilter(f.value)}
              className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                channelFilter === f.value ? 'bg-white text-text-primary shadow-sm' : 'text-text-secondary hover:text-text-primary'
              }`}>
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Content Table */}
      {loading ? <Loading /> : filtered.length === 0 ? (
        <EmptyState icon={FileText} title="콘텐츠 데이터가 없습니다"
          description="GA4 동기화 또는 수동 입력으로 콘텐츠를 추가하세요"
          action={
            <div className="flex gap-2">
              <Button size="sm" variant="secondary" onClick={handleSync}>
                <RefreshCw className="w-4 h-4 mr-1" /> GA4 동기화
              </Button>
              <Button size="sm" onClick={() => { setForm(emptyForm); setShowModal(true) }}>
                <Plus className="w-4 h-4 mr-1" /> 수동 추가
              </Button>
            </div>
          } />
      ) : (
        <div className="table-container">
          <table className="data-table">
            <thead>
              <tr>
                <th>제목</th>
                <th>채널</th>
                <th className="text-right cursor-pointer" onClick={() => toggleSort('page_views')}>
                  조회수 <ArrowUpDown className="w-3 h-3 inline ml-0.5" />
                </th>
                <th className="text-right cursor-pointer" onClick={() => toggleSort('sessions')}>
                  세션 <ArrowUpDown className="w-3 h-3 inline ml-0.5" />
                </th>
                <th className="text-right">사용자</th>
                <th className="text-right cursor-pointer" onClick={() => toggleSort('published_at')}>
                  발행일 <ArrowUpDown className="w-3 h-3 inline ml-0.5" />
                </th>
                <th className="text-center">동기화</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(item => (
                <tr key={item.id}>
                  <td className="max-w-[300px]">
                    <div className="flex items-center gap-1">
                      <span className="font-medium truncate">{item.title}</span>
                      {item.url && (
                        <a href={item.url} target="_blank" rel="noopener noreferrer"
                          className="text-blue-500 hover:text-blue-700 flex-shrink-0">
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      )}
                    </div>
                    {item.page_path && (
                      <span className="text-[10px] text-text-tertiary">{item.page_path}</span>
                    )}
                  </td>
                  <td>
                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                      item.channel === 'caasworks_blog'
                        ? 'bg-blue-100 text-blue-700'
                        : 'bg-green-100 text-green-700'
                    }`}>
                      {CHANNEL_LABELS[item.channel] || item.channel}
                    </span>
                  </td>
                  <td className="text-right font-medium">{formatNumber(item.page_views)}</td>
                  <td className="text-right">{formatNumber(item.sessions)}</td>
                  <td className="text-right">{formatNumber(item.active_users)}</td>
                  <td className="text-right text-text-secondary text-xs">
                    {item.published_at || '-'}
                  </td>
                  <td className="text-center text-xs text-text-tertiary">
                    {item.is_manual ? '수동' : (
                      item.last_synced_at
                        ? new Date(item.last_synced_at).toLocaleDateString('ko-KR')
                        : '-'
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Manual Add Modal */}
      <Modal open={showModal} onClose={() => setShowModal(false)} title="콘텐츠 추가 (네이버)">
        <div className="space-y-3">
          <Input label="제목" value={form.title}
            onChange={e => setForm({ ...form, title: e.target.value })}
            placeholder="블로그 글 제목" />
          <Input label="URL" value={form.url}
            onChange={e => setForm({ ...form, url: e.target.value })}
            placeholder="https://blog.naver.com/..." />
          <Select label="채널" options={[
            { value: 'naver_blog', label: '네이버 블로그' },
            { value: 'caasworks_blog', label: '카스웍스 블로그' },
          ]} value={form.channel}
            onChange={e => setForm({ ...form, channel: e.target.value })} />
          <Input label="조회수" type="number" value={form.page_views}
            onChange={e => setForm({ ...form, page_views: Number(e.target.value) })} />
          <Input label="발행일" type="date" value={form.published_at}
            onChange={e => setForm({ ...form, published_at: e.target.value })} />
        </div>
        <div className="flex justify-end gap-2 mt-4 pt-3 border-t border-border-light">
          <Button variant="secondary" onClick={() => setShowModal(false)}>취소</Button>
          <Button onClick={handleSaveManual} loading={saving}>저장</Button>
        </div>
      </Modal>
    </div>
  )
}
