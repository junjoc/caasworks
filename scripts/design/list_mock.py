# 목록 유형 v2 — 고객 목록 시안 (실데이터, 화면 문법 v2) → list_sec.html
import json
G = {}
exec(compile(open('gen_layout.py', encoding='utf-8').read(), 'gen_layout.py', 'exec'), G)
esc, frame, chip, man, won = G['esc'], G['frame'], G['chip'], G['man'], G['won']
C = json.load(open('customers_mock.json', encoding='utf-8'))
st = C['st']; rows = C['rows'][:14]
def stc(s): return chip('ok', '활성') if s == 'active' else chip('na', '이탈') if s == 'churned' else chip('na', '—')
def n(v, bad=False): return f'<span class="{"bad" if bad and v else ""}">{won(v)}</span>' if v else '<span class="muted">—</span>'
TB = (f'<div class="tb"><span class="tabs"><span class="on">전체 {C["total"]}</span><span>활성 {st.get("active", 0)}</span><span>이탈 {st.get("churned", 0)}</span><span>미납 {C["unpCust"]}</span></span>'
      '<span class="sp"></span><span class="inp s">회사명·코드·담당자 검색</span><span class="sel">업종 전체</span><span class="sel">영업 담당 전체</span><span class="btn sm quiet">ⓘ</span><span class="btn sm primary">+ 고객 등록</span></div>')
K = ('<div class="kpis" style="grid-template-columns:repeat(5,1fr)">'
     f'<div><span>전체 고객</span><b>{C["total"]}</b><em>활성 {st.get("active", 0)} · 이탈 {st.get("churned", 0)}</em></div>'
     f'<div><span>10월 과금</span><b>{C["billed10"]}곳</b><em>매출이 잡힌 고객</em></div>'
     f'<div><span>10월 매출</span><b>{man(C["r10sum"])}</b><em>공급가</em></div>'
     f'<div><span>미납</span><b class="bad">{C["unpCust"]}곳</b><em>{man(C["unpSum"])}</em></div>'
     '<div><span>이번 달 신규</span><b>—</b><em>등록일 기준</em></div></div>')
tot = {k: sum(r[k] for r in C['rows']) for k in ('r10', 'ry', 'unp')}
trs = ''.join(f'<tr class="{"act" if i == 0 else ""}"><td class="c muted">{esc(r["code"] or "—")}</td><td><b>{esc(r["name"])}</b></td><td>{esc(r["type"] or "—")}</td><td class="c">{stc(r["status"])}</td>'
              f'<td class="c">{esc(r["owner"] or "—")}</td><td class="c">{(r["start"] or "—")[:7].replace("-", ".")}</td><td class="num g">{n(r["r10"])}</td><td class="num">{n(r["ry"])}</td><td class="num">{n(r["unp"], True)}</td></tr>' for i, r in enumerate(rows))
