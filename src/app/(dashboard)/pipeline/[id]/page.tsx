'use client'

// 세일즈 › 리드 상세 v2 (2026-10-21, 디자인 정의 › 리드 상세 v2 A안 · 화면 문법 v2 "상세")
// 머리(이름 20 + 상태 칩 + 메타 한 줄) → 단계 줄 → 속성 줄(자주 바꾸는 5개) → 본문 2:1
// 왼쪽: 탭(활동 · 유입 경로 · 견적·매출 · VoC), 활동 = 기록 칸 + 날짜별 타임라인 (드로어와 같은 부품)
// 오른쪽: 카드 3장 — 값 있는 칸만, 빈 칸은 한 줄, "수정"은 카드 단위. 한 정보는 한 곳에만.
import { Fragment, useEffect, useState, type ReactNode } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/hooks/useAuth'
import { useFollowupLeadIds } from '@/hooks/useFollowupLeadIds'
import { classifyLead, INFLOW_COLOR } from '@/lib/inflow-taxonomy'
import { confirmConvertedStageChange, INDUSTRY_OPTIONS, CHANNEL_OPTIONS, VOC_CATEGORY_LABELS, VOC_PRIORITY_LABELS, cn } from '@/lib/utils'
import { since, due, ago, mmdd, kstToday, kstDate, dayDiff } from '@/lib/elapsed'
import { Toolbar, Tabs, DsButton, DsSelect, StatusChip, Skeleton, Empty, stageTone, dsInput } from '@/components/ds'
import { StageBar, PropertyBar, Card, Rows, Popover, type Prop } from '@/components/ds/detail'
import { RecordComposer, Timeline, RelatedInquiries, useLeadOverview, postUpdate } from '@/components/pipeline/lead-record'
import { PROB, PRIO } from '@/components/pipeline/lead-drawer'
import QuotationSection from '@/components/pipeline/QuotationSection'
import { toast } from 'sonner'
import { formatPhone } from '@/lib/phone'
import { ChevronLeft, ChevronRight, MoreHorizontal } from 'lucide-react'

// 10/21: 예정 포함 (팀 원래 순서 컨텍 → 예정 → 제안)
const FLOW = ['신규리드', '컨텍', '예정', '제안', '미팅', '도입직전', '도입완료']
const OPEN = ['신규리드', '컨텍', '제안', '미팅', '도입직전', '예정']
type Tab = 'act' | 'inflow' | 'quote' | 'voc'

/* ─── 카드 편집: "수정"을 누르면 그 카드의 칸 전부(빈 칸 포함)를 입력으로 ─── */
type FieldDef = { key: string; label: string; kind?: 'text' | 'textarea' | 'select' | 'date'; options?: string[] }
function CardForm({ fields, lead, onSave, onCancel }: { fields: FieldDef[]; lead: Record<string, any>; onSave: (u: Record<string, string | null>) => Promise<void>; onCancel: () => void }) {
  const [f, setF] = useState<Record<string, string>>(() => Object.fromEntries(fields.map(x => [x.key, lead[x.key] ?? ''])))
  const [busy, setBusy] = useState(false)
  const submit = async () => {
    const u: Record<string, string | null> = {}
    for (const x of fields) if ((lead[x.key] ?? '') !== f[x.key].trim()) u[x.key] = f[x.key].trim() || null
    if (u.company_name === null) delete u.company_name
    setBusy(true); await onSave(u); setBusy(false)
  }
  const ctl = cn(dsInput, 'h-7 text-[12.5px]')
  return (
    <div className="grid grid-cols-[64px_1fr] gap-x-2.5 gap-y-1.5 items-center">
      {fields.map(x => (
        <Fragment key={x.key}>
          <span className={cn('text-ds-fg3', x.kind === 'textarea' && 'self-start pt-1')}>{x.label}</span>
          {x.kind === 'select' ? <DsSelect value={f[x.key]} onChange={e => setF({ ...f, [x.key]: e.target.value })} className={cn(ctl, 'w-full')}><option value="">—</option>{x.options!.map(o => <option key={o}>{o}</option>)}</DsSelect>
            : x.kind === 'textarea' ? <textarea rows={4} value={f[x.key]} onChange={e => setF({ ...f, [x.key]: e.target.value })} className="w-full px-2.5 py-1.5 rounded-md border border-ds-line text-[12.5px] focus:outline-none focus:ring-2 focus:ring-ds-accent resize-y" />
            : <input type={x.kind === 'date' ? 'date' : 'text'} value={f[x.key]} inputMode={x.key === 'contact_phone' ? 'tel' : undefined} onChange={e => setF({ ...f, [x.key]: x.key === 'contact_phone' ? formatPhone(e.target.value) : e.target.value })} className={ctl} />}
        </Fragment>
      ))}
      <span />
      <div className="flex gap-1.5 mt-1"><DsButton size="sm" variant="primary" loading={busy} onClick={submit}>저장</DsButton><DsButton size="sm" variant="ghost" onClick={onCancel}>취소</DsButton></div>
    </div>
  )
}
function EditCard({ title, fields, lead, onSave, children }: { title: string; fields: FieldDef[]; lead: Record<string, any>; onSave: (u: Record<string, string | null>) => Promise<boolean>; children: (fill: () => void) => ReactNode }) {
  const [on, setOn] = useState(false)
  return (
    <Card title={title} action={!on && <button onClick={() => setOn(true)} className="text-[12px] text-ds-fg3 hover:text-ds-fg">수정</button>}>
      {on ? <CardForm fields={fields} lead={lead} onCancel={() => setOn(false)} onSave={async u => { if (!Object.keys(u).length || (await onSave(u))) setOn(false) }} /> : children(() => setOn(true))}
    </Card>
  )
}

