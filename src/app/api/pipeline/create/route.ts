import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { inferLeadChannel, buildFirstTouch } from '@/lib/attribution'
import { autoTagLead } from '@/lib/topic-tags'
import { findOrCreateCustomer } from '@/lib/find-customer'

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

    // P0-6: 고객사 ID → 회사명(정규화) 순으로 기존 고객을 찾고, 없을 때만 생성 (같은 회사가 문의마다 새 고객으로 생기던 문제, 2026-10-20)
    // 10/21 새 리드 등록: "같은 회사의 새 문의"면 고른 고객사(customer_id)에, "다른 회사"면 이름이 같아도 새 고객으로
    const newCustomer = !!body.new_customer
    delete body.new_customer
    if (!body.customer_id) {
      if (newCustomer) {
        const { data: c, error: ce } = await supabase.from('customers').insert({
          customer_code: body.customer_code, company_name: body.company_name, status: 'active',
          contact_person: body.contact_person ?? null, contact_phone: body.contact_phone ?? null, contact_email: body.contact_email ?? null,
        }).select('id').single()
        if (ce) return NextResponse.json({ error: `customer insert 실패: ${ce.message}` }, { status: 500 })
        body.customer_id = c.id
      } else {
        const cust = await findOrCreateCustomer(supabase, {
          customer_code: body.customer_code, company_name: body.company_name,
          contact_person: body.contact_person ?? null, contact_phone: body.contact_phone ?? null, contact_email: body.contact_email ?? null,
        })
        if (cust.error) return NextResponse.json({ error: `customer insert 실패: ${cust.error}` }, { status: 500 })
        body.customer_id = cust.id
      }
    }

    // 폼/웹 소스에서 body 에 session_id, utm_*, landing_page, referrer 전달 가능.
    const hasAttribution = body.utm_source || body.utm_medium || body.utm_campaign
      || body.referrer || body.landing_page || body.site_session_id
    if (hasAttribution) {
      // 사람이 고른 채널은 존중하고, 비어 있을 때만 레퍼러/utm 으로 추정
      if (!body.inquiry_channel) {
        const inferred = inferLeadChannel(body)
        body.inquiry_channel = inferred.channel
        if (!body.inquiry_source) body.inquiry_source = inferred.source
      }
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
    if (data?.id) await autoTagLead(supabase, data.id)

    return NextResponse.json({ success: true, data })
  } catch (error: any) {
    console.error('[Pipeline Create Error]', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
