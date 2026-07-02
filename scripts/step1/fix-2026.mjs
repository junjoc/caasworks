// 2026 재파싱 (col offset fix) + 롤백 + 재임포트
import { google } from 'googleapis'
import { readFileSync } from 'fs'
import { createClient } from '@supabase/supabase-js'

const env = readFileSync('.env.local', 'utf-8')
env.split('\n').forEach(l => { const m = l.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/); if (m) process.env[m[1]] = m[2].replace(/^"(.*)"$/, '$1').replace(/\\n/g, '\n') })
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

function getAuth() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_KEY || ''
  let credentials
  try { credentials = JSON.parse(raw) } catch { credentials = JSON.parse(Buffer.from(raw, 'base64').toString('utf-8')) }
  return new google.auth.GoogleAuth({ credentials, scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'] })
}
const sheets = google.sheets({ version: 'v4', auth: getAuth() })

const normalize = (s) => (s || '').toString().replace(/\s+/g, '').replace(/[()（）\-·・㈜]/g, '').toLowerCase()
const stripSuffix = (s) => (s || '').toString().replace(/\s*\((선납|선불|후불|후납|카드|현금)\)\s*$/g, '').trim()
const clean = v => (v || '').toString().trim() || null
function toMoney(v) { if (!v) return 0; if (typeof v === 'number') return Math.round(v); const n=parseFloat(String(v).replace(/[,₩원\s]/g,'')); return isNaN(n)?0:Math.round(n) }
function toDate(v) { if (!v) return null; const s=String(v).trim().replace(/\./g,'-').replace(/\s+/g,''); const m=s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/); return m?`${m[1]}-${m[2].padStart(2,'0')}-${m[3].padStart(2,'0')}`:null }

const SERVICE_MAP = {
  '플랫폼': '플랫폼', 'CCTV': 'AI CCTV', 'AI CCTV': 'AI CCTV',
  '운임비': '운임비', '근로자관리': '근로자관리',
  'Wearable Cam': 'Wearable Cam', '기타': '기타',
  '안전관리': '안전관리', '실시간 안전관리': '실시간 안전관리',
  'Story Book': 'Story Book', '편집studio': '편집studio',
  '풀타임 타임랩스': '풀타임 타임랩스', '기타 솔루션': '기타',
  'Mobile APP': 'Mobile APP',
}

async function fetchAll(t, cols, ff) { let all=[],size=1000; for(let f=0;;f+=size){let q=sb.from(t).select(cols).range(f,f+size-1); if(ff)q=ff(q); const {data,error}=await q; if(error)throw error; if(!data||!data.length)break; all=all.concat(data); if(data.length<size)break} return all }

// 1) Rollback 2026 excel_backfill
console.log('[1] 2026 excel_backfill 롤백...')
while (true) {
  const projs = await fetchAll('projects', 'id',
    q => q.eq('source', 'excel_backfill').limit(1000))
  // 2024/2025 도 excel_backfill 이므로 sheet_no 로 구분 어렵 → 방법 변경
  break
}
// year=2026 revenue 갖고 있는 excel_backfill projects 만 삭제
const p26 = await fetchAll('projects', 'id, sheet_no',
  q => q.eq('source', 'excel_backfill'))
// 각 project 의 revenue year 확인
const chunks = []
for (let i = 0; i < p26.length; i += 500) chunks.push(p26.slice(i, i + 500))
const p26_only = []
for (const chunk of chunks) {
  const { data, error } = await sb.from('monthly_revenues')
    .select('project_id')
    .eq('year', 2026)
    .in('project_id', chunk.map(p => p.id))
  if (error) { console.log(`  ❌ ${error.message}`); continue }
  const ids = new Set((data || []).map(r => r.project_id))
  p26_only.push(...chunk.filter(p => ids.has(p.id)))
}
console.log(`  2026-only excel_backfill projects: ${p26_only.length}`)
let deleted = 0
for (const p of p26_only) {
  const { error } = await sb.from('projects').delete().eq('id', p.id)
  if (!error) deleted++
  if (deleted % 200 === 0) process.stdout.write(`\r  ${deleted}/${p26_only.length}`)
}
console.log(`\n  ✅ ${deleted} 삭제 (CASCADE로 2026 revenue 함께 삭제)`)

// 2) 2026 시트 재파싱 (col 22 = 1월!)
console.log('\n[2] 2026 재파싱 (col offset fix)...')
const s26 = (await sheets.spreadsheets.values.get({
  spreadsheetId: '1ISGq9rkQe8LOlmS1-nCmWp95Lr34kpJ_jnp3OTaLFHQ',
  range: '현장별 전체 매출!A1:AZ5000',
})).data.values || []

