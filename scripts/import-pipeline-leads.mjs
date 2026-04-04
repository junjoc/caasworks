#!/usr/bin/env node
/**
 * Google Sheet "인바운드" → pipeline_leads 벌크 임포트 스크립트
 * CSV export URL 사용 (Sheets API 대신)
 *
 * 실행: /Users/david/local/node/bin/node scripts/import-pipeline-leads.mjs
 */

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import https from 'https'

const __dirname = dirname(fileURLToPath(import.meta.url))

// ─── Config ───
const SHEET_ID = '1R9BkvzfbvtJap7Ymp7LtYdKsrvCtjfKrvxNw5mQPAHA'
const SHEET_GID = '0' // 인바운드 탭 gid

const SUPABASE_URL = 'https://lqoudbcuetrxemlkfkzv.supabase.co'

// .env.local에서 서비스 롤 키 읽기
function getSupabaseKey() {
  const envPath = resolve(__dirname, '..', '.env.local')
  const envContent = readFileSync(envPath, 'utf-8')
  // SUPABASE_SERVICE_ROLE_KEY가 있으면 사용, 없으면 ANON_KEY
  const srkMatch = envContent.match(/SUPABASE_SERVICE_ROLE_KEY=(.+)/)
  if (srkMatch) return srkMatch[1].trim()
  const anonMatch = envContent.match(/NEXT_PUBLIC_SUPABASE_ANON_KEY=(.+)/)
  if (anonMatch) return anonMatch[1].trim()
  throw new Error('No Supabase key found')
}

// Google Service Account로 OAuth token 얻기
async function getAccessToken() {
  const envPath = resolve(__dirname, '..', '.env.local')
  const envContent = readFileSync(envPath, 'utf-8')
  const match = envContent.match(/GOOGLE_SERVICE_ACCOUNT_KEY=(.+)/)
  if (!match) throw new Error('GOOGLE_SERVICE_ACCOUNT_KEY not found')

  const raw = match[1].trim()
  let credentials
  try {
    credentials = JSON.parse(raw)
  } catch {
    credentials = JSON.parse(Buffer.from(raw, 'base64').toString('utf-8'))
  }

  // JWT 생성을 위한 crypto
  const crypto = await import('crypto')

  const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url')
  const now = Math.floor(Date.now() / 1000)
  const claim = Buffer.from(JSON.stringify({
    iss: credentials.client_email,
    scope: 'https://www.googleapis.com/auth/drive.readonly',
    aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600,
    iat: now,
  })).toString('base64url')

  const signInput = `${header}.${claim}`
  const sign = crypto.createSign('RSA-SHA256')
  sign.update(signInput)
  const signature = sign.sign(credentials.private_key, 'base64url')

  const jwt = `${signInput}.${signature}`

  // Exchange JWT for access token
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
  })

  const tokenData = await tokenRes.json()
  if (!tokenData.access_token) {
    throw new Error(`Token error: ${JSON.stringify(tokenData)}`)
  }
  return tokenData.access_token
}

// 담당자 이름 목록
const STAFF_NAMES = ['전성환', '박성언', '최한별', '유라예']

// ─── Helpers ───
function parseAssignee(content) {
  if (!content) return null
  const matches = content.match(/\(([가-힣]{2,4})\)/g)
  if (!matches || matches.length === 0) return null
  const names = matches.map(m => m.replace(/[()]/g, ''))
  const staffMatches = names.filter(name => STAFF_NAMES.includes(name))
  if (staffMatches.length === 0) return null
  return staffMatches[staffMatches.length - 1]
}

function mapInquiryChannel(channel) {
  const ch = (channel || '').trim()
  const channelMap = {
    '상담신청': '문의하기',
    '문의하기': '문의하기',
    '대표전화': '대표전화',
    '개인전화': '개인전화',
    '검색채널': '검색채널',
    '공식홈페이지': '공식홈페이지',
    '블로그': '블로그',
    '이용자 추천': '이용자 추천',
    '추천': '이용자 추천',
    '박람회': '박람회',
  }
  return channelMap[ch] || ch || '기타'
}

function parseDate(dateStr) {
  if (!dateStr) return null
  dateStr = dateStr.trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return dateStr
  if (/^\d{4}\.\d{2}\.\d{2}$/.test(dateStr)) return dateStr.replace(/\./g, '-')

  const slashMatch = dateStr.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (slashMatch) {
    return `${slashMatch[3]}-${slashMatch[1].padStart(2, '0')}-${slashMatch[2].padStart(2, '0')}`
  }

  const num = Number(dateStr)
  if (!isNaN(num) && num > 40000 && num < 50000) {
    const date = new Date((num - 25569) * 86400000)
    return date.toISOString().substring(0, 10)
  }

  // Try yyyy/mm/dd
  const ymdSlash = dateStr.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/)
  if (ymdSlash) {
    return `${ymdSlash[1]}-${ymdSlash[2].padStart(2, '0')}-${ymdSlash[3].padStart(2, '0')}`
  }

  return null
}

