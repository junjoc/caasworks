// 화면 데이터 메모리 캐시 (2026-10-21 속도) — 한 번 본 화면·리드는 다시 열 때 바로 보이고, 뒤에서 새로 읽어 바꾼다.
// 탭을 닫으면 사라진다. 저장·수정 뒤에는 화면이 다시 읽으므로 따로 지우지 않는다.
const cache = new Map<string, unknown>()
const inflight = new Map<string, Promise<unknown>>()

export const getCached = <T,>(key: string) => cache.get(key) as T | undefined
export const setCached = (key: string, v: unknown) => { cache.set(key, v) }

/** 같은 요청이 이미 가고 있으면 그 결과를 같이 쓴다 */
export function fetchJson<T>(key: string, url: string, init?: RequestInit): Promise<T> {
  const cur = inflight.get(key)
  if (cur) return cur as Promise<T>
  const p = fetch(url, init).then(async r => {
    const j = await r.json()
    if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`)
    cache.set(key, j)
    return j as T
  }).finally(() => inflight.delete(key))
  inflight.set(key, p)
  return p
}

/** 리드 한 건 미리 읽기 (행에 마우스를 올렸을 때) */
export function prefetchLead(id: string) {
  const key = `lead:${id}`
  if (cache.has(key) || inflight.has(key)) return
  fetchJson(key, `/api/pipeline/lead/${id}`).catch(() => {})
}

/** 아무 GET 미리 읽기 (행에 마우스를 올렸을 때) */
export function prefetchJson(key: string, url: string) {
  if (cache.has(key) || inflight.has(key)) return
  fetchJson(key, url).catch(() => {})
}
