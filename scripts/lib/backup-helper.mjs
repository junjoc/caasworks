// STEP 2-C: 파괴적 작업 전 자동 백업 헬퍼
// - DELETE/UPDATE 대량 작업 전 반드시 호출해서 snapshot 저장
// - 파일 위치: backups/auto-YYYY-MM-DDTHH-mm-{tag}.json
//
// 사용 예:
//   import { autoBackup } from './lib/backup-helper.mjs'
//   await autoBackup(sb, ['monthly_revenues', 'projects'], 'pre-rollback-2026')

import { writeFileSync, mkdirSync } from 'fs'

async function fetchAll(sb, t, cols = '*') {
  let all = [], size = 1000
  for (let f = 0; ; f += size) {
    const { data, error } = await sb.from(t).select(cols).range(f, f + size - 1)
    if (error) throw new Error(`${t}: ${error.message}`)
    if (!data || !data.length) break
    all = all.concat(data)
    if (data.length < size) break
  }
  return all
}

/**
 * 파괴적 작업 전 여러 테이블 자동 백업.
 * @param {SupabaseClient} sb Service Role 클라이언트
 * @param {string[]} tables 백업할 테이블 이름 배열
 * @param {string} tag 파일명 태그 (예: 'pre-rollback-2026')
 * @returns {string} 저장된 파일 경로
 */
export async function autoBackup(sb, tables, tag = 'auto') {
  const now = new Date()
  const stamp = now.toISOString().replace(/[:.]/g, '-').substring(0, 16)
  mkdirSync('backups', { recursive: true })
  const path = `backups/auto-${stamp}-${tag}.json`

  const snapshot = {
    meta: {
      created_at: now.toISOString(),
      tag,
      tables,
    },
  }
  for (const t of tables) {
    console.log(`  [backup] ${t}...`)
    const rows = await fetchAll(sb, t)
    snapshot[t] = rows
    console.log(`    ${rows.length} rows`)
  }

  writeFileSync(path, JSON.stringify(snapshot, null, 2))
  console.log(`  ✅ ${path}`)
  return path
}

/**
 * 백업 파일에서 복원. 트랜잭션 없이 그냥 upsert 로 되돌림.
 * (진짜 롤백은 파괴적 작업 전에 사용자가 확인해야 함)
 */
export async function restoreFromBackup(sb, backupPath, tables) {
  const { readFileSync } = await import('fs')
  const snapshot = JSON.parse(readFileSync(backupPath, 'utf-8'))
  for (const t of tables) {
    if (!snapshot[t]) continue
    console.log(`  [restore] ${t}: ${snapshot[t].length} rows`)
    for (let i = 0; i < snapshot[t].length; i += 500) {
      const batch = snapshot[t].slice(i, i + 500)
      const { error } = await sb.from(t).upsert(batch)
      if (error) console.log(`    ❌ batch ${i}: ${error.message}`)
    }
  }
}
