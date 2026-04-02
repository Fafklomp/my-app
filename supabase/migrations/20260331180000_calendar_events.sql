-- Cached calendar events fetched from Google/Outlook.
-- Stored locally to avoid hitting the API on every page load.
-- Keyed by user_id + month_year for efficient querying.

create table if not exists public.calendar_events (
  id           uuid        primary key default gen_random_uuid(),
  user_id      uuid        not null references auth.users(id) on delete cascade,
  source       text        not null check (source in ('google', 'outlook')),
  title        text        not null,
  start_time   timestamptz not null,
  end_time     timestamptz,
  location     text,
  description  text,
  all_day      boolean     not null default false,
  month_year   text        not null, -- 'YYYY-MM', e.g. '2026-03'
  created_at   timestamptz not null default now()
);

alter table public.calendar_events enable row level security;

create policy "Users can read their own calendar events"
  on public.calendar_events for select
  using (auth.uid() = user_id);

create policy "Users can insert their own calendar events"
  on public.calendar_events for insert
  with check (auth.uid() = user_id);

create policy "Users can delete their own calendar events"
  on public.calendar_events for delete
  using (auth.uid() = user_id);

create index if not exists calendar_events_user_month
  on public.calendar_events (user_id, month_year);
