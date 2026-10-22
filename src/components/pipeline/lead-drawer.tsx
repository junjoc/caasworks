'use client'

// 리드 드로어 v2 (오른쪽 480) — 상세의 축소판 (2026-10-21, 디자인 정의 › 화면 문법 v2 "드로어 = 상세 축소판")
// 단계 줄(얇게) → 속성 칩 → 문의자 한 줄 + 문의 내용 → 기록 칸 → 타임라인 10줄. 부품은 상세와 같다.
// 읽기는 /api/pipeline/lead/[id] 한 번.
import Link from 'next/link'
import { useAuth } from '@/hooks/useAuth'
import { classifyLead, INFLOW_COLOR } from '@/lib/inflow-taxonomy'
import { confirmConvertedStageChange } from '@/lib/utils'
import { since, due, mmdd, kstToday, kstDate } from '@/lib/elapsed'
import { Drawer, DsButton, StatusChip, Skeleton, stageTone } from '@/components/ds'
import { StageBar, PropPills, type Prop } from '@/components/ds/detail'
import { RecordComposer, Timeline, RelatedInquiries, useLeadOverview, postUpdate } from '@/components/pipeline/lead-record'
import { toast } from 'sonner'

export const STAGE_OPTIONS = ['신규리드', '컨텍', '예정', '제안', '미팅', '도입직전', '도입완료', '이탈']
export const PROB = ['높음', '중간', '낮음']
export const PRIO = ['긴급', '높음', '중간', '낮음']
const FLOW = ['신규리드', '컨텍', '예정', '제안', '미팅', '도입직전', '도입완료']

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
    await done(await postUpdate({ action: 'change_stage', lead_id: lead.id, new_stage: s, old_stage: lead.stage, changed_by: user?.id, force: c.force }), `단계 → ${s}`)
  }
  const setField = (k: string) => async (v: string) => {
    if (!lead) return
    await done(await postUpdate({ action: 'update_lead', lead_id: lead.id, updates: { [k]: v || null }, changed_by: user?.id }), '저장했습니다')
  }
  const refresh = async () => { await reload(); onChanged() }

  const today = kstToday()
  const tl = data?.timeline || []
  const name = (x: string | null) => users.find(u => u.id === x)?.name || '미배정'

  let body = <div className="p-4"><Skeleton rows={8} /></div>
  if (lead) {
    const f = classifyLead(lead.inquiry_channel, lead.inquiry_source)
    const date = lead.inquiry_date || kstDate(String(lead.created_at))
    const enteredAt = tl.find(t => t.kind === 'stage' && t.new === lead.stage)?.at || date
    const nd = lead.next_action_date ? due(lead.next_action_date, today) : null
    const hasNext = !!(lead.next_action || lead.next_action_date)
    const pills: Prop[] = [
      { label: '단계', value: lead.stage, select: { value: lead.stage, options: STAGE_OPTIONS, onChange: setStage } },
      { label: '담당', value: name(lead.assigned_to), select: { value: lead.assigned_to || '', options: users.map(u => ({ value: u.id, label: u.name })), empty: '미배정',
        onChange: async v => done(await postUpdate({ action: 'change_assigned', lead_id: lead.id, user_id: v || null, old_name: name(lead.assigned_to), new_name: name(v), changed_by: user?.id }), '담당자를 바꿨습니다') } },
      { label: '우선', value: lead.priority || '—', select: { value: lead.priority || '', options: PRIO, empty: '—', onChange: setField('priority') } },
      { label: '가능성', value: lead.conversion_probability || '—', select: { value: lead.conversion_probability || '', options: PROB, empty: '—', onChange: setField('conversion_probability') } },
      { label: '다음', value: hasNext ? `${lead.next_action || ''} ${mmdd(lead.next_action_date)}`.trim() : '없음', sub: nd?.text, tone: nd?.tone || (!hasNext ? 'bad' : undefined) },
    ]
    const content = String(lead.inquiry_content || '').trim()
    body = (
      <div className="px-4 py-3 grid gap-3 text-[12.5px]">
        <StageBar variant="slim" flow={FLOW} stage={lead.stage} note={since(enteredAt, today)} onPick={setStage} />
        <PropPills items={pills} />
        <div className="border border-ds-line rounded-lg px-3 py-2.5">
          <div className="text-ds-fg">
            {[lead.contact_person, lead.contact_position].filter(Boolean).join(' · ') || <span className="text-ds-fg3">문의자 없음</span>}
            {lead.contact_phone && <> · <a href={`tel:${lead.contact_phone}`} className="text-ds-accent hover:underline tabular-nums">{lead.contact_phone}</a></>}
            {lead.contact_email && <span className="text-ds-fg2"> · {lead.contact_email}</span>}
          </div>
          {content && <p className="mt-1.5 text-ds-fg2 whitespace-pre-wrap break-words line-clamp-4 leading-relaxed">{content}</p>}
          {(lead.topic_tags || []).length > 0 && <div className="mt-1">{(lead.topic_tags as string[]).map(t => <span key={t} className="text-ds-accent text-[12px] mr-1.5">#{t}</span>)}</div>}
        </div>
        <RelatedInquiries items={data?.related} compact />
        <RecordComposer lead={lead} onDone={refresh} compact />
        <Timeline items={tl} limit={10} leadId={lead.id} onChanged={refresh} />
        {tl.length > 10 && <Link href={`/pipeline/${lead.id}`} className="text-[12px] text-ds-accent hover:underline">전체 {tl.length}줄 → 상세 페이지</Link>}
      </div>
    )
  }

  return (
    <Drawer open={!!leadId} onClose={onClose} width={480}
      title={lead ? <span className="inline-flex items-center gap-2">{lead.company_name}{(lead.site_name || lead.contact_team) && <span className="font-normal text-ds-fg3 text-[13px]">· {lead.site_name || `본사 ${lead.contact_team}`}</span>}<StatusChip tone={stageTone(lead.stage)}>{lead.stage}</StatusChip></span> : '불러오는 중'}
      meta={lead ? (() => { const f = classifyLead(lead.inquiry_channel, lead.inquiry_source); const d = lead.inquiry_date || kstDate(String(lead.created_at)); return <span><span className="inline-block w-[7px] h-[7px] rounded-full mr-1 align-[1px]" style={{ background: INFLOW_COLOR[f.group] }} />{f.group} › {f.sub} · 유입 {mmdd(d)} ({since(d, today)}){lead.lead_number ? ` · No.${lead.lead_number}` : ''}</span> })() : null}
      footer={lead && <>
        {lead.stage !== '이탈' && <DsButton variant="danger" size="sm" onClick={() => setStage('이탈')}>이탈 처리</DsButton>}
        <span className="flex-1" />
        <Link href={`/pipeline/${lead.id}`}><DsButton size="sm">상세 페이지</DsButton></Link>
      </>}>
      {body}
    </Drawer>
  )
}
