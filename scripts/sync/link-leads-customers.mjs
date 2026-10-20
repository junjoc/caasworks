#!/usr/bin/env node
// 고객 생애주기 2단계 — 연결 정비 (2026-10-20)
//   1) 리드 ↔ 고객사: customer_id 가 비어 있는 리드를 고객사 ID(customer_code) → 회사명(정규화) 순으로 연결
//   2) 도입일: 도입완료인데 converted_at 이 비어 있으면 pipeline_history → audit_logs → 계약체결(CONTRACT) 활동 순으로 채움
//   비어 있는 칸만 채운다 (덮어쓰기·삭제 없음). 못 맞춘 도입완료 리드는 목록으로 출력
// usage: node scripts/sync/link-leads-customers.mjs [--live]
import { createClient } from '@supabase/supabase-js'
import { readFileSync, writeFileSync, mkdirSync } from 'fs'

readFileSync('.env.local', 'utf-8').split('\n').forEach(l => { const m = l.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/); if (m) process.env[m[1]] = m[2].replace(/^"(.*)"$/, '$1') })
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
const LIVE = process.argv.includes('--live')
const all = async q => { let a = []; for (let o = 0; ; o += 1000) { const { data, error } = await q().range(o, o + 999); if (error) throw new Error(error.message); a = a.concat(data || []); if (!data || data.length < 1000) break } return a }
// 회사명 정규화: 공백·괄호·㈜·주식회사 위치 차이를 무시
const norm = s => (s || '').replace(/\s+/g, '').replace(/[()（）\-·・㈜]/g, '').replace(/^주식회사|주식회사$|^유한회사|유한회사$/g, '').toLowerCase()

console.log(`[리드↔고객 연결 + 도입일 채우기] ${LIVE ? 'LIVE' : 'DRY-RUN'}\n`)
const leads = await all(() => sb.from('pipeline_leads').select('id, company_name, customer_code, customer_id, stage, inquiry_date, converted_at').order('id'))
const custs = await all(() => sb.from('customers').select('id, company_name, customer_code').order('id'))
const byCode = new Map(custs.filter(c => c.customer_code).map(c => [String(c.customer_code).trim(), c]))
const byName = new Map(); for (const c of custs) if (!byName.has(norm(c.company_name))) byName.set(norm(c.company_name), c)

// 1) 연결
const link = [], unmatchedWon = []
let viaCode = 0, viaName = 0
for (const l of leads) {
  if (l.customer_id) continue
  let c = l.customer_code ? byCode.get(String(l.customer_code).trim()) : null
  if (c) viaCode++
  else { c = byName.get(norm(l.company_name)); if (c) viaName++ }
  if (c) link.push({ id: l.id, customer_id: c.id, _lead: l.company_name, _cust: c.company_name, _stage: l.stage, _via: l.customer_code && byCode.get(String(l.customer_code).trim()) === c ? '고객사ID' : '회사명' })
  else if (l.stage === '도입완료') unmatchedWon.push(l)
}
const linkedWon = link.filter(x => x._stage === '도입완료').length
console.log(`리드 ${leads.length} (연결됨 ${leads.filter(l => l.customer_id).length}) → 새로 연결 ${link.length} (고객사 ID ${viaCode}, 회사명 ${viaName}) · 그중 도입완료 ${linkedWon}`)
const diffName = link.filter(x => x._lead.replace(/\s+/g, '') !== x._cust.replace(/\s+/g, ''))
console.log(`  이름이 다른데 연결되는 건 ${diffName.length} (확인용):`)
for (const x of diffName) console.log(`     [${x._via}] ${x._lead} → ${x._cust}${x._stage === '도입완료' ? ' *도입완료' : ''}`)
console.log(`  못 맞춘 도입완료 리드 ${unmatchedWon.length}: ` + unmatchedWon.map(l => `${l.company_name}(${l.customer_code || '코드없음'})`).join(' | '))

