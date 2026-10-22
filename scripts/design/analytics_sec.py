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
PAID = [('네이버 검색광고', 677_242, 261, 33, [3, 5, 4, 4], 0, ('warn', '문의당 17만 · 도입 0')),
        ('외주 블로그 (팀부스터)', 2_000_000, 27, 34, [10, 14, 6, 1], 1, ('bad', '문의 14 → 6 → 1'))]
FREE = [('검색 (자연)', 2899, 137, [28, 28, 10, 9], 4, ('warn', '8월 이후 ⅓')),
        ('자사 채널 (홈페이지 · 깃북 · 메일)', 1593, 39, [19, 9, 4, 11], 3, ('ok', '10월 회복')),
        ('블로그 (직영)', 63, 12, [2, 1, 0, 0], 0, ('na', '—'))]
PHONE = [('대표전화', [6, 7, 7, 7], 8), ('개인전화 (담당자)', [4, 2, 2, 5], 10)]
def prow(r):
    n, c, v, k, q, a, (t, j) = r
    return (f'<tr><td><b>{n}</b></td><td class="num">{won(c)}</td><td class="num">{won(v)}</td><td class="num">{k}</td><td class="num"><b>{q[-1]}</b></td>'
            f'<td class="num">{won(c / q[-1]) if q[-1] else "—"}</td><td class="c spkc">{spark(q)}<span class="muted"> {"·".join(map(str, q))}</span></td><td class="num">{a}</td><td>{chip(t, j)}</td></tr>')
def frow(r):
    n, v, k, q, a, (t, j) = r
    return (f'<tr><td><b>{n}</b></td><td class="num">—</td><td class="num">{won(v)}</td><td class="num">{k}</td><td class="num"><b>{q[-1]}</b></td>'
            f'<td class="num">—</td><td class="c spkc">{spark(q)}<span class="muted"> {"·".join(map(str, q))}</span></td><td class="num">{a}</td><td>{chip(t, j)}</td></tr>')
def phrow(r):
    n, q, a = r
    return (f'<tr><td><b>{n}</b></td><td class="num">—</td><td class="num">—</td><td class="num">—</td><td class="num"><b>{q[-1]}</b></td>'
            f'<td class="num">—</td><td class="c spkc">{spark(q)}<span class="muted"> {"·".join(map(str, q))}</span></td><td class="num"><b>{a}</b></td><td>{chip("na", "출처는 GA 전화클릭으로")}</td></tr>')
