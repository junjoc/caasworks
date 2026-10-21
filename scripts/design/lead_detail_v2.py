# 세일즈 › 리드 상세 재기획 v2 (전성환 테스트 리드, 연락처 가림) → lead_detail_v2_sec.html
import json
G = {}
exec(compile(open('gen_layout.py', encoding='utf-8').read(), 'gen_layout.py', 'exec'), G)
esc, frame, chip, tone, av = G['esc'], G['frame'], G['chip'], G['tone'], G['av']
D = json.load(open('lead_test.json', encoding='utf-8')); L = D['lead']; TL = D['tl']
AT = {'MEETING': '미팅', 'CALL_OUT': '전화 발신', 'NOTE': '메모'}
FLOW = ['신규리드', '컨텍', '제안', '미팅', '도입직전', '도입완료']
cur = L['stage']; ci = FLOW.index(cur)

def stepper(slim=True):
    out = ''
    for i, s in enumerate(FLOW):
        cls = 'done' if i < ci else 'cur' if i == ci else ''
        sub = '<em>오늘 · +0일</em>' if i == ci else ''
        out += f'<div class="sp2 {cls}"><b>{s}</b>{sub}</div>'
    return f'<div class="step2">{out}<span class="side2">예정 · 이탈 ⋯</span></div>'

def props():
    return ('<div class="props">'
            f'<div><span>담당</span><b>{av(L["assigned_name"])} {esc(L["assigned_name"])} ▾</b></div>'
            '<div><span>우선순위</span><b>중간 ▾</b></div><div><span>도입가능성</span><b>중간 ▾</b></div>'
            '<div class="na"><span>다음 액션</span><b>미팅 · 10.23 <i>2일 남음</i></b></div>'
            '<div><span>고객사</span><b class="lk">전성환 테스트 ↗</b></div></div>')

def head(compact=False):
    return (f'<div class="h2top"><span class="muted">‹ 리스트</span><span class="sp"></span><span class="btn sm quiet">‹ 이전</span><span class="btn sm quiet">다음 ›</span><span class="btn sm">견적서</span><span class="btn sm quiet">⋯</span></div>'
            f'<div class="h2name"><h1>{esc(L["company_name"])}</h1>{chip(tone(cur), cur)}<span class="muted">· 자사 채널 › 홈페이지 · 유입 10.21 (+0일) · No.{L["lead_number"]}</span></div>'
            + stepper() + props())

def composer():
    return ('<div class="cmp2"><div class="ty"><span class="on">전화 발신</span><span>전화 수신</span><span>이메일</span><span>미팅</span><span>견적</span><span>메모</span><span>그 외 ▾</span></div>'
            '<div class="ta">통화·미팅 내용 (Enter 기록)</div><div class="ft"><span class="muted">다음 액션</span><span class="in">지금: 미팅 · 10.23 (비우면 유지)</span><span class="in d">날짜</span><span class="sp"></span><span class="ck">☑ "미팅 10.23" 완료로</span><span class="btn sm primary">기록</span></div></div>')

def timeline():
    acts = [t for t in TL if t['kind'] == 'act']; chg = [t for t in TL if t['kind'] != 'act']
    a = ''.join(f'<li class="a"><div class="r1"><span class="tt">{AT.get(t["type"], t["type"])}</span><span class="muted">{t["at"][11:16]} · {esc(t["by"])}</span></div><p>{esc(t["desc"] or "")}</p></li>' for t in acts)
    nx = [t for t in chg if t['kind'] == 'next_action']
    n = ''.join(f'<li class="n">다음 액션 {"<b>" + esc(t["old"]) + "</b> 완료" if t["new"] == "완료" else "→ <b>" + esc(t["new"]) + "</b>"} <span class="muted">{t["at"][11:16]}</span></li>' for t in nx)
    other = [t for t in chg if t['kind'] != 'next_action']
    st = ' → '.join(['신규리드'] + [t['new'] for t in sorted([t for t in other if t['kind'] == 'stage'], key=lambda x: x['at'])])
    return (f'<div class="tlg"><div class="day">오늘 · 10월 21일 (화)</div><ol class="tl4">{a}{n}'
            f'<li class="c">단계 {esc(st)} <span class="muted">· 담당 미배정 → 전성환 · 변경 {len(other)}건</span> <span class="lk">펼치기</span></li></ol></div>')

