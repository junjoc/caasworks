#!/usr/bin/env node
// 7/1 이후 문의내용에 utm 줄이 있는 리드를 utm 기준으로 다시 분류 (마케팅팀 요청 2026-10-12)
// - NAds → 네이버 / utm_campaign, naver_blog → 블로그 / 네이버, chatgpt·gemini → 검색유입 / 생성형AI
// - utm_* / landing_page 컬럼도 채움
// - 광고성과에 이 리드가 이전 채널로 집계돼 있으면 새 채널로 옮김
// 로직은 src/lib/attribution.ts (parseUtmFromText, inferLeadChannel) 와 같게 유지.
// usage: node scripts/marketing/fix-utm-leads.mjs [--live]

import { createClient } from '@supabase/supabase-js'
import { readFileSync, writeFileSync, mkdirSync } from 'fs'

const env = readFileSync('.env.local', 'utf-8')
env.split('\n').forEach(l => { const m = l.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/); if (m) process.env[m[1]] = m[2].replace(/^"(.*)"$/, '$1') })
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
const LIVE = process.argv.includes('--live')

const AI_HOSTS = ['chatgpt.com', 'openai.com', 'claude.ai', 'gemini.google', 'perplexity.ai', 'vertexaisearch.cloud.google.com', 'copilot.microsoft.com']
function parseUtm(text) {
  const pick = k => { const m = (text || '').match(new RegExp(`${k}\\s*:\\s*([^\\s>]+)`)); return m ? m[1] : null }
  return { utm_source: pick('utm_source'), utm_medium: pick('utm_medium'), utm_campaign: pick('utm_campaign'), utm_content: pick('utm_content'), utm_term: pick('utm_term'), landing_page: pick('landing_page') }
}
function hostOf(u) { try { return new URL(u).host.toLowerCase() } catch { return null } }
function infer(a) {
  const source = (a.utm_source || '').toLowerCase(), medium = (a.utm_medium || '').toLowerCase()
  if (source || medium) {
    if (/^nads/.test(source)) return { channel: '네이버', source: a.utm_campaign || '검색광고' }
    if (source.includes('blog')) return { channel: '블로그', source: source.includes('tistory') ? '티스토리' : '네이버' }
    if (AI_HOSTS.some(h => source.includes(h)) || ['gemini', 'chatgpt', 'perplexity', 'claude'].includes(source)) return { channel: '검색유입', source: '생성형AI' }
    const paid = ['cpc', 'ppc', 'paidsearch', 'sa', 'paid'].includes(medium)
    if (source.includes('naver')) return paid ? { channel: '네이버', source: '검색광고' } : { channel: '검색유입', source: '네이버' }
    if (source.includes('google')) return paid ? { channel: '구글', source: '검색광고' } : { channel: '검색유입', source: '구글' }
    if (['facebook', 'instagram', 'meta'].some(s => source.includes(s))) return { channel: '메타', source: source.includes('instagram') ? '인스타그램' : '페이스북' }
    if (source.includes('youtube')) return { channel: '유튜브', source: paid ? '광고' : '오가닉' }
    if (medium === 'blog') return { channel: '블로그', source: source.includes('tistory') ? '티스토리' : '네이버' }
  }
  const host = a.referrer ? hostOf(a.referrer.trim()) : null
  if (!host) return { channel: '자사채널', source: '홈페이지' }
  if (host.endsWith('blog.naver.com')) return { channel: '블로그', source: '네이버' }
  if (host.endsWith('tistory.com')) return { channel: '블로그', source: '티스토리' }
  if (host.endsWith('search.naver.com')) return { channel: '검색유입', source: '네이버' }
  if (AI_HOSTS.some(h => host.includes(h))) return { channel: '검색유입', source: '생성형AI' }
  if (/(^|\.)google\.(com|co\.kr)$/.test(host)) return { channel: '검색유입', source: '구글' }
  if (host.endsWith('daum.net') || host.endsWith('bing.com')) return { channel: '검색유입', source: '기타' }
  if (host.endsWith('youtube.com')) return { channel: '유튜브', source: '오가닉' }
  if (host.endsWith('instagram.com')) return { channel: '메타', source: '인스타그램' }
  if (host.endsWith('facebook.com')) return { channel: '메타', source: '페이스북' }
  if (host.endsWith('caas.works') || host.endsWith('caas.co.kr') || host.includes('caasworks')) return { channel: '자사채널', source: '홈페이지' }
  return { channel: '자사채널', source: '기타' }
}
// src/lib/sync-lead-to-ads.ts mapLeadChannelToAds (화면 분류 분기)
function mapToAds(ch, src) {
  if (ch === '검색유입') {
    if (src.includes('네이버')) return { channel: ch, campaign_name: '네이버' }
    if (src.includes('구글')) return { channel: ch, campaign_name: '구글' }
    if (src.includes('AI')) return { channel: ch, campaign_name: '생성형AI' }
    return { channel: ch, campaign_name: src || '기타' }
  }
  if (ch === '자사채널') return { channel: ch, campaign_name: src || '홈페이지' }
  if (ch === '블로그') {
    if (src.includes('네이버')) return { channel: ch, campaign_name: '네이버' }
    if (src.includes('티스토리')) return { channel: ch, campaign_name: '티스토리' }
    return { channel: ch, campaign_name: src || '기타' }
  }
  return { channel: ch, campaign_name: src || ch }
}
const split = s => (s ? s.split(',').map(x => x.trim()).filter(Boolean) : [])

