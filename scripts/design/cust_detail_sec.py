# 고객관리 › 고객 상세 v2 시안 (2026-10-22, 계룡건설산업 실데이터 · 담당자 이름 가림) → 최종 디자인 정의 문서에 섹션 m-cust-detail 로 넣는다
# 실행: python3 -X utf8 -c "exec(compile(open('cust_detail_sec.py',encoding='utf-8').read(),'cust_detail_sec.py','exec'))"
# 전체 파이프라인(assemble → reorganize → rebuild)을 다시 돌릴 때는 rebuild.py 다음에 이 스크립트를 한 번 더.
import html, re
P = '/Users/david/Desktop/클로드/004_CRM 웹개발/caasworks/docs/design/카스웍스_CRM_디자인정의.html'
esc = lambda x: html.escape(str(x))
won = lambda v: f'{int(v):,}'
def av(n): return f'<span class="av" title="{esc(n)}">{esc(n[:1])}</span>'
def chip(t, s): return f'<span class="st {t}">{esc(s)}</span>'

MENU = [('대시보드', None), ('마케팅', 1), ('세일즈', 1), ('고객관리', ['매출 현황', '과금 고객', '전체 고객', '계약 관리']), ('재무관리', 1), ('운영관리', 1), ('분석', 1), ('VoC/CS', 1), ('업무', 1), ('피드백', 1), ('설정', 1)]
def sidebar():
    o = ['<aside class="sb"><div class="logo"><i></i><b>CaasWorks</b><span>CRM</span></div><nav>']
    for g, kids in MENU:
        if isinstance(kids, list):
            o.append(f'<div class="g open">{g}<em>▾</em></div>' + ''.join(f'<a class="{"act" if k == "전체 고객" else ""}">{k}</a>' for k in kids))
        else:
            o.append(f'<div class="g ">{g}{"<em>▸</em>" if kids else ""}</div>')
    return ''.join(o) + '</nav><div class="me">' + av('전성환') + '<div><b>전성환</b><span>세일즈</span></div></div></aside>'
def frame(body, dims=(), h=900, drawer=''):
    d = ''.join(f'<span class="dim" style="{st}">{esc(t)}</span>' for st, t in dims)
    return (f'<p class="tog"><label><input type="checkbox" onchange="this.closest(\'.fwrap\').querySelector(\'.frame\').classList.toggle(\'showdim\', this.checked)"> 치수 라벨 보기</label></p>'
            f'<div class="frame" style="height:{h}px">{sidebar()}<div class="main"><header class="hd"><b>고객 상세</b><div class="r"><span class="srch">회사·현장·메뉴 검색 <kbd>⌘K</kbd></span><span class="fs">A−  14  A+</span>{av("전성환")}</div></header>'
            f'<div class="ct">{body}</div>{drawer}</div>{d}</div>')

# ── 실데이터 (2026-10-22 CRM, 고객 47c281df…) ──
REV = [0, 0, 0, 65_690_000] + [4_954_000] * 8           # 2026 월별 공급가 (11·12월은 과금 예정)
YTD = sum(REV[:10])                                       # 10월까지 95,414,000
INV = [  # 청구월, 합계(VAT 포함), 계산서, 납기, 입금
    (9, 5_449_400, '09.30', '11.30', None), (8, 5_449_400, '08.31', '10.31', None), (7, 5_449_400, '07.31', '09.30', None),
    (6, 5_449_400, '06.30', '08.31', None), (5, 5_449_400, '05.29', '07.31', '07.01'), (4, 72_259_000, '04.30', '06.30', '05.08')]
