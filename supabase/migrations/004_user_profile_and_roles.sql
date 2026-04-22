-- Migration 004: User profile fields + custom roles
-- Run this in Supabase SQL Editor

-- 1. Add position + avatar_url to users
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS position TEXT,
  ADD COLUMN IF NOT EXISTS avatar_url TEXT;

-- 2. Create roles table (custom roles + allowed menu paths)
CREATE TABLE IF NOT EXISTS roles (
  name TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  allowed_paths JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_system BOOLEAN NOT NULL DEFAULT false,  -- cannot delete system roles
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Seed default roles
--    allowed_paths: '*' = all, otherwise list of hrefs (top-level or nested)
INSERT INTO roles (name, label, allowed_paths, is_system) VALUES
  ('admin',      '관리자', '["*"]'::jsonb, true),
  ('member',     '일반',
    '["/","/analytics","/marketing/campaigns","/marketing/ads","/marketing/content","/marketing/journey","/marketing/analytics","/pipeline/board","/pipeline/list","/pipeline/analytics","/quotations","/quotations/simulator","/quotations/price-list","/customers","/customers/subscription","/contracts","/voc","/voc/sla","/work/today","/activities","/work/report","/team/calendar","/meetings"]'::jsonb,
    true),
  ('accountant', '회계',
    '["/","/revenue","/customers","/customers/subscription","/contracts","/finance/invoices","/finance/unpaid","/finance/payments","/finance/costs","/finance/analysis"]'::jsonb,
    true)
ON CONFLICT (name) DO UPDATE SET
  label = EXCLUDED.label,
  allowed_paths = EXCLUDED.allowed_paths,
  is_system = EXCLUDED.is_system;

-- 4. Storage bucket for user avatars (public read)
-- Note: Run via dashboard Storage UI, OR via SQL if storage schema is accessible:
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('avatars', 'avatars', true, 5242880, ARRAY['image/jpeg','image/png','image/webp','image/gif'])
ON CONFLICT (id) DO NOTHING;

-- 5. Storage RLS policies: anyone can read, authenticated can upload to their own folder
--    File path convention: {user_id}/avatar.{ext}
DROP POLICY IF EXISTS "Avatar images are publicly accessible" ON storage.objects;
CREATE POLICY "Avatar images are publicly accessible"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'avatars');

DROP POLICY IF EXISTS "Users can upload their own avatar" ON storage.objects;
CREATE POLICY "Users can upload their own avatar"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'avatars'
    AND auth.role() = 'authenticated'
  );

DROP POLICY IF EXISTS "Users can update their own avatar" ON storage.objects;
CREATE POLICY "Users can update their own avatar"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'avatars' AND auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Users can delete their own avatar" ON storage.objects;
CREATE POLICY "Users can delete their own avatar"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'avatars' AND auth.role() = 'authenticated');

-- 6. Drop the old role CHECK constraint so users.role can be any custom role name
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
-- (Keep role as TEXT. FK to roles(name) so custom roles are valid.)
-- Note: we deliberately do NOT add a FK because that would lock us in; we validate in app.
