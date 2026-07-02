#!/usr/bin/env node
// v4 재임포트 — 3개 시트 (2024/2025/2026)

import { readFileSync } from 'fs'
import { createClient } from '@supabase/supabase-js'

const env = readFileSync('.env.local', 'utf-8')
env.split('\n').forEach(l => { const m = l.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/); if (m) process.env[m[1]] = m[2].replace(/^"(.*)"$/, '$1') })
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

const LIVE = process.argv.includes('--live')

const normalize = (s) => (s || '').toString().replace(/\s+/g, '').replace(/[()（）\-·・㈜]/g, '').toLowerCase()
const stripSuffix = (s) => (s || '').toString().replace(/\s*\((선납|선불|후불|후납|카드|현금)\)\s*$/g, '').trim()

const SERVICE_MAP = {
  '플랫폼': '플랫폼', 'CCTV': 'AI CCTV', 'AI CCTV': 'AI CCTV',
  '운임비': '운임비', '근로자관리': '근로자관리',
  'Wearable Cam': 'Wearable Cam', '기타': '기타',
  '안전관리': '안전관리', '실시간 안전관리': '실시간 안전관리',
  'Story Book': 'Story Book', '편집studio': '편집studio',
  '풀타임 타임랩스': '풀타임 타임랩스', '기타 솔루션': '기타',
  'Mobile APP': 'Mobile APP',
}

async function fetchAll(t, cols, ff) {
  let all = [], size = 1000
  for (let f = 0; ; f += size) {
    let q = sb.from(t).select(cols).range(f, f + size - 1)
    if (ff) q = ff(q)
    const { data, error } = await q
    if (error) throw new Error(error.message)
    if (!data || !data.length) break
    all = all.concat(data)
    if (data.length < size) break
  }
  return all
}

console.log(`[v4 재임포트] ${LIVE ? 'LIVE' : 'DRY-RUN'}\n`)

const data24 = JSON.parse(readFileSync('/tmp/2024_v4.json', 'utf-8'))
const data25 = JSON.parse(readFileSync('/tmp/2025_v4.json', 'utf-8'))
const data26 = JSON.parse(readFileSync('/tmp/2026_v4.json', 'utf-8'))
console.log(`2024: ${data24.length}, 2025: ${data25.length}, 2026: ${data26.length}`)

const customers = await fetchAll('customers', 'id, company_name')
const custByName = {}
for (const c of customers) {
  custByName[c.company_name] = c.id
  custByName[normalize(c.company_name)] = c.id
}
function findCust(company) {
  const stripped = stripSuffix(company)
  return custByName[company] || custByName[stripped]
    || custByName[normalize(company)] || custByName[normalize(stripped)]
}

function buildImport(data, year) {
  const projs = []
  const revs = []
  const misses = new Set()
  for (const r of data) {
    let custId = findCust(r.company)
    if (!custId) { misses.add(r.company); continue }
    let dbSvc = null
    if (r.service) dbSvc = SERVICE_MAP[r.service] || r.service
    const projectName = dbSvc ? `${r.project} - ${dbSvc}` : r.project
    projs.push({
      _sheet_no: r.sheet_no,
      customer_id: custId,
      project_name: projectName,
      service_type: dbSvc,
      site_category: r.site_category || r.company_type || null,
      project_start: r.proj_start,
      project_end: r.proj_end,
      billing_start: r.bill_start,
      billing_end: r.bill_end,
      billing_method: r.billing_method,
      notes: r.notes,
      status: 'active',
      source: 'excel_backfill',
      sheet_no: r.sheet_no,
    })
    for (const m of r.monthly) {
      revs.push({
        customer_id: custId,
        _sheet_no: r.sheet_no,
        year,
        month: m.month,
        amount: m.amount,
        is_confirmed: true,
      })
    }
  }
  return { projs, revs, misses }
}

