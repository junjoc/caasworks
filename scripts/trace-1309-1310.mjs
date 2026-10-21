#!/usr/bin/env node
import { google } from 'googleapis'
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'

try {
  const env = readFileSync(new URL('../.env.local', import.meta.url), 'utf-8')
  env.split('\n').forEach(line => {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)
    if (m) process.env[m[1]] = m[2].replace(/^"(.*)"$/, '$1').replace(/\\n/g, '\n')
  })
} catch {}

const SHEET_ID = '1ISGq9rkQe8LOlmS1-nCmWp95Lr34kpJ_jnp3OTaLFHQ'
const COL = { NO: 1, COMPANY: 4, PROJECT: 5, SERVICE: 8 }
const APRIL_COL = 25

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
const col = (r, i) => (r?.[i] || '').toString().trim()
const parseMoney = (s) => {
  if (!s) return 0
  const n = Number(s.toString().replace(/[,₩\s]/g, ''))
  return isNaN(n) ? 0 : n
}
const parseSheetNo = (s) => {
  const n = parseFloat(String(s).trim())
  return isNaN(n) ? null : n
}

function getAuth() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_KEY || ''
  let credentials
  try { credentials = JSON.parse(raw) }
  catch { credentials = JSON.parse(Buffer.from(raw, 'base64').toString('utf-8')) }
  return new google.auth.GoogleAuth({ credentials, scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'] })
}

// Read sheet for rows around 1309-1310
const sheets = google.sheets({ version: 'v4', auth: getAuth() })
const res = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: '현장별 전체 매출!A1:AZ5000' })
const rows = res.data.values || []

console.log('Sheet rows for 한국교통정책연구원(주) around NO 1309-1310:\n')
for (let i = 5; i < rows.length; i++) {
  const r = rows[i]
  const no = parseSheetNo(col(r, COL.NO))
  const company = col(r, COL.COMPANY)
  const project = col(r, COL.PROJECT)
  const amount = parseMoney(col(r, APRIL_COL))
  
  if (company.includes('교통') && no >= 1309 && no <= 1311) {
    console.log(`Row ${i+1}: NO=${no}, Company=${company}, Project=${project}, April=${amount}`)
  }
}
