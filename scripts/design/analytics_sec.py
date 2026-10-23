# 분석 메뉴 재구성 v3 — 시안 (2026-10-22)
# 사용자: "마케팅 분석도 실제 업무랑 참고가 잘 안되는 부분도 있고, 방문자 여정도 새로 구성하면 좋겠다 · 엔조 제안(10 → 6)도 같이"
# 그림 숫자: 2026-07~10 실데이터 (ad_performance 비용·방문·문의 클릭, pipeline_leads 문의·도입·referrer·landing_page·주제 태그)
import html, re
P = '/Users/david/Desktop/클로드/004_CRM 웹개발/caasworks/docs/design/카스웍스_CRM_디자인정의.html'
esc = lambda x: html.escape(str(x))
won = lambda v: f'{int(v):,}' if v else '—'
def av(n): return f'<span class="av" title="{esc(n)}">{esc(n[:1])}</span>'
def chip(t, s): return f'<span class="st {t}">{esc(s)}</span>'
MENU = [('대시보드', None), ('마케팅', 1), ('세일즈', 1), ('고객관리', 1), ('재무관리', 1), ('운영관리', 1),
        ('분석', ['마케팅 효율', '문의까지 가는 길', '파이프라인', '문의 내용', '코호트 · 생애 가치', '매출 분석']), ('VoC/CS', 1), ('업무', 1), ('설정', 1)]
def sidebar(act):
    o = ['<aside class="sb"><div class="logo"><i></i><b>CaasWorks</b><span>CRM</span></div><nav>']
    for g, kids in MENU:
        if isinstance(kids, list): o.append(f'<div class="g open">{g}<em>▾</em></div>' + ''.join(f'<a class="{"act" if k == act else ""}">{k}</a>' for k in kids))
        else: o.append(f'<div class="g ">{g}{"<em>▸</em>" if kids else ""}</div>')
    return ''.join(o) + '</nav><div class="me">' + av('오팀장') + '<div><b>마케팅</b><span>마케팅팀</span></div></div></aside>'
def frame(title, act, body, h=820):
    return (f'<div class="frame" style="height:{h}px">{sidebar(act)}<div class="main"><header class="hd"><b>{title}</b><div class="r"><span class="srch">회사·프로젝트·메뉴 검색 <kbd>⌘K</kbd></span>{av("마")}</div></header>'
            f'<div class="ct">{body}</div></div></div>')
def spark(vals, w=70, h=18):
    mx = max(vals) or 1; n = len(vals)
    pts = ' '.join(f'{i * w / (n - 1):.1f},{h - 2 - v / mx * (h - 4):.1f}' for i, v in enumerate(vals))
    return f'<svg class="spk" width="{w}" height="{h}" viewBox="0 0 {w} {h}"><polyline points="{pts}" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>'

# ───────── 1. 마케팅 효율 (= 마케팅 분석 + 연간 비교 대체) ─────────
# (채널, 10월 비용, 방문, 문의 클릭, 문의 7·8·9·10, 7~10 도입, 판단)
# 유입 분류 11 (src/lib/inflow-taxonomy · 리드 기준 문의). 방문 · 문의 클릭 = 10월 GA, 문의 = 리드 7~10월, 도입 = 7~10월 문의 중 도입
# (분류, 세부, 10월 비용, 방문, 문의 클릭(클릭 수), 문의 7·8·9·10, 도입, 숫자 사실)
PAID = [('광고', '네이버 (검색광고 · miracleintip 경유 포함)', 677_242, 261, 33, [3, 5, 4, 4], 0, '문의당 169,311 · 도입 0'),
        ('외주 블로그', '팀부스터 · 인플루언서', 2_000_000, 27, 34, [10, 14, 6, 1], 1, '문의 14 → 6 → 1')]
FREE = [('검색', '네이버 · 구글 · 기타', 2899, 137, [24, 26, 5, 9], 4, '8월 26 → 10월 9'),
        ('자사 채널', '홈페이지 · 깃북 · 해피톡', 1593, 39, [19, 10, 4, 11], 3, '9월 4 → 10월 11'),
        ('생성형 AI', 'ChatGPT · Gemini · AI 검색', None, None, [4, 2, 5, 0], 0, '방문은 검색에 섞임 → 분리 예정'),
        ('자사 블로그', '카스웍스 · 네이버 블로그', 63, 12, [2, 1, 0, 0], 0, '9 · 10월 문의 0'),
        ('언론 · 뉴스', '보도자료 · 네이버 뉴스', 71, 0, [0, 0, 0, 0], 0, '방문만'),
        ('소셜', '유튜브 · 인스타 · 링크드인', 5, 3, [0, 0, 0, 0], 0, '—'),
        ('외부 글', '나무위키 · 남이 쓴 글', 1, 0, [0, 0, 0, 0], 0, '—'),
        ('커뮤니티', '네이버 · 다음 카페', 2, 2, [0, 0, 0, 0], 0, '—'),
        ('광고 (비용 0)', '구글 · 메타 — 이번 달 집행 없음', 82, 0, [0, 0, 0, 0], 0, '앱 세션 이월 포함'),
        ('미분류', '사이트 주소 그대로', 39, 2, [0, 0, 0, 0], 0, '월 1회 분류')]
DIRECT = [('직접 연락', '대표전화 28 · 개인전화 12 · 추천 3 · 이메일 2', [10, 12, 10, 14], 21)]
def fact(t): return f'<span class="fact">{esc(t)}</span><span class="memo">+ 판단</span>'
def prow(r):
    g, sub, c, v, k, q, a, f = r
    return (f'<tr><td><b>{g}</b><span class="dsub">{sub}</span></td><td class="num">{won(c)}</td><td class="num">{won(v)}</td><td class="num">{k}</td><td class="num"><b>{q[-1]}</b></td>'
            f'<td class="num">{won(c / q[-1]) if q[-1] else "—"}</td><td class="c spkc">{spark(q)}<span class="muted"> {"·".join(map(str, q))}</span></td><td class="num muted">—</td><td class="num">{a}</td><td>{fact(f)}</td></tr>')
def frow(r):
    g, sub, v, k, q, a, f = r
    return (f'<tr><td><b>{g}</b><span class="dsub">{sub}</span></td><td class="num">—</td><td class="num">{won(v) if v is not None else "—"}</td><td class="num">{k if k is not None else "—"}</td><td class="num"><b>{q[-1]}</b></td>'
            f'<td class="num">—</td><td class="c spkc">{spark(q) if any(q) else ""}<span class="muted"> {"·".join(map(str, q))}</span></td><td class="num muted">—</td><td class="num">{a}</td><td>{fact(f)}</td></tr>')
def drow(r):
    g, sub, q, a = r
    return (f'<tr><td><b>{g}</b><span class="dsub">{sub}</span></td><td class="num">—</td><td class="num">—</td><td class="num">—</td><td class="num"><b>{q[-1]}</b></td>'
            f'<td class="num">—</td><td class="c spkc">{spark(q)}<span class="muted"> {"·".join(map(str, q))}</span></td><td class="num muted">—</td><td class="num"><b>{a}</b></td><td>{fact("도입 29 중 21 · 경로는 GA 전화클릭으로")}</td></tr>')
