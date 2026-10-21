'use client'

// 화면 문법 v2 — 상세·드로어 공용 부품 (2026-10-21, 디자인 정의 › ★ 화면 문법 v2 › 부품 10)
// StageBar(단계 줄) · PropertyBar/PropPill(속성 줄·칩) · Card(값 있는 칸만, 빈 칸은 한 줄) · Popover
// 리드 상세·드로어가 먼저 쓰고, 고객사·현장·견적서 상세도 같은 부품으로 옮긴다.
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { stageTone, toneVar } from './index'
import { ChevronDown } from 'lucide-react'

/* ─── 단계 줄 — full(상세: 칸 + 지금 단계 경과) / slim(드로어: 얇은 막대 + 글) ─── */
export function StageBar({ flow, stage, note, onPick, variant = 'full' }: { flow: string[]; stage: string; note?: string; onPick?: (s: string) => void; variant?: 'full' | 'slim' }) {
  const ci = flow.indexOf(stage)
  const fill = (i: number) => (ci < 0 ? '' : i < ci ? 'done' : i === ci ? 'cur' : '')
  const col = toneVar[stageTone(stage === '도입완료' ? '도입완료' : '컨텍')]
  if (variant === 'slim') return (
    <div className="flex items-center gap-[3px]">
      {flow.map((s, i) => (
        <button key={s} title={onPick ? `${s}(으)로` : s} onClick={() => onPick?.(s)} className="w-7 h-[5px] rounded-full"
          style={{ background: fill(i) === 'cur' ? col : fill(i) === 'done' ? `color-mix(in srgb, ${col} 40%, var(--ds-bg))` : 'var(--ds-line)' }} />
      ))}
      <span className="ml-2 text-[12px] text-ds-fg2">{ci < 0 ? stage : `${stage}`}{note ? ` · ${note}` : ''}</span>
    </div>
  )
  return (
    <div className="flex h-8">
      {flow.map((s, i) => {
        const f = fill(i)
        return (
          <button key={s} onClick={() => onPick?.(s)} title={onPick ? `${s}(으)로 바꾸기` : s}
            className={cn('flex-1 min-w-0 flex items-center justify-center gap-1.5 text-[12px] -ml-1.5 first:ml-0 transition-[filter] hover:brightness-95',
              f === 'cur' ? 'text-white font-semibold' : f === 'done' ? 'text-ds-fg' : 'text-ds-fg3')}
            style={{
              background: f === 'cur' ? col : f === 'done' ? `color-mix(in srgb, ${col} 20%, var(--ds-bg))` : 'var(--ds-subtle)',
              clipPath: i === 0 ? 'polygon(0 0,calc(100% - 10px) 0,100% 50%,calc(100% - 10px) 100%,0 100%)' : 'polygon(0 0,calc(100% - 10px) 0,100% 50%,calc(100% - 10px) 100%,0 100%,10px 50%)',
            }}>
            <span className="truncate">{s}</span>{f === 'cur' && note && <span className="text-[11px] font-normal opacity-90 whitespace-nowrap">{note}</span>}
          </button>
        )
      })}
    </div>
  )
}

/* ─── 떠 있는 작은 창 (속성 편집·더 보기 메뉴) — 바깥 클릭·Esc 닫힘 ─── */
export function Popover({ open, onClose, children, align = 'left', width = 280 }: { open: boolean; onClose: () => void; children: ReactNode; align?: 'left' | 'right'; width?: number }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const down = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) onClose() }
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    setTimeout(() => document.addEventListener('mousedown', down))
    window.addEventListener('keydown', key)
    return () => { document.removeEventListener('mousedown', down); window.removeEventListener('keydown', key) }
  }, [open, onClose])
  if (!open) return null
  return <div ref={ref} style={{ width }} className={cn('absolute z-40 top-full mt-1 bg-ds-bg border border-ds-line rounded-lg shadow-[0_8px_24px_rgba(0,0,0,.08)] p-2.5', align === 'right' ? 'right-0' : 'left-0')}>{children}</div>
}

/* 선택형 속성: 보이는 값 위에 투명한 select 를 겹쳐 누르면 바로 목록이 뜬다 */
type Opt = string | { value: string; label: string }
function OverlaySelect({ value, options, onChange, allowEmpty }: { value: string; options: Opt[]; onChange: (v: string) => void; allowEmpty?: string }) {
  return (
    <select value={value} onChange={e => onChange(e.target.value)} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" aria-label="선택">
      {allowEmpty != null && <option value="">{allowEmpty}</option>}
      {options.map(o => (typeof o === 'string' ? <option key={o}>{o}</option> : <option key={o.value} value={o.value}>{o.label}</option>))}
    </select>
  )
}

export type Prop = {
  label: string; value: ReactNode
  select?: { value: string; options: Opt[]; onChange: (v: string) => void; empty?: string }
  popover?: (close: () => void) => ReactNode  // 직접 그리는 편집 창 (다음 액션·고객사)
  tone?: 'bad' | 'warn'; sub?: ReactNode
}

