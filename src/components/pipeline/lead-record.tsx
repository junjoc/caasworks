'use client'

// 리드 기록 칸 + 타임라인 — 드로어·상세 페이지 공용 (2026-10-21, 디자인 정의 › 세일즈 › 리드 상세 "기록은 한 곳으로")
// 기록 한 번 = 활동 + 다음 액션(정함·바꿈·완료) + 단계 앞으로 자동 이동. 타임라인은 활동과 단계·담당·다음 액션·칸 변경을 한 줄로.
import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { ACTIVITY_TYPE_LABELS, cn } from '@/lib/utils'
import { DsButton, DsSelect, dsInput } from '@/components/ds'
import type { TimelineItem } from '@/app/api/pipeline/lead/[id]/route'
import { toast } from 'sonner'
import { kstToday, kstDate } from '@/lib/elapsed'
import { fetchJson, getCached, setCached } from '@/lib/swr-cache'

export type { TimelineItem }
export type Related = { id: string; code: string | null; company: string; where: string | null; stage: string; date: string; assignee: string | null; content: string }
export type LeadOverview = { lead: Record<string, any>; timeline: TimelineItem[]; users: { id: string; name: string }[]; customer: { id: string; company_name: string; customer_code: string | null } | null; voc: any[]; related?: Related[] }

// 리드 한 건 읽기 — 요청 1번
export function useLeadOverview(id: string | null) {
  const [data, setData] = useState<LeadOverview | null>(null)
  const [error, setError] = useState<string | null>(null)
  const load = useCallback(async (fresh = true) => {
    if (!id) return
    try {
      // 저장 뒤 다시 읽을 때는 진행 중인 미리 읽기를 쓰지 않도록 키를 바꾼다
      const j = await fetchJson<LeadOverview>(fresh ? `lead:${id}:${Date.now()}` : `lead:${id}`, `/api/pipeline/lead/${id}`)
      setCached(`lead:${id}`, j)
      setData(j); setError(null)
    } catch (e) { setError((e as Error).message) }
  }, [id])
  // 본 적 있거나 미리 읽은 리드는 바로 보여 주고, 뒤에서 새로 읽는다
  useEffect(() => {
    const c = id ? getCached<LeadOverview>(`lead:${id}`) : undefined
    setData(c || null); setError(null)
    load(false)
  }, [id, load])
  return { data, error, reload: () => load(true) }
}