COLS = '<colgroup><col style="width:22%"><col style="width:9%"><col style="width:7%"><col style="width:7%"><col style="width:7%"><col style="width:9%"><col style="width:17%"><col style="width:7%"><col style="width:15%"></colgroup>'
TH = '<thead><tr><th>채널</th><th>비용</th><th>방문</th><th>문의 클릭</th><th>문의</th><th>문의당 비용</th><th>문의 7 · 8 · 9 · 10월</th><th>도입 7~10</th><th>한 줄 판단</th></tr></thead>'
A = f'''<div class="pg2 wide"><div class="h2top"><h1 style="margin:0;font-size:18px">마케팅 효율</h1><span class="muted">돈과 시간을 쓴 곳에서 문의 · 도입이 얼마나 나왔나</span><span class="sp"></span>
<span class="seg"><span>주</span><span class="on">월</span><span>분기</span><span>연</span></span><span class="btn sm">2026년 10월 ▾</span><span class="btn sm quiet">비용 입력 (외주 · 행사)</span></div>
<div class="kpis"><div><span>쓴 돈</span><b>2,677,242</b><em class="muted">9월 2,772,503</em></div><div><span>문의 (리드)</span><b>38</b><em class="muted">9월 34 · 8월 70</em></div><div><span>돈 쓴 곳 문의</span><b>5</b><em class="muted">문의당 535,448</em></div><div><span>도입 (7~10월 문의 중)</span><b>28</b><em class="muted">전화 18 · 웹 10</em></div><div><span>출처 모르는 문의</span><b class="due">12</b><em class="muted">10월 전화 문의 전부</em></div></div>
<div class="ins"><div class="w"><b>외주 블로그: 월 200만 원, 문의 14 → 6 → 1</b><span>8월 이후 계속 줄어듦 · 7~10월 도입 1건 · 계약 조건 다시 보기</span></div><div class="w"><b>자연 검색 문의가 8월 이후 ⅓</b><span>방문은 4,580 → 2,899 · 검색 노출 확인 (문의까지 가는 길에서 들어온 곳별로)</span></div><div class="r"><b>도입 28건 중 18건이 전화</b><span>통화마다 묻기는 어려움 → 홈페이지 "전화클릭"(GA 에 이미 있음)을 채널별로 세어 전화 줄 옆에 "홈페이지에서 전화 버튼 누른 곳" 분포로 표시</span></div></div>
<div class="cd-h"><b>돈 쓴 곳</b><span class="muted">비용은 광고 자동 수집 + 직접 입력(외주 · 행사)</span></div>
<table class="ds fixed">{COLS}{TH}<tbody>{''.join(prow(r) for r in PAID)}</tbody></table>
<div class="cd-h" style="margin-top:12px"><b>돈 안 쓴 곳</b><span class="muted">시간은 들었지만 비용 0 · 콘텐츠 성과와 연결</span></div>
<table class="ds fixed">{COLS}<tbody>{''.join(frow(r) for r in FREE)}</tbody></table>
<div class="cd-h" style="margin-top:12px"><b>전화</b><span class="muted">통화 출처는 기록 없음 · 홈페이지 전화 버튼 클릭(GA)의 채널 분포로 짐작</span></div>
<table class="ds fixed">{COLS}<tbody>{''.join(phrow(r) for r in PHONE)}</tbody></table>
<p class="cd-note" style="margin-top:8px">숫자를 누르면 그 리드 목록 · 문의 = 리드 기준(유입 성과 · 코호트와 같은 계산) · 도입은 그 달 문의가 나중에 도입된 것까지</p></div>'''
FA = frame('분석 › 마케팅 효율', '마케팅 효율', A, h=860)

# ───────── 2. 문의까지 가는 길 (= 방문자 여정 대체) ─────────
FUN = [('방문', 5049, '세션 · GA (www.caas.works 만)'), ('서비스 페이지 봄', None, '/pages · /products 페이지를 본 세션 — GA 페이지 데이터로 계산 (GTM 작업 없음)'), ('문의 버튼 누름', 263, '문의 클릭 이벤트'), ('문의 남김', 26, '홈페이지 · 채팅 문의 → 리드'), ('도입', None, '아직 진행 중 · 7~10월 웹 문의 도입 10')]
fmax = 5049
fun = ''.join(f'<div class="fn"><span class="l">{n}</span><span class="bar"><i style="width:{max(2, (v or 0) / fmax * 100):.1f}%"></i></span><b>{won(v) if v else "—"}</b><span class="muted">{esc(d)}</span></div>' for n, v, d in FUN)
REF = [('네이버 검색', 36, 2), ('네이버 블로그', 30, 1), ('구글 검색', 24, 2), ('직접 입력 · 북마크', 20, 2), ('카스웍스 안 (다른 페이지에서)', 17, 1),
       ('miracleintip.com (외주 글)', 15, 0), ('ChatGPT · Gemini · AI 검색', 8, 0), ('boosterlink (외주)', 4, 0)]
