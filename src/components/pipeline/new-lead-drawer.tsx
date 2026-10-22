'use client'

// 새 리드 등록 드로어 (480) — 2026-10-21 디자인 정의 › 새 리드 등록 v4
// 유입 일시(맨 위) → ID 자동(YYMMDDHHmm) · 연락처를 먼저 확인해 같은 사람의 문의는 "이어받기" ·
// 회사가 같으면 같은 문의 / 같은 회사 새 문의(다른 현장·본사 팀) / 다른 회사 · 유입 두 줄(문의 수단 + 유입 경로)
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { INFLOW_GROUPS } from '@/lib/inflow-taxonomy'
import { INDUSTRY_OPTIONS, cn } from '@/lib/utils'
import { Drawer, DsButton, DsSelect, StatusChip, stageTone, dsInput } from '@/components/ds'
import { postUpdate } from '@/components/pipeline/lead-record'
import { toast } from 'sonner'
import { formatPhone } from '@/lib/phone'
import { codeToInquiry } from '@/lib/elapsed'

const METHODS: [string, string][] = [['홈페이지 문의', '자사채널'], ['대표전화', '대표전화'], ['개인전화', '개인전화'], ['이메일', '이메일'], ['해피톡', '해피톡'], ['행사', '행사방문'], ['기타', '기타']]
const SERVICES = ['AI CCTV', '동영상 기록관리', '스마트 안전장비', '공정관리 플랫폼', '중대재해예방', '통합 솔루션']
const PRIO = ['긴급', '높음', '중간', '낮음']
type Lead = { id: string; customer_code: string | null; company_name: string; site_name: string | null; site_region: string | null; contact_team: string | null; contact_person: string | null; stage: string; assigned_to: string | null; inquiry_date: string | null; created_at: string; notes: string | null; customer_id: string | null; inquiry_channel: string | null }
type Lookup = { byContact: Lead[]; company: { customers: { id: string; company_name: string; customer_code: string | null; company_type: string | null }[]; leads: Lead[] } }

const kstNow = () => new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 16) // YYYY-MM-DDTHH:mm
const codeOf = (at: string) => at.replace(/[-T:]/g, '').slice(2, 12)
const where = (l: Lead) => l.site_name ? `현장 · ${l.site_name}` : l.contact_team ? `본사 · ${l.contact_team}` : '현장·팀 모름'
const md = (s?: string | null) => (s ? s.slice(5, 10).replace('-', '.') : '')

function Chips({ items, value, onChange, sub }: { items: string[]; value: string; onChange: (v: string) => void; sub?: boolean }) {
  return (
    <div className={cn('flex flex-wrap gap-1', sub && 'mt-1.5 pl-2.5 border-l-2 border-ds-line')}>
      {items.map(x => (
        <button key={x} type="button" onClick={() => onChange(value === x ? '' : x)}
          className={cn('h-[26px] px-2.5 rounded-full border text-[12px] transition-colors',
            value === x ? (sub ? 'bg-ds-accent border-ds-accent text-white' : 'bg-ds-fg border-ds-fg text-ds-bg') : 'border-ds-line text-ds-fg2 hover:text-ds-fg hover:border-ds-fg3')}>{x}</button>
      ))}
    </div>
  )
}
const F = ({ label, req, children, className }: { label: string; req?: boolean; children: ReactNode; className?: string }) => (
  <label className={cn('grid gap-1 min-w-0', className)}><span className="text-[12px] text-ds-fg2">{label}{req && <b className="text-ds-bad ml-0.5">*</b>}</span>{children}</label>
)
const Sec = ({ children, note }: { children: ReactNode; note?: string }) => <div className="text-[12px] font-semibold text-ds-fg2 mt-4 mb-1.5">{children}{note && <span className="font-normal text-ds-fg3 ml-1.5">{note}</span>}</div>

const EMPTY = () => ({
  at: kstNow(), phone: '', email: '', company: '', siteCategory: '', industry: '',
  where: '' as '' | '현장' | '본사', site: '', region: '', team: '', person: '', position: '',
  method: '', group: '', sub: '', etcName: '', etcLink: '', service: '', content: '',
  next: '', nextDate: '', code: '', priority: '중간', coreNeed: '', notes: '',
})

