# CaaS.Works CRM 지표 사전 (METRICS DICTIONARY)

> 작성일: 2026-07-02 (목)
> 목적: CRM 안에서 사용되는 지표의 정의·계산식·주의사항을 통일된 언어로 정리.
> 데이터 원본: Google Sheets (매출), Supabase (모든 트랜잭션/집계).
> 규칙: 지표 정의가 바뀌면 반드시 이 문서를 먼저 수정 후 코드 반영.

---

## 1. 매출 지표

### 1.1 매출액 (Revenue)
- **정의**: 특정 기간 (연/월/일) 에 계상된 매출의 합계.
- **저장**: `monthly_revenues.amount` — **VAT 제외** 값.
- **UI 표시**: 두 가지로 병기.
  - VAT 제외 = `sum(amount)`
  - VAT 포함 = `sum(amount) × 1.1`
- **주의**: 시트에서 서비스별로 여러 rows 로 쪼갠 경우 프로젝트 매출은 그 합계.

### 1.2 확정 매출 vs 미확정 매출
- **정의**: `monthly_revenues.is_confirmed` boolean.
  - `true` = 세금계산서/입금 확인 완료
  - `false` = 예정/추정
- **UI 표시**: 미확정은 `*` 표시 또는 색상 구분.
- **경영 판단**: 예측 수치는 미확정 포함, 결산은 확정만.

### 1.3 연간계약 (Annual Contract)
- **정의**: `monthly_revenues` 가 아직 없거나 일부 월에만 있고, 프로젝트 자체는 시트에 등록된 프로젝트.
- **식별**: `projects.sheet_year = YEAR` AND `revenues.length = 0 or < 12`.
- **UI 표시**: 매출 페이지에서 해당 연도 시트 프로젝트는 매출 유무와 무관하게 모두 표시.

### 1.4 부가세 포함 총액
- **정의**: VAT 제외 총액 × 1.1
- **계산 시점**: UI 렌더 시점에만 계산 (DB 는 항상 VAT 제외 저장).
- **주의**: 절대 DB 에 VAT 포함으로 저장하지 말 것.

---

## 2. 파이프라인 지표

### 2.1 리드 (Lead)
- **정의**: `pipeline_leads` 테이블의 1행.
- **소스**: 폼 제출 / Slack 인입 / 수동 입력.
- **필수 필드**: `company_name`, `inquiry_date` (원칙).

### 2.2 문의 채널 (Inquiry Channel)
- **정의**: `pipeline_leads.inquiry_channel` 표준 enum (mig 011, 정규화 함수 `normalizeInquiryChannel`).
- **표준 값**:
  - 유료검색_네이버, 유료검색_구글
  - 오가닉_네이버, 오가닉_구글
  - 블로그_네이버, 블로그_티스토리
  - 직접, 추천
  - 전화_대표, 전화_개인
  - 이메일
  - 해피톡
  - 기타
- **매핑**: utm_source/medium/campaign, referrer, landing_page 조합으로 자동 매핑.

### 2.3 파이프라인 단계 (Stage)
- **정의**: `pipeline_leads.stage` — 리드 진행 단계.
- **표준 순서**:
  1. `신규` — 접수만 됨, 담당자 미배정
  2. `연락중` — 담당자 배정 + 1차 접촉 시도
  3. `상담중` — 요구사항 파악 진행
  4. `제안` — 견적서 발송
  5. `수주` — 계약 성사
  6. `실패` — 실패 사유 기록 (실패_이유)
  7. `보류` — 재타진 예정

### 2.4 전환율 (Conversion Rate, CVR)
- **현재 코드 정의** (`pipeline/analytics/page.tsx`):
  - `convRate = 수주 / (수주 + 실패) × 100`
  - 즉 **결과가 나온 리드 중 수주율** (진행중/보류 제외)
- **의미**: 클로즈된 리드의 성공률. 100% 는 실패 0.
- **주의**: 최근 리드는 아직 진행중 (수주도 실패도 아님) 이므로 분모에서 빠짐 → 오래된 코호트만 CVR 에 반영됨. 즉 최신 트렌드 반영 늦음.
- **다른 정의 (참고)**: 파이프라인 전체 vs 수주만 나눠보는 관점도 있으나, 현재 CRM 은 위 정의 사용.
- **표시 위치**: 파이프라인 분석 페이지 상단 KPI 카드 + 채널/업종별 테이블.

### 2.4b 사이트 → 문의 전환율 (Site→Inquiry CVR)
- **정의** (`marketing/ads/page.tsx`):
  - `문의클릭수 / GA사이트유입수 × 100`
