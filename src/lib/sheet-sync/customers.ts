// 고객 LIST → customers (scripts/sync/sync-customers-xlsx.mjs 와 같은 규칙)
// 매칭: 고객사 ID(customer_code) → 회사명. 시트 값이 있는 칸만 덮어씀. 삭제 없음. DB 에 없는 회사는 생성
import type { SupabaseClient } from '@supabase/supabase-js'
import type { WorkBook } from 'xlsx'
import { grid, clean, excelDate, normalize, stripSuffix, fetchAll, type Step } from './common'

const phone = (v: unknown) => {
  if (v == null || v === '') return null
  if (typeof v === 'number') { const d = '0' + String(v); return d.length === 11 ? `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7)}` : d.length === 10 ? `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}` : d }
  return clean(v)
}
const numOrNull = (v: unknown) => (v == null || v === '' ? null : Number(String(v).replace(/[^\d.-]/g, '')) || null)
const FIELDS = ['customer_code', 'company_type', 'contact_person', 'contact_phone', 'billing_type', 'billing_start', 'billing_end', 'user_count', 'invoice_email', 'invoice_contact', 'invoice_phone', 'business_reg_no', 'tax_invoice_email', 'deposit_amount', 'deposit_paid_at', 'deposit_returned_at', 'notes', 'status'] as const

