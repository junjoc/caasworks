-- ================================================================
-- Migration 017: pipeline_leads 주제 태그 (마케팅 리포트, 2026-10-12)
-- topic_tags        : 문의내용·핵심니즈·메모에서 자동 분류한 주제 (src/config/topic_tags.json 규칙)
-- topic_tags_manual : 사람이 직접 고친 경우 true → "재분류" 때 덮어쓰지 않음
-- ================================================================

ALTER TABLE pipeline_leads
  ADD COLUMN IF NOT EXISTS topic_tags TEXT[],
  ADD COLUMN IF NOT EXISTS topic_tags_manual BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_leads_topic_tags ON pipeline_leads USING GIN (topic_tags);
CREATE INDEX IF NOT EXISTS idx_leads_inquiry_date ON pipeline_leads (inquiry_date);
