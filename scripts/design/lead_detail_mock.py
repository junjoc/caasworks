# 세일즈 › 리드 상세 페이지 시안 (실데이터 1건, 문의자 가림) → lead_detail_sec.html
import json
from datetime import date
G = {}
exec(compile(open('gen_layout.py', encoding='utf-8').read(), 'gen_layout.py', 'exec'), G)
esc, frame, chip, tone = G['esc'], G['frame'], G['chip'], G['tone']
D = json.load(open('lead_detail.json', encoding='utf-8')); L = D['lead']
today = date(2026, 10, 21)
d0 = date.fromisoformat(L['inquiry_date']); dplus = (today - d0).days
AT = {'CALL_OUT': '전화 발신', 'CALL_IN': '전화 수신', 'QUOTATION': '견적', 'MEETING': '미팅', 'EMAIL_SENT': '이메일', 'NOTE': '메모', 'PROPOSAL': '제안', 'DEMO': '데모'}
md = lambda s: s[5:10].replace('-', '.')
# 단계 진행줄
hist = [h for h in D['history'] if h['field_changed'] == 'stage']
entered = {'신규리드': L['inquiry_date']}
for h in hist: entered[h['new_value']] = h['changed_at'][:10]
FLOW = ['신규리드', '컨텍', '제안', '미팅', '도입직전', '도입완료']
cur = L['stage']; ci = FLOW.index(cur) if cur in FLOW else -1
steps = ''
for i, s in enumerate(FLOW):
    st = 'done' if i < ci else 'cur' if i == ci else ''
    sub = ''
    if s in entered and i <= ci:
        nxt = FLOW[i + 1] if i + 1 < len(FLOW) else None
        end = date.fromisoformat(entered[nxt]) if nxt in entered and i < ci else today
        n = (end - date.fromisoformat(entered[s])).days
        sub = f'{md(entered[s])} · {"지금 " if st == "cur" else ""}{n}일{"째" if st == "cur" else ""}'
    steps += f'<div class="stp {st}"><b>{s}</b><em>{sub or "&nbsp;"}</em></div>'
stepper = f'<div class="stepper">{steps}<div class="stside"><span class="btn sm">예정으로</span><span class="btn sm danger">이탈 처리</span></div></div>'
acts = D['acts']; last = max(a['performed_at'][:10] for a in acts)
gap = (today - date.fromisoformat(last)).days
K = ''.join(f'<div><span>{a}</span><b class="{c}">{v}</b><em>{e}</em></div>' for a, v, c, e in [
    ('유입 후', f'D+{dplus}', '', f'{L["inquiry_date"]} 문의'), ('지금 단계', f'{cur} {(today - date.fromisoformat(entered[cur])).days}일째', '', '단계 평균 대비는 분석 › 전환 소요'),
    ('활동', f'{len(acts)}건', '', f'마지막 {md(last)} · <b class="bad">{gap}일 전</b>'), ('다음 액션', '없음', 'bad', '날짜를 정하면 대시보드에 모임'), ('고객사', '연결됨', '', '매출 아직 없음 → 견적·매출 탭')])
# 타임라인 (활동 + 단계 변경 섞어서, 최신 위)
items = [(a['performed_at'], 'act', a) for a in acts] + [(h['changed_at'], 'hist', h) for h in D['history']]
items.sort(key=lambda x: x[0], reverse=True)
tl = ''
for ts, k, x in items:
    if k == 'act':
        desc = esc((x['description'] or '').strip()).replace('\n', '<br>')
        tl += f'<li class="ta"><div class="th"><span class="tt">{AT.get(x["activity_type"], x["activity_type"])}</span><b>{esc(x["title"] or "")}</b><span class="tm">{md(ts)} · {esc(x["by"])}</span><span class="tx">수정 · 삭제</span></div>{f"<p>{desc}</p>" if desc else ""}</li>'
    else:
        what = f'단계 {esc(x["old_value"])} → <b>{esc(x["new_value"])}</b>' if x['field_changed'] == 'stage' else f'담당 {esc(x["old_value"] or "없음")} → <b>{esc(x["new_value"])}</b>'
        tl += f'<li class="th2">{what} <span class="tm">{md(ts)} · {esc(x["by"])}</span></li>'
