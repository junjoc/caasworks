import { NextRequest, NextResponse } from 'next/server'
import { google } from 'googleapis'
import { createClient } from '@supabase/supabase-js'

const SHEET_ID = '1R9BkvzfbvtJap7Ymp7LtYdKsrvCtjfKrvxNw5mQPAHA'
const SHEET_TAB = '인바운드'

// 담당자 이름 목록 (상담내용에서 파싱)
const STAFF_NAMES = ['전성환', '박성언', '최한별', '유라예']

function getAuth() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_KEY || ''
  let credentials: any
  try {
    credentials = JSON.parse(raw)
  } catch {
    credentials = JSON.parse(Buffer.from(raw, 'base64').toString('utf-8'))
  }
  return new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
  })
}

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  )
}

/**
 * 상담내용에서 (이름) 패턴을 파싱하여 담당자를 추출
 * 여러 명이 있으면 마지막 사람이 담당자
 */
function parseAssignee(content: string | null): string | null {
  if (!content) return null

  // (이름) 패턴 매칭 - 괄호 안의 한글 2-4글자
  const matches = content.match(/\(([가-힣]{2,4})\)/g)
  if (!matches || matches.length === 0) return null

  // 괄호 제거하고 이름만 추출
  const names = matches.map(m => m.replace(/[()]/g, ''))

  // 스태프 이름에 포함된 것만 필터링
  const staffMatches = names.filter(name => STAFF_NAMES.includes(name))

  if (staffMatches.length === 0) return null

  // 마지막 사람이 담당자
  return staffMatches[staffMatches.length - 1]
}

/**
 * 문의채널 매핑 (시트 값 → DB 값)
 */
function mapInquiryChannel(channel: string): string {
  const ch = (channel || '').trim()
  // 시트 값 → 통합 채널명 매핑 (광고성과 채널과 동일 체계)
  const channelMap: Record<string, string> = {
    '상담신청': '자사채널',
    '문의하기': '자사채널',
    '공식홈페이지': '자사채널',
    '대표전화': '대표전화',
    '개인전화': '개인전화',
    '검색채널': '검색유입',
    '블로그': '블로그',
    '이용자 추천': '추천',
    '추천': '추천',
    '박람회': '이벤트/행사',
    // 이미 통합 채널명인 경우 그대로
    '네이버': '네이버',
    '구글': '구글',
    '메타': '메타',
    '유튜브': '유튜브',
    '검색유입': '검색유입',
    '자사채널': '자사채널',
    '언론': '언론',
    '이벤트/행사': '이벤트/행사',
  }
  return channelMap[ch] || ch || '기타'
}

/**
 * 시트 날짜를 YYYY-MM-DD 형식으로 변환
 */
function parseDate(dateStr: string): string | null {
  if (!dateStr) return null

  // 이미 YYYY-MM-DD 형식
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return dateStr

  // YYYY.MM.DD 형식
  if (/^\d{4}\.\d{2}\.\d{2}$/.test(dateStr)) return dateStr.replace(/\./g, '-')

  // MM/DD/YYYY or M/D/YYYY 형식
  const slashMatch = dateStr.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (slashMatch) {
    return `${slashMatch[3]}-${slashMatch[1].padStart(2, '0')}-${slashMatch[2].padStart(2, '0')}`
  }

  // Google Sheets serial date number
  const num = Number(dateStr)
  if (!isNaN(num) && num > 40000 && num < 50000) {
    const date = new Date((num - 25569) * 86400000)
    return date.toISOString().substring(0, 10)
  }

  return dateStr.substring(0, 10)
}

/**
 * 리드 스테이지 결정
 */
function determineStage(row: Record<string, string>): string {
  const docSent = (row['문서발송'] || '').trim()
  const quotation = (row['견적금액'] || '').trim()
  const adoption = (row['도입 예상'] || row['도입예상'] || '').trim()

  if (adoption && adoption !== '' && adoption !== '-') return '도입직전'
  if (quotation && quotation !== '' && quotation !== '-' && quotation !== '0') return '제안'
  if (docSent && docSent !== '' && docSent !== '-') return '제안'
  return '신규리드'
}

