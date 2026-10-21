# 카스웍스 CRM 디자인 정의 — 성격별로 다시 묶기 (assemble.py 다음 단계)
import re
P = '/Users/david/Desktop/클로드/004_CRM 웹개발/caasworks/docs/design/카스웍스_CRM_디자인정의.html'
t = open(P, encoding='utf-8').read()
head, rest = t.split('<body>', 1)
main = rest[rest.index('<main class="doc">') + len('<main class="doc">'):rest.rindex('</main>')]
script = rest[rest.rindex('</main>'):]
S = {m.group(1): m.group(0) for m in re.finditer(r'<section id="([^"]+)">.*?</section>', main, re.S)}
def title(id, new):  # 섹션 제목 바꾸기
    S[id] = re.sub(r'<h2>.*?</h2>', f'<h2>{new}</h2>', S[id], 1, flags=re.S)
title('common', '색·상태 칩 보강 (10/21)')
title('m-campaign', '캠페인 관리 — 표형 vs 카드형 (표형 선택)')
title('inflow', '유입 분류 11 + 미분류')
title('pagehead', '화면 머리 규칙')
for k, v in {'list': '목록', 'agg': '집계', 'detail': '상세', 'form': '입력', 'dash': '대시보드', 'board': '보드'}.items():
    S[k] = re.sub(r'<h2>([^<(]*)', lambda m: f'<h2>{v} ', S[k], 1)

S['kpirow'] = '''<section id="kpirow"><h2>숫자줄 (KpiRow)</h2><p class="rule">툴바 아래 한 줄. 칸마다 <b>라벨 12 / 값 18 / 보조 11.5</b>, 칸 수 = 항목 수(최대 5), 칸 사이 연한 세로선, 위아래 1px 선. <b>보여줄 숫자가 없으면 줄 자체를 그리지 않는다.</b> 소진율처럼 비율은 값 아래 얇은 막대(4px). 요약을 "A · B · C" 글 한 줄로 쓰지 않는다. 코드: src/components/ds KpiRow.</p>
<div class="kpis" style="max-width:900px"><div><span>전체 캠페인</span><b>21개</b><em>준비 0 · 중단 13 · 종료 2</em></div><div><span>진행중</span><b>6개</b></div><div><span>진행중 월 예산</span><b>₩7,100,000</b></div><div><span>이번 달 집행</span><b>₩2,634,854</b><em>월 예산의 37.1%</em></div><div><span>누적 집행</span><b>₩32,787,733</b></div></div></section>'''
S['m-inflow'] = '''<section id="m-inflow"><h2>유입 성과 — 광고와 유입 전체 점검</h2><p class="rule">메뉴 이름 "유입 성과"(전 광고 성과). <b>툴바</b>: 탭 전체·유료·무료 │ 전체 펴기 · 기간 · 동기화 · <b>데이터 입력</b>. <b>숫자줄</b>: 집행비 | 유입 | 클릭 | 문의 | 도입. <b>표</b>: 맨 위 광고·유입 합계(고정) → 유입 분류 12칸(광고 → 소셜 → 검색 → 자사 채널 → 직접 연락 → 자사 블로그 → 외주 블로그 → 생성형 AI → 외부 글 → 언론·뉴스 → 커뮤니티 → 미분류). 열 때 모두 접힘, 빈 분류도 표시, 분류마다 왼쪽 색 줄(데이터 기준 › 유입 분류 색). 광고는 캠페인 › 광고그룹, 나머지는 세부, 행을 누르면 60vw 드로어에 일별 기록. 결정 기록 참고.</p></section>'''

