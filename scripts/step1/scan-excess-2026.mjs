#!/usr/bin/env node
// 진짜 여분 프로젝트: DB group size > 시트 group size 인 경우만
import { google } from 'googleapis'
import { readFileSync } from 'fs'
import { createClient } from '@supabase/supabase-js'

try {
  const env = readFileSync('.env.local', 'utf-8')
  env.split('\n').forEach(line => {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)
    if (m) process.env[m[1]] = m[2].replace(/^"(.*)"$/, '$1').replace(/\\n/g, '\n')
  })
} catch {}
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
function getAuth() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_KEY || ''
  let credentials
  try { credentials = JSON.parse(raw) } catch { credentials = JSON.parse(Buffer.from(raw, 'base64').toString('utf-8')) }
  return new google.auth.GoogleAuth({ credentials, scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'] })
}
const sheets = google.sheets({ version: 'v4', auth: getAuth() })
const clean = v => (v || '').toString().trim() || null
const normalize = (s) => (s || '').toString().replace(/\s+/g, '').replace(/[()（）\-·・㈜]/g, '').toLowerCase()
const stripSuffix = (s) => (s || '').toString().replace(/\s*\((선납|선불|후불|후납|카드|현금)\)\s*$/g, '').trim()
const SERVICE_MAP = { '플랫폼': '플랫폼', 'CCTV': 'AI CCTV', 'AI CCTV': 'AI CCTV', '운임비': '운임비', '근로자관리': '근로자관리', 'Wearable Cam': 'Wearable Cam', '기타': '기타', '안전관리': '안전관리', '실시간 안전관리': '실시간 안전관리', 'Story Book': 'Story Book', '편집studio': '편집studio', '풀타임 타임랩스': '풀타임 타임랩스', '기타 솔루션': '기타', 'Mobile APP': 'Mobile APP' }

async function fetchAll(t, cols, ff) {
  let all = [], size = 1000
  for (let f = 0; ; f += size) {
    let q = sb.from(t).select(cols).range(f, f + size - 1)
    if (ff) q = ff(q)
    const { data, error } = await q
    if (error) throw error
    if (!data || !data.length) break
    all = all.concat(data); if (data.length < size) break
  }
  return all
}

// 시트
const s26 = (await sheets.spreadsheets.values.get({
  spreadsheetId: '1ISGq9rkQe8LOlmS1-nCmWp95Lr34kpJ_jnp3OTaLFHQ',
  range: `현장별 전체 매출!A1:AZ5000`,
})).data.values || []

// 고객
const customers = await fetchAll('customers', 'id, company_name')
const custByName = {}
for (const c of customers) { custByName[c.company_name] = c.id; custByName[normalize(c.company_name)] = c.id }
function findCust(company) {
  const stripped = stripSuffix(company)
  return custByName[company] || custByName[stripped] || custByName[normalize(company)] || custByName[normalize(stripped)]
}

// 시트 group count
const sheetCount = new Map()
let seq = 0
for (let i = 8; i < s26.length; i++) {
  const row = s26[i] || []
  const noRaw = row[1]; const company = row[4]
  if (!noRaw && !company) continue
  if (typeof noRaw === 'string' && noRaw === '복사') continue
  if (!company || typeof company !== 'string' || !company.trim()) continue
  if (noRaw !== null && noRaw !== undefined && noRaw !== '' && typeof noRaw !== 'number' && isNaN(parseFloat(noRaw))) continue
  seq++
  const custId = findCust(company.trim())
  if (!custId) continue
  const project = clean(row[5]) || company.trim()
  const service = clean(row[8])
  const dbSvc = service ? (SERVICE_MAP[service] || service) : null
  const projectName = dbSvc ? `${project} - ${dbSvc}` : project
  const key = `${custId}||${projectName}`
  sheetCount.set(key, (sheetCount.get(key) || 0) + 1)
}

// DB group
const projs = await fetchAll(
  'projects',
  'id, sheet_no, customer_id, project_name, customer:customers(company_name), revenues:monthly_revenues!inner(year, month, amount)',
  q => q.eq('revenues.year', 2026).eq('source', 'excel_backfill')
)
const dbGroups = new Map()
for (const p of projs) {
  const key = `${p.customer_id}||${p.project_name}`
  if (!dbGroups.has(key)) dbGroups.set(key, [])
  dbGroups.get(key).push(p)
}

// 여분 스캔
let excessTotal = 0
const excessDetails = []
for (const [key, list] of dbGroups) {
  const sheetN = sheetCount.get(key) || 0
  const dbN = list.length
  if (dbN > sheetN) {
    excessTotal += dbN - sheetN
    // sheet_no ASC 정렬 → 처음 sheetN 개가 정본, 나머지가 여분
    list.sort((a, b) => Number(a.sheet_no) - Number(b.sheet_no))
    const canonicals = list.slice(0, sheetN)
    const extras = list.slice(sheetN)
    excessDetails.push({
      company: list[0].customer?.company_name || 'null',
      projectName: list[0].project_name,
      sheetN, dbN,
      canonicals: canonicals.map(p => ({ id: p.id, sheet_no: p.sheet_no, rev_sum: p.revenues.filter(r=>r.year===2026).reduce((s,r)=>s+r.amount,0), rev_count: p.revenues.filter(r=>r.year===2026).length })),
      extras: extras.map(p => ({ id: p.id, sheet_no: p.sheet_no, rev_sum: p.revenues.filter(r=>r.year===2026).reduce((s,r)=>s+r.amount,0), rev_count: p.revenues.filter(r=>r.year===2026).length })),
    })
  }
}

console.log(`총 DB projects: ${projs.length}`)
console.log(`총 여분 프로젝트: ${excessTotal}개`)
console.log(`여분이 있는 그룹: ${excessDetails.length}`)

let excessRevTotal = 0
let excessRevCount = 0
for (const d of excessDetails) {
  for (const x of d.extras) { excessRevTotal += x.rev_sum; excessRevCount += x.rev_count }
}
console.log(`여분 프로젝트에 걸린 2026 매출: ${excessRevCount} rows, ${excessRevTotal.toLocaleString()} 원`)

console.log(`\n[샘플 상위 10 - 여분 개수 큰 순]`)
excessDetails.sort((a, b) => (b.dbN - b.sheetN) - (a.dbN - a.sheetN))
for (const d of excessDetails.slice(0, 10)) {
  console.log(`  ${d.company.substring(0,15).padEnd(15)}  ${d.projectName?.substring(0,45).padEnd(45)}  시트=${d.sheetN}, DB=${d.dbN}, 여분=${d.dbN - d.sheetN}`)
  for (const x of d.extras) {
    console.log(`    여분 sheet_no=${x.sheet_no}, 매출rows=${x.rev_count}, 매출합=${x.rev_sum.toLocaleString()}`)
  }
}
