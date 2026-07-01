# CaaS.Works CRM — 현재 상태 재기준 (2026-07-01)

> 이 문서가 **source of truth**. `DEVELOPMENT_NOTES.md` 는 stale 이므로 참고 금지.
> 이관 문서(`CaaSWorks_CRM_통합_개발이관문서_260701.md`) 의 STEP 0 실행 결과.
>
> 작성 근거: `scripts/step0-measure.mjs` 라이브 실측 (2026-07-01) + 코드 정독.

---

## 1. 라이브 실측 (Supabase `lqoudbcuetrxemlkfkzv`)

### 1.1 핵심 테이블 행 수

| 테이블 | 라이브 | 개발노트 표기 | 비고 |
|---|---:|---:|---|
| customers | **510** | 494 | 증가 (정상 증분) |
| projects | **1,667** | 2,825 | 감소 — 4/24 split 결과 |
| monthly_revenues | **3,888** | 8,664 | ⚠️ **~4,776 소실** |
| pipeline_leads | **1,074** | 877 | 증가 (신규 유입) |
| invoices | **740** | 660 | 증가 |
| invoice_items | 1,462 | 2,411 | 감소 |
| ad_performance | 2,204 | — | |
| campaigns | 19 | — | |
| **site_sessions** | **0** | (구현) | ⚠️ 트래킹 데이터 0 |
| **site_pageviews** | **0** | (구현) | ⚠️ 동일 |
| **site_events** | **0** | (구현) | ⚠️ 동일 |
| voc_tickets | **0** | (구현) | ⚠️ 데이터 0 |
| quotations | **0** | (구현) | ⚠️ 데이터 0 |
| activity_logs | 167 | — | |
| **audit_logs** | **0** | (구현) | ⚠️ 감사 미작동 |
| user_feedbacks | 3 | (신규) | 4월 도입 |
| roles | 3 | — | |
| users | 6 | — | |

### 1.2 monthly_revenues 연도별 — 매출 손실 확인

| 연도 | 행 수 | 합계 (원) |
|---|---:|---:|
| 2023 | 0 | 0 |
| **2024** | **0** | **0** ⚠️ |
| **2025** | **0** | **0** ⚠️ |
| 2026 | 3,888 | **973,581,311** |
| 2027 | 0 | 0 |

- **2024/2025 완전 소실.** 원본 엑셀(팀 보유) 에서 복구 필요.
- 2026 은 12개월 전 구간 데이터 있음 (5·6월 포함, 팀 입력 반영됨).

### 1.3 2026 월별 매출

```
 1월: 106,488,886    5월:  82,881,750    9월: 44,524,750
 2월:  97,119,250    6월:  64,692,750   10월: 43,941,750
 3월: 138,911,425    7월:  59,308,750   11월: 35,332,750
 4월: 215,778,750    8월:  50,457,750   12월: 34,142,750
```
> 5·6월 팀 입력 완료된 것으로 보임(이관 문서에는 "미입력"이었으나 라이브는 채워짐).
> 상반기 합계 = **705,872,811 원**. 하반기 = 267,708,561 원 (감소 추세 — 향후 예약분 수정 여지 있음).

### 1.4 pipeline_leads 스테이지 분포 (1,074건)

| stage | 건수 |
|---|---:|
| 이탈 | 641 (60%) |
| 도입완료 | 183 (17%) |
| 컨텍 | 110 |
| 제안 | 74 |
| 예정 | 48 |
| 미팅 | 11 |
| 도입직전 | 7 |
| null | 0 |

### 1.5 inquiry_channel 분포

| 채널 | 건수 |
|---|---:|
| 자사채널 | 407 |
| 대표전화 | 370 |
| 개인전화 | 68 |
| 행사방문 | 69 |
| 검색유입 | 48 |
| 기타 | 42 |
| 해피톡 | 22 |
| 이메일 | 17 |
| 가입사 | 16 |
| 블로그 | 10 |
| 추천 | 4 |
| null | 1 |

