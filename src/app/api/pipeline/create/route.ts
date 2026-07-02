import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { normalizeInquiryChannel, buildFirstTouch } from '@/lib/attribution'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  )
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const supabase = getSupabase()

    if (!body.company_name?.trim()) {
      return NextResponse.json({ error: 'company_name is required' }, { status: 400 })
    }

    // customer_code가 없으면 자동 생성 (YYMMDDHHmm, KST)
    if (!body.customer_code) {
      const kstNow = new Date(Date.now() + 9 * 60 * 60 * 1000)
      body.customer_code = [
        String(kstNow.getUTCFullYear()).slice(2),
        String(kstNow.getUTCMonth() + 1).padStart(2, '0'),
        String(kstNow.getUTCDate()).padStart(2, '0'),
        String(kstNow.getUTCHours()).padStart(2, '0'),
        String(kstNow.getUTCMinutes()).padStart(2, '0'),
      ].join('')
    }

    // STEP 3: attribution 정규화 + first_touch 스냅샷 (있으면 저장)
    // 폼/웹 소스에서 body 에 session_id, utm_*, landing_page, referrer 전달 가능.
    const hasAttribution = body.utm_source || body.utm_medium || body.utm_campaign
      || body.referrer || body.landing_page || body.site_session_id
    if (hasAttribution) {
      // 채널 표준화 (기존 inquiry_channel 값 보존이 아니라 utm 기준 재정규화)
      body.inquiry_channel = normalizeInquiryChannel({
        utm_source: body.utm_source,
        utm_medium: body.utm_medium,
        utm_campaign: body.utm_campaign,
        referrer: body.referrer,
        landing_page: body.landing_page,
        inquiry_source: body.inquiry_source,
        inquiry_channel: body.inquiry_channel,
      })
      // first_touch 스냅샷 (수동 입력 리드에는 없을 수 있음)
      if (!body.first_touch) {
        body.first_touch = buildFirstTouch({
          session_id: body.site_session_id,
          utm_source: body.utm_source,
          utm_medium: body.utm_medium,
          utm_campaign: body.utm_campaign,
          landing_page: body.landing_page,
          referrer: body.referrer,
        })
      }
    }

    const { data, error } = await supabase
      .from('pipeline_leads')
      .insert(body)
      .select()
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, data })
  } catch (error: any) {
    console.error('[Pipeline Create Error]', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
