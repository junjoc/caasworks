-- ============================================
-- 003: 파이프라인 관리 필드 추가 (v2.0)
-- ============================================

ALTER TABLE pipeline_leads
  ADD COLUMN IF NOT EXISTS priority TEXT DEFAULT '중간' CHECK (priority IN ('긴급','높음','중간','낮음')),
  ADD COLUMN IF NOT EXISTS next_action TEXT,
  ADD COLUMN IF NOT EXISTS next_action_date DATE,
  ADD COLUMN IF NOT EXISTS inquiry_date DATE,
  ADD COLUMN IF NOT EXISTS inquiry_channel TEXT,
  ADD COLUMN IF NOT EXISTS industry TEXT,
  ADD COLUMN IF NOT EXISTS contact_position TEXT;

CREATE INDEX IF NOT EXISTS idx_pipeline_leads_priority ON pipeline_leads(priority);
CREATE INDEX IF NOT EXISTS idx_pipeline_leads_action_date ON pipeline_leads(next_action_date);