export async function syncCustomers(sb: SupabaseClient, wb: WorkBook, apply: boolean, force = false): Promise<Step> {
  const { rows: g } = grid(wb, '고객 LIST')
  const hi = g.findIndex(r => r[7] === '회사명')
  if (hi < 0) throw new Error('고객 LIST: 헤더(회사명) 없음 — 시트 구조가 바뀜')
  const rows: Record<string, unknown>[] = []
  for (const r of g.slice(hi + 1)) {
    const name = clean(r[7]); if (!name) continue
    const billEndRaw = r[1]
    const churned = excelDate(r[3]), blocked = excelDate(r[2])
    const status = churned ? 'churned' : blocked ? 'suspended' : (typeof billEndRaw === 'string' && billEndRaw.includes('진행중')) ? 'active' : null
    const uc = numOrNull(r[6])
    rows.push({
      _name: name, _code: clean(r[4]),
      company_name: name, customer_code: clean(r[4]), company_type: clean(r[8]),
      contact_person: clean(r[9]), contact_phone: phone(r[10]), billing_type: clean(r[11]),
      billing_start: excelDate(r[5]), billing_end: typeof billEndRaw === 'number' ? excelDate(billEndRaw) : null,
      user_count: uc != null ? Math.round(uc) : null,
      invoice_email: clean(r[13]), invoice_contact: clean(r[14]), invoice_phone: phone(r[15]),
      business_reg_no: clean(r[16]), tax_invoice_email: clean(r[17]),
      deposit_amount: numOrNull(r[21]), deposit_paid_at: excelDate(r[22]), deposit_returned_at: excelDate(r[25]),
      notes: clean(r[12]), status,
    })
  }
  const customers = await fetchAll<Record<string, unknown> & { id: string; company_name: string; customer_code: string | null }>(sb, 'customers', '*')
  const byCode = new Map(customers.filter(c => c.customer_code).map(c => [String(c.customer_code), c]))
  const byName = new Map<string, (typeof customers)[number]>(); for (const c of customers) { byName.set(c.company_name, c); byName.set(normalize(c.company_name), c) }
  // 10/22: 시트에서 고객사 ID 를 잘못 붙여 넣은 줄이 있음(새얼종합건설 줄에 제이앤탑 ID 등) — ID 가 같아도 회사명이 다르면 ID 로 잇지 않는다
  const sameName = (a: unknown, b: unknown) => { const x = normalize(a).replace(/\(?(선납|선불|후불|후납)\)?/g, ''), y = normalize(b).replace(/\(?(선납|선불|후불|후납)\)?/g, ''); return !!x && !!y && (x === y || x.includes(y) || y.includes(x)) }
  const codeConflicts: string[] = []
  const update: { id: string; name: string; patch: Record<string, unknown>; before: Record<string, unknown> }[] = []
  const create: Record<string, unknown>[] = []
  let same = 0
  // 1) 줄마다 고객 찾기
  const groups = new Map<string, { c: (typeof customers)[number]; rows: Record<string, unknown>[] }>()
  for (const r of rows) {
    let c = r._code ? byCode.get(String(r._code)) : undefined
    if (c && !sameName(c.company_name, r._name)) { codeConflicts.push(`${r._name}: 고객사 ID ${r._code} 는 ${c.company_name} 것`); c = undefined; r.customer_code = null }
    c = c || byName.get(r._name as string) || byName.get(normalize(r._name)) || byName.get(stripSuffix(r._name)) || byName.get(normalize(stripSuffix(r._name)))
    if (!c) { create.push(r); continue }
    if (!groups.has(c.id)) groups.set(c.id, { c, rows: [] })
    groups.get(c.id)!.rows.push(r)
  }
  // 2) 같은 고객의 여러 줄(예: 유한종합건설 카드 / 선납 — 결제 방식만 다른 계약) → 하나로 합침. 날마다 값이 번갈아 바뀌지 않게
  //    기본 줄 = 이름에 "(선납)" 같은 표시가 없는 줄. 다른 줄은 빈 칸만 채우고 메모에 "선납 계약 · 고객사 ID …"
  for (const { c, rows: rs } of Array.from(groups.values())) {
    const sorted = [...rs].sort((a, b) => (stripSuffix(a._name) === a._name ? 0 : 1) - (stripSuffix(b._name) === b._name ? 0 : 1))
    const m: Record<string, unknown> = { ...sorted[0] }
    const extra: string[] = []
    for (const r of sorted.slice(1)) {
      for (const f of FIELDS) if (f !== 'customer_code' && m[f] == null && r[f] != null) m[f] = r[f]
      const tag = String(r._name).match(/\(([^)]+)\)\s*$/)?.[1] || '추가'
      extra.push([`${tag} 계약`, r._code && `고객사 ID ${r._code}`, r.billing_type && `과금 ${r.billing_type}`, r.notes].filter(Boolean).join(' · '))
    }
    if (extra.length) m.notes = [m.notes, ...extra].filter(Boolean).join('\n')
    const patch: Record<string, unknown> = {}
    for (const f of FIELDS) {
      const v = m[f]; if (v == null) continue
      const cur = c[f]
      const eq = f === 'deposit_amount' || f === 'user_count' ? Number(cur) === Number(v) : String(cur ?? '') === String(v)
      if (!eq) patch[f] = v
    }
    if (Object.keys(patch).length) update.push({ id: c.id, name: c.company_name + (rs.length > 1 ? ` (시트 ${rs.length}줄 합침)` : ''), patch, before: Object.fromEntries(Object.keys(patch).map(k => [k, c[k]])) })
    else same++
  }
  const summary = { sheet: rows.length, update: update.length, create: create.length, same, idConflicts: codeConflicts.length }
  const samples = [...codeConflicts.map(x => `ID 겹침 · ${x}`), ...update.slice(0, 6).map(u => `${u.name}: ${Object.keys(u.patch).filter(k => k !== 'notes').join(', ')}`), ...create.slice(0, 4).map(r => `+ ${r._name}`)]
  // 안전: 한 번에 30곳 넘게 새로 생기면 시트 구조 문제일 수 있음
  const held = create.length > 30 ? `새 고객 ${create.length}곳 — 시트 확인 필요` : undefined
  if (!apply || (held && !force)) return { name: '고객 LIST', ok: true, held, summary, samples }
  let ok = 0, created = 0, fail = 0
  for (const u of update) { const { error } = await sb.from('customers').update({ ...u.patch, updated_at: new Date().toISOString() }).eq('id', u.id); if (error) fail++; else ok++ }
  for (const r of create) {
    const row = Object.fromEntries(Object.entries(r).filter(([k]) => !k.startsWith('_')))
    const { error } = await sb.from('customers').insert({ ...row, notes: [row.notes, '고객 LIST 시트에서 자동 생성'].filter(Boolean).join('\n') })
    if (error) fail++; else created++
  }
  return { name: '고객 LIST', ok: fail === 0, summary: { ...summary, applied: ok, created, fail }, samples, backup: update.map(u => ({ id: u.id, before: u.before })) }
}
