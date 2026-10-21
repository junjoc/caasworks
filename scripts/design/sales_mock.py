# 세일즈 › 리스트 · 보드뷰 시안 (실데이터, 10/21 규칙 적용) → sales_sec.html
import json
from datetime import date
G = {}
exec(compile(open('gen_layout.py', encoding='utf-8').read(), 'gen_layout.py', 'exec'), G)
esc, frame, chip, tone, av = G['esc'], G['frame'], G['chip'], G['tone'], G['av']
s = json.load(open('sales.json', encoding='utf-8')); b = json.load(open('board.json', encoding='utf-8')); d = json.load(open('dash.json', encoding='utf-8'))
users = {u['id']: u['name'] for u in json.load(open('sample.json', encoding='utf-8'))['users']}
C = s['counts']; prog = sum(C.get(k, 0) for k in ['신규리드', '컨텍', '제안', '미팅', '도입직전'])
INF_COL = {'광고': 'var(--accent)', '외주 블로그': 'var(--warn)', '자사 채널': 'var(--ok)', '자사 블로그': 'var(--ok)', '검색': 'var(--info)', '생성형 AI': 'var(--info)', '소셜': 'var(--bad)', '언론·뉴스': 'var(--fg-2)', '외부 글': 'var(--fg-3)', '커뮤니티': 'var(--na)', '직접 연락': 'var(--fg)', '미분류': 'var(--line)'}
def inf(l): return f'<span class="idot" style="background:{INF_COL.get(l["group"], "var(--na)")}"></span>{esc(l["group"])} <span class="muted">› {esc(l["sub"])}</span>'
def kp(items): return '<div class="kpis" style="grid-template-columns:repeat(5,1fr)">' + ''.join(f'<div><span>{a}</span><b>{v}</b><em>{e}</em></div>' for a, v, e in items) + '</div>'
rate = d['leads_y'] if 'leads_y' in d else None
K = kp([('이번 달 신규', f"{d['month_leads']}", f"전월 {d['prev_month_leads']}"), ('진행', f'{prog}', '신규·컨텍·제안·미팅·도입직전'), ('예정', f"{C.get('예정', 0)}", ''), ('이번 달 도입', f"{d['won_month']}", '도입일 기준'), ('올해 도입률', f"{d['y_won'] / d['y_leads'] * 100:.1f}%", f"{d['y_won']}/{d['y_leads']}")])
TB = (f'<div class="tb"><span class="tabs"><span class="on">전체 {s["total"]:,}</span><span>진행 {prog}</span><span>예정 {C.get("예정", 0)}</span><span>도입완료 {C.get("도입완료", 0)}</span><span>이탈 {C.get("이탈", 0)}</span></span>'
      '<span class="sp"></span><span class="inp s">회사명·문의자·코드 검색</span><span class="sel">담당 전체</span><span class="sel">유입 분류 전체</span><span class="sel">2026년</span><span class="btn sm quiet">ⓘ</span><span class="btn sm primary">+ 새 리드</span></div>')
rows = ''
for i, l in enumerate(s['leads'][:14]):
    hi = '<span class="hidot" title="우선순위 높음"></span>' if l['priority'] == '높음' else ''
    nxt = f'{esc(l["next_action"])} <span class="muted">{l["next_action_date"][5:].replace("-", ".")}</span>' if l.get('next_action') else '<span class="muted">+ 다음 액션</span>'
    rows += (f'<tr class="{"act" if i == 0 else ""}"><td class="id">{hi}<b>{esc(l["company_name"])}</b></td><td class="c">{chip(tone(l["stage"]), l["stage"])}</td><td>{inf(l)}</td>'
             f'<td class="c">{av(users.get(l["assigned_to"], "")) if l["assigned_to"] else "<span class=muted>—</span>"}</td><td class="c">{l["inquiry_date"][5:].replace("-", ".")}</td>'
             f'<td class="c">{esc(l["site_category"] or "—")}</td><td>{esc(l["industry"] or "—")}</td><td class="c">{esc(l["conversion_probability"] or "—")}</td><td>{nxt}</td></tr>')