export async function POST(request: NextRequest) {
  try {
    const auth = getAuth()
    const sheets = google.sheets({ version: 'v4', auth })

    // 시트 전체 데이터 읽기 (A:AB)
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: `${SHEET_TAB}!A1:AB1500`,
    })

    const rows = response.data.values
    if (!rows || rows.length < 3) {
      return NextResponse.json({ error: 'No data found in sheet' }, { status: 404 })
    }

    // 헤더 행 (2번째 행, index 1)
    const headers = rows[1].map((h: string) => (h || '').trim())

    // 헤더 인덱스 매핑
    const colIndex: Record<string, number> = {}
    headers.forEach((h: string, i: number) => {
      if (h) colIndex[h] = i
    })

    console.log('Sheet headers:', headers)
    console.log('Column index map:', colIndex)

    const supabase = getSupabase()

    let imported = 0
    let updated = 0
    let skipped = 0
    let errors: string[] = []

    // 데이터 행 처리 (3번째 행부터, index 2)
    for (let i = 2; i < rows.length; i++) {
      const row = rows[i]
      if (!row || row.length === 0) continue

      // 헤더 기반으로 값 매핑
      const getValue = (headerName: string): string => {
        const idx = colIndex[headerName]
        if (idx === undefined) return ''
        return (row[idx] || '').trim()
      }

      const customerCode = getValue('고객사 ID')
      const companyName = getValue('회사명')

      // 고객사 ID와 회사명이 둘 다 없으면 스킵
      if (!customerCode && !companyName) {
        skipped++
        continue
      }

      const inquiryDate = parseDate(getValue('유입일'))
      const consultContent = getValue('상담내용')
      const inquiryContent = getValue('문의내용')

      // 담당자 파싱 (상담내용에서 괄호 안 이름)
      const assignedTo = parseAssignee(consultContent)

      // 회사명 처리 ('무명'은 그대로 유지하되 표시)
      const finalCompanyName = companyName === '무명'
        ? '무명 (미공개)'
        : companyName || '미상'

      // 행 데이터를 객체로 변환
      const rowObj: Record<string, string> = {}
      headers.forEach((h: string, idx: number) => {
        if (h && row[idx]) rowObj[h] = (row[idx] || '').trim()
      })

      const stage = determineStage(rowObj)

      // pipeline_leads 데이터 구성
      const leadData: any = {
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
        assigned_to: assignedTo,
        stage,
        priority: '중간',
        notes: [
          getValue('세부경로') ? `세부경로: ${getValue('세부경로')}` : '',
          getValue('초대 고객사 명') ? `초대고객사: ${getValue('초대 고객사 명')}` : '',
          getValue('소재 (대분류)') ? `소재: ${getValue('소재 (대분류)')}/${getValue('소재 (소분류)')}` : '',
          getValue('문서발송') ? `문서발송: ${getValue('문서발송')}` : '',
          getValue('견적금액') ? `견적금액: ${getValue('견적금액')}` : '',
        ].filter(Boolean).join(' | ') || null,
      }

      try {
        // customer_code 기준으로 upsert
        if (customerCode) {
          const { data: existing } = await supabase
            .from('pipeline_leads')
            .select('id')
            .eq('customer_code', customerCode)
            .limit(1)

          if (existing && existing.length > 0) {
            // 기존 데이터 업데이트
            const { error } = await supabase
              .from('pipeline_leads')
              .update(leadData)
              .eq('id', existing[0].id)

            if (error) {
              errors.push(`Row ${i + 1} (${customerCode}): ${error.message}`)
            } else {
              updated++
            }
          } else {
            // 새로 삽입
            const { error } = await supabase
              .from('pipeline_leads')
              .insert(leadData)

            if (error) {
              errors.push(`Row ${i + 1} (${customerCode}): ${error.message}`)
            } else {
              imported++
            }
          }
        } else {
          // customer_code 없으면 회사명+문의일 기준으로 중복 체크
          const { data: existing } = await supabase
            .from('pipeline_leads')
            .select('id')
            .eq('company_name', finalCompanyName)
            .eq('inquiry_date', inquiryDate || '')
            .limit(1)

          if (existing && existing.length > 0) {
            const { error } = await supabase
              .from('pipeline_leads')
              .update(leadData)
              .eq('id', existing[0].id)

            if (error) {
              errors.push(`Row ${i + 1} (${companyName}): ${error.message}`)
            } else {
              updated++
            }
          } else {
            const { error } = await supabase
              .from('pipeline_leads')
              .insert(leadData)

            if (error) {
              errors.push(`Row ${i + 1} (${companyName}): ${error.message}`)
            } else {
              imported++
            }
          }
        }
      } catch (err: any) {
        errors.push(`Row ${i + 1}: ${err.message}`)
      }
    }

    return NextResponse.json({
      success: true,
      total: rows.length - 2,
      imported,
      updated,
      skipped,
      errors: errors.slice(0, 20), // 처음 20개 에러만
      errorCount: errors.length,
    })
  } catch (error: any) {
    console.error('Sheet import error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// GET: 시트 구조 확인용
export async function GET() {
  try {
    const auth = getAuth()
    const sheets = google.sheets({ version: 'v4', auth })

    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: `${SHEET_TAB}!A1:AB3`,
    })

    const rows = response.data.values
    return NextResponse.json({
      headers: rows?.[1] || [],
      sampleRow: rows?.[2] || [],
      totalRows: 'Use POST to import',
    })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
