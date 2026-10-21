#!/usr/bin/env node
// 2024/2025 상태 스캔: 시트 rows vs DB projects, 여분 여부
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

const customers = await fetchAll('customers', 'id, company_name')
const custByName = {}
for (const c of customers) { custByName[c.company_name] = c.id; custByName[normalize(c.company_name)] = c.id }
function findCust(company) {
  const stripped = stripSuffix(company)
  return custByName[company] || custByName[stripped] || custByName[normalize(company)] || custByName[normalize(stripped)]
}

function toMoney(v) {
  if (v === null || v === undefined || v === '') return 0
  if (typeof v === 'number') return Math.round(v)
  const n = parseFloat(String(v).replace(/[,₩원\s]/g, ''))
  return isNaN(n) ? 0 : Math.round(n)
}

async function inspectYear(year, sheetId, sheetName, layout) {
  console.log(`\n═══ ${year}년 ═══`)
  const s = (await sheets.spreadsheets.values.get({
    spreadsheetId: sheetId,
    range: `${sheetName}!A1:JV5000`,
  })).data.values || []

  const sheetRows = []
  let seq = 0
  const startI = layout.startI
  for (let i = startI; i < s.length; i++) {
    const row = s[i] || []
    const noRaw = row[1]; const company = row[layout.companyCol]
    if (!noRaw && !company) continue
    if (typeof noRaw === 'string' && noRaw === '복사') continue
    if (!company || typeof company !== 'string' || !company.trim()) continue
    if (noRaw !== null && noRaw !== undefined && noRaw !== '' && typeof noRaw !== 'number' && isNaN(parseFloat(noRaw))) continue
    seq++
    const project = clean(row[layout.projectCol]) || company.trim()
    const service = clean(row[layout.serviceCol])
    const dbSvc = service ? (SERVICE_MAP[service] || service) : null
    const projectName = dbSvc ? `${project} - ${dbSvc}` : project

    // 월별 매출
    let totalMonthly = 0
    if (year === 2024) {
      // 15 컬럼 씩 블록, offset 0-12 서비스별
      for (let m = 0; m < 12; m++) {
        const blockStart = 31 + m * 15
        for (let s = 0; s < 13; s++) {
          totalMonthly += toMoney(row[blockStart + s])
        }
      }
    } else {
      // 2025: col 21~32 = 1~12월
      for (let m = 0; m < 12; m++) {
        totalMonthly += toMoney(row[21 + m])
      }
    }
    sheetRows.push({ seq, company: company.trim(), projectName, totalMonthly })
  }
  const sheetTotal = sheetRows.reduce((s, r) => s + r.totalMonthly, 0)
  console.log(`시트 rows: ${sheetRows.length}, 매출 총액 (VAT 제외): ${sheetTotal.toLocaleString()}`)

  // DB
  const projs = await fetchAll(
    'projects',
    'id, customer_id, project_name, sheet_no, sheet_year, revenues:monthly_revenues!inner(year, amount)',
    q => q.eq('source', 'excel_backfill').eq('revenues.year', year)
  )
  const dbTotal = projs.reduce((s, p) => s + (p.revenues || []).filter(r => r.year === year).reduce((a, r) => a + r.amount, 0), 0)
  console.log(`DB ${year} 매출 있는 projects: ${projs.length}, 매출 총액: ${dbTotal.toLocaleString()}`)
  console.log(`  DB 총액 - 시트 총액 = ${(dbTotal - sheetTotal).toLocaleString()}`)

  // 여분 스캔
  const sheetCount = new Map()
  for (const r of sheetRows) {
    const custId = findCust(r.company)
    if (!custId) continue
    const key = `${custId}||${r.projectName}`
    sheetCount.set(key, (sheetCount.get(key) || 0) + 1)
  }
  const dbGroups = new Map()
  for (const p of projs) {
    const key = `${p.customer_id}||${p.project_name}`
    if (!dbGroups.has(key)) dbGroups.set(key, [])
    dbGroups.get(key).push(p)
  }
  let excessTotal = 0
  for (const [key, list] of dbGroups) {
    const sheetN = sheetCount.get(key) || 0
    if (list.length > sheetN) excessTotal += list.length - sheetN
  }
  console.log(`여분 프로젝트 (DB > 시트): ${excessTotal}`)

  // sheet_year 설정 여부
  const withSheetYear = projs.filter(p => p.sheet_year === year).length
  console.log(`sheet_year=${year} 설정된 것: ${withSheetYear}/${projs.length}`)
}

await inspectYear(2024, '1v6jJvJcs5avc-ClQ3YXVwBlKEJ8cJaeKx8hrPVdVeYI',
  'CaaS.Works 현장별 매출 현황',
  { startI: 9, companyCol: 4, projectCol: 6, serviceCol: null })  // 2024 은 서비스 컬럼 없음 (블록별)
await inspectYear(2025, '1X9u9JUAy1t-i74BWyaVUhj7_73vV_L70kKG-73Z7HZU',
  '현장별 전체 매출',
  { startI: 8, companyCol: 4, projectCol: 5, serviceCol: 7 })