DUE = {9: ('39일 남음', ''), 8: ('9일 남음', 'warn'), 7: ('22일 지남', 'due'), 6: ('52일 지남', 'due')}
UNPAID = sum(t for m, t, *_ , p in INV if not p)          # 21,797,600
OVER = sum(t for m, t, *_ , p in INV if not p and DUE[m][1] == 'due')
SITE = '고양장항 S-1BL 아파트 건설공사 5공구'
SVC = [  # 서비스, 내용(메모), 과금, 진행/종료, 올해 매출(12월 예정 포함)
    ('편집비용', '영상편집 월 50회 × 18개월', '02.06–05.31', 0, 36_000_000), ('타임랩스', '고정형 13대 · 대당 180,000', '02.06–', 1, 25_740_000),
    ('LTE/인터넷 회선', 'CCTV 통신 13대 · NVR 인터넷 · 포팩트 4대', '02.06–', 1, 14_850_000), ('장비설치', '카메라 설치·해체 · NVR 설치비', '02.06–05.31', 0, 14_000_000),
    ('AI CCTV', '고정형 13대 · 대당 40,000 · 엣지 교체 2', '02.06–', 1, 5_720_000), ('Wearable Cam', '포팩트 연동 4대 · 임대 6대', '02.06–', 1, 5_544_000),
    ('NVR 구축', 'NVR · 모니터', '02.06–', 1, 2_368_000), ('플랫폼', '', '02.06–', 1, 1_100_000)]

def head(tab):
    tabs = ''.join(f'<span class="{"on" if t == tab else ""}">{t}</span>' for t in ['매출', '현장 1', '청구 6', '기록', '문서', '정보'])
    return (f'<div class="h2top"><span class="muted">‹ 고객 목록</span><span class="sp"></span><span class="btn sm quiet">‹ 이전</span><span class="btn sm quiet">다음 ›</span><span class="btn sm">견적서</span><span class="btn sm quiet">⋯</span></div>'
            f'<div class="h2name"><h1>계룡건설산업</h1>{chip("ok", "활성")}<span class="muted">· 종합건설사 · 코드 2511121131 · 처음 문의 25.11.12 · 과금 시작 26.04.30 (+175일)</span></div>'
            '<div class="cd-dup"><b>같은 회사로 보이는 고객 2곳</b><span>계룡건설 — 리드 미팅 · 남양주 왕숙 A-6BL (08.13, 이 고객 현장 공무팀장 소개)</span><span>계룡건설산업(주) — 기록 없음</span><span class="sp"></span><span class="lk">묶어서 보기</span><span class="btn sm">합치기</span></div>'
            '<div class="props">'
            '<div><span>상태</span><b>활성 ▾</b></div>'
            f'<div><span>영업 담당</span><b>{av("최한별")} 최한별 ▾</b></div>'
            '<div><span>과금</span><b>월간 선납 · 04.30~ ▾</b></div>'
            f'<div><span>올해 매출 (10월까지)</span><b>{won(YTD)}</b></div>'
            f'<div class="cd-due"><span>미납</span><b>{won(UNPAID)} <i>연체 2건</i></b></div></div>'
            f'<div class="tabs t2">{tabs}</div>')

def bars():
    mx = max(REV); w, gap, H = 34, 12, 120
    out = []
    for i, v in enumerate(REV):
        x = i * (w + gap) + 6; h = round(v / mx * H) if v else 0; fut = i >= 10
        fill = 'var(--line)' if fut else 'var(--accent)'
        lab = f'{v/1e4:,.0f}만' if v else ''
        out.append(f'<rect x="{x}" y="{H - h + 14}" width="{w}" height="{h}" rx="3" fill="{fill}"/>'
                   f'<text x="{x + w/2}" y="{H - h + 9}" text-anchor="middle" class="bl">{lab}</text>'
                   f'<text x="{x + w/2}" y="{H + 30}" text-anchor="middle" class="bx">{i + 1}월</text>')
    return f'<svg class="cd-bars" viewBox="0 0 560 {H + 36}" width="100%">{"".join(out)}<line x1="0" x2="560" y1="{H + 14}" y2="{H + 14}" stroke="var(--line)"/></svg>'

