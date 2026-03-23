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
  '컨택': '컨택',
  '미팅': '미팅',
  '제안': '제안',
  '계약': '계약',
  '도입완료': '도입완료',
}

export const STAGE_COLORS: Record<string, string> = {
  '신규리드': 'bg-gray-100 text-gray-700',
  '컨택': 'bg-blue-100 text-blue-700',
  '미팅': 'bg-yellow-100 text-yellow-700',
  '제안': 'bg-purple-100 text-purple-700',
  '계약': 'bg-green-100 text-green-700',
  '도입완료': 'bg-emerald-100 text-emerald-700',
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
  CONTRACT: '계약 체결',
  ONBOARDING: '온보딩',
  FOLLOWUP: '후속 조치',
  NOTE: '메모',
}
