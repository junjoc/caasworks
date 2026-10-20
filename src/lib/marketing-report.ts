// 마케팅 리포트 (/marketing/report) 계산 도우미.
// 요구사항: 마케팅팀 _요구사항_CRM_마케팅리포트_클로드코드용_261008.md
import { parseNaverBlogUrl } from './naver-blog-url'
import { classifyBlogReferrer, OUTSOURCED_BLOG_CHANNEL } from './blog-channel'

export type ChannelGroup = '웹' | '전화' | '기타'
export const CHANNEL_GROUPS: ChannelGroup[] = ['웹', '전화', '기타']

const PHONE = ['대표전화', '개인전화']
const WEB_CHANNELS = ['검색유입', '자사채널', '블로그', '외주 블로그', '네이버', '구글', '메타', '유튜브', '언론']

// 화면 분류(채널 + 유입경로) → 웹/전화/기타. 자사채널 아래 대표전화·개인전화·해피톡은 웹이 아니다.
export function channelGroup(channel: string | null, source: string | null): ChannelGroup {
  const ch = (channel || '').trim()
  const src = (source || '').trim()
  if (PHONE.includes(ch) || (ch === '자사채널' && PHONE.includes(src))) return '전화'
  if (ch === '자사채널' && src === '해피톡') return '기타'
  if (WEB_CHANNELS.includes(ch)) return '웹'
  return '기타'
}

// 레퍼러: 별도 필드 우선, 없으면 문의내용의 "레퍼러 주소:" 또는 (더 예전 형식) "레퍼러:" 줄. "실제 레퍼러:" 는 제외
export function extractReferrer(referrer: string | null, inquiryContent: string | null): string | null {
  if (referrer && referrer.trim()) return referrer.trim()
  const m = (inquiryContent || '').match(/(?:^|\n)\s*>?\s*레퍼러(?: 주소)?\s*:\s*(\S+)/)
  return m ? m[1] : null
}

export const NO_REFERRER = '(없음)'

// 문의내용에서 사람이 쓴 글만: 문의폼이 붙인 "레퍼러 주소: …", "실제 레퍼러: …", utm 줄은 빼고 줄 앞 ">" 인용 표시 제거
// (레퍼러는 리포트의 레퍼러 열에 따로 보인다)
const META_LINE = /^\s*>?\s*(레퍼러(?: 주소)?|실제\s*레퍼러|utm_\w+|landing_page)\s*:/i
export function inquiryBody(content: string | null): string {
  return (content || '').split('\n')
    .filter(line => !META_LINE.test(line))
    .map(line => line.replace(/^\s*>\s?/, ''))
    .join('\n').trim()
}

// 집계 키 = 호스트 + 경로 (쿼리·해시·끝 슬래시 제거). URL 이 아니면 (없음).
export function referrerKey(url: string | null): string {
  if (!url) return NO_REFERRER
  try {
    const u = new URL(url)
    // 외주 블로그는 글마다 나누지 않고 한 줄 (유입경로별: 팀부스터 / 인플루언서 …)
    const blog = classifyBlogReferrer(url)
    if (blog && blog.channel === OUTSOURCED_BLOG_CHANNEL) return `${blog.channel} · ${blog.source}`
    // 네이버 블로그만 예외: 글 번호(logNo)를 키에 남긴다. PostView.naver?blogId=&logNo= 형식도 /아이디/글번호 로 통일
    if (/^(m\.)?blog\.naver\.com$/i.test(u.host)) {
      const nb = parseNaverBlogUrl(url)
      if (nb?.logNo) return nb.blogId ? `${u.host}/${nb.blogId}/${nb.logNo}` : `${u.host}/PostView.naver?logNo=${nb.logNo}`
    }
    const path = u.pathname.replace(/\/+$/, '')
    return `${u.host}${path}`
  } catch {
    return NO_REFERRER
  }
}

// (m.)blog.naver.com/{아이디}/{글번호} → 글번호
export function naverLogNoOf(key: string): string | null {
  const m = key.match(/^(?:m\.)?blog\.naver\.com\/(?:[^/?]+\/(\d+)|PostView\.naver\?logNo=(\d+))$/i)
  return m ? (m[1] || m[2]) : null
}

// www.caas.works/blog/{id} → id
export function blogIdOf(key: string): string | null {
  const m = key.match(/(?:^|\.)caas\.works\/(?:pl\/)?blog\/([^/]+)$/)
  return m ? m[1] : null
}

const pad = (n: number) => String(n).padStart(2, '0')
const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

export type PresetKey = 'last_week' | 'this_month' | 'last_month' | 'last_90'
export const PRESETS: { key: PresetKey; label: string }[] = [
  { key: 'last_week', label: '지난주' },
  { key: 'this_month', label: '이번 달' },
  { key: 'last_month', label: '지난 달' },
  { key: 'last_90', label: '최근 90일' },
]

export function presetRange(key: PresetKey, today = new Date()): { from: string; to: string } {
  const t = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  if (key === 'last_week') {
    const dow = (t.getDay() + 6) % 7 // 월=0
    const thisMon = new Date(t); thisMon.setDate(t.getDate() - dow)
    const lastMon = new Date(thisMon); lastMon.setDate(thisMon.getDate() - 7)
    const lastSun = new Date(thisMon); lastSun.setDate(thisMon.getDate() - 1)
    return { from: ymd(lastMon), to: ymd(lastSun) }
  }
  if (key === 'this_month') return { from: ymd(new Date(t.getFullYear(), t.getMonth(), 1)), to: ymd(t) }
  if (key === 'last_month') {
    return { from: ymd(new Date(t.getFullYear(), t.getMonth() - 1, 1)), to: ymd(new Date(t.getFullYear(), t.getMonth(), 0)) }
  }
  const from = new Date(t); from.setDate(t.getDate() - 89)
  return { from: ymd(from), to: ymd(t) }
}

// 엑셀에서 한글이 안 깨지게 UTF-8 BOM 포함
export function toCsv(header: string[], rows: (string | number | null | undefined)[][]): string {
  const esc = (v: string | number | null | undefined) => {
    const s = v == null ? '' : String(v)
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  return '﻿' + [header, ...rows].map(r => r.map(esc).join(',')).join('\r\n')
}

export function downloadText(filename: string, text: string, mime = 'text/csv;charset=utf-8') {
  const blob = new Blob([text], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
