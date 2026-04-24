// 과금 방식 통합 상수
// 고객관리(/customers) 와 매출현황(/revenue) 에서 동일한 옵션을 사용하도록 중앙화.
// DB 에 실제로 저장된 값들은 시트 임포트에서 유래하므로 시트 값을 기준으로 삼음.

export const BILLING_METHOD_OPTIONS: { value: string; label: string }[] = [
  { value: '월간 선납', label: '월간 선납' },
  { value: '월간 후불', label: '월간 후불' },
  { value: '구독(월간)', label: '구독(월간)' },
  { value: '구독(연간)', label: '구독(연간)' },
  { value: '연간', label: '연간' },
  { value: '프로젝트 선납', label: '프로젝트 선납' },
  { value: '준공 후 정산', label: '준공 후 정산' },
  { value: '카드', label: '카드' },
  { value: '무상지원', label: '무상지원' },
  { value: '무상이용', label: '무상이용' },
  { value: '기타', label: '기타' },
]

export type BillingMethod = string
