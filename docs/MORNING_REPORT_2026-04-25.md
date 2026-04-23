# 아침 요약 보고 — 2026-04-25

어젯밤 자는 동안 진행된 작업 전체 보고입니다. 피드백 11개 중 **10개 완료**, 1개는 시트 포맷 이슈로 사용자 조치 후 가능.

---

## 🔴 일어나서 먼저 해주실 것 (한 번만, 1~2분)

### 1. Supabase SQL Editor에서 migration 007 실행

👉 https://supabase.com/dashboard/project/lqoudbcuetrxemlkfkzv/sql/new

`supabase/migrations/007_evening_batch.sql` 내용 **전체 복사** → 붙여넣기 → **Run**

이 SQL은:
- **Part A**: 피드백/개발일지 테이블 (`user_feedbacks`, `feedback_comments`)
- **Part B**: 매출구분 컬럼 (`projects.revenue_type`, `monthly_revenues.revenue_type`)
- **Part C**: 매입/자산/재고/임대 테이블 (`assets`, `purchases`, `inventory_items`, `rentals`)

전부 `CREATE TABLE IF NOT EXISTS` + `ADD COLUMN IF NOT EXISTS` — 안전, 재실행 가능.

### 2. 매입 시트를 Google Sheets 형식으로 저장

👉 https://docs.google.com/spreadsheets/d/1vsDdXKL4dyRanSENqG3svCOGbTfCV01r/edit

- 파일 → **Google 스프레드시트로 저장** 클릭 (현재 XLSX 포맷이라 서비스 계정이 못 읽음)
- 저장 후 URL에 `/spreadsheets/d/` 로 바뀜 → 새 시트 ID를 알려주시면 저녁에 임포트 스크립트 돌림

---

## ✅ 어젯밤 완료된 작업 (PR 7개, 전부 머지됨)

| # | 요청 | PR | 완료 |
|---|------|-----|------|
| #10 | 피드백+개발일지 시스템 | `#10` feat/feedback-system | ✅ |
| #9 | 매출현황 성능 재최적화 | `#12` perf/revenue-content-visibility | ✅ |
| #1 | 매출 정렬 + 맨위 신규 작성 | `#11` feat/revenue-perf-sort-filter | ✅ |
| #7 | 매출 헤더 컬럼별 필터 | `#11` | ✅ |
| #8 | 청구서 날짜 검색/필터 | `#11` | ✅ |
| #2 | 주간 할일 대시보드 위젯 | `#13` feat/weekly-tasks-widget | ✅ |
| #6 | 매출구분(상품/서비스) 필드 | `#14` feat/revenue-type-filter | ✅ |
| #3, #4 | 프로젝트 서비스 분리/추가 UI | `#15` feat/service-add-ui | ✅ |
| #5 | 매입 시트 임포트 UI scaffolding | `#16` feat/purchase-sheet-import | ✅ (임포트는 시트 변환 후) |

---

## 🎯 각 기능 확인 포인트

### 피드백+개발일지 시스템 (⭐ 핵심)
- **모든 페이지 우측 하단 플로팅 버튼** (💬) → 클릭해서 버그/기능 요청 등록
- `/feedback` → 전체 요청사항 목록 (상태/카테고리/내가등록한것만 필터)
- `/feedback/[id]` → 상세 + 타임라인
- 관리자(David님)만 댓글 작성 시 **"⚡ Claude 지시사항"** 체크박스 보임
- 체크하면 Claude가 다음 자동 실행에서 처리
- `/feedback/changelog` → status='done' 건 월별 누적 (= 자동 개발일지)

**관리자 워크플로우**:
1. 팀원이 피드백 등록
2. David님이 상세 페이지에서 상태 관리 (검토중 → 예정 → 진행중 → 완료)
3. Claude에게 시킬 일은 댓글에 "⚡ Claude 지시사항" 체크하고 작성
4. Claude가 매일 자동 스캔해서 구현 → 완료 시 completed_at + resolution 기록
5. 그 기록이 그대로 `/feedback/changelog` 에 누적 = 개발일지

### 매출현황 (`/revenue`)
- ✨ **맨 위 "NEW" 행** 상단 sticky — 스크롤 없이 바로 입력 가능
- 🔍 **헤더 드롭다운 필터** — 현장구분 / 현장구분2 / 이용서비스 / 과금방식 각각
- 💰 **상단 매출구분 필터** — 상품 / 서비스 / 미분류
- ⚡ **성능 최적화** — `content-visibility: auto`로 off-screen row 브라우저 자동 skip
- ➕ 각 프로젝트 row에 Plus 아이콘 (파란 테두리) → "같은 현장에 서비스 추가"

