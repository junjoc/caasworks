#!/usr/bin/env node
// 청구서(invoices) 갱신 — 매출 현황 엑셀의 "매입매출(계산서)" + "미납 현황" 시트 기준. 2026-10-20
//   매입매출: 회사 행 × 월 블록(11열: 월 이용료, VAT포함, 항목, 발행일, 발행금액, 비고, 입금예정일, 입금일, 입금액, 미납액, 경과일)
//   미납 현황: 회사 행 × 월 블록(5열: 발행일, 입금예정일, 경과일, 미납금액, 비고) — 입금예정일·독촉 비고 보강, 매입매출에 없는 건은 추가
//   - (customer_id, year, month) 가 UNIQUE 라 같은 회사의 여러 행(현장별 발행)은 합산
//   - 기존 행은 시트 값으로 갱신(invoice_number 유지). CRM 에서 직접 만든 INV-* 는 건드리지 않고 보고만. 삭제 없음
//   - 미납 화면 기준 = tax_invoice_issued_at 있음 + paid_at 없음
// usage: node scripts/sync/sync-invoices-xlsx.mjs "<xlsx>" [--live]
import { createClient } from '@supabase/supabase-js'
import { readFileSync, writeFileSync, mkdirSync } from 'fs'
import XLSX from 'xlsx'

readFileSync('.env.local', 'utf-8').split('\n').forEach(l => { const m = l.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/); if (m) process.env[m[1]] = m[2].replace(/^"(.*)"$/, '$1') })
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
const FILE = process.argv.find(a => a.endsWith('.xlsx'))
const LIVE = process.argv.includes('--live')
const YEAR = 2026
if (!FILE) { console.log('usage: node scripts/sync/sync-invoices-xlsx.mjs "<xlsx>" [--live]'); process.exit(1) }

const num = v => (typeof v === 'number' ? v : (v == null || v === '' ? 0 : Number(String(v).replace(/[,₩원\s]/g, '')) || 0))
const date = v => { if (v == null || v === '') return null; if (typeof v === 'number') { const d = XLSX.SSF.parse_date_code(v); return d ? `${d.y}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}` : null } const m = String(v).trim().replace(/\./g, '-').match(/^(\d{4})-(\d{1,2})-(\d{1,2})/); return m ? `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}` : null }
const clean = v => (v == null ? null : String(v).trim() || null)
const normalize = s => (s || '').toString().replace(/\s+/g, '').replace(/[()（）\-·・㈜]/g, '').toLowerCase()
const stripSuffix = s => (s || '').toString().replace(/\s*\((선납|선불|후불|후납|카드|현금)\)\s*$/g, '').trim()
async function fetchAll(t, cols, ff) { let all = []; for (let f = 0; ; f += 1000) { let q = sb.from(t).select(cols).order('id').range(f, f + 999); if (ff) q = ff(q); const { data, error } = await q; if (error) throw new Error(error.message); all = all.concat(data || []); if (!data || data.length < 1000) break } return all }

console.log(`[청구서 갱신 (xlsx)] ${LIVE ? 'LIVE' : 'DRY-RUN'}\n`)
const wb = XLSX.readFile(FILE)
const G = n => { const ws = wb.Sheets[n]; if (!ws) throw new Error(`"${n}" 시트 없음`); return XLSX.utils.sheet_to_json(ws, { header: 1, defval: null, raw: true }) }

