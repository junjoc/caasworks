-- ============================================
-- CaasWorks CRM - Additional Tables Migration
-- ============================================

-- Costs/Expenses
CREATE TABLE IF NOT EXISTS costs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  category TEXT NOT NULL,
  subcategory TEXT,
  description TEXT NOT NULL,
  amount NUMERIC DEFAULT 0,
  cost_date DATE NOT NULL,
  cost_type TEXT DEFAULT 'variable' CHECK (cost_type IN ('fixed', 'variable')),
  vendor TEXT,
  notes TEXT,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Contracts
CREATE TABLE IF NOT EXISTS contracts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  contract_number TEXT,
  customer_id UUID REFERENCES customers(id),
  quotation_id UUID REFERENCES quotations(id),
  title TEXT NOT NULL,
  contract_type TEXT DEFAULT 'standard',
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'expired', 'terminated')),
  start_date DATE,
  end_date DATE,
  amount NUMERIC DEFAULT 0,
  monthly_amount NUMERIC DEFAULT 0,
  auto_renewal BOOLEAN DEFAULT false,
  terms TEXT,
  notes TEXT,
  file_url TEXT,
  file_name TEXT,
  signed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Equipment
CREATE TABLE IF NOT EXISTS equipment (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  serial_number TEXT,
  status TEXT DEFAULT 'stock' CHECK (status IN ('stock', 'deployed', 'repair', 'retired')),
  customer_id UUID REFERENCES customers(id),
  project_id UUID REFERENCES projects(id),
  deployed_at TIMESTAMPTZ,
  returned_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Purchase Orders
CREATE TABLE IF NOT EXISTS purchase_orders (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  order_number TEXT,
  vendor TEXT NOT NULL,
  status TEXT DEFAULT 'requested' CHECK (status IN ('requested', 'approved', 'ordered', 'shipping', 'received', 'cancelled')),
  items JSONB DEFAULT '[]',
  total_amount NUMERIC DEFAULT 0,
  ordered_at TIMESTAMPTZ,
  expected_at TIMESTAMPTZ,
  received_at TIMESTAMPTZ,
  notes TEXT,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Customer Documents
CREATE TABLE IF NOT EXISTS customer_documents (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  customer_id UUID REFERENCES customers(id) ON DELETE CASCADE,
  doc_type TEXT NOT NULL CHECK (doc_type IN ('business_registration', 'bank_account', 'contract', 'other')),
  title TEXT NOT NULL,
  file_url TEXT,
  file_name TEXT,
  version INTEGER DEFAULT 1,
  metadata JSONB DEFAULT '{}',
  notes TEXT,
  uploaded_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Ad Performance (Marketing)
CREATE TABLE IF NOT EXISTS ad_performance (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  platform TEXT NOT NULL CHECK (platform IN ('naver', 'google', 'meta', 'other')),
  campaign_name TEXT,
  ad_date DATE NOT NULL,
  impressions INTEGER DEFAULT 0,
  clicks INTEGER DEFAULT 0,
  cost NUMERIC DEFAULT 0,
  conversions INTEGER DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Traffic Analytics (Marketing)
CREATE TABLE IF NOT EXISTS traffic_analytics (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  analytics_date DATE NOT NULL,
  source TEXT NOT NULL,
  sessions INTEGER DEFAULT 0,
  users INTEGER DEFAULT 0,
  page_views INTEGER DEFAULT 0,
  bounce_rate NUMERIC DEFAULT 0,
  conversion_rate NUMERIC DEFAULT 0,
  conversions INTEGER DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Campaigns (Marketing)
CREATE TABLE IF NOT EXISTS campaigns (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  status TEXT DEFAULT 'preparing' CHECK (status IN ('preparing', 'active', 'paused', 'completed')),
  channel TEXT,
  budget NUMERIC DEFAULT 0,
  spent NUMERIC DEFAULT 0,
  start_date DATE,
  end_date DATE,
  goal TEXT,
  results TEXT,
  notes TEXT,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Video Records (Operations)
CREATE TABLE IF NOT EXISTS video_records (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID REFERENCES projects(id),
  site_name TEXT NOT NULL,
  record_type TEXT CHECK (record_type IN ('panorama', 'always_on', 'important', 'inspection')),
  record_date DATE NOT NULL,
  duration TEXT,
  file_url TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Daily Reports (Work)
CREATE TABLE IF NOT EXISTS daily_reports (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES users(id),
  report_date DATE NOT NULL,
  activities TEXT,
  sales_status TEXT,
  tomorrow_plan TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS on all new tables
ALTER TABLE costs ENABLE ROW LEVEL SECURITY;
ALTER TABLE contracts ENABLE ROW LEVEL SECURITY;
ALTER TABLE equipment ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE ad_performance ENABLE ROW LEVEL SECURITY;
ALTER TABLE traffic_analytics ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE video_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_reports ENABLE ROW LEVEL SECURITY;

-- Create policies for all new tables
DO $$
DECLARE
  t TEXT;
BEGIN
  FOR t IN SELECT unnest(ARRAY['costs', 'contracts', 'equipment', 'purchase_orders', 'customer_documents', 'ad_performance', 'traffic_analytics', 'campaigns', 'video_records', 'daily_reports'])
  LOOP
    EXECUTE format('CREATE POLICY "Allow all for authenticated" ON %I FOR ALL TO authenticated USING (true) WITH CHECK (true)', t);
    EXECUTE format('CREATE POLICY "Allow read for anon" ON %I FOR SELECT TO anon USING (true)', t);
  END LOOP;
END $$;
