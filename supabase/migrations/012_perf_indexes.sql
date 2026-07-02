-- ================================================================
-- Migration 012: 매출/재무 페이지 성능 인덱스 확대 (STEP 4-A)
-- ================================================================

-- monthly_revenues 조회 최적화
-- 매출현황 페이지: WHERE year=? 필터 + project_id join → 복합 인덱스
CREATE INDEX IF NOT EXISTS idx_monthly_revenues_project_year_month
  ON monthly_revenues(project_id, year, month);

CREATE INDEX IF NOT EXISTS idx_monthly_revenues_year_month
  ON monthly_revenues(year, month);

CREATE INDEX IF NOT EXISTS idx_monthly_revenues_customer_year
  ON monthly_revenues(customer_id, year);

-- projects 조회 최적화
-- 매출현황: source, sheet_no 정렬, customer_id join
CREATE INDEX IF NOT EXISTS idx_projects_source ON projects(source);
CREATE INDEX IF NOT EXISTS idx_projects_customer_source ON projects(customer_id, source);

-- 이미 있는 idx_projects_sheet_no (mig 009) 는 유지
-- 이미 있는 idx_projects_customer_sheet_no (mig 009) 는 유지

-- invoices 조회 최적화
CREATE INDEX IF NOT EXISTS idx_invoices_year_month ON invoices(year, month);
CREATE INDEX IF NOT EXISTS idx_invoices_customer_year ON invoices(customer_id, year);
CREATE INDEX IF NOT EXISTS idx_invoices_status_year ON invoices(status, year);

-- pipeline_leads 조회 최적화
CREATE INDEX IF NOT EXISTS idx_leads_inquiry_date ON pipeline_leads(inquiry_date DESC) WHERE inquiry_date IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_leads_stage_inquiry_date ON pipeline_leads(stage, inquiry_date DESC);
CREATE INDEX IF NOT EXISTS idx_leads_assigned_stage ON pipeline_leads(assigned_to, stage);

-- audit_logs 조회 최적화 (검사·조회용)
-- 이미 migration 010 에서 3개 추가함
