// 블로그 채널 분리: 7월 이후 리드를 자사 블로그 / 외주 블로그로 재분류 + 광고성과 행 이동 (2026-10-12, 마케팅팀 요청)
// - 리드: 레퍼러가 블로그(네이버 블로그·boosterlink.kr)인 7/1 이후 웹 리드 → src/config/blog_channels.json 규칙
// - 광고성과: 팀부스터 행(블로그·기타) → 외주 블로그. 재분류된 리드의 문의·도입을 옛 행에서 빼고 새 행에 넣음
// - 캠페인: 팀부스터 캠페인 채널 → 외주 블로그 (월 비용 등록이 외주 블로그로 가게)
// usage: npx tsx --tsconfig tsconfig.json scripts/marketing/split-blog-channel.mts [--live]
import { createClient } from '@supabase/supabase-js'
import { readFileSync, writeFileSync, mkdirSync } from 'fs'
import { classifyBlogReferrer } from '../../src/lib/blog-channel'
import { extractReferrer } from '../../src/lib/marketing-report'
import { mapLeadChannelToAds } from '../../src/lib/sync-lead-to-ads'

readFileSync('.env.local', 'utf-8').split('\n').forEach(l => { const m = l.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/); if (m) process.env[m[1]] = m[2].replace(/^"(.*)"$/, '$1') })
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
const LIVE = process.argv.includes('--live')
const FROM = '2026-07-01'
const WEB = ['블로그', '외주 블로그', '자사채널', '검색유입']
const NOT_WEB_SRC = ['대표전화', '개인전화', '해피톡']

async function all<T>(q: () => any): Promise<T[]> {
  let r: T[] = []
  for (let o = 0; ; o += 1000) { const { data, error } = await q().range(o, o + 999); if (error) throw error; r = r.concat(data); if (data.length < 1000) break }
  return r
}
const split = (s: string | null) => (s ? s.split(',').map(x => x.trim()).filter(Boolean) : [])

console.log(`[블로그 채널 분리] ${LIVE ? 'LIVE' : 'DRY-RUN'}\n`)

// 1. 리드
type Lead = { id: string; company_name: string; inquiry_date: string; inquiry_channel: string; inquiry_source: string; stage: string; referrer: string | null; inquiry_content: string | null }
const leads = await all<Lead>(() => sb.from('pipeline_leads').select('id, company_name, inquiry_date, inquiry_channel, inquiry_source, stage, referrer, inquiry_content').gte('inquiry_date', FROM).order('id'))
const changes = leads.flatMap(l => {
  if (!WEB.includes(l.inquiry_channel) || NOT_WEB_SRC.includes(l.inquiry_source)) return []
  const c = classifyBlogReferrer(extractReferrer(l.referrer, l.inquiry_content))
  if (!c || (c.channel === l.inquiry_channel && c.source === l.inquiry_source)) return []
  return [{ lead: l, to: c }]
})
const tally = new Map<string, number>()
for (const { lead, to } of changes) { const k = `${lead.inquiry_channel}/${lead.inquiry_source} → ${to.channel}/${to.source}`; tally.set(k, (tally.get(k) || 0) + 1) }
console.log(`리드 재분류 ${changes.length}건`); for (const [k, n] of tally) console.log(`  ${n}\t${k}`)

// 2. 광고성과 팀부스터 행
const tbRows = await all<any>(() => sb.from('ad_performance').select('*').eq('campaign_name', '팀부스터').in('channel', ['블로그', '기타']).order('id'))
console.log(`\n광고성과 팀부스터 행 → 외주 블로그: ${tbRows.length}행 (비용 ${tbRows.reduce((s, r) => s + (r.cost || 0), 0).toLocaleString()}원, 문의 ${tbRows.reduce((s, r) => s + (r.inquiries || 0), 0)})`)

const { data: camps } = await sb.from('campaigns').select('*').eq('name', '팀부스터')
console.log(`캠페인 팀부스터: ${(camps || []).map(c => `${c.channel} → 외주 블로그`).join(', ')}`)

if (!LIVE) { console.log('\n[DRY-RUN] --live 로 실행'); process.exit(0) }

