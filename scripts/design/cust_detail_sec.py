# 고객관리 v3 — 현장 중심 (2026-10-22 사용자: "현장 베이스로 움직인다 · 같은 회사도 현장별로 유입·관리가 나뉜다 · 전사 도입은 많지 않다 · 장비 운용까지 CRM에서 처리되면 자동 연동")
# 그림: 고객사 = 효성중공업(주) 현장 14곳 / 현장 = 계룡건설산업 고양장항 S-1BL 5공구 / 장비 운용 → 현장 히스토리·매출 현황 연동 흐름
# 실데이터(2026-10-22 CRM · 플랫폼 관리자 회원사 목록 · 매출 시트 고객 LIST), 고객사 사람 이름은 가림
# 실행: python3 -X utf8 -c "exec(compile(open('cust_detail_sec.py',encoding='utf-8').read(),'cust_detail_sec.py','exec'))"
# 파이프라인(assemble → reorganize → rebuild)을 다시 돌리면 rebuild.py 다음에 이 스크립트를 한 번 더.
import html
P = '/Users/david/Desktop/클로드/004_CRM 웹개발/caasworks/docs/design/카스웍스_CRM_디자인정의.html'
esc = lambda x: html.escape(str(x))
won = lambda v: f'{int(v):,}'
def av(n): return f'<span class="av" title="{esc(n)}">{esc(n[:1])}</span>'
def chip(t, s): return f'<span class="st {t}">{esc(s)}</span>'

MENU = [('대시보드', None), ('마케팅', 1), ('세일즈', 1), ('고객관리', ['매출 현황', '과금 고객', '전체 고객', '현장', '계약 관리']), ('재무관리', 1), ('운영관리', 1), ('분석', 1), ('VoC/CS', 1), ('업무', 1), ('피드백', 1), ('설정', 1)]
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
            f'<div class="frame" style="height:{h}px">{sidebar(act)}<div class="main"><header class="hd"><b>{title}</b><div class="r"><span class="srch">회사·현장·메뉴 검색 <kbd>⌘K</kbd></span><span class="fs">A−  14  A+</span>{av("전성환")}</div></header>'
            f'<div class="ct">{body}</div></div>{d}</div>')
def card(title, body, act=''):
    return f'<div class="card2x"><div class="ch"><b>{title}</b><span class="muted">{act}</span></div>{body}</div>'
def issues(items, act=''):
    li = ''.join(f'<li class="{c}"><b>{t}</b><span>{d}</span></li>' for c, t, d in items)
    return f'<div class="card2x cd-iss"><div class="ch"><b>주요 이슈 {len(items)}</b><span class="muted">{act}</span></div><ol>{li}</ol></div>'
def tabs(names, on):
    return '<div class="tabs t2">' + ''.join(f'<span class="{"on" if n == on else ""}">{n}</span>' for n in names) + '</div>'