function determineStage(rowObj) {
  const docSent = (rowObj['문서발송'] || '').trim()
  const quotation = (rowObj['견적금액'] || '').trim()
  const adoption = (rowObj['도입 예상'] || rowObj['도입예상'] || '').trim()

  if (adoption && adoption !== '' && adoption !== '-') return '도입직전'
  if (quotation && quotation !== '' && quotation !== '-' && quotation !== '0') return '제안'
  if (docSent && docSent !== '' && docSent !== '-') return '제안'
  return '신규리드'
}

// CSV 파싱 (따옴표 내 쉼표 처리)
function parseCSVRow(line) {
  const result = []
  let current = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') {
      if (inQuotes && i + 1 < line.length && line[i + 1] === '"') {
        current += '"'
        i++
      } else {
        inQuotes = !inQuotes
      }
    } else if (ch === ',' && !inQuotes) {
      result.push(current)
      current = ''
    } else {
      current += ch
    }
  }
  result.push(current)
  return result
}

// ─── Fetch Sheet via Drive API CSV export ───
async function fetchSheetData(accessToken) {
  // Try Drive API export as CSV (gid=0 for first sheet)
  const exportUrl = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=${SHEET_GID}`

  const res = await fetch(exportUrl, {
    headers: { 'Authorization': `Bearer ${accessToken}` },
    redirect: 'follow',
  })

  if (!res.ok) {
    const errText = await res.text()
    throw new Error(`Drive export error ${res.status}: ${errText.substring(0, 500)}`)
  }

  const csvText = await res.text()
  const lines = csvText.split('\n')

  // Parse CSV into 2D array
  const rows = lines.map(line => parseCSVRow(line))

  return rows
}

// ─── Main ───
async function main() {
  console.log('=== Pipeline Leads Import from Google Sheet ===\n')

  // 1. Google OAuth token 얻기
  console.log('1. Getting Google access token...')
  const accessToken = await getAccessToken()
  console.log('   Token obtained.\n')

  // 2. 시트 데이터 가져오기
  console.log('2. Fetching sheet data...')
  const rows = await fetchSheetData(accessToken)

  if (!rows || rows.length < 3) {
    console.error('No data found in sheet')
    return
  }

  // 헤더 행 (2번째 행, index 1)
  const headers = rows[1].map(h => (h || '').trim())
  const colIndex = {}
  headers.forEach((h, i) => { if (h) colIndex[h] = i })

  console.log(`   Headers: ${headers.filter(Boolean).join(', ')}`)
  console.log(`   Total data rows: ${rows.length - 2}\n`)

  // 3. Supabase 연결
  console.log('3. Connecting to Supabase...')
  const supabaseKey = getSupabaseKey()
  const supabase = createClient(SUPABASE_URL, supabaseKey)

  // 기존 데이터 확인
  const { count: existingCount } = await supabase
    .from('pipeline_leads')
    .select('*', { count: 'exact', head: true })
  console.log(`   Existing pipeline_leads count: ${existingCount}\n`)

  // 기존 데이터 미리 로드 (중복 체크용)
  const { data: existingLeads } = await supabase
    .from('pipeline_leads')
    .select('id, customer_code, company_name, inquiry_date')

  const existingByCode = new Map()
  const existingByNameDate = new Map()
  if (existingLeads) {
    for (const lead of existingLeads) {
      if (lead.customer_code) {
        existingByCode.set(lead.customer_code, lead.id)
      }
      if (lead.company_name && lead.inquiry_date) {
        existingByNameDate.set(`${lead.company_name}|${lead.inquiry_date}`, lead.id)
      }
    }
  }
  console.log(`   Indexed: ${existingByCode.size} by code, ${existingByNameDate.size} by name+date\n`)

  // 4. 데이터 처리
  console.log('4. Processing rows...')
  let imported = 0
  let updated = 0
  let skipped = 0
  let errors = []

  const toInsert = []
  const toUpdate = []

  for (let i = 2; i < rows.length; i++) {
    const row = rows[i]
    if (!row || row.length === 0) { skipped++; continue }

    const getValue = (headerName) => {
      const idx = colIndex[headerName]
      if (idx === undefined) return ''
      return (row[idx] || '').trim()
    }

    const customerCode = getValue('고객사 ID')
    const companyName = getValue('회사명')

    if (!customerCode && !companyName) { skipped++; continue }

    const inquiryDate = parseDate(getValue('유입일'))
    const consultContent = getValue('상담내용')
    const inquiryContent = getValue('문의내용')
    const assignedTo = parseAssignee(consultContent)

    const finalCompanyName = companyName === '무명'
      ? '무명 (미공개)'
      : companyName || '미상'

    const rowObj = {}
    headers.forEach((h, idx) => {
      if (h && row[idx]) rowObj[h] = (row[idx] || '').trim()
    })

    const stage = determineStage(rowObj)

    const leadData = {
      customer_code: customerCode || null,
      company_name: finalCompanyName,
      contact_person: getValue('문의자') || null,
      contact_phone: getValue('연락처') || null,
      contact_email: getValue('이메일') || null,
      contact_position: getValue('직급(실제)') || getValue('직급(일반)') || null,
      inquiry_date: inquiryDate,
      inquiry_channel: mapInquiryChannel(getValue('문의채널')),
      inquiry_source: getValue('유입경로') || null,
      inquiry_content: [inquiryContent, consultContent].filter(Boolean).join('\n---\n') || null,
      industry: getValue('사업분류') || null,
      // assigned_to는 UUID 타입이라 이름 문자열 불가 — notes에 담당자명 포함
      stage,
      priority: '중간',
      notes: [
        assignedTo ? `담당자: ${assignedTo}` : '',
        getValue('세부경로') ? `세부경로: ${getValue('세부경로')}` : '',
        getValue('초대 고객사 명') ? `초대고객사: ${getValue('초대 고객사 명')}` : '',
        getValue('소재 (대분류)') ? `소재: ${getValue('소재 (대분류)')}/${getValue('소재 (소분류)')}` : '',
        getValue('문서발송') ? `문서발송: ${getValue('문서발송')}` : '',
        getValue('견적금액') ? `견적금액: ${getValue('견적금액')}` : '',
      ].filter(Boolean).join(' | ') || null,
    }

    // 중복 체크
    if (customerCode && existingByCode.has(customerCode)) {
      toUpdate.push({ id: existingByCode.get(customerCode), data: leadData })
    } else if (!customerCode && finalCompanyName && inquiryDate && existingByNameDate.has(`${finalCompanyName}|${inquiryDate}`)) {
      toUpdate.push({ id: existingByNameDate.get(`${finalCompanyName}|${inquiryDate}`), data: leadData })
    } else {
      toInsert.push(leadData)
      // 중복 방지
      if (customerCode) existingByCode.set(customerCode, '__pending__')
      if (finalCompanyName && inquiryDate) existingByNameDate.set(`${finalCompanyName}|${inquiryDate}`, '__pending__')
    }
  }

  console.log(`   To insert: ${toInsert.length}`)
  console.log(`   To update: ${toUpdate.length}`)
  console.log(`   Skipped: ${skipped}\n`)

  // 5. 배치 Insert (50개씩)
  console.log('5. Inserting new leads...')
  const BATCH_SIZE = 50
  for (let i = 0; i < toInsert.length; i += BATCH_SIZE) {
    const batch = toInsert.slice(i, i + BATCH_SIZE)
    const { error } = await supabase.from('pipeline_leads').insert(batch)
    if (error) {
      console.error(`   Batch ${Math.floor(i/BATCH_SIZE)+1} error:`, error.message)
      errors.push(`Insert batch ${Math.floor(i/BATCH_SIZE)+1}: ${error.message}`)
      // 개별 삽입 시도
      for (const item of batch) {
        const { error: singleError } = await supabase.from('pipeline_leads').insert(item)
        if (singleError) {
          errors.push(`Insert ${item.customer_code || item.company_name}: ${singleError.message}`)
        } else {
          imported++
        }
      }
    } else {
      imported += batch.length
      process.stdout.write(`   Inserted ${Math.min(i + BATCH_SIZE, toInsert.length)}/${toInsert.length}\r`)
    }
  }
  if (toInsert.length > 0) console.log()

  // 6. 개별 Update
  console.log('6. Updating existing leads...')
  for (let i = 0; i < toUpdate.length; i++) {
    const { id, data } = toUpdate[i]
    if (id === '__pending__') continue
    const { error } = await supabase.from('pipeline_leads').update(data).eq('id', id)
    if (error) {
      errors.push(`Update ${id}: ${error.message}`)
    } else {
      updated++
    }
    if ((i + 1) % 50 === 0) process.stdout.write(`   Updated ${i + 1}/${toUpdate.length}\r`)
  }
  if (toUpdate.length > 0) console.log()

  // 7. 결과
  console.log('\n=== Import Complete ===')
  console.log(`  Imported: ${imported}`)
  console.log(`  Updated: ${updated}`)
  console.log(`  Skipped: ${skipped}`)
  console.log(`  Errors: ${errors.length}`)
  if (errors.length > 0) {
    console.log('\n  First 10 errors:')
    errors.slice(0, 10).forEach(e => console.log(`    - ${e}`))
  }

  // 최종 카운트
  const { count: finalCount } = await supabase
    .from('pipeline_leads')
    .select('*', { count: 'exact', head: true })
  console.log(`\n  Final pipeline_leads count: ${finalCount}`)
}

main().catch(err => {
  console.error('Fatal error:', err)
  process.exit(1)
})
