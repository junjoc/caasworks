#!/usr/bin/env node
/**
 * Projects + Monthly Revenues 재임포트 스크립트
 * seed-full.mjs의 STEP 4를 독립 실행
 * service_role 키 사용 (RLS 우회)
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
  throw new Error('SUPABASE_SERVICE_ROLE_KEY not found')
}

const CSV_PATH = '/tmp/revenue_all.csv'

// CSV parser
function parseCSV(text) {
  const rows = []
  let current = []
  let field = ''
  let inQuotes = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (inQuotes) {
      if (ch === '"') {
        if (i + 1 < text.length && text[i + 1] === '"') {
          field += '"'; i++
        } else {
          inQuotes = false
        }
      } else {
        field += ch
      }
    } else {
      if (ch === '"') {
        inQuotes = true
      } else if (ch === ',') {
        current.push(field); field = ''
      } else if (ch === '\n' || (ch === '\r' && text[i + 1] === '\n')) {
        current.push(field); field = ''
        if (ch === '\r') i++
        rows.push(current); current = []
      } else if (ch === '\r') {
        current.push(field); field = ''
        rows.push(current); current = []
      } else {
        field += ch
      }
    }
  }
  if (field || current.length > 0) {
    current.push(field)
    rows.push(current)
  }
  return rows
}

function col(row, idx) { return (row[idx] || '').trim() }

function parseDate(s) {
  if (!s) return null
  s = s.trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s
  const m = s.match(/^(\d{4})\.\s*(\d{1,2})\.\s*(\d{1,2})$/)
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`
  return null
}

function parseMoney(s) {
  if (!s) return null
  s = s.trim().replace(/[₩￦\s,]/g, '')
  if (!s || isNaN(Number(s))) return null
  const n = Number(s)
  return n === 0 ? null : n
}

async function main() {
  console.log('=== Projects & Revenue Reimport ===\n')

  const supabase = createClient(SUPABASE_URL, getSupabaseKey())

  // Load CSV
  console.log('1. Loading CSV...')
  const csvRevenue = parseCSV(readFileSync(CSV_PATH, 'utf-8'))
  console.log(`   ${csvRevenue.length} rows loaded\n`)

  // Get customers
  console.log('2. Fetching customers...')
  const { data: allCust } = await supabase
    .from('customers')
    .select('id, customer_code, company_name')
    .limit(2000)

  const custByName = {}
  const custByCode = {}
  for (const c of (allCust || [])) {
    if (c.customer_code) custByCode[c.customer_code] = c.id
    if (c.company_name) custByName[c.company_name] = c.id
  }
  console.log(`   ${allCust?.length || 0} customers loaded\n`)

  // Parse revenue CSV
  console.log('3. Parsing projects from CSV...')
  const YEAR = 2026
  const MONTH_COLS = [22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33]

  const projectsMap = new Map()

  for (let i = 0; i < csvRevenue.length; i++) {
    const row = csvRevenue[i]
    const noStr = col(row, 1)
    if (!noStr) continue
    const noVal = parseFloat(noStr)
    if (isNaN(noVal)) continue
    if (noStr === '복사') continue

    const companyName = col(row, 4)
    if (!companyName) continue

    const projectName = col(row, 5) || companyName
    const serviceName = col(row, 8) || ''
    const siteCategory = col(row, 6) || null
    const siteCategory2 = col(row, 7) || null
    const billingStart = parseDate(col(row, 9))
    const billingEnd = parseDate(col(row, 10))
    const projectStart = parseDate(col(row, 2))
    const projectEnd = parseDate(col(row, 3))
    const billingMethod = col(row, 13) || null
    const notes = col(row, 11) || null

    const monthlyRevenues = []
    for (let m = 0; m < 12; m++) {
      const amount = parseMoney(col(row, MONTH_COLS[m]))
      if (amount && amount > 0) {
        monthlyRevenues.push({ month: m + 1, amount })
      }
    }

    const key = `${companyName}||${projectName}||${serviceName}||${noVal}`

    if (!projectsMap.has(key)) {
      projectsMap.set(key, {
        companyName,
        projectName: serviceName ? `${projectName} - ${serviceName}` : projectName,
        serviceType: serviceName || null,
        siteCategory,
        siteCategory2,
        billingStart,
        billingEnd,
        projectStart,
        projectEnd,
        billingMethod,
        notes,
        revenues: monthlyRevenues,
      })
    }
  }

  console.log(`   Parsed ${projectsMap.size} project rows\n`)

  // Insert
  console.log('4. Inserting projects & revenues...')
  let projSuccess = 0, projError = 0, revSuccess = 0, revError = 0
  const existingProjKeys = new Set()

  const normalize = (s) => s.replace(/\s+/g, '').replace(/[()（）\-·・]/g, '').toLowerCase()

  const projectEntries = Array.from(projectsMap.values())

  for (let i = 0; i < projectEntries.length; i++) {
    const p = projectEntries[i]

    let customerId = custByName[p.companyName]
    if (!customerId) {
      const normalizedName = normalize(p.companyName)
      const fuzzyMatch = Object.entries(custByName).find(([k]) => normalize(k) === normalizedName)
      if (fuzzyMatch) customerId = fuzzyMatch[1]
    }
    if (!customerId) {
      projError++
      if (projError <= 10) console.error(`   No customer: ${p.companyName}`)
      continue
    }

    const projKey = `${customerId}||${p.projectName}`
    if (existingProjKeys.has(projKey)) {
      // Skip duplicate
      continue
    }

    let monthlyAmount = null
    if (p.revenues.length > 0) {
      const total = p.revenues.reduce((s, r) => s + r.amount, 0)
      monthlyAmount = Math.round(total / p.revenues.length)
    }

    let projectStatus = 'active'
    if (p.billingEnd) {
      const endDate = new Date(p.billingEnd)
      if (endDate < new Date()) projectStatus = 'completed'
    }

    const { data: projData, error: projErr } = await supabase
      .from('projects')
      .insert([{
        customer_id: customerId,
        project_name: p.projectName,
        project_start: p.projectStart,
        project_end: p.projectEnd,
        service_type: p.serviceType,
        site_category: p.siteCategory,
        site_category2: p.siteCategory2,
        billing_start: p.billingStart,
        billing_end: p.billingEnd,
        monthly_amount: monthlyAmount,
        billing_method: p.billingMethod,
        status: projectStatus,
        notes: p.notes ? p.notes.substring(0, 2000) : null,
      }])
      .select('id')
      .single()

    if (projErr) {
      projError++
      if (projError <= 10) console.error(`   Project error [${p.companyName} - ${p.projectName}]: ${projErr.message}`)
      continue
    }

    const projectId = projData.id
    existingProjKeys.add(projKey)
    projSuccess++

    // Insert monthly revenues
    if (p.revenues.length > 0) {
      const revBatch = p.revenues.map((r) => ({
        project_id: projectId,
        customer_id: customerId,
        year: YEAR,
        month: r.month,
        amount: r.amount,
        is_confirmed: r.month <= 3,
      }))

      const { error: revErr } = await supabase
        .from('monthly_revenues')
        .upsert(revBatch, { onConflict: 'project_id,year,month', ignoreDuplicates: false })

      if (revErr) {
        for (const rev of revBatch) {
          const { error: e2 } = await supabase
            .from('monthly_revenues')
            .upsert([rev], { onConflict: 'project_id,year,month', ignoreDuplicates: false })
          if (e2) revError++
          else revSuccess++
        }
      } else {
        revSuccess += revBatch.length
      }
    }

    if ((i + 1) % 100 === 0) {
      console.log(`   Progress: ${i + 1}/${projectEntries.length}`)
    }
  }

  console.log(`\n=== Complete ===`)
  console.log(`  Projects: ${projSuccess} ok, ${projError} errors`)
  console.log(`  Revenues: ${revSuccess} ok, ${revError} errors`)

  // Verify
  const { count: pc } = await supabase.from('projects').select('*', { count: 'exact', head: true })
  const { count: rc } = await supabase.from('monthly_revenues').select('*', { count: 'exact', head: true })
  console.log(`\n  Final: ${pc} projects, ${rc} revenues`)
}

main().catch(err => {
  console.error('Fatal:', err)
  process.exit(1)
})
