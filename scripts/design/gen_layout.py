# 레이아웃 정의 v1 생성기 — 실제 데이터(sample.json, agg.json, detail.json)로 시안 5장
import json, collections, html
S = '/private/tmp/claude-502/-Users-david-Desktop-----004-CRM----/cd1f22b0-8331-49d3-90ec-21a18ff525f3/scratchpad'
s = json.load(open(S + '/sample.json')); agg = json.load(open(S + '/agg.json')); det = json.load(open(S + '/detail.json'))
users = {u['id']: u['name'] for u in s['users']}
def esc(x): return html.escape(str(x))
def man(v):
    v = float(v or 0)
    if abs(v) >= 1e8: return f"{v/1e8:.1f}억".replace('.0억', '억')
    return f"{round(v/1e4):,}만"
def won(v): return f"{int(v):,}"
def tone(stage): return {'도입완료': 'ok', '이탈': 'na', '예정': 'warn', '신규리드': 'bad'}.get(stage, 'info')
def av(name): return f'<span class="av" title="{esc(name)}">{esc(name[:1]) if name else "—"}</span>'
TONE_COLOR = {'na': '#C4C4C4', 'info': '#579BFC', 'warn': '#FDAB3D', 'ok': '#00C875', 'bad': '#E2445C'}
def chip(t, s): return f'<span class="st {t}">{esc(s)}</span>'
def scol(stage): return TONE_COLOR[tone(stage)]

# ───────── 공통 틀 ─────────
MENU = [('대시보드', None), ('마케팅', ['캠페인 관리', '유입 성과', '콘텐츠 성과']), ('세일즈', ['보드뷰', '리스트', '견적서', '견적 모의계산', '단가표']), ('고객관리', ['매출 현황', '과금 고객', '전체 고객', '계약 관리']), ('재무관리', None), ('운영관리', None), ('분석', ['개요', '마케팅 분석', '유입 코호트', '채널별 생애 가치']), ('VoC/CS', None), ('업무', None), ('피드백', None), ('설정', None)]
def sidebar(active, open_groups):
    out = ['<aside class="sb"><div class="logo"><i></i><b>CaasWorks</b><span>CRM</span></div><nav>']
    for label, kids in MENU:
        if kids and label in open_groups:
            out.append(f'<div class="g open">{esc(label)}<em>▾</em></div>')
            for k in kids: out.append(f'<a class="{"act" if k == active else ""}">{esc(k)}</a>')
        else:
            cls = 'act' if (label == active and not kids) else ''
            out.append(f'<div class="g {cls}">{esc(label)}{"<em>▸</em>" if kids or label not in ("대시보드",) else ""}</div>')
    out.append('</nav><div class="me">' + av('전성환') + '<div><b>전성환</b><span>세일즈</span></div></div></aside>')
    return ''.join(out)
def header(title):
    return f'<header class="hd"><b>{esc(title)}</b><div class="r"><span class="srch">회사·현장·메뉴 검색 <kbd>⌘K</kbd></span><span class="fs">A−  14  A+</span>{av("전성환")}</div></header>'
def frame(title, active, open_groups, body, dims=(), h=760):
    d = ''.join(f'<span class="dim" style="{st}">{esc(t)}</span>' for st, t in dims)
    return f'<p class="tog"><label><input type="checkbox" onchange="this.closest(\'.fwrap\').querySelector(\'.frame\').classList.toggle(\'showdim\', this.checked)"> 치수 라벨 보기</label></p><div class="frame" style="height:{h}px">{sidebar(active, open_groups)}<div class="main">{header(title)}<div class="ct">{body}</div></div>{d}</div>'

# ───────── 1. 목록: 파이프라인 리스트 + 드로어 ─────────
leads = s['leads']
st = s['dash']['stages']; total26 = sum(st.values())
rows = []
for l in leads:
    tags = ' '.join(f'<span class="tag">#{esc(t)}</span>' for t in (l['topic_tags'] or [])[:3])
    rows.append(f'<tr><td class="id"><b>{esc(l["company_name"])}</b></td><td class="c">{chip(tone(l["stage"]), l["stage"])}</td><td>{esc(l["inquiry_channel"] or "—")}<span class="muted"> / {esc(l["inquiry_source"] or "—")}</span></td><td class="c">{esc(l["site_category"] or "—")}</td><td class="c">{av(users.get(l["assigned_to"], "") if l["assigned_to"] else "")}</td><td class="c num">{esc(l["inquiry_date"])}</td><td class="c">{esc(l["priority"] or "—")}</td><td>{tags}</td><td class="muted">{esc(l["next_action"] or "—")}</td></tr>')
L = leads[0]
list_body = f'''
<div class="ph"><div><h1>리스트</h1><p class="kpi">리드 <b>1,214</b> · 이번 달 <b>{s['dash']['leadsMonth']}</b> (전월 {s['dash']['leadsPrevMonth']}) · 2026 도입 <b>{st['도입완료']}</b> · 도입률 <b>{st['도입완료']/total26*100:.1f}%</b></p></div><div class="acts"><span class="btn sm">내보내기</span><span class="btn sm primary">+ 리드 등록</span></div></div>
<div class="tb"><span class="tabs"><span class="on">전체 1,214</span><span>진행 {st['컨텍']+st['제안']+st['미팅']+st['도입직전']}</span><span>예정 {st['예정']}</span><span>도입 {st['도입완료']}</span><span>이탈 {st['이탈']}</span></span><span class="inp s">회사명·문의 검색</span><span class="sel">채널 전체</span><span class="sel">담당 전체</span><span class="sel">2026년</span><span class="sp"></span><span class="chk">기존 고객 제외</span></div>
<div class="wrap fill"><table class="ds"><thead><tr><th class="id">회사명</th><th>단계</th><th class="l">유입 채널 / 경로</th><th>발주</th><th>담당</th><th>유입일</th><th>우선</th><th class="l">주제</th><th class="l">다음 액션</th></tr></thead><tbody>{''.join(rows)}</tbody></table>
<div class="pg"><span>1–50 / 1,214</span><span class="btn sm quiet">‹</span><span class="btn sm quiet">›</span></div></div>
<div class="drawer w480"><div class="dh"><div><b>{esc(L['company_name'])}</b> {chip(tone(L['stage']), L['stage'])}<div class="meta">{esc(L['inquiry_channel'])} / {esc(L['inquiry_source'])} · 유입 {esc(L['inquiry_date'])} · 담당 {esc(users.get(L['assigned_to'], '—'))}</div></div><span class="x">✕</span></div>
<div class="db"><div class="sec">요약</div><div class="kv"><span>단계</span><b>{chip(tone(L['stage']), L['stage'])}</b><span>도입가능성</span><b>{esc(L['conversion_probability'])}</b><span>발주유형</span><b>{esc(L['site_category'] or '—')}</b><span>사업분류</span><b>{esc(L['industry'] or '—')}</b><span>주제</span><b>{' '.join('#'+t for t in L['topic_tags'] or [])}</b><span>다음 액션</span><b class="muted">— 칸을 눌러 입력</b></div>
<div class="sec">활동 <span class="muted">3</span></div><ol class="tl"><li><span>2026-10-20</span>문의 접수 · 대표전화</li><li><span>2026-10-20</span>담당 배정 · 전성환</li><li><span>2026-10-21</span>제안서 발송</li></ol>
<div class="sec">메모</div><div class="inp ta">메모를 입력하면 바로 저장됩니다</div></div>
<div class="df"><span class="btn sm danger">이탈 처리</span><span class="sp"></span><span class="btn sm">상세 페이지</span></div></div>'''
F1 = frame('파이프라인', '리스트', ('세일즈',), list_body, dims=[('left:92px;top:8px', '사이드바 200'), ('left:640px;top:4px', '헤더 48'), ('left:206px;top:60px', '좌우 20 · 위 16'), ('left:206px;top:118px', '제목줄 56 → 툴바 40 → 표'), ('left:880px;top:120px', '드로어 480')])

