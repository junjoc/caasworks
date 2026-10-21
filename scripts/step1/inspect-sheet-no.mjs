#!/usr/bin/env node
// 2026 시트의 실제 NO 컬럼 값 vs 스크립트 seq vs DB sheet_no 비교

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

const s26 = (await sheets.spreadsheets.values.get({
  spreadsheetId: '1ISGq9rkQe8LOlmS1-nCmWp95Lr34kpJ_jnp3OTaLFHQ',
  range: `현장별 전체 매출!A1:AZ50`,
})).data.values || []

console.log('# 2026 시트 상단 20 rows (시작 idx 8)')
console.log('idx | seq | NO (col 1) | 회사 (col 4) | 현장 (col 5) | 서비스 (col 8)')
console.log('-'.repeat(120))

let seq = 0
for (let i = 8; i < Math.min(s26.length, 30); i++) {
  const row = s26[i] || []
  const noRaw = row[1]
  const company = row[4]
  if (!noRaw && !company) continue
  if (typeof noRaw === 'string' && noRaw === '복사') continue
  if (!company || typeof company !== 'string' || !company.trim()) continue
  if (noRaw !== null && noRaw !== undefined && noRaw !== '' && typeof noRaw !== 'number' && isNaN(parseFloat(noRaw))) continue

  seq++
  console.log(`${String(i).padStart(3)} | ${String(seq).padStart(3)} | ${String(noRaw).padStart(10)} | ${(company || '').substring(0, 15).padEnd(15)} | ${(row[5] || '').substring(0, 20).padEnd(20)} | ${(row[8] || '').substring(0, 12)}`)
}
