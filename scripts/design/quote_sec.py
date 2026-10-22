# 세일즈 › 견적서 — CRM 에서 만들고 보내기 시안 (2026-10-22)
# 사용자: "가능하면 CRM 에서 견적서를 만들고 보내고 싶다 · 제목 규칙([아이콘:견적서] 회사 현장 견적서)이 생기면 회신도 알아서 거를 수 있다 ·
#         기록이 자동으로 남아 담당자가 할 일이 줄고 업무보고까지 쉬워진다"
# 그림: 셀트리온 견적서(10/23, 플랫폼 100,000 + 안전관리 솔루션 300,000 = 월 400,000 — 견적서 폴더 실제 파일) · 보내기 · 기록 · 업무보고
# 고객 쪽 사람 이름·메일은 가림. 기록·업무보고의 10/24 이후 줄은 흐름 예시
import html, re
P = '/Users/david/Desktop/클로드/004_CRM 웹개발/caasworks/docs/design/카스웍스_CRM_디자인정의.html'
esc = lambda x: html.escape(str(x))
won = lambda v: f'{int(v):,}' if v else '—'
def av(n): return f'<span class="av" title="{esc(n)}">{esc(n[:1])}</span>'
def chip(t, s): return f'<span class="st {t}">{esc(s)}</span>'
MENU = [('대시보드', None), ('마케팅', 1), ('세일즈', ['보드뷰', '리스트', '견적서', '견적 모의계산', '단가표']), ('고객관리', 1), ('재무관리', 1), ('운영관리', 1), ('분석', 1), ('VoC/CS', 1), ('업무', 1), ('피드백', 1), ('설정', 1)]
def sidebar(act, menu=MENU):
    o = ['<aside class="sb"><div class="logo"><i></i><b>CaasWorks</b><span>CRM</span></div><nav>']
    for g, kids in menu:
        if isinstance(kids, list): o.append(f'<div class="g open">{g}<em>▾</em></div>' + ''.join(f'<a class="{"act" if k == act else ""}">{k}</a>' for k in kids))
        else: o.append(f'<div class="g ">{g}{"<em>▸</em>" if kids else ""}</div>')
    return ''.join(o) + '</nav><div class="me">' + av('김규재') + '<div><b>김규재</b><span>세일즈</span></div></div></aside>'
def frame(title, act, body, dims=(), h=760, menu=MENU):
    d = ''.join(f'<span class="dim" style="{st}">{esc(t)}</span>' for st, t in dims)
    return (f'<p class="tog"><label><input type="checkbox" onchange="this.closest(\'.fwrap\').querySelector(\'.frame\').classList.toggle(\'showdim\', this.checked)"> 치수 라벨 보기</label></p>'
            f'<div class="frame" style="height:{h}px">{sidebar(act, menu)}<div class="main"><header class="hd"><b>{title}</b><div class="r"><span class="srch">회사·프로젝트·메뉴 검색 <kbd>⌘K</kbd></span><span class="fs">A−  14  A+</span>{av("김규재")}</div></header>'
            f'<div class="ct">{body}</div></div>{d}</div>')

# ───────── 1. 견적서 작성 ─────────
ITEMS = [('통합 관리 플랫폼', '카스웍스 플랫폼', '통합관제플랫폼(PC/모바일 APP) · 사용인원 제한없음', 100_000, 1, '식', 1, '구독'),
         ('', '안전관리 솔루션', '근로자 안전교육 · 방문자 교육 · TBM · 위험성 평가 · QR 출입관리 · 모바일 서명', 300_000, 1, '식', 1, '구독')]
