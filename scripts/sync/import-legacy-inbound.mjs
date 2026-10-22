// 2023~2025.1 인바운드 기록 가져오기 (2026-10-22)
// 원본: 영업 시트 "고객 유입 현황(1단계)" + "고객 미팅 현황(2단계)" (사용자 공유 xlsx)
// 규칙 (사용자 결정 10/22):
//  · "카스웍스 가입사"(플랫폼 회원 가입)는 넣지 않음
//  · 담당은 비움(퇴사자) — 박성언 건만 담당 박성언. 메모에 "당시 담당자 ○○"
//  · 계약일 있음 → 도입완료(기존 고객사와 이름이 같으면 연결), 나머지 → 이탈
//  · 유입일 없는 건은 유입일 비움. 등록일(created_at)은 처리일자 → 없으면 2024-12-31 (지금 숫자에 섞이지 않게)
//  · 미팅 현황은 메모에 날짜·차수·참여자·니즈·좋은 점·요청·결과로
//  · 1·2·3차 응대·응대 종료 사유·견적·지역 → 메모, 문의 내용 → 문의 내용
//  · 메모 첫 줄 "[이전 기록]" — 되돌릴 때 이 표시로 찾음
// 실행: node scripts/sync/import-legacy-inbound.mjs <xlsx>          (미리보기)
//       node scripts/sync/import-legacy-inbound.mjs <xlsx> --live   (넣기)
import XLSX from 'xlsx'
import fs from 'fs'
import { createClient } from '@supabase/supabase-js'

const file = process.argv[2]
const LIVE = process.argv.includes('--live')
if (!file) { console.error('xlsx 경로를 주세요'); process.exit(1) }
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, '')] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)
const wb = XLSX.readFile(file, { cellDates: true })

