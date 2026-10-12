#!/usr/bin/env node
// 블로그 채널 분리(자사 / 외주) 전 현황 확인 (2026-10-12)
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
const env = readFileSync('.env.local', 'utf-8')
env.split('\n').forEach(l => { const m = l.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/); if (m) process.env[m[1]] = m[2].replace(/^"(.*)"$/, '$1') })
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
async function all(q) { let r = []; for (let o = 0; ; o += 1000) { const { data, error } = await q().range(o, o + 999); if (error) throw error; r = r.concat(data); if (data.length < 1000) break } return r }
const REF = /(?:^|\n)\s*>?\s*레퍼러(?: 주소)?\s*:\s*(\S+)/
const leads = await all(() => sb.from('pipeline_leads').select('id, company_name, inquiry_date, inquiry_channel, inquiry_source, referrer, inquiry_content, stage').order('id'))
const refOf = l => l.referrer || (l.inquiry_content || '').match(REF)?.[1] || null
const blogRef = leads.filter(l => /blog\.naver\.com|boosterlink|tistory/.test(refOf(l) || ''))
const blogCh = leads.filter(l => l.inquiry_channel === '블로그')
console.log('블로그 채널 리드', blogCh.length, '/ 블로그·boosterlink 레퍼러 리드', blogRef.length)
const tab = new Map()
for (const l of new Set([...blogCh, ...blogRef])) {
  const r = refOf(l) || ''
  let kind = !r ? '(레퍼러없음)' : /boosterlink/.test(r) ? 'boosterlink' : /blog\.naver\.com\/caasworks|blogId=caasworks/i.test(r) ? '자사' : /blog\.naver\.com/.test(r) ? (r.match(/blog\.naver\.com\/(?:PostView\.naver\?blogId=)?([^/?&]+)/)?.[1] || '?') : 'tistory'
  const k = `${kind} | ${l.inquiry_channel}/${l.inquiry_source} | ${(l.inquiry_date || '').slice(0, 7) >= '2026-07' ? '7월~' : '~6월'}`
  tab.set(k, (tab.get(k) || 0) + 1)
}
console.log([...tab].sort().map(([k, v]) => `${v}\t${k}`).join('\n'))
const ads = await all(() => sb.from('ad_performance').select('date, channel, campaign_name, adgroup_name, cost, inquiries, adoptions, ga_visits, data_source').or('channel.eq.블로그,campaign_name.ilike.%부스터%,channel.eq.외주 블로그').order('id'))
const at = new Map()
for (const a of ads) { const k = `${a.channel} | ${a.campaign_name} | ${a.data_source} | ${a.date.slice(0, 7)}`; const v = at.get(k) || { n: 0, cost: 0, inq: 0, ado: 0, ga: 0 }; v.n++; v.cost += a.cost || 0; v.inq += a.inquiries || 0; v.ado += a.adoptions || 0; v.ga += a.ga_visits || 0; at.set(k, v) }
console.log('\n광고성과 블로그/부스터 행'); console.log([...at].sort().map(([k, v]) => `${k}\t${JSON.stringify(v)}`).join('\n'))
