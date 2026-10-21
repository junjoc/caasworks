# 대시보드 프리셋 5 시안 (실데이터) → dash_sec.html. reorganize.py 가 4. 메뉴별 화면에 붙인다
import json
G = {}
exec(compile(open('gen_layout.py', encoding='utf-8').read(), 'gen_layout.py', 'exec'), G)
esc, frame, man, won, chip, tone, av = G['esc'], G['frame'], G['man'], G['won'], G['chip'], G['tone'], G['av']
d = json.load(open('dash.json', encoding='utf-8'))
PRESETS = ['경영진', '마케팅', '세일즈', '경영지원', '하드웨어']
def tb(active): return '<div class="tb"><span class="tabs">' + ''.join(f'<span class="{"on" if p == active else ""}">{p}</span>' for p in PRESETS) + '</span><span class="sp"></span><span class="btn sm quiet">ⓘ 기준</span><span class="btn sm">위젯 선택</span></div>'
def kpis(items):
    cells = ''.join(f'<div><span>{esc(l)}</span><b class="{c}">{v}</b><em>{esc(s)}</em></div>' for l, v, s, c in items)
    return f'<div class="kpis" style="grid-template-columns:repeat({len(items)},1fr)">{cells}</div>'
def w(cls, title, sub, body, more=''):
    m = f'<span class="more2">{esc(more)} ›</span>' if more else ''
    return f'<div class="w {cls}"><div class="wt">{esc(title)} <span class="muted">{esc(sub)}</span>{m}</div>{body}</div>'
def lst(rows, cols):  # rows: list of tuples, cols: list of ('l'|'c'|'num')
    if not rows: return None
    return '<table class="ds mini"><tbody>' + ''.join('<tr>' + ''.join(f'<td class="{c}">{v}</td>' for v, c in zip(r, cols)) + '</tr>' for r in rows) + '</tbody></table>'
def empty(msg): return f'<div class="wempty">{esc(msg)}</div>'
rev = dict(d['rev']); rmx = max(rev.values())
trend = '<div class="chart h">' + ''.join(f'<div class="{"now" if m == 10 else ""}" title="{m}월 {won(v)}"><i style="height:{max(3, v / rmx * 100):.0f}%"></i><span>{m}</span></div>' for m, v in sorted(rev.items())) + '</div>'
st = d['stages']; order = ['신규리드', '컨텍', '제안', '미팅', '도입직전', '예정', '도입완료', '이탈']; smx = max(st.values())
TC = {'ok': 'var(--ok)', 'bad': 'var(--bad)', 'warn': 'var(--warn)', 'na': 'var(--na)', 'info': 'var(--info)'}
funnel = ''.join(f'<div class="hbar"><span>{k}</span><i style="width:{st.get(k, 0) / smx * 100:.0f}%;background:{TC[tone(k)]}"></i><b>{st.get(k, 0)}</b></div>' for k in order)
INF_COL = {'광고': 'var(--accent)', '외주 블로그': 'var(--warn)', '자사 채널': 'var(--ok)', '자사 블로그': 'var(--ok)', '검색': 'var(--info)', '생성형 AI': 'var(--info)', '소셜': 'var(--bad)', '언론·뉴스': 'var(--fg-2)', '외부 글': 'var(--fg-3)', '커뮤니티': 'var(--na)', '직접 연락': 'var(--fg)', '미분류': 'var(--line)'}
imx = max(1, max(v for _, v in d['inflow_month']))
inflow = ''.join(f'<div class="hbar w2"><span>{k}</span><i style="width:{v / imx * 100:.0f}%;background:{INF_COL[k]}"></i><b>{v or "—"}</b></div>' for k, v in d['inflow_month'])
top = lst([(f'<b>{esc(n)}</b>', won(v)) for n, v in d['top_cust']], ['l', 'num'])
unp = lst([(f'<b>{esc(n)}</b>', won(v)) for n, v in d['unpaid_top']], ['l', 'num'])
mine = lst([(f'<b>{esc(n)}</b>', chip(tone(s), s), dt[5:].replace('-', '.')) for n, s, dt, _ in d['my_leads']], ['l', 'c', 'c num'])
pre = lst([(f'<b>{esc(n)}</b>', chip(tone(s), s), av(u)) for n, s, u, _ in d['pre']], ['l', 'c', 'c'])
cpl = d['ad_cost'] / d['month_leads'] if d['month_leads'] else 0
rate = d['y_won'] / d['y_leads'] * 100
S = {}
S['경영진'] = (kpis([('10월 매출', man(rev[10]), f'9월 {man(rev[9])}', ''), ('미납', man(d['unpaid_sum']), f"{d['unpaid_n']}건 · {d['unpaid_cust']}곳", 'bad'), ('도입률', f'{rate:.1f}%', f"2026 · {d['y_won']}/{d['y_leads']}", ''), ('신규 리드', f"{d['month_leads']}", f"이번 달 · 전월 {d['prev_month_leads']}", ''), ('광고비', man(d['ad_cost']), f"이번 달 · 9월 {man(d['ad_cost_prev'])}", '')]),
  w('c8', '월별 매출', '2026 공급가 · 11·12월은 계약 기준', trend, '매출 현황') + w('c4', '단계 분포', '2026 유입', funnel, '파이프라인') +
  w('c4', '10월 매출 상위', f"{d['rev_customers']}곳 중", top, '매출 현황') + w('c4', '미납 상위', f"{d['unpaid_n']}건", unp, '미납 현황') + w('c4', '유입 분류', '이번 달 리드', inflow, '유입 성과'))
