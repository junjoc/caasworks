#!/usr/bin/env node
// 중복 고객사 합치기 (2026-10-20). 같은 회사가 "(주)X" / "주식회사 X" / 문의마다 새 고객사 ID 로 여러 번 등록된 것을 하나로.
//   - 그룹: 회사명 정규화(공백·괄호·㈜·주식회사 제거)가 같은 고객. "미상" 같은 모르는 회사는 제외
//   - 남길 것(keeper): 프로젝트·매출·청구서가 많은 쪽 → 고객사 ID 있는 쪽 → 오래된 쪽
//   - 나머지의 연결(프로젝트, 매출, 청구서, 리드, 활동, VoC, 미팅, 납부, 반출 …)을 keeper 로 옮기고, 비어 있는지 확인한 뒤 삭제
//   - keeper 에 고객사 ID 가 없으면 중복의 ID 를 가져오고, 둘 다 있으면 중복의 ID 는 비고에 남긴다 (리드 customer_code 매칭은 customer_id 로 대체됨)
// usage: node scripts/sync/merge-duplicate-customers.mjs [--live]
import { createClient } from '@supabase/supabase-js'
import { readFileSync, writeFileSync, mkdirSync } from 'fs'

readFileSync('.env.local', 'utf-8').split('\n').forEach(l => { const m = l.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/); if (m) process.env[m[1]] = m[2].replace(/^"(.*)"$/, '$1') })
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
const LIVE = process.argv.includes('--live')
const all = async q => { let a = []; for (let o = 0; ; o += 1000) { const { data, error } = await q().range(o, o + 999); if (error) throw new Error(error.message); a = a.concat(data || []); if (!data || data.length < 1000) break } return a }
const norm = s => (s || '').replace(/\s+/g, '').replace(/[()（）\-·・㈜]/g, '').replace(/^주식회사|주식회사$|^유한회사|유한회사$|^유$|유$/g, '').toLowerCase()
const UNKNOWN = new Set(['', '미상', '없음', '-', '확인필요', '개인', '건축주'])

// customer_id 를 가진 테이블 (없는 테이블·컬럼은 건너뜀)
const REF_TABLES = [['projects', 'customer_id'], ['monthly_revenues', 'customer_id'], ['invoices', 'customer_id'], ['pipeline_leads', 'customer_id'], ['activity_logs', 'customer_id'], ['voc_tickets', 'customer_id'], ['meetings', 'customer_id'], ['payments', 'customer_id'], ['rentals', 'customer_id'], ['camera_shipments', 'customer_id'], ['contracts', 'customer_id'], ['customer_documents', 'customer_id'], ['quotations', 'customer_id'], ['assets', 'current_customer_id'], ['equipment', 'current_customer_id'], ['purchase_orders', 'customer_id'], ['daily_reports', 'customer_id'], ['video_records', 'customer_id'], ['costs', 'customer_id']]

console.log(`[중복 고객 합치기] ${LIVE ? 'LIVE' : 'DRY-RUN'}\n`)
const cs = await all(() => sb.from('customers').select('*').order('id'))
const groups = new Map()
for (const c of cs) { const k = norm(c.company_name); if (!k || UNKNOWN.has(k) || UNKNOWN.has((c.company_name || '').trim())) continue; (groups.get(k) || groups.set(k, []).get(k)).push(c) }
const dups = [...groups.values()].filter(g => g.length > 1)

// 참조 수 세기
const refCount = new Map() // customer_id → { table: n }
const live = []
for (const [t, col] of REF_TABLES) {
  const { error } = await sb.from(t).select(col).limit(1)
  if (error) continue // 없는 테이블/컬럼
  live.push([t, col])
  const rows = await all(() => sb.from(t).select(col).not(col, 'is', null).order(col))
  for (const r of rows) { const id = r[col]; if (!refCount.has(id)) refCount.set(id, {}); refCount.get(id)[t] = (refCount.get(id)[t] || 0) + 1 }
}
const weight = id => { const r = refCount.get(id) || {}; return (r.projects || 0) * 10 + (r.monthly_revenues || 0) + (r.invoices || 0) * 5 }