S['next'] = '''<section id="next"><h2>다음 작업</h2><ol class="rule" style="max-width:none">
<li>✔ <b>유실장 검토 반영 (10/21)</b> — 미납 진한 빨강 · 유입 분류 점 회색 · 드로어 480/60vw · Pretendard 이름 수정(그동안 기본 글꼴로 보였음) · 12px 최소(84곳) · 기준 한 줄 · 1,280 폭 7화면 가로 스크롤 없음 확인 · 화면 유형 "추이" 추가 → 분석 화면 배치 교체는 2차에서</li>
<li><b>화면 문법 v2 2차 — 배치 교체</b>: ① 목록 14화면(✔ 고객 목록 10/21, 다음 과금 고객 · 계약 관리 · VoC …) ② 상세(고객사 · 계약 · 현장 · 견적서) ③ 집계·추이 ④ 대시보드 옛 위젯·설정</li>
<li><b>헤더 이름 = 메뉴 이름</b> (예: 사이드바 "전체 고객" ↔ 헤더 "고객 목록")</li>
<li><b>서버 깨우기</b> — GitHub 웹에서 .github/workflows/warm.yml 추가 (scripts/github/warm.yml)</li>
<li><b>유입 분류 다음 단계</b> — 리드 입력을 "유입 경로 + 문의 수단" 두 칸으로, 설정 › 유입 분류(미분류 지정), 코호트 채널 표도 11 분류로</li>
<li><b>견적서 → 매출 연동</b> 뒤 견적 3메뉴 개편, 리드 상세 견적·매출 탭 채우기</li></ol></section>'''
S['m-content'] = '''<section id="m-content"><h2>콘텐츠 성과 — 블로그 글 성과</h2><p class="rule"><b>툴바</b>: 탭 카스웍스·네이버 │ (카스웍스) 조회 없는 글도 · 기간 · ⓘ 기준 · GA4 동기화 · <b>콘텐츠 추가</b> / (네이버) ⓘ 기준 · <b>엑셀 업로드</b>. <b>숫자줄</b>: 카스웍스 = 조회된 글 · 조회수 · 세션 · 사용자, 네이버 = 조회수(상위 글 합) · 순방문자수 · 평균 사용시간 · 모바일 비율(최근 달). <b>표</b>: 공용 표, 합계 맨 위. 네이버는 월별 추이(차트 3 : 표 2) → 글별 월 조회수(URL 입력) → 유입 검색어(검색어 2 : 유입경로 1). 파란 안내 상자는 ⓘ 기준으로, 색 카드는 숫자줄로 바꿈 (10/21).</p></section>'''
S['m-dashboard'] = open('dash_sec.html', encoding='utf-8').read()
exec(open('ga_sec.py', encoding='utf-8').read())
S['m-sales'] = open('sales_sec.html', encoding='utf-8').read()
S['m-lead'] = open('lead_detail_sec.html', encoding='utf-8').read()
S['m-lead2'] = open('lead_detail_v2_sec.html', encoding='utf-8').read()
S['unify'] = open('unify_sec.html', encoding='utf-8').read()
S['status'] = open('status_sec.html', encoding='utf-8').read()
S['chip-alt'] = open('chipalt_sec.html', encoding='utf-8').read()
S['m-list-v2'] = open('list_sec.html', encoding='utf-8').read()
DEC = '''<div class="dec" id="decisions"><h3>지금 정해진 것 — 한눈에 (2026-10-21 저녁 기준)</h3><ol>
<li><b>틀</b>: 사이드바 200 · 헤더 48(<b>화면 제목은 여기만</b>) · 본문 좌우 20 위 16 아래 64(피드백 버튼 자리) · 흰 바탕 · 그림자는 떠 있는 것(드로어·메뉴·선택 바)만</li>
<li><b>화면 문법 v2</b>: 화면 유형(목록 · 집계 · 추이 · 상세 · 드로어 · 보드 · 대시보드) × 부품 10 × 기준값 7(글자 12 이상 · 간격 · 모서리 · 선 · 색 · 경과 · 기준 한 줄). 모든 화면을 이것만으로 — <a href="#unify">★ 화면 문법 v2</a></li>
<li><b>화면 머리</b>: 툴바 40(왼쪽 탭·필터 / 오른쪽 보기 전환 → 기간 → 보조 → ⓘ → 주 동작) → 숫자줄 64(목록·집계·대시보드만, 최대 5칸) → 표. 상세는 이름줄 → 단계 줄 → 속성 줄</li>
<li><b>색</b>: 12색만. 단계 = 신규 빨강 · 진행 파랑 · 예정 주황 · 도입완료 초록 · 이탈 회색(채운 칩, 최소 64). <b>미납·연체 = 진한 빨강 #B4233A</b>. 유입 분류는 회색 점(상태색 쓰지 않음). 대비를 높인 B·C안은 <a href="#chip-alt">색상표</a>로 보관</li>
<li><b>표</b>: 머리 가운데 · 숫자 오른쪽 · 날짜·상태 가운데 · 글 왼쪽 · 모든 열 연한 세로선 · <b>합계 줄 맨 위 고정</b> · 집계 표는 열 비율 고정 · 행 클릭 = 480 드로어 · 선택하면 화면 아래 선택 바</li>
<li><b>상세 · 드로어</b>: 상세 = 단계 줄 + 속성 줄 5칸(누르면 그 자리에서) + 2:1(기록·날짜별 타임라인 / 카드, 값 있는 칸만). 드로어 = 상세 축소판(얇은 단계 줄 + 속성 칩). 폭은 <b>480 · 60vw 두 가지</b></li>
<li><b>기록</b>: 드로어·상세가 같은 기록 칸(유형 · 내용 · 다음 액션 · 언제). 다음 액션·단계·담당·칸 수정도 타임라인에. 나중에 올린 회의록은 실제 날에, 기록한 날은 꼬리표로</li>
<li><b>경과 표기</b>: +n일(당일 오늘) · n일 남음 · 내일 · n일 지남 · n일 전. D+n · n일째 쓰지 않음</li>
<li><b>단계 순서</b>: 신규리드 → 컨텍 → 예정 → 제안 → 미팅 → 도입직전 → 도입완료 (+ 이탈). 기록으로 단계 자동 이동은 앞으로만, 예정·도입완료는 사람이</li>
<li><b>속도</b>: 화면 한 번에 요청 1개(서버 API) · 본 화면은 메모리에서 바로 · 행에 마우스 올리면 미리 읽기 · 열어 둔 동안 4분마다 서버 깨우기</li>
<li><b>데이터 기준</b>: 유입 분류 11 + 미분류 (리드·GA 공통)</li>
<li><b>일하는 방식</b>: 요청은 안 제시 → 합의 → 반영, 반영 뒤 이 문서와 결정 기록 갱신</li></ol></div>'''

