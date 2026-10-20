#!/usr/bin/env node
// 2026 매출 현황 갱신 — 사용자가 공유한 엑셀 파일 기준 (구글 시트 API 사용 안 함). 2026-10-20
// 시트: "현장별 전체 매출". 규칙은 7/2 의 upsert-2026-later / rebuild-2026 와 같다:
//   - 데이터 행 = 9행부터, 회사명 있는 행. seq(행 순번) = projects.sheet_no
//   - 프로젝트 매칭: (customer_id, "프로젝트명 - 서비스") → 없으면 신규 insert (source='excel_backfill', sheet_year=2026)
//   - 매출: (project_id, 2026, month) upsert. 시트에서 0 이 된 달은 DB 행 삭제 (백업 후)
//   - 시트에 없어진 DB 프로젝트는 지우지 않고 목록만 보고
// usage: node scripts/sync/sync-revenue-2026-xlsx.mjs "<xlsx 경로>" [--live]
import { createClient } from '@supabase/supabase-js'
import { readFileSync, writeFileSync, mkdirSync } from 'fs'
import XLSX from 'xlsx'

readFileSync('.env.local', 'utf-8').split('\n').forEach(l => { const m = l.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/); if (m) process.env[m[1]] = m[2].replace(/^"(.*)"$/, '$1') })
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
const FILE = process.argv.find(a => a.endsWith('.xlsx'))
const LIVE = process.argv.includes('--live')
const PRUNE = process.argv.includes('--prune-orphans') // 시트에 없어진 DB 프로젝트의 2026 매출 삭제 (프로젝트 행은 유지)
const YEAR = 2026
if (!FILE) { console.log('usage: node scripts/sync/sync-revenue-2026-xlsx.mjs "<xlsx>" [--live]'); process.exit(1) }

const toMoney = v => (v == null || v === '' ? 0 : typeof v === 'number' ? Math.round(v) : (Number.isNaN(parseFloat(String(v).replace(/[,₩원\s]/g, ''))) ? 0 : Math.round(parseFloat(String(v).replace(/[,₩원\s]/g, '')))))
const excelDate = v => { if (typeof v === 'number') { const d = XLSX.SSF.parse_date_code(v); return d ? `${d.y}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}` : null } const s = String(v || '').trim().replace(/\./g, '-').replace(/\s+/g, ''); const m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/); return m ? `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}` : null }
const clean = v => (v == null ? null : String(v).trim() || null)
const normalize = s => (s || '').toString().replace(/\s+/g, '').replace(/[()（）\-·・㈜]/g, '').replace(/^주식회사|주식회사$|^유한회사|유한회사$/g, '').toLowerCase()
const stripSuffix = s => (s || '').toString().replace(/\s*\((선납|선불|후불|후납|카드|현금)\)\s*$/g, '').trim()
const SERVICE_MAP = { '플랫폼': '플랫폼', 'CCTV': 'AI CCTV', 'AI CCTV': 'AI CCTV', '운임비': '운임비', '근로자관리': '근로자관리', 'Wearable Cam': 'Wearable Cam', '기타': '기타', '안전관리': '안전관리', '실시간 안전관리': '실시간 안전관리', 'Story Book': 'Story Book', '편집studio': '편집studio', '풀타임 타임랩스': '풀타임 타임랩스', '기타 솔루션': '기타', 'Mobile APP': 'Mobile APP' }

async function fetchAll(t, cols, ff) {
  let all = []
  for (let f = 0; ; f += 1000) {
    let q = sb.from(t).select(cols).order('id').range(f, f + 999)
    if (ff) q = ff(q)
    const { data, error } = await q
    if (error) throw new Error(error.message)
    all = all.concat(data || [])
    if (!data || data.length < 1000) break
  }
  return all
}

console.log(`[2026 매출 갱신 (xlsx)] ${LIVE ? 'LIVE' : 'DRY-RUN'}  파일: ${FILE}\n`)

