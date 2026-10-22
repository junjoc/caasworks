import { NextRequest, NextResponse } from 'next/server'
import { formatPhone } from '@/lib/phone'
import { createClient } from '@supabase/supabase-js'
import crypto from 'crypto'
import { inferLeadChannel, buildFirstTouch, parseUtmFromText } from '@/lib/attribution'
import { findOrCreateCustomer } from '@/lib/find-customer'
import { autoTagLead } from '@/lib/topic-tags'
import { mapLeadChannelToAds, syncLeadToAdPerformance } from '@/lib/sync-lead-to-ads'

// Use service role for server-side operations
function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  )
}

// Slack signing secret verification
function verifySlackSignature(
  signingSecret: string,
  signature: string,
  timestamp: string,
  body: string,
): boolean {
  const fiveMinAgo = Math.floor(Date.now() / 1000) - 60 * 5
  if (parseInt(timestamp) < fiveMinAgo) return false

  const sigBasestring = `v0:${timestamp}:${body}`
  const mySignature = `v0=${crypto
    .createHmac('sha256', signingSecret)
    .update(sigBasestring, 'utf8')
    .digest('hex')}`

  const a = Buffer.from(mySignature, 'utf8')
  const b = Buffer.from(signature, 'utf8')
  if (a.length !== b.length) return false
  return crypto.timingSafeEqual(a, b)
}

// Parse project info from Slack message text
// Expected pattern: "🎉 신규 프로젝트 생성" with fields like:
// 프로젝트명: XXX
// 주소: XXX
// 생성자: XXX
// 생성회사: XXX
function parseProjectMessage(text: string): {
  project_name: string | null
  address: string | null
  created_by: string | null
  company_name: string | null
} | null {
  if (!text.includes('신규 프로젝트') && !text.includes('프로젝트 생성')) {
    return null
  }

  const getField = (label: string): string | null => {
    // Match patterns like "프로젝트명: value" or "프로젝트명 : value" or "*프로젝트명:* value"
    const regex = new RegExp(`\\*?${label}\\*?\\s*[:：]\\s*(.+?)(?:\\n|$)`, 'i')
    const match = text.match(regex)
    return match ? match[1].trim() : null
  }

  const project_name = getField('프로젝트명') || getField('프로젝트')
  if (!project_name) return null

  return {
    project_name,
    address: getField('주소') || getField('현장주소') || getField('위치'),
    created_by: getField('생성자') || getField('담당자') || getField('등록자'),
    company_name: getField('생성회사') || getField('회사') || getField('고객사') || getField('업체'),
  }
}

/**
 * Slack 마크업 정리
 * <mailto:xxx@xxx.com|xxx@xxx.com> → xxx@xxx.com
 * <https://url> → https://url
 * &amp; → &
 */
function cleanSlackMarkup(text: string | null): string | null {
  if (!text) return null
  return text
    .replace(/<tel:([^|>]+)\|[^>]*>/g, '$1')      // <tel:x|x> → x
    .replace(/<tel:([^>]+)>/g, '$1')               // <tel:x> → x
    .replace(/<mailto:([^|>]+)\|[^>]*>/g, '$1')    // <mailto:x|x> → x
    .replace(/<mailto:([^>]+)>/g, '$1')             // <mailto:x> → x
    .replace(/<(https?:\/\/[^|>]+)\|[^>]*>/g, '$1') // <url|label> → url
    .replace(/<(https?:\/\/[^>]+)>/g, '$1')        // <url> → url
    .replace(/&amp;/g, '&')                         // &amp; → &
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .trim()
}

