# 화면 문법 v2 — 통일성 (10/21 피드백 "맥락 없이 따로 논다") → unify_sec.html
B = {  # 부품 → 색 (와이어프레임 칸 색)
 'top': ('이름줄·툴바', 'var(--fg-2)'), 'kpi': ('숫자줄', 'var(--warn)'), 'tbl': ('표', 'var(--info)'), 'prop': ('속성 줄', 'var(--accent)'),
 'card': ('카드', 'var(--ok)'), 'tl': ('기록·타임라인', 'var(--bad)'), 'col': ('보드 열', 'var(--na)'), 'step': ('단계 줄', 'var(--accent)'),
}
def blk(k, h, flex='', label=None):
    n, c = B[k]
    return f'<div class="wb" style="height:{h}px;{flex};border-color:{c};background:color-mix(in srgb,{c} 10%,var(--bg))"><span style="color:{c}">{label or n}</span></div>'
def wf(title, inner, note):
    return f'<div class="wf"><h4>{title}</h4><div class="wfbox">{inner}</div><p>{note}</p></div>'
row = lambda *x: '<div class="wr">' + ''.join(x) + '</div>'
WF = (wf('목록', blk('top', 26) + blk('kpi', 30) + blk('tbl', 150), '리드 리스트 · 고객 목록 · 청구')
      + wf('집계', blk('top', 26) + blk('kpi', 30) + blk('tbl', 150, label='표 (합계 맨 위)'), '유입 성과 · 캠페인 · 코호트')
      + wf('상세', blk('top', 26) + blk('step', 14) + blk('prop', 30) + row(blk('tl', 120, 'flex:2'), blk('card', 120, 'flex:1')), '리드 · 고객사 · 현장 · 견적서')
      + wf('드로어 = 상세 축소판', blk('top', 26) + blk('step', 14) + blk('prop', 30, label='속성 칩') + blk('card', 40) + blk('tl', 76), '목록·보드에서 한 건 열기')
      + wf('보드', blk('top', 26) + row(*[blk('col', 180, 'flex:1', ' ') for _ in range(5)]), '세일즈 보드')
      + wf('추이 (10/21 추가)', blk('top', 26) + blk('kpi', 30) + blk('card', 90, label='추이 차트 (카드)') + row(blk('tbl', 84, 'flex:2', '표'), blk('card', 84, 'flex:1', '목록 5줄 카드')), '마케팅 분석 · 방문자 여정 · 연간 비교 · 파이프라인 분석 · 콘텐츠 네이버 탭')
      + wf('대시보드', blk('top', 26) + blk('kpi', 30) + row(blk('card', 72, 'flex:2', '카드 (그래프)'), blk('card', 72, 'flex:1')) + row(blk('card', 72, 'flex:1'), blk('card', 72, 'flex:1')), '프리셋 5'))
PARTS = [('이름줄·툴바', '모든 화면', '제목은 헤더에만. 상세는 이름 20 + 상태 칩 + 메타 한 줄', 'PageHeader(옛) · 화면마다 직접 만든 머리'),
         ('숫자줄', '목록 · 집계 · 대시보드', '상세에는 쓰지 않음 (한 건엔 속성 줄)', '상세에 "D+0 · 0일째" 숫자줄'),
         ('표', '목록 · 집계', '머리 가운데 · 숫자 오른쪽 · 세로선 · 합계 맨 위', '옛 표(data-table) 27화면'),
         ('상태 칩', '어디서나 같은 크기·색', '최소 64, 13색만. 미납·연체는 진한 빨강 #B4233A(due)', '옛 Badge 37화면 (1차 일괄로 같은 틀)'),
         ('단계 줄', '상세 · 드로어', '한 모양 (상세는 칸, 드로어는 같은 칸의 얇은 판)', '상세 버튼 줄 · 시안 화살표 · 드로어 없음'),
         ('속성 줄 / 칩', '상세 · 드로어', '자주 바꾸는 5개, 누르면 그 자리에서 선택', '드로어 넓은 선택 칸 · 상세 정보 패널 줄'),
         ('카드', '상세 오른쪽 · 대시보드 · 드로어', '제목 13/600 + "수정", 값 있는 칸만, 빈 칸은 한 줄', '옛 card 56화면 (그림자·여백 제각각)'),
         ('기록 칸 · 타임라인', '상세 · 드로어 · (고객사 상세)', '날짜 묶음, 활동 크게 · 변경은 접음', '날짜 묶음 없음'),
         ('버튼', '어디서나', '4종 × 2크기 (DsButton)', '옛 Button 47화면'),
         ('드로어', '목록 · 보드 · 집계 드릴다운', '480 = 한 건 / 60vw = 집계 세부', '—')]