# ───────── A. 고객사 = 효성중공업(주) — 현장 14곳 ─────────
# (현장, 플랫폼 워크스페이스, 유입, 단계, 서비스, 과금 시작, 공사 끝, 올해 매출, 메모)
HS = [('경산대임 A-2BL 공동주택 2공구', '5788700896 ?', '추가 현장', '운영', 'Wearable Cam · 편집 · 회선 · CCTV 연동', '26.09.14', '27.02.11', 15_030_000, ''),
      ('탄천변 동측도로 구조개선 1구간', '7028500762 ?', '25.07 문의', '운영', 'AI CCTV · 휴랜 · 회선 · Wearable', '25.10.21', '29.12.31', 11_539_000, ''),
      ('광주경안2지구 주상복합', 'gwangju', '본사 확산', '운영', '체감온도계 · 플랫폼', '26.07.02', '—', 1_259_000, ''),
      ('대전선화2구역 재개발', 'sunhwa', '본사 확산', '운영', '체감온도계 · 플랫폼', '26.08.03', '33.11.30', 1_259_000, ''),
      ('산곡재개발 (부평산곡)', 'sangok', '본사 확산', '운영', '체감온도계 · 플랫폼', '26.08.03', '28.06.24', 1_259_000, ''),
      ('부천 올림푸스 데이터센터', 'bucheon', '본사 확산', '철수 확인', '체감온도계 · 플랫폼', '26.08.03', '26.09.30', 1_259_000, 'end'),
      ('삼성동98번지 가로주택', 'samsung', '본사 확산', '철수 확인', '체감온도계 · 플랫폼', '26.07.02', '26.09.30', 1_159_000, 'end'),
      ('수원당수 아파트 5공구', 'dangsu', '본사 확산', '운영', '체감온도계 · 플랫폼', '26.07.01', '27.05.05', 1_159_000, ''),
      ('과천지식정보타운 오피스텔', 'gwacheon', '본사 확산', '운영', '체감온도계 · 플랫폼', '26.07.23', '29.09.30', 1_159_000, ''),
      ('창원3공장 스태콤 증축', 'changwon', '본사 확산', '운영', '체감온도계 · 플랫폼', '26.07.09', '27.08.31', 1_159_000, 'stop'),
      ('경상북도 농업기술원', 'nong', '본사 확산', '운영', '체감온도계 · 플랫폼', '26.07.01', '28.02.28', 1_159_000, 'stop'),
      ('우암1구역 재개발', 'uam1', '본사 확산', '철수 확인', '체감온도계 · 플랫폼', '26.07.10', '26.09.30', 1_159_000, 'end'),
      ('대전 갑천역 APT', 'gapcheon', '본사 확산', '철수 확인', '체감온도계 · 플랫폼', '26.08.01', '26.09.30', 1_109_000, 'end'),
      ('경산대임 A-2BL', 'a-2bl', '본사 확산', '확인 필요', '체감온도계 · 플랫폼', '26.08.01', '26.10.31', 1_109_000, 'dup')]
STG = {'운영': 'ok', '철수 확인': 'warn', '확인 필요': 'warn'}
rows = ''
for n, ws, inf, stg, svc, bs, pe, rev, memo in HS:
    wsx = f'<span class="muted">{ws}</span>' if ws.endswith('?') else ws
    flag = {'end': '<span class="warn"> · 공사 끝남</span>', 'stop': '<span class="muted"> · 과금 없음</span>', 'dup': '<span class="warn"> · 이름 겹침</span>'}.get(memo, '')
    rows += f'<tr><td><b>{esc(n)}</b>{flag}</td><td class="c">{wsx}</td><td class="c">{inf}</td><td class="c">{chip(STG[stg], stg)}</td><td>{svc}</td><td class="c">{bs}</td><td class="c">{pe}</td><td class="num">{won(rev)}</td></tr>'