S['마케팅'] = (kpis([('광고비', man(d['ad_cost']), f"이번 달 · 9월 {man(d['ad_cost_prev'])}", ''), ('유입', f"{d['ga_month']:,}", 'GA 세션', ''), ('신규 리드', f"{d['month_leads']}", f"전월 {d['prev_month_leads']}", ''), ('리드당 비용', man(cpl), '광고비 ÷ 신규 리드', ''), ('이번 달 도입', f"{d['won_month']}", '도입일 기준', '')]),
  w('c8', '유입 분류', '이번 달 리드 · 11 분류 + 미분류', inflow, '유입 성과') + w('c4', '단계 분포', '2026 유입', funnel, '파이프라인'))
S['세일즈'] = (kpis([('10월 매출', man(rev[10]), f'9월 {man(rev[9])}', ''), ('미납', man(d['unpaid_sum']), f"{d['unpaid_n']}건 · {d['unpaid_cust']}곳", 'bad'), ('오늘 신규 리드', f"{d['today_leads']}", f"어제 {d['yday_leads']} · 이번 달 {d['month_leads']}", ''), ('내 진행 리드', f"{d['my_open']}", '전성환 · 이탈·도입 제외', ''), ('도입직전·예정', f"{d['pre_n']}", '전체', '')]),
  # 10/21 사용자: 세일즈도 매출을 본다. 위 = 월별 매출 · 미납, 아래 = 리드. 단계 분포·유입 분류는 뺌
  w('c8', '월별 매출', '2026 공급가 · 11·12월은 계약 기준', trend, '매출 현황') + w('c4', '미납 상위', f"{d['unpaid_n']}건", unp, '미납 현황') +
  w('c4', '내 담당 리드', f"{d['my_open']}건", mine or empty('담당 리드 없음'), '리스트') + w('c4', '도입직전·예정', f"{d['pre_n']}건", pre or empty('없음'), '보드뷰') +
  w('c4', '이번 주 액션', f"{d['week_n']}건", empty('다음 액션 날짜가 입력된 리드가 없습니다 — 리드에 다음 액션일을 적으면 여기 모입니다'), '오늘 할일'))