export async function postUpdate(body: Record<string, unknown>) {
  try {
    const res = await fetch('/api/pipeline/update', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    const j = await res.json().catch(() => ({}))
    return res.ok ? j : { error: j.error || `HTTP ${res.status}` }
  } catch (e) { return { error: (e as Error).message } }
}

const QUICK = [['CALL_OUT', '전화 발신'], ['CALL_IN', '전화 수신'], ['EMAIL_SENT', '이메일'], ['MEETING', '미팅'], ['QUOTATION', '견적'], ['NOTE', '메모']] as const
const MORE = ['EMAIL_RECV', 'DEMO', 'PROPOSAL', 'CONTRACT', 'ONBOARDING', 'FOLLOWUP']
export const typeLabel = (t?: string) => ({ CALL_OUT: '전화 발신', CALL_IN: '전화 수신', EMAIL_SENT: '이메일 발송', EMAIL_RECV: '이메일 수신', QUOTATION: '견적', NOTE: '메모' } as Record<string, string>)[t || ''] || ACTIVITY_TYPE_LABELS[t || ''] || t || ''
const md = (s?: string | null) => (s ? s.slice(5, 10).replace('-', '.') : '')
const kst = kstToday

/* ─── 기록 칸 ─── */
export function RecordComposer({ lead, onDone, compact }: { lead: Record<string, any>; onDone: () => void; compact?: boolean }) {
  const { user } = useAuth()
  const [type, setType] = useState('CALL_OUT')
  const [text, setText] = useState('')
  const [next, setNext] = useState({ text: '', date: '' })
  const [complete, setComplete] = useState(true)
  // 실제 일어난 날 (회의록을 나중에 올릴 때). 오늘이면 지금 시각, 지난 날이면 그날 낮 12시로
  const [when, setWhen] = useState(kst())
  const [busy, setBusy] = useState(false)
  const hasNext = !!(lead.next_action || lead.next_action_date)
  const curNext = [lead.next_action, md(lead.next_action_date)].filter(Boolean).join(' ')
  // 내용·다음 액션 중 하나, 또는 지금 다음 액션 완료 처리만 해도 기록
  const can = !!(text.trim() || next.text.trim() || next.date || (hasNext && complete))

  const submit = async () => {
    if (!user || !can || busy) return
    setBusy(true)
    const performed_at = when && when !== kst() ? `${when}T12:00:00+09:00` : undefined
    const r = await postUpdate({ action: 'record', lead_id: lead.id, activity_type: type, content: text, performed_by: user.id, performed_at, next_action: next.text, next_action_date: next.date, complete_next: hasNext && complete })
    setBusy(false)
    if (r.error) { toast.error(`기록하지 못했습니다. ${r.error}`); return }
    toast.success(r.stage ? `기록했습니다 · 단계 → ${r.stage}` : '기록했습니다')
    setText(''); setNext({ text: '', date: '' }); setComplete(true); setWhen(kst())
    onDone()
  }

  return (
    <div className="border border-ds-line rounded-md p-2.5 bg-ds-bg">
      <div className="flex items-center gap-1 flex-wrap">
        {QUICK.map(([v, l]) => (
          <button key={v} type="button" onClick={() => setType(v)}
            className={cn('h-6 px-2 rounded text-[12px] border', type === v ? 'bg-ds-fg text-ds-bg border-ds-fg' : 'border-ds-line text-ds-fg2 hover:text-ds-fg')}>{l}</button>
        ))}
        <DsSelect value={MORE.includes(type) ? type : ''} onChange={e => e.target.value && setType(e.target.value)} className={cn('h-6 text-[12px] pl-2', MORE.includes(type) && 'border-ds-fg text-ds-fg')}>
          <option value="">그 외</option>{MORE.map(v => <option key={v} value={v}>{ACTIVITY_TYPE_LABELS[v]}</option>)}
        </DsSelect>
        <span className="flex-1" />
        <label className="inline-flex items-center gap-1 text-[12px] text-ds-fg3" title="실제로 일어난 날 — 회의록을 나중에 올릴 때 그날로">
          언제
          <input type="date" value={when} max={kst()} onChange={e => setWhen(e.target.value || kst())}
            className={cn(dsInput, 'h-6 text-[12px] !w-[124px] px-1.5', when !== kst() && 'border-ds-warn text-ds-fg')} />
        </label>
      </div>
      <textarea value={text} onChange={e => setText(e.target.value)} rows={compact ? 2 : 3}
        onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); submit() } }}
        placeholder="통화·미팅 내용을 적으세요 (Enter 기록 · Shift+Enter 줄바꿈)"
        className="w-full mt-2 px-2.5 py-1.5 rounded border border-ds-line bg-ds-subtle text-[13px] text-ds-fg placeholder:text-ds-fg3 focus:outline-none focus:ring-2 focus:ring-ds-accent focus:bg-ds-bg resize-y" />
      <div className="flex items-center gap-1.5 mt-1.5">
        <span className="text-[12px] text-ds-fg3 flex-none w-[52px]">다음 액션</span>
        <input className={cn(dsInput, 'h-7 text-[12.5px] flex-1 min-w-0')} placeholder={hasNext ? `지금: ${curNext} (비우면 유지)` : '예: 견적서 발송 (선택)'} value={next.text} onChange={e => setNext({ ...next, text: e.target.value })} />
        <input type="date" className={cn(dsInput, 'h-7 text-[12.5px] !w-[128px] flex-none')} value={next.date} min={kst()} onChange={e => setNext({ ...next, date: e.target.value })} />
      </div>
      <div className="flex items-center gap-2 mt-2">
        {hasNext && !next.text.trim() && !next.date && (
          <label className="inline-flex items-center gap-1.5 text-[12px] text-ds-fg2 cursor-pointer select-none min-w-0">
            <input type="checkbox" checked={complete} onChange={e => setComplete(e.target.checked)} className="w-3.5 h-3.5 accent-[var(--ds-accent)]" />
            <span className="truncate">지금 다음 액션 &quot;{curNext}&quot; 완료로</span>
          </label>
        )}
        <span className="flex-1" />
        <DsButton size="sm" variant="primary" loading={busy} disabled={!can} onClick={submit}>기록</DsButton>
      </div>
    </div>
  )
}