rows = ''.join(f'<tr><td class="c">{i + 1 if g else ""}</td><td>{g}</td><td><b>{n}</b></td><td class="muted">{esc(d)}</td><td class="num">{won(u)}</td><td class="c">{q}</td><td class="c">{un}</td><td class="c">{m}</td><td class="c">{chip("info", s)}</td><td class="num">{won(u * q * m)}</td></tr>' for i, (g, n, d, u, q, un, m, s) in enumerate(ITEMS))
A = f'''<div class="pg2 wide"><div class="h2top"><span class="muted">‹ 견적서</span><span class="sp"></span><span class="btn sm">PDF 미리보기</span><span class="btn sm">저장 (v1)</span><span class="btn sm primary">메일로 보내기</span></div>
<div class="h2name"><h1>카스웍스 서비스 견적서 (안전관리 솔루션)</h1>{chip("na", "작성 중 · v1")}<span class="muted">· Q-2610-0412 · 프로젝트 <span class="lk">셀트리온 (현장 확인 중) ↗</span></span></div>
<div class="props"><div><span>수신처</span><b>주식회사 셀트리온 ▾</b></div><div><span>고객 담당자</span><b>황○○ 대리 ▾</b></div><div><span>견적일 · 유효</span><b>26.10.23 · 1개월</b></div><div><span>견적 담당</span><b>{av("김규재")} 김규재 대리</b></div><div><span>합계 (부가세 별도)</span><b>400,000 / 월</b></div></div>
<div class="body2"><div>
<div class="cd-h"><b>항목</b><span class="muted">지금 견적서 양식과 같은 칸 · 품목은 단가표에서 · 기간 × 수량 × 단가 = 공급가</span><span class="sp"></span><span class="btn sm">+ 단가표에서</span><span class="btn sm quiet">+ 직접 입력</span></div>
<table class="ds fixed"><colgroup><col style="width:5%"><col style="width:12%"><col style="width:14%"><col style="width:31%"><col style="width:9%"><col style="width:5%"><col style="width:5%"><col style="width:6%"><col style="width:6%"><col style="width:7%"></colgroup>
<thead><tr><th>No.</th><th>구분</th><th>품명</th><th>상세</th><th>단가</th><th>수량</th><th>단위</th><th>기간(월)</th><th>공급</th><th>공급가</th></tr></thead>
<tbody>{rows}<tr class="sum"><td colspan="9" class="r">합계 (부가세 별도) · 매달 400,000</td><td class="num"><b>400,000</b></td></tr></tbody></table>
<div class="cd-note" style="margin-top:10px">견적 안내 · 계좌 안내는 양식 고정문 · 저장하면 견적서 폴더에 "[셀트리온] 견적서" 시트 탭 + PDF (지금 양식 그대로)</div></div>
<div class="rcol"><div class="card2x"><div class="ch"><b>단가표</b><span class="muted">검색</span></div><div class="kv3"><span>플랫폼</span><b>100,000 / 월</b><span>안전관리</span><b>300,000 / 월</b><span>AI CCTV</span><b>고정형 40,000~ / 대·월</b><span>타임랩스</span><b>120,000~ / 대·월</b><span>통신</span><b>55,000~65,000 / 대·월</b></div></div>
<div class="card2x"><div class="ch"><b>이 프로젝트 견적</b></div><p class="q muted">처음 견적 · 리드 10.21 홈페이지 문의 (유입 자사 채널 › 홈페이지)</p></div></div></div></div>'''
FA = frame('견적서 작성', '견적서', A, dims=[('left:206px;top:60px', '머리: 견적명 · 상태(작성 중/보냄/회신/확정) · 견적 번호 Q-연월-순번 · 프로젝트'),
                                         ('left:206px;top:174px', '속성 줄: 수신처 · 고객 담당자 · 견적일·유효 · 견적 담당 · 합계'),
                                         ('left:206px;top:236px', '항목 = 지금 시트 양식 칸 그대로 / 오른쪽 단가표에서 고르기')], h=680)

