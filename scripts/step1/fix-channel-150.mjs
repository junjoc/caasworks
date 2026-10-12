#!/usr/bin/env node
// 7/2 이후 Slack 자동등록 리드 중 화면 분류에 없는 채널값(14종 이름)으로 저장된 건을
// 레퍼러 기준으로 다시 계산해 화면 분류(채널 + 유입경로)로 되돌린다.
// 광고성과(ad_performance)에 '기타'로 잘못 집계된 행도 올바른 채널로 옮긴다.
// usage: node scripts/step1/fix-channel-150.mjs [--live]

import { createClient } from '@supabase/supabase-js'
import { readFileSync, writeFileSync, mkdirSync } from 'fs'

const env = readFileSync('.env.local', 'utf-8')
env.split('\n').forEach(l => { const m = l.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/); if (m) process.env[m[1]] = m[2].replace(/^"(.*)"$/, '$1') })
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
const LIVE = process.argv.includes('--live')

const WRONG = ['오가닉검색', '직접', 'AI어시스턴트', '유료검색_네이버', '오가닉_구글', '오가닉_네이버']

// src/lib/attribution.ts inferLeadChannel 과 동일 (레퍼러 분기만)
const AI_HOSTS = ['chatgpt.com', 'openai.com', 'claude.ai', 'gemini.google', 'perplexity.ai', 'vertexaisearch.cloud.google.com', 'copilot.microsoft.com']
function hostOf(u) { try { return new URL(u).host.toLowerCase() } catch { return null } }
function inferLeadChannel(referrer) {
  const ref = (referrer || '').trim()
  const host = ref ? hostOf(ref) : null
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

// src/lib/sync-lead-to-ads.ts mapLeadChannelToAds 의 화면 분류 분기와 동일
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

console.log(`[유입채널 되돌리기] ${LIVE ? 'LIVE' : 'DRY-RUN'}\n`)

const { data: leads, error } = await sb.from('pipeline_leads').select('*').in('inquiry_channel', WRONG)
if (error) throw error
const { data: adRows, error: adErr } = await sb.from('ad_performance').select('*').eq('channel', '기타').in('campaign_name', WRONG)
if (adErr) throw adErr
console.log(`대상 리드 ${leads.length}건, 잘못 들어간 광고성과 행 ${adRows.length}개`)

const plan = leads.map(l => {
  const next = inferLeadChannel(l.referrer)
  return { lead: l, next }
})
const summary = {}
for (const p of plan) {
  const k = `${p.lead.inquiry_channel} / ${p.lead.inquiry_source || '-'}  →  ${p.next.channel} / ${p.next.source}`
  summary[k] = (summary[k] || 0) + 1
}
console.log('\n변환 미리보기 (기존 → 새 값)')
for (const [k, v] of Object.entries(summary).sort((a, b) => b[1] - a[1])) console.log(`  ${String(v).padStart(3)}  ${k}`)

// 광고성과 이동 계획
const moves = []
for (const p of plan) {
  const l = p.lead
  const old = adRows.find(r => r.date === l.inquiry_date && r.campaign_name === l.inquiry_channel)
  if (!old) continue
  const inInq = split(old.inquiry_companies).includes(l.company_name)
  const inAdo = split(old.adoption_companies).includes(l.company_name)
  if (!inInq && !inAdo) continue
  // 지금 도입완료가 아니면(예: 이탈) 도입 집계는 옮기지 않고 기존 행에서 빼기만 한다
  moves.push({ lead: l, oldId: old.id, to: mapToAds(p.next.channel, p.next.source), inInq, inAdo, moveAdo: inAdo && l.stage === '도입완료' })
}
console.log(`\n광고성과 이동: ${moves.length}건`)
for (const m of moves) console.log(`  ${m.lead.inquiry_date} ${m.lead.company_name.slice(0, 14).padEnd(14)} 기타/${m.lead.inquiry_channel} → ${m.to.channel}/${m.to.campaign_name}  (문의${m.inInq ? 'O' : 'X'} 도입${m.moveAdo ? 'O' : (m.inAdo ? '제거' : 'X')})`)

if (!LIVE) { console.log('\n[DRY-RUN] --live 로 실행'); process.exit(0) }

// 백업
mkdirSync('backups', { recursive: true })
const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 16)
const bpath = `backups/fix-channel-150-${stamp}.json`
writeFileSync(bpath, JSON.stringify({ created_at: new Date().toISOString(), leads, ad_performance: adRows }, null, 2))
console.log(`\n백업: ${bpath}`)

