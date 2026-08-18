# Taking The Lounge Live

The Lounge ships in **solo mode**: everything works, but the only person in the
room is you. Posts and your identity persist in `localStorage`, and live presence
is broadcast across your own browser tabs via `BroadcastChannel` — open two tabs
and you'll see two embers on the map. Nothing is simulated; there are no fake
users.

To open the room to everyone, point it at a Supabase project. It stays a static
site — no build step, no server of your own, no framework.

---

## 1. Create the project

1. Sign up at [supabase.com](https://supabase.com) (free tier is plenty — 500 MB
   database, 200 concurrent realtime connections).
2. Create a new project. Note the **Project URL** and the **anon/public key**
   from *Project Settings → API*.
3. Enable anonymous sign-ins: *Authentication → Providers → Anonymous* → on.
   This is what lets people post without an email address.

## 2. Run the schema

Paste everything in [§5 SQL](#5-sql) into the Supabase **SQL Editor** and run it.

## 3. Enable Realtime

*Database → Replication → `supabase_realtime`* → add `lounge_posts` and
`lounge_comments`.

Live presence needs no configuration — it rides Supabase's in-memory Realtime
Presence channel and never touches the database.

## 4. Flip the switch

In [`js/lounge-adapter.js`](../js/lounge-adapter.js), fill in `LOUNGE_CONFIG`:

```js
const LOUNGE_CONFIG = {
  supabase: {
    url:     'https://YOUR-PROJECT.supabase.co',
    anonKey: 'eyJhbGciOi...',
  },
};
```

That's the whole change. `supabase-js` is fetched lazily from a CDN only when
this is set, the adapter swaps itself in, and the badge in the lounge hero
switches from *Solo Mode* to *Live*. If the connection fails for any reason, it
falls back to solo mode rather than showing a broken room.

> The anon key is a **public** key and belongs in client source. Row Level
> Security is what protects the data. Never put a `service_role` key here.

---

## 5. SQL

```sql
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

create index on public.lounge_posts    (created_at desc);
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
```

---

## 6. Reddit account linking

**Why this needs a server at all.** Reddit's token endpoint,
`https://www.reddit.com/api/v1/access_token`, sends no CORS headers. A browser
simply cannot call it from your page. The authorization redirect happens in the
browser, but the code-for-token swap has to happen somewhere with no CORS —
hence one small function.

Leave `LOUNGE_CONFIG.reddit` null and the lounge still lets people record a
Reddit handle, but it is stored and displayed as **self-declared** with a
distinct visual treatment and no checkmark. That's a deliberate line: an
unverified handle rendered like a verified one is how people get impersonated.

### Create the Reddit app

1. Go to [reddit.com/prefs/apps](https://www.reddit.com/prefs/apps) → *create app*.
2. Type: **installed app** (a public client — it has no secret, which is correct
   for something whose ID ships in client source).
3. Redirect URI: `https://YOUR-DOMAIN/reddit-callback.html`
4. Note the client ID — the short string under the app name.

### Deploy the Edge Function

Save as `supabase/functions/reddit-link/index.ts` and deploy with
`supabase functions deploy reddit-link --no-verify-jwt`:

```ts
// Swaps a Reddit authorization code for the caller's username.
// The access token is used once, in memory, and never stored or returned.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CLIENT_ID = Deno.env.get('REDDIT_CLIENT_ID')!;
const ALLOWED_ORIGIN = Deno.env.get('ALLOWED_ORIGIN')!;   // https://vitolapedia.com

const cors = {
  'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
  'Access-Control-Allow-Headers': 'content-type, authorization',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  try {
    const { code, redirect_uri } = await req.json();
    if (!code) return json({ error: 'missing code' }, 400);

    // Installed apps authenticate with an empty password.
    const basic = btoa(`${CLIENT_ID}:`);
    const tokenRes = await fetch('https://www.reddit.com/api/v1/access_token', {
      method: 'POST',
      headers: {
        Authorization: `Basic ${basic}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'web:vitolapedia:v1.0 (by /u/vitolapedia)',
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri,
      }),
    });
    if (!tokenRes.ok) return json({ error: 'token exchange failed' }, 502);
    const { access_token } = await tokenRes.json();

    const meRes = await fetch('https://oauth.reddit.com/api/v1/me', {
      headers: {
        Authorization: `Bearer ${access_token}`,
        'User-Agent': 'web:vitolapedia:v1.0 (by /u/vitolapedia)',
      },
    });
    if (!meRes.ok) return json({ error: 'identity lookup failed' }, 502);
    const { name } = await meRes.json();
    if (!/^[A-Za-z0-9_-]{3,20}$/.test(name ?? '')) {
      return json({ error: 'unexpected username' }, 502);
    }

    // Write the verified name using the service role — the only principal
    // the guard trigger lets near reddit_verified_username.
    const authHeader = req.headers.get('Authorization');
    if (authHeader) {
      const admin = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      );
      const jwt = authHeader.replace('Bearer ', '');
      const { data: { user } } = await admin.auth.getUser(jwt);
      if (user) {
        await admin.from('lounge_members')
          .update({ reddit_verified_username: name })
          .eq('id', user.id);
      }
    }

    return json({ username: name });
  } catch (_e) {
    return json({ error: 'link failed' }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
}
```

Set the secrets:

```bash
supabase secrets set REDDIT_CLIENT_ID=xxxxx ALLOWED_ORIGIN=https://vitolapedia.com
```

### Point the client at it

```js
reddit: {
  clientId:    'YOUR_REDDIT_APP_ID',
  redirectUri: 'https://vitolapedia.com/reddit-callback.html',
  exchangeUrl: 'https://xxxx.supabase.co/functions/v1/reddit-link',
},
```

### What the flow actually asks for

`scope=identity` and `duration=temporary` — the narrowest thing Reddit offers.
It reads your username once. No posting, no comment history, no refresh token,
no lasting access. The access token lives in the function's memory for the
length of one request and is never stored or sent to the browser.

The client generates a `state` nonce, stashes it in `sessionStorage`, and
refuses the callback if Reddit returns anything different. `reddit-callback.html`
posts the code back with an explicit target origin, and the opener checks
`event.origin` before trusting it.

---

## 7. Before you open it to the public

The schema above is safe by construction — RLS means nobody can write as
somebody else, and the length `check` constraints cap what can be stored. A few
things it deliberately does **not** do, which you should add before a real
launch:

- **Rate limiting.** Nothing stops one account posting a thousand times. Add a
  `check` against a per-member insert count, or a Supabase Edge Function in
  front of writes.
- **Moderation.** There's no report button, no block list, and no admin view. At
  minimum add a `hidden boolean default false` column on posts and comments,
  filter it out of the views, and give yourself a way to flip it.
- **Handle uniqueness.** Handles are currently free-for-all. Add
  `unique (lower(handle))` if you want them to be identities rather than labels.
- **Abandoned anonymous accounts.** Anonymous auth users accumulate. Supabase
  can clean these up on a schedule.

## 8. The rail (live chat)

Chat is deliberately **ephemeral and never written to the database**. It rides
the same Realtime channel as presence, as a `broadcast` event:

```js
presenceChan.send({ type: 'broadcast', event: 'chat', payload: msg })
```

That means no table, no migration, no rows to prune, and nothing to leak — a
lounge conversation is of the moment. The trade-off is real and worth knowing:
**someone arriving sees an empty rail**, because there is no history to replay.
In solo mode the equivalent buffer is a localStorage ring of the last 120
messages, aged out after six hours.

If you decide arrivals should see the last few minutes, add a small table and
prune it on a schedule:

```sql
create table public.lounge_chat (
  id         uuid primary key default gen_random_uuid(),
  member_id  uuid not null default auth.uid()
               references public.lounge_members(id) on delete cascade,
  body       text not null check (char_length(body) between 1 and 400),
  created_at timestamptz not null default now()
);
create index on public.lounge_chat (created_at desc);

alter table public.lounge_chat enable row level security;
create policy "chat readable"  on public.lounge_chat for select using (true);
create policy "chat write own" on public.lounge_chat for insert with check (member_id = auth.uid());

-- keep it short; this is a rail, not an archive
select cron.schedule('prune-lounge-chat', '*/15 * * * *',
  $$delete from public.lounge_chat where created_at < now() - interval '6 hours'$$);
```

Then have `listChat()` select from it and `sendChat()` insert, keeping the
broadcast for instant delivery.

**Read markers stay on the device** in both modes. What you have and haven't
looked at is nobody else's business, so `getSeen`/`markSeen` never leave
localStorage even when a backend is connected.

## 9. What the client already handles

- **Escaping.** Every person-authored string (handles, titles, bodies, comments,
  session notes) passes through `esc()` in `js/lounge.js` before touching
  `innerHTML`. Verified against `<img src=x onerror=...>` payloads.
- **Location privacy.** Sharing is off by default. Device coordinates are
  rounded to a 0.5° grid (~55 km) *inside* `fuzzCoords()` the instant they're
  received — the precise fix is never stored, broadcast, or logged. The identity
  form shows the exact rounded value that others will see before you confirm.
  Choosing a city instead never touches the Geolocation API at all.
- **Presence cleanup.** Sessions are ephemeral. In live mode Supabase drops them
  on disconnect; in solo mode a heartbeat plus a 45-second TTL sweep prevents
  ghost embers from a closed tab.
