#!/usr/bin/env node
// ============================================================
// 시트 "미납 현황" 탭에서 invoices 로 임포트
//
// 각 고객사 행마다 12개월 × (계산서발행일 | 입금예정일 | 경과일 | 금액 | 비고)
// 금액이 0 이 아닌 월 = 1개 invoice 로 생성
//
// invoice_number 는 "UNPAID-{customer_no}-{year}{month}" 형식 (재실행 시 중복 방지)
//
// Usage:
//   node scripts/import-unpaid-from-sheet.mjs          # DRY-RUN
//   node scripts/import-unpaid-from-sheet.mjs --live   # 실제 삽입
// ============================================================

import { google } from 'googleapis'
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'

try {
  const env = readFileSync(new URL('../.env.local', import.meta.url), 'utf-8')
  env.split('\n').forEach(line => {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)
    if (m) process.env[m[1]] = m[2].replace(/^"(.*)"$/, '$1').replace(/\\n/g, '\n')
  })
} catch {}

const SHEET_ID = '1ISGq9rkQe8LOlmS1-nCmWp95Lr34kpJ_jnp3OTaLFHQ'
const LIVE = process.argv.includes('--live')
const YEAR = 2026

// 시트 컬럼 레이아웃:
// col 1: No., col 2: 회사명, col 3: 차단일, col 4: 납부 보증금,
// col 5: 계산서 발행 정보(담당자), col 6: (empty), col 7: No.(dup), col 8: 합계
// col 9~: 월별 블록 시작 (5 컬럼 × 12개월)
const MONTH_BLOCK_START = 9
const MONTH_BLOCK_SIZE = 5  // [계산서발행일, 입금예정일, 경과일, 금액, 비고]
const HEADER_ROWS = 9  // 데이터는 index 9부터

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
const col = (r, i) => (r?.[i] || '').toString().trim()
const parseMoney = (s) => {
  if (!s) return 0
  const n = Number(s.toString().replace(/[,₩\s]/g, ''))
  return isNaN(n) ? 0 : n
}
const parseDate = (s) => {
  if (!s) return null
  const s2 = s.toString().trim().replace(/\./g, '-').replace(/\s+/g, '')
  const m = s2.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/)
  return m ? `${m[1]}-${m[2].padStart(2,'0')}-${m[3].padStart(2,'0')}` : null
}
const normalize = (s) => (s || '').replace(/\s+/g, '').replace(/[()（）\-·・㈜]/g, '').toLowerCase()

function getAuth() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_KEY || ''
  let credentials
  try { credentials = JSON.parse(raw) } catch { credentials = JSON.parse(Buffer.from(raw, 'base64').toString('utf-8')) }
  return new google.auth.GoogleAuth({ credentials, scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'] })
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

console.log(`[Import Unpaid] ${LIVE ? 'LIVE' : 'DRY-RUN'}\n`)

// DB 고객사
const customers = await fetchAll('customers', 'id, company_name')
const custByName = {}
for (const c of customers) {
  if (c.company_name) {
    custByName[c.company_name] = c.id
    custByName[normalize(c.company_name)] = c.id
  }
}
console.log(`  customers loaded: ${customers.length}`)

// 기존 invoices 조회 (재실행 시 중복 방지)
// UNIQUE 제약: (customer_id, year, month) 하나의 invoice 만 허용
const existing = await fetchAll('invoices', 'id, invoice_number, customer_id, year, month, total, tax_invoice_issued_at, due_date, notes, status, paid_at', q => q.eq('year', YEAR))
const existingByCym = new Map()  // `${customer_id}|${year}|${month}` → invoice
for (const inv of existing) existingByCym.set(`${inv.customer_id}|${inv.year}|${inv.month}`, inv)
console.log(`  existing invoices (${YEAR}): ${existing.length}`)

// 시트 읽기
const sheets = google.sheets({ version: 'v4', auth: getAuth() })
const res = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: `미납 현황!A1:BZ500` })
const rows = res.data.values || []
console.log(`  sheet rows: ${rows.length}\n`)

const toInsert = []
const toUpdate = []
let customerMisses = new Set()
let totalAmount = 0

