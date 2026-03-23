-- ============================================
-- CaaS.Works CRM - 전체 테이블 생성
-- ============================================

-- 0. UUID 확장
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- 1. users (사용자)
-- ============================================
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('admin', 'member', 'accountant')),
  slack_user_id TEXT,
  phone TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================
-- 2. pipeline_leads (파이프라인 리드)
-- ============================================
CREATE TABLE pipeline_leads (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  lead_number SERIAL,
  customer_code TEXT UNIQUE,
  company_name TEXT NOT NULL,
  contact_person TEXT,
  contact_phone TEXT,
  contact_email TEXT,
  stage TEXT NOT NULL DEFAULT '신규리드'
    CHECK (stage IN ('신규리드','컨택','미팅','제안','계약','도입완료')),
  core_need TEXT,
  inquiry_source TEXT,
  inquiry_content TEXT,
  assigned_to UUID REFERENCES users(id),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  converted_at TIMESTAMPTZ,
  customer_id UUID
);

-- ============================================
-- 3. pipeline_history (파이프라인 변경 이력)
-- ============================================
CREATE TABLE pipeline_history (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  lead_id UUID NOT NULL REFERENCES pipeline_leads(id) ON DELETE CASCADE,
  field_changed TEXT NOT NULL,
  old_value TEXT,
  new_value TEXT,
  changed_by UUID REFERENCES users(id),
  changed_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================
-- 4. customers (고객)
-- ============================================
CREATE TABLE customers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  customer_code TEXT UNIQUE,
  company_name TEXT NOT NULL,
  company_type TEXT,
  contact_person TEXT,
  contact_phone TEXT,
  contact_email TEXT,
  assigned_to UUID REFERENCES users(id),
  billing_type TEXT,
  billing_start DATE,
  billing_end DATE,
  user_count INTEGER,
  service_type TEXT,
  status TEXT DEFAULT 'active' CHECK (status IN ('active','suspended','churned')),
  invoice_email TEXT,
  invoice_contact TEXT,
  invoice_phone TEXT,
  business_reg_no TEXT,
  tax_invoice_email TEXT,
  deposit_amount DECIMAL(15,2),
  deposit_paid_at DATE,
  deposit_returned_at DATE,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- pipeline_leads.customer_id FK 추가
ALTER TABLE pipeline_leads
  ADD CONSTRAINT fk_pipeline_customer
  FOREIGN KEY (customer_id) REFERENCES customers(id);

-- ============================================
-- 5. projects (현장/프로젝트)
-- ============================================
CREATE TABLE projects (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  project_name TEXT NOT NULL,
  project_start DATE,
  project_end DATE,
  service_type TEXT,
  site_category TEXT,
  site_category2 TEXT,
  billing_start DATE,
  billing_end DATE,
  monthly_amount DECIMAL(15,2),
  status TEXT DEFAULT 'active',
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================
-- 6. monthly_revenues (월별 매출)
-- ============================================
CREATE TABLE monthly_revenues (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES customers(id),
  year INTEGER NOT NULL,
  month INTEGER NOT NULL CHECK (month BETWEEN 1 AND 12),
  amount DECIMAL(15,2) NOT NULL,
  is_confirmed BOOLEAN DEFAULT false,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(project_id, year, month)
);

-- ============================================
-- 7. payments (납부 이력)
-- ============================================
CREATE TABLE payments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  customer_id UUID NOT NULL REFERENCES customers(id),
  invoice_date DATE,
  due_date DATE,
  paid_date DATE,
  amount DECIMAL(15,2),
  payer_name TEXT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending','paid','overdue')),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================
-- 8. invoices (청구서)
-- ============================================
CREATE TABLE invoices (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  customer_id UUID NOT NULL REFERENCES customers(id),
  invoice_number TEXT UNIQUE,
  year INTEGER NOT NULL,
  month INTEGER NOT NULL,
  sender_company TEXT,
  sender_biz_no TEXT,
  sender_ceo TEXT,
  sender_address TEXT,
  sender_contact_name TEXT,
  sender_contact_info TEXT,
  receiver_company TEXT,
  receiver_biz_no TEXT,
  receiver_contact TEXT,
  receiver_email TEXT,
  subtotal DECIMAL(15,2),
  vat DECIMAL(15,2),
  total DECIMAL(15,2),
  due_date DATE,
  bank_info TEXT,
  status TEXT DEFAULT 'draft'
    CHECK (status IN ('draft','confirmed','sent','paid','overdue')),
  sent_at TIMESTAMPTZ,
  paid_at TIMESTAMPTZ,
  pdf_url TEXT,
  notes TEXT,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(customer_id, year, month)
);

-- ============================================
-- 9. invoice_items (청구서 항목)
-- ============================================
CREATE TABLE invoice_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  invoice_id UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  item_no INTEGER,
  project_name TEXT,
  service_type TEXT,
  period TEXT,
  quantity INTEGER DEFAULT 1,
  unit_price DECIMAL(15,2),
  amount DECIMAL(15,2),
  notes TEXT
);

-- ============================================
-- 10. voc_tickets (VoC/CS 티켓)
-- ============================================
CREATE TABLE voc_tickets (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  ticket_number SERIAL,
  customer_id UUID NOT NULL REFERENCES customers(id),
  category TEXT NOT NULL
    CHECK (category IN ('dev_request','bug','inquiry','contract','complaint')),
  channel TEXT CHECK (channel IN ('phone','message','email','meeting','other')),
  priority TEXT DEFAULT 'normal'
    CHECK (priority IN ('urgent','high','normal','low')),
  title TEXT NOT NULL,
  description TEXT,
  status TEXT DEFAULT 'received'
    CHECK (status IN ('received','reviewing','in_progress','resolved','closed')),
  assigned_to UUID REFERENCES users(id),
  resolved_at TIMESTAMPTZ,
  closed_at TIMESTAMPTZ,
  resolution_note TEXT,
  converted_to_lead UUID REFERENCES pipeline_leads(id),
  reported_by TEXT,
  reported_at TIMESTAMPTZ DEFAULT now(),
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================
-- 11. voc_responses (VoC 대응 이력)
-- ============================================
CREATE TABLE voc_responses (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  ticket_id UUID NOT NULL REFERENCES voc_tickets(id) ON DELETE CASCADE,
  response_by UUID REFERENCES users(id),
  content TEXT NOT NULL,
  response_type TEXT DEFAULT 'note'
    CHECK (response_type IN ('note','phone_call','email','meeting','status_change')),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================
-- 12. meetings (고객 미팅)
-- ============================================
CREATE TABLE meetings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  customer_id UUID REFERENCES customers(id),
  lead_id UUID REFERENCES pipeline_leads(id),
  meeting_number INTEGER,
  meeting_date DATE NOT NULL,
  internal_attendees TEXT[],
  external_attendees TEXT,
  company_name TEXT,
  industry TEXT,
  grade TEXT,
  site_count INTEGER,
  source TEXT,
  pain_points TEXT,
  positives TEXT,
  difficulties TEXT,
  meeting_result TEXT,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================
-- 13. incentive_settings (인센티브 설정)
-- ============================================
CREATE TABLE incentive_settings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id),
  year INTEGER NOT NULL,
  month INTEGER NOT NULL,
  base_salary DECIMAL(15,2),
  contract_rate DECIMAL(5,4),
  contract_base DECIMAL(15,2),
  subscription_rate DECIMAL(5,4),
  subscription_period INTEGER,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, year, month)
);