// ── 1. 매입매출(계산서) ──
const inv = new Map() // company|month → 합산
const sheetMonth = Array(12).fill(0)
let rowsCnt = 0
for (const r of G('매입매출(계산서)').slice(8)) {
  const no = r[2], company = clean(r[3])
  if (no == null || Number.isNaN(parseFloat(no)) || !company) continue
  rowsCnt++
  for (let m = 1; m <= 12; m++) {
    const b = 9 + (m - 1) * 11
    const issued = date(r[b + 3]), total = num(r[b + 4]), memo = clean(r[b + 5]), due = date(r[b + 6]), paidAt = date(r[b + 7]), paidAmt = num(r[b + 8]), unpaid = num(r[b + 9])
    const fee = num(r[b]) // 월 이용료 (VAT 제외)
    if (total <= 0 && !issued) continue
    sheetMonth[m - 1] += total
    const k = `${company}|${m}`
    const e = inv.get(k) || { company, month: m, total: 0, subtotal: 0, issued: null, due: null, paidAt: null, paidAmt: 0, unpaid: 0, memos: [], items: [], allPaid: true }
    e.total += total; e.subtotal += fee > 0 && fee <= total ? fee : Math.round(total / 1.1)
    e.paidAmt += paidAmt; e.unpaid += unpaid
    if (issued && (!e.issued || issued < e.issued)) e.issued = issued
    if (due && (!e.due || due < e.due)) e.due = due
    if (paidAt && (!e.paidAt || paidAt > e.paidAt)) e.paidAt = paidAt
    // 완납 = 미납액 0 이고 (입금일 있거나 입금액이 발행금액 이상). 부분 입금(입금일 있어도 미납액>0)은 미납
    const thisPaid = unpaid <= 0 && (!!paidAt || paidAmt >= total)
    if (!thisPaid) e.allPaid = false
    if (memo) e.memos.push(memo)
    if (clean(r[b + 2])) e.items.push(clean(r[b + 2]))
    inv.set(k, e)
  }
}
console.log(`매입매출: 회사 행 ${rowsCnt}, 청구 (회사×월) ${inv.size}, 발행 합계 ${sheetMonth.reduce((a, b) => a + b, 0).toLocaleString()}`)
console.log('  월별 발행 합계: ' + sheetMonth.map((v, i) => `${i + 1}월 ${v.toLocaleString()}`).join(' | '))

// ── 2. 미납 현황 ──
let unpaidRows = 0, unpaidSum = 0, unpaidAdded = 0, unpaidMerged = 0
for (const r of G('미납 현황').slice(9)) {
  const no = r[1], company = clean(r[2])
  if (no == null || Number.isNaN(parseInt(no)) || !company) continue
  unpaidRows++
  const contact = clean(r[5])
  for (let m = 0; m < 12; m++) {
    const b = 9 + m * 5
    const issued = date(r[b]), due = date(r[b + 1]), amount = num(r[b + 3]), memo = clean(r[b + 4])
    if (amount <= 0) continue
    unpaidSum += amount
    const k = `${company}|${m + 1}`
    const e = inv.get(k)
    if (e) {
      unpaidMerged++
      if (due) e.due = due            // 미납 시트의 입금예정일이 최신 (연장 협의 반영)
      if (memo && !e.memos.includes(memo)) e.memos.push(memo)
      if (e.allPaid && e.paidAt) { /* 매입매출은 입금됐는데 미납에도 있음 → 매입매출 기준 유지 */ }
      e.unpaidSheet = amount
    } else {
      unpaidAdded++
      inv.set(k, { company, month: m + 1, total: amount, subtotal: Math.round(amount / 1.1), issued, due, paidAt: null, paidAmt: 0, unpaid: amount, memos: memo ? [memo] : [], items: [], allPaid: false, fromUnpaid: true, contact, unpaidSheet: amount })
    }
  }
}
console.log(`미납 현황: 회사 ${unpaidRows}, 미납 셀 합계 ${unpaidSum.toLocaleString()} (매입매출과 합침 ${unpaidMerged}, 매입매출에 없어 추가 ${unpaidAdded})`)

// ── 3. DB 대조 ──
const customers = await fetchAll('customers', 'id, company_name')
const custByName = {}
for (const c of customers) { custByName[c.company_name] = c.id; custByName[normalize(c.company_name)] = c.id }
const findCust = co => { const s = stripSuffix(co); return custByName[co] || custByName[s] || custByName[normalize(co)] || custByName[normalize(s)] }
const missing = new Set([...inv.values()].filter(e => !findCust(e.company)).map(e => e.company))

