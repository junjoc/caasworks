#!/usr/bin/env node
// v4 완전 리셋 전 전체 스냅샷
import { readFileSync, writeFileSync, mkdirSync } from 'fs'
import { createClient } from '@supabase/supabase-js'

const env = readFileSync('.env.local', 'utf-8')
env.split('\n').forEach(l => { const m = l.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/); if (m) process.env[m[1]] = m[2].replace(/^"(.*)"$/, '$1') })
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

async function fetchAll(t, cols, ff) {
  let all = [], size = 1000
  for (let f = 0; ; f += size) {
    let q = sb.from(t).select(cols).range(f, f + size - 1)
    if (ff) q = ff(q)
    const { data, error } = await q
    if (error) throw new Error(error.message)
    if (!data || !data.length) break
    all = all.concat(data)
    if (data.length < size) break
  }
  return all
}

console.log('=== v4 전체 백업 ===')
const revs = await fetchAll('monthly_revenues', '*')
const projs = await fetchAll('projects', '*')

const byYear = {}
revs.forEach(r => { byYear[r.year] = (byYear[r.year] || 0) + 1 })
console.log('monthly_revenues:', revs.length, 'by year:', byYear)
console.log('projects:', projs.length)

mkdirSync('backups', { recursive: true })
const stamp = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 16)
const path = `backups/full-v4-${stamp}.json`
writeFileSync(path, JSON.stringify({
  meta: { created_at: new Date().toISOString(), note: 'v4 pre-reset full snapshot' },
  monthly_revenues: revs,
  projects: projs,
}, null, 2))
console.log(`\n✅ ${path}`)
console.log(`   ${(readFileSync(path).length / 1024 / 1024).toFixed(2)} MB`)