L0 = s['leads'][0]
drawer = f'''<div class="drawer w480"><div class="dh"><div><b>{esc(L0["company_name"])}</b> {chip(tone(L0["stage"]), L0["stage"])}<div class="meta">{inf(L0)} · 유입 {L0["inquiry_date"]} · 담당 {esc(users.get(L0["assigned_to"], "미배정"))}</div></div><span class="x">✕</span></div>
<div class="db"><div class="sec">요약 <span class="muted">칸을 누르면 바로 수정</span></div><div class="kv"><span>단계</span><b>{chip(tone(L0["stage"]), L0["stage"])}</b><span>도입가능성</span><b>{esc(L0["conversion_probability"] or "—")}</b><span>우선순위</span><b>{esc(L0["priority"] or "—")}</b><span>발주 · 업종</span><b>{esc(L0["site_category"] or "—")} · {esc(L0["industry"] or "—")}</b><span>주제</span><b>{" ".join("#" + t for t in (L0["topic_tags"] or []))}</b><span>다음 액션</span><b class="muted">— 날짜와 함께 입력 → 대시보드 "이번 주 액션"에 모임</b></div>
<div class="sec">문의자</div><div class="kv"><span>이름·직급</span><b>(리스트에선 숨김, 여기서만)</b><span>연락처</span><b>010-····-····</b></div>
<div class="sec">활동</div><ol class="tl"><li><span>{L0["inquiry_date"]}</span>문의 접수 · 대표전화</li></ol></div>
<div class="df"><span class="btn sm danger">이탈 처리</span><span class="sp"></span><span class="btn sm">견적서</span><span class="btn sm">상세 페이지</span></div></div>'''
list_body = TB + K + f'''<div class="wrap lfill"><table class="ds fixed"><colgroup><col style="width:21%"><col style="width:8%"><col style="width:16%"><col style="width:6%"><col style="width:7%"><col style="width:6%"><col style="width:11%"><col style="width:6%"><col style="width:19%"></colgroup>
<thead><tr><th>회사명</th><th>단계</th><th>유입</th><th>담당</th><th>유입일</th><th>발주</th><th>사업분류</th><th>가능성</th><th>다음 액션</th></tr></thead><tbody>{rows}</tbody></table>
<div class="pg"><span>1–50 / {s["total"]:,}</span><span class="btn sm quiet">‹</span><span class="btn sm quiet">›</span></div></div>{drawer}'''
FL = frame('리스트', '리스트', ('세일즈',), list_body, h=860)

# 보드
today = date(2026, 10, 21)
STAGES = ['신규리드', '컨텍', '제안', '미팅', '도입직전', '예정']
TC = {'ok': 'var(--ok)', 'bad': 'var(--bad)', 'warn': 'var(--warn)', 'na': 'var(--na)', 'info': 'var(--info)'}
def card(l):
    dd = (today - date.fromisoformat(l['inquiry_date'])).days if l['inquiry_date'] else 0
    nxt = f'<span class="due">{esc(l["next_action"])}</span>' if l.get('next_action') else '<span class="due muted">+ 다음 액션</span>'
    hi = '<span class="hidot"></span>' if l.get('priority') == '높음' else ''
    return f'<div class="card2"><div class="c1">{hi}<b>{esc(l["company_name"])}</b>{av(users.get(l["assigned_to"], "")) if l["assigned_to"] else ""}</div><div class="c2">{esc(l["inquiry_channel"] or "—")} · {l["inquiry_date"][5:].replace("-", ".")} · D+{dd}</div><div class="c3">{nxt}</div></div>'
cols = ''
for stg in STAGES:
    n = C.get(stg, 0); cards = b['cols'].get(stg) or []
    more = f'<div class="more">더 보기 {n - len(cards)}</div>' if n > len(cards) else ''
    cols += f'<div class="col2"><div class="colh2" style="border-top-color:{TC[tone(stg)]}"><b>{esc(stg)}</b><span>{n}</span></div><div class="cards2">{"".join(card(l) for l in cards[:6])}{more}</div></div>'
folded = ''.join(f'<div class="fold2" style="border-top-color:{TC[tone(stg)]}"><b>{stg}</b><span>{C.get(stg, 0)}</span><em>누르면 펼침</em></div>' for stg in ['도입완료', '이탈'])
board_body = (f'<div class="tb"><span class="tabs"><span>리스트</span><span class="on">보드</span></span><span class="sp"></span><span class="inp s">회사명 검색</span><span class="sel">담당 전체</span><span class="sel">2026년</span><span class="chk">내 리드만</span><span class="btn sm quiet">ⓘ</span><span class="btn sm primary">+ 새 리드</span></div>'
              + f'<div class="board2">{cols}<div class="folds2">{folded}</div></div>')
