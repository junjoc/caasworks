import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
const env = readFileSync('.env.local', 'utf-8')
env.split('\n').forEach(l => { const m = l.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/); if (m) process.env[m[1]] = m[2].replace(/^"(.*)"$/, '$1') })
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
const rules = JSON.parse(readFileSync('src/config/topic_tags.json', 'utf-8'))
const TAGS = process.argv.slice(2)
const { data } = await sb.from('pipeline_leads').select('company_name, inquiry_content, core_need, notes').gte('inquiry_date', '2026-07-01')
for (const tag of TAGS) {
  const r = rules.tags.find(t => t.tag === tag)
  console.log(`\n■ ${tag}`)
  for (const l of data) {
    const text = [l.inquiry_content, l.core_need, l.notes].filter(Boolean).join(' ').replace(/https?:\/\/\S+/g, ' ')
    const hit = r.keywords.find(kw => text.toLowerCase().includes(kw.toLowerCase()))
    if (!hit) continue
    const i = text.toLowerCase().indexOf(hit.toLowerCase())
    console.log(`  [${hit}] ${l.company_name.slice(0, 12)}: …${text.slice(Math.max(0, i - 25), i + 35).replace(/\s+/g, ' ')}…`)
  }
}