# ───────── 2. 메일로 보내기 ─────────
B = f'''<div class="pg2 wide" style="opacity:.35;pointer-events:none">{A.split('<div class="body2">')[0]}</div>
<div class="drawer w600"><div class="dh"><div><b>메일로 보내기</b><div class="meta">견적서 Q-2610-0412 v1 · 400,000 / 월</div></div><span class="x">✕</span></div>
<div class="db cd-form"><label>보내는 사람</label><div class="inp">김규재 대리 &lt;본인 지메일&gt; <span class="muted">· 처음 한 번 구글 연결</span></div>
<label>받는 사람</label><div class="inp">황○○ 대리 &lt;····@celltrion.com&gt; <span class="muted">· 프로젝트 고객 담당자</span></div>
<label>참조</label><div class="inp">비즈니스팀 <span class="muted">(기본 · CRM 메일함도 여기로 받음)</span></div>
<label>제목 (규칙 · 고칠 수 있음)</label><div class="inp mono"><b>[아이콘:견적서 Q-2610-0412]</b> 셀트리온 안전관리 솔루션 견적서</div>
<label>본문 (문구 틀)</label><div class="inp ta">안녕하세요, (주)아이콘 김규재입니다. 요청하신 카스웍스 서비스 견적서를 첨부드립니다. 검토 후 회신 부탁드립니다. …</div>
<label>첨부 (자동)</label><div class="pls2"><span class="pl on">[셀트리온] 견적서_v1.pdf</span><span class="pl">+ 카탈로그 (고정형 PTZ)</span><span class="pl">+ 서비스 소개서</span></div>
<p class="muted s2">보내면: 프로젝트 히스토리에 "견적서 v1 발송 · 받는 사람 · 첨부" · 견적 상태 "보냄" · "회신 대기" 이슈 시작. 회신은 제목의 [아이콘:견적서 번호] → 없으면 메일 스레드로 같은 견적에 붙음</p></div>
<div class="df"><span class="btn sm quiet">취소</span><span class="sp"></span><span class="btn sm">나에게 테스트</span><span class="btn sm primary">보내기</span></div></div>'''
FB = frame('견적서 작성', '견적서', B, dims=[('right:16px;top:60px', '보내기 드로어 600: 받는 사람·참조·제목 규칙·본문 틀·첨부 자동')], h=680)

# ───────── 3. 자동 기록 — 프로젝트 히스토리 · 견적 ─────────
LOG = [('10.21 22:57', '리드', '홈페이지 문의 · 안전관리', 'lead', '리드 (자동)'),
       ('10.23 14:12', '견적서 v1 발송', 'Q-2610-0412 · 400,000/월 · 황○○ 대리 · 첨부 [셀트리온] 견적서_v1.pdf', 'info', 'CRM 보내기'),
       ('10.24 09:30', '고객 회신', 'RE: [아이콘:견적서 Q-2610-0412] — "현장 2곳 대수 추가 견적 요청" (요약)', 'ok', 'CRM 메일함'),
       ('10.27 11:05', '견적서 v2 발송', '400,000 → 1,240,000/월 · 바뀐 것: AI CCTV 고정형 6대 · 통신 6대 추가', 'info', 'CRM 보내기'),
       ('10.30 16:40', '고객 회신 · 확정', '"v2 로 진행" → [확정] (계약서 없이 견적 = 계약) → 서비스 줄 6 제안', 'ok', 'CRM 메일함 + 담당 확인')]
lg = ''.join(f'<li class="{c}"><span class="d">{d}</span><b>{k}</b><span class="t">{esc(x)} <i class="src">{s}</i></span></li>' for d, k, x, c, s in LOG)
C = f'''<div class="pg2 wide"><div class="h2top"><span class="muted">‹ 프로젝트</span></div>
<div class="h2name"><h1>셀트리온 (현장 확인 중)</h1>{chip("info", "견적")}<span class="muted">· 고객사 셀트리온 · 유입 자사 채널 › 홈페이지 · 담당 김규재</span></div>
<div class="body2"><div><div class="cd-h"><b>히스토리</b><span class="muted">담당자가 따로 적지 않아도 — 리드 · 보낸 견적 · 회신 · 확정이 자동 (10.24 이후 줄은 흐름 예시)</span></div><ol class="cd-hist">{lg}</ol></div>
<div class="rcol"><div class="card2x cd-iss"><div class="ch"><b>견적</b></div><ol><li class="ok"><b>v2 확정 · 1,240,000/월</b><span>10.30 · 고객 회신으로</span></li><li><b>v1 · 400,000/월</b><span>10.23 보냄 · 10.24 회신</span></li></ol></div>
<div class="card2x"><div class="ch"><b>메일 규칙</b></div><div class="kv3"><span>견적서</span><b class="mono">[아이콘:견적서 Q-…]</b><span>계약서</span><b class="mono">[아이콘:계약서 C-…]</b><span>청구서</span><b class="mono">[아이콘:청구서 …]</b></div></div></div></div></div>'''
FC = frame('프로젝트 상세', '', C, dims=[('left:206px;top:120px', '히스토리 출처 태그: CRM 보내기 · CRM 메일함 · 리드(자동) — 손으로 적은 줄과 구분')], h=560, menu=[('대시보드', None), ('마케팅', 1), ('세일즈', 1), ('고객관리', ['매출 현황', '프로젝트', '고객사']), ('재무관리', 1), ('운영관리', 1), ('분석', 1), ('VoC/CS', 1), ('업무', 1), ('피드백', 1), ('설정', 1)])

