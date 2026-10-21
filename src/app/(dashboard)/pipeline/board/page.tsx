'use client'

// 세일즈 › 보드 (2026-10-21 개편, 디자인 정의 › 세일즈)
// 연회색 열 220 + 머리 3px 단계 색 · 카드 3줄(회사·담당 / 유입·유입일·+n일 / 다음 액션)
// 이탈은 오른쪽 접힌 열(도입완료는 펼친 채 시작) · 열당 30장 + 더 보기 · 드래그는 dnd-kit(카드가 손을 따라 움직임)
// 카드 클릭 = 리스트와 같은 480 드로어, Shift+클릭 = 선택(일괄 단계·담당)
import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { DndContext, DragOverlay, PointerSensor, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent, type DragStartEvent } from '@dnd-kit/core'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/hooks/useAuth'
import { confirmConvertedStageChange, confirmBulkConvertedStageChange, cn } from '@/lib/utils'
import { useFollowupLeadIds } from '@/hooks/useFollowupLeadIds'
import { INFLOW_COLOR, type InflowGroup } from '@/lib/inflow-taxonomy'
import { SelectionBar, Toolbar, Tabs, DsButton, DsSelect, Check, Skeleton, stageTone, toneVar, dsInput } from '@/components/ds'
import { LeadDrawer, STAGE_OPTIONS } from '@/components/pipeline/lead-drawer'
import { toast } from 'sonner'
import { since } from '@/lib/elapsed'
import { fetchJson, getCached, prefetchLead } from '@/lib/swr-cache'
import { useActiveUsers } from '@/hooks/useActiveUsers'
import { Plus, Search, Info, ChevronsRight } from 'lucide-react'

const OPEN = ['신규리드', '컨텍', '예정', '제안', '미팅', '도입직전'] // 10/21: 팀 원래 순서
const CLOSED = ['도입완료', '이탈']
const STEP = 30
type Card = { id: string; company_name: string; stage: string; priority: string | null; date: string; assigned_to: string | null; next_action: string | null; next_action_date: string | null; group: InflowGroup; sub: string }
type Cols = Record<string, { n: number; cards: Card[] }>

const thisYear = new Date().getFullYear()
const YEARS = ['전체', ...Array.from({ length: thisYear - 2023 }, (_, i) => String(thisYear - i))]
const today = () => new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10)
const md = (s: string | null) => (s ? s.slice(5).replace('-', '.') : '')

function CardBody({ c, uname, follow, today: t }: { c: Card; uname: string; follow: boolean; today: string }) {
  const due = c.next_action_date ? (c.next_action_date < t ? 'text-ds-bad' : c.next_action_date === t ? 'text-ds-warn' : 'text-ds-fg2') : 'text-ds-fg2'
  return <>
    <div className="flex items-center gap-1.5 min-w-0">
      {(c.priority === '높음' || c.priority === '긴급') && <span className="w-1.5 h-1.5 rounded-full bg-ds-bad flex-none" title={`우선순위 ${c.priority}`} />}
      <b className="flex-1 min-w-0 truncate text-[13px] font-medium text-ds-fg">{c.company_name}</b>
      {follow && <span className="text-[10.5px] text-ds-accent flex-none">추가 진행</span>}
      {uname && <span className="inline-grid place-items-center w-5 h-5 rounded-full bg-ds-line text-ds-fg2 text-[10.5px] font-semibold flex-none" title={uname}>{uname[0]}</span>}
    </div>
    <div className="mt-0.5 text-[12px] text-ds-fg3 truncate">
      <span className="inline-block w-1.5 h-1.5 rounded-full mr-1 align-[1px]" style={{ background: INFLOW_COLOR[c.group] }} />{c.sub === '기타' || c.sub === '미분류' ? c.group : c.sub} · {md(c.date)} · {since(c.date, t)}
    </div>
    <div className={cn('mt-1 text-[12px] truncate', c.next_action || c.next_action_date ? due : 'text-ds-fg3')}>
      {c.next_action || c.next_action_date ? <>{c.next_action}{c.next_action_date && <span className="ml-1 tabular-nums">{md(c.next_action_date)}</span>}</> : '+ 다음 액션'}
    </div>
  </>
}

