'use client'

import { useEffect, useState, useMemo, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { DateRangePicker, type DateRange } from '@/components/ui/date-range-picker'
import { Modal } from '@/components/ui/modal'
import { Loading } from '@/components/ui/loading'
import { EmptyState } from '@/components/ui/empty-state'
import { formatNumber } from '@/lib/utils'
import { toast } from 'sonner'
import {
  FileText, RefreshCw, Plus, Eye, Users, Clock,
  ExternalLink, ArrowUpDown, Info
} from 'lucide-react'
import { NaverBlogPanel } from './naver-blog-panel'

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

interface DailyRow { page_path: string; date: string; page_views: number; sessions: number; active_users: number }

type SortField = 'page_views' | 'published_at' | 'sessions'
// 전체 탭 없음: 카스웍스(GA 페이지뷰)와 네이버(블로그 통계 조회수)는 기준이 달라 합치면 안 됨
type ChannelFilter = 'caasworks_blog' | 'naver_blog'

const emptyForm = {
  title: '',
  url: '',
  channel: 'caasworks_blog',
  page_views: 0,
  published_at: '',
}

const pad = (n: number) => String(n).padStart(2, '0')
const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
// 기본 기간: 이번 달 1일 ~ 오늘
function thisMonth(): DateRange {
  const t = new Date()
  return { from: `${t.getFullYear()}-${pad(t.getMonth() + 1)}-01`, to: ymd(t) }
}

export default function ContentPage() {
  const [data, setData] = useState<ContentItem[]>([])
  const [daily, setDaily] = useState<DailyRow[]>([])
  const [coverage, setCoverage] = useState<{ min: string; max: string } | null>(null)
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [showModal, setShowModal] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  const [channelFilter, setChannelFilter] = useState<ChannelFilter>('caasworks_blog')
  const [sortField, setSortField] = useState<SortField>('page_views')
  const [sortAsc, setSortAsc] = useState(false)
  const [dateRange, setDateRange] = useState<DateRange>(thisMonth)
  const [showZero, setShowZero] = useState(false)
  const supabase = createClient()

  // 글 목록(제목·발행일) + 선택 기간의 일별 조회. 기본 1000행 제한이 있어 나눠 읽는다
  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const { data: rows, error } = await supabase
        .from('content_performance').select('*').eq('channel', 'caasworks_blog')
      if (error) throw error
      setData(rows || [])

      let all: DailyRow[] = []
      for (let off = 0; ; off += 1000) {
        let q = supabase.from('content_performance_daily')
          .select('page_path, date, page_views, sessions, active_users').order('date').order('page_path')
        if (dateRange.from) q = q.gte('date', dateRange.from)
        if (dateRange.to) q = q.lte('date', dateRange.to)
        const { data: d, error: e } = await q.range(off, off + 999)
        if (e) throw e
        all = all.concat(d || [])
        if (!d || d.length < 1000) break
      }
      setDaily(all)

      const [{ data: mn }, { data: mx }] = await Promise.all([
        supabase.from('content_performance_daily').select('date').order('date').limit(1),
        supabase.from('content_performance_daily').select('date').order('date', { ascending: false }).limit(1),
      ])
      setCoverage(mn?.[0] && mx?.[0] ? { min: mn[0].date, max: mx[0].date } : null)
    } catch (e) {
      console.error('content fetch error:', e)
      toast.error('콘텐츠 데이터를 불러오지 못했습니다: ' + (e as { message?: string }).message)
      setData([]); setDaily([])
    }
    setLoading(false)
  }, [dateRange.from, dateRange.to])

  useEffect(() => { fetchData() }, [fetchData])

  // GA4 동기화: 선택 기간(없으면 최근 90일)의 글×날짜 조회를 가져온다
  async function handleSync() {
    setSyncing(true)
    try {
      const res = await fetch('/api/marketing/sync/ga4-content', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ startDate: dateRange.from || undefined, endDate: dateRange.to || undefined }),
      })
      const result = await res.json()
      if (result.success) {
        toast.success(result.message)
        fetchData()
      } else {
        toast.error(result.message || result.error || '동기화 실패')
      }
    } catch {
      toast.error('동기화 중 오류 발생')
    }
    setSyncing(false)
  }

  // 수동 입력
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

  // 글별 기간 합계
  const rows = useMemo(() => {
    const sum = new Map<string, { page_views: number; sessions: number; active_users: number; days: number }>()
    for (const d of daily) {
      const s = sum.get(d.page_path) || { page_views: 0, sessions: 0, active_users: 0, days: 0 }
      s.page_views += d.page_views; s.sessions += d.sessions; s.active_users += d.active_users; s.days++
      sum.set(d.page_path, s)
    }
    const items = data.map(item => {
      const s = item.page_path ? sum.get(item.page_path) : undefined
      // 수동 입력 글은 일별 데이터가 없으니 입력한 조회수 그대로
      return {
        ...item,
        page_views: s ? s.page_views : (item.is_manual ? item.page_views : 0),
        sessions: s ? s.sessions : 0,
        active_users: s ? s.active_users : 0,
        days: s?.days || 0,
      }
    }).filter(item => showZero || item.page_views > 0)
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
  }, [data, daily, sortField, sortAsc, showZero])

  const kpi = useMemo(() => {
    const totalViews = rows.reduce((s, d) => s + d.page_views, 0)
    const totalSessions = rows.reduce((s, d) => s + d.sessions, 0)
    const totalUsers = rows.reduce((s, d) => s + d.active_users, 0)
    return { totalContent: rows.filter(r => r.page_views > 0).length, totalViews, totalSessions, totalUsers }
  }, [rows])

  function toggleSort(field: SortField) {
    if (sortField === field) setSortAsc(!sortAsc)
    else { setSortField(field); setSortAsc(false) }
  }

  const rangeLabel = dateRange.from && dateRange.to ? `${dateRange.from} ~ ${dateRange.to}` : '저장된 전체 기간'
  const rangeOutsideCoverage = coverage && dateRange.from && dateRange.to && (dateRange.from < coverage.min || dateRange.to > coverage.max)

  return (
    <div>
      {/* Header */}
      <div className="page-header">
        <h1 className="page-title">콘텐츠 성과</h1>
        <div className="flex items-center gap-2 flex-wrap">
          {channelFilter === 'caasworks_blog' && <>
            <DateRangePicker value={dateRange} onChange={setDateRange} />
            <Button size="sm" variant="secondary" onClick={handleSync} loading={syncing} title="선택한 기간의 GA4 조회를 다시 가져옵니다">
              <RefreshCw className="w-3.5 h-3.5 mr-1" /> GA4 동기화
            </Button>
            <Button size="sm" onClick={() => { setForm(emptyForm); setShowModal(true) }}>
              <Plus className="w-4 h-4 mr-1" /> 콘텐츠 추가
            </Button>
          </>}
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 mb-4">
        <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
          {[
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

      {channelFilter === 'naver_blog' ? <NaverBlogPanel /> : (
        <>
          {/* 집계 기준 */}
          <div className="flex items-start gap-2 text-xs text-text-secondary bg-blue-50 border border-blue-100 rounded-lg px-3 py-2 mb-4">
            <Info className="w-3.5 h-3.5 mt-0.5 flex-shrink-0 text-blue-500" />
            <div>
              <span className="font-medium text-text-primary">{rangeLabel}</span> 동안 www.caas.works/blog 글이 읽힌 GA4 페이지뷰·세션·사용자 합계입니다.
              발행일과 상관없이 이 기간에 조회가 있었던 글이 모두 나옵니다. 발행일은 글 페이지에 적힌 날짜입니다.
              {coverage && <span className="ml-1 text-text-tertiary">(일별 데이터 보유: {coverage.min} ~ {coverage.max})</span>}
              {rangeOutsideCoverage && <span className="ml-1 text-orange-600">선택 기간 일부는 아직 동기화되지 않았습니다. GA4 동기화를 눌러 가져오세요.</span>}
            </div>
          </div>

          {/* KPI Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
            <div className="card p-4">
              <div className="flex items-center gap-2 mb-1">
                <FileText className="w-4 h-4 text-blue-500" />
                <span className="text-xs text-text-secondary">조회된 글</span>
              </div>
              <p className="text-lg font-bold">{kpi.totalContent}개 <span className="text-xs font-normal text-text-tertiary">/ 전체 {data.length}개</span></p>
            </div>
            <div className="card p-4">
              <div className="flex items-center gap-2 mb-1">
                <Eye className="w-4 h-4 text-green-500" />
                <span className="text-xs text-text-secondary">조회수</span>
              </div>
              <p className="text-lg font-bold">{formatNumber(kpi.totalViews)}</p>
            </div>
            <div className="card p-4">
              <div className="flex items-center gap-2 mb-1">
                <Clock className="w-4 h-4 text-orange-500" />
                <span className="text-xs text-text-secondary">세션</span>
              </div>
              <p className="text-lg font-bold">{formatNumber(kpi.totalSessions)}</p>
            </div>
            <div className="card p-4">
              <div className="flex items-center gap-2 mb-1">
                <Users className="w-4 h-4 text-purple-500" />
                <span className="text-xs text-text-secondary">사용자</span>
              </div>
              <p className="text-lg font-bold">{formatNumber(kpi.totalUsers)}</p>
            </div>
          </div>

          {loading ? <Loading /> : rows.length === 0 ? (
            <EmptyState icon={FileText} title="이 기간에 조회된 글이 없습니다"
              description={coverage ? '기간을 바꾸거나 GA4 동기화로 이 기간 데이터를 가져오세요' : 'GA4 동기화로 데이터를 가져오세요'}
              action={
                <div className="flex gap-2">
                  <Button size="sm" variant="secondary" onClick={handleSync} loading={syncing}>
                    <RefreshCw className="w-4 h-4 mr-1" /> GA4 동기화
                  </Button>
                  {data.length > 0 && <Button size="sm" variant="secondary" onClick={() => setShowZero(true)}>조회 없는 글도 보기</Button>}
                </div>
              } />
          ) : (
            <div className="table-container">
              <div className="flex items-center justify-end px-3 py-2 text-xs text-text-secondary border-b border-border-light">
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input type="checkbox" checked={showZero} onChange={e => setShowZero(e.target.checked)} className="w-3 h-3" />
                  조회 없는 글도 보기
                </label>
              </div>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>제목</th>
                    <th className="text-right cursor-pointer whitespace-nowrap" onClick={() => toggleSort('published_at')}>
                      발행일 <ArrowUpDown className="w-3 h-3 inline ml-0.5" />
                    </th>
                    <th className="text-right cursor-pointer whitespace-nowrap" onClick={() => toggleSort('page_views')}>
                      조회수 <ArrowUpDown className="w-3 h-3 inline ml-0.5" />
                    </th>
                    <th className="text-right cursor-pointer whitespace-nowrap" onClick={() => toggleSort('sessions')}>
                      세션 <ArrowUpDown className="w-3 h-3 inline ml-0.5" />
                    </th>
                    <th className="text-right">사용자</th>
                    <th className="text-right whitespace-nowrap" title="기간 중 조회가 있었던 날 수">조회일</th>
                    <th className="text-center">동기화</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(item => (
                    <tr key={item.id}>
                      <td className="max-w-[360px]">
                        <div className="flex items-center gap-1">
                          <span className="font-medium truncate" title={item.title}>{item.title}</span>
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
                      <td className="text-right text-text-secondary text-xs whitespace-nowrap">
                        {item.published_at || <span className="text-text-tertiary" title="GA4 동기화 때 글 페이지에서 가져옵니다">-</span>}
                      </td>
                      <td className="text-right font-medium">{formatNumber(item.page_views)}</td>
                      <td className="text-right">{formatNumber(item.sessions)}</td>
                      <td className="text-right">{formatNumber(item.active_users)}</td>
                      <td className="text-right text-text-secondary">{item.days || '-'}</td>
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
        </>
      )}

      {/* Manual Add Modal */}
      <Modal open={showModal} onClose={() => setShowModal(false)} title="콘텐츠 추가">
        <div className="space-y-3">
          <Input label="제목" value={form.title}
            onChange={e => setForm({ ...form, title: e.target.value })}
            placeholder="블로그 글 제목" />
          <Input label="URL" value={form.url}
            onChange={e => setForm({ ...form, url: e.target.value })}
            placeholder="https://www.caas.works/blog/..." />
          <Select label="채널" options={[
            { value: 'caasworks_blog', label: '카스웍스 블로그' },
            { value: 'naver_blog', label: '네이버 블로그' },
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