export default function LeadDetailPage() {
  const id = useParams<{ id: string }>()?.id as string
  const router = useRouter()
  const supabase = createClient()
  const { user } = useAuth()
  const followupIds = useFollowupLeadIds()
  const { data, error, reload } = useLeadOverview(id)
  const [tab, setTab] = useState<Tab>('act')
  const [nav, setNav] = useState<string[]>([])
  const [more, setMore] = useState(false)
  const [moreText, setMoreText] = useState(false)
  const [next, setNext] = useState({ text: '', date: '' })
  const [custQ, setCustQ] = useState('')
  const [custHits, setCustHits] = useState<{ id: string; company_name: string; customer_code: string | null }[]>([])
  const [voc, setVoc] = useState({ open: false, category: 'inquiry', channel: 'phone', priority: 'normal', title: '', description: '' })

  useEffect(() => { try { setNav(JSON.parse(sessionStorage.getItem('leadNav') || '[]')) } catch { /* 없음 */ } }, [])
  useEffect(() => {
    const q = custQ.trim().replace(/[%,()]/g, '')
    if (!q) { setCustHits([]); return }
    const t = setTimeout(async () => {
      const { data } = await supabase.from('customers').select('id, company_name, customer_code').or(`company_name.ilike.%${q}%,customer_code.ilike.%${q}%`).limit(8)
      setCustHits(data || [])
    }, 250)
    return () => clearTimeout(t)
  }, [custQ]) // eslint-disable-line react-hooks/exhaustive-deps

  if (error) return <Empty text={`리드를 찾을 수 없습니다. (${error})`} action={<Link href="/pipeline/list"><DsButton size="sm">리스트로</DsButton></Link>} />
  if (!data) return <div className="max-w-[1040px] mx-auto"><Skeleton rows={14} /></div>

  const { lead, timeline, users, customer } = data
  const today = kstToday()
  const date = lead.inquiry_date || kstDate(String(lead.created_at))
  const f = classifyLead(lead.inquiry_channel, lead.inquiry_source)
  const uname = (x: string | null) => users.find(u => u.id === x)?.name || '미배정'
  const acts = timeline.filter(t => t.kind === 'act')
  const isOpen = OPEN.includes(lead.stage)
  // 지금 단계에 들어온 날 = 가장 최근 단계 변경(없으면 유입일)
  const enteredAt = timeline.find(t => t.kind === 'stage' && t.new === lead.stage)?.at || date
  const lastAct = acts[0]?.at
  const stale = isOpen && (!lastAct || dayDiff(lastAct, today) > 14)

  const save = async (body: Record<string, unknown>, msg = '저장했습니다') => {
    const r = await postUpdate({ lead_id: id, changed_by: user?.id, ...body })
    if (r.error) { toast.error(r.error); return false }
    toast.success(msg); await reload(); return true
  }
  const setField = (k: string) => (v: string) => { save({ action: 'update_lead', updates: { [k]: v || null } }) }
  const saveFields = (u: Record<string, string | null>) => save({ action: 'update_lead', updates: u })
  const setStage = async (s: string) => {
    if (s === lead.stage) return
    const c = confirmConvertedStageChange(lead.stage, s)
    if (!c.proceed) return
    await save({ action: 'change_stage', new_stage: s, old_stage: lead.stage, force: c.force }, `단계 → ${s}`)
  }
  const linkCustomer = async (cid: string | null) => { if (await save({ action: 'link_customer', customer_id: cid }, cid ? '고객사를 연결했습니다' : '연결을 해제했습니다')) setCustQ('') }
  const submitVoc = async () => {
    if (!voc.title.trim() || !lead.customer_id || !user) return
    const ok = await save({ action: 'create_voc_ticket', customer_id: lead.customer_id, category: voc.category, channel: voc.channel, priority: voc.priority, title: voc.title, description: voc.description || null, reported_by: lead.contact_person || '', created_by: user.id, assigned_to: lead.assigned_to || null, category_label: VOC_CATEGORY_LABELS[voc.category] }, 'VoC 티켓을 만들었습니다')
    if (ok) setVoc({ ...voc, open: false, title: '', description: '' })
  }

  const ni = nav.indexOf(id)
  const prevId = ni > 0 ? nav[ni - 1] : null, nextId = ni >= 0 && ni < nav.length - 1 ? nav[ni + 1] : null
  const nd = lead.next_action_date ? due(lead.next_action_date, today) : null
  const hasNext = !!(lead.next_action || lead.next_action_date)

  const props: Prop[] = [
    { label: '담당', value: uname(lead.assigned_to), select: { value: lead.assigned_to || '', options: users.map(u => ({ value: u.id, label: u.name })), empty: '미배정', onChange: v => save({ action: 'change_assigned', user_id: v || null, old_name: uname(lead.assigned_to), new_name: uname(v) }, '담당자를 바꿨습니다') } },
    { label: '우선순위', value: lead.priority || '—', select: { value: lead.priority || '', options: PRIO, empty: '—', onChange: setField('priority') } },
    { label: '도입가능성', value: lead.conversion_probability || '—', select: { value: lead.conversion_probability || '', options: PROB, empty: '—', onChange: setField('conversion_probability') } },
    {
      label: '다음 액션', value: hasNext ? (lead.next_action || '날짜만') : '없음',
      sub: hasNext ? <>{mmdd(lead.next_action_date)} {nd?.text}</> : isOpen ? '정해 두면 대시보드에 모임' : undefined,
      tone: nd?.tone || (isOpen && !hasNext ? 'bad' : undefined),
      popover: close => (
        <div className="grid gap-1.5" onClick={e => e.stopPropagation()}>
          <input autoFocus className={cn(dsInput, 'h-7 text-[12.5px]')} placeholder={lead.next_action || '예: 견적서 발송'} value={next.text} onChange={e => setNext({ ...next, text: e.target.value })} />
          <input type="date" className={cn(dsInput, 'h-7 text-[12.5px]')} value={next.date || lead.next_action_date || ''} onChange={e => setNext({ ...next, date: e.target.value })} />
          <div className="flex gap-1.5">
            <DsButton size="sm" variant="primary" onClick={async () => { if (await save({ action: 'update_next_action', next_action: next.text.trim() || lead.next_action, next_action_date: next.date || lead.next_action_date })) { setNext({ text: '', date: '' }); close() } }}>저장</DsButton>
            {hasNext && <DsButton size="sm" variant="ghost" onClick={async () => { if (await save({ action: 'record', activity_type: 'NOTE', content: '', performed_by: user?.id, complete_next: true }, '완료로 표시했습니다')) close() }}>완료</DsButton>}
          </div>
          <p className="text-[12px] text-ds-fg3">통화·미팅 내용과 함께 정하려면 아래 기록 칸에서</p>
        </div>
      ),
    },
    {
      label: '고객사', value: customer ? customer.company_name : '없음', sub: customer ? '고객 상세 ↗' : '눌러서 연결',
      popover: close => (
        <div className="grid gap-1.5" onClick={e => e.stopPropagation()}>
          {customer ? <>
            <Link href={`/customers/${customer.id}`} className="text-[12.5px] text-ds-accent hover:underline">{customer.company_name} 고객 상세 →</Link>
            <DsButton size="sm" variant="ghost" onClick={async () => { if (window.confirm('고객사 연결을 해제할까요?')) { await linkCustomer(null); close() } }}>연결 해제</DsButton>
          </> : <>
            <input autoFocus className={cn(dsInput, 'h-7 text-[12.5px]')} placeholder="고객사 이름·코드" value={custQ} onChange={e => setCustQ(e.target.value)} />
            {custHits.map(c => <button key={c.id} onClick={async () => { await linkCustomer(c.id); close() }} className="text-left px-2 py-1 rounded hover:bg-ds-subtle text-[12.5px]">{c.company_name}{c.customer_code && <span className="text-ds-fg3 ml-1.5">{c.customer_code}</span>}</button>)}
          </>}
        </div>
      ),
    },
  ]

  const ft = (lead.first_touch || {}) as Record<string, string>
  const content = String(lead.inquiry_content || '').trim()
  const longText = content.split('\n').length > 6 || content.length > 300

  return (
    <div className="max-w-[1040px] mx-auto">
      {/* 머리 */}
      <div className="flex items-center gap-1.5 h-7 text-[12px]">
        <Link href="/pipeline/list" className="text-ds-fg3 hover:text-ds-fg">‹ 리스트</Link>
        <span className="flex-1" />
        <DsButton variant="ghost" size="sm" icon={<ChevronLeft className="w-3.5 h-3.5" />} disabled={!prevId} onClick={() => prevId && router.push(`/pipeline/${prevId}`)} title="리스트의 이전 리드">이전</DsButton>
        <DsButton variant="ghost" size="sm" disabled={!nextId} onClick={() => nextId && router.push(`/pipeline/${nextId}`)} title="리스트의 다음 리드">다음<ChevronRight className="w-3.5 h-3.5" /></DsButton>
        <DsButton size="sm" onClick={() => setTab('quote')}>견적서</DsButton>
        <div className="relative">
          <DsButton size="sm" variant="ghost" icon={<MoreHorizontal className="w-4 h-4" />} onClick={() => setMore(true)} title="더 보기" />
          <Popover open={more} onClose={() => setMore(false)} align="right" width={140}>
            <div className="grid gap-0.5 text-[12.5px]">
              {lead.stage !== '이탈' && <button onClick={() => { setMore(false); setStage('이탈') }} className="text-left px-2 py-1.5 rounded hover:bg-ds-subtle text-ds-bad">이탈 처리</button>}
            </div>
          </Popover>
        </div>
      </div>
      <div className="flex items-center gap-2 flex-wrap mt-0.5">
        <h1 className="text-[20px] font-semibold text-ds-fg">{lead.company_name}{(lead.site_name || lead.contact_team) && <span className="font-normal text-ds-fg2 text-[16px]"> · {lead.site_name || `본사 ${lead.contact_team}`}</span>}</h1>
        <StatusChip tone={stageTone(lead.stage)}>{lead.stage}</StatusChip>
        {followupIds.has(lead.id) && <span className="text-[12px] text-ds-accent">추가 진행</span>}
        {(lead.priority === '높음' || lead.priority === '긴급') && <span className="text-[12px] text-ds-bad">● {lead.priority}</span>}
      </div>
      <p className="text-[12px] text-ds-fg2 mt-1 mb-3">
        <span className="inline-block w-[7px] h-[7px] rounded-full mr-1 align-[1px]" style={{ background: INFLOW_COLOR[f.group] }} />{f.group} › {f.sub}
        {' · '}유입 {mmdd(date)} ({since(date, today)})
        {' · '}<span className={stale ? 'text-ds-bad' : ''}>마지막 활동 {lastAct ? ago(lastAct, today) : '없음'}</span>
        {lead.lead_number ? ` · No.${lead.lead_number}` : ''}
      </p>

      <StageBar flow={FLOW} stage={lead.stage} note={since(enteredAt, today)} onPick={setStage} />
      {lead.stage === '이탈' && <p className="text-[12px] text-ds-fg2 mt-1.5">지금 <b className="font-medium">이탈</b> ({since(enteredAt, today)}) — 단계를 누르면 다시 진행으로</p>}
      <div className="mt-3 mb-4"><PropertyBar items={props} /></div>

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,2fr)_minmax(280px,1fr)] gap-5 items-start">
        {/* 왼쪽 */}
        <div className="min-w-0">
          <Toolbar>
            <Tabs value={tab} onChange={setTab} options={[
              { value: 'act', label: '활동', count: acts.length }, { value: 'inflow', label: '유입 경로' },
              { value: 'quote', label: '견적·매출' }, { value: 'voc', label: 'VoC', count: data.voc.length || undefined },
            ]} />
          </Toolbar>
          {tab === 'act' && <>
            <RecordComposer lead={lead} onDone={reload} />
            <div className="mt-4"><Timeline items={timeline} editable leadId={id} onChanged={reload} /></div>
          </>}
          {tab === 'inflow' && (
            <Card title="유입 경로">
              <Rows rows={[
                { label: '분류', value: <><span className="inline-block w-[7px] h-[7px] rounded-full mr-1 align-[1px]" style={{ background: INFLOW_COLOR[f.group] }} />{f.group} › {f.sub} <span className="text-ds-fg3">({[lead.inquiry_channel, lead.inquiry_source].filter(Boolean).join(' / ') || '값 없음'})</span></> },
                { label: '유입', value: `${date}${lead.inquiry_hour != null ? ` · ${lead.inquiry_hour}시` : ''}` },
                { label: '첫 방문', value: ft.referrer ? `${ft.referrer}${ft.captured_at ? ` · ${String(ft.captured_at).slice(0, 16).replace('T', ' ')}` : ''}` : null },
                { label: '레퍼러', value: lead.referrer }, { label: '랜딩', value: lead.landing_page },
                { label: 'UTM', value: [lead.utm_source, lead.utm_medium, lead.utm_campaign, lead.utm_content, lead.utm_term].filter(Boolean).join(' / ') || null },
                { label: '세션', value: lead.site_session_id },
              ]} />
              <p className="mt-2 text-[12px] text-ds-fg3">홈페이지 문의 폼으로 들어온 리드만 첫 방문·레퍼러·UTM 이 있습니다. 분류 기준은 디자인 정의 §5.</p>
            </Card>
          )}
          {tab === 'quote' && <>
            {user && <QuotationSection leadId={id} companyName={lead.company_name} userId={user.id} />}
            <p className="mt-4 text-[12.5px] text-ds-fg2">매출 — {customer ? <Link href={`/customers/${customer.id}`} className="text-ds-accent hover:underline">{customer.company_name} 고객 상세 →</Link> : '위 속성 줄에서 고객사를 연결하면 고객 상세에서 봅니다.'}</p>
          </>}
          {tab === 'voc' && (!lead.customer_id ? <Empty text="고객사를 연결하면 VoC 티켓을 볼 수 있습니다." /> : <>
            {data.voc.length === 0 ? <p className="text-[12.5px] text-ds-fg3 mb-3">관련 VoC 티켓이 없습니다.</p> : (
              <div className="ds-wrap mb-3"><table className="ds-table is-clickable">
                <thead><tr><th>번호</th><th>제목</th><th>분류</th><th>상태</th><th>등록일</th></tr></thead>
                <tbody>{data.voc.map((t: any) => (
                  <tr key={t.id} className="ds-row" onClick={() => router.push(`/voc/${t.id}`)}>
                    <td className="c">#{t.ticket_number}</td><td className="truncate max-w-[280px]">{t.title}</td><td className="c">{VOC_CATEGORY_LABELS[t.category] || t.category}</td>
                    <td className="c">{t.status}</td><td className="c">{mmdd(t.created_at)}</td>
                  </tr>))}</tbody></table></div>
            )}
            {!voc.open ? <DsButton size="sm" onClick={() => setVoc({ ...voc, open: true })}>+ VoC 티켓</DsButton> : (
              <Card title="새 VoC 티켓">
                <div className="grid gap-2">
                  <div className="flex gap-2 flex-wrap">
                    <DsSelect value={voc.category} onChange={e => setVoc({ ...voc, category: e.target.value })} className="h-7 text-[12.5px]">{Object.entries(VOC_CATEGORY_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</DsSelect>
                    <DsSelect value={voc.channel} onChange={e => setVoc({ ...voc, channel: e.target.value })} className="h-7 text-[12.5px]">{[['phone', '전화'], ['email', '이메일'], ['message', '메시지'], ['meeting', '미팅']].map(([v, l]) => <option key={v} value={v}>{l}</option>)}</DsSelect>
                    <DsSelect value={voc.priority} onChange={e => setVoc({ ...voc, priority: e.target.value })} className="h-7 text-[12.5px]">{Object.entries(VOC_PRIORITY_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</DsSelect>
                  </div>
                  <input className={cn(dsInput, 'h-7 text-[12.5px]')} placeholder="제목" value={voc.title} onChange={e => setVoc({ ...voc, title: e.target.value })} />
                  <textarea className="w-full px-2.5 py-1.5 rounded-md border border-ds-line text-[12.5px] focus:outline-none focus:ring-2 focus:ring-ds-accent" rows={3} placeholder="내용 (선택)" value={voc.description} onChange={e => setVoc({ ...voc, description: e.target.value })} />
                  <div className="flex gap-1.5"><DsButton size="sm" variant="primary" disabled={!voc.title.trim()} onClick={submitVoc}>만들기</DsButton><DsButton size="sm" variant="ghost" onClick={() => setVoc({ ...voc, open: false })}>취소</DsButton></div>
                </div>
              </Card>
            )}
          </>)}
        </div>

        {/* 오른쪽 카드 3장 */}
        <aside className="min-w-0 grid gap-2.5">
          <EditCard title="문의자" lead={lead} onSave={saveFields} fields={[
            { key: 'contact_person', label: '이름' }, { key: 'contact_position', label: '직급' }, { key: 'contact_phone', label: '연락처' }, { key: 'contact_email', label: '이메일' }]}>
            {fill => <Rows onFill={fill} rows={[
              { label: '이름', value: [lead.contact_person, lead.contact_position].filter(Boolean).join(' · ') || null },
              { label: '연락처', value: lead.contact_phone ? <a href={`tel:${lead.contact_phone}`} className="text-ds-accent hover:underline tabular-nums">{lead.contact_phone}</a> : null },
              { label: '이메일', value: lead.contact_email ? <a href={`mailto:${lead.contact_email}`} className="hover:underline break-all">{lead.contact_email}</a> : null },
            ]} />}
          </EditCard>
          <EditCard title="문의 내용" lead={lead} onSave={saveFields} fields={[
            { key: 'inquiry_content', label: '내용', kind: 'textarea' }, { key: 'interest_service', label: '관심 서비스' }, { key: 'core_need', label: '핵심 니즈' }]}>
            {fill => <>
              {content ? <p className={cn('text-ds-fg whitespace-pre-wrap break-words leading-relaxed', !moreText && longText && 'line-clamp-6')}>{content}</p> : null}
              {longText && <button onClick={() => setMoreText(v => !v)} className="text-[12px] text-ds-accent mt-1">{moreText ? '접기' : '더 보기'}</button>}
              {(lead.topic_tags || []).length > 0 && <div className="mt-1.5">{(lead.topic_tags as string[]).map(t => <span key={t} className="text-ds-accent text-[12px] mr-1.5">#{t}</span>)}</div>}
              <div className={content ? 'mt-2' : ''}><Rows onFill={fill} rows={[
                ...(content ? [] : [{ label: '내용', value: null }]),
                { label: '관심', value: lead.interest_service }, { label: '니즈', value: lead.core_need }]} /></div>
            </>}
          </EditCard>
          <EditCard title="회사 · 현장 · 유입" lead={lead} onSave={saveFields} fields={[
            { key: 'company_name', label: '회사명' }, { key: 'site_name', label: '현장명' }, { key: 'site_region', label: '지역' }, { key: 'contact_team', label: '본사 팀' }, { key: 'customer_code', label: 'ID' },
            { key: 'site_category', label: '발주', kind: 'select', options: ['민간', '공공'] }, { key: 'industry', label: '사업분류', kind: 'select', options: INDUSTRY_OPTIONS },
            { key: 'inquiry_date', label: '유입일', kind: 'date' }, { key: 'inquiry_channel', label: '채널', kind: 'select', options: CHANNEL_OPTIONS },
            { key: 'inquiry_source', label: '경로' }, { key: 'notes', label: '메모', kind: 'textarea' }]}>
            {fill => <Rows onFill={fill} rows={[
              { label: '현장', value: [lead.site_name, lead.site_region].filter(Boolean).join(' · ') || null }, { label: '본사 팀', value: lead.contact_team },
              { label: 'ID', value: lead.customer_code }, { label: '발주', value: lead.site_category }, { label: '사업분류', value: lead.industry },
              { label: '유입', value: <><span className="inline-block w-[7px] h-[7px] rounded-full mr-1 align-[1px]" style={{ background: INFLOW_COLOR[f.group] }} />{f.group} › {f.sub}</> },
              { label: '메모', value: lead.notes ? <span className="whitespace-pre-wrap">{lead.notes}</span> : null },
            ]} />}
          </EditCard>
          <RelatedInquiries items={data.related} />
          <p className="text-[12px] text-ds-fg3 px-1">등록 {kstDate(String(lead.created_at))}</p>
        </aside>
      </div>
    </div>
  )
}
