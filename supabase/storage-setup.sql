-- ============================================================
-- Supabase Storage Bucket: newsletter-photos (PRIVATE)
-- ============================================================
-- Supabase Storage buckets CANNOT be created via SQL migrations.
-- You must create the bucket manually:
--
-- OPTION A — Supabase Dashboard (recommended):
--   1. Go to https://supabase.com/dashboard → your project
--   2. Navigate to Storage → Buckets → "New bucket"
--   3. Name it exactly: newsletter-photos
--   4. Leave "Public bucket" UNCHECKED (private)
--   5. Click "Create bucket"
--
-- OPTION B — Supabase CLI:
--   npx supabase storage create newsletter-photos
--   (no --public flag = private)
-- ============================================================
--
-- After creating the private bucket, apply these Storage RLS
-- policies. Run them in the Supabase SQL Editor or via CLI.
--
-- File paths are structured as: {user_id}/{version_id}/{timestamp}-{n}.{ext}
-- The first folder segment is always the uploader's user_id.
-- ============================================================

-- Allow authenticated users to upload to their own folder
create policy "newsletter-photos: insert own"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'newsletter-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Allow authenticated users to read their own files
-- (Recipients use signed URLs generated server-side / by the owner's session)
create policy "newsletter-photos: select own"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'newsletter-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Allow authenticated users to delete their own files
create policy "newsletter-photos: delete own"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'newsletter-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- NOTE: Unauthenticated recipients (published update page) receive
-- signed URLs (1 hour expiry) generated at page load time via
-- supabase.storage.from('newsletter-photos').createSignedUrl(path, 3600)
-- No additional anon storage policy is needed for this approach.
