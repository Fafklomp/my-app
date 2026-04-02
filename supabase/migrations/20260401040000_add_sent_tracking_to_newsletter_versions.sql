-- Add send tracking columns to newsletter_versions
ALTER TABLE newsletter_versions
  ADD COLUMN IF NOT EXISTS sent_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS send_errors jsonb;
