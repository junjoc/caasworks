#!/usr/bin/env node
// 고객 정보 갱신 — 매출 현황 엑셀의 "고객 LIST" 시트 기준. 2026-10-20
//   - 매칭: 고객사 ID(customer_code) → 없으면 회사명(정규화)
//   - 시트 값이 있는 칸만 덮어씀 (시트가 비어 있으면 DB 값 유지). 삭제 없음
//   - DB 에 없는 회사는 신규 생성
// usage: node scripts/sync/sync-customers-xlsx.mjs "<xlsx>" [--live]
import { createClient } from '@supabase/supabase-js'
import { readFileSync, writeFileSync, mkdirSync } from 'fs'
import XLSX from 'xlsx'

readFileSync('.env.local', 'utf-8').split('\n').forEach(l => { const m = l.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/); if (m) process.env[m[1]] = m[2].replace(/^"(.*)"$/, '$1') })
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
const FILE = process.argv.find(a => a.endsWith('.xlsx'))
const LIVE = process.argv.includes('--live')
if (!FILE) { console.log('usage: node scripts/sync/sync-customers-xlsx.mjs "<xlsx>" [--live]'); process.exit(1) }

const clean = v => (v == null ? null : String(v).trim() || null)
// 전화번호가 숫자로 들어온 경우(1073718963) → 010-7371-8963
const phone = v => { if (v == null || v === '') return null; if (typeof v === 'number') { const d = '0' + String(v); return d.length === 11 ? `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7)}` : d.length === 10 ? `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}` : d } return clean(v) }
const excelDate = v => { if (v == null || v === '') return null; if (typeof v === 'number') { const d = XLSX.SSF.parse_date_code(v); return d ? `${d.y}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}` : null } const m = String(v).trim().replace(/\./g, '-').match(/^(\d{4})-(\d{1,2})-(\d{1,2})/); return m ? `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}` : null }
const num = v => (v == null || v === '' ? null : Number(String(v).replace(/[^\d.-]/g, '')) || null)
const normalize = s => (s || '').toString().replace(/\s+/g, '').replace(/[()（）\-·・㈜]/g, '').toLowerCase()

const wb = XLSX.readFile(FILE)
const ws = wb.Sheets['고객 LIST']
if (!ws) throw new Error('"고객 LIST" 시트 없음')
const grid = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null, raw: true })
const hi = grid.findIndex(r => r[7] === '회사명')
if (hi < 0) throw new Error('헤더(회사명) 없음')
// 열: 0 NO, 1 과금 종료일, 2 차단일, 3 이탈일, 4 고객사 ID, 5 과금 시작일, 6 이용유저 수, 7 회사명, 8 타입, 9 담당자, 10 연락처, 11 과금방식,
//     12 특이사항, 13 청구서 Email, 14 청구 담당자, 15 연락처, 16 사업자등록증, 17 세금계산서 이메일, 18 계산서 발행일,
//     21 보증금 금액, 22 납입일, 25 반환일, 26 비고, 27 대표자명, 28 소재지, 29 공사 타입, 30 도급 순위, 31 건축실적
const rows = []
for (const r of grid.slice(hi + 1)) {
  const name = clean(r[7]); if (!name) continue
  const billEndRaw = r[1]
  const churned = excelDate(r[3]); const blocked = excelDate(r[2])
  // 상태: 이탈일 → churned, 차단일 → suspended, 과금 종료일 "진행중" → active, 그 외엔 DB 유지
  const status = churned ? 'churned' : blocked ? 'suspended' : (typeof billEndRaw === 'string' && billEndRaw.includes('진행중')) ? 'active' : null
  rows.push({
    _name: name, _code: clean(r[4]),
    company_name: name, customer_code: clean(r[4]), company_type: clean(r[8]),
    contact_person: clean(r[9]), contact_phone: phone(r[10]), billing_type: clean(r[11]),
    billing_start: excelDate(r[5]), billing_end: typeof billEndRaw === 'number' ? excelDate(billEndRaw) : null,
    user_count: num(r[6]) != null ? Math.round(num(r[6])) : null,
    invoice_email: clean(r[13]), invoice_contact: clean(r[14]), invoice_phone: phone(r[15]),
    business_reg_no: clean(r[16]), tax_invoice_email: clean(r[17]),
    deposit_amount: num(r[21]), deposit_paid_at: excelDate(r[22]), deposit_returned_at: excelDate(r[25]),
    notes: clean(r[12]),
    status, _billEndText: typeof billEndRaw === 'string' ? billEndRaw : null,
  })
}
console.log(`[고객 LIST 갱신] ${LIVE ? 'LIVE' : 'DRY-RUN'}  시트 회사 ${rows.length}`)

