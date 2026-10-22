// 매출 시트 동기화 미리보기 (로컬) — 서버와 같은 코드(src/lib/sheet-sync)로 바뀔 내용만 출력. node scripts/sync/sheet-sync-preview.cjs
const fs = require('fs'); fs.readFileSync('.env.local','utf8').split('\n').forEach(l => { const m = l.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/); if (m) process.env[m[1]] = m[2].replace(/^"(.*)"$/, '$1') })
const jiti = require('jiti')(__filename, { interopDefault: true })
const { createClient } = require('@supabase/supabase-js')
const { runSheetSync } = jiti('../../src/lib/sheet-sync/index.ts')
;(async () => {
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
  const r = await runSheetSync(sb, { apply: false, trigger: 'preview' })
  console.log('ok', r.ok, 'held', r.held, 'ms', r.ms)
  for (const s of r.steps) { console.log('\n==', s.name, s.held ? '⚠ ' + s.held : '', s.error || ''); console.log(JSON.stringify(s.summary)); (s.samples || []).forEach(x => console.log('  ', x)) }
})()
