import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
const env = readFileSync('.env.local', 'utf-8')
env.split('\n').forEach(l => { const m = l.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/); if (m) process.env[m[1]] = m[2].replace(/^"(.*)"$/, '$1') })
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
const { data } = await sb.from('pipeline_leads').select('inquiry_content, core_need, notes, inquiry_channel').gte('inquiry_date', '2026-07-01')
const strip = s => (s || '').split('\n').filter(l => !/^\s*(레퍼러 주소|실제 레퍼러)\s*:/.test(l)).join(' ')
  .replace(/https?:\/\/\S+/g, ' ').replace(/>?\s*(utm_\w+|landing_page)\s*:\s*\S*/g, ' ').replace(/[>\s]+/g, ' ').trim()
const empty = data.filter(l => !strip(l.inquiry_content) && !(l.core_need || '').trim())
console.log(`7/1 이후 ${data.length}건 중 문의내용·핵심니즈가 비어 있는 리드: ${empty.length}건`)
const ch = {}; for (const l of empty) ch[l.inquiry_channel] = (ch[l.inquiry_channel] || 0) + 1
console.log('  채널별:', ch)
const withUtm = data.filter(l => /utm_source|landing_page/.test(l.inquiry_content || '')).length
console.log(`문의내용 안에 utm/landing_page 줄이 들어 있는 리드: ${withUtm}건`)
