-- ================================================================
-- Migration 013: 매출 집계 View/RPC (STEP 4-B)
--
-- 매출현황 페이지가 매번 3천개 프로젝트를 전부 로드하고 클라이언트에서
-- 그룹핑/합계 계산하면 느림. 서버에서 사전 집계 → 페이지는 소량만 fetch.
-- ================================================================

-- ----------------------------------------------------------------
-- View 1: 연도별 매출 요약 (연간 대시보드용)
-- ----------------------------------------------------------------
CREATE OR REPLACE VIEW v_revenue_yearly AS
SELECT
  year,
  COUNT(DISTINCT project_id)              AS projects,
  COUNT(*)                                AS rows,
  SUM(amount)                             AS total,
  SUM(amount) * 1.1                       AS total_with_vat,
  AVG(amount)                             AS avg_per_row,
  MIN(amount)                             AS min_amount,
  MAX(amount)                             AS max_amount,
  COUNT(*) FILTER (WHERE is_confirmed)    AS confirmed_rows,
  COUNT(*) FILTER (WHERE NOT is_confirmed) AS pending_rows
FROM monthly_revenues
GROUP BY year;

-- ----------------------------------------------------------------
-- View 2: 연/월별 매출 요약 (매출현황 상단 요약 테이블용)
-- ----------------------------------------------------------------
CREATE OR REPLACE VIEW v_revenue_monthly AS
SELECT
  year,
  month,
  COUNT(*)                             AS rows,
  COUNT(DISTINCT project_id)           AS projects,
  COUNT(DISTINCT customer_id)          AS customers,
  SUM(amount)                          AS total,
  SUM(amount) * 1.1                    AS total_with_vat,
  COUNT(*) FILTER (WHERE is_confirmed) AS confirmed
FROM monthly_revenues
GROUP BY year, month;

-- ----------------------------------------------------------------
-- View 3: 고객별 연간 매출 (고객관리 페이지용)
-- ----------------------------------------------------------------
CREATE OR REPLACE VIEW v_revenue_by_customer_year AS
SELECT
  customer_id,
  year,
  COUNT(*)                          AS rows,
  COUNT(DISTINCT project_id)        AS projects,
  SUM(amount)                       AS total,
  SUM(amount) * 1.1                 AS total_with_vat
FROM monthly_revenues
GROUP BY customer_id, year;

-- ----------------------------------------------------------------
-- RPC: 매출현황 페이지에 필요한 프로젝트 + 매출을 서버에서 조합
-- 클라이언트가 모든 프로젝트를 fetch 하지 않도록.
--
-- Usage:
--   SELECT * FROM get_revenue_page(p_year := 2025, p_limit := 100, p_offset := 0);
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION get_revenue_page(
  p_year INT,
  p_limit INT DEFAULT 1000,
  p_offset INT DEFAULT 0,
  p_customer_id UUID DEFAULT NULL,
  p_service_type TEXT DEFAULT NULL,
  p_site_category TEXT DEFAULT NULL
)
RETURNS TABLE (
  project_id UUID,
  sheet_no NUMERIC,
  customer_id UUID,
  customer_name TEXT,
  project_name TEXT,
  service_type TEXT,
  site_category TEXT,
  site_category2 TEXT,
  project_start DATE,
  project_end DATE,
  billing_start DATE,
  billing_end DATE,
  billing_method TEXT,
  notes TEXT,
  revenues JSONB
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    p.id,
    p.sheet_no,
    p.customer_id,
    c.company_name,
    p.project_name,
    p.service_type,
    p.site_category,
    p.site_category2,
    p.project_start,
    p.project_end,
    p.billing_start,
    p.billing_end,
    p.billing_method,
    p.notes,
    -- 이 프로젝트의 해당 연도 매출을 JSONB 배열로
    COALESCE(
      (SELECT jsonb_agg(jsonb_build_object(
        'id', mr.id, 'month', mr.month, 'amount', mr.amount, 'is_confirmed', mr.is_confirmed
      ))
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
  AND (p_customer_id IS NULL OR p.customer_id = p_customer_id)
  AND (p_service_type IS NULL OR p.service_type = p_service_type)
  AND (p_site_category IS NULL OR p.site_category = p_site_category)
  ORDER BY p.sheet_no DESC NULLS FIRST, p.created_at DESC
  LIMIT p_limit OFFSET p_offset;
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON VIEW v_revenue_yearly IS '연도별 매출 요약 (대시보드용)';
COMMENT ON VIEW v_revenue_monthly IS '연/월별 매출 요약 (매출현황 상단용)';
COMMENT ON FUNCTION get_revenue_page IS 'STEP 4-B: 서버 페이지네이션. 클라이언트가 3000개 프로젝트를 전부 fetch 안 해도 됨';
