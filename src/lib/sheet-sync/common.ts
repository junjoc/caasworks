// 매출 시트 자동 동기화 공용 (2026-10-22) — scripts/sync/sync-*-xlsx.mjs 규칙을 서버에서 돌리게 옮긴 것
// 원본: 구글 시트 "[경영관리] 2026년 매출 현황" (팀이 고치는 곳). 방향은 시트 → CRM 한쪽.
import * as XLSX from 'xlsx'
import type { SupabaseClient } from '@supabase/supabase-js'

export const SHEET_ID = process.env.REVENUE_SHEET_ID || '1ISGq9rkQe8LOlmS1-nCmWp95Lr34kpJ_jnp3OTaLFHQ'
export const YEAR = 2026

/** 시트를 xlsx 로 내려받는다 (링크 공유 시트). 서비스 계정 공유로 바꾸면 여기만 인증 요청으로 */
export async function downloadWorkbook(): Promise<XLSX.WorkBook> {
  const res = await fetch(`https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=xlsx`, { redirect: 'follow', cache: 'no-store' })
  const type = res.headers.get('content-type') || ''
  if (!res.ok || !type.includes('spreadsheetml')) throw new Error(`시트를 받지 못함 (${res.status} ${type.slice(0, 40)}) — 공유 설정 확인`)
  return XLSX.read(new Uint8Array(await res.arrayBuffer()), { type: 'array' })
}

export const grid = (wb: XLSX.WorkBook, name: string) => {
  const ws = wb.Sheets[name]
  if (!ws) throw new Error(`"${name}" 시트 없음`)
  return { ws, rows: XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: null, raw: true }) }
}
export const clean = (v: unknown) => (v == null ? null : String(v).trim() || null)
export const num = (v: unknown) => (typeof v === 'number' ? v : v == null || v === '' ? 0 : Number(String(v).replace(/[,₩원\s]/g, '')) || 0)
export const money = (v: unknown) => Math.round(num(v))
export function excelDate(v: unknown): string | null {
  if (v == null || v === '') return null
  if (typeof v === 'number') { const d = XLSX.SSF.parse_date_code(v); return d ? `${d.y}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}` : null }
  const m = String(v).trim().replace(/\./g, '-').replace(/\s+/g, '').match(/^(\d{4})-(\d{1,2})-(\d{1,2})/)
  return m ? `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}` : null
}
export const normalize = (s: unknown) => String(s || '').replace(/\s+/g, '').replace(/[()（）\-·・㈜]/g, '').replace(/^주식회사|주식회사$|^유한회사|유한회사$/g, '').toLowerCase()
export const stripSuffix = (s: unknown) => String(s || '').replace(/\s*\((선납|선불|후불|후납|카드|현금)\)\s*$/g, '').trim()

export async function fetchAll<T = Record<string, unknown>>(sb: SupabaseClient, t: string, cols: string, ff?: (q: any) => any): Promise<T[]> { // eslint-disable-line @typescript-eslint/no-explicit-any
  let all: T[] = []
  for (let f = 0; ; f += 1000) {
    let q = sb.from(t).select(cols).order('id').range(f, f + 999)
    if (ff) q = ff(q)
    const { data, error } = await q
    if (error) throw new Error(`${t}: ${error.message}`)
    all = all.concat((data || []) as T[])
    if (!data || data.length < 1000) break
  }
  return all
}

/** 고객 찾기 — 이름 그대로 → 결제 표시 뗀 이름 → 정규화 */
export function customerIndex(customers: { id: string; company_name: string }[]) {
  const by: Record<string, string> = {}
  for (const c of customers) { by[c.company_name] = c.id; by[normalize(c.company_name)] = c.id }
  return {
    find: (co: string) => { const s = stripSuffix(co); return by[co] || by[s] || by[normalize(co)] || by[normalize(s)] },
    add: (name: string, id: string) => { by[name] = id; by[normalize(name)] = id },
  }
}

export type Step = { name: string; ok: boolean; held?: string; summary: Record<string, unknown>; samples?: string[]; backup?: unknown; error?: string }
