'use client'

// 세일즈 › 리드 상세 (2026-10-21 개편, 디자인 정의 › 세일즈 › 리드 상세 — 배치 A)
// 이름줄 → 단계 진행줄(단계별 머문 일수) → 숫자줄 → 본문 2:1
// 왼쪽: 탭(활동 · 변경 이력 · 유입 경로 · 견적·매출 · VoC), 활동 탭 = 기록 칸 + 타임라인(드로어와 같은 부품)
// 오른쪽: 정보 패널 — 칸을 누르면 바로 수정, 바뀐 칸은 타임라인에 남음. 읽기는 /api/pipeline/lead/[id] 한 번.
import { Fragment, useEffect, useState, type ReactNode } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/hooks/useAuth'
import { useFollowupLeadIds } from '@/hooks/useFollowupLeadIds'
import { classifyLead, INFLOW_COLOR } from '@/lib/inflow-taxonomy'
import { confirmConvertedStageChange, INDUSTRY_OPTIONS, CHANNEL_OPTIONS, VOC_CATEGORY_LABELS, VOC_PRIORITY_LABELS, cn } from '@/lib/utils'
import { Toolbar, Tabs, KpiRow, DsButton, DsSelect, StatusChip, Skeleton, Empty, stageTone, toneVar, dsInput } from '@/components/ds'
import { RecordComposer, Timeline, useLeadOverview, postUpdate } from '@/components/pipeline/lead-record'
import { PROB, PRIO } from '@/components/pipeline/lead-drawer'
import QuotationSection from '@/components/pipeline/QuotationSection'
import { toast } from 'sonner'
import { ChevronLeft, ChevronRight, X } from 'lucide-react'

const FLOW = ['신규리드', '컨텍', '제안', '미팅', '도입직전', '도입완료']
const OPEN = ['신규리드', '컨텍', '제안', '미팅', '도입직전', '예정']
type Tab = 'act' | 'hist' | 'inflow' | 'quote' | 'voc'
const kstToday = () => new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10)
const days = (a: string, b: string) => Math.max(0, Math.round((new Date(b.slice(0, 10)).getTime() - new Date(a.slice(0, 10)).getTime()) / 86400000))
const md = (s?: string | null) => (s ? s.slice(5, 10).replace('-', '.') : '')

