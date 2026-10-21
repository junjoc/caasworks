import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { isSignedIn } from '@/lib/pipeline/read-leads'
import { normalizeCompanyName, isUnknownCompany } from '@/lib/find-customer'

// 새 리드 등록 중 확인 (2026-10-21, 시안 v4)
// ① 같은 연락처·이메일의 리드 (같은 사람 재문의 — 특히 담당 없는 온라인 문의는 "이어받기")
// ② 같은 회사의 고객사·기존 리드 (현장 / 본사 팀 / 문의자 / 단계) → 같은 문의 · 새 문의 · 다른 회사
export const dynamic = 'force-dynamic'
const COLS = 'id, customer_code, company_name, site_name, site_region, contact_team, contact_person, contact_phone, contact_email, stage, assigned_to, inquiry_date, inquiry_channel, created_at, notes, customer_id'

export async function GET(req: Request) {
  try {
    if (!(await isSignedIn())) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
    const u = new URL(req.url)
    const phone = (u.searchParams.get('phone') || '').replace(/\D/g, '')
    const email = (u.searchParams.get('email') || '').trim().toLowerCase()
    const name = (u.searchParams.get('name') || '').trim()
    const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)

    // ① 연락처 — DB 에 하이픈이 섞여 있어 뒤 8자리로 좁힌 뒤 숫자만 비교
    let byContact: Record<string, unknown>[] = []
    if (phone.length >= 8 || email.includes('@')) {
      const ors = [phone.length >= 8 && `contact_phone.ilike.%${phone.slice(-4)}%`, email.includes('@') && `contact_email.ilike.${email}`].filter(Boolean).join(',')
      const { data } = await sb.from('pipeline_leads').select(COLS).or(ors).order('created_at', { ascending: false }).limit(50)
      byContact = (data || []).filter(l => (phone.length >= 8 && String(l.contact_phone || '').replace(/\D/g, '').endsWith(phone.slice(-8))) || (email.includes('@') && String(l.contact_email || '').toLowerCase() === email)).slice(0, 5)
    }
    // ② 회사 — 정규화한 이름이 같거나 포함
    let company: { customers: Record<string, unknown>[]; leads: Record<string, unknown>[] } = { customers: [], leads: [] }
    if (name.length >= 2 && !isUnknownCompany(name)) {
      const key = normalizeCompanyName(name)
      const core = name.replace(/\(주\)|㈜|주식회사|유한회사|\s/g, '').slice(0, 6)
      const [c, l] = await Promise.all([
        sb.from('customers').select('id, company_name, customer_code, company_type, status').ilike('company_name', `%${core}%`).limit(30),
        sb.from('pipeline_leads').select(COLS).ilike('company_name', `%${core}%`).order('created_at', { ascending: false }).limit(60),
      ])
      const hit = (n: unknown) => { const k = normalizeCompanyName(String(n || '')); return k === key || (key.length >= 2 && (k.includes(key) || key.includes(k))) }
      company = { customers: (c.data || []).filter(x => hit(x.company_name)).slice(0, 5), leads: (l.data || []).filter(x => hit(x.company_name)).slice(0, 8) }
    }
    return NextResponse.json({ byContact, company })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
