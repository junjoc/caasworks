# 디자인 정의 최종 재구성 (2026-10-21 저녁 사용자 요청: "목록과 페이지가 맞게 · CRM 메뉴 순서 · 전역은 맨 위 · 지난 것은 삭제")
# assemble.py → reorganize.py 결과에서 섹션을 뽑아 새 순서로 다시 엮는다. 파이프라인 마지막 단계.
import re
P = '/Users/david/Desktop/클로드/004_CRM 웹개발/caasworks/docs/design/카스웍스_CRM_디자인정의.html'
s = open(P, encoding='utf-8').read()

def sections(html):
    out, i = {}, 0
    for m in re.finditer(r'<section id="([^"]+)"', html):
        start, depth, j = m.start(), 0, m.start()
        for t in re.finditer(r'<section\b|</section>', html[start:]):
            depth += 1 if t.group(0) == '<section' else -1
            if depth == 0:
                out.setdefault(m.group(1), html[start:start + t.end()]); break
    return out
S = sections(s)
head = s[:s.index('<body>')]
# 10/21 "페이지가 너무 길다 — 색상표·아이콘은 작게": 견본은 한 줄 칩으로, 화면 그림은 62% 로
COMPACT = '''<style id="compact">
#base .grid{grid-template-columns:repeat(auto-fill,minmax(200px,1fr))!important;gap:6px!important}
.sw{display:flex!important;align-items:center;gap:8px;padding:5px 8px;border-radius:6px}
#base .sw i,.sw>i{display:block!important;width:18px!important;height:18px!important;min-height:0!important;flex:none;border-radius:4px;border:1px solid var(--line)}
.sw b{font-size:12px}.sw .bspec,.sw .spec2{display:block;font-size:11px;margin:0}
.ic{width:auto!important;flex-direction:row!important;gap:4px!important;font-size:12px!important}.ic svg{width:14px;height:14px}
#base .demo{padding:10px!important}#base .demo.row{gap:10px!important}
.wfbox{height:150px!important}.wf p{font-size:11px!important}
.frame{zoom:.62!important}.tog{margin:2px 0!important;font-size:11px}
section{margin-bottom:28px!important}section h2{margin-bottom:6px}
.part{margin:36px 0 12px!important;padding-top:14px!important}
</style>'''
head = head.replace('</head>', COMPACT + '</head>')
script = s[s.rindex('</main>') + len('</main>'):]
dec = re.search(r'<div class="dec" id="decisions">.*?</ol></div>', s, re.S).group(0)

# 남은 섹션 안의 지난 문구 손보기
S['pagehead'] = S['pagehead'].replace('보조 11.5', '보조 12')
S['b-c'] = S['b-c']

