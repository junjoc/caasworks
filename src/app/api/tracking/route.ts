import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  )
}

// CORS headers for cross-origin tracking script
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS })
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { type, payload } = body

    if (!type || !payload) {
      return NextResponse.json({ error: 'Missing type or payload' }, { status: 400, headers: CORS })
    }

    const sb = getSupabase()

    switch (type) {
      case 'session': {
        const { error } = await sb.from('site_sessions').upsert({
          session_id: payload.session_id,
          visitor_id: payload.visitor_id,
          utm_source: payload.utm_source || null,
          utm_medium: payload.utm_medium || null,
          utm_campaign: payload.utm_campaign || null,
          utm_content: payload.utm_content || null,
          utm_term: payload.utm_term || null,
          referrer: payload.referrer || null,
          landing_page: payload.landing_page || null,
          device_type: payload.device_type || null,
          browser: payload.browser || null,
          os: payload.os || null,
          screen_resolution: payload.screen_resolution || null,
        }, { onConflict: 'session_id' })
        if (error) throw error
        break
      }

      case 'pageview': {
        const { error } = await sb.from('site_pageviews').insert({
          session_id: payload.session_id,
          visitor_id: payload.visitor_id,
          page_url: payload.page_url,
          page_title: payload.page_title || null,
        })
        if (error) throw error
        // Update session page count
        await sb.from('site_sessions')
          .update({ page_count: payload.page_count || 1, ended_at: new Date().toISOString() })
          .eq('session_id', payload.session_id)
        break
      }

      case 'event': {
        const { error } = await sb.from('site_events').insert({
          session_id: payload.session_id,
          visitor_id: payload.visitor_id,
          event_type: payload.event_type,
          event_data: payload.event_data || {},
          page_url: payload.page_url || null,
        })
        if (error) throw error

        // 문의 폼 제출 시 세션에 customer_code 연결
        if (payload.event_type === 'form_submit' && payload.event_data?.customer_code) {
          await sb.from('site_sessions').update({
            has_inquiry: true,
            customer_code: payload.event_data.customer_code,
          }).eq('session_id', payload.session_id)
        }
        break
      }

      case 'update_pageview': {
        // 페이지 이탈 시 체류시간, 스크롤 깊이 업데이트
        const { error } = await sb.from('site_pageviews').update({
          duration_seconds: payload.duration_seconds,
          scroll_depth: payload.scroll_depth,
          cta_clicked: payload.cta_clicked || false,
          cta_location: payload.cta_location || null,
        }).eq('id', payload.pageview_id)
        if (error) throw error
        break
      }

      case 'end_session': {
        const { error } = await sb.from('site_sessions').update({
          ended_at: new Date().toISOString(),
          duration_seconds: payload.duration_seconds,
          page_count: payload.page_count,
        }).eq('session_id', payload.session_id)
        if (error) throw error
        break
      }

      // 배치 전송 (beacon API용)
      case 'batch': {
        const events = payload.events || []
        if (events.length > 0) {
          const { error } = await sb.from('site_events').insert(events)
          if (error) throw error
        }
        break
      }

      default:
        return NextResponse.json({ error: 'Unknown type' }, { status: 400, headers: CORS })
    }

    return NextResponse.json({ ok: true }, { headers: CORS })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Unknown error'
    console.error('[tracking]', msg)
    return NextResponse.json({ error: msg }, { status: 500, headers: CORS })
  }
}
