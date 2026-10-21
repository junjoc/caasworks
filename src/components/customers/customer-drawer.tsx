'use client'

// 고객 드로어 (480) — 고객 목록에서 한 곳 열기 (2026-10-21, 화면 문법 v2 "드로어 = 상세 축소판")
// 속성 칩(상태·영업 담당·업종) → 매출·미납 → 올해 월별 매출 → 미납 청구 → 연결 리드 → 정보 카드(코드 바로 수정)
// 전체 편집·과금·현장은 "고객 상세".
import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Drawer, DsButton, StatusChip, Skeleton, stageTone, dsInput, type Tone } from '@/components/ds'
import { PropPills, Card, Rows, type Prop } from '@/components/ds/detail'
import { fetchJson, getCached, setCached } from '@/lib/swr-cache'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

export const CUST_STATUS: Record<string, { label: string; tone: Tone }> = {
  active: { label: '활성', tone: 'ok' }, suspended: { label: '일시중지', tone: 'warn' }, churned: { label: '이탈', tone: 'na' },
}
const won = (n: number) => n.toLocaleString()
type Brief = { customer: Record<string, any>; year: number; months: number[]; unpaid: { id: string; year: number; month: number; total: number; due_date: string | null }[]; invoiceN: number; leads: { id: string; company_name: string; stage: string; inquiry_date: string | null; created_at: string }[] }

