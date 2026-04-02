-- Storage RLS policies for the newsletter-photos bucket.
-- The bucket itself must be created manually in the Supabase dashboard (private, not public).
-- File paths are structured as: {user_id}/{version_id}/{timestamp}-{n}.{ext}
-- foldername(name) returns the path segments array, so [1] is always the user_id.

create policy "newsletter-photos: insert own"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'newsletter-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "newsletter-photos: select own"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'newsletter-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "newsletter-photos: delete own"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'newsletter-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