FB = frame('보드뷰', '보드뷰', ('세일즈',), board_body, h=780)
CSS = '''<style>.idot{display:inline-block;width:7px;height:7px;border-radius:50%;margin-right:5px;vertical-align:1px}.hidot{display:inline-block;width:6px;height:6px;border-radius:50%;background:var(--bad);margin-right:6px;vertical-align:2px}
.lfill{position:absolute;left:20px;right:20px;top:192px;bottom:20px;display:flex;flex-direction:column}.lfill table{flex:none}.lfill tr.act td{background:var(--accent-soft)!important}
.board2{position:absolute;left:20px;right:20px;top:124px;bottom:20px;display:flex;gap:12px;overflow:hidden;padding-right:104px}.col2{width:220px;flex:none;display:flex;flex-direction:column;background:var(--bg-subtle);border-radius:6px}.colh2{height:36px;display:flex;align-items:center;gap:8px;padding:0 10px;border-top:3px solid;border-radius:6px 6px 0 0;font-size:13px}.colh2 b{font-weight:600}.colh2 span{color:var(--fg-2);font-size:12px}
.cards2{flex:1;overflow:hidden;padding:0 8px 8px;display:flex;flex-direction:column;gap:8px}.card2{background:var(--bg);border:1px solid var(--line);border-radius:6px;padding:8px 10px;font-size:12px}.card2 .c1{display:flex;align-items:center;gap:6px}.card2 .c1 b{flex:1;font-size:13px;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.card2 .c2{color:var(--fg-3);margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.card2 .c3{margin-top:4px}.card2 .due{font-size:11.5px;color:var(--fg-2)}.card2 .due.muted{color:var(--fg-3)}
.folds2{position:absolute;right:0;top:0;bottom:0;display:flex;gap:12px;background:var(--bg);padding-left:12px}.fold2{width:40px;border-top:3px solid;background:var(--bg-subtle);border-radius:6px;display:flex;flex-direction:column;align-items:center;padding:10px 0;gap:8px}.fold2 b{writing-mode:vertical-rl;font-size:12.5px;font-weight:600}.fold2 span{font-size:12px;color:var(--fg-2)}.fold2 em{font-style:normal;font-size:10px;color:var(--fg-3);writing-mode:vertical-rl}</style>'''
SEC = f'''<section id="m-sales">{CSS}<h2>세일즈 — 리스트 · 보드뷰 (적용 2026-10-21 · 그림은 실데이터 시안)</h2>
<p class="rule">화면 머리 규칙 + 표 규칙 + 유입 분류 11 적용. 리드 상세는 <b>오른쪽 480 드로어</b>(리스트·보드 공유), 기존 상세 페이지는 "상세 페이지" 버튼으로.</p>
<div class="cmp"><div><h4>리스트 — 바뀌는 것</h4><ul><li>열 15 → 9: NO.·코드·문의자·연락처는 드로어로 (문의자 두 줄 때문에 높던 행 → 36)</li><li>유입채널 → <b>유입 분류 › 세부</b>(색 점)</li><li>우선순위 칸 대신 "높음"만 회사명 앞 빨간 점, 발주·가능성은 글자</li><li><b>50행 서버 페이지</b>(지금 1,290행을 한 번에) — 검색·필터·정렬도 서버</li><li>다음 액션 칸이 비면 "+ 다음 액션" → 눌러서 바로 입력</li></ul></div>
<div><h4>보드 — 바뀌는 것</h4><ul><li>열 색 바탕 → 연회색 열 + 머리 3px 단계 색</li><li>카드 배지 3~4개 → 3줄(회사·담당 / 채널·유입일·D+n / 다음 액션)</li><li>도입완료 229 · 이탈 711 은 오른쪽 접힌 열</li><li>열당 30장 + 더 보기, 드래그 애니메이션(dnd-kit), 보드 API 1회</li></ul></div>
<div><h4>정한 것 (10/21 적용)</h4><ul><li>행·카드 클릭 = 480 드로어 (리스트·보드 공유, 단계·가능성·우선순위·담당 바로 수정, 다음 액션+날짜)</li><li>리스트 50행 서버 페이지 — API 0.2~0.4초</li><li>열 9개 + 맨 앞 선택 칸(일괄 단계·담당·삭제 유지), <b>유입일이 첫 열</b>(회사명 앞)</li><li>고르면 화면 아래 <b>선택 바</b>(표가 밀리지 않게)</li><li>보드 선택은 Shift+클릭, 열 순서 = 단계 순서(예정은 컨텍 다음), 도입완료 펼침 · 이탈만 접힘</li><li>연도 기본 = 전체 기간, "추가 진행만" 유지, 우선순위 필터 → 빨간 점(높음·긴급)</li><li>드로어 "견적서" 버튼과 견적 3메뉴는 견적서→매출 연동 때</li></ul></div></div>
<h3 class="ph3">리스트</h3><div class="fwrap">{FL}</div><h3 class="ph3">보드뷰</h3><div class="fwrap">{FB}</div></section>'''
open('sales_sec.html', 'w', encoding='utf-8').write(SEC)
print('sales section', len(SEC))