// 1. 시트 파싱
const wb = XLSX.readFile(FILE)
const ws = wb.Sheets['현장별 전체 매출']
if (!ws) throw new Error('"현장별 전체 매출" 시트 없음')
const grid = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null, raw: true })
const hiddenRows = new Set((ws['!rows'] || []).map((r, i) => (r && r.hidden ? i : -1)).filter(i => i >= 0))
// 월 열 위치는 "1월" 헤더로 찾는다 (7월엔 W열(22)이었는데 지금은 V열(21) — 열이 하나 빠짐)
const hdrRow = grid.slice(0, 8).find(r => r && r.includes('1월'))
const M0 = hdrRow ? hdrRow.indexOf('1월') : 21
console.log(`월 열 시작: index ${M0} (${XLSX.utils.encode_col(M0)}열)`)
const rows = []
let seq = 0, hiddenSkipped = 0
for (let i = 8; i < grid.length; i++) {
  const row = grid[i] || []
  const noRaw = row[1], company = row[4]
  if (!noRaw && !company) continue
  if (noRaw === '복사') continue
  if (!company || typeof company !== 'string' || !company.trim()) continue
  if (noRaw != null && noRaw !== '' && typeof noRaw !== 'number' && Number.isNaN(parseFloat(noRaw))) continue
  if (hiddenRows.has(i)) { hiddenSkipped++; continue }
  seq++
  const monthly = []
  for (let m = 0; m < 12; m++) { const amt = toMoney(row[M0 + m]); if (amt !== 0) monthly.push({ month: m + 1, amount: amt }) }
  rows.push({
    sheet_no: seq, original_no: noRaw, company: company.trim(), project: clean(row[5]) || company.trim(),
    site_category: clean(row[6]), site_category2: clean(row[7]), service: clean(row[8]),
    proj_start: excelDate(row[2]), proj_end: excelDate(row[3]), bill_start: excelDate(row[9]), bill_end: excelDate(row[10]),
    notes: clean(row[11]), billing_method: clean(row[13]), monthly,
  })
}
const sheetMonth = Array(12).fill(0)
for (const r of rows) for (const m of r.monthly) sheetMonth[m.month - 1] += m.amount
console.log(`시트 데이터 행 ${rows.length} (숨김 ${hiddenSkipped})  매출 셀 ${rows.reduce((a, r) => a + r.monthly.length, 0)}  합계 ${sheetMonth.reduce((a, b) => a + b, 0).toLocaleString()}`)
// 시트 7행 "합계" 와 대조
const sheetTotalRow = grid[6] || []
console.log('월  | 시트 합계행       | 파싱 합계         | 차이')
for (let m = 0; m < 12; m++) { const t = toMoney(sheetTotalRow[M0 + m]); const d = sheetMonth[m] - t; console.log(` ${String(m + 1).padStart(2)} | ${t.toLocaleString().padStart(16)} | ${sheetMonth[m].toLocaleString().padStart(16)} | ${d.toLocaleString()} ${Math.abs(d) < 1 ? '✅' : '❌'}`) }

// 2. 고객·프로젝트 매칭
const customers = await fetchAll('customers', 'id, company_name')
const custByName = {}
for (const c of customers) { custByName[c.company_name] = c.id; custByName[normalize(c.company_name)] = c.id }
const findCust = co => { const s = stripSuffix(co); return custByName[co] || custByName[s] || custByName[normalize(co)] || custByName[normalize(s)] }
const missCustomers = new Set(rows.filter(r => !findCust(r.company)).map(r => r.company))

