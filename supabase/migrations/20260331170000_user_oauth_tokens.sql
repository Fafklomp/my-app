-- Table to persist OAuth provider tokens for each user.
-- Tokens are used by Edge Functions to call external APIs (Google Calendar, etc.)
-- on behalf of the user without requiring the token to be re-passed on every call.

create table if not exists public.user_oauth_tokens (
  id                        uuid        primary key default gen_random_uuid(),
  user_id                   uuid        not null references auth.users(id) on delete cascade,
  google_access_token       text,
  google_refresh_token      text,
  google_token_expires_at   timestamptz,
  outlook_access_token      text,
  outlook_refresh_token     text,
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now(),

  constraint user_oauth_tokens_user_id_unique unique (user_id)
);

alter table public.user_oauth_tokens enable row level security;

create policy "Users can read their own oauth tokens"
  on public.user_oauth_tokens for select
  using (auth.uid() = user_id);

create policy "Users can insert their own oauth tokens"
  on public.user_oauth_tokens for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own oauth tokens"
  on public.user_oauth_tokens for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
