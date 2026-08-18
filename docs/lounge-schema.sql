-- ══════════════════════════════════════════════════════════════════
-- VITOLA PEDIA — LOUNGE SCHEMA
-- Paste this whole file into the Supabase SQL Editor and run it once.
--
-- Before running:
--   Authentication → Providers → Anonymous  → enable
-- After running:
--   Database → Replication → supabase_realtime → add lounge_posts
--   and lounge_comments
--
-- Then put your project URL and anon key into LOUNGE_CONFIG in
-- js/lounge-adapter.js. Full notes in docs/lounge-backend.md.
-- ══════════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════════════
-- TABLES
-- ═══════════════════════════════════════════════════════════════════

create table public.lounge_members (
  id         uuid primary key references auth.users(id) on delete cascade,
  handle     text not null check (char_length(handle) between 2 and 24),
  avatar     text not null default '🚬',
  loc_mode   text not null default 'off' check (loc_mode in ('off','city','device')),
  loc        jsonb,
  -- Two Reddit columns on purpose. `reddit_username` is whatever the
  -- member typed in and is shown as self-declared. Only the Edge Function
  -- (service role) may write `reddit_verified_username`, which is what
  -- earns the checkmark — see the trigger below.
  reddit_username          text check (reddit_username ~ '^[A-Za-z0-9_-]{3,20}$'),
  reddit_verified_username text check (reddit_verified_username ~ '^[A-Za-z0-9_-]{3,20}$'),
  created_at timestamptz not null default now()
);

create table public.lounge_posts (
  id            uuid primary key default gen_random_uuid(),
  member_id     uuid not null default auth.uid()
                  references public.lounge_members(id) on delete cascade,
  flair         text not null default 'talk'
                  check (flair in ('review','pairing','haul','ask','talk','deal')),
  title         text not null check (char_length(title) between 3 and 140),
  body          text check (char_length(body) <= 4000),
  item_type     text check (item_type in ('cigar','pipe')),
  item_id       text,
  score         int  not null default 1,
  comment_count int  not null default 0,
  created_at    timestamptz not null default now()
);

create table public.lounge_comments (
  id         uuid primary key default gen_random_uuid(),
  post_id    uuid not null references public.lounge_posts(id)    on delete cascade,
  parent_id  uuid          references public.lounge_comments(id) on delete cascade,
  member_id  uuid not null default auth.uid()
               references public.lounge_members(id) on delete cascade,
  body       text not null check (char_length(body) between 1 and 1200),
  score      int  not null default 1,
  created_at timestamptz not null default now()
);

create table public.lounge_votes (
  member_id   uuid     not null default auth.uid()
                references public.lounge_members(id) on delete cascade,
  target_kind text     not null check (target_kind in ('post','comment')),
  target_id   uuid     not null,
  dir         smallint not null check (dir in (-1, 1)),
  primary key (member_id, target_kind, target_id)
);

