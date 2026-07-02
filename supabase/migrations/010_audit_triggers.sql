-- ================================================================
-- Migration 010: audit_logs 자동 기록 trigger
-- 이관 문서 STEP 2-A. audit_logs 미들웨어 미구현 문제 해결.
--
-- 주요 테이블 (projects, monthly_revenues, customers, invoices, pipeline_leads)
-- 에 INSERT/UPDATE/DELETE trigger 추가.
-- 각 이벤트마다 audit_logs 에 entity_type / entity_id / action / changes(JSONB) 기록.
--
-- 안전 원칙:
-- - trigger 실패해도 원본 작업 계속 진행 (WHEN 조건 없이 EXCEPTION 처리 미포함)
-- - RLS bypass 필요 없음 (trigger 는 SECURITY DEFINER 로 실행)
-- ================================================================

-- audit_logs 테이블 이미 존재 (migration 001). 필요한 컬럼:
-- id, entity_type, entity_id, action, changes JSONB, created_at
-- created_by / updated_by 등 사용자 컬럼은 없음 (감사 자동화 목적으로 트리거 단독 실행)

-- ----------------------------------------------------------------
-- 공통 함수: audit_logs 로그 기록
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION audit_trigger_fn()
RETURNS TRIGGER AS $$
DECLARE
  v_entity_id UUID;
  v_action TEXT;
  v_changes JSONB;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_action := 'create';
    v_entity_id := NEW.id;
    v_changes := to_jsonb(NEW);
  ELSIF TG_OP = 'UPDATE' THEN
    v_action := 'update';
    v_entity_id := NEW.id;
    -- 변경된 필드만 기록 (before/after 쌍)
    v_changes := jsonb_build_object(
      'before', to_jsonb(OLD),
      'after', to_jsonb(NEW)
    );
  ELSIF TG_OP = 'DELETE' THEN
    v_action := 'delete';
    v_entity_id := OLD.id;
    v_changes := to_jsonb(OLD);
  END IF;

  INSERT INTO audit_logs (entity_type, entity_id, action, changes)
  VALUES (TG_TABLE_NAME, v_entity_id, v_action, v_changes);

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  ELSE
    RETURN NEW;
  END IF;
EXCEPTION WHEN OTHERS THEN
  -- audit 실패는 원본 작업을 막지 않음
  RAISE WARNING 'audit_trigger_fn failed: %', SQLERRM;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  ELSE
    RETURN NEW;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ----------------------------------------------------------------
-- 각 테이블에 trigger 부착 (기존 있으면 재생성)
-- ----------------------------------------------------------------
DROP TRIGGER IF EXISTS audit_projects ON projects;
CREATE TRIGGER audit_projects
  AFTER INSERT OR UPDATE OR DELETE ON projects
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_fn();

DROP TRIGGER IF EXISTS audit_monthly_revenues ON monthly_revenues;
CREATE TRIGGER audit_monthly_revenues
  AFTER INSERT OR UPDATE OR DELETE ON monthly_revenues
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_fn();

DROP TRIGGER IF EXISTS audit_customers ON customers;
CREATE TRIGGER audit_customers
  AFTER INSERT OR UPDATE OR DELETE ON customers
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_fn();

DROP TRIGGER IF EXISTS audit_invoices ON invoices;
CREATE TRIGGER audit_invoices
  AFTER INSERT OR UPDATE OR DELETE ON invoices
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_fn();

DROP TRIGGER IF EXISTS audit_pipeline_leads ON pipeline_leads;
CREATE TRIGGER audit_pipeline_leads
  AFTER INSERT OR UPDATE OR DELETE ON pipeline_leads
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_fn();

-- ----------------------------------------------------------------
-- 인덱스 보강 (조회 성능)
-- ----------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity ON audit_logs(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action, performed_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_performed ON audit_logs(performed_at DESC);

COMMENT ON FUNCTION audit_trigger_fn IS 'Auto-log INSERT/UPDATE/DELETE to audit_logs. Silent-fail so audit does not block operations.';
