import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

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
