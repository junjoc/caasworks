-- Add file upload columns to contracts table (if table already exists)
-- Run this if contracts table was created before the main migration
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS file_url TEXT;
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS file_name TEXT;