// Parse inquiry notification from "문의알림봇" in #문의-알림 channel
// Expected pattern (order matters for 문의내용 extraction):
//   caas 문의 알림
//   이름: 김OO
//   이메일: xxx@xxx.com
//   전화번호: 01012345678
//   회사명: OO건설
//   레퍼러 주소: https://caas.co.kr/inquiry?...
//     <<< 문의내용이 여기 들어감 (레퍼러 주소 ↔ 실제 레퍼러 사이) >>>
//     - 질문 1
//     - 요청 사항 2
//     (또는 자유 텍스트)
//   실제 레퍼러: https://google.com/search?...
function parseInquiryMessage(text: string): {
  name: string | null
  email: string | null
  phone: string | null
  company_name: string | null
  referrer: string | null
  actual_referrer: string | null
  extra_content: string | null
} | null {
  // "문의 알림" 또는 "문의알림" 키워드 확인
  if (!text.includes('문의 알림') && !text.includes('문의알림')) {
    return null
  }

  const getField = (label: string): string | null => {
    const regex = new RegExp(`\\*?${label}\\*?\\s*[:：]\\s*(.+?)(?:\\n|$)`, 'i')
    const match = text.match(regex)
    return match ? match[1].trim() : null
  }

  const name = getField('이름')
  // 이름이 없으면 문의 메시지가 아님
  if (!name) return null

  // 문의내용 추출: "레퍼러 주소" 줄 다음부터 "실제 레퍼러" 줄 이전까지
  // (사용자 지정: "레퍼러주소와 실제 레퍼러 사이에 내용이 문의내용")
  const lines = text.split('\n')
  let startIdx = -1
  let endIdx = -1
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (startIdx === -1 && /\*?레퍼러\s*주소\*?\s*[:：]/i.test(line)) {
      startIdx = i + 1
    } else if (startIdx !== -1 && endIdx === -1 && /\*?실제\s*레퍼러\*?\s*[:：]/i.test(line)) {
      endIdx = i
      break
    }
  }

  let extra_content: string | null = null
  if (startIdx !== -1) {
    const sliceEnd = endIdx === -1 ? lines.length : endIdx
    const between = lines.slice(startIdx, sliceEnd)
      .map(l => l.replace(/^\s*[-•·]\s*/, '').trim())  // 불릿 제거
      .map(l => cleanSlackMarkup(l) || l)
      .filter(Boolean)
    if (between.length > 0) {
      extra_content = between.join('\n')
    }
  }

  // 폴백: 사이에 아무것도 없으면 기존 "- " 접두사 라인들 사용
  if (!extra_content) {
    const dashLines = lines
      .filter(l => l.trim().startsWith('-') && !/레퍼러/.test(l))
      .map(l => l.trim().substring(1).trim())
      .map(l => cleanSlackMarkup(l) || l)
      .filter(Boolean)
    if (dashLines.length > 0) extra_content = dashLines.join('\n')
  }

  return {
    name,
    email: cleanSlackMarkup(getField('이메일') || getField('메일')),
    phone: cleanSlackMarkup(getField('전화번호') || getField('연락처') || getField('휴대폰')),
    company_name: cleanSlackMarkup(getField('회사명') || getField('회사') || getField('업체명')),
    referrer: cleanSlackMarkup(getField('레퍼러 주소') || getField('레퍼러') || getField('유입경로')),
    actual_referrer: cleanSlackMarkup(getField('실제 레퍼러') || getField('실제레퍼러')),
    extra_content,
  }
}


