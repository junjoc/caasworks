# 고객관리 v4 — 고객사(돈 내는 곳) → 프로젝트(현장 · 용역 · PoC) → 견적·계약 · 서비스 · 청구 · 장비 (2026-10-22)
# 사용자: "현장 베이스로 움직인다 · 같은 회사도 현장별로 유입·관리가 나뉜다" → "LH 용역처럼 현장과 상관없는 거래도 있다" → 단위 이름 = 프로젝트
#         "계약서를 안 쓰면 견적서로 대체 — 견적서가 매우 중요, 여러 번 고친다" · "발주처가 돈을 내는 경우도 종종" · "돈을 내면 고객 LIST 에 올린다"
#         "플랫폼 회원사 정보는 가입 데이터 — 가져오지 않음"
# 그림 5개(실데이터 2026-10-22, 고객사 사람 이름 가림): 프로젝트 목록 · 프로젝트 상세(고양장항 · 남양주 왕숙 견적) · 고객사 목록 · 고객사 상세(효성) · 매출 현황(프로젝트 묶음)
# 실행: python3 -X utf8 -c "exec(compile(open('cust_detail_sec.py',encoding='utf-8').read(),'cust_detail_sec.py','exec'))"
# 파이프라인(assemble → reorganize → rebuild)을 다시 돌리면 rebuild.py 다음에 이 스크립트를 한 번 더.
import html
P = '/Users/david/Desktop/클로드/004_CRM 웹개발/caasworks/docs/design/카스웍스_CRM_디자인정의.html'
esc = lambda x: html.escape(str(x))
won = lambda v: f'{int(v):,}' if v else '—'
man = lambda v: f'{v/1e8:.2f}억' if v >= 1e8 else f'{v/1e4:,.0f}만' if v else '—'
def av(n): return f'<span class="av" title="{esc(n)}">{esc(n[:1])}</span>' if n else '<span class="muted">—</span>'
def chip(t, s): return f'<span class="st {t}">{esc(s)}</span>'

MENU = [('대시보드', None), ('마케팅', 1), ('세일즈', 1), ('고객관리', ['프로젝트', '고객사', '매출 현황']), ('재무관리', 1), ('운영관리', 1), ('분석', 1), ('VoC/CS', 1), ('업무', 1), ('피드백', 1), ('설정', 1)]
def sidebar(act):
    o = ['<aside class="sb"><div class="logo"><i></i><b>CaasWorks</b><span>CRM</span></div><nav>']
    for g, kids in MENU:
        if isinstance(kids, list):
            o.append(f'<div class="g open">{g}<em>▾</em></div>' + ''.join(f'<a class="{"act" if k == act else ""}">{k}</a>' for k in kids))
        else:
            o.append(f'<div class="g ">{g}{"<em>▸</em>" if kids else ""}</div>')
    return ''.join(o) + '</nav><div class="me">' + av('전성환') + '<div><b>전성환</b><span>세일즈</span></div></div></aside>'
def frame(title, act, body, dims=(), h=900):
    d = ''.join(f'<span class="dim" style="{st}">{esc(t)}</span>' for st, t in dims)
    return (f'<p class="tog"><label><input type="checkbox" onchange="this.closest(\'.fwrap\').querySelector(\'.frame\').classList.toggle(\'showdim\', this.checked)"> 치수 라벨 보기</label></p>'
            f'<div class="frame" style="height:{h}px">{sidebar(act)}<div class="main"><header class="hd"><b>{title}</b><div class="r"><span class="srch">회사·프로젝트·메뉴 검색 <kbd>⌘K</kbd></span><span class="fs">A−  14  A+</span>{av("전성환")}</div></header>'
            f'<div class="ct">{body}</div></div>{d}</div>')
def card(title, body, act=''):
    return f'<div class="card2x"><div class="ch"><b>{title}</b><span class="muted">{act}</span></div>{body}</div>'
def issues(items, act=''):
    li = ''.join(f'<li class="{c}"><b>{t}</b><span>{d}</span></li>' for c, t, d in items)
    return f'<div class="card2x cd-iss"><div class="ch"><b>주요 이슈 {len(items)}</b><span class="muted">{act}</span></div><ol>{li}</ol></div>'
def tabs(names, on):
    return '<div class="tabs t2">' + ''.join(f'<span class="{"on" if n == on else ""}">{n}</span>' for n in names) + '</div>'
def toolbar(tabs_, right):
    tb = ''.join('<span class="tab ' + c + '">' + t + '</span>' for t, c in tabs_)
    return f'<div class="tb">{tb}<span class="sp"></span>{right}</div>'
def kpis(items):
    return '<div class="kpis" style="grid-template-columns:repeat(5,1fr)">' + ''.join(f'<div><span>{a}</span><b class="{c}">{b}</b><em>{e}</em></div>' for a, b, e, c in items) + '</div>'
def tbl(cols, head, rows, sumrow=''):
    cg = ''.join(f'<col style="width:{c}%">' for c in cols)
    return f'<div class="wrap lfill"><table class="ds fixed"><colgroup>{cg}</colgroup><thead><tr>{"".join(f"<th>{h}</th>" for h in head)}</tr></thead><tbody>{sumrow}{rows}</tbody></table></div>'
TYPE = {'현장': 'info', '용역': 'warn', 'PoC': 'na'}

