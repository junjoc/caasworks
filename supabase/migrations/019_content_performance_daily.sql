-- ================================================================
-- Migration 019: 카스웍스 블로그 일별 성과 (콘텐츠 성과 > 카스웍스 탭, 2026-10-20)
-- content_performance 는 글 1행에 마지막 동기화 범위의 누적값만 있어서 기간별로 볼 수 없었다.
-- GA4 의 date 차원으로 글×날짜 행을 쌓고, 화면에서 선택 기간 합계를 보여준다.
-- ================================================================

CREATE TABLE IF NOT EXISTS content_performance_daily (
  page_path TEXT NOT NULL,
  date DATE NOT NULL,
  page_views INTEGER NOT NULL DEFAULT 0,
  sessions INTEGER NOT NULL DEFAULT 0,
  active_users INTEGER NOT NULL DEFAULT 0,
  synced_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (page_path, date)
);
CREATE INDEX IF NOT EXISTS idx_content_performance_daily_date ON content_performance_daily (date);

ALTER TABLE content_performance_daily ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS content_performance_daily_auth ON content_performance_daily;
CREATE POLICY content_performance_daily_auth ON content_performance_daily FOR ALL TO authenticated USING (true) WITH CHECK (true);