def inv_table(full=False):
    rows = ''
    for m, t, iss, due, paid in INV:
        if paid: stt = f'{chip("ok", "입금")} <span class="muted">{paid}</span>'
        else:
            txt, tn = DUE[m]; stt = f'<span class="st {tn or "info"}">{"연체" if tn == "due" else "발행"}</span> <span class="{tn or "muted"}">{txt}</span>'
        rows += f'<tr><td class="c">2026.{m:02d}</td><td class="num">{won(t)}</td><td class="c muted">{iss}</td><td class="c">{due}</td><td>{stt}</td>{"<td class=c><span class=lk>독촉 기록</span></td>" if full and not paid and DUE[m][1] == "due" else ("<td></td>" if full else "")}</tr>'
    cols = [14, 22, 16, 14, 34] if not full else [12, 18, 13, 12, 29, 16]
    cg = ''.join(f'<col style="width:{c}%">' for c in cols)
    th = '<th>청구월</th><th>금액 (VAT 포함)</th><th>계산서</th><th>납기</th><th>상태</th>' + ('<th></th>' if full else '')
    return f'<table class="ds fixed"><colgroup>{cg}</colgroup><thead><tr>{th}</tr></thead><tbody><tr class="sum top"><td class="c">미납</td><td class="num due">{won(UNPAID)}</td><td></td><td></td><td class="muted">4건 · 연체 2건 {won(OVER)}</td>{"<td></td>" if full else ""}</tr>{rows}</tbody></table>'

def card(title, body, act='수정'):
    return f'<div class="card2x"><div class="ch"><b>{title}</b><span class="muted">{act}</span></div>{body}</div>'
ISSUES = ('<div class="card2x cd-iss"><div class="ch"><b>주요 이슈 4</b><span class="muted">현장 탭 →</span></div><ol>'
    f'<li class="due"><b>연체 2건 {won(OVER)}</b><span>6월분 52일 · 7월분 22일 지남 · 청구 서○○ 차장</span></li>'
    '<li class="warn"><b>8월분 납기 10.31</b><span>9일 남음</span></li>'
    '<li><b>소개 리드 · 남양주 왕숙 A-6BL</b><span>미팅 단계 · 08.13 이 현장 공무팀장 소개 · 다른 고객(계룡건설)에 붙어 있음</span></li>'
    '<li><b>공사 종료 27.12.18</b><span>422일 남음 · 철수·연장 계획 미정</span></li></ol></div>')
RCOL = ('<div class="rcol">' + ISSUES
    + card('담당자', '<div class="kv3"><span>현장</span><b>황○○ 팀장 · 공무</b><span>청구</span><b>서○○ 차장</b><span>연락처</span><b class="muted">카드에서 바로 전화 · 메일</b></div>')
    + card('처음 들어온 경로', '<div class="kv3"><span>문의</span><b>25.11.12 · <span class="lk">리드 ↗</span></b><span>유입</span><b><i class="dot" style="background:var(--fg-3)"></i>검색 › 구글</b><span>도입</span><b>26.04 · 문의 후 170일</b><span>담당</span><b>최한별</b></div><p class="q muted" style="margin-top:6px">같은 연락처의 예전 문의(2023~25 이전 기록)도 여기 함께</p>', '')
    + card('현장', f'<p class="q"><b>{SITE}</b><br><span class="muted">LH · 공공 · 25.02.25 – 27.12.18 · 서비스 12 진행 · 9 종료</span></p>', '')
    + '</div>')

# A. 매출 탭 (첫 탭)
A = f'''<div class="pg2">{head('매출')}<div class="body2"><div>
<div class="cd-h"><b>2026 월별 매출</b><span class="muted">공급가 · 회색 = 과금 예정(11·12월)</span><span class="sp"></span><span class="seg"><span class="on">2026</span><span>2025</span><span>전체</span></span></div>{bars()}
<div class="cd-h" style="margin-top:14px"><b>청구 · 입금</b><span class="muted">최근 6건</span><span class="sp"></span><span class="lk">청구 탭 →</span></div>{inv_table()}</div>{RCOL}</div></div>'''
FA = frame(A, dims=[('left:206px;top:60px', '머리: 이름 20 + 상태 + 메타 한 줄 (리드 상세와 같은 틀)'),
                    ('left:206px;top:112px', '같은 회사로 보이는 고객 — 있을 때만 한 줄'),
                    ('left:206px;top:152px', '속성 줄 5: 상태 · 영업 담당 · 과금 · 올해 매출 · 미납(진한 빨강)'),
                    ('left:206px;top:236px', '첫 탭 = 매출. 본문 2 : 1 — 월별 막대 + 청구·입금 / 카드 3장')], h=900)

