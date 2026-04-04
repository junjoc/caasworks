import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  )
}

const CAAS_API_URL = 'https://api.caas.works/v1/admin/system-invoices'

// CaaS Admin status -> CRM status
function mapStatus(status: string): string {
  switch (status) {
    case 'PAID': return 'paid'
    case 'SENT': return 'sent'
    case 'CANCELLED': return 'draft'
    case 'DRAFT': return 'draft'
    default: return 'sent'
  }
}

// Parse year/month from billingMonth like "2026년 4월 청구분"
function parseBillingMonth(billingMonth: string): { year: number; month: number } {
  const match = billingMonth.match(/(\d{4})년\s*(\d{1,2})월/)
  if (match) return { year: parseInt(match[1]), month: parseInt(match[2]) }
  return { year: new Date().getFullYear(), month: new Date().getMonth() + 1 }
}

const normalize = (s: string) => s.replace(/\s+/g, '').replace(/[()（）\-·・㈜]/g, '').toLowerCase()

interface InvoiceGroup {
  invoices: any[]
  company: string
  year: number
  month: number
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}))
    const jwtToken = body.token || process.env.CAAS_ADMIN_JWT_TOKEN

    if (!jwtToken) {
      return NextResponse.json({ error: 'CAAS Admin JWT token required' }, { status: 400 })
    }

    const supabase = getSupabase()

    // 1. Fetch all invoices from CaaS Admin API
    console.log('[Invoice Sync] Fetching from CaaS Admin API...')
    const res = await fetch(`${CAAS_API_URL}?limit=1000&offset=0`, {
      headers: { 'Authorization': `Bearer ${jwtToken}` },
    })

    if (!res.ok) {
      return NextResponse.json({ error: `CaaS API error: ${res.status}` }, { status: 502 })
    }

    const apiData = await res.json()
    const invoices = apiData.data || []
    console.log(`[Invoice Sync] Fetched ${invoices.length} invoices`)

    // 2. Get existing customer mapping (company_name -> id)
    const { data: customers } = await supabase
      .from('customers')
      .select('id, company_name')
      .limit(2000)

    const custByName: Record<string, string> = {}
    for (const c of customers || []) {
      if (c.company_name) {
        custByName[c.company_name] = c.id
        custByName[normalize(c.company_name)] = c.id
      }
    }

    // 3. Group invoices by (company, year, month) to merge
    // This handles the UNIQUE(customer_id, year, month) constraint
    const groups: Record<string, InvoiceGroup> = {}
    for (const inv of invoices) {
      const company = inv.recipient?.companyName || ''
      const { year, month } = parseBillingMonth(inv.billingMonth || '')
      const key = `${company}|${year}|${month}`
      if (!groups[key]) groups[key] = { invoices: [], company, year, month }
      groups[key].invoices.push(inv)
    }

    console.log(`[Invoice Sync] ${Object.keys(groups).length} merged groups from ${invoices.length} raw invoices`)

    // 4. Get existing invoices to check for updates
    const { data: existingInvoices } = await supabase
      .from('invoices')
      .select('id, invoice_number, customer_id, year, month')
      .limit(2000)

    const existingByKey = new Map<string, { id: string; invoice_number: string }>()
    for (const inv of existingInvoices || []) {
      const key = `${inv.customer_id}|${inv.year}|${inv.month}`
      existingByKey.set(key, { id: inv.id, invoice_number: inv.invoice_number })
    }

    // 5. Process and upsert groups
    let inserted = 0, updated = 0, skipped = 0, errors = 0, companiesCreated = 0
    const errorMessages: string[] = []

    for (const [, group] of Object.entries(groups)) {
      const { company, year, month, invoices: groupInvs } = group
      const first = groupInvs[0]

      // Find or create customer
      let customerId = custByName[company] || custByName[normalize(company)]
      if (!customerId) {
        // Auto-create customer
        const { data: newCust, error: custErr } = await supabase.from('customers').insert({
          company_name: company,
          status: 'active',
          company_type: '일반',
          notes: 'CaaS Admin 청구서에서 자동 생성',
        }).select('id').single()

        if (custErr) {
          skipped++
          if (errorMessages.length < 5) errorMessages.push(`Create customer ${company}: ${custErr.message}`)
          continue
        }
        customerId = newCust.id
        custByName[company] = newCust.id
        custByName[normalize(company)] = newCust.id
        companiesCreated++
      }

      // Merge calculation totals
      let subtotal = 0, vat = 0, total = 0
      for (const inv of groupInvs) {
        subtotal += inv.calculation?.subtotal || 0
        vat += inv.calculation?.vat || 0
        total += inv.calculation?.grandTotal || 0
      }

      // Determine merged status
      let mergedStatus = 'paid'
      for (const inv of groupInvs) {
        const s = mapStatus(inv.status)
        if (s === 'sent') mergedStatus = 'sent'
      }
      // Check overdue
      for (const inv of groupInvs) {
        if (mapStatus(inv.status) === 'sent' && inv.paymentInfo?.dueDate) {
          if (new Date(inv.paymentInfo.dueDate) < new Date()) {
            mergedStatus = 'overdue'
            break
          }
        }
      }

      // Build merged items
      const items: Array<{
        item_no: number; project_name: string; service_type: string
        period: string; quantity: number; unit_price: number; amount: number; notes: string | null
      }> = []
      let itemNo = 1
      for (const inv of groupInvs) {
        for (const proj of inv.projects || []) {
          for (const svc of proj.serviceItems || []) {
            items.push({
              item_no: itemNo++,
              project_name: proj.title || '',
              service_type: svc.title || '',
              period: svc.note || `${year}.${String(month).padStart(2, '0')}`,
              quantity: svc.quantity || 1,
              unit_price: svc.unitPrice || 0,
              amount: svc.totalPrice || 0,
              notes: groupInvs.length > 1 ? `CAAS-${inv._id}` : null,
            })
          }
        }
      }

      const invoiceNumber = groupInvs.length === 1
        ? `CAAS-${first._id}`
        : `CAAS-${first._id}+${groupInvs.length - 1}`

      const paymentInfo = first.paymentInfo || {}
      const bankInfo = paymentInfo.bankName
        ? `${paymentInfo.bankName} ${paymentInfo.bankAccount} (${paymentInfo.accountHolder})`
        : null

      const invoiceData = {
        customer_id: customerId,
        invoice_number: invoiceNumber,
        year,
        month,
        sender_company: first.issuer?.businessName || '(주)아이콘',
        sender_biz_no: first.issuer?.businessRegistrationNumber || null,
        sender_ceo: first.issuer?.representative || null,
        sender_address: first.issuer?.address || null,
        sender_contact_name: first.issuer?.contactPerson || null,
        sender_contact_info: first.issuer?.contact?.email || null,
        receiver_company: company,
        receiver_contact: first.recipient?.contactPerson || null,
        receiver_email: first.recipient?.email || null,
        subtotal,
        vat,
        total,
        due_date: paymentInfo.dueDate ? new Date(paymentInfo.dueDate).toISOString().substring(0, 10) : null,
        bank_info: bankInfo,
        status: mergedStatus,
        sent_at: first.billingDate || null,
        paid_at: mergedStatus === 'paid' ? (first.updatedAt || first.billingDate) : null,
        notes: first.billingMonth || null,
      }

      const existingKey = `${customerId}|${year}|${month}`
      const existing = existingByKey.get(existingKey)

      if (existing) {
        // Update existing invoice
        const { error } = await supabase
          .from('invoices')
          .update(invoiceData)
          .eq('id', existing.id)

        if (error) {
          errors++
          if (errorMessages.length < 5) errorMessages.push(`Update ${company}: ${error.message}`)
        } else {
          updated++
          // Replace items: delete old, insert new
          await supabase.from('invoice_items').delete().eq('invoice_id', existing.id)
          if (items.length > 0) {
            const itemsWithId = items.map(item => ({ ...item, invoice_id: existing.id }))
            await supabase.from('invoice_items').insert(itemsWithId)
          }
        }
      } else {
        // Insert new
        const { data: newInv, error } = await supabase
          .from('invoices')
          .insert(invoiceData)
          .select('id')
          .single()

        if (error) {
          errors++
          if (errorMessages.length < 5) errorMessages.push(`Insert ${company} ${year}/${month}: ${error.message}`)
        } else {
          inserted++
          if (items.length > 0 && newInv) {
            const itemsWithId = items.map(item => ({ ...item, invoice_id: newInv.id }))
            await supabase.from('invoice_items').insert(itemsWithId)
          }
        }
      }
    }

    // 6. Final stats
    const { count: totalCount } = await supabase
      .from('invoices')
      .select('*', { count: 'exact', head: true })

    return NextResponse.json({
      ok: true,
      synced_at: new Date().toISOString(),
      source: 'caas_admin_api',
      fetched: invoices.length,
      merged_groups: Object.keys(groups).length,
      inserted,
      updated,
      skipped,
      errors,
      companies_created: companiesCreated,
      errorMessages: errorMessages.length > 0 ? errorMessages : undefined,
      total_in_db: totalCount,
    })
  } catch (error: any) {
    console.error('[Invoice Sync] Error:', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// GET: status check
export async function GET() {
  const supabase = getSupabase()
  const { count } = await supabase.from('invoices').select('*', { count: 'exact', head: true })

  return NextResponse.json({
    status: 'ok',
    endpoint: 'Invoice sync from CaaS Admin',
    invoices_in_db: count,
    usage: 'POST with { "token": "JWT_TOKEN" } to sync',
  })
}