def card(title, rows, extra='', empty=0):
    r = ''.join(f'<span>{k}</span><b>{v}</b>' for k, v in rows)
    e = f'<div class="emp">빈 칸 {empty} · <span class="lk">채우기</span></div>' if empty else ''
    return f'<div class="card2x"><div class="ch"><b>{title}</b><span class="muted">수정</span></div><div class="kv3">{r}</div>{extra}{e}</div>'

contact = card('문의자', [('이름', '전성환'), ('연락처', '1666-···· <span class="lk">전화</span>'), ('이메일', '····@gmail.com')], empty=1)
inquiry = card('문의 내용', [], extra='<p class="q">&gt;전성환 테스트 (GA 이벤트 확인용, 마케팅팀)<br>레퍼러 주소: 없음(다이렉트)</p><div class="tags"><span class="tag">#기타</span></div>')
company = card('회사 · 유입', [('코드', L['customer_code']), ('유입', '<i class="dot" style="background:var(--ok)"></i>자사 채널 › 홈페이지'), ('메모', '[Slack 문의알림] 자동등록')], empty=4)

tabs = '<div class="tabs t2"><span class="on">활동 1</span><span>유입 경로</span><span>견적·매출</span><span>VoC</span></div>'
A_body = f'<div class="pg2">{head()}<div class="body2"><div>{tabs}{composer()}{timeline()}</div><div class="rcol">{contact}{inquiry}{company}</div></div></div>'
FA = frame('리드 상세', '리스트', ('세일즈',), A_body, dims=[('left:220px;top:60px', '머리: 이름 20 + 단계 칩 + 메타 한 줄'), ('left:220px;top:132px', '단계 진행줄 32 (지금 단계만 "오늘 · +0일")'), ('left:220px;top:174px', '속성 줄: 자주 바꾸는 5개 = 누르면 바로 수정 (숫자줄·진행 묶음 대체)'), ('left:220px;top:236px', '본문 8 : 4 — 왼쪽 기록·타임라인 / 오른쪽 카드 3장 (값 있는 칸만)')], h=820)

info_tab = ('<div class="tabs t2"><span>활동 1</span><span class="on">정보</span><span>유입 경로</span><span>견적·매출</span><span>VoC</span></div>'
            '<div class="grid2">' + card('문의자', [('이름', '전성환'), ('직급', '<i class="muted">—</i>'), ('연락처', '1666-····'), ('이메일', '····@gmail.com')]) +
            card('회사', [('회사명', '전성환 테스트'), ('코드', L['customer_code']), ('발주', '<i class="muted">—</i>'), ('사업분류', '<i class="muted">—</i>'), ('고객사', '<span class="lk">전성환 테스트 ↗</span>')]) +
            card('문의', [('유입일', '10.21'), ('유입', '자사 채널 › 홈페이지'), ('관심 서비스', '<i class="muted">—</i>'), ('핵심 니즈', '<i class="muted">—</i>'), ('주제', '<span class="tag">#기타</span>')]) +
            card('문의 내용 · 메모', [], extra='<p class="q">&gt;전성환 테스트 (GA 이벤트 확인용, 마케팅팀)<br>레퍼러 주소: 없음(다이렉트)</p><p class="q muted">메모 · [Slack 문의알림] 자동등록</p>') + '</div>')
B_body = f'<div class="pg2 narrow">{head()}{info_tab}</div>'
FB = frame('리드 상세', '리스트', ('세일즈',), B_body, dims=[('left:330px;top:236px', '한 줄 960 · 탭 5개 (정보 탭 = 카드 4장 2열)')], h=700)

left3 = '<div class="lcol3">' + card('문의자', [('이름', '전성환'), ('연락처', '1666-····'), ('이메일', '····@gmail.com')]) + card('회사 · 유입', [('코드', L['customer_code']), ('유입', '자사 채널 › 홈페이지'), ('주제', '<span class="tag">#기타</span>')]) + '</div>'
right3 = ('<div class="rcol3"><div class="card2x"><div class="ch"><b>할 일</b></div><p class="q">미팅 · 10.23 <span class="due">2일 남음</span></p></div>'
          '<div class="card2x"><div class="ch"><b>견적서</b><span class="muted">+ 새 견적</span></div><p class="q muted">없음</p></div>'
          '<div class="card2x"><div class="ch"><b>VoC</b></div><p class="q muted">없음</p></div><div class="card2x"><div class="ch"><b>고객사</b></div><p class="q lk">전성환 테스트 ↗</p></div></div>')
