# CRM이 GA에서 읽는 규칙 (마케팅팀 공유 · 2026-10-22)

유입 성과의 GA 유입·문의 클릭은 매일 07시 자동으로 들어옵니다(10/22부터, 수동 입력 불필요).
아래 이름·UTM 이 바뀌면 CRM 대응표도 같이 바꿔야 하니 바꾸기 전에 알려주세요.

## 1. 이벤트
- 문의 클릭 = GA 주요 이벤트 `문의클릭` 개수 (이름을 바꾸면 수집이 끊김)
- `가입하기`, `전화클릭`, `form_submit` 은 지금 CRM 에서 쓰지 않음 — 유입 성과에 넣고 싶은 이벤트가 생기면 알려주세요

## 2. 광고 UTM → 광고그룹
네이버 광고: `utm_source=NAds`, `utm_campaign` 으로 광고그룹을 찾음

| utm_campaign | 캠페인 | 광고그룹 |
|---|---|---|
| N_smart | 260401_NA_스마트 안전장비 | N_스마트안전장비 |
| N_video | 260401_NA_동영상기록관리 | N_동영상기록관리 |
| N_ai | 260401_NA_동영상기록관리 | N_엣지 AI CCTV |
| N_smc | 260401_NA_중대재해예방 | N_중대재해예방 |

지금 대응표에 없어 "캠페인 미확인"으로 가는 것
- 네이버 `video` — `N_video` 로 통일할지, 대응표에 추가할지
- 구글 `gdn`, `G_smc` — 구글 대응표 없음, 광고그룹 이름을 주면 추가

새 캠페인을 만들면 utm_campaign 과 캠페인·광고그룹 이름을 알려주세요.

## 3. 블로그
- 자사 네이버 블로그 아이디: `caasworks` (이 밖의 네이버 블로그는 외주 › 팀부스터)
- 예외: `imbc21c` → 외주 › 인플루언서
- 자사 티스토리·네이버 글의 문의 배너: `utm_medium=contact_banner` (`utm_source=tistory` / `naver_blog`)
- `boosterlink.kr` → 외주 › 팀부스터
- 네이버 블로그 문의 클릭은 클릭 직전 글 주소의 블로그 아이디로 자사·외주를 가름

## 4. 그 밖
- 마케팅 사이트 범위: www.caas.works 의 `/`, `/contact`, `/en`, `/blog`, `/blog/…`, `/pages/…`, `/products/…`, `/en/…` (앱 app.caas.works 제외)
- 테스트 접속 제외: `utm_source=test`
- 오프라인 UTM: `utm_source=event_…` → 직접 연락 › 행사, `print_…` → 인쇄물, `press` → 보도자료, `newsletter` 또는 `utm_medium=email` → 이메일

## 5. 아직 안 되는 것
- 구글 광고 비용·노출: 구글 광고 API 사용 승인(Basic Access) 대기 중
- 2026년 1~9월 GA 유입·문의 클릭은 손으로 넣은 값 그대로 (다시 채울지 결정 대기)