- **의미**: 사이트 방문 중 얼마나 문의로 이어졌는가 (랜딩페이지/CTA 성능).
- **주의**: 리드 수주율 (2.4) 과 완전히 다른 지표. 혼동 금지.
- **표시 위치**: 마케팅/광고 페이지 인사이트 카드.

### 2.5 리드 응답 시간 (Response Time)
- **정의**: `inquiry_date` → 첫 담당자 배정 시점 (`assigned_to` 최초 세팅).
- **SLA**: 자체 정의 필요 (예: 24시간 이내).

---

## 3. 마케팅 지표

### 3.1 임프레션 / 클릭 / CTR
- **정의**: 광고 플랫폼 (네이버/구글) 에서 sync 로 수집.
- **CTR** = 클릭 ÷ 임프레션 × 100.

### 3.2 광고비 (Cost)
- **정의**: 캠페인별/일별 광고 지출.
- **환율**: 원화(KRW) 기준. USD 광고는 sync 시점 환율로 변환 저장.

### 3.3 CPA (Cost Per Acquisition)
- **정의**: 광고비 ÷ 획득 리드 수.
- **획득 리드**: 해당 캠페인의 utm 이 붙은 리드 (`pipeline_leads.utm_campaign`).
- **기간**: 캠페인 실행 기간 vs 리드 생성 기간 정렬 필요.

### 3.4 ROAS (Return On Ad Spend)
- **현재 CRM 상태**: **미구현** (지표 카드/계산 코드 없음).
- **향후 정의 제안**:
  - `ROAS = 광고 기인 매출 ÷ 광고비`
  - 광고 기인 매출: 리드의 `first_touch.utm_campaign` 기준 (first-touch 귀속)
  - 광고 기인 리드가 수주 → 그 프로젝트의 모든 매출을 캠페인에 귀속
- **결정 필요**: first-touch vs last-touch 정책 (팀 논의 후 확정).
- **선행 조건**: 리드가 수주 → 프로젝트 연결 링크가 확실히 존재해야 함 (현재는 리드↔프로젝트 자동 연결 없음).

---

## 4. Attribution 지표

### 4.1 세션 (Session)
- **정의**: `site_sessions` 테이블의 1행. 방문자 브라우저 단위.
- **연결**: `pipeline_leads.site_session_id` 로 리드와 매칭.

### 4.2 First Touch (최초 유입)
- **정의**: 사용자 최초 방문 시 저장된 utm/referrer/landing_page 스냅샷.
- **저장**: `pipeline_leads.first_touch` (JSONB, immutable).
- **원칙**: 이후 방문/utm 변경돼도 first_touch 값은 절대 변경 금지.

### 4.3 UTM 파라미터
- **표준**: `utm_source`, `utm_medium`, `utm_campaign`, `utm_content`, `utm_term`.
- **저장**: `pipeline_leads` 개별 컬럼 + `first_touch` JSONB.
- **주의**: URL 인코딩 처리, 한글 utm 은 UTF-8 유지.

---

## 5. 고객 지표

### 5.1 활성 고객 (Active Customer)
- **정의**: `customers.status = 'active'` AND 최근 12개월 내 매출이 있는 고객.

### 5.2 LTV (Lifetime Value)
- **정의**: 고객당 누적 매출 합계 (모든 연도).
- **계산**: `sum(monthly_revenues.amount) group by customer_id`.
- **주의**: 확정 매출만 계산할지 정책 명확히.

### 5.3 신규 고객 (New Customer)
- **정의**: 최초 매출 발생 시점이 특정 기간 내인 고객.
- **주의**: `customers.created_at` 이 아니라 첫 매출 발생일 기준 (프로젝트 인수 시점이 진짜 시작).

---

## 6. 데이터 소스 원칙

- **매출 원본**: Google Sheets (팀이 관리).
- **DB**: 시트를 그대로 반영. DB 값이 시트와 다르면 시트가 정답.
- **동기화**: `scripts/step1/rebuild-year.mjs` 로 시트 → DB rebuild.
- **파괴 조작**: 반드시 백업 (`scripts/step1/backup-full-v4.mjs`) 선행.
- **audit_logs**: 5개 테이블 (projects, monthly_revenues, customers, invoices, pipeline_leads) 자동 기록 (mig 010).

---

## 7. 지표 검증 (TODO — STEP 5-A)

- 매출 페이지 카드 숫자 vs `SELECT SUM(amount) FROM monthly_revenues WHERE year = 2026`
- 파이프라인 카드 (총 리드, 전환율) vs SQL 실측
- 마케팅 카드 (총 임프레션, ROAS) vs 원본 데이터
- 어긋난 지표 목록화 → 이 문서 업데이트 or 코드 수정

---

## 변경 이력

- 2026-07-02: 최초 작성 (STEP 5-B). 매출/파이프라인/마케팅/attribution/고객 기본 정의 포함.