C_body = f'<div class="pg2">{head()}<div class="body3">{left3}<div>{composer()}{timeline()}</div>{right3}</div></div>'
FC = frame('리드 상세', '리스트', ('세일즈',), C_body, dims=[('left:220px;top:236px', '3단: 정보 260 | 기록·타임라인 | 할 일·연결 260')], h=720)

# 드로어 v2 (480) — 같은 규칙: 속성은 칩, 값 있는 칸만, 같은 기록 칸·타임라인
def pill(k, v, cls=''): return f'<span class="pl {cls}"><em>{k}</em>{v} ▾</span>'
DRAWER_NOW = '''<div class="dnow"><div class="dh2"><b>전성환 테스트</b> <span class="st info">미팅</span><div class="muted">● 자사 채널 › 홈페이지 · 유입 2026-10-21 · 담당 전성환</div></div>
<div class="dsec"><div class="muted s">요약 — 바꾸면 바로 저장</div><div class="kvw"><span>단계</span><i>미팅</i><span>도입가능성</span><i>중간</i><span>우선순위</span><i>중간</i><span>담당</span><i>전성환</i><span>다음 액션</span><b>미팅 · 2026-10-23</b><span>발주 · 사업분류</span><b>— · —</b></div></div>
<div class="dsec"><div class="muted s">문의자</div><div class="kvw"><span>이름 · 직급</span><b>전성환</b><span>연락처</span><b>1666-····</b><span>이메일</span><b>····@gmail.com</b></div></div><div class="dsec muted s">기록 … / 타임라인 …</div></div>'''
DRAWER_V2 = f'''<div class="dv2"><div class="dh2"><div class="r"><b>전성환 테스트</b><span class="st info">미팅</span><span class="sp"></span><span class="x">↗ 상세</span><span class="x">✕</span></div>
<div class="muted">● 자사 채널 › 홈페이지 · 유입 10.21 (+0일) · No.{L["lead_number"]}</div></div>
<div class="dstep">{''.join(f'<i class="{"done" if i < ci else "cur" if i == ci else ""}" title="{s}"></i>' for i, s in enumerate(FLOW))}<span>미팅 · 오늘 (+0일)</span></div>
<div class="pls">{pill('단계', '미팅')}{pill('담당', '전성환')}{pill('우선', '중간')}{pill('가능성', '중간')}<span class="pl na"><em>다음</em>미팅 · 10.23 <b>2일 남음</b></span></div>
<div class="dcard"><div class="ch"><b>문의자</b><span class="muted">수정</span></div><div class="ln">전성환 · <span class="lk">1666-····</span> · ····@gmail.com</div>
<p class="q2">&gt;전성환 테스트 (GA 이벤트 확인용, 마케팅팀) 레퍼러 주소: 없음(다이렉트) <span class="tag">#기타</span></p></div>
<div class="dpad">{composer()}{timeline()}</div>
<div class="dft"><span class="btn sm danger">이탈 처리</span><span class="sp"></span><span class="btn sm">상세 페이지</span></div></div>'''