# ───────── 2. 집계: 유입 코호트 + 채널 보조표 ─────────
co = {c['month']: c for c in agg['cohort']}
crow = []
for m in range(1, 13):
    k = f'2026-{m:02d}'; c = co.get(k)
    if c:
        rate = c['won'] / c['n'] * 100 if c['n'] else 0
        top = ' · '.join(f'{n} {v}' for n, v in c['top'][:1])
        crow.append(f'<tr><td class="id"><b>{m}월</b></td><td class="c">{c["n"]}</td><td class="c">{c["won"]}</td><td class="c"><span class="bar"><i style="width:{min(100, rate*3):.0f}%"></i></span>{rate:.0f}%</td><td class="c">{c["median"] if c["median"] is not None else "—"}일</td><td class="num"><b>{man(c["rev"])}</b></td><td class="num">{man(c["rev"]/c["won"]) if c["won"] else "—"}</td></tr>')
    else:
        crow.append(f'<tr class="empty"><td class="id">{m}월</td><td class="c">—</td><td class="c">—</td><td class="c">—</td><td class="c">—</td><td class="num">—</td><td class="num">—</td></tr>')
tn = sum(c['n'] for c in agg['cohort']); tw = sum(c['won'] for c in agg['cohort']); tr = sum(c['rev'] for c in agg['cohort'])
ch_rows = ''.join(f'<tr><td class="id"><b>{esc(n)}</b></td><td class="c">{v["n"]}</td><td class="c">{v["won"]}</td><td class="num"><b>{man(v["rev"])}</b></td></tr>' for n, v in agg['channels'][:7])
agg_body = f'''
<div class="ph"><div><h1>유입 코호트</h1><p class="kpi">2026 유입 <b>{tn}</b>곳 · 도입 <b>{tw}</b> ({tw/tn*100:.1f}%) · 누적 매출 <b>{man(tr)}</b> · 도입당 <b>{man(tr/tw)}</b></p></div><div class="acts"><span class="btn sm quiet">ⓘ 기준</span><span class="btn sm">CSV</span></div></div>
<div class="tb"><span class="tabs"><span class="on">월별</span><span>분기별</span></span><span class="sel">2026년</span><span class="sel">채널 전체</span><span class="sp"></span><span class="chk">기존 고객 포함</span></div>
<div class="two"><div class="wrap"><table class="ds click"><thead><tr><th class="id">유입월</th><th>유입</th><th>도입</th><th>도입률</th><th>소요일 중앙값</th><th>누적 매출</th><th>도입당</th></tr></thead><tbody>{''.join(crow)}<tr class="sum"><td class="id">합계</td><td class="c">{tn}</td><td class="c">{tw}</td><td class="c">{tw/tn*100:.0f}%</td><td class="c"></td><td class="num">{man(tr)}</td><td class="num">{man(tr/tw)}</td></tr></tbody></table></div>
<div><div class="sec">채널별 <span class="muted">2026 유입 · 매출순</span></div><div class="wrap"><table class="ds narrow"><thead><tr><th class="id">채널</th><th>유입</th><th>도입</th><th>누적 매출</th></tr></thead><tbody>{ch_rows}</tbody></table></div><p class="note">행을 누르면 오른쪽 60vw 드로어에 그 달의 회사 목록. 월별은 올해 12줄이 기본 높이(빈 달은 — 로 남김).</p></div></div>'''
F2 = frame('분석 › 고객 생애주기', '유입 코호트', ('분석',), agg_body, dims=[('left:206px;top:118px', '요약 한 줄은 제목 옆, 타일 없음'), ('left:206px;top:170px', '주 표 2 : 보조 1 (보조 최소 320)'), ('left:206px;top:640px', '12줄 = 34 + 12×36 + 합계 36 = 502')], h=760)

# ───────── 3. 상세: 계룡건설산업 ─────────
L0 = det['leads'][0]
mon = collections.defaultdict(float); sv = collections.Counter()
for r in det['revs']: mon[f"{r['year']}-{r['month']:02d}"] += float(r['amount']); sv[(r['project'] or {}).get('service_type') or '기타'] += float(r['amount'])
mons = sorted(mon.items()); mx = max(v for _, v in mons); tot = sum(v for _, v in mons)
bars = ''.join(f'<div title="{k} {won(v)}"><i style="height:{max(3, v/mx*100):.0f}%"></i><span>{k[5:]}월</span></div>' for k, v in mons)
svp = collections.Counter(); svc = collections.Counter()
for r in det['revs']:
    k = (r['project'] or {}).get('service_type') or '기타'
    (svp if r['year'] < 2026 else svc)[k] += float(r['amount'])
tp, tc = sum(svp.values()), sum(svc.values())
def pc(a, b): return f'{a/b*100:.0f}%' if b and a else ''
def wn(a): return won(a) if a else '—'
svrows = ''.join(f'<tr><td class="c"><b>{esc(k)}</b></td><td class="num g">{wn(svp[k])}</td><td class="num muted">{pc(svp[k], tp)}</td><td class="num g">{wn(svc[k])}</td><td class="num muted">{pc(svc[k], tc)}</td><td class="num g"><b>{won(v)}</b></td><td class="num muted">{pc(v, tot)}</td></tr>' for k, v in sv.most_common()) + f'<tr class="sum"><td class="c">합계</td><td class="num g">{wn(tp)}</td><td></td><td class="num g">{wn(tc)}</td><td></td><td class="num g">{won(tot)}</td><td></td></tr>'
inv = det['invs']; unp = [i for i in inv if i['tax_invoice_issued_at'] and not i['paid_at'] and i['status'] != 'cancelled']
invrows = ''.join(f'<tr title="발행 {i["tax_invoice_issued_at"][:10]}"><td class="id"><b>{i["year"]}.{i["month"]:02d}</b></td><td class="num">{won(i["total"])}</td><td class="c">{chip("ok", "수납 " + i["paid_at"][5:10].replace("-", ".")) if i["paid_at"] else chip("warn", "미납")}</td></tr>' for i in inv)
days = 168
tl = [('2025-11-12', 'lead', '첫 문의 · 자사채널 / 검색채널', '#LH'), ('2026-04-29', 'won', '도입완료 · 168일', ''), ('2026-04', 'rev', f'첫 매출 {won(mons[0][1])}원', '편집비용·타임랩스 외'), ('2026-04-30', 'inv', '세금계산서 4월 72,259,000원', '수납 2026-05-08'), ('2026-05-29', 'inv', '세금계산서 5월 5,449,400원', '수납 2026-07-01'), ('2026-06-30', 'inv', '세금계산서 6월 5,449,400원', '미납'), ('2026-07-31', 'inv', '세금계산서 7월 5,449,400원', '미납'), ('2026-08-31', 'inv', '세금계산서 8월', '미납'), ('2026-09-30', 'inv', '세금계산서 9월', '미납'), ('2026-10-16', 'lead', '추가 문의 · 검색유입 / 네이버', '#동영상기록관리 #AI CCTV')]
tlh = ''.join(f'<li class="{k}"><span>{d}</span><b>{esc(t)}</b>{f"<em>{esc(sub)}</em>" if sub else ""}</li>' for d, k, t, sub in tl)
detail_body = f'''
<div class="ph"><div><h1>계룡건설산업 {chip('ok', '도입완료')}</h1><p class="kpi">종합건설사 · 자사채널 / 검색채널 · 유입 2025-11-12 → 도입 2026-04-29 (<b>{days}일</b>) · 담당 최한별 · 과금 월정액</p></div><div class="acts"><span class="btn sm">리드 2</span><span class="btn sm">청구서</span><span class="btn sm primary">수정</span></div></div>
<div class="kpis"><div><span>누적 매출</span><b>{man(tot)}</b><em>{len(mons)}개월</em></div><div><span>월 매출</span><b>{man(mons[-1][1])}</b><em>최근 달</em></div><div><span>서비스</span><b>{len(sv)}</b><em>종</em></div><div><span>미납</span><b class="bad">{len(unp)}건 {man(sum(float(i["total"]) for i in unp))}</b><em>6~9월</em></div><div><span>리드</span><b>2</b><em>추가 문의 2026-10-16</em></div></div>
<div class="two"><div>
<div class="sec">월별 매출 <span class="muted">공급가</span></div><div class="chart">{bars}</div>
<div class="sec">서비스별 매출 <span class="muted">이전 = 2025년까지 · 올해 = 2026년 · 누적</span></div><div class="wrap"><table class="ds fixed"><colgroup><col style="width:22%"><col style="width:17%"><col style="width:9%"><col style="width:17%"><col style="width:9%"><col style="width:17%"><col style="width:9%"></colgroup><thead><tr><th>서비스</th><th class="g">이전</th><th>비중</th><th class="g">올해</th><th>비중</th><th class="g">누적</th><th>비중</th></tr></thead><tbody>{svrows}</tbody></table></div>
</div><div>
<div class="sec">청구 <span class="muted">{len(inv)}건</span></div><div class="wrap"><table class="ds narrow"><thead><tr><th class="id">월</th><th>청구액</th><th>수납</th></tr></thead><tbody>{invrows}</tbody></table></div>
<div class="sec">타임라인 <span class="muted">{len(tl)}</span></div><ol class="tl big">{tlh}</ol>
</div></div>'''
F3 = frame('고객사', '전체 고객', ('고객관리',), detail_body, dims=[('left:206px;top:60px', '이름 18 + 상태칩 · 메타 한 줄 · 오른쪽 동작 3개 이하'), ('left:206px;top:126px', '숫자 줄 64: 5개 이하, 타일 없이 구분선'), ('left:206px;top:196px', '본문 2 : 1 (1,024 이하 한 열)')], h=900)

