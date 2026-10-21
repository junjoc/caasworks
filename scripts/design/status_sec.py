# 화면별 적용 현황 + 칩 대비 대안 색상표 → status_sec.html, chipalt_sec.html (10/21 정리)
ROWS = [('대시보드', '대시보드', '대시보드', '✔ 적용', '프리셋 5 · API 1회 · 월별 매출 기준선'),
        ('마케팅', '캠페인 관리 · 유입 성과 · 콘텐츠 성과', '집계', '✔ 적용', '화면 머리 규칙 · 합계 맨 위 · 유입 분류 11 · 네이버 연도 열 펼치기(10/21)'),
        ('분석', '유입 코호트 · 전환 소요 · 채널별 생애 가치', '집계', '✔ 적용', '열 비율 고정 · 60vw 드로어'),
        ('분석', '마케팅 분석 · 방문자 여정 · 연간 비교 · 파이프라인 분석 외', '추이', '◐ 색·글자만', '유형 "추이" 추가(10/21) — 배치 교체는 2차'),
        ('세일즈', '리스트 · 보드', '목록 · 보드', '✔ 적용', '50행 서버 페이지 · 유입일 첫 열 · 선택 바 · 예정 순서 · 도입완료 펼침'),
        ('세일즈', '새 리드 등록', '드로어', '✔ v4 적용', '유입 일시 → ID · 연락처 이어받기 · 같은 회사 3갈래 · 현장/본사 팀 · 유입 두 줄'),
        ('세일즈', '리드 상세 · 드로어', '상세 · 드로어', '✔ v2 적용', '단계 줄 · 속성 줄 · 카드 · 기록 통합 · 언제 · 날짜별 타임라인'),
        ('세일즈', '견적서 · 모의계산 · 단가표', '목록 · 입력', '⏸ 대기', '견적서 → 매출 연동 때'),
        ('고객관리', '고객 목록', '목록 · 드로어', '✔ v2 적용', '9열 · 미납 탭 · 고객 드로어 · 메뉴 이름 "고객 목록"'),
        ('고객관리', '과금 고객 · 계약 관리 · 매출 현황 · 고객 상세', '목록 · 상세', '◐ 색·글자만', '같은 틀로 이어서'),
        ('재무', '청구/계산서 · 미납 · 납부 · 매입 · 손익', '집계 · 목록', '◐ 색·글자만', ''),
        ('운영', '현장 · 장비 · 카메라 · 협력사 발주 · 영상 · 재고 · 자산', '목록', '◐ 색·글자만', ''),
        ('VoC · 업무 · 설정', 'VoC · 오늘 할일 · 업무보고 · 설정 6', '목록', '◐ 색·글자만', '')]
tr = ''.join(f'<tr><td><b>{a}</b></td><td>{b}</td><td class="c">{c}</td><td class="c">{d}</td><td class="muted">{e}</td></tr>' for a, b, c, d, e in ROWS)
STATUS = f'''<section id="status"><h2>화면별 적용 현황 (2026-10-21 저녁)</h2><p class="rule">✔ = 화면 문법 v2 배치까지 · ◐ = 1차 일괄(옛 버튼·배지·카드·표·입력칸을 기준값으로)만, 배치는 예전 그대로 · ⏸ = 일부러 미룸</p>
<table class="ug"><colgroup><col style="width:12%"><col style="width:34%"><col style="width:12%"><col style="width:12%"><col style="width:30%"></colgroup><thead><tr><th>메뉴</th><th>화면</th><th>유형</th><th>상태</th><th>메모</th></tr></thead><tbody>{tr}</tbody></table></section>'''
open('status_sec.html', 'w', encoding='utf-8').write(STATUS)
CH = [('신규리드', '#E2445C', '#1D4ED8', ('#2563EB', '#FFFFFF')), ('진행', '#579BFC', '#1F5FBF', ('#E7F1FF', '#1F5FBF')), ('예정', '#FDAB3D', '#9A5B00', ('#FFF3E4', '#9A5B00')),
      ('도입완료', '#00C875', '#00753F', ('#DBF7EC', '#00753F')), ('이탈', '#C4C4C4', '#6B6B6B', ('#F2F2F2', '#6B6B6B')), ('미납·오류', '#E2445C', '#B4233A', ('#FBE5E8', '#B4233A'))]
RAT = {'#E2445C': '4.0', '#579BFC': '2.8', '#FDAB3D': '1.9', '#00C875': '2.2', '#C4C4C4': '1.7', '#1D4ED8': '6.7', '#1F5FBF': '6.1', '#9A5B00': '5.4', '#00753F': '5.8', '#6B6B6B': '5.3', '#B4233A': '6.5', '#2563EB': '5.2'}
CR = {'#E7F1FF': '5.3', '#FFF3E4': '5.0', '#DBF7EC': '5.1', '#F2F2F2': '5.0', '#FBE5E8': '5.4', '#2563EB': '5.2'}
def c(bg, fg='#FFFFFF', note=''): return f'<span class="st" style="background:{bg};color:{fg}">{note}</span>'
rows = ''.join(f'<tr><td><b>{n}</b></td><td class="c">{c(a, note=n if n != "진행" else "제안")}<div class="muted">{a} · {RAT[a]}:1</div></td><td class="c">{c(b, note=n if n != "진행" else "제안")}<div class="muted">{b} · {RAT[b]}:1</div></td><td class="c">{c(cc[0], cc[1], n if n != "진행" else "제안")}<div class="muted">{cc[0]} / {cc[1]} · {CR.get(cc[0], "")}:1</div></td></tr>' for n, a, b, cc in CH)
CHIPALT = f'''<section id="chip-alt"><h2>상태 칩 — 대비 대안 색상표 (보관, 2026-10-21 유실장 검토)</h2>
<p class="rule">흰 글자 12px 의 대비 기준은 4.5:1. 지금 칩은 예정 1.9 · 도입완료 2.2 · 진행 2.8 · 이탈 1.7. <b>결정: 지금 색 유지, 미납만 진한 빨강 #B4233A(6.5:1)</b>. 아래 B·C 는 나중에 바꿀 때 쓰려고 보관. 열 머리 3px 줄·막대는 지금 색 그대로.</p>
<table class="ug"><colgroup><col style="width:16%"><col style="width:28%"><col style="width:28%"><col style="width:28%"></colgroup><thead><tr><th>뜻</th><th>지금 (채움 · 흰 글자)</th><th>B. 채움, 한 단계 어둡게</th><th>C. 연한 바탕 + 진한 글자 (신규만 채움)</th></tr></thead><tbody>{rows}</tbody></table></section>'''
open('chipalt_sec.html', 'w', encoding='utf-8').write(CHIPALT)
print('ok')