CSS = '''<style>
.dpair{display:flex;gap:24px;align-items:flex-start;flex-wrap:wrap;margin:8px 0 20px}.dpair h4{margin:0 0 6px;font-size:13px}
.dnow,.dv2{width:480px;border:1px solid var(--line);border-radius:8px;background:var(--bg);font-size:12.5px;overflow:hidden}.dh2{padding:12px 14px;border-bottom:1px solid var(--line)}.dh2 b{font-size:15px;font-weight:600}.dh2 .muted{font-size:12px;margin-top:3px}.dh2 .r{display:flex;align-items:center;gap:8px}.dh2 .sp,.dft .sp{flex:1}.dh2 .x{font-size:12px;color:var(--fg-2)}
.dsec{padding:10px 14px;border-bottom:1px solid var(--line-2)}.s{font-size:11px;margin-bottom:6px}.kvw{display:grid;grid-template-columns:84px 1fr;gap:6px 12px;align-items:center}.kvw span{color:var(--fg-3)}.kvw i{font-style:normal;border:1px solid var(--line);border-radius:6px;height:26px;line-height:26px;padding:0 8px}.kvw b{font-weight:400}
.dstep{display:flex;align-items:center;gap:3px;padding:10px 14px 0}.dstep i{width:34px;height:5px;border-radius:3px;background:var(--line)}.dstep i.done{background:color-mix(in srgb,var(--info) 40%,var(--bg))}.dstep i.cur{background:var(--info)}.dstep span{margin-left:8px;font-size:12px;color:var(--fg-2)}
.pls{display:flex;flex-wrap:wrap;gap:6px;padding:10px 14px}.pl{display:inline-flex;align-items:center;gap:5px;height:26px;padding:0 9px;border:1px solid var(--line);border-radius:13px;font-size:12px;color:var(--fg)}.pl em{font-style:normal;color:var(--fg-3)}.pl.na b{color:var(--warn);font-weight:500}
.dcard{margin:0 14px 10px;border:1px solid var(--line);border-radius:8px;padding:8px 10px}.dcard .ch{display:flex;justify-content:space-between;margin-bottom:4px}.dcard .ch b{font-size:12.5px;font-weight:600}.dcard .ln{color:var(--fg)}.q2{margin:6px 0 0;color:var(--fg-2);line-height:1.55}.dpad{padding:0 14px 10px}.dv2 .cmp2 .ft{flex-wrap:wrap}.dv2 .cmp2 .in{flex:1 1 60%;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.dv2 .cmp2 .ck{flex:1}.dft{display:flex;padding:10px 14px;border-top:1px solid var(--line)}
.pg2{max-width:1040px;margin:0 auto}.pg2.narrow{max-width:960px}.h2top{display:flex;align-items:center;gap:6px;font-size:12px;height:28px}.h2top .sp,.ft .sp{flex:1}
.h2name{display:flex;align-items:center;gap:8px;margin:2px 0 10px;flex-wrap:wrap}.h2name h1{font-size:20px;font-weight:600;margin:0}.h2name .muted{font-size:12px}
.step2{display:flex;align-items:stretch;height:32px;margin-bottom:10px}.sp2{flex:1;display:flex;align-items:center;justify-content:center;gap:6px;background:var(--bg-subtle);color:var(--fg-3);font-size:12px;clip-path:polygon(0 0,calc(100% - 10px) 0,100% 50%,calc(100% - 10px) 100%,0 100%,10px 50%);margin-left:-6px}.sp2:first-child{clip-path:polygon(0 0,calc(100% - 10px) 0,100% 50%,calc(100% - 10px) 100%,0 100%);margin-left:0}
.sp2 b{font-weight:500}.sp2.done{background:color-mix(in srgb,var(--info) 22%,var(--bg));color:var(--fg)}.sp2.cur{background:var(--info);color:#fff}.sp2.cur b{font-weight:600}.sp2 em{font-style:normal;font-size:11px;opacity:.85}.side2{display:flex;align-items:center;padding:0 10px;font-size:12px;color:var(--fg-2);border:1px solid var(--line);border-radius:6px;margin-left:8px}
.props{display:grid;grid-template-columns:repeat(5,1fr);border:1px solid var(--line);border-radius:8px;margin-bottom:16px}.props>div{padding:8px 12px;border-left:1px solid var(--line-2)}.props>div:first-child{border-left:0}.props span{display:block;font-size:11.5px;color:var(--fg-3)}.props b{font-weight:500;font-size:13px;display:flex;align-items:center;gap:6px;margin-top:2px}.props i{font-style:normal;font-size:11.5px;color:var(--warn);font-weight:500}.props .na b{color:var(--fg)}
.lk{color:var(--accent)}.body2{display:grid;grid-template-columns:minmax(0,2fr) minmax(0,1fr);gap:20px}.body3{display:grid;grid-template-columns:240px minmax(0,1fr) 220px;gap:16px}
.t2{margin-bottom:10px}.cmp2{border:1px solid var(--line);border-radius:8px;padding:10px;margin-bottom:14px}.cmp2 .ty{display:flex;gap:4px;flex-wrap:wrap}.cmp2 .ty span{font-size:12px;padding:2px 8px;border:1px solid var(--line);border-radius:4px;color:var(--fg-2)}.cmp2 .ty .on{background:var(--fg);color:var(--bg);border-color:var(--fg)}
.cmp2 .ta{height:44px;margin:8px 0;padding:6px 8px;border-radius:4px;background:var(--bg-subtle);color:var(--fg-3);font-size:12.5px}.cmp2 .ft{display:flex;align-items:center;gap:6px;font-size:12px}.cmp2 .in{border:1px solid var(--line);border-radius:4px;padding:2px 8px;color:var(--fg-3);flex:1}.cmp2 .in.d{flex:none;width:70px}.cmp2 .ck{color:var(--fg-2)}
.day{font-size:12px;font-weight:600;color:var(--fg-2);margin:0 0 8px}.tl4{list-style:none;margin:0;padding:0 0 0 16px;border-left:1px solid var(--line);font-size:12.5px}.tl4 li{position:relative;margin:0 0 10px;color:var(--fg-2)}.tl4 li::before{content:"";position:absolute;left:-20px;top:6px;width:7px;height:7px;border-radius:50%;background:var(--line)}.tl4 li.a::before{background:var(--accent)}.tl4 li.n::before{background:var(--warn)}
.tl4 .r1{display:flex;gap:8px;align-items:center}.tl4 .tt{font-size:11.5px;padding:1px 6px;border-radius:3px;background:var(--accent-soft);color:var(--accent)}.tl4 p{margin:4px 0 0;color:var(--fg)}.tl4 .muted{font-size:11.5px}
.card2x{border:1px solid var(--line);border-radius:8px;padding:10px 12px;margin-bottom:10px;font-size:12.5px}.card2x .ch{display:flex;justify-content:space-between;align-items:center;margin-bottom:6px}.card2x .ch b{font-size:13px;font-weight:600}.card2x .ch .muted{font-size:11.5px}
.kv3{display:grid;grid-template-columns:60px 1fr;gap:5px 10px}.kv3 span{color:var(--fg-3)}.kv3 b{font-weight:400;color:var(--fg);min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.kv3 .lk{color:var(--accent)}.q{margin:0;color:var(--fg);line-height:1.6}.q.muted{color:var(--fg-3)}.tags{margin-top:6px}.emp{margin-top:8px;padding-top:6px;border-top:1px dashed var(--line);font-size:11.5px;color:var(--fg-3)}.dot{display:inline-block;width:7px;height:7px;border-radius:50%;margin-right:5px}
.grid2{display:grid;grid-template-columns:1fr 1fr;gap:10px}.due{color:var(--warn);font-size:11.5px;margin-left:4px}
.dg{width:100%;border-collapse:collapse;font-size:12.5px;margin:8px 0 18px}.dg th,.dg td{border:1px solid var(--line);padding:6px 10px;text-align:left;vertical-align:top}.dg th{background:var(--bg-subtle);font-weight:500;text-align:center}.dg td.c{text-align:center}.dg .bad{color:var(--bad)}.dg .warn{color:var(--warn)}
</style>'''
DIAG = '''<table class="dg"><colgroup><col style="width:24%"><col style="width:40%"><col style="width:36%"></colgroup><thead><tr><th>문제 (10/21 적용본)</th><th>보이는 모습</th><th>v2 에서</th></tr></thead><tbody>
<tr><td><b>같은 정보 3~4번</b></td><td>단계: 칩·진행줄·숫자줄·정보 패널 / 다음 액션: 숫자줄·기록 칸·정보·타임라인</td><td>한 정보는 한 곳. 단계 = 진행줄, 자주 바꾸는 5개 = 속성 줄</td></tr>
<tr><td><b>오른쪽 정보가 너무 김</b></td><td>25칸을 한 줄씩 → 높이 955px. 빈 칸 5개(직급·발주·사업분류·관심 서비스·핵심 니즈)도 줄 차지, 채널·경로 원래 값이 "유입"과 중복</td><td>카드 3장, 값 있는 칸만. 빈 칸은 "빈 칸 n · 채우기" 한 줄. 카드 단위로 수정</td></tr>
<tr><td><b>숫자줄이 상세에 안 맞음</b></td><td>"D+0", "미팅 0일째", "활동 0건" — 목록용 요약을 한 건에 씀</td><td>숫자줄 없음. 경과는 진행줄·메타에 짧게</td></tr>
<tr><td><b>폭</b></td><td>1,715px 중 1,280만 쓰고 왼쪽에 붙음 → 오른쪽 435px 빔</td><td>본문 최대 1,040 가운데 정렬 (상세 = 읽는 화면)</td></tr>
<tr><td><b>타임라인</b></td><td>단계 왕복(이탈→컨텍→제안→컨텍) 같은 변경 6줄이 활동 1건과 같은 무게, 날짜 묶음 없음</td><td>날짜별 묶음 · 활동 크게 · 단계·담당 변경은 하루 한 줄로 접음(펼치기)</td></tr>
<tr><td><b>위계</b></td><td>모든 글자 12.5 회색, 묶음 경계 약함</td><td>이름 20 · 카드 제목 13/600 · 값 12.5 진하게 · 라벨 연하게</td></tr></tbody></table>
<h3 class="ph3">경과 표기 — 전 화면 통일 (제안)</h3><table class="dg"><thead><tr><th>뜻</th><th>지금</th><th>바꿀 표기</th></tr></thead><tbody>
<tr><td>유입 후 지난 날</td><td class="c">D+43</td><td class="c">유입 10.21 (+43일)</td></tr>
<tr><td>지금 단계에 머문 날</td><td class="c">미팅 0일째</td><td class="c">미팅 +2일 · 들어온 날이면 "오늘"</td></tr>
<tr><td>다음 액션까지</td><td class="c">2026-10-23</td><td class="c">10.23 <span class="warn">2일 남음</span> · 지나면 <span class="bad">1일 지남</span></td></tr>
<tr><td>마지막 활동</td><td class="c">43일 전</td><td class="c">그대로 (14일 넘으면 빨강)</td></tr>
<tr><td>보드 카드</td><td class="c">D+9</td><td class="c">+9일</td></tr></tbody></table>'''
SEC = f'''<section id="m-lead2">{CSS}<h2>세일즈 — 리드 상세 v2 재기획 (시안 · 결정 대기, 2026-10-21 · 전성환 테스트 리드)</h2>
<p class="rule">10/21 피드백: "오른쪽 정보칸이 너무 길다 · 전체적으로 급조된 느낌". 적용본을 실제로 보고 문제를 먼저 적고, 같은 리드로 세 가지 배치를 그림.</p>{DIAG}
<div class="cmp"><div><h4>A. 머리 + 속성 줄 + 2단 (추천)</h4><ul><li>자주 바꾸는 5개(담당·우선순위·가능성·다음 액션·고객사)를 위 속성 줄에서 바로</li><li>왼쪽 기록·타임라인, 오른쪽 카드 3장 (값 있는 칸만)</li><li>오른쪽 높이 955 → 약 420</li></ul></div>
<div><h4>B. 한 줄 960 + 탭</h4><ul><li>정보는 "정보" 탭 안 카드 4장 2열</li><li>가장 단순하지만 기록하면서 문의 내용을 같이 못 봄</li></ul></div>
<div><h4>C. 3단</h4><ul><li>왼쪽 정보 · 가운데 기록 · 오른쪽 할 일·견적·VoC·고객사</li><li>한눈에 다 보이나 1,280 이하에서 가운데가 좁음</li></ul></div></div>
<h3 class="ph3">드로어 — 지금 vs v2 (10/21 피드백: "단계·도입가능성 등이 넓게 펴질 필요가 있나")</h3>
<div class="dpair"><div><h4>지금 — 선택 칸이 한 줄씩 480 폭 끝까지</h4>{DRAWER_NOW}</div><div><h4>v2 — 속성은 작은 칩 2줄, 문의자는 한 줄 + 문의 내용, 바로 기록</h4>{DRAWER_V2}</div></div>
<h3 class="ph3">A (추천)</h3><div class="fwrap">{FA}</div><h3 class="ph3">B</h3><div class="fwrap">{FB}</div><h3 class="ph3">C</h3><div class="fwrap">{FC}</div>
<div class="cmp"><div><h4>정해 주실 것</h4><ul><li>배치 A(추천) / B / C</li><li>경과 표기 통일안 (위 표)</li><li>A 를 고르면 같은 규칙(속성 줄 · 카드 · 값 있는 칸만 · 날짜 묶음 타임라인)을 드로어·고객 상세에도</li></ul></div></div></section>'''
open('lead_detail_v2_sec.html', 'w', encoding='utf-8').write(SEC)
print('v2', len(SEC))