# 10/21 마케팅팀: "미납 진한 빨강을 더했으니 12색이 아니라 13색" — 옛 섹션(v1)에 남은 값을 v2 로 정리
V2 = {
  'b-c': [('<h2>색 — 12가지뿐</h2>', '<h2>색 — 13가지</h2>'),
          ('중립 6 + 강조 1 + 상태 5.', '중립 6 + 강조 1 + 상태 6 (10/21 미납·연체 <b>due</b> 추가 — 마케팅팀 지적으로 12 → 13).'),
          ('<b>bad</b><span class="bspec">#E2445C · 이탈, 미납, 오류, 삭제</span></div></div>',
           '<b>bad</b><span class="bspec">#E2445C · 신규리드, 오류, 삭제</span></div></div>\n  <div class="sw"><i style="background:#b4233a"></i><div><b>due</b><span class="bspec">#B4233A · 미납·연체 (흰 글자 6.5:1)</span></div></div>')],
  'common': [('<b>12색</b>(바탕 2 · 선 2 · 글자 3 · 강조 1 · 상태 4)', '<b>13색</b>(바탕 2 · 선 2 · 글자 3 · 강조 1 · 상태 5 — 10/21 미납 due 추가)')],
  'kpirow': [('보조 11.5', '보조 12')],
  'b-c#na': [],
  'b-t': [('<h2>글자 — 한 벌, 5단계</h2>', '<h2>글자 — 한 벌, 6단계 (v2)</h2>'),
          ('<span class="bspec">18 / 600 · 페이지 제목</span><span class="t18">파이프라인</span>', '<span class="bspec">20 / 600 · 상세 이름 (화면 제목은 헤더 14 / 600)</span><span class="t18">원하건설 주식회사</span>')],
  'b-x': [('색 12개, 글자 5단계, 간격 6단계', '색 13개, 글자 6단계(최소 12), 간격 6단계')],
  'inflow': [('왼쪽 색 줄 = 분류 색(디자인 정의 12색을 성격별로): <b>돈 쓰는 곳</b> 광고 accent·외주 블로그 warn / <b>우리 것</b> 자사 채널·자사 블로그 ok / <b>찾아온 것</b> 검색·생성형 AI info / <b>남이 퍼뜨린 것</b> 소셜 bad·언론 fg-2·외부 글 fg-3·커뮤니티 na / <b>사람</b> 직접 연락 fg / 미분류 line.',
              '분류 점·줄은 <b>회색 하나</b>(10/21 유실장 검토 — 상태색을 빌려 쓰면 소셜이 빨강 = "나쁜 채널"로 읽힘), 묶음은 글자로 구분.')],
}
V2['b-c'].append(('<b>na</b><span class="bspec">#C4C4C4 · 신규, 미입력, 기타', '<b>na</b><span class="bspec">#C4C4C4 · 이탈, 미입력, 기타'))
V2.pop('b-c#na')
for sid, pairs in V2.items():
    for a, b in pairs:
        if sid in S and a in S[sid]: S[sid] = S[sid].replace(a, b)
        else: print('v2 정리 못 찾음:', sid, a[:30])

def stub(id, title, screens, note):
    return f'<section id="{id}"><h2>{title}</h2><p class="rule">{screens}</p><p class="rule" style="color:var(--fg-3)">{note}</p></section>'
WAIT = '지금은 1차 일괄(옛 버튼·배지·카드·표·입력칸을 기준값으로)만 — 배치 교체 시안은 차례가 오면 여기에. 순서는 화면별 적용 현황 · 다음 작업.'
S['m-fin'] = stub('m-fin', '재무관리', '청구/계산서 · 미납 현황 · 납부 관리 · 매입/비용 · 손익 분석', WAIT + ' 미납은 진한 빨강 #B4233A.')
S['m-ops'] = stub('m-ops', '운영관리', '현장 관리 · 카메라 반출 · 자산 · 재고 · 장비 · 협력사 발주 · 영상 기록', WAIT)
S['m-etc'] = stub('m-etc', 'VoC/CS · 업무 · 피드백 · 설정', 'VoC 티켓 · 오늘 할일 · 업무보고 · 피드백 · 설정(사용자·역할·상품·슬랙 등)', WAIT)
S['m-cust-wait'] = stub('m-cust-wait', '고객관리 — 나머지', '매출 현황 · 과금 고객 · 계약 관리 · 고객 상세', '고객 목록과 같은 틀(목록 v2 · 드로어)로 이어서. ' + WAIT)
S['m-sales-wait'] = stub('m-sales-wait', '세일즈 — 견적 3메뉴', '견적서 · 견적 모의계산 · 단가표', '견적서 → 매출 연동 때 개편 (10/21 결정).')
S['agg'] = S['agg'].replace('<h2>집계 (유입 코호트 · 채널별 생애 가치 · 전환 소요 · 파이프라인 분석 · 연간 비교 …)</h2>', '<h2>분석 — 유입 코호트 · 전환 소요 · 채널별 생애 가치 (집계, 10/21 적용)</h2>')

