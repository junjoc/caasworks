# 사이트 트래킹 설정 가이드

## 1. Supabase 테이블 생성 (1회)

Supabase SQL Editor에서 아래 파일의 SQL 실행:
`supabase/migrations/20260408_site_tracking.sql`

## 2. 개발팀 전달 사항

카스웍스 공식 사이트 `<head>` 태그에 아래 스크립트 1줄 추가:

```html
<script src="https://caasworks-crm.vercel.app/tracking.js" data-endpoint="https://caasworks-crm.vercel.app/api/tracking" defer></script>
```

### 자동 수집 항목
- 세션 정보 (UTM, 레퍼러, 디바이스, 랜딩페이지)
- 페이지뷰 (URL, 제목, 체류시간, 스크롤 깊이)
- CTA 클릭 (`data-cta` 속성 있는 요소 자동 추적)
- 문의 폼 이벤트 (`data-track-form` 속성 있는 폼 자동 추적)

### CTA 버튼 추적 설정
문의하기 버튼 등에 `data-cta` 속성 추가:
```html
<button data-cta="hero">무료 체험 시작</button>
<a data-cta="header" href="/contact">문의하기</a>
<button data-cta="pricing">견적 요청</button>
```

### 문의 폼 추적 설정
문의 폼에 `data-track-form` 속성 추가:
```html
<form data-track-form="inquiry" action="...">
  <input name="company" />
  <input name="phone" />
  <!-- customer_code 필드가 있으면 CRM 리드와 자동 연결 -->
  <input type="hidden" name="customer_code" value="..." />
</form>
```

### 수동 이벤트 전송 (선택)
```javascript
// 특정 버튼 클릭, 영상 재생 등 커스텀 이벤트
window.cwTrack('video_play', { video: 'intro', duration: 30 });
window.cwTrack('pricing_view', { plan: 'enterprise' });
```

## 3. 수집 데이터 구조

| 테이블 | 용도 |
|--------|------|
| site_sessions | 방문 세션 (UTM, 디바이스, 전환 여부) |
| site_pageviews | 페이지별 조회 (체류시간, 스크롤) |
| site_events | 클릭/폼/커스텀 이벤트 |

## 4. CRM 대시보드 (추후 구현)
- 유입 분석: 소스/매체/캠페인별 방문수, 전환율
- 행동 분석: 페이지 흐름, 이탈 구간
- 전환 퍼널: 랜딩 → 서비스 → 문의 → 제출
- 리드 여정: 개별 리드의 사이트 방문 히스토리
