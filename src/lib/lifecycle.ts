// 고객 생애주기 화면 공용 (코호트 / 전환 소요 기간)
import type { LifecycleRow } from '@/app/api/analytics/lifecycle/route'
export type { LifecycleRow }

export const BUCKETS = [
  { key: 'd7', label: '7일 이내', min: 0, max: 7 },
  { key: 'd30', label: '8~30일', min: 8, max: 30 },
  { key: 'd90', label: '31~90일', min: 31, max: 90 },
  { key: 'd90p', label: '90일 초과', min: 91, max: Infinity },
] as const
export const bucketOf = (days: number) => BUCKETS.find(b => days >= b.min && days <= b.max)!.key

export const AXES = [
  { key: 'inquiry_channel', label: '유입 채널' },
  { key: 'site_category', label: '발주유형 (공공/민간)' },
  { key: 'industry', label: '업종' },
  { key: 'service', label: '서비스 유형' },
  { key: 'assigned_to', label: '담당자' },
  { key: 'conversion_probability', label: '도입가능성' },
  { key: 'company_type', label: '고객 타입' },
] as const
export type AxisKey = (typeof AXES)[number]['key']

// 축 값: 서비스는 여러 개일 수 있어 회사가 여러 그룹에 들어간다
export function axisValues(r: LifecycleRow, axis: AxisKey): string[] {
  if (axis === 'service') return r.services.length ? r.services : ['(서비스 없음)']
  const v = r[axis]
  return [v && String(v).trim() ? String(v) : '(미입력)']
}

export const fmtWon = (v: number | null | undefined) => (v == null ? '-' : `${Math.round(v).toLocaleString()}`)
export const fmtPct = (n: number, d: number) => (d ? `${(n / d * 100).toFixed(1)}%` : '-')
export const median = (xs: number[]) => { if (!xs.length) return null; const s = [...xs].sort((a, b) => a - b); return s[Math.floor(s.length / 2)] }

export async function fetchLifecycle(): Promise<{ rows: LifecycleRow[]; ad_cost: Record<string, Record<string, number>>; generated_at: string; ms: number }> {
  const t0 = performance.now()
  const res = await fetch('/api/analytics/lifecycle')
  const json = await res.json()
  if (!res.ok) throw new Error(json.error || '생애주기 데이터 조회 실패')
  console.log(`[lifecycle.load] ${json.rows.length} rows in ${Math.round(performance.now() - t0)}ms (server ${json.ms}ms, cached ${json.generated_at})`)
  return json
}
