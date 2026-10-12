import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { parseNaverBlogFile, saveNaverBlogParsed } from '@/lib/naver-blog-stats'

// 네이버 블로그 통계 엑셀 업로드 (여러 파일 한 번에). 파일 종류는 내용(데이터명)으로 판별.
export async function POST(request: NextRequest) {
  const form = await request.formData()
  const files = form.getAll('files').filter((f): f is File => typeof f !== 'string')
  if (!files.length) return NextResponse.json({ error: '파일이 없습니다' }, { status: 400 })

  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  )

  const results: { file: string; ok: boolean; message: string }[] = []
  for (const f of files) {
    try {
      const parsed = parseNaverBlogFile(Buffer.from(await f.arrayBuffer()), f.name)
      results.push({ file: f.name, ok: true, message: await saveNaverBlogParsed(sb, parsed) })
    } catch (e) {
      const message = e && typeof e === 'object' && 'message' in e ? String((e as { message: unknown }).message) : String(e)
      results.push({ file: f.name, ok: false, message })
    }
  }
  return NextResponse.json({ results })
}