// 백업
mkdirSync('backups', { recursive: true })
const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 16)
const touchedAds = await all<any>(() => sb.from('ad_performance').select('*').gte('date', FROM).in('channel', ['블로그', '외주 블로그', '자사채널', '검색유입']).order('id'))
const bpath = `backups/blog-split-${ts}.json`
writeFileSync(bpath, JSON.stringify({ leads: changes.map(c => c.lead), ad_teambooster: tbRows, ad_after_july: touchedAds, campaigns: camps }, null, 2))
console.log(`\n백업: ${bpath}`)

// 팀부스터 행 / 캠페인
for (const r of tbRows) { const { error } = await sb.from('ad_performance').update({ channel: '외주 블로그' }).eq('id', r.id); if (error) throw error }
for (const c of camps || []) { const { error } = await sb.from('campaigns').update({ channel: '외주 블로그' }).eq('id', c.id); if (error) throw error }

// 리드 + 광고성과 문의·도입 이동
let moved = 0
for (const { lead, to } of changes) {
  const { error } = await sb.from('pipeline_leads').update({ inquiry_channel: to.channel, inquiry_source: to.source }).eq('id', lead.id)
  if (error) throw error
  const oldM = mapLeadChannelToAds(lead.inquiry_channel, lead.inquiry_source)
  const newM = mapLeadChannelToAds(to.channel, to.source)!
  const won = lead.stage === '도입완료'
  // 옛 행에서 빼기 (회사명이 있는 행만)
  if (oldM) {
    const { data: rows } = await sb.from('ad_performance').select('id, inquiries, inquiry_companies, adoptions, adoption_companies')
      .eq('date', lead.inquiry_date).eq('channel', oldM.channel).eq('campaign_name', oldM.campaign_name)
    for (const r of rows || []) {
      const inq = split(r.inquiry_companies), ado = split(r.adoption_companies)
      const patch: Record<string, unknown> = {}
      if (inq.includes(lead.company_name)) { patch.inquiries = Math.max(0, (r.inquiries || 0) - 1); patch.inquiry_companies = inq.filter(x => x !== lead.company_name).join(', ') || null }
      if (ado.includes(lead.company_name)) { patch.adoptions = Math.max(0, (r.adoptions || 0) - 1); patch.adoption_companies = ado.filter(x => x !== lead.company_name).join(', ') || null }
      if (Object.keys(patch).length) { await sb.from('ad_performance').update(patch).eq('id', r.id); moved++ }
    }
  }
  // 새 행에 넣기 (같은 날 같은 회사가 이미 있으면 그대로 — 팀이 수기로 넣은 팀부스터 문의와 중복 방지)
  const { data: rows } = await sb.from('ad_performance').select('id, inquiries, inquiry_companies, adoptions, adoption_companies')
    .eq('date', lead.inquiry_date).eq('channel', newM.channel).eq('campaign_name', newM.campaign_name).is('campaign_id', null)
  const has = (rows || []).some(r => split(r.inquiry_companies).includes(lead.company_name))
  if (rows && rows.length) {
    const r = rows[0]
    const patch: Record<string, unknown> = {}
    if (!has) { patch.inquiries = (r.inquiries || 0) + 1; patch.inquiry_companies = [...split(r.inquiry_companies), lead.company_name].join(', ') }
    if (won && !(rows || []).some(x => split(x.adoption_companies).includes(lead.company_name))) { patch.adoptions = (r.adoptions || 0) + 1; patch.adoption_companies = [...split(r.adoption_companies), lead.company_name].join(', ') }
    if (Object.keys(patch).length) await sb.from('ad_performance').update(patch).eq('id', r.id)
  } else {
    await sb.from('ad_performance').insert({
      date: lead.inquiry_date, channel: newM.channel, ad_type: '콘텐츠', campaign_name: newM.campaign_name,
      impressions: 0, clicks: 0, cost: 0, ga_visits: 0, inquiry_clicks: 0, signups: 0,
      inquiries: 1, inquiry_companies: lead.company_name, adoptions: won ? 1 : 0, adoption_companies: won ? lead.company_name : null,
      data_source: 'manual',
    })
  }
}
console.log(`완료: 리드 ${changes.length}건, 옛 광고성과 행에서 뺀 곳 ${moved}곳`)
