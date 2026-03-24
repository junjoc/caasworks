-- ============================================================
-- 견적서 테이블 스키마 업그레이드
-- 기존 quotations/quotation_items 테이블을 새 스키마로 업그레이드
-- Supabase SQL Editor에서 실행하세요.
-- ============================================================

-- 1. quotations 테이블에 새 컬럼 추가 (기존 컬럼 유지하면서)
DO $$
BEGIN
  -- customer_name
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'quotations' AND column_name = 'customer_name') THEN
    ALTER TABLE quotations ADD COLUMN customer_name TEXT NOT NULL DEFAULT '';
  END IF;

  -- contact_person
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'quotations' AND column_name = 'contact_person') THEN
    ALTER TABLE quotations ADD COLUMN contact_person TEXT;
  END IF;

  -- project_name
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'quotations' AND column_name = 'project_name') THEN
    ALTER TABLE quotations ADD COLUMN project_name TEXT;
  END IF;

  -- quotation_type
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'quotations' AND column_name = 'quotation_type') THEN
    ALTER TABLE quotations ADD COLUMN quotation_type TEXT NOT NULL DEFAULT '임대';
  END IF;

  -- version
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'quotations' AND column_name = 'version') THEN
    ALTER TABLE quotations ADD COLUMN version INT NOT NULL DEFAULT 1;
  END IF;

  -- parent_quotation_id
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'quotations' AND column_name = 'parent_quotation_id') THEN
    ALTER TABLE quotations ADD COLUMN parent_quotation_id UUID REFERENCES quotations(id) ON DELETE SET NULL;
  END IF;

  -- quotation_date
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'quotations' AND column_name = 'quotation_date') THEN
    ALTER TABLE quotations ADD COLUMN quotation_date DATE NOT NULL DEFAULT CURRENT_DATE;
  END IF;

  -- discount_type
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'quotations' AND column_name = 'discount_type') THEN
    ALTER TABLE quotations ADD COLUMN discount_type TEXT NOT NULL DEFAULT 'none';
  END IF;

  -- discount_value
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'quotations' AND column_name = 'discount_value') THEN
    ALTER TABLE quotations ADD COLUMN discount_value NUMERIC NOT NULL DEFAULT 0;
  END IF;

  -- discount_amount
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'quotations' AND column_name = 'discount_amount') THEN
    ALTER TABLE quotations ADD COLUMN discount_amount BIGINT NOT NULL DEFAULT 0;
  END IF;

  -- vat_included
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'quotations' AND column_name = 'vat_included') THEN
    ALTER TABLE quotations ADD COLUMN vat_included BOOLEAN NOT NULL DEFAULT false;
  END IF;

  -- deposit
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'quotations' AND column_name = 'deposit') THEN
    ALTER TABLE quotations ADD COLUMN deposit BIGINT NOT NULL DEFAULT 0;
  END IF;

  -- deposit_note
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'quotations' AND column_name = 'deposit_note') THEN
    ALTER TABLE quotations ADD COLUMN deposit_note TEXT;
  END IF;

  -- terms
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'quotations' AND column_name = 'terms') THEN
    ALTER TABLE quotations ADD COLUMN terms TEXT;
  END IF;

  -- lead_id를 nullable로 변경 (파이프라인 연결 없이도 견적서 작성 가능)
  ALTER TABLE quotations ALTER COLUMN lead_id DROP NOT NULL;
END $$;

-- 기존 데이터 마이그레이션: title -> customer_name (기존 견적서가 있는 경우)
UPDATE quotations
SET customer_name = COALESCE(title, '')
WHERE customer_name = '' AND title IS NOT NULL;

-- quotation_date 기본값 설정 (기존 데이터)
UPDATE quotations
SET quotation_date = CAST(created_at AS DATE)
WHERE quotation_date = CURRENT_DATE AND created_at < CURRENT_DATE;

-- 2. quotation_items 테이블에 새 컬럼 추가
DO $$
BEGIN
  -- item_no
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'quotation_items' AND column_name = 'item_no') THEN
    ALTER TABLE quotation_items ADD COLUMN item_no INT NOT NULL DEFAULT 1;
  END IF;

  -- category
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'quotation_items' AND column_name = 'category') THEN
    ALTER TABLE quotation_items ADD COLUMN category TEXT;
  END IF;

  -- product_id
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'quotation_items' AND column_name = 'product_id') THEN
    ALTER TABLE quotation_items ADD COLUMN product_id UUID REFERENCES products(id) ON DELETE SET NULL;
  END IF;

  -- period_months
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'quotation_items' AND column_name = 'period_months') THEN
    ALTER TABLE quotation_items ADD COLUMN period_months INT;
  END IF;

  -- supply_method
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'quotation_items' AND column_name = 'supply_method') THEN
    ALTER TABLE quotation_items ADD COLUMN supply_method TEXT;
  END IF;

  -- cost_price
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'quotation_items' AND column_name = 'cost_price') THEN
    ALTER TABLE quotation_items ADD COLUMN cost_price NUMERIC;
  END IF;

  -- notes
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'quotation_items' AND column_name = 'notes') THEN
    ALTER TABLE quotation_items ADD COLUMN notes TEXT;
  END IF;

  -- sort_order
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'quotation_items' AND column_name = 'sort_order') THEN
    ALTER TABLE quotation_items ADD COLUMN sort_order INT NOT NULL DEFAULT 0;
  END IF;
END $$;

-- 3. 인덱스 추가
CREATE INDEX IF NOT EXISTS idx_quotations_customer_name ON quotations(customer_name);
CREATE INDEX IF NOT EXISTS idx_quotations_status ON quotations(status);
CREATE INDEX IF NOT EXISTS idx_quotations_quotation_type ON quotations(quotation_type);
CREATE INDEX IF NOT EXISTS idx_quotations_created_by ON quotations(created_by);
CREATE INDEX IF NOT EXISTS idx_quotations_parent_id ON quotations(parent_quotation_id);
CREATE INDEX IF NOT EXISTS idx_quotation_items_product_id ON quotation_items(product_id);

-- 4. updated_at 자동 업데이트 트리거
CREATE OR REPLACE FUNCTION update_quotations_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tr_quotations_updated_at ON quotations;
CREATE TRIGGER tr_quotations_updated_at
  BEFORE UPDATE ON quotations
  FOR EACH ROW
  EXECUTE FUNCTION update_quotations_updated_at();