# B. 현장 탭 — 현장 히스토리 · 주요 이슈 · 서비스(읽기). 서비스 줄 편집은 매출 현황 한 곳에서 (10/22 사용자: "서비스 추가 드로어는 왜 저기에?")
HIST = [('26.08.31~', '연체 시작', '6월분 5,449,400 납기 지남 → 7월분도 09.30 지남', 'due'),
        ('26.08.13', '소개 리드', '이 현장 공무팀장이 남양주 왕숙 A-6BL 8공구 소개 · 미팅 예정', 'lead'),
        ('26.05.31', '서비스 종료', '편집비용(월 50회) · 장비설치 · NVR 모니터 과금 끝', 'na'),
        ('26.05.08', '첫 입금', '04월분 72,259,000 (2~4월 사용분 + 설치·편집)', 'ok'),
        ('26.04.30', '과금 시작', '월간 선납 · 매월 말 계산서 · 다다음 달 말 납기', 'info'),
        ('날짜 없음', '장비 교체', 'AI CCTV 엣지 교체 2건 (엣지 1대 불량 → 교체) — 매출 현황 메모에서', 'warn'),
        ('26.02.23', '이동형 철수', '이동형 AI CCTV · 타임랩스 · 회선 1대씩 종료', 'na'),
        ('26.02.06', '설치 · 사용 시작', '고정형 AI CCTV 13 · 타임랩스 13 · Wearable Cam 10 · NVR · 이동형 1', 'info'),
        ('25.11.12', '문의', '홈페이지 문의 · 검색 › 구글 · 담당 최한별', 'lead'),
        ('25.02.25', '현장 착공', '공사 기간 25.02.25 – 27.12.18 · LH · 공공', 'na')]
hist = ''.join(f'<li class="{c}"><span class="d">{d}</span><b>{k}</b><span class="t">{esc(x)}</span></li>' for d, k, x, c in HIST)
svc_rows = ''.join(f'<tr><td><b>{esc(n)}</b></td><td class="muted">{esc(m) or "—"}</td><td class="c">{p}</td><td class="c">{chip("ok" if on else "na", "진행" if on else "종료")}</td><td class="num">{won(v)}</td></tr>' for n, m, p, on, v in SVC)
B = f'''<div class="pg2">{head('현장 1')}
<div class="cd-site"><b>{SITE}</b><span class="muted">LH · 공공 · 25.02.25 – 27.12.18 (422일 남음) · 월간 선납</span><span class="sp"></span><span class="seg"><span class="on">고양장항 S-1BL</span><span>+ 현장</span></span></div>
<div class="body2" style="margin-top:12px"><div>
<div class="cd-h"><b>현장 히스토리</b><span class="muted">설치·교체·철수 · 청구 · 리드가 날짜순 (운영 데이터가 쌓이면 반출·장비·VoC·영상 기록도)</span></div><ol class="cd-hist">{hist}</ol>
<div class="cd-h" style="margin-top:14px"><b>서비스 21줄 → 8종</b><span class="muted">진행 12 · 종료 9 · 올해 {won(sum(s[4] for s in SVC))}</span><span class="sp"></span><span class="lk">매출 현황에서 편집 →</span></div>
<table class="ds fixed"><colgroup><col style="width:18%"><col style="width:40%"><col style="width:14%"><col style="width:10%"><col style="width:18%"></colgroup>
<thead><tr><th>서비스</th><th>내용</th><th>과금 기간</th><th>상태</th><th>올해 매출</th></tr></thead><tbody>{svc_rows}</tbody></table></div>
<div class="rcol">{ISSUES.replace('현장 탭 →', '+ 이슈')}{card('현장 사람', '<div class="kv3"><span>공무</span><b>황○○ 팀장</b><span>소장</span><b class="muted">—</b><span>설치</span><b class="muted">협력사 —</b></div>')}</div></div></div>'''
FB = frame(B, dims=[('left:206px;top:236px', '현장 = 히스토리(날짜순) + 서비스(읽기 · 편집은 매출 현황) / 오른쪽 주요 이슈'), ('left:206px;top:560px', '서비스 줄 추가·월 금액 입력은 매출 현황 한 곳 — 두 곳에서 고치지 않게')], h=900)

