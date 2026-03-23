-- ============================================
-- CaaS.Works CRM - RLS (Row Level Security) 정책
-- ============================================

-- RLS 활성화
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE pipeline_leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE pipeline_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE monthly_revenues ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoice_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE voc_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE voc_responses ENABLE ROW LEVEL SECURITY;
ALTER TABLE meetings ENABLE ROW LEVEL SECURITY;
ALTER TABLE incentive_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE incentive_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE marketing_costs ENABLE ROW LEVEL SECURITY;
ALTER TABLE company_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE slack_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE sla_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;

-- ============================================
-- 헬퍼 함수: 현재 사용자 역할 조회
-- ============================================
CREATE OR REPLACE FUNCTION get_user_role()
RETURNS TEXT AS $$
  SELECT role FROM users WHERE id = auth.uid();
$$ LANGUAGE sql SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN AS $$
  SELECT get_user_role() = 'admin';
$$ LANGUAGE sql SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION is_admin_or_accountant()
RETURNS BOOLEAN AS $$
  SELECT get_user_role() IN ('admin', 'accountant');
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- ============================================
-- users
-- ============================================
CREATE POLICY "사용자 전체 조회" ON users FOR SELECT USING (true);
CREATE POLICY "사용자 관리 - 관리자" ON users FOR INSERT WITH CHECK (is_admin());
CREATE POLICY "사용자 수정 - 관리자" ON users FOR UPDATE USING (is_admin());
CREATE POLICY "사용자 삭제 - 관리자" ON users FOR DELETE USING (is_admin());

-- ============================================
-- pipeline_leads
-- ============================================
CREATE POLICY "파이프라인 조회" ON pipeline_leads FOR SELECT
  USING (is_admin() OR assigned_to = auth.uid());

CREATE POLICY "파이프라인 등록" ON pipeline_leads FOR INSERT
  WITH CHECK (get_user_role() IN ('admin', 'member'));

CREATE POLICY "파이프라인 수정" ON pipeline_leads FOR UPDATE
  USING (is_admin() OR assigned_to = auth.uid());

CREATE POLICY "파이프라인 삭제" ON pipeline_leads FOR DELETE
  USING (is_admin());

-- ============================================
-- pipeline_history
-- ============================================
CREATE POLICY "파이프라인 이력 조회" ON pipeline_history FOR SELECT USING (true);
CREATE POLICY "파이프라인 이력 등록" ON pipeline_history FOR INSERT
  WITH CHECK (get_user_role() IN ('admin', 'member'));

-- ============================================
-- customers (전사 투명성 - 전체 조회 허용)
-- ============================================
CREATE POLICY "고객 전체 조회" ON customers FOR SELECT USING (true);
CREATE POLICY "고객 등록" ON customers FOR INSERT
  WITH CHECK (get_user_role() IN ('admin', 'member'));
CREATE POLICY "고객 수정" ON customers FOR UPDATE
  USING (is_admin_or_accountant());
CREATE POLICY "고객 삭제" ON customers FOR DELETE USING (is_admin());

-- ============================================
-- projects
-- ============================================
CREATE POLICY "프로젝트 전체 조회" ON projects FOR SELECT USING (true);
CREATE POLICY "프로젝트 등록" ON projects FOR INSERT
  WITH CHECK (is_admin_or_accountant());
CREATE POLICY "프로젝트 수정" ON projects FOR UPDATE
  USING (is_admin_or_accountant());
CREATE POLICY "프로젝트 삭제" ON projects FOR DELETE USING (is_admin());

-- ============================================
-- monthly_revenues (전사 투명성 - 전체 조회)
-- ============================================
CREATE POLICY "매출 전체 조회" ON monthly_revenues FOR SELECT USING (true);
CREATE POLICY "매출 등록" ON monthly_revenues FOR INSERT
  WITH CHECK (is_admin_or_accountant());
CREATE POLICY "매출 수정" ON monthly_revenues FOR UPDATE
  USING (is_admin_or_accountant());
