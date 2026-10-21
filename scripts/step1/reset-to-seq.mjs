#!/usr/bin/env node
// sheet_no 를 시트 row 순번 (seq 1~2218) 으로 되돌림
// - sheet NO 값 (1929, 1913.1 등) → seq 정수 (1~2218)
// - 소수점도 다음 차순 (1913.1 → seq 1937 같이)

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

console.log(`[sheet_no 를 seq 로 리셋] ${LIVE ? 'LIVE' : 'DRY-RUN'}\n`)

// 1. 시트 파싱 → (customer_name, project_name_computed, seq)
const s26 = (await sheets.spreadsheets.values.get({
  spreadsheetId: '1ISGq9rkQe8LOlmS1-nCmWp95Lr34kpJ_jnp3OTaLFHQ',
  range: `현장별 전체 매출!A1:AZ5000`,
})).data.values || []
const sheetRows = []
let seq = 0
for (let i = 8; i < s26.length; i++) {
  const row = s26[i] || []
  const noRaw = row[1]; const company = row[4]
  if (!noRaw && !company) continue
  if (typeof noRaw === 'string' && noRaw === '복사') continue
  if (!company || typeof company !== 'string' || !company.trim()) continue
  if (noRaw !== null && noRaw !== undefined && noRaw !== '' && typeof noRaw !== 'number' && isNaN(parseFloat(noRaw))) continue
  seq++
  const project = clean(row[5]) || company.trim()
  const service = clean(row[8])
  const dbSvc = service ? (SERVICE_MAP[service] || service) : null
  const projectName = dbSvc ? `${project} - ${dbSvc}` : project
  sheetRows.push({ seq, company: company.trim(), projectName })
}
console.log(`시트 rows: ${sheetRows.length}, seq 1~${seq}`)

// 2. 고객 매핑
const customers = await fetchAll('customers', 'id, company_name')
const custByName = {}
for (const c of customers) { custByName[c.company_name] = c.id; custByName[normalize(c.company_name)] = c.id }
function findCust(company) {
  const stripped = stripSuffix(company)
  return custByName[company] || custByName[stripped] || custByName[normalize(company)] || custByName[normalize(stripped)]
}

// 3. 시트 (customer_id + project_name) → [seq1, seq2, ...] 리스트 (순서 보존)
const seqLists = new Map()
for (const r of sheetRows) {
  const custId = findCust(r.company)
  if (!custId) continue
  const key = `${custId}||${r.projectName}`
  if (!seqLists.has(key)) seqLists.set(key, [])
  seqLists.get(key).push(r.seq)
}

// 4. DB sheet_year=2026 프로젝트 fetch
const projs = await fetchAll(
  'projects', 'id, sheet_no, customer_id, project_name',
  q => q.eq('source', 'excel_backfill').eq('sheet_year', 2026)
)
console.log(`DB sheet_year=2026 projects: ${projs.length}`)

// 5. (customer, project_name) 그룹핑 후 sheet_no ASC 순서로 시트 seq 매핑
const dbGroups = new Map()
for (const p of projs) {
  const key = `${p.customer_id}||${p.project_name}`
  if (!dbGroups.has(key)) dbGroups.set(key, [])
  dbGroups.get(key).push(p)
}
for (const list of dbGroups.values()) {
  list.sort((a, b) => (Number(a.sheet_no) || 0) - (Number(b.sheet_no) || 0))
}

const updates = []
let noMatch = 0
for (const [key, dbList] of dbGroups) {
  const seqList = seqLists.get(key)
  if (!seqList) { noMatch += dbList.length; continue }
  const pairs = Math.min(dbList.length, seqList.length)
  for (let i = 0; i < pairs; i++) {
    const p = dbList[i]
    const newSeq = seqList[i]
    if (Number(p.sheet_no) === newSeq) continue
    updates.push({ id: p.id, oldSheetNo: p.sheet_no, newSheetNo: newSeq })
  }
}
console.log(`\nsheet_no 변경: ${updates.length}, no match: ${noMatch}`)
console.log(`\n샘플 10:`)
for (const u of updates.slice(0, 10)) {
  console.log(`  ${u.oldSheetNo} → ${u.newSheetNo}`)
}

if (!LIVE) {
  console.log(`\n[DRY-RUN] --live`)
  process.exit(0)
}

console.log(`\n[UPDATE] ${updates.length}개 병렬 (chunk 30)`)
let ok = 0, fail = 0
for (let i = 0; i < updates.length; i += 30) {
  const chunk = updates.slice(i, i + 30)
  const results = await Promise.all(chunk.map(u =>
    sb.from('projects').update({ sheet_no: u.newSheetNo }).eq('id', u.id)
  ))
  for (const r of results) {
    if (r.error) { fail++; console.log(`\n  ❌ ${r.error.message}`) }
    else ok++
  }
  process.stdout.write(`\r  ${ok + fail}/${updates.length}`)
}
console.log(`\n  ✅ ${ok} 성공, ${fail} 실패`)