# ───────── 4. 입력: 리드 등록 드로어 ─────────
def fld(label, val='', req=False, ph=False, w=''):
    return f'<div class="field {w}"><label>{esc(label)}{"<b>*</b>" if req else ""}</label><span class="inp {"ph" if ph else ""}">{esc(val)}</span></div>'
form_body = f'''
<div class="ph"><div><h1>리스트</h1><p class="kpi">리드 <b>1,214</b> · 이번 달 <b>33</b> · 2026 도입 <b>104</b></p></div><div class="acts"><span class="btn sm primary">+ 리드 등록</span></div></div>
<div class="tb"><span class="tabs"><span class="on">전체</span><span>진행</span><span>예정</span><span>도입</span></span><span class="inp s">회사명·문의 검색</span></div>
<div class="wrap fill dimmed"><table class="ds"><thead><tr><th class="id">회사명</th><th>단계</th><th class="l">유입 채널 / 경로</th><th>담당</th><th>유입일</th></tr></thead><tbody>{''.join(f'<tr><td class="id"><b>{esc(l["company_name"])}</b></td><td class="c">{chip(tone(l["stage"]), l["stage"])}</td><td>{esc(l["inquiry_channel"] or "—")}</td><td class="c">{av(users.get(l["assigned_to"], "") if l["assigned_to"] else "")}</td><td class="c num">{l["inquiry_date"]}</td></tr>' for l in leads[:12])}</tbody></table></div>
<div class="drawer w480 form"><div class="dh"><div><b>리드 등록</b><div class="meta">저장하면 목록 맨 위에 추가되고 담당자에게 Slack 알림</div></div><span class="x">✕</span></div>
<div class="db"><div class="sec">회사</div><div class="fgrid">{fld('회사명', '한일종합건설(주)', True, w='full')}{fld('고객사 코드', '자동 — 저장 시 2610211030', ph=True)}{fld('사업분류', '종합건설사')}{fld('발주유형', '공공')}{fld('관심 서비스', 'AI CCTV, TBM·안전교육')}</div>
<div class="sec">유입</div><div class="fgrid">{fld('유입일', '2026-10-21', True)}{fld('유입채널', '대표전화', True)}{fld('유입경로', '대표전화')}{fld('담당자', '전성환')}{fld('우선순위', '중간')}{fld('도입가능성', '중간')}</div>
<div class="sec">문의자</div><div class="fgrid">{fld('이름', '', ph=True)}{fld('직급', '팀장, 과장 등', ph=True)}{fld('연락처', '010-0000-0000', ph=True)}{fld('이메일', 'email@example.com', ph=True)}{fld('문의내용', '현장 3곳 AI CCTV 견적 요청, 11월 착공', w='full ta')}</div>
<div class="sec">다음</div><div class="fgrid">{fld('다음 액션', '견적서 발송')}{fld('예정일', '2026-10-23')}</div></div>
<div class="df"><span class="muted">필수 3 · 미입력 4</span><span class="sp"></span><span class="btn sm">취소</span><span class="btn sm primary">저장</span></div></div>'''
F4 = frame('파이프라인', '리스트', ('세일즈',), form_body, dims=[('left:880px;top:120px', '드로어 480 · 2열 · 라벨 위 12 · 입력 32 · 행 간 12 · 섹션 사이 24'), ('left:880px;top:700px', '하단 고정 바 48: 취소 · 저장')], h=860)

# ───────── 5. 대시보드 ─────────
rv = {r['month']: r['total'] for r in s['rev2026']}; rmx = max(rv.values())
rbars = ''.join(f'<div title="{m}월 {won(v)}" class="{"now" if m == 10 else ""}"><i style="height:{max(3, v/rmx*100):.0f}%"></i><span>{m}</span></div>' for m, v in sorted(rv.items()))
uc = collections.defaultdict(float)
for u in s['unpaid']: uc[(u['customer'] or {}).get('company_name', '—')] += float(u['total'])
utot = sum(uc.values()); ucnt = len(s['unpaid'])
utop = ''.join(f'<tr><td class="id"><b>{esc(n)}</b></td><td class="num">{won(v)}</td></tr>' for n, v in sorted(uc.items(), key=lambda x: -x[1])[:5])
sep = ''.join(f'<tr><td class="id"><b>{esc(n)}</b></td><td class="num">{won(v)}</td></tr>' for n, v in s['sepTop'][:5])
order = ['신규리드', '컨텍', '제안', '미팅', '도입직전', '예정', '도입완료', '이탈']; smx = max(st.values())
sbars = ''.join(f'<div class="hbar"><span>{k}</span><i style="width:{st.get(k,0)/smx*100:.0f}%;background:{scol(k)}"></i><b>{st.get(k,0)}</b></div>' for k in order)
recent = ''.join(f'<tr><td class="id"><b>{esc(l["company_name"])}</b></td><td class="c">{chip(tone(l["stage"]), l["stage"])}</td><td class="c">{av(users.get(l["assigned_to"], "") if l["assigned_to"] else "")}</td><td class="c num">{l["inquiry_date"][5:]}</td></tr>' for l in leads[:6])
dash_body = f'''
<div class="ph"><div><h1>대시보드</h1><p class="kpi">2026-10-21 (수) · 세일즈 프리셋</p></div><div class="acts"><span class="sel">세일즈 프리셋</span><span class="btn sm">위젯 선택</span></div></div>
<div class="kpis"><div><span>이번 달 리드</span><b>{s['dash']['leadsMonth']}</b><em>전월 {s['dash']['leadsPrevMonth']}</em></div><div><span>10월 매출</span><b>{man(rv[10])}</b><em>9월 {man(rv[9])}</em></div><div><span>2026 도입</span><b>{st['도입완료']}</b><em>도입률 {st['도입완료']/total26*100:.1f}%</em></div><div><span>미납</span><b class="bad">{man(utot)}</b><em>{ucnt}건 · {len(uc)}곳</em></div><div><span>오늘 할 일</span><b>4</b><em>지연 1</em></div></div>
<div class="grid12">
<div class="w c8"><div class="wt">월별 매출 <span class="muted">2026 공급가 · 11·12월은 계약 기준</span></div><div class="chart h">{rbars}</div></div>
<div class="w c4"><div class="wt">단계 분포 <span class="muted">2026 유입</span></div>{sbars}</div>
<div class="w c4"><div class="wt">최근 리드</div><table class="ds mini"><tbody>{recent}</tbody></table></div>
<div class="w c4"><div class="wt">9월 매출 상위</div><table class="ds mini"><tbody>{sep}</tbody></table></div>
<div class="w c4"><div class="wt">미납 상위 <span class="muted">{ucnt}건</span></div><table class="ds mini"><tbody>{utop}</tbody></table></div>
</div>'''
F5 = frame('대시보드', '대시보드', (), dash_body, dims=[('left:206px;top:118px', '숫자 줄 64 · 5개'), ('left:206px;top:196px', '12열 격자 · 간격 16 · 위젯 = 제목 14 + 내용, 3종(숫자·목록 5줄·추이)')], h=800)


