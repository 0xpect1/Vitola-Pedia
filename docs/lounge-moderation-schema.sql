-- ═══════════════════════════════════════════════════════════════════
-- VITOLA PEDIA — LOUNGE MODERATION SCHEMA (MIGRATION)
-- Paste this whole file into the Supabase SQL Editor and run it once,
-- AFTER the base schema from docs/lounge-schema.sql has been applied.
--
-- This migration is additive: it adds columns, tables, functions, and
-- policies on top of the existing lounge tables. It does NOT modify the
-- original docs/lounge-schema.sql — run this as a separate migration.
--
-- OWNER POLICY IS NON-NEGOTIABLE:
--   STRICTLY no illegal activities, no CSAM/CP, nothing in that nature — ever.
--   This schema gives the owner (admin) the tools to hide content, ban
--   members, and review reports. The client-side blocklist in
--   js/moderation.js is a STOPGAP that filters the most egregious terms
--   before they are even rendered — but enforcement ultimately rests on
--   the admin tools defined here and the RLS policies that enforce them.
-- ═══════════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════════════
-- 1. ADMIN FLAG ON lounge_members
-- ═══════════════════════════════════════════════════════════════════
-- After running this migration, set yourself as admin manually:
--   update public.lounge_members set is_admin = true where handle = 'YOUR_HANDLE';
-- Or by ID:
--   update public.lounge_members set is_admin = true where id = 'YOUR-USER-ID';

alter table public.lounge_members
  add column if not exists is_admin boolean not null default false;

-- The existing "members edit self" policy allows updating your own row.
-- We add a guard so only the service role can flip is_admin (clients
-- cannot grant themselves admin). The trigger below enforces this.
create or replace function public.lounge_guard_admin()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if current_setting('request.jwt.claims', true)::jsonb ->> 'role'
     is distinct from 'service_role' then
    new.is_admin := coalesce(old.is_admin, false);
  end if;
  return new;
end $$;

drop trigger if exists lounge_members_guard_admin on public.lounge_members;
create trigger lounge_members_guard_admin
  before insert or update on public.lounge_members
  for each row execute function public.lounge_guard_admin();

-- Allow admins to update other members' is_admin (for the service role)
-- and to read all members (already readable). No client-side policy
-- changes needed — the trigger blocks self-promotion.

-- ═══════════════════════════════════════════════════════════════════
-- 2. HIDDEN FLAG ON POSTS AND COMMENTS
-- ═══════════════════════════════════════════════════════════════════

alter table public.lounge_posts
  add column if not exists hidden boolean not null default false;

alter table public.lounge_comments
  add column if not exists hidden boolean not null default false;

-- ═══════════════════════════════════════════════════════════════════
-- 3. PERSISTED CHAT MESSAGES TABLE
-- Chat was previously ephemeral (broadcast only). Persisting it allows
-- moderation: hidden messages stay in the DB but are filtered by RLS.
-- ═══════════════════════════════════════════════════════════════════

create table if not exists public.lounge_chat_messages (
  id          uuid primary key default gen_random_uuid(),
  member_id   uuid not null default auth.uid()
                references public.lounge_members(id) on delete cascade,
  handle      text,
  avatar      text,
  body        text not null check (char_length(body) between 1 and 1200),
  created_at  timestamptz not null default now(),
  hidden      boolean not null default false
);

create index if not exists lounge_chat_messages_created_idx
  on public.lounge_chat_messages (created_at desc);

alter table public.lounge_chat_messages enable row level security;

-- World-readable (non-hidden for non-admins; admins see everything).
create policy "chat readable"
  on public.lounge_chat_messages for select
  using (
    hidden = false
    or exists (
      select 1 from public.lounge_members m
      where m.id = auth.uid() and m.is_admin = true
    )
  );

-- Write your own chat messages.
create policy "chat write own"
  on public.lounge_chat_messages for insert
  with check (member_id = auth.uid());

-- ═══════════════════════════════════════════════════════════════════
-- 4. REPORTS TABLE
-- Members can submit reports (insert only). They cannot read other
-- people's reports. Admins can read all reports.
-- ═══════════════════════════════════════════════════════════════════

create table if not exists public.lounge_reports (
  id           uuid primary key default gen_random_uuid(),
  reporter_id  uuid not null references public.lounge_members(id) on delete cascade,
  target_kind  text not null check (target_kind in ('post','comment','chat')),
  target_id    uuid not null,
  reason       text check (char_length(reason) <= 500),
  created_at   timestamptz not null default now()
);