def part(id, t, sub): return f'<div class="part" id="{id}"><h2>{t}</h2><p>{sub}</p></div>'
def subh(id, t, s=''): return f'<div class="sub" id="{id}">{t}{f" <span>{s}</span>" if s else ""}</div>'
ORDER = [
  ('p-sum', None), ('decisions', None), 'status',
  ('p-found', part('p-found', '1. 기초', '색 · 글자 · 간격 · 아이콘')), 'b-c', 'chip-alt', 'common', 'b-t', 'b-s', 'b-i',
  ('p-comp', part('p-comp', '2. 부품', '버튼 · 입력 · 상태 칩 · 표 · 숫자줄 · 피드백')), 'b-b', 'b-f', 'b-st', 'b-tb', 'kpirow', 'b-fb',
  ('p-layout', part('p-layout', '3. 화면 구성', '화면 머리 · 뼈대 · 화면 유형 6 — 10/21 부터 기준은 ★ 화면 문법 v2, 이 장의 예전 시안(PageHeader 부제 등)은 참고용')), 'pagehead', 'b-l',
  ('s-types', subh('s-types', '화면 유형 6', '실제 데이터 시안 · 치수 라벨은 체크박스로')), 'list', 'agg', 'detail', 'form', 'dash', 'board',
  'unify',
  ('p-menu', part('p-menu', '4. 메뉴별 화면', '카테고리별 확정 시안과 적용 내용')), ('m-dash-h', subh('m-dash-h', '대시보드', '적용 10/21')), 'm-dashboard', ('m-marketing', subh('m-marketing', '마케팅')), 'm-campaign', 'm-inflow', 'm-content', ('m-sales-h', subh('m-sales-h', '세일즈', '적용 10/21 · 상세 v2')), 'm-sales', 'm-lead2', 'm-lead', ('m-cust-h', subh('m-cust-h', '고객관리', '고객 목록 적용 10/21')), 'm-list-v2',
  ('p-data', part('p-data', '5. 데이터 기준', '화면이 따르는 분류·정의')), 'inflow', 'ga-setup',
  ('p-dont', part('p-dont', '6. 하지 않는 것', '지금 화면에서 걷어낼 것')), 'b-x',
  ('p-log', part('p-log', '7. 결정 기록', '무엇을 두고 무엇을 골랐는지, 왜. 기각된 안도 남김')), 'log-table', 'log-vline',
  'next',
]
h1 = '<h1 class="t">카스웍스 CRM 디자인 정의</h1><p class="lead">CRM 화면의 디자인 결정을 한 곳에 둔다. <b>1 기초 → 2 부품 → 3 화면 구성 → 4 메뉴별 화면</b> 순으로 작은 것에서 큰 것으로, 그 뒤에 <b>5 데이터 기준 · 6 하지 않는 것 · 7 결정 기록</b>. 새로 정한 것은 결정 기록에 먼저 남기고 해당 칸을 고친다. 치수와 숫자는 오늘(2026-10-21) CRM 실제 데이터.</p>'
out = [h1]
for o in ORDER:
    if isinstance(o, tuple):
        if o[0] == 'decisions': out.append(DEC)
        elif o[1]: out.append(o[1])
    else:
        out.append(S[o])
