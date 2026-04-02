-- ============================================================
-- availability_days
-- Stores per-day availability status for each user
-- ============================================================
create table availability_days (
  id         uuid        primary key default gen_random_uuid(),
  user_id    uuid        not null references auth.users(id) on delete cascade,
  date       date        not null,
  status     text        not null check (status in ('available', 'busy', 'ooo')),
  created_at timestamptz not null default now(),

  unique (user_id, date)
);

alter table availability_days enable row level security;

-- Public read: recipients can view availability without auth
create policy "availability_days: public select"
  on availability_days for select
  using (true);

-- Only the owner can insert/update/delete their own rows
create policy "availability_days: insert own"
  on availability_days for insert
  with check (user_id = auth.uid());

create policy "availability_days: update own"
  on availability_days for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "availability_days: delete own"
  on availability_days for delete
  using (user_id = auth.uid());