const rows26 = []
let seq26 = 0
for (let i = 8; i < s26.length; i++) {
  const row = s26[i] || []
  const noRaw = row[1]
  const company = row[4]
  if (!noRaw && !company) continue
  if (typeof noRaw === 'string' && noRaw === '복사') continue
  if (!company || typeof company !== 'string' || !company.trim()) continue
  if (noRaw !== null && noRaw !== undefined && noRaw !== '' && typeof noRaw !== 'number' && isNaN(parseFloat(noRaw))) continue

  seq26++

  // FIX: 1월 = col 22 (0-idx), 6월 = col 27 (0-idx)
  const monthly = []
  for (let m = 0; m < 6; m++) {
    const amt = toMoney(row[22 + m])  // ← 21 → 22 fix
    if (amt !== 0) monthly.push({ month: m + 1, amount: amt })
  }

  rows26.push({
    sheet_no: seq26,
    company: company.trim(),
    project: clean(row[5]) || company.trim(),
    site_category: clean(row[6]),
    service: clean(row[8]),
    proj_start: toDate(row[2]),
    proj_end: toDate(row[3]),
    bill_start: toDate(row[9]),
    bill_end: toDate(row[10]),
    notes: clean(row[11]),
    billing_method: clean(row[13]),
    monthly,
  })
}
const totalMonthly = rows26.reduce((s,r) => s + r.monthly.reduce((a,m)=>a+m.amount,0), 0)
console.log(`  rows: ${rows26.length}, 1~6월 총액: ${totalMonthly.toLocaleString()}`)

// 3) customers 로드 + 신규 자동 추가
const customers = await fetchAll('customers', 'id, company_name')
const custByName = {}
for (const c of customers) { custByName[c.company_name] = c.id; custByName[normalize(c.company_name)] = c.id }
function findCust(company) { const s = stripSuffix(company); return custByName[company] || custByName[s] || custByName[normalize(company)] || custByName[normalize(s)] }
const misses = new Set()
for (const r of rows26) { if (!findCust(r.company)) misses.add(r.company.trim()) }
if (misses.size > 0) {
  console.log(`\n[3] 신규 customers 추가: ${misses.size}`)
  const { data } = await sb.from('customers').insert([...misses].map(n => ({ company_name: n, status: 'active' }))).select('id, company_name')
  for (const c of data || []) { custByName[c.company_name] = c.id; custByName[normalize(c.company_name)] = c.id }
  console.log(`  ✅ ${data?.length || 0}`)
}

// 4) INSERT
console.log('\n[4] projects + revenues INSERT...')
const projs = []
const revs = []
for (const r of rows26) {
  const custId = findCust(r.company)
  if (!custId) continue
  const dbSvc = r.service ? (SERVICE_MAP[r.service] || r.service) : null
  const name = dbSvc ? `${r.project} - ${dbSvc}` : r.project
  projs.push({
    _seq: r.sheet_no,
    customer_id: custId,
    project_name: name,
    service_type: dbSvc,
    site_category: r.site_category,
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
    revs.push({ customer_id: custId, _seq: r.sheet_no, year: 2026, month: m.month, amount: m.amount, is_confirmed: true })
  }
}

const seqToProjId = new Map()
let projInserted = 0
for (let i = 0; i < projs.length; i += 100) {
  const slice = projs.slice(i, i + 100)
  const payload = slice.map(p => { const { _seq, ...rest } = p; return rest })
  const { data, error } = await sb.from('projects').insert(payload).select('id')
  if (error) { console.log(`  ❌ ${error.message}`); continue }
  data.forEach((row, j) => seqToProjId.set(slice[j]._seq, row.id))
  projInserted += data.length
  process.stdout.write(`\r  proj ${projInserted}/${projs.length}`)
}
console.log(`\n  ✅ projects ${projInserted}`)

const payload = revs.map(r => ({
  customer_id: r.customer_id,
  project_id: seqToProjId.get(r._seq),
  year: r.year, month: r.month, amount: r.amount, is_confirmed: true,
})).filter(r => r.project_id)
let revInserted = 0
for (let i = 0; i < payload.length; i += 500) {
  const batch = payload.slice(i, i + 500)
  const { error } = await sb.from('monthly_revenues').insert(batch)
  if (error) console.log(`  ❌ ${error.message}`)
  else revInserted += batch.length
  process.stdout.write(`\r  rev ${revInserted}/${payload.length}`)
}
console.log(`\n  ✅ revenues ${revInserted}`)

// 5) 검증
const verify = await fetchAll('monthly_revenues', 'amount, month', q => q.eq('year', 2026))
const byMonth = {}
verify.forEach(r => { byMonth[r.month] = (byMonth[r.month] || 0) + Number(r.amount) })
console.log(`\n[검증] year=2026 rows: ${verify.length}`)
for (let m = 1; m <= 6; m++) console.log(`  ${m}월: ${(byMonth[m]||0).toLocaleString()}`)
const total = Object.values(byMonth).reduce((a,b)=>a+b,0)
console.log(`  1~6월 총액: ${total.toLocaleString()}`)
console.log(`  부가세 포함: ${Math.round(total * 1.1).toLocaleString()}`)