# ───────── 1. 프로젝트 목록 ─────────
# (유형, 프로젝트, 고객사(청구처), 분류, 서비스 줄, 서비스, 10월, 올해, 공사 끝, 단계)
PJ = [('현장', '경산대임 B-1BL 공동주택 건설공사', '태영건설', 'LH현장', 16, 'LTE · 타임랩스 · Cam 연동 · 플랫폼', 18_563_333, 26_789_999, '28.10.23', '과금 중'),
      ('현장', '경산대임 A-3BL 아파트 건설공사', '일성건설', 'LH현장', 15, 'LTE · AI CCTV · 타임랩스 · 편집', 16_342_895, 24_918_685, '28.01.31', '과금 중'),
      ('현장', '선우테크 테크노폴리스 신축공사', '인종합건설', '토목·인프라', 6, 'AI CCTV · 실시간 안전관리 · 운임비', 8_052_000, 8_052_000, '27.08.13', '과금 중'),
      ('현장', 'LG화학 화치공장 LDPE 해체공사', '제이아이엔피', 'LG화학', 11, 'AI CCTV · LTE · 플랫폼 · NVR', 7_210_000, 13_630_000, '—', '과금 중'),
      ('현장', '경산대임 A1BL 아파트건설공사 1공구', 'KR산업', 'LH현장', 6, 'Wearable Cam · 플랫폼 · CCTV 연동', 6_465_000, 14_195_000, '27.03.08', '과금 중'),
      ('현장', '고양장항 S-1BL 아파트 건설공사 5공구', '계룡건설산업', 'LH현장', 21, 'AI CCTV · 타임랩스 · Wearable · 회선', 4_954_000, 105_322_000, '27.12.18', '과금 중'),
      ('현장', '새만금 가력선착장 확장공사', '주식회사 담원', '신축공사', 7, '플랫폼 · 타임랩스 · 회선', 4_820_000, 14_820_000, '27.11.30', '과금 중'),
      ('용역', '건설현장 영상기록제도 샘플영상 촬영 용역', '한국토지공사', '용역', 1, '기타', 3_300_000, 3_300_000, '—', '과금 중'),
      ('현장', 'LG화학 여수', '진흥플랜트', 'LG화학', 6, 'AI CCTV · 회선 · NVR · 장비설치', 2_970_000, 2_970_000, '—', '과금 중'),
      ('현장', 'Applied Collaboration Center', '삼성이앤에이', '신축공사', 5, '플랫폼 · 풀타임 타임랩스 · AI CCTV', 2_423_000, 6_223_000, '27.12.31', '과금 중'),
      ('현장', '남양주 왕숙 A-6BL 아파트 8공구', '계룡건설', 'LH현장', 0, '견적 98,760,000 · 08.31', 0, 0, '—', '견적'),
      ('용역', 'LH 건설 영상 기록관리 매뉴얼 용역', '시놀(LH)', '용역', 1, '기타', 0, 0, '—', '과금 끝')]
STGT = {'과금 중': 'ok', '견적': 'info', '과금 끝': 'na'}
rows = ''.join(f'<tr class="{"act" if n.startswith("고양장항") else ""}"><td class="c">{chip(TYPE[t], t)}</td><td><b>{esc(n)}</b></td><td>{esc(c)}</td><td class="c muted">{cat}</td><td class="c">{chip(STGT[st], st)}</td><td class="muted">{svc}{f" <span class=muted>({ln}줄)</span>" if ln > 1 else ""}</td><td class="num g">{won(o)}</td><td class="num">{won(y)}</td><td class="c">{e}</td></tr>' for t, n, c, cat, ln, svc, o, y, e, st in PJ)
L1 = f'''{toolbar([('과금 중 188', 'on'), ('견적·계약 20', ''), ('과금 끝', ''), ('전체 3,430', '')], '<span class="inp s">프로젝트·고객사·현장 검색</span><span class="sel">유형 전체</span><span class="sel">분류 전체</span><span class="sel">영업 담당 전체</span><span class="btn sm primary">+ 프로젝트</span>')}
{kpis([('과금 중 프로젝트', '188', '10월 매출이 있는 프로젝트', ''), ('10월 매출', '1.76억', '공급가', ''), ('견적 나간 것', '20건', '매출 시트 "견적 완료"', ''), ('미납', '87곳', '2.90억 · 고객사 기준', 'bad'), ('ID 없는 고객', '18곳', '올해 매출 있음 → 코드 정리', 'warn')])}
{tbl([7, 25, 13, 8, 8, 19, 9, 6, 5], ['유형', '프로젝트', '고객사', '분류', '단계', '서비스', '10월', '올해', '공사 끝'], rows, '<tr class="sum top"><td></td><td>합계 188 (시안 상위 12)</td><td></td><td></td><td></td><td></td><td class="num g">175,805,644</td><td></td><td></td></tr>')}'''
F1 = frame('프로젝트', '프로젝트', L1, dims=[('left:206px;top:60px', '툴바: 탭(과금 중 · 견적·계약 · 과금 끝 · 전체) │ 검색·필터 · + 프로젝트'),
                                          ('left:206px;top:116px', '숫자줄 5칸'),
                                          ('left:206px;top:192px', '프로젝트 = 현장 · 용역 · PoC. 줄을 누르면 프로젝트 상세(드로어 → 상세)')], h=760)