HY_TOTAL = sum(h[7] for h in HS)
A = f'''<div class="pg2 wide"><div class="h2top"><span class="muted">‹ 고객 목록</span><span class="sp"></span><span class="btn sm quiet">‹ 이전</span><span class="btn sm quiet">다음 ›</span><span class="btn sm quiet">⋯</span></div>
<div class="h2name"><h1>효성중공업(주)</h1>{chip("ok", "활성")}<span class="muted">· 종합건설사 · 사업자 702-85-00762 · 처음 도입 25.10 · 현장 14곳 (운영 9 · 철수 확인 4 · 확인 필요 1)</span></div>
<div class="props"><div><span>영업 담당</span><b>미배정 ▾</b></div><div><span>청구</span><b>본사 묶음 · 20일 계산서 · 익월 10일 ▾</b></div><div><span>올해 매출</span><b>{won(HY_TOTAL)}</b></div><div><span>현장</span><b>14곳 · 운영 9</b></div><div class="cd-due"><span>미납</span><b>21,101,300 <i>연체 3건</i></b></div></div>
{tabs(['현장 14', '청구', '기록', '문서', '정보'], '현장 14')}
<div class="body2"><div>
<div class="cd-h"><b>현장</b><span class="muted">현장 = 플랫폼 워크스페이스 1개 · 줄을 누르면 현장 상세</span><span class="sp"></span><span class="seg"><span class="on">전체 14</span><span>운영 9</span><span>철수 확인 4</span></span><span class="btn sm">+ 현장</span></div>
<table class="ds fixed"><colgroup><col style="width:25%"><col style="width:12%"><col style="width:10%"><col style="width:10%"><col style="width:17%"><col style="width:8%"><col style="width:8%"><col style="width:10%"></colgroup>
<thead><tr><th>현장</th><th>워크스페이스</th><th>유입</th><th>단계</th><th>서비스</th><th>과금 시작</th><th>공사 끝</th><th>올해 매출</th></tr></thead>
<tbody><tr class="sum top"><td>합계 14곳</td><td></td><td></td><td></td><td></td><td></td><td></td><td class="num">{won(HY_TOTAL)}</td></tr>{rows}</tbody></table></div>
<div class="rcol">{issues([("due", "연체 3건 21,101,300", "7월분 73일 · 8월분 42일 · 9월분 12일 지남 · 본사 묶음 청구"),
                             ("warn", "공사 끝난 현장 4곳 과금 정리", "부천 · 삼성동 · 우암 · 갑천 — 09.30 공사 끝 · 회수·과금 종료 확인"),
                             ("warn", "경산대임 이름 2개", "A-2BL 과 A-2BL 2공구 — 같은 현장인지 확인"),
                             ("", "워크스페이스 확인 2", "사업자번호로 만든 워크스페이스 2개 — 탄천변 · 경산대임 2공구로 추정")])}
{card('고객사 사람', '<div class="kv3"><span>소통</span><b>허○○ · 본사</b><span>청구</span><b>허○○ · 청구서 메일 2곳</b><span>현장별</span><b class="muted">현장 상세에서</b></div>', '수정')}
{card('청구 방식', '<p class="q">본사 묶음 — 현장별 청구 내역을 모아 본사로 한 장<br><span class="muted">20일 계산서 · 익월 10일 입금 · 보증금 없음</span></p>', '바꾸기')}
{card('관계사 (플랫폼)', '<p class="q">발주처 효성전기 · 협력사 효성건기<br><span class="muted">다른 회사 — 고객 아님 (사업자번호가 다름)</span></p>')}</div></div></div>'''
FA = frame('고객 상세', '전체 고객', A, dims=[('left:206px;top:60px', '고객사 = 사업자번호 1개. 머리 + 속성 줄(영업 담당 · 청구 방식 · 올해 매출 · 현장 수 · 미납)'),
                                          ('left:206px;top:196px', '첫 탭 = 현장 목록 (현장마다 워크스페이스 · 유입 · 단계 · 서비스 · 매출)'),
                                          ('right:16px;top:196px', '오른쪽: 주요 이슈 · 고객사 사람(소통·청구) · 청구 방식 · 관계사')], h=880)

# ───────── B. 현장 = 계룡건설산업 고양장항 S-1BL 5공구 ─────────
FLOW = ['문의', '계약', '설치', '운영', '철수']
step = ''.join(f'<div class="sp2 {"done" if i < 3 else "cur" if i == 3 else ""}"><b>{s}</b>{"<em>26.04.30~ · +175일</em>" if i == 3 else ""}</div>' for i, s in enumerate(FLOW))
HIST = [('26.08.31~', '연체 시작', '6월분 5,449,400 납기 지남 → 7월분도 09.30 지남', 'due', '청구'),
        ('26.08.13', '소개 리드', '이 현장 공무팀장이 남양주 왕숙 A-6BL 8공구 소개 → 새 현장 리드', 'lead', '리드'),
        ('26.05.31', '서비스 종료', '편집비용(월 50회) · 장비설치 · NVR 모니터 과금 끝', 'na', '서비스'),
        ('26.05.08', '첫 입금', '04월분 72,259,000 (2~4월 사용분 + 설치·편집)', 'ok', '청구'),
        ('26.04.30', '과금 시작', '월간 선납 · 말일 계산서 · 익익월 말일 납기', 'info', '서비스'),
        ('날짜 없음', '장비 교체', 'AI CCTV 엣지 교체 2건 (엣지 1대 불량) — 반출 연동 뒤엔 날짜·시리얼과 함께 자동', 'warn', '장비'),
        ('26.02.23', '이동형 회수', '이동형 AI CCTV · 타임랩스 · 회선 1대씩', 'na', '장비'),
        ('26.02.06', '설치 완료', '고정형 AI CCTV 13 · 타임랩스 13 · Wearable Cam 10 · NVR 1 · 이동형 1', 'info', '장비'),
        ('25.11.12', '문의', '홈페이지 문의 · 검색 › 구글 · 담당 최한별', 'lead', '리드'),
        ('25.02.25', '착공', '공사 기간 25.02.25 – 27.12.18 · LH · 공공', 'na', '현장')]
