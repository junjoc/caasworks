# 캠페인 관리 비교 시안: A 채널별 그룹 표 / B 채널별 그룹 카드 (실데이터)
import json, collections
G = {}
exec(compile(open('gen_layout.py', encoding='utf-8').read(), 'gen_layout.py', 'exec'), G)
esc, frame, CSS, man, won = G['esc'], G['frame'], G['CSS'], G['man'], G['won']
camps = json.load(open('camps.json', encoding='utf-8'))
ORDER = ['네이버', '구글', '외주 블로그', '이벤트']
GCOL = {'네이버': 'var(--ok)', '구글': 'var(--info)', '외주 블로그': 'var(--warn)', '이벤트': 'var(--na)'}
STONE = {'진행중': 'ok', '준비': 'warn', '중단': 'na', '종료': 'na'}
groups = collections.OrderedDict((k, []) for k in ORDER)
for c in camps: groups.setdefault(c['channel'], []).append(c)
for k in groups: groups[k].sort(key=lambda c: (c['status'] != '진행중', -(c['perf'] or {}).get('cost', 0)))
def P(c, k): return (c['perf'] or {}).get(k, 0)
def chip(s): return f'<span class="st {STONE.get(s, "na")}">{esc(s)}</span>'
def period(c):
    if c['start_date']: return f"{c['start_date'][2:].replace('-', '.')} ~ {c['end_date'][2:].replace('-', '.') if c['end_date'] else ''}"
    return '—'
live = [c for c in camps if c['status'] == '진행중']
tot_b = sum(c['budget'] or 0 for c in live); tot_s = sum(P(c, 'cost') for c in camps)
head = f'''<div class="ph"><div><h1>캠페인 관리</h1><p class="kpi">캠페인 <b>{len(camps)}</b> · 진행 <b>{len(live)}</b> · 진행 중 월 예산 <b>{man(tot_b)}</b> · 누적 집행 <b>{man(tot_s)}</b></p></div><div class="acts"><span class="btn sm primary">+ 새 캠페인</span></div></div>
<div class="tb"><span class="tabs"><span class="on">전체 {len(camps)}</span><span>진행중 {len(live)}</span><span>준비 0</span><span>중단 {sum(c["status"]=="중단" for c in camps)}</span><span>종료 {sum(c["status"]=="종료" for c in camps)}</span></span><span class="inp s">캠페인 검색</span><span class="sp"></span><span class="chk">중단·종료 숨기기</span></div>'''

# A. 표
rows = []
for g, cs in groups.items():
    if not cs: continue
    gs = sum(P(c, 'cost') for c in cs); gb = sum(c['budget'] or 0 for c in cs if c['status'] == '진행중'); gi = sum(P(c, 'inq') for c in cs)
    rows.append(f'<tr class="gh" style="--g:{GCOL[g]}"><td colspan="9"><b>{esc(g)}</b> <span class="muted">{len(cs)}개 · 진행 {sum(c["status"]=="진행중" for c in cs)}</span><span class="gsum">월 예산 {man(gb) if gb else "—"} · 누적 집행 {man(gs)} · 문의 {gi}</span></td></tr>')
    for c in cs:
        off = ' class="off"' if c['status'] != '진행중' else ''
        cpi = man(P(c, 'cost') / P(c, 'inq')) if P(c, 'inq') else '—'
        rows.append(f'<tr{off} style="--g:{GCOL[g]}"><td class="id grp"><b>{esc(c["name"])}</b></td><td class="c">{chip(c["status"])}</td><td class="c muted">{period(c)}</td><td class="num">{won(c["budget"]) if c["budget"] else "—"}</td><td class="num"><b>{won(P(c, "cost")) if P(c, "cost") else "—"}</b></td><td class="num">{won(P(c, "clicks")) if P(c, "clicks") else "—"}</td><td class="num">{P(c, "inq") or "—"}</td><td class="num">{P(c, "ad") or "—"}</td><td class="num muted">{cpi}</td></tr>')
tableA = f'''{head}<div class="wrap" style="max-height:600px"><table class="ds fixed camp"><colgroup><col style="width:26%"><col style="width:9%"><col style="width:12%"><col style="width:11%"><col style="width:12%"><col style="width:8%"><col style="width:7%"><col style="width:7%"><col style="width:8%"></colgroup>
<thead><tr><th>캠페인</th><th>상태</th><th>기간</th><th>월 예산</th><th>누적 집행</th><th>클릭</th><th>문의</th><th>도입</th><th>문의당</th></tr></thead><tbody>{"".join(rows)}</tbody></table></div>'''

# B. 카드
blocks = []
for g, cs in groups.items():
    if not cs: continue
    gs = sum(P(c, 'cost') for c in cs); gi = sum(P(c, 'inq') for c in cs)
    cards = ''.join(f'''<div class="cc{' off' if c['status'] != '진행중' else ''}"><div class="c1"><b title="{esc(c['name'])}">{esc(c['name'])}</b>{chip(c['status'])}</div>
<div class="c2"><span>누적 집행</span><b>{won(P(c, 'cost')) if P(c, 'cost') else '—'}</b><em>월 예산 {man(c['budget']) if c['budget'] else '—'}</em></div>
<div class="c3">클릭 <b>{won(P(c, 'clicks')) if P(c, 'clicks') else '—'}</b> · 문의 <b>{P(c, 'inq') or '—'}</b> · 도입 <b>{P(c, 'ad') or '—'}</b></div></div>''' for c in cs)
    blocks.append(f'<div class="cg" style="--g:{GCOL[g]}"><div class="cgh"><b>{esc(g)}</b><span class="muted">{len(cs)}개 · 진행 {sum(c["status"]=="진행중" for c in cs)}</span><span class="gsum">누적 집행 {man(gs)} · 문의 {gi}</span></div><div class="cgrid">{cards}</div></div>')
