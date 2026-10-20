-- ================================================================
-- Migration 020: 마케팅 연간 현황 보관 (마케팅 > 연간 비교, 2026-10-20)
-- 2023~2026.4 구글 시트 현황표를 연도 파일(xlsx)로 업로드해 저장. 2026.5~ 는 CRM 데이터로 화면에서 계산.
-- 가입수·미팅수는 연도마다 있거나 없어서 NULL 허용 (팀 결정: 지금은 광고비·문의·도입 중심).
-- ================================================================

-- 월 요약: 연×월 1행 ("N년 전체" 시트)
CREATE TABLE IF NOT EXISTS marketing_monthly_history (
  year INTEGER NOT NULL,
  month INTEGER NOT NULL CHECK (month BETWEEN 1 AND 12),
  cost_google NUMERIC(14, 2) NOT NULL DEFAULT 0,
  cost_meta NUMERIC(14, 2) NOT NULL DEFAULT 0,
  cost_naver NUMERIC(14, 2) NOT NULL DEFAULT 0,
  cost_other NUMERIC(14, 2) NOT NULL DEFAULT 0,   -- 2026: 팀부스터(외주 블로그) 월정액
  cost_total NUMERIC(14, 2) NOT NULL DEFAULT 0,   -- 실 집행비
  budget_total NUMERIC(14, 2),
  signups INTEGER,
  inquiries_paid INTEGER,
  inquiries_viral INTEGER,
  inquiries INTEGER,
  adoptions INTEGER,
  meetings INTEGER,                                -- 2023 만
  revenue NUMERIC(16, 2),                          -- 시트에 있는 값 그대로 (24~26). 화면 표시는 별도 결정
  source TEXT NOT NULL DEFAULT 'sheet',
  uploaded_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (year, month)
);

-- 월 상세: 연×월×광고유형×채널×캠페인 ("MM월" 시트). 합계 행은 저장하지 않는다
CREATE TABLE IF NOT EXISTS marketing_monthly_channel_history (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  year INTEGER NOT NULL,
  month INTEGER NOT NULL CHECK (month BETWEEN 1 AND 12),
  ad_type TEXT NOT NULL,
  channel TEXT NOT NULL,
  method TEXT,
  campaign TEXT,
  cost NUMERIC(14, 2) NOT NULL DEFAULT 0,
  impressions INTEGER NOT NULL DEFAULT 0,
  clicks INTEGER NOT NULL DEFAULT 0,
  signups INTEGER,
  inquiries INTEGER,
  adoptions INTEGER,
  meetings INTEGER,
  uploaded_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_mmch_year_month ON marketing_monthly_channel_history (year, month);

ALTER TABLE marketing_monthly_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE marketing_monthly_channel_history ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS marketing_monthly_history_auth ON marketing_monthly_history;
DROP POLICY IF EXISTS marketing_monthly_channel_history_auth ON marketing_monthly_channel_history;
CREATE POLICY marketing_monthly_history_auth ON marketing_monthly_history FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY marketing_monthly_channel_history_auth ON marketing_monthly_channel_history FOR ALL TO authenticated USING (true) WITH CHECK (true);