function DraggableCard({ c, children, selected, onClick }: { c: Card; children: React.ReactNode; selected: boolean; onClick: (e: React.MouseEvent) => void }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: c.id, data: { stage: c.stage } })
  return (
    <div ref={setNodeRef} {...attributes} {...listeners} onClick={onClick} onMouseEnter={() => prefetchLead(c.id)}
      className={cn('bg-ds-bg border rounded-md px-2.5 py-2 cursor-grab select-none transition-[border-color,opacity] hover:border-ds-fg3 outline-none',
        selected ? 'border-ds-accent ring-1 ring-ds-accent' : 'border-ds-line', isDragging && 'opacity-30')}>
      {children}
    </div>
  )
}

function Column({ stage, n, children, onMore, more, onFold }: { stage: string; n: number; children: React.ReactNode; onMore?: () => void; more: number; onFold?: () => void }) {
  const { setNodeRef, isOver } = useDroppable({ id: stage })
  return (
    <div ref={setNodeRef} className={cn('w-[220px] flex-none flex flex-col rounded-md bg-ds-subtle transition-shadow', isOver && 'ring-2 ring-ds-accent')}>
      <div className="h-9 flex items-center gap-2 px-2.5 border-t-[3px] rounded-t-md flex-none" style={{ borderTopColor: toneVar[stageTone(stage)] }}>
        <b className="text-[13px] font-semibold text-ds-fg">{stage}</b><span className="text-[12px] text-ds-fg2 tabular-nums">{n}</span>
        {onFold && <button onClick={onFold} className="ml-auto text-ds-fg3 hover:text-ds-fg" title="접기"><ChevronsRight className="w-3.5 h-3.5" /></button>}
      </div>
      <div className="flex-1 overflow-y-auto scroll-stable px-2 pb-2 flex flex-col gap-2">
        {children}
        {more > 0 && <button onClick={onMore} className="h-8 rounded-md text-[12px] text-ds-fg2 hover:bg-ds-bg hover:text-ds-fg flex-none">더 보기 {more.toLocaleString()}</button>}
      </div>
    </div>
  )
}

function Folded({ stage, n, onOpen }: { stage: string; n: number; onOpen: () => void }) {
  const { setNodeRef, isOver } = useDroppable({ id: stage })
  return (
    <button ref={setNodeRef} onClick={onOpen} title="펼치기"
      className={cn('w-10 flex-none flex flex-col items-center gap-2 py-2.5 rounded-md bg-ds-subtle border-t-[3px] hover:bg-ds-line2 transition-shadow', isOver && 'ring-2 ring-ds-accent')}
      style={{ borderTopColor: toneVar[stageTone(stage)] }}>
      <b className="[writing-mode:vertical-rl] text-[12.5px] font-semibold text-ds-fg">{stage}</b>
      <span className="text-[12px] text-ds-fg2 tabular-nums">{n}</span>
    </button>
  )
}

