#!/usr/bin/env node
// 두 구글 시트 구조 파악 (read-only)
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

const SHEETS = {
  2024: '1v6jJvJcs5avc-ClQ3YXVwBlKEJ8cJaeKx8hrPVdVeYI',
  2025: '1X9u9JUAy1t-i74BWyaVUhj7_73vV_L70kKG-73Z7HZU',
}

const sheets = google.sheets({ version: 'v4', auth: getAuth() })

for (const [year, id] of Object.entries(SHEETS)) {
  console.log(`\n${'='.repeat(70)}\n📄 ${year}년 시트 (ID: ${id})\n${'='.repeat(70)}`)
  try {
    const meta = await sheets.spreadsheets.get({ spreadsheetId: id })
    console.log(`제목: ${meta.data.properties.title}`)
    console.log(`탭 (${meta.data.sheets.length}개):`)
    for (const s of meta.data.sheets) {
      const p = s.properties
      console.log(`  - "${p.title}"  (${p.gridProperties.rowCount} rows × ${p.gridProperties.columnCount} cols)`)
    }
  } catch (e) {
    console.log(`❌ 접근 실패: ${e.message}`)
    console.log(`   서비스 계정: crm-calendar@certain-rune-491109-q5.iam.gserviceaccount.com`)
    console.log(`   → 시트 공유 설정에서 위 계정에 "뷰어" 권한 필요`)
  }
}
