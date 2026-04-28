// 이용 서비스 (service_type) 통합 상수
// 시트 "현장별 전체 매출" 의 "이용 서비스" 컬럼에 실제 사용된 모든 값을 커버.
// 매출현황 / 견적서 / 제품·서비스 설정 등에서 공통 사용.

export const SERVICE_TYPE_OPTIONS = [
  // 핵심 (시트 빈도 상위)
  { value: '플랫폼', label: '플랫폼', color: 'bg-gray-800 text-white' },
  { value: 'AI CCTV', label: 'AI CCTV', color: 'bg-red-500 text-white' },
  { value: '근로자관리', label: '근로자관리', color: 'bg-emerald-500 text-white' },
  // 영상/카메라
  { value: 'Wearable Cam', label: 'Wearable Cam', color: 'bg-orange-500 text-white' },
  { value: 'NVR 구축', label: 'NVR 구축', color: 'bg-indigo-500 text-white' },
  { value: 'CCTV연동', label: 'CCTV연동', color: 'bg-indigo-600 text-white' },
  { value: '타임랩스', label: '타임랩스', color: 'bg-cyan-500 text-white' },
  { value: '풀타임 타임랩스', label: '풀타임 타임랩스', color: 'bg-cyan-700 text-white' },
  { value: '편집studio', label: '편집studio', color: 'bg-pink-500 text-white' },
  { value: '편집비용', label: '편집비용', color: 'bg-pink-600 text-white' },
  // 안전/관리
  { value: '안전관리', label: '안전관리', color: 'bg-rose-500 text-white' },
  { value: '실시간 안전관리', label: '실시간 안전관리', color: 'bg-rose-700 text-white' },
  { value: '무사고', label: '무사고', color: 'bg-green-600 text-white' },
  { value: '방문자 관리', label: '방문자 관리', color: 'bg-teal-500 text-white' },
  // 통신/하드웨어
  { value: 'LTE/인터넷 회선', label: 'LTE/인터넷 회선', color: 'bg-yellow-500 text-white' },
  { value: 'Mobile APP', label: 'Mobile APP', color: 'bg-purple-500 text-white' },
  { value: '장비설치', label: '장비설치', color: 'bg-slate-600 text-white' },
  // 기타
  { value: 'Story Book', label: 'Story Book', color: 'bg-blue-500 text-white' },
  { value: '휴랜', label: '휴랜', color: 'bg-lime-500 text-white' },
  { value: '3D', label: '3D', color: 'bg-violet-500 text-white' },
  { value: '운임비', label: '운임비', color: 'bg-amber-700 text-white' },
  { value: '기타', label: '기타', color: 'bg-slate-500 text-white' },
]

export type ServiceType = string

export function serviceColor(s: string | null | undefined): string {
  if (!s) return 'bg-gray-200 text-gray-700'
  return SERVICE_TYPE_OPTIONS.find(o => o.value === s)?.color || 'bg-gray-200 text-gray-700'
}
