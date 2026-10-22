// 고객 LIST → customers (scripts/sync/sync-customers-xlsx.mjs 와 같은 규칙)
// 매칭: 고객사 ID(customer_code) → 회사명. 시트 값이 있는 칸만 덮어씀. 삭제 없음. DB 에 없는 회사는 생성
import type { SupabaseClient } from '@supabase/supabase-js'
import type { WorkBook } from 'xlsx'
import { grid, clean, excelDate, normalize, fetchAll, type Step } from './common'

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
  const update: { id: string; name: string; patch: Record<string, unknown>; before: Record<string, unknown> }[] = []
  const create: Record<string, unknown>[] = []
  let same = 0
  for (const r of rows) {
    const c = (r._code ? byCode.get(String(r._code)) : null) || byName.get(r._name as string) || byName.get(normalize(r._name))
    if (!c) { create.push(r); continue }
    const patch: Record<string, unknown> = {}
    for (const f of FIELDS) {
      const v = r[f]; if (v == null) continue
      const cur = c[f]
      const eq = f === 'deposit_amount' || f === 'user_count' ? Number(cur) === Number(v) : String(cur ?? '') === String(v)
      if (!eq) patch[f] = v
    }
    if (Object.keys(patch).length) update.push({ id: c.id, name: c.company_name, patch, before: Object.fromEntries(Object.keys(patch).map(k => [k, c[k]])) })
    else same++
  }
  const summary = { sheet: rows.length, update: update.length, create: create.length, same }
  const samples = [...update.slice(0, 6).map(u => `${u.name}: ${Object.keys(u.patch).filter(k => k !== 'notes').join(', ')}`), ...create.slice(0, 4).map(r => `+ ${r._name}`)]
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
