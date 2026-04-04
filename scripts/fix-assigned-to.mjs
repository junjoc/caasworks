#!/usr/bin/env node
/**
 * pipeline_leads의 notes에서 "담당자: XXX"를 파싱하여
 * assigned_to UUID로 매핑하는 스크립트
 */

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

const SUPABASE_URL = 'https://lqoudbcuetrxemlkfkzv.supabase.co'

function getSupabaseKey() {
  const envPath = resolve(__dirname, '..', '.env.local')
  const envContent = readFileSync(envPath, 'utf-8')
  const srkMatch = envContent.match(/SUPABASE_SERVICE_ROLE_KEY=(.+)/)
  if (srkMatch) return srkMatch[1].trim()
  const anonMatch = envContent.match(/NEXT_PUBLIC_SUPABASE_ANON_KEY=(.+)/)
  return anonMatch[1].trim()
}

// 스태프 이름 → UUID 매핑
const STAFF_MAP = {
  '유라예': '7153dda1-ac94-4ff4-9807-dd09f93108b9',
  '최한별': '601a7500-aa0f-400b-960d-4643de136736',
  '박성언': '82b2d0cc-1d7b-4aab-a0db-5dc530f4da01',
  '전성환': '5fd61389-55d4-47c9-9609-d1175ab0fdae',
}

async function main() {
  console.log('=== Fix assigned_to from notes ===\n')

  const supabase = createClient(SUPABASE_URL, getSupabaseKey())

  // notes에 "담당자:" 가 포함된 리드 조회
  const { data: leads, error } = await supabase
    .from('pipeline_leads')
    .select('id, notes, assigned_to')
    .like('notes', '%담당자:%')

  if (error) {
    console.error('Query error:', error.message)
    return
  }

  console.log(`Found ${leads.length} leads with "담당자:" in notes\n`)

  let updated = 0
  let skipped = 0

  for (const lead of leads) {
    const match = lead.notes.match(/담당자:\s*([가-힣]{2,4})/)
    if (!match) { skipped++; continue }

    const name = match[1]
    const uuid = STAFF_MAP[name]
    if (!uuid) { skipped++; continue }

    // 이미 할당되어 있으면 스���
    if (lead.assigned_to === uuid) { skipped++; continue }

    // notes에서 "담당자: XXX" 제거하고 assigned_to 업데이트
    const cleanedNotes = lead.notes
      .replace(/담당자:\s*[가-힣]{2,4}\s*\|?\s*/, '')
      .replace(/^\s*\|\s*/, '')
      .replace(/\s*\|\s*$/, '')
      .trim() || null

    const { error: updateError } = await supabase
      .from('pipeline_leads')
      .update({
        assigned_to: uuid,
        notes: cleanedNotes,
      })
      .eq('id', lead.id)

    if (updateError) {
      console.error(`  Error updating ${lead.id}:`, updateError.message)
    } else {
      updated++
    }
  }

  console.log(`\n=== Complete ===`)
  console.log(`  Updated: ${updated}`)
  console.log(`  Skipped: ${skipped}`)
}

main().catch(err => {
  console.error('Fatal:', err)
  process.exit(1)
})