for (let i = HEADER_ROWS; i < rows.length; i++) {
  const r = rows[i]
  if (!r) continue
  const no = col(r, 1)
  if (!no || isNaN(parseInt(no))) continue
  const company = col(r, 2)
  if (!company) continue

  const customerId = custByName[company] || custByName[normalize(company)]
  if (!customerId) {
    customerMisses.add(company)
    continue
  }

  const contactInfo = col(r, 5)  // 담당자 정보

  // 12 개월 스캔
  for (let m = 0; m < 12; m++) {
    const base = MONTH_BLOCK_START + m * MONTH_BLOCK_SIZE
    const issuedAt = parseDate(col(r, base))       // 계산서 발행일
    const dueDate = parseDate(col(r, base + 1))    // 입금 예정일
    // const elapsed = col(r, base + 2)             // 경과일 (계산으로 대체)
    const amount = parseMoney(col(r, base + 3))    // 금액
    const memo = col(r, base + 4)                   // 비고

    if (amount === 0 && !issuedAt) continue  // 빈 월 건너뛰기

    const month = m + 1
    const invoiceNumber = `UNPAID-${no}-${YEAR}${String(month).padStart(2, '0')}`

    // VAT 계산: 시트 금액은 VAT 포함이라 가정 (일반적인 B2B 청구서 패턴)
    const total = amount
    const subtotal = Math.round(amount / 1.1)
    const vat = total - subtotal

    const payload = {
      invoice_number: invoiceNumber,
      customer_id: customerId,
      year: YEAR,
      month,
      subtotal,
      vat,
      total,
      due_date: dueDate,
      tax_invoice_issued_at: issuedAt,
      status: 'sent',  // 세금계산서 발행된 상태
      bank_info: null,
      notes: [
        memo && memo.trim() ? `비고: ${memo.trim()}` : null,
        contactInfo && contactInfo.trim() ? `담당자: ${contactInfo.trim().substring(0, 200)}` : null,
      ].filter(Boolean).join('\n') || null,
    }

    const exist = existingByCym.get(`${customerId}|${YEAR}|${month}`)
    if (exist) {
      // 기존 invoice 존재 (UNIQUE 제약상 1건만 가능)
      // 이미 수납 완료된 건은 건드리지 않음
      if (exist.paid_at) continue
      // tax_invoice_issued_at 이 없으면 보강. 기존 total/subtotal/vat 은 건드리지 않음.
      const update = {}
      if (!exist.tax_invoice_issued_at && issuedAt) update.tax_invoice_issued_at = issuedAt
      if (!exist.due_date && dueDate) update.due_date = dueDate
      if (!exist.notes && payload.notes) update.notes = payload.notes
      if (Object.keys(update).length > 0) {
        toUpdate.push({ id: exist.id, invoice_number: exist.invoice_number, update, amount: Number(exist.total) })
        totalAmount += Number(exist.total)
      }
    } else {
      toInsert.push(payload)
      totalAmount += total
    }
  }
}

console.log(`\n  📊 분석:`)
console.log(`    새로 삽입할 invoice: ${toInsert.length}건`)
console.log(`    기존 invoice 업데이트: ${toUpdate.length}건 (tax_invoice_issued_at/due_date 보강)`)
console.log(`    총 미납 금액:        ${totalAmount.toLocaleString()} 원`)
console.log(`    고객사 매칭 실패:    ${customerMisses.size} 건`)

if (customerMisses.size > 0) {
  console.log(`\n  고객사 매칭 실패 (customers 테이블에 추가 필요):`)
  for (const n of customerMisses) console.log(`    - ${n}`)
}

if (toInsert.length <= 30) {
  console.log(`\n  삽입 대상 샘플 (상위 20):`)
  toInsert.slice(0, 20).forEach(x => {
    const cust = customers.find(c => c.id === x.customer_id)?.company_name || '?'
    console.log(`    ${x.invoice_number} | ${cust} | ${x.month}월 | ${x.total.toLocaleString()} | 발행 ${x.tax_invoice_issued_at} | 납기 ${x.due_date}`)
  })
}

if (!LIVE) {
  console.log(`\n  [DRY-RUN] --live 로 실행하면 실제 삽입.`)
  process.exit(0)
}

console.log(`\n[LIVE] inserting ${toInsert.length} invoices + updating ${toUpdate.length}...`)
let inserted = 0
for (let i = 0; i < toInsert.length; i += 100) {
  const batch = toInsert.slice(i, i + 100)
  const { error } = await sb.from('invoices').insert(batch)
  if (error) console.log(`  ❌ insert batch ${i}: ${error.message}`)
  else inserted += batch.length
}
let updated = 0
for (const u of toUpdate) {
  const { error } = await sb.from('invoices').update(u.update).eq('id', u.id)
  if (error) console.log(`  ❌ update ${u.invoice_number}: ${error.message}`)
  else updated++
}
console.log(`\n[Done] 삽입 ${inserted}/${toInsert.length}, 업데이트 ${updated}/${toUpdate.length}`)
console.log(`  총 미납 금액: ${totalAmount.toLocaleString()} 원`)
