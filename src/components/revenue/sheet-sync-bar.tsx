'use client'

// 매출 현황 › 시트 동기화 (2026-10-22) — 매일 08시 자동 + [지금 동기화]
// 버튼 → 드로어에서 미리보기(바뀔 내용) → [반영]. "확인 필요"로 멈춘 단계는 내용을 보고 [그래도 반영]
import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { RefreshCw } from 'lucide-react'
import { DsButton, Drawer, DrawerSection, StatusChip } from '@/components/ds'

type Step = { name: string; ok: boolean; held?: string; error?: string; summary: Record<string, number | string | number[]>; samples?: string[] }
type Run = { id: string; created_at: string; trigger: string; applied: boolean; ok: boolean; held: boolean; summary: Step[] }
type Res = { ok: boolean; held: boolean; applied: boolean; steps: Step[]; ms: number }

const kst = (s: string) => new Date(new Date(s).getTime() + 9 * 3600e3).toISOString().slice(5, 16).replace('-', '.').replace('T', ' ')
// 단계별로 사람이 읽는 한 줄
function line(s: Step) {
  const x = s.summary
  if (s.name === '매출') return `바뀜 ${x.changed ?? 0} · 지움 ${x.deleted ?? 0} · 새 줄 ${x.newProjects ?? 0} · 합계 차이 ${Number(x.diff ?? 0).toLocaleString()}`
  if (s.name === '청구·미납') return `새 청구 ${x.insert ?? 0} · 바뀜 ${x.update ?? 0} (상태 ${x.statusChanged ?? 0})`
  if (s.name === '고객 LIST') return `바뀜 ${x.update ?? 0} · 새 고객 ${x.create ?? 0}`
  return ''
}
const changes = (steps: Step[]) => steps.reduce((a, s) => a + Number(s.summary.changed ?? 0) + Number(s.summary.deleted ?? 0) + Number(s.summary.update ?? 0) + Number(s.summary.insert ?? 0) + Number(s.summary.create ?? 0), 0)

export function SheetSyncBar({ onApplied }: { onApplied: () => void }) {
  const [last, setLast] = useState<Run | null>(null)
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState<'' | 'preview' | 'apply'>('')
  const [prev, setPrev] = useState<Res | null>(null)

  const loadRuns = useCallback(async () => {
    const r = await fetch('/api/sync/sheets').then(r => r.json()).catch(() => null)
    setLast(r?.runs?.find((x: Run) => x.applied) || null)
  }, [])
  useEffect(() => { loadRuns() }, [loadRuns])

  const run = async (apply: boolean, force = false) => {
    setBusy(apply ? 'apply' : 'preview')
    try {
      const r: Res = await fetch('/api/sync/sheets', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ apply, force }) }).then(r => r.json())
      if (!r.steps) throw new Error('동기화 응답 없음')
      setPrev(r)
      if (apply) {
        const bad = r.steps.filter(s => s.error || (s.held && !force))
        if (bad.length) toast.error(`멈춘 단계: ${bad.map(s => s.name).join(', ')}`)
        else { toast.success('시트 내용을 반영했습니다'); setOpen(false); onApplied() }
        loadRuns()
      }
    } catch (e) { toast.error((e as Error).message) }
    setBusy('')
  }

  const lastHeld = last?.summary?.some(s => s.held || s.error)
  return (
    <>
      <span className="text-[12px] text-ds-fg3 whitespace-nowrap" title="매일 08시에 구글 시트 [경영관리] 2026년 매출 현황 → 고객 · 매출 · 청구·미납">
        시트 동기화 {last ? <>· {kst(last.created_at)} {last.trigger === 'cron' ? '자동' : '수동'} · {lastHeld ? <b className="text-ds-warn font-medium">확인 필요</b> : `${changes(last.summary)}건 반영`}</> : '· 기록 없음'}
      </span>
      <DsButton size="sm" icon={<RefreshCw className="w-3.5 h-3.5" />} onClick={() => { setOpen(true); setPrev(null); run(false) }}>지금 동기화</DsButton>
      <Drawer open={open} onClose={() => setOpen(false)} title="시트 동기화" meta="구글 시트 → 고객 LIST · 매출 · 청구·미납 (시트가 원본, CRM 에서 고친 매출은 덮어써짐)"
        footer={<div className="flex items-center gap-2 w-full">
          <span className="text-[12px] text-ds-fg3">{prev ? `미리보기 ${(prev.ms / 1000).toFixed(1)}초` : ''}</span><span className="flex-1" />
          <DsButton size="sm" variant="ghost" onClick={() => setOpen(false)}>닫기</DsButton>
          {prev?.held && <DsButton size="sm" loading={busy === 'apply'} disabled={!!busy} onClick={() => run(true, true)}>그래도 반영</DsButton>}
          <DsButton size="sm" variant="primary" loading={busy === 'apply'} disabled={!!busy || !prev || prev.held || changes(prev.steps) === 0} onClick={() => run(true)}>{prev && changes(prev.steps) === 0 ? '바뀐 것 없음' : '반영'}</DsButton>
        </div>}>
        {busy === 'preview' && <DrawerSection><span className="text-ds-fg3">시트를 받아 비교하는 중… (15초 정도)</span></DrawerSection>}
        {prev?.steps.map(s => (
          <DrawerSection key={s.name} title={s.name}>
            <div className="flex items-center gap-2 mb-1">
              {s.error ? <StatusChip tone="bad">오류</StatusChip> : s.held ? <StatusChip tone="warn">확인 필요</StatusChip> : <StatusChip tone="ok">정상</StatusChip>}
              <span className="text-ds-fg">{s.error || s.held || line(s)}</span>
            </div>
            {!!s.samples?.length && <ul className="mt-1 grid gap-0.5 text-[12px] text-ds-fg2">{s.samples.slice(0, 10).map((x, i) => <li key={i} className="truncate" title={x}>{x}</li>)}</ul>}
          </DrawerSection>
        ))}
      </Drawer>
    </>
  )
}
