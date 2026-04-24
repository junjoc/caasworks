-- ============================================
-- Migration 009: Projects sheet sync
-- - Add sheet_no (NUMERIC) to projects for 1:1 mapping with
--   Google Sheet "현장별 전체 매출" NO column.
-- - NUMERIC supports decimal NO like 1428.1 (mid-way service adds)
-- ============================================

ALTER TABLE projects ADD COLUMN IF NOT EXISTS sheet_no NUMERIC(10, 3);

-- Non-unique index: 시트에서 같은 NO 가 중복되는 케이스(예: 920.16 × 2)가
-- 실제로 3건 발견되어 UNIQUE 로 걸면 import 가 깨짐. 중복 보존 + 스크립트가
-- 같은 sheet_no 라도 별도 project 로 삽입.
CREATE INDEX IF NOT EXISTS idx_projects_customer_sheet_no
  ON projects (customer_id, sheet_no)
  WHERE sheet_no IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_projects_sheet_no ON projects(sheet_no) WHERE sheet_no IS NOT NULL;

-- Done.
