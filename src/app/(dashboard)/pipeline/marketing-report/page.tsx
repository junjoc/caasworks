'use client'

// 마케팅 리포트: 기간별 리드를 레퍼러·채널·주제로 묶어 보고 CSV 로 내려받는 화면.
// 새 입력 기능 없음 (주제 태그 수정만 예외). 요구사항: 마케팅팀 2026-10-08 문서.

import { Fragment, useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Loading } from '@/components/ui/loading'
import { DateRangePicker, type DateRange } from '@/components/ui/date-range-picker'
import { STAGE_COLORS, STAGE_ORDER, ACTIVITY_TYPE_LABELS, formatDate } from '@/lib/utils'
import { classifyTopics, TOPIC_TAGS } from '@/lib/topic-tags'
import {
  CHANNEL_GROUPS, PRESETS, presetRange, channelGroup, extractReferrer, referrerKey, blogIdOf,
  NO_REFERRER, toCsv, downloadText, type ChannelGroup, type PresetKey,
} from '@/lib/marketing-report'
import { toast } from 'sonner'
import { Download, RefreshCw, X, ExternalLink, Pencil } from 'lucide-react'

interface Lead {
  id: string
  inquiry_date: string | null
  created_at: string
  company_name: string
  inquiry_channel: string | null
  inquiry_source: string | null
  referrer: string | null
  inquiry_content: string | null
  core_need: string | null
  notes: string | null
  stage: string
  assigned_to: string | null
  contact_person: string | null
  contact_phone: string | null
  contact_email: string | null
  topic_tags?: string[] | null
  topic_tags_manual?: boolean
}

interface Row extends Lead {
  refUrl: string | null
  refKey: string
  group: ChannelGroup
  tags: string[]
  tagsSaved: boolean
}

