-- hidden_events: owner marks events as private.
-- Recipients see these as generic "Busy" blocks (no title/details).
-- Publicly readable so the frontend knows which events to mask.

create table if not exists public.hidden_events (
  id                uuid        primary key default gen_random_uuid(),
  user_id           uuid        not null references auth.users(id) on delete cascade,
  calendar_event_id uuid        not null references public.calendar_events(id) on delete cascade,
  created_at        timestamptz not null default now(),
  constraint hidden_events_unique unique (user_id, calendar_event_id)
);

alter table public.hidden_events enable row level security;

-- Owner can manage their own hidden events
create policy "Users can manage their hidden events"
  on public.hidden_events for all
  using  (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Public (unauthenticated) can read to know which events to mask on the availability page
create policy "Hidden events are publicly readable"
  on public.hidden_events for select
  using (true);

-- Allow public (unauthenticated) read on calendar_events for the availability page.
-- Masking of hidden events is handled in the frontend — hidden ones render as "Busy".
create policy "Calendar events are publicly readable"
  on public.calendar_events for select
  using (true);
