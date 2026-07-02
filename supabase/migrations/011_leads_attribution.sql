-- ================================================================
-- Migration 011: pipeline_leads attribution 컬럼 (관통 = STEP 3)
-- 이관 문서: 콘텐츠→세션→리드→도입→매출 화살표 데이터로 연결
-- ================================================================

ALTER TABLE pipeline_leads
  ADD COLUMN IF NOT EXISTS site_session_id UUID REFERENCES site_sessions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS utm_source TEXT,
  ADD COLUMN IF NOT EXISTS utm_medium TEXT,
  ADD COLUMN IF NOT EXISTS utm_campaign TEXT,
  ADD COLUMN IF NOT EXISTS utm_content TEXT,
  ADD COLUMN IF NOT EXISTS utm_term TEXT,
  ADD COLUMN IF NOT EXISTS landing_page TEXT,
  ADD COLUMN IF NOT EXISTS referrer TEXT,
  ADD COLUMN IF NOT EXISTS first_touch JSONB;
-- first_touch: 최초 유입 스냅샷 (불변). 후속 utm 변경돼도 최초 attribution 보존.
-- 예: {"session_id":"...","utm_source":"naver","landing_page":"/lp/xxx","captured_at":"..."}

-- 조회 인덱스
CREATE INDEX IF NOT EXISTS idx_leads_session ON pipeline_leads(site_session_id) WHERE site_session_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_leads_utm_source ON pipeline_leads(utm_source) WHERE utm_source IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_leads_utm_campaign ON pipeline_leads(utm_campaign) WHERE utm_campaign IS NOT NULL;

COMMENT ON COLUMN pipeline_leads.first_touch IS 'Immutable snapshot of first-touch attribution: {session_id, utm_source, utm_medium, utm_campaign, utm_content, landing_page, referrer, captured_at}';
COMMENT ON COLUMN pipeline_leads.site_session_id IS 'Link to site_sessions for full-funnel tracking (nullable — Slack inbound may not have)';
