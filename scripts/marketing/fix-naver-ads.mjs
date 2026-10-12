#!/usr/bin/env node
// 네이버 광고 리드 ↔ 광고성과 정리 (2026-10-12)
// 1) 유입경로가 "검색광고"(캠페인 모름)인 네이버 리드: 팀이 광고성과에 같은 날짜·회사명으로 입력해 둔 광고그룹으로 캠페인 복원
// 2) 대응표(src/config/ad_campaign_map.json)에 있는 네이버 리드를 광고성과 해당 광고그룹 행에 문의/도입 반영 (회사명 같으면 건너뜀)
// usage: node scripts/marketing/fix-naver-ads.mjs [--live]

import { createClient } from '@supabase/supabase-js'
import { readFileSync, writeFileSync, mkdirSync } from 'fs'

const env = readFileSync('.env.local', 'utf-8')
env.split('\n').forEach(l => { const m = l.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/); if (m) process.env[m[1]] = m[2].replace(/^"(.*)"$/, '$1') })
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
const LIVE = process.argv.includes('--live')
const MAP = JSON.parse(readFileSync('src/config/ad_campaign_map.json', 'utf-8'))['네이버']
const byAdgroup = Object.fromEntries(Object.entries(MAP).map(([code, v]) => [v.adgroup_name, code]))
const split = s => (s ? s.split(',').map(x => x.trim()).filter(Boolean) : [])

const { data: leads } = await sb.from('pipeline_leads').select('id, company_name, inquiry_date, inquiry_source, stage').eq('inquiry_channel', '네이버')
// 1000행 기본 제한이 있어서 나눠서 읽는다 (안 그러면 기존 행을 못 찾아 중복 행이 생김)
let adRows = []
for (let off = 0; ; off += 1000) {
  const { data, error } = await sb.from('ad_performance').select('*').eq('channel', '네이버').order('id').range(off, off + 999)
  if (error) throw error
  adRows = adRows.concat(data); if (data.length < 1000) break
}
console.log(`[네이버 광고 정리] ${LIVE ? 'LIVE' : 'DRY-RUN'}  네이버 리드 ${leads.length}건\n`)

// 1) 캠페인 복원
const restore = []
for (const l of leads.filter(l => !MAP[l.inquiry_source])) {
  const row = adRows.find(r => r.date === l.inquiry_date && split(r.inquiry_companies).includes(l.company_name) && byAdgroup[r.adgroup_name])
  if (row) restore.push({ l, code: byAdgroup[row.adgroup_name], adgroup: row.adgroup_name })
  else console.log(`  · 복원 불가 (광고성과에 기록 없음): ${l.inquiry_date} ${l.company_name} [${l.inquiry_source}]`)
}
console.log(`1) 캠페인 복원 ${restore.length}건`)
for (const r of restore) console.log(`  ${r.l.inquiry_date} ${r.l.company_name.padEnd(16)} ${r.l.inquiry_source} → ${r.code} (${r.adgroup})`)

// 2) 광고성과 반영 (복원 결과 포함)
const srcOf = l => restore.find(r => r.l.id === l.id)?.code || l.inquiry_source
const adds = []
for (const l of leads) {
  const m = MAP[srcOf(l)]
  if (!m) continue
  const row = adRows.find(r => r.date === l.inquiry_date && r.campaign_name === m.campaign_name && r.adgroup_name === m.adgroup_name)
  const inInq = row && split(row.inquiry_companies).includes(l.company_name)
  const inAdo = row && split(row.adoption_companies).includes(l.company_name)
  const needAdo = l.stage === '도입완료' && !inAdo
  if (inInq && !needAdo) continue
  adds.push({ l, m, row, addInq: !inInq, addAdo: needAdo })
}
console.log(`\n2) 광고성과에 새로 반영 ${adds.length}건 (이미 같은 회사명이 입력된 리드는 건너뜀)`)
for (const a of adds) console.log(`  ${a.l.inquiry_date} ${a.l.company_name.padEnd(16)} → ${a.m.adgroup_name} ${a.row ? '(기존 행)' : '(새 행)'} 문의${a.addInq ? '+1' : ''} 도입${a.addAdo ? '+1' : ''}`)

if (!LIVE) { console.log('\n[DRY-RUN] --live 로 실행'); process.exit(0) }

mkdirSync('backups', { recursive: true })
const bpath = `backups/fix-naver-ads-${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 16)}.json`
writeFileSync(bpath, JSON.stringify({ leads, ad_rows: adds.filter(a => a.row).map(a => a.row) }, null, 2))
console.log(`\n백업: ${bpath}`)

for (const r of restore) {
  const { error } = await sb.from('pipeline_leads').update({ inquiry_source: r.code }).eq('id', r.l.id)
  console.log(error ? `  ❌ ${r.l.company_name}: ${error.message}` : `  ✅ ${r.l.company_name} 유입경로 → ${r.code}`)
}
for (const a of adds) {
  const name = a.l.company_name
  if (a.row) {
    const { data: cur } = await sb.from('ad_performance').select('*').eq('id', a.row.id).single()
    const inq = split(cur.inquiry_companies), ado = split(cur.adoption_companies), u = {}
    if (a.addInq && !inq.includes(name)) { inq.push(name); u.inquiries = (cur.inquiries || 0) + 1; u.inquiry_companies = inq.join(', ') }
    if (a.addAdo && !ado.includes(name)) { ado.push(name); u.adoptions = (cur.adoptions || 0) + 1; u.adoption_companies = ado.join(', ') }
    if (Object.keys(u).length) await sb.from('ad_performance').update(u).eq('id', cur.id)
  } else {
    await sb.from('ad_performance').insert({
      date: a.l.inquiry_date, channel: '네이버', ad_type: '콘텐츠', campaign_name: a.m.campaign_name, adgroup_name: a.m.adgroup_name,
      impressions: 0, clicks: 0, cost: 0, ga_visits: 0, inquiry_clicks: 0, signups: 0,
      inquiries: a.addInq ? 1 : 0, adoptions: a.addAdo ? 1 : 0,
      inquiry_companies: a.addInq ? name : null, adoption_companies: a.addAdo ? name : null, data_source: 'manual',
    })
  }
  console.log(`  ✅ 광고성과 ${name} → ${a.m.adgroup_name}`)
}