S['경영지원'] = (kpis([('미납', man(d['unpaid_sum']), f"{d['unpaid_n']}건 · {d['unpaid_cust']}곳", 'bad'), ('90일+ 연체', man(d['unpaid_90']), '납기 90일 지남', 'bad'), ('10월 청구', man(d['bill_sum']), f"{d['bill_n']}건 · 발행 {d['bill_issued']}", ''), ('10월 매출', man(rev[10]), f'9월 {man(rev[9])}', ''), ('이번 달 비용', '—', '매입·비용 기록 없음', '')]),
  w('c4', '미납 상위', f"{d['unpaid_n']}건", unp, '미납 현황') + w('c8', '월별 매출', '2026 공급가', trend, '매출 현황') +
  w('c4', '계약 만료 임박', '30일 안', empty('계약 기록이 아직 없습니다 (계약 관리 테이블 없음)'), '계약 관리') + w('c4', '10월 매출 상위', '', top, '매출 현황'))
S['하드웨어'] = (kpis([('10월 과금 현장', f"{d['rev_rows_oct']}", '10월 매출 행 기준', ''), ('카메라 반출', '—', '반출 기록 0건', ''), ('장비', '—', '장비 테이블 없음', ''), ('협력사 발주', '—', '발주 테이블 없음', '')]),
  w('c4', '오늘 할일', '', empty('운영 할일 기록 없음'), '오늘 할일') + w('c4', '카메라 반출', '', empty('반출 기록 0건 — 카메라 반출 메뉴에서 입력하면 표시'), '카메라 반출') + w('c4', '협력사 발주', '', empty('발주 기록 없음'), '협력사 발주'))
frames = ''
for p in PRESETS:
    k, grid = S[p]
    body = tb(p) + k + f'<div class="grid12">{grid}</div>'
    frames += f'<h3 class="ph3">{p}{" — 데이터가 거의 없어 보류 제안" if p == "하드웨어" else ""}</h3><div class="fwrap">' + frame('대시보드', '대시보드', (), body, h=860 if p != "하드웨어" else 520) + '</div>'
SEC = f'''<section id="m-dashboard"><h2>대시보드 — 프리셋 5 (시안, 2026-10-21 실데이터)</h2>
<p class="rule"><b>자유 드래그를 빼고 프리셋 + 위젯 켜고 끄기</b>. 툴바: 프리셋 탭(내 역할이 기본) │ ⓘ · 위젯 선택. <b>숫자줄</b>: 프리셋마다 최대 5칸(숫자 위젯은 카드 대신 여기로). <b>위젯 3종</b>: 목록 5줄(“… ›” 로 해당 메뉴) · 추이 막대 · 분포 막대, 12칸 격자에 8+4 또는 4×3. <b>불러오기</b>: 대시보드 API 1회(1분 보관). 위젯 21종 중 8개는 지금 "준비중" — 데이터가 있는 것(매출 상위·청구·활성 현장)은 실제 값으로 채우고, 없는 것(계약·장비·발주·반출)은 "기록 없음"으로.</p>
<div class="cmp"><div><h4>바뀌는 것</h4><ul><li>react-grid-layout 제거 · 위치·크기는 규칙</li><li>요청 19회 → 1회</li><li>색 칠한 KPI 카드 → 숫자줄</li></ul></div><div><h4>정해 주실 것</h4><ul><li>프리셋별 숫자줄 5칸 구성</li><li>위젯 구성·순서</li><li>하드웨어 프리셋: 운영 데이터가 쌓일 때까지 보류?</li></ul></div><div><h4>시안에서 보인 것</h4><ul><li>기한 초과·이번 주 액션 0 — 리드에 다음 액션일이 거의 없음</li><li>운영 테이블(계약·장비·발주) 없음, 반출·자산 0건</li></ul></div></div>
{frames}</section>'''
open('dash_sec.html', 'w', encoding='utf-8').write(SEC)
print('dash section', len(SEC))