COLS = '<colgroup><col style="width:22%"><col style="width:9%"><col style="width:7%"><col style="width:7%"><col style="width:6%"><col style="width:9%"><col style="width:14%"><col style="width:6%"><col style="width:6%"><col style="width:14%"></colgroup>'
TH = '<thead><tr><th>유입 분류</th><th>비용</th><th>방문</th><th>문의 클릭<br><small>클릭 수</small></th><th>문의</th><th>문의당 비용</th><th>문의 7 · 8 · 9 · 10월</th><th>☆ 관심<br><small>올라간 건</small></th><th>도입<br><small>7~10</small></th><th>숫자 요약 · 판단(사람)</th></tr></thead>'
A = f'''<div class="pg2 wide"><div class="h2top"><h1 style="margin:0;font-size:18px">마케팅 효율</h1><span class="muted">돈과 시간을 쓴 곳에서 문의 · 도입이 얼마나 나왔나</span><span class="sp"></span>
<span class="seg"><span>주</span><span class="on">월</span><span>분기</span><span>연</span></span><span class="btn sm">2026년 10월 ▾</span><span class="btn sm">고객 유형 전체 ▾</span><span class="btn sm quiet">비용 입력 (외주 · 행사)</span></div>
<div class="kpis"><div><span>쓴 돈</span><b>2,677,242</b><em class="muted">9월 2,772,503</em></div><div><span>문의 (리드)</span><b>39</b><em class="muted">9월 34 · 8월 70</em></div><div><span>돈 쓴 곳 문의</span><b>5</b><em class="muted">문의당 535,448</em></div><div><span>도입 (7~10월 문의)</span><b>29</b><em class="muted">직접 연락 21 · 웹 8</em></div><div><span>출처 아는 문의</span><b>64%</b><em class="muted">10월 39 중 25 (웹)</em></div></div>
<div class="ins"><div class="w"><b>외주 블로그 문의 14 → 6 → 1</b><span>월 200만 원 · 7~10월 도입 1</span></div><div class="w"><b>검색 문의 8월 26 → 10월 9</b><span>방문 4,580 → 2,899</span></div><div class="r"><b>도입 29 중 21이 직접 연락</b><span>경로는 GA 전화클릭 채널 분포로 짐작</span></div></div>
<div class="cd-h"><b>돈 쓴 곳</b><span class="muted">그 달 비용이 있는 분류만 자동으로 · 광고 비용 = 네이버 광고 API(키워드), 문의 = miracleintip 경유 포함 · 대행사의 전환(쇼핑)과 우리 문의는 별개</span></div>
<table class="ds fixed">{COLS}{TH}<tbody>{''.join(prow(r) for r in PAID)}</tbody></table>
<div class="cd-h" style="margin-top:12px"><b>돈 안 쓴 곳</b><span class="muted">유입 분류 11 전부 · 콘텐츠(자사 블로그)는 발행 편수 → 편당 문의 (주제 성과와 연결)</span></div>
<table class="ds fixed">{COLS}<tbody>{''.join(frow(r) for r in FREE)}</tbody></table>
<div class="cd-h" style="margin-top:12px"><b>직접 연락</b><span class="muted">경로를 모를 때 · 통화 때 묻지 않음</span></div>
<table class="ds fixed">{COLS}<tbody>{''.join(drow(r) for r in DIRECT)}</tbody></table>
<p class="cd-note" style="margin-top:8px">숫자를 누르면 그 리드 목록 · 문의 = 리드 기준 · 다시 문의한 리드는 그 달 문의 · 그때 유입으로 · ☆ 관심 = 그 분류에서 들어와 관심 프로젝트로 올라간 건 (관심 · 중요 표시가 생기면 채워짐 · 마케팅팀 10/23 요청, 이탈 사유 대신) · 숫자 요약은 CRM 이 자동으로 (사실만), 판단은 사람이 [+ 판단]으로 · 연결률: 10월 문의 중 출처를 아는 비율</p></div>'''
FA = frame('분석 › 마케팅 효율', '마케팅 효율', A, h=860)

# ───────── 2. 문의까지 가는 길 (= 방문자 여정 대체) ─────────
FUN = [('방문', '5,049', '세션 · www.caas.works 만'), ('서비스 페이지 봄', '—', '/pages · /products 본 세션 (GA 페이지로 계산 예정)'), ('문의 클릭', '263', '클릭 수 · 메뉴의 문의하기 포함'), ('문의 페이지 열람', '—', '/contact 조회'), ('문의 제출', '—', 'fin-contact · 10/21 부터 다시 수집 → 11월부터 판단'), ('리드 (웹)', '25', '홈페이지 · 채팅 문의')]
fun = '<div class="flow2">' + '<i class="ar">→</i>'.join(f'<div><span>{n}</span><b>{v}</b><em>{esc(d)}</em></div>' for n, v, d in FUN) + '</div>'
REF = [('검색', '네이버 37 · 구글 25 · 기타 2', 64, 4), ('직접 연락', '대표전화 28 · 개인전화 12 · 추천 · 이메일', 46, 21), ('자사 채널', '홈페이지 37 · 기타 6 · 해피톡 1', 44, 3), ('외주 블로그', '팀부스터(boosterlink 포함) 30 · 인플루언서 1', 31, 1),
       ('광고', '네이버 16 — miracleintip 경유 15 포함', 16, 0), ('생성형 AI', 'ChatGPT · Gemini · AI 검색', 11, 0), ('자사 블로그', '네이버 블로그', 3, 0)]
rrows = ''.join(f'<tr><td><b>{n}</b><span class="dsub">▸ {sub}</span></td><td class="num">{q}</td><td class="c"><span class="mbar"><i style="width:{q / 64 * 100:.0f}%"></i></span></td><td class="num">{a}</td><td class="num">{a / q * 100:.0f}%</td></tr>' for n, sub, q, a in REF)
LAND = [('/pages/smart-safe', '스마트 안전', 11), ('/contact', '문의하기', 5), ('/pages/ai-solutions', 'AI 솔루션', 3), ('/pages/vms', 'VMS', 2), ('/', '첫 화면', 2), ('/pages/edgeaicctv', '엣지 AI CCTV', 1)]
lrows = ''.join(f'<tr><td class="mono">{p}</td><td>{n}</td><td class="num">{q}</td></tr>' for p, n, q in LAND)
B = f'''<div class="pg2 wide"><div class="h2top"><h1 style="margin:0;font-size:18px">문의까지 가는 길</h1><span class="muted">어디서 와서 · 무엇을 보고 · 어디서 멈추나</span><span class="sp"></span><span class="btn sm">2026년 10월 ▾</span></div>
<div class="card2x"><div class="ch"><b>10월 흐름</b><span class="muted">단계 사이 넘어간 비율은 문의 페이지 열람 · 제출이 쌓이는 11월부터 (오팀장 10/23)</span></div>{fun}</div>
<div class="g2"><div class="card2x"><div class="ch"><b>들어온 곳 → 문의 · 도입</b><span class="muted">7~10월 문의 · 유입 분류 11 · ▸ 펼치면 원래 출처 이름</span></div>
<table class="ds fixed"><colgroup><col style="width:40%"><col style="width:12%"><col style="width:24%"><col style="width:12%"><col style="width:12%"></colgroup><thead><tr><th>들어온 곳</th><th>문의</th><th></th><th>도입</th><th>도입률</th></tr></thead><tbody>{rrows}</tbody></table></div>
<div class="card2x"><div class="ch"><b>문의 직전에 본 페이지</b><span class="muted">연결률: 10월 웹 문의 27 중 랜딩 4 · 레퍼러 25 → 랜딩 전수 기록(마케팅 GTM + CRM)</span></div>
<table class="ds fixed"><colgroup><col style="width:44%"><col style="width:40%"><col style="width:16%"></colgroup><thead><tr><th>주소</th><th>페이지</th><th>문의</th></tr></thead><tbody>{lrows}</tbody></table>
<div class="ch" style="margin-top:12px"><b>문의 주제</b><span class="muted">7~10월 · 태그</span></div><div class="tags"><span>가격·견적 117</span><span>AI CCTV 72</span><span>동영상기록관리 43</span><span>TBM·안전교육 26</span><span>체감온도 16</span><span>자료요청 12</span><span>산안비 8</span></div></div></div></div>'''
FB = frame('분석 › 문의까지 가는 길', '문의까지 가는 길', B, h=900)

# ───────── 3. 파이프라인 (= 파이프라인 분석 + 전환 소요 기간) · 2026-10-23 실데이터 ─────────
# 2026 문의 중 열린 리드 307 (컨텍 180 · 제안 93 · 예정 25 · 미팅 6 · 신규 2 · 도입직전 1), 30일+ 기록 없음 175, 다음 할 일 날짜 있는 리드 0
STG = ['신규리드', '컨텍', '예정', '제안', '미팅', '도입직전']
AGE = {'신규리드': [2, 0, 0, 0], '컨텍': [19, 36, 48, 77], '예정': [3, 13, 5, 4], '제안': [14, 40, 18, 21], '미팅': [0, 5, 1, 0], '도입직전': [1, 0, 0, 0]}  # 마지막 기록 후 지난 날 (10/23)
def cell(v, k):
    cls = ' class="num hot"' if k == 3 and v >= 10 else ' class="num warm"' if k == 2 and v >= 10 else ' class="num"'
    return f'<td{cls}>{v or "—"}</td>'
