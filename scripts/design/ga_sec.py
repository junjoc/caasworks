# GA·UTM 설정 기준 (마케팅팀용) — reorganize.py 가 5. 데이터 기준에 붙인다
import html as _h
esc = lambda x: _h.escape(str(x))
UTM = [
 ('광고', '네이버 검색광고', 'nads', 'cpc', '캠페인명 그대로 (예 260401_NA_스마트안전장비)', '지금 NAds 사용 중 → medium=cpc 를 꼭 붙이기'),
 ('광고', '구글 광고', 'gads', 'cpc', '캠페인명', '구글 애즈 자동 태깅(gclid)도 켜 두기'),
 ('광고', '메타(페북·인스타 광고)', 'meta', 'paid_social', '캠페인명', ''),
 ('소셜', '유튜브 설명란·고정댓글', 'youtube', 'social', '영상 주제', ''),
 ('소셜', '링크드인·인스타 프로필/게시물', 'linkedin · instagram', 'social', '게시물 주제', ''),
 ('소셜', '카카오 채널·알림톡', 'kakao', 'social · message', '메시지 주제', ''),
 ('자사 채널', '회사 홈페이지(ai-con.co.kr) 링크', 'aicon_home', 'owned', '', '지금은 레퍼러로 자동 분류됨 — UTM 을 달면 더 정확'),
 ('자사 채널', '건설포털(contech.ai.kr) 링크', 'contech_portal', 'owned', '', ''),
 ('자사 블로그', '네이버·티스토리 글의 문의 배너', 'naver_blog · tistory', 'contact_banner', '글 주제', '지금 규칙 그대로 유지 (우리 글 표시)'),
 ('외주 블로그', '팀부스터 원고 링크', 'teambooster', 'blog_outsource', '월 (예 2610)', 'boosterlink.kr 레퍼러도 계속 팀부스터로 잡힘'),
 ('외주 블로그', '인플루언서 글 링크', 'influencer_{블로그ID}', 'blog_outsource', '', ''),
 ('언론·뉴스', '보도자료 본문 링크', '언론사 도메인 (예 cnews)', 'pr', '보도 주제', ''),
 ('직접 연락', '이메일 뉴스레터(스티비)', 'newsletter', 'email', '발송일 (예 261021)', 'stibee.com 레퍼러가 지금 미분류로 들어오는 중'),
 ('직접 연락', '영업 메일·제안서 PDF 링크', 'sales_mail · proposal', 'email · document', '고객사명 생략 가능', '고객사 사내 메일에서 넘어오는 유입을 구분'),
 ('직접 연락', '행사·박람회 QR', 'event_{행사명}', 'offline', '행사명 (예 kintex2610)', ''),
]
rows = ''.join(f'<tr><td><b>{esc(g)}</b></td><td>{esc(w)}</td><td><code>{esc(s)}</code></td><td><code>{esc(m)}</code></td><td>{esc(c)}</td><td class="muted">{esc(n)}</td></tr>' for g, w, s, m, c, n in UTM)
CHECK = [
 ('내부 트래픽 제외', '관리 › 데이터 스트림 › 태그 설정 › 내부 트래픽 정의에 사무실 IP 등록 → 데이터 필터 "내부 트래픽"을 테스트 → 활성으로. 개발용 localhost 도 제외 (CRM 은 이미 제외 중)'),
 ('원치 않는 참조 제외', '태그 설정 › 원치 않는 추천 목록에 caas.works · app.caas.works · accounts.google.com · 결제·로그인 도메인 추가 → 우리 사이트 사이 이동이 "유입"으로 잡히지 않게'),
 ('크로스 도메인', 'www.caas.works ↔ app.caas.works 를 같은 방문으로 이어 보기 (가입 흐름이 끊기지 않게)'),
 ('전환 이벤트 이름 고정', '문의 클릭 inquiry_click · 문의 제출 inquiry_submit · 가입 sign_up. 이름이 바뀌면 CRM 문의 클릭 숫자가 끊김'),
 ('데이터 보관 14개월', '관리 › 데이터 설정 › 데이터 보존 = 14개월 (CRM 재수집이 가능한 최대 기간)'),
 ('연결', '구글 애즈 · 서치 콘솔 연결. 네이버 광고는 UTM(nads/cpc)로'),
 ('맞춤 채널 그룹 (선택)', 'GA4 관리 › 채널 그룹에 "카스웍스 11 분류"를 만들어 위 표의 source/medium 규칙으로 정의하면 GA 화면에서도 CRM 과 같은 분류로 볼 수 있음'),
]
checks = ''.join(f'<li><b>{esc(k)}</b> — {esc(v)}</li>' for k, v in CHECK)
S['ga-setup'] = f'''<section id="ga-setup"><h2>GA·UTM 설정 기준 (마케팅팀용)</h2>
<p class="rule">목적: 링크마다 <b>utm_source / utm_medium</b>을 아래 표대로 달면 CRM 유입 성과가 <b>유입 분류 11</b>로 자동 분류된다. UTM 이 없으면 레퍼러(어디서 왔는지)로 추정하고, 모르는 곳은 <b>미분류</b>에 사이트 주소째 남는다 — 한 달에 한 번 미분류를 보고 반복되는 곳은 규칙에 추가한다.</p>
<p class="rule"><b>표기 규칙</b>: 영문 소문자 · 띄어쓰기 대신 <code>_</code> · 캠페인은 <code>YYMMDD_채널_주제</code>(지금 쓰는 260401_NA_… 형식). 예) <code>https://www.caas.works/?utm_source=newsletter&amp;utm_medium=email&amp;utm_campaign=261021</code></p>
<div class="wrap"><table class="ds fixed log"><colgroup><col style="width:11%"><col style="width:22%"><col style="width:17%"><col style="width:13%"><col style="width:17%"><col style="width:20%"></colgroup>
<thead><tr><th>분류</th><th>어디에 다는 링크</th><th>utm_source</th><th>utm_medium</th><th>utm_campaign</th><th>메모</th></tr></thead><tbody>{rows}</tbody></table></div>
<p class="rule" style="margin-top:14px"><b>GA4 설정 체크리스트</b></p><ol class="rule" style="max-width:none">{checks}</ol>
<p class="note">검색(네이버·구글·다음·빙)·생성형 AI(ChatGPT·Gemini 등)·뉴스·카페는 UTM 없이 GA 가 알려주는 출처로 자동 분류된다. 직접 방문(주소 입력·북마크)은 자사 채널 › 홈페이지.</p></section>'''
