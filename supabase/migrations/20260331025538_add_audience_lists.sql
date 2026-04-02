-- ============================================================
-- audience_lists
-- Groups the user creates (e.g., Family, Friends, Colleagues)
-- ============================================================
create table audience_lists (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  name        text not null,
  description text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

alter table audience_lists enable row level security;

create policy "audience_lists: select own"
  on audience_lists for select
  using (user_id = auth.uid());

create policy "audience_lists: insert own"
  on audience_lists for insert
  with check (user_id = auth.uid());

create policy "audience_lists: update own"
  on audience_lists for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "audience_lists: delete own"
  on audience_lists for delete
  using (user_id = auth.uid());

create trigger audience_lists_updated_at
  before update on audience_lists
  for each row execute function set_updated_at();


-- ============================================================
-- audience_members
-- People in each audience list
-- ============================================================
create table audience_members (
  id               uuid primary key default gen_random_uuid(),
  audience_list_id uuid not null references audience_lists(id) on delete cascade,
  user_id          uuid not null references auth.users(id) on delete cascade,
  name             text not null,
  email            text not null,
  created_at       timestamptz not null default now()
);

alter table audience_members enable row level security;

create policy "audience_members: select own"
  on audience_members for select
  using (user_id = auth.uid());

create policy "audience_members: insert own"
  on audience_members for insert
  with check (user_id = auth.uid());

create policy "audience_members: update own"
  on audience_members for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "audience_members: delete own"
  on audience_members for delete
  using (user_id = auth.uid());


-- ============================================================
-- newsletter_versions
-- One row per audience per newsletter (AI content lives here)
-- ============================================================
create table newsletter_versions (
  id               uuid primary key default gen_random_uuid(),
  newsletter_id    uuid not null references newsletters(id) on delete cascade,
  audience_list_id uuid not null references audience_lists(id) on delete cascade,
  summary          text,
  status           text not null default 'draft'
                     check (status in ('draft', 'approved', 'sent')),
  sent_at          timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),

  unique (newsletter_id, audience_list_id)
);

alter table newsletter_versions enable row level security;

create policy "newsletter_versions: select own"
  on newsletter_versions for select
  using (
    exists (
      select 1 from newsletters
      where newsletters.id = newsletter_versions.newsletter_id
        and newsletters.user_id = auth.uid()
    )
  );

create policy "newsletter_versions: insert own"
  on newsletter_versions for insert
  with check (
    exists (
      select 1 from newsletters
      where newsletters.id = newsletter_versions.newsletter_id
        and newsletters.user_id = auth.uid()
    )
  );

create policy "newsletter_versions: update own"
  on newsletter_versions for update
  using (
    exists (
      select 1 from newsletters
      where newsletters.id = newsletter_versions.newsletter_id
        and newsletters.user_id = auth.uid()
    )
  );

create policy "newsletter_versions: delete own"
  on newsletter_versions for delete
  using (
    exists (
      select 1 from newsletters
      where newsletters.id = newsletter_versions.newsletter_id
        and newsletters.user_id = auth.uid()
    )
  );

create trigger newsletter_versions_updated_at
  before update on newsletter_versions
  for each row execute function set_updated_at();


-- ============================================================
-- newsletter_photos
-- Photos for a specific newsletter version
-- ============================================================
create table newsletter_photos (
  id                    uuid primary key default gen_random_uuid(),
  newsletter_version_id uuid not null references newsletter_versions(id) on delete cascade,
  photo_url             text not null,
  caption               text,
  sort_order            integer not null default 0,
  created_at            timestamptz not null default now()
);

alter table newsletter_photos enable row level security;

create policy "newsletter_photos: select own"
  on newsletter_photos for select
  using (
    exists (
      select 1 from newsletter_versions nv
      join newsletters n on n.id = nv.newsletter_id
      where nv.id = newsletter_photos.newsletter_version_id
        and n.user_id = auth.uid()
    )
  );

create policy "newsletter_photos: insert own"
  on newsletter_photos for insert
  with check (
    exists (
      select 1 from newsletter_versions nv
      join newsletters n on n.id = nv.newsletter_id
      where nv.id = newsletter_photos.newsletter_version_id
        and n.user_id = auth.uid()
    )
  );

create policy "newsletter_photos: update own"
  on newsletter_photos for update
  using (
    exists (
      select 1 from newsletter_versions nv
      join newsletters n on n.id = nv.newsletter_id
      where nv.id = newsletter_photos.newsletter_version_id
        and n.user_id = auth.uid()
    )
  );

create policy "newsletter_photos: delete own"
  on newsletter_photos for delete
  using (
    exists (
      select 1 from newsletter_versions nv
      join newsletters n on n.id = nv.newsletter_id
      where nv.id = newsletter_photos.newsletter_version_id
        and n.user_id = auth.uid()
    )
  );