arows = ''.join(f'<tr><td><b>{st}</b></td>' + ''.join(cell(v, k) for k, v in enumerate(AGE[st])) + f'<td class="num"><b>{sum(AGE[st])}</b></td></tr>' for st in STG)
OWN = [('최한별', 233, 162, 75, 162), ('박성언', 24, 8, 14, 17), ('김규재', 10, 0, 1, 1), ('유라예', 2, 0, 7, 16), ('전성환', 4, 0, 3, 23), ('미배정', 34, 4, 6, 18)]  # 30일+ = 마지막 기록 후 31일 넘음, 합 174
orows = ''.join(f'<tr><td>{av(n) if n != "미배정" else ""} <b>{n}</b></td><td class="num">{o}</td><td class="num{" hot" if st >= 50 else ""}">{st}</td><td class="num">{w}</td><td class="num">{l}</td><td class="num">{w / (w + l) * 100:.0f}%</td></tr>' for n, o, st, w, l in OWN)
DUR = [('7일 안', 34), ('8~30일', 28), ('31~90일', 27), ('90일 넘어', 16)]
drows = ''.join(f'<div class="fn"><span class="l">{n}</span><span class="bar"><i style="width:{v / 34 * 100:.0f}%"></i></span><b>{v}</b><span class="muted">{v / 105 * 100:.0f}%</span></div>' for n, v in DUR)
MON = [('1월', 77, 13, 53), ('2월', 64, 10, 47), ('3월', 81, 18, 40), ('4월', 91, 13, 32), ('5월', 58, 6, 20), ('6월', 64, 17, 10), ('7월', 72, 12, 11), ('8월', 70, 6, 18), ('9월', 34, 4, 3), ('10월', 39, 7, 3)]
mrows2 = ''.join(f'<tr><td>{m}</td><td class="num">{n}</td><td class="num">{w}</td><td class="num">{l}</td><td class="num">{n - w - l}</td><td class="c"><span class="stk"><i class="w" style="width:{w / n * 100:.0f}%"></i><i class="l" style="width:{l / n * 100:.0f}%"></i><i class="o" style="width:{(n - w - l) / n * 100:.0f}%"></i></span></td></tr>' for m, n, w, l in MON)
C = f"""<div class="pg2 wide"><div class="h2top"><h1 style="margin:0;font-size:18px">파이프라인</h1><span class="muted">지금 어디에 쌓여 있고 · 얼마나 걸리고 · 무엇을 정리할까</span><span class="sp"></span><span class="btn sm">담당 전체 ▾</span><span class="btn sm">기간: 2026년 문의 ▾ (전체 · 연 · 분기 · 월)</span></div>
<div class="seg2"><span class="on">전체</span><span>민간 현장</span><span>공공 현장</span><span>설계 반영</span><span>기존 고객</span><em class="muted">건 유형 탭 — 걸리는 시간이 달라 나눠 봄</em></div>
<div class="kpis"><div><span>열린 리드</span><b>307</b><em class="muted">컨텍 180 · 제안 93</em></div><div><span>마지막 기록 후 30일+</span><b class="due">174</b><em class="muted">열린 리드의 57%</em></div><div><span>10월 문의 중 도입</span><b>7</b><em class="muted">10월 문의 39</em></div><div><span>도입까지 (중앙값)</span><b>19일</b><em class="muted">도입 106 · 날짜 있는 105</em></div><div><span>예정 · 도입직전</span><b>26</b><em class="muted">곧 결정될 건</em></div></div>
<div class="ins"><div class="r"><b>열린 307 중 174가 마지막 기록 후 30일+</b><span>진행 중은 130 안팎 (추정) · 관심 프로젝트로 구분</span><button class="btn sm">관심 프로젝트 후보 보기</button></div><div class="w"><b>도입의 59%가 문의 후 30일 안</b><span>41%는 31일 이후 · 90일 넘어 16</span></div><div class="w"><b>건 유형마다 걸리는 시간이 다름</b><span>공공 30~90일 · 설계 반영 1년 이상</span></div></div>
<div class="g2"><div class="card2x"><div class="ch"><b>단계 × 마지막 기록 후 지난 날</b><span class="muted">연주황 = 31~90일 10건+ · 연빨강 = 90일+ 10건+ · 칸을 누르면 목록</span></div>
<table class="ds fixed"><colgroup><col style="width:24%"><col style="width:13%"><col style="width:13%"><col style="width:13%"><col style="width:13%"><col style="width:13%"></colgroup><thead><tr><th>단계</th><th>7일 안</th><th>8~30일</th><th>31~90일</th><th>90일 넘음</th><th>합계</th></tr></thead><tbody>{arows}</tbody></table>
<div class="ch" style="margin-top:12px"><b>도입까지 걸린 날</b><span class="muted">2026 문의 → 도입 (도입일 있는 105건)</span></div>{drows}</div>
<div class="card2x"><div class="ch"><b>담당별</b><span class="muted">2026 문의 · 도입률 = 도입 ÷ (도입 + 이탈)</span></div>
<table class="ds fixed"><colgroup><col style="width:28%"><col style="width:14%"><col style="width:18%"><col style="width:12%"><col style="width:12%"><col style="width:16%"></colgroup><thead><tr><th>담당</th><th>열림</th><th>마지막 기록<br>30일+</th><th>도입</th><th>이탈</th><th>도입률</th></tr></thead><tbody>{orows}</tbody></table>
<div class="ch" style="margin-top:12px"><b>문의한 달별 결과</b><span class="muted"><i class="lg lw"></i>도입 <i class="lg ll"></i>이탈 <i class="lg lo"></i>아직 열림</span></div>
<table class="ds fixed"><colgroup><col style="width:12%"><col style="width:12%"><col style="width:12%"><col style="width:12%"><col style="width:12%"><col style="width:40%"></colgroup><thead><tr><th>달</th><th>문의</th><th>도입</th><th>이탈</th><th>열림</th><th></th></tr></thead><tbody>{mrows2}</tbody></table></div></div></div>"""
FC = frame('분석 › 파이프라인', '파이프라인', C, h=1040)

# ───────── 3-b. 관심 · 중요 프로젝트 (중요 · 관심) 기획 — 10/23 사용자 제안, 마케팅팀 논의용 ─────────
# 실제 열린 리드(10/23)로 그림. "이유 · 기다리는 것 · 깨울 날"은 예시 문장
IMP = [('계룡건설산업', '고양장항 S-1BL 5공구', '과금 중', '최한별', '6 · 7월분 입금 확인 (시트 10/22)', '8월분 납기 10.31 · 미납 2건', 'warn', '미납 2'),
       ('효성중공업(주)', '현장 14곳 (본사 묶음 청구)', '과금 중', '최한별', '10월 청구 819,500 추가', '—', 'ok', '정상'),
       ('신세계푸드', '현장 (식품 공장)', '과금 중', '박성언', '9월분 입금 확인 (시트 10/22)', '—', 'ok', '정상')]
irows = ''.join(f'<tr><td>★ <b>{c}</b></td><td>{site}</td><td>{chip("info", st)}</td><td>{av(o)} {o}</td><td>{ch}</td><td class="muted">{nx}</td><td>{chip(k, lb)}</td></tr>' for c, site, st, o, ch, nx, k, lb in IMP)
WAKE = [('이번 달', [('대방건설', '공공 현장', '도입 결정 — 도입직전 · 견적 확정 · 계약서 대기', '10.31', '최한별'), ('SODA건축사사무소', '설계 반영', '입찰 — 설계 사양에 우리 제품 반영 → 공고 · 낙찰', '10.31', '최한별')]),
        ('11월', [('대우건설', '공공 현장', '본사 결재 (구매 품의)', '11.14', '박성언'), ('에스이오피 건축사사무소', '설계 반영', '발주처 예산 반영', '11.28', '최한별')]),
        ('12월 ~ 내년 1분기', [('건축학동건축사사무소', '설계 반영', '입찰 → 낙찰 시공사 착공', '2027.01', '최한별'), ('한국전력공사', '공공 현장', '내부 결재 · 내년 예산', '2027.02', '최한별')])]
