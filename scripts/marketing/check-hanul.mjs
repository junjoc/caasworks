import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
const env = readFileSync('.env.local', 'utf-8')
env.split('\n').forEach(l => { const m = l.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/); if (m) process.env[m[1]] = m[2].replace(/^"(.*)"$/, '$1') })
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
const { data } = await sb.from('pipeline_leads').select('inquiry_content, notes, stage').eq('company_name', '한울건설').eq('inquiry_date', '2026-09-04')
for (const l of data) console.log(l.stage, '|', (l.inquiry_content || '').replace(/\s+/g, ' ').slice(0, 300), '|', l.notes)
