-- Site Tracking Tables for Marketing Analytics
-- Run this in Supabase SQL Editor

-- 1. 방문 세션
CREATE TABLE IF NOT EXISTS site_sessions (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  visitor_id text NOT NULL,              -- 브라우저 fingerprint/cookie ID
  session_id text NOT NULL UNIQUE,
  -- 유입 정보
  utm_source text,
  utm_medium text,
  utm_campaign text,
  utm_content text,
  utm_term text,
  referrer text,
  landing_page text,
  -- 디바이스
  device_type text,                      -- mobile, desktop, tablet
  browser text,
  os text,
  screen_resolution text,
  -- 세션 요약
  page_count int DEFAULT 0,
  duration_seconds int DEFAULT 0,
  has_inquiry boolean DEFAULT false,      -- 문의 전환 여부
  customer_code text,                     -- 문의 시 연결되는 고객 코드
  -- 타임스탬프
  started_at timestamptz DEFAULT now(),
  ended_at timestamptz,
  created_at timestamptz DEFAULT now()
);

-- 2. 페이지뷰
CREATE TABLE IF NOT EXISTS site_pageviews (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id text NOT NULL REFERENCES site_sessions(session_id) ON DELETE CASCADE,
  visitor_id text NOT NULL,
  page_url text NOT NULL,
  page_title text,
  -- 행동 데이터
  duration_seconds int DEFAULT 0,
  scroll_depth int DEFAULT 0,            -- 0~100%
  -- CTA 클릭
  cta_clicked boolean DEFAULT false,
  cta_location text,                      -- header, hero, pricing, footer 등
  created_at timestamptz DEFAULT now()
);

-- 3. 이벤트 (클릭, 폼, 커스텀)
CREATE TABLE IF NOT EXISTS site_events (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id text NOT NULL REFERENCES site_sessions(session_id) ON DELETE CASCADE,
  visitor_id text NOT NULL,
  event_type text NOT NULL,              -- page_view, cta_click, form_start, form_field, form_submit, form_abandon, scroll
  event_data jsonb DEFAULT '{}',         -- 유연한 이벤트 데이터
  page_url text,
  created_at timestamptz DEFAULT now()
);

-- 인덱스
CREATE INDEX IF NOT EXISTS idx_sessions_started ON site_sessions(started_at DESC);
CREATE INDEX IF NOT EXISTS idx_sessions_utm ON site_sessions(utm_source, utm_medium, utm_campaign);
CREATE INDEX IF NOT EXISTS idx_sessions_customer ON site_sessions(customer_code) WHERE customer_code IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_sessions_visitor ON site_sessions(visitor_id);
CREATE INDEX IF NOT EXISTS idx_pageviews_session ON site_pageviews(session_id);
CREATE INDEX IF NOT EXISTS idx_pageviews_url ON site_pageviews(page_url);
CREATE INDEX IF NOT EXISTS idx_events_session ON site_events(session_id);
CREATE INDEX IF NOT EXISTS idx_events_type ON site_events(event_type, created_at DESC);

-- RLS: 서비스 롤만 쓰기 가능, 인증 사용자 읽기 가능
ALTER TABLE site_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE site_pageviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE site_events ENABLE ROW LEVEL SECURITY;

-- 서비스 롤은 모든 작업 가능 (API에서 service_role_key 사용)
CREATE POLICY "service_role_all_sessions" ON site_sessions FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all_pageviews" ON site_pageviews FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all_events" ON site_events FOR ALL USING (true) WITH CHECK (true);

-- anon 키로 insert만 허용 (트래킹 스크립트용)
CREATE POLICY "anon_insert_sessions" ON site_sessions FOR INSERT WITH CHECK (true);
CREATE POLICY "anon_insert_pageviews" ON site_pageviews FOR INSERT WITH CHECK (true);
CREATE POLICY "anon_insert_events" ON site_events FOR INSERT WITH CHECK (true);

-- 인증 사용자는 읽기 가능 (CRM 대시보드용)
CREATE POLICY "auth_read_sessions" ON site_sessions FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "auth_read_pageviews" ON site_pageviews FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "auth_read_events" ON site_events FOR SELECT USING (auth.role() = 'authenticated');