hist = ''.join(f'<li class="{c}"><span class="d">{d}</span><b>{k}</b><span class="t">{esc(x)} <i class="src">{s}</i></span></li>' for d, k, x, c, s in HIST)
B = f'''<div class="pg2 wide"><div class="h2top"><span class="muted">‹ 계룡건설산업 · 현장 1</span><span class="sp"></span><span class="btn sm">반출 요청</span><span class="btn sm">견적서</span><span class="btn sm quiet">⋯</span></div>
<div class="h2name"><h1>고양장항 S-1BL 아파트 건설공사 5공구</h1>{chip("ok", "운영")}<span class="muted">· <span class="lk">계룡건설산업 ↗</span> · LH · 공공 · 워크스페이스 <i>미연결</i> · 공사 25.02.25 – 27.12.18 (422일 남음)</span></div>
<div class="step2">{step}<span class="side2">철수 ⋯</span></div>
<div class="props"><div><span>현장 사람 (고객)</span><b>황○○ 팀장 · 공무 ▾</b></div><div><span>청구 받는 곳</span><b>본사 묶음 · 서○○ 차장 ▾</b></div><div><span>월 청구</span><b>4,954,000</b></div><div><span>장비</span><b>38대 운영 · 회수 1</b></div><div class="cd-due"><span>미납</span><b>21,797,600 <i>연체 2건</i></b></div></div>
{tabs(['히스토리', '서비스·장비 21', '청구 6', '기록', '문서'], '히스토리')}
<div class="body2"><div>
<div class="cd-h"><b>현장 히스토리</b><span class="muted">리드 · 계약 · 장비(반출·설치·교체·회수) · 서비스 · 청구가 날짜순으로 자동</span><span class="sp"></span><span class="seg"><span class="on">전체</span><span>장비</span><span>청구</span><span>리드</span></span></div><ol class="cd-hist">{hist}</ol></div>
<div class="rcol">{issues([("due", "연체 2건 10,898,800", "6월분 52일 · 7월분 22일 지남 · 청구 서○○ 차장"),
                             ("warn", "8월분 납기 10.31", "9일 남음"),
                             ("", "소개 리드 · 남양주 왕숙 A-6BL", "미팅 단계 · 같은 고객사의 새 현장으로"),
                             ("", "공사 종료 27.12.18", "422일 남음 · 철수·연장 계획 미정")], '+ 이슈')}
{card('장비 (반출 연동)', '<div class="kv3"><span>운영</span><b>고정형 CCTV 13 · 타임랩스 13 · Wearable 10 · NVR 1</b><span>회수</span><b>이동형 1 (02.23)</b><span>교체</span><b>엣지 2</b></div><p class="q muted" style="margin-top:6px">반출·회수를 CRM 에서 처리하면 여기와 히스토리에 자동</p>', '반출 →')}
{card('플랫폼', '<p class="q">워크스페이스 <b>미연결</b> <span class="lk">연결</span><br><span class="muted">연결하면 가입일 · 사용자 수 · 프로젝트를 현장에</span></p>')}</div></div></div>'''
FB = frame('현장 상세', '현장', B, dims=[('left:206px;top:60px', '현장 = 주 작업 화면. 고객사는 머리의 링크'),
                                       ('left:206px;top:132px', '현장 단계: 문의 → 계약 → 설치 → 운영 → 철수'),
                                       ('left:206px;top:174px', '속성 줄: 현장 사람(고객) · 청구 받는 곳 · 월 청구 · 장비 · 미납'),
                                       ('left:206px;top:236px', '첫 탭 = 히스토리 (출처 태그로 거르기) / 오른쪽 주요 이슈 · 장비 · 플랫폼')], h=900)

