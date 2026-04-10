import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

/**
 * customer_code에서 시간(hour)을 추출
 * 형식: YYMMDDHHMM (10자리)  예: 2604071622 → 16시
 * 0001~0009 순번 코드: 시간 정보 없음 → null
 */
function parseHourFromCode(code: string | null): number | null {
  if (!code || code.length !== 10) return null

  const last4 = code.slice(6, 10)
  const asNum = parseInt(last4, 10)

  // 0001~0009 = 순번 코드, 시간 아님
  if (asNum >= 1 && asNum <= 9) return null

  const hh = parseInt(last4.slice(0, 2), 10)
  const mm = parseInt(last4.slice(2, 4), 10)

  if (hh >= 0 && hh <= 23 && mm >= 0 && mm <= 59) return hh
  return null
}

/**
 * created_at (UTC)에서 KST 시간 추출
 */
function parseHourFromCreatedAt(createdAt: string): number | null {
  try {
    const d = new Date(createdAt)
    const utcHour = d.getUTCHours()
    return (utcHour + 9) % 24 // KST = UTC + 9
  } catch {
    return null
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = createClient(supabaseUrl, supabaseKey)

    // Step 1: inquiry_hour 컬럼이 없으면 추가 시도
    // (Supabase PostgREST에서는 DDL을 직접 실행할 수 없으므로,
    //  컬럼이 없는 경우 에러가 나면 안내 메시지 반환)

    // Step 2: 전체 리드 조회
    const { data: leads, error: fetchError } = await supabase
      .from('pipeline_leads')
      .select('id, customer_code, created_at, notes')
      .order('created_at', { ascending: true })

    if (fetchError) {
      // inquiry_hour 컬럼이 없는 경우
      if (fetchError.message?.includes('inquiry_hour')) {
        return NextResponse.json({
          success: false,
          message: 'inquiry_hour 컬럼이 아직 없습니다. Supabase SQL Editor에서 다음을 실행하세요:\n\nALTER TABLE pipeline_leads ADD COLUMN IF NOT EXISTS inquiry_hour SMALLINT;',
        })
      }
      return NextResponse.json({ success: false, message: fetchError.message }, { status: 500 })
    }

    if (!leads || leads.length === 0) {
      return NextResponse.json({ success: true, message: '처리할 리드가 없습니다.', stats: {} })
    }

    let updated = 0
    let fromCode = 0
    let fromSlack = 0
    let noTime = 0
    const errors: string[] = []

    // Step 3: 각 리드별 inquiry_hour 계산 및 업데이트
    for (const lead of leads) {
      let hour: number | null = null

      if (lead.customer_code) {
        // customer_code에서 시간 추출
        hour = parseHourFromCode(lead.customer_code)
        if (hour !== null) fromCode++
        else noTime++
      } else {
        // Slack 자동등록 또는 customer_code 없는 경우: created_at 사용
        const isSlack = lead.notes?.includes('Slack') || lead.notes?.includes('자동등록')
        if (isSlack && lead.created_at) {
          hour = parseHourFromCreatedAt(lead.created_at)
          if (hour !== null) fromSlack++
          else noTime++
        } else {
          noTime++
        }
      }

      const { error: updateError } = await supabase
        .from('pipeline_leads')
        .update({ inquiry_hour: hour })
        .eq('id', lead.id)

      if (updateError) {
        errors.push(`${lead.id}: ${updateError.message}`)
      } else {
        updated++
      }
    }

    return NextResponse.json({
      success: true,
      message: `${updated}/${leads.length}건 업데이트 완료`,
      stats: {
        total: leads.length,
        updated,
        fromCustomerCode: fromCode,
        fromSlackCreatedAt: fromSlack,
        noTimeInfo: noTime,
        errors: errors.length,
      },
      sampleErrors: errors.slice(0, 5),
    })
  } catch (err: any) {
    console.error('[Backfill inquiry_hour error]', err)
    return NextResponse.json({ success: false, message: err.message }, { status: 500 })
  }
}
