'use client'

// 리드 드로어 (오른쪽 480) — 세일즈 리스트·보드가 같이 쓴다 (2026-10-21, 디자인 정의 › 세일즈).
// 요약 칸은 바로 수정. 기록 칸·타임라인은 상세 페이지와 같은 부품(lead-record) → 어디서 기록해도 같은 곳에 남는다.
// 읽기는 /api/pipeline/lead/[id] 한 번.
import Link from 'next/link'
import { useAuth } from '@/hooks/useAuth'
import { classifyLead, INFLOW_COLOR } from '@/lib/inflow-taxonomy'
import { confirmConvertedStageChange } from '@/lib/utils'
import { Drawer, DrawerSection, DsButton, DsSelect, StatusChip, Skeleton, stageTone } from '@/components/ds'
import { RecordComposer, Timeline, useLeadOverview, postUpdate } from '@/components/pipeline/lead-record'
import { toast } from 'sonner'

export const STAGE_OPTIONS = ['신규리드', '컨텍', '제안', '미팅', '도입직전', '예정', '도입완료', '이탈']
export const PROB = ['높음', '중간', '낮음']
export const PRIO = ['긴급', '높음', '중간', '낮음']

export function LeadDrawer({ leadId, users, onClose, onChanged }: { leadId: string | null; users: { id: string; name: string }[]; onClose: () => void; onChanged: () => void }) {
  const { user } = useAuth()
  const { data, reload } = useLeadOverview(leadId)
  const lead = data?.lead

  const done = async (r: { error?: string }, msg: string) => {
    if (r.error) { toast.error(r.error); return }
    toast.success(msg)
    await reload()
    onChanged()
  }
  const setStage = async (s: string) => {
    if (!lead || s === lead.stage) return
    const c = confirmConvertedStageChange(lead.stage, s)
    if (!c.proceed) return
    await done(await postUpdate({ action: 'change_stage', lead_id: lead.id, new_stage: s, old_stage: lead.stage, changed_by: user?.id, force: c.force }), `단계를 "${s}"(으)로 바꿨습니다.`)
  }
  const setField = async (k: string, v: string) => {
    if (!lead) return
    await done(await postUpdate({ action: 'update_lead', lead_id: lead.id, updates: { [k]: v || null }, changed_by: user?.id }), '저장했습니다.')
  }
  const setAssignee = async (id: string) => {
    if (!lead) return
    const name = (x: string | null) => users.find(u => u.id === x)?.name || '미배정'
    await done(await postUpdate({ action: 'change_assigned', lead_id: lead.id, user_id: id || null, old_name: name(lead.assigned_to), new_name: name(id), changed_by: user?.id }), '담당자를 바꿨습니다.')
  }
  const refresh = async () => { await reload(); onChanged() }

  const f = lead ? classifyLead(lead.inquiry_channel, lead.inquiry_source) : null
  const date = lead ? lead.inquiry_date || String(lead.created_at).slice(0, 10) : ''
  const kv = 'grid grid-cols-[84px_1fr] gap-x-3 gap-y-2 items-center'
  const lab = 'text-ds-fg3'
  const sel = 'h-7 text-[12.5px]'
  const tl = data?.timeline || []

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
            <DsSelect value={lead.stage} onChange={e => setStage(e.target.value)} className={sel}>{STAGE_OPTIONS.map(s => <option key={s}>{s}</option>)}</DsSelect>
            <span className={lab}>도입가능성</span>
            <DsSelect value={lead.conversion_probability || ''} onChange={e => setField('conversion_probability', e.target.value)} className={sel}><option value="">—</option>{PROB.map(s => <option key={s}>{s}</option>)}</DsSelect>
            <span className={lab}>우선순위</span>
            <DsSelect value={lead.priority || ''} onChange={e => setField('priority', e.target.value)} className={sel}><option value="">—</option>{PRIO.map(s => <option key={s}>{s}</option>)}</DsSelect>
            <span className={lab}>담당</span>
            <DsSelect value={lead.assigned_to || ''} onChange={e => setAssignee(e.target.value)} className={sel}><option value="">미배정</option>{users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}</DsSelect>
            <span className={lab}>다음 액션</span>
            <span className={lead.next_action || lead.next_action_date ? 'text-ds-fg' : 'text-ds-fg3'}>{[lead.next_action, lead.next_action_date].filter(Boolean).join(' · ') || '없음 — 아래 기록 칸에서 정함'}</span>
            <span className={lab}>발주 · 사업분류</span>
            <span className="text-ds-fg">{lead.site_category || '—'} · {lead.industry || '—'}</span>
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
        <DrawerSection title="기록 — 상세 페이지와 같은 곳에 남습니다">
          <RecordComposer lead={lead} onDone={refresh} compact />
        </DrawerSection>
        <DrawerSection title={`타임라인${tl.length ? ` — ${tl.length}` : ''}`}>
          <Timeline items={tl} limit={10} leadId={lead.id} onChanged={refresh} />
          {tl.length > 10 && <Link href={`/pipeline/${lead.id}`} className="text-[12px] text-ds-accent hover:underline">전체 {tl.length}줄 보기 → 상세 페이지</Link>}
        </DrawerSection>
      </>}
    </Drawer>
  )
}
