import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { format, parseISO } from 'date-fns'
import { ko } from 'date-fns/locale'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatDate(date: string | Date, fmt: string = 'yyyy-MM-dd') {
  const d = typeof date === 'string' ? parseISO(date) : date
  return format(d, fmt, { locale: ko })
}

export function formatDateTime(date: string | Date) {
  return formatDate(date, 'yyyy-MM-dd HH:mm')
}

export function formatCurrency(amount: number) {
  return new Intl.NumberFormat('ko-KR', {
    style: 'currency',
    currency: 'KRW',
    maximumFractionDigits: 0,
  }).format(amount)
}

export function formatNumber(num: number) {
  return new Intl.NumberFormat('ko-KR').format(num)
}

export const STAGE_LABELS: Record<string, string> = {
  '신규리드': '신규리드',
  '컨텍': '컨텍',
  '미팅': '미팅',
  '제안': '제안',
  '도입직전': '도입직전',
  '도입완료': '도입완료',
  '이탈': '이탈',
}

export const STAGE_COLORS: Record<string, string> = {
  '신규리드': 'bg-gray-100 text-gray-700',
  '컨텍': 'bg-blue-100 text-blue-700',
  '미팅': 'bg-yellow-100 text-yellow-700',
  '제안': 'bg-purple-100 text-purple-700',
  '도입직전': 'bg-green-100 text-green-700',
  '도입완료': 'bg-emerald-100 text-emerald-700',
  '이탈': 'bg-red-100 text-red-700',
}

export const PRIORITY_COLORS: Record<string, string> = {
  '긴급': 'bg-red-100 text-red-700 border-red-200',
  '높음': 'bg-orange-100 text-orange-700 border-orange-200',
  '중간': 'bg-yellow-100 text-yellow-700 border-yellow-200',
  '낮음': 'bg-gray-100 text-gray-500 border-gray-200',
}

export const INDUSTRY_OPTIONS = [
  '종합건설사', '전문건설사', '인테리어/리모델링', '건축사사무소',
  '시행사', '발주처(법인)', '발주처(공공)', '공공기관/공기업',
  '솔루션사', '대기업(메이저)', '기타',
]

export const CHANNEL_OPTIONS = [
  '문의하기', '검색채널', '대표전화', '개인전화',
  '이용자 추천', '박람회', '공식홈페이지', '기타',
]

export const VOC_CATEGORY_LABELS: Record<string, string> = {
  dev_request: '개발 요청',
  bug: '오류',
  inquiry: '단순 문의',
  contract: '계약 문의',
  complaint: '불편사항',
}

export const VOC_PRIORITY_LABELS: Record<string, string> = {
  urgent: '긴급',
  high: '높음',
  normal: '보통',
  low: '낮음',
}

export const VOC_PRIORITY_COLORS: Record<string, string> = {
  urgent: 'bg-red-100 text-red-700',
  high: 'bg-orange-100 text-orange-700',
  normal: 'bg-blue-100 text-blue-700',
  low: 'bg-gray-100 text-gray-700',
}

export const VOC_STATUS_LABELS: Record<string, string> = {
  received: '접수',
  reviewing: '확인중',
  in_progress: '처리중',
  resolved: '완료',
  closed: '종료',
}

export const ACTIVITY_TYPE_LABELS: Record<string, string> = {
  CALL_OUT: '아웃바운드 전화',
  CALL_IN: '인바운드 전화',
  EMAIL_SENT: '이메일 발송',
  EMAIL_RECV: '이메일 수신',
  MEETING: '미팅',
  DEMO: '데모/시연',
  PROPOSAL: '제안서 발송',
  QUOTATION: '견적서 발송',
  CONTRACT: '계약 체결',
  ONBOARDING: '온보딩',
  FOLLOWUP: '후속 조치',
  NOTE: '메모',
}

// 활동유형 → 자동 단계 변경 매핑
export const ACTIVITY_STAGE_MAP: Record<string, string> = {
  CALL_OUT: '컨텍',
  EMAIL_SENT: '컨텍',
  PROPOSAL: '제안',
  QUOTATION: '제안',
  MEETING: '미팅',
  DEMO: '미팅',
  ONBOARDING: '도입직전',
  CONTRACT: '도입완료',
}

export const ACTIVITY_TYPE_ICONS: Record<string, string> = {
  CALL_OUT: '📞',
  CALL_IN: '📲',
  EMAIL_SENT: '✉️',
  EMAIL_RECV: '📩',
  MEETING: '🤝',
  DEMO: '🖥️',
  PROPOSAL: '📋',
  QUOTATION: '💰',
  CONTRACT: '📝',
  ONBOARDING: '🚀',
  FOLLOWUP: '🔄',
  NOTE: '💬',
}

export const ACTIVITY_TYPE_COLORS: Record<string, string> = {
  CALL_OUT: 'bg-blue-50 border-blue-200 text-blue-700',
  CALL_IN: 'bg-green-50 border-green-200 text-green-700',
  EMAIL_SENT: 'bg-blue-50 border-blue-200 text-blue-700',
  EMAIL_RECV: 'bg-green-50 border-green-200 text-green-700',
  MEETING: 'bg-purple-50 border-purple-200 text-purple-700',
  DEMO: 'bg-orange-50 border-orange-200 text-orange-700',
  PROPOSAL: 'bg-yellow-50 border-yellow-200 text-yellow-700',
  QUOTATION: 'bg-amber-50 border-amber-200 text-amber-700',
  CONTRACT: 'bg-emerald-50 border-emerald-200 text-emerald-700',
  ONBOARDING: 'bg-indigo-50 border-indigo-200 text-indigo-700',
  FOLLOWUP: 'bg-gray-50 border-gray-200 text-gray-600',
  NOTE: 'bg-gray-50 border-gray-200 text-gray-600',
}

export const ACTIVITY_TYPE_OPTIONS = [
  { value: 'NOTE', label: '💬 메모' },
  { value: 'CALL_OUT', label: '📞 전화 (아웃) → 컨텍' },
  { value: 'CALL_IN', label: '📲 전화 (인)' },
  { value: 'EMAIL_SENT', label: '✉️ 이메일 발송 → 컨텍' },
  { value: 'EMAIL_RECV', label: '📩 이메일 수신' },
  { value: 'MEETING', label: '🤝 미팅 → 미팅' },
  { value: 'DEMO', label: '🖥️ 데모/시연 → 미팅' },
  { value: 'PROPOSAL', label: '📋 제안서 발송 → 제안' },
  { value: 'QUOTATION', label: '💰 견적서 발송 → 제안' },
  { value: 'CONTRACT', label: '📝 계약 체결 → 도입완료' },
  { value: 'ONBOARDING', label: '🚀 온보딩 → 도입직전' },
  { value: 'FOLLOWUP', label: '🔄 후속 조치' },
]