# ───────── 2. 프로젝트 상세 — 고양장항 (현장) ─────────
FLOW = ['문의', '견적', '계약', '설치', '과금 중', '종료']
def step(cur, note):
    ci = FLOW.index(cur)
    return '<div class="step2">' + ''.join(f'<div class="sp2 {"done" if i < ci else "cur" if i == ci else ""}"><b>{s}</b>{f"<em>{note}</em>" if i == ci else ""}</div>' for i, s in enumerate(FLOW)) + '<span class="side2">보류 · 이탈 ⋯</span></div>'
HIST = [('26.10.22', '입금 확인', '6·7월분 10,898,800 — 매출 시트 동기화로 반영', 'ok', '청구'),
        ('26.08.31', '소개 프로젝트 견적', '남양주 왕숙 A-6BL 8공구 98,760,000 · 11월 도입 예상', 'lead', '견적'),
        ('26.08.13', '소개', '이 현장 공무팀장이 남양주 왕숙 A-6BL 8공구 소개 → 새 프로젝트', 'lead', '리드'),
        ('26.05.31', '서비스 종료', '편집비용(월 50회) · 장비설치 · NVR 모니터 과금 끝', 'na', '서비스'),
        ('26.05.08', '첫 입금', '04월분 72,259,000 (2~4월 사용분 + 설치·편집)', 'ok', '청구'),
        ('26.04.30', '과금 시작', '월간 선납 · 말일 계산서 · 익익월 말일 납기', 'info', '서비스'),
        ('날짜 없음', '장비 교체', 'AI CCTV 엣지 교체 2건 (엣지 1대 불량) — 반출 연동 뒤엔 날짜·시리얼과 함께 자동', 'warn', '장비'),
        ('26.02.23', '이동형 회수', '이동형 AI CCTV · 타임랩스 · 회선 1대씩', 'na', '장비'),
        ('26.02.06', '설치 완료', '고정형 AI CCTV 13 · 타임랩스 13 · Wearable Cam 10 · NVR 1 · 이동형 1', 'info', '장비'),
        ('25.11.12', '문의', '홈페이지 문의 · 검색 › 구글 · 담당 최한별', 'lead', '리드')]
hist = ''.join(f'<li class="{c}"><span class="d">{d}</span><b>{k}</b><span class="t">{esc(x)} <i class="src">{s}</i></span></li>' for d, k, x, c, s in HIST)
D1 = f'''<div class="pg2 wide"><div class="h2top"><span class="muted">‹ 프로젝트</span><span class="sp"></span><span class="btn sm">반출 요청</span><span class="btn sm">견적서</span><span class="btn sm quiet">⋯</span></div>
<div class="h2name"><h1>고양장항 S-1BL 아파트 건설공사 5공구</h1>{chip("info", "현장")}<span class="muted">· 고객사 <span class="lk">계룡건설산업 ↗</span> · 발주 LH · 공사 25.02.25 – 27.12.18 (422일 남음) · 워크스페이스 —</span></div>
{step('과금 중', '04.30~ · +175일')}
<div class="props"><div><span>영업 담당</span><b>{av("최한별")} 최한별 ▾</b></div><div><span>청구처 (돈 내는 곳)</span><b>계룡건설산업 · 본사 묶음 ▾</b></div><div><span>월 청구</span><b>4,954,000 · 월간 선납</b></div><div><span>고객 쪽 사람</span><b>현장 황○○ 팀장 · 청구 서○○ 차장</b></div><div class="cd-due"><span>미납</span><b>10,898,800 <i>2건 · 연체 없음</i></b></div></div>
{tabs(['히스토리', '견적·계약', '서비스 21', '장비 38', '청구 6', '기록', '문서'], '히스토리')}
<div class="body2"><div>
<div class="cd-h"><b>히스토리</b><span class="muted">리드 · 견적 · 장비 · 서비스 · 청구가 날짜순 (따로 입력하지 않음)</span><span class="sp"></span><span class="seg"><span class="on">전체</span><span>견적</span><span>장비</span><span>청구</span></span></div><ol class="cd-hist">{hist}</ol></div>
<div class="rcol">{issues([("warn", "8월분 납기 10.31", "9일 남음 · 5,449,400"),
                             ("", "소개 프로젝트 · 남양주 왕숙 A-6BL", "견적 98,760,000 (08.31) · 11월 도입 예상"),
                             ("", "공사 종료 27.12.18", "422일 남음 · 철수·연장 계획 미정")], '+ 이슈')}
{card('관계', '<div class="kv3"><span>고객사</span><b class="lk">계룡건설산업 (2511121131)</b><span>청구처</span><b>계룡건설산업 본사</b><span>발주처</span><b>LH</b><span>소개</span><b class="muted">—</b></div>', '수정')}
{card('장비', '<div class="kv3"><span>운영</span><b>고정형 CCTV 13 · 타임랩스 13 · Wearable 10 · NVR 1</b><span>회수</span><b>이동형 1 (02.23)</b><span>교체</span><b>엣지 2</b></div>', '반출 →')}</div></div></div>'''
F2 = frame('프로젝트 상세', '프로젝트', D1, dims=[('left:206px;top:60px', '머리: 프로젝트 이름 + 유형(현장/용역/PoC) + 고객사 링크'),
                                              ('left:206px;top:132px', '단계: 문의 → 견적 → 계약 → 설치 → 과금 중 → 종료 (용역은 설치 없음)'),
                                              ('left:206px;top:174px', '속성 줄: 영업 담당 · 청구처 · 월 청구 · 고객 쪽 사람 · 미납'),
                                              ('left:206px;top:236px', '탭: 히스토리 · 견적·계약 · 서비스 · 장비 · 청구 · 기록 · 문서')], h=900)