wcols = ''.join(f'<div class="wk"><div class="wh">{h} <span class="muted">{len(it)}</span></div>' + ''.join(f'<div class="wc"><b>☆ {c}</b><span>{t} · {av(o)} {o}</span><span class="muted">기다리는 것: {wf}</span><em>예상 시점 {d}</em></div>' for c, t, wf, d, o in it) + '</div>' for h, it in WAKE)
D = f"""<div class="pg2 wide"><div class="h2top"><h1 style="margin:0;font-size:18px">관심 · 중요 프로젝트</h1><span class="muted">매일 체크할 진행 중 현장과, 설계 중 · 도입까지 오래 걸릴 현장</span><span class="sp"></span><span class="btn sm">담당 전체 ▾</span><span class="btn sm">건 유형 전체 ▾</span></div>
<div class="kpis"><div><span>★ 중요 프로젝트</span><b>3</b><em class="muted">오늘 바뀐 것 3</em></div><div><span>☆ 관심 프로젝트</span><b>6</b><em class="muted">이번 달 예상 시점 2</em></div><div><span>살필 것</span><b>1</b><em class="muted">미납 · 납기 9일</em></div><div><span>후보 (확인 대기)</span><b>6</b><em class="muted">CRM 이 제안 · 담당이 정함</em></div><div><span>나머지 열린 리드</span><b>301</b><em class="muted">파이프라인에서</em></div></div>
<div class="cd-h"><b>★ 중요 프로젝트 — 오늘 체크</b><span class="muted">도입이 결정돼 이미 진행 중(설치 · 과금)이고 매일 봐야 하는 현장 · 회사 · 어제 이후 바뀐 것만 위로</span></div>
<table class="ds fixed"><colgroup><col style="width:15%"><col style="width:19%"><col style="width:9%"><col style="width:10%"><col style="width:22%"><col style="width:16%"><col style="width:9%"></colgroup>
<thead><tr><th>회사</th><th>현장</th><th>상태</th><th>담당</th><th>어제 이후 바뀐 것</th><th>다음에 올 것</th><th>오늘</th></tr></thead><tbody>{irows}</tbody></table>
<div class="cd-h" style="margin-top:14px"><b>☆ 관심 프로젝트</b><span class="muted">설계 중이거나 도입까지 시일이 걸릴 곳 · 고객 쪽 "예상 시점" 기준이라 오래 걸려도 정체로 안 보임</span></div>
<div class="wkb">{wcols}</div>
<div class="cd-h" style="margin-top:14px"><b>후보 — CRM 이 제안, 담당이 ★ / ☆ / 아님 중 고름</b></div>
<div class="cands"><span>공공기관 · 발주처 문의 <b>3</b></span><span>기존 고객의 새 현장 <b>1</b></span><span>"이번엔 진행 안 함" 고른 건 → 관심 프로젝트로 둘까요? <b>2</b></span></div>
<p class="cd-note" style="margin-top:8px">중요 프로젝트: 회사 · 상태 · 청구 · 입금 변화는 10/22 시트 동기화 실제 값, "다음에 올 것" 일부는 예시 · 관심 프로젝트: 회사 · 담당은 실제 열린 리드, 기다리는 것 · 예상 시점은 예시</p></div>"""
FD = frame('세일즈 › 관심 · 중요 프로젝트', '', D, h=900)

# ───────── 4. 문의 내용 (= 마케팅 리포트) · 2026 문의 651 실데이터 (10/23) ─────────
TOP = [('동영상기록관리', 117, 32, 33, '직접 연락 · 검색'), ('AI CCTV', 147, 31, 34, '직접 연락 · 검색'), ('가격·견적', 231, 31, 52, '검색 · 자사 채널'), ('LH', 11, 2, 3, '직접 연락 · 자사 채널'),
       ('체감온도·환경', 30, 3, 7, '검색 · 자사 채널'), ('공정·일보', 18, 2, 10, '검색 · 자사 채널'), ('TBM·안전교육', 52, 3, 17, '검색 · 자사 채널'), ('산안비', 13, 1, 4, '직접 연락 · 검색'),
       ('자료요청', 19, 1, 8, '자사 채널 · 직접 연락'), ('제휴', 11, 4, 2, '직접 연락 · 자사 채널'), ('기타', 202, 29, 105, '검색 · 자사 채널')]
trows = ''.join(f'<tr><td><b>{t}</b></td><td class="num">{n}</td><td class="num">{w}</td><td class="num">{l}</td><td class="num"><b>{w / (w + l) * 100:.0f}%</b></td><td class="c"><span class="mbar"><i style="width:{w / (w + l) * 100:.0f}%"></i></span></td><td class="muted">{g}</td></tr>' for t, n, w, l, g in TOP)
WK = [('08.31', 11, '가격·견적 7 · 동영상기록 5'), ('09.07', 9, 'AI CCTV 4 · 가격·견적 3'), ('09.14', 8, '가격·견적 5 · AI CCTV 3'), ('09.21', 5, 'AI CCTV 4 · 가격·견적 2'),
      ('09.28', 9, '가격·견적 4 · 제휴 2'), ('10.05', 8, '가격·견적 6 · TBM 2'), ('10.12', 15, '동영상기록 6 · 가격·견적 6'), ('10.19', 13, '가격·견적 8 · AI CCTV 5')]
wrows = ''.join(f'<tr><td>{d} 주</td><td class="num"><b>{n}</b></td><td class="c"><span class="mbar"><i style="width:{n / 15 * 100:.0f}%"></i></span></td><td class="muted">{t}</td></tr>' for d, n, t in WK)
FAQ = [('견적 · 단가 · 비용', 201, 23), ('설치 · 설치비', 66, 5), ('기간(몇 개월)', 51, 8), ('구매', 49, 6), ('전기 · 인터넷 없는 현장', 36, 5), ('렌탈 · 임대', 32, 5), ('공공 · 발주처 · 조달', 24, 4), ('자료 · 카탈로그 · 규격서', 19, 1), ('설계 반영', 15, 3), ('안전관리비 인정', 11, 1)]
frows = ''.join(f'<tr><td><b>{q}</b></td><td class="num">{n}</td><td class="num">{w}</td><td><span class="fact">FAQ · 용어 글 후보</span></td></tr>' for q, n, w in FAQ)
E4 = f"""<div class="pg2 wide"><div class="h2top"><h1 style="margin:0;font-size:18px">문의 내용</h1><span class="muted">무엇을 묻고 · 어떤 주제가 도입으로 가나</span><span class="sp"></span>
<span class="seg"><span class="on">주</span><span>월</span><span>분기</span><span>연</span></span><span class="btn sm">2026년 ▾</span><span class="btn sm">유입 분류 전체 ▾</span><span class="btn sm">고객 유형 전체 ▾</span></div>
<div class="kpis"><div><span>문의 (리드)</span><b>651</b><em class="muted">2026 · 이번 주 13</em></div><div><span>도입률 높은 주제</span><b>동영상기록 49%</b><em class="muted">AI CCTV 48%</em></div><div><span>가장 많이 묻는 것</span><b>가격 · 견적</b><em class="muted">231건 · 도입률 37%</em></div><div><span>주제 "기타"</span><b class="due">202</b><em class="muted">태그 규칙 보강 필요</em></div><div><span>원문 있는 문의</span><b>551</b><em class="muted">연락처 · 실명 숨김</em></div></div>
<div class="ins"><div class="w"><b>동영상기록 · AI CCTV 문의는 둘 중 하나가 도입</b><span>도입률 49% · 48% (도입 ÷ 도입+이탈)</span></div><div class="w"><b>TBM · 공정 · 자료요청은 15~17%</b><span>문의는 많지만 도입이 드묾</span></div><div class="r"><b>"기타" 202건 — 주제가 안 잡힘</b><span>원문 다시 태그 → 14종 보강</span></div></div>
<div class="g2"><div class="card2x"><div class="ch"><b>주제 × 도입</b><span class="muted">한 문의에 주제 여러 개 · 도입률 = 도입 ÷ (도입 + 이탈) · 주제를 누르면 원문 목록</span></div>
<table class="ds fixed"><colgroup><col style="width:22%"><col style="width:9%"><col style="width:9%"><col style="width:9%"><col style="width:10%"><col style="width:15%"><col style="width:26%"></colgroup><thead><tr><th>주제</th><th>문의</th><th>도입</th><th>이탈</th><th>도입률</th><th></th><th>많이 들어온 곳</th></tr></thead><tbody>{trows}</tbody></table></div>
<div class="card2x"><div class="ch"><b>주간 — 주간 §0 그대로</b><span class="muted">월요일 시작 · 최근 8주</span></div>
<table class="ds fixed"><colgroup><col style="width:20%"><col style="width:12%"><col style="width:24%"><col style="width:44%"></colgroup><thead><tr><th>주</th><th>문의</th><th></th><th>주제 상위 2</th></tr></thead><tbody>{wrows}</tbody></table>
<div class="ch" style="margin-top:12px"><b>자주 나오는 질문 → 마케팅 FAQ · 용어 글</b><span class="muted">원문 551건 키워드 · 한 문의가 여러 개</span></div>
<table class="ds fixed"><colgroup><col style="width:44%"><col style="width:14%"><col style="width:14%"><col style="width:28%"></colgroup><thead><tr><th>질문</th><th>문의</th><th>도입</th><th></th></tr></thead><tbody>{frows}</tbody></table></div></div></div>"""
F4 = frame('분석 › 문의 내용', '문의 내용', E4, h=980)

