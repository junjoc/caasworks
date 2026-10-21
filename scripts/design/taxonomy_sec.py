# 유입 분류 11 섹션 — assemble.py 에서 exec
TAX = [('광고', '네이버 / 구글 / 메타 / 기타', '유료 광고. miracleintip(대행사 중복체크) → 네이버 › 캠페인 미확인. NAds·GAds 는 광고 행 GA 와 중복이라 동기화 제외'),
 ('소셜', '유튜브 / 인스타그램 / 페이스북 / 링크드인 / 카카오 / 기타', ''), ('검색', '네이버 / 구글 / 다음 / 빙 / 기타', '오가닉 + 검색 결과 페이지 레퍼러(m.search.naver 등)'),
 ('자사 채널', '홈페이지 / 회사 홈페이지 / 건설포털 / 깃북 / 해피톡 / 기타', '홈페이지 = caas.works 브랜드 페이지, 회사 홈페이지 = ai-con.co.kr, 건설포털 = contech.ai.kr'), ('직접 연락', '대표전화 / 개인전화 / 이메일 / 추천 / 행사 / 기타', '경로를 모를 때. GA 에는 안 잡히고 리드에만 있음'),
 ('자사 블로그', '카스웍스 블로그 / 네이버 / 티스토리 / 기타', '"tistory·naver_blog / contact_banner" = 우리 글. blog.naver.com/caasworks'),
 ('외주 블로그', '팀부스터 / 인플루언서 / 기타', 'blog.naver.com(우리·인플루언서 ID 외 99%)·boosterlink.kr = 팀부스터'),
 ('생성형 AI', 'ChatGPT / Gemini / Claude / Perplexity / Copilot / 기타', 'Liner·Felo 등 AI 검색 포함'), ('외부 글', '네이버 / 티스토리 / 브런치 / 나무위키 / 기타', '남이 쓴 글. contact_banner 없는 티스토리, 나무위키'),
 ('언론·뉴스', '네이버 뉴스 / 다음 뉴스 / 언론사 / 기타', 'MSN 첫 화면 뉴스 포함'), ('커뮤니티', '네이버 카페 / 다음 카페 / 기타', ''),
 ('미분류', '사이트 주소 그대로', '고객사 사내 메일·공유 문서·메신저 등. 한 달에 한 번 보고 반복되는 곳은 1~11 로 옮김')]
COL = {'광고': 'var(--accent)', '외주 블로그': 'var(--warn)', '자사 채널': 'var(--ok)', '자사 블로그': 'var(--ok)', '검색': 'var(--info)', '생성형 AI': 'var(--info)', '소셜': 'var(--bad)', '언론·뉴스': 'var(--fg-2)', '외부 글': 'var(--fg-3)', '커뮤니티': 'var(--na)', '직접 연락': 'var(--fg)', '미분류': 'var(--line)'}
tax_rows = ''.join(f'<tr><td class="c">{i+1}</td><td style="box-shadow:inset 4px 0 0 {COL[g]};padding-left:14px"><b>{esc(g)}</b></td><td>{esc(s)}</td><td class="muted">{esc(n)}</td></tr>' for i, (g, s, n) in enumerate(TAX))
TAX_SEC = f'''<section id="inflow"><h2>유입 분류 11 + 미분류 (2026-10-21 확정, 순서 = 화면 순서)</h2>
<p class="rule">왼쪽 색 줄 = 분류 색(디자인 정의 12색을 성격별로): <b>돈 쓰는 곳</b> 광고 accent·외주 블로그 warn / <b>우리 것</b> 자사 채널·자사 블로그 ok / <b>찾아온 것</b> 검색·생성형 AI info / <b>남이 퍼뜨린 것</b> 소셜 bad·언론 fg-2·외부 글 fg-3·커뮤니티 na / <b>사람</b> 직접 연락 fg / 미분류 line. 리드와 GA 유입을 같은 분류로 본다. <b>모든 대분류 끝에 기타</b>를 두고, 기타는 이름과 링크를 직접 넣을 수 있게 한다. 원칙: <b>"어떻게 알게 됐나"(유입 경로)를 먼저</b>, 경로를 모를 때만 "직접 연락". 예) 대표전화 + 검색채널 → 검색, 대표전화 + 경로 없음 → 직접 연락 › 대표전화.</p>
<div class="wrap"><table class="ds fixed log"><colgroup><col style="width:5%"><col style="width:13%"><col style="width:42%"><col style="width:40%"></colgroup><thead><tr><th>#</th><th>대분류</th><th>세부</th><th>메모</th></tr></thead><tbody>{tax_rows}</tbody></table></div>
<p class="note">적용 단계: ① 변환표(src/lib/inflow-taxonomy.ts)로 저장값을 읽어 분석에 표시 — <b>적용됨</b>(채널별 생애 가치·전환 소요 기간) ② GA 동기화 규칙을 11 분류로 + 미분류 사이트 버리지 않기 + 과거 재동기화 — 다음 ③ 리드 입력을 "유입 경로 + 문의 수단" 두 칸으로, 기타는 이름·링크 입력 — 다음 ④ 설정 › 유입 분류(미분류 사이트 지정) — 다음</p></section>'''
lay = lay.replace('<section id="list">', TAX_SEC + '<section id="list">', 1)
