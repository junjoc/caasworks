-- ================================================================
-- Migration 016: get_revenue_page v3 (sheet_year 지원)
-- 매출 없는 프로젝트도 sheet_year=year 이면 리턴 → 매출 페이지에서 표시
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
  sheet_year      INT,
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
    p.id, p.sheet_no::NUMERIC, p.sheet_year, p.customer_id,
    c.company_name::TEXT, c.notes::TEXT, p.project_name::TEXT,
    p.service_type::TEXT, p.site_category::TEXT, p.site_category2::TEXT,
    p.project_start, p.project_end, p.billing_start, p.billing_end,
    p.billing_method::TEXT, p.invoice_day::NUMERIC, p.monthly_amount::NUMERIC,
    p.status::TEXT, p.revenue_type::TEXT, p.notes::TEXT, p.created_at,
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
  WHERE (
    p.sheet_year = p_year
    OR EXISTS (SELECT 1 FROM monthly_revenues mr2 WHERE mr2.project_id = p.id AND mr2.year = p_year)
  )
  AND (p_customer_id   IS NULL OR p.customer_id   = p_customer_id)
  AND (p_service_type  IS NULL OR p.service_type  = p_service_type)
  AND (p_site_category IS NULL OR p.site_category = p_site_category)
  ORDER BY p.sheet_no DESC NULLS FIRST, p.created_at DESC
  LIMIT p_limit OFFSET p_offset;
END;
$$ LANGUAGE plpgsql STABLE;
