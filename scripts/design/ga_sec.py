# GA·UTM 설정 기준 (마케팅팀용) v2 — 10/21 마케팅팀 검토 반영. reorganize.py 가 5. 데이터 기준에 붙인다
import html as _h
esc = lambda x: _h.escape(str(x))
UTM = [
 ('광고', '네이버 검색광고', 'nads', 'cpc', '캠페인명 (260401_NA_…)', '대행사 URL 교체 전까지 지금 값 NAds / keywords / N_smart·N_video·N_ai 도 광고 › 네이버로 읽음(변환 유지). 교체 시점은 국장'),
 ('광고', '구글 광고', 'gads', 'cpc', '캠페인명', '구글 애즈 자동 태깅(gclid) 켜 두기'),
 ('광고', '메타(페북·인스타 광고)', 'meta', 'paid_social', '캠페인명', ''),
 ('소셜', '유튜브 설명란·고정댓글', 'youtube', 'social', '영상 주제', '기존 LH 설명회 영상 2개는 그대로. 11월 늘봄 설명회 영상부터'),
 ('소셜', '링크드인·인스타 프로필/게시물', 'linkedin · instagram', 'social', '게시물 주제', ''),
 ('소셜', '카카오 채널·알림톡', 'kakao', 'social · message', '메시지 주제', ''),
 ('자사 채널', '회사 홈페이지(ai-con.co.kr) 링크', 'aicon_home', 'owned', '', '지금은 레퍼러로 자동 분류됨'),
 ('자사 채널', '건설포털(contech.ai.kr) 링크', 'contech_portal', 'owned', '', ''),
 ('자사 블로그', '네이버·티스토리 글의 문의 배너', 'naver_blog · tistory', 'contact_banner', '글 주제', '지금 규칙 그대로'),
 ('외주 블로그', '팀부스터 원고 링크', 'teambooster', 'blog_outsource', '월 (예 2610)', 'boosterlink.kr 레퍼러도 팀부스터'),
 ('외주 블로그', '인플루언서 글 링크', 'influencer_{블로그ID}', 'blog_outsource', '', ''),
 ('언론·뉴스', '보도자료 본문 링크', 'press', 'pr', '보도 주제', '언론사 구분은 레퍼러로 (검토 #12)'),
 ('직접 연락', '이메일 뉴스레터(신설 시)', 'newsletter', 'email', '발송일 (예 261021)', 'stibee 레퍼러도 이메일로'),
 ('직접 연락', '영업 메일·제안서 PDF 링크', 'sales_mail · proposal', 'email · document', '', '고객사 사내 메일 유입과 구분'),
 ('직접 연락', '전시·행사 QR', 'event_{행사}', 'offline', '행사명 (예 event_smartcon2611)', '11월 스마트건설엑스포 부스 QR부터'),
 ('직접 연락', '명함·리플릿 QR', 'print_{종류} (예 print_namecard)', 'offline', '—', 'QR 원본 URL은 텍스트로 함께 관리 (9/6 고정값)'),
 ('—', '카스웍스 블로그·페이지 내부 링크', '(UTM 없음)', '', '', '내부 링크에 UTM 을 달면 세션이 끊기고 자기 유입이 됨 (검토 #6). 흐름은 방문자 여정으로'),
 ('—', '테스트 접속', 'test', 'test', '—', 'CRM 동기화에서 버림. 시크릿 창 + ?utm_source=test'),
]
rows = ''.join(f'<tr><td><b>{esc(g)}</b></td><td>{esc(w)}</td><td><code>{esc(s)}</code></td><td><code>{esc(m)}</code></td><td>{esc(c)}</td><td class="muted">{esc(n)}</td></tr>' for g, w, s, m, c, n in UTM)
EV = [
 ('문의클릭', 'inquiry_click', '4,405', '/contact', '주요 이벤트. 이름 바꾸면 2월부터 쌓인 이력이 끊김 → 병행 발사 후 전환'),
 ('fin-contact', 'inquiry_submit', '120', '/contact (영문 3)', '<b>1~3월 월 30~40건 → 4월부터 월 1~2건</b>. 4월에 폼·트리거가 바뀌어 측정이 끊긴 것으로 보임 — GTM 트리거 점검 필요'),
 ('가입하기', 'sign_up', '1,778', 'app /users/sign-up 1,057 · www 홈 563 …', 'www 의 가입 버튼 클릭과 app 가입 페이지가 섞여 있음. 나눌지 결정 필요(sign_up_click / sign_up)'),
 ('전화클릭', 'phone_click', '33', 'tel: 링크', '끄지 말고 이름만 고정 (검토 #3)'),
 ('purchase', '— (주요 이벤트 해제)', '0', '—', '<b>GA4 가 기본으로 주요 이벤트에 넣어 두는 쇼핑몰 결제 이벤트</b>. 우리 사이트에선 한 번도 안 남 → 해제해도 영향 없음'),
 ('happytalk_btn', 'chat_click (선택)', '16', '해피톡 버튼', '자사 채널 › 해피톡과 짝'),
]
evrows = ''.join(f'<tr><td><code>{esc(a)}</code></td><td><code>{esc(b)}</code></td><td class="num">{c}</td><td class="muted">{esc(dd)}</td><td>{e}</td></tr>' for a, b, c, dd, e in EV)
AI = 'chatgpt.com · chat.openai.com(openai) · searchgpt · gemini.google.com · bard · perplexity.ai · claude.ai · copilot.microsoft.com · liner.com · felo.ai · vertexaisearch · wrtn · genspark · you.com · phind · gpt.* (대학 AI 포털 등)'
CHECK = [
 ('내부 트래픽 IP 교체', '<b>222.107.34.31 → 221.149.181.178</b> (국장 PC 10/21 확인, 엔조 작업 PC 출구 IP 도 같음). 관리 › 데이터 스트림 › 태그 설정 › 내부 트래픽 정의 수정 → 데이터 필터 "내부 트래픽" 활성 유지. 2월 이후 사무실 접속이 제외에서 빠져 있었을 수 있음. 재택·테더링은 제외 불가 → 테스트는 utm_source=test'),
 ('원치 않는 추천', 'caas.works · app.caas.works · accounts.google.com · 결제·로그인 도메인만. <b>miracleintip.com 은 넣지 않는다</b> (넣으면 UTM 없는 광고 클릭이 직접 유입으로 묻힘. UTM 있으면 UTM 우선, 없으면 광고 › 네이버 › 캠페인 미확인)'),
 ('크로스 도메인', 'www.caas.works ↔ app.caas.works 를 같은 방문으로 (가입 흐름이 끊기지 않게)'),
 ('전환 이벤트 이름 전환', '아래 대응표대로 ① CRM 변환표에 옛 → 새 이름 ② GTM 에서 새 이름을 함께 발사(병행) ③ 한 달 확인 후 옛 이벤트 중지'),
 ('데이터 보관 14개월', '관리 › 데이터 설정 › 데이터 보존'),
 ('연결', '구글 애즈 · 서치 콘솔. 네이버 광고는 UTM(nads/cpc)'),
 ('맞춤 채널 그룹 (선택)', 'GA4 채널 그룹에 "카스웍스 11 분류"를 위 source/medium 규칙으로 정의'),
]
checks = ''.join(f'<li><b>{esc(k)}</b> — {v}</li>' for k, v in CHECK)
S['ga-setup'] = f'''<section id="ga-setup"><h2>GA·UTM 설정 기준 (마케팅팀용, 10/21 팀 검토 반영)</h2>
<p class="rule">목적: 링크마다 <b>utm_source / utm_medium</b>을 아래 표대로 달면 CRM 유입 성과가 <b>유입 분류 11</b>로 자동 분류된다. UTM 이 없으면 레퍼러로 추정하고, 모르는 곳은 <b>미분류</b>에 사이트 주소째 남는다 — 마케팅팀 월 점검(네이버 통계 업로드 날)에 미분류 점검을 함께 한다.</p>
<p class="rule"><b>표기 규칙</b>: 영문 소문자 · 띄어쓰기 대신 <code>_</code> · 캠페인 <code>YYMMDD_채널_주제</code>. 예) <code>https://www.caas.works/?utm_source=newsletter&amp;utm_medium=email&amp;utm_campaign=261021</code></p>
<div class="wrap"><table class="ds fixed log"><colgroup><col style="width:10%"><col style="width:20%"><col style="width:18%"><col style="width:12%"><col style="width:16%"><col style="width:24%"></colgroup>
<thead><tr><th>분류</th><th>어디에 다는 링크</th><th>utm_source</th><th>utm_medium</th><th>utm_campaign</th><th>메모</th></tr></thead><tbody>{rows}</tbody></table></div>

<p class="rule" style="margin-top:16px"><b>전환 이벤트 대응표</b> — GA4 실측(2026-01-01 ~ 10-21, GTM-M9NKT756 / G-F8HHBWRT6G)</p>
<div class="wrap"><table class="ds fixed log"><colgroup><col style="width:13%"><col style="width:17%"><col style="width:8%"><col style="width:20%"><col style="width:42%"></colgroup>
<thead><tr><th>지금 이름</th><th>새 이름</th><th>올해 건수</th><th>발생 위치</th><th>메모</th></tr></thead><tbody>{evrows}</tbody></table></div>

<p class="rule" style="margin-top:16px"><b>생성형 AI 로 보는 도메인</b> (CRM 동기화 규칙과 같음, "AI 인용" KPI 분모): {esc(AI)}. <span class="muted">bing.com/chat 은 레퍼러가 bing.com 으로만 와서 검색 › 빙과 구분 불가.</span></p>
<p class="rule"><b>같은 "AI" 숫자가 다른 이유</b>: 방문자 여정의 "AI Assistant 65"는 GA4 기본 채널 그룹의 <b>세션</b> 수, 채널별 생애 가치의 "생성형 AI 7곳"은 유입 채널이 생성형 AI 로 적힌 <b>리드(회사)</b> 수. 단위가 다르다. 유입 성과의 생성형 AI 는 위 도메인 목록으로 센 세션이다.</p>
<p class="rule"><b>구분할 수 없는 것</b>: 네이버 AI 브리핑·AI탭 클릭은 레퍼러가 search.naver.com 이라 일반 검색과 <b>분리 불가</b> — 네이버 메이트(AI 인용 보상) 지표가 열리면 그쪽에서 본다.</p>
<p class="rule"><b>GA 밖에서 들어오는 데이터</b>: 네이버 블로그 조회·체류는 네이버 통계 엑셀(월 1회 업로드, 콘텐츠 성과 › 네이버), 네이버 광고 노출·클릭은 대행사 API·보고서(유입 성과 › 광고). 이 둘은 UTM 규칙과 별개로 CRM 에 들어온다.</p>

<p class="rule" style="margin-top:16px"><b>GA4 설정 체크리스트</b></p><ol class="rule" style="max-width:none">{checks}</ol>
<p class="rule"><b>역할</b>: 엔조 — CRM 변환표(옛 UTM·옛 이벤트), 동기화 규칙, 생성형 AI 목록 / GA4·GTM 편집 권한이 있는 사람(국장 또는 오팀장) — 내부 IP 교체·추천 제외·크로스 도메인·이벤트 병행 발사 (엔조는 GA 읽기 권한만 있음) / 대행사 — 네이버 광고 URL UTM 교체 / 마케팅팀 — 표대로 UTM 부여, 발행 전 체크(내부 링크 UTM 금지·추적 파라미터 0건), 월 1회 미분류 점검</p></section>'''