/* ─── 속성 줄 (상세): 칸 5개 이하, 누르면 그 자리에서 바꿈 ─── */
export function PropertyBar({ items }: { items: Prop[] }) {
  return (
    <div className="grid border border-ds-line rounded-lg" style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}>
      {items.map((p, i) => <PropCell key={p.label} p={p} first={i === 0} last={i === items.length - 1} />)}
    </div>
  )
}
function PropCell({ p, first, last }: { p: Prop; first: boolean; last: boolean }) {
  const [open, setOpen] = useState(false)
  const editable = !!(p.select || p.popover)
  return (
    <div className={cn('relative px-3 py-2 min-w-0', !first && 'border-l border-ds-line2', editable && 'hover:bg-ds-subtle cursor-pointer', first && 'rounded-l-lg', last && 'rounded-r-lg')}
      onClick={() => p.popover && setOpen(true)}>
      <div className="text-[11.5px] text-ds-fg3">{p.label}</div>
      <div className={cn('text-[13px] font-medium flex items-center gap-1 min-w-0 mt-0.5', p.tone === 'bad' ? 'text-ds-bad' : 'text-ds-fg')}>
        <span className="truncate">{p.value}</span>{editable && <ChevronDown className="w-3 h-3 text-ds-fg3 flex-none" />}
      </div>
      {p.sub && <div className={cn('text-[11.5px] truncate', p.tone === 'warn' ? 'text-ds-warn' : p.tone === 'bad' ? 'text-ds-bad' : 'text-ds-fg3')}>{p.sub}</div>}
      {p.select && <OverlaySelect value={p.select.value} options={p.select.options} onChange={p.select.onChange} allowEmpty={p.select.empty} />}
      {p.popover && <Popover open={open} onClose={() => setOpen(false)} align={last ? 'right' : 'left'}>{p.popover(() => setOpen(false))}</Popover>}
    </div>
  )
}

/* ─── 속성 칩 (드로어): 같은 Prop 을 둥근 칩으로 ─── */
export function PropPills({ items }: { items: Prop[] }) {
  return <div className="flex flex-wrap gap-1.5">{items.map(p => <Pill key={p.label} p={p} />)}</div>
}
function Pill({ p }: { p: Prop }) {
  const [open, setOpen] = useState(false)
  const editable = !!(p.select || p.popover)
  return (
    <span className={cn('relative inline-flex items-center gap-1 h-[26px] px-2.5 rounded-full border border-ds-line text-[12px] max-w-full', editable && 'hover:bg-ds-subtle cursor-pointer')} onClick={() => p.popover && setOpen(true)}>
      <span className="text-ds-fg3">{p.label}</span>
      <span className={cn('truncate', p.tone === 'bad' ? 'text-ds-bad' : 'text-ds-fg')}>{p.value}</span>
      {p.sub && <span className={cn('whitespace-nowrap', p.tone === 'warn' ? 'text-ds-warn' : p.tone === 'bad' ? 'text-ds-bad' : 'text-ds-fg3')}>{p.sub}</span>}
      {editable && <ChevronDown className="w-3 h-3 text-ds-fg3 flex-none" />}
      {p.select && <OverlaySelect value={p.select.value} options={p.select.options} onChange={p.select.onChange} allowEmpty={p.select.empty} />}
      {p.popover && <Popover open={open} onClose={() => setOpen(false)}>{p.popover(() => setOpen(false))}</Popover>}
    </span>
  )
}

/* ─── 카드: 제목 13/600 + 오른쪽 동작, 값 있는 칸만. 빈 칸은 "빈 칸 n · 채우기" 한 줄 ─── */
export function Card({ title, action, children, className }: { title: ReactNode; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cn('border border-ds-line rounded-lg px-3 py-2.5 text-[12.5px] bg-ds-bg', className)}>
      <div className="flex items-center justify-between gap-2 mb-1.5"><h3 className="text-[13px] font-semibold text-ds-fg">{title}</h3>{action}</div>
      {children}
    </section>
  )
}
export type Row = { label: string; value: ReactNode | null | undefined }
export function Rows({ rows, onFill }: { rows: Row[]; onFill?: () => void }) {
  const has = rows.filter(r => r.value != null && r.value !== '')
  const empty = rows.length - has.length
  return (
    <>
      {has.length > 0 && <div className="grid grid-cols-[64px_1fr] gap-x-2.5 gap-y-1">{has.map(r => <RowItem key={r.label} r={r} />)}</div>}
      {empty > 0 && (
        <div className={cn('text-[11.5px] text-ds-fg3', has.length > 0 && 'mt-2 pt-1.5 border-t border-dashed border-ds-line')}>
          빈 칸 {empty} ({rows.filter(r => r.value == null || r.value === '').map(r => r.label).join(' · ')}){onFill && <> · <button onClick={onFill} className="text-ds-accent hover:underline">채우기</button></>}
        </div>
      )}
    </>
  )
}
function RowItem({ r }: { r: Row }) {
  return <><span className="text-ds-fg3">{r.label}</span><span className="text-ds-fg min-w-0 break-words">{r.value}</span></>
}
