// GA4 트래픽 구분: 마케팅 사이트 vs 앱·기타. 기준은 src/config/ga_segments.json
import segments from '@/config/ga_segments.json'

export type GaSegment = 'marketing' | 'app' | 'all'
export const GA_SEGMENT_OPTIONS: { value: GaSegment; label: string }[] = [
  { value: 'marketing', label: '마케팅 사이트' },
  { value: 'app', label: '앱·기타' },
  { value: 'all', label: '전체' },
]

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type FilterExpression = any

const str = (fieldName: string, matchType: 'EXACT' | 'BEGINS_WITH', value: string): FilterExpression =>
  ({ filter: { fieldName, stringFilter: { matchType, value } } })

/**
 * GA4 runReport 의 dimensionFilter.
 * pathField: 세션 지표(채널별 세션 등)는 'landingPage', 페이지 지표는 'pagePath'.
 * GA4 는 요청하지 않은 dimension 으로도 거를 수 있어서 보고서 dimension 은 그대로 둔다.
 */
export function gaSegmentFilter(segment: GaSegment, pathField: 'landingPage' | 'pagePath'): FilterExpression | undefined {
  if (segment === 'all') return undefined
  const m = segments.marketing
  const marketing = {
    andGroup: {
      expressions: [
        str('hostName', 'EXACT', m.host),
        { orGroup: { expressions: [
          ...m.exact.map(p => str(pathField, 'EXACT', p)),
          ...m.prefix.map(p => str(pathField, 'BEGINS_WITH', p)),
        ] } },
      ],
    },
  }
  return segment === 'marketing' ? marketing : { notExpression: marketing }
}

// 기존 필터와 함께 쓸 때
export function andFilters(...fs: (FilterExpression | undefined)[]): FilterExpression | undefined {
  const list = fs.filter(Boolean)
  if (list.length === 0) return undefined
  if (list.length === 1) return list[0]
  return { andGroup: { expressions: list } }
}
