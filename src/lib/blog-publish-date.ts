// 카스웍스 블로그 글의 발행일: GA 에는 없어서 글 페이지(www.caas.works/blog/{id})의
// 제목(h1) 바로 뒤 <time>2025년 12월 16일</time> 을 읽는다. 서버에서만 사용.
export async function fetchBlogPublishDate(pagePath: string): Promise<string | null> {
  try {
    const res = await fetch(`https://www.caas.works${pagePath}`, {
      headers: { 'User-Agent': 'caasworks-crm/1.0' },
      signal: AbortSignal.timeout(8000),
    })
    if (!res.ok) return null
    return parseBlogPublishDate(await res.text())
  } catch {
    return null
  }
}

export function parseBlogPublishDate(html: string): string | null {
  const h1 = html.indexOf('<h1')
  const after = h1 >= 0 ? html.slice(h1) : html
  const m = after.match(/<time[^>]*>\s*(\d{4})\s*[년.\-]\s*(\d{1,2})\s*[월.\-]\s*(\d{1,2})/)
  return m ? `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}` : null
}