export async function POST(request: NextRequest) {
  try {
    const rawBody = await request.text()
    let body: any

    try {
      body = JSON.parse(rawBody)
    } catch {
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
    }

    // Handle Slack URL verification challenge
    if (body.type === 'url_verification') {
      return NextResponse.json({ challenge: body.challenge })
    }

    // Verify Slack signature (if signing secret is configured)
    const signingSecret = process.env.SLACK_SIGNING_SECRET?.trim().replace(/\\n/g, '')
    if (signingSecret) {
      const slackSignature = request.headers.get('x-slack-signature') || ''
      const slackTimestamp = request.headers.get('x-slack-request-timestamp') || ''

      if (!verifySlackSignature(signingSecret, slackSignature, slackTimestamp, rawBody)) {
        console.error('[slack-webhook] Signature verification failed', {
          secretLength: signingSecret.length,
          hasSignature: !!slackSignature,
          timestamp: slackTimestamp,
        })
        return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
      }
    }

    // Handle event callbacks
    if (body.type === 'event_callback') {
      const event = body.event

      // Only process bot messages (문의알림봇 등)
      // 사용자가 직접 작성한 메시지나 댓글은 무시
      if (event?.type !== 'message') {
        return NextResponse.json({ ok: true })
      }

      // bot_message subtype이거나 bot_id가 있는 경우만 처리
      if (event.subtype !== 'bot_message' && !event.bot_id) {
        return NextResponse.json({ ok: true, skipped: 'not_bot_message' })
      }

      const text = event.text || ''

      // Also handle attachments / blocks text
      const attachmentText = (event.attachments || [])
        .map((a: any) => [a.text, a.pretext, a.fallback].filter(Boolean).join('\n'))
        .join('\n')

      // Handle blocks (rich_text, section, etc.)
      const blocksText = (event.blocks || [])
        .map((b: any) => {
          if (b.type === 'rich_text') {
            return (b.elements || []).map((el: any) =>
              (el.elements || []).map((e: any) => e.text || '').join('')
            ).join('\n')
          }
          if (b.type === 'section') {
            return b.text?.text || ''
          }
          return ''
        })
        .filter(Boolean)
        .join('\n')

      const fullText = [text, attachmentText, blocksText].filter(Boolean).join('\n')
      console.log('[slack-webhook] Received event', JSON.stringify({ subtype: event.subtype, bot_id: event.bot_id, text: text.substring(0, 50), attachments: event.attachments?.length || 0, blocks: event.blocks?.length || 0, fullTextLength: fullText.length, fullTextPreview: fullText.substring(0, 300) }))

      const supabase = getSupabase()

      // 1. 문의알림봇 메시지 처리 (pipeline_leads)
      const inquiry = parseInquiryMessage(fullText)
      if (inquiry) {
        // 문의폼이 문의내용에 붙인 utm 줄을 레퍼러보다 우선 (예: NAds 광고는 레퍼러가 중간 랜딩 도메인)
        const utm = parseUtmFromText([inquiry.extra_content, fullText].filter(Boolean).join('\n'))
        const { channel: inquiryChannel, source: inquirySource } = inferLeadChannel({ ...utm, referrer: inquiry.referrer })

        // 재문의 처리 (2026-10-21) — 전에는 같은 날 같은 이메일·번호면 건너뛰어 두 번째 문의 내용이 CRM 에 남지 않았다.
        // 같은 사람(번호는 숫자만, 이메일은 대소문자 무시)의 리드를 찾아
        //  ① 같은 날이거나 ② 진행 중(이탈·도입완료 아님)이고 최근 30일 안이면 → 새 리드 없이 그 리드 타임라인에 "온라인 재문의"로 붙임
        //  ③ 그 밖이면(오래됐거나 끝난 리드) → 새 리드를 만들고 메모에 "이전 문의 ID" 를 남김 (다른 현장일 수 있음)
        const now = new Date()
        const kstOffset = 9 * 60 * 60 * 1000
        const today = new Date(now.getTime() + kstOffset).toISOString().substring(0, 10)
        const ago30 = new Date(now.getTime() + kstOffset - 30 * 86400000).toISOString().substring(0, 10)
        const phoneDigits = (inquiry.phone || '').replace(/\D/g, '')
        const email = (inquiry.email || '').trim().toLowerCase()
        let prev: { id: string; customer_code: string | null; stage: string; inquiry_date: string | null; created_at: string; assigned_to: string | null; next_action: string | null; inquiry_content?: string | null } | null = null
        if (phoneDigits.length >= 8 || email.includes('@')) {
          const ors = [phoneDigits.length >= 8 && `contact_phone.ilike.%${phoneDigits.slice(-4)}%`, email.includes('@') && `contact_email.ilike.${email}`].filter(Boolean).join(',')
          const { data: cands } = await supabase.from('pipeline_leads')
            .select('id, customer_code, stage, inquiry_date, created_at, assigned_to, next_action, contact_phone, contact_email, inquiry_content')
            .or(ors).order('created_at', { ascending: false }).limit(30)
          prev = (cands || []).find(l =>
            (phoneDigits.length >= 8 && String(l.contact_phone || '').replace(/\D/g, '').endsWith(phoneDigits.slice(-8))) ||
            (email.includes('@') && String(l.contact_email || '').toLowerCase() === email)) || null
        }
        const prevDate = prev ? (prev.inquiry_date || prev.created_at.slice(0, 10)) : ''
        const attach = !!prev && (prevDate === today || (!['이탈', '도입완료'].includes(prev.stage) && prevDate >= ago30))
        const reContent = [inquiry.company_name && `회사: ${inquiry.company_name}`, inquiry.name && `문의자: ${inquiry.name}`, inquiry.extra_content, inquiry.referrer && `레퍼러: ${inquiry.referrer}`].filter(Boolean).join('\n')

        // 10/22: 같은 내용이 7일 안에 다시 오면 같은 문의(Slack 재전송 · 두 번 누름 · 같은 내용 재접수)로 보고 건너뜀 (사용자: 30분 → 7일)
        // (셀트리온 10/21: 22:57 등록 → 22:58 같은 내용이 "재문의"로 붙었던 것)
        const body1 = (s: string | null | undefined) => String(s || '').replace(/레퍼러[^\n]*|실제 레퍼러[^\n]*/g, '').replace(/\s+/g, '')
        if (prev && Date.now() - new Date(prev.created_at).getTime() < 7 * 86400000 && inquiry.extra_content && body1(prev.inquiry_content).includes(body1(inquiry.extra_content))) {
          console.log('Slack webhook: same inquiry within 7 days, skipping', prev.id)
          return NextResponse.json({ ok: true, action: 'duplicate_resend_skipped', lead_id: prev.id })
        }
        if (prev && attach) {
          await supabase.from('pipeline_history').insert({
            lead_id: prev.id, field_changed: 'reinquiry', changed_by: null,
            old_value: `홈페이지 문의 · ${inquiryChannel || ''}${inquirySource ? ` / ${inquirySource}` : ''}`.slice(0, 200),
            new_value: reContent.slice(0, 2000) || '(내용 없음)',
          })
          // 담당자가 놓치지 않게: 다음 액션이 비어 있으면 "온라인 재문의 확인 · 오늘"
          if (!prev.next_action) await supabase.from('pipeline_leads').update({ next_action: '온라인 재문의 확인', next_action_date: today }).eq('id', prev.id)
          console.log('Slack webhook: re-inquiry attached to', prev.id)
          return NextResponse.json({ ok: true, action: 'reinquiry_attached', lead_id: prev.id })
        }

        // 회사명 처리
        const companyName = inquiry.company_name
          ? (inquiry.company_name === '무명' ? '무명 (미공개)' : inquiry.company_name)
          : '미상'

        // customer_code 자동 생성 (YYMMDDHHmm 형식, KST 기준)
        const kstNow = new Date(Date.now() + 9 * 60 * 60 * 1000)
        const customerCode = [
          String(kstNow.getUTCFullYear()).slice(2),
          String(kstNow.getUTCMonth() + 1).padStart(2, '0'),
          String(kstNow.getUTCDate()).padStart(2, '0'),
          String(kstNow.getUTCHours()).padStart(2, '0'),
          String(kstNow.getUTCMinutes()).padStart(2, '0'),
        ].join('')

        // P0-6: 고객사 ID → 회사명(정규화) 순으로 기존 고객을 찾고, 없을 때만 생성 (2026-10-20)
        let leadCustomerId: string | null = null
        const cust = await findOrCreateCustomer(supabase, {
          customer_code: customerCode, company_name: companyName,
          contact_person: inquiry.name ?? null, contact_phone: inquiry.phone ?? null, contact_email: inquiry.email ?? null,
        })
        if (cust.error) console.error('Slack webhook: customer insert error', cust.error)
        else leadCustomerId = cust.id

        // pipeline_leads에 삽입
        const { data: newLead, error: leadError } = await supabase.from('pipeline_leads').insert({
          customer_code: customerCode,
          customer_id: leadCustomerId,
          company_name: companyName,
          contact_person: inquiry.name,
          contact_email: inquiry.email,
          contact_phone: inquiry.phone ? formatPhone(inquiry.phone) : inquiry.phone,
          inquiry_date: today,
          inquiry_channel: inquiryChannel,
          inquiry_source: inquirySource,
          referrer: inquiry.referrer,
          utm_source: utm.utm_source,
          utm_medium: utm.utm_medium,
          utm_campaign: utm.utm_campaign,
          utm_content: utm.utm_content,
          utm_term: utm.utm_term,
          landing_page: utm.landing_page,
          first_touch: buildFirstTouch({ ...utm, referrer: inquiry.referrer }) as any,
          inquiry_content: [
            inquiry.extra_content,  // 레퍼러 주소 ↔ 실제 레퍼러 사이의 실제 문의 내용 (최우선)
            inquiry.referrer ? `레퍼러 주소: ${inquiry.referrer}` : null,
            inquiry.actual_referrer ? `실제 레퍼러: ${inquiry.actual_referrer}` : null,
          ].filter(Boolean).join('\n') || null,
          stage: '신규리드',
          priority: '중간',
          inquiry_hour: (new Date().getUTCHours() + 9) % 24, // KST
          notes: ['[Slack 문의알림] 자동등록', prev && `[재문의] 이전 문의 ID ${prev.customer_code || '-'} (${prev.stage}, ${prevDate})`].filter(Boolean).join('\n'),
        }).select('id').single()

        if (leadError) {
          console.error('Slack webhook: lead insert error', leadError)
          return NextResponse.json({ error: 'Lead insert failed' }, { status: 500 })
        }
        if (newLead?.id) await autoTagLead(supabase, newLead.id)
        // 대응표(ad_campaign_map)에 있는 광고 캠페인 리드는 광고성과 해당 광고그룹 행에 문의 자동 반영 (같은 회사명은 중복 안 됨)
        if (mapLeadChannelToAds(inquiryChannel, inquirySource)?.adgroup_name) {
          try {
            await syncLeadToAdPerformance(supabase, {
              inquiry_date: today, inquiry_channel: inquiryChannel, inquiry_source: inquirySource,
              company_name: companyName, stage: '신규리드',
            })
          } catch (e) { console.error('Slack webhook: ad sync failed', e) }
        }

        return NextResponse.json({ ok: true, action: 'inquiry_lead_created' })
      }

      // 2. 프로젝트 생성 메시지 처리
      const parsed = parseProjectMessage(fullText)
      if (!parsed) {
        // Not a recognized message, ignore
        return NextResponse.json({ ok: true })
      }

      // Try to match company
      let customerId: string | null = null
      let source: string = 'slack_pending'

      if (parsed.company_name) {
        // Try exact match first
        const { data: exactMatch } = await supabase
          .from('customers')
          .select('id')
          .ilike('company_name', parsed.company_name)
          .limit(1)
          .single()

        if (exactMatch) {
          customerId = exactMatch.id
          source = 'slack'
        } else {
          // Try partial match
          const { data: partialMatch } = await supabase
            .from('customers')
            .select('id')
            .ilike('company_name', `%${parsed.company_name}%`)
            .limit(1)
            .single()

          if (partialMatch) {
            customerId = partialMatch.id
            source = 'slack'
          }
        }
      }

      // Insert project
      const { error: insertError } = await supabase.from('projects').insert({
        customer_id: customerId || '00000000-0000-0000-0000-000000000000', // placeholder for unmatched
        project_name: parsed.project_name,
        address: parsed.address,
        created_by: parsed.created_by,
        source,
        status: 'active',
        notes: customerId
          ? null
          : `[Slack 미매칭] 원본 회사명: ${parsed.company_name || '미지정'}`,
      })

      if (insertError) {
        console.error('Slack webhook: project insert error', insertError)
        return NextResponse.json({ error: 'Insert failed' }, { status: 500 })
      }

      return NextResponse.json({ ok: true, matched: !!customerId })
    }

    return NextResponse.json({ ok: true })
  } catch (error: any) {
    console.error('Slack webhook error:', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// Health check
export async function GET() {
  return NextResponse.json({
    status: 'ok',
    webhook: 'Slack webhook endpoint is active',
    usage: 'POST Slack events to this URL',
  })
}