# ───────── 2-b. 프로젝트 상세 — 남양주 왕숙 (견적 단계, 견적·계약 탭) ─────────
D2 = f'''<div class="pg2 wide"><div class="h2top"><span class="muted">‹ 프로젝트</span><span class="sp"></span><span class="btn sm primary">견적서 새 버전</span><span class="btn sm quiet">⋯</span></div>
<div class="h2name"><h1>남양주 왕숙 A-6BL 아파트 건설공사 8공구</h1>{chip("info", "현장")}<span class="muted">· 고객사 <span class="lk">계룡건설 ↗</span> <span class="warn">(계룡건설산업과 같은 회사로 보임 · 합치기)</span> · 발주 LH · 소개 <span class="lk">고양장항 S-1BL 5공구 ↗</span></span></div>
{step('견적', '08.31~ · +52일')}
<div class="props"><div><span>영업 담당</span><b>{av("최한별")} 최한별 ▾</b></div><div><span>최신 견적</span><b>98,760,000 · 08.31</b></div><div><span>도입 예상</span><b>11월 ▾</b></div><div><span>다음 할 일</span><b>견적 회신 확인 ▾</b></div><div><span>청구처</span><b class="muted">계약 때 정함</b></div></div>
{tabs(['히스토리', '견적·계약 1', '서비스', '청구', '기록 1', '문서'], '견적·계약 1')}
<div class="body2"><div>
<div class="cd-h"><b>견적서</b><span class="muted">고칠 때마다 새 버전 · 확정한 버전이 계약(계약서가 없으면 견적서가 계약) · 확정 견적 항목 → 서비스 줄 제안</span></div>
<table class="ds fixed"><colgroup><col style="width:10%"><col style="width:13%"><col style="width:18%"><col style="width:14%"><col style="width:45%"></colgroup>
<thead><tr><th>버전</th><th>날짜</th><th>금액 (공급가)</th><th>상태</th><th>메모</th></tr></thead>
<tbody><tr><td class="c"><b>v1</b></td><td class="c">26.08.31</td><td class="num">98,760,000</td><td class="c">{chip("info", "보냄")}</td><td class="muted">매출 시트 "견적 완료" · 11월 예상</td></tr>
<tr class="ghost"><td class="c">v2</td><td class="c">—</td><td class="num">—</td><td class="c"><span class="muted">고치면 여기에</span></td><td class="muted">항목 · 대수 · 단가 · 기간 차이를 v1 과 나란히</td></tr>
<tr class="ghost"><td class="c">확정</td><td class="c">—</td><td class="num">—</td><td class="c"><span class="muted">확정 = 계약</span></td><td class="muted">계약서 파일이 있으면 같이 · 확정 뒤 "서비스 줄 만들기"</td></tr></tbody></table>
<div class="cd-h" style="margin-top:14px"><b>기록</b></div><ol class="cd-hist"><li class="lead"><span class="d">26.08.13</span><b>전화 발신</b><span class="t">고양장항 공무팀장 소개 · 8/19 또는 20 미팅 <i class="src">리드</i></span></li></ol></div>
<div class="rcol">{issues([("warn", "견적 회신 52일째", "08.31 발송 · 11월 도입 예상 — 확인 연락"), ("warn", "고객사 이름 3곳", "계룡건설 · 계룡건설산업 · 계룡건설산업(주) — 합치기")], '+ 이슈')}
{card('관계', '<div class="kv3"><span>고객사</span><b class="lk">계룡건설</b><span>발주처</span><b>LH</b><span>소개</span><b class="lk">고양장항 5공구 · 황○○ 팀장</b></div>', '수정')}</div></div></div>'''
F2b = frame('프로젝트 상세', '프로젝트', D2, dims=[('left:206px;top:236px', '견적·계약 탭: 버전이 쌓이고, 확정 = 계약 → 서비스 줄 제안')], h=760)

# ───────── 3. 고객사 목록 (돈 내는 곳 = 고객 LIST) ─────────
CU = [('2606301400', '원하건설 주식회사', '종합건설사', '0 / 2', '프로젝트 선납', 138_060_000, 54_003_400, 0, ''),
      ('424050202', '(주)국보디자인', '인테리어', '7 / 64', '월간 후불', 120_295_100, 40_192_130, 2, ''),
      ('2511121131', '계룡건설산업', '종합건설사', '1 / 1', '월간 선납 · 본사 묶음', 105_322_000, 10_898_800, 0, '최한별'),
      ('—', '주식회사 엔씨엘', '기타', '0 / 5', '월간 선납', 60_146_091, 0, 0, '전성환'),
      ('2607231538', '대방산업개발', '종합건설사', '0 / 1', '프로젝트 선납', 54_950_000, 0, 0, ''),
      ('2603110854', '삼흥종합건설', '종합건설사', '0 / 1', '프로젝트 선납', 49_720_000, 0, 0, '최한별'),
      ('123071401', '(주)퍼시스', '인테리어', '5 / 93', '월간 후불', 42_720_000, 0, 0, ''),
      ('2507071943', '효성중공업(주)', '종합건설사', '1 / 14', '월간 선납 · 본사 묶음', 40_777_000, 21_101_300, 3, ''),
      ('2512120403', 'SYSCON, LLC', '종합건설사', '0 / 3', '프로젝트 선납', 38_129_424, 17_600_000, 1, '최한별'),
      ('2512301044', '주식회사 옥당산업', '전문건설사', '5 / 14', '월간 선납', 36_607_000, 7_322_700, 0, '최한별')]
