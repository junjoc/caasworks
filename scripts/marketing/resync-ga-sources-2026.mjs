#!/usr/bin/env node
// 광고성과 GA 유입(ga_visits)을 마케팅 사이트 기준으로 월별 재동기화 (2026-10-12)
// 로컬 dev 서버(/api/marketing/sync/ga4-sources)를 호출. 월마다 수동 입력값(문의/도입/가입) 합계가 그대로인지 검증하고, 다르면 중단.
// usage: node scripts/marketing/resync-ga-sources-2026.mjs [--live]

import { createClient } from '@supabase/supabase-js'
import { readFileSync, writeFileSync, mkdirSync } from 'fs'

const env = readFileSync('.env.local', 'utf-8')
env.split('\n').forEach(l => { const m = l.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/); if (m) process.env[m[1]] = m[2].replace(/^"(.*)"$/, '$1') })
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
const LIVE = process.argv.includes('--live')
const CH = ['검색유입', '자사채널', '블로그', '언론']

async function rows(from, to) {
  let all = []
  for (let off = 0; ; off += 1000) {
    const { data, error } = await sb.from('ad_performance').select('*').in('channel', CH).gte('date', from).lte('date', to).order('id').range(off, off + 999)
    if (error) throw error
    all = all.concat(data); if (data.length < 1000) break
  }
  return all
}
const sums = rs => rs.reduce((a, r) => ({
  ga: a.ga + (r.ga_visits || 0), inq: a.inq + (r.inquiries || 0), ado: a.ado + (r.adoptions || 0),
  sig: a.sig + (r.signups || 0), clk: a.clk + (r.inquiry_clicks || 0), n: a.n + 1,
}), { ga: 0, inq: 0, ado: 0, sig: 0, clk: 0, n: 0 })

const months = []
for (let m = 1; m <= 10; m++) {
  const from = `2026-${String(m).padStart(2, '0')}-01`
  const last = m === 10 ? '2026-10-11' : new Date(2026, m, 0).toISOString().slice(0, 10)
  months.push([from, last])
}

const before = await rows('2026-01-01', '2026-10-11')
console.log(`[GA 유입 재동기화] ${LIVE ? 'LIVE' : 'DRY-RUN'}  대상 ${before.length}행`, sums(before))
if (!LIVE) { console.log('\n[DRY-RUN] --live 로 실행'); process.exit(0) }

mkdirSync('backups', { recursive: true })
const bpath = `backups/ga-sources-2026-${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 16)}.json`
writeFileSync(bpath, JSON.stringify(before, null, 2))
console.log(`백업: ${bpath}\n`)

for (const [from, to] of months) {
  const b = sums(await rows(from, to))
  const res = await fetch('http://localhost:3000/api/marketing/sync/ga4-sources', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ startDate: from, endDate: to }),
  }).then(r => r.json())
  if (!res.success) { console.log(`❌ ${from} 동기화 실패: ${res.message}`); process.exit(1) }
  const a = sums(await rows(from, to))
  const ok = a.inq === b.inq && a.ado === b.ado && a.sig === b.sig && a.clk === b.clk
  console.log(`${from.slice(0, 7)}  GA유입 ${b.ga.toLocaleString()} → ${a.ga.toLocaleString()}  | 문의 ${b.inq}→${a.inq} 도입 ${b.ado}→${a.ado} 가입 ${b.sig}→${a.sig} ${ok ? '✅' : '❌ 수동 입력값 변동'}`)
  if (!ok) { console.log(`중단. 백업: ${bpath}`); process.exit(1) }
}
