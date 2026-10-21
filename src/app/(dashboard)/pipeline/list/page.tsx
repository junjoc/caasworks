'use client'

// 세일즈 › 리스트 (2026-10-21 개편, 디자인 정의 › 세일즈)
// 툴바(탭·검색·필터) → 숫자줄 → 9열 표(10/21: 유입일을 회사명 앞으로)(50행 서버 페이지) → 행 클릭 = 오른쪽 480 드로어.
// 문의자·연락처·코드는 드로어로. 일괄 단계·담당·삭제는 그대로.
import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/hooks/useAuth'
import { confirmBulkConvertedStageChange, cn } from '@/lib/utils'
import { useFollowupLeadIds } from '@/hooks/useFollowupLeadIds'
import { INFLOW_ORDER, INFLOW_COLOR, type InflowGroup } from '@/lib/inflow-taxonomy'
import { Toolbar, Tabs, KpiRow, DsButton, DsSelect, Check, StatusChip, Avatar, Skeleton, Empty, stageTone, dsInput } from '@/components/ds'
import { LeadDrawer, STAGE_OPTIONS } from '@/components/pipeline/lead-drawer'
import { toast } from 'sonner'
import { Plus, Search, ChevronDown, ChevronUp, ChevronLeft, ChevronRight, Info, Trash2 } from 'lucide-react'

type Tab = '전체' | '진행' | '예정' | '도입완료' | '이탈'
type Row = { id: string; company_name: string; stage: string; priority: string | null; date: string; assigned_to: string | null; site_category: string | null; industry: string | null; conversion_probability: string | null; next_action: string | null; next_action_date: string | null; group: InflowGroup; sub: string }
type Res = { rows: Row[]; total: number; page: number; pageSize: number; counts: Record<Tab, number>; kpi: { month: number; prevMonth: number; prog: number; plan: number; wonMonth: number; yLeads: number; yWon: number }; today: string }

const TABS: Tab[] = ['전체', '진행', '예정', '도입완료', '이탈']
const thisYear = new Date().getFullYear()
const YEARS = ['전체', ...Array.from({ length: thisYear - 2023 }, (_, i) => String(thisYear - i))]
const md = (s: string | null) => (s ? s.slice(5).replace('-', '.') : '')

// 다음 액션 날짜 색: 지남 빨강 · 오늘 주황 · 3일 이내 진하게
function dueClass(dateStr: string | null, today: string) {
  if (!dateStr) return 'text-ds-fg3'
  if (dateStr < today) return 'text-ds-bad font-medium'
  if (dateStr === today) return 'text-ds-warn font-medium'
  const diff = (new Date(dateStr).getTime() - new Date(today).getTime()) / 86400000
  return diff <= 3 ? 'text-ds-fg font-medium' : 'text-ds-fg3'
}

