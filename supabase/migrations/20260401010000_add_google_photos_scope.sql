-- Track whether the user granted the Google Photos scope.
-- Users who connected before this migration have calendar-only access
-- and will see a "Reconnect to enable Photos" prompt.

alter table public.user_oauth_tokens
  add column if not exists google_photos_scope boolean not null default false;
