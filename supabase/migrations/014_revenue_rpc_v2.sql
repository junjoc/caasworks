-- ================================================================
-- Migration 014: get_revenue_page RPC v2 (매출현황 페이지 feature-parity)
--
-- v1 에서 누락된 필드 추가:
--   invoice_day, monthly_amount, status, revenue_type, customer_notes
-- 페이지가 batch loop 대신 RPC 한번으로 로드 가능해짐.
-- ================================================================

DROP FUNCTION IF EXISTS get_revenue_page(INT, INT, INT, UUID, TEXT, TEXT);

CREATE OR REPLACE FUNCTION get_revenue_page(
  p_year INT,
  p_limit INT DEFAULT 5000,
  p_offset INT DEFAULT 0,
  p_customer_id UUID DEFAULT NULL,
  p_service_type TEXT DEFAULT NULL,
  p_site_category TEXT DEFAULT NULL
)
RETURNS TABLE (
  project_id      UUID,
  sheet_no        NUMERIC,
  customer_id     UUID,
  customer_name   TEXT,
  customer_notes  TEXT,
  project_name    TEXT,
  service_type    TEXT,
  site_category   TEXT,
  site_category2  TEXT,
  project_start   DATE,
  project_end     DATE,
  billing_start   DATE,
  billing_end     DATE,
  billing_method  TEXT,
  invoice_day     NUMERIC,
  monthly_amount  NUMERIC,
  status          TEXT,
  revenue_type    TEXT,
  notes           TEXT,
  created_at      TIMESTAMPTZ,
  revenues        JSONB
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    p.id,
    p.sheet_no::NUMERIC,
    p.customer_id,
    c.company_name::TEXT,
    c.notes::TEXT,
    p.project_name::TEXT,
    p.service_type::TEXT,
    p.site_category::TEXT,
    p.site_category2::TEXT,
    p.project_start,
    p.project_end,
    p.billing_start,
    p.billing_end,
    p.billing_method::TEXT,
    p.invoice_day::NUMERIC,
    p.monthly_amount::NUMERIC,
    p.status::TEXT,
    p.revenue_type::TEXT,
    p.notes::TEXT,
    p.created_at,
    COALESCE(
      (SELECT jsonb_agg(jsonb_build_object(
         'id', mr.id, 'month', mr.month, 'amount', mr.amount, 'is_confirmed', mr.is_confirmed
       ) ORDER BY mr.month)
       FROM monthly_revenues mr
       WHERE mr.project_id = p.id AND mr.year = p_year),
      '[]'::jsonb
    ) AS revenues
  FROM projects p
  INNER JOIN customers c ON c.id = p.customer_id
  WHERE EXISTS (
    SELECT 1 FROM monthly_revenues mr2
    WHERE mr2.project_id = p.id AND mr2.year = p_year
  )
  AND (p_customer_id   IS NULL OR p.customer_id   = p_customer_id)
  AND (p_service_type  IS NULL OR p.service_type  = p_service_type)
  AND (p_site_category IS NULL OR p.site_category = p_site_category)
  ORDER BY p.sheet_no DESC NULLS FIRST, p.created_at DESC
  LIMIT p_limit OFFSET p_offset;
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION get_revenue_page IS 'STEP 4-B v2: 매출현황 페이지 feature-parity RPC. 한번 호출로 그 해 매출 있는 프로젝트 전체 로드.';