rows = ''.join(f'<tr class="{"act" if n.startswith("효성") else ""}"><td class="c muted">{"<span class=warn>ID 없음</span>" if code == "—" else code}</td><td><b>{esc(n)}</b></td><td class="c">{t}</td><td class="c">{p}</td><td class="muted">{b}</td><td class="num g">{won(y)}</td><td class="num {"bad" if u else ""}">{won(u)}{f" <span class=bad>· 연체 {o}</span>" if o else ""}</td><td class="c">{av(a) if a else "—"}</td></tr>' for code, n, t, p, b, y, u, o, a in CU)
L3 = f'''{toolbar([('과금 중 117', ''), ('올해 매출 241', 'on'), ('미납 87', ''), ('전체 762', '')], '<span class="inp s">회사명·고객사 ID·사업자번호</span><span class="sel">유형 전체</span><span class="sel">영업 담당 전체</span><span class="btn sm primary">+ 고객사</span>')}
<div class="cd-warnbar">고객사 ID 없는 고객 18곳 (올해 매출 있음) — ID 규칙 정해지면 한 번에 정리 · <span class="lk">목록 보기</span></div>
{kpis([('올해 매출 고객사', '241곳', '돈 내는 곳 = 고객 LIST', ''), ('10월 과금', '117곳', '', ''), ('올해 매출', '19.8억', '공급가 · 12월 예정 포함', ''), ('미납', '87곳', '2.90억', 'bad'), ('프로젝트', '554', '올해 매출 있는 프로젝트', '')])}
{tbl([10, 22, 10, 9, 17, 12, 13, 7], ['고객사 ID', '고객사', '유형', '프로젝트 과금 중/전체', '청구 방식', '올해 매출', '미납', '영업'], rows)}'''
F3 = frame('고객사', '고객사', L3, dims=[('left:206px;top:60px', '고객사 = 돈 내는 곳 (고객 LIST · 고객사 ID). 발주처가 내면 발주처가 고객사'),
                                      ('left:206px;top:192px', '프로젝트 수 · 청구 방식(현장별 / 본사 묶음) · 미납 · 연체')], h=700)

# ───────── 4. 고객사 상세 — 효성중공업(주) ─────────
HS = [('경산대임 A-2BL 공동주택 2공구', '현장', 'LH현장', 'Wearable · 편집 · 회선 · CCTV 연동', '26.09.14', '27.02.11', 15_030_000, '과금 중' if False else '과금 끝', ''),
      ('탄천변 동측도로 구조개선 1구간', '현장', '공공', 'AI CCTV · 휴랜 · 회선 · Wearable', '25.10.21', '29.12.31', 11_539_000, '과금 중', ''),
      ('광주경안2지구 주상복합', '현장', '신축', '체감온도계 · 플랫폼 · 운임비', '26.07.02', '—', 1_259_000, '과금 끝', ''),
      ('대전선화2구역 재개발', '현장', '신축', '체감온도계 · 플랫폼 · 운임비', '26.08.03', '33.11.30', 1_259_000, '과금 끝', ''),
      ('산곡재개발 (부평산곡)', '현장', '신축', '체감온도계 · 플랫폼 · 운임비', '26.08.03', '28.06.24', 1_259_000, '과금 끝', ''),
      ('부천 올림푸스 데이터센터', '현장', '신축', '체감온도계 · 플랫폼 · 운임비', '26.08.03', '26.09.30', 1_259_000, '과금 끝', ''),
      ('수원당수 아파트 5공구', '현장', '신축', '체감온도계 · 플랫폼 · 운임비', '26.07.01', '27.05.05', 1_159_000, '과금 끝', ''),
      ('…외 7곳', '', '', '체감온도계 여름 사용 (7~9월)', '', '', 7_013_000, '과금 끝', '')]
