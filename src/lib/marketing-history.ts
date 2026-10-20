// 마케팅 연간 현황표(구글 시트 → xlsx, 연도별 파일) 해석. 서버에서만 사용.
// 시트: "N년 전체"(월 요약) + "01월"~"12월"(광고유형×채널×유형 상세). 2023~2026.4 까지 형식이 조금씩 다르다:
//  - 2023: 가입·도입 없음, 대신 미팅수. 상세 열이 광고도달/1초클릭/문의완료/미팅
//  - 2024~: 구글/메타/네이버 비용, 가입·문의(유료/바이럴)·도입, 매출액. 2026은 메타 대신 "기타"(팀부스터)
import * as XLSX from 'xlsx'

export interface MonthSummary {
  year: number; month: number
  cost_google: number; cost_meta: number; cost_naver: number; cost_other: number; cost_total: number
  budget_total: number | null
  signups: number | null; inquiries_paid: number | null; inquiries_viral: number | null; inquiries: number | null
  adoptions: number | null; meetings: number | null; revenue: number | null
}
export interface MonthDetail {
  year: number; month: number
  ad_type: string; channel: string; method: string | null; campaign: string | null
  cost: number; impressions: number; clicks: number
  signups: number | null; inquiries: number | null; adoptions: number | null; meetings: number | null
}
export interface MarketingYearParsed { year: number; summary: MonthSummary[]; details: MonthDetail[]; warnings: string[] }

type Row = unknown[]
const str = (v: unknown) => String(v ?? '').replace(/\s+/g, ' ').trim()
const num = (v: unknown): number => { const n = Number(String(v ?? '').replace(/[,%\s원]/g, '')); return Number.isFinite(n) ? n : 0 }
const numOrNull = (v: unknown): number | null => (v == null || v === '' || v === '-' ? null : num(v))
const isEmpty = (r: Row) => !r.some(c => c != null && String(c).trim() !== '')