newmain = '\n'.join(out)

def a(h, t, cls='i'): return f'<a href="#{h}" class="{cls}">{t}</a>'
def nm(id): return re.sub(r'\s*—.*$', '', re.search(r'<h2>([^<]*)', S[id]).group(1)).strip()
nav = ['<nav class="toc"><div class="h">카스웍스 CRM 디자인 정의</div>', a('decisions', '지금 정해진 것', ''), a('unify', '★ 화면 문법 v2', ''), a('status', '화면별 적용 현황', ''),
  '<div class="g">1. 기초</div>', a('b-c', '색'), a('chip-alt', '칩 대비 대안 (보관)'), a('common', '색·상태 칩 보강'), a('b-t', '글자'), a('b-s', '간격·모서리'), a('b-i', '아이콘'),
  '<div class="g">2. 부품</div>', a('b-b', '버튼'), a('b-f', '입력'), a('b-st', '상태·태그·사람'), a('b-tb', '표'), a('kpirow', '숫자줄'), a('b-fb', '피드백'),
  '<div class="g">3. 화면 구성</div>', a('pagehead', '화면 머리 규칙'), a('b-l', '화면 뼈대·드로어'), '<div class="g2">화면 유형 6</div>',
  a('list', '목록'), a('agg', '집계'), a('detail', '상세'), a('form', '입력'), a('dash', '대시보드'), a('board', '보드'),
  '<div class="g">4. 메뉴별 화면</div>', a('m-dashboard', '대시보드', 'i'), '<div class="g2">마케팅</div>', a('m-campaign', '캠페인 관리'), a('m-inflow', '유입 성과'), a('m-content', '콘텐츠 성과'),
  '<div class="g2">분석</div>', a('agg', '생애주기 3화면 → 집계', 'i ref'),
  '<div class="g2">세일즈</div>', a('m-sales', '리스트 · 보드뷰'), a('m-lead2', '리드 상세 · 드로어 v2'), a('m-lead', '리드 상세 v1 (지난 안)'), '<div class="g2">고객 · 재무 · 운영</div>', a('m-list-v2', '고객 목록 — 목록 유형 v2'), '<span class="i todo">메뉴별 정리 때 추가</span>',
  '<div class="g">5. 데이터 기준</div>', a('inflow', '유입 분류 11 + 미분류'), a('ga-setup', 'GA·UTM 설정 (마케팅팀)'),
  '<div class="g">6. 하지 않는 것</div>', a('b-x', '걷어낼 것'),
  '<div class="g">7. 결정 기록</div>', a('log-table', '결정 목록'), a('log-vline', '세로선 세 안 비교'),
  '<div class="g">기록</div>', a('next', '다음 작업'), '</nav>']
shell_start = rest[:rest.index('<main class="doc">')]
shell_start = re.sub(r'<nav class="toc">.*?</nav>', ''.join(nav), shell_start, 1, flags=re.S)
open(P, 'w', encoding='utf-8').write(head + '<body>' + shell_start + '<main class="doc">' + newmain + script)
print('reorganized', len(S), 'sections')