> `자사채널` + `대표전화` = 777 (72%). **유료검색 세부 (구글 vs 네이버) 미분화** — STEP 3 표준화 대상.

### 1.6 invoices 요약

- year: 2025년 407건, 2026년 333건
- status: paid 658, sent 73, overdue 7, draft 2
- 총 금액: **845,741,773 원**
- `tax_invoice_issued_at` 있음: **75건** (2026-04-24 시트 임포트 결과)
  - 665건은 아직 세금계산서 발행일 미기록 → 미납현황 페이지 활용도 저하

---

## 2. 관통 단절 진단 (STEP 3 대상)

### 2.1 pipeline_leads 에 attribution 컬럼 전무

| 컬럼 | 존재 |
|---|:-:|
| session_id / site_session_id | ❌ |
| utm_source / utm_medium / utm_campaign / utm_content | ❌ |
| landing_page | ❌ |
| referrer | ❌ |

→ 리드가 어떤 콘텐츠/캠페인에서 왔는지 **데이터로 추적 불가**.

### 2.2 site_sessions / pageviews / events 모두 0건

- `tracking.js` 스크립트 및 `/api/tracking` 엔드포인트는 코드에 존재
- 실제 데이터 유입 없음 → 트래킹 스크립트가 외부 사이트에 **설치되지 않았거나 요청이 실패**
- STEP 3 착수 전 반드시 원인 규명 필요 (스크립트 설치 여부 확인)

### 2.3 inquiry_channel coarse

- `자사채널` 안에 홈페이지/깃북/전화 등 혼재
- `검색유입`이 구글/네이버 구분 없음
- STEP 3에서 표준 enum + utm→채널 자동 매핑

---

## 3. audit_logs 미작동 — 근본 원인

### 3.1 결과
- `audit_logs` 테이블 존재 (migration 001), 행 수 **0**.

### 3.2 원인 (코드 정독)
- `src/middleware.ts` → `updateSession(request)` **호출만 함**
- `src/lib/supabase/middleware.ts` → **auth 세션 갱신 로직만 존재**. audit 관련 코드 전혀 없음.
- 즉 **감사 미들웨어가 "고장난" 게 아니라 "애초에 구현이 안 됨"**.

### 3.3 대응 (STEP 2 항목)
- create/update/delete 시 audit_logs 삽입 로직 필요
- 방식 선택지:
  - a) Supabase DB trigger (안전, 자동, 앱 코드 무관)
  - b) API 라우트 miscellaneous wrapper (범위 좁음, 놓칠 위험)
  - c) 위 두 개 병행 (권장)

---

## 4. 매출 손실 재발 방지 — 원인 짚음

### 4.1 확률 높은 원인
**2026-04-24 `scripts/split-projects-from-sheet.mjs --live` 실행**

당시 로그:
```
[delete] monthly_revenues year=2026... ✅ deleted 2738
[delete] projects (all 2736)... ✅ deleted 2736/2736
```

**메커니즘**:
- 스크립트가 `year=2026` 매출만 명시적으로 삭제 + 백업 → 2026 만 백업 JSON 에 저장
- 그 다음 **모든 projects 2,736개 삭제**
- `monthly_revenues.project_id` FK 가 `ON DELETE CASCADE` (migration 001)
- → 프로젝트 삭제 시 **모든 연도(2024·2025 포함) 매출이 CASCADE 로 함께 삭제**
- 백업 JSON 에는 2024/2025 없음 → 복구 불가 상태

### 4.2 재발 방지 (STEP 2)
- **모든 파괴적 스크립트**:
  - 전체 백업 (해당 테이블 + FK 참조하는 자식 테이블 전부)
  - 트랜잭션으로 묶기 (Supabase 는 RPC 로 트랜잭션 필요)
  - 실행 전 사용자 명시 승인
- **모든 sync/import**:
  - DELETE-ALL → INSERT 금지
  - upsert(onConflict) 로 전환
  - `data_source` 보호를 monthly_revenues, pipeline_leads 등 전 테이블로 확대

---

## 5. Delete-all 패턴 목록 (STEP 2 리팩터 대상)