ptab = ''.join(f'<tr><td><b>{a}</b></td><td>{b}</td><td>{c}</td><td class="muted">{d}</td></tr>' for a, b, c, d in PARTS)
TOK = [('글자', '20 이름 · 15 드로어 이름 · 14 섹션 · 13 본문·카드 제목 · 12.5 표·칸 · 12 라벨·보조·캡션 (Pretendard Variable)', '12 미만 금지 (10/21 유실장 검토)'),
       ('간격', '4 · 8 · 12 · 16 · 20', '카드 안 12, 카드 사이 10, 묶음 사이 16~20'),
       ('모서리', '6 = 입력·버튼·칩 / 8 = 카드·드로어 / 13 = 둥근 칩', ''),
       ('선', '1px #E5E5E8 바깥 · #F0F0F2 안쪽', '그림자는 떠 있는 것(드로어·메뉴)만'),
       ('색', '13색 (10/21 미납 due 추가), 단계 5색은 어디서나 같은 뜻', '파랑 = 진행 · 초록 = 도입 · 주황 = 예정/곧 · 빨강 = 신규/지남 · 회색 = 이탈/없음'),
       ('경과', '+n일 (오늘) · n일 남음 · n일 지남 · n일 전', 'D+n · n일째 쓰지 않음'),
       ('기준 한 줄', '집계·추이 화면은 표 아래 회색 "기준 · …" 한 줄', 'ⓘ 툴팁은 캡처에 안 남음 (10/21 유실장 검토)')]
ttab = ''.join(f'<tr><td><b>{a}</b></td><td>{b}</td><td class="muted">{c}</td></tr>' for a, b, c in TOK)
CSS = '''<style>.wfs{display:grid;grid-template-columns:repeat(4,1fr);gap:16px;margin:10px 0 18px}.wf h4{margin:0 0 6px;font-size:13px}.wf p{margin:6px 0 0;font-size:12px;color:var(--fg-3)}.wfbox{border:1px solid var(--line);border-radius:8px;padding:8px;display:flex;flex-direction:column;gap:5px;height:270px}
.wb{border:1px solid;border-radius:5px;display:flex;align-items:center;justify-content:center;min-width:0}.wb span{font-size:11px;font-weight:500}.wr{display:flex;gap:5px}.ug{width:100%;border-collapse:collapse;font-size:12.5px;margin:8px 0 18px}.ug th,.ug td{border:1px solid var(--line);padding:6px 10px;text-align:left;vertical-align:top}.ug th{background:var(--bg-subtle);font-weight:500;text-align:center}</style>'''
SEC = f'''<section id="unify">{CSS}<h2>화면 문법 v2 — 통일성 (확정 · 적용 시작 2026-10-21)</h2>
<p class="rule">10/21 피드백: "맥락이 있어야 하는데 다 따로 논다". 지금 상태: <b>82화면 중 11화면만 새 부품</b>, 71화면은 옛 버튼·배지·카드·표. 새 11화면도 단계 줄·칩·카드·수정 칸을 화면마다 따로 만듦.
→ 화면을 하나씩 고치기 전에 <b>화면 유형 6개 × 부품 10개 × 기준값 6개</b>를 먼저 고정하고, 모든 화면을 이것만으로 다시 짠다.</p>
<h3 class="ph3">화면 유형 7 — 같은 부품, 같은 순서 (10/21 유실장 검토로 "추이" 추가: 주간 §0·월 보고에 추이 차트 필요, 자동 인사이트는 목록 5줄 카드)</h3><div class="wfs">{WF}</div>
<h3 class="ph3">부품 10 — 이것만 쓴다 (없으면 부품부터 만들고 이 표에 추가)</h3>
<table class="ug"><colgroup><col style="width:14%"><col style="width:20%"><col style="width:36%"><col style="width:30%"></colgroup><thead><tr><th>부품</th><th>쓰는 곳</th><th>규칙</th><th>지금 어긋난 곳</th></tr></thead><tbody>{ptab}</tbody></table>
<h3 class="ph3">기준값 7</h3><table class="ug"><colgroup><col style="width:12%"><col style="width:55%"><col style="width:33%"></colgroup><tbody>{ttab}</tbody></table>
<div class="cmp"><div><h4>순서 (제안)</h4><ul><li>① 이 문법 확정</li><li>② 부품 10개를 코드 한 곳(components/ds)에 정리 — 상세 v2 의 속성 줄·카드·단계 줄 포함</li><li>③ 리드 상세 · 드로어 v2 (아래 A안)</li><li>④ 나머지 71화면을 유형별로 일괄 교체: 목록 → 상세 → 대시보드 순</li><li>⑤ 화면마다 "어느 유형 · 어느 부품" 을 이 문서 4장에 표시</li></ul></div>
<div><h4>진행 (10/21)</h4><ul><li>✔ ① 확정 ("일단 해봅시다")</li><li>✔ ② 부품: components/ds/detail (단계 줄 · 속성 줄/칩 · 카드 · 떠 있는 창) + 선택 바 + lib/elapsed (경과 표기)</li><li>✔ ③ 리드 상세·드로어 v2 (A안)</li><li>◐ ④ 1차 일괄: 옛 버튼·배지·카드·숫자 카드·표·입력칸을 기준값으로 → 71화면 같은 글자·선·색. 화면별 배치 교체는 유형별로 이어서</li><li>추가 규칙: <b>선택 바는 화면 아래에 떠 있음</b> (고르면 표가 밀리지 않게)</li></ul></div></div></section>'''
open('unify_sec.html', 'w', encoding='utf-8').write(SEC)
print('unify', len(SEC))
