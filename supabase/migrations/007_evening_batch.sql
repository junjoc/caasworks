-- Migration 007: Evening batch (2026-04-24)
-- Combines schema changes for the night's work. Run once in SQL Editor.
-- Safe — all ADD COLUMN IF NOT EXISTS / CREATE TABLE IF NOT EXISTS.

-- ═══════════════════════════════════════════════════════════════
-- Part A: #10 User feedback + dev log system
-- ═══════════════════════════════════════════════════════════════

-- Main feedback record. Becomes a dev log entry once status='done'.
CREATE TABLE IF NOT EXISTS user_feedbacks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text,
  category text NOT NULL DEFAULT 'feature',  -- 'bug'|'feature'|'improvement'|'question'
  status text NOT NULL DEFAULT 'submitted',   -- 'submitted'|'reviewing'|'planned'|'in_progress'|'done'|'wont_do'
  priority text NOT NULL DEFAULT 'normal',    -- 'high'|'normal'|'low'
  target_page text,                            -- /pipeline/board etc
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  assigned_to uuid REFERENCES users(id) ON DELETE SET NULL,

  -- Dev-log fields (filled in as status progresses)
  planned_at timestamptz,
  planned_for date,
  started_at timestamptz,
  completed_at timestamptz,
  resolution_summary text,
  pr_urls text[] DEFAULT '{}',
  commit_shas text[] DEFAULT '{}',
  affected_files text[] DEFAULT '{}',

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_feedbacks_status ON user_feedbacks(status);
CREATE INDEX IF NOT EXISTS idx_user_feedbacks_created_by ON user_feedbacks(created_by);
CREATE INDEX IF NOT EXISTS idx_user_feedbacks_completed_at ON user_feedbacks(completed_at DESC) WHERE completed_at IS NOT NULL;

-- Thread comments (team discussions, admin directives, Claude reports)
CREATE TABLE IF NOT EXISTS feedback_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  feedback_id uuid NOT NULL REFERENCES user_feedbacks(id) ON DELETE CASCADE,
  author_id uuid REFERENCES users(id) ON DELETE SET NULL,
  author_type text NOT NULL DEFAULT 'user',  -- 'user'|'admin'|'claude'
  comment text NOT NULL,
  is_admin_directive boolean NOT NULL DEFAULT false,  -- admin's "이렇게 구현해" instruction
  is_claude_report boolean NOT NULL DEFAULT false,    -- Claude's work report
  claude_processed_at timestamptz,                     -- when Claude picked up a directive
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_feedback_comments_feedback ON feedback_comments(feedback_id, created_at);
CREATE INDEX IF NOT EXISTS idx_feedback_comments_claude_queue
  ON feedback_comments(created_at) WHERE is_admin_directive = true AND claude_processed_at IS NULL;

-- Auto-updated_at trigger
CREATE OR REPLACE FUNCTION trigger_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS user_feedbacks_set_updated_at ON user_feedbacks;
CREATE TRIGGER user_feedbacks_set_updated_at
  BEFORE UPDATE ON user_feedbacks
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- RLS: everyone logged-in can read + create; admin can update status
ALTER TABLE user_feedbacks ENABLE ROW LEVEL SECURITY;
ALTER TABLE feedback_comments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "feedbacks_select" ON user_feedbacks;
CREATE POLICY "feedbacks_select" ON user_feedbacks FOR SELECT USING (true);
DROP POLICY IF EXISTS "feedbacks_write" ON user_feedbacks;
CREATE POLICY "feedbacks_write" ON user_feedbacks FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "comments_select" ON feedback_comments;
CREATE POLICY "comments_select" ON feedback_comments FOR SELECT USING (true);
DROP POLICY IF EXISTS "comments_write" ON feedback_comments;
CREATE POLICY "comments_write" ON feedback_comments FOR ALL USING (true) WITH CHECK (true);