const projs = await fetchAll('projects', 'id, sheet_no, sheet_year, customer_id, project_name, service_type, source', q => q.eq('source', 'excel_backfill'))
// 같은 (고객, 프로젝트명) 이 여러 행인 경우(카메라 2대 등)가 있어서 sheet_no 순 목록으로 두고 시트 순서대로 하나씩 짝짓는다
const projByKey = new Map()
for (const p of projs.sort((a, b) => (a.sheet_year === YEAR ? 0 : 1) - (b.sheet_year === YEAR ? 0 : 1) || (a.sheet_no || 0) - (b.sheet_no || 0))) {
  const k = `${p.customer_id}||${p.project_name}`
  if (!projByKey.has(k)) projByKey.set(k, [])
  projByKey.get(k).push(p)
}
const takeProj = k => { const l = projByKey.get(k); return l && l.length ? l.shift() : null }
const dbRevs = await fetchAll('monthly_revenues', 'id, project_id, month, amount', q => q.eq('year', YEAR))
const dbRevByKey = new Map(dbRevs.map(r => [`${r.project_id}|${r.month}`, r]))
const dbMonth = Array(12).fill(0); for (const r of dbRevs) dbMonth[r.month - 1] += Number(r.amount)

const plan = { upsert: [], unchanged: 0, newProjects: [], seqUpdate: [], deleteRevs: [], missingInSheet: [], renamed: [] }
const seenProj = new Set()
// 이름이 바뀐 행: 같은 고객의 같은 sheet_no(7월 순번) 프로젝트가 아직 짝이 없으면 이름 변경으로 본다
const bySeq = new Map(projs.filter(p => p.sheet_year === YEAR && p.sheet_no != null).map(p => [`${p.customer_id}|${p.sheet_no}`, p]))
const firstPass = []
for (const r of rows) {
  const custId = findCust(r.company)
  const dbSvc = r.service ? (SERVICE_MAP[r.service] || r.service) : null
  const projectName = dbSvc ? `${r.project} - ${dbSvc}` : r.project
  const p = custId ? takeProj(`${custId}||${projectName}`) : null
  if (p) seenProj.add(p.id)
  firstPass.push({ r, custId, dbSvc, projectName, p })
}
for (const x of firstPass) {
  if (!x.p && x.custId) {
    const cand = bySeq.get(`${x.custId}|${x.r.sheet_no}`)
    if (cand && !seenProj.has(cand.id)) {
      x.p = cand; seenProj.add(cand.id)
      plan.renamed.push({ id: cand.id, from: cand.project_name, to: x.projectName, service_type: x.dbSvc, sheet_no: x.r.sheet_no })
    }
  }
}
for (const { r, custId, dbSvc, projectName, p } of firstPass) {
  if (!p) { plan.newProjects.push({ r, custId, projectName, dbSvc }); continue }
  if (p.sheet_no !== r.sheet_no || p.sheet_year !== YEAR) plan.seqUpdate.push({ id: p.id, sheet_no: r.sheet_no })
  const sheetMonths = new Set()
  for (const m of r.monthly) {
    sheetMonths.add(m.month)
    const ex = dbRevByKey.get(`${p.id}|${m.month}`)
    if (ex && Number(ex.amount) === m.amount) plan.unchanged++
    else plan.upsert.push({ project_id: p.id, customer_id: p.customer_id, year: YEAR, month: m.month, amount: m.amount, is_confirmed: true, _name: `${r.company} / ${projectName}`, _old: ex ? Number(ex.amount) : null })
  }
  for (let m = 1; m <= 12; m++) { const ex = dbRevByKey.get(`${p.id}|${m}`); if (ex && !sheetMonths.has(m)) plan.deleteRevs.push({ ...ex, _name: `${r.company} / ${projectName}` }) }
}
// 시트에 없는 DB 프로젝트 (2026 매출 있는 것만)
const projWithRev = new Set(dbRevs.map(r => r.project_id))
for (const p of projs) if (projWithRev.has(p.id) && !seenProj.has(p.id)) {
  const sumRev = dbRevs.filter(r => r.project_id === p.id).reduce((a, r) => a + Number(r.amount), 0)
  plan.missingInSheet.push({ id: p.id, name: p.project_name, sheet_no: p.sheet_no, sumRev })
}

