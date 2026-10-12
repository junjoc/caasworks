import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
const env = readFileSync('.env.local', 'utf-8')
env.split('\n').forEach(l => { const m = l.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/); if (m) process.env[m[1]] = m[2].replace(/^"(.*)"$/, '$1') })
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
const NEW = ['오가닉검색', '직접', 'AI어시스턴트', '유료검색_네이버', '오가닉_구글', '오가닉_네이버']
const { data } = await sb.from('pipeline_leads').select('inquiry_channel, inquiry_source, inquiry_date, created_at, notes, stage').in('inquiry_channel', NEW)
const minC = data.map(r => r.created_at).sort()[0]
console.log(`화면 목록에 없는 채널값 리드: ${data.length}건, 가장 이른 등록일: ${minC?.slice(0,10)}`)
const slack = data.filter(r => (r.notes || '').includes('Slack')).length
console.log(`  그중 Slack 자동등록: ${slack}건, 도입완료: ${data.filter(r => r.stage === '도입완료').length}건`)
const src = {}
for (const r of data) { const k = `${r.inquiry_channel} / ${r.inquiry_source || '-'}`; src[k] = (src[k] || 0) + 1 }
for (const [k, v] of Object.entries(src).sort((a, b) => b[1] - a[1]).slice(0, 15)) console.log(`  ${String(v).padStart(3)}  ${k}`)
