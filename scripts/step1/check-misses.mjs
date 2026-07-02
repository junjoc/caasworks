import { readFileSync } from 'fs'
import { createClient } from '@supabase/supabase-js'
const env = readFileSync('.env.local', 'utf-8')
env.split('\n').forEach(l => { const m = l.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/); if (m) process.env[m[1]] = m[2].replace(/^"(.*)"$/, '$1') })
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
const normalize = (s) => (s || '').toString().replace(/\s+/g, '').replace(/[()（）\-·・㈜]/g, '').toLowerCase()
const stripSuffix = (s) => (s || '').toString().replace(/\s*\((선납|선불|후불|후납|카드|현금)\)\s*$/g, '').trim()
async function fetchAll(t, cols) { let all=[],size=1000; for(let f=0;;f+=size){const {data,error}=await sb.from(t).select(cols).range(f,f+size-1); if(error)throw error; if(!data||!data.length)break; all=all.concat(data); if(data.length<size)break} return all }

const customers = await fetchAll('customers', 'id, company_name')
const custByName = {}
for (const c of customers) {
  custByName[c.company_name] = c.id
  custByName[normalize(c.company_name)] = c.id
}
function findCust(company) {
  const stripped = stripSuffix(company)
  return custByName[company] || custByName[stripped] || custByName[normalize(company)] || custByName[normalize(stripped)]
}

const data26 = JSON.parse(readFileSync('/tmp/2026_v4.json', 'utf-8'))
const misses = new Set()
const missCount = new Map()
for (const r of data26) {
  if (!findCust(r.company)) {
    misses.add(r.company)
    missCount.set(r.company, (missCount.get(r.company) || 0) + 1)
  }
}
console.log(`매칭 실패: ${misses.size}개 회사`)
console.log('\n목록:')
;[...missCount.entries()].sort((a,b) => b[1]-a[1]).forEach(([c, n]) => console.log(`  ${n}회 · ${c}`))
