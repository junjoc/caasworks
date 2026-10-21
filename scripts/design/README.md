# 디자인 정의 문서 생성기

`docs/design/카스웍스_CRM_디자인정의.html` (아티팩트 https://claude.ai/artifact/E8aCRLYm9yHcBLrMNq445Q) 을 만든다.

- `gen_layout.py` — 공통·화면 유형 6가지 시안 → `docs/design/레이아웃정의_v1.html`
- `gen_campaign.py` — 메뉴별 시안(캠페인 관리)을 레이아웃 문서에 합침
- `assemble.py` — 기초 부품(`디자인정의_v1.html`) + 위 문서 + 결정 기록(`decisions.py`)·유입 분류·화면 머리(`taxonomy_sec.py`) → `카스웍스_CRM_디자인정의.html`
- `reorganize.py` — 마지막 단계. 1 기초 → 2 부품 → 3 화면 구성 → 4 메뉴별 화면 → 5 데이터 기준 → 6 하지 않는 것 → 7 결정 기록 순으로 다시 묶고 목차를 만든다

실행 순서: `assemble.py`(안에서 gen_layout → gen_campaign 실행) → `reorganize.py`

시안 데이터(sample.json · agg.json · detail.json · board.json · camps.json)는 CRM 실데이터에서 회사명·단계·일자·금액만 뽑은 것이라 저장소에 넣지 않는다. 다시 만들 때는 같은 형태로 추출해 스크립트 안의 `S` 경로에 둔다.
새 메뉴 시안은 gen_campaign.py 처럼 섹션을 만들어 assemble.py 의 `MENU` 목록과 '메뉴별 시안' 아래에 붙인다.


## 10/21 저녁 재구성 — 마지막 단계 rebuild.py
실행 순서: `assemble.py` → `reorganize.py` → **`rebuild.py`** (각각 `python3 -X utf8 -c "exec(compile(open('X.py',encoding='utf-8').read(),'X.py','exec'))"`).
rebuild.py 가 섹션을 뽑아 **개요 → 1. 전역(화면 문법 · 색 · 글자 · 부품 · 데이터 기준) → 2. 메뉴별 화면(CRM 메뉴 순서) → 3. 기록** 으로 다시 엮고,
지난 안(예전 화면 유형 6 시안 · 화면 뼈대 · 리드 상세 v1)은 뺀다. 견본(색·아이콘)은 작게, 화면 그림은 62%.
새 섹션을 넣으려면 reorganize.py 의 S[...] 에 만들고 rebuild.py 의 ORDER 에 (id, 목록 이름) 을 추가한다.