# ───────── 6. 보드: 파이프라인 보드뷰 ─────────
bd = json.load(open(S + '/board.json'))
from datetime import date
today = date(2026, 10, 21)
STAGES = ['신규리드', '컨텍', '제안', '미팅', '도입직전', '예정']
def card(l):
    d = (today - date.fromisoformat(l['inquiry_date'])).days if l['inquiry_date'] else None
    tags = ''.join(f'<span class="tag">#{esc(x)}</span>' for x in (l['topic_tags'] or [])[:2])
    nxt = f'<span class="due">{esc(l["next_action_date"][5:].replace("-", "."))}</span>' if l.get('next_action_date') else '<span class="due muted">액션 없음</span>'
    return f'<div class="card"><div class="c1"><b>{esc(l["company_name"])}</b>{av(users.get(l["assigned_to"], "") if l["assigned_to"] else "")}</div><div class="c2">{esc(l["inquiry_channel"] or "—")} · 유입 {esc(l["inquiry_date"][5:].replace("-", "."))} · D+{d}</div><div class="c3">{tags}{nxt}</div></div>'
cols = []
for stg in STAGES:
    n = st.get(stg, 0); cards = bd['cols'].get(stg) or []
    more = f'<div class="more">더 보기 {n - len(cards)}</div>' if n > len(cards) else ''
    cols.append(f'<div class="col"><div class="colh" style="border-top-color:{scol(stg)}"><b>{esc(stg)}</b><span>{n}</span><em>예측 {man(n * 2500000 * {"신규리드": .2, "컨텍": .2, "제안": .5, "미팅": .5, "도입직전": .8, "예정": .8}[stg])}</em></div><div class="cards">{"".join(card(l) for l in cards)}{more}</div></div>')
folded = ''.join(f'<div class="col fold" style="border-top-color:{scol(stg)}"><b>{esc(stg)}</b><span>{st.get(stg, 0)}</span><em>누르면 펼침 ▸</em></div>' for stg in ['도입완료', '이탈'])
board_body = f"""
<div class="ph"><div><h1>보드뷰</h1><p class="kpi">진행 <b>{sum(st.get(x, 0) for x in STAGES)}</b> · 이번 주 액션 <b>0</b> · 지연 <b>0</b> · 예측 가치 <b>{man(sum(st.get(x, 0) * 2500000 * r for x, r in {"신규리드": .2, "컨텍": .2, "제안": .5, "미팅": .5, "도입직전": .8, "예정": .8}.items()))}</b></p></div><div class="acts"><span class="tabs"><span>리스트</span><span class="on">보드</span></span><span class="btn sm primary">+ 리드 등록</span></div></div>
<div class="tb"><span class="inp s">회사명 검색</span><span class="sel">담당 전체</span><span class="sel">채널 전체</span><span class="sel">2026년</span><span class="chk">내 리드만</span><span class="sp"></span><span class="muted">카드를 끌어 단계 이동 · 카드를 누르면 드로어</span></div>
<div class="board">{"".join(cols)}<div class="folds">{folded}</div></div>"""
F6 = frame('파이프라인', '보드뷰', ('세일즈',), board_body, dims=[('left:206px;top:118px', '열 폭 220 · 간격 12 · 열 바탕 연회색 · 머리 36 고정 · 가로 스크롤'), ('left:206px;top:160px', '카드 72: 회사명 → 채널·유입·D+n → 태그·다음 액션'), ('left:1130px;top:118px', '접힌 열 40: 도입완료·이탈')], h=760)