-- ============================================
-- 14. incentive_records (인센티브 실적)
-- ============================================
CREATE TABLE incentive_records (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id),
  year INTEGER NOT NULL,
  month INTEGER NOT NULL,
  contract_count INTEGER DEFAULT 0,
  contract_amount DECIMAL(15,2),
  subscription_amount DECIMAL(15,2),
  incentive_total DECIMAL(15,2),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, year, month)
);

-- ============================================
-- 15. marketing_costs (마케팅 비용)
-- ============================================
CREATE TABLE marketing_costs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  year INTEGER NOT NULL,
  month INTEGER NOT NULL,
  channel TEXT NOT NULL,
  amount DECIMAL(15,2) NOT NULL,
  description TEXT,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(year, month, channel)
);

-- ============================================
-- 16. company_settings (회사 설정)
-- ============================================
CREATE TABLE company_settings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  key TEXT UNIQUE NOT NULL,
  value JSONB,
  updated_by UUID REFERENCES users(id),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================
-- 17. slack_notifications (알림 로그)
-- ============================================
CREATE TABLE slack_notifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  type TEXT,
  target_user_id UUID REFERENCES users(id),
  message TEXT,
  related_id UUID,
  sent_at TIMESTAMPTZ DEFAULT now(),
  is_success BOOLEAN DEFAULT true
);

-- ============================================
-- 18. activity_logs (고객 여정 활동 로그) - v1.4
-- ============================================
CREATE TABLE activity_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  lead_id UUID REFERENCES pipeline_leads(id),
  customer_id UUID REFERENCES customers(id),
  activity_type TEXT NOT NULL
    CHECK (activity_type IN (
      'CALL_OUT','CALL_IN','EMAIL_SENT','EMAIL_RECV',
      'MEETING','DEMO','PROPOSAL','CONTRACT',
      'ONBOARDING','FOLLOWUP','NOTE'
    )),
  title TEXT,
  description TEXT,
  duration_minutes INTEGER,
  meeting_id UUID REFERENCES meetings(id),
  voc_ticket_id UUID REFERENCES voc_tickets(id),
  performed_by UUID NOT NULL REFERENCES users(id),
  performed_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================
