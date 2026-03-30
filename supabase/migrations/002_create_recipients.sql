create table recipients (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  newsletter_id   uuid not null references newsletters(id) on delete cascade,
  name            text not null,
  email           text not null,
  created_at      timestamptz not null default now()
);

-- Row Level Security
alter table recipients enable row level security;

create policy "Users can view their own recipients"
  on recipients for select
  using (user_id = auth.uid());

create policy "Users can insert their own recipients"
  on recipients for insert
  with check (user_id = auth.uid());

create policy "Users can delete their own recipients"
  on recipients for delete
  using (user_id = auth.uid());
