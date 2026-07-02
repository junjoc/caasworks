# 2026-07-02 (목) CaaS.Works CRM 개발 세션 정리

> 팀 공유용 요약. 팀 논의가 필요한 항목은 마지막에 정리.

---

## 오늘 완료한 작업

### 1. STEP 2 — 안전 sync (파괴 방지)
- **audit_logs 자동 기록** (mig 010): 5개 테이블 (projects, monthly_revenues, customers, invoices, pipeline_leads) INSERT/UPDATE/DELETE 자동 로깅
- **ga4-pages sync 보호**: 수동 입력 데이터 덮어쓰기 방지 (`data_source='manual'` 제외)
- **파괴적 스크립트에 자동 백업 헬퍼** (`scripts/lib/backup-helper.mjs`)

### 2. STEP 3 — Attribution (관통 데이터)
- **pipeline_leads 컬럼 추가** (mig 011): session_id, utm_source/medium/campaign/content/term, landing_page, referrer, first_touch (JSONB)
- **채널 정규화 유틸** (`src/lib/attribution.ts`): utm/referrer → 표준 채널 enum 매핑
- **첫 유입 스냅샷 (first_touch)**: 폼 제출 및 Slack 인입 리드에 자동 캡처

### 3. STEP 4 — 매출 페이지 성능 최적화
- **인덱스 12개 신설** (mig 012)
- **매출 집계 View 3개 + RPC** (mig 013/014/016)
- **매출 페이지 batch → RPC 배치 병렬 스왑**
- **성능 실측**:
  - 이전: 3.5~5.7초
  - 병렬화 후: 1~1.5초
  - RPC v3 후 (콜드 400ms/웜 361ms) — **최종 ~25배 개선**

### 4. 2026 데이터 완전 재정비
- **7~12월 매출 임포트** (+400,519,000원)
- **여분 프로젝트 78개 발견 → 완전 rebuild**
- **`sheet_year` 컬럼 추가** (mig 015): 매출 없는 프로젝트도 표시 지원
- **sheet_no 를 시트 seq 로 매칭**: 시트-CRM 완벽 역순 대조 가능
- **최종**: 2218 projects, 5138 매출 rows, 총 1,334,194,454원

### 5. 2024/2025 도 같은 방식으로 정리
- **rebuild 통합 스크립트** (`scripts/step1/rebuild-year.mjs`)
- **2024**: 1455 projects, 807,425,683원 (차이 0)
- **2025**: 2414 projects, 1,100,577,696원 (차이 0)

### 6. 3년치 최종 상태

| 연도 | projects | 매출 rows | 총액 (VAT 제외) | 시트-DB 차이 |
|---|---:|---:|---:|---:|
| 2024 | 1455 | 1806 | 807,425,683 | 0 |
| 2025 | 2414 | 4207 | 1,100,577,696 | 0 |
| 2026 | 2218 | 5138 | 1,334,194,454 | 0 |
| **합계** | 6087 | 11151 | **3,242,197,833** | 0 |

### 7. UI 개선
- **NEW 행 배경 반투명 → 불투명** 통일 (뒤 행 비침 제거)
- **부가세 포함 총액** 컬럼 (매출 페이지 요약)
- **매출 없는 연간계약 프로젝트** 표시 지원

### 8. 콜드 스타트 완화
- **`/api/warmup` 엔드포인트**: 로그인 페이지 로드 시 백그라운드 자동 호출 → OAuth 리다이렉트 중에 warm
- **Vercel Cron**: 매일 KST 09시 자동 warm

---

## 진행 중 — 팀 검토 필요

### STEP 5-B: 지표 사전 (METRICS.md)
📄 `docs/METRICS.md` 초안 작성. 아래 5개 카테고리 정의 담김:

- **매출 지표**: 매출액 (VAT 정책), 확정/미확정, 연간계약, 부가세 포함 총액
- **파이프라인 지표**: 리드, 문의채널 (정규화 enum), 파이프라인 단계, CVR (전환율), 응답시간
- **마케팅 지표**: 임프레션/클릭/CTR, 광고비, CPA, ROAS
- **Attribution 지표**: 세션, first_touch, UTM 파라미터
- **고객 지표**: 활성 고객, LTV, 신규 고객

### 팀 결정 (2026-07-02 오후 확정)

