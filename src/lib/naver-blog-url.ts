// 네이버 블로그 글 주소 → { blogId, logNo }
// https://blog.naver.com/caasworks/223078394506
// https://m.blog.naver.com/caasworks/223097465515?isFromSearchAddView=true
// https://blog.naver.com/PostView.naver?blogId=caasworks&logNo=223078394506
export function parseNaverBlogUrl(url: string | null | undefined): { blogId: string | null; logNo: string | null } | null {
  if (!url) return null
  let u: URL
  try { u = new URL(url.trim()) } catch { return null }
  if (!/(^|\.)blog\.naver\.com$/i.test(u.host)) return null
  const qLog = u.searchParams.get('logNo')
  const qId = u.searchParams.get('blogId')
  if (qLog) return { blogId: qId, logNo: qLog }
  const parts = u.pathname.split('/').filter(Boolean)
  const blogId = parts[0] && !/\.naver$/i.test(parts[0]) ? parts[0] : qId
  const logNo = parts[1] && /^\d+$/.test(parts[1]) ? parts[1] : null
  return { blogId: blogId || null, logNo }
}
