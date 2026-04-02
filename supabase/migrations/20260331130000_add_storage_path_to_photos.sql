-- ============================================================
-- Add storage_path column to newsletter_photos
-- ============================================================
-- Stores the Supabase Storage object path (e.g., user_id/version_id/timestamp-0.jpg)
-- separately from the display URL, so we can generate fresh signed URLs
-- on demand instead of relying on a potentially expired public URL.
-- ============================================================

alter table newsletter_photos
  add column storage_path text;