# ───────── 문서 ─────────
CSS = r'''
:root{--bg:#fff;--bg-subtle:#f7f7f8;--line:#e5e5e8;--line-2:#f0f0f2;--fg:#1a1a1f;--fg-2:#5c5f66;--fg-3:#9b9ea6;--accent:#2563eb;--accent-soft:#eaf1fe;--ok:#00c875;--info:#579bfc;--warn:#fdab3d;--bad:#e2445c;--na:#c4c4c4;--font:"Inter","Noto Sans KR","Pretendard",-apple-system,"Apple SD Gothic Neo",system-ui,sans-serif}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){--bg:#101113;--bg-subtle:#16181b;--line:#2a2d32;--line-2:#1e2125;--fg:#f3f4f6;--fg-2:#a4a8b0;--fg-3:#6a6e76;--accent:#60a5fa;--accent-soft:#1b2a44}}
:root[data-theme="dark"]{--bg:#101113;--bg-subtle:#16181b;--line:#2a2d32;--line-2:#1e2125;--fg:#f3f4f6;--fg-2:#a4a8b0;--fg-3:#6a6e76;--accent:#60a5fa;--accent-soft:#1b2a44}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font-family:var(--font);font-size:13px;line-height:1.55;padding:0 16px}
.doc{max-width:1120px;margin:0 auto;padding:28px 0 60px}
h1.t{font-size:22px;font-weight:600;margin:0 0 4px}.lead{color:var(--fg-2);margin:0 0 20px;max-width:78ch}
.dec{border:1px solid var(--line);border-radius:8px;padding:14px 16px;margin:0 0 28px}.dec h3{margin:0 0 8px;font-size:14px}.dec ol{margin:0;padding-left:20px}.dec li{margin:4px 0}.dec li b{font-weight:600}
section{border-top:1px solid var(--line);padding:22px 0 10px}h2{font-size:16px;font-weight:600;margin:0 0 4px}.rule{color:var(--fg-2);margin:0 0 12px;max-width:80ch}.rule b{color:var(--fg);font-weight:500}
.spec{display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin:0 0 14px}.spec div{border:1px solid var(--line);border-radius:6px;padding:10px 12px}.spec h4{margin:0 0 6px;font-size:12.5px;color:var(--fg-3);font-weight:500}.spec ul{margin:0;padding-left:16px}.spec li{margin:2px 0}.spec code{font-family:ui-monospace,Menlo,monospace;font-size:11.5px;color:var(--accent)}
@media (max-width:800px){.spec{grid-template-columns:1fr}}
.fwrap{overflow-x:auto;margin:6px 0 10px;padding-bottom:6px}
/* ─── 프레임(앱 화면) ─── */
.frame{position:relative;width:1280px;display:grid;grid-template-columns:200px 1fr;border:1px solid var(--line);border-radius:8px;overflow:hidden;background:var(--bg);zoom:.86;font-size:13px}
.sb{border-right:1px solid var(--line);display:flex;flex-direction:column;background:var(--bg)}.logo{height:48px;display:flex;align-items:center;gap:8px;padding:0 16px;border-bottom:1px solid var(--line)}.logo i{width:22px;height:22px;border-radius:6px;background:var(--accent)}.logo b{font-weight:600}.logo span{color:var(--fg-3);font-size:11px}
.sb nav{padding:8px 8px;flex:1;overflow:hidden}.sb .g{display:flex;justify-content:space-between;align-items:center;height:32px;padding:0 10px;border-radius:6px;color:var(--fg);font-weight:500}.sb .g em{font-style:normal;color:var(--fg-3);font-size:10px}.sb .g.act{background:var(--bg-subtle);font-weight:600;box-shadow:inset 2px 0 0 var(--accent)}
.sb a{display:block;height:30px;line-height:30px;padding:0 10px 0 22px;border-radius:6px;color:var(--fg-2);font-size:12.5px}.sb a.act{background:var(--bg-subtle);color:var(--fg);font-weight:600;box-shadow:inset 2px 0 0 var(--accent)}
.sb .me{height:52px;border-top:1px solid var(--line);display:flex;align-items:center;gap:8px;padding:0 14px}.sb .me b{display:block;font-size:12.5px;font-weight:500}.sb .me span{font-size:11px;color:var(--fg-3)}
.main{display:grid;grid-template-rows:48px 1fr;min-width:0}.hd{display:flex;align-items:center;justify-content:space-between;padding:0 20px;border-bottom:1px solid var(--line)}.hd b{font-size:14px;font-weight:600}.hd .r{display:flex;align-items:center;gap:12px}.srch{width:240px;height:30px;border:1px solid var(--line);border-radius:6px;padding:0 10px;display:flex;align-items:center;justify-content:space-between;color:var(--fg-3);font-size:12px}kbd{font:11px ui-monospace,Menlo,monospace;color:var(--fg-3);border:1px solid var(--line);border-radius:4px;padding:0 4px}.fs{font-size:11.5px;color:var(--fg-3);letter-spacing:.5px}
.ct{position:relative;padding:16px 20px 20px;overflow:hidden;min-width:0}
.ph{display:flex;justify-content:space-between;align-items:flex-start;min-height:56px;margin-bottom:0}.ph h1{font-size:18px;font-weight:600;margin:0;display:flex;align-items:center;gap:8px}.ph .kpi{margin:2px 0 0;color:var(--fg-2);font-size:12.5px}.ph .kpi b{color:var(--fg);font-weight:600}.acts{display:flex;gap:8px;align-items:center}
.tb{display:flex;gap:8px;align-items:center;height:40px;margin-bottom:12px}.sp{flex:1}
.tabs{display:inline-flex;border:1px solid var(--line);border-radius:6px;padding:2px;gap:2px}.tabs span{padding:3px 10px;border-radius:4px;color:var(--fg-2);font-size:12.5px}.tabs .on{background:var(--bg-subtle);color:var(--fg);font-weight:500}
.inp{height:32px;border:1px solid var(--line);border-radius:6px;padding:0 10px;display:flex;align-items:center;font-size:13px;color:var(--fg);background:var(--bg)}.inp.s{width:220px;height:30px;color:var(--fg-3);font-size:12.5px}.inp.ph{color:var(--fg-3)}.inp.ta{height:64px;align-items:flex-start;padding-top:6px}
.sel{height:30px;border:1px solid var(--line);border-radius:6px;padding:0 10px;display:inline-flex;align-items:center;gap:8px;font-size:12.5px}.sel::after{content:"▾";color:var(--fg-3);font-size:10px}.chk{font-size:12.5px;color:var(--fg-2)}.chk::before{content:"";display:inline-block;width:14px;height:14px;border:1px solid var(--line);border-radius:3px;vertical-align:-3px;margin-right:6px}
.btn{height:32px;padding:0 12px;border-radius:6px;border:1px solid var(--line);background:var(--bg);color:var(--fg);font-size:13px;font-weight:500;display:inline-flex;align-items:center;white-space:nowrap}.btn.sm{height:28px;padding:0 10px;font-size:12.5px}.btn.primary{background:var(--accent);border-color:var(--accent);color:#fff}.btn.quiet{border-color:transparent;color:var(--fg-2)}.btn.danger{color:var(--bad);border-color:color-mix(in srgb,var(--bad) 40%,transparent)}
.st{display:inline-block;height:22px;line-height:22px;min-width:64px;padding:0 8px;border-radius:4px;color:#fff;font-weight:500;font-size:12px;white-space:nowrap;text-align:center}.st.ok{background:var(--ok)}.st.info{background:var(--info)}.st.warn{background:var(--warn)}.st.bad{background:var(--bad)}.st.na{background:var(--na)}
.tag{color:var(--accent);font-size:12px;margin-right:4px;white-space:nowrap}.av{display:inline-grid;place-items:center;width:22px;height:22px;border-radius:50%;background:var(--line);color:var(--fg-2);font-size:11px;font-weight:600}
.wrap{border:1px solid var(--line);border-radius:6px;overflow:auto;background:var(--bg)}.wrap.fill{position:absolute;left:20px;right:20px;top:124px;bottom:20px;display:flex;flex-direction:column}.wrap.fill table{flex:1}.wrap.dimmed{opacity:.55}
table.ds{border-collapse:collapse;width:100%;min-width:100%;table-layout:auto}.ds th{height:34px;padding:0 12px;font-size:12px;font-weight:500;color:var(--fg-3);background:var(--bg-subtle);border-bottom:1px solid var(--line);text-align:center;white-space:nowrap}.ds th.l{text-align:left}.ds th.id{text-align:left;min-width:200px}
.ds td{height:36px;padding:0 12px;border-bottom:1px solid var(--line-2);white-space:nowrap;vertical-align:middle}.ds td.id{width:100%;min-width:200px;max-width:0;overflow:hidden;text-overflow:ellipsis}.ds td.c{text-align:center}.ds td.num{text-align:right;font-variant-numeric:tabular-nums}.ds td.l{text-align:left}.ds td.muted,.muted{color:var(--fg-3)}.ds td b{font-weight:500}
.ds tbody tr:nth-child(even) td{background:var(--bg-subtle)}.ds tbody tr:hover td{background:var(--accent-soft)}.ds tr.sum td{font-weight:600;border-top:1px solid var(--line);background:var(--bg)!important}.ds tr.empty td{color:var(--fg-3)}.ds.mini td{height:32px;padding:0 10px}.ds.mini td.id{min-width:0}.ds.narrow th.id,.ds.narrow td.id{min-width:90px}
.bar{display:inline-block;width:60px;height:6px;border-radius:3px;background:var(--line-2);vertical-align:middle;margin-right:6px}.bar i{display:block;height:100%;background:var(--info);border-radius:3px}
.pg{display:flex;align-items:center;justify-content:flex-end;gap:6px;height:36px;padding:0 12px;border-top:1px solid var(--line);font-size:12px;color:var(--fg-2);background:var(--bg)}
.two{display:grid;grid-template-columns:2fr 1fr;gap:20px;min-width:0}.two>*{min-width:0}
.sec{font-size:14px;font-weight:500;margin:0 0 8px;display:flex;align-items:center;gap:8px}.two .sec{margin-top:4px}.sec+.wrap,.sec+.chart{margin-bottom:20px}.note{font-size:12px;color:var(--fg-3);margin:8px 0 0}
.kpis{display:grid;grid-template-columns:repeat(5,1fr);height:64px;border-top:1px solid var(--line);border-bottom:1px solid var(--line);margin:0 0 20px}.kpis div{padding:10px 16px 0 0;border-right:1px solid var(--line-2);margin-right:16px}.kpis div:last-child{border:0}.kpis span{display:block;font-size:12px;color:var(--fg-3)}.kpis b{font-size:18px;font-weight:600;font-variant-numeric:tabular-nums}.kpis b.bad{color:var(--bad)}.kpis em{font-style:normal;font-size:11.5px;color:var(--fg-3);margin-left:6px}
.chart{display:flex;align-items:flex-end;gap:6px;height:140px;border:1px solid var(--line);border-radius:6px;padding:12px 12px 6px}.chart.h{height:200px;border:0;padding:8px 0 0}.chart div{flex:1;display:flex;flex-direction:column;justify-content:flex-end;align-items:center;gap:4px;height:100%}.chart i{display:block;width:100%;max-width:40px;background:var(--ok);border-radius:3px 3px 0 0}.chart.h i{background:var(--info)}.chart .now i{background:var(--accent)}.chart span{font-size:10.5px;color:var(--fg-3)}
.hbar{display:grid;grid-template-columns:56px 1fr 32px;align-items:center;gap:8px;height:24px;font-size:12px;color:var(--fg-2)}.hbar i{display:block;height:8px;border-radius:4px;background:var(--info)}.hbar i.ok{background:var(--ok)}.hbar i.bad{background:var(--bad)}.hbar i.warn{background:var(--warn)}.hbar i.na{background:var(--na)}.hbar b{text-align:right;font-weight:500;color:var(--fg)}
.grid12{display:grid;grid-template-columns:repeat(12,1fr);gap:16px}.w{border:1px solid var(--line);border-radius:6px;padding:12px 14px;min-width:0}.c4{grid-column:span 4}.c8{grid-column:span 8}.wt{font-size:14px;font-weight:500;margin-bottom:8px;display:flex;gap:8px;align-items:center}
.tl{list-style:none;margin:0;padding:0 0 0 14px;border-left:1px solid var(--line);font-size:12.5px}.tl li{position:relative;margin:0 0 10px}.tl li::before{content:"";position:absolute;left:-19px;top:5px;width:9px;height:9px;border-radius:50%;background:var(--fg-3)}.tl li.won::before{background:var(--ok)}.tl li.rev::before{background:var(--ok)}.tl li.inv::before{background:var(--warn)}.tl li.lead::before{background:var(--accent)}.tl span{display:block;font-size:11px;color:var(--fg-3);font-variant-numeric:tabular-nums}.tl b{font-weight:500}.tl li.won b{color:var(--ok);font-weight:600}.tl em{display:block;font-style:normal;color:var(--fg-2);font-size:12px}
.drawer{position:absolute;top:0;right:0;bottom:0;background:var(--bg);border-left:1px solid var(--line);box-shadow:0 8px 24px rgba(0,0,0,.08);display:flex;flex-direction:column}.w480{width:480px}.dh{display:flex;justify-content:space-between;align-items:flex-start;padding:14px 20px;border-bottom:1px solid var(--line)}.dh b{font-size:15px;font-weight:600}.dh .meta{font-size:12px;color:var(--fg-2);margin-top:2px}.dh .x{color:var(--fg-3)}.db{flex:1;padding:16px 20px;overflow:hidden}.db .sec{margin-top:16px}.db .sec:first-child{margin-top:0}
.kv{display:grid;grid-template-columns:88px 1fr;gap:6px 12px;font-size:12.5px}.kv span{color:var(--fg-3)}.kv b{font-weight:400}
.df{height:48px;border-top:1px solid var(--line);display:flex;align-items:center;gap:8px;padding:0 20px}
.fgrid{display:grid;grid-template-columns:1fr 1fr;gap:12px 12px;margin-bottom:8px}.field{display:grid;gap:4px}.field.full{grid-column:1/-1}.field label{font-size:12px;color:var(--fg-2)}.field label b{color:var(--bad);font-weight:400}.field.ta .inp{height:56px;align-items:flex-start;padding-top:6px;white-space:normal}
.dim{position:absolute;background:var(--accent);color:#fff;font-size:10.5px;padding:1px 6px;border-radius:3px;white-space:nowrap;opacity:.9;pointer-events:none;font-weight:500;letter-spacing:.2px}
.board{position:absolute;left:20px;right:20px;top:124px;bottom:20px;display:flex;gap:12px;overflow:hidden;padding-right:104px}.board .colh{border-bottom:0}.folds{position:absolute;right:0;top:0;bottom:0;display:flex;gap:12px;background:var(--bg);padding-left:12px}.col{width:220px;flex:none;display:flex;flex-direction:column;min-height:0;background:var(--bg-subtle);border-radius:6px}.colh{height:36px;display:flex;align-items:center;gap:8px;padding:0 10px;border-top:3px solid var(--na);border-radius:6px 6px 0 0;font-size:13px}.colh.ok{border-top-color:var(--ok)}.colh.info{border-top-color:var(--info)}.colh.warn{border-top-color:var(--warn)}.colh.bad{border-top-color:var(--bad)}.colh b{font-weight:600}.colh span{color:var(--fg-2);font-size:12px}.colh em{margin-left:auto;font-style:normal;font-size:11.5px;color:var(--fg-3)}
.cards{flex:1;overflow:hidden;padding:0 8px 8px;display:flex;flex-direction:column;gap:8px}.card{border:1px solid var(--line);border-radius:6px;padding:8px 10px;background:var(--bg);font-size:12px}.card .c1{display:flex;justify-content:space-between;align-items:center;gap:8px}.card .c1 b{font-size:13px;font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.card .c2{color:var(--fg-3);margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.card .c3{display:flex;justify-content:space-between;align-items:center;margin-top:4px;gap:6px}.card .due{font-size:11.5px;color:var(--fg-2);white-space:nowrap}.card .due.muted{color:var(--fg-3)}.more{text-align:center;color:var(--accent);font-size:12px;padding:4px}
.col.fold{width:40px;border-top:3px solid var(--na);display:flex;flex-direction:column;align-items:center;padding:10px 0;gap:8px;cursor:pointer}.col.fold b{writing-mode:vertical-rl;font-size:12.5px;font-weight:600;color:var(--fg)}.col.fold span{font-size:12px;font-weight:500;color:var(--fg-2)}.col.fold em{font-style:normal;font-size:10px;color:var(--fg-3);writing-mode:vertical-rl}.col.fold.ok{border-top-color:var(--ok)}.col.fold.bad{border-top-color:var(--bad)}
.sw8{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin-bottom:8px}.sw{border:1px solid var(--line);border-radius:6px;overflow:hidden}.sw i{display:block;height:28px}.sw div{padding:4px 6px;font-size:11.5px}.sw div b{display:block;font-weight:500}.spec2{font-family:ui-monospace,Menlo,monospace;font-size:10.5px;color:var(--fg-3)}
.ds.fixed{table-layout:fixed}.ds th.g,.ds td.g{border-left:1px solid var(--line)}.ds td.c b{font-weight:500}
.dim{display:none}.frame.showdim .dim{display:block}
.tog{font-size:12px;color:var(--fg-2);margin:0 0 6px}.tog label{cursor:pointer}
'''
def sec(id, title, rule, spec, frame_html, after=''):
    sp = ''.join(f'<div><h4>{esc(h)}</h4><ul>{"".join(f"<li>{x}</li>" for x in items)}</ul></div>' for h, items in spec)
    return f'<section id="{id}"><h2>{title}</h2><p class="rule">{rule}</p><div class="spec">{sp}</div><div class="fwrap">{frame_html}</div>{after}</section>'