export default function PipelineBoardPage() {
  const router = useRouter()
  const supabase = createClient()
  const { user } = useAuth()
  const followupIds = useFollowupLeadIds()

  const [cols, setCols] = useState<Cols | null>(null)
  const [search, setSearch] = useState('')
  const [q, setQ] = useState('')
  const [assignee, setAssignee] = useState('전체')
  const [year, setYear] = useState('전체')
  const [mine, setMine] = useState(false)
  const [limits, setLimits] = useState<Record<string, number>>({})
  // 10/21 피드백: 도입완료는 펼친 채로 시작, 이탈만 접힘
  const [unfold, setUnfold] = useState<Set<string>>(new Set(['도입완료']))
  const users = useActiveUsers()
  const [openId, setOpenId] = useState<string | null>(null)
  const [dragId, setDragId] = useState<string | null>(null)
  const [showHelp, setShowHelp] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [bulkStage, setBulkStage] = useState('')
  const [bulkAssignee, setBulkAssignee] = useState('')
  const [busy, setBusy] = useState(false)
  const t = today()

  useEffect(() => { const x = setTimeout(() => setQ(search), 300); return () => clearTimeout(x) }, [search])

  const who = mine && user ? user.id : assignee
  const reqId = useRef(0)
  const fetchBoard = useCallback(async () => {
    const id = ++reqId.current
    const body = JSON.stringify({ q, assignee: who, year, limits })
    const cached = getCached<{ cols: Cols }>(`board:${body}`)
    if (cached) setCols(cached.cols)
    try {
      const j = await fetchJson<{ cols: Cols }>(`board:${body}`, '/api/pipeline/board', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body })
      if (id !== reqId.current) return
      setCols(j.cols)
    } catch (e) { if (id === reqId.current) toast.error(`보드를 불러오지 못했습니다. ${(e as Error).message || ''}`) }
  }, [q, who, year, limits])
  useEffect(() => { fetchBoard() }, [fetchBoard])

  const uname = (id: string | null) => users.find(u => u.id === id)?.name || ''
  const findCard = (id: string) => { if (!cols) return null; for (const s in cols) { const c = cols[s].cards.find(x => x.id === id); if (c) return c } return null }

  const callApi = async (body: Record<string, unknown>) => {
    const res = await fetch('/api/pipeline/update', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    const j = await res.json().catch(() => ({}))
    return res.ok ? j : { error: j.error || `HTTP ${res.status}` }
  }

  // 카드 옮기기 — 화면을 먼저 바꾸고(낙관적), 실패하면 다시 읽는다
  const move = async (id: string, to: string) => {
    const c = findCard(id)
    if (!c || !cols || c.stage === to) return
    const { proceed, force } = confirmConvertedStageChange(c.stage, to)
    if (!proceed) return
    const from = c.stage
    setCols(prev => prev && ({
      ...prev,
      [from]: { n: prev[from].n - 1, cards: prev[from].cards.filter(x => x.id !== id) },
      [to]: { n: prev[to].n + 1, cards: [{ ...c, stage: to }, ...prev[to].cards] },
    }))
    const res = await callApi({ action: 'change_stage', lead_id: id, new_stage: to, old_stage: from, changed_by: user?.id, force })
    if (res.error) { toast.error(`단계 변경에 실패했습니다. ${res.error}`); fetchBoard() }
    else toast.success(`"${c.company_name}" → ${to}`)
  }

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }))
  const onDragStart = (e: DragStartEvent) => setDragId(String(e.active.id))
  const onDragEnd = (e: DragEndEvent) => { setDragId(null); if (e.over) move(String(e.active.id), String(e.over.id)) }

  const onCardClick = (e: React.MouseEvent, id: string) => {
    if (e.shiftKey || selected.size > 0) {
      setSelected(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n })
      return
    }
    setOpenId(id)
  }
  const clearSel = () => { setSelected(new Set()); setBulkStage(''); setBulkAssignee('') }
  const runBulk = async () => {
    if (!user || selected.size === 0) return
    const ids = Array.from(selected)
    setBusy(true)
    try {
      if (bulkStage) {
        const stageOf = new Map(ids.map(id => [id, findCard(id)?.stage]))
        const force = confirmBulkConvertedStageChange(ids.map(id => stageOf.get(id)), bulkStage)
        const history_records = ids.filter(id => stageOf.get(id) !== bulkStage).map(id => ({ lead_id: id, field_changed: 'stage', old_value: stageOf.get(id) || '', new_value: bulkStage, changed_by: user.id }))
        const r = await callApi({ action: 'bulk_move_stage', lead_id: ids[0], lead_ids: ids, new_stage: bulkStage, history_records, force })
        if (r.error) toast.error('일괄 단계 변경에 실패했습니다.')
        else { const sk = r.skipped_locked || 0; toast.success(`${ids.length - sk}건 → ${bulkStage}${sk ? ` (도입완료 ${sk}건 유지)` : ''}`) }
      }
      if (bulkAssignee) {
        const r = await callApi({ action: 'bulk_assign', lead_id: ids[0], lead_ids: ids, user_id: bulkAssignee })
        if (r.error) toast.error('일괄 담당자 변경에 실패했습니다.')
        else toast.success(`${ids.length}건 담당 → ${uname(bulkAssignee)}`)
      }
      clearSel(); await fetchBoard()
    } finally { setBusy(false) }
  }

  const dragCard = dragId ? findCard(dragId) : null
  const renderCol = (s: string) => {
    const col = cols![s]
    return (
      <Column key={s} stage={s} n={col.n} more={col.n - col.cards.length} onMore={() => setLimits(l => ({ ...l, [s]: (l[s] ?? STEP) + STEP }))}
        onFold={CLOSED.includes(s) ? () => setUnfold(u => { const n = new Set(u); n.delete(s); return n }) : undefined}>
        {col.cards.map(c => (
          <DraggableCard key={c.id} c={c} selected={selected.has(c.id) || openId === c.id} onClick={e => onCardClick(e, c.id)}>
            <CardBody c={c} uname={uname(c.assigned_to)} follow={followupIds.has(c.id)} today={t} />
          </DraggableCard>
        ))}
        {col.n === 0 && <div className="py-6 text-center text-[12px] text-ds-fg3">없음</div>}
      </Column>
    )
  }

  return (
    <div className="flex flex-col h-[calc(100vh-var(--header-height)-80px)]">
      <Toolbar
        right={<>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-ds-fg3" />
            <input className={cn(dsInput, 'pl-8 w-[200px]')} placeholder="회사명·문의자·연락처 검색" value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <DsSelect value={assignee} disabled={mine} onChange={e => setAssignee(e.target.value)}>
            <option value="전체">담당 전체</option>{users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}<option value="미배정">미배정</option>
          </DsSelect>
          <DsSelect value={year} onChange={e => setYear(e.target.value)}>
            {YEARS.map(y => <option key={y} value={y}>{y === '전체' ? '전체 기간' : `${y}년`}</option>)}
          </DsSelect>
          <Check label="내 리드만" checked={mine} onChange={setMine} />
          <div className="relative">
            <DsButton variant="ghost" size="sm" icon={<Info className="w-3.5 h-3.5" />} onClick={() => setShowHelp(v => !v)} title="기준" />
            {showHelp && (
              <div className="absolute right-0 top-8 z-30 w-[320px] bg-ds-bg border border-ds-line rounded-lg shadow-[0_8px_24px_rgba(0,0,0,.08)] p-3 text-[12px] text-ds-fg2 leading-relaxed" onClick={() => setShowHelp(false)}>
                <p>카드를 끌어 다른 열에 놓으면 단계가 바뀝니다 (이력 기록)</p>
                <p>카드 클릭 = 오른쪽 드로어 · <b className="text-ds-fg">Shift+클릭</b> = 선택 → 일괄 단계·담당</p>
                <p>열 안 순서: 다음 액션 날짜 빠른 순 → 나머지 최근 유입순</p>
                <p>카드 2줄 = 유입 세부 · 유입일 · 유입 후 지난 날(+n일)</p>
                <p>이탈은 오른쪽에 접혀 있고, 누르면 펼칩니다. 도입완료도 머리의 » 로 접을 수 있습니다. 접힌 열에도 놓을 수 있습니다</p>
              </div>
            )}
          </div>
          <Link href="/pipeline/new"><DsButton variant="primary" icon={<Plus className="w-3.5 h-3.5" />}>새 리드</DsButton></Link>
        </>}>
        <Tabs value="board" onChange={v => v === 'list' && router.push('/pipeline/list')} options={[{ value: 'list', label: '리스트' }, { value: 'board', label: '보드' }]} />
      </Toolbar>

      <SelectionBar count={selected.size} onClear={clearSel}>
          <DsSelect value={bulkStage} onChange={e => setBulkStage(e.target.value)} className="h-7 text-[12.5px]"><option value="">단계 선택</option>{STAGE_OPTIONS.map(s => <option key={s}>{s}</option>)}</DsSelect>
          <DsSelect value={bulkAssignee} onChange={e => setBulkAssignee(e.target.value)} className="h-7 text-[12.5px]"><option value="">담당자 선택</option>{users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}</DsSelect>
          <DsButton size="sm" variant="primary" loading={busy} disabled={!bulkStage && !bulkAssignee} onClick={runBulk}>변경</DsButton>
          
      </SelectionBar>

      {!cols ? <Skeleton rows={10} /> : (
        <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd} onDragCancel={() => setDragId(null)}>
          <div className="flex-1 min-h-0 flex gap-3">
            <div className="flex-1 min-w-0 flex gap-3 overflow-x-auto pb-1">
              {OPEN.map(renderCol)}
              {CLOSED.filter(s => unfold.has(s)).map(renderCol)}
            </div>
            {CLOSED.some(s => !unfold.has(s)) && (
              <div className="flex gap-3 flex-none">
                {CLOSED.filter(s => !unfold.has(s)).map(s => <Folded key={s} stage={s} n={cols[s].n} onOpen={() => setUnfold(u => new Set(u).add(s))} />)}
              </div>
            )}
          </div>
          <DragOverlay dropAnimation={{ duration: 180, easing: 'cubic-bezier(.2,.8,.2,1)' }}>
            {dragCard && (
              <div className="w-[204px] bg-ds-bg border border-ds-fg3 rounded-md px-2.5 py-2 shadow-[0_10px_28px_rgba(0,0,0,.14)] rotate-[1.5deg] cursor-grabbing">
                <CardBody c={dragCard} uname={uname(dragCard.assigned_to)} follow={followupIds.has(dragCard.id)} today={t} />
              </div>
            )}
          </DragOverlay>
        </DndContext>
      )}

      <LeadDrawer leadId={openId} users={users} onClose={() => setOpenId(null)} onChanged={fetchBoard} />
    </div>
  )
}
