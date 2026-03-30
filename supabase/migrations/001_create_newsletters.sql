create table newsletters (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  title        text not null,
  content      text,
  status       text not null default 'draft'
                 check (status in ('draft', 'pending_approval', 'approved', 'sent')),
  cadence      text check (cadence in ('daily', 'weekly', 'monthly', 'custom')),
  period_start timestamptz,
  period_end   timestamptz,
  sent_at      timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- Row Level Security
alter table newsletters enable row level security;

create policy "Users can view their own newsletters"
  on newsletters for select
  using (user_id = auth.uid());

create policy "Users can insert their own newsletters"
  on newsletters for insert
  with check (user_id = auth.uid());

create policy "Users can update their own newsletters"
  on newsletters for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "Users can delete their own newsletters"
  on newsletters for delete
  using (user_id = auth.uid());

-- Keep updated_at current on every row change
create or replace function set_updated_at()
  returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger newsletters_updated_at
  before update on newsletters
  for each row execute function set_updated_at();