# C. 기록 탭 — 이 고객 + 연결 리드 + 청구 변경을 한 흐름으로
TL = [('10월 20일', [('수정', '고객 정보 수정 — 청구 담당 서○○ 차장', '전성환', 'me')]),
      ('8월 13일', [('전화 발신', '현장 공무팀장 소개로 남양주 왕숙 A-6BL 아파트 신설공사 8공구 문의, 8/19 또는 20 미팅', '최한별', 'lead')]),
      ('7월 1일', [('입금', '2026.05 청구분 5,449,400', '', 'bill')]),
      ('5월 8일', [('입금', '2026.04 청구분 72,259,000 (장비 설치·편집 포함)', '', 'bill')]),
      ('4월 30일', [('과금 시작', '월간 선납 · 고양장항 S-1BL 5공구', '최한별', 'me')]),
      ('25년 11월 12일', [('문의', '홈페이지 문의 · 검색 › 구글 · 리드 도입완료(26.04)', '최한별', 'lead')])]
SRC = {'me': '<span class="tag">이 고객</span>', 'lead': '<span class="tag lk">리드 · 계룡건설 ↗</span>', 'bill': '<span class="tag">청구</span>'}
SRC_LEAD0 = '<span class="tag lk">리드 ↗</span>'
tl = ''
for day, items in TL:
    tl += f'<div class="day">{day}</div><ol class="tl4">'
    for t, d, by, src in items:
        tag = SRC_LEAD0 if day.startswith('25') else SRC[src]
        tl += f'<li class="{"a" if src != "bill" else "n"}"><div class="r1"><span class="tt">{t}</span>{tag}<span class="muted">{by}</span></div><p>{esc(d)}</p></li>'
    tl += '</ol>'
C = f'''<div class="pg2">{head('기록')}<div class="body2"><div>
<div class="cmp2"><div class="ty"><span class="on">전화 발신</span><span>전화 수신</span><span>이메일</span><span>미팅</span><span>VoC</span><span>메모</span></div><div class="ta">통화·미팅 내용 (Enter 기록) — 연결된 현장·리드를 고르면 그쪽에도</div>
<div class="ft"><span class="muted">대상</span><span class="in">이 고객 ▾ (리드 · 계룡건설 / 현장 고르기)</span><span class="sp"></span><span class="btn sm primary">기록</span></div></div>
<div class="cd-h"><span class="seg"><span class="on">전체</span><span>이 고객</span><span>리드 2</span><span>청구</span><span>VoC</span></span></div>{tl}</div>{RCOL}</div></div>'''
FC = frame(C, dims=[('left:206px;top:236px', '기록 = 이 고객 + 연결 리드(같은 회사로 묶인 것 포함) + 청구 입금을 날짜순 한 흐름'), ('left:206px;top:420px', '줄마다 출처 태그 · 위 칩으로 거르기')], h=900)