export function CustomerDrawer({ id, users, types, onClose, onChanged }: { id: string | null; users: { id: string; name: string }[]; types: string[]; onClose: () => void; onChanged: () => void }) {
  const supabase = createClient()
  const [d, setD] = useState<Brief | null>(null)
  const [code, setCode] = useState<string | null>(null)

  const load = useCallback(async (fresh = false) => {
    if (!id) return
    try {
      const j = await fetchJson<Brief>(fresh ? `cust:${id}:${Date.now()}` : `cust:${id}`, `/api/customers/${id}/brief`)
      setCached(`cust:${id}`, j); setD(j)
    } catch (e) { toast.error(`고객을 불러오지 못했습니다. ${(e as Error).message}`) }
  }, [id])
  useEffect(() => { setD(id ? getCached<Brief>(`cust:${id}`) || null : null); setCode(null); load() }, [id, load])

  const update = async (u: Record<string, unknown>, msg = '저장했습니다') => {
    if (!id) return
    const { error } = await supabase.from('customers').update(u).eq('id', id)
    if (error) { toast.error(`저장하지 못했습니다. ${error.message}`); return }
    toast.success(msg); await load(true); onChanged()
  }
  const del = async () => {
    if (!id || !d) return
    if (!window.confirm(`"${d.customer.company_name}" 고객을 삭제할까요?\n연결된 매출·청구가 있으면 삭제되지 않습니다.`)) return
    const { error } = await supabase.from('customers').delete().eq('id', id)
    if (error) { toast.error('삭제하지 못했습니다. 연결된 데이터가 있을 수 있습니다.'); return }
    toast.success('삭제했습니다'); onChanged(); onClose()
  }

  const c = d?.customer
  let body = <div className="p-4"><Skeleton rows={8} /></div>
  if (d && c) {
    const st = CUST_STATUS[c.status || 'active'] || CUST_STATUS.active
    const owner = users.find(u => u.id === c.assigned_to)?.name || '미배정'
    const ry = d.months.reduce((a, b) => a + b, 0)
    const curM = Number(new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(5, 7))
    const unpSum = d.unpaid.reduce((s, i) => s + Number(i.total), 0)
    const mx = Math.max(1, ...d.months)
    const pills: Prop[] = [
      { label: '상태', value: st.label, select: { value: c.status || 'active', options: Object.entries(CUST_STATUS).map(([v, s]) => ({ value: v, label: s.label })), onChange: v => update({ status: v }, '상태를 바꿨습니다') } },
      { label: '영업', value: owner, select: { value: c.assigned_to || '', options: users.map(u => ({ value: u.id, label: u.name })), empty: '미배정', onChange: v => update({ assigned_to: v || null }, '영업 담당을 바꿨습니다') } },
      { label: '업종', value: c.company_type || '—', select: { value: c.company_type || '', options: types.filter(t => t !== '—'), empty: '—', onChange: v => update({ company_type: v || null }) } },
    ]
    body = (
      <div className="px-4 py-3 grid gap-3 text-[12.5px]">
        <PropPills items={pills} />
        <div className="grid grid-cols-3 border border-ds-line rounded-lg">
          {[[`${curM}월 매출`, won(d.months[curM - 1]), ''], [`${d.year}년 매출`, won(ry), ''], ['미납', unpSum ? won(unpSum) : '없음', unpSum ? 'text-ds-due' : '']].map(([k, v, cls], i) => (
            <div key={k} className={cn('px-3 py-2 min-w-0', i > 0 && 'border-l border-ds-line2')}><div className="text-[12px] text-ds-fg3">{k}</div><div className={cn('text-[14px] font-semibold tabular-nums truncate', cls || 'text-ds-fg')}>{v}</div></div>
          ))}
        </div>
        <Card title={`${d.year}년 월별 매출`}>
          <div className="flex items-end gap-1 h-16">
            {d.months.map((v, i) => (
              <div key={i} className="flex-1 flex flex-col items-center gap-0.5" title={`${i + 1}월 ${won(v)}`}>
                <div className="w-full rounded-sm" style={{ height: `${Math.max(v ? 3 : 1, (v / mx) * 48)}px`, background: i + 1 === curM ? 'var(--ds-accent)' : i + 1 > curM ? 'var(--ds-line2)' : 'color-mix(in srgb, var(--ds-accent) 35%, var(--ds-bg))' }} />
                <span className="text-[12px] text-ds-fg3 leading-none">{i + 1}</span>
              </div>
            ))}
          </div>
        </Card>
        {d.unpaid.length > 0 && (
          <Card title={`미납 청구 ${d.unpaid.length}건`}>
            <div className="grid gap-1">
              {d.unpaid.slice(0, 6).map(i => (
                <div key={i.id} className="flex items-center gap-2"><span className="text-ds-fg2 tabular-nums w-16">{i.year}.{String(i.month).padStart(2, '0')}</span><span className="flex-1 text-right tabular-nums text-ds-due font-medium">{won(Number(i.total))}</span><span className="text-ds-fg3 w-24 text-right">{i.due_date ? `납기 ${i.due_date.slice(5).replace('-', '.')}` : ''}</span></div>
              ))}
              {d.unpaid.length > 6 && <Link href="/finance/unpaid" className="text-[12px] text-ds-accent">미납 현황에서 전체 →</Link>}
            </div>
          </Card>
        )}
        <Card title={`리드 ${d.leads.length}건`}>
          {d.leads.length === 0 ? <span className="text-ds-fg3">연결된 리드가 없습니다.</span> : (
            <div className="grid gap-1">
              {d.leads.slice(0, 5).map(l => (
                <Link key={l.id} href={`/pipeline/${l.id}`} className="flex items-center gap-2 hover:bg-ds-subtle rounded px-1 -mx-1 py-0.5">
                  <StatusChip tone={stageTone(l.stage)}>{l.stage}</StatusChip><span className="flex-1 truncate">{l.company_name}</span><span className="text-ds-fg3 tabular-nums">{(l.inquiry_date || l.created_at).slice(0, 10)}</span>
                </Link>
              ))}
            </div>
          )}
        </Card>
        <Card title="정보" action={<Link href={`/customers/${c.id}`} className="text-[12px] text-ds-fg3 hover:text-ds-fg">전체 수정 →</Link>}>
          <Rows rows={[
            { label: '코드', value: code != null
              ? <span className="flex gap-1"><input autoFocus className={cn(dsInput, 'h-7 text-[12.5px]')} value={code} onChange={e => setCode(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { update({ customer_code: code.trim() || null }, '코드를 바꿨습니다'); setCode(null) } if (e.key === 'Escape') setCode(null) }} /><DsButton size="sm" variant="primary" onClick={() => { update({ customer_code: code.trim() || null }, '코드를 바꿨습니다'); setCode(null) }}>저장</DsButton></span>
              : <button onClick={() => setCode(c.customer_code || '')} className="tabular-nums hover:underline decoration-dashed underline-offset-2">{c.customer_code || <span className="text-ds-fg3">+ 코드</span>}</button> },
            { label: '과금', value: [c.billing_type, c.billing_start && `${c.billing_start}${c.billing_end ? ` ~ ${c.billing_end}` : ' ~'}`].filter(Boolean).join(' · ') || null },
            { label: '담당자', value: c.contact_person },
            { label: '연락처', value: c.contact_phone ? <a href={`tel:${c.contact_phone}`} className="text-ds-accent hover:underline tabular-nums">{c.contact_phone}</a> : null },
            { label: '이메일', value: c.contact_email },
            { label: '사업자', value: c.business_reg_no },
            { label: '메모', value: c.notes ? <span className="whitespace-pre-wrap">{c.notes}</span> : null },
          ]} />
        </Card>
      </div>
    )
  }

  return (
    <Drawer open={!!id} onClose={onClose}
      title={c ? <span className="inline-flex items-center gap-2">{c.company_name}<StatusChip tone={(CUST_STATUS[c.status || 'active'] || CUST_STATUS.active).tone}>{(CUST_STATUS[c.status || 'active'] || CUST_STATUS.active).label}</StatusChip></span> : '불러오는 중'}
      meta={c ? [c.company_type, c.customer_code && `코드 ${c.customer_code}`, c.billing_start && `과금 ${c.billing_start.slice(0, 7).replace('-', '.')}부터`, d && `청구 ${d.invoiceN}건`].filter(Boolean).join(' · ') : null}
      footer={c && <>
        <DsButton size="sm" variant="ghost" onClick={del} className="text-ds-fg3 hover:text-ds-bad">삭제</DsButton>
        <span className="flex-1" />
        <Link href={`/customers/${c.id}`}><DsButton size="sm">고객 상세</DsButton></Link>
      </>}>
      {body}
    </Drawer>
  )
}
