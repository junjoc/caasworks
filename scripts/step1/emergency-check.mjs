import { readFileSync } from 'fs'
import { createClient } from '@supabase/supabase-js'
const env = readFileSync('.env.local', 'utf-8')
env.split('\n').forEach(l => { const m = l.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/); if (m) process.env[m[1]] = m[2].replace(/^"(.*)"$/, '$1') })
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

async function fetchAll(t, cols, ff) {
  let all=[], size=1000
  for (let f=0;;f+=size) { let q=sb.from(t).select(cols).range(f,f+size-1); if(ff)q=ff(q); const {data,error}=await q; if(error)throw error; if(!data||!data.length)break; all=all.concat(data); if(data.length<size)break }
  return all
}

console.log('=== monthly_revenues 실제 상태 ===')
for (const y of [2023, 2024, 2025, 2026, 2027]) {
  const rows = await fetchAll('monthly_revenues', 'amount', q => q.eq('year', y))
  const sum = rows.reduce((s,r)=>s+Number(r.amount),0)
  console.log(`  ${y}: ${rows.length} rows, ${sum.toLocaleString()}원`)
}

console.log('\n=== projects 실제 상태 ===')
const projs = await fetchAll('projects', 'source')
const bySrc = {}
projs.forEach(p => { const s=p.source||'(null)'; bySrc[s]=(bySrc[s]||0)+1 })
console.log(`  총: ${projs.length}, by source:`, bySrc)

console.log('\n=== 2026 월별 합계 (매출현황 확인용) ===')
const r2026 = await fetchAll('monthly_revenues', 'amount, month', q => q.eq('year', 2026))
const bm = {}
r2026.forEach(r => { bm[r.month] = (bm[r.month]||0) + Number(r.amount) })
for (let m=1; m<=12; m++) console.log(`  ${m}월: ${(bm[m]||0).toLocaleString()}`)