export function parseMarketingYearFile(buf: ArrayBuffer | Buffer): MarketingYearParsed {
  const wb = XLSX.read(buf, { type: 'buffer' })
  const sheet = (n: string): Row[] => XLSX.utils.sheet_to_json<Row>(wb.Sheets[n], { header: 1, defval: null })
  const summaryName = wb.SheetNames.find(n => /\d{4}년 전체/.test(n))
  if (!summaryName) throw new Error('"N년 전체" 시트가 없습니다')
  const year = Number(summaryName.match(/(\d{4})/)![1])
  const warnings: string[] = []

  // ── 월 요약 ──
  const rows = sheet(summaryName)
  const h1i = rows.findIndex(r => str(r[0]) === '월')
  if (h1i < 0) throw new Error(`${summaryName}: 헤더(월)를 찾지 못했습니다`)
  const h1 = rows[h1i], h2 = rows[h1i + 1]
  // 1행 헤더는 병합돼 있어서 비어 있는 칸은 왼쪽 그룹을 이어받는다
  const group: string[] = []
  let cur = ''
  for (let c = 0; c < Math.max(h1.length, h2.length); c++) { if (h1[c] != null && str(h1[c]) !== '') cur = str(h1[c]); group[c] = cur }
  const col = (g: RegExp, sub: RegExp | null) => {
    for (let c = 1; c < group.length; c++) if (g.test(group[c]) && (sub ? sub.test(str(h2[c])) : true)) return c
    return -1
  }
  const cCost = col(/광고비용|전체비용/, null) >= 0 ? {
    google: col(/광고비용|전체비용/, /^구글$/), meta: col(/광고비용|전체비용/, /^메타$/), naver: col(/광고비용|전체비용/, /^네이버$/),
    other: col(/광고비용|전체비용/, /^기타$/), total: col(/광고비용|전체비용/, /실 ?집행비/),
  } : null
  if (!cCost || cCost.total < 0) throw new Error(`${summaryName}: 실 집행비 열이 없습니다`)
  const cSign = col(/가입사/, /^수$/), cInqPaid = col(/문의사/, /유료/), cInqViral = col(/문의사/, /바이럴/), cInq = col(/문의사/, /^수$/)
  const cAdopt = col(/도입사/, /^수$/), cMeet = col(/미팅수/, /^수$/)
  // 매출액: 그룹이 "매출" 이거나 해당 연도 숫자인 열 (2024: "매출"/"매출액", 2025: 2025/"매출액")
  let cRev = -1
  for (let c = 1; c < group.length; c++) if (/매출액/.test(str(h2[c])) && (group[c] === '매출' || group[c] === String(year))) { cRev = c; break }

  const summary: MonthSummary[] = []
  for (const r of rows.slice(h1i + 2)) {
    const m = Number(r[0])
    if (!Number.isInteger(m) || m < 1 || m > 12) continue
    summary.push({
      year, month: m,
      cost_google: cCost.google >= 0 ? num(r[cCost.google]) : 0, cost_meta: cCost.meta >= 0 ? num(r[cCost.meta]) : 0,
      cost_naver: cCost.naver >= 0 ? num(r[cCost.naver]) : 0, cost_other: cCost.other >= 0 ? num(r[cCost.other]) : 0,
      cost_total: num(r[cCost.total]), budget_total: null,
      signups: cSign >= 0 ? numOrNull(r[cSign]) : null,
      inquiries_paid: cInqPaid >= 0 ? numOrNull(r[cInqPaid]) : null, inquiries_viral: cInqViral >= 0 ? numOrNull(r[cInqViral]) : null,
      inquiries: cInq >= 0 ? numOrNull(r[cInq]) : null,
      adoptions: cAdopt >= 0 ? numOrNull(r[cAdopt]) : null, meetings: cMeet >= 0 ? numOrNull(r[cMeet]) : null,
      revenue: cRev >= 0 ? numOrNull(r[cRev]) : null,
    })
  }
  // 2026 처럼 값이 없는 달(#N/A 시트, 요약 0)은 뒤에서 상세로 판단해 제외

  // ── 월 상세 ──
  // 2023 은 1열이 채널(메타/유튜브…)이고 2열이 브랜드인 달이 있다. 그 외에는 1열 광고유형, 2열 채널(없으면 이어받음), 3열 방식
  const PURE_CH = /^(메타|유튜브|구글|네이버|다음카카오|다음|해외 ?- ?메타)$/
  const defaultType = (ch: string) => (/메타|유튜브/.test(ch) ? '콘텐츠 광고' : /구글|네이버|다음/.test(ch) ? '검색광고' : '기타')
  const details: MonthDetail[] = []
  const monthsWithData = new Set<number>()
  for (const name of wb.SheetNames) {
    const mm = name.match(/^(\d{1,2})월$/)
    if (!mm) continue
    const month = Number(mm[1])
    const mr = sheet(name)
    if (mr.length < 5 || mr.every(isEmpty) || str(mr[0]?.[0]) === '#N/A') continue
    const s = summary.find(x => x.month === month)
    const budgetRow = mr.find(r => str(r[3]) === '총 예산')
    if (s && budgetRow) s.budget_total = numOrNull(budgetRow[5] ?? budgetRow[6])

    // 2023.1~4월: 일자별 시트. "합계" 행에서 메타/유튜브/기타만 뽑는다
    const dailyHi = mr.findIndex(r => str(r[1]) === '일자')
    if (dailyHi >= 0) {
      const tot = mr.slice(dailyHi + 1).find(r => str(r[1]) === '합계')
      if (!tot) { warnings.push(`${name}: 일자별 시트에 합계 행 없음`); continue }
      const push = (channel: string, cost: number, impressions: number, inquiries: number | null) => {
        if (!cost && !impressions && !inquiries) return
        details.push({ year, month, ad_type: defaultType(channel), channel, method: null, campaign: null, cost, impressions, clicks: 0, signups: null, inquiries, adoptions: null, meetings: null })
        monthsWithData.add(month)
      }
      push('메타', num(tot[3]), num(tot[5]), numOrNull(tot[7]))
      push('유튜브', num(tot[4]), num(tot[9]), numOrNull(tot[11]))
      push('기타유입', 0, 0, numOrNull(tot[13]))
      warnings.push(`${name}: 일자별 시트라 채널 합계만 저장 (메타·유튜브·기타)`)
      continue
    }

    const hi = mr.findIndex(r => ['광고유형', '채널'].includes(str(r[1])) && str(r[6]) === '비용')
    if (hi < 0) { warnings.push(`${name}: 상세 헤더(광고유형/채널 + 비용) 없음`); continue }
    const h = mr[hi].map(str)
    // 2023 은 헤더가 두 줄 (문의클릭/문의완료/미팅) — 둘째 줄에 11~13열 제목이 있으면 그걸 쓴다
    const h2r = (mr[hi + 1] || []).map(str)
    const twoLine = h2r[1] === '' && h2r[6] === '' && [11, 12, 13].some(c => h2r[c] !== '')
    const H = (c: number) => (twoLine && h2r[c] ? h2r[c] : h[c])
    const kind = (c: number): 'signups' | 'inquiries' | 'adoptions' | 'meetings' | null => {
      const t = H(c)
      if (/클릭/.test(t)) return null // 1초클릭·문의클릭은 전환이 아니다
      if (/가입/.test(t)) return 'signups'; if (/문의/.test(t)) return 'inquiries'; if (/도입/.test(t)) return 'adoptions'; if (/미팅/.test(t)) return 'meetings'
      return null
    }
    const kinds = [11, 12, 13].map(c => kind(c))

    const brandLayout = h[2] === '브랜드'
    let adType = '', channel = ''
    for (const r of mr.slice(hi + (twoLine ? 2 : 1))) {
      if (isEmpty(r)) continue
      const c1 = str(r[1]), c2 = str(r[2]), c3 = str(r[3])
      if (c1 === '합계') break
      if (/합계/.test(c1) || /합계/.test(c2) || /합계/.test(c3)) continue
      let method: string | null = c3 || null
      if (c1) {
        if (PURE_CH.test(c1)) { channel = c1; adType = defaultType(c1) } else adType = c1
      }
      if (!brandLayout) {
        if (c2) channel = c2
        else if (c3 && PURE_CH.test(c3)) { channel = c3; method = null } // 2023.5월: 채널이 3열
      }
      if (!channel) continue
      const cost = num(r[6]), impressions = num(r[7]), clicks = num(r[8])
      const extra = [11, 12, 13].map(c => numOrNull(r[c]))
      const d: MonthDetail = {
        year, month, ad_type: adType || defaultType(channel), channel,
        method, campaign: str(r[5]) || null,
        cost, impressions, clicks, signups: null, inquiries: null, adoptions: null, meetings: null,
      }
      kinds.forEach((k, i) => { if (k) d[k] = extra[i] })
      const hasAny = cost || impressions || clicks || (d.signups || 0) || (d.inquiries || 0) || (d.adoptions || 0) || (d.meetings || 0)
      if (!hasAny) continue
      details.push(d)
      monthsWithData.add(month)
    }
  }

  // 요약도 상세도 없는 달(미래 월) 제거
  const filtered = summary.filter(s => monthsWithData.has(s.month) || s.cost_total || s.inquiries || s.signups || s.adoptions)
  return { year, summary: filtered, details, warnings }
}