const s = v => String(v ?? '').trim()
const norm = v => s(v).replace(/\(주\)|주식회사|㈜|\(유\)|유한회사|\s/g, '').toLowerCase()
const MON = { Jan: 1, Feb: 2, Mar: 3, Apr: 4, May: 5, Jun: 6, Jul: 7, Aug: 8, Sep: 9, Oct: 10, Nov: 11, Dec: 12 }
// 날짜 칸: 엑셀 날짜 · "2023-01-03(화) 15:52" · "Mon Jun 05 2023 13:40" → "YYYY-MM-DDTHH:mm"(KST)
function when(v) { const r = when0(v); return r && /^20(1[5-9]|2\d)-/.test(r) ? r : null } // 오타 연도(20024 등)는 버림
function when0(v) {
  if (v instanceof Date) return new Date(v.getTime() + 9 * 3600e3).toISOString().slice(0, 16)
  const t = s(v)
  let m = t.match(/(20\d\d|19\d\d)[-.](\d{1,2})[-.](\d{1,2})(?:\([^)]*\))?\s*(?:(\d{1,2}):(\d{2}))?/)
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}T${(m[4] || '00').padStart(2, '0')}:${m[5] || '00'}`
  m = t.match(/[A-Z][a-z]{2} ([A-Z][a-z]{2}) (\d{1,2}) (20\d\d)(?: (\d{1,2}):(\d{2}))?/)
  if (m && MON[m[1]]) return `${m[3]}-${String(MON[m[1]]).padStart(2, '0')}-${m[2].padStart(2, '0')}T${(m[4] || '00').padStart(2, '0')}:${m[5] || '00'}`
  return null
}
const phoneFmt = v => { const d = s(v).replace(/\D/g, ''); if (!d) return null; if (d.startsWith('02')) return d.length > 9 ? `${d.slice(0, 2)}-${d.slice(2, 6)}-${d.slice(6)}` : `${d.slice(0, 2)}-${d.slice(2, 5)}-${d.slice(5)}`; if (/^1[5-9]/.test(d) && d.length === 8) return `${d.slice(0, 4)}-${d.slice(4)}`; if (d.length === 11) return `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7)}`; if (d.length === 10) return `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`; return s(v) }

// 문의 수단 (inquiry_channel)
const METHOD = { '카스웍스 문의하기': '자사채널', '랜딩페이지': '자사채널', '하플 문의하기': '자사채널', '되는시간(미팅예약)': '자사채널', '카스웍스 가입사': '자사채널', '대표전화': '대표전화', '해피톡': '해피톡', '카스웍스 이메일': '이메일', '카스웍스  이메일': '이메일', '아웃바운드': '기타' }
// 유입 경로 (inquiry_source "분류 › 세부") — 시트의 유입 채널·광고 칸
function source(ch, ad) {
  const c = s(ch).replace(/^\[\d\]\s*/, ''), a = s(ad)
  if (/검색/.test(c)) return /네이버/.test(a) ? '검색 › 네이버' : '검색 › 기타'
  if (/인스타/.test(c)) return '소셜 › 인스타그램'
  if (/유튜브/.test(c)) return '소셜 › 유튜브'
  if (/블로그/.test(c)) return /아이콘|caasworks|네이버_카스웍스/.test(a) ? '자사 블로그 › 기타' : '자사 블로그 › 기타'
  if (/광고/.test(c)) return /GDN/.test(a) ? '광고 › 구글' : /네이버/.test(a) ? '광고 › 네이버' : '광고 › 기타'
  if (/소개|초대|지인/.test(c)) return '직접 연락 › 추천'
  return null // unknown · 아웃바운드 · 빈칸 → 모름
}
const INDUSTRY = { '인테리어': '인테리어/리모델링', '인테리어2': '인테리어/리모델링', '하우징': '인테리어/리모델링', '종합건설사': '종합건설사', '건설사': '종합건설사', '전문건설사': '전문건설사', '건축사사무소': '건축사사무소', '시행사': '시행사', '발주처': '발주처(법인)', '솔루션 공급사': '솔루션사' }
const PROB = { '높음': '높음', '중간': '중간', '낮음': '낮음', '없음': '낮음' }

// ── 미팅 현황 (2단계): 회사 코드 → 없으면 회사명
const mrows = XLSX.utils.sheet_to_json(wb.Sheets['고객 미팅 현황(2단계)'], { header: 1, defval: '' }).slice(7).filter(r => s(r[5]))
const meetings = mrows.map(r => ({ code: s(r[2]), round: s(r[3]), at: when(r[4]), company: s(r[5]), who: s(r[10]), pain: s(r[11]), good: s(r[12]), ask: s(r[13]), result: s(r[14]) }))
  .filter(m => m.at && m.at < '2025-01-01')
const meetLine = m => [`미팅 ${m.at.slice(0, 10)}${m.round ? ` (${m.round}차)` : ''}`, m.who && `참여 ${m.who}`, m.pain && `니즈 ${m.pain}`, m.good && `좋은 점 ${m.good}`, m.ask && `요청 ${m.ask}`, m.result && `결과 ${m.result}`].filter(Boolean).join(' · ')

// ── 유입 현황 (1단계)
const rows = XLSX.utils.sheet_to_json(wb.Sheets['고객 유입 현황(1단계)'], { header: 1, defval: '' }).slice(9)
  .filter(r => s(r[13]) || s(r[14]) || s(r[16]))
const recs = rows.map(r => ({
  code: s(r[0]), route: s(r[1]), at: when(r[3]), status: s(r[7]), type: s(r[10]), industryRaw: s(r[12]), company: s(r[13]) || '미상', name: s(r[14]),
  email: s(r[15]) || s(r[17]), phone: s(r[16]), contents: s(r[18]), referrer: s(r[19]), doneAt: when(r[24]), channel: s(r[26]), ad: s(r[27]),
  meet: when(r[29]), contract: when(r[31]), churn: when(r[33]), owner: s(r[35]), sido: s(r[36]), sigungu: s(r[37]), homepage: s(r[38]), prob: s(r[39]),
  step: s(r[40]), endReason: s(r[41]), interest: s(r[42]), content2: s(r[43]), quoteLink: s(r[44]), quote: s(r[45]), expect: s(r[46]),
  c1: [s(r[47]), s(r[48])], c2: [s(r[49]), s(r[50])], c3: [s(r[51]), s(r[52])], inquiry: s(r[8]),
}))
// 미팅을 리드에 붙이기: 코드가 같으면 그 리드, 아니면 같은 회사명 중 미팅일 이전(가장 가까운) 유입
const byCode = new Map(), byName = new Map()
recs.forEach((x, i) => { if (x.code) byCode.set(x.code, i); const k = norm(x.company); if (!byName.has(k)) byName.set(k, []); byName.get(k).push(i) })
const meetOf = new Map(); let unmatched = 0
for (const m of meetings) {
  let i = m.code && byCode.has(m.code) ? byCode.get(m.code) : undefined
  if (i === undefined) { const c = (byName.get(norm(m.company)) || []).filter(j => !recs[j].at || recs[j].at <= m.at).sort((a, b) => (recs[b].at || '').localeCompare(recs[a].at || '')); i = c[0] ?? (byName.get(norm(m.company)) || [])[0] }
  if (i === undefined) { unmatched++; continue }
  if (!meetOf.has(i)) meetOf.set(i, []); meetOf.get(i).push(m)
}
const keep = recs.map((x, i) => ({ x, i })).filter(({ x }) => x.route !== '카스웍스 가입사')

const [{ data: users }, { data: custs }] = await Promise.all([sb.from('users').select('id, name'), sb.from('customers').select('id, company_name')])
const parkId = users.find(u => u.name === '박성언')?.id || null
const custByName = new Map(); custs.forEach(c => { const k = norm(c.company_name); if (!custByName.has(k)) custByName.set(k, c.id) })
// 이미 있는 리드와 같은 날·같은 연락처면 건너뜀
let L = []; for (let o = 0; ; o += 1000) { const { data } = await sb.from('pipeline_leads').select('company_name, contact_phone, contact_email, inquiry_date, notes, customer_code').order('id').range(o, o + 999); L = L.concat(data); if (data.length < 1000) break }
const already = L.some(l => (l.notes || '').startsWith('[이전 기록]'))
const usedCode = new Set(L.map(l => l.customer_code).filter(Boolean))
const legacyKey = new Set(L.filter(l => (l.notes || '').startsWith('[이전 기록]')).map(l => `${norm(l.company_name)}|${l.inquiry_date}|${(l.contact_phone || '').replace(/\D/g, '')}`))
const L0 = L.filter(l => !(l.notes || '').startsWith('[이전 기록]'))
const existKey = new Set(L0.map(l => `${(l.contact_phone || '').replace(/\D/g, '').slice(-8)}|${l.inquiry_date}`).concat(L0.map(l => `${norm(l.company_name)}|${l.inquiry_date}`).concat([])))

const out = [], skipped = { dup: 0 }
for (const { x, i } of keep) {
  const date = x.at ? x.at.slice(0, 10) : null
  if (legacyKey.has(`${norm(x.company)}|${date}|${x.phone.replace(/\D/g, '')}`)) { skipped.dup++; continue } // 이어 넣기
  // ID 는 겹치면 안 됨(시트 안 중복·지금 ID) → 비우고 메모에 당시 코드
  const codeDup = x.code && usedCode.has(x.code); if (x.code && !codeDup) usedCode.add(x.code)
  if (date && (existKey.has(`${x.phone.replace(/\D/g, '').slice(-8)}|${date}`) || existKey.has(`${norm(x.company)}|${date}`))) { skipped.dup++; continue }
  const won = !!x.contract
  const contacts = [x.c1, x.c2, x.c3].map((c, k) => (c[0] || c[1]) ? `${k + 1}차 응대${c[0] ? ` ${when(c[0])?.slice(0, 10) || c[0]}` : ''}: ${c[1]}`.trim() : null).filter(Boolean)
  const notes = [
    `[이전 기록] 2023~2025.1 인바운드 시트 가져오기 (2026-10-22)`,
    codeDup && `당시 코드 ${x.code} (다른 기록과 겹쳐 ID 비움)`,
    x.owner && `당시 담당자 ${x.owner}`,
    x.route && `당시 유입 경로 ${x.route}${x.channel ? ` · ${x.channel}` : ''}${x.ad ? ` · ${x.ad}` : ''}`,
    x.step && `응대 단계 ${x.step}`, x.endReason && `응대 종료 사유 ${x.endReason}`,
    x.prob && `도입 가능성 ${x.prob}`, x.quote && `견적 ${x.quote}${x.quoteLink ? ` (${x.quoteLink})` : ''}`, x.expect && `도입 예상 ${x.expect}`,
    x.meet && `미팅일 ${x.meet.slice(0, 10)}`, x.contract && `최초 계약 ${x.contract.slice(0, 10)}`, x.churn && `이탈일 ${x.churn.slice(0, 10)}`,
    ...contacts, ...(meetOf.get(i) || []).sort((a, b) => a.at.localeCompare(b.at)).map(meetLine),
    x.industryRaw && !INDUSTRY[x.industryRaw] && `사업분야(당시) ${x.industryRaw}`, x.homepage && `홈페이지 ${x.homepage}`,
  ].filter(Boolean).join('\n')
  const created = x.at || x.doneAt || '2024-12-31T00:00'
  out.push({
    customer_code: codeDup ? null : x.code || null, company_name: x.company, contact_person: x.name || null, contact_phone: phoneFmt(x.phone), contact_email: x.email || null,
    inquiry_date: date, inquiry_hour: x.at ? Number(x.at.slice(11, 13)) : null,
    inquiry_channel: METHOD[x.route] || '기타', inquiry_source: source(x.channel, x.ad),
    inquiry_content: [x.inquiry, x.contents, x.content2].filter((v, k, a) => v && a.indexOf(v) === k).join('\n') || null,
    interest_service: x.interest || null, industry: INDUSTRY[x.industryRaw] || (x.industryRaw ? '기타' : null),
    site_region: [x.sido, x.sigungu].filter(Boolean).join(' ') || null, referrer: x.referrer || null,
    conversion_probability: PROB[x.prob] || null, priority: '중간',
    stage: won ? '도입완료' : '이탈', converted_at: won ? new Date(`${x.contract}:00+09:00`).toISOString() : null,
    assigned_to: x.owner === '박성언' ? parkId : null,
    customer_id: won ? custByName.get(norm(x.company)) || null : null,
    created_at: new Date(`${created}:00+09:00`).toISOString(),
    notes,
  })
}

// ── 미리보기
const by = (f) => Object.entries(out.reduce((m, r) => { const k = f(r) || '(없음)'; m[k] = (m[k] || 0) + 1; return m }, {})).sort((a, b) => b[1] - a[1])
console.log(`[이전 기록 가져오기] ${LIVE ? 'LIVE' : '미리보기'}  시트 ${recs.length}행 → 넣을 것 ${out.length}건 (가입사 제외 ${recs.length - keep.length}, 이미 있음 ${skipped.dup})`)
console.log('  연도', JSON.stringify(by(r => r.inquiry_date ? (r.inquiry_date < '2023' ? '2023 이전' : r.inquiry_date.slice(0, 4)) : '유입일 없음')))
console.log('  단계', JSON.stringify(by(r => r.stage)), '· 도입완료 중 고객사 연결', out.filter(r => r.stage === '도입완료' && r.customer_id).length)
console.log('  문의 수단', JSON.stringify(by(r => r.inquiry_channel)))
console.log('  유입 경로', JSON.stringify(by(r => r.inquiry_source)))
console.log('  미팅 붙음', out.filter(r => r.notes.includes('\n미팅 ')).length, '건 · 붙일 리드를 못 찾은 미팅', unmatched)
console.log('  담당 박성언', out.filter(r => r.assigned_to).length, '· 메모 "당시 담당자"', out.filter(r => r.notes.includes('당시 담당자')).length)
if (already) console.log('  ⚠ 이미 [이전 기록]이 들어가 있습니다 — 두 번 넣지 않게 확인하세요')
const sample = out.filter(r => r.notes.includes('\n미팅 ')).slice(0, 2).concat(out.filter(r => !r.inquiry_date).slice(0, 1), out.slice(0, 3))
sample.forEach(r => console.log('\n  ─', r.inquiry_date || '(유입일 없음)', r.company_name, '|', r.stage, '|', r.inquiry_channel, '/', r.inquiry_source || '모름', '| ID', r.customer_code || '-', '| 등록일', r.created_at.slice(0, 10), '\n    ' + r.notes.split('\n').slice(1, 6).join('\n    ').replace(/참여 [^·]+·/g, '참여 ○○ ·')))

if (LIVE) {
  if (already && !process.argv.includes('--resume')) { console.log('\n이미 들어가 있어 멈춥니다. 이어 넣기는 --resume'); process.exit(1) }
  const ids = []
  for (let k = 0; k < out.length; k += 200) {
    const { data, error } = await sb.from('pipeline_leads').insert(out.slice(k, k + 200)).select('id')
    if (error) { console.error('실패', k, error.message); break }
    ids.push(...data.map(d => d.id))
  }
  fs.mkdirSync('backups', { recursive: true })
  const f = `backups/legacy-import-${new Date().toISOString().slice(0, 16).replace(/:/g, '-')}.json`
  fs.writeFileSync(f, JSON.stringify(ids))
  console.log(`\n완료: ${ids.length}건 넣음 · 넣은 id ${f} (되돌리기: 이 id 들 삭제)`)
}
