'use client'

// 디자인 정의 v1 공용 부품 (docs/DESIGN_RULES.md, docs/design/디자인정의_v1.html)
// PageHeader · Toolbar/Tabs · Field/DsSelect · StatusChip/Avatar/Tag · Drawer · DsButton · Empty · Skeleton
// 표는 globals.css 의 .ds-table 클래스로 (컴포넌트로 감싸면 코드만 는다)
import { useEffect, type ReactNode, type ButtonHTMLAttributes, type SelectHTMLAttributes } from 'react'
import { X, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

/* ─── PageHeader: 제목 18/600 · 부제 12 (한 줄 KPI) · 오른쪽 동작 ─── */
export function PageHeader({ title, subtitle, kpis, actions }: { title: string; subtitle?: ReactNode; kpis?: { label: string; value: ReactNode }[]; actions?: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 flex-wrap mb-3">
      <div className="min-w-0">
        <h1 className="text-[18px] font-semibold leading-tight text-ds-fg">{title}</h1>
        {(subtitle || kpis) && (
          <div className="text-[12px] text-ds-fg2 mt-1 flex flex-wrap gap-x-2">
            {kpis?.map((k, i) => <span key={k.label}>{i > 0 && <span className="text-ds-fg3 mr-2">·</span>}{k.label} <b className="font-medium text-ds-fg tabular-nums">{k.value}</b></span>)}
            {subtitle && <span className={kpis ? 'basis-full' : ''}>{subtitle}</span>}
          </div>
        )}
      </div>
      {actions && <div className="flex items-center gap-2 flex-wrap">{actions}</div>}
    </div>
  )
}

/* ─── Toolbar: 탭 │ 검색 │ 필터, 한 줄. 아래 1px 선 ─── */
export function Toolbar({ children, right }: { children?: ReactNode; right?: ReactNode }) {
  return (
    <div className="flex items-center gap-2 flex-wrap py-2 mb-3 border-b border-ds-line">
      <div className="flex items-center gap-2 flex-wrap">{children}</div>
      {right && <div className="ml-auto flex items-center gap-2 flex-wrap">{right}</div>}
    </div>
  )
}

export function Tabs<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: { value: T; label: string; count?: number }[] }) {
  return (
    <div className="inline-flex border border-ds-line rounded-md p-0.5 gap-0.5">
      {options.map(o => (
        <button key={o.value} type="button" onClick={() => onChange(o.value)}
          className={cn('px-2.5 py-1 rounded text-[12.5px] whitespace-nowrap transition-colors', value === o.value ? 'bg-ds-fg text-ds-bg font-medium' : 'text-ds-fg2 hover:text-ds-fg')}>
          {o.label}{o.count != null && <span className={cn('ml-1 tabular-nums', value === o.value ? 'opacity-70' : 'text-ds-fg3')}>{o.count}</span>}
        </button>
      ))}
    </div>
  )
}

