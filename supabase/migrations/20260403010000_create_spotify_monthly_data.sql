-- Stores the user's top Spotify tracks and artists per month,
-- fetched via the spotify-auth Edge Function.

create table if not exists public.spotify_monthly_data (
  id          uuid        primary key default gen_random_uuid(),
  user_id     uuid        not null references auth.users(id) on delete cascade,
  month       text        not null,  -- e.g. "2026-04"
  top_tracks  jsonb,                 -- [{name, artist, album, album_art_url, spotify_url, preview_url}]
  top_artists jsonb,                 -- [{name, image_url, genres, spotify_url}]
  fetched_at  timestamptz not null default now(),

  constraint spotify_monthly_data_user_month_unique unique (user_id, month)
);

alter table public.spotify_monthly_data enable row level security;

-- Owners can read their own data (auth context)
create policy "Users can read their own spotify data"
  on public.spotify_monthly_data
  for select
  using (auth.uid() = user_id);

-- Public read: allows recipients viewing a published newsletter to see music data.
-- Spotify listening data is not sensitive PII.
create policy "Public can read spotify data"
  on public.spotify_monthly_data
  for select
  to anon
  using (true);

create policy "Users can insert their own spotify data"
  on public.spotify_monthly_data
  for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own spotify data"
  on public.spotify_monthly_data
  for update
  using (auth.uid() = user_id);