export default function PipelineListPage() {
  const router = useRouter()
  const supabase = createClient()
  const { user } = useAuth()
  const followupIds = useFollowupLeadIds()

  const [tab, setTab] = useState<Tab>('전체')
  const [search, setSearch] = useState('')
  const [q, setQ] = useState('')
  const [assignee, setAssignee] = useState('전체')
  const [inflow, setInflow] = useState('전체')
  const [year, setYear] = useState('전체')
  const [followupOnly, setFollowupOnly] = useState(false)
  const [sort, setSort] = useState<'inquiry' | 'next'>('inquiry')
  const [asc, setAsc] = useState(false)
  const [page, setPage] = useState(0)
  const [data, setData] = useState<Res | null>(null)
  const [loading, setLoading] = useState(true)
  const [users, setUsers] = useState<{ id: string; name: string }[]>([])
  const [openId, setOpenId] = useState<string | null>(null)
  const [showHelp, setShowHelp] = useState(false)

  // 일괄 작업
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [bulkStage, setBulkStage] = useState('')
  const [bulkAssignee, setBulkAssignee] = useState('')
  const [bulkProcessing, setBulkProcessing] = useState(false)

  useEffect(() => { supabase.from('users').select('id, name').eq('is_active', true).order('name').then(({ data }) => setUsers(data || [])) }, []) // eslint-disable-line react-hooks/exhaustive-deps
  // 검색은 입력이 멈추고 0.3초 뒤
  useEffect(() => { const t = setTimeout(() => setQ(search), 300); return () => clearTimeout(t) }, [search])
  // 필터가 바뀌면 첫 페이지로
  useEffect(() => { setPage(0) }, [tab, q, assignee, inflow, year, followupOnly, sort, asc])

  const reqId = useRef(0)
  const fetchLeads = useCallback(async () => {
    const id = ++reqId.current
    setLoading(true)
    try {
      const res = await fetch('/api/pipeline/leads', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tab, q, assignee, inflow, year, sort, asc, page, followIds: followupOnly ? Array.from(followupIds) : undefined }),
      })
      const j = await res.json()
      if (id !== reqId.current) return
      if (!res.ok) throw new Error(j.error)
      setData(j)
      // 상세 페이지의 이전·다음 = 지금 보던 페이지 순서
      try { sessionStorage.setItem('leadNav', JSON.stringify(j.rows.map((r: Row) => r.id))) } catch { /* 저장 불가 */ }
    } catch (e) {
      if (id === reqId.current) toast.error(`리드를 불러오지 못했습니다. ${(e as Error).message || ''}`)
    }
    if (id === reqId.current) setLoading(false)
  }, [tab, q, assignee, inflow, year, sort, asc, page, followupOnly, followupOnly && followupIds]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { fetchLeads() }, [fetchLeads])

  const rows = data?.rows || []
  const uname = (id: string | null) => users.find(u => u.id === id)?.name || ''
  const toggleSort = (f: 'inquiry' | 'next') => { if (sort === f) setAsc(!asc); else { setSort(f); setAsc(f === 'next') } }
  const SortIcon = ({ f }: { f: string }) => (sort !== f ? null : asc ? <ChevronUp className="w-3 h-3 inline ml-0.5" /> : <ChevronDown className="w-3 h-3 inline ml-0.5" />)

  // 선택 — 지금 페이지 행 기준
  const toggleSelect = (id: string) => setSelectedIds(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n })
  const allOnPage = rows.length > 0 && rows.every(r => selectedIds.has(r.id))
  const toggleAll = () => setSelectedIds(prev => { const n = new Set(prev); rows.forEach(r => (allOnPage ? n.delete(r.id) : n.add(r.id))); return n })
  const clearSelection = () => { setSelectedIds(new Set()); setBulkStage(''); setBulkAssignee('') }

  const callApi = async (body: Record<string, unknown>) => {
    try {
      const res = await fetch('/api/pipeline/update', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      if (!res.ok) return { error: `HTTP ${res.status}: ${(await res.text()).substring(0, 100)}` }
      return res.json()
    } catch (err) { return { error: (err as Error).message || 'Network error' } }
  }

  const executeBulk = async () => {
    if ((!bulkStage && !bulkAssignee) || selectedIds.size === 0 || !user) return
    const ids = Array.from(selectedIds)
    setBulkProcessing(true)
    try {
      if (bulkStage) {
        // 다른 페이지에서 고른 행도 있으므로 지금 단계는 DB에서 읽는다
        const { data: cur } = await supabase.from('pipeline_leads').select('id, stage').in('id', ids)
        const stageOf = new Map((cur || []).map(l => [l.id, l.stage as string]))
        const force = confirmBulkConvertedStageChange(ids.map(id => stageOf.get(id)), bulkStage)
        const history_records = ids.filter(id => stageOf.get(id) !== bulkStage).map(id => ({ lead_id: id, field_changed: 'stage', old_value: stageOf.get(id) || '', new_value: bulkStage, changed_by: user.id }))
        const res = await callApi({ action: 'bulk_move_stage', lead_id: ids[0], lead_ids: ids, new_stage: bulkStage, history_records, force })
        if (res.error) toast.error('일괄 단계 변경에 실패했습니다.')
        else { const sk = res.skipped_locked || 0; toast.success(`${ids.length - sk}건의 단계를 "${bulkStage}"로 변경했습니다.${sk ? ` (도입완료 ${sk}건 유지)` : ''}`) }
      }
      if (bulkAssignee) {
        const res = await callApi({ action: 'bulk_assign', lead_id: ids[0], lead_ids: ids, user_id: bulkAssignee })
        if (res.error) toast.error('일괄 담당자 변경에 실패했습니다.')
        else toast.success(`${ids.length}건의 담당자를 "${uname(bulkAssignee) || '없음'}"으로 변경했습니다.`)
      }
      clearSelection()
      await fetchLeads()
    } finally { setBulkProcessing(false) }
  }

  const executeBulkDelete = async () => {
    if (selectedIds.size === 0) return
    if (!window.confirm(`선택한 ${selectedIds.size}건의 리드를 삭제하시겠습니까?\n이 작업은 되돌릴 수 없습니다.`)) return
    setBulkProcessing(true)
    const ids = Array.from(selectedIds)
    const res = await callApi({ action: 'bulk_delete', lead_id: ids[0], lead_ids: ids })
    if (res.error) toast.error('일괄 삭제에 실패했습니다.')
    else { toast.success(`${ids.length}건의 리드가 삭제되었습니다.`); clearSelection(); fetchLeads() }
    setBulkProcessing(false)
  }

  const k = data?.kpi
  const from = data ? data.page * data.pageSize : 0
  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1

  return (
    <div>
      <Toolbar
        right={<>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-ds-fg3" />
            <input className={cn(dsInput, 'pl-8 w-[220px]')} placeholder="회사명·문의자·코드·연락처 검색" value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <DsSelect value={assignee} onChange={e => setAssignee(e.target.value)}>
            <option value="전체">담당 전체</option>{users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}<option value="미배정">미배정</option>
          </DsSelect>
          <DsSelect value={inflow} onChange={e => setInflow(e.target.value)}>
            <option value="전체">유입 분류 전체</option>{INFLOW_ORDER.map(g => <option key={g}>{g}</option>)}
          </DsSelect>
          <DsSelect value={year} onChange={e => setYear(e.target.value)}>
            {YEARS.map(y => <option key={y} value={y}>{y === '전체' ? '전체 기간' : `${y}년`}</option>)}
          </DsSelect>
          <Check label={`추가 진행만 ${followupIds.size}`} checked={followupOnly} onChange={setFollowupOnly} />
          <Tabs value="list" onChange={v => v === 'board' && router.push('/pipeline/board')} options={[{ value: 'list', label: '리스트' }, { value: 'board', label: '보드' }]} />
          <div className="relative">
            <DsButton variant="ghost" size="sm" icon={<Info className="w-3.5 h-3.5" />} onClick={() => setShowHelp(v => !v)} title="기준" />
            {showHelp && (
              <div className="absolute right-0 top-8 z-30 w-[320px] bg-ds-bg border border-ds-line rounded-lg shadow-[0_8px_24px_rgba(0,0,0,.08)] p-3 text-[12px] text-ds-fg2 leading-relaxed" onClick={() => setShowHelp(false)}>
                <p><b className="text-ds-fg">진행</b> = 신규리드·컨텍·제안·미팅·도입직전</p>
                <p><b className="text-ds-fg">유입일</b> = 문의일(없으면 등록일). 연도 필터도 같은 기준</p>
                <p><b className="text-ds-fg">유입</b> = 유입 분류 11 › 세부 (디자인 정의 §5)</p>
                <p><span className="inline-block w-1.5 h-1.5 rounded-full bg-ds-bad mr-1 align-[2px]" />회사명 앞 빨간 점 = 우선순위 높음·긴급</p>
                <p><b className="text-ds-fg">추가 진행</b> = 도입완료 뒤 견적·제안·미팅·데모 활동이 있는 리드</p>
                <p>숫자줄은 필터와 상관없이 전체 기준</p>
              </div>
            )}
          </div>
          <Link href="/pipeline/new"><DsButton variant="primary" icon={<Plus className="w-3.5 h-3.5" />}>새 리드</DsButton></Link>
        </>}>
        <Tabs value={tab} onChange={setTab} options={TABS.map(t => ({ value: t, label: t, count: data?.counts[t] }))} />
      </Toolbar>

      {k && <KpiRow items={[
        { label: '이번 달 신규', value: k.month, sub: `전월 ${k.prevMonth}` },
        { label: '진행', value: k.prog, sub: '신규·컨텍·제안·미팅·도입직전' },
        { label: '예정', value: k.plan },
        { label: '이번 달 도입', value: k.wonMonth, sub: '도입일 기준' },
        { label: '올해 도입률', value: `${k.yLeads ? ((k.yWon / k.yLeads) * 100).toFixed(1) : '0.0'}%`, sub: `${k.yWon} / ${k.yLeads}` },
      ]} />}

      {selectedIds.size > 0 && (
        <div className="mb-3 flex items-center gap-2 flex-wrap px-3 py-2 rounded-lg border border-ds-line bg-ds-subtle text-[12.5px]">
          <b className="font-medium text-ds-fg">{selectedIds.size}건 선택</b>
          <span className="w-px h-4 bg-ds-line mx-1" />
          <DsSelect value={bulkStage} onChange={e => setBulkStage(e.target.value)} className="h-7 text-[12.5px]"><option value="">단계 선택</option>{STAGE_OPTIONS.map(s => <option key={s}>{s}</option>)}</DsSelect>
          <DsSelect value={bulkAssignee} onChange={e => setBulkAssignee(e.target.value)} className="h-7 text-[12.5px]"><option value="">담당자 선택</option>{users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}</DsSelect>
          <DsButton size="sm" variant="primary" loading={bulkProcessing} disabled={!bulkStage && !bulkAssignee} onClick={executeBulk}>변경</DsButton>
          <DsButton size="sm" variant="danger" icon={<Trash2 className="w-3.5 h-3.5" />} loading={bulkProcessing} onClick={executeBulkDelete}>삭제</DsButton>
          <button onClick={clearSelection} className="ml-auto text-ds-fg2 hover:text-ds-fg">선택 해제</button>
        </div>
      )}

      <div className="ds-wrap">
        <table className="ds-table is-fixed is-clickable">
          <colgroup>
            <col style={{ width: 36 }} /><col style={{ width: '7%' }} /><col style={{ width: '20%' }} /><col style={{ width: '8%' }} /><col style={{ width: '16%' }} /><col style={{ width: '8%' }} />
            <col style={{ width: '6%' }} /><col style={{ width: '11%' }} /><col style={{ width: '6%' }} /><col style={{ width: '18%' }} />
          </colgroup>
          <thead>
            <tr>
              <th className="!px-0 !text-center"><input type="checkbox" checked={allOnPage} onChange={toggleAll} className="w-3.5 h-3.5 accent-[var(--ds-accent)] align-middle" title="이 페이지 전체 선택" /></th>
              <th className="cursor-pointer select-none" onClick={() => toggleSort('inquiry')}>유입일<SortIcon f="inquiry" /></th>
              <th>회사명</th><th>단계</th><th>유입</th><th>담당</th>
              <th>발주</th><th>사업분류</th><th>가능성</th>
              <th className="cursor-pointer select-none" onClick={() => toggleSort('next')}>다음 액션<SortIcon f="next" /></th>
            </tr>
          </thead>
          <tbody className={cn(loading && data && 'opacity-60 transition-opacity')}>
            {rows.map(l => (
              <tr key={l.id} className={cn('ds-row', openId === l.id && 'is-active')} onClick={() => setOpenId(l.id)}>
                <td className="!px-0 !text-center" onClick={e => e.stopPropagation()}><input type="checkbox" checked={selectedIds.has(l.id)} onChange={() => toggleSelect(l.id)} className="w-3.5 h-3.5 accent-[var(--ds-accent)] align-middle" /></td>
                <td className="c">{md(l.date)}</td>
                <td className="truncate" title={l.company_name}>
                  {(l.priority === '높음' || l.priority === '긴급') && <span className="inline-block w-1.5 h-1.5 rounded-full bg-ds-bad mr-1.5 align-[2px]" title={`우선순위 ${l.priority}`} />}
                  <span className="font-medium">{l.company_name}</span>
                </td>
                <td className="c"><StatusChip tone={stageTone(l.stage)}>{l.stage}</StatusChip></td>
                <td className="truncate" title={`${l.group} › ${l.sub}`}><span className="inline-block w-[7px] h-[7px] rounded-full mr-1.5 align-[1px]" style={{ background: INFLOW_COLOR[l.group] }} />{l.group} <span className="text-ds-fg3">› {l.sub}</span></td>
                <td className="c truncate">{l.assigned_to ? <Avatar name={uname(l.assigned_to)} /> : <span className="text-ds-fg3">—</span>}</td>
                <td className="c">{l.site_category || <span className="text-ds-fg3">—</span>}</td>
                <td className="truncate" title={l.industry || ''}>{l.industry || <span className="text-ds-fg3">—</span>}</td>
                <td className="c">{l.conversion_probability || <span className="text-ds-fg3">—</span>}</td>
                <td className="truncate" title={l.next_action || ''}>
                  {l.next_action || l.next_action_date
                    ? <>{l.next_action}{l.next_action_date && <span className={cn('ml-1.5 tabular-nums', dueClass(l.next_action_date, data!.today))}>{md(l.next_action_date)}</span>}</>
                    : <span className="text-ds-fg3 hover:text-ds-accent">+ 다음 액션</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!data && loading && <div className="px-4"><Skeleton rows={10} /></div>}
        {data && rows.length === 0 && <Empty text="조건에 맞는 리드가 없습니다." action={<Link href="/pipeline/new"><DsButton size="sm" icon={<Plus className="w-3.5 h-3.5" />}>새 리드</DsButton></Link>} />}
        {data && data.total > 0 && (
          <div className="flex items-center justify-end gap-2 px-3 h-10 border-t border-ds-line text-[12.5px] text-ds-fg2">
            <span className="tabular-nums">{(from + 1).toLocaleString()}–{Math.min(from + data.pageSize, data.total).toLocaleString()} / {data.total.toLocaleString()}</span>
            <DsButton variant="ghost" size="sm" disabled={data.page === 0} onClick={() => setPage(data.page - 1)} icon={<ChevronLeft className="w-3.5 h-3.5" />} title="이전" />
            <span className="tabular-nums">{data.page + 1} / {pages}</span>
            <DsButton variant="ghost" size="sm" disabled={data.page + 1 >= pages} onClick={() => setPage(data.page + 1)} icon={<ChevronRight className="w-3.5 h-3.5" />} title="다음" />
          </div>
        )}
      </div>

      <LeadDrawer leadId={openId} users={users} onClose={() => setOpenId(null)} onChanged={fetchLeads} />
    </div>
  )
}
