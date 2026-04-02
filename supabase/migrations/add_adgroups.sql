-- =============================================
-- 광고그룹 테이블 추가 + ad_performance 컬럼 추가
-- 실행: Supabase SQL Editor에서 실행
-- =============================================

-- 1. ad_groups 테이블 생성
CREATE TABLE IF NOT EXISTS ad_groups (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  campaign_id UUID REFERENCES campaigns(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  channel TEXT,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'paused', 'completed')),
  daily_budget NUMERIC DEFAULT 0,
  naver_id TEXT,           -- 네이버 nccAdgroupId
  google_id TEXT,          -- 구글 adGroupId
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(campaign_id, name)
);

-- 2. ad_performance 테이블에 광고그룹 관련 컬럼 추가
ALTER TABLE ad_performance ADD COLUMN IF NOT EXISTS adgroup_name TEXT;
ALTER TABLE ad_performance ADD COLUMN IF NOT EXISTS adgroup_id UUID REFERENCES ad_groups(id);

-- 3. campaigns 테이블에 누락 컬럼 추가 (UI에서 사용 중)
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS ad_type TEXT;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS daily_budget NUMERIC DEFAULT 0;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS actual_spend NUMERIC DEFAULT 0;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS target_audience TEXT;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS naver_id TEXT;   -- 네이버 nccCampaignId
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS google_id TEXT;  -- 구글 campaignId

-- 4. RLS 정책 (ad_groups)
ALTER TABLE ad_groups ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ad_groups_select" ON ad_groups FOR SELECT USING (true);
CREATE POLICY "ad_groups_insert" ON ad_groups FOR INSERT WITH CHECK (true);
CREATE POLICY "ad_groups_update" ON ad_groups FOR UPDATE USING (true);
CREATE POLICY "ad_groups_delete" ON ad_groups FOR DELETE USING (true);

-- 5. 인덱스
CREATE INDEX IF NOT EXISTS idx_ad_groups_campaign ON ad_groups(campaign_id);
CREATE INDEX IF NOT EXISTS idx_ad_performance_adgroup ON ad_performance(adgroup_id);
CREATE INDEX IF NOT EXISTS idx_ad_performance_adgroup_name ON ad_performance(adgroup_name);