# ───────── C. 장비 운용 → 자동 연동 ─────────
FLOWC = [('반출 요청', '현장 상세 [반출 요청] · 제품·대수·주소', '히스토리 "반출 요청"', ''),
         ('출고', '시리얼 · 송장', '히스토리 "출고 n대"', ''),
         ('설치 완료', '설치일 · 설치 사진', '서비스 줄 + 과금 시작 <b>제안</b> → 확인하면 매출 현황 줄 생성 · 장비 n대 운영', 'key'),
         ('교체', '불량 시리얼 → 새 시리얼', '히스토리 "교체" · 장비 대수 그대로', ''),
         ('회수 요청 · 완료', '회수일 · 상태', '과금 종료 <b>제안</b> → 확인하면 매출 현황 끝 달 · 공사 끝나면 단계 "철수"', 'key')]
fl = ''.join(f'<div class="fc {k}"><b>{a}</b><span>{b}</span><i>→ {c}</i></div>' for a, b, c, k in FLOWC)
C = f'''<div class="cd-flow">{fl}</div>
<table class="dg"><colgroup><col style="width:22%"><col style="width:39%"><col style="width:39%"></colgroup><thead><tr><th>데이터</th><th>지금</th><th>v3</th></tr></thead><tbody>
<tr><td><b>견적서</b></td><td>고객사·리드에 붙음 (현장 구분 없음)</td><td>현장에 붙음 — 견적 → 계약 → 설치 → 서비스 줄이 같은 현장 안에서 이어짐</td></tr>
<tr><td><b>현장</b></td><td>따로 없음 — 프로젝트 이름 앞부분("… - 타임랩스")에만 · 9,710줄 = 현장 3,431곳</td><td>현장 테이블: 고객사 · 현장명 · 워크스페이스 · 발주 · 공사 기간 · 단계 · 현장 사람 · 청구 받는 곳 · 유입 리드</td></tr>
<tr><td><b>고객사</b></td><td>이름으로 구분 (계룡 3곳 · 효성건기/효성전기 섞일 위험)</td><td>사업자번호로 구분 · 협력사·발주처는 "관계사"</td></tr>
<tr><td><b>서비스 줄</b></td><td>매출 현황 한 줄 = 현장 × 서비스, 월 금액 직접 입력</td><td>그대로 (현장에 붙음) · 설치 완료·회수 완료에서 시작·끝 제안</td></tr>
<tr><td><b>장비</b></td><td>카메라 반출·장비 화면은 있으나 0건 (CRM 밖에서 처리)</td><td>반출 = 현장에 붙여 처리 → 히스토리·장비 대수·과금 제안 자동</td></tr>
<tr><td><b>청구</b></td><td>고객사 단위 (묶음 설정만)</td><td>현장별 청구 기본 + "본사 묶음"(현장별 내역을 모아 본사로) 선택</td></tr>
<tr><td><b>사람</b></td><td>고객 LIST 에 소통 담당 · 청구 담당 (회사 단위)</td><td>고객사: 소통 · 청구 / 현장: 현장 사람(공무 등) — 없으면 고객사 값</td></tr></tbody></table>'''

