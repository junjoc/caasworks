import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import crypto from 'crypto'

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

/**
 * 레퍼러 URL에서 유입경로 추정
 */
function inferInquirySource(referrer: string | null): { channel: string; source: string } {
  if (!referrer) return { channel: '자사채널', source: '홈페이지' }

  const url = referrer.toLowerCase()
  if (url.includes('blog.naver.com') || url.includes('m.blog.naver.com'))
    return { channel: '블로그', source: '네이버' }
  if (url.includes('search.naver.com') || url.includes('m.search.naver.com'))
    return { channel: '검색유입', source: '네이버' }
  if (url.includes('google.com/search') || url.includes('google.co.kr'))
    return { channel: '검색유입', source: '구글' }
  if (url.includes('youtube.com'))
    return { channel: '유튜브', source: '유튜브' }
  if (url.includes('instagram.com') || url.includes('facebook.com'))
    return { channel: '메타', source: '메타' }
  if (url.includes('caas.co.kr') || url.includes('caasworks'))
    return { channel: '자사채널', source: '홈페이지' }
  if (url.includes('tistory.com'))
    return { channel: '블로그', source: '티스토리' }

  return { channel: '자사채널', source: '기타' }
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
        const { channel: inquiryChannel, source: inquirySource } = inferInquirySource(inquiry.referrer)

        // 중복 체크 (같은 이메일 또는 전화번호 + 같은 날짜)
        // KST(한국시간) 기준으로 오늘 날짜 계산 (Vercel 서버는 UTC)
        const now = new Date()
        const kstOffset = 9 * 60 * 60 * 1000
        const today = new Date(now.getTime() + kstOffset).toISOString().substring(0, 10)
        let isDuplicate = false

        if (inquiry.email) {
          const { data: dup } = await supabase
            .from('pipeline_leads')
            .select('id')
            .eq('contact_email', inquiry.email)
            .eq('inquiry_date', today)
            .limit(1)
          if (dup && dup.length > 0) isDuplicate = true
        }

        if (!isDuplicate && inquiry.phone) {
          const { data: dup } = await supabase
            .from('pipeline_leads')
            .select('id')
            .eq('contact_phone', inquiry.phone)
            .eq('inquiry_date', today)
            .limit(1)
          if (dup && dup.length > 0) isDuplicate = true
        }

        if (isDuplicate) {
          console.log('Slack webhook: duplicate inquiry detected, skipping')
          return NextResponse.json({ ok: true, action: 'duplicate_skipped' })
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

        // pipeline_leads에 삽입
        const { error: leadError } = await supabase.from('pipeline_leads').insert({
          customer_code: customerCode,
          company_name: companyName,
          contact_person: inquiry.name,
          contact_email: inquiry.email,
          contact_phone: inquiry.phone,
          inquiry_date: today,
          inquiry_channel: inquiryChannel,
          inquiry_source: inquirySource,
          inquiry_content: [
            inquiry.extra_content,  // 레퍼러 주소 ↔ 실제 레퍼러 사이의 실제 문의 내용 (최우선)
            inquiry.referrer ? `레퍼러 주소: ${inquiry.referrer}` : null,
            inquiry.actual_referrer ? `실제 레퍼러: ${inquiry.actual_referrer}` : null,
          ].filter(Boolean).join('\n') || null,
          stage: '신규리드',
          priority: '중간',
          inquiry_hour: (new Date().getUTCHours() + 9) % 24, // KST
          notes: '[Slack 문의알림] 자동등록',
        })

        if (leadError) {
          console.error('Slack webhook: lead insert error', leadError)
          return NextResponse.json({ error: 'Lead insert failed' }, { status: 500 })
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