DOC = f'''<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>CRM 레이아웃 정의</title>
<meta name="description" content="CaaS.Works CRM 화면 유형 6가지의 배치 수치·데이터 배열·불러오기 규칙과 실제 데이터 시안 5장">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;500;600&family=Inter:wght@400;500;600&display=swap"><style>{CSS}</style></head><body><div class="doc">
<h1 class="t">레이아웃 정의 v1 — 화면 유형 6가지</h1>
<p class="lead">디자인 정의 v1(색·글자·버튼·표)은 그대로 두고, 그 부품을 <b>어디에 얼마 크기로 놓는지</b>와 <b>데이터를 어떤 순서로 배열하고 몇 번에 불러오는지</b>를 정한다. 시안 6장은 전부 CRM 의 오늘(2026-10-21) 실제 데이터다. 파란 라벨은 치수 표시이며 실제 화면에는 없다.</p>
<div class="dec"><h3>엔조가 먼저 정한 것 9가지 — 아니면 말해줘</h3><ol>
<li><b>틀은 하나.</b> 사이드바 200(1,024px 이하 56 아이콘) · 헤더 48 · 본문 좌우 20 위 16 · 본문 최대 1,400(목록·집계·대시보드) / 960(상세) / 드로어 480(입력·목록 상세) · 60vw(집계 드릴다운)</li>
<li><b>표는 틀을 채운다.</b> 열 폭은 내용 기준이되 남는 폭은 첫 열(회사명)이 흡수. 목록 표는 남은 화면 높이를 전부 쓰고 그 안에서 스크롤, 집계 표는 표마다 높이를 정한다(월별 = 12줄)</li>
<li><b>목록은 50행씩 서버에서.</b> 1,214행을 한 번에 내리지 않는다. 검색·필터·정렬도 서버. 보드뷰만 예외(단계별 전체)</li>
<li><b>상세는 2:1.</b> 왼쪽 주 내용(차트·표), 오른쪽 보조(청구·타임라인). 1,024 이하 한 열</li>
<li><b>대시보드는 자유 드래그를 뺀다.</b> 역할 프리셋 3개 + 위젯 켜고 끄기만. 위젯은 숫자·목록 5줄·추이 3종으로 제한 → react-grid-layout 제거, 코드와 로딩이 같이 준다</li>
<li><b>입력은 드로어.</b> 목록 위에 480 드로어로 열고 저장하면 목록 맨 위에 들어간다. 전체 페이지는 견적서뿐</li>
<li><b>요청 수 상한.</b> 화면 열릴 때 목록 2 · 집계 1 · 상세 1(+드로어 1) · 입력 0(선택지는 전역 캐시) · 대시보드 1 · 보드 1. 사용자·역할·선택지는 앱에서 한 번만</li>
<li><b>색은 v1 그대로.</b> 12색은 그대로, 단계 매핑만 신규·이탈을 맞바꿈(신규 빨강 · 진행 파랑 · 예정 주황 · 도입완료 초록 · 이탈 회색). 상태 칩은 최소 폭 64 로 통일(2글자도 4글자 폭)</li>
<li><b>보드는 진행 단계만.</b> 도입완료·이탈은 접힌 열, 카드 3줄 72px, 드래그는 보드에서만 유지. 리스트와 드로어를 공유</li>
</ol></div>

<section id="common"><h2>0. 공통 — 색은 v1 12색 그대로(신규·이탈만 맞바꿈) · 상태 칩 폭 통일</h2><p class="rule">색은 새로 만들지 않는다. 어제 정한 <b>12색</b>(바탕 2 · 선 2 · 글자 3 · 강조 1 · 상태 4)과 단계 매핑을 그대로 쓴다. 이 문서가 더하는 것은 <b>상태 칩의 폭</b> 하나.</p>
<div class="spec"><div><h4>상태 4색 + 회색 (v1)</h4><div class="sw8"><div class="sw"><i style="background:#E2445C"></i><div><b>신규리드 (눈에 띄게)</b><span class="spec2">#E2445C</span></div></div><div class="sw"><i style="background:#579BFC"></i><div><b>진행(컨텍·제안·미팅·도입직전)</b><span class="spec2">#579BFC</span></div></div><div class="sw"><i style="background:#FDAB3D"></i><div><b>예정</b><span class="spec2">#FDAB3D</span></div></div><div class="sw"><i style="background:#00C875"></i><div><b>도입완료</b><span class="spec2">#00C875</span></div></div><div class="sw"><i style="background:#C4C4C4"></i><div><b>이탈 (묻히게)</b><span class="spec2">#C4C4C4</span></div></div></div><ul><li>단계 → 색: <b>신규리드 빨강</b>(아직 손 안 댄 것이 눈에 띄게) · 컨텍/제안/미팅/도입직전 파랑 · 예정 주황 · 도입완료 초록 · <b>이탈 회색</b>(묻히게). 10/21 v1 에서 신규·이탈만 맞바꿈</li><li>칩은 칸 전체 색 + 흰 글자. 보드 열 머리는 상단 3px 같은 색, 분포 막대도 같은 색</li><li>청구: 수납 초록 · 미납 주황 · 취소 회색. 채널·업종·담당은 글자와 아바타로만</li></ul></div>
<div><h4>상태 칩 폭 통일 (추가 규칙)</h4><div class="row" style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px"><span class="st bad">신규리드</span><span class="st info">컨텍</span><span class="st info">제안</span><span class="st info">미팅</span><span class="st info">도입직전</span><span class="st warn">예정</span><span class="st ok">도입완료</span><span class="st na">이탈</span></div><ul><li>최소 폭 <b>64px</b>(4글자 기준) · 높이 22 · 글자 12/500 가운데 · 좌우 패딩 8</li><li>2글자(컨텍·제안·미팅·예정·이탈)도 같은 폭 → 표의 단계 열이 세로로 가지런</li><li>5글자 이상 상태는 쓰지 않고 4글자 이내로 줄인다</li></ul></div>
<div><h4>그 밖의 색 (v1 유지)</h4><ul><li>강조 1: #2563EB — 링크·주 버튼·현재 메뉴 줄·추이 막대</li><li>글자 3: #1A1A1F · #5C5F66 · #9B9EA6</li><li>바탕 2: #FFFFFF · #F7F7F8(표 머리·현재 메뉴·줄무늬)</li><li>선 2: #E5E5E8 · #F0F0F2</li><li>우선순위 "높음"만 회사명 앞 빨간 점 6px</li></ul></div></div></section>

{sec('list', '1. 목록 (파이프라인 리스트 · 전체 고객 · 청구서 · 티켓 …)', '위에서 아래로 <b>제목줄 56 → 툴바 40 → 표(남은 높이 전부) → 페이지줄 36</b>. 행을 누르면 오른쪽 480 드로어, 목록은 그대로. 요약 숫자는 제목 옆 한 줄.', [
 ('배치 수치', ['제목줄 56: 제목 18/600 + 숫자 한 줄 12.5 · 오른쪽 동작 ≤ 2(주 동작 1)', '툴바 40: 탭 pill │ 검색 220 │ 셀렉트 ≤ 3 │ 체크. 넘치면 "필터" 버튼 하나로 접음', '표: 머리 34 고정, 행 36, 첫 열 고정, 짝수 줄 줄무늬, 남은 높이 안에서 세로 스크롤', '페이지줄 36: "1–50 / 1,214" + ‹ ›', '드로어 480: 머리(이름·상태·메타) → 요약 kv → 활동 → 메모 → 하단 바 48(위험 동작은 왼쪽 끝)']),
 ('데이터 배열', ['열 순서 고정: <b>식별(회사명) → 상태 → 분류(채널·발주·담당) → 날짜 → 우선·태그 → 다음 액션</b>', '폭: 회사명 ≥ 200(남는 폭 흡수) · 상태 96 · 담당 56 · 날짜 100 · 금액 120 · 건수 64', '정렬 기본 최신순(유입일). 머리 클릭 정렬, 활성 열만 화살표', '긴 글(문의·다음 액션)은 한 줄 말줄임 + 툴팁. 태그는 3개까지 + "+n"', '빈 값은 — (회색). 0 은 0']),
 ('불러오기', ['열릴 때 2회: <code>GET /api/leads?page=1&size=50&…</code>(행 + 총 건수) · 탭별 건수 1회', '검색·필터·정렬·페이지 = 같은 API 다시 (300ms 디바운스). 전체 행 내려받기 없음', '드로어 열 때 1회: 그 행의 활동·메모', '저장 후: 그 행만 갱신(낙관적), 실패 시 되돌리고 토스트', '스켈레톤은 0.3초 넘을 때만 표 영역에'])], F1)}

{sec('agg', '2. 집계 (유입 코호트 · 채널별 생애 가치 · 전환 소요 · 파이프라인 분석 · 연간 비교 …)', '<b>제목줄 56 → 조건줄 40 → 주 표 2 : 보조 1</b>. 숫자 카드 타일 없음 — 합계는 제목 옆 한 줄과 표의 합계 행. 칸·행을 누르면 60vw 드로어에 회사 목록.', [
 ('배치 수치', ['조건줄: 보기 탭(월별/분기별) │ 연도 │ 축 │ 체크. 조건은 URL 에 남겨 공유 가능', '주 표 높이 = 표마다 고정: 월별 12줄(502) · 분기 4줄 · 채널 ≤ 10줄 · 축×구간 매트릭스 ≤ 60vh', '보조 표(오른쪽 1/3, 최소 320): 같은 조건의 다른 축 요약. 없으면 주 표가 전폭', '드로어 60vw(최소 720): 회사 목록 표 + 합계. 회사명 → 회사 생애주기', '막대는 표 안 인라인(60×6)만. 차트 영역은 집계 화면에서 쓰지 않음(손익만 예외)']),
 ('데이터 배열', ['행 = 시간(월·분기) 또는 축 값, 열 = <b>건수 → 비율 → 소요일 → 금액 → 단위당 → 메모</b>', '시간 행은 올해 전체를 미리 깔고 빈 달은 — (추이가 보이게). 축 행은 금액 내림차순', '합계 행은 맨 아래 굵게, 배경 없음. 비율 칸은 막대 + 숫자', '같은 숫자는 어느 화면에서나 같은 정의(lifecycle API 한 곳) — 화면마다 다시 계산하지 않음', '기존 고객 제외가 기본, 체크로 포함']),
 ('불러오기', ['열릴 때 1회: <code>GET /api/analytics/lifecycle</code>(서버 집계·5분 캐시, 0.9초). 조건 변경은 브라우저 안에서 재집계 — 추가 요청 없음', '드로어: 요청 없음(이미 받은 행에서 추림)', '연도 전환도 같은 응답 안에서. 데이터가 커지면 연도별 API 로 나눔', '스켈레톤 표 8줄'])], F2)}

{sec('detail', '3. 상세 (고객사 · 리드 · 현장 · 견적서 …)', '<b>이름줄 56 → 숫자줄 64 → 본문 2 : 1</b>. 왼쪽은 매출·서비스처럼 "크기"가 있는 것, 오른쪽은 청구·타임라인처럼 "순서"가 있는 것. 수정은 칸 클릭 인라인, 큰 수정만 드로어.', [
 ('배치 수치', ['이름줄: 이름 18 + 상태칩 · 메타 한 줄(분류 · 채널 · 유입→도입 · 담당) · 오른쪽 동작 ≤ 3', '숫자줄 64: ≤ 5개, 라벨 12 / 값 18 / 보조 11.5. 타일·색 바탕 없음, 세로 구분선만', '본문 2:1, 간격 20. 섹션 제목 14/500, 섹션 사이 20', '왼쪽: 차트(높이 140) → 표. 오른쪽: 표 → 타임라인(한 화면에 다 안 보이면 오른쪽만 스크롤)', '본문 최대 960 (넓은 화면에서 늘리지 않음)']),
 ('데이터 배열', ['타임라인은 <b>유입(파랑) → 활동(회색) → 도입(초록) → 매출(초록) → 계산서(주황)</b> 색 점, 날짜 오름차순', '월별 매출 막대는 공급가. 서비스 표는 <b>서비스 │ 이전 · 비중 │ 올해 · 비중 │ 누적 · 비중</b> (묶음마다 세로선, 서비스명 가운데, 누적 내림차순)', '청구 표: 월 → 청구액 → 발행일 → 수납(칩). 미납은 warn 칩', '관련 리드 2개 이상이면 리드 표(첫 문의/추가 문의)로', '빈 섹션은 숨기지 않고 "기록 없음" 한 줄']),
 ('불러오기', ['열릴 때 1회: <code>GET /api/customers/:id/overview</code> — 고객·리드·활동·매출·청구를 서버에서 한 번에 묶어 반환(지금은 5~6회)', '인라인 저장 1회(PATCH), 성공 시 칸 깜빡임', '타임라인 50건 넘으면 "더 보기"'])], F3)}

{sec('form', '4. 입력 (리드 등록 · 고객 등록 · 활동 기록 · 청구 수정 …)', '목록 위에 <b>480 드로어</b>. 2열 격자, 섹션 4개 이하, 하단 고정 바. 자동으로 채우는 값은 "자동" 흐린 글자. 저장하면 드로어가 닫히고 목록 맨 위에 새 행이 들어간다.', [
 ('배치 수치', ['드로어 480 (문의내용처럼 긴 글이 많으면 560)', '2열 격자, 열 간 12, 행 간 12. 긴 글은 한 줄 전체', '라벨 12 회색 위, 입력 32, 필수 * 빨강, 섹션 제목 14/500, 섹션 사이 24', '하단 바 48: 왼쪽 상태("필수 3 · 미입력 4"), 오른쪽 취소 · 저장(primary)', '오류는 입력 아래 12 빨강 한 줄. 브라우저 alert·confirm 금지']),
 ('데이터 배열', ['섹션 순서 고정: <b>회사 → 유입 → 문의자 → 다음</b>. 사람이 꼭 쳐야 하는 칸을 위로', '필수 3개만: 회사명 · 유입일 · 유입채널. 나머지는 나중에 표에서 인라인', '회사명 입력 시 기존 고객사 자동 매칭 제안(find-customer) → "기존 고객 · 과금 중" 안내', '유입채널 → 유입경로는 종속 선택. 담당자 기본값 = 나', '날짜 기본값 오늘, 우선순위·도입가능성 기본 "중간"']),
 ('불러오기', ['열릴 때 0회: 채널·경로·서비스·사용자 선택지는 앱 시작 시 한 번 받은 전역 캐시', '회사명 타이핑 중 1회(디바운스 300ms): 고객사 매칭', '저장 1회(POST). 성공 → 목록에 행 삽입, Slack 알림은 서버가'])], F4)}

{sec('dash', '5. 대시보드', '<b>제목줄 56 → 숫자줄 64 → 12열 격자 위젯</b>. 위젯은 3종(숫자·목록 5줄·추이)뿐이고 역할 프리셋으로 배치가 정해진다. 자유 드래그·리사이즈는 뺀다.', [
 ('배치 수치', ['숫자줄 64: 5개(역할별 다름). 값 18 + 보조(전월·비율) 11.5', '12열 격자, 간격 16. 추이 위젯 8열(높이 240), 목록·분포 위젯 4열(높이 240)', '위젯 = 제목 14/500 + 보조 설명 12 회색 + 내용. 테두리 1px, 바탕 없음', '한 화면(1,280×760)에 숫자줄 + 위젯 2줄이 들어오게. 세 번째 줄부터 스크롤', '프리셋 3: 경영진 · 세일즈 · 마케팅. 설정에서 위젯 켜고 끄기(순서는 고정)']),
 ('데이터 배열', ['숫자줄 왼쪽부터 <b>유입 → 매출 → 도입 → 미납 → 할 일</b> (돈 들어오는 순서)', '목록 위젯은 5줄 고정, "더 보기" 링크로 해당 목록 화면', '추이 위젯은 올해 12개월, 이번 달은 강조색, 미래 달은 계약 기준 표시', '분포는 단계 순서(신규→이탈) 고정, 색은 단계 색', '모든 숫자는 클릭하면 그 숫자의 목록으로(필터 적용된 URL)']),
 ('불러오기', ['열릴 때 1회: <code>GET /api/dashboard?preset=sales</code> — 지금 위젯 19개가 각자 쏘는 조회를 서버에서 한 번에(1분 캐시)', '프리셋 전환 1회', '숫자줄은 먼저 그리고 위젯은 도착 순서대로(스트리밍 아님, 한 응답)'])], F5)}

{sec('board', '6. 보드 (파이프라인 보드뷰)', '<b>제목줄 56 → 툴바 40 → 열 (남은 높이 전부, 가로 스크롤)</b>. 진행 단계 6개만 펼치고 도입완료·이탈은 오른쪽 끝 접힌 열. 카드는 3줄 72px, 끌어서 단계 이동, 누르면 리스트와 같은 480 드로어. 보드가 드래그를 쓰는 유일한 화면.', [
 ('배치 수치', ['열 폭 220(카드 204), 열 간격 12, 열 바탕 연회색(#F7F7F8) 위에 흰 카드 — 카드끼리 구분이 선명. 열 머리 36 (상단 3px 단계 색 · 이름 13/600 · 건수 · 오른쪽 예측 가치) 세로 스크롤에 고정', '카드 72: 패딩 8×10, 테두리 1px, 라운드 6, 그림자 없음. 끌 때만 얇은 그림자', '카드 3줄: 회사명 13/500 + 아바타 22 │ 채널 · 유입 · D+n (12 회색) │ 태그 ≤ 2 + 다음 액션 날짜(지연 빨강, 없으면 "액션 없음")', '접힌 열 40(오른쪽 끝 고정, 스크롤과 무관): 세로 글자 + 건수 + "누르면 펼침". 누르면 그 자리에 220 열로 펼쳐지고 다시 누르면 접힘', '열당 30장까지 그리고 "더 보기 n". 1,280 에서 진행 열 4개 + 접힌 열 2개가 보이고 나머지는 가로 스크롤']),
 ('데이터 배열', ['열 순서 고정: <b>신규리드 → 컨텍 → 제안 → 미팅 → 도입직전 → 예정</b> │ 접힘: 도입완료 · 이탈', '열 안 정렬: 다음 액션일 오름차순(지연 먼저) → 액션 없는 카드는 유입일 최신순', '예측 가치 = 열 건수 × 평균 견적 × 단계 확률(신규·컨텍 20% · 제안·미팅 50% · 도입직전·예정 80%). 견적 연동 전까지는 평균 견적 250만 가정 — 시안의 숫자는 이 가정값', '기본 필터 2026년 유입 · 담당 전체. "내 리드만" 체크는 기억됨', '카드 색은 쓰지 않음 — 단계 색은 열 머리에만. 우선순위 높음만 회사명 앞 빨간 점']),
 ('불러오기', ['열릴 때 1회: <code>GET /api/pipeline/board?year=2026</code> — 진행 단계 카드 필드 10개만, 열별 건수 포함 (지금은 전체 열 2배치 + 활동 로그 371건)', '접힌 열 펼칠 때 1회(그 단계 30장)', '드래그: dnd-kit(이미 설치됨) 으로 카드가 커서를 따라오고 다른 카드가 자리를 내주는 애니메이션(transform 150ms). 열당 30장 상한이라 끊김 없음', '드롭 = PATCH 1회(단계 + 이력). 성공 전까지 카드는 새 열에 반투명, 실패 시 되돌림', '드로어 열 때 1회: 활동·메모'])], F6)}

<section><h2>7. 다음</h2><p class="rule">이 문서에서 <b>정한 것 9개</b>와 시안 6장에 의견을 받는다 → 확정 → 코드 순서: ① 틀(사이드바·헤더·본문) 1개 컴포넌트 ② 목록 API 페이지네이션 + 리스트 화면 + 보드 API ③ 집계 4화면 재배치 ④ 상세(고객사·리드) ⑤ 입력 드로어 ⑥ 대시보드 API + 위젯 3종. 각 단계는 기능 변화 없이 배치만 바꾼다.</p></section>
</div>
<script>document.addEventListener('keydown',e=>{{if(e.key==='d')document.querySelectorAll('.frame').forEach(f=>f.classList.toggle('showdim'))}})</script>
</body></html>'''
open('/Users/david/Desktop/클로드/004_CRM 웹개발/caasworks/docs/design/레이아웃정의_v1.html', 'w').write(DOC)
print('written', len(DOC))
