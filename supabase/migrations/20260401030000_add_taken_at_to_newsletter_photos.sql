-- Add photo metadata columns captured from Google Photos Picker API.
-- taken_at: when the photo was actually taken (from mediaFileMetadata.creationTime)
-- camera_info: human-readable camera make/model string, nullable

alter table public.newsletter_photos
  add column if not exists taken_at    timestamptz,
  add column if not exists camera_info text;
