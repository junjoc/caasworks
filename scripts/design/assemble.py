# 카스웍스 CRM 디자인 정의 — 한 페이지 조립: 기초 규칙(디자인 정의 v1) + 화면 유형(레이아웃 정의) + 메뉴별 시안, 왼쪽 목차
import re
exec(compile(open('gen_campaign.py', encoding='utf-8').read(), 'gen_campaign.py', 'exec'))
D = '/Users/david/Desktop/클로드/004_CRM 웹개발/caasworks/docs/design/'
lay = open(D + '레이아웃정의_v1.html', encoding='utf-8').read()
v1 = open(D + '디자인정의_v1.html', encoding='utf-8').read()

# 1) v1 CSS 를 #base 범위로 가둠 (전역 선택자는 버림)
css = v1[v1.index('<style>') + 7:v1.index('</style>')]
css = re.sub(r'/\*.*?\*/', '', css, flags=re.S)
css = re.sub(r'@media[^{]*\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}', '', css)
skip = re.compile(r'^\s*(:root|\*|body|\.wrap|nav|h1|\.lead|section|h2|\.rule)\b')
scoped = []
for sel, body in re.findall(r'([^{}]+)\{([^{}]*)\}', css):
    sel = sel.strip()
    if not sel or skip.match(sel): continue
    scoped.append(','.join('#base ' + s.strip() for s in sel.split(',')) + '{' + body + '}')
base_css = '\n'.join(scoped) + '\n#base .rule{color:var(--fg-2);margin:0 0 14px;max-width:76ch}#base .rule b{color:var(--fg);font-weight:500}'

# 2) v1 섹션 → id b-*, 번호 제거
base_secs = re.findall(r'<section id="([a-z]+)">(.*?)</section>', v1, re.S)
base_html = ''.join(f'<section id="b-{i}">' + re.sub(r'<h2>\d+\.\s*', '<h2>', body, 1) + '</section>' for i, body in base_secs)
# 클래스 충돌 정리: v1 의 .spec(작은 글씨) ↔ 레이아웃의 .spec(3칸 격자)
base_html = base_html.replace('class="spec"', 'class="bspec"').replace("class='spec'", "class='bspec'")
base_css = base_css.replace('#base .spec', '#base .bspec')
# 10/21 결정 반영: 신규리드 빨강 · 이탈 회색
base_html = base_html.replace('신규리드 <span class="st na">na</span>', '신규리드 <span class="st bad">bad</span>').replace('이탈 <span class="st bad">bad</span>', '이탈 <span class="st na">na</span> <span style="color:var(--fg-3)">(10/21 신규·이탈 맞바꿈)</span>')
base_titles = [(i, re.sub(r'^\d+\.\s*', '', re.search(r'<h2>([^<]*)</h2>', b).group(1)).split(' — ')[0]) for i, b in base_secs]

# 3) 레이아웃 문서 손질
lay = re.sub(r'<h2>\d+\.\s*', '<h2>', lay)
lay = lay.replace('.drawer{position:absolute', '.frame .drawer{position:absolute', 1)
lay = lay.replace('<title>CRM 레이아웃 정의</title>', '<title>카스웍스 CRM 디자인 정의</title>')
lay = re.sub(r'<h1 class="t">[^<]*</h1>', '<h1 class="t">카스웍스 CRM 디자인 정의</h1>', lay, 1)
lay = lay.replace('<p class="lead">디자인 정의 v1(색·글자·버튼·표)은 그대로 두고, 그 부품을 <b>어디에 얼마 크기로 놓는지</b>와 <b>데이터를 어떤 순서로 배열하고 몇 번에 불러오는지</b>를 정한다.',
                  '<p class="lead">CRM 화면의 모든 디자인 결정을 한 곳에 둔다. <b>전역 디자인</b>(기초 부품 → 공통 → 화면 유형 6가지)과 <b>메뉴별 시안</b>으로 나뉜다. 왼쪽 목차에서 바로 이동.')
lay = lay.replace('<div class="dec">', '<div class="dec" id="decisions">', 1)
lay = lay.replace('<section id="screens">', '<section id="m-campaign">')
part = lambda id, t, sub: f'<div class="part" id="{id}"><h2>{t}</h2><p>{sub}</p></div>'
lay = lay.replace('<section id="common">',
    part('p-global', '전역 디자인', '모든 화면에 공통으로 적용하는 규칙') +
    '<div class="sub" id="p-base">기초 부품 <span>디자인 정의 v1 · 2026-10-20</span></div><div id="base">' + base_html + '</div>' +
    '<div class="sub" id="p-layout">공통 · 화면 유형 <span>레이아웃 정의 · 2026-10-21</span></div><section id="common">', 1)
lay = lay.replace('<section id="m-campaign">', part('p-menu', '메뉴별 시안', '카테고리별 실제 화면 시안. 확정되면 코드에 반영') + '<div class="sub" id="m-marketing">마케팅</div><section id="m-campaign">', 1)
lay = lay.replace('<section><h2>다음</h2>', '<section id="next"><h2>다음</h2>', 1)

