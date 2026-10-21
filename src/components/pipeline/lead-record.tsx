'use client'

// 리드 기록 칸 + 타임라인 — 드로어·상세 페이지 공용 (2026-10-21, 디자인 정의 › 세일즈 › 리드 상세 "기록은 한 곳으로")
// 기록 한 번 = 활동 + 다음 액션(정함·바꿈·완료) + 단계 앞으로 자동 이동. 타임라인은 활동과 단계·담당·다음 액션·칸 변경을 한 줄로.
import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { ACTIVITY_TYPE_LABELS, cn } from '@/lib/utils'
import { DsButton, DsSelect, dsInput } from '@/components/ds'
import type { TimelineItem } from '@/app/api/pipeline/lead/[id]/route'
import { toast } from 'sonner'

export type { TimelineItem }
export type LeadOverview = { lead: Record<string, any>; timeline: TimelineItem[]; users: { id: string; name: string }[]; customer: { id: string; company_name: string; customer_code: string | null } | null; voc: any[] }

// 리드 한 건 읽기 — 요청 1번
export function useLeadOverview(id: string | null) {
  const [data, setData] = useState<LeadOverview | null>(null)
  const [error, setError] = useState<string | null>(null)
  const load = useCallback(async () => {
    if (!id) return
    try {
      const res = await fetch(`/api/pipeline/lead/${id}`)
      const j = await res.json()
      if (!res.ok) throw new Error(j.error)
      setData(j); setError(null)
    } catch (e) { setError((e as Error).message) }
  }, [id])
  useEffect(() => { setData(null); setError(null); load() }, [load])
  return { data, error, reload: load }
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
const kst = () => new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10)