const existing = await fetchAll('invoices', 'id, invoice_number, customer_id, year, month, subtotal, vat, total, status, sent_at, paid_at, due_date, tax_invoice_issued_at, notes', q => q.eq('year', YEAR))
const exByKey = new Map(existing.map(e => [`${e.customer_id}|${e.month}`, e]))
const FIELDS = ['subtotal', 'vat', 'total', 'status', 'sent_at', 'paid_at', 'due_date', 'tax_invoice_issued_at', 'notes']
const plan = { insert: [], update: [], same: 0, skipManual: [], notInSheet: [] }
const seen = new Set()
for (const e of inv.values()) {
  const custId = findCust(e.company)
  const status = e.allPaid && (e.paidAt || e.paidAmt > 0) ? 'paid' : (e.issued ? 'sent' : 'draft')
  const notes = [
    `${YEAR}년 ${e.month}월 청구분 (시트 동기화 ${new Date().toISOString().slice(0, 10)})`,
    e.items.length ? `항목: ${[...new Set(e.items)].join(' / ')}` : null,
    e.unpaid > 0 ? `미납 ₩${e.unpaid.toLocaleString()}${e.paidAmt > 0 ? ` (입금 ₩${e.paidAmt.toLocaleString()}${e.paidAt ? ' ' + e.paidAt : ''})` : ''}` : null,
    e.fromUnpaid ? '미납 현황 시트에만 있는 건' : null,
    e.contact ? `담당: ${e.contact.replace(/\s+/g, ' ').slice(0, 120)}` : null,
    ...[...new Set(e.memos)].map(x => `비고: ${x.replace(/\s+/g, ' ').slice(0, 300)}`),
  ].filter(Boolean).join('\n')
  const row = {
    customer_id: custId, year: YEAR, month: e.month,
    subtotal: e.subtotal, vat: e.total - e.subtotal, total: e.total, status,
    // 부분 입금 건은 paid_at 을 비워 미납 화면에 남긴다 (입금 내역은 비고에)
    sent_at: e.issued, tax_invoice_issued_at: e.issued, paid_at: status === 'paid' ? e.paidAt : null, due_date: e.due, notes,
    sender_company: '(주)아이콘', sender_biz_no: '153-87-01774', sender_ceo: '김종민', receiver_company: e.company,
  }
  if (!custId) { plan.insert.push({ ...row, _company: e.company, _needCust: true }); continue }
  const ex = exByKey.get(`${custId}|${e.month}`)
  if (!ex) { plan.insert.push({ ...row, _company: e.company }); continue }
  seen.add(ex.id)
  if (ex.invoice_number && ex.invoice_number.startsWith('INV')) { plan.skipManual.push({ ...ex, _company: e.company, _sheetTotal: e.total }); continue }
  const patch = {}
  for (const f of FIELDS) {
    const a = ex[f], b = row[f]
    const same = ['subtotal', 'vat', 'total'].includes(f) ? Math.round(Number(a || 0)) === Math.round(Number(b || 0))
      : ['sent_at', 'paid_at', 'tax_invoice_issued_at'].includes(f) ? (a ? String(a).slice(0, 10) : null) === b
      : f === 'notes' ? (a || '').replace(/\(시트 동기화[^)]*\)/, '') === (b || '').replace(/\(시트 동기화[^)]*\)/, '')
      : String(a ?? '') === String(b ?? '')
    if (!same) patch[f] = b
  }
  if (Object.keys(patch).length) plan.update.push({ id: ex.id, _company: e.company, month: e.month, patch, before: Object.fromEntries(Object.keys(patch).map(k => [k, ex[k]])) })
  else plan.same++
}
for (const ex of existing) if (!seen.has(ex.id)) plan.notInSheet.push(ex)

const fieldCnt = {}; for (const u of plan.update) for (const k of Object.keys(u.patch)) fieldCnt[k] = (fieldCnt[k] || 0) + 1
console.log(`\n변경 계획`)
console.log(`  신규 고객 생성: ${missing.size}  ${[...missing].slice(0, 20).join(', ')}`)
console.log(`  청구서 신규: ${plan.insert.length} (${plan.insert.reduce((a, r) => a + r.total, 0).toLocaleString()}원)`)
console.log(`  청구서 변경: ${plan.update.length}  / 그대로: ${plan.same}   필드별:`, fieldCnt)
console.log(`  CRM 직접 생성(INV-*) 건은 유지: ${plan.skipManual.length}  ${plan.skipManual.map(s => `${s._company} ${s.month}월 DB ${Number(s.total).toLocaleString()} vs 시트 ${s._sheetTotal.toLocaleString()}`).join(' | ')}`)
console.log(`  시트에 없는 DB 청구서(유지): ${plan.notInSheet.length}  ${plan.notInSheet.slice(0, 10).map(x => `${x.invoice_number} ${x.month}월 ${Number(x.total).toLocaleString()}`).join(' | ')}`)
const statusCh = plan.update.filter(u => u.patch.status)
console.log(`  상태 변경 ${statusCh.length}: ` + statusCh.slice(0, 15).map(u => `${u._company} ${u.month}월 ${u.before.status}→${u.patch.status}`).join(', '))
console.log(`  변경 예시:`); for (const u of plan.update.slice(0, 8)) console.log(`   - ${u._company} ${u.month}월: ${Object.keys(u.patch).filter(k => k !== 'notes').map(k => `${k} ${JSON.stringify(u.before[k])}→${JSON.stringify(u.patch[k])}`).join(' | ').slice(0, 200)}`)
const byM = {}; for (const r of plan.insert) byM[r.month] = (byM[r.month] || 0) + 1
console.log(`  신규 월별: ${Object.entries(byM).map(([m, n]) => `${m}월 ${n}`).join(', ')}`)
// 예상 미납 (발행 + 미수납)
const predicted = [...inv.values()].filter(e => e.issued && !(e.allPaid && (e.paidAt || e.paidAmt > 0)))
console.log(`\n반영 후 미납 화면 예상: ${predicted.length}건 / 청구 총액 ${predicted.reduce((a, e) => a + e.total, 0).toLocaleString()}원 (미납 시트 잔액 합계 ${unpaidSum.toLocaleString()}원 — 부분 입금 건은 청구 총액이 더 큼)`)