# 4) 왼쪽 목차
def a(h, t, cls=''): return f'<a href="#{h}" class="{cls}">{t}</a>'
MENU = [('마케팅', [('m-campaign', '캠페인 관리 — 표형 vs 카드형', ''), (None, '광고 성과 · 콘텐츠 성과 (코드 적용됨, 시안 없음)', 'todo')]),
        ('세일즈', [('board', '보드뷰 → 화면 유형 · 보드', 'ref'), ('list', '리스트 → 화면 유형 · 목록', 'ref'), (None, '견적서 (예정)', 'todo')]),
        ('고객관리', [('detail', '고객사 상세 → 화면 유형 · 상세', 'ref'), (None, '매출 현황 · 과금 고객 (예정)', 'todo')]),
        ('재무관리', [(None, '청구 · 미납 · 납부 (예정)', 'todo')]),
        ('분석', [('agg', '생애주기 3화면 → 화면 유형 · 집계', 'ref')]),
        ('대시보드', [('dash', '대시보드 → 화면 유형 · 대시보드', 'ref')])]
nav = ['<nav class="toc"><div class="h">카스웍스 CRM 디자인 정의</div>', a('decisions', '정한 것 (요약)'),
       '<div class="g">전역 디자인</div><div class="g2">기초 부품</div>'] + [a('b-' + i, t, 'i') for i, t in base_titles] + \
      ['<div class="g2">공통 · 화면 유형</div>', a('common', '색 · 상태 칩', 'i')] + \
      [a(h, t, 'i') for h, t in [('list', '목록'), ('agg', '집계'), ('detail', '상세'), ('form', '입력'), ('dash', '대시보드'), ('board', '보드')]] + \
      ['<div class="g">메뉴별 시안</div>']
for cat, items in MENU:
    nav.append(f'<div class="g2">{cat}</div>')
    for h, t, cls in items:
        nav.append(a(h, t, 'i ' + cls) if h else f'<span class="i todo">{t}</span>')
nav += ['<div class="g">기록</div>', a('next', '다음 작업'), '</nav>']
lay = lay.replace('<body><div class="doc">', '<body><div class="shell">' + ''.join(nav) + '<main class="doc">', 1)
lay = lay.replace('</div>\n<script>', '</main></div>\n<script>', 1) if '</div>\n<script>' in lay else lay.replace('</body>', '</main></div></body>', 1)

TOC_CSS = '''
.shell{display:grid;grid-template-columns:220px minmax(0,1fr);gap:32px;max-width:1440px;margin:0 auto}.shell .doc{max-width:none;margin:0;min-width:0}
.toc{position:sticky;top:0;align-self:start;max-height:100vh;overflow:auto;padding:28px 0 40px;font-size:12.5px}
.toc .h{font-weight:600;font-size:13px;margin-bottom:10px}.toc a,.toc span{display:block;color:var(--fg-2);text-decoration:none;padding:3px 8px;border-radius:4px;line-height:1.4}
.toc a:hover{background:var(--bg-subtle);color:var(--fg)}.toc a.on{background:var(--bg-subtle);color:var(--fg);font-weight:600;box-shadow:inset 2px 0 0 var(--accent)}
.toc .g{margin:14px 0 4px;font-weight:600;color:var(--fg)}.toc .g2{margin:8px 0 2px 8px;font-size:11.5px;color:var(--fg-3)}.toc .i{padding-left:16px}.toc .ref{color:var(--fg-3)}.toc .todo{color:var(--fg-3);font-size:11.5px;opacity:.8}
.part{margin:36px 0 0;padding:14px 0 0;border-top:2px solid var(--fg)}.part h2{font-size:20px;margin:0}.part p{margin:2px 0 0;color:var(--fg-2)}
.sub{margin:22px 0 0;font-size:14px;font-weight:600;color:var(--fg)}.sub span{font-weight:400;font-size:12px;color:var(--fg-3);margin-left:8px}
section,.part,.sub{scroll-margin-top:12px}
@media (max-width:900px){.shell{grid-template-columns:1fr}.toc{position:static;max-height:none;padding-bottom:0}}
'''
lay = lay.replace('</style></head>', base_css + TOC_CSS + '</style></head>', 1)
lay = lay.replace('</body>', '''<script>(()=>{const ls=[...document.querySelectorAll('.toc a')];const m=new Map(ls.map(l=>[l.getAttribute('href').slice(1),l]));const io=new IntersectionObserver(es=>{es.forEach(e=>{if(e.isIntersecting){ls.forEach(l=>l.classList.remove('on'));const l=m.get(e.target.id);if(l)l.classList.add('on')}})},{rootMargin:'0px 0px -75% 0px'});m.forEach((_,id)=>{const el=document.getElementById(id);if(el)io.observe(el)})})()</script></body>''', 1)
OUT = D + '카스웍스_CRM_디자인정의.html'
open(OUT, 'w', encoding='utf-8').write(lay)
print('assembled', len(lay), len(base_secs), 'base sections')