/* ─── 칸 바로 수정: 누르면 입력, Enter·바깥 클릭 저장, Esc 취소 ─── */
function Field({ label, value, display, kind = 'text', options, onSave, placeholder }: {
  label: string; value: string | null | undefined; display?: ReactNode; kind?: 'text' | 'textarea' | 'select' | 'date'
  options?: (string | { value: string; label: string })[]; onSave?: (v: string) => Promise<void> | void; placeholder?: string
}) {
  const [on, setOn] = useState(false)
  const [v, setV] = useState(value || '')
  useEffect(() => { if (!on) setV(value || '') }, [value, on])
  const commit = async () => { setOn(false); if ((value || '') !== v.trim() && onSave) await onSave(v.trim()) }
  const empty = <span className="text-ds-fg3">{placeholder || '—'}</span>
  const ctl = 'h-7 text-[12.5px]'
  let editor: ReactNode = null
  if (on) {
    if (kind === 'select') editor = (
      <DsSelect autoFocus value={v} className={cn(ctl, 'w-full')} onBlur={() => setOn(false)}
        onChange={async e => { setV(e.target.value); setOn(false); if (e.target.value !== (value || '') && onSave) await onSave(e.target.value) }}>
        <option value="">—</option>{options?.map(o => typeof o === 'string' ? <option key={o}>{o}</option> : <option key={o.value} value={o.value}>{o.label}</option>)}
      </DsSelect>)
    else if (kind === 'textarea') editor = (
      <textarea autoFocus value={v} rows={5} onChange={e => setV(e.target.value)} onBlur={commit} onKeyDown={e => { if (e.key === 'Escape') { setV(value || ''); setOn(false) } }}
        className="w-full px-2 py-1.5 rounded border border-ds-line text-[12.5px] focus:outline-none focus:ring-2 focus:ring-ds-accent resize-y" />)
    else editor = (
      <input autoFocus type={kind === 'date' ? 'date' : 'text'} value={v} onChange={e => setV(e.target.value)} onBlur={commit}
        onKeyDown={e => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') { setV(value || ''); setOn(false) } }}
        className={cn(dsInput, ctl)} />)
  }
  const shown = display ?? (value ? <span className={kind === 'textarea' ? 'whitespace-pre-wrap break-words' : 'break-words'}>{value}</span> : empty)
  return (
    <>
      <span className="text-ds-fg3 pt-1">{label}</span>
      {editor || (
        <span onClick={() => onSave && setOn(true)} className={cn('min-h-[28px] py-1 px-1.5 -mx-1.5 rounded text-ds-fg', onSave && 'cursor-text hover:bg-ds-subtle')}>{shown}</span>
      )}
    </>
  )
}
function Group({ title, children }: { title: string; children: ReactNode }) {
  return <div className="border-t border-ds-line2 py-2.5"><div className="text-[11px] text-ds-fg3 mb-1.5">{title}</div><div className="grid grid-cols-[76px_1fr] gap-x-2.5 gap-y-0.5 items-start text-[12.5px]">{children}</div></div>
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
  const [custQ, setCustQ] = useState('')
  const [custHits, setCustHits] = useState<{ id: string; company_name: string; customer_code: string | null }[]>([])
  const [voc, setVoc] = useState({ open: false, category: 'inquiry', channel: 'phone', priority: 'normal', title: '', description: '' })

  // 이전·다음 = 리스트에서 보던 페이지 순서
  useEffect(() => { try { setNav(JSON.parse(sessionStorage.getItem('leadNav') || '[]')) } catch { /* 없음 */ } }, [])
  // 고객사 검색 — 입력할 때만 10개
  useEffect(() => {
    const q = custQ.trim()
    if (!q) { setCustHits([]); return }
    const t = setTimeout(async () => {
      const { data } = await supabase.from('customers').select('id, company_name, customer_code').or(`company_name.ilike.%${q.replace(/[%,()]/g, '')}%,customer_code.ilike.%${q.replace(/[%,()]/g, '')}%`).limit(10)
      setCustHits(data || [])
    }, 250)
    return () => clearTimeout(t)
  }, [custQ]) // eslint-disable-line react-hooks/exhaustive-deps

  if (error) return <Empty text={`리드를 찾을 수 없습니다. (${error})`} action={<Link href="/pipeline/list"><DsButton size="sm">리스트로</DsButton></Link>} />
  if (!data) return <div className="max-w-[1280px]"><Skeleton rows={14} /></div>

  const { lead, timeline, users, customer } = data
  const today = kstToday()
  const date = lead.inquiry_date || String(lead.created_at).slice(0, 10)
  const f = classifyLead(lead.inquiry_channel, lead.inquiry_source)
  const uname = (x: string | null) => users.find(u => u.id === x)?.name || '미배정'
  const acts = timeline.filter(t => t.kind === 'act')
  const hist = timeline.filter(t => t.kind !== 'act')

  // 단계에 들어온 날 (이력 오래된 순으로 덮어씀)
  const entered: Record<string, string> = { 신규리드: date }
  for (const h of [...timeline].reverse()) if (h.kind === 'stage' && h.new) entered[h.new] = h.at.slice(0, 10)
  const ci = FLOW.indexOf(lead.stage)
  const stayCur = days(entered[lead.stage] || date, today)

  const save = async (body: Record<string, unknown>, msg = '저장했습니다') => {
    const r = await postUpdate({ lead_id: id, changed_by: user?.id, ...body })
    if (r.error) { toast.error(r.error); return false }
    toast.success(msg); await reload(); return true
  }
  const setField = (k: string) => async (v: string) => { await save({ action: 'update_lead', updates: { [k]: v || null } }) }
  const setStage = async (s: string) => {
    if (s === lead.stage) return
    const c = confirmConvertedStageChange(lead.stage, s)
    if (!c.proceed) return
    await save({ action: 'change_stage', new_stage: s, old_stage: lead.stage, force: c.force }, `단계 → ${s}`)
  }
  const setAssignee = async (v: string) => { await save({ action: 'change_assigned', user_id: v || null, old_name: uname(lead.assigned_to), new_name: uname(v) }, '담당자를 바꿨습니다') }
  const setNext = (k: 'next_action' | 'next_action_date') => async (v: string) => {
    await save({ action: 'update_next_action', next_action: k === 'next_action' ? v : lead.next_action, next_action_date: k === 'next_action_date' ? v : lead.next_action_date })
  }
  const linkCustomer = async (cid: string | null) => {
    if (await save({ action: 'link_customer', customer_id: cid }, cid ? '고객사를 연결했습니다' : '연결을 해제했습니다')) setCustQ('')
  }
  const submitVoc = async () => {
    if (!voc.title.trim() || !lead.customer_id || !user) return
    const ok = await save({ action: 'create_voc_ticket', customer_id: lead.customer_id, category: voc.category, channel: voc.channel, priority: voc.priority, title: voc.title, description: voc.description || null, reported_by: lead.contact_person || '', created_by: user.id, assigned_to: lead.assigned_to || null, category_label: VOC_CATEGORY_LABELS[voc.category] }, 'VoC 티켓을 만들었습니다')
    if (ok) setVoc({ ...voc, open: false, title: '', description: '' })
  }

  const ni = nav.indexOf(id)
  const prevId = ni > 0 ? nav[ni - 1] : null, nextId = ni >= 0 && ni < nav.length - 1 ? nav[ni + 1] : null
  const lastAct = acts[0]?.at
  const gap = lastAct ? days(lastAct, today) : null
  const isOpen = OPEN.includes(lead.stage)
  const overdue = lead.next_action_date && lead.next_action_date < today
  const ft = (lead.first_touch || {}) as Record<string, string>

  return (
    <div className="max-w-[1280px]">
      {/* 이름줄 */}
      <div className="flex items-start justify-between gap-3 flex-wrap mb-2">
        <div className="min-w-0">
          <Link href="/pipeline/list" className="text-[12px] text-ds-fg3 hover:text-ds-fg">‹ 리스트</Link>
          <h1 className="text-[18px] font-semibold text-ds-fg flex items-center gap-2 flex-wrap mt-0.5">
            {lead.company_name}<StatusChip tone={stageTone(lead.stage)}>{lead.stage}</StatusChip>
            {followupIds.has(lead.id) && <span className="text-[12px] font-normal text-ds-accent">추가 진행</span>}
            {(lead.priority === '높음' || lead.priority === '긴급') && <span className="text-[12px] font-normal text-ds-bad">● 우선순위 {lead.priority}</span>}
          </h1>
          <p className="text-[12px] text-ds-fg2 mt-0.5">
            {[lead.site_category, lead.industry].filter(Boolean).join(' · ')}{(lead.site_category || lead.industry) && ' · '}
            <span className="inline-block w-[7px] h-[7px] rounded-full mr-1 align-[1px]" style={{ background: INFLOW_COLOR[f.group] }} />{f.group} › {f.sub} · 유입 {date} · 담당 {uname(lead.assigned_to)}
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          <DsButton variant="ghost" size="sm" icon={<ChevronLeft className="w-3.5 h-3.5" />} disabled={!prevId} onClick={() => prevId && router.push(`/pipeline/${prevId}`)} title="리스트의 이전 리드">이전</DsButton>
          <DsButton variant="ghost" size="sm" disabled={!nextId} onClick={() => nextId && router.push(`/pipeline/${nextId}`)} title="리스트의 다음 리드">다음<ChevronRight className="w-3.5 h-3.5" /></DsButton>
          <DsButton size="sm" onClick={() => setTab('quote')}>견적서</DsButton>
        </div>
      </div>

      {/* 단계 진행줄 — 누르면 그 단계로 */}
      <div className="flex gap-1 items-stretch mb-3">
        {FLOW.map((s, i) => {
          const st = ci >= 0 && i < ci ? 'done' : i === ci ? 'cur' : ''
          let sub = ''
          if (st && entered[s]) {
            const end = st === 'cur' ? today : entered[FLOW.slice(i + 1).find(x => entered[x]) || ''] || null
            sub = `${md(entered[s])}${end ? ` · ${st === 'cur' ? `${stayCur}일째` : `${days(entered[s], end)}일`}` : ''}`
          }
          return (
            <button key={s} onClick={() => setStage(s)} title={`${s}(으)로 바꾸기`}
              className={cn('flex-1 min-w-0 text-left rounded px-2.5 py-1.5 border-t-[3px] transition-colors', st === 'cur' ? 'bg-ds-accent-soft' : 'bg-ds-subtle hover:bg-ds-line2')}
              style={{ borderTopColor: st ? toneVar[stageTone(s === '도입완료' ? s : '컨텍')] : 'var(--ds-line)' }}>
              <div className={cn('text-[12.5px] truncate', st === 'cur' ? 'text-ds-accent font-semibold' : st ? 'text-ds-fg font-medium' : 'text-ds-fg3')}>{s}</div>
              <div className="text-[11px] text-ds-fg3 truncate h-4">{sub}</div>
            </button>
          )
        })}
        <div className="flex flex-col gap-1 justify-center ml-1.5">
          <DsButton size="sm" variant={lead.stage === '예정' ? 'primary' : 'secondary'} onClick={() => setStage('예정')}>예정{lead.stage === '예정' ? ` · ${stayCur}일째` : '으로'}</DsButton>
          {lead.stage !== '이탈' ? <DsButton size="sm" variant="danger" onClick={() => setStage('이탈')}>이탈 처리</DsButton> : <span className="text-[12px] text-ds-fg3 text-center">이탈 · {stayCur}일째</span>}
        </div>
      </div>

      <KpiRow items={[
        { label: '유입 후', value: `D+${days(date, today)}`, sub: `${date} 문의` },
        { label: '지금 단계', value: `${lead.stage} ${stayCur}일째`, sub: entered[lead.stage] ? `${entered[lead.stage]}부터` : undefined },
        { label: '활동', value: `${acts.length}건`, sub: lastAct ? `마지막 ${md(lastAct)} · ${gap}일 전` : '기록 없음', tone: isOpen && (gap == null || gap > 14) ? 'bad' : undefined },
        { label: '다음 액션', value: lead.next_action || lead.next_action_date ? (lead.next_action || '날짜만') : '없음', sub: lead.next_action_date ? `${lead.next_action_date}${overdue ? ' · 지남' : ''}` : '기록 칸에서 정함', tone: (isOpen && !lead.next_action && !lead.next_action_date) || overdue ? 'bad' : undefined },
        { label: '고객사', value: customer ? '연결됨' : '없음', sub: customer ? customer.company_name : '정보 › 회사에서 연결' },
      ]} />

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,2fr)_minmax(300px,1fr)] gap-5">
        {/* 왼쪽: 활동 */}
        <div className="min-w-0">
          <Toolbar>
            <Tabs value={tab} onChange={setTab} options={[
              { value: 'act', label: '활동', count: acts.length }, { value: 'hist', label: '변경 이력', count: hist.length },
              { value: 'inflow', label: '유입 경로' }, { value: 'quote', label: '견적·매출' }, { value: 'voc', label: 'VoC', count: data.voc.length || undefined },
            ]} />
          </Toolbar>
          {tab === 'act' && <>
            <RecordComposer lead={lead} onDone={reload} />
            <div className="mt-4"><Timeline items={timeline} editable leadId={id} onChanged={reload} /></div>
          </>}
          {tab === 'hist' && <Timeline items={hist} leadId={id} onChanged={reload} />}
          {tab === 'inflow' && (
            <div className="grid grid-cols-[120px_1fr] gap-x-3 gap-y-2 text-[12.5px]">
              {([
                ['유입일 · 시각', `${date}${lead.inquiry_hour != null ? ` · ${lead.inquiry_hour}시` : ''}`],
                ['유입 분류', `${f.group} › ${f.sub}`], ['원래 값', [lead.inquiry_channel, lead.inquiry_source].filter(Boolean).join(' / ')],
                ['첫 방문 레퍼러', ft.referrer], ['첫 방문 시각', ft.captured_at ? String(ft.captured_at).slice(0, 16).replace('T', ' ') : null],
                ['문의 때 레퍼러', lead.referrer], ['랜딩 페이지', lead.landing_page],
                ['UTM source / medium', [lead.utm_source, lead.utm_medium].filter(Boolean).join(' / ')], ['UTM campaign', lead.utm_campaign],
                ['UTM content / term', [lead.utm_content, lead.utm_term].filter(Boolean).join(' / ')], ['방문 세션', lead.site_session_id],
              ] as [string, string | null][]).map(([k, v]) => <Fragment key={k}><span className="text-ds-fg3">{k}</span><span className={cn('break-all', v ? 'text-ds-fg' : 'text-ds-fg3')}>{v || '—'}</span></Fragment>)}
              <p className="col-span-2 mt-2 text-[12px] text-ds-fg3">홈페이지 문의 폼으로 들어온 리드만 레퍼러·UTM 이 있습니다. 분류 기준은 디자인 정의 §5.</p>
            </div>
          )}
          {tab === 'quote' && <>
            {user && <QuotationSection leadId={id} companyName={lead.company_name} userId={user.id} />}
            <p className="mt-4 text-[12.5px] text-ds-fg2">
              매출: {customer ? <Link href={`/customers/${customer.id}`} className="text-ds-accent hover:underline">{customer.company_name} 고객 상세 →</Link> : '고객사를 연결하면 고객 상세에서 매출을 봅니다.'}
            </p>
          </>}
          {tab === 'voc' && (!lead.customer_id ? <Empty text="고객사를 연결하면 VoC 티켓을 볼 수 있습니다." /> : <>
            {data.voc.length === 0 ? <p className="text-[12.5px] text-ds-fg3 mb-3">관련 VoC 티켓이 없습니다.</p> : (
              <div className="ds-wrap mb-3"><table className="ds-table is-clickable">
                <thead><tr><th>번호</th><th>제목</th><th>분류</th><th>상태</th><th>등록일</th></tr></thead>
                <tbody>{data.voc.map((t: any) => (
                  <tr key={t.id} className="ds-row" onClick={() => router.push(`/voc/${t.id}`)}>
                    <td className="c">#{t.ticket_number}</td><td className="truncate max-w-[280px]">{t.title}</td><td className="c">{VOC_CATEGORY_LABELS[t.category] || t.category}</td>
                    <td className="c">{t.status}</td><td className="c">{String(t.created_at).slice(0, 10)}</td>
                  </tr>))}</tbody></table></div>
            )}
            {!voc.open ? <DsButton size="sm" onClick={() => setVoc({ ...voc, open: true })}>+ VoC 티켓</DsButton> : (
              <div className="border border-ds-line rounded-md p-3 grid gap-2 text-[12.5px]">
                <div className="flex gap-2 flex-wrap">
                  <DsSelect value={voc.category} onChange={e => setVoc({ ...voc, category: e.target.value })} className="h-7 text-[12.5px]">{Object.entries(VOC_CATEGORY_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</DsSelect>
                  <DsSelect value={voc.channel} onChange={e => setVoc({ ...voc, channel: e.target.value })} className="h-7 text-[12.5px]">{[['phone', '전화'], ['email', '이메일'], ['message', '메시지'], ['meeting', '미팅']].map(([v, l]) => <option key={v} value={v}>{l}</option>)}</DsSelect>
                  <DsSelect value={voc.priority} onChange={e => setVoc({ ...voc, priority: e.target.value })} className="h-7 text-[12.5px]">{Object.entries(VOC_PRIORITY_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</DsSelect>
                </div>
                <input className={cn(dsInput, 'h-7 text-[12.5px]')} placeholder="제목" value={voc.title} onChange={e => setVoc({ ...voc, title: e.target.value })} />
                <textarea className="w-full px-2.5 py-1.5 rounded border border-ds-line text-[12.5px] focus:outline-none focus:ring-2 focus:ring-ds-accent" rows={3} placeholder="내용 (선택)" value={voc.description} onChange={e => setVoc({ ...voc, description: e.target.value })} />
                <div className="flex gap-1.5"><DsButton size="sm" variant="primary" disabled={!voc.title.trim()} onClick={submitVoc}>만들기</DsButton><DsButton size="sm" variant="ghost" onClick={() => setVoc({ ...voc, open: false })}>취소</DsButton></div>
              </div>
            )}
          </>)}
        </div>

        {/* 오른쪽: 정보 패널 */}
        <aside className="min-w-0 xl:border-l xl:border-ds-line xl:pl-4">
          <div className="flex items-baseline gap-2 mb-1"><h2 className="text-[14px] font-medium text-ds-fg">정보</h2><span className="text-[11.5px] text-ds-fg3">칸을 누르면 바로 수정 · 바뀐 칸은 타임라인에</span></div>
          <Group title="진행">
            <Field label="단계" value={lead.stage} display={<StatusChip tone={stageTone(lead.stage)}>{lead.stage}</StatusChip>} kind="select" options={[...FLOW, '예정', '이탈']} onSave={setStage} />
            <Field label="담당" value={lead.assigned_to} display={uname(lead.assigned_to)} kind="select" options={users.map(u => ({ value: u.id, label: u.name }))} onSave={setAssignee} />
            <Field label="우선순위" value={lead.priority} kind="select" options={PRIO} onSave={setField('priority')} />
            <Field label="도입가능성" value={lead.conversion_probability} kind="select" options={PROB} onSave={setField('conversion_probability')} />
            <Field label="다음 액션" value={lead.next_action} onSave={setNext('next_action')} placeholder="+ 정하기" />
            <Field label="액션 날짜" value={lead.next_action_date} kind="date" display={lead.next_action_date ? <span className={overdue ? 'text-ds-bad' : ''}>{lead.next_action_date}{overdue ? ' · 지남' : ''}</span> : undefined} onSave={setNext('next_action_date')} />
          </Group>
          <Group title="회사">
            <Field label="회사명" value={lead.company_name} onSave={async v => { if (v) await setField('company_name')(v) }} />
            <Field label="코드" value={lead.customer_code} onSave={setField('customer_code')} />
            <Field label="발주" value={lead.site_category} kind="select" options={['민간', '공공']} onSave={setField('site_category')} />
            <Field label="사업분류" value={lead.industry} kind="select" options={INDUSTRY_OPTIONS} onSave={setField('industry')} />
            <span className="text-ds-fg3 pt-1">고객사</span>
            <div className="py-1 min-w-0">
              {customer ? (
                <span className="inline-flex items-center gap-1.5 max-w-full">
                  <Link href={`/customers/${customer.id}`} className="text-ds-accent hover:underline truncate">{customer.company_name}</Link>
                  <button onClick={() => window.confirm('고객사 연결을 해제할까요?') && linkCustomer(null)} className="text-ds-fg3 hover:text-ds-bad" title="연결 해제"><X className="w-3.5 h-3.5" /></button>
                </span>
              ) : (
                <div className="relative">
                  <input className={cn(dsInput, 'h-7 text-[12.5px]')} placeholder="고객사 검색해서 연결" value={custQ} onChange={e => setCustQ(e.target.value)} />
                  {custHits.length > 0 && (
                    <div className="absolute z-20 left-0 right-0 top-8 bg-ds-bg border border-ds-line rounded-md shadow-[0_8px_24px_rgba(0,0,0,.08)] max-h-56 overflow-auto">
                      {custHits.map(c => <button key={c.id} onClick={() => linkCustomer(c.id)} className="w-full text-left px-2.5 py-1.5 hover:bg-ds-subtle text-[12.5px]">{c.company_name}{c.customer_code && <span className="text-ds-fg3 ml-1.5">{c.customer_code}</span>}</button>)}
                    </div>
                  )}
                </div>
              )}
            </div>
          </Group>
          <Group title="문의자">
            <Field label="이름" value={lead.contact_person} onSave={setField('contact_person')} />
            <Field label="직급" value={lead.contact_position} onSave={setField('contact_position')} />
            <Field label="연락처" value={lead.contact_phone} onSave={setField('contact_phone')} />
            <Field label="이메일" value={lead.contact_email} onSave={setField('contact_email')} />
          </Group>
          <Group title="문의">
            <Field label="유입일" value={lead.inquiry_date} kind="date" onSave={setField('inquiry_date')} />
            <Field label="유입" value={null} display={<span><span className="inline-block w-[7px] h-[7px] rounded-full mr-1 align-[1px]" style={{ background: INFLOW_COLOR[f.group] }} />{f.group} <span className="text-ds-fg3">› {f.sub}</span></span>} />
            <Field label="채널" value={lead.inquiry_channel} kind="select" options={CHANNEL_OPTIONS} onSave={setField('inquiry_channel')} />
            <Field label="경로" value={lead.inquiry_source} onSave={setField('inquiry_source')} />
            <Field label="관심 서비스" value={lead.interest_service} onSave={setField('interest_service')} />
            <Field label="핵심 니즈" value={lead.core_need} onSave={setField('core_need')} />
            <Field label="주제" value={null} display={(lead.topic_tags || []).length ? <span>{(lead.topic_tags as string[]).map(t => <span key={t} className="text-ds-accent mr-1.5">#{t}</span>)}</span> : undefined} />
            <Field label="문의 내용" value={lead.inquiry_content} kind="textarea" onSave={setField('inquiry_content')} />
            <Field label="메모" value={lead.notes} kind="textarea" onSave={setField('notes')} />
          </Group>
          <p className="text-[11.5px] text-ds-fg3 mt-2">등록 {String(lead.created_at).slice(0, 10)}{lead.lead_number ? ` · No.${lead.lead_number}` : ''}</p>
        </aside>
      </div>
    </div>
  )
}
