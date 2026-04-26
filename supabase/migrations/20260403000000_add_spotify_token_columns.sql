-- Add Spotify OAuth token columns to user_oauth_tokens.
-- Follows the same pattern as 20260401020000_add_google_photos_token_columns.sql

alter table public.user_oauth_tokens
  add column if not exists spotify_access_token      text,
  add column if not exists spotify_refresh_token     text,
  add column if not exists spotify_token_expires_at  timestamptz,
  add column if not exists spotify_connected         boolean not null default false;