export function NewLeadDrawer({ open, users, onClose, onCreated, onOpenLead }: {
  open: boolean; users: { id: string; name: string }[]; onClose: () => void
  onCreated: (id: string) => void; onOpenLead: (id: string) => void
}) {
  const { user } = useAuth()
  const [f, setF] = useState(EMPTY)
  const [assignee, setAssignee] = useState('')
  const [more, setMore] = useState(false)
  const [busy, setBusy] = useState(false)
  const [look, setLook] = useState<Lookup | null>(null)
  const [mode, setMode] = useState<'' | 'new-same' | 'other'>('')  // 회사가 겹칠 때 고른 것
  const set = (p: Partial<ReturnType<typeof EMPTY>>) => setF(x => ({ ...x, ...p }))

  useEffect(() => { if (open) { setF(EMPTY()); setMore(false); setLook(null); setMode(''); setAssignee(user?.id || '') } }, [open]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (!assignee && user?.id) setAssignee(user.id) }, [user, assignee])

  // 연락처·이메일·회사명이 바뀌면 0.4초 뒤 확인
  useEffect(() => {
    if (!open) return
    const phone = f.phone.replace(/\D/g, ''), email = f.email.trim(), name = f.company.trim()
    if (phone.length < 8 && !email.includes('@') && name.length < 2) { setLook(null); return }
    const t = setTimeout(async () => {
      try {
        const r = await fetch(`/api/pipeline/lookup?phone=${encodeURIComponent(phone)}&email=${encodeURIComponent(email)}&name=${encodeURIComponent(name)}`)
        if (r.ok) setLook(await r.json())
      } catch { /* 확인 못 해도 등록은 됨 */ }
    }, 400)
    return () => clearTimeout(t)
  }, [open, f.phone, f.email, f.company])
  useEffect(() => { setMode('') }, [f.company])

  const groupSubs = useMemo(() => INFLOW_GROUPS.find(g => g.key === f.group)?.subs as readonly string[] | undefined, [f.group])
  const code = f.code.trim() || codeOf(f.at)
  const sameCust = look?.company.customers[0]
  const companyLeads = (look?.company.leads || []).filter(l => !look?.byContact.some(c => c.id === l.id))
  const uname = (id: string | null) => users.find(u => u.id === id)?.name || '미배정'
  const source = !f.group || f.group === '모름' ? null : f.sub === '기타' && (f.etcName || f.etcLink) ? `${f.group} › 기타: ${f.etcName.trim()}${f.etcLink.trim() ? ` | ${f.etcLink.trim()}` : ''}` : `${f.group} › ${f.sub || '기타'}`

  // 같은 문의 → 새로 만들지 않고 그 리드로 (담당이 없으면 나로)
  // 이전 기록(2023~2025.1)은 이어받지 않고 보기만 — 새 문의는 새 리드로 (10/22)
  const isOld = (l: Lead) => String((l as { notes?: string | null }).notes || '').startsWith('[이전 기록]')
  const takeover = async (l: Lead) => {
    if (!l.assigned_to && user && !isOld(l)) {
      const r = await postUpdate({ action: 'change_assigned', lead_id: l.id, user_id: user.id, old_name: '미배정', new_name: user.name || '나', changed_by: user.id })
      if (r.error) { toast.error(r.error); return }
      toast.success('이어받았습니다 — 담당 = 나')
    }
    onOpenLead(l.id)
  }

  const submit = async (again: boolean) => {
    if (!f.company.trim()) { toast.error('회사명을 입력하세요'); return }
    setBusy(true)
    // 10/22: ID 를 직접 넣었으면 유입일·시각은 그 ID 를 따른다
    const ci = f.code.trim() ? codeToInquiry(f.code.trim()) : null
    const at = ci ? `${ci.date}T${String(ci.hour ?? 0).padStart(2, '0')}:${f.code.trim().slice(8, 10)}` : (f.at || kstNow())
    const body: Record<string, unknown> = {
      customer_code: code, company_name: f.company.trim(),
      inquiry_date: at.slice(0, 10), inquiry_hour: Number(at.slice(11, 13)),
      contact_person: f.person.trim() || null, contact_position: f.position.trim() || null,
      contact_phone: f.phone.trim() || null, contact_email: f.email.trim() || null,
      site_category: f.siteCategory || null, industry: f.industry || null,
      site_name: f.where === '현장' ? f.site.trim() || null : null, site_region: f.where === '현장' ? f.region.trim() || null : null,
      contact_team: f.where === '본사' ? f.team.trim() || null : null,
      inquiry_channel: METHODS.find(m => m[0] === f.method)?.[1] || null, inquiry_source: source,
      interest_service: f.service || null, inquiry_content: f.content.trim() || null,
      assigned_to: assignee || null, next_action: f.next.trim() || null, next_action_date: f.nextDate || null,
      priority: f.priority || '중간', core_need: f.coreNeed.trim() || null, notes: f.notes.trim() || null, stage: '신규리드',
    }
    if (mode === 'new-same' && sameCust) body.customer_id = sameCust.id
    if (mode === 'other') body.new_customer = true
    try {
      const res = await fetch('/api/pipeline/create', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const j = await res.json()
      if (!res.ok) throw new Error(j.error)
      toast.success(`등록했습니다 · ID ${code}`)
      if (again) { setF({ ...EMPTY(), method: f.method }); setLook(null); setMode('') } else onCreated(j.data.id)
    } catch (e) { toast.error(`등록하지 못했습니다. ${(e as Error).message}`) }
    setBusy(false)
  }

  const inp = cn(dsInput, 'h-8 text-[13px]')
  const LeadLine = ({ l, hit }: { l: Lead; hit?: boolean }) => (
    <div className={cn('flex items-center gap-2 px-2 py-1.5 rounded text-[12px]', hit && 'bg-[color-mix(in_srgb,var(--ds-warn)_18%,var(--ds-bg))]')}>
      <span className="truncate flex-1 min-w-0"><b className="font-medium">{where(l)}</b><span className="text-ds-fg3"> · {l.contact_person || '문의자 없음'} · ID {l.customer_code || '—'}</span></span>
      <StatusChip tone={stageTone(l.stage)}>{l.stage}</StatusChip>
      <span className="text-ds-fg3 tabular-nums w-10 text-right">{md(l.inquiry_date || l.created_at)}</span>
    </div>
  )

  return (
    <Drawer open={open} onClose={onClose} title="새 리드" meta={<span className="tabular-nums">ID {code} · 유입 일시에서 자동</span>}
      footer={<>
        <DsButton size="sm" variant="ghost" onClick={onClose}>취소</DsButton>
        <span className="flex-1" />
        <DsButton size="sm" loading={busy} onClick={() => submit(true)}>등록하고 하나 더</DsButton>
        <DsButton size="sm" variant="primary" loading={busy} onClick={() => submit(false)}>등록</DsButton>
      </>}>
      <div className="px-4 pt-3 pb-5 text-[12.5px]">
        <div className="grid grid-cols-2 gap-2">
          <F label="유입 일시"><input type="datetime-local" className={inp} value={f.at} onChange={e => set({ at: e.target.value })} /></F>
          <F label="연락처"><input className={inp} value={f.phone} onChange={e => set({ phone: formatPhone(e.target.value) })} inputMode="tel" placeholder="010-0000-0000" /></F>
        </div>

        {/* ① 같은 연락처·이메일 — 같은 사람 재문의 */}
        {look && look.byContact.length > 0 && (
          <div className="mt-2 rounded-md border border-[color-mix(in_srgb,var(--ds-accent)_40%,var(--ds-line))] bg-ds-accent-soft px-2.5 py-2">
            <div className="text-[12px] font-medium text-ds-fg mb-1">같은 연락처·이메일의 리드가 있습니다</div>
            {look.byContact.map(l => (
              <div key={l.id} className="flex items-center gap-2">
                <div className="flex-1 min-w-0"><LeadLine l={l} /></div>
                <DsButton size="sm" variant={l.assigned_to || isOld(l) ? 'secondary' : 'primary'} onClick={() => takeover(l)}>{isOld(l) ? '이전 기록 보기' : l.assigned_to ? `열기 (${uname(l.assigned_to)})` : '이어받기'}</DsButton>
              </div>
            ))}
            <div className="text-[12px] text-ds-fg3 mt-1">같은 문의면 새로 만들지 말고 이어받아 통화를 기록하세요. 다른 문의거나 이전 기록(2023~2025.1)이면 아래를 계속 채웁니다.</div>
          </div>
        )}

        <Sec>회사</Sec>
        <F label="회사명" req><input className={inp} value={f.company} onChange={e => set({ company: e.target.value })} placeholder="예: 카스웍스" /></F>

        {/* ② 같은 회사 — 현장·본사 팀마다 따로 문의가 옴 */}
        {(sameCust || companyLeads.length > 0) && (
          <div className="mt-2 rounded-md border border-[color-mix(in_srgb,var(--ds-warn)_45%,var(--ds-line))] bg-[color-mix(in_srgb,var(--ds-warn)_7%,var(--ds-bg))] px-2.5 py-2">
            <div className="text-[12px] mb-1"><b className="font-medium">{sameCust?.company_name || companyLeads[0]?.company_name}</b><span className="text-ds-fg3"> · {sameCust ? '고객' : '고객 아님'} · 리드 {companyLeads.length}</span></div>
            {companyLeads.slice(0, 5).map(l => <button key={l.id} type="button" className="block w-full text-left hover:bg-ds-subtle rounded" onClick={() => takeover(l)} title="같은 문의면 이 리드로"><LeadLine l={l} /></button>)}
            <div className="grid gap-1 mt-1.5">
              <span className="text-[12px] text-ds-fg3">같은 문의면 위 줄을 누르세요 (그 리드로 이동). 아니면:</span>
              {[['new-same', '같은 회사 · 다른 현장이나 본사 다른 팀 → 새 리드 (같은 고객에 연결)'], ['other', '이름만 비슷한 다른 회사']].map(([v, l]) => (
                <button key={v} type="button" onClick={() => setMode(v as typeof mode)}
                  className={cn('text-left px-2.5 py-1.5 rounded-md border text-[12px] bg-ds-bg', mode === v ? 'border-ds-accent text-ds-accent font-medium' : 'border-ds-line text-ds-fg2 hover:text-ds-fg')}>{l}</button>
              ))}
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-2 mt-2">
          <F label="발주"><Chips items={['공공', '민간']} value={f.siteCategory} onChange={v => set({ siteCategory: v })} /></F>
          <F label="사업분류"><DsSelect className="h-8 w-full" value={f.industry} onChange={e => set({ industry: e.target.value })}><option value="">선택</option>{INDUSTRY_OPTIONS.map(o => <option key={o}>{o}</option>)}</DsSelect></F>
        </div>

        <Sec note="첫 통화에서 모르면 비움 — 상세에서 채움">어디서 문의했나</Sec>
        <Chips items={['현장', '본사']} value={f.where} onChange={v => set({ where: v as typeof f.where })} />
        {f.where === '현장' && <div className="grid grid-cols-2 gap-2 mt-2"><F label="현장명"><input className={inp} value={f.site} onChange={e => set({ site: e.target.value })} placeholder="예: 평택 데이터센터 신축" /></F><F label="지역"><input className={inp} value={f.region} onChange={e => set({ region: e.target.value })} placeholder="예: 경기 평택" /></F></div>}
        {f.where === '본사' && <div className="mt-2"><F label="팀"><input className={inp} value={f.team} onChange={e => set({ team: e.target.value })} placeholder="예: 안전팀 · 품질팀 · 공무팀" /></F></div>}

        <Sec>문의자</Sec>
        <div className="grid grid-cols-2 gap-2">
          <F label="이름"><input className={inp} value={f.person} onChange={e => set({ person: e.target.value })} /></F>
          <F label="직급"><input className={inp} value={f.position} onChange={e => set({ position: e.target.value })} placeholder="팀장, 과장 등" /></F>
          <F label="이메일" className="col-span-2"><input className={inp} value={f.email} onChange={e => set({ email: e.target.value })} placeholder="name@company.com" /></F>
        </div>

        <Sec note={'"대표전화 / 검색채널"처럼 섞여 있던 두 가지를 따로'}>유입</Sec>
        <div className="text-[12px] text-ds-fg2 mb-1">어떻게 연락했나 (문의 수단)</div>
        <Chips items={METHODS.map(m => m[0])} value={f.method} onChange={v => set({ method: v })} />
        <div className="text-[12px] text-ds-fg2 mt-2.5 mb-1">어떻게 알게 됐나 (유입 경로) <span className="text-ds-fg3">— 물어보고 고름, 모르면 "모름"</span></div>
        <Chips items={[...INFLOW_GROUPS.map(g => g.key), '모름']} value={f.group} onChange={v => set({ group: v, sub: '' })} />
        {groupSubs && <Chips sub items={[...groupSubs]} value={f.sub} onChange={v => set({ sub: v })} />}
        {f.sub === '기타' && <div className="grid grid-cols-2 gap-2 mt-2"><F label="어디서"><input className={inp} value={f.etcName} onChange={e => set({ etcName: e.target.value })} placeholder="예: 건설 현장 카페 글" /></F><F label="링크"><input className={inp} value={f.etcLink} onChange={e => set({ etcLink: e.target.value })} placeholder="https://…" /></F></div>}
        {(f.method || source) && <div className="text-[12px] text-ds-fg2 mt-1.5">→ 유입 분류 <b className="font-medium">{source ? source.split(':')[0] : (f.method ? '문의 수단으로 분류' : '—')}</b>{f.method && <> · 문의 수단 {f.method}</>}</div>}
        <div className="grid grid-cols-2 gap-2 mt-2">
          <F label="관심 서비스"><DsSelect className="h-8 w-full" value={f.service} onChange={e => set({ service: e.target.value })}><option value="">선택</option>{SERVICES.map(s => <option key={s}>{s}</option>)}</DsSelect></F>
        </div>

        <Sec>문의 내용</Sec>
        <textarea rows={3} className="w-full px-2.5 py-1.5 rounded-md border border-ds-line text-[13px] focus:outline-none focus:ring-2 focus:ring-ds-accent" value={f.content} onChange={e => set({ content: e.target.value })} placeholder="통화 내용·요청 사항" />

        <Sec>진행</Sec>
        <div className="grid grid-cols-2 gap-2">
          <F label="담당"><DsSelect className="h-8 w-full" value={assignee} onChange={e => setAssignee(e.target.value)}><option value="">미배정</option>{users.map(u => <option key={u.id} value={u.id}>{u.name}{u.id === user?.id ? ' (나)' : ''}</option>)}</DsSelect></F>
          <F label="다음 액션 날짜"><input type="date" className={inp} value={f.nextDate} onChange={e => set({ nextDate: e.target.value })} /></F>
          <F label="다음 액션" className="col-span-2"><input className={inp} value={f.next} onChange={e => set({ next: e.target.value })} placeholder="예: 견적서 발송" /></F>
        </div>

        <button type="button" onClick={() => setMore(v => !v)} className="mt-3 text-[12px] text-ds-accent">{more ? '− 접기' : '+ 더 입력 — ID · 우선순위 · 핵심 니즈 · 메모'}</button>
        {more && (
          <div className="grid grid-cols-2 gap-2 mt-2">
            <F label="ID (비우면 유입 일시)"><input className={cn(inp, 'tabular-nums')} value={f.code} onChange={e => set({ code: e.target.value })} placeholder={codeOf(f.at)} /></F>
            <F label="우선순위"><DsSelect className="h-8 w-full" value={f.priority} onChange={e => set({ priority: e.target.value })}>{PRIO.map(p => <option key={p}>{p}</option>)}</DsSelect></F>
            <F label="핵심 니즈" className="col-span-2"><input className={inp} value={f.coreNeed} onChange={e => set({ coreNeed: e.target.value })} /></F>
            <F label="메모" className="col-span-2"><textarea rows={2} className="w-full px-2.5 py-1.5 rounded-md border border-ds-line text-[13px] focus:outline-none focus:ring-2 focus:ring-ds-accent" value={f.notes} onChange={e => set({ notes: e.target.value })} /></F>
          </div>
        )}
      </div>
    </Drawer>
  )
}