const plan = []
for (const g of dups) {
  const sorted = [...g].sort((a, b) => weight(b.id) - weight(a.id) || (a.customer_code ? 0 : 1) - (b.customer_code ? 0 : 1) || a.created_at.localeCompare(b.created_at))
  const keeper = sorted[0], rest = sorted.slice(1)
  plan.push({ keeper, rest })
}
console.log(`고객 ${cs.length}, 중복 그룹 ${plan.length}, 합쳐질 고객 ${plan.reduce((a, p) => a + p.rest.length, 0)}  (참조 테이블: ${live.map(x => x[0]).join(', ')})\n`)
for (const p of plan) {
  const show = c => `${c.company_name}[${c.customer_code || '코드없음'}${Object.entries(refCount.get(c.id) || {}).map(([t, n]) => ` ${t.slice(0, 4)}${n}`).join('')}]`
  console.log(`  남김 ${show(p.keeper)}  ←  ${p.rest.map(show).join(' , ')}`)
}

if (!LIVE) { console.log('\n[DRY-RUN] --live 로 실행'); process.exit(0) }

mkdirSync('backups', { recursive: true })
const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 16)
const bpath = `backups/customers-merge-${ts}.json`
const refsBackup = {}
for (const [t, col] of live) refsBackup[t] = await all(() => sb.from(t).select('*').in(col, plan.flatMap(p => p.rest.map(r => r.id))).order(col))
writeFileSync(bpath, JSON.stringify({ customers: cs, plan, refs: refsBackup }))
console.log(`\n백업: ${bpath}`)

let merged = 0, failed = 0
for (const p of plan) {
  const k = p.keeper
  const patch = {}
  const notes = []
  for (const r of p.rest) {
    for (const [t, col] of live) {
      const { error } = await sb.from(t).update({ [col]: k.id }).eq(col, r.id)
      if (error) { console.log(`  ❌ ${t} 이동 실패 ${r.company_name}: ${error.message}`); failed++ }
    }
    // 고객사 ID·연락처 보강
    if (r.customer_code) { if (!k.customer_code && !patch.customer_code) { patch.customer_code = r.customer_code } else notes.push(`추가 고객사 ID ${r.customer_code} (${r.company_name})`) }
    for (const f of ['contact_person', 'contact_phone', 'contact_email', 'company_type', 'billing_type', 'billing_start', 'invoice_email', 'invoice_contact', 'invoice_phone', 'business_reg_no', 'tax_invoice_email']) if (!k[f] && r[f] && !patch[f]) patch[f] = r[f]
    if (r.notes && r.notes !== k.notes) notes.push(`[합쳐진 ${r.company_name} 비고] ${r.notes}`)
  }
  // 남은 참조가 없는지 확인한 뒤 삭제
  for (const r of p.rest) {
    let left = 0
    for (const [t, col] of live) { const { count } = await sb.from(t).select(col, { head: true, count: 'exact' }).eq(col, r.id); left += count || 0 }
    if (left > 0) { console.log(`  ⚠ ${r.company_name}: 참조 ${left}건 남아 삭제 안 함`); failed++; continue }
    // customer_code UNIQUE 때문에 삭제 먼저
    const { error } = await sb.from('customers').delete().eq('id', r.id)
    if (error) { console.log(`  ❌ 삭제 실패 ${r.company_name}: ${error.message}`); failed++ } else merged++
  }
  if (notes.length) patch.notes = [k.notes, ...notes].filter(Boolean).join('\n')
  if (Object.keys(patch).length) { const { error } = await sb.from('customers').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', k.id); if (error) console.log(`  ❌ keeper 보강 실패 ${k.company_name}: ${error.message}`) }
}
console.log(`완료: 합쳐서 삭제 ${merged}, 문제 ${failed}`)