// 미납 시트에는 있는데 미납 화면 기준(발행+미수납)에서 빠지는 건
const custName = new Map(customers.map(c => [c.id, c.company_name]))
const dropped = [...inv.values()].filter(e => e.unpaidSheet > 0 && !predicted.includes(e))
console.log(`미납 시트엔 있지만 미납 화면에 안 잡힐 건: ${dropped.length}건 ${dropped.reduce((a, e) => a + e.unpaidSheet, 0).toLocaleString()}원`)
for (const e of dropped.slice(0, 25)) console.log(`   - ${e.company} ${e.month}월: 미납시트 ${e.unpaidSheet.toLocaleString()} / 매입매출 발행 ${e.total.toLocaleString()} 발행일 ${e.issued} 입금일 ${e.paidAt} 입금액 ${e.paidAmt.toLocaleString()} 미납액 ${e.unpaid.toLocaleString()}`)
console.log(`시트에 없는 DB 청구서 회사: ${plan.notInSheet.map(x => `${custName.get(x.customer_id)} ${x.month}월`).join(', ')}`)

if (!LIVE) { console.log('\n[DRY-RUN] --live 로 실행'); process.exit(0) }

// ── LIVE ──
mkdirSync('backups', { recursive: true })
const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 16)
writeFileSync(`backups/invoices-2026-${ts}.json`, JSON.stringify(existing))
console.log(`\n백업: backups/invoices-2026-${ts}.json`)
for (const name of missing) {
  const { data, error } = await sb.from('customers').insert({ company_name: name, status: 'active', notes: '매입매출 시트에서 자동 생성 (2026-10-20)' }).select('id').single()
  if (error) { console.log(`  ❌ 고객 생성 ${name}: ${error.message}`); continue }
  custByName[name] = data.id; custByName[normalize(name)] = data.id
}
let ins = 0, upd = 0, fail = 0
for (const r of plan.insert) {
  const { _company, _needCust, ...row } = r
  row.customer_id = row.customer_id || findCust(_company)
  if (!row.customer_id) { fail++; console.log(`  ❌ 고객 없음 ${_company}`); continue }
  row.invoice_number = `CAAS-SHEET-${row.customer_id.slice(0, 8)}-${YEAR}-${String(row.month).padStart(2, '0')}`
  const { error } = await sb.from('invoices').insert(row)
  if (error) { fail++; console.log(`  ❌ 신규 ${_company} ${row.month}월: ${error.message}`) } else ins++
}
for (const u of plan.update) {
  const { error } = await sb.from('invoices').update(u.patch).eq('id', u.id)
  if (error) { fail++; console.log(`  ❌ 변경 ${u._company} ${u.month}월: ${error.message}`) } else upd++
}
console.log(`완료: 신규 ${ins}, 변경 ${upd}, 실패 ${fail}`)
const after = await fetchAll('invoices', 'total, status, paid_at, tax_invoice_issued_at', q => q.eq('year', YEAR))
const un = after.filter(r => r.tax_invoice_issued_at && !r.paid_at && r.status !== 'cancelled')
console.log(`검증: 2026 청구서 ${after.length}건 ${after.reduce((a, r) => a + Number(r.total), 0).toLocaleString()}원 / 미납 화면 기준 ${un.length}건 ${un.reduce((a, r) => a + Number(r.total), 0).toLocaleString()}원`)