cardB = head + '<div class="cwrap">' + ''.join(blocks) + '</div>'

FA = frame('캠페인 관리', '캠페인 관리', ('마케팅',), tableA, h=820)
FB = frame('캠페인 관리', '캠페인 관리', ('마케팅',), cardB, h=820)
# 사이드바 메뉴에 마케팅 하위가 없으면 '캠페인 관리' 활성 표시를 위해 MENU 에 이미 포함돼 있음
EXTRA = '''
.ds.fixed{table-layout:fixed}.camp tr.gh td{height:34px;background:var(--bg)!important;border-bottom:1px solid var(--line);box-shadow:inset 4px 0 0 var(--g)}.camp tr.gh b{color:var(--fg);font-weight:600;margin-right:6px}
.gsum{float:right;color:var(--fg-2);font-size:12px}.camp td.grp{box-shadow:inset 4px 0 0 var(--g);padding-left:16px}.camp tr.off td{color:var(--fg-3)}.camp tr.off td b{color:var(--fg-3);font-weight:500}.camp tr.off .st{opacity:.7}
.cwrap{overflow:hidden;max-height:600px}.cg{margin-bottom:14px}.cgh{display:flex;align-items:center;gap:8px;height:30px;padding-left:10px;box-shadow:inset 4px 0 0 var(--g);margin-bottom:8px}.cgh b{font-weight:600}.cgh .gsum{margin-left:auto}
.cgrid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px}.cc{border:1px solid var(--line);border-radius:6px;padding:10px 12px;font-size:12px;border-top:3px solid var(--g)}.cc.off{opacity:.55}
.cc .c1{display:flex;justify-content:space-between;align-items:center;gap:8px}.cc .c1 b{font-size:13px;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.cc .st{min-width:52px;height:20px;line-height:20px;font-size:11px}
.cc .c2{margin-top:6px;display:flex;align-items:baseline;gap:6px}.cc .c2 span{color:var(--fg-3)}.cc .c2 b{font-size:15px;font-weight:600;font-variant-numeric:tabular-nums}.cc .c2 em{margin-left:auto;font-style:normal;color:var(--fg-3)}
.cc .c3{margin-top:4px;color:var(--fg-3)}.cc .c3 b{color:var(--fg-2);font-weight:500}
.cmp{display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin:8px 0 18px}.cmp div{border:1px solid var(--line);border-radius:6px;padding:10px 12px}.cmp h4{margin:0 0 6px;font-size:12.5px;color:var(--fg-3);font-weight:500}.cmp ul{margin:0;padding-left:16px}
.warnbox{border:1px solid color-mix(in srgb,var(--warn) 50%,transparent);border-radius:6px;padding:10px 12px;margin:0 0 18px;font-size:12.5px}
'''
sec = f'''<section id="screens"><h2>7. 화면별 시안 — 캠페인 관리 (표형 vs 카드형)</h2>
<p class="rule">둘 다 <b>채널별 그룹</b>(왼쪽 4px 색 줄 + 그룹 요약)이고, 실제 캠페인 {len(camps)}개로 그렸다. 진행중이 그룹 위, 중단·종료는 아래에 흐리게. 행·카드를 누르면 오른쪽 드로어에 광고그룹·일별 추이(시안엔 생략).</p>
<div class="cmp"><div><h4>A. 표형 (엔조 추천)</h4><ul><li>21개 + 그룹 4줄이 한 화면</li><li>예산·집행·문의가 같은 열 → 위아래 비교</li><li>광고 성과·코호트와 같은 읽는 법</li></ul></div><div><h4>B. 카드형</h4><ul><li>한 줄 4장, 카드 높이 약 90</li><li>캠페인 하나씩 훑어보기 좋음, 덜 딱딱함</li><li>숫자 비교는 카드 사이를 눈으로 오가야 함</li></ul></div><div><h4>공통으로 고칠 것</h4><ul><li>지금 막대는 <b>누적 집행 ÷ 월 예산</b>이라 팀부스터가 900% 빨강 — 기준이 다름</li><li>시안은 <b>월 예산</b>과 <b>누적 집행</b>을 나눠 표시. 소진율 막대는 "이번 달 집행 ÷ 월 예산"으로 다시 계산</li></ul></div></div>
<h3 style="margin:14px 0 6px;font-size:14px">A. 표형 — 채널별 그룹 표</h3><div class="fwrap">{FA}</div>
<h3 style="margin:18px 0 6px;font-size:14px">B. 카드형 — 채널별 그룹 카드</h3><div class="fwrap">{FB}</div></section>
'''
P = '/Users/david/Desktop/클로드/004_CRM 웹개발/caasworks/docs/design/레이아웃정의_v1.html'
doc = open(P, encoding='utf-8').read()
doc = doc.replace('</style></head>', EXTRA + '</style></head>', 1)
doc = doc.replace('<section><h2>7. 다음</h2>', sec + '<section><h2>8. 다음</h2>', 1)
assert 'id="screens"' in doc
open(P, 'w', encoding='utf-8').write(doc)
print('merged', len(doc))