# ───────── 4. 업무보고 자동 정리 ─────────
WK = [('김규재', 3, 2, 1, '1,240,000/월', 1, 4), ('최한별', 2, 1, 0, '—', 0, 6), ('전성환', 1, 1, 1, '98,760,000', 1, 3)]
wr = ''.join(f'<tr><td>{av(n)} {n}</td><td class="num">{a}</td><td class="num">{b}</td><td class="num">{c}</td><td class="num">{d}</td><td class="num">{e}</td><td class="num">{f}</td></tr>' for n, a, b, c, d, e, f in WK)
D = f'''<div class="tb"><span class="tab on">이번 주 10.19–10.25</span><span class="tab">지난주</span><span class="tab">이번 달</span><span class="sp"></span><span class="sel">담당 전체</span><span class="btn sm primary">보고서로 복사</span></div>
<table class="ds fixed"><colgroup><col style="width:20%"><col style="width:13%"><col style="width:13%"><col style="width:13%"><col style="width:15%"><col style="width:13%"><col style="width:13%"></colgroup>
<thead><tr><th>담당</th><th>견적 보냄</th><th>고객 회신</th><th>확정 (= 계약)</th><th>확정 금액</th><th>계약서 날인</th><th>통화·미팅 기록</th></tr></thead><tbody>{wr}</tbody></table>
<div class="cd-note" style="margin-top:10px">문장으로: "이번 주 견적 6건 발송(셀트리온 · …), 회신 4건, 확정 2건(셀트리온 월 1,240,000 · 계룡 남양주 98,760,000). 회신 대기 7일 넘은 견적 3건: 대방 의정부우정(36일) · 금강주택(84일) · 원하건설(114일)" — 기록에서 자동으로, [보고서로 복사]</div>'''
FD = frame('업무 · 주간 보고', '', D, dims=[('left:206px;top:60px', '기간 · 담당 → 숫자 표 + 문장 요약 (모두 자동 기록에서)')], h=420, menu=[('대시보드', None), ('마케팅', 1), ('세일즈', 1), ('고객관리', 1), ('재무관리', 1), ('운영관리', 1), ('분석', 1), ('VoC/CS', 1), ('업무', ['업무 보고', '할 일']), ('피드백', 1), ('설정', 1)])

