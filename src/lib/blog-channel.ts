// 블로그 레퍼러 → 자사 블로그 / 외주 블로그 (src/config/blog_channels.json)
// Slack 자동등록(inferLeadChannel), 마케팅 리포트 레퍼러 집계, GA 유입 동기화가 같이 쓴다.
import config from '@/config/blog_channels.json'
import { parseNaverBlogUrl } from './naver-blog-url'

export interface BlogChannel { channel: string; source: string }

const OWN_IDS = config.own.naver_blog_ids.map(s => s.toLowerCase())
const EXCEPTIONS = Object.fromEntries(
  Object.entries(config.exceptions as Record<string, BlogChannel>).map(([k, v]) => [k.toLowerCase(), v]),
)
const OWN: BlogChannel = { channel: config.own.channel, source: config.own.source }
const OUTSOURCED: BlogChannel = { channel: config.outsourced.channel, source: config.outsourced.source }
export const OUTSOURCED_BLOG_CHANNEL = config.outsourced.channel

export const isNaverBlogHost = (host: string) => /^(m\.)?blog\.naver\.com$/i.test(host)

// 네이버 블로그 아이디 → 채널. 아이디를 모르면(주소가 호스트뿐) 규칙대로 외주
export function classifyNaverBlogId(blogId: string | null | undefined): BlogChannel {
  const id = (blogId || '').toLowerCase()
  if (id && OWN_IDS.includes(id)) return OWN
  return EXCEPTIONS[id] || OUTSOURCED
}

// 블로그 레퍼러가 아니면 null
export function classifyBlogReferrer(url: string | null | undefined): BlogChannel | null {
  if (!url) return null
  let host: string
  try { host = new URL(url.trim()).host.toLowerCase() } catch { return null }
  if (config.outsourced.hosts.some(h => host === h || host.endsWith('.' + h))) return OUTSOURCED
  if (!isNaverBlogHost(host)) return null
  return classifyNaverBlogId(parseNaverBlogUrl(url)?.blogId)
}