create index if not exists lounge_reports_created_idx
  on public.lounge_reports (created_at desc);

alter table public.lounge_reports enable row level security;

-- Reporters can only insert — they cannot read anyone else's reports.
create policy "reports insert own"
  on public.lounge_reports for insert
  with check (reporter_id = auth.uid());

-- Admins can read all reports.
create policy "reports admin read"
  on public.lounge_reports for select
  using (
    exists (
      select 1 from public.lounge_members m
      where m.id = auth.uid() and m.is_admin = true
    )
  );

-- ═══════════════════════════════════════════════════════════════════
-- 5. BANS TABLE
-- World-readable so the "is this member banned?" check works everywhere.
-- Admins can insert and delete bans.
-- ═══════════════════════════════════════════════════════════════════

create table if not exists public.lounge_bans (
  member_id  uuid primary key references public.lounge_members(id) on delete cascade,
  banned_by  uuid references public.lounge_members(id),
  reason     text,
  created_at timestamptz not null default now()
);

alter table public.lounge_bans enable row level security;

-- World-readable: everyone can check if a member is banned.
create policy "bans readable"
  on public.lounge_bans for select
  using (true);

-- Admins can insert bans.
create policy "bans admin insert"
  on public.lounge_bans for insert
  with check (
    exists (
      select 1 from public.lounge_members m
      where m.id = auth.uid() and m.is_admin = true
    )
  );

-- Admins can delete (unban).
create policy "bans admin delete"
  on public.lounge_bans for delete
  using (
    exists (
      select 1 from public.lounge_members m
      where m.id = auth.uid() and m.is_admin = true
    )
  );

-- ═══════════════════════════════════════════════════════════════════
-- 6. BAN ENFORCEMENT — RLS WITH CHECK on write tables
-- Banned members cannot create posts, comments, or chat messages.
-- ═══════════════════════════════════════════════════════════════════

-- Helper: a ban check that can be referenced in WITH CHECK clauses.
-- Returns true if the caller is NOT banned (i.e., allowed to write).
create or replace function public.lounge_not_banned()
returns boolean language sql security definer set search_path = public as $$
  select not exists (
    select 1 from public.lounge_bans b
    where b.member_id = auth.uid()
  );
$$;

-- Posts: banned members cannot insert.
drop policy if exists "posts write own" on public.lounge_posts;
create policy "posts write own" on public.lounge_posts
  for insert with check (
    member_id = auth.uid() and public.lounge_not_banned()
  );

-- Comments: banned members cannot insert.
drop policy if exists "comments write own" on public.lounge_comments;
create policy "comments write own" on public.lounge_comments
  for insert with check (
    member_id = auth.uid() and public.lounge_not_banned()
  );

-- Chat: banned members cannot insert.
create policy "chat ban guard"
  on public.lounge_chat_messages for insert
  with check (
    member_id = auth.uid() and public.lounge_not_banned()
  );

-- ═══════════════════════════════════════════════════════════════════
-- 7. UPDATE VIEWS TO FILTER HIDDEN CONTENT
-- Non-admins see only non-hidden rows. Admins see everything.
-- The views use security_invoker, so auth.uid() works inside them.
-- ═══════════════════════════════════════════════════════════════════

-- PostgreSQL cannot add columns to a view via CREATE OR REPLACE VIEW.
-- Must DROP first, then CREATE. CASCADE handles any dependent objects.
drop view if exists public.lounge_posts_v cascade;
drop view if exists public.lounge_comments_v cascade;

create view public.lounge_posts_v with (security_invoker = true) as
select p.*, m.handle, m.avatar,
       m.reddit_username, m.reddit_verified_username,
       coalesce((select v.dir from public.lounge_votes v
                  where v.member_id = auth.uid()
                    and v.target_kind = 'post'
                    and v.target_id = p.id), 0) as my_vote
from public.lounge_posts p
join public.lounge_members m on m.id = p.member_id
where p.hidden = false
   or exists (
     select 1 from public.lounge_members am
     where am.id = auth.uid() and am.is_admin = true
   );

create view public.lounge_comments_v with (security_invoker = true) as
select c.*, m.handle, m.avatar,
       m.reddit_username, m.reddit_verified_username,
       coalesce((select v.dir from public.lounge_votes v
                  where v.member_id = auth.uid()
                    and v.target_kind = 'comment'
                    and v.target_id = c.id), 0) as my_vote