// 1) 리드 채널/유입경로 수정
let ok = 0
for (const p of plan) {
  const { error } = await sb.from('pipeline_leads')
    .update({ inquiry_channel: p.next.channel, inquiry_source: p.next.source })
    .eq('id', p.lead.id)
  if (error) console.log(`  ❌ ${p.lead.company_name}: ${error.message}`); else ok++
}
console.log(`리드 수정: ${ok}/${plan.length}`)

// 2) 광고성과 이동
for (const m of moves) {
  const { data: oldRow } = await sb.from('ad_performance').select('*').eq('id', m.oldId).single()
  const inq = split(oldRow.inquiry_companies).filter(c => c !== m.lead.company_name)
  const ado = split(oldRow.adoption_companies).filter(c => c !== m.lead.company_name)
  const newInq = Math.max(0, (oldRow.inquiries || 0) - (m.inInq ? 1 : 0))
  const newAdo = Math.max(0, (oldRow.adoptions || 0) - (m.inAdo ? 1 : 0))
  const empty = newInq === 0 && newAdo === 0 && !oldRow.cost && !oldRow.impressions && !oldRow.clicks && oldRow.data_source === 'manual'
  if (empty) await sb.from('ad_performance').delete().eq('id', oldRow.id)
  else await sb.from('ad_performance').update({ inquiries: newInq, adoptions: newAdo, inquiry_companies: inq.join(', ') || null, adoption_companies: ado.join(', ') || null }).eq('id', oldRow.id)

  const { data: target } = await sb.from('ad_performance').select('*')
    .eq('date', m.lead.inquiry_date).eq('channel', m.to.channel).eq('campaign_name', m.to.campaign_name).limit(1)
  if (target && target.length) {
    const t = target[0]
    const tInq = split(t.inquiry_companies), tAdo = split(t.adoption_companies)
    const upd = {}
    if (m.inInq && !tInq.includes(m.lead.company_name)) { tInq.push(m.lead.company_name); upd.inquiries = (t.inquiries || 0) + 1; upd.inquiry_companies = tInq.join(', ') }
    if (m.moveAdo && !tAdo.includes(m.lead.company_name)) { tAdo.push(m.lead.company_name); upd.adoptions = (t.adoptions || 0) + 1; upd.adoption_companies = tAdo.join(', ') }
    if (Object.keys(upd).length) await sb.from('ad_performance').update(upd).eq('id', t.id)
  } else {
    await sb.from('ad_performance').insert({
      date: m.lead.inquiry_date, channel: m.to.channel, ad_type: '콘텐츠', campaign_name: m.to.campaign_name,
      impressions: 0, clicks: 0, cost: 0, ga_visits: 0, inquiry_clicks: 0, signups: 0,
      inquiries: m.inInq ? 1 : 0, adoptions: m.moveAdo ? 1 : 0,
      inquiry_companies: m.inInq ? m.lead.company_name : null,
      adoption_companies: m.moveAdo ? m.lead.company_name : null,
      data_source: 'manual',
    })
  }
  console.log(`  ✅ ${m.lead.company_name} → ${m.to.channel}/${m.to.campaign_name}${empty ? ' (빈 기타 행 삭제)' : ''}`)
}

// 검증
const { count: remain } = await sb.from('pipeline_leads').select('*', { count: 'exact', head: true }).in('inquiry_channel', WRONG)
const { count: remainAd } = await sb.from('ad_performance').select('*', { count: 'exact', head: true }).eq('channel', '기타').in('campaign_name', WRONG)
console.log(`\n[검증] 남은 잘못된 채널값 리드: ${remain}, 남은 잘못된 광고성과 행: ${remainAd}`)