rrows = ''.join(f'<tr><td><b>{n}</b></td><td class="num">{q}</td><td class="c"><span class="mbar"><i style="width:{q / 36 * 100:.0f}%"></i></span></td><td class="num">{a}</td><td class="num">{a / q * 100:.0f}%</td></tr>' for n, q, a in REF)
LAND = [('/pages/smart-safe', '스마트 안전', 11), ('/contact', '문의하기', 5), ('/pages/ai-solutions', 'AI 솔루션', 3), ('/pages/vms', 'VMS', 2), ('/', '첫 화면', 2), ('/pages/edgeaicctv', '엣지 AI CCTV', 1)]
lrows = ''.join(f'<tr><td class="mono">{p}</td><td>{n}</td><td class="num">{q}</td></tr>' for p, n, q in LAND)
B = f'''<div class="pg2 wide"><div class="h2top"><h1 style="margin:0;font-size:18px">문의까지 가는 길</h1><span class="muted">어디서 와서 · 무엇을 보고 · 어디서 멈추나</span><span class="sp"></span><span class="btn sm">2026년 10월 ▾</span></div>
<div class="card2x"><div class="ch"><b>10월 흐름</b><span class="muted">각 단계에서 다음으로 넘어간 비율이 핵심</span></div>{fun}
<div class="ins" style="margin-top:8px"><div class="w"><b>문의 버튼 누른 263번 중 26건만 문의를 남김 (10%)</b><span>문의 양식에서 90%가 멈춤 → 칸 수 · 필수 항목 · 모바일 화면 점검</span></div></div></div>
<div class="g2"><div class="card2x"><div class="ch"><b>들어온 곳 → 문의 · 도입</b><span class="muted">7~10월 문의 214건 중 들어온 곳이 남은 163건</span></div>
<table class="ds fixed"><colgroup><col style="width:40%"><col style="width:12%"><col style="width:24%"><col style="width:12%"><col style="width:12%"></colgroup><thead><tr><th>들어온 곳</th><th>문의</th><th></th><th>도입</th><th>도입률</th></tr></thead><tbody>{rrows}</tbody></table></div>
<div class="card2x"><div class="ch"><b>문의 직전에 본 페이지</b><span class="muted">기록된 27건뿐 · 앞으로 모든 문의에 남기기(작업 필요)</span></div>
<table class="ds fixed"><colgroup><col style="width:44%"><col style="width:40%"><col style="width:16%"></colgroup><thead><tr><th>주소</th><th>페이지</th><th>문의</th></tr></thead><tbody>{lrows}</tbody></table>
<div class="ch" style="margin-top:12px"><b>문의 주제</b><span class="muted">7~10월 · 태그</span></div><div class="tags"><span>가격·견적 117</span><span>AI CCTV 72</span><span>동영상기록관리 43</span><span>TBM·안전교육 26</span><span>체감온도 16</span><span>자료요청 12</span><span>산안비 8</span></div></div></div></div>'''
FB = frame('분석 › 문의까지 가는 길', '문의까지 가는 길', B, h=900)

# 메뉴 재구성 표
MAP = [('마케팅', '<b>마케팅 효율</b>', '돈과 시간을 쓴 곳에서 문의 · 도입이 얼마나 나왔나 (주 · 월 · 분기 · 연)', '마케팅 분석(6탭) + 연간 비교', '아래 1'),
       ('마케팅', '<b>문의까지 가는 길</b>', '어디서 와서 무엇을 보고 어디서 멈추나', '방문자 여정 (세션 · 바운스 나열)', '아래 2'),
       ('세일즈', '<b>파이프라인</b>', '지금 어디서 막혀 있고 얼마나 걸리나 · 담당별', '파이프라인 분석 + 전환 소요 기간', '다음'),
       ('세일즈', '<b>문의 내용</b>', '무엇을 묻고 어떤 주제가 도입으로 이어지나', '마케팅 리포트 (이름 변경)', '다음'),
       ('고객', '<b>코호트 · 생애 가치</b>', '언제 · 어디서 온 고객이 오래 남고 많이 내나', '유입 코호트 + 채널별 생애 가치 (탭 2)', '적용됨'),
       ('매출', '<b>매출 분석</b> 🆕', '서비스별 · 공공/민간 · 신규/기존 월 매출 흐름 (시트 동기화 데이터)', '손익 분석 자리 (매입 연동 전까지 숨김)', '다음'),
       ('—', '<s>개요</s>', '대시보드 프리셋 5가 같은 역할', '없앰', '')]
