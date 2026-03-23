#!/usr/bin/env node
// ============================================================
// CaaS.Works CRM - Full Data Import Script
// Imports customers, pipeline leads, inbound leads,
// projects, and monthly revenues from Google Sheets CSVs.
// ============================================================

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';

// ── Config ──────────────────────────────────────────────────
const SUPABASE_URL = 'https://lqoudbcuetrxemlkfkzv.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_hMEihd9xHDUh3GO7YczeHg_HIh1nojf';
const AUTH_EMAIL = 'cso@ai-con.co.kr';
const AUTH_PASSWORD = 'CaasWorks2026!';
const ADMIN_USER_ID = '5fd61389-55d4-47c9-9609-d1175ab0fdae';

const CSV_PATHS = {
  customers: '/tmp/customer_list.csv',
  revenue: '/tmp/revenue_all.csv',
  inbound: '/tmp/inbound.csv',
  pipeline: '/tmp/pipeline.csv',
};

// ── CSV Parser (handles quoted fields with newlines, commas) ─
function parseCSV(text) {
  const rows = [];
  let current = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const next = text[i + 1];

    if (inQuotes) {
      if (ch === '"' && next === '"') {
        field += '"';
        i++; // skip escaped quote
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        field += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ',') {
        current.push(field);
        field = '';
      } else if (ch === '\n' || (ch === '\r' && next === '\n')) {
        current.push(field);
        field = '';
        rows.push(current);
        current = [];
        if (ch === '\r') i++; // skip \n in \r\n
      } else if (ch === '\r') {
        current.push(field);
        field = '';
        rows.push(current);
        current = [];
      } else {
        field += ch;
      }
    }
  }
  // last field/row
  if (field || current.length > 0) {
    current.push(field);
    rows.push(current);
  }
  return rows;
}

// ── Helpers ──────────────────────────────────────────────────
function col(row, idx) {
  return (row[idx] || '').trim();
}

function parseDate(s) {
  if (!s) return null;
  s = s.trim();
  // Handle YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  // Handle YYYY. M. D or similar
  const m = s.match(/^(\d{4})\.\s*(\d{1,2})\.\s*(\d{1,2})$/);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  return null;
}

function parseMoney(s) {
  if (!s) return null;
  s = s.trim();
  // Remove ₩, ￦, commas, spaces
  s = s.replace(/[₩￦\s,]/g, '');
  if (!s || isNaN(Number(s))) return null;
  const n = Number(s);
  return n === 0 ? null : n;
}