CREATE POLICY "매출 삭제" ON monthly_revenues FOR DELETE USING (is_admin());

-- ============================================
-- payments (관리자 + 회계)
-- ============================================
CREATE POLICY "납부 조회" ON payments FOR SELECT
  USING (is_admin_or_accountant());
CREATE POLICY "납부 등록" ON payments FOR INSERT
  WITH CHECK (is_admin_or_accountant());
CREATE POLICY "납부 수정" ON payments FOR UPDATE
  USING (is_admin_or_accountant());
CREATE POLICY "납부 삭제" ON payments FOR DELETE USING (is_admin());

-- ============================================
-- invoices (전사 투명성 - 전체 조회)
-- ============================================
CREATE POLICY "청구서 전체 조회" ON invoices FOR SELECT USING (true);
CREATE POLICY "청구서 등록" ON invoices FOR INSERT
  WITH CHECK (is_admin_or_accountant());
CREATE POLICY "청구서 수정" ON invoices FOR UPDATE
  USING (is_admin_or_accountant());
CREATE POLICY "청구서 삭제" ON invoices FOR DELETE USING (is_admin());

-- ============================================
-- invoice_items
-- ============================================
CREATE POLICY "청구서 항목 전체 조회" ON invoice_items FOR SELECT USING (true);
CREATE POLICY "청구서 항목 등록" ON invoice_items FOR INSERT
  WITH CHECK (is_admin_or_accountant());
CREATE POLICY "청구서 항목 수정" ON invoice_items FOR UPDATE
  USING (is_admin_or_accountant());
CREATE POLICY "청구서 항목 삭제" ON invoice_items FOR DELETE
  USING (is_admin_or_accountant());

-- ============================================
-- voc_tickets
-- ============================================
CREATE POLICY "VoC 조회" ON voc_tickets FOR SELECT
  USING (is_admin() OR assigned_to = auth.uid() OR created_by = auth.uid());

CREATE POLICY "VoC 등록" ON voc_tickets FOR INSERT
  WITH CHECK (get_user_role() IN ('admin', 'member'));

CREATE POLICY "VoC 수정" ON voc_tickets FOR UPDATE
  USING (is_admin() OR assigned_to = auth.uid());

CREATE POLICY "VoC 삭제" ON voc_tickets FOR DELETE USING (is_admin());

-- ============================================
-- voc_responses
-- ============================================
CREATE POLICY "VoC 대응 조회" ON voc_responses FOR SELECT USING (true);
CREATE POLICY "VoC 대응 등록" ON voc_responses FOR INSERT
  WITH CHECK (get_user_role() IN ('admin', 'member'));

-- ============================================
-- meetings
-- ============================================
CREATE POLICY "미팅 조회" ON meetings FOR SELECT
  USING (is_admin() OR created_by = auth.uid());

CREATE POLICY "미팅 등록" ON meetings FOR INSERT
  WITH CHECK (get_user_role() IN ('admin', 'member'));

CREATE POLICY "미팅 수정" ON meetings FOR UPDATE
  USING (is_admin() OR created_by = auth.uid());

CREATE POLICY "미팅 삭제" ON meetings FOR DELETE USING (is_admin());

-- ============================================
-- incentive_settings (본인 + 관리자만)
-- ============================================
CREATE POLICY "인센티브 설정 조회" ON incentive_settings FOR SELECT
  USING (is_admin() OR user_id = auth.uid());

CREATE POLICY "인센티브 설정 등록" ON incentive_settings FOR INSERT
  WITH CHECK (is_admin());
CREATE POLICY "인센티브 설정 수정" ON incentive_settings FOR UPDATE
  USING (is_admin());
CREATE POLICY "인센티브 설정 삭제" ON incentive_settings FOR DELETE
  USING (is_admin());

-- ============================================
-- incentive_records (본인 + 관리자만)
-- ============================================
CREATE POLICY "인센티브 실적 조회" ON incentive_records FOR SELECT
  USING (is_admin() OR user_id = auth.uid());

