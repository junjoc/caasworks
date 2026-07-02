import { readFileSync } from 'fs'
import { createClient } from '@supabase/supabase-js'
const env = readFileSync('.env.local', 'utf-8')
env.split('\n').forEach(l => { const m = l.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/); if (m) process.env[m[1]] = m[2].replace(/^"(.*)"$/, '$1') })
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

// 백업 파일 기준으로 원래 year=2025 는 0이었음 → 전부 오늘 넣은 것
const backup = JSON.parse(readFileSync('backups/monthly-revenues-2026-07-02T01-53.json', 'utf-8'))
const backup2025Count = backup.monthly_revenues.filter(r => r.year === 2025).length
console.log(`백업 시점 year=2025: ${backup2025Count}건 (0 이면 안전)`)

if (backup2025Count === 0) {
  const { data, error, count } = await sb.from('monthly_revenues').delete({ count: 'exact' }).eq('year', 2025)
  console.log(`삭제 결과: ${error ? '❌ ' + error.message : '✅ ' + count + '건'}`)
}

const { count: v } = await sb.from('monthly_revenues').select('*', { count: 'exact', head: true }).eq('year', 2025)
const { count: v26 } = await sb.from('monthly_revenues').select('*', { count: 'exact', head: true }).eq('year', 2026)
console.log(`검증: year=2025 → ${v} (0), year=2026 → ${v26} (3888)`)
