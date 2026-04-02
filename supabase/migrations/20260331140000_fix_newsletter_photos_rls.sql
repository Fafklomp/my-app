-- ============================================================
-- Fix newsletter_photos RLS: use SECURITY DEFINER helper
-- ============================================================
--
-- ROOT CAUSE
-- ----------
-- The original newsletter_photos policies used an EXISTS subquery
-- that joins newsletter_versions → newsletters to verify ownership.
-- This creates a *cascading RLS evaluation*:
--
--   newsletter_photos INSERT policy
--     → queries newsletter_versions   (RLS applied)
--       → newsletter_versions SELECT policy queries newsletters  (RLS applied)
--         → newsletters SELECT policy: user_id = auth.uid()
--
-- PostgreSQL evaluates each table's RLS independently per access.
-- The nested policy chain can silently return zero rows (making
-- the EXISTS false) even when the user legitimately owns the data,
-- causing "new row violates row-level security policy" on INSERT.
--
-- FIX
-- ---
-- Replace the inline EXISTS with a SECURITY DEFINER helper function.
-- SECURITY DEFINER bypasses RLS on the tables it queries internally,
-- while still enforcing ownership by calling auth.uid() explicitly.
-- This is the canonical Supabase/PostgreSQL pattern for policies
-- that must traverse RLS-protected parent tables.
-- ============================================================

-- ── Helper function ──────────────────────────────────────────
-- Returns true if the given newsletter_version_id belongs to
-- a newsletter owned by the currently authenticated user.

create or replace function public.owns_newsletter_version(version_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from newsletter_versions nv
    join newsletters n on n.id = nv.newsletter_id
    where nv.id = version_id
      and n.user_id = auth.uid()
  );
$$;

-- ── Drop old policies ─────────────────────────────────────────
drop policy if exists "newsletter_photos: select own" on newsletter_photos;
drop policy if exists "newsletter_photos: insert own" on newsletter_photos;
drop policy if exists "newsletter_photos: update own" on newsletter_photos;
drop policy if exists "newsletter_photos: delete own" on newsletter_photos;

-- ── Recreate policies using the helper ───────────────────────
create policy "newsletter_photos: select own"
  on newsletter_photos for select
  using (public.owns_newsletter_version(newsletter_version_id));

create policy "newsletter_photos: insert own"
  on newsletter_photos for insert
  with check (public.owns_newsletter_version(newsletter_version_id));

create policy "newsletter_photos: update own"
  on newsletter_photos for update
  using (public.owns_newsletter_version(newsletter_version_id))
  with check (public.owns_newsletter_version(newsletter_version_id));

create policy "newsletter_photos: delete own"
  on newsletter_photos for delete
  using (public.owns_newsletter_version(newsletter_version_id));