CSS = '''<style>
.cd-dup{display:flex;align-items:center;gap:12px;flex-wrap:wrap;font-size:12px;padding:7px 12px;margin:0 0 10px;border:1px solid color-mix(in srgb,var(--warn) 45%,var(--line));background:color-mix(in srgb,var(--warn) 7%,var(--bg));border-radius:8px}.cd-dup b{font-weight:600}.cd-dup span{color:var(--fg-2)}.cd-dup .sp{flex:1}.cd-dup .lk{color:var(--accent)}
.cd-due b{color:var(--due,#b4233a)!important}.cd-due i{font-style:normal;font-size:11.5px;color:var(--due,#b4233a);font-weight:500}.due{color:var(--due,#b4233a)}.st.due{background:var(--due,#b4233a);color:#fff}
.cd-h{display:flex;align-items:center;gap:8px;margin:0 0 6px;font-size:12px}.cd-h b{font-size:13px;font-weight:600}.cd-h .sp{flex:1}.cd-h .lk{color:var(--accent)}
.seg{display:inline-flex;border:1px solid var(--line);border-radius:6px;overflow:hidden}.seg span{padding:2px 9px;font-size:12px;color:var(--fg-2)}.seg span+span{border-left:1px solid var(--line)}.seg .on{background:var(--fg);color:var(--bg)}
.cd-bars .bl{font-size:10px;fill:var(--fg-2)}.cd-bars .bx{font-size:10.5px;fill:var(--fg-3)}
.cd-site{display:flex;align-items:center;gap:10px;padding:8px 12px;border:1px solid var(--line);border-bottom:0;border-radius:8px 8px 0 0;background:var(--bg-subtle);font-size:12.5px}.cd-site b{font-weight:600}.cd-site .sp{flex:1}
.cd-form{display:grid;gap:6px;font-size:12.5px}.cd-form label{color:var(--fg-3);font-size:12px;margin-top:6px}.cd-form .inp{border:1px solid var(--line);border-radius:6px;height:30px;line-height:30px;padding:0 10px}.cd-form .inp.ta{height:56px}.cd-form .row{display:flex;gap:6px;align-items:center}.cd-form .row .inp{flex:1}.cd-form .calc{font-weight:600;white-space:nowrap}.cd-form .pl.on{background:var(--fg);color:var(--bg);border-color:var(--fg)}.cd-form .s2{font-size:11.5px;margin-top:8px}
.tag.lk{color:var(--accent)}
.cd-iss ol{list-style:none;margin:0;padding:0;display:grid;gap:7px}.cd-iss li{padding-left:9px;border-left:3px solid var(--line);display:grid;gap:1px}.cd-iss li b{font-size:12.5px;font-weight:600}.cd-iss li span{font-size:11.5px;color:var(--fg-2)}.cd-iss li.due{border-color:var(--due,#b4233a)}.cd-iss li.due b{color:var(--due,#b4233a)}.cd-iss li.warn{border-color:var(--warn)}
.cd-hist{list-style:none;margin:0 0 4px;padding:0 0 0 14px;border-left:1px solid var(--line);font-size:12.5px}.cd-hist li{position:relative;display:grid;grid-template-columns:76px 86px 1fr;gap:8px;padding:5px 0}.cd-hist li::before{content:"";position:absolute;left:-18px;top:11px;width:7px;height:7px;border-radius:50%;background:var(--line)}.cd-hist .d{color:var(--fg-3);font-variant-numeric:tabular-nums}.cd-hist b{font-weight:600}.cd-hist .t{color:var(--fg-2);min-width:0}
.cd-hist li.due::before{background:var(--due,#b4233a)}.cd-hist li.due b{color:var(--due,#b4233a)}.cd-hist li.warn::before{background:var(--warn)}.cd-hist li.ok::before{background:var(--ok)}.cd-hist li.info::before{background:var(--info)}.cd-hist li.lead::before{background:var(--accent)}
</style>'''
SEC = f'''<section id="m-cust-detail">{CSS}<h2>고객관리 — 고객 상세 v2 (시안 2026-10-22 · 그림은 계룡건설산업 실데이터, 담당자 이름 가림)</h2>
<p class="rule">리드 상세 v2 와 같은 틀(머리 → 속성 줄 → 2 : 1). 지금 상세는 2,035줄 한 화면에 탭 7개(정보·청구·단가·프로젝트·반출·납부·문서)와 모달 — 고객 목록 v2 와 같은 부품으로 바꾼다.</p>
<table class="dg"><colgroup><col style="width:22%"><col style="width:39%"><col style="width:39%"></colgroup><thead><tr><th>지금 (고객 상세)</th><th>보이는 모습 (계룡건설산업)</th><th>v2</th></tr></thead><tbody>
<tr><td><b>첫 화면이 정보</b></td><td>회사 정보 칸이 먼저, 매출·미납은 탭을 옮겨야 보임</td><td>첫 탭 = 매출. 위 속성 줄에 올해 매출·미납(연체 2건)이 늘 보임</td></tr>
<tr><td><b>프로젝트 21줄</b></td><td>현장 1곳의 서비스가 21줄로 나열 (종료 9줄 섞임) · 설치·교체·철수 이력은 메모에 흩어짐</td><td>현장 탭 = 현장 히스토리 + 주요 이슈 + 서비스 8종(읽기). 서비스 줄·월 금액 편집은 매출 현황 한 곳</td></tr>
<tr><td><b>같은 회사 3곳</b></td><td>계룡건설 · 계룡건설산업 · 계룡건설산업(주)가 따로 — 남양주 현장 소개 리드는 다른 고객에</td><td>"같은 회사로 보이는 고객" 한 줄 → 묶어서 보기 · 합치기</td></tr>
<tr><td><b>기록이 흩어짐</b></td><td>고객 메모·리드 활동·입금이 각각 다른 화면</td><td>기록 탭 하나에 날짜순, 출처 태그로 거르기 (2023~25 이전 기록 포함)</td></tr></tbody></table>
<h3 class="ph3">A. 매출 탭 (첫 화면)</h3><div class="fwrap">{FA}</div>
<h3 class="ph3">B. 현장 탭 — 히스토리 · 주요 이슈 · 서비스(읽기)</h3><div class="fwrap">{FB}</div>
<h3 class="ph3">C. 기록 탭 — 고객 + 리드 + 청구 한 흐름</h3><div class="fwrap">{FC}</div>
<div class="cmp"><div><h4>정해 주실 것</h4><ul><li>첫 탭 = 매출 (추천) / 정보</li><li>속성 줄 5 = 상태 · 영업 담당 · 과금 · 올해 매출 · 미납</li><li>기록 탭에 연결 리드 활동 · 청구 입금 · 이전 기록까지 합치기</li><li>현장 탭 = 히스토리 · 주요 이슈 · 서비스(읽기), 서비스 줄 편집은 매출 현황에서만 (고객 상세에서 고치지 않음)</li><li>주요 이슈 = 자동(연체 · 납기 임박 · 공사 종료 임박 · 소개 리드) + 손으로 추가</li><li>"같은 회사로 보이는 고객" 표시 + 합치기 (계룡처럼 3곳으로 나뉜 고객 정리)</li></ul></div>
<div><h4>나머지 탭</h4><ul><li>청구 6: 청구·입금 전체 + 납기 규칙 (미납 줄에서 "독촉 기록")</li><li>문서: 계약서·견적서·세금계산서 파일</li><li>정보: 회사·청구 정보 카드 (값 있는 칸만, 카드별 수정) — 지금 정보 탭 내용</li><li>단가 · 반출 · 장비 · VoC 는 현장 히스토리 항목으로 (운영 데이터가 쌓이는 대로)</li></ul></div></div></section>'''

