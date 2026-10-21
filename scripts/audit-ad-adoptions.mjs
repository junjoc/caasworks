#!/usr/bin/env node
// 누락된 광고성과 adoption 자동 감지 + 보정
// 패턴: pipeline_leads.stage = '도입완료' 인데, 매칭되는 ad_performance 행에서
// inquiry_companies 에는 있는데 adoption_companies 에는 없는 케이스
//
// Usage:
//   node scripts/audit-ad-adoptions.mjs            # DRY-RUN
//   node scripts/audit-ad-adoptions.mjs --live     # 보정 실행

import { readFileSync } from 'fs'
import { createClient } from '@supabase/supabase-js'

const env = readFileSync('.env.local', 'utf-8')
env.split('\n').forEach(l => {
  const m = l.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)
  if (m) process.env[m[1]] = m[2].replace(/^"(.*)"$/, '$1')
})
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
const LIVE = process.argv.includes('--live')

// 채널 매핑 (sync-lead-to-ads.ts 와 동일)
function mapLeadChannelToAds(channel, source) {
  if (!channel) return null
  if (channel === '대표전화' || source === '대표전화') return { channel: '자사채널', campaign_name: '대표전화' }
  if (channel === '홈페이지' || source === '홈페이지') return { channel: '자사채널', campaign_name: '홈페이지' }
  if (channel === '깃북' || source === '깃북') return { channel: '자사채널', campaign_name: '깃북' }
  if (channel === '검색유입') return { channel: '검색유입', campaign_name: source || '기타' }
  if (channel === '블로그') return { channel: '블로그', campaign_name: source || '네이버' }
  if (channel === '구글') return { channel: '구글', campaign_name: source || '기타' }
  if (channel === '네이버') return { channel: '네이버', campaign_name: source || '기타' }
  return { channel, campaign_name: source || channel }
}

async function fetchAll(t, cols, ff) {
  let all = [], size = 1000
  for (let f = 0; ; f += size) {
    let q = sb.from(t).select(cols).range(f, f + size - 1)
    if (ff) q = ff(q)
    const { data, error } = await q
    if (error) throw new Error(error.message)
    if (!data || !data.length) break
    all = all.concat(data)
    if (data.length < size) break
  }
  return all
}

console.log(`[Audit Ad Adoptions] ${LIVE ? 'LIVE' : 'DRY-RUN'}\n`)

// 도입완료 lead 만
const completed = await fetchAll(
  'pipeline_leads',
  'id, company_name, stage, inquiry_date, inquiry_channel, inquiry_source, converted_at',
  q => q.eq('stage', '도입완료')
)
console.log(`도입완료 lead: ${completed.length}건`)

// inquiry_date 기간의 모든 ad_performance 로드 (중복 fetch 방지)
const dates = [...new Set(completed.map(l => l.inquiry_date).filter(Boolean))]
console.log(`참조 날짜: ${dates.length}개`)
const adRows = await fetchAll('ad_performance', 'id, date, channel, campaign_name, adoptions, adoption_companies, inquiry_companies')
const adByKey = new Map()
for (const r of adRows) adByKey.set(`${r.date}__${r.channel}__${r.campaign_name}`, r)

// 누락 검출
const missing = []
for (const l of completed) {
  if (!l.inquiry_date) continue
  const m = mapLeadChannelToAds(l.inquiry_channel, l.inquiry_source)
  if (!m) continue
  const key = `${l.inquiry_date}__${m.channel}__${m.campaign_name}`
  const row = adByKey.get(key)
  if (!row) {
    missing.push({ lead: l, reason: 'no ad_performance row', mapping: m })
    continue
  }
  const adoptionList = row.adoption_companies ? row.adoption_companies.split(',').map(s => s.trim()) : []
  if (!adoptionList.includes(l.company_name)) {
    missing.push({ lead: l, reason: 'not in adoption_companies', row, mapping: m })
  }
}

console.log(`\n📋 누락 의심: ${missing.length}건\n`)
missing.slice(0, 30).forEach(({ lead, reason, mapping, row }) => {
  console.log(`  ${lead.company_name}`)
  console.log(`    inquiry_date=${lead.inquiry_date}  channel=${lead.inquiry_channel}  source=${lead.inquiry_source}`)
  console.log(`    매핑: ${mapping.channel} / ${mapping.campaign_name}  (사유: ${reason})`)
  if (row) console.log(`    현재 adoptions=${row.adoptions}, list=${row.adoption_companies || '(빈값)'}`)
  console.log('')
})

if (!LIVE) {
  console.log(`[DRY-RUN] --live 로 실행하면 ${missing.filter(m => m.row).length}건 보정.`)
  console.log(`(ad_performance 행 자체가 없는 ${missing.filter(m => !m.row).length}건은 별도 처리 필요)`)
  process.exit(0)
}

// LIVE 보정
console.log('[LIVE] 보정 시작...')
let fixed = 0
for (const { lead, row } of missing) {
  if (!row) continue  // ad row 없으면 별도 처리 필요
  const adoptionList = row.adoption_companies ? row.adoption_companies.split(',').map(s => s.trim()) : []
  if (adoptionList.includes(lead.company_name)) continue  // 이미 있음 (race)
  adoptionList.push(lead.company_name)
  const { error } = await sb.from('ad_performance').update({
    adoptions: (row.adoptions || 0) + 1,
    adoption_companies: adoptionList.join(', '),
  }).eq('id', row.id)
  if (error) console.log(`  ❌ ${lead.company_name}: ${error.message}`)
  else { fixed++; console.log(`  ✅ ${lead.company_name} → adoption +1`) }
}
console.log(`\n[Done] ${fixed}/${missing.length}건 보정`)
