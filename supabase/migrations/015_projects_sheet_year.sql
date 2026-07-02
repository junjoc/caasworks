-- ================================================================
-- Migration 015: projects.sheet_year 추가
-- 목적: 매출 없는 프로젝트도 어느 연도 시트에서 왔는지 알기 위함
--       (연간계약, 매출 예정 프로젝트 등 CRM 표시)
-- ================================================================

ALTER TABLE projects ADD COLUMN IF NOT EXISTS sheet_year INT;

-- 조회용 인덱스
CREATE INDEX IF NOT EXISTS idx_projects_sheet_year_source
  ON projects(sheet_year, source) WHERE sheet_year IS NOT NULL;

COMMENT ON COLUMN projects.sheet_year IS '어느 연도 시트에서 임포트됐는지. 매출 없어도 매출 페이지 리스트에 표시하기 위함.';
