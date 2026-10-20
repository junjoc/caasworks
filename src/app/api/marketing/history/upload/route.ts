import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { parseMarketingYearFile } from '@/lib/marketing-history'

// 마케팅 연간 현황표(연도별 xlsx) 업로드. 파일 하나 = 연도 하나. 같은 연도를 다시 올리면 그 연도 데이터를 교체.
export async function POST(request: NextRequest) {
  const form = await request.formData().catch(() => null)
  if (!form) return NextResponse.json({ error: '파일 업로드 형식이 아닙니다' }, { status: 400 })
  const files = form.getAll('files').filter((f): f is File => typeof f !== 'string')
  if (!files.length) return NextResponse.json({ error: '파일이 없습니다' }, { status: 400 })

  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  )

  const results: { file: string; ok: boolean; message: string; warnings?: string[] }[] = []
  for (const f of files) {
    try {
      const p = parseMarketingYearFile(Buffer.from(await f.arrayBuffer()))
      if (!p.summary.length) throw new Error('월 요약 데이터가 없습니다')
      const now = new Date().toISOString()
      // 해당 연도 교체
      const { error: d1 } = await sb.from('marketing_monthly_history').delete().eq('year', p.year)
      if (d1) throw d1
      const { error: d2 } = await sb.from('marketing_monthly_channel_history').delete().eq('year', p.year)
      if (d2) throw d2
      const { error: i1 } = await sb.from('marketing_monthly_history').insert(p.summary.map(s => ({ ...s, source: 'sheet', uploaded_at: now })))
      if (i1) throw i1
      if (p.details.length) {
        const { error: i2 } = await sb.from('marketing_monthly_channel_history').insert(p.details.map(d => ({ ...d, uploaded_at: now })))
        if (i2) throw i2
      }
      const cost = p.summary.reduce((a, s) => a + s.cost_total, 0)
      const inq = p.summary.reduce((a, s) => a + (s.inquiries || 0), 0)
      const ado = p.summary.reduce((a, s) => a + (s.adoptions || 0), 0)
      results.push({
        file: f.name, ok: true,
        message: `${p.year}년 ${p.summary.length}개월 · 상세 ${p.details.length}행 (광고비 ${Math.round(cost).toLocaleString()}원, 문의 ${inq}, 도입 ${ado})`,
        warnings: p.warnings.length ? p.warnings : undefined,
      })
    } catch (e) {
      const message = e && typeof e === 'object' && 'message' in e ? String((e as { message: unknown }).message) : String(e)
      results.push({ file: f.name, ok: false, message })
    }
  }
  return NextResponse.json({ results })
}