rows = ''.join(f'<tr><td><b>{esc(n)}</b></td><td class="c">{chip(TYPE[t], t) if t else ""}</td><td class="c muted">{cat}</td><td class="c">{chip("ok" if st == "과금 중" else "na", st)}</td><td class="muted">{svc}</td><td class="c">{bs}</td><td class="c">{pe}</td><td class="num">{won(rev)}</td></tr>' for n, t, cat, svc, bs, pe, rev, st, _ in HS)
A = f'''<div class="pg2 wide"><div class="h2top"><span class="muted">‹ 고객사</span><span class="sp"></span><span class="btn sm quiet">⋯</span></div>
<div class="h2name"><h1>효성중공업(주)</h1>{chip("ok", "활성")}<span class="muted">· 종합건설사 · 고객사 ID 2507071943 · 사업자 702-85-00762 · 처음 도입 25.10</span></div>
<div class="props"><div><span>영업 담당</span><b>미배정 ▾</b></div><div><span>청구 방식</span><b>본사 묶음 · 20일 계산서 · 익월 10일 ▾</b></div><div><span>올해 매출</span><b>40,777,000</b></div><div><span>프로젝트</span><b>14 · 과금 중 1</b></div><div class="cd-due"><span>미납</span><b>21,101,300 <i>연체 3건</i></b></div></div>
{tabs(['프로젝트 14', '청구', '기록', '문서', '정보'], '프로젝트 14')}
<div class="body2"><div>
<div class="cd-h"><b>프로젝트</b><span class="muted">줄을 누르면 프로젝트 상세</span><span class="sp"></span><span class="seg"><span>과금 중 1</span><span class="on">전체 14</span></span><span class="btn sm">+ 프로젝트</span></div>
<table class="ds fixed"><colgroup><col style="width:27%"><col style="width:8%"><col style="width:8%"><col style="width:10%"><col style="width:21%"><col style="width:9%"><col style="width:8%"><col style="width:9%"></colgroup>
<thead><tr><th>프로젝트</th><th>유형</th><th>분류</th><th>단계</th><th>서비스</th><th>과금 시작</th><th>공사 끝</th><th>올해 매출</th></tr></thead>
<tbody><tr class="sum top"><td>합계 14</td><td></td><td></td><td></td><td></td><td></td><td></td><td class="num">40,777,000</td></tr>{rows}</tbody></table></div>
<div class="rcol">{issues([("due", "연체 3건 21,101,300", "7월분 73일 · 8월분 42일 · 9월분 12일 지남 · 본사 묶음 청구"),
                             ("warn", "체감온도계 13현장 과금 끝", "7~9월 사용 · 회수 확인"),
                             ("warn", "경산대임 이름 2개", "A-2BL 과 A-2BL 2공구 — 같은 프로젝트인지")])}
{card('고객 쪽 사람', '<div class="kv3"><span>소통</span><b>허○○ · 본사</b><span>청구</span><b>허○○ · 계산서 메일 2곳</b><span>현장별</span><b class="muted">프로젝트 상세에서</b></div>', '수정')}
{card('청구 방식', '<p class="q">본사 묶음 — 프로젝트별 청구 내역을 모아 본사로 한 장<br><span class="muted">20일 계산서 · 익월 10일 입금 · 보증금 없음</span></p>', '바꾸기')}</div></div></div>'''
F4 = frame('고객사 상세', '고객사', A, dims=[('left:206px;top:60px', '고객사 = 고객사 ID · 사업자번호'), ('left:206px;top:196px', '첫 탭 = 프로젝트 목록 / 오른쪽 주요 이슈 · 고객 쪽 사람 · 청구 방식')], h=820)

# ───────── 5. 매출 현황 — 고객사 › 프로젝트 › 서비스 ─────────
SV = [('타임랩스', 2_340_000, 25_740_000), ('LTE/인터넷 회선', 1_350_000, 14_850_000), ('AI CCTV', 520_000, 5_720_000), ('Wearable Cam', 504_000, 5_544_000), ('NVR 구축', 140_000, 2_368_000), ('플랫폼', 100_000, 1_100_000), ('편집비용', 0, 36_000_000), ('장비설치', 0, 14_000_000)]
mrow = lambda a: ''.join(f'<td class="num">{won(a)}</td>' for _ in range(6))
r5 = (f'<tr class="grp"><td colspan="2"><b>계룡건설산업</b> <span class="muted">2511121131 · 월간 선납</span></td>{mrow(4_954_000)}<td class="num g"><b>105,322,000</b></td></tr>'
      f'<tr class="pj"><td colspan="2">└ 고양장항 S-1BL 5공구 <span class="muted">현장 · 서비스 21줄</span></td>{mrow(4_954_000)}<td class="num g">105,322,000</td></tr>'
      + ''.join(f'<tr><td class="sv">{n}</td><td class="c muted">{"끝 05.31" if not m else "02.06~"}</td>{mrow(m)}<td class="num g">{won(y)}</td></tr>' for n, m, y in SV)
      + '<tr class="grp"><td colspan="2"><b>한국토지공사</b> <span class="muted">용역</span></td><td class="num">—</td><td class="num">—</td><td class="num">—</td><td class="num">3,300,000</td><td class="num">—</td><td class="num">—</td><td class="num g"><b>3,300,000</b></td></tr>'
      + '<tr class="pj"><td colspan="2">└ 건설현장 영상기록제도 샘플영상 촬영 용역 <span class="muted">용역 · 1줄</span></td><td class="num">—</td><td class="num">—</td><td class="num">—</td><td class="num">3,300,000</td><td class="num">—</td><td class="num">—</td><td class="num g">3,300,000</td></tr>')