tl = f'<li class="th2 na">다음 액션 <b>견적서 발송 10.23</b> · 이전 "데모하기 10.22" 완료 <span class="tm">(예시) 10.21 · 최한별</span></li>' + tl
tl += f'<li class="th2">문의 접수 · 검색 › 구글 · 자동 등록(Slack 문의 알림) <span class="tm">{md(L["created_at"])}</span></li>'
composer = '''<div class="comp"><div class="ctypes"><span class="on">전화 발신</span><span>전화 수신</span><span>이메일</span><span>미팅</span><span>견적</span><span>메모</span></div>
<div class="cta">통화·미팅 내용을 적으세요 (Enter 기록 · Shift+Enter 줄바꿈)</div>
<div class="cna"><span class="muted">다음 액션</span><span class="inp2">현장 사진 받으면 견적서 발송</span><span class="inp2 d">10.23</span><span class="muted">(선택 — 비우면 지금 다음 액션 유지)</span></div>
<div class="cft"><span class="chk2">☑ 지금 다음 액션 "데모하기 10.22" 완료로</span><span class="sp"></span><span class="muted">2026-10-21</span><span class="btn sm primary">기록</span></div></div>'''
tags = ' '.join(f'<span class="tg">#{esc(t)}</span>' for t in (L['topic_tags'] or []))
def kv(rows): return '<div class="kv2">' + ''.join(f'<span>{a}</span><b class="{"muted" if v in ("—", None) else ""}">{v or "—"}</b>' for a, v in rows) + '</div>'
side = f'''<div class="side"><div class="shd">정보 <span class="muted">칸을 누르면 바로 수정</span></div>
<div class="sgrp"><h5>진행</h5>{kv([('단계', chip(tone(cur), cur)), ('담당', esc(L['assigned_name'])), ('우선순위', L['priority']), ('도입가능성', L['conversion_probability']), ('다음 액션', '<span class="add">+ 정하기</span>')])}</div>
<div class="sgrp"><h5>회사</h5>{kv([('회사명', esc(L['company_name'])), ('코드', L['customer_code']), ('발주', L['site_category']), ('사업분류', L['industry'] and esc(L['industry'])), ('고객사', '<a>연결됨 →</a>')])}</div>
<div class="sgrp"><h5>문의자</h5>{kv([('이름·직급', esc(L['contact_person'] or '—')), ('연락처', '010-····-···· <span class="add">전화</span>'), ('이메일', L['contact_email'])])}</div>
<div class="sgrp"><h5>문의</h5>{kv([('유입일', L['inquiry_date']), ('유입', '<span class="idot" style="background:var(--info)"></span>검색 <span class="muted">› 구글</span>'), ('원래 값', '<span class="muted">검색유입 / 구글</span>'), ('관심 서비스', None), ('핵심 니즈', None), ('주제', tags)])}
<p class="ltxt">{esc((L["inquiry_content"] or "").strip())}</p></div>
<div class="sgrp"><h5>메모</h5><p class="ltxt">{esc(L["notes"] or "—")}</p></div></div>'''
body = f'''<div class="nl"><div><span class="back">‹ 리스트</span><h1>{esc(L["company_name"])} {chip(tone(cur), cur)}</h1><p class="meta">{L["site_category"]} · <span class="idot" style="background:var(--info)"></span>검색 › 구글 · 유입 {L["inquiry_date"]} · 담당 {esc(L["assigned_name"])}</p></div>
<div class="acts"><span class="btn sm quiet">‹ 이전</span><span class="btn sm quiet">다음 ›</span><span class="btn sm dash">견적서 (연동 후)</span></div></div>
{stepper}<div class="kpis">{K}</div>
<div class="two"><div><div class="tb2"><span class="tabs"><span class="on">활동 {len(acts)}</span><span>변경 이력 {len(D["history"])}</span><span>유입 경로</span><span>견적·매출</span><span>VoC</span></span></div>{composer}<ol class="tl3">{tl}</ol></div>{side}</div>'''
FD = frame('리드 상세', '리스트', ('세일즈',), body, dims=[('left:206px;top:58px', '이름줄 56: 회사명 18 + 단계 칩 · 메타 한 줄 · 오른쪽 이동·동작'), ('left:206px;top:118px', '단계 진행줄 52: 단계마다 들어온 날·머문 일수'), ('left:206px;top:178px', '숫자줄 64'), ('left:206px;top:250px', '본문 2 : 1 — 왼쪽 활동(입력 + 타임라인), 오른쪽 정보 패널')], h=980)
CSS = '''<style>.nl{display:flex;justify-content:space-between;align-items:flex-start;height:56px}.nl h1{font-size:18px;font-weight:600;margin:0;display:flex;gap:8px;align-items:center}.nl .meta{font-size:12px;color:var(--fg-2);margin:2px 0 0}.nl .back{font-size:12px;color:var(--fg-3)}.nl .acts{display:flex;gap:6px}.btn.dash{border-style:dashed;color:var(--fg-3)}
.stepper{display:flex;gap:4px;align-items:stretch;height:48px;margin:6px 0 10px}.stp{flex:1;border-radius:4px;background:var(--bg-subtle);padding:6px 10px;display:flex;flex-direction:column;justify-content:center;border-top:3px solid var(--line)}.stp b{font-size:12.5px;font-weight:500;color:var(--fg-3)}.stp em{font-style:normal;font-size:11px;color:var(--fg-3)}
.stp.done{border-top-color:var(--info)}.stp.done b{color:var(--fg)}.stp.cur{border-top-color:var(--info);background:var(--accent-soft)}.stp.cur b{color:var(--accent);font-weight:600}.stp.cur em{color:var(--fg-2)}.stside{display:flex;flex-direction:column;gap:4px;justify-content:center;margin-left:8px}
.tb2{margin-bottom:10px}.comp{border:1px solid var(--line);border-radius:6px;padding:8px 10px;margin-bottom:14px}.ctypes{display:flex;gap:4px;flex-wrap:wrap}.ctypes span{font-size:12px;padding:2px 8px;border-radius:4px;border:1px solid var(--line);color:var(--fg-2)}.ctypes .on{background:var(--fg);color:var(--bg);border-color:var(--fg)}
.cta{height:52px;margin:8px 0;padding:6px 8px;border-radius:4px;background:var(--bg-subtle);font-size:12.5px;color:var(--fg-3)}.cna{display:flex;align-items:center;gap:6px;font-size:12px;margin:-2px 0 8px}.inp2{border:1px solid var(--line);border-radius:4px;padding:2px 8px;color:var(--fg)}.inp2.d{color:var(--fg-2)}.tl3 li.na::before{background:var(--warn)}
.cft{display:flex;align-items:center;gap:8px;font-size:12px}.chk2{color:var(--fg-2)}
.tl3{list-style:none;margin:0;padding:0 0 0 16px;border-left:1px solid var(--line);font-size:12.5px}.tl3 li{position:relative;margin:0 0 12px}.tl3 li::before{content:"";position:absolute;left:-20px;top:6px;width:7px;height:7px;border-radius:50%;background:var(--line)}.tl3 li.ta::before{background:var(--accent)}
.tl3 .th{display:flex;align-items:center;gap:8px}.tl3 .tt{font-size:11.5px;padding:1px 6px;border-radius:3px;background:var(--accent-soft);color:var(--accent)}.tl3 .tm{color:var(--fg-3);font-size:11.5px}.tl3 .tx{margin-left:auto;color:var(--fg-3);font-size:11px}.tl3 p{margin:4px 0 0;color:var(--fg-2);line-height:1.55}.tl3 .th2{color:var(--fg-2)}
.side{border-left:1px solid var(--line);padding-left:16px;font-size:12.5px}.shd{font-size:14px;font-weight:500;margin-bottom:8px}.shd .muted{font-size:11.5px;font-weight:400}.sgrp{border-top:1px solid var(--line2);padding:8px 0}.sgrp h5{margin:0 0 6px;font-size:11px;font-weight:500;color:var(--fg-3)}
.kv2{display:grid;grid-template-columns:76px 1fr;gap:5px 10px}.kv2 span{color:var(--fg-3)}.kv2 b{font-weight:400}.kv2 .add,.side .add{color:var(--accent)}.side a{color:var(--accent)}.tg{color:var(--accent);margin-right:6px}.ltxt{margin:6px 0 0;color:var(--fg-2);line-height:1.55;white-space:pre-wrap}
.rl{width:100%;border-collapse:collapse;font-size:12.5px;margin:8px 0 16px}.rl th,.rl td{border:1px solid var(--line);padding:6px 10px;text-align:left;vertical-align:top}.rl th{background:var(--bg-subtle);font-weight:500;text-align:center}</style>'''
ROLE = '''<table class="rl"><colgroup><col style="width:16%"><col style="width:42%"><col style="width:42%"></colgroup><thead><tr><th></th><th>드로어 (480, 적용됨)</th><th>상세 페이지 (이 시안)</th></tr></thead><tbody>
<tr><td><b>언제</b></td><td>목록·보드를 훑으며 한 건씩 빠르게</td><td>한 건을 붙잡고 끝까지 — 통화 후 기록, 견적 전 정리, 인수인계</td></tr>
<tr><td><b>수정</b></td><td>단계·가능성·우선순위·담당·다음 액션</td><td>모든 칸 (회사·문의자·유입·문의 내용·메모·주제 태그·고객사 연결)</td></tr>
<tr><td><b>기록</b></td><td><b>상세와 같은 기록 칸</b>(유형·내용·다음 액션) + 최근 6건</td><td>같은 기록 칸 + 전체 타임라인 · 수정·삭제 · 단계·담당·다음 액션 변경도 같은 줄에</td></tr>
<tr><td><b>더 있는 것</b></td><td>—</td><td>단계 진행줄(단계별 머문 일수) · 변경 이력 · 유입 경로(첫 방문·레퍼러·UTM·랜딩) · 견적·매출(고객사 연결 시) · VoC · 이전/다음 리드</td></tr></tbody></table>'''
SEC = f'''<section id="m-lead">{CSS}<h2>세일즈 — 리드 상세 페이지 (시안 · 결정 대기, 2026-10-21 실데이터 1건, 문의자 가림)</h2>
<p class="rule">지금 상세 페이지는 3칸(정보 4 · 타임라인 5 · VoC·바로가기 3)에 "수정" 버튼으로 전체 편집. 드로어가 생겨 <b>역할을 나눠야</b> 함.</p>{ROLE}
<div class="dec"><h3>기록은 한 곳으로 (10/21 피드백: "드로어에 쓴 액션이 상세에 안 들어옴 · 두 번 일함")</h3><ol>
<li><b>원인</b>: 드로어의 "다음 액션"은 리드의 칸 하나(할 일)일 뿐 활동 기록이 아님. 그래서 상세 타임라인에 안 남고, 통화 내용은 상세에서 또 적어야 함</li>
<li><b>안</b>: 드로어·상세가 <b>같은 기록 칸</b>을 씀 — 유형(전화 발신·수신·이메일·미팅·견적·메모) + 내용 + 다음 액션(선택). 한 번 기록하면 ① 타임라인에 활동 ② 다음 액션 갱신 ③ 대시보드 "이번 주 액션"까지 끝</li>
<li><b>다음 액션도 타임라인에</b>: 정하거나 바꾸거나 완료할 때마다 한 줄(주황 점). 기록할 때 "지금 다음 액션 완료로"가 기본 체크</li>
<li>다음 액션만 바꾸고 싶을 땐 정보 패널의 칸을 눌러 바로 수정 (이것도 타임라인에 남음)</li></ol></div>
<div class="cmp"><div><h4>데이터로 본 것</h4><ul><li>활동 기록 376건 / 리드 1,291 — 리드당 중앙값 1건, 214건이 전화 발신</li><li>→ 기록이 귀찮지 않게 <b>입력칸을 맨 위</b>에, 유형 한 번 누르고 바로 Enter</li><li>단계 변경 이력 1,167건은 있음 → 단계별 머문 일수 계산 가능</li><li>고객사 연결 480건, 견적서와 리드 연결은 아직 0 (견적서 연동 때)</li><li>첫 방문·레퍼러·UTM 이 리드에 저장돼 있으나 화면에 안 보임</li></ul></div>
<div><h4>배치 안</h4><ul><li><b>A (추천)</b> 왼쪽 활동 · 오른쪽 정보 — 영업이 이 화면에서 하는 일은 대부분 "기록하고 읽기"</li><li><b>B</b> 왼쪽 정보 · 오른쪽 타임라인 — 고객사 상세(크기는 왼쪽, 순서는 오른쪽)와 같은 방향</li><li><b>C</b> 지금 3칸 유지, 디자인만 교체</li></ul></div>
<div><h4>정해 주실 것</h4><ul><li>배치 A(추천) / B / C</li><li>수정: 칸마다 바로 수정(추천) / 지금처럼 "수정" 버튼</li><li>단계 진행줄(추천) / 단계 선택 칸만</li><li>이전·다음 리드 이동 — 리스트 필터·정렬 그대로(추천)</li><li>기록 칸 통합(위 안) — 드로어에서 "다음 액션" 단독 칸은 없앰</li><li><b>"예정" 단계의 뜻</b> — 도입 예정(계약 직전)인지, 나중에 다시 연락할 보류인지</li></ul></div></div>
<div class="fwrap">{FD}</div></section>'''
open('lead_detail_sec.html', 'w', encoding='utf-8').write(SEC)
print('lead detail section', len(SEC))
