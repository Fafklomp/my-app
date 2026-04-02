drop policy if exists "Calendar events are publicly readable" on public.calendar_events;
drop policy if exists "Hidden events are publicly readable" on public.hidden_events;
drop policy if exists "Users can manage their hidden events" on public.hidden_events;
drop table if exists public.hidden_events;
