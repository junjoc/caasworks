#!/usr/bin/env node
// 2026 프로젝트의 sheet_no 를 현재 시트의 seq(row 순번) 로 재정렬
// 목적: 시트-CRM 순서 일치 (CRM 은 sheet_no DESC 이므로 시트 역순으로 표시됨)
// 대상: 2026 매출 있는 프로젝트만 (매출 없는 것은 CRM 에 안 뜨므로 무관)
// 파괴 없음 — 오직 sheet_no 필드만 UPDATE.

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

const LIVE = process.argv.includes('--live')
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

console.log(`[2026 sheet_no 재정렬] ${LIVE ? 'LIVE' : 'DRY-RUN'}\n`)

// 1. 시트 파싱 → (customer_name, computed_project_name) → seq
const s26 = (await sheets.spreadsheets.values.get({
  spreadsheetId: '1ISGq9rkQe8LOlmS1-nCmWp95Lr34kpJ_jnp3OTaLFHQ',
  range: `현장별 전체 매출!A1:AZ5000`,
})).data.values || []

const sheetRows = []
let seq = 0
for (let i = 8; i < s26.length; i++) {
  const row = s26[i] || []
  const noRaw = row[1]
  const company = row[4]
  if (!noRaw && !company) continue
  if (typeof noRaw === 'string' && noRaw === '복사') continue
  if (!company || typeof company !== 'string' || !company.trim()) continue
  if (noRaw !== null && noRaw !== undefined && noRaw !== '' && typeof noRaw !== 'number' && isNaN(parseFloat(noRaw))) continue

  seq++
  const project = clean(row[5]) || company.trim()
  const service = clean(row[8])
  const dbSvc = service ? (SERVICE_MAP[service] || service) : null
  const projectName = dbSvc ? `${project} - ${dbSvc}` : project

  sheetRows.push({
    seq,
    company: company.trim(),
    projectName,
  })
}
console.log(`시트 rows: ${sheetRows.length}, seq 범위: 1 ~ ${seq}`)

// 2. 고객 매핑
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

// 3. 시트: (customer_id + project_name) → [seq1, seq2, ...] (중복 순서 보존)
const seqLists = new Map()
let seqMissCust = 0
for (const r of sheetRows) {
  const custId = findCust(r.company)
  if (!custId) { seqMissCust++; continue }
  const key = `${custId}||${r.projectName}`
  if (!seqLists.has(key)) seqLists.set(key, [])
  seqLists.get(key).push(r.seq)
}
console.log(`seq lists: ${seqLists.size} unique keys, ${sheetRows.length - seqMissCust} total seqs (miss cust: ${seqMissCust})`)

// 4. DB 의 2026 매출 있는 프로젝트 fetch (sheet_no 순으로 정렬 = 시트 매칭용)
const projs2026 = await fetchAll(
  'projects',
  'id, sheet_no, customer_id, project_name, revenues:monthly_revenues!inner(year)',
  q => q.eq('revenues.year', 2026).eq('source', 'excel_backfill')
)
console.log(`DB 2026 매출 있는 projects: ${projs2026.length}`)

// 5. DB projects 를 (customer, project_name) 별로 그룹핑, 각 그룹 sheet_no ASC 정렬
// → 시트의 seq 리스트와 순서대로 매핑
const dbGroups = new Map()
for (const p of projs2026) {
  const key = `${p.customer_id}||${p.project_name}`
  if (!dbGroups.has(key)) dbGroups.set(key, [])
  dbGroups.get(key).push(p)
}
for (const list of dbGroups.values()) {
  list.sort((a, b) => (Number(a.sheet_no) || 0) - (Number(b.sheet_no) || 0))
}

const updates = []
let noMatch = 0
let sameNo = 0
let countMismatch = 0
for (const [key, dbList] of dbGroups) {
  const seqList = seqLists.get(key)
  if (!seqList) { noMatch += dbList.length; continue }
  if (dbList.length !== seqList.length) countMismatch++
  const pairs = Math.min(dbList.length, seqList.length)
  for (let i = 0; i < pairs; i++) {
    const p = dbList[i]
    const newSeq = seqList[i]
    if (Number(p.sheet_no) === newSeq) { sameNo++; continue }
    updates.push({ id: p.id, oldSheetNo: p.sheet_no, newSheetNo: newSeq })
  }
  // 남은 DB 항목은 시트에서 대응 없음
  if (dbList.length > seqList.length) noMatch += (dbList.length - seqList.length)
}
console.log(`\ncount mismatch (DB ≠ 시트 개수): ${countMismatch} groups`)

console.log(`\nsheet_no 변경 필요: ${updates.length}`)
console.log(`  이미 일치: ${sameNo}`)
console.log(`  시트 매칭 실패 (skip): ${noMatch}`)

console.log(`\n샘플 변경 (상위 10)`)
for (const u of updates.slice(0, 10)) {
  console.log(`  ${u.id.substring(0, 8)}...  ${u.oldSheetNo} → ${u.newSheetNo}`)
}

if (!LIVE) {
  console.log(`\n[DRY-RUN] --live 로 실행`)
  process.exit(0)
}

// ============ LIVE ============
console.log(`\n[UPDATE] ${updates.length}개 병렬 처리 (chunk 30)`)
const CHUNK = 30
let ok = 0, fail = 0
for (let i = 0; i < updates.length; i += CHUNK) {
  const chunk = updates.slice(i, i + CHUNK)
  const results = await Promise.all(chunk.map(u =>
    sb.from('projects').update({ sheet_no: u.newSheetNo }).eq('id', u.id)
  ))
  for (const r of results) {
    if (r.error) { fail++; console.log(`\n  ❌ ${r.error.message}`) }
    else ok++
  }
  process.stdout.write(`\r  ${ok + fail}/${updates.length}`)
}
console.log(`\n  ✅ 성공 ${ok},  실패 ${fail}`)

console.log('\n[Done]')