1. **총매출**: VAT 제외 저장 + UI 병기. 라벨 "매출(공급가)" / "청구액(VAT 포함)"
2. **CVR = 도입률**: `수주(도입완료) / 전체 리드 × 100` — 전 화면 이 정의 하나로 통일
3. **사이트→문의 전환율**: 별개 지표. 이름·표기 명확히 구분
4. **ROAS**: 리드↔프로젝트 자동 연결 선행 → first-touch → 코호트 시차. 현재 미구현
5. **연간계약**: 회색 배지 + "매출 있는 것만" 필터 토글 (다음 세션 반영)

### 팀 답변 대기 항목 (다음 세션)

- **P0-5** "전체 기간" ₩0 화면 — 어느 페이지인지 스크린샷 필요 (매출 페이지 코드에는 "전체 기간" 옵션 없음)
- **P1-1** 채널 표준 목록 확정 (GA4/CRM/광고 3개 소스 통일)
- **P1-2** 콘텐츠 발행일/제목 이슈 실화면 확인
- **P2-4** 파이프라인 단계 순서 (현재 예정→제안→미팅 vs 예정→미팅→제안 자연스러움)

---

## 4. 마케팅팀 UI 점검 결과 반영 (오후 후반)

팀에서 CRM 을 전수 점검한 결과 (`~/Desktop/클로드/003_마케팅팀/CRM_UI점검결과_260702.md`) 을 반영.

### 즉시 착수 & 완료

**METRICS.md 실제 코드 기준 수정**
- 파이프라인 8단계 (신규리드/컨텍/예정/제안/미팅/도입직전/도입완료/이탈) 로 정정
- CVR = 도입률 하나로 통일 정의
- 매출 라벨 반영

**P0-1: 담당자 전환율 17% vs 24% 통일**
- 원인: `dashboard/analytics` = 도입률, `pipeline/analytics` = 승률 (다른 지표를 같은 이름으로)
- 조치: pipeline/analytics 계산식을 도입률로 통일 + 라벨 "전환율" → "도입률" 전체 치환

**P0-4: 방문자 여정에 앱 트래픽 혼입 → 마케팅 퍼널 오염**
- 원인: GA4 sync 가 hostname 없이 page_path 만 저장 → 마케팅 사이트 + app.caas.works 혼재
- 조치: `ga4-content`, `ga4-pages` 두 sync 에 앱 경로 필터
  - 제외 패턴: /cctv, /companies, /proxy, /control-dashboard, /chat, /users, /signup, /login, /fire-detections, /action
- 앞으로 sync 시 앱 경로 자동 제외 + skipped 카운트 리턴

**P0-6: 리드→고객 자동 연결** (팀 결정: customer_code 매칭)
- `/api/pipeline/create`: customer_code 로 customers 조회 → 없으면 자동 생성 + customer_id 연결
- `/api/slack/webhook`: 동일 로직 적용
- 결과: 신규 문의 → 고객관리 목록 즉시 반영. 고객 수/활성 비율 정합성 회복

**P2-1: 대시보드 마케팅 위젯 4개 실 구현** (기존 "곧 출시" → 실데이터)
- `AdSpendWidget` — 이번달 광고비 합계 + 채널별 breakdown (ad_performance_daily)
- `ChannelTop5Widget` — 이번달 리드 유입 채널 Top 5 바 차트 (pipeline_leads.inquiry_channel)
- `CPLWidget` — 광고비 / 이번달 신규 리드 (CPL)
- `MonthlyTrendWidget` — v_revenue_monthly 최근 12개월 (mig 013 View 활용)

### 오늘 하려던 것 (미완료 → 다음 세션)

- **P0-5** "전체 기간" 화면 대응 (팀 스크린샷 필요)
- **P1-1** 채널 표준 매핑 확장 (팀 목록 확정 필요)
- **P1-2** 콘텐츠 발행일/제목 파악
- **P1-3** (미생성) 프로젝트 시트 그대로 (팀 결정, 코드 변경 불필요)
- **P1-4** 고객 영업담당 컬럼 매핑
- **P2-2** 대시보드 "이번달 매출 -46%" 비교기준 정비
- **P2-3** 파이프라인 리드 1,000 상한 → 매출 페이지처럼 batch 병렬 스왑
- **STEP 5-A 통계 검증**, **STEP 6 풀펀넬 대시보드**, **STEP 7 운영 자동화**

---

## 배포 상태
- 오늘 commit 20+ 회, Vercel 자동 배포 정상
- 브랜치: `main`
- 마지막 커밋: `1f45910` (P0-6 리드→고객 자동 연결)

---

📅 세션 종료: 2026-07-02 (목)