async function fetchAll(t, cols) { let all = []; for (let f = 0; ; f += 1000) { const { data, error } = await sb.from(t).select(cols).order('id').range(f, f + 999); if (error) throw new Error(error.message); all = all.concat(data || []); if (!data || data.length < 1000) break } return all }
const customers = await fetchAll('customers', '*')
const byCode = new Map(customers.filter(c => c.customer_code).map(c => [String(c.customer_code), c]))
const byName = new Map(); for (const c of customers) { byName.set(c.company_name, c); byName.set(normalize(c.company_name), c) }
const FIELDS = ['customer_code', 'company_type', 'contact_person', 'contact_phone', 'billing_type', 'billing_start', 'billing_end', 'user_count', 'invoice_email', 'invoice_contact', 'invoice_phone', 'business_reg_no', 'tax_invoice_email', 'deposit_amount', 'deposit_paid_at', 'deposit_returned_at', 'notes', 'status']

const plan = { update: [], create: [], same: 0, byCode: 0, byName: 0 }
const fieldChanges = {}
for (const r of rows) {
  let c = r._code ? byCode.get(String(r._code)) : null
  if (c) plan.byCode++; else { c = byName.get(r._name) || byName.get(normalize(r._name)); if (c) plan.byName++ }
  if (!c) { plan.create.push(r); continue }
  const patch = {}
  for (const f of FIELDS) {
    const v = r[f]
    if (v == null) continue // 시트 비어 있으면 DB 유지
    const cur = c[f]
    const same = f === 'deposit_amount' || f === 'user_count' ? Number(cur) === Number(v) : String(cur ?? '') === String(v)
    if (!same) { patch[f] = v; fieldChanges[f] = (fieldChanges[f] || 0) + 1 }
  }
  if (Object.keys(patch).length) plan.update.push({ id: c.id, name: c.company_name, patch, before: Object.fromEntries(Object.keys(patch).map(k => [k, c[k]])) })
  else plan.same++
}
console.log(`  매칭: 고객사 ID ${plan.byCode}, 회사명 ${plan.byName}, 신규 ${plan.create.length}, 변경 없음 ${plan.same}, 변경 ${plan.update.length}`)
console.log(`  필드별 변경 수:`, fieldChanges)
for (const f of Object.keys(fieldChanges)) {
  const ex = plan.update.filter(u => f in u.patch).slice(0, 3).map(u => `${u.name}: ${JSON.stringify(u.before[f])}→${JSON.stringify(u.patch[f])}`.slice(0, 120))
  console.log(`    ${f}: ${ex.join(' | ')}`)
}
console.log(`  신규 (${plan.create.length}):`, plan.create.map(r => `${r._name}${r._code ? `(${r._code})` : ''}`).slice(0, 40).join(', '))
console.log(`  변경 예시:`)
for (const u of plan.update.slice(0, 12)) console.log(`   - ${u.name}: ${Object.keys(u.patch).map(k => `${k} ${JSON.stringify(u.before[k])}→${JSON.stringify(u.patch[k])}`).join(' | ').slice(0, 220)}`)
const statusCh = plan.update.filter(u => u.patch.status)
console.log(`  상태 변경 ${statusCh.length}:`, statusCh.map(u => `${u.name} ${u.before.status}→${u.patch.status}`).slice(0, 30).join(', '))

if (!LIVE) { console.log('\n[DRY-RUN] --live 로 실행'); process.exit(0) }

mkdirSync('backups', { recursive: true })
const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 16)
writeFileSync(`backups/customers-${ts}.json`, JSON.stringify(customers))
console.log(`백업: backups/customers-${ts}.json`)
let ok = 0, fail = 0
for (const u of plan.update) { const { error } = await sb.from('customers').update({ ...u.patch, updated_at: new Date().toISOString() }).eq('id', u.id); if (error) { fail++; console.log(`  ❌ ${u.name}: ${error.message}`) } else ok++ }
let created = 0
for (const r of plan.create) {
  const { _name, _code, _billEndText, ...row } = r
  const { error } = await sb.from('customers').insert({ ...row, notes: [row.notes, '고객 LIST 시트에서 생성 (2026-10-20)'].filter(Boolean).join('\n') })
  if (error) { fail++; console.log(`  ❌ 생성 ${_name}: ${error.message}`) } else created++
}
console.log(`완료: 수정 ${ok}, 생성 ${created}, 실패 ${fail}`)
