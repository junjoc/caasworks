-- Migration 006: Per-user dashboard config
-- Safe to run anytime (ADD COLUMN IF NOT EXISTS is non-blocking)

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS dashboard_config JSONB;