### 5.1 sync 계열 (부분적으로만 안전)
| 파일 | 라인 | 보호 |
|---|---|---|
| `src/app/api/marketing/sync/naver-ads/route.ts` | 298~300 | ✅ `.neq('data_source', 'manual')` |
| `src/app/api/marketing/sync/google-ads/route.ts` | 236~241 | ✅ 동일 |
| `src/app/api/marketing/sync/ga4-sources/route.ts` | 260~264 | ✅ 동일 |
| `src/app/api/marketing/sync/ga4-pages/route.ts` | 173 | ⚠️ **보호 없음 — 위험** |
| `src/app/api/sync/invoices/route.ts` | 253 | invoice_items 삭제 (invoice 병합 시) |

### 5.2 일회성 스크립트 (완료 후 폐기 방향)
- `scripts/split-projects-from-sheet.mjs` — **매출 손실 유발**. 재사용 금지.
- `scripts/sync-april-delete-9.mjs` — 4월 9건 삭제 (완료됨).
- `scripts/sync-april-3fixes.mjs` — 4월 3건 수정 (완료됨).

### 5.3 API 정상 (사용자 명시 액션)
- `feedback/[id]/route.ts` — DELETE endpoint (의도적)
- `pipeline/update/route.ts` — bulk_delete / delete_activity (의도적)

---

## 6. 다음 실행 순서 (STEP 1 시작 조건)

### 6.1 STEP 1 진입 전 필요한 것
- [ ] 사용자로부터 **2024/2025 매출 엑셀 파일** 수령
- [ ] 파일 형식·구조 파악 (헤더 위치, 연도 컬럼, 회사명 매칭 키)
- [ ] upsert 대상 정의: `(customer_id, project_id or project_name, year, month)` 조합

### 6.2 STEP 1 실행 원칙
- **INSERT ... ON CONFLICT (upsert)** 만 사용
- 기존 값 유지 정책 (기존 데이터 절대 덮어쓰기 X)
- 실행 전 백업: 모든 monthly_revenues 를 JSON 파일로 저장
- 사용자 승인 후 실행, PR 리뷰 후 머지

### 6.3 STEP 1 검증
- 실행 후 연도별 행수 + 월별 합계를 원본 엑셀과 대조
- 2026 월별 합계가 실행 전과 100% 동일한지 확인 (2024/2025 만 추가되었을 것)

---

## 7. STEP 2 이후 로드맵 (참고)

- **STEP 2 안전 동기화 재설계** — audit_logs DB trigger + upsert 전환
- **STEP 3 관통** — pipeline_leads 스키마 확장(session/utm/utm_*/landing_page/referrer/first_touch) + tracking.js 재점검
- **STEP 4 성능** — 매출·재무 집계 뷰/RPC, 서버 페이지네이션, 인덱스 확대
- **STEP 5 정합성** — 표시 통계 감사, 지표 사전, 동기화 수리 (네이버/GA4/Google Ads)
- **STEP 6 대시보드** — 풀퍼널 개요, 콘텐츠/여정/이탈, 채널 ROI, 코호트/LTV
- **STEP 7 자동화** — 리드 배분, 중복 병합, SLA 알림

---

## 8. 이관 문서 vs 라이브 차이 요약

| 이관 문서 | 라이브 실측 | 결론 |
|---|---|---|
| monthly_revenues "2026도 4월까지만, 5·6월 미입력" | **5·6월 데이터 있음** (~82M + 64M) | 팀이 이미 입력 완료 |
| projects 1,667 | 1,667 | 일치 |
| customers 510 | 510 | 일치 |
| pipeline_leads (2026-04-02 ~ 6-30 문의 196, 도입 22) | 별도 검증 필요 | 기간 대조는 STEP 5 |
| ad_performance 정상 | 2,204건 존재 | 대체로 일치 |

---

**작성**: Claude Code (STEP 0 재기준화)
**작성일**: 2026-07-01 (화)
**다음 세션 진입 시 반드시 이 문서와 `docs/DEV_LOG/` 폴더를 먼저 읽을 것.**
