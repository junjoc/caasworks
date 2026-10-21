# 디자인 정의 문서 생성기

`docs/design/카스웍스_CRM_디자인정의.html` (아티팩트 https://claude.ai/artifact/E8aCRLYm9yHcBLrMNq445Q) 을 만든다.

- `gen_layout.py` — 공통·화면 유형 6가지 시안 → `docs/design/레이아웃정의_v1.html`
- `gen_campaign.py` — 메뉴별 시안(캠페인 관리)을 레이아웃 문서에 합침
- `assemble.py` — 기초 부품(`디자인정의_v1.html`) + 위 문서 + 왼쪽 목차 → `카스웍스_CRM_디자인정의.html`

시안 데이터(sample.json · agg.json · detail.json · board.json · camps.json)는 CRM 실데이터에서 회사명·단계·일자·금액만 뽑은 것이라 저장소에 넣지 않는다. 다시 만들 때는 같은 형태로 추출해 스크립트 안의 `S` 경로에 둔다.
새 메뉴 시안은 gen_campaign.py 처럼 섹션을 만들어 assemble.py 의 `MENU` 목록과 '메뉴별 시안' 아래에 붙인다.
