# 유입 분류 11 섹션 — assemble.py 에서 exec
TAX = [('검색', '네이버 / 구글 / 다음 / 빙 / 기타', '검색엔진 오가닉. 빙·다음이 지금 "기타"의 대부분'), ('생성형 AI', 'ChatGPT / Gemini / Claude / Perplexity / Copilot / 기타', 'AI 답변의 링크로 들어온 방문'),
 ('자사 채널', '홈페이지 / 깃북 / 해피톡 / 기타', '직접 방문·자사 사이트'), ('자사 블로그', '카스웍스 블로그 / 네이버 / 티스토리 / 기타', '카스웍스 블로그는 첫 방문 페이지 /blog 로 셈'),
 ('외주 블로그', '팀부스터 / 인플루언서 / 기타', '대행사 바이럴'), ('외부 글', '네이버 / 티스토리 / 브런치 / 기타', '남이 쓴 블로그·글'),
 ('언론·뉴스', '네이버 뉴스 / 다음 뉴스 / 언론사 / 기타', ''), ('커뮤니티', '네이버 카페 / 다음 카페 / 기타', ''),
 ('소셜', '유튜브 / 인스타그램 / 페이스북 / 링크드인 / 카카오 / 기타', ''), ('광고', '네이버 / 구글 / 메타 / 기타', '유료 광고 (쿠팡·스마트스토어 포함)'),
 ('직접 연락', '대표전화 / 개인전화 / 이메일 / 추천 / 행사 / 기타', '경로를 모를 때. GA 에는 안 잡히고 리드에만 있음')]
tax_rows = ''.join(f'<tr><td class="c">{i+1}</td><td><b>{esc(g)}</b></td><td>{esc(s)}</td><td class="muted">{esc(n)}</td></tr>' for i, (g, s, n) in enumerate(TAX))
TAX_SEC = f'''<section id="inflow"><h2>유입 분류 11 (2026-10-21 확정)</h2>
<p class="rule">리드와 GA 유입을 같은 분류로 본다. <b>모든 대분류 끝에 기타</b>를 두고, 기타는 이름과 링크를 직접 넣을 수 있게 한다. 원칙: <b>"어떻게 알게 됐나"(유입 경로)를 먼저</b>, 경로를 모를 때만 "직접 연락". 예) 대표전화 + 검색채널 → 검색, 대표전화 + 경로 없음 → 직접 연락 › 대표전화.</p>
<div class="wrap"><table class="ds fixed log"><colgroup><col style="width:5%"><col style="width:13%"><col style="width:42%"><col style="width:40%"></colgroup><thead><tr><th>#</th><th>대분류</th><th>세부</th><th>메모</th></tr></thead><tbody>{tax_rows}</tbody></table></div>
<p class="note">적용 단계: ① 변환표(src/lib/inflow-taxonomy.ts)로 저장값을 읽어 분석에 표시 — <b>적용됨</b>(채널별 생애 가치·전환 소요 기간) ② GA 동기화 규칙을 11 분류로 + 미분류 사이트 버리지 않기 + 과거 재동기화 — 다음 ③ 리드 입력을 "유입 경로 + 문의 수단" 두 칸으로, 기타는 이름·링크 입력 — 다음 ④ 설정 › 유입 분류(미분류 사이트 지정) — 다음</p></section>'''
lay = lay.replace('<section id="list">', TAX_SEC + '<section id="list">', 1)