const newRevCount = plan.newProjects.reduce((a, n) => a + n.r.monthly.length, 0)
const newRevSum = plan.newProjects.reduce((a, n) => a + n.r.monthly.reduce((x, m) => x + m.amount, 0), 0)
console.log(`\n변경 계획`)
console.log(`  신규 고객 생성: ${missCustomers.size}  ${[...missCustomers].slice(0, 15).join(', ')}${missCustomers.size > 15 ? ' …' : ''}`)
console.log(`  신규 프로젝트: ${plan.newProjects.length} (매출 ${newRevCount}건 ${newRevSum.toLocaleString()}원)`)
console.log(`  매출 변경/추가 (기존 프로젝트): ${plan.upsert.length}  / 그대로: ${plan.unchanged}`)
console.log(`  매출 삭제 (시트에서 0 이 됨): ${plan.deleteRevs.length}  ${plan.deleteRevs.reduce((a, r) => a + Number(r.amount), 0).toLocaleString()}원`)
console.log(`  sheet_no 재정렬: ${plan.seqUpdate.length}`)
console.log(`  이름 변경(같은 고객·같은 순번): ${plan.renamed.length}`)
for (const x of plan.renamed.slice(0, 12)) console.log(`     - #${x.sheet_no} ${x.from} → ${x.to}`)
const orphanSum = plan.missingInSheet.reduce((a, m) => a + m.sumRev, 0)
console.log(`  시트에 없는 DB 프로젝트(2026 매출 있음): ${plan.missingInSheet.length}  매출 ${orphanSum.toLocaleString()}원  → ${PRUNE ? '2026 매출 삭제(--prune-orphans)' : '건드리지 않음'}`)
for (const m of plan.missingInSheet.slice(0, 20)) console.log(`     - ${m.name} (sheet_no ${m.sheet_no}, ${m.sumRev.toLocaleString()}원)`)
console.log(`\n월  | DB 현재           | 시트              | 차이`)
for (let m = 0; m < 12; m++) console.log(` ${String(m + 1).padStart(2)} | ${dbMonth[m].toLocaleString().padStart(16)} | ${sheetMonth[m].toLocaleString().padStart(16)} | ${(sheetMonth[m] - dbMonth[m]).toLocaleString()}`)
console.log(` 합 | ${dbMonth.reduce((a, b) => a + b, 0).toLocaleString().padStart(16)} | ${sheetMonth.reduce((a, b) => a + b, 0).toLocaleString().padStart(16)}`)
const changedByMonth = Array(12).fill(0); for (const u of plan.upsert) changedByMonth[u.month - 1]++
console.log(`\n변경 건수(월): ${changedByMonth.map((n, i) => `${i + 1}월 ${n}`).join(', ')}`)
console.log(`예시 (변경 10건):`); for (const u of plan.upsert.slice(0, 10)) console.log(`   ${u.month}월 ${u._name}: ${u._old == null ? '없음' : u._old.toLocaleString()} → ${u.amount.toLocaleString()}`)
console.log(`예시 (삭제 10건):`); for (const d of plan.deleteRevs.slice(0, 10)) console.log(`   ${d.month}월 ${d._name}: ${Number(d.amount).toLocaleString()} → 0`)

if (!LIVE) { console.log('\n[DRY-RUN] --live 로 실행'); process.exit(0) }

// ===== LIVE =====
mkdirSync('backups', { recursive: true })
const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 16)
const bpath = `backups/revenue-2026-${ts}.json`
writeFileSync(bpath, JSON.stringify({ projects: projs, monthly_revenues: dbRevs, customers_count: customers.length }, null, 0))
console.log(`\n백업: ${bpath}`)