-- 19. sla_policies (SLA 정책) - v1.4
-- ============================================
CREATE TABLE sla_policies (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  priority TEXT UNIQUE NOT NULL CHECK (priority IN ('urgent','high','normal','low')),
  first_response_minutes INTEGER NOT NULL,
  resolution_minutes INTEGER NOT NULL,
  escalation_minutes INTEGER NOT NULL,
  is_active BOOLEAN DEFAULT true,
  updated_by UUID REFERENCES users(id),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 기본 SLA 정책 삽입
INSERT INTO sla_policies (priority, first_response_minutes, resolution_minutes, escalation_minutes) VALUES
  ('urgent', 30, 120, 30),
  ('high', 120, 300, 120),
  ('normal', 480, 1440, 1440),
  ('low', 1440, 4320, 4320);

-- ============================================
-- 20. user_schedules (담당자 일정/휴가) - v1.4
-- ============================================
CREATE TABLE user_schedules (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id),
  schedule_type TEXT NOT NULL
    CHECK (schedule_type IN ('vacation','half_day','business_trip','training','other')),
  title TEXT,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  start_time TIME,
  end_time TIME,
  status TEXT DEFAULT 'pending'
    CHECK (status IN ('pending','approved','rejected')),
  approved_by UUID REFERENCES users(id),
  approved_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================
-- 21. audit_logs (통합 감사 로그) - v1.4
-- ============================================
CREATE TABLE audit_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  entity_type TEXT NOT NULL,
  entity_id UUID NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('create','update','delete','status_change')),
  changes JSONB,
  performed_by UUID REFERENCES users(id),
  performed_at TIMESTAMPTZ DEFAULT now(),
  ip_address INET,
  user_agent TEXT
);

-- ============================================
-- 22. push_subscriptions (푸시 알림 구독) - v1.4
-- ============================================
CREATE TABLE push_subscriptions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id),
  endpoint TEXT NOT NULL,
  p256dh_key TEXT NOT NULL,
  auth_key TEXT NOT NULL,
  notify_new_lead BOOLEAN DEFAULT true,
  notify_voc_urgent BOOLEAN DEFAULT true,
  notify_sla_warning BOOLEAN DEFAULT true,
  notify_payment BOOLEAN DEFAULT true,
  notify_invoice BOOLEAN DEFAULT false,
  notify_reminder BOOLEAN DEFAULT true,
  device_info TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, endpoint)
);

-- ============================================
-- 인덱스
-- ============================================
CREATE INDEX idx_pipeline_leads_stage ON pipeline_leads(stage);
CREATE INDEX idx_pipeline_leads_assigned ON pipeline_leads(assigned_to);
CREATE INDEX idx_pipeline_history_lead ON pipeline_history(lead_id);
CREATE INDEX idx_customers_assigned ON customers(assigned_to);
CREATE INDEX idx_customers_status ON customers(status);
CREATE INDEX idx_projects_customer ON projects(customer_id);
CREATE INDEX idx_monthly_revenues_customer ON monthly_revenues(customer_id);
CREATE INDEX idx_monthly_revenues_period ON monthly_revenues(year, month);
CREATE INDEX idx_payments_customer ON payments(customer_id);
CREATE INDEX idx_payments_status ON payments(status);
CREATE INDEX idx_invoices_customer ON invoices(customer_id);
CREATE INDEX idx_invoices_period ON invoices(year, month);
CREATE INDEX idx_invoices_status ON invoices(status);
CREATE INDEX idx_voc_tickets_customer ON voc_tickets(customer_id);
CREATE INDEX idx_voc_tickets_status ON voc_tickets(status);
CREATE INDEX idx_voc_tickets_assigned ON voc_tickets(assigned_to);
CREATE INDEX idx_voc_tickets_priority ON voc_tickets(priority);
CREATE INDEX idx_voc_responses_ticket ON voc_responses(ticket_id);
CREATE INDEX idx_meetings_customer ON meetings(customer_id);
CREATE INDEX idx_meetings_date ON meetings(meeting_date);
CREATE INDEX idx_activity_logs_lead ON activity_logs(lead_id);
CREATE INDEX idx_activity_logs_customer ON activity_logs(customer_id);
CREATE INDEX idx_activity_logs_performer ON activity_logs(performed_by);
CREATE INDEX idx_audit_logs_entity ON audit_logs(entity_type, entity_id);
CREATE INDEX idx_audit_logs_performer ON audit_logs(performed_by);
CREATE INDEX idx_audit_logs_performed_at ON audit_logs(performed_at);
CREATE INDEX idx_user_schedules_user ON user_schedules(user_id);
CREATE INDEX idx_user_schedules_dates ON user_schedules(start_date, end_date);

-- ============================================
-- updated_at 자동 갱신 트리거
-- ============================================
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tr_pipeline_leads_updated
  BEFORE UPDATE ON pipeline_leads
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER tr_customers_updated
  BEFORE UPDATE ON customers
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER tr_voc_tickets_updated
  BEFORE UPDATE ON voc_tickets
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER tr_meetings_updated
  BEFORE UPDATE ON meetings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
