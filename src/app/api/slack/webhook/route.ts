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

  return crypto.timingSafeEqual(
    Buffer.from(mySignature, 'utf8'),
    Buffer.from(signature, 'utf8'),
  )
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
    const signingSecret = process.env.SLACK_SIGNING_SECRET
    if (signingSecret) {
      const slackSignature = request.headers.get('x-slack-signature') || ''
      const slackTimestamp = request.headers.get('x-slack-request-timestamp') || ''

      if (!verifySlackSignature(signingSecret, slackSignature, slackTimestamp, rawBody)) {
        return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
      }
    }

    // Handle event callbacks
    if (body.type === 'event_callback') {
      const event = body.event

      // Only process message events
      if (event?.type !== 'message' || event.subtype) {
        return NextResponse.json({ ok: true })
      }

      const text = event.text || ''

      // Also handle attachments / blocks text
      const attachmentText = (event.attachments || [])
        .map((a: any) => [a.text, a.pretext, a.fallback].filter(Boolean).join('\n'))
        .join('\n')

      const fullText = [text, attachmentText].filter(Boolean).join('\n')

      const parsed = parseProjectMessage(fullText)
      if (!parsed) {
        // Not a project creation message, ignore
        return NextResponse.json({ ok: true })
      }

      const supabase = getSupabase()

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
