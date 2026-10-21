'use client'

// 리드 드로어 (오른쪽 480) — 세일즈 리스트·보드가 같이 쓴다 (2026-10-21, 디자인 정의 › 세일즈).
// 요약 칸은 바로 수정, 문의자·연락처·활동은 여기서만 보인다. 전체 편집은 "상세 페이지".
import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/hooks/useAuth'
import { classifyLead, INFLOW_COLOR } from '@/lib/inflow-taxonomy'
import { ACTIVITY_TYPE_LABELS, confirmConvertedStageChange } from '@/lib/utils'
import { Drawer, DrawerSection, DsButton, DsSelect, StatusChip, Skeleton, stageTone, dsInput } from '@/components/ds'
import { toast } from 'sonner'

export const STAGE_OPTIONS = ['신규리드', '컨텍', '제안', '미팅', '도입직전', '예정', '도입완료', '이탈']
const PROB = ['높음', '중간', '낮음']
const PRIO = ['긴급', '높음', '중간', '낮음']

type Lead = Record<string, any>
type Act = { id: string; activity_type: string; title: string | null; performed_at: string; performer?: { name: string } | null }

async function post(body: Record<string, unknown>) {
  const res = await fetch('/api/pipeline/update', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  const j = await res.json().catch(() => ({}))
  return res.ok ? j : { error: j.error || `HTTP ${res.status}` }
}

export function LeadDrawer({ leadId, users, onClose, onChanged }: { leadId: string | null; users: { id: string; name: string }[]; onClose: () => void; onChanged: () => void }) {
  const supabase = createClient()
  const { user } = useAuth()
  const [lead, setLead] = useState<Lead | null>(null)
  const [acts, setActs] = useState<Act[]>([])
  const [next, setNext] = useState({ text: '', date: '' })
  const [saving, setSaving] = useState(false)

  const load = useCallback(async (id: string) => {
    const [l, a] = await Promise.all([
      supabase.from('pipeline_leads').select('*').eq('id', id).single(),
      supabase.from('activity_logs').select('id, activity_type, title, performed_at, performer:users!activity_logs_performed_by_fkey(name)').eq('lead_id', id).order('performed_at', { ascending: false }).limit(6),
    ])
    setLead(l.data); setActs((a.data || []) as unknown as Act[])
    setNext({ text: l.data?.next_action || '', date: l.data?.next_action_date || '' })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { setLead(null); setActs([]); if (leadId) load(leadId) }, [leadId, load])

  const done = async (r: { error?: string }, msg: string) => {
    if (r.error) { toast.error(r.error); return }
    toast.success(msg)
    if (leadId) await load(leadId)
    onChanged()
  }
  const setStage = async (s: string) => {
    if (!lead || s === lead.stage) return
    const c = confirmConvertedStageChange(lead.stage, s)
    if (!c.proceed) return
    await done(await post({ action: 'change_stage', lead_id: lead.id, new_stage: s, old_stage: lead.stage, changed_by: user?.id, force: c.force }), `단계를 "${s}"(으)로 바꿨습니다.`)
  }
  const setField = async (k: string, v: string) => {
    if (!lead) return
    await done(await post({ action: 'update_lead', lead_id: lead.id, updates: { [k]: v || null } }), '저장했습니다.')
  }
  const setAssignee = async (id: string) => {
    if (!lead) return
    const name = (x: string | null) => users.find(u => u.id === x)?.name || '미배정'
    await done(await post({ action: 'change_assigned', lead_id: lead.id, user_id: id || null, old_name: name(lead.assigned_to), new_name: name(id), changed_by: user?.id }), '담당자를 바꿨습니다.')
  }
  const saveNext = async () => {
    if (!lead) return
    setSaving(true)
    await done(await post({ action: 'update_next_action', lead_id: lead.id, next_action: next.text.trim(), next_action_date: next.date }), '다음 액션을 저장했습니다.')
    setSaving(false)
  }

  const f = lead ? classifyLead(lead.inquiry_channel, lead.inquiry_source) : null
  const date = lead ? lead.inquiry_date || String(lead.created_at).slice(0, 10) : ''
  const nextDirty = !!lead && (next.text !== (lead.next_action || '') || next.date !== (lead.next_action_date || ''))
  const kv = 'grid grid-cols-[84px_1fr] gap-x-3 gap-y-2 items-center'
  const lab = 'text-ds-fg3'

  return (
    <Drawer open={!!leadId} onClose={onClose} width={480}
      title={lead ? <span className="inline-flex items-center gap-2">{lead.company_name}<StatusChip tone={stageTone(lead.stage)}>{lead.stage}</StatusChip></span> : '불러오는 중'}
      meta={lead && f ? <span><span className="inline-block w-[7px] h-[7px] rounded-full mr-1.5 align-[1px]" style={{ background: INFLOW_COLOR[f.group] }} />{f.group} › {f.sub} · 유입 {date} · 담당 {users.find(u => u.id === lead.assigned_to)?.name || '미배정'}</span> : null}
      footer={lead && <>
        {lead.stage !== '이탈' && <DsButton variant="danger" size="sm" onClick={() => setStage('이탈')}>이탈 처리</DsButton>}
        <span className="flex-1" />
        <Link href={`/pipeline/${lead.id}`}><DsButton size="sm">상세 페이지</DsButton></Link>
      </>}>
      {!lead ? <div className="p-4"><Skeleton rows={8} /></div> : <>
        <DrawerSection title="요약 — 바꾸면 바로 저장">
          <div className={kv}>
            <span className={lab}>단계</span>
            <DsSelect value={lead.stage} onChange={e => setStage(e.target.value)} className="h-7 text-[12.5px]">{STAGE_OPTIONS.map(s => <option key={s}>{s}</option>)}</DsSelect>
            <span className={lab}>도입가능성</span>
            <DsSelect value={lead.conversion_probability || ''} onChange={e => setField('conversion_probability', e.target.value)} className="h-7 text-[12.5px]"><option value="">—</option>{PROB.map(s => <option key={s}>{s}</option>)}</DsSelect>
            <span className={lab}>우선순위</span>
            <DsSelect value={lead.priority || ''} onChange={e => setField('priority', e.target.value)} className="h-7 text-[12.5px]"><option value="">—</option>{PRIO.map(s => <option key={s}>{s}</option>)}</DsSelect>
            <span className={lab}>담당</span>
            <DsSelect value={lead.assigned_to || ''} onChange={e => setAssignee(e.target.value)} className="h-7 text-[12.5px]"><option value="">미배정</option>{users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}</DsSelect>
            <span className={lab}>발주 · 사업분류</span>
            <span className="text-ds-fg">{lead.site_category || '—'} · {lead.industry || '—'}</span>
            {lead.customer_code && <><span className={lab}>코드</span><span className="text-ds-fg tabular-nums">{lead.customer_code}</span></>}
          </div>
        </DrawerSection>
        <DrawerSection title="다음 액션 — 날짜를 넣으면 대시보드 '이번 주 액션'에 모입니다">
          <div className="flex gap-2">
            <input className={dsInput + ' h-7 text-[12.5px]'} placeholder="예: 견적서 발송, 데모 일정 잡기" value={next.text} onChange={e => setNext({ ...next, text: e.target.value })} onKeyDown={e => { if (e.key === 'Enter' && nextDirty) saveNext() }} />
            <input type="date" className={dsInput + ' h-7 text-[12.5px] w-[132px] flex-none'} value={next.date} onChange={e => setNext({ ...next, date: e.target.value })} />
            <DsButton size="sm" variant="primary" disabled={!nextDirty} loading={saving} onClick={saveNext}>저장</DsButton>
          </div>
        </DrawerSection>
        <DrawerSection title="문의자">
          <div className={kv}>
            <span className={lab}>이름 · 직급</span><span className="text-ds-fg">{[lead.contact_person, lead.contact_position].filter(Boolean).join(' · ') || '—'}</span>
            <span className={lab}>연락처</span><span className="text-ds-fg tabular-nums">{lead.contact_phone ? <a href={`tel:${lead.contact_phone}`} className="hover:underline">{lead.contact_phone}</a> : '—'}</span>
            <span className={lab}>이메일</span><span className="text-ds-fg truncate">{lead.contact_email || '—'}</span>
          </div>
          {lead.inquiry_content && <p className="mt-2.5 text-ds-fg2 whitespace-pre-wrap line-clamp-6">{lead.inquiry_content}</p>}
        </DrawerSection>
        <DrawerSection title={`활동${acts.length ? ` — 최근 ${acts.length}건` : ''}`}>
          {acts.length === 0 ? <span className="text-ds-fg3">기록된 활동이 없습니다.</span> : (
            <ol className="grid gap-1.5">
              {acts.map(a => (
                <li key={a.id} className="grid grid-cols-[72px_1fr] gap-2">
                  <span className="text-ds-fg3 tabular-nums">{a.performed_at.slice(0, 10).slice(2).replace(/-/g, '.')}</span>
                  <span className="text-ds-fg truncate"><span className="text-ds-fg2">{ACTIVITY_TYPE_LABELS[a.activity_type] || a.activity_type}</span>{a.title ? ` · ${a.title}` : ''}{a.performer?.name ? <span className="text-ds-fg3"> · {a.performer.name}</span> : null}</span>
                </li>
              ))}
            </ol>
          )}
        </DrawerSection>
      </>}
    </Drawer>
  )
}