s = open(P, encoding='utf-8').read()
if '<section id="m-cust-detail"' in s:
    i = s.index('<section id="m-cust-detail"'); s = s[:i] + s[s.index('</section>', s.index('<h3 class="ph3">C. 기록 탭', i)) + len('</section>'):]
i = s.index('<section id="m-cust-wait"'); s = s[:i] + SEC + s[i:]
if 'href="#m-cust-detail"' not in s:
    s = s.replace('<a href="#m-list-v2" class="i">고객 목록</a>', '<a href="#m-list-v2" class="i">고객 목록</a><a href="#m-cust-detail" class="i">고객 상세 (시안)</a>', 1)
s = s.replace('<p class="rule">매출 현황 · 과금 고객 · 계약 관리 · 고객 상세</p>', '<p class="rule">매출 현황 · 과금 고객 · 계약 관리</p>')
s = s.replace('드로어 60vw(최소 720): 회사 목록 표 + 합계', '드로어 min(1180px, 94vw) (10/22): 회사 목록 표 + 합계 · 열 비율 고정 · 긴 글자는 말줄임 + 마우스를 올리면 전체 — 어느 달을 열어도 크기·위치가 같다')
open(P, 'w', encoding='utf-8').write(s)
print('m-cust-detail', len(SEC), 'doc', len(s))