/* ─── 타임라인 ─── */
const FIELD_LABEL: Record<string, string> = {
  priority: '우선순위', conversion_probability: '도입가능성', company_name: '회사명', customer_code: 'ID', site_name: '현장명', site_region: '지역', contact_team: '본사 팀', site_category: '발주', industry: '사업분류',
  contact_person: '문의자', contact_position: '직급', contact_phone: '연락처', contact_email: '이메일', inquiry_date: '유입일', inquiry_channel: '유입 채널',
  inquiry_source: '유입 경로', interest_service: '관심 서비스', core_need: '핵심 니즈', inquiry_content: '문의 내용', notes: '메모', customer_id: '고객사 연결',
}
const LONG = ['inquiry_content', 'notes', 'customer_id']

// 날짜별 묶음 (화면 문법 v2): 활동은 크게, 다음 액션은 한 줄, 단계·담당·칸 변경이 하루 3건 이상이면 한 줄로 접음
const WD = ['일', '월', '화', '수', '목', '금', '토']
function dayTitle(d: string, today: string) {
  const dt = new Date(d)
  const base = `${Number(d.slice(5, 7))}월 ${Number(d.slice(8, 10))}일 (${WD[dt.getUTCDay()]})`
  return d === today ? `오늘 · ${base}` : d.slice(0, 4) === today.slice(0, 4) ? base : `${d.slice(0, 4)}년 ${base}`
}
const mmdd2 = (s: string) => kstDate(s).slice(5).replace('-', '.')
const hm = (s: string) => new Date(new Date(s).getTime() + 9 * 3600 * 1000).toISOString().slice(11, 16)