mrows = ''.join(f'<tr><td>{g}</td><td>{n}</td><td>{q}</td><td class="muted">{f}</td><td>{s}</td></tr>' for g, n, q, f, s in MAP)

CSS = '''<style>
#m-analytics-v3 .ds.fixed td{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
#m-analytics-v3 .kpis{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));border:1px solid var(--line);border-radius:8px;margin:10px 0}
#m-analytics-v3 .kpis div{padding:8px 12px;border-left:1px solid var(--line2);display:grid;gap:1px}#m-analytics-v3 .kpis div:first-child{border-left:0}
#m-analytics-v3 .kpis span{font-size:11.5px;color:var(--fg3)}#m-analytics-v3 .kpis b{font-size:18px;font-variant-numeric:tabular-nums}#m-analytics-v3 .kpis b.due{color:var(--due,#b4233a)}#m-analytics-v3 .kpis em{font-style:normal;font-size:11.5px}
#m-analytics-v3 .ins{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin-bottom:12px}
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
</style>'''
SEC = f'''<section id="m-analytics-v3">{CSS}<h2>분석 — 메뉴 재구성 v3 (시안 2026-10-22 · 실데이터 7~10월)</h2>
<p class="rule">10/22 사용자: "마케팅 분석은 실제 업무에 참고가 잘 안 되는 부분이 있고, 방문자 여정도 새로 구성하면 좋겠다." 지금 분석 메뉴 10개 중 겹치는 것이 많고(연간 탭 = 연간 비교, 전환 소요 2곳), 마케팅 분석은 예산 · CPA 탭이 늘 펼쳐져 있어 지금처럼 예산 0 · 구글 광고 미집행인 달엔 빈 차트만 보임 (캠페인 일예산 21개 모두 0, 예산표 0건). 지금 비용은 네이버 검색광고 월 70만 원대 + 외주 블로그 월 200만 원. <b>10/22 사용자: 예산 · 구글 광고는 언제든 다시 할 수 있음</b> → 기능은 남기고, 데이터가 있을 때만 보이게.</p>
<table class="dg"><colgroup><col style="width:8%"><col style="width:16%"><col style="width:36%"><col style="width:28%"><col style="width:12%"></colgroup><thead><tr><th>그룹</th><th>새 메뉴</th><th>답하는 질문</th><th>지금 화면</th><th>시안</th></tr></thead><tbody>{mrows}</tbody></table>
<div class="cmp"><div><h4>모든 분석 화면 공통</h4><ul><li>숫자 정의 하나: 문의 = 리드 기준, 유입 = 분류 11 (유입 성과 · 코호트와 같은 계산)</li><li>기간 선택은 화면 위 한 곳 (주 · 월 · 분기 · 연)</li><li>숫자를 누르면 그 리드 · 고객 목록</li><li>맨 위에 "한 줄 판단" 카드 3개까지 — 표를 읽기 전에 무엇을 할지</li></ul></div>
<div><h4>지금 화면에서 빼는 것</h4><ul><li>예산 대 실집행 · 집행률을 늘 띄우는 탭 → 예산을 넣은 달 · 캠페인에만 "예산 대비" 칸이 생김 (기능은 유지)</li><li>채널별 CPA 차트 → "돈 쓴 곳" 표의 문의당 비용 칸 (구글 · 메타 · 유튜브를 다시 하면 그 달 그 줄이 자동으로 생김)</li><li>세션 · 바운스 · 체류 숫자 나열 (행동으로 이어지지 않음)</li><li>AI 분석용 프롬프트 복사 (한 줄 판단 카드로 대체)</li></ul></div></div>
<h3 class="ph3">1. 마케팅 효율 — 마케팅 분석 + 연간 비교 대체 (10월 · 실데이터)</h3><div class="fwrap">{FA}</div>
<p class="rule">채널을 "돈 쓴 곳 · 돈 안 쓴 곳 · 전화" 3묶음으로. <b>묶음은 고정이 아니라 그 기간에 비용이 있느냐로 자동</b> — 구글 광고를 다시 켜면 그 달부터 "돈 쓴 곳"에 줄이 생기고, 예산을 넣으면 "예산 · 소진율" 칸이 붙음(캠페인 일예산 대비 어제까지 소진은 캠페인 관리 화면에서 매일). 광고 자동 수집(구글 · 네이버)은 그대로. 마케팅팀이 매달 보는 질문 = "200만 원 낸 외주 블로그가 값을 하나" "검색이 왜 줄었나" "전화 문의는 어디서 왔나". 외주 · 행사 비용은 [비용 입력]으로 월 단위 직접 입력 (광고는 자동). 전화 출처는 리드 통화 기록에 "어디서 보셨어요?" 한 칸을 더해 채움 — 도입 28건 중 18건이 전화라 이게 빠지면 효율 판단이 틀어짐.</p>
<h3 class="ph3">2. 문의까지 가는 길 — 방문자 여정 대체 (10월 흐름 · 7~10월 들어온 곳)</h3><div class="fwrap">{FB}</div>
<p class="rule">세션 · 바운스 나열 대신 "방문 → 서비스 페이지 → 문의 버튼 → 문의 남김 → 도입" 한 줄 흐름과, 들어온 곳별 문의 · 도입. 10월 문의 버튼 263번 → 문의 26건(10%)이라 문의 양식 점검이 첫 할 일. "서비스 페이지 봄" = 서비스 · 제품 소개 페이지(/pages · /products)를 한 번이라도 본 세션 — 이미 받는 GA 페이지 데이터로 계산(추가 설정 없음). 방문자가 소개를 보고 문의하는지, 첫 화면에서 바로 나가는지를 가름. 문의 직전 페이지는 지금 27건만 기록 — 모든 문의에 남기도록 고쳐야 함. 들어온 곳별 문의 주제는 어디나 "가격·견적 · AI CCTV"가 1 · 2위라 구분이 안 돼 표에서 뺌 (주제는 문의 내용 메뉴에서). 외주 글(miracleintip · boosterlink) 19건 · AI 검색 8건은 아직 도입 0.</p>
<div class="cmp"><div><h4>정해 주실 것</h4><ul><li>개요 없앰 · 손익 분석 숨김</li><li>✔ 분석 메뉴 10 → 6 (10/22)</li><li>✔ 외주 · 행사 비용 = 사용자가 직접 [비용 입력] (10/22)</li><li>✔ 전화 출처는 묻지 않음 → GA 전화클릭 채널 분포로 (10/22)</li><li>✔ 서비스 페이지 봄 = GA 페이지 데이터로 (설정 추가 없음)</li></ul></div>
<div><h4>순서 (합의 후)</h4><ul><li>1 마케팅 효율 · 문의까지 가는 길 (마케팅 2개)</li><li>2 파이프라인 · 문의 내용 (세일즈 2개)</li><li>3 매출 분석 (시트 동기화 데이터)</li><li>4 메뉴 정리 (개요 · 손익 · 연간 비교 · 방문자 여정 옛 화면 내림)</li></ul></div></div></section>'''

s = open(P, encoding='utf-8').read()
if '<section id="m-analytics-v3"' in s:
    i = s.index('<section id="m-analytics-v3"'); j = s.index('</section>', i) + len('</section>'); s = s[:i] + s[j:]
i = s.index('<section id="agg"'); s = s[:i] + SEC + s[i:]
s = re.sub(r'<a href="#m-analytics-v3" class="i">[^<]*</a>', '', s)
s = s.replace('<a href="#agg" class="i">', '<a href="#m-analytics-v3" class="i">분석 재구성 v3 (시안)</a><a href="#agg" class="i">', 1)
open(P, 'w', encoding='utf-8').write(s)
print('m-analytics-v3', len(SEC), 'doc', len(s), 'toc', '#m-analytics-v3' in s)