const PAGE_SIZE = 50
const SUMMARY_STAGES = ['컨텍', '제안', '미팅', '도입완료', '이탈']
const pct = (n: number, d: number) => (d ? `${Math.round((n / d) * 100)}%` : '-')

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-2.5 py-1 rounded-full text-xs border transition-colors ${
        active ? 'bg-primary-600 text-white border-primary-600' : 'bg-white text-text-secondary border-gray-200 hover:bg-gray-50'
      }`}
    >
      {children}
    </button>
  )
}

function toggle<T>(set: Set<T>, v: T): Set<T> {
  const next = new Set(set)
  if (next.has(v)) next.delete(v); else next.add(v)
  return next
}

export default function MarketingReportPage() {
  const supabase = useMemo(() => createClient(), [])

  const [preset, setPreset] = useState<PresetKey | null>('last_week')
  const [range, setRange] = useState<DateRange>(() => presetRange('last_week'))
  const [groups, setGroups] = useState<Set<ChannelGroup>>(new Set())
  const [stages, setStages] = useState<Set<string>>(new Set())
  const [assignees, setAssignees] = useState<Set<string>>(new Set())
  const [refFilter, setRefFilter] = useState<string | null>(null)
  const [topicFilter, setTopicFilter] = useState<string | null>(null)

  const [leads, setLeads] = useState<Lead[]>([])
  const [users, setUsers] = useState<{ id: string; name: string }[]>([])
  const [lastActivity, setLastActivity] = useState<Map<string, { type: string; at: string }>>(new Map())
  const [blogTitles, setBlogTitles] = useState<Map<string, string>>(new Map())
  const [loading, setLoading] = useState(true)
  const [loadMs, setLoadMs] = useState<number | null>(null)

  const [page, setPage] = useState(0)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [excludePii, setExcludePii] = useState(true)
  const [editingTags, setEditingTags] = useState<string | null>(null)
  const [draftTags, setDraftTags] = useState<Set<string>>(new Set())
  const [reclassifying, setReclassifying] = useState(false)

  const userName = useCallback((id: string | null) => (id ? users.find(u => u.id === id)?.name || '-' : '미배정'), [users])

  const load = useCallback(async () => {
    if (!range.from || !range.to) return
    setLoading(true)
    const t0 = performance.now()
    let all: Lead[] = []
    for (let off = 0; ; off += 1000) {
      const { data, error } = await supabase.from('pipeline_leads').select('*')
        .gte('inquiry_date', range.from).lte('inquiry_date', range.to)
        .order('inquiry_date', { ascending: false }).order('created_at', { ascending: false })
        .range(off, off + 999)
      if (error) { toast.error(`리드 조회 실패: ${error.message}`); break }
      all = all.concat((data || []) as Lead[])
      if (!data || data.length < 1000) break
    }
    const ids = all.map(l => l.id)
    const chunks: string[][] = []
    for (let i = 0; i < ids.length; i += 100) chunks.push(ids.slice(i, i + 100))
    const [acts, usersRes, blogsRes] = await Promise.all([
      Promise.all(chunks.map(c => supabase.from('activity_logs').select('lead_id, activity_type, performed_at')
        .in('lead_id', c).order('performed_at', { ascending: false }))),
      supabase.from('users').select('id, name'),
      supabase.from('content_performance').select('page_path, title').like('page_path', '%/blog/%'),
    ])
    const last = new Map<string, { type: string; at: string }>()
    for (const r of acts) for (const a of r.data || []) {
      if (!last.has(a.lead_id)) last.set(a.lead_id, { type: a.activity_type, at: a.performed_at })
    }
    const titles = new Map<string, string>()
    for (const b of blogsRes.data || []) {
      const id = blogIdOf(`www.caas.works${(b.page_path || '').replace(/\/+$/, '')}`)
      if (id && b.title) titles.set(id, b.title.replace(/\s*[-|]\s*카스웍스.*$/, ''))
    }
    setLeads(all)
    setUsers(usersRes.data || [])
    setLastActivity(last)
    setBlogTitles(titles)
    setLoading(false)
    setLoadMs(Math.round(performance.now() - t0))
  }, [supabase, range.from, range.to])

  useEffect(() => { load() }, [load])
  useEffect(() => { setPage(0) }, [range, groups, stages, assignees, refFilter, topicFilter])

  const rows: Row[] = useMemo(() => leads.map(l => {
    const refUrl = extractReferrer(l.referrer, l.inquiry_content)
    const saved = Array.isArray(l.topic_tags) && l.topic_tags.length > 0
    return {
      ...l,
      refUrl,
      refKey: referrerKey(refUrl),
      group: channelGroup(l.inquiry_channel, l.inquiry_source),
      tags: saved ? (l.topic_tags as string[]) : classifyTopics(l),
      tagsSaved: saved,
    }
  }), [leads])

  // 요약·집계 기준 (기간 + 채널구분/단계/담당자)
  const base = useMemo(() => rows.filter(r =>
    (groups.size === 0 || groups.has(r.group)) &&
    (stages.size === 0 || stages.has(r.stage)) &&
    (assignees.size === 0 || assignees.has(r.assigned_to || '미배정'))
  ), [rows, groups, stages, assignees])

  // 목록: 집계 표에서 클릭한 레퍼러/주제까지 적용
  const listRows = useMemo(() => base.filter(r =>
    (!refFilter || r.refKey === refFilter) && (!topicFilter || r.tags.includes(topicFilter))
  ), [base, refFilter, topicFilter])

  const summary = useMemo(() => {
    const web = base.filter(r => r.group === '웹')
    const phone = base.filter(r => r.group === '전화')
    const byStage: Record<string, number> = {}
    for (const r of base) byStage[r.stage] = (byStage[r.stage] || 0) + 1
    return {
      total: base.length, web: web.length, phone: phone.length,
      webWon: web.filter(r => r.stage === '도입완료').length,
      phoneWon: phone.filter(r => r.stage === '도입완료').length,
      unassigned: base.filter(r => !r.assigned_to).length,
      byStage,
    }
  }, [base])

  const byReferrer = useMemo(() => {
    const m = new Map<string, { n: number; won: number }>()
    for (const r of base) {
      const v = m.get(r.refKey) || { n: 0, won: 0 }
      v.n++; if (r.stage === '도입완료') v.won++
      m.set(r.refKey, v)
    }
    return Array.from(m.entries()).sort((a, b) => b[1].n - a[1].n)
  }, [base])

  const byChannel = useMemo(() => {
    const m = new Map<string, Record<string, number>>()
    for (const r of base) {
      const ch = r.inquiry_channel || '(미입력)'
      const v = m.get(ch) || {}
      v[r.stage] = (v[r.stage] || 0) + 1
      m.set(ch, v)
    }
    return Array.from(m.entries())
      .map(([ch, s]) => ({ ch, s, total: Object.values(s).reduce((a, b) => a + b, 0) }))
      .sort((a, b) => b.total - a.total)
  }, [base])

  const byTopic = useMemo(() => {
    const m = new Map<string, { n: number; won: number }>()
    for (const r of base) for (const t of r.tags) {
      const v = m.get(t) || { n: 0, won: 0 }
      v.n++; if (r.stage === '도입완료') v.won++
      m.set(t, v)
    }
    return Array.from(m.entries()).sort((a, b) => b[1].n - a[1].n)
  }, [base])

  const unsavedTags = rows.filter(r => !r.tagsSaved).length
  const pageRows = listRows.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)
  const pageCount = Math.max(1, Math.ceil(listRows.length / PAGE_SIZE))

  const refLabel = (key: string) => {
    const id = blogIdOf(key)
    const title = id ? blogTitles.get(id) : null
    return title ? `${title}` : key
  }

  const selectPreset = (k: PresetKey) => { setPreset(k); setRange(presetRange(k)) }

  const reclassify = async () => {
    const ids = listRows.filter(r => !r.topic_tags_manual).map(r => r.id)
    if (!ids.length) return
    setReclassifying(true)
    const res = await fetch('/api/pipeline/topic-tags', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lead_ids: ids }),
    }).then(r => r.json()).catch(e => ({ error: e.message }))
    setReclassifying(false)
    if (res.error) { toast.error(`재분류 실패: ${res.error}`); return }
    toast.success(`${res.updated}건 재분류 (사람이 고친 ${listRows.length - ids.length}건 제외)`)
    load()
  }

  const startEditTags = (r: Row) => { setEditingTags(r.id); setDraftTags(new Set(r.tags)) }
  const saveTags = async (r: Row, auto: boolean) => {
    const body = auto
      ? { lead_ids: [r.id], reset_manual: true }
      : { lead_id: r.id, tags: Array.from(draftTags) }
    const res = await fetch('/api/pipeline/topic-tags', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    }).then(x => x.json()).catch(e => ({ error: e.message }))
    if (res.error) { toast.error(`태그 저장 실패: ${res.error}`); return }
    setEditingTags(null)
    toast.success(auto ? '자동 분류로 되돌렸습니다' : '태그를 저장했습니다')
    load()
  }

  const exportCsv = () => {
    const origin = typeof window !== 'undefined' ? window.location.origin : ''
    const header = ['유입일', '회사명', '유입채널', '유입경로', '레퍼러', '주제 태그', '문의내용', '단계', '담당자', '마지막 활동', '상세 링크']
    if (!excludePii) header.push('문의자', '연락처', '이메일')
    const data = listRows.map(r => {
      const la = lastActivity.get(r.id)
      const row: (string | null)[] = [
        r.inquiry_date, r.company_name, r.inquiry_channel, r.inquiry_source,
        r.refKey === NO_REFERRER ? '' : r.refKey, r.tags.join(', '), r.inquiry_content,
        r.stage, userName(r.assigned_to),
        la ? `${la.at.slice(0, 16).replace('T', ' ')} ${ACTIVITY_TYPE_LABELS[la.type] || la.type}` : '',
        `${origin}/pipeline/${r.id}`,
      ]
      if (!excludePii) row.push(r.contact_person, r.contact_phone, r.contact_email)
      return row
    })
    downloadText(`마케팅리포트_${range.from}_${range.to}.csv`, toCsv(header, data))
  }

  const assigneeOptions = useMemo(() => {
    const ids = new Set(rows.map(r => r.assigned_to || '미배정'))
    return Array.from(ids).map(id => ({ id, name: id === '미배정' ? '미배정' : userName(id) }))
      .sort((a, b) => a.name.localeCompare(b.name, 'ko'))
  }, [rows, userName])

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">마케팅 리포트</h1>
          <p className="text-sm text-text-secondary mt-1">
            유입일 {range.from} ~ {range.to} · 리드 {base.length}건
            {loadMs != null && !loading && <span className="text-text-tertiary ml-2">({(loadMs / 1000).toFixed(1)}초)</span>}
          </p>
        </div>
        <div className="flex gap-2 items-center">
          <label className="flex items-center gap-1.5 text-xs text-text-secondary cursor-pointer select-none">
            <input type="checkbox" checked={excludePii} onChange={e => setExcludePii(e.target.checked)} className="w-3.5 h-3.5" />
            개인정보 제외
          </label>
          <Button variant="secondary" size="sm" onClick={exportCsv} disabled={loading || listRows.length === 0}>
            <Download className="w-4 h-4 mr-1" /> CSV
          </Button>
        </div>
      </div>

      {/* 필터 */}
      <div className="card p-4 mb-4 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-text-tertiary w-14">기간</span>
          {PRESETS.map(p => <Chip key={p.key} active={preset === p.key} onClick={() => selectPreset(p.key)}>{p.label}</Chip>)}
          <DateRangePicker value={range} onChange={r => { setPreset(null); setRange(r) }} />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-text-tertiary w-14">유입채널</span>
          {CHANNEL_GROUPS.map(g => <Chip key={g} active={groups.has(g)} onClick={() => setGroups(toggle(groups, g))}>{g}</Chip>)}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-text-tertiary w-14">단계</span>
          {STAGE_ORDER.map(s => <Chip key={s} active={stages.has(s)} onClick={() => setStages(toggle(stages, s))}>{s}</Chip>)}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-text-tertiary w-14">담당자</span>
          {assigneeOptions.map(a => <Chip key={a.id} active={assignees.has(a.id)} onClick={() => setAssignees(toggle(assignees, a.id))}>{a.name}</Chip>)}
        </div>
      </div>

      {loading ? <Loading /> : (
        <>
          {/* 요약 카드 */}
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3 mb-4">
            {[
              { label: '리드', value: summary.total },
              { label: '웹 문의', value: summary.web },
              { label: '전화 문의', value: summary.phone },
              { label: '미배정', value: summary.unassigned },
              { label: '웹 → 도입완료', value: pct(summary.webWon, summary.web), sub: `${summary.webWon}/${summary.web}` },
              { label: '전화 → 도입완료', value: pct(summary.phoneWon, summary.phone), sub: `${summary.phoneWon}/${summary.phone}` },
            ].map(c => (
              <div key={c.label} className="card p-3">
                <div className="text-xs text-text-tertiary">{c.label}</div>
                <div className="text-xl font-semibold text-text-primary mt-1">{c.value}</div>
                {c.sub && <div className="text-[11px] text-text-tertiary">{c.sub}</div>}
              </div>
            ))}
            <div className="card p-3 col-span-2">
              <div className="text-xs text-text-tertiary mb-1.5">단계별</div>
              <div className="flex flex-wrap gap-x-3 gap-y-1">
                {SUMMARY_STAGES.map(s => (
                  <span key={s} className="text-sm"><span className="text-text-tertiary">{s}</span> <b>{summary.byStage[s] || 0}</b></span>
                ))}
              </div>
            </div>
          </div>

          {/* 집계 표 */}
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 mb-4">
            <div className="card p-0 overflow-hidden xl:col-span-1">
              <div className="px-4 py-2.5 border-b border-gray-100 text-sm font-semibold">레퍼러 페이지별 <span className="text-xs font-normal text-text-tertiary">클릭하면 목록 필터</span></div>
              <div className="max-h-96 overflow-auto">
                <table className="data-table">
                  <thead><tr><th>레퍼러</th><th className="text-right">건수</th><th className="text-right">도입완료</th></tr></thead>
                  <tbody>
                    {byReferrer.map(([key, v]) => (
                      <tr key={key} onClick={() => setRefFilter(refFilter === key ? null : key)}
                        className={`cursor-pointer ${refFilter === key ? 'bg-primary-50' : ''}`}>
                        <td className="max-w-[260px]">
                          <div className="truncate" title={key}>{refLabel(key)}</div>
                          {blogIdOf(key) && blogTitles.get(blogIdOf(key)!) && <div className="text-[10px] text-text-tertiary truncate">{key}</div>}
                        </td>
                        <td className="text-right">{v.n}</td>
                        <td className="text-right">{v.won || ''}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="card p-0 overflow-hidden xl:col-span-2">
              <div className="px-4 py-2.5 border-b border-gray-100 text-sm font-semibold">유입채널별 단계 분포</div>
              <div className="max-h-96 overflow-auto">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>유입채널</th>
                      {STAGE_ORDER.map(s => <th key={s} className="text-right">{s}</th>)}
                      <th className="text-right">합계</th>
                      <th className="text-right">도입완료율</th>
                    </tr>
                  </thead>
                  <tbody>
                    {byChannel.map(({ ch, s, total }) => (
                      <tr key={ch}>
                        <td>{ch}</td>
                        {STAGE_ORDER.map(st => <td key={st} className="text-right text-text-secondary">{s[st] || ''}</td>)}
                        <td className="text-right font-medium">{total}</td>
                        <td className="text-right">{pct(s['도입완료'] || 0, total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="px-4 py-2.5 border-y border-gray-100 text-sm font-semibold flex items-center justify-between">
                <span>문의 주제별 <span className="text-xs font-normal text-text-tertiary">클릭하면 목록 필터</span></span>
                {unsavedTags > 0 && <span className="text-[11px] font-normal text-amber-600">저장 전 태그 {unsavedTags}건은 즉석 분류값</span>}
              </div>
              <table className="data-table">
                <thead><tr><th>주제</th><th className="text-right">건수</th><th className="text-right">도입완료</th></tr></thead>
                <tbody>
                  {byTopic.map(([t, v]) => (
                    <tr key={t} onClick={() => setTopicFilter(topicFilter === t ? null : t)}
                      className={`cursor-pointer ${topicFilter === t ? 'bg-primary-50' : ''}`}>
                      <td>{t}</td>
                      <td className="text-right">{v.n}</td>
                      <td className="text-right">{v.won || ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* 리드 목록 */}
          <div className="flex flex-wrap items-center gap-2 mb-2">
            <span className="text-sm font-semibold">리드 목록 {listRows.length}건</span>
            {refFilter && <Badge className="bg-primary-50 text-primary-700">레퍼러: {refLabel(refFilter)} <button onClick={() => setRefFilter(null)}><X className="w-3 h-3 inline" /></button></Badge>}
            {topicFilter && <Badge className="bg-primary-50 text-primary-700">주제: {topicFilter} <button onClick={() => setTopicFilter(null)}><X className="w-3 h-3 inline" /></button></Badge>}
            <div className="flex-1" />
            <Button variant="secondary" size="sm" onClick={reclassify} disabled={reclassifying || listRows.length === 0}>
              <RefreshCw className={`w-3.5 h-3.5 mr-1 ${reclassifying ? 'animate-spin' : ''}`} /> 주제 재분류
            </Button>
          </div>
          <div className="table-container">
            <table className="data-table">
              <thead>
                <tr>
                  <th>유입일</th><th>회사명</th><th>유입채널</th><th>유입경로</th><th>레퍼러</th>
                  <th>주제 태그</th><th>문의내용</th><th>단계</th><th>담당자</th><th>마지막 활동</th><th></th>
                </tr>
              </thead>
              <tbody>
                {pageRows.map(r => {
                  const la = lastActivity.get(r.id)
                  const body = (r.inquiry_content || '').trim()
                  const open = expanded.has(r.id)
                  return (
                    <Fragment key={r.id}>
                      <tr>
                        <td className="whitespace-nowrap">{r.inquiry_date ? formatDate(r.inquiry_date) : '-'}</td>
                        <td className="font-medium max-w-[160px] truncate" title={r.company_name}>{r.company_name}</td>
                        <td className="whitespace-nowrap">{r.inquiry_channel || '-'}</td>
                        <td className="whitespace-nowrap">{r.inquiry_source || '-'}</td>
                        <td className="max-w-[200px] truncate text-xs" title={r.refUrl || ''}>{r.refKey === NO_REFERRER ? '-' : refLabel(r.refKey)}</td>
                        <td className="max-w-[180px]">
                          {editingTags === r.id ? (
                            <div className="space-y-1 text-xs">
                              {TOPIC_TAGS.map(t => (
                                <label key={t} className="flex items-center gap-1 cursor-pointer">
                                  <input type="checkbox" checked={draftTags.has(t)} onChange={() => setDraftTags(toggle(draftTags, t))} className="w-3 h-3" />{t}
                                </label>
                              ))}
                              <div className="flex gap-1 pt-1">
                                <button className="px-1.5 py-0.5 rounded bg-primary-600 text-white" onClick={() => saveTags(r, false)}>저장</button>
                                <button className="px-1.5 py-0.5 rounded border" onClick={() => saveTags(r, true)}>자동으로</button>
                                <button className="px-1.5 py-0.5 rounded border" onClick={() => setEditingTags(null)}>취소</button>
                              </div>
                            </div>
                          ) : (
                            <div className="flex flex-wrap gap-1 items-center">
                              {r.tags.map(t => <span key={t} className="px-1.5 py-0.5 rounded bg-gray-100 text-[11px] text-text-secondary">{t}</span>)}
                              {r.topic_tags_manual && <span className="text-[10px] text-text-tertiary" title="사람이 고친 태그 (재분류 제외)">✎</span>}
                              <button onClick={() => startEditTags(r)} className="text-text-tertiary hover:text-text-primary" title="태그 수정"><Pencil className="w-3 h-3" /></button>
                            </div>
                          )}
                        </td>
                        <td className="max-w-[320px] text-xs text-text-secondary">
                          {body ? (
                            <button className="text-left hover:text-text-primary" onClick={() => setExpanded(toggle(expanded, r.id))}>
                              {open ? '접기' : (body.length > 120 ? `${body.slice(0, 120)}…` : body)}
                            </button>
                          ) : '-'}
                        </td>
                        <td><Badge className={`${STAGE_COLORS[r.stage] || ''} text-xs`}>{r.stage}</Badge></td>
                        <td className="whitespace-nowrap">{userName(r.assigned_to)}</td>
                        <td className="whitespace-nowrap text-xs">
                          {la ? <>{formatDate(la.at)}<div className="text-text-tertiary">{ACTIVITY_TYPE_LABELS[la.type] || la.type}</div></> : '-'}
                        </td>
                        <td><Link href={`/pipeline/${r.id}`} className="text-primary-600 hover:text-primary-800" title="상세"><ExternalLink className="w-3.5 h-3.5" /></Link></td>
                      </tr>
                      {open && (
                        <tr className="bg-gray-50">
                          <td colSpan={11} className="text-xs whitespace-pre-wrap text-text-secondary">{body}</td>
                        </tr>
                      )}
                    </Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>
          {pageCount > 1 && (
            <div className="flex items-center justify-center gap-2 mt-3 text-sm">
              <Button variant="secondary" size="sm" disabled={page === 0} onClick={() => setPage(page - 1)}>이전</Button>
              <span className="text-text-secondary">{page + 1} / {pageCount}</span>
              <Button variant="secondary" size="sm" disabled={page >= pageCount - 1} onClick={() => setPage(page + 1)}>다음</Button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