// 사전: 매칭 실패 회사 자동 등록
async function ensureCustomers(datasets) {
  const allMisses = new Set()
  for (const d of datasets) {
    for (const r of d) {
      if (!findCust(r.company)) allMisses.add(r.company.trim())
    }
  }
  if (allMisses.size === 0) return
  console.log(`\n[사전] 신규 customers 추가: ${allMisses.size}개`)
  if (!LIVE) {
    console.log(`  [DRY-RUN] ${[...allMisses].slice(0, 5).join(', ')}${allMisses.size > 5 ? ', ...' : ''}`)
    return
  }
  const payload = [...allMisses].map(name => ({ company_name: name, status: 'active' }))
  const { data, error } = await sb.from('customers').insert(payload).select('id, company_name')
  if (error) { console.log(`  ❌ ${error.message}`); return }
  for (const c of data) {
    custByName[c.company_name] = c.id
    custByName[normalize(c.company_name)] = c.id
  }
  console.log(`  ✅ ${data.length}개 추가됨`)
}

await ensureCustomers([data24, data25, data26])

const b24 = buildImport(data24, 2024)
const b25 = buildImport(data25, 2025)
const b26 = buildImport(data26, 2026)

console.log(`\n2024: projects=${b24.projs.length}, revenues=${b24.revs.length}, misses=${b24.misses.size}`)
console.log(`2025: projects=${b25.projs.length}, revenues=${b25.revs.length}, misses=${b25.misses.size}`)
console.log(`2026: projects=${b26.projs.length}, revenues=${b26.revs.length}, misses=${b26.misses.size}`)

const tot24 = b24.revs.reduce((s,r) => s + r.amount, 0)
const tot25 = b25.revs.reduce((s,r) => s + r.amount, 0)
const tot26 = b26.revs.reduce((s,r) => s + r.amount, 0)
console.log(`\n예상 매출:`)
console.log(`  2024 (VAT 제외): ${tot24.toLocaleString()}   × 1.1 = ${Math.round(tot24 * 1.1).toLocaleString()}`)
console.log(`  2025 (VAT 제외): ${tot25.toLocaleString()}   × 1.1 = ${Math.round(tot25 * 1.1).toLocaleString()}`)
console.log(`  2026 (1~6월):    ${tot26.toLocaleString()}   × 1.1 = ${Math.round(tot26 * 1.1).toLocaleString()}`)

if (!LIVE) {
  console.log(`\n[DRY-RUN] --live`)
  process.exit(0)
}

async function importGroup(projs, revs, label) {
  console.log(`\n[${label}] projects...`)
  const map = new Map()
  let projInserted = 0
  for (let i = 0; i < projs.length; i += 100) {
    const slice = projs.slice(i, i + 100)
    const payload = slice.map(p => { const { _sheet_no, ...rest } = p; return rest })
    const { data, error } = await sb.from('projects').insert(payload).select('id')
    if (error) { console.log(`  ❌ ${error.message}`); continue }
    data.forEach((row, j) => map.set(slice[j]._sheet_no, row.id))
    projInserted += data.length
    process.stdout.write(`\r  ${projInserted}/${projs.length}`)
  }
  console.log(`\n  ✅ ${projInserted}/${projs.length}`)

  console.log(`[${label}] revenues...`)
  const payload = revs.map(r => ({
    customer_id: r.customer_id,
    project_id: map.get(r._sheet_no),
    year: r.year,
    month: r.month,
    amount: r.amount,
    is_confirmed: r.is_confirmed,
  })).filter(r => r.project_id)
  let revInserted = 0
  for (let i = 0; i < payload.length; i += 500) {
    const batch = payload.slice(i, i + 500)
    const { error } = await sb.from('monthly_revenues').insert(batch)
    if (error) console.log(`\n  ❌ ${error.message}`)
    else revInserted += batch.length
    process.stdout.write(`\r  ${revInserted}/${payload.length}`)
  }
  console.log(`\n  ✅ ${revInserted}/${payload.length}`)
}

await importGroup(b26.projs, b26.revs, '2026')
await importGroup(b25.projs, b25.revs, '2025')
await importGroup(b24.projs, b24.revs, '2024')

console.log(`\n[검증]`)
for (const y of [2024, 2025, 2026]) {
  const verify = await fetchAll('monthly_revenues', 'amount', q => q.eq('year', y))
  const sum = verify.reduce((s, r) => s + Number(r.amount), 0)
  console.log(`  year=${y}: ${verify.length}행, ${sum.toLocaleString()}원 (부가세 포함: ${Math.round(sum * 1.1).toLocaleString()}원)`)
}
console.log(`\n[Done]`)