# ───────── 5. 매출 분석 (시트 동기화 · 2026 매출 현황 = CRM 1,985,176,968) ─────────
MON = [106618310, 97119250, 138911425, 242929750, 167364650, 180861493, 274573982, 176192116, 219309892, 175805644, 115173978, 90316478]
mx = max(MON)
mbars = ''.join(f'<div class="mb{" fut" if i >= 10 else ""}"><i style="height:{v / mx * 100:.0f}%"></i><span>{i + 1}</span><em>{v / 1e6:.0f}</em></div>' for i, v in enumerate(MON))
SVC = [('AI CCTV', 771214982), ('플랫폼', 320358424), ('기타', 164038402), ('타임랩스', 113776000), ('LTE · 인터넷 회선', 110654221), ('장비설치', 69419000), ('편집비용', 65216684), ('Wearable Cam', 57642000)]
srows = ''.join(f'<tr><td><b>{n}</b></td><td class="num">{v / 1e6:,.1f}</td><td class="num">{v / 1985176968 * 100:.0f}%</td><td class="c"><span class="mbar"><i style="width:{v / 771214982 * 100:.0f}%"></i></span></td></tr>' for n, v in SVC)
INF = [('직접 연락', 780747366), ('출처 모름 (리드 연결 없음)', 563019942), ('검색', 371406100), ('자사 채널', 178424424), ('미분류', 75987500), ('광고', 13892000), ('자사 블로그', 1699636)]
irows2 = ''.join(f'<tr{" class=dimr" if "모름" in n else ""}><td><b>{n}</b></td><td class="num">{v / 1e6:,.1f}</td><td class="num">{v / 1985176968 * 100:.0f}%</td><td class="c"><span class="mbar"><i style="width:{v / 780747366 * 100:.0f}%"></i></span></td></tr>' for n, v in INF)
TOPR = [('동영상기록관리', 238567184), ('AI CCTV', 140383818), ('LH', 105322000), ('제휴', 34615000), ('TBM · 안전교육', 25150000), ('공정 · 일보', 18500000), ('주제 없음 (기타 · 가격만)', 855739024)]
prow2 = ''.join(f'<tr><td><b>{n}</b></td><td class="num">{v / 1e6:,.1f}</td></tr>' for n, v in TOPR)
E5 = f"""<div class="pg2 wide"><div class="h2top"><h1 style="margin:0;font-size:18px">매출 분석</h1><span class="muted">매출이 어디서 · 무엇으로 · 누구에게서 나오나 — 매출 시트 동기화(매일 08시)</span><span class="sp"></span><span class="seg"><span>월</span><span>분기</span><span class="on">연</span></span><span class="btn sm">2026년 ▾</span><span class="btn sm">고객 유형 전체 ▾</span></div>
<div class="kpis"><div><span>2026 매출 (시트)</span><b>19.85억</b><em class="muted">11 · 12월 예정 2.05억 포함</em></div><div><span>10월</span><b>1.76억</b><em class="muted">9월 2.19억</em></div><div><span>매출 고객사</span><b>243</b><em class="muted">신규 고객 매출 55%</em></div><div><span>공공 현장 매출</span><b>48%</b><em class="muted">9.52억 · 민간 10.33억</em></div><div><span>리드 연결률</span><b>72%</b><em class="muted">매출 기준 · 고객 157/243</em></div></div>
<div class="ins"><div class="r"><b>매출 5.63억(28%)은 어느 문의에서 왔는지 모름</b><span>고객사 ↔ 리드 연결이 없음 · 이전 기록 · 매출 시트 고객사 ID 로 잇기</span></div><div class="w"><b>첫 문의가 직접 연락인 고객이 매출 7.81억</b><span>연결된 매출의 55%</span></div><div class="w"><b>주제가 잡힌 매출 1위 동영상기록관리 2.39억</b><span>AI CCTV 1.40억 · LH 1.05억</span></div></div>
<div class="card2x"><div class="ch"><b>월 매출</b><span class="muted">백만 원 · 11 · 12월은 시트에 이미 잡힌 예정(선납 · 계약)</span></div><div class="mbs">{mbars}</div></div>
<div class="g3"><div class="card2x"><div class="ch"><b>서비스별</b><span class="muted">백만 원</span></div><table class="ds fixed"><colgroup><col style="width:38%"><col style="width:22%"><col style="width:18%"><col style="width:22%"></colgroup><thead><tr><th>서비스</th><th>매출</th><th>비중</th><th></th></tr></thead><tbody>{srows}</tbody></table></div>
<div class="card2x"><div class="ch"><b>첫 문의 유입 분류별</b><span class="muted">고객사의 가장 이른 리드 기준</span></div><table class="ds fixed"><colgroup><col style="width:42%"><col style="width:20%"><col style="width:18%"><col style="width:20%"></colgroup><thead><tr><th>유입 분류</th><th>매출</th><th>비중</th><th></th></tr></thead><tbody>{irows2}</tbody></table></div>
<div class="card2x"><div class="ch"><b>첫 문의 주제별</b><span class="muted">백만 원 · 기타 · 가격만인 문의는 "주제 없음"</span></div><table class="ds fixed"><colgroup><col style="width:66%"><col style="width:34%"></colgroup><thead><tr><th>주제</th><th>매출</th></tr></thead><tbody>{prow2}</tbody></table>
<div class="ch" style="margin-top:10px"><b>공공 / 민간</b></div><div class="pp"><i style="width:48%">공공 48%</i><i style="width:52%">민간 52%</i></div><p class="cd-note">LH · 발주처 구분은 v4 프로젝트의 "발주처" 칸이 생기면</p></div></div>
<p class="cd-note" style="margin-top:8px">매출 = 매출 시트 "현장별 전체 매출" (CRM 동기화) · 금액을 누르면 고객사 · 프로젝트 목록 · 연결률 = 리드와 이어진 고객사의 매출 ÷ 전체</p></div>"""
F5 = frame('분석 › 매출 분석', '매출 분석', E5, h=980)

# 메뉴 재구성 표
MAP = [('마케팅', '<b>마케팅 효율</b>', '돈과 시간을 쓴 곳에서 문의 · 도입이 얼마나 나왔나 (주 · 월 · 분기 · 연)', '마케팅 분석(6탭) + 연간 비교', '아래 1'),
       ('마케팅', '<b>문의까지 가는 길</b>', '어디서 와서 무엇을 보고 어디서 멈추나', '방문자 여정 (세션 · 바운스 나열)', '아래 2'),
       ('세일즈', '<b>파이프라인</b>', '지금 어디에 쌓여 있고 얼마나 걸리나 · 담당별 · 정리할 것', '파이프라인 분석 + 전환 소요 기간', '아래 3'),
       ('세일즈', '<b>문의 내용</b>', '무엇을 묻고 어떤 주제가 도입으로 이어지나', '마케팅 리포트 (이름 변경)', '아래 4'),
       ('고객', '<b>코호트 · 생애 가치</b>', '언제 · 어디서 온 고객이 오래 남고 많이 내나', '유입 코호트 + 채널별 생애 가치 (탭 2)', '적용됨'),
       ('매출', '<b>매출 분석</b> 🆕', '서비스별 · 공공/민간 · 신규/기존 월 매출 흐름 · 유입 · 주제별 매출 (시트 동기화 데이터)', '손익 분석 자리 (매입 연동 전까지 숨김)', '아래 5'),
       ('—', '<s>개요</s>', '대시보드 프리셋 5가 같은 역할', '없앰', '')]
mrows = ''.join(f'<tr><td>{g}</td><td>{n}</td><td>{q}</td><td class="muted">{f}</td><td>{s}</td></tr>' for g, n, q, f, s in MAP)