TABLE = f'''<div class="wrap lfill"><table class="ds fixed"><colgroup><col style="width:10%"><col style="width:22%"><col style="width:12%"><col style="width:8%"><col style="width:8%"><col style="width:8%"><col style="width:11%"><col style="width:11%"><col style="width:10%"></colgroup>
<thead><tr><th>코드</th><th>회사명</th><th>업종</th><th>상태</th><th>영업 담당</th><th>과금 시작</th><th class="g">10월 매출</th><th>올해 매출</th><th>미납</th></tr></thead>
<tbody><tr class="sum top"><td class="c">합계</td><td class="muted">상위 16곳 (시안)</td><td></td><td></td><td></td><td></td><td class="num g">{won(tot["r10"])}</td><td class="num">{won(tot["ry"])}</td><td class="num bad">{won(tot["unp"])}</td></tr>{trs}</tbody></table>
<div class="pg"><span>1–50 / {C["total"]}</span><span class="btn sm quiet">‹</span><span class="btn sm quiet">›</span></div></div>'''
r0 = rows[0]
DR = f'''<div class="drawer w480"><div class="dh"><div><b>{esc(r0["name"])}</b> {stc(r0["status"])}<div class="meta">{esc(r0["type"] or "")} · 코드 {esc(r0["code"] or "—")} · 과금 {(r0["start"] or "—")[:7]}부터</div></div><span class="x">✕</span></div>
<div class="db"><div class="pls2"><span class="pl"><em>상태</em>활성 ▾</span><span class="pl"><em>영업</em>{esc(r0["owner"] or "미배정")} ▾</span><span class="pl"><em>업종</em>{esc(r0["type"] or "—")} ▾</span></div>
<div class="kv" style="margin-top:12px"><span>10월 매출</span><b>{won(r0["r10"])}</b><span>올해 매출</span><b>{won(r0["ry"])}</b><span>미납</span><b class="{"bad" if r0["unp"] else ""}">{won(r0["unp"]) if r0["unp"] else "없음"}</b></div>
<div class="sec">담당자</div><div class="kv"><span>이름</span><b>김○○ · 010-····-····</b></div>
<div class="sec">연결</div><div class="kv"><span>리드</span><b class="lk">2건 →</b><span>현장</span><b class="lk">프로젝트 n →</b><span>청구</span><b class="lk">청구서 →</b></div></div>
<div class="df"><span class="sp"></span><span class="btn sm">고객 상세</span></div></div>'''
BODY = TB + K + TABLE + DR
F = frame('고객 목록', '전체 고객', ('고객관리',), BODY, dims=[('left:206px;top:60px', '툴바: 탭(건수) │ 검색·필터 · ⓘ · 주 동작'), ('left:206px;top:116px', '숫자줄 5칸'), ('left:206px;top:192px', '표: 합계 맨 위 · 숫자 오른쪽 · 행 클릭 = 480 드로어 (수정·삭제 아이콘 열 없앰)')], h=820)
CSS = '<style>.pls2{display:flex;flex-wrap:wrap;gap:6px}.pl{display:inline-flex;align-items:center;gap:5px;height:26px;padding:0 9px;border:1px solid var(--line);border-radius:13px;font-size:12px}.pl em{font-style:normal;color:var(--fg-3)}.lk{color:var(--accent)}.bad{color:var(--bad)}</style>'
ORDER = '''<table class="ug"><thead><tr><th>순서</th><th>유형</th><th>화면</th><th>바뀌는 것 (공통)</th></tr></thead><tbody>
<tr><td class="c">1</td><td>목록</td><td>고객 목록 · 과금 고객 · 계약 관리 · VoC · 견적서 · 현장 · 장비 반출 · 카메라 반출 · 협력사 발주 · 영상 기록 · 재고 · 자산 · 납부 · 매입</td><td>툴바(탭 건수) → 숫자줄 → 공용 표(합계 맨 위) → 행 클릭 = 480 드로어. 수정·삭제 아이콘 열 → 드로어·⋯ 로. 색 숫자 카드 → 숫자줄</td></tr>
<tr><td class="c">2</td><td>상세</td><td>고객사 상세(2,035줄) · 계약 · 현장 · 견적서</td><td>리드 상세 v2 와 같은 틀: 머리 → (단계 줄) → 속성 줄 → 2:1 (내용 / 카드)</td></tr>
<tr><td class="c">3</td><td>집계</td><td>청구/계산서 · 미납 · 손익 · 마케팅 분석 · 리포트 · 히스토리</td><td>툴바 → 숫자줄 → 표(합계 맨 위) · 그래프는 카드</td></tr>
<tr><td class="c">4</td><td>대시보드·설정</td><td>대시보드 옛 위젯 정리 · 설정 6화면 · 업무</td><td>카드 = 공용 Card, 설정은 목록 유형</td></tr>
<tr><td class="c">+</td><td>헤더 이름</td><td>사이드바 메뉴 이름 = 헤더 이름 (예: "전체 고객" ↔ 헤더 "고객 목록")</td><td>한 이름으로</td></tr></tbody></table>'''
SEC = f'''<section id="m-list-v2">{CSS}<h2>목록 유형 v2 — 고객 목록 (적용 2026-10-21 · 그림은 실데이터 시안, 담당자 가림)</h2>
<p class="rule">화면 문법 v2 의 "목록" 그대로. 세일즈 리스트와 같은 부품(툴바·숫자줄·공용 표·드로어·선택 바) — 한 번 정하면 아래 14화면에 같은 틀로.</p>
<div class="fwrap">{F}</div><h3 class="ph3">교체 순서 (제안)</h3>{ORDER}
<div class="cmp"><div><h4>정한 것 (10/21 적용)</h4><ul><li>열 9개 그대로, 기본 정렬 = 올해 매출 큰 순(코드·과금 시작·매출·미납 머리 눌러 정렬)</li><li>행 클릭 = 480 드로어: 상태·영업 담당·업종 칩, 매출·미납, 올해 월별 매출, 미납 청구, 연결 리드, 코드 바로 수정, 삭제</li><li>탭에 "미납" 추가, 미납 금액 진한 빨강</li><li>메뉴 이름 = <b>고객 목록</b> (사이드바·헤더 같게)</li><li>교체 순서 1 → 4 진행 중</li></ul></div></div></section>'''
open('list_sec.html', 'w', encoding='utf-8').write(SEC)
print('list', len(SEC))
