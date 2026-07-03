#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
const env = readFileSync('.env.local', 'utf-8')
env.split('\n').forEach(l => { const m = l.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/); if (m) process.env[m[1]] = m[2].replace(/^"(.*)"$/, '$1') })
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

const { count: total } = await sb.from('pipeline_leads').select('*', { count: 'exact', head: true })
console.log(`pipeline_leads 총 개수: ${total}`)

// stage 별
const stages = ['신규리드', '컨텍', '예정', '제안', '미팅', '도입직전', '도입완료', '이탈']
for (const s of stages) {
  const { count } = await sb.from('pipeline_leads').select('*', { count: 'exact', head: true }).eq('stage', s)
  console.log(`  ${s.padEnd(6)}: ${count}`)
}