/* ─── 입력: 높이 32 · 라벨 위 12px ─── */
export function Field({ label, required, error, children, className }: { label?: string; required?: boolean; error?: string; children: ReactNode; className?: string }) {
  return (
    <label className={cn('grid gap-1 min-w-0', className)}>
      {label && <span className="text-[12px] text-ds-fg2">{label}{required && <span className="text-ds-bad ml-0.5">*</span>}</span>}
      {children}
      {error && <span className="text-[12px] text-ds-bad">{error}</span>}
    </label>
  )
}
export const dsInput = 'h-8 px-2.5 rounded-md border border-ds-line bg-ds-bg text-[13px] text-ds-fg placeholder:text-ds-fg3 focus:outline-none focus:ring-2 focus:ring-ds-accent focus:border-transparent w-full'
export function DsSelect({ className, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={cn(dsInput, 'w-auto pr-7 appearance-none bg-no-repeat bg-[right_8px_center] bg-[length:12px] bg-[url("data:image/svg+xml;charset=utf-8,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 viewBox=%270 0 24 24%27 fill=%27none%27 stroke=%27%239b9ea6%27 stroke-width=%272%27%3E%3Cpath d=%27m6 9 6 6 6-6%27/%3E%3C/svg%3E")]', className)} {...rest}>{children}</select>
}
export function Check({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return <label className="inline-flex items-center gap-1.5 text-[12.5px] text-ds-fg2 cursor-pointer select-none"><input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} className="w-3.5 h-3.5 accent-[var(--ds-accent)]" />{label}</label>
}

/* ─── 상태 칩 · 아바타 · 태그 ─── */
export type Tone = 'ok' | 'info' | 'warn' | 'bad' | 'na'
const toneBg: Record<Tone, string> = { ok: 'bg-ds-ok', info: 'bg-ds-info', warn: 'bg-ds-warn', bad: 'bg-ds-bad', na: 'bg-ds-na' }
export const toneVar: Record<Tone, string> = { ok: 'var(--ds-ok)', info: 'var(--ds-info)', warn: 'var(--ds-warn)', bad: 'var(--ds-bad)', na: 'var(--ds-na)' }
// 파이프라인 단계 → 색 (디자인 정의 §1)
export const stageTone = (stage: string | null | undefined): Tone =>
  // 10/21: 신규리드 빨강(눈에 띄게) · 이탈 회색(묻히게)
  stage === '도입완료' ? 'ok' : stage === '신규리드' ? 'bad' : stage === '예정' ? 'warn' : !stage || stage === '이탈' ? 'na' : 'info'
export function StatusChip({ tone, children, cell }: { tone: Tone; children: ReactNode; cell?: boolean }) {
  return cell
    ? <span className={cn('ds-cell-status', toneBg[tone])}>{children}</span>
    : <span className={cn('inline-block h-[22px] leading-[22px] px-2 rounded text-white text-[12px] font-medium', toneBg[tone])}>{children}</span>
}
export function Avatar({ name }: { name: string | null | undefined }) {
  const n = (name || '').trim()
  if (!n || n === '미배정') return <span className="text-ds-fg3">미배정</span>
  return <span className="inline-flex items-center gap-1.5"><span className="inline-grid place-items-center w-[22px] h-[22px] rounded-full bg-ds-line text-ds-fg2 text-[11px] font-semibold">{n[0]}</span>{n}</span>
}
export function Tag({ children }: { children: ReactNode }) { return <span className="text-ds-accent text-[12px] mr-1.5">#{children}</span> }

/* ─── 버튼 4종 × 2크기 ─── */
type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'ghost' | 'danger'; size?: 'md' | 'sm'; loading?: boolean; icon?: ReactNode }
export function DsButton({ variant = 'secondary', size = 'md', loading, icon, className, children, disabled, ...rest }: BtnProps) {
  const base = 'inline-flex items-center justify-center gap-1.5 rounded-md border text-[13px] font-medium whitespace-nowrap transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ds-accent disabled:opacity-50 disabled:cursor-default'
  const v = {
    primary: 'bg-ds-accent border-ds-accent text-white hover:bg-ds-accent-hover',
    secondary: 'bg-ds-bg border-ds-line text-ds-fg hover:bg-ds-subtle',
    ghost: 'bg-transparent border-transparent text-ds-fg2 hover:bg-ds-subtle hover:text-ds-fg',
    danger: 'bg-ds-bg border-[color-mix(in_srgb,var(--ds-bad)_40%,transparent)] text-ds-bad hover:bg-[color-mix(in_srgb,var(--ds-bad)_8%,var(--ds-bg))]',
  }[variant]
  const s = size === 'sm' ? 'h-7 px-2.5 text-[12.5px]' : 'h-8 px-3'
  return (
    <button className={cn(base, v, s, className)} disabled={disabled || loading} {...rest}>
      {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : icon}
      {children}
    </button>
  )
}

/* ─── Drawer: 오른쪽 400px · Esc·바깥 클릭 닫힘 ─── */
export function Drawer({ open, onClose, title, meta, footer, children, width = 400 }: { open: boolean; onClose: () => void; title: ReactNode; meta?: ReactNode; footer?: ReactNode; children: ReactNode; width?: number | string }) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50" onClick={onClose}>
      <div className="absolute inset-0 bg-black/10" />
      <aside onClick={e => e.stopPropagation()} style={{ width, minWidth: typeof width === 'string' ? 720 : undefined }} className="absolute right-0 top-0 h-full max-w-full bg-ds-bg border-l border-ds-line shadow-[0_8px_24px_rgba(0,0,0,.08)] flex flex-col">
        <div className="px-4 py-3.5 border-b border-ds-line flex items-start justify-between gap-2">
          <div className="min-w-0"><div className="text-[15px] font-semibold text-ds-fg truncate">{title}</div>{meta && <div className="text-[12px] text-ds-fg2 mt-0.5">{meta}</div>}</div>
          <button onClick={onClose} className="w-7 h-7 inline-grid place-items-center rounded-md text-ds-fg2 hover:bg-ds-subtle" title="닫기"><X className="w-4 h-4" /></button>
        </div>
        <div className="flex-1 overflow-auto">{children}</div>
        {footer && <div className="px-4 py-3 border-t border-ds-line flex items-center justify-end gap-2">{footer}</div>}
      </aside>
    </div>
  )
}
export function DrawerSection({ title, children }: { title?: string; children: ReactNode }) {
  return <div className="px-4 py-3 border-b border-ds-line2 text-[12.5px]">{title && <div className="text-[11px] text-ds-fg3 mb-1.5">{title}</div>}{children}</div>
}

/* ─── 빈 상태 · 스켈레톤 ─── */
export function Empty({ text, action }: { text: string; action?: ReactNode }) {
  return <div className="py-10 text-center text-[13px] text-ds-fg2 flex items-center justify-center gap-3 flex-wrap">{text}{action}</div>
}
export function Skeleton({ rows = 6 }: { rows?: number }) {
  return <div className="grid gap-2 py-2">{Array.from({ length: rows }, (_, i) => <div key={i} className="h-3 rounded bg-ds-line2 animate-pulse" style={{ width: `${70 + ((i * 37) % 30)}%` }} />)}</div>
}
/* 섹션 제목 14/500 */
export function SectionTitle({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return <div className="flex items-center justify-between gap-2 mt-6 mb-2"><h2 className="text-[14px] font-medium text-ds-fg">{children}</h2>{right}</div>
}
