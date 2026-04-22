-- Migration 005: Add '예정' stage between 컨텍 and 제안
-- Run in Supabase SQL Editor. Safe to run during business hours (~1s).

-- Drop old CHECK constraint if exists (may have been added in migration 001)
ALTER TABLE pipeline_leads DROP CONSTRAINT IF EXISTS pipeline_leads_stage_check;

-- Add updated CHECK constraint including '예정'
ALTER TABLE pipeline_leads
  ADD CONSTRAINT pipeline_leads_stage_check
  CHECK (stage IN ('신규리드','컨텍','예정','제안','미팅','도입직전','도입완료','이탈'));