const { data: all, error } = await sb.from('pipeline_leads').select('*').gte('inquiry_date', '2026-07-01').like('inquiry_content', '%utm_source%')
if (error) throw error
const plan = all.map(l => {
  const utm = parseUtm(l.inquiry_content)
  const next = infer({ ...utm, referrer: l.referrer })
  return { l, utm, next, changed: next.channel !== l.inquiry_channel || next.source !== l.inquiry_source }
})
console.log(`[utm 재분류] ${LIVE ? 'LIVE' : 'DRY-RUN'}  대상 ${plan.length}건, 채널 바뀌는 리드 ${plan.filter(p => p.changed).length}건\n`)
const sum = {}
for (const p of plan) { const k = `${p.l.inquiry_channel}/${p.l.inquiry_source} → ${p.next.channel}/${p.next.source}${p.changed ? '' : ' (그대로)'}`; sum[k] = (sum[k] || 0) + 1 }
for (const [k, v] of Object.entries(sum).sort((a, b) => b[1] - a[1])) console.log(`  ${String(v).padStart(3)}  ${k}`)

// 광고성과에서 이전 채널로 집계된 경우만 옮김
const moves = []
for (const p of plan.filter(x => x.changed)) {
  const from = mapToAds(p.l.inquiry_channel || '', p.l.inquiry_source || '')
  const { data: rows } = await sb.from('ad_performance').select('*').eq('date', p.l.inquiry_date).eq('channel', from.channel).eq('campaign_name', from.campaign_name).limit(1)
  const old = rows && rows[0]
  if (!old) continue
  const inInq = split(old.inquiry_companies).includes(p.l.company_name)
  const inAdo = split(old.adoption_companies).includes(p.l.company_name)
  if (inInq || inAdo) moves.push({ p, old, to: mapToAds(p.next.channel, p.next.source), inInq, moveAdo: inAdo && p.l.stage === '도입완료', inAdo })
}
console.log(`\n광고성과 이동: ${moves.length}건`)
for (const m of moves) console.log(`  ${m.p.l.inquiry_date} ${m.p.l.company_name} ${m.old.channel}/${m.old.campaign_name} → ${m.to.channel}/${m.to.campaign_name}`)

if (!LIVE) { console.log('\n[DRY-RUN] --live 로 실행'); process.exit(0) }

mkdirSync('backups', { recursive: true })
const bpath = `backups/fix-utm-leads-${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 16)}.json`
writeFileSync(bpath, JSON.stringify({ leads: all, ad_rows: moves.map(m => m.old) }, null, 2))
console.log(`\n백업: ${bpath}`)

let ok = 0
for (const p of plan) {
  const upd = { ...p.utm }
  if (p.changed) { upd.inquiry_channel = p.next.channel; upd.inquiry_source = p.next.source }
  const { error } = await sb.from('pipeline_leads').update(upd).eq('id', p.l.id)
  if (error) console.log(`  ❌ ${p.l.company_name}: ${error.message}`); else ok++
}
console.log(`리드 수정: ${ok}/${plan.length} (utm 컬럼 채움 포함)`)

for (const m of moves) {
  const { data: cur } = await sb.from('ad_performance').select('*').eq('id', m.old.id).single()
  const name = m.p.l.company_name
  const inq = split(cur.inquiry_companies).filter(c => c !== name)
  const ado = split(cur.adoption_companies).filter(c => c !== name)
  const ni = Math.max(0, (cur.inquiries || 0) - (m.inInq ? 1 : 0)), na = Math.max(0, (cur.adoptions || 0) - (m.inAdo ? 1 : 0))
  if (ni === 0 && na === 0 && !cur.cost && !cur.impressions && !cur.clicks && cur.data_source === 'manual') await sb.from('ad_performance').delete().eq('id', cur.id)
  else await sb.from('ad_performance').update({ inquiries: ni, adoptions: na, inquiry_companies: inq.join(', ') || null, adoption_companies: ado.join(', ') || null }).eq('id', cur.id)
  const { data: t } = await sb.from('ad_performance').select('*').eq('date', m.p.l.inquiry_date).eq('channel', m.to.channel).eq('campaign_name', m.to.campaign_name).limit(1)
  if (t && t.length) {
    const r = t[0], ti = split(r.inquiry_companies), ta = split(r.adoption_companies), u = {}
    if (m.inInq && !ti.includes(name)) { ti.push(name); u.inquiries = (r.inquiries || 0) + 1; u.inquiry_companies = ti.join(', ') }
    if (m.moveAdo && !ta.includes(name)) { ta.push(name); u.adoptions = (r.adoptions || 0) + 1; u.adoption_companies = ta.join(', ') }
    if (Object.keys(u).length) await sb.from('ad_performance').update(u).eq('id', r.id)
  } else {
    await sb.from('ad_performance').insert({ date: m.p.l.inquiry_date, channel: m.to.channel, ad_type: '콘텐츠', campaign_name: m.to.campaign_name, impressions: 0, clicks: 0, cost: 0, ga_visits: 0, inquiry_clicks: 0, signups: 0, inquiries: m.inInq ? 1 : 0, adoptions: m.moveAdo ? 1 : 0, inquiry_companies: m.inInq ? name : null, adoption_companies: m.moveAdo ? name : null, data_source: 'manual' })
  }
  console.log(`  ✅ 광고성과 ${name} → ${m.to.channel}/${m.to.campaign_name}`)
}
