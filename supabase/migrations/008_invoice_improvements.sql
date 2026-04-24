-- ============================================
-- Migration 008: Invoice improvements
-- - Add 세금계산서 (tax invoice) tracking columns
-- - Seed default bank_info + company_info in company_settings
-- ============================================

-- Part A: Tax invoice issuance tracking
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS tax_invoice_issued_at TIMESTAMPTZ;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS tax_invoice_number TEXT;

-- Index for overdue queries (issued but unpaid past due date)
CREATE INDEX IF NOT EXISTS idx_invoices_tax_issued ON invoices(tax_invoice_issued_at) WHERE tax_invoice_issued_at IS NOT NULL;

-- Part B: Seed default bank_info in company_settings
-- Uses ON CONFLICT DO NOTHING so existing values are preserved
INSERT INTO company_settings (key, value)
VALUES ('bank_info', '"카스웍스(주) 기업은행 000-000000-00-000"'::jsonb)
ON CONFLICT (key) DO NOTHING;

INSERT INTO company_settings (key, value)
VALUES ('company_info', '{"name":"카스웍스(주)","biz_no":"","ceo":"","address":"","contact_name":"","contact_info":""}'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- Done.