function parseInt2(s) {
  if (!s) return null;
  s = s.trim().replace(/,/g, '');
  const n = parseInt(s, 10);
  return isNaN(n) ? null : n;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// Map 대응현황 to pipeline stage
function mapStage(status) {
  if (!status) return '신규리드';
  const s = status.trim();
  if (s === '도입완료') return '도입완료';
  if (s === '소통종료' || s === '자연이탈' || s === '대기') return '컨택';
  if (s === '상담중' || s === '상담예정') return '컨택';
  if (s === '미팅' || s === '미팅예정' || s === '미팅완료') return '미팅';
  if (s === '견적발송' || s === '제안서 발송' || s === '제안') return '제안';
  if (s === '계약진행' || s === '계약완료' || s === '계약') return '계약';
  if (s === '도입예정' || s === '도입진행') return '계약';
  // default
  return '신규리드';
}

// ── Main ─────────────────────────────────────────────────────
async function main() {
  console.log('=== CaaS.Works CRM Full Data Import ===\n');

  // 1. Create Supabase client & auth
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  console.log('[AUTH] Signing in...');
  const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
    email: AUTH_EMAIL,
    password: AUTH_PASSWORD,
  });
  if (authError) {
    console.error('Auth failed:', authError.message);
    process.exit(1);
  }
  console.log('[AUTH] Signed in as', authData.user.email, '\n');

  // 2. Load CSV files
  console.log('[CSV] Loading CSV files...');
  const csvCustomers = parseCSV(readFileSync(CSV_PATHS.customers, 'utf-8'));
  const csvRevenue = parseCSV(readFileSync(CSV_PATHS.revenue, 'utf-8'));
  const csvInbound = parseCSV(readFileSync(CSV_PATHS.inbound, 'utf-8'));
  const csvPipeline = parseCSV(readFileSync(CSV_PATHS.pipeline, 'utf-8'));
  console.log(`  customers: ${csvCustomers.length} rows`);
  console.log(`  revenue:   ${csvRevenue.length} rows`);
  console.log(`  inbound:   ${csvInbound.length} rows`);
  console.log(`  pipeline:  ${csvPipeline.length} rows\n`);

  // ═══════════════════════════════════════════════════════════
  // STEP 1: Import Customers
  // ═══════════════════════════════════════════════════════════
  console.log('═══ STEP 1: Importing Customers ═══');
  const customerRows = [];

  for (let i = 0; i < csvCustomers.length; i++) {
    const row = csvCustomers[i];
    // Data rows have a number in col[1] (NO.)
    const no = col(row, 1);
    if (!no || isNaN(parseInt(no, 10))) continue;

    const customerCode = col(row, 5);
    const companyName = col(row, 8);
    if (!companyName) continue;

    // Determine status
    const billingEndRaw = col(row, 2);
    const blockDateRaw = col(row, 3);
    const churnDateRaw = col(row, 4);
    let status = 'active';
    if (churnDateRaw && parseDate(churnDateRaw)) {
      status = 'churned';
    } else if (blockDateRaw && parseDate(blockDateRaw)) {
      status = 'suspended';
    } else if (billingEndRaw === '무상지원' || billingEndRaw === '진행중') {
      status = 'active';
    } else if (billingEndRaw && parseDate(billingEndRaw)) {
      // has a billing end date - check if it's past
      status = 'active';
    }

    const billingStart = parseDate(col(row, 6));
    const userCount = parseInt2(col(row, 7));
    const companyType = col(row, 9) || null;
    const contactPerson = col(row, 10) || null;
    const contactPhone = col(row, 11) || null;
    const billingType = col(row, 12) || null;
    const notes = col(row, 13) || null;
    const invoiceEmail = col(row, 14) || null;
    const invoiceContact = col(row, 15) || null;
    const invoicePhone = col(row, 16) || null;
    const taxInvoiceEmail = col(row, 18) || null;

    // billing_end: use parsed date from col[2] if it's a real date (not "진행중" or "무상지원")
    let billingEnd = null;
    if (billingEndRaw && billingEndRaw !== '진행중' && billingEndRaw !== '무상지원') {
      billingEnd = parseDate(billingEndRaw);
    }

    // deposit
    const depositAmount = parseMoney(col(row, 22));
    const depositPaidAt = parseDate(col(row, 23));

    // business_reg_no = col[17] filename (not actual biz reg no, but store as reference)
    const businessRegNo = col(row, 17) || null;

    customerRows.push({
      customer_code: customerCode || null,
      company_name: companyName,
      company_type: companyType,
      contact_person: contactPerson,
      contact_phone: contactPhone,
      assigned_to: ADMIN_USER_ID,
      billing_type: billingType,
      billing_start: billingStart,
      billing_end: billingEnd,
      user_count: userCount,
      status,
      invoice_email: invoiceEmail,
      invoice_contact: invoiceContact,
      invoice_phone: invoicePhone,
      business_reg_no: businessRegNo,
      tax_invoice_email: taxInvoiceEmail,
      deposit_amount: depositAmount,
      deposit_paid_at: depositPaidAt,
      notes,
    });
  }

  console.log(`  Parsed ${customerRows.length} customers`);

  // Upsert in batches
  let custSuccess = 0;
  let custError = 0;
  const BATCH = 50;

  for (let i = 0; i < customerRows.length; i += BATCH) {
    const batch = customerRows.slice(i, i + BATCH);
    const { data, error } = await supabase
      .from('customers')
      .upsert(batch, { onConflict: 'customer_code', ignoreDuplicates: false })
      .select('id, customer_code');

    if (error) {
      console.error(`  Batch ${i}-${i + batch.length} error:`, error.message);
      // Try one by one
      for (const row of batch) {
        const { error: e2 } = await supabase
          .from('customers')
          .upsert([row], { onConflict: 'customer_code', ignoreDuplicates: false });
        if (e2) {
          custError++;
          if (custError <= 5) console.error(`    Single error [${row.company_name}]:`, e2.message);
        } else {
          custSuccess++;
        }
      }
    } else {
      custSuccess += batch.length;
    }
  }

  console.log(`  Customers: ${custSuccess} ok, ${custError} errors\n`);

  // Build customer lookup by company_name and customer_code
  await sleep(500);
  const { data: allCustomers } = await supabase
    .from('customers')
    .select('id, customer_code, company_name')
    .limit(2000);

  const custByCode = {};
  const custByName = {};
  for (const c of (allCustomers || [])) {
    if (c.customer_code) custByCode[c.customer_code] = c.id;
    if (c.company_name) custByName[c.company_name] = c.id;
  }
  console.log(`  Customer lookup built: ${Object.keys(custByCode).length} by code, ${Object.keys(custByName).length} by name\n`);

  // ═══════════════════════════════════════════════════════════
  // STEP 2: Import Pipeline Leads (from pipeline.csv)
  // ═══════════════════════════════════════════════════════════
  console.log('═══ STEP 2: Importing Pipeline Leads ═══');

  const pipelineRows = [];

  for (let i = 0; i < csvPipeline.length; i++) {
    const row = csvPipeline[i];
    const no = col(row, 1);
    if (!no || isNaN(parseInt(no, 10))) continue;

    const companyName = col(row, 5);
    if (!companyName) continue;

    const customerCode = col(row, 2) || null;
    const inquiryDate = parseDate(col(row, 3));
    const bizCategory = col(row, 4) || null;
    const contactPerson = col(row, 6) || null;
    const contactPhone = col(row, 9) || null;
    const contactEmail = col(row, 10) || null;
    const inquiryChannel = col(row, 11) || null;
    const inquirySource = col(row, 12) || null;
    const inquiryContent = col(row, 15) || null;
    const stage = mapStage(col(row, 24));
    const consultContent = col(row, 20) || null;
    const convertedDate = parseDate(col(row, 25));

    // core_need = 소재 대분류 + 소분류
    const needMajor = col(row, 16) || '';
    const needMinor = col(row, 17) || '';
    const coreNeed = [needMajor, needMinor].filter(Boolean).join(' > ') || null;

    // Build notes from various fields
    const notesParts = [];
    if (bizCategory) notesParts.push(`사업분류: ${bizCategory}`);
    if (col(row, 18)) notesParts.push(`공사타입: ${col(row, 18)}`);
    if (col(row, 21)) notesParts.push(`문서발송: ${col(row, 21)}`);
    if (col(row, 22)) notesParts.push(`견적금액: ${col(row, 22)}`);
    if (col(row, 23)) notesParts.push(`도입 예상시점: ${col(row, 23)}`);
    if (consultContent) notesParts.push(`상담내용: ${consultContent.substring(0, 500)}`);
    const notes = notesParts.length ? notesParts.join('\n') : null;

    // Lookup customer_id
    let customerId = null;
    if (customerCode && custByCode[customerCode]) {
      customerId = custByCode[customerCode];
    } else if (custByName[companyName]) {
      customerId = custByName[companyName];
    }

    pipelineRows.push({
      customer_code: customerCode,
      company_name: companyName,
      contact_person: contactPerson,
      contact_phone: contactPhone,
      contact_email: contactEmail,
      stage,
      core_need: coreNeed,
      inquiry_source: inquirySource || inquiryChannel,
      inquiry_content: inquiryContent,
      assigned_to: ADMIN_USER_ID,
      notes,
      created_at: inquiryDate ? new Date(inquiryDate).toISOString() : undefined,
      converted_at: convertedDate ? new Date(convertedDate).toISOString() : undefined,
      customer_id: customerId,
    });
  }

  console.log(`  Parsed ${pipelineRows.length} pipeline leads`);

  let pipeSuccess = 0;
  let pipeError = 0;

  for (let i = 0; i < pipelineRows.length; i += BATCH) {
    const batch = pipelineRows.slice(i, i + BATCH);
    const { error } = await supabase
      .from('pipeline_leads')
      .upsert(batch, { onConflict: 'customer_code', ignoreDuplicates: false });

    if (error) {
      // Try one by one
      for (const row of batch) {
        // If no customer_code, just insert (can't upsert without unique key)
        if (!row.customer_code) {
          const { error: e2 } = await supabase
            .from('pipeline_leads')
            .insert([row]);
          if (e2) {
            pipeError++;
            if (pipeError <= 5) console.error(`    Insert error [${row.company_name}]:`, e2.message);
          } else {
            pipeSuccess++;
          }
        } else {
          const { error: e2 } = await supabase
            .from('pipeline_leads')
            .upsert([row], { onConflict: 'customer_code', ignoreDuplicates: false });
          if (e2) {
            pipeError++;
            if (pipeError <= 5) console.error(`    Upsert error [${row.company_name}]:`, e2.message);
          } else {
            pipeSuccess++;
          }
        }
      }
    } else {
      pipeSuccess += batch.length;
    }
  }
  console.log(`  Pipeline: ${pipeSuccess} ok, ${pipeError} errors\n`);

  // ═══════════════════════════════════════════════════════════
  // STEP 3: Import Inbound Leads (from inbound.csv)
  // ═══════════════════════════════════════════════════════════
  console.log('═══ STEP 3: Importing Inbound Leads ═══');

  // Build a set of existing customer_codes from pipeline to avoid duplicates
  const { data: existingLeads } = await supabase
    .from('pipeline_leads')
    .select('customer_code')
    .not('customer_code', 'is', null)
    .limit(5000);

  const existingCodes = new Set((existingLeads || []).map((l) => l.customer_code).filter(Boolean));
  console.log(`  Existing pipeline codes: ${existingCodes.size}`);

  const inboundRows = [];

  for (let i = 0; i < csvInbound.length; i++) {
    const row = csvInbound[i];
    const customerCode = col(row, 1);
    // Must have a customer_code that looks like a number/ID
    if (!customerCode || !/^\d/.test(customerCode)) continue;

    const companyName = col(row, 4);
    if (!companyName) continue;

    // Skip if already exists in pipeline
    if (existingCodes.has(customerCode)) continue;

    const inquiryDate = parseDate(col(row, 2));
    const bizCategory = col(row, 3) || null;
    const contactPerson = col(row, 5) || null;
    const contactPhone = col(row, 8) || null;
    const contactEmail = col(row, 9) || null;
    const inquiryChannel = col(row, 10) || null;
    const inquirySource = col(row, 11) || null;
    const inquiryContent = col(row, 14) || null;
    const stage = mapStage(col(row, 24));

    const needMajor = col(row, 15) || '';
    const needMinor = col(row, 16) || '';
    const coreNeed = [needMajor, needMinor].filter(Boolean).join(' > ') || null;

    const notesParts = [];
    if (bizCategory) notesParts.push(`사업분류: ${bizCategory}`);
    if (col(row, 17)) notesParts.push(`공사타입: ${col(row, 17)}`);
    if (col(row, 6)) notesParts.push(`직급: ${col(row, 6)}`);
    if (col(row, 21)) notesParts.push(`문서발송: ${col(row, 21)}`);
    if (col(row, 22)) notesParts.push(`견적금액: ${col(row, 22)}`);
    if (col(row, 23)) notesParts.push(`도입 예상시점: ${col(row, 23)}`);
    const consultContent = col(row, 20) || null;
    if (consultContent) notesParts.push(`상담내용: ${consultContent.substring(0, 500)}`);
    const notes = notesParts.length ? notesParts.join('\n') : null;

    const convertedDateStr = col(row, 26);
    const convertedDate = parseDate(convertedDateStr);

    let customerId = null;
    if (custByCode[customerCode]) {
      customerId = custByCode[customerCode];
    } else if (custByName[companyName]) {
      customerId = custByName[companyName];
    }

    inboundRows.push({
      customer_code: customerCode,
      company_name: companyName,
      contact_person: contactPerson,
      contact_phone: contactPhone,
      contact_email: contactEmail,
      stage,
      core_need: coreNeed,
      inquiry_source: inquirySource || inquiryChannel,
      inquiry_content: inquiryContent,
      assigned_to: ADMIN_USER_ID,
      notes,
      created_at: inquiryDate ? new Date(inquiryDate).toISOString() : undefined,
      converted_at: convertedDate ? new Date(convertedDate).toISOString() : undefined,
      customer_id: customerId,
    });
  }

  console.log(`  Parsed ${inboundRows.length} inbound leads (excluding duplicates)`);

  let inbSuccess = 0;
  let inbError = 0;

  for (let i = 0; i < inboundRows.length; i += BATCH) {
    const batch = inboundRows.slice(i, i + BATCH);
    const { error } = await supabase
      .from('pipeline_leads')
      .upsert(batch, { onConflict: 'customer_code', ignoreDuplicates: false });

    if (error) {
      for (const row of batch) {
        if (!row.customer_code) {
          const { error: e2 } = await supabase.from('pipeline_leads').insert([row]);
          if (e2) { inbError++; } else { inbSuccess++; }
        } else {
          const { error: e2 } = await supabase
            .from('pipeline_leads')
            .upsert([row], { onConflict: 'customer_code', ignoreDuplicates: false });
          if (e2) {
            inbError++;
            if (inbError <= 3) console.error(`    Inbound error [${row.company_name}]:`, e2.message);
          } else {
            inbSuccess++;
          }
        }
      }
    } else {
      inbSuccess += batch.length;
    }
  }
  console.log(`  Inbound: ${inbSuccess} ok, ${inbError} errors\n`);

  // ═══════════════════════════════════════════════════════════
  // STEP 4: Import Projects & Monthly Revenues (from revenue_all.csv)
  // ═══════════════════════════════════════════════════════════
  console.log('═══ STEP 4: Importing Projects & Revenue ═══');

  // Re-fetch customers (might have more now)
  const { data: allCust2 } = await supabase
    .from('customers')
    .select('id, customer_code, company_name')
    .limit(2000);
  const custByName2 = {};
  const custByCode2 = {};
  for (const c of (allCust2 || [])) {
    if (c.customer_code) custByCode2[c.customer_code] = c.id;
    if (c.company_name) custByName2[c.company_name] = c.id;
  }

  // Revenue CSV layout:
  // col[1]=NO., col[2]=proj start, col[3]=proj end, col[4]=회사명, col[5]=프로젝트명
  // col[6]=현장구분, col[7]=현장구분2, col[8]=이용서비스, col[9]=과금시작일, col[10]=과금종료일
  // col[11]=비고, col[13]=과금방식
  // Monthly amounts: col[22]=1월 ... col[33]=12월
  // The year is 2026 (from the first row of the CSV)

  const YEAR = 2026;
  const MONTH_COLS = [22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33]; // 1월~12월

  // First pass: collect unique (company_name, project_name) combos
  const projectsMap = new Map(); // key: "company|project|service" -> { ...projectData, revenues: [] }

  for (let i = 0; i < csvRevenue.length; i++) {
    const row = csvRevenue[i];
    const noStr = col(row, 1);
    // Skip non-data rows (header, summary, "복사" template row, etc.)
    if (!noStr) continue;
    // NO. must be a number (possibly decimal like 30.63)
    const noVal = parseFloat(noStr);
    if (isNaN(noVal)) continue;
    if (noStr === '복사') continue;

    const companyName = col(row, 4);
    if (!companyName) continue;

    const projectName = col(row, 5) || companyName;
    const serviceName = col(row, 8) || '';
    const siteCategory = col(row, 6) || null;
    const siteCategory2 = col(row, 7) || null;
    const billingStart = parseDate(col(row, 9));
    const billingEnd = parseDate(col(row, 10));
    const projectStart = parseDate(col(row, 2));
    const projectEnd = parseDate(col(row, 3));
    const billingMethod = col(row, 13) || null;
    const notes = col(row, 11) || null;

    // Parse monthly revenues
    const monthlyRevenues = [];
    for (let m = 0; m < 12; m++) {
      const amount = parseMoney(col(row, MONTH_COLS[m]));
      if (amount && amount > 0) {
        monthlyRevenues.push({ month: m + 1, amount });
      }
    }

    // Create a unique key for each project row (each service line is its own project)
    const key = `${companyName}||${projectName}||${serviceName}||${noVal}`;

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
      });
    }
  }

  console.log(`  Parsed ${projectsMap.size} project rows from revenue CSV`);

  // Insert projects & revenues
  let projSuccess = 0;
  let projError = 0;
  let revSuccess = 0;
  let revError = 0;

  // We need to lookup or create projects
  // First, get existing projects to avoid duplicates
  const { data: existingProjects } = await supabase
    .from('projects')
    .select('id, customer_id, project_name, service_type')
    .limit(5000);

  const existingProjKeys = new Set(
    (existingProjects || []).map((p) => `${p.customer_id}||${p.project_name}`)
  );

  const projectEntries = Array.from(projectsMap.values());

  for (let i = 0; i < projectEntries.length; i++) {
    const p = projectEntries[i];

    // Find customer_id
    const customerId = custByName2[p.companyName];
    if (!customerId) {
      projError++;
      if (projError <= 5) console.error(`    No customer found for: ${p.companyName}`);
      continue;
    }

    const projKey = `${customerId}||${p.projectName}`;

    // Calculate monthly_amount as average of non-zero months
    let monthlyAmount = null;
    if (p.revenues.length > 0) {
      const total = p.revenues.reduce((s, r) => s + r.amount, 0);
      monthlyAmount = Math.round(total / p.revenues.length);
    }

    // Determine project status
    let projectStatus = 'active';
    if (p.billingEnd) {
      const endDate = new Date(p.billingEnd);
      if (endDate < new Date()) projectStatus = 'completed';
    }

    // Insert project
    let projectId = null;

    if (existingProjKeys.has(projKey)) {
      // Get existing project ID
      const existing = (existingProjects || []).find(
        (ep) => ep.customer_id === customerId && ep.project_name === p.projectName
      );
      if (existing) {
        projectId = existing.id;
        projSuccess++;
      }
    }

    if (!projectId) {
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
          status: projectStatus,
          notes: p.notes ? p.notes.substring(0, 2000) : null,
        }])
        .select('id')
        .single();

      if (projErr) {
        projError++;
        if (projError <= 5) console.error(`    Project insert error [${p.companyName} - ${p.projectName}]:`, projErr.message);
        continue;
      }
      projectId = projData.id;
      projSuccess++;
    }

    // Insert monthly revenues
    if (p.revenues.length > 0 && projectId) {
      const revBatch = p.revenues.map((r) => ({
        project_id: projectId,
        customer_id: customerId,
        year: YEAR,
        month: r.month,
        amount: r.amount,
        is_confirmed: r.month <= 3, // Jan-Mar 2026 confirmed (we're in March 2026)
      }));

      const { error: revErr } = await supabase
        .from('monthly_revenues')
        .upsert(revBatch, { onConflict: 'project_id,year,month', ignoreDuplicates: false });

      if (revErr) {
        // Try one by one
        for (const rev of revBatch) {
          const { error: e2 } = await supabase
            .from('monthly_revenues')
            .upsert([rev], { onConflict: 'project_id,year,month', ignoreDuplicates: false });
          if (e2) {
            revError++;
          } else {
            revSuccess++;
          }
        }
      } else {
        revSuccess += revBatch.length;
      }
    }

    // Log progress every 100 projects
    if ((i + 1) % 100 === 0) {
      console.log(`  Progress: ${i + 1}/${projectEntries.length} projects processed`);
    }
  }

  console.log(`  Projects: ${projSuccess} ok, ${projError} errors`);
  console.log(`  Revenues: ${revSuccess} ok, ${revError} errors\n`);

  // ═══════════════════════════════════════════════════════════
  // STEP 5: Import Pipeline Lead revenues (from pipeline.csv)
  // These are leads with revenue projections - cols 28-39 = 2026 1월~12월
  // ═══════════════════════════════════════════════════════════
  console.log('═══ STEP 5: Pipeline lead revenue projections ═══');

  // Re-fetch all pipeline leads
  const { data: allLeads } = await supabase
    .from('pipeline_leads')
    .select('id, customer_code, company_name, customer_id')
    .limit(5000);

  const leadByCode = {};
  const leadByName = {};
  for (const l of (allLeads || [])) {
    if (l.customer_code) leadByCode[l.customer_code] = l;
    if (l.company_name) leadByName[l.company_name] = l;
  }

  // Pipeline CSV monthly revenue cols: 28-39 = 2026 1월~12월
  const PIPE_MONTH_COLS = [28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39];
  let pipeRevCount = 0;

  for (let i = 0; i < csvPipeline.length; i++) {
    const row = csvPipeline[i];
    const no = col(row, 1);
    if (!no || isNaN(parseInt(no, 10))) continue;

    const companyName = col(row, 5);
    const customerCode = col(row, 2);
    if (!companyName) continue;

    // Check if any monthly revenue exists
    let hasRevenue = false;
    for (const mc of PIPE_MONTH_COLS) {
      if (parseMoney(col(row, mc))) { hasRevenue = true; break; }
    }
    if (!hasRevenue) continue;

    // Find the customer (the pipeline lead that converted should link to a customer)
    const lead = leadByCode[customerCode] || leadByName[companyName];
    if (!lead || !lead.customer_id) continue;

    const customerId = lead.customer_id;

    // Create a project for this pipeline lead revenue
    const projName = `파이프라인 - ${companyName}`;
    const { data: projData, error: projErr } = await supabase
      .from('projects')
      .upsert([{
        customer_id: customerId,
        project_name: projName,
        status: 'active',
        notes: '파이프라인에서 생성된 프로젝트',
      }], { onConflict: 'customer_id,project_name' }) // won't work without unique constraint, so use insert
      .select('id')
      .single();

    // If upsert fails (no unique constraint), try finding existing then insert
    let projectId = projData?.id;
    if (!projectId) {
      const { data: existing } = await supabase
        .from('projects')
        .select('id')
        .eq('customer_id', customerId)
        .eq('project_name', projName)
        .single();

      if (existing) {
        projectId = existing.id;
      } else {
        const { data: newProj, error: newErr } = await supabase
          .from('projects')
          .insert([{
            customer_id: customerId,
            project_name: projName,
            status: 'active',
            notes: '파이프라인에서 생성된 프로젝트',
          }])
          .select('id')
          .single();
        if (newErr) continue;
        projectId = newProj.id;
      }
    }

    if (!projectId) continue;

    // Insert monthly revenues
    const revBatch = [];
    for (let m = 0; m < 12; m++) {
      const amount = parseMoney(col(row, PIPE_MONTH_COLS[m]));
      if (amount && amount > 0) {
        revBatch.push({
          project_id: projectId,
          customer_id: customerId,
          year: YEAR,
          month: m + 1,
          amount,
          is_confirmed: m + 1 <= 3,
        });
      }
    }

    if (revBatch.length > 0) {
      const { error } = await supabase
        .from('monthly_revenues')
        .upsert(revBatch, { onConflict: 'project_id,year,month', ignoreDuplicates: false });
      if (!error) pipeRevCount += revBatch.length;
    }
  }

  console.log(`  Pipeline revenues inserted: ${pipeRevCount}\n`);

  // ═══════════════════════════════════════════════════════════
  // FINAL: Summary
  // ═══════════════════════════════════════════════════════════
  console.log('═══ FINAL SUMMARY ═══');

  const counts = {};
  for (const table of ['customers', 'pipeline_leads', 'projects', 'monthly_revenues']) {
    const { count } = await supabase.from(table).select('*', { count: 'exact', head: true });
    counts[table] = count;
  }

  console.log(`  customers:        ${counts.customers}`);
  console.log(`  pipeline_leads:   ${counts.pipeline_leads}`);
  console.log(`  projects:         ${counts.projects}`);
  console.log(`  monthly_revenues: ${counts.monthly_revenues}`);
  console.log('\n=== Import Complete ===');
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