CSS = '''<style>
.pg2.wide{max-width:1180px}
#m-cust-detail .ds.fixed td{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.cd-due b{color:var(--due,#b4233a)!important}.cd-due i{font-style:normal;font-size:11.5px;color:var(--due,#b4233a);font-weight:500}.due{color:var(--due,#b4233a)}.warn{color:var(--warn)}
.cd-h{display:flex;align-items:center;gap:8px;margin:0 0 6px;font-size:12px}.cd-h b{font-size:13px;font-weight:600}.cd-h .sp{flex:1}.cd-h .lk{color:var(--accent)}
.seg{display:inline-flex;border:1px solid var(--line);border-radius:6px;overflow:hidden}.seg span{padding:2px 9px;font-size:12px;color:var(--fg-2)}.seg span+span{border-left:1px solid var(--line)}.seg .on{background:var(--fg);color:var(--bg)}
.cd-iss ol{list-style:none;margin:0;padding:0;display:grid;gap:7px}.cd-iss li{padding-left:9px;border-left:3px solid var(--line);display:grid;gap:1px}.cd-iss li b{font-size:12.5px;font-weight:600}.cd-iss li span{font-size:11.5px;color:var(--fg-2)}.cd-iss li.due{border-color:var(--due,#b4233a)}.cd-iss li.due b{color:var(--due,#b4233a)}.cd-iss li.warn{border-color:var(--warn)}
.cd-hist{list-style:none;margin:0 0 4px;padding:0 0 0 14px;border-left:1px solid var(--line);font-size:12.5px}.cd-hist li{position:relative;display:grid;grid-template-columns:76px 86px 1fr;gap:8px;padding:5px 0}.cd-hist li::before{content:"";position:absolute;left:-18px;top:11px;width:7px;height:7px;border-radius:50%;background:var(--line)}.cd-hist .d{color:var(--fg-3);font-variant-numeric:tabular-nums}.cd-hist b{font-weight:600}.cd-hist .t{color:var(--fg-2);min-width:0}.cd-hist .src{font-style:normal;font-size:11px;color:var(--fg-3);border:1px solid var(--line);border-radius:3px;padding:0 4px;margin-left:4px}
.cd-hist li.due::before{background:var(--due,#b4233a)}.cd-hist li.due b{color:var(--due,#b4233a)}.cd-hist li.warn::before{background:var(--warn)}.cd-hist li.ok::before{background:var(--ok)}.cd-hist li.info::before{background:var(--info)}.cd-hist li.lead::before{background:var(--accent)}
.cd-flow{display:grid;grid-template-columns:repeat(5,1fr);gap:8px;margin:8px 0 14px}.cd-flow .fc{border:1px solid var(--line);border-radius:8px;padding:10px;display:grid;gap:4px;font-size:12.5px;position:relative}.cd-flow .fc b{font-size:13px}.cd-flow .fc span{color:var(--fg-3);font-size:12px}.cd-flow .fc i{font-style:normal;color:var(--fg-2);font-size:12px}.cd-flow .fc.key{border-color:var(--accent);background:color-mix(in srgb,var(--accent) 5%,var(--bg))}
</style>'''
SEC = f'''<section id="m-cust-detail">{CSS}<h2>고객관리 v3 — 현장 중심 (시안 2026-10-22 · 그림은 실데이터, 고객사 사람 이름 가림)</h2>
<p class="rule">10/22 사용자: "현장 베이스로 움직인다 — 같은 회사도 현장별로 유입·관리가 나뉘고, 전사 도입은 많지 않다 · 장비 운용까지 CRM 에서 처리되면 자동 연동". 플랫폼도 현장 1곳 = 회원사(워크스페이스) 1개. 그래서 <b>현장이 주 작업 화면</b>, 고객사는 현장 묶음.</p>
<div class="cmp"><div><h4>숫자로 본 지금</h4><ul><li>매출 현황 9,710줄 = 현장 3,431곳 · 고객사 547곳</li><li>고객사당 현장 1곳 333곳 · 2곳 이상 214곳 (5곳 이상 95곳)</li><li>현장당 서비스 2~3줄이 대부분 · 10줄 넘는 현장 110곳 (계룡 고양장항 21줄)</li><li>장비(카메라 반출·장비·자산) 0건 — CRM 밖에서 처리 중</li></ul></div>
<div><h4>화면</h4><ul><li><b>고객사 상세</b> = 현장 목록 + 회사 합계 · 청구 방식 · 고객사 사람 · 관계사</li><li><b>현장 상세</b> = 단계 · 히스토리 · 서비스·장비 · 청구 · 기록 · 주요 이슈</li><li>현장 1곳뿐인 고객사(333곳)는 고객사 상세에서 그 현장을 바로 펼침</li><li>메뉴: 고객관리 › <b>현장</b> (전체 현장 목록) 추가</li></ul></div></div>
<h3 class="ph3">A. 고객사 상세 — 효성중공업(주) 현장 14곳</h3><div class="fwrap">{FA}</div>
<h3 class="ph3">B. 현장 상세 — 계룡건설산업 고양장항 S-1BL 5공구</h3><div class="fwrap">{FB}</div>
<h3 class="ph3">C. 현장 하나에 모두 묶기 — 리드 · 견적서 · 장비 반출 · 서비스(매출) · 청구 · 기록</h3><p class="rule">10/22 사용자: "히스토리 · 견적서 · 매출 · 장비 반출 등 모든 현황이 (현장으로) 묶여야 모든 정보가 모아진다". 모든 기록이 현장 id 를 갖고, 현장 히스토리는 그걸 날짜순으로 보여줄 뿐 — 따로 입력하지 않는다.</p>{C}
<div class="cmp"><div><h4>정해 주실 것</h4><ul><li>현장 중심 구조 (고객사 = 사업자번호 · 현장 = 워크스페이스)</li><li>현장 단계: 문의 → 계약 → 설치 → 운영 → 철수</li><li>청구: 현장별 기본 + 본사 묶음 선택</li><li>설치 완료 · 회수 완료에서 과금 시작 · 끝을 "제안" (자동 확정 아님)</li></ul></div>
<div><h4>순서</h4><ul><li>1 현장 테이블 + 기존 9,710줄 연결 (화면 변화 없음, 애매한 이름은 목록으로 확인)</li><li>2 플랫폼 회원사 목록 연결 (처음엔 내려받기, 뒤에 연동)</li><li>3 고객사 상세 · 현장 상세 화면</li><li>4 카메라 반출 · 장비를 현장에 붙이고 히스토리 · 과금 제안</li></ul></div></div></section>'''

