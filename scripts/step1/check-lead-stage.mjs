import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
const env = readFileSync('.env.local', 'utf-8')
env.split('\n').forEach(l => { const m = l.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/); if (m) process.env[m[1]] = m[2].replace(/^"(.*)"$/, '$1') })
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
const id = process.argv[2]
const { data } = await sb.from('pipeline_leads').select('company_name, stage').eq('id', id).single()
const { count } = await sb.from('pipeline_history').select('*', { count: 'exact', head: true }).eq('lead_id', id).gte('changed_at', new Date(Date.now() - 10 * 60000).toISOString())
console.log(`${data.company_name}: ${data.stage}, 최근 10분 단계 기록 ${count}건`)