for (const name of missCustomers) {
  const { data, error } = await sb.from('customers').insert({ company_name: name, status: 'active', notes: '매출 시트에서 자동 생성 (2026-10-20)' }).select('id').single()
  if (error) { console.log(`  ❌ 고객 생성 실패 ${name}: ${error.message}`); continue }
  custByName[name] = data.id; custByName[normalize(name)] = data.id
}
let projCreated = 0, revFromNew = []
for (const n of plan.newProjects) {
  const custId = n.custId || findCust(n.r.company)
  if (!custId) { console.log(`  ❌ 고객 없음: ${n.r.company}`); continue }
  const { data, error } = await sb.from('projects').insert({
    customer_id: custId, project_name: n.projectName, service_type: n.dbSvc, site_category: n.r.site_category, site_category2: n.r.site_category2,
    project_start: n.r.proj_start, project_end: n.r.proj_end, billing_start: n.r.bill_start, billing_end: n.r.bill_end,
    notes: n.r.notes, status: 'active', source: 'excel_backfill', sheet_no: n.r.sheet_no, sheet_year: YEAR,
  }).select('id').single()
  if (error) { console.log(`  ❌ 프로젝트 생성 실패 ${n.projectName}: ${error.message}`); continue }
  projCreated++
  for (const m of n.r.monthly) revFromNew.push({ project_id: data.id, customer_id: custId, year: YEAR, month: m.month, amount: m.amount, is_confirmed: true })
}
console.log(`  신규 프로젝트 ${projCreated}`)
const ups = [...plan.upsert.map(({ _name, _old, ...u }) => u), ...revFromNew]
let upserted = 0
for (let i = 0; i < ups.length; i += 500) {
  const { error } = await sb.from('monthly_revenues').upsert(ups.slice(i, i + 500), { onConflict: 'project_id,year,month' })
  if (error) { console.log(`  ❌ upsert ${i}: ${error.message}`); process.exit(1) }
  upserted += Math.min(500, ups.length - i)
}
console.log(`  매출 upsert ${upserted}`)
if (plan.deleteRevs.length) {
  const ids = plan.deleteRevs.map(d => d.id)
  for (let i = 0; i < ids.length; i += 200) { const { error } = await sb.from('monthly_revenues').delete().in('id', ids.slice(i, i + 200)); if (error) { console.log(`  ❌ delete: ${error.message}`); process.exit(1) } }
  console.log(`  매출 삭제 ${ids.length}`)
}
for (const x of plan.renamed) { const { error } = await sb.from('projects').update({ project_name: x.to, service_type: x.service_type }).eq('id', x.id); if (error) console.log(`  ❌ 이름 변경 ${x.to}: ${error.message}`) }
console.log(`  이름 변경 ${plan.renamed.length}`)
if (PRUNE && plan.missingInSheet.length) {
  const ids = plan.missingInSheet.map(m => m.id)
  for (let i = 0; i < ids.length; i += 100) { const { error } = await sb.from('monthly_revenues').delete().eq('year', YEAR).in('project_id', ids.slice(i, i + 100)); if (error) { console.log(`  ❌ orphan delete: ${error.message}`); process.exit(1) } }
  console.log(`  시트에 없는 프로젝트 ${ids.length}개의 2026 매출 삭제`)
}
let seqDone = 0
for (const s of plan.seqUpdate) { const { error } = await sb.from('projects').update({ sheet_no: s.sheet_no, sheet_year: YEAR }).eq('id', s.id); if (!error) seqDone++ }
console.log(`  sheet_no 재정렬 ${seqDone}`)

// 검증
const after = await fetchAll('monthly_revenues', 'month, amount', q => q.eq('year', YEAR))
const am = Array(12).fill(0); for (const r of after) am[r.month - 1] += Number(r.amount)
console.log(`\n검증  월 | 시트 | DB | 차이`)
let allOk = true
for (let m = 0; m < 12; m++) { const d = sheetMonth[m] - am[m]; if (Math.abs(d) >= 1) allOk = false; console.log(` ${String(m + 1).padStart(2)} | ${sheetMonth[m].toLocaleString().padStart(16)} | ${am[m].toLocaleString().padStart(16)} | ${d.toLocaleString()} ${Math.abs(d) < 1 ? '✅' : '❌'}`) }
console.log(allOk ? '전 월 일치 ✅' : '차이 있음 ❌ — 시트에 없는 DB 프로젝트 매출일 수 있음 (위 목록)')