CREATE POLICY "인센티브 실적 등록" ON incentive_records FOR INSERT
  WITH CHECK (is_admin());
CREATE POLICY "인센티브 실적 수정" ON incentive_records FOR UPDATE
  USING (is_admin());
CREATE POLICY "인센티브 실적 삭제" ON incentive_records FOR DELETE
  USING (is_admin());

-- ============================================
-- marketing_costs
-- ============================================
CREATE POLICY "마케팅 비용 조회" ON marketing_costs FOR SELECT
  USING (is_admin_or_accountant());
CREATE POLICY "마케팅 비용 등록" ON marketing_costs FOR INSERT
  WITH CHECK (is_admin_or_accountant());
CREATE POLICY "마케팅 비용 수정" ON marketing_costs FOR UPDATE
  USING (is_admin_or_accountant());
CREATE POLICY "마케팅 비용 삭제" ON marketing_costs FOR DELETE
  USING (is_admin());

-- ============================================
-- company_settings
-- ============================================
CREATE POLICY "회사 설정 조회" ON company_settings FOR SELECT USING (true);
CREATE POLICY "회사 설정 수정" ON company_settings FOR ALL
  USING (is_admin());

-- ============================================
-- slack_notifications
-- ============================================
CREATE POLICY "알림 조회" ON slack_notifications FOR SELECT
  USING (is_admin() OR target_user_id = auth.uid());
CREATE POLICY "알림 등록" ON slack_notifications FOR INSERT
  WITH CHECK (true);

-- ============================================
-- activity_logs
-- ============================================
CREATE POLICY "활동 로그 조회" ON activity_logs FOR SELECT
  USING (is_admin() OR performed_by = auth.uid());
CREATE POLICY "활동 로그 등록" ON activity_logs FOR INSERT
  WITH CHECK (get_user_role() IN ('admin', 'member'));
CREATE POLICY "활동 로그 수정" ON activity_logs FOR UPDATE
  USING (is_admin() OR performed_by = auth.uid());
CREATE POLICY "활동 로그 삭제" ON activity_logs FOR DELETE
  USING (is_admin() OR performed_by = auth.uid());

-- ============================================
-- sla_policies
-- ============================================
CREATE POLICY "SLA 정책 조회" ON sla_policies FOR SELECT USING (true);
CREATE POLICY "SLA 정책 수정" ON sla_policies FOR ALL USING (is_admin());

-- ============================================
-- user_schedules
-- ============================================
CREATE POLICY "일정 조회" ON user_schedules FOR SELECT USING (true);
CREATE POLICY "일정 등록" ON user_schedules FOR INSERT
  WITH CHECK (user_id = auth.uid() OR is_admin());
CREATE POLICY "일정 수정" ON user_schedules FOR UPDATE
  USING (user_id = auth.uid() OR is_admin());
CREATE POLICY "일정 삭제" ON user_schedules FOR DELETE
  USING (user_id = auth.uid() OR is_admin());

-- ============================================
-- audit_logs (관리자만 조회, 시스템에서 등록)
-- ============================================
CREATE POLICY "감사 로그 조회" ON audit_logs FOR SELECT USING (is_admin());
CREATE POLICY "감사 로그 등록" ON audit_logs FOR INSERT WITH CHECK (true);

-- ============================================
-- push_subscriptions
-- ============================================
CREATE POLICY "푸시 구독 조회" ON push_subscriptions FOR SELECT
  USING (user_id = auth.uid() OR is_admin());
CREATE POLICY "푸시 구독 등록" ON push_subscriptions FOR INSERT
  WITH CHECK (user_id = auth.uid());
CREATE POLICY "푸시 구독 수정" ON push_subscriptions FOR UPDATE
  USING (user_id = auth.uid());
CREATE POLICY "푸시 구독 삭제" ON push_subscriptions FOR DELETE
  USING (user_id = auth.uid());