from public.lounge_comments c
join public.lounge_members m on m.id = c.member_id
where c.hidden = false
   or exists (
     select 1 from public.lounge_members am
     where am.id = auth.uid() and am.is_admin = true
   );

-- ═══════════════════════════════════════════════════════════════════
-- 8. ADMIN POLICY: UPDATE HIDDEN ON ANY ROW
-- Admins can update the hidden column on posts and comments.
-- ═══════════════════════════════════════════════════════════════════

create policy "posts admin hide"
  on public.lounge_posts for update
  using (
    exists (
      select 1 from public.lounge_members m
      where m.id = auth.uid() and m.is_admin = true
    )
  )
  with check (
    exists (
      select 1 from public.lounge_members m
      where m.id = auth.uid() and m.is_admin = true
    )
  );

create policy "comments admin hide"
  on public.lounge_comments for update
  using (
    exists (
      select 1 from public.lounge_members m
      where m.id = auth.uid() and m.is_admin = true
    )
  )
  with check (
    exists (
      select 1 from public.lounge_members m
      where m.id = auth.uid() and m.is_admin = true
    )
  );

create policy "chat admin hide"
  on public.lounge_chat_messages for update
  using (
    exists (
      select 1 from public.lounge_members m
      where m.id = auth.uid() and m.is_admin = true
    )
  )
  with check (
    exists (
      select 1 from public.lounge_members m
      where m.id = auth.uid() and m.is_admin = true
    )
  );

-- ═══════════════════════════════════════════════════════════════════
-- 9. SECURITY DEFINER FUNCTIONS
-- These run with the function owner's privileges, bypassing RLS for
-- the specific operations they encapsulate. They check admin status
-- internally so the client can't call them without being an admin.
-- ═══════════════════════════════════════════════════════════════════

-- 9a. Report content — any authenticated member can call this.
create or replace function public.lounge_report(
  p_target_kind text,
  p_target_id uuid,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  if p_target_kind not in ('post','comment','chat') then
    raise exception 'invalid target_kind';
  end if;
  if p_reason is not null and char_length(p_reason) > 500 then
    raise exception 'reason too long (max 500 chars)';
  end if;

  insert into public.lounge_reports (reporter_id, target_kind, target_id, reason)
  values (auth.uid(), p_target_kind, p_target_id, p_reason);
end $$;

-- 9b. Hide content — admin only.
create or replace function public.lounge_hide(
  p_target_kind text,
  p_target_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.lounge_members m
    where m.id = auth.uid() and m.is_admin = true
  ) then
    raise exception 'admin only';
  end if;

  if p_target_kind = 'post' then
    update public.lounge_posts set hidden = true where id = p_target_id;
  elsif p_target_kind = 'comment' then
    update public.lounge_comments set hidden = true where id = p_target_id;
  elsif p_target_kind = 'chat' then
    update public.lounge_chat_messages set hidden = true where id = p_target_id;
  else
    raise exception 'invalid target_kind';
  end if;
end $$;

-- 9c. Ban a member — admin only.
create or replace function public.lounge_ban_member(
  p_target_member uuid,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.lounge_members m
    where m.id = auth.uid() and m.is_admin = true
  ) then
    raise exception 'admin only';
  end if;

  insert into public.lounge_bans (member_id, banned_by, reason)
  values (p_target_member, auth.uid(), p_reason)
  on conflict (member_id) do nothing;
end $$;

-- 9d. Unban a member — admin only.
create or replace function public.lounge_unban_member(
  p_target_member uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.lounge_members m
    where m.id = auth.uid() and m.is_admin = true
  ) then
    raise exception 'admin only';
  end if;

  delete from public.lounge_bans where member_id = p_target_member;
end $$;

-- ═══════════════════════════════════════════════════════════════════
-- 10. REALTIME — enable on the new chat table
-- After running this migration, go to:
--   Database → Replication → supabase_realtime
-- and add `lounge_chat_messages` to the broadcast list (if you want
-- realtime updates of persisted chat). The existing broadcast channel
-- in the adapter already handles live delivery; this table is the
-- durable back-end for moderation.
-- ═══════════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════════════
-- POST-RUN CHECKLIST
-- 1. Set yourself as admin:
--      update public.lounge_members set is_admin = true where handle = 'YOUR_HANDLE';
-- 2. (Optional) Add lounge_chat_messages to realtime replication.
-- 3. Verify policies:
--      select * from pg_policies where schemaname = 'public' and tablename like 'lounge_%';
-- ═══════════════════════════════════════════════════════════════════