export function Timeline({ items, limit, editable, leadId, onChanged }: { items: TimelineItem[]; limit?: number; editable?: boolean; leadId: string; onChanged: () => void }) {
  const { user } = useAuth()
  const [edit, setEdit] = useState<{ id: string; type: string; desc: string; date: string } | null>(null)
  const [openDays, setOpenDays] = useState<Set<string>>(new Set())
  const list = limit ? items.slice(0, limit) : items
  if (!list.length) return <p className="text-[12.5px] text-ds-fg3 py-2">아직 기록이 없습니다.</p>

  const save = async () => {
    if (!edit) return
    const orig = items.find(i => i.id === edit.id)
    const moved = orig && kstDate(orig.at) !== edit.date
    const r = await postUpdate({ action: 'edit_activity', lead_id: leadId, activity_id: edit.id, activity_type: edit.type, title: ACTIVITY_TYPE_LABELS[edit.type] || edit.type, description: edit.desc || null, performed_at: moved ? `${edit.date}T12:00:00+09:00` : undefined })
    if (r.error) { toast.error('수정하지 못했습니다.'); return }
    setEdit(null); onChanged()
  }
  const del = async (id: string) => {
    if (!window.confirm('이 기록을 삭제할까요?')) return
    const r = await postUpdate({ action: 'delete_activity', lead_id: leadId, activity_id: id })
    if (r.error) toast.error('삭제하지 못했습니다.'); else onChanged()
  }

  const today = kst()
  const days: { d: string; items: TimelineItem[] }[] = []
  for (const it of list) {
    const d = kstDate(it.at)
    if (!days.length || days[days.length - 1].d !== d) days.push({ d, items: [] })
    days[days.length - 1].items.push(it)
  }
  const dot = (k: string) => <span className={cn('absolute -left-[20.5px] top-[5px] w-[7px] h-[7px] rounded-full', k === 'act' ? 'bg-ds-accent' : k === 'next' ? 'bg-ds-warn' : 'bg-ds-line')} />
  // 나중에 기록한 활동은 시각 대신 이름만 (시각은 그날 12시로 넣은 값이라)
  const meta = (it: TimelineItem) => <span className="text-ds-fg3 text-[12px] tabular-nums whitespace-nowrap">{it.rec && kstDate(it.rec) !== kstDate(it.at) ? '' : `${hm(it.at)} · `}{it.by}</span>

  const changeText = (it: TimelineItem) => it.kind === 'stage' ? <>단계 {it.old || '—'} → <b className="font-medium text-ds-fg">{it.new}</b></>
    : it.kind === 'assign' ? <>담당 {it.old || '없음'} → <b className="font-medium text-ds-fg">{it.new || '없음'}</b></>
    : LONG.includes(it.field || '') ? <>{FIELD_LABEL[it.field || ''] || it.field} 수정</>
    : <>{FIELD_LABEL[it.field || ''] || it.field} {it.old || '—'} → <b className="font-medium text-ds-fg">{it.new || '—'}</b></>

  return (
    <div className="grid gap-3">
      {days.map(({ d, items: di }) => {
        const changes = di.filter(it => it.kind === 'stage' || it.kind === 'assign' || it.kind === 'field')
        const folded = changes.length >= 3 && !openDays.has(d)
        // 접힌 날: 그날 단계 흐름 한 줄 (오래된 순)
        const flow = changes.filter(c => c.kind === 'stage').reverse()
        const summary = flow.length ? [flow[0].old || '—', ...flow.map(c => c.new)].join(' → ') : ''
        return (
          <div key={d}>
            <div className="text-[12px] font-semibold text-ds-fg2 mb-1.5">{dayTitle(d, today)}</div>
            <ol className="relative ml-1.5 pl-4 border-l border-ds-line text-[12.5px]">
              {di.map(it => {
                if (it.kind === 'act') {
                  const showTitle = it.title && it.title !== ACTIVITY_TYPE_LABELS[it.type || '']
                  const canEdit = editable && !!user && (it.byId === user.id || user.role === 'admin')
                  return (
                    <li key={it.id} className="relative mb-2.5 group">
                      {dot('act')}
                      <div className="flex items-center gap-2">
                        <span className="text-[12px] px-1.5 rounded bg-ds-accent-soft text-ds-accent whitespace-nowrap">{typeLabel(it.type)}</span>
                        {meta(it)}
                        {it.rec && kstDate(it.rec) !== kstDate(it.at) && <span className="text-[12px] text-ds-fg3" title={`실제 기록 ${it.rec.slice(0, 16).replace('T', ' ')}`}>· {mmdd2(it.rec)} 기록</span>}
                        {canEdit && edit?.id !== it.id && (
                          <span className="ml-auto text-[12px] text-ds-fg3 opacity-0 group-hover:opacity-100 flex gap-2">
                            <button onClick={() => setEdit({ id: it.id, type: it.type || 'NOTE', desc: [showTitle ? it.title : '', it.desc || ''].filter(Boolean).join('\n'), date: kstDate(it.at) })} className="hover:text-ds-fg">수정</button>
                            <button onClick={() => del(it.id)} className="hover:text-ds-bad">삭제</button>
                          </span>
                        )}
                      </div>
                      {edit?.id === it.id ? (
                        <div className="mt-1.5 grid gap-1.5">
                          <div className="flex gap-1.5 items-center">
                            <DsSelect value={edit.type} onChange={e => setEdit({ ...edit, type: e.target.value })} className="h-7 text-[12px] w-[160px]">
                            {Object.entries(ACTIVITY_TYPE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                          </DsSelect>
                            <span className="text-[12px] text-ds-fg3 ml-1">언제</span>
                            <input type="date" value={edit.date} max={today} onChange={e => setEdit({ ...edit, date: e.target.value || edit.date })} className={cn(dsInput, 'h-7 text-[12px] !w-[132px]')} />
                          </div>
                          <textarea value={edit.desc} onChange={e => setEdit({ ...edit, desc: e.target.value })} rows={3} className="w-full px-2.5 py-1.5 rounded border border-ds-line text-[13px] focus:outline-none focus:ring-2 focus:ring-ds-accent" />
                          <div className="flex gap-1.5"><DsButton size="sm" variant="primary" onClick={save}>저장</DsButton><DsButton size="sm" variant="ghost" onClick={() => setEdit(null)}>취소</DsButton></div>
                        </div>
                      ) : (
                        <>
                          {showTitle && <p className="mt-1 text-ds-fg font-medium whitespace-pre-wrap break-words">{it.title}</p>}
                          {it.desc && <p className="mt-1 text-ds-fg whitespace-pre-wrap break-words leading-relaxed">{it.desc}</p>}
                        </>
                      )}
                    </li>
                  )
                }
                // 온라인 재문의 (홈페이지 문의폼으로 같은 사람이 다시 문의 — 10/21)
                if (it.kind === 'reinq') return (
                  <li key={it.id} className="relative mb-2.5">
                    <span className="absolute -left-[20.5px] top-[5px] w-[7px] h-[7px] rounded-full bg-ds-warn" />
                    <div className="flex items-center gap-2"><span className="text-[12px] px-1.5 rounded bg-[color-mix(in_srgb,var(--ds-warn)_18%,var(--ds-bg))] text-ds-fg whitespace-nowrap">온라인 재문의</span>{meta(it)}<span className="text-[12px] text-ds-fg3 truncate">{it.old}</span></div>
                    {it.new && <p className="mt-1 text-ds-fg whitespace-pre-wrap break-words leading-relaxed">{it.new}</p>}
                  </li>
                )
                if (it.kind === 'next') return (
                  <li key={it.id} className="relative mb-2 text-ds-fg2">
                    {dot('next')}
                    <span className="mr-2">{it.new === '완료' ? <>다음 액션 <b className="font-medium text-ds-fg">{it.old}</b> 완료</> : it.new ? <>다음 액션 → <b className="font-medium text-ds-fg">{it.new}</b></> : <>다음 액션 {it.old} 지움</>}</span>{meta(it)}
                  </li>
                )
                if (folded) return null
                return <li key={it.id} className="relative mb-2 text-ds-fg2">{dot('chg')}<span className="mr-2">{changeText(it)}</span>{meta(it)}</li>
              })}
              {folded && (
                <li className="relative mb-2 text-ds-fg2">
                  {dot('chg')}
                  {summary && <span className="mr-1.5">단계 {summary}</span>}
                  <span className="text-ds-fg3">· 변경 {changes.length}건</span>
                  <button onClick={() => setOpenDays(s => new Set(s).add(d))} className="ml-1.5 text-ds-accent hover:underline">펼치기</button>
                </li>
              )}
            </ol>
          </div>
        )
      })}
    </div>
  )
}

/* ─── 같은 연락처·이메일의 다른 문의 (10/22 — 예전 문의 확인) ─── */
export function RelatedInquiries({ items, compact }: { items?: Related[]; compact?: boolean }) {
  const [open, setOpen] = useState<string | null>(null)
  if (!items || !items.length) return null
  return (
    <div className={cn('rounded-lg border border-ds-line', compact ? 'px-3 py-2' : 'px-3 py-2.5')}>
      <div className="text-[12px] font-semibold text-ds-fg mb-1">같은 연락처의 다른 문의 <span className="font-normal text-ds-fg3">{items.length}건</span></div>
      <div className="grid gap-0.5">
        {items.map(r => (
          <div key={r.id} className="text-[12px]">
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-ds-fg3 tabular-nums w-[64px] flex-none">{r.date.slice(2).replace(/-/g, '.')}</span>
              <button onClick={() => setOpen(o => (o === r.id ? null : r.id))} className="flex-1 min-w-0 text-left truncate hover:text-ds-accent" title="문의 내용 보기">
                {r.company}{r.where && <span className="text-ds-fg3"> · {r.where}</span>}
              </button>
              <span className="text-ds-fg3 whitespace-nowrap">{r.stage}{r.assignee ? ` · ${r.assignee}` : ''}</span>
              <a href={`/pipeline/${r.id}`} className="text-ds-accent whitespace-nowrap hover:underline">열기</a>
            </div>
            {open === r.id && <p className="mt-0.5 mb-1 pl-[72px] text-ds-fg2 whitespace-pre-wrap break-words">{r.content || '(문의 내용 없음)'}{r.code && <span className="text-ds-fg3"> · ID {r.code}</span>}</p>}
          </div>
        ))}
      </div>
    </div>
  )
}