CSS = '''<style>
#m-analytics-v3 .ds.fixed td{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
#m-analytics-v3 .kpis{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));border:1px solid var(--line);border-radius:8px;margin:10px 0}
#m-analytics-v3 .kpis div{padding:8px 12px;border-left:1px solid var(--line2);display:grid;gap:1px}#m-analytics-v3 .kpis div:first-child{border-left:0}
#m-analytics-v3 .kpis span{font-size:11.5px;color:var(--fg3)}#m-analytics-v3 .kpis b{font-size:18px;font-variant-numeric:tabular-nums}#m-analytics-v3 .kpis b.due{color:var(--due,#b4233a)}#m-analytics-v3 .kpis em{font-style:normal;font-size:11.5px}
#m-analytics-v3 .ins{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin-bottom:12px;align-items:start}#m-analytics-v3 .ins>div{border:0;border-radius:0;height:auto;min-height:0;background:none}
#m-analytics-v3 .ins div{border-left:3px solid var(--line);padding:4px 8px;font-size:12.5px;display:grid;align-content:start;gap:2px}#m-analytics-v3 .ins .w{border-color:#fdab3d}#m-analytics-v3 .ins .r{border-color:#b4233a}
#m-analytics-v3 .ins span{color:var(--fg2);font-size:12px}
#m-analytics-v3 .spk{color:var(--accent,#2563eb);vertical-align:middle}#m-analytics-v3 td.spkc{text-align:left}
#m-analytics-v3 .fn{display:grid;grid-template-columns:120px minmax(0,1fr) 60px 260px;gap:10px;align-items:center;font-size:12.5px;padding:4px 0}
#m-analytics-v3 .fn .bar{height:14px;background:var(--bg-subtle,#f7f7f8);border-radius:3px;overflow:hidden}#m-analytics-v3 .fn .bar i{display:block;height:100%;background:#579bfc}
#m-analytics-v3 .fn b{text-align:right;font-variant-numeric:tabular-nums}
#m-analytics-v3 .mbar{display:block;height:8px;background:var(--bg-subtle,#f7f7f8);border-radius:2px}#m-analytics-v3 .mbar i{display:block;height:100%;background:#579bfc;border-radius:2px}
#m-analytics-v3 .g2{display:grid;grid-template-columns:minmax(0,1.3fr) minmax(0,1fr);gap:12px;margin-top:12px}
#m-analytics-v3 .tags{display:flex;flex-wrap:wrap;gap:6px;font-size:12px}#m-analytics-v3 .tags span{border:1px solid var(--line);border-radius:4px;padding:1px 8px}
#m-analytics-v3 .mono{font-family:ui-monospace,Menlo,monospace;font-size:11.5px}
#m-analytics-v3 .seg{display:inline-flex;border:1px solid var(--line);border-radius:6px;overflow:hidden;font-size:12px}#m-analytics-v3 .seg span{padding:2px 10px}#m-analytics-v3 .seg .on{background:var(--fg);color:var(--bg)}
#m-analytics-v3 .wkb{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}
#m-analytics-v3 .wk{background:var(--bg-subtle,#f7f7f8);border-radius:8px;padding:8px;display:grid;gap:6px;align-content:start}#m-analytics-v3 .wh{font-size:12.5px;font-weight:600}
#m-analytics-v3 .wc{background:var(--bg,#fff);border:1px solid var(--line);border-radius:6px;padding:6px 8px;display:grid;gap:2px;font-size:12px}#m-analytics-v3 .wc em{font-style:normal;color:#579bfc;font-size:11.5px}
#m-analytics-v3 .cands{display:flex;gap:8px;flex-wrap:wrap;font-size:12.5px}#m-analytics-v3 .cands span{border:1px dashed var(--line);border-radius:6px;padding:4px 10px}
#m-analytics-v3 td.duet{color:#b4233a;font-weight:600}
#m-analytics-v3 .kpis{height:auto!important}#m-analytics-v3 .kpis div{min-height:74px;align-content:start;padding-bottom:8px}#m-analytics-v3 .kpis em{display:block;margin-left:0!important;white-space:normal;line-height:1.35}
#m-analytics-v3 table.ds th{white-space:normal;line-height:1.25;vertical-align:bottom}#m-analytics-v3 th small{font-weight:400;color:var(--fg3)}
#m-analytics-v3 .dsub{display:block;font-size:11px;color:var(--fg3);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
#m-analytics-v3 .fact{display:inline-block;background:var(--bg-subtle,#f2f2f4);border-radius:4px;padding:1px 6px;font-size:11.5px;color:var(--fg2);max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;vertical-align:middle}#m-analytics-v3 .memo{font-size:11px;color:var(--accent,#2563eb);margin-left:4px}
#m-analytics-v3 .ins>div button{justify-self:start;margin-top:4px}
#m-analytics-v3 .flow2{display:flex;align-items:stretch;gap:6px;flex-wrap:wrap}#m-analytics-v3 .flow2>div{flex:1;min-width:110px;border:1px solid var(--line);border-radius:6px;padding:6px 8px;display:grid;gap:1px}#m-analytics-v3 .flow2 span{font-size:11.5px;color:var(--fg3)}#m-analytics-v3 .flow2 b{font-size:18px}#m-analytics-v3 .flow2 em{font-style:normal;font-size:11px;color:var(--fg2)}#m-analytics-v3 .flow2 .ar{align-self:center;font-style:normal;color:var(--fg3)}
#m-analytics-v3 .seg2{display:flex;gap:4px;align-items:center;font-size:12px;margin:8px 0}#m-analytics-v3 .seg2 span{border:1px solid var(--line);border-radius:999px;padding:1px 10px}#m-analytics-v3 .seg2 .on{background:var(--fg);color:var(--bg)}#m-analytics-v3 .seg2 em{font-style:normal;margin-left:6px}
#m-analytics-v3 .g3{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;margin-top:12px}
#m-analytics-v3 .mbs{display:grid;grid-template-columns:repeat(12,minmax(0,1fr));gap:8px;height:150px;align-items:end;padding-top:6px}
#m-analytics-v3 .mb{display:grid;grid-template-rows:1fr auto auto;height:100%;text-align:center;font-size:11px}#m-analytics-v3 .mb i{align-self:end;display:block;background:#579bfc;border-radius:3px 3px 0 0}#m-analytics-v3 .mb.fut i{background:repeating-linear-gradient(45deg,#cfe0fd,#cfe0fd 3px,#e8f0fe 3px,#e8f0fe 6px)}
#m-analytics-v3 .mb span{color:var(--fg3)}#m-analytics-v3 .mb em{font-style:normal;color:var(--fg2)}
#m-analytics-v3 .pp{display:flex;height:22px;border-radius:4px;overflow:hidden;font-size:11.5px}#m-analytics-v3 .pp i{display:flex;align-items:center;justify-content:center;font-style:normal;color:#fff}#m-analytics-v3 .pp i:first-child{background:#579bfc}#m-analytics-v3 .pp i:last-child{background:#9b9ea6}
#m-analytics-v3 tr.dimr td{color:var(--fg3);background:var(--bg-subtle,#f7f7f8)}
#m-analytics-v3 td.hot{background:#fdecef;color:#b4233a;font-weight:600}#m-analytics-v3 td.warm{background:#fff4e5}
#m-analytics-v3 .stk{display:flex;height:10px;border-radius:2px;overflow:hidden;background:var(--bg-subtle,#f7f7f8)}#m-analytics-v3 .stk i,#m-analytics-v3 i.lg{display:inline-block;height:100%}
#m-analytics-v3 .stk .w,#m-analytics-v3 i.lg.lw{background:#00c875}#m-analytics-v3 .stk .l,#m-analytics-v3 i.lg.ll{background:#c4c4c4}#m-analytics-v3 .stk .o,#m-analytics-v3 i.lg.lo{background:#579bfc}
#m-analytics-v3 i.lg{display:inline-block!important;width:8px!important;height:8px!important;border-radius:2px;margin:0 3px 0 8px;vertical-align:middle}
</style>'''
SEC = f'''<section id="m-analytics-v3">{CSS}<h2>분석 — 메뉴 재구성 v3 (시안 2026-10-22 · 실데이터 7~10월)</h2>
<p class="rule">10/22 사용자: "마케팅 분석은 실제 업무에 참고가 잘 안 되는 부분이 있고, 방문자 여정도 새로 구성하면 좋겠다." 지금 분석 메뉴 10개 중 겹치는 것이 많고(연간 탭 = 연간 비교, 전환 소요 2곳), 마케팅 분석은 예산 · CPA 탭이 늘 펼쳐져 있어 지금처럼 예산 0 · 구글 광고 미집행인 달엔 빈 차트만 보임 (캠페인 일예산 21개 모두 0, 예산표 0건). 지금 비용은 네이버 검색광고 월 70만 원대 + 외주 블로그 월 200만 원. <b>10/22 사용자: 예산 · 구글 광고는 언제든 다시 할 수 있음</b> → 기능은 남기고, 데이터가 있을 때만 보이게.</p>
<table class="dg"><colgroup><col style="width:8%"><col style="width:16%"><col style="width:36%"><col style="width:28%"><col style="width:12%"></colgroup><thead><tr><th>그룹</th><th>새 메뉴</th><th>답하는 질문</th><th>지금 화면</th><th>시안</th></tr></thead><tbody>{mrows}</tbody></table>
<div class="cmp"><div><h4>모든 분석 화면 공통</h4><ul><li>숫자 정의 하나: 문의 = 리드 기준, 유입 = 분류 11 (유입 성과 · 코호트와 같은 계산)</li><li>기간 선택은 화면 위 한 곳 (주 · 월 · 분기 · 연)</li><li>숫자를 누르면 그 리드 · 고객 목록</li><li>맨 위에 "한 줄 판단" 카드 3개까지 — 표를 읽기 전에 무엇을 할지</li></ul></div>
<div><h4>지금 화면에서 빼는 것</h4><ul><li>예산 대 실집행 · 집행률을 늘 띄우는 탭 → 예산을 넣은 달 · 캠페인에만 "예산 대비" 칸이 생김 (기능은 유지)</li><li>채널별 CPA 차트 → "돈 쓴 곳" 표의 문의당 비용 칸 (구글 · 메타 · 유튜브를 다시 하면 그 달 그 줄이 자동으로 생김)</li><li>세션 · 바운스 · 체류 숫자 나열 (행동으로 이어지지 않음)</li><li>AI 분석용 프롬프트 복사 (한 줄 판단 카드로 대체)</li></ul></div></div>
<h3 class="ph3">1. 마케팅 효율 — 마케팅 분석 + 연간 비교 대체 (10월 · 실데이터)</h3><div class="fwrap">{FA}</div>
<p class="rule">분류는 <b>유입 분류 11 전부</b>(10/23 마케팅팀) — "돈 쓴 곳 · 돈 안 쓴 곳 · 직접 연락" 3묶음. <b>묶음은 고정이 아니라 그 기간에 비용이 있느냐로 자동</b> — 구글 광고를 다시 켜면 그 달부터 "돈 쓴 곳"에 줄이 생기고, 예산을 넣으면 "예산 · 소진율" 칸이 붙음. 광고 자동 수집(구글 · 네이버)은 그대로. 외주 · 행사 비용은 [비용 입력]으로 사용자가 직접(10/22). 직접 연락(도입 29 중 21)은 통화 때 묻지 않고 GA 전화클릭 채널 분포로 짐작(10/22). 마지막 칸은 CRM 이 쓰는 숫자 사실(회색 칩)과 사람이 다는 판단(+ 판단)을 나눔 (10/23 마케팅팀). 10/23 수정: miracleintip = 광고 › 네이버(외주 아님) · 생성형 AI · 언론 · 소셜 · 외부 글 · 커뮤니티 · 미분류 줄 추가 · "블로그(직영)" → 자사 블로그 · 문의 클릭은 클릭 수(사람 수 아님).</p>
<h3 class="ph3">2. 문의까지 가는 길 — 방문자 여정 대체 (10월 흐름 · 7~10월 들어온 곳)</h3><div class="fwrap">{FB}</div>
<p class="rule">세션 · 바운스 나열 대신 "방문 → 서비스 페이지 봄 → 문의 클릭 → 문의 페이지 열람 → 문의 제출 → 리드" 한 줄 흐름과, 유입 분류 11별 문의 · 도입. 10/23 수정(오팀장): 문의 클릭은 메뉴의 문의하기까지 세는 클릭 수라 양식 이탈 판단에 못 씀 → 문의 페이지 열람(/contact) → 문의 제출(fin-contact, 10/21 부터 다시 수집)로 보고 판단은 11월 데이터부터. "서비스 페이지 봄" = /pages · /products 를 본 세션, GA 페이지 데이터로 계산. 랜딩 페이지는 10월 웹 문의 27 중 4건만 남음 → 마케팅 GTM 이 첫 방문 페이지 · 처음 들어온 곳을 문의 폼 숨은 칸으로 보내고 CRM 이 받음 (우선순위 2). 들어온 곳 표는 분류 11, 원래 출처 이름(miracleintip · boosterlink 등)은 펼치기.</p>
<h3 class="ph3">3. 파이프라인 — 파이프라인 분석 + 전환 소요 기간 대체 (2026 문의 · 10/23 실데이터)</h3><div class="fwrap">{FC}</div>
<p class="rule">지금 파이프라인 분석은 퍼널 · 담당 · 업종 · 채널 · 에이징 · 단계 변경을 한 화면에 나열. 새 화면은 질문 셋 — <b>어디에 쌓였나</b>(단계 × 지난 날), <b>얼마나 걸리나</b>(도입까지 날 · 문의한 달별 결과), <b>누가 무엇을 정리할까</b>(담당별 30일+ 기록 없음). 업종 · 채널별 전환은 코호트 · 마케팅 효율로 옮김. "휴면"은 단계가 아니라 표시 — 2023~25 이전 기록처럼 몇 년 뒤 다시 문의하는 경우가 많아 이탈로 닫지 않고, 다시 문의하면 같은 리드로 이어짐. 전성환 줄은 테스트 리드 포함(10/21 사용자: 그대로 둠).</p>
<h3 class="ph3">3-b. 관심 · 중요 프로젝트 — 중요 프로젝트 · 관심 프로젝트 (기획 초안 v2 2026-10-23 · 사용자 정의 반영 · 마케팅팀 · 세일즈 논의용)</h3>
<p class="rule">10/23 국장님: "휴면을 날짜로 정하기보다 관심 있게 관심 프로젝트을 따로 모아서 보는 것도 좋겠다 · 중요 프로젝트과 관심 프로젝트 등으로 구별." 국장 정정(공공 30~90일 기본 · 설계 반영 1년 이상 · 날짜 하나로 휴면 금지)과 합침.</p>
<table class="dg"><colgroup><col style="width:16%"><col style="width:42%"><col style="width:42%"></colgroup><thead><tr><th></th><th>★ 중요 프로젝트</th><th>☆ 관심 프로젝트</th></tr></thead><tbody>
<tr><td><b>뜻 (사용자 정의 10/23)</b></td><td><b>이미 진행되고 있는 현장인데, 데일리로 체크해야 하는 현장 (혹은 회사)</b> — 도입 결정 뒤: 설치 중 · 과금 중</td><td><b>설계 중이거나 도입까지 시일이 걸릴 만한 곳</b> — 대부분 공공 · 대형 건설사 현장. 결재가 오래 걸리고, 입찰 사양에 우리 제품을 넣어 낙찰 · 착공을 기다리는 경우 (국장님 10/23)</td></tr>
<tr><td><b>흐름 (국장님 10/23)</b></td><td colspan="2">리드 → <b>☆ 관심 프로젝트</b> (설계 중 · 결재 · 입찰 · <b>도입직전</b>) → <b>도입 결정</b> → <b>★ 중요 프로젝트</b> (설치 · 과금 중 · 데일리 체크) → 공사 종료 · 회수 → 표시 해제. 관심에서 중요로 무조건 가지는 않음 (도입 안 되면 관심에서 해제) · 관심을 거치지 않고 바로 중요가 되는 건도 있음</td></tr><tr><td><b>붙이는 칸</b></td><td>왜 중요한가 (한 줄) · 단위: 현장(프로젝트) 또는 회사(고객사 전체)</td><td>기다리는 것 (결재 / 입찰 — 우리 제품 사양 반영 · 공고 · 낙찰 / 발주처 사양 · 지침 확인 / 설계 확정 / 예산 반영 / 착공 / 기타) · 입찰이면 공고번호 · 낙찰 예정일 · 낙찰 시공사 · 예상 시점(고객 쪽 일정) · 한 줄 메모</td></tr>
<tr><td><b>챙기는 기준</b></td><td>매일 — "어제 이후 바뀐 것": 청구 · 입금 · 미납(시트 08시) · 장비 출고 · 교체 · 회수 · 메일 회신 · VoC · 단계 변경 · 공사 종료 임박</td><td>고객 쪽 일정과 고객에게서 오는 신호 — 우리가 연락할 주기가 아님 (국장님 10/23: "우리가 먼저 연락한다고 움직이는 게 아니다") · 지난 날로 정체 표시 안 함</td></tr>
<tr><td><b>보는 곳</b></td><td>대시보드 맨 위 "오늘 체크할 중요 프로젝트" · 관심 · 중요 프로젝트 · 프로젝트 상세 머리 ★</td><td>세일즈 › 관심 · 중요 프로젝트(예상 시점 순) · 신호가 오면 대시보드 맨 위</td></tr>
<tr><td><b>알려 주는 신호 (자동)</b></td><td colspan="2">고객 쪽에서 움직임이 생길 때만: 같은 회사 / 연락처 다시 문의(이미 자동 연결) · 견적 회신(견적서 연동 뒤) · 같은 고객사 다른 현장 매출 시작(시트 동기화) · 예상 시점이 다가옴 → 담당에게 알림</td></tr>
<tr><td><b>누가 붙이나</b></td><td>담당자 · 관리자. 후보 제안: 관심 프로젝트가 도입 결정(도입완료)되면 "중요로 옮길까요?" · 미납 생긴 과금 현장, 여러 현장을 쓰는 고객사</td><td>담당자. 후보 제안: 건축사 · 발주처 문의, 건 유형 "설계 반영", 담당이 "이번엔 진행 안 함"을 고를 때 "관심 프로젝트로 둘까요?"</td></tr></tbody></table>
<div class="cmp"><div><h4>나머지 리드 (표시 없음)</h4><ul><li><b>연락 주기 · "연락 필요 / 연락 지남" 표시는 쓰지 않음</b> — 국장님 10/23: 우리가 먼저 연락한다고 건이 움직이지 않음 (국장 정정안의 연락 주기 부분 대체). 대신 "마지막 고객 신호"(문의 · 회신 · 미팅 · 매출)를 보여 줌</li><li>건 유형(민간 현장 · 공공 현장 · 설계 반영 · 기존 고객)은 유지 — 걸리는 시간이 달라 분석을 나눠 보는 용도</li><li>휴면은 자동으로 붙이지 않음 — 담당이 "진행 안 함"을 고를 때만, 그때 관심 프로젝트 후보로 먼저 물음</li><li>건 유형 첫 값: 기존 고객 = 매출 있는 고객사 연결 리드 자동 · 공공/민간 = 리드 "현장 분류"(2026 문의 51% 빈칸 → 매출 시트 값으로 채움) · 설계 반영 = 업종 발주처 · 건축사 후보를 담당이 확인</li></ul></div>
<div><h4>분석 · 마케팅과 잇기</h4><ul><li>파이프라인: "관심 · 중요 프로젝트만" 필터 · 도입까지 걸린 날을 건 유형별로</li><li>마케팅: 관심 프로젝트을 주제 · 고객 유형 · 기다리는 것별 <b>건수</b>로 (연락처 없이) → 분기 재접촉 콘텐츠 기획 (회의록 6장 5번)</li><li>v4 프로젝트 구조가 생기면 표시는 리드 → 프로젝트로 옮김 (같은 현장의 견적 · 매출 · 장비와 한 곳)</li></ul></div></div>
<h3 class="ph3">3-b 화면 — 세일즈 › 관심 · 중요 프로젝트 (실데이터 + 예시 표시)</h3><div class="fwrap">{FD}</div>
<div class="cmp"><div><h4>논의할 것 (마케팅팀 · 세일즈)</h4><ul><li>✔ 이름: 관심 프로젝트 ☆ / 중요 프로젝트 ★ · 흐름 관심 → (도입 결정) → 중요 (국장님 10/23)</li><li>✔ 뜻: 중요 = 도입 결정 뒤 진행 중 · 데일리 체크 / 관심 = 설계 중 · 결재 · 입찰 · 도입직전 (국장님 10/23)</li><li>✔ 연락 주기 기준 쓰지 않음 (국장님 10/23)</li><li>중요 프로젝트 "어제 이후 바뀐 것" 중 무엇을 위로 올릴지 (미납 · 장비 · VoC 우선순위)</li><li>중요 프로젝트 상한 — 담당당 10건 안팎 권장 (데일리로 볼 수 있는 양)</li><li>✔ "기다리는 것" 목록: 결재 · 입찰 · 발주처 사양 · 지침 확인 · 설계 확정 · 예산 · 착공 · 기타 (마케팅팀 10/23 — 항목별 영업 지원 자료를 마케팅팀이 만듦)</li><li>주간 회의 사용 · 중요 프로젝트 순서 · 상한 = 세일즈 · 국장님 결정 · 마케팅팀은 월 1회 "기다리는 것별 건수"</li><li>입찰 건: 낙찰되면 낙찰 시공사를 고객사로 잇고 현장(프로젝트)을 만듦 — 관심 → 중요로 넘어가는 지점 · (나중) 나라장터 공고 · 낙찰 결과 자동 확인</li><li>자동 후보 기준 · 주간 회의에서 이 화면을 쓸지</li></ul></div>
<div><h4>결정됨</h4><ul><li>✔ 이탈 사유 칸은 만들지 않음 — <b>국장님 결정 10/23</b> ("의미 없음"). 회의록 6장 3번 · 8장 3순위 제외</li><li>✔ 휴면 = 날짜 하나로 정하지 않음 (국장 10/23)</li></ul></div></div>
<h3 class="ph3">4. 문의 내용 — 마케팅 리포트 대체 (2026 문의 651 · 10/23 실데이터)</h3><div class="fwrap">{F4}</div>
<p class="rule">마케팅팀 3-4장 반영: ① 주제 14종 × 도입률 ② 주제 × 유입 분류(많이 들어온 곳 · 필터) ③ 원문에서 자주 나오는 질문 → FAQ · 용어 글 후보 ④ 주간 §0 루틴 그대로(주 단위 기본) ⑤ 연락처 · 실명 숨김. 원문 키워드는 정규식 수(한 문의가 여러 질문). "기타" 태그 202건은 태그 규칙 보강 대상 — 원문을 다시 태그하면 14종 숫자가 바뀜.</p>
<h3 class="ph3">5. 매출 분석 — 손익 분석 자리 (매출 시트 동기화 · 2026 = 1,985,176,968)</h3><div class="fwrap">{F5}</div>
<p class="rule">마케팅팀 3-4장 반영: ① 리드 → 고객사 → 매출 연결률을 맨 위(매출 기준 72% · 고객 157/243), 연결 안 된 매출은 "출처 모름" 줄로 따로 ② 첫 문의 유입 분류 · 주제별 매출(2027 재설계 "매출 어디") ③ 공공 / 민간 — LH · 발주처는 v4 프로젝트 "발주처" 칸이 생기면. 11 · 12월은 시트에 이미 잡힌 예정 매출(선납 · 계약)이라 빗금. 첫 문의 기준 = 고객사의 가장 이른 리드 — 기존 고객의 추가 현장 매출도 처음 들어온 경로로 셈 (프로젝트 단위 유입은 v4 뒤).</p>
<div class="cmp"><div><h4>정해 주실 것</h4><ul><li>개요 없앰 · 손익 분석 숨김</li><li>파이프라인: 휴면 · 연락 기준 대신 관심 · 중요 프로젝트(3-b)으로</li><li>✔ 분석 메뉴 10 → 6 (10/22)</li><li>✔ 외주 · 행사 비용 = 사용자가 직접 [비용 입력] (10/22)</li><li>✔ 전화 출처는 묻지 않음 → GA 전화클릭 채널 분포로 (10/22)</li><li>✔ 서비스 페이지 봄 = GA 페이지 데이터로 (설정 추가 없음)</li></ul></div>
<div><h4>순서 (합의 후)</h4><ul><li>1 마케팅 효율 · 문의까지 가는 길 (마케팅 2개)</li><li>2 파이프라인 · 문의 내용 (세일즈 2개)</li><li>3 매출 분석 (시트 동기화 데이터)</li><li>4 메뉴 정리 (개요 · 손익 · 연간 비교 · 방문자 여정 옛 화면 내림)</li></ul></div></div></section>'''

s = open(P, encoding='utf-8').read()
if '<section id="m-analytics-v3"' in s:
    i = s.index('<section id="m-analytics-v3"'); j = s.index('</section>', i) + len('</section>'); s = s[:i] + s[j:]
i = s.index('<section id="agg"'); s = s[:i] + SEC + s[i:]
s = re.sub(r'<a href="#m-analytics-v3" class="i">[^<]*</a>', '', s)
s = s.replace('<a href="#agg" class="i">', '<a href="#m-analytics-v3" class="i">분석 재구성 v3 (시안)</a><a href="#agg" class="i">', 1)
open(P, 'w', encoding='utf-8').write(s)
print('m-analytics-v3', len(SEC), 'doc', len(s), 'toc', '#m-analytics-v3' in s)