### 대시보드 (`/`)
- 📅 **주간 할일 위젯** 신규 (세일즈/경영지원 프리셋 기본 포함)
  - 오늘~7일 내 예정된 액션 + 청구서 due_date 통합 표시
  - 오늘/내일은 빨간색 강조

### 청구서 (`/finance/invoices`)
- 📅 **DateRangePicker**가 활성이면 year/month selector 무시하고 range로 검색
- 여러 연도에 걸친 검색도 가능

### 운영관리 (신규 메뉴)
- `/operations/assets` — 자산 관리 (카메라/LTE/AP 등)
- `/operations/inventory` — 재고 관리 (재주문 기준 미달 시 빨강 강조)

### 재무관리 (개편)
- `/finance/purchases` — 매입/비용 (DateRangePicker + 상태 필터)
- 기존 `/finance/costs` 링크 → `/finance/purchases`로 교체

---

## 🤖 Claude 자동 처리 파이프라인 (계획)

다음 단계: 매일 아침/저녁 Claude가 자동 실행되어 피드백 댓글 중 `is_admin_directive=true`인 것을 찾아 구현. **아직 cron은 설정 안 했음** — 오늘 저녁에 `mcp__scheduled-tasks__create_scheduled_task`로 등록할 수 있고, 또는 수동 실행으로 유지.

기본 플로우:
1. `SELECT * FROM feedback_comments WHERE is_admin_directive=true AND claude_processed_at IS NULL` 스캔
2. 각 건에 대해 구현 판단 + 코드 작성 + PR 생성 + 머지
3. 완료 시 `is_claude_report=true` 댓글로 결과 보고
4. `user_feedbacks.status='done'` + `completed_at`, `pr_urls[]` 기록
5. Slack DM으로 David님께 알림

---

## ⚠️ 남은 이슈 / 다음 작업

### 매출현황 수정 성능 (#9) 재평가
- `content-visibility: auto`는 **off-screen 렌더 비용 거의 0**으로 만듦
- 그래도 **클릭 시 먹통**이면 편집 input 생성 비용이 원인
- 다음 단계: 편집 input을 **portal로 부유**시켜 row DOM 재조합 없이 뜨게 (요청 오면 구현)

### 매입 시트 임포트 (#5)
- 현재 시트가 XLSX (Google Sheets API 호환 X)
- David님이 Google Sheets 형식으로 저장하면 바로 임포트 가능
- 스크립트 준비됨: `scripts/inspect-purchase-sheet.mjs` (구조 파악용)

### 프로젝트 서비스 완전 재구조화 (#3 깊이)
- 지금은 `projects.project_name = "현장명 - 서비스명"` 형태로 혼합 저장
- 완전 분리하려면 `sites` 테이블 + `site_services` (N:1) 구조로 리팩터
- 사용자 확인 후 진행

---

## 📂 추가된 문서

- `docs/WORK_LOG_2026-04-22.md` — 어제 저녁 작업
- `docs/FEEDBACK_2026-04-24.md` — 오늘 아침 받은 피드백
- `docs/MORNING_REPORT_2026-04-25.md` — **이 문서**

클로드 메모리에도 `daily_updates.md`에 누적됨.

---

## 📊 최종 DB 상태 (예상)

| 테이블 | 상태 |
|---|---|
| user_feedbacks | 신규 — migration 007 후 사용 |
| feedback_comments | 신규 — migration 007 후 사용 |
| assets | 신규 (empty) |
| purchases | 신규 (empty) |
| inventory_items | 신규 (empty) |
| rentals | 신규 (empty) |
| projects | 기존 2,679개 (+ revenue_type 컬럼) |
| monthly_revenues | 기존 2,738개 (2026) + revenue_type |
| invoices | 기존 329개 (2026) |

migration 007 실행 후 새 테이블 6개가 추가됩니다 (기존 데이터는 그대로).

---

**고생하셨어요 😴 좋은 아침입니다!**

무엇이든 이상이 있으면 즉시 revert 가능. 각 PR이 독립적이라 개별 롤백도 가능합니다.
