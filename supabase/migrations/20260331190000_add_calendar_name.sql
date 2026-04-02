alter table public.calendar_events
  add column if not exists calendar_name text;
