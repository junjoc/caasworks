#!/usr/bin/env node
// 미래건설산업 매칭 문제 조사
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

// 1. DB 에서 미래건설산업 프로젝트
console.log('# DB 프로젝트 (미래건설산업 계열)\n')
const { data: custMirae } = await sb.from('customers')
  .select('id, company_name')
  .ilike('company_name', '%미래건설%')
if (custMirae) {
  for (const c of custMirae) console.log(`  customer: ${c.company_name}  id=${c.id.substring(0,8)}...`)
}

for (const c of custMirae || []) {
  const { data: projs } = await sb.from('projects')
    .select('id, sheet_no, project_name, source, revenues:monthly_revenues(year, month, amount)')
    .eq('customer_id', c.id)
  if (!projs || !projs.length) continue
  const with2026 = projs.filter(p => p.revenues?.some(r => r.year === 2026))
  console.log(`\n  ${c.company_name} 2026 매출 있는 프로젝트 (${with2026.length}개):`)
  for (const p of with2026) {
    console.log(`    sheet_no=${String(p.sheet_no).padStart(5)}  source=${(p.source||'').padEnd(20)}  ${(p.project_name||'').substring(0,70)}`)
  }
}

// 2. 시트에서 미래건설 rows 찾기
console.log('\n\n# 시트에서 미래건설 검색\n')
const s26 = (await sheets.spreadsheets.values.get({
  spreadsheetId: '1ISGq9rkQe8LOlmS1-nCmWp95Lr34kpJ_jnp3OTaLFHQ',
  range: `현장별 전체 매출!A1:AZ5000`,
})).data.values || []

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
  if (company.includes('미래건설')) {
    console.log(`  seq=${seq}  NO=${noRaw}  회사="${company.trim()}"  현장="${row[5]||''}"  서비스="${row[8]||''}"`)
  }
}
