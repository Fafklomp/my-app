-- Dedicated columns for the Google Photos OAuth token.
-- Separate from the google_access_token columns (which come from Supabase's
-- built-in OAuth and only have calendar/profile scopes).

alter table public.user_oauth_tokens
  add column if not exists google_photos_access_token   text,
  add column if not exists google_photos_refresh_token  text,
  add column if not exists google_photos_token_expires_at timestamptz;