-- Finished sessions. Presence is ephemeral, but a completed smoke is a
-- fact worth keeping: it is what makes "cigars smoked" on a profile a
-- real number rather than a guess.
create table public.lounge_smokes (
  id         uuid primary key default gen_random_uuid(),
  member_id  uuid not null default auth.uid()
               references public.lounge_members(id) on delete cascade,
  item_type  text not null default 'cigar' check (item_type in ('cigar','pipe')),
  item_id    text not null,
  item_name  text,
  drink      text,
  minutes    int  not null check (minutes between 2 and 600),
  started_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index on public.lounge_posts    (created_at desc);
create index on public.lounge_smokes   (member_id, started_at desc);
create index on public.lounge_comments (post_id, created_at);
create index on public.lounge_votes    (target_kind, target_id);

-- ═══════════════════════════════════════════════════════════════════
-- VIEWS — join the author, expose only the caller's own vote.
-- security_invoker keeps the underlying RLS policies in force.
-- ═══════════════════════════════════════════════════════════════════

create view public.lounge_posts_v with (security_invoker = true) as
select p.*, m.handle, m.avatar,
       m.reddit_username, m.reddit_verified_username,
       coalesce((select v.dir from public.lounge_votes v
                  where v.member_id = auth.uid()
                    and v.target_kind = 'post'
                    and v.target_id = p.id), 0) as my_vote
from public.lounge_posts p
join public.lounge_members m on m.id = p.member_id;

create view public.lounge_comments_v with (security_invoker = true) as
select c.*, m.handle, m.avatar,
       m.reddit_username, m.reddit_verified_username,
       coalesce((select v.dir from public.lounge_votes v
                  where v.member_id = auth.uid()
                    and v.target_kind = 'comment'
                    and v.target_id = c.id), 0) as my_vote
from public.lounge_comments c
join public.lounge_members m on m.id = c.member_id;

create view public.lounge_smokes_v with (security_invoker = true) as
select s.*, m.handle, m.avatar
from public.lounge_smokes s
join public.lounge_members m on m.id = s.member_id;

-- ═══════════════════════════════════════════════════════════════════
-- VOTING — one round trip, atomic. Clicking the same arrow twice
-- removes the vote, matching the client's optimistic behaviour.
-- ═══════════════════════════════════════════════════════════════════

create or replace function public.lounge_vote(p_kind text, p_target uuid, p_dir int)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  existing smallint;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  if p_kind not in ('post','comment') or p_dir not in (-1, 1) then
    raise exception 'bad vote';
  end if;

  select v.dir into existing
    from lounge_votes v
   where v.member_id = auth.uid()
     and v.target_kind = p_kind
     and v.target_id = p_target;

  if existing = p_dir then
    delete from lounge_votes v
     where v.member_id = auth.uid()
       and v.target_kind = p_kind
       and v.target_id = p_target;
  else
    insert into lounge_votes (member_id, target_kind, target_id, dir)
    values (auth.uid(), p_kind, p_target, p_dir)
    on conflict (member_id, target_kind, target_id)
    do update set dir = excluded.dir;
  end if;

  if p_kind = 'post' then
    update lounge_posts set score = coalesce(
      (select sum(v.dir) from lounge_votes v
        where v.target_kind = 'post' and v.target_id = p_target), 0)
     where id = p_target;
  else
    update lounge_comments set score = coalesce(
      (select sum(v.dir) from lounge_votes v
        where v.target_kind = 'comment' and v.target_id = p_target), 0)
     where id = p_target;
  end if;
end $$;

-- ═══════════════════════════════════════════════════════════════════
-- TRIGGERS — self-upvote on create, and a maintained comment count.
-- ═══════════════════════════════════════════════════════════════════

create or replace function public.lounge_self_vote()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into lounge_votes (member_id, target_kind, target_id, dir)
  values (new.member_id, tg_argv[0], new.id, 1)
  on conflict do nothing;
  return new;
end $$;

create trigger lounge_post_self_vote after insert on public.lounge_posts
  for each row execute function public.lounge_self_vote('post');

create trigger lounge_comment_self_vote after insert on public.lounge_comments
  for each row execute function public.lounge_self_vote('comment');

create or replace function public.lounge_sync_comment_count()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  pid uuid := coalesce(new.post_id, old.post_id);
begin
  update lounge_posts
     set comment_count = (select count(*) from lounge_comments c where c.post_id = pid)
   where id = pid;
  return null;
end $$;

create trigger lounge_comment_count
  after insert or delete on public.lounge_comments
  for each row execute function public.lounge_sync_comment_count();

-- ═══════════════════════════════════════════════════════════════════
-- ROW LEVEL SECURITY
-- Everything is world-readable; you may only write as yourself.
-- ═══════════════════════════════════════════════════════════════════

alter table public.lounge_members  enable row level security;
alter table public.lounge_posts    enable row level security;
alter table public.lounge_comments enable row level security;
alter table public.lounge_votes    enable row level security;

create policy "members readable"   on public.lounge_members for select using (true);
create policy "members write self" on public.lounge_members for insert with check (id = auth.uid());
create policy "members edit self"  on public.lounge_members for update using (id = auth.uid());

-- RLS alone can't stop a member setting reddit_verified_username on their
-- own row, so a trigger pins it. Anything arriving through the anon key
-- keeps whatever the column already held; only the service role (which
-- bypasses RLS and runs with bypassrls) can change it.
create or replace function public.lounge_guard_reddit()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if current_setting('request.jwt.claims', true)::jsonb ->> 'role'
     is distinct from 'service_role' then
    new.reddit_verified_username := coalesce(old.reddit_verified_username, null);
  end if;
  return new;
end $$;

create trigger lounge_members_guard_reddit
  before insert or update on public.lounge_members
  for each row execute function public.lounge_guard_reddit();

create policy "posts readable"  on public.lounge_posts for select using (true);
create policy "posts write own" on public.lounge_posts for insert with check (member_id = auth.uid());
create policy "posts edit own"  on public.lounge_posts for update using (member_id = auth.uid());
create policy "posts del own"   on public.lounge_posts for delete using (member_id = auth.uid());

create policy "comments readable"  on public.lounge_comments for select using (true);
create policy "comments write own" on public.lounge_comments for insert with check (member_id = auth.uid());
create policy "comments del own"   on public.lounge_comments for delete using (member_id = auth.uid());

-- Votes are only ever written through lounge_vote(); reads are limited to
-- your own so nobody can enumerate who voted for what.
create policy "votes read own" on public.lounge_votes for select using (member_id = auth.uid());

alter table public.lounge_smokes enable row level security;
create policy "smokes readable"  on public.lounge_smokes for select using (true);
create policy "smokes write own" on public.lounge_smokes for insert with check (member_id = auth.uid());
create policy "smokes del own"   on public.lounge_smokes for delete using (member_id = auth.uid());