L5 = f'''{toolbar([('2026', 'on'), ('2025', '')], '<span class="muted s12">시트 동기화 · 10.23 08:00 자동 · 61건 반영</span><span class="btn sm">지금 동기화</span><span class="inp s">고객사·프로젝트·서비스</span><span class="sel">펼침: 프로젝트까지 ▾</span>')}
<div class="cd-note">원본은 구글 시트 — CRM 에서 고친 금액은 다음 동기화(매일 08시) 때 시트 값으로 돌아감. 현장 중심으로 옮긴 뒤 CRM 원본으로 전환</div>
{tbl([30, 10, 9, 9, 9, 9, 8, 8, 8], ['고객사 › 프로젝트 › 서비스', '과금', '7월', '8월', '9월', '10월', '11월', '12월', '올해'], r5, '<tr class="sum top"><td colspan="2">합계 241곳 · 프로젝트 554 · 서비스 3,125줄</td><td class="num">—</td><td class="num">—</td><td class="num">—</td><td class="num">175,805,644</td><td class="num">113,288,978</td><td class="num">90,186,478</td><td class="num g">1,983,161,968</td></tr>')}'''
F5 = frame('매출 현황', '매출 현황', L5, dims=[('left:206px;top:60px', '툴바: 연도 │ 시트 동기화 상태 · 지금 동기화 · 검색 · 펼침 단계'),
                                            ('left:206px;top:150px', '고객사 › 프로젝트 › 서비스 3단으로 접고 펼침 (지금은 서비스 3,125줄이 한 표)')], h=700)

