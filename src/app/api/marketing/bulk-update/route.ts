import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

// 시트 데이터로 ad_performance 일괄 업데이트 (GA유입, 문의클릭, 가입/문의/도입)
export async function POST(request: NextRequest) {
  try {
    const { updates } = await request.json()
    // updates: [{date, channel, ga_visits, inquiry_clicks, signups, inquiries, adoptions}]

    if (!updates || !Array.isArray(updates)) {
      return NextResponse.json({ error: 'updates array required' }, { status: 400 })
    }

    const supabase = createClient(supabaseUrl, supabaseKey)
    let updated = 0

    for (const u of updates) {
      // Get rows for this date + channel
      const { data: rows } = await supabase
        .from('ad_performance')
        .select('id, clicks, adgroup_name')
        .eq('channel', u.channel)
        .eq('date', u.date)

      if (!rows || rows.length === 0) continue

      const totalClicks = rows.reduce((s: number, r: any) => s + (r.clicks || 0), 0)
      const totalGa = u.ga_visits || 0
      const totalIc = u.inquiry_clicks || 0

      let remGa = totalGa
      let remIc = totalIc
      const sorted = [...rows].sort((a: any, b: any) => (b.clicks || 0) - (a.clicks || 0))

      for (let i = 0; i < sorted.length; i++) {
        const r = sorted[i]
        let ga: number, ic: number

        if (i === sorted.length - 1) {
          ga = remGa
          ic = remIc
        } else if (totalClicks > 0) {
          const ratio = (r.clicks || 0) / totalClicks
          ga = Math.round(totalGa * ratio)
          ic = Math.round(totalIc * ratio)
          remGa -= ga
          remIc -= ic
        } else {
          const n = sorted.length
          ga = Math.floor(totalGa / n) + (i < totalGa % n ? 1 : 0)
          ic = Math.floor(totalIc / n) + (i < totalIc % n ? 1 : 0)
          remGa -= ga
          remIc -= ic
        }

        const patch: Record<string, any> = { ga_visits: ga, inquiry_clicks: ic }

        // First row (most clicks) gets signups/inquiries/adoptions
        if (i === 0) {
          if (u.signups > 0) patch.signups = u.signups
          if (u.inquiries > 0) patch.inquiries = u.inquiries
          if (u.adoptions > 0) patch.adoptions = u.adoptions
        }

        await supabase.from('ad_performance').update(patch).eq('id', r.id)
        updated++
      }
    }

    return NextResponse.json({ success: true, updated })
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
