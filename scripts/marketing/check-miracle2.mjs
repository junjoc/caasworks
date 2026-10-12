import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
const env = readFileSync('.env.local', 'utf-8')
env.split('\n').forEach(l => { const m = l.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/); if (m) process.env[m[1]] = m[2].replace(/^"(.*)"$/, '$1') })
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
const { data } = await sb.from('pipeline_leads').select('company_name, referrer, inquiry_content').ilike('inquiry_content', '%miracleintip%').is('referrer', null)
for (const l of data) {
  const lines = (l.inquiry_content || '').split('\n').filter(x => /miracleintip|레퍼러/.test(x))
  console.log(`· ${l.company_name}\n    ${lines.map(x => x.trim().slice(0, 120)).join('\n    ')}`)
}