CSS = '''<style>#m-quote .ds.fixed td{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}#m-quote .drawer.w600{width:600px}#m-quote .mono{font-family:ui-monospace,Menlo,monospace;font-size:12px}#m-quote tr.sum td{background:var(--bg-subtle)}#m-quote td.r{text-align:right}</style>'''
SEC = f'''<section id="m-quote">{CSS}<h2>세일즈 — 견적서를 CRM 에서 만들고 보내기 (시안 2026-10-22)</h2>
<p class="rule">10/22 사용자: "가능하면 CRM 에서 견적서를 만들고 보내고 싶다 · 제목 규칙이 생기면 회신도 알아서 거른다 · 기록이 자동으로 남아 담당자 할 일이 줄고 업무보고까지 쉬워진다". 지금은 견적서 = 구글 시트(고객사별 파일, 탭 = 견적 1장), 계약서 = 구글 문서 기안 → 날인본 PDF 폴더, 메일은 비즈니스팀 참조.</p>
<table class="dg"><colgroup><col style="width:20%"><col style="width:40%"><col style="width:40%"></colgroup><thead><tr><th></th><th>지금</th><th>CRM 에서</th></tr></thead><tbody>
<tr><td><b>만들기</b></td><td>시트 양식 복사 → 칸 채움 (양식 2가지, 합친 칸)</td><td>같은 칸(구분·품명·상세·단가·수량·단위·기간·공급방식·공급가) · 품목은 단가표에서 · 저장하면 시트 탭 + PDF 를 폴더에 (같은 모양)</td></tr>
<tr><td><b>보내기</b></td><td>메일에 직접 첨부 · 비즈니스팀 참조</td><td>[메일로 보내기]: 담당자 본인 지메일 · 참조 비즈니스팀 · 제목 규칙 · 첨부 자동</td></tr>
<tr><td><b>회신</b></td><td>전체답장 → 각자 메일함</td><td>CRM 메일함(비즈니스팀 구성원)이 받아 제목의 [아이콘:견적서 번호] → 메일 스레드 순으로 같은 견적에 붙임</td></tr>
<tr><td><b>버전 · 확정</b></td><td>탭 복사 · 확정 표시 없음</td><td>v1 · v2 … 차이 표시 · [확정] = 계약 → 서비스 줄 제안</td></tr>
<tr><td><b>보고</b></td><td>손으로 정리</td><td>보낸 견적 · 회신 · 확정 · 날인 · 기록을 기간·담당별로 자동 집계 + 문장 요약</td></tr></tbody></table>
<h3 class="ph3">1. 견적서 작성 (실례: 셀트리온 10/23 — 견적서 폴더의 실제 견적과 같은 항목)</h3><div class="fwrap">{FA}</div>
<h3 class="ph3">2. 메일로 보내기 — 제목 규칙 [아이콘:견적서 Q-번호]</h3><div class="fwrap">{FB}</div>
<h3 class="ph3">3. 자동 기록 — 프로젝트 히스토리</h3><div class="fwrap">{FC}</div>
<h3 class="ph3">4. 업무보고 자동 정리</h3><div class="fwrap">{FD}</div>
<div class="cmp"><div><h4>정해 주실 것</h4><ul><li>제목 규칙: [아이콘:견적서 Q-연월-순번] 회사 (현장) 견적명 · 계약서 C- · 청구서</li><li>보내는 계정: 담당자 본인 지메일 (추천) / CRM 전용 계정</li><li>CRM 전용 메일 계정 + 비즈니스팀 그룹 구성원 (관리자)</li><li>견적서 · 계약서 폴더에 CRM 서비스 계정 편집자 권한 (파일 만들기)</li></ul></div>
<div><h4>순서</h4><ul><li>1 견적서 작성 · 버전 · PDF/시트 내보내기</li><li>2 메일로 보내기(본인 지메일) + CRM 메일함 회신 연결</li><li>3 확정 → 서비스 줄 · 계약서 기안·발송·날인본</li><li>4 업무보고 자동 · 지난 견적서 폴더 이력 가져오기</li></ul></div></div></section>'''

s = open(P, encoding='utf-8').read()
if '<section id="m-quote"' in s:
    i = s.index('<section id="m-quote"'); j = s.index('<section id="m-sales-wait"', i); s = s[:i] + s[j:]
i = s.index('<section id="m-sales-wait"'); s = s[:i] + SEC + s[i:]
s = re.sub(r'<a href="#m-quote" class="i">[^<]*</a>', '', s)
s = s.replace('<a href="#m-sales-wait" class="i">', '<a href="#m-quote" class="i">견적서 만들기·보내기 (시안)</a><a href="#m-sales-wait" class="i">', 1)
open(P, 'w', encoding='utf-8').write(s)
print('m-quote', len(SEC), 'doc', len(s))
