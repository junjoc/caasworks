// 전화번호 표기 (2026-10-21) — 숫자만 눌러도 하이픈이 붙는다. 같은 사람 찾기는 숫자만 비교하므로 표기는 보기 좋게만.
// 02-123-4567 · 02-1234-5678 · 010-1234-5678 · 031-123-4567 · 070-1234-5678 · 1666-1967(대표번호 8자리)
export function formatPhone(input: string | null | undefined): string {
  const raw = String(input || '')
  const d = raw.replace(/\D/g, '').slice(0, 11)
  if (!d) return raw.replace(/[^\d+\-\s()]/g, '') // 숫자 없는 입력은 그대로(지우는 중)
  if (d.startsWith('02')) {
    if (d.length <= 2) return d
    if (d.length <= 5) return `${d.slice(0, 2)}-${d.slice(2)}`
    if (d.length <= 9) return `${d.slice(0, 2)}-${d.slice(2, 5)}-${d.slice(5)}`
    return `${d.slice(0, 2)}-${d.slice(2, 6)}-${d.slice(6, 10)}`
  }
  if (/^1[5-9]/.test(d)) return d.length <= 4 ? d : `${d.slice(0, 4)}-${d.slice(4, 8)}` // 15xx·16xx·18xx 대표번호
  if (d.startsWith('0')) {
    if (d.length <= 3) return d
    if (d.length <= 6) return `${d.slice(0, 3)}-${d.slice(3)}`
    if (d.length <= 10) return `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`
    return `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7)}`
  }
  return d
}
