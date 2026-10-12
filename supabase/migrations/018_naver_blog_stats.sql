-- ================================================================
-- Migration 018: 네이버 블로그 통계 (콘텐츠 성과 > 네이버 탭, 2026-10-12)
-- 네이버 블로그는 GA 가 없어서 블로그 관리 > 통계 월간 엑셀을 업로드해 저장한다.
-- ================================================================

-- 글: 제목으로 매칭. URL(logNo)은 사람이 처음 한 번 입력 (마케팅 리포트 레퍼러 제목 표시에 사용)
CREATE TABLE IF NOT EXISTS naver_blog_posts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title TEXT NOT NULL UNIQUE,
  published_at DATE,
  url TEXT,
  log_no TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_naver_blog_posts_log_no ON naver_blog_posts (log_no) WHERE log_no IS NOT NULL;

-- 글별 월 조회수 (조회수_순위_월간 파일, 월 상위 약 100편)
CREATE TABLE IF NOT EXISTS naver_blog_post_views (
  post_id UUID NOT NULL REFERENCES naver_blog_posts(id) ON DELETE CASCADE,
  month DATE NOT NULL,            -- 해당 월 1일
  views INTEGER NOT NULL DEFAULT 0,
  rank INTEGER,
  PRIMARY KEY (post_id, month)
);
CREATE INDEX IF NOT EXISTS idx_naver_blog_post_views_month ON naver_blog_post_views (month);

-- 월별 유입경로·검색어 (유입분석_월간 파일). keyword 는 월 상위 50개만
CREATE TABLE IF NOT EXISTS naver_blog_inflow (
  month DATE NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('route', 'keyword')),
  name TEXT NOT NULL,
  ratio NUMERIC(6, 2) NOT NULL DEFAULT 0,
  rank INTEGER,
  PRIMARY KEY (month, kind, name)
);

-- 월별 요약 (순방문자수 / 평균사용시간 / 기기별분포 파일)
CREATE TABLE IF NOT EXISTS naver_blog_monthly (
  month DATE PRIMARY KEY,
  unique_visitors INTEGER,
  avg_time_sec INTEGER,
  mobile_ratio NUMERIC(5, 2),
  pc_ratio NUMERIC(5, 2),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 다른 마케팅 테이블처럼 로그인 사용자 읽기·쓰기 허용
ALTER TABLE naver_blog_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE naver_blog_post_views ENABLE ROW LEVEL SECURITY;
ALTER TABLE naver_blog_inflow ENABLE ROW LEVEL SECURITY;
ALTER TABLE naver_blog_monthly ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS naver_blog_posts_auth ON naver_blog_posts;
DROP POLICY IF EXISTS naver_blog_post_views_auth ON naver_blog_post_views;
DROP POLICY IF EXISTS naver_blog_inflow_auth ON naver_blog_inflow;
DROP POLICY IF EXISTS naver_blog_monthly_auth ON naver_blog_monthly;
CREATE POLICY naver_blog_posts_auth ON naver_blog_posts FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY naver_blog_post_views_auth ON naver_blog_post_views FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY naver_blog_inflow_auth ON naver_blog_inflow FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY naver_blog_monthly_auth ON naver_blog_monthly FOR ALL TO authenticated USING (true) WITH CHECK (true);
