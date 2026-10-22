// 매출 시트 → CRM 자동 동기화 (2026-10-22) — 매일 08시(cron daily-sync) + 매출 현황 [지금 동기화]
// 순서: 고객 LIST → 매출 → 청구·미납 (뒤 둘이 고객을 찾으므로 고객 먼저)
// 한 단계라도 "확인 필요"(평소보다 큰 변경·시트 구조 이상)면 그 단계는 반영하지 않고 멈춘다. 화면에서 보고 [그래도 반영](force)
// 실행마다 sync_runs 에 결과 · 바뀐 칸의 이전 값(되돌리기용)을 남긴다
import type { SupabaseClient } from '@supabase/supabase-js'
import { downloadWorkbook, type Step } from './common'
import { syncCustomers } from './customers'
import { syncRevenue } from './revenue'
import { syncInvoices } from './invoices'

export type SheetSyncResult = { ok: boolean; held: boolean; applied: boolean; steps: Step[]; ms: number; runId?: string }

export async function runSheetSync(sb: SupabaseClient, opts: { apply: boolean; force?: boolean; trigger: 'cron' | 'button' | 'preview' }): Promise<SheetSyncResult> {
  const t0 = Date.now()
  const steps: Step[] = []
  try {
    const wb = await downloadWorkbook()
    for (const fn of [syncCustomers, syncRevenue, syncInvoices]) {
      try { steps.push(await fn(sb, wb, opts.apply, opts.force)) }
      catch (e) { steps.push({ name: fn.name.replace('sync', ''), ok: false, summary: {}, error: (e as Error).message }) }
    }
  } catch (e) {
    steps.push({ name: '시트 받기', ok: false, summary: {}, error: (e as Error).message })
  }
  const held = steps.some(s => s.held && !opts.force)
  const ok = steps.every(s => s.ok)
  const res: SheetSyncResult = { ok, held, applied: opts.apply, steps, ms: Date.now() - t0 }
  if (opts.trigger !== 'preview') {
    const { data } = await sb.from('sync_runs').insert({
      kind: 'revenue_sheet', trigger: opts.trigger, applied: opts.apply, ok, held, ms: res.ms,
      summary: steps.map(({ backup, ...s }) => s), backup: steps.map(s => ({ name: s.name, backup: s.backup ?? null })), // eslint-disable-line @typescript-eslint/no-unused-vars
    }).select('id').single()
    res.runId = data?.id
  }
  return res
}
