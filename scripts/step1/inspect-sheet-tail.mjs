#!/usr/bin/env node
import { google } from 'googleapis'
import { readFileSync } from 'fs'
try {
  const env = readFileSync('.env.local', 'utf-8')
  env.split('\n').forEach(line => {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)
    if (m) process.env[m[1]] = m[2].replace(/^"(.*)"$/, '$1').replace(/\\n/g, '\n')
  })
} catch {}
function getAuth() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_KEY || ''
  let credentials
  try { credentials = JSON.parse(raw) } catch { credentials = JSON.parse(Buffer.from(raw, 'base64').toString('utf-8')) }
  return new google.auth.GoogleAuth({ credentials, scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'] })
}
const sheets = google.sheets({ version: 'v4', auth: getAuth() })

const s26 = (await sheets.spreadsheets.values.get({
  spreadsheetId: '1ISGq9rkQe8LOlmS1-nCmWp95Lr34kpJ_jnp3OTaLFHQ',
  range: `현장별 전체 매출!A1:AZ5000`,
})).data.values || []

const rows = []
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
  rows.push({ seq, noRaw, company: company.trim(), project: row[5] || '', service: row[8] || '' })
}
console.log(`총 시트 rows: ${rows.length}\n`)
console.log('# 시트 마지막 15줄 (seq 큰 순 = 시트 아래쪽)')
for (const r of rows.slice(-15).reverse()) {
  console.log(`  seq=${String(r.seq).padStart(4)}  NO=${r.noRaw}  ${r.company.substring(0,15).padEnd(15)}  ${(r.project).substring(0,35).padEnd(35)}  ${r.service}`)
}