CSS = '''<style>
.pg2.wide{max-width:1180px}
#m-cust-detail .ds.fixed td{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
#m-cust-detail tr.ghost td{color:var(--fg-3);background:transparent}
#m-cust-detail tr.grp td{background:var(--bg-subtle);font-weight:500}#m-cust-detail tr.pj td{font-weight:500}#m-cust-detail td.sv{padding-left:34px;color:var(--fg-2)}
.cd-due b{color:var(--due,#b4233a)!important}.cd-due i{font-style:normal;font-size:11.5px;color:var(--due,#b4233a);font-weight:500}.due{color:var(--due,#b4233a)}.warn{color:var(--warn)}
.cd-h{display:flex;align-items:center;gap:8px;margin:0 0 6px;font-size:12px}.cd-h b{font-size:13px;font-weight:600}.cd-h .sp{flex:1}.cd-h .lk{color:var(--accent)}
.cd-warnbar,.cd-note{font-size:12px;padding:6px 10px;border-radius:6px;margin:0 0 10px}.cd-warnbar{border:1px solid color-mix(in srgb,var(--warn) 45%,var(--line));background:color-mix(in srgb,var(--warn) 7%,var(--bg))}.cd-note{color:var(--fg-2);background:var(--bg-subtle)}.s12{font-size:12px}
.seg{display:inline-flex;border:1px solid var(--line);border-radius:6px;overflow:hidden}.seg span{padding:2px 9px;font-size:12px;color:var(--fg-2)}.seg span+span{border-left:1px solid var(--line)}.seg .on{background:var(--fg);color:var(--bg)}
.cd-iss ol{list-style:none;margin:0;padding:0;display:grid;gap:7px}.cd-iss li{padding-left:9px;border-left:3px solid var(--line);display:grid;gap:1px}.cd-iss li b{font-size:12.5px;font-weight:600}.cd-iss li span{font-size:11.5px;color:var(--fg-2)}.cd-iss li.due{border-color:var(--due,#b4233a)}.cd-iss li.due b{color:var(--due,#b4233a)}.cd-iss li.warn{border-color:var(--warn)}
.cd-hist{list-style:none;margin:0 0 4px;padding:0 0 0 14px;border-left:1px solid var(--line);font-size:12.5px}.cd-hist li{position:relative;display:grid;grid-template-columns:76px 110px 1fr;gap:8px;padding:5px 0}.cd-hist li::before{content:"";position:absolute;left:-18px;top:11px;width:7px;height:7px;border-radius:50%;background:var(--line)}.cd-hist .d{color:var(--fg-3);font-variant-numeric:tabular-nums}.cd-hist b{font-weight:600}.cd-hist .t{color:var(--fg-2);min-width:0}.cd-hist .src{font-style:normal;font-size:11px;color:var(--fg-3);border:1px solid var(--line);border-radius:3px;padding:0 4px;margin-left:4px}
.cd-hist li.due::before{background:var(--due,#b4233a)}.cd-hist li.warn::before{background:var(--warn)}.cd-hist li.ok::before{background:var(--ok)}.cd-hist li.info::before{background:var(--info)}.cd-hist li.lead::before{background:var(--accent)}
.cd-model{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin:8px 0 14px}.cd-model div{border:1px solid var(--line);border-radius:8px;padding:10px;font-size:12.5px;display:grid;gap:4px}.cd-model b{font-size:13px}.cd-model span{color:var(--fg-2);font-size:12px}.cd-model div.key{border-color:var(--accent);background:color-mix(in srgb,var(--accent) 5%,var(--bg))}
</style>'''
MODEL = '''<div class="cd-model"><div><b>고객사</b><span>돈 내는 곳 = 고객 LIST · 고객사 ID · 사업자번호. 발주처가 내면 발주처. 청구 방식(프로젝트별 / 본사 묶음) · 고객 쪽 사람(소통 · 청구)</span></div>
<div class="key"><b>프로젝트</b><span>일의 단위 = <b>현장 · 용역 · PoC</b>. 리드 · 견적 · 계약 · 서비스 · 장비 · 청구 · 기록이 모두 여기에 묶임. 고객사 · 청구처 · 발주처 · 소개 관계</span></div>
<div><b>견적·계약</b><span>견적서가 계약을 대신하는 경우가 많음 — 버전이 쌓이고, 확정 버전 = 계약. 확정 항목 → 서비스 줄 제안</span></div>
<div><b>서비스 (지금 매출 현황 한 줄)</b><span>프로젝트 × 서비스 22종 × 과금 기간·방식(선납 · 후불 · 카드). 월 금액 → 청구. 장비 설치·회수에서 시작·끝 제안</span></div></div>'''
SEC = f'''<section id="m-cust-detail">{CSS}<h2>고객관리 v4 — 고객사 → 프로젝트(현장 · 용역 · PoC) (시안 2026-10-22 · 실데이터, 고객 쪽 사람 이름 가림)</h2>
<p class="rule">10/22 사용자: 현장 베이스로 움직인다 · 같은 회사도 현장별로 유입·관리가 나뉜다 · LH 용역처럼 현장과 상관없는 거래도 있다 → 단위 이름 = <b>프로젝트</b>. 계약서가 없으면 견적서가 계약 · 발주처가 돈을 내기도 한다 · 돈을 내면 고객 LIST 에 올린다 · 플랫폼 회원사(가입 데이터)는 가져오지 않는다.</p>
{MODEL}
<table class="dg"><colgroup><col style="width:22%"><col style="width:39%"><col style="width:39%"></colgroup><thead><tr><th>메뉴</th><th>지금</th><th>v4</th></tr></thead><tbody>
<tr><td><b>프로젝트</b> (새로, 주 화면)</td><td>없음 — 현장은 매출 현황 줄 이름 앞부분에만 (9,710줄 = 3,430곳)</td><td>프로젝트 목록 · 상세. "과금 고객"은 여기 "과금 중" 탭으로</td></tr>
<tr><td><b>고객사</b></td><td>전체 고객 · 과금 고객 (같은 회사가 이름 따라 여러 곳)</td><td>돈 내는 곳 목록 · 상세(프로젝트 목록 · 청구 방식 · 고객 쪽 사람 · 같은 회사 합치기)</td></tr>
<tr><td><b>매출 현황</b></td><td>서비스 3,125줄 한 표 · 시트가 원본</td><td>고객사 › 프로젝트 › 서비스로 접고 펼침 · 시트 동기화 표시</td></tr>
<tr><td>계약 관리</td><td>따로 메뉴</td><td>프로젝트 상세 "견적·계약" 탭으로 (메뉴 없앰)</td></tr></tbody></table>
<h3 class="ph3">1. 프로젝트 목록</h3><div class="fwrap">{F1}</div>
<h3 class="ph3">2. 프로젝트 상세 — 고양장항 S-1BL 5공구 (현장 · 과금 중)</h3><div class="fwrap">{F2}</div>
<h3 class="ph3">2-b. 프로젝트 상세 — 남양주 왕숙 A-6BL 8공구 (견적 단계 · 견적·계약 탭)</h3><div class="fwrap">{F2b}</div>
<h3 class="ph3">3. 고객사 목록</h3><div class="fwrap">{F3}</div>
<h3 class="ph3">4. 고객사 상세 — 효성중공업(주)</h3><div class="fwrap">{F4}</div>
<h3 class="ph3">5. 매출 현황 — 고객사 › 프로젝트 › 서비스</h3><div class="fwrap">{F5}</div>
<div class="cmp"><div><h4>정해 주실 것</h4><ul><li>메뉴: 고객관리 = 프로젝트 · 고객사 · 매출 현황 (과금 고객 · 계약 관리 메뉴는 없앰)</li><li>프로젝트 단계: 문의 → 견적 → 계약 → 설치 → 과금 중 → 종료 (용역 · PoC 는 설치 없음)</li><li>프로젝트마다 고객사 · 청구처 · 발주처 · 소개를 따로</li><li>견적서 버전 · 확정 = 계약 → 서비스 줄 제안</li><li>고객사 ID 규칙 (자동 생성은 검토 중)</li></ul></div>
<div><h4>순서</h4><ul><li>1 프로젝트 테이블 + 기존 9,710줄 연결 (이름이 애매한 것은 목록으로 확인) · 고객사 ID 없는 18곳 정리</li><li>2 프로젝트 목록 · 상세 → 고객사 목록 · 상세 → 매출 현황 묶음</li><li>3 견적서를 프로젝트에 (버전 · 확정)</li><li>4 장비 반출을 프로젝트에 (설치·회수 → 과금 시작·끝 제안)</li></ul></div></div></section>'''

s = open(P, encoding='utf-8').read()
if '<section id="m-cust-detail"' in s:
    i = s.index('<section id="m-cust-detail"'); j = s.index('<section id="m-cust-wait"', i); s = s[:i] + s[j:]
i = s.index('<section id="m-cust-wait"'); s = s[:i] + SEC + s[i:]
import re
s = re.sub(r'<a href="#m-cust-detail" class="i">[^<]*</a>', '', s)
s = s.replace('<a href="#m-list-v2" class="i">고객 목록</a>', '<a href="#m-list-v2" class="i">고객 목록</a><a href="#m-cust-detail" class="i">v4 프로젝트 · 고객사 (시안)</a>', 1)
s = s.replace('<p class="rule">매출 현황 · 과금 고객 · 계약 관리 · 고객 상세</p>', '<p class="rule">매출 현황 · 과금 고객 · 계약 관리</p>')
open(P, 'w', encoding='utf-8').write(s)
print('m-cust-detail v4', len(SEC), 'doc', len(s))
