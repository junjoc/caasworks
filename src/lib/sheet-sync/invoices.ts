// 매입매출(계산서) + 미납 현황 → invoices (scripts/sync/sync-invoices-xlsx.mjs 와 같은 규칙)
// 회사 × 월로 합산 (같은 회사의 현장별 발행은 합침). 기존 행은 시트 값으로 갱신(번호 유지), CRM 에서 직접 만든 INV-* 는 그대로. 삭제 없음
import type { SupabaseClient } from '@supabase/supabase-js'
import type { WorkBook } from 'xlsx'
import { grid, clean, num, excelDate as date, fetchAll, customerIndex, YEAR, type Step } from './common'

type Inv = { company: string; month: number; total: number; subtotal: number; issued: string | null; due: string | null; paidAt: string | null; paidAmt: number; unpaid: number; memos: string[]; items: string[]; allPaid: boolean; fromUnpaid?: boolean; contact?: string | null; unpaidSheet?: number }
const FIELDS = ['subtotal', 'vat', 'total', 'status', 'sent_at', 'paid_at', 'due_date', 'tax_invoice_issued_at', 'notes'] as const

export async function syncInvoices(sb: SupabaseClient, wb: WorkBook, apply: boolean, force = false): Promise<Step> {
  const inv = new Map<string, Inv>()
  for (const r of grid(wb, '매입매출(계산서)').rows.slice(8)) {
    const no = r[2], company = clean(r[3])
    if (no == null || Number.isNaN(parseFloat(String(no))) || !company) continue
    for (let m = 1; m <= 12; m++) {
      const b = 9 + (m - 1) * 11
      const issued = date(r[b + 3]), total = num(r[b + 4]), memo = clean(r[b + 5]), due = date(r[b + 6]), paidAt = date(r[b + 7]), paidAmt = num(r[b + 8]), unpaid = num(r[b + 9]), fee = num(r[b])
      if (total <= 0 && !issued) continue
      const k = `${company}|${m}`
      const e = inv.get(k) || { company, month: m, total: 0, subtotal: 0, issued: null, due: null, paidAt: null, paidAmt: 0, unpaid: 0, memos: [], items: [], allPaid: true }
      e.total += total; e.subtotal += fee > 0 && fee <= total ? fee : Math.round(total / 1.1)
      e.paidAmt += paidAmt; e.unpaid += unpaid
      if (issued && (!e.issued || issued < e.issued)) e.issued = issued
      if (due && (!e.due || due < e.due)) e.due = due
      if (paidAt && (!e.paidAt || paidAt > e.paidAt)) e.paidAt = paidAt
      if (!(unpaid <= 0 && (!!paidAt || paidAmt >= total))) e.allPaid = false
      if (memo) e.memos.push(memo)
      const item = clean(r[b + 2]); if (item) e.items.push(item)
      inv.set(k, e)
    }
  }
  for (const r of grid(wb, '미납 현황').rows.slice(9)) {
    const no = r[1], company = clean(r[2])
    if (no == null || Number.isNaN(parseInt(String(no))) || !company) continue
    const contact = clean(r[5])
    for (let m = 0; m < 12; m++) {
      const b = 9 + m * 5
      const issued = date(r[b]), due = date(r[b + 1]), amount = num(r[b + 3]), memo = clean(r[b + 4])
      if (amount <= 0) continue
      const k = `${company}|${m + 1}`, e = inv.get(k)
      if (e) { if (due) e.due = due; if (memo && !e.memos.includes(memo)) e.memos.push(memo); e.unpaidSheet = amount }
      else inv.set(k, { company, month: m + 1, total: amount, subtotal: Math.round(amount / 1.1), issued, due, paidAt: null, paidAmt: 0, unpaid: amount, memos: memo ? [memo] : [], items: [], allPaid: false, fromUnpaid: true, contact, unpaidSheet: amount })
    }
  }
  const customers = await fetchAll<{ id: string; company_name: string }>(sb, 'customers', 'id, company_name')
  const ci = customerIndex(customers)
  const missing = Array.from(new Set(Array.from(inv.values()).filter(e => !ci.find(e.company)).map(e => e.company)))
  type Ex = Record<string, unknown> & { id: string; invoice_number: string | null; customer_id: string; month: number; total: number }
  const existing = await fetchAll<Ex>(sb, 'invoices', 'id, invoice_number, customer_id, year, month, subtotal, vat, total, status, sent_at, paid_at, due_date, tax_invoice_issued_at, notes', q => q.eq('year', YEAR))
  const exByKey = new Map(existing.map(e => [`${e.customer_id}|${e.month}`, e]))
  const insert: (Record<string, unknown> & { _company: string })[] = []
  const update: { id: string; label: string; patch: Record<string, unknown>; before: Record<string, unknown> }[] = []
  let same = 0, manual = 0
  const stamp = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10)
  for (const e of Array.from(inv.values())) {
    const custId = ci.find(e.company)
    const status = e.allPaid && (e.paidAt || e.paidAmt > 0) ? 'paid' : e.issued ? 'sent' : 'draft'
    const notes = [
      `${YEAR}년 ${e.month}월 청구분 (시트 동기화 ${stamp})`,
      e.items.length ? `항목: ${Array.from(new Set(e.items)).join(' / ')}` : null,
      e.unpaid > 0 ? `미납 ₩${e.unpaid.toLocaleString()}${e.paidAmt > 0 ? ` (입금 ₩${e.paidAmt.toLocaleString()}${e.paidAt ? ' ' + e.paidAt : ''})` : ''}` : null,
      e.fromUnpaid ? '미납 현황 시트에만 있는 건' : null,
      e.contact ? `담당: ${e.contact.replace(/\s+/g, ' ').slice(0, 120)}` : null,
      ...Array.from(new Set(e.memos)).map(x => `비고: ${x.replace(/\s+/g, ' ').slice(0, 300)}`),
    ].filter(Boolean).join('\n')
    const row: Record<string, unknown> = {
      customer_id: custId, year: YEAR, month: e.month, subtotal: e.subtotal, vat: e.total - e.subtotal, total: e.total, status,
      sent_at: e.issued, tax_invoice_issued_at: e.issued, paid_at: status === 'paid' ? e.paidAt : null, due_date: e.due, notes,
      sender_company: '(주)아이콘', sender_biz_no: '153-87-01774', sender_ceo: '김종민', receiver_company: e.company,
    }
    const ex = custId ? exByKey.get(`${custId}|${e.month}`) : undefined
    if (!ex) { insert.push({ ...row, _company: e.company }); continue }
    if (ex.invoice_number && ex.invoice_number.startsWith('INV')) { manual++; continue }
    const patch: Record<string, unknown> = {}
    for (const f of FIELDS) {
      const a = ex[f], b = row[f]
      const eq = ['subtotal', 'vat', 'total'].includes(f) ? Math.round(Number(a || 0)) === Math.round(Number(b || 0))
        : ['sent_at', 'paid_at', 'tax_invoice_issued_at'].includes(f) ? (a ? String(a).slice(0, 10) : null) === b
        : f === 'notes' ? String(a || '').replace(/\(시트 동기화[^)]*\)/, '') === String(b || '').replace(/\(시트 동기화[^)]*\)/, '')
        : String(a ?? '') === String(b ?? '')
      if (!eq) patch[f] = b
    }
    if (Object.keys(patch).length) update.push({ id: ex.id, label: `${e.company} ${e.month}월`, patch, before: Object.fromEntries(Object.keys(patch).map(k => [k, ex[k]])) })
    else same++
  }
  const statusCh = update.filter(u => u.patch.status)
  const summary = { invoices: inv.size, insert: insert.length, update: update.length, statusChanged: statusCh.length, same, manualKept: manual, newCustomers: missing.length }
  const samples = [...statusCh.slice(0, 6).map(u => `${u.label}: ${u.before.status} → ${u.patch.status}`), ...insert.slice(0, 4).map(r => `+ ${r._company} ${r.month}월 ${Number(r.total).toLocaleString()}`)]
  const held = missing.length > 20 ? `새 고객 ${missing.length}곳 — 회사명 확인 필요` : update.length > 400 ? `청구서 ${update.length}건 변경 — 시트 확인 필요` : undefined
  if (!apply || (held && !force)) return { name: '청구·미납', ok: true, held, summary, samples }

  let fail = 0, ins = 0, upd = 0
  for (const name of missing) {
    const { data, error } = await sb.from('customers').insert({ company_name: name, status: 'active', notes: '매입매출 시트에서 자동 생성' }).select('id').single()
    if (error) { fail++; continue } ci.add(name, data.id)
  }
  for (const r of insert) {
    const { _company, ...row } = r
    row.customer_id = row.customer_id || ci.find(_company)
    if (!row.customer_id) { fail++; continue }
    row.invoice_number = `CAAS-SHEET-${String(row.customer_id).slice(0, 8)}-${YEAR}-${String(row.month).padStart(2, '0')}`
    const { error } = await sb.from('invoices').insert(row); if (error) fail++; else ins++
  }
  for (const u of update) { const { error } = await sb.from('invoices').update(u.patch).eq('id', u.id); if (error) fail++; else upd++ }
  return { name: '청구·미납', ok: fail === 0, summary: { ...summary, inserted: ins, updated: upd, fail }, samples, backup: update.map(u => ({ id: u.id, before: u.before })) }
}