-- ═══════════════════════════════════════════════════════════════
-- Part B: #6 Revenue type (상품/서비스)
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS revenue_type text;  -- '상품' | '서비스' | null

ALTER TABLE monthly_revenues
  ADD COLUMN IF NOT EXISTS revenue_type text;  -- override at revenue level (optional)

-- ═══════════════════════════════════════════════════════════════
-- Part C: #5 매입 (assets/inventory/purchases/rentals)
-- ═══════════════════════════════════════════════════════════════

-- Asset registry (owned hardware we track)
CREATE TABLE IF NOT EXISTS assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_code text UNIQUE,                    -- 내부 자산번호
  category text,                              -- '카메라' / 'LTE' / 'AP' / etc
  model text,
  serial_no text,
  purchase_date date,
  purchase_price numeric,
  vendor text,
  status text DEFAULT 'available',           -- 'available' / 'in_use' / 'repair' / 'disposed'
  current_site text,                         -- 현재 배치된 현장
  current_customer_id uuid REFERENCES customers(id) ON DELETE SET NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_assets_status ON assets(status);
CREATE INDEX IF NOT EXISTS idx_assets_category ON assets(category);

-- Purchase records (매입 장부)
CREATE TABLE IF NOT EXISTS purchases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_date date,
  vendor text,
  item text,
  category text,                              -- '상품' / '임대' / '소모품' etc
  quantity integer,
  unit_price numeric,
  total_amount numeric,
  vat numeric,
  invoice_no text,
  payment_date date,
  status text DEFAULT 'ordered',             -- 'ordered' / 'received' / 'paid' / 'cancelled'
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_purchases_date ON purchases(purchase_date DESC);
CREATE INDEX IF NOT EXISTS idx_purchases_status ON purchases(status);

-- Inventory (재고 현황 스냅샷)
CREATE TABLE IF NOT EXISTS inventory_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sku text,
  name text NOT NULL,
  category text,
  current_qty integer NOT NULL DEFAULT 0,
  reorder_point integer DEFAULT 0,
  unit_cost numeric,
  location text,                              -- 창고/보관 위치
  last_stock_count_at timestamptz,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_inventory_sku ON inventory_items(sku);

-- Rentals (임대 내역)
CREATE TABLE IF NOT EXISTS rentals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id uuid REFERENCES assets(id) ON DELETE SET NULL,
  customer_id uuid REFERENCES customers(id) ON DELETE SET NULL,
  project_id uuid REFERENCES projects(id) ON DELETE SET NULL,
  start_date date,
  end_date date,
  monthly_rate numeric,
  status text DEFAULT 'active',              -- 'active' / 'returned' / 'overdue'
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rentals_customer ON rentals(customer_id);
CREATE INDEX IF NOT EXISTS idx_rentals_status ON rentals(status);

-- RLS for new tables
ALTER TABLE assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchases ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE rentals ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE t text;
BEGIN
  FOR t IN SELECT unnest(ARRAY['assets','purchases','inventory_items','rentals']) LOOP
    EXECUTE format('DROP POLICY IF EXISTS "%1$s_all" ON %1$s', t);
    EXECUTE format('CREATE POLICY "%1$s_all" ON %1$s FOR ALL USING (true) WITH CHECK (true)', t);
  END LOOP;
END $$;

-- Auto-updated_at triggers
DROP TRIGGER IF EXISTS assets_updated_at ON assets;
CREATE TRIGGER assets_updated_at BEFORE UPDATE ON assets
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
DROP TRIGGER IF EXISTS purchases_updated_at ON purchases;
CREATE TRIGGER purchases_updated_at BEFORE UPDATE ON purchases
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
DROP TRIGGER IF EXISTS inventory_items_updated_at ON inventory_items;
CREATE TRIGGER inventory_items_updated_at BEFORE UPDATE ON inventory_items
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
DROP TRIGGER IF EXISTS rentals_updated_at ON rentals;
CREATE TRIGGER rentals_updated_at BEFORE UPDATE ON rentals
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- Done.
