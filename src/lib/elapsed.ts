// 경과 표기 — 전 화면 통일 (2026-10-21, 디자인 정의 › 화면 문법 v2 › 기준값 "경과")
// 지난 날 = "+n일"(당일 "오늘") · 남은 날 = "n일 남음"(당일 "오늘", 하루 전 "내일") · 지난 기한 = "n일 지남"
// D+n · n일째 는 쓰지 않는다.

export const kstToday = () => new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10)
/** ISO 시각·날짜 → KST 날짜(YYYY-MM-DD) */
export const kstDate = (s: string) => (s.length <= 10 ? s : new Date(new Date(s).getTime() + 9 * 3600 * 1000).toISOString().slice(0, 10))
export const dayDiff = (from: string, to: string) => Math.round((new Date(kstDate(to)).getTime() - new Date(kstDate(from)).getTime()) / 86400000)
/** 10.21 */
export const mmdd = (s?: string | null) => (s ? kstDate(s).slice(5).replace('-', '.') : '')

/** 지난 날: 오늘 / +n일 */
export function since(from: string, today = kstToday()) {
  const n = Math.max(0, dayDiff(from, today))
  return n === 0 ? '오늘' : `+${n}일`
}
/** 기한까지: 오늘 · 내일 · n일 남음 · n일 지남 (tone: 지남 bad, 오늘·내일 warn) */
export function due(date: string, today = kstToday()): { text: string; tone?: 'bad' | 'warn' } {
  const n = dayDiff(today, date)
  if (n < 0) return { text: `${-n}일 지남`, tone: 'bad' }
  if (n === 0) return { text: '오늘', tone: 'warn' }
  if (n === 1) return { text: '내일', tone: 'warn' }
  return { text: `${n}일 남음` }
}
/** 마지막 활동: 오늘 / n일 전 */
export function ago(from: string, today = kstToday()) {
  const n = Math.max(0, dayDiff(from, today))
  return n === 0 ? '오늘' : `${n}일 전`
}

/** ID(고객사 코드) YYMMDDHHmm → 유입일·시각. ID 가 유입일의 기준 (10/22) */
export function codeToInquiry(code: string | null | undefined): { date: string; hour: number | null } | null {
  const c = String(code || '').trim()
  if (!/^\d{10}$/.test(c)) return null
  const y = 2000 + +c.slice(0, 2), m = +c.slice(2, 4), d = +c.slice(4, 6), h = +c.slice(6, 8), mi = +c.slice(8, 10)
  if (m < 1 || m > 12 || d < 1 || d > 31 || h > 23 || mi > 59) return null
  const dt = new Date(Date.UTC(y, m - 1, d))
  if (dt.getUTCMonth() !== m - 1) return null
  return { date: `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`, hour: c.slice(6, 10) > '0010' ? h : null }
}
