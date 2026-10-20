import type { SupabaseClient } from '@supabase/supabase-js'

// 리드 → 고객사 연결 공용 (2026-10-20)
// 전에는 고객사 ID(customer_code)로만 찾고 없으면 새로 만들어서, 같은 회사가 문의할 때마다 고객이 하나씩 더 생겼다
// (센터폴 3개, 미상 4개 …). 코드로 못 찾으면 회사명을 정규화해서 찾고, 그래도 없을 때만 만든다.

// "(주)한울건설" = "주식회사 한울건설" = "한울건설 (주)" 로 본다
export function normalizeCompanyName(s: string | null | undefined): string {
  return (s || '')
    .replace(/\s+/g, '')
    .replace(/[()（）\-·・㈜]/g, '')
    .replace(/^주식회사|주식회사$|^유한회사|유한회사$|^유$|유$/g, '')
    .toLowerCase()
}

// 회사명을 모르는 리드는 회사로 묶지 않는다
const UNKNOWN = new Set(['', '미상', '없음', '-', '확인필요', '개인', '건축주'])
export const isUnknownCompany = (name: string | null | undefined) => UNKNOWN.has((name || '').trim()) || UNKNOWN.has(normalizeCompanyName(name))

export async function findCustomerId(sb: SupabaseClient, customerCode: string | null | undefined, companyName: string | null | undefined): Promise<string | null> {
  if (customerCode) {
    const { data } = await sb.from('customers').select('id').eq('customer_code', customerCode).maybeSingle()
    if (data) return data.id
  }
  if (!companyName || isUnknownCompany(companyName)) return null
  const key = normalizeCompanyName(companyName)
  // 후보를 좁혀서 가져온 뒤 정규화로 비교 (DB 에는 정규화 컬럼이 없다)
  const core = companyName.replace(/\(주\)|㈜|주식회사|유한회사|\s/g, '').slice(0, 6)
  const { data: cands } = await sb.from('customers').select('id, company_name, customer_code, created_at').ilike('company_name', `%${core}%`).limit(50)
  const hits = (cands || []).filter(c => normalizeCompanyName(c.company_name) === key)
  if (!hits.length) return null
  // 고객사 ID 있는 것 → 오래된 것 우선
  hits.sort((a, b) => (a.customer_code ? 0 : 1) - (b.customer_code ? 0 : 1) || a.created_at.localeCompare(b.created_at))
  return hits[0].id
}

export async function findOrCreateCustomer(sb: SupabaseClient, input: { customer_code: string; company_name: string; contact_person?: string | null; contact_phone?: string | null; contact_email?: string | null }): Promise<{ id: string | null; created: boolean; error?: string }> {
  const found = await findCustomerId(sb, input.customer_code, input.company_name)
  if (found) return { id: found, created: false }
  const { data, error } = await sb.from('customers').insert({
    customer_code: input.customer_code, company_name: input.company_name,
    contact_person: input.contact_person ?? null, contact_phone: input.contact_phone ?? null, contact_email: input.contact_email ?? null,
    status: 'active',
  }).select('id').single()
  if (error) return { id: null, created: false, error: error.message }
  return { id: data.id, created: true }
}
