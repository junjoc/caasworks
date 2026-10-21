# 세일즈 › 새 리드 등록 (드로어 480) 시안 → newlead_sec.html (2026-10-21)
GROUPS = ['광고', '소셜', '검색', '자사 채널', '직접 연락', '자사 블로그', '외주 블로그', '생성형 AI', '외부 글', '언론·뉴스', '커뮤니티']
def chips(items, on=None, cls=''):
    return '<div class="nchips ' + cls + '">' + ''.join(f'<span class="{"on" if x == on else ""}">{x}</span>' for x in items) + '</div>'
def fld(label, val='', ph=False, req=False, w=''):
    return f'<div class="nf {w}"><label>{label}{"<b>*</b>" if req else ""}</label><span class="ni {"ph" if ph else ""}">{val}</span></div>'
FORM = f'''<div class="ndr"><div class="ndh"><b>새 리드</b><span class="muted">Esc 닫기</span></div><div class="ndb">
<div class="nsec">회사</div>
{fld('회사명', '원하건', req=True)}
<div class="dup">비슷한 이름이 있습니다 — <b>원하건설 주식회사</b> <span class="st ok">도입완료</span> 리드 1 · 고객 <span class="lk">열기 →</span> <span class="muted">· 그래도 새로 등록</span></div>
<div class="nrow"><div class="nf"><label>발주</label>{chips(['공공', '민간'], '민간', 'sm')}</div>{fld('사업분류', '종합건설사')}</div>
<div class="nsec">문의자</div>
<div class="nrow">{fld('이름', '김○○')}{fld('직급', '과장')}</div>
<div class="nrow">{fld('연락처', '010-····-····')}{fld('이메일', 'name@company.com', ph=True)}</div>
<div class="nsec">유입 — 두 가지를 따로 <span class="muted">(지금 "대표전화 / 검색채널" 처럼 섞여 있던 것)</span></div>
<label class="nl">어떻게 연락했나 (문의 수단)</label>
{chips(['홈페이지 문의', '대표전화', '개인전화', '이메일', '해피톡', '행사', '기타'], '대표전화')}
<label class="nl">어떻게 알게 됐나 (유입 경로) <span class="muted">— 물어보고 고름, 모르면 "모름"</span></label>
{chips(GROUPS + ['모름'], '검색')}
{chips(['네이버', '구글', '다음', '빙', '기타'], '네이버', 'sub')}
<div class="hint">→ 저장: 유입 분류 <b>검색 › 네이버</b> · 문의 수단 대표전화 (유입 성과·코호트에 그대로)</div>
<div class="nrow">{fld('유입일', '2026-10-21')}{fld('관심 서비스', '선택', ph=True)}</div>
<div class="nsec">문의 내용</div>
<div class="nta">통화 내용·요청 사항</div>
<div class="nsec">진행</div>
<div class="nrow">{fld('담당', '전성환 (나)')}{fld('다음 액션', '견적서 발송 · 10.23', ph=False)}</div>
<div class="more">+ 더 입력 — 고객사 코드(비우면 자동) · 우선순위(기본 중간) · 핵심 니즈 · 메모</div>
</div><div class="ndf"><span class="btn sm quiet">취소</span><span class="sp"></span><span class="btn sm">등록하고 하나 더</span><span class="btn sm primary">등록</span></div></div>'''
ETC = f'''<div class="ndr mini"><div class="ndb"><label class="nl">유입 경로에서 "기타"를 고르면</label>
{chips(['카스웍스 블로그', '네이버', '티스토리', '기타'], '기타', 'sub')}
<div class="nrow">{fld('어디서', '건설 현장 카페 글', ph=False)}{fld('링크', 'https://…', ph=True)}</div>
<div class="hint">→ 저장: 자사 블로그 › 기타 "건설 현장 카페 글" + 링크. 같은 이름이 반복되면 설정 › 유입 분류에서 세부로 올림</div></div></div>'''
CSS = '''<style>
.npair{display:flex;gap:24px;flex-wrap:wrap;align-items:flex-start;margin:10px 0 18px}
.ndr{width:480px;border:1px solid var(--line);border-radius:8px;background:var(--bg);font-size:12.5px;box-shadow:0 8px 24px rgba(0,0,0,.08)}.ndr.mini{box-shadow:none}
.ndh{display:flex;justify-content:space-between;align-items:center;padding:12px 16px;border-bottom:1px solid var(--line)}.ndh b{font-size:15px}
.ndb{padding:10px 16px 14px}.ndf{display:flex;gap:6px;padding:10px 16px;border-top:1px solid var(--line)}.ndf .sp{flex:1}
.nsec{font-size:12px;font-weight:600;color:var(--fg-2);margin:12px 0 6px}.nsec:first-child{margin-top:0}.nsec .muted{font-weight:400}
.nrow{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:6px}.nrow2{margin-top:6px}
.nf label,.nl{display:block;font-size:12px;color:var(--fg-2);margin:0 0 3px}.nl{margin-top:8px}.nf label b{color:var(--bad);margin-left:2px}
.ni{display:block;height:30px;line-height:28px;white-space:nowrap;overflow:hidden;box-sizing:border-box;padding:0 9px;border:1px solid var(--line);border-radius:6px;color:var(--fg)}.ni.ph{color:var(--fg-3)}
.nta{height:54px;padding:6px 9px;border:1px solid var(--line);border-radius:6px;color:var(--fg-3)}
.nchips{display:flex;flex-wrap:wrap;gap:4px}.nchips span{height:26px;line-height:24px;padding:0 9px;border:1px solid var(--line);border-radius:13px;font-size:12px;color:var(--fg-2)}.nchips .on{background:var(--fg);border-color:var(--fg);color:var(--bg)}
.nchips.sub{margin-top:6px;padding-left:10px;border-left:2px solid var(--line)}.nchips.sub .on{background:var(--accent);border-color:var(--accent);color:#fff}.nchips.sm span{height:24px;line-height:22px}
.dup{margin-top:6px;padding:7px 9px;border-radius:6px;background:color-mix(in srgb,var(--warn) 12%,var(--bg));font-size:12px}.dup .st{height:18px;line-height:18px;min-width:auto;font-size:11px}
.hint{margin-top:6px;font-size:12px;color:var(--fg-2)}.more{margin-top:12px;font-size:12px;color:var(--accent)}.lk{color:var(--accent)}
</style>'''
SEC = f'''<section id="m-newlead">{CSS}<h2>세일즈 — 새 리드 등록 (시안 · 결정 대기, 2026-10-21)</h2>
<p class="rule">지금은 별도 페이지(/pipeline/new, 칸 19개 한 화면). 리스트·보드의 "+ 새 리드"에서 <b>480 드로어</b>로 열고, 등록하면 그 리드 드로어가 바로 열려 첫 통화를 기록.</p>
<div class="cmp"><div><h4>데이터로 본 것 (2026년 리드 1,291)</h4><ul><li>손으로 입력 991 · 홈페이지 문의 자동(Slack) 300</li><li>유입이 <b>"대표전화 / 검색채널"</b>처럼 문의 수단 + 알게 된 경로가 한 칸에 섞임 (대표전화 / 검색채널 70 · 대표전화 / 공식홈페이지 51 …)</li><li>관심 서비스 7% · 핵심 니즈 6% · 직급 41% 만 채워짐, 우선순위는 99% "중간"</li></ul></div>
<div><h4>바뀌는 것</h4><ul><li>유입을 <b>두 줄로</b>: 문의 수단(어떻게 연락) + 유입 경로(어떻게 알게 됨, 유입 분류 11 › 세부, 모르면 "모름")</li><li>기타는 이름 + 링크</li><li>회사명 입력 중 <b>비슷한 리드·고객 표시</b> (같은 회사 중복 등록 방지)</li><li>잘 안 쓰는 칸(코드·우선순위·핵심 니즈·메모)은 "더 입력"</li><li>담당 기본 = 나, 유입일 기본 = 오늘</li></ul></div>
<div><h4>정해 주실 것</h4><ul><li>드로어(추천) / 지금처럼 페이지</li><li>유입 두 줄 (추천)</li><li>"더 입력"으로 숨길 칸</li><li>등록 뒤: 그 리드 드로어 열기(추천) / 목록으로</li></ul></div></div>
<div class="npair"><div>{FORM}</div><div>{ETC}</div></div>
<p class="rule" style="color:var(--fg-3)">저장 방식: 문의 수단 → inquiry_channel, 유입 경로 → inquiry_source("검색 › 네이버" 형태, 유입 분류 규칙이 그대로 읽음). DB 칸 추가 없음.</p></section>'''
open('newlead_sec.html', 'w', encoding='utf-8').write(SEC)
print('newlead', len(SEC))