# 새 순서: (구분, 제목, [(id, 목록 이름)])
ORDER = [
  ('개요', None, [('decisions', '지금 정해진 것'), ('status', '화면별 적용 현황')]),
  ('1. 전역', '모든 화면 공통', None),
  (None, '화면 문법', [('unify', '★ 화면 문법 v2'), ('pagehead', '화면 머리 규칙')]),
  (None, '색', [('b-c', '색 13가지'), ('common', '단계 색 · 상태 칩'), ('chip-alt', '칩 대비 대안 (보관)')]),
  (None, '글자 · 간격 · 아이콘', [('b-t', '글자'), ('b-s', '간격 · 모서리'), ('b-i', '아이콘')]),
  (None, '부품', [('b-b', '버튼'), ('b-f', '입력'), ('b-st', '상태 · 태그 · 사람'), ('b-tb', '표'), ('kpirow', '숫자줄'), ('b-fb', '피드백')]),
  (None, '데이터 기준', [('inflow', '유입 분류 11 + 미분류'), ('ga-setup', 'GA · UTM 설정 (마케팅팀)')]),
  (None, '하지 않는 것', [('b-x', '걷어낼 것')]),
  ('2. 메뉴별 화면', 'CRM 메뉴 순서', None),
  (None, '대시보드', [('m-dashboard', '대시보드')]),
  (None, '마케팅', [('m-campaign', '캠페인 관리'), ('m-inflow', '유입 성과'), ('m-content', '콘텐츠 성과')]),
  (None, '세일즈', [('m-sales', '보드뷰 · 리스트'), ('m-lead2', '리드 상세 · 드로어'), ('m-newlead', '새 리드 등록 (시안)'), ('m-sales-wait', '견적 3메뉴 (대기)')]),
  (None, '고객관리', [('m-list-v2', '고객 목록'), ('m-cust-wait', '나머지 (대기)')]),
  (None, '재무관리', [('m-fin', '재무관리 (대기)')]),
  (None, '운영관리', [('m-ops', '운영관리 (대기)')]),
  (None, '분석', [('agg', '코호트 · 전환 · 생애가치')]),
  (None, 'VoC · 업무 · 설정', [('m-etc', 'VoC · 업무 · 피드백 · 설정 (대기)')]),
  ('3. 기록', '정한 이유와 다음 일', None),
  (None, '기록', [('log-table', '결정 기록'), ('log-vline', '세로선 세 안 비교'), ('next', '다음 작업')]),
]
nav = ['<nav class="toc"><div class="h">카스웍스 CRM 디자인 정의</div>']
main = ['<main class="doc"><h1 class="t">카스웍스 CRM 디자인 정의</h1><p class="lead">CRM 화면 디자인의 <b>지금 정해진 것</b>만 둔다. 맨 위 <b>전역</b>(모든 화면 공통) → <b>메뉴별 화면</b>(CRM 메뉴 순서) → <b>기록</b>. 지난 안은 지우고, 왜 골랐는지는 결정 기록에만 남긴다. 숫자는 2026-10-21 CRM 실제 데이터.</p>']
for part, title, items in ORDER:
    if part and items is None:
        pid = 'p-' + str(abs(hash(part)) % 10000)
        nav.append(f'<div class="g">{part}</div>')
        main.append(f'<div class="part" id="{pid}"><h2>{part}</h2><p>{title}</p></div>')
        continue
    if part:  # 개요
        nav.append(f'<div class="g">{part}</div>')
    else:
        nav.append(f'<div class="g2">{title}</div>')
    for id, label in items:
        nav.append(f'<a href="#{id}" class="i">{label}</a>')
        # 기초·부품(b-*)의 스타일은 #base 안에서만 걸린다 (디자인정의_v1 에서 가져온 것)
        main.append(dec if id == 'decisions' else f'<div id="base">{S[id]}</div>' if id.startswith('b-') else S[id])
nav.append('</nav>')
missing = [i for _, _, it in ORDER if it for i, _ in it if i != 'decisions' and i not in S]
assert not missing, missing
out = head + '<body><div class="shell">' + ''.join(nav) + ''.join(main) + '</main></div>' + script
open(P, 'w', encoding='utf-8').write(out)
print('rebuilt', len(out), 'sections', sum(len(it) for _, _, it in ORDER if it))
