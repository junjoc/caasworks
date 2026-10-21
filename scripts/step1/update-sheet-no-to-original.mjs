#!/usr/bin/env node
// CRM 의 sheet_no (지금은 seq 값) 를 시트 NO 컬럼 실제값 (팀이 매긴 번호) 으로 UPDATE
// 시트 seq (row 순번) → 시트 NO (col 1 값) 매핑

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

const s26 = (await sheets.spreadsheets.values.get({
  spreadsheetId: '1ISGq9rkQe8LOlmS1-nCmWp95Lr34kpJ_jnp3OTaLFHQ',
  range: `현장별 전체 매출!A1:AZ5000`,
})).data.values || []

// 시트 seq → NO 매핑
const seqToNo = new Map()
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
  seqToNo.set(seq, noRaw)
}
console.log(`시트 seq → NO 매핑: ${seqToNo.size} entries`)

// DB 2026 rebuild 로 새로 insert 된 프로젝트: source='excel_backfill', sheet_no 1~2218
// 이 프로젝트들은 아직 seq 값을 sheet_no 로 갖고 있음
// 그리고 2026 매출을 가지고 있음
// sheet_year=2026 인 프로젝트 전체 (매출 유무 무관)
const projs = await fetchAll(
  'projects',
  'id, sheet_no, project_name',
  q => q.eq('source', 'excel_backfill').eq('sheet_year', 2026)
)
console.log(`DB sheet_year=2026 excel_backfill projects: ${projs.length}`)

const updates = []
let noMatch = 0
for (const p of projs) {
  const seq = Number(p.sheet_no)
  const newNo = seqToNo.get(seq)
  if (newNo === undefined) { noMatch++; continue }
  const newNoNum = typeof newNo === 'number' ? newNo : parseFloat(String(newNo))
  if (isNaN(newNoNum)) { noMatch++; continue }
  if (Number(p.sheet_no) === newNoNum) continue  // 이미 일치 (edge case)
  updates.push({ id: p.id, oldSeq: p.sheet_no, newNo: newNoNum })
}
console.log(`sheet_no 변경: ${updates.length}, no match: ${noMatch}`)

console.log(`\n샘플 상위 10 (변경 크기 순)`)
updates.sort((a, b) => Math.abs(Number(b.newNo) - Number(b.oldSeq)) - Math.abs(Number(a.newNo) - Number(a.oldSeq)))
for (const u of updates.slice(0, 10)) {
  console.log(`  seq=${String(u.oldSeq).padStart(4)} → NO=${u.newNo}`)
}

if (!LIVE) {
  console.log(`\n[DRY-RUN] --live 로 실행`)
  process.exit(0)
}

// UPDATE
console.log(`\n[UPDATE] ${updates.length}개 병렬 (chunk 30)`)
let ok = 0, fail = 0
for (let i = 0; i < updates.length; i += 30) {
  const chunk = updates.slice(i, i + 30)
  const results = await Promise.all(chunk.map(u =>
    sb.from('projects').update({ sheet_no: u.newNo }).eq('id', u.id)
  ))
  for (const r of results) {
    if (r.error) { fail++; console.log(`\n  ❌ ${r.error.message}`) }
    else ok++
  }
  process.stdout.write(`\r  ${ok + fail}/${updates.length}`)
}
console.log(`\n  ✅ 성공 ${ok}, 실패 ${fail}`)
