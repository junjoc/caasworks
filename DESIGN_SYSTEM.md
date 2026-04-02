# CaasWorks CRM Design System v2.0

## 1. Brand Colors

### Primary (Blue)
| Token | Hex | Usage |
|-------|-----|-------|
| primary-50 | #e8f4ff | 배경 하이라이트 |
| primary-100 | #c5e3ff | 호버 배경 |
| primary-200 | #94ccff | 포커스 링 |
| primary-300 | #5fb3ff | 보조 액센트 |
| primary-400 | #1890ff | 메인 브랜드 (밝은) |
| primary-500 | #0a54bf | 메인 브랜드 (중간) |
| primary-600 | #123c80 | 메인 브랜드 (어두운) |
| primary-700 | #0d2b5e | 사이드바, 진한 텍스트 |

### Surface (배경)
| Token | Hex | Usage |
|-------|-----|-------|
| surface | #ffffff | 카드, 모달 |
| surface-secondary | #fafbfd | 페이지 배경 |
| surface-tertiary | #f4f5f7 | 테이블 헤더, 서브 영역 |
| surface-page | #f7f8fa | 전체 배경 |

### Text
| Token | Hex | Usage |
|-------|-----|-------|
| text-primary | #1a1a2e | 제목, 주요 텍스트 |
| text-secondary | #5a5c69 | 본문 |
| text-tertiary | #9699a6 | 보조 텍스트 |
| text-placeholder | #c3c6d4 | 플레이스홀더 |

### Status
| Token | Hex | Background | Usage |
|-------|-----|------------|-------|
| green | #00c875 | #e6f9f0 | 성공, 진행중, 완료 |
| yellow | #fdab3d | #fff5e6 | 경고, 대기 |
| red | #e2445c | #fce4e8 | 에러, 긴급, 이탈 |
| blue | #0086c0 | #e0f2fe | 정보, 신규 |
| purple | #a25ddc | #f3e8ff | 특수 상태 |

### Border
| Token | Hex | Usage |
|-------|-----|-------|
| border | #e6e9ef | 기본 보더 |
| border-light | #f0f1f5 | 서브 구분선 |

## 2. Typography

### Font Family
- **Primary:** Pretendard
- **Fallback:** -apple-system, system-ui, sans-serif

### Font Scale
| Name | Size | Weight | Line Height | Usage |
|------|------|--------|-------------|-------|
| heading-xl | 22px | 700 | 1.3 | 페이지 타이틀 |
| heading-lg | 18px | 700 | 1.4 | 섹션 타이틀 |
| heading-md | 15px | 600 | 1.4 | 카드 타이틀 |
| body-md | 14px | 400 | 1.6 | 본문 |
| body-sm | 13px | 400 | 1.5 | 테이블, 리스트 |
| caption | 12px | 500 | 1.4 | 라벨, 뱃지 |
| micro | 11px | 600 | 1.3 | 태그, 보조 정보 |

## 3. Spacing Scale

| Token | Value | Usage |
|-------|-------|-------|
| xs | 4px | 아이콘 간격 |
| sm | 8px | 인라인 간격 |
| md | 12px | 카드 내부 간격 |
| lg | 16px | 섹션 간격 |
| xl | 20px | 카드 패딩 |
| 2xl | 24px | 페이지 패딩 |
| 3xl | 32px | 섹션 간 간격 |

## 4. Layout

### Sidebar
- Width: 240px (desktop), full-width overlay (mobile)
- Background: white
- Logo area height: 52px
- Nav item height: 36px
- Nav item padding: 8px 12px
- Active indicator: left 3px primary-400 bar

### Header
- Height: 48px
- Background: white
- Border: bottom 1px border-light
- Page title: heading-lg

### Content Area
- Padding: 24px
- Max width: none (full width)
- Gap between sections: 24px

## 5. Components

### Button
| Variant | Background | Text | Border | Hover |
|---------|-----------|------|--------|-------|
| primary | primary-400 | white | none | primary-500 |
| secondary | white | text-primary | border | surface-tertiary |
| danger | transparent | red | red border | red-50 |
| ghost | transparent | text-secondary | none | surface-tertiary |

| Size | Height | Padding | Font |
|------|--------|---------|------|
| sm | 30px | 10px 14px | 12px/600 |
| md | 36px | 8px 16px | 13px/600 |
| lg | 40px | 10px 20px | 14px/600 |

### Input
- Height: 36px (md), 30px (sm)
- Border: 1px border
- Border radius: 8px
- Focus: 2px ring primary-200
- Padding: 8px 12px
- Font: 13px

### Card
- Background: white
- Border: 1px border-light
- Border radius: 12px
- Shadow: 0 1px 3px rgba(0,0,0,0.04)
- Hover shadow: 0 4px 12px rgba(0,0,0,0.06)
- Padding: 20px

### Badge
- Height: 22px
- Padding: 2px 8px
- Border radius: 4px
- Font: 11px/600

### Table
- Header background: surface-tertiary
- Header font: 12px/600, text-tertiary, uppercase
- Header height: 36px
- Row height: 44px
- Row hover: primary-50/30
- Cell padding: 8px 12px

### Modal
- Overlay: black/40, backdrop-blur(2px)
- Border radius: 16px
- Max height: 85vh
- Shadow: 0 20px 60px rgba(0,0,0,0.12)

## 6. Shadows

| Level | Value | Usage |
|-------|-------|-------|
| sm | 0 1px 2px rgba(0,0,0,0.04) | 인풋, 뱃지 |
| md | 0 1px 3px rgba(0,0,0,0.04), 0 1px 2px rgba(0,0,0,0.02) | 카드 |
| lg | 0 4px 12px rgba(0,0,0,0.06), 0 2px 4px rgba(0,0,0,0.03) | 카드 호버 |
| xl | 0 8px 24px rgba(0,0,0,0.08), 0 2px 8px rgba(0,0,0,0.04) | 드롭다운 |
| 2xl | 0 20px 60px rgba(0,0,0,0.12), 0 4px 16px rgba(0,0,0,0.06) | 모달 |

## 7. Border Radius

| Token | Value | Usage |
|-------|-------|-------|
| sm | 4px | 뱃지, 태그 |
| md | 8px | 인풋, 버튼 |
| lg | 12px | 카드 |
| xl | 16px | 모달, 큰 카드 |
| full | 9999px | 필 뱃지, 아바타 |

## 8. Animations

| Name | Duration | Easing | Usage |
|------|----------|--------|-------|
| fade-in | 200ms | ease-out | 모달 오버레이 |
| slide-up | 200ms | ease-out | 모달, 토스트 |
| slide-down | 150ms | ease-out | 드롭다운 |
| expand | 200ms | ease-in-out | 아코디언 |

## 9. Responsive Breakpoints

| Name | Width | Usage |
|------|-------|-------|
| sm | 640px | 모바일 |
| md | 768px | 태블릿 |
| lg | 1024px | 데스크톱 |
| xl | 1280px | 와이드 데스크톱 |

## 10. Icon System

| Size | Pixels | Usage |
|------|--------|-------|
| xs | 14px | 인라인 보조 |
| sm | 16px | 버튼, 테이블 |
| md | 18px | 사이드바, 헤더 |
| lg | 20px | 액션 아이콘 |
| xl | 24px | 빈 상태 |