/* ─── 기록 칸 ─── */
export function RecordComposer({ lead, onDone, compact }: { lead: Record<string, any>; onDone: () => void; compact?: boolean }) {
  const { user } = useAuth()
  const [type, setType] = useState('CALL_OUT')
  const [text, setText] = useState('')
  const [next, setNext] = useState({ text: '', date: '' })
  const [complete, setComplete] = useState(true)
  const [busy, setBusy] = useState(false)
  const hasNext = !!(lead.next_action || lead.next_action_date)
  const curNext = [lead.next_action, md(lead.next_action_date)].filter(Boolean).join(' ')
  // 내용·다음 액션 중 하나, 또는 지금 다음 액션 완료 처리만 해도 기록
  const can = !!(text.trim() || next.text.trim() || next.date || (hasNext && complete))

  const submit = async () => {
    if (!user || !can || busy) return
    setBusy(true)
    const r = await postUpdate({ action: 'record', lead_id: lead.id, activity_type: type, content: text, performed_by: user.id, next_action: next.text, next_action_date: next.date, complete_next: hasNext && complete })
    setBusy(false)
    if (r.error) { toast.error(`기록하지 못했습니다. ${r.error}`); return }
    toast.success(r.stage ? `기록했습니다 · 단계 → ${r.stage}` : '기록했습니다')
    setText(''); setNext({ text: '', date: '' }); setComplete(true)
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
  priority: '우선순위', conversion_probability: '도입가능성', company_name: '회사명', customer_code: '코드', site_category: '발주', industry: '사업분류',
  contact_person: '문의자', contact_position: '직급', contact_phone: '연락처', contact_email: '이메일', inquiry_date: '유입일', inquiry_channel: '유입 채널',
  inquiry_source: '유입 경로', interest_service: '관심 서비스', core_need: '핵심 니즈', inquiry_content: '문의 내용', notes: '메모', customer_id: '고객사 연결',
}
const LONG = ['inquiry_content', 'notes', 'customer_id']

export function Timeline({ items, limit, editable, leadId, onChanged }: { items: TimelineItem[]; limit?: number; editable?: boolean; leadId: string; onChanged: () => void }) {
  const { user } = useAuth()
  const [edit, setEdit] = useState<{ id: string; type: string; desc: string } | null>(null)
  const list = limit ? items.slice(0, limit) : items
  if (!list.length) return <p className="text-[12.5px] text-ds-fg3 py-2">아직 기록이 없습니다.</p>

  const save = async () => {
    if (!edit) return
    const r = await postUpdate({ action: 'edit_activity', lead_id: leadId, activity_id: edit.id, activity_type: edit.type, title: ACTIVITY_TYPE_LABELS[edit.type] || edit.type, description: edit.desc || null })
    if (r.error) { toast.error('수정하지 못했습니다.'); return }
    setEdit(null); onChanged()
  }
  const del = async (id: string) => {
    if (!window.confirm('이 기록을 삭제할까요?')) return
    const r = await postUpdate({ action: 'delete_activity', lead_id: leadId, activity_id: id })
    if (r.error) toast.error('삭제하지 못했습니다.'); else onChanged()
  }

  return (
    <ol className="relative ml-1.5 pl-4 border-l border-ds-line text-[12.5px]">
      {list.map(it => {
        const dot = it.kind === 'act' ? 'bg-ds-accent' : it.kind === 'next' ? 'bg-ds-warn' : 'bg-ds-line'
        const when = <span className="text-ds-fg3 text-[11.5px] tabular-nums whitespace-nowrap">{md(it.at)} · {it.by}</span>
        if (it.kind === 'act') {
          // 예전 기록은 제목에 내용이 있고(title) 설명이 비어 있을 수 있음 → 둘 다 보여 줌
          const showTitle = it.title && it.title !== ACTIVITY_TYPE_LABELS[it.type || '']
          const canEdit = editable && !!user && (it.byId === user.id || user.role === 'admin')
          return (
            <li key={it.id} className="relative mb-3 group">
              <span className={cn('absolute -left-[20.5px] top-[5px] w-[7px] h-[7px] rounded-full', dot)} />
              <div className="flex items-center gap-2">
                <span className="text-[11.5px] px-1.5 rounded bg-ds-accent-soft text-ds-accent whitespace-nowrap">{typeLabel(it.type)}</span>
                {when}
                {canEdit && edit?.id !== it.id && (
                  <span className="ml-auto text-[11px] text-ds-fg3 opacity-0 group-hover:opacity-100 flex gap-2">
                    <button onClick={() => setEdit({ id: it.id, type: it.type || 'NOTE', desc: [showTitle ? it.title : '', it.desc || ''].filter(Boolean).join('\n') })} className="hover:text-ds-fg">수정</button>
                    <button onClick={() => del(it.id)} className="hover:text-ds-bad">삭제</button>
                  </span>
                )}
              </div>
              {edit?.id === it.id ? (
                <div className="mt-1.5 grid gap-1.5">
                  <DsSelect value={edit.type} onChange={e => setEdit({ ...edit, type: e.target.value })} className="h-7 text-[12px] w-[160px]">
                    {Object.entries(ACTIVITY_TYPE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </DsSelect>
                  <textarea value={edit.desc} onChange={e => setEdit({ ...edit, desc: e.target.value })} rows={3} className="w-full px-2.5 py-1.5 rounded border border-ds-line text-[13px] focus:outline-none focus:ring-2 focus:ring-ds-accent" />
                  <div className="flex gap-1.5"><DsButton size="sm" variant="primary" onClick={save}>저장</DsButton><DsButton size="sm" variant="ghost" onClick={() => setEdit(null)}>취소</DsButton></div>
                </div>
              ) : (
                <>
                  {showTitle && <p className="mt-1 text-ds-fg font-medium whitespace-pre-wrap break-words">{it.title}</p>}
                  {it.desc && <p className="mt-1 text-ds-fg2 whitespace-pre-wrap break-words leading-relaxed">{it.desc}</p>}
                </>
              )}
            </li>
          )
        }
        const what = it.kind === 'stage' ? <>단계 {it.old || '—'} → <b className="font-medium text-ds-fg">{it.new}</b></>
          : it.kind === 'assign' ? <>담당 {it.old || '없음'} → <b className="font-medium text-ds-fg">{it.new || '없음'}</b></>
          : it.kind === 'next' ? (it.new === '완료' ? <>다음 액션 <b className="font-medium text-ds-fg">{it.old}</b> 완료</> : it.new ? <>다음 액션 <b className="font-medium text-ds-fg">{it.new}</b>{it.old ? <span className="text-ds-fg3"> (이전 {it.old})</span> : null}</> : <>다음 액션 {it.old} 지움</>)
          : LONG.includes(it.field || '') ? <>{FIELD_LABEL[it.field || ''] || it.field} 수정</>
          : <>{FIELD_LABEL[it.field || ''] || it.field} {it.old || '—'} → <b className="font-medium text-ds-fg">{it.new || '—'}</b></>
        return (
          <li key={it.id} className="relative mb-2.5 text-ds-fg2">
            <span className={cn('absolute -left-[20.5px] top-[5px] w-[7px] h-[7px] rounded-full', dot)} />
            <span className="mr-2">{what}</span>{when}
          </li>
        )
      })}
    </ol>
  )
}