s = open(P, encoding='utf-8').read()
if '<section id="m-cust-detail"' in s:
    i = s.index('<section id="m-cust-detail"'); j = s.index('<section id="m-cust-wait"', i); s = s[:i] + s[j:]
i = s.index('<section id="m-cust-wait"'); s = s[:i] + SEC + s[i:]
if 'href="#m-cust-detail"' not in s:
    s = s.replace('<a href="#m-list-v2" class="i">고객 목록</a>', '<a href="#m-list-v2" class="i">고객 목록</a><a href="#m-cust-detail" class="i">고객사 · 현장 상세 (시안)</a>', 1)
s = s.replace('<a href="#m-cust-detail" class="i">고객 상세 (시안)</a>', '<a href="#m-cust-detail" class="i">고객사 · 현장 상세 (시안)</a>')
s = s.replace('<p class="rule">매출 현황 · 과금 고객 · 계약 관리 · 고객 상세</p>', '<p class="rule">매출 현황 · 과금 고객 · 계약 관리</p>')
s = s.replace('드로어 60vw(최소 720): 회사 목록 표 + 합계', '드로어 min(1180px, 94vw) (10/22): 회사 목록 표 + 합계 · 열 비율 고정 · 긴 글자는 말줄임 + 마우스를 올리면 전체 — 어느 달을 열어도 크기·위치가 같다')
open(P, 'w', encoding='utf-8').write(s)
print('m-cust-detail v3', len(SEC), 'doc', len(s))