// 2) 도입일
const won = leads.filter(l => l.stage === '도입완료')
const need = won.filter(l => !l.converted_at)
const convAt = new Map(), src = new Map()
const keep = (id, t, s) => { if (t && (!convAt.has(id) || t > convAt.get(id))) { convAt.set(id, t); src.set(id, s) } }
const hist = await all(() => sb.from('pipeline_history').select('lead_id, changed_at').eq('field_changed', 'stage').eq('new_value', '도입완료').order('id'))
for (const h of hist) keep(h.lead_id, h.changed_at, 'history')
const aud = await all(() => sb.from('audit_logs').select('entity_id, performed_at').eq('entity_type', 'pipeline_leads').eq('changes->after->>stage', '도입완료').neq('changes->before->>stage', '도입완료').order('id'))
for (const a of aud) if (!convAt.has(a.entity_id)) keep(a.entity_id, a.performed_at, 'audit')
const ids = need.map(l => l.id)
for (let i = 0; i < ids.length; i += 100) {
  const { data } = await sb.from('activity_logs').select('lead_id, performed_at').in('lead_id', ids.slice(i, i + 100)).eq('activity_type', 'CONTRACT')
  for (const a of data || []) if (!convAt.has(a.lead_id)) keep(a.lead_id, a.performed_at, 'contract')
}
// 이력이 없는(시트에서 들어온) 리드: 연결된 고객사의 과금 시작일 → 그 고객사 프로젝트의 가장 이른 과금/프로젝트 시작일 → 첫 매출 월 (모두 유입일 이후인 것만)
const custIdOf = new Map(leads.filter(l => l.customer_id).map(l => [l.id, l.customer_id])); for (const x of link) custIdOf.set(x.id, x.customer_id)
const custBill = new Map((await all(() => sb.from('customers').select('id, billing_start').not('billing_start', 'is', null).order('id'))).map(c => [c.id, c.billing_start]))
const projs = await all(() => sb.from('projects').select('customer_id, billing_start, project_start').order('id'))
const projDates = new Map(); for (const p of projs) { const d = [p.billing_start, p.project_start].filter(Boolean); if (!d.length) continue; const l = projDates.get(p.customer_id) || []; l.push(...d); projDates.set(p.customer_id, l) }
const revs = await all(() => sb.from('monthly_revenues').select('customer_id, year, month').order('id'))
const revDates = new Map(); for (const r of revs) { const d = `${r.year}-${String(r.month).padStart(2, '0')}-01`; const l = revDates.get(r.customer_id) || []; l.push(d); revDates.set(r.customer_id, l) }
for (const l of need) {
  if (convAt.has(l.id)) continue
  const cid = custIdOf.get(l.id); if (!cid) continue
  const after = d => d && (!l.inquiry_date || d >= l.inquiry_date)
  const pick = (arr, s) => { const ok = (arr || []).filter(after).sort(); if (ok.length) { convAt.set(l.id, `${ok[0]}T00:00:00+09:00`); src.set(l.id, s); return true } return false }
  if (after(custBill.get(cid))) { convAt.set(l.id, `${custBill.get(cid)}T00:00:00+09:00`); src.set(l.id, '고객 과금시작일'); continue }
  if (pick(projDates.get(cid), '프로젝트 시작일')) continue
  pick(revDates.get(cid), '첫 매출월')
}
const fill = need.filter(l => convAt.has(l.id)).map(l => ({ id: l.id, converted_at: convAt.get(l.id), _src: src.get(l.id), _name: l.company_name, _inq: l.inquiry_date }))
const bySrc = {}; for (const f of fill) bySrc[f._src] = (bySrc[f._src] || 0) + 1
const still = need.filter(l => !convAt.has(l.id))
console.log(`\n도입완료 ${won.length}, 도입일 있음 ${won.length - need.length}, 채울 수 있음 ${fill.length}`, bySrc, `, 근거 없음 ${still.length}`)
const bad = fill.filter(f => f._inq && f.converted_at.slice(0, 10) < f._inq)
console.log(`  도입일이 유입일보다 빠른 건 ${bad.length}: ` + bad.slice(0, 8).map(f => `${f._name} 유입 ${f._inq} 도입 ${f.converted_at.slice(0, 10)}`).join(' | '))
console.log(`  근거 없는 건(유입일): ` + still.slice(0, 40).map(l => `${l.company_name} ${l.inquiry_date || ''}`).join(' | '))
console.log(`  예시: ` + fill.slice(0, 6).map(f => `${f._name} ${f._inq} → ${f.converted_at.slice(0, 10)} (${f._src})`).join(' | '))

if (!LIVE) { console.log('\n[DRY-RUN] --live 로 실행'); process.exit(0) }
mkdirSync('backups', { recursive: true })
const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 16)
writeFileSync(`backups/leads-link-${ts}.json`, JSON.stringify(leads))
console.log(`\n백업: backups/leads-link-${ts}.json`)
let a = 0, b = 0, fail = 0
for (const x of link) { const { error } = await sb.from('pipeline_leads').update({ customer_id: x.customer_id }).eq('id', x.id).is('customer_id', null); if (error) { fail++; console.log(`  ❌ ${x._lead}: ${error.message}`) } else a++ }
for (const x of fill) { const { error } = await sb.from('pipeline_leads').update({ converted_at: x.converted_at }).eq('id', x.id).is('converted_at', null); if (error) { fail++; console.log(`  ❌ ${x._name}: ${error.message}`) } else b++ }
console.log(`완료: 고객 연결 ${a}, 도입일 ${b}, 실패 ${fail}`)
