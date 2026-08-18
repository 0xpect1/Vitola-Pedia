/* ══════════════════════════════════════════════════════════════════
   VITOLA PEDIA — LOUNGE BACKEND ADAPTER
   ══════════════════════════════════════════════════════════════════

   The lounge UI (js/lounge.js) never touches storage directly. It talks
   only to `LoungeBackend`, an async interface implemented twice:

     • LocalLoungeAdapter   — ships today. localStorage for durable data
                              (identity, posts, comments, votes) plus a
                              BroadcastChannel for live cross-tab presence.
                              Genuinely multi-"user" across your own tabs,
                              never fabricates other people.

     • SupabaseLoungeAdapter — real multi-user. Wire it up by filling in
                              LOUNGE_CONFIG below. Schema + RLS policies
                              live in docs/lounge-backend.md.

   TO GO LIVE: create a Supabase project, run the SQL from
   docs/lounge-backend.md, then set LOUNGE_CONFIG.supabase to your project
   URL + anon key. Nothing else changes — the UI picks it up automatically.

   Every method returns a Promise so the swap is transparent.
   ══════════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  /* ── CONFIG ─────────────────────────────────────────────────────
     Leave `supabase` null to run in solo mode. The anon key is a
     PUBLIC key — it is safe in client source. Row Level Security (see
     docs/lounge-backend.md) is what actually protects the data. Never
     put a service_role key here.
  ─────────────────────────────────────────────────────────────────── */
  const LOUNGE_CONFIG = {
    supabase: null,
    // supabase: { url: 'https://xxxx.supabase.co', anonKey: 'eyJhbGci...' },

    /* ── Reddit account linking ───────────────────────────────────
       Reddit's token endpoint (www.reddit.com/api/v1/access_token)
       sends no CORS headers, so a static page cannot finish OAuth on
       its own — the code-for-token swap has to happen server-side.
       Set `exchangeUrl` to a function that does it (source and deploy
       steps in docs/lounge-backend.md).

       Leave this null and the lounge still lets people record a Reddit
       handle — but it is stored and shown as SELF-DECLARED, never as
       verified. That distinction is deliberate: an unverified handle
       presented as a linked account is an impersonation vector.
    ─────────────────────────────────────────────────────────────── */
    /* Cloudflare Turnstile. Only needed if captcha protection is switched
       on in Supabase → Authentication → Attack Protection. The sitekey is
       public; the secret belongs in Supabase, never here. */
    turnstileSiteKey: '0x4AAAAAAEUMMgK3VR0v5aE-',

    reddit: null,
    // reddit: {
    //   clientId:    'YOUR_REDDIT_APP_ID',            // "installed app" type
    //   redirectUri: 'https://vitolapedia.com/reddit-callback.html',
    //   exchangeUrl: 'https://xxxx.supabase.co/functions/v1/reddit-link',
    // },
  };

  /* ── CONSTANTS ──────────────────────────────────────────────────── */
  const HEARTBEAT_MS = 15000;   // how often a live session re-announces
  const PRESENCE_TTL = 45000;   // a session with no beat for this long is gone
  const LOC_GRID     = 0.5;     // degrees — coarse location snap (~55km)
  const CHANNEL      = 'vp-lounge';

  const CHAT_KEEP  = 120;       // messages retained in the rail
  const CHAT_TTL   = 6 * 3600e3; // and for how long

  const K = {
    me:       'vp_lounge_me',
    sessions: 'vp_lounge_sessions',
    posts:    'vp_lounge_posts',
    comments: 'vp_lounge_comments',
    chat:     'vp_lounge_chat',
    seen:     'vp_lounge_seen',
    smokes:   'vp_lounge_smokes',
  };

  const SMOKES_KEEP = 500;   // completed sessions retained per room

  /* ── HELPERS ────────────────────────────────────────────────────── */
  const uid = () =>
    's' + Date.now().toString(36) + Math.random().toString(36).slice(2, 9);

  function read(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) {
      return fallback;
    }
  }

  function write(key, val) {
    try {
      localStorage.setItem(key, JSON.stringify(val));
    } catch (e) {
      /* quota or private mode — lounge degrades to in-memory */
    }
  }

  /* Snap a precise coordinate to a coarse grid cell centre. This is the
     only place raw GPS is ever handled, and it never leaves this function
     un-rounded. ~55km of ambiguity in latitude. */
  function fuzzCoords(lat, lon) {
    return {
      lat: Math.round(lat / LOC_GRID) * LOC_GRID,
      lon: Math.round(lon / LOC_GRID) * LOC_GRID,
    };
  }

  /* ══════════════════════════════════════════════════════════════════
     LOCAL ADAPTER
  ══════════════════════════════════════════════════════════════════ */
  function LocalLoungeAdapter() {
    const listeners = { presence: [], posts: [], chat: [], seen: [] };
    let chan = null;
    let beatTimer = null;
    let sweepTimer = null;

    try {
      chan = new BroadcastChannel(CHANNEL);
    } catch (e) {
      chan = null; // Safari private mode / old browsers — single-tab only
    }

    function emit(evt) {
      (listeners[evt] || []).forEach(fn => {
        try { fn(); } catch (e) { console.error(e); }
      });
    }

    function broadcast(evt) {
      if (chan) { try { chan.postMessage({ evt }); } catch (e) {} }
    }

    function announce(evt) { emit(evt); broadcast(evt); }

    if (chan) {
      chan.onmessage = e => {
        const evt = e.data && e.data.evt;
        if (evt) emit(evt);
      };
    }

    /* Sessions are stored with a `lastBeat`; anything stale is swept so a
       closed tab or a crashed browser doesn't leave a ghost on the map. */
    function liveSessions() {
      const now = Date.now();
      const all = read(K.sessions, []);
      const live = all.filter(s => now - s.lastBeat < PRESENCE_TTL);
      if (live.length !== all.length) write(K.sessions, live);
      return live;
    }

    /* One heartbeat for room presence, whether or not a cigar is lit. */
    function startBeat() {
      clearInterval(beatTimer);
      beatTimer = setInterval(async () => {
        const me = read(K.me, null);
        if (!me) return;
        const all = liveSessions();
        const mine = all.find(s => s.memberId === me.id);
        if (!mine) { clearInterval(beatTimer); beatTimer = null; return; }
        mine.lastBeat = Date.now();
        write(K.sessions, all);
        announce('presence');
      }, HEARTBEAT_MS);
    }

    function putSession(sess) {
      const all = liveSessions().filter(s => s.id !== sess.id);
      all.push(sess);
      write(K.sessions, all);
    }

    const api = {
      mode: 'solo',
      capabilities: { realtime: !!chan, multiUser: false },

      async init() {
        // Sweep stale presence regularly so the map self-heals.
        sweepTimer = setInterval(() => {
          const before = read(K.sessions, []).length;
          const after = liveSessions().length;
          if (before !== after) emit('presence');
        }, 10000);
        return this;
      },

      /* ── IDENTITY ─────────────────────────────────────────────── */
      async getMe() {
        return read(K.me, null);
      },

      async saveMe(patch) {
        const cur = read(K.me, null) || {
          id: uid(),
          joinedAt: Date.now(),
          locMode: 'off',
          loc: null,
        };
        const me = Object.assign(cur, patch);
        write(K.me, me);

        // Keep any live session's denormalised identity in sync.
        const mine = liveSessions().find(s => s.memberId === me.id);
        if (mine) {
          mine.handle = me.handle;
          mine.avatar = me.avatar;
          mine.reddit = me.reddit || null;
          putSession(mine);
          announce('presence');
        }
        return me;
      },

      /* ── ROOM PRESENCE ────────────────────────────────────────
         Being in the room and being lit are different things. A member
         who joins to talk is present and counted; a session is just a
         field that appears on their record when they spark up. Before
         this, presence only existed while smoking, so anyone who came
         to chat was invisible.
      ─────────────────────────────────────────────────────────── */
      async joinRoom() {
        const me = await this.getMe();
        if (!me) return null;

        const all = liveSessions();
        let mine = all.find(s => s.memberId === me.id);
        if (!mine) {
          mine = { id: uid(), memberId: me.id, joinedAt: Date.now() };
          all.push(mine);
        }
        Object.assign(mine, {
          handle: me.handle,
          avatar: me.avatar,
          reddit: me.reddit || null,
          loc: (me.locMode !== 'off' && me.loc) ? me.loc : null,
          lastBeat: Date.now(),
        });
        write(K.sessions, all);
        announce('presence');
        startBeat();
        return mine;
      },

      async leaveRoom() {
        clearInterval(beatTimer);
        beatTimer = null;
        const me = await this.getMe();
        if (!me) return;
        const next = liveSessions().filter(s => s.memberId !== me.id);
        write(K.sessions, next);
        announce('presence');
      },

      /* Everyone in the room, lit or not. */
      async listRoom() {
        return liveSessions().sort((a, b) => (a.joinedAt || 0) - (b.joinedAt || 0));
      },

      async startSession(sess) {
        const me = await this.getMe();
        if (!me) throw new Error('Set up a handle before sparking up.');

        await this.joinRoom();          // lighting up implies being here
        const all = liveSessions();
        const row = all.find(s => s.memberId === me.id);
        Object.assign(row, sess, { startedAt: Date.now(), lastBeat: Date.now() });
        write(K.sessions, all);
        announce('presence');

        startBeat();
        return row;
      },

      async updateSession(patch) {
        const me = await this.getMe();
        if (!me) return null;
        const all = liveSessions();
        const s = all.find(x => x.memberId === me.id);
        if (!s) return null;
        Object.assign(s, patch, { lastBeat: Date.now() });
        write(K.sessions, all);
        announce('presence');
        return s;
      },

      async endSession() {
        clearInterval(beatTimer);
        beatTimer = null;
        const me = await this.getMe();
        if (!me) return;
        const all = liveSessions();
        const mine = all.find(s => s.memberId === me.id);

        // Presence is ephemeral, but a finished smoke is a fact worth
        // keeping — it's what makes "cigars smoked" a real number rather
        // than a guess. Anything under two minutes was a misfire.
        if (mine) {
          const minutes = (Date.now() - mine.startedAt) / 60000;
          if (minutes >= 2) {
            const log = read(K.smokes, []).concat({
              id: uid(),
              memberId: me.id,
              handle: me.handle,
              avatar: me.avatar,
              itemType: mine.itemType,
              itemId: mine.itemId,
              itemName: mine.itemName,
              drink: mine.drink || null,
              startedAt: mine.startedAt,
              endedAt: Date.now(),
              minutes: Math.round(minutes),
            }).slice(-SMOKES_KEEP);
            write(K.smokes, log);
          }
        }

        if (mine) {
          // Putting a cigar out doesn't mean leaving — clear the session,
          // keep the person in the room.
          ['itemType','itemId','itemName','drink','note','startedAt'].forEach(k => delete mine[k]);
          mine.lastBeat = Date.now();
          write(K.sessions, all);
          announce('presence');
        }
      },

      /* ── SMOKE HISTORY ────────────────────────────────────────── */
      async listSmokes(memberId) {
        const all = read(K.smokes, []);
        return memberId ? all.filter(s => s.memberId === memberId) : all;
      },

      async getMySession() {
        const me = await this.getMe();
        if (!me) return null;
        return liveSessions().find(s => s.memberId === me.id) || null;
      },

      // Deliberately still "who is lit" — the map embers, the Burning Now
      // strip and the smoke stats all mean that. Room membership is listRoom().
      async listPresence() {
        return liveSessions().filter(s => s.itemId)
          .sort((a, b) => a.startedAt - b.startedAt);
      },

      /* ── FEED ─────────────────────────────────────────────────── */
      async listPosts() {
        return read(K.posts, []);
      },

      async createPost(p) {
        const me = await this.getMe();
        if (!me) throw new Error('Set up a handle before posting.');
        const post = Object.assign({
          id: uid(),
          memberId: me.id,
          handle: me.handle,
          avatar: me.avatar,
          reddit: me.reddit || null,
          createdAt: Date.now(),
          score: 1,
          voters: { [me.id]: 1 },   // your own post starts self-upvoted
          commentCount: 0,
        }, p);
        const posts = read(K.posts, []);
        posts.unshift(post);
        write(K.posts, posts);
        announce('posts');
        return post;
      },

      async deletePost(id) {
        const me = await this.getMe();
        const posts = read(K.posts, []);
        const post = posts.find(p => p.id === id);
        if (!post || !me || post.memberId !== me.id) {
          throw new Error('You can only delete your own posts.');
        }
        write(K.posts, posts.filter(p => p.id !== id));
        write(K.comments, read(K.comments, []).filter(c => c.postId !== id));
        announce('posts');
      },

      async vote(postId, dir) {
        const me = await this.getMe();
        if (!me) throw new Error('Set up a handle before voting.');
        const posts = read(K.posts, []);
        const post = posts.find(p => p.id === postId);
        if (!post) return null;
        post.voters = post.voters || {};
        const prev = post.voters[me.id] || 0;
        const next = prev === dir ? 0 : dir;   // clicking again un-votes
        if (next === 0) delete post.voters[me.id];
        else post.voters[me.id] = next;
        post.score = Object.values(post.voters).reduce((a, b) => a + b, 0);
        write(K.posts, posts);
        announce('posts');
        return post;
      },

      /* ── COMMENTS ─────────────────────────────────────────────── */
      async listComments(postId) {
        return read(K.comments, [])
          .filter(c => c.postId === postId)
          .sort((a, b) => a.createdAt - b.createdAt);
      },

      async createComment(postId, body, parentId) {
        const me = await this.getMe();
        if (!me) throw new Error('Set up a handle before commenting.');
        const comment = {
          id: uid(),
          postId,
          parentId: parentId || null,
          memberId: me.id,
          handle: me.handle,
          avatar: me.avatar,
          reddit: me.reddit || null,
          body,
          createdAt: Date.now(),
          score: 1,
          voters: { [me.id]: 1 },
        };
        const comments = read(K.comments, []);
        comments.push(comment);
        write(K.comments, comments);

        const posts = read(K.posts, []);
        const post = posts.find(p => p.id === postId);
        if (post) {
          post.commentCount = comments.filter(c => c.postId === postId).length;
          write(K.posts, posts);
        }
        announce('posts');
        return comment;
      },

      async voteComment(id, dir) {
        const me = await this.getMe();
        if (!me) throw new Error('Set up a handle before voting.');
        const comments = read(K.comments, []);
        const c = comments.find(x => x.id === id);
        if (!c) return null;
        c.voters = c.voters || {};
        const prev = c.voters[me.id] || 0;
        const next = prev === dir ? 0 : dir;
        if (next === 0) delete c.voters[me.id];
        else c.voters[me.id] = next;
        c.score = Object.values(c.voters).reduce((a, b) => a + b, 0);
        write(K.comments, comments);
        announce('posts');
        return c;
      },

      async deleteComment(id) {
        const me = await this.getMe();
        const comments = read(K.comments, []);
        const c = comments.find(x => x.id === id);
        if (!c || !me || c.memberId !== me.id) {
          throw new Error('You can only delete your own comments.');
        }
        write(K.comments, comments.filter(x => x.id !== id));
        const posts = read(K.posts, []);
        const post = posts.find(p => p.id === c.postId);
        if (post) {
          post.commentCount = Math.max(0, (post.commentCount || 1) - 1);
          write(K.posts, posts);
        }
        announce('posts');
      },

      /* ── CHAT ─────────────────────────────────────────────────
         Deliberately ephemeral. A lounge conversation is of the moment,
         so the rail keeps the last CHAT_KEEP messages for CHAT_TTL and
         lets the rest go.
      ───────────────────────────────────────────────────────────── */
      async listChat() {
        const cut = Date.now() - CHAT_TTL;
        const all = read(K.chat, []).filter(m => m.at > cut);
        const trimmed = all.slice(-CHAT_KEEP);
        if (trimmed.length !== read(K.chat, []).length) write(K.chat, trimmed);
        return trimmed;
      },

      async sendChat(body) {
        const me = await this.getMe();
        if (!me) throw new Error('Set up a handle before chatting.');
        const msg = {
          id: uid(), memberId: me.id, handle: me.handle,
          avatar: me.avatar, reddit: me.reddit || null,
          body, at: Date.now(),
        };
        const all = read(K.chat, []).concat(msg).slice(-CHAT_KEEP);
        write(K.chat, all);
        announce('chat');
        return msg;
      },

      /* ── READ MARKERS — what you've already seen ──────────────── */
      async getSeen() { return read(K.seen, {}); },
      async markSeen(patch) {
        const cur = read(K.seen, {});
        write(K.seen, Object.assign(cur, patch));
        emit('seen');
      },

      /* ── EVENTS ───────────────────────────────────────────────── */
      on(evt, cb) {
        if (!listeners[evt]) listeners[evt] = [];
        listeners[evt].push(cb);
        return () => {
          listeners[evt] = listeners[evt].filter(f => f !== cb);
        };
      },

      destroy() {
        clearInterval(beatTimer);
        clearInterval(sweepTimer);
        if (chan) chan.close();
      },
    };

    // A session must not outlive the tab that lit it.
    window.addEventListener('beforeunload', () => {
      const me = read(K.me, null);
      if (!me) return;
      const all = read(K.sessions, []);
      const next = all.filter(s => s.memberId !== me.id);
      if (next.length !== all.length) {
        write(K.sessions, next);
        if (chan) { try { chan.postMessage({ evt: 'presence' }); } catch (e) {} }
      }
    });

    return api;
  }

  /* ══════════════════════════════════════════════════════════════════
     SUPABASE ADAPTER — real multi-user
     Needs the schema from docs/lounge-backend.md. supabase-js is fetched
     lazily by loadSupabaseSdk() below, so an unconfigured site pays no
     network cost for it at all.
  ══════════════════════════════════════════════════════════════════ */
  function loadSupabaseSdk() {
    if (window.supabase) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.js';
      s.onload = resolve;
      s.onerror = () => reject(new Error('could not load supabase-js'));
      document.head.appendChild(s);
    });
  }

  function SupabaseLoungeAdapter(cfg) {
    const listeners = { presence: [], posts: [], chat: [], seen: [] };
    let chatLog = [];
    let sb = null;
    let presenceChan = null;
    let me = null;
    let myPresence = null;

    function emit(evt) {
      (listeners[evt] || []).forEach(fn => {
        try { fn(); } catch (e) { console.error(e); }
      });
    }

    return {
      mode: 'live',
      capabilities: { realtime: true, multiUser: true },

      async init() {
        await loadSupabaseSdk();
        sb = window.supabase.createClient(cfg.url, cfg.anonKey);

        /* Deliberately does NOT create a session. Signing in on load
           would mint a permanent anonymous auth user for every visitor
           who so much as glances at the site, burning the monthly-active
           ceiling on people who never join. Identity is created the
           moment someone actually claims a handle — see ensureAuth(). */
        const { data: { session } } = await sb.auth.getSession();
        if (session) {
          const { data: profile } = await sb
            .from('lounge_members').select('*').eq('id', session.user.id).maybeSingle();
          me = memberFromRow(profile);
        }

        // Presence is ephemeral — Supabase Realtime tracks it in memory and
        // drops it automatically on disconnect. Nothing hits the database.
        presenceChan = sb.channel('lounge-presence', {
          config: { presence: { key: authId } },
        });
        presenceChan
          .on('presence', { event: 'sync' }, () => emit('presence'))
          // Chat rides the same channel as a broadcast — nothing is
          // written to the database, matching the solo behaviour.
          .on('broadcast', { event: 'chat' }, ({ payload }) => {
            chatLog = chatLog.concat(payload).slice(-200);
            emit('chat');
          })
          .on('postgres_changes',
              { event: '*', schema: 'public', table: 'lounge_posts' },
              () => emit('posts'))
          .on('postgres_changes',
              { event: '*', schema: 'public', table: 'lounge_comments' },
              () => emit('posts'))
          .subscribe();

        return this;
      },

      async getMe() { return me; },

      /* Creates the anonymous session on first real action. If Supabase
         has captcha protection enabled, a Turnstile token is fetched and
         passed — without it the sign-in is rejected. */
      async ensureAuth() {
        let { data: { session } } = await sb.auth.getSession();
        if (session) return session;

        /* Fetch a captcha token if one is configured — but never let the
           captcha itself become the reason somebody can't get in. If it
           is blocked, times out or errors, we still attempt the sign-in:
           Supabase rejects it with a clear message when captcha is
           actually required, and lets it through when it isn't. A
           privacy extension blocking challenges.cloudflare.com should
           not silently lock a member out of the room. */
        const opts = {};
        if (LOUNGE_CONFIG.turnstileSiteKey) {
          try {
            opts.captchaToken = await getTurnstileToken(LOUNGE_CONFIG.turnstileSiteKey);
          } catch (e) {
            console.warn('[lounge] captcha unavailable, trying without:', e.message);
          }
        }

        const { error } = await sb.auth.signInAnonymously(
          Object.keys(opts).length ? { options: opts } : undefined);

        if (error) {
          const msg = /captcha/i.test(error.message || '')
            ? 'The captcha could not be completed. Refresh and try again — if it keeps failing, an ad blocker may be blocking Cloudflare.'
            : (error.message || 'Could not join — please try again.');
          throw new Error(msg);
        }

        ({ data: { session } } = await sb.auth.getSession());
        return session;
      },

      async saveMe(patch) {
        await this.ensureAuth();
        const { data: { session } } = await sb.auth.getSession();
        const next = Object.assign({}, me || {}, patch);
        const { data, error } = await sb.from('lounge_members').upsert({
          id: session.user.id,
          handle: next.handle,
          avatar: next.avatar,
          loc_mode: next.locMode || 'off',
          loc: next.locMode === 'off' ? null : (next.loc || null),
          // Only ever the self-declared column. The verified one is the
          // Edge Function's to write; clients cannot touch it.
          reddit_username: (next.reddit && !next.reddit.verified)
            ? next.reddit.username : null,
        }).select().single();
        if (error) throw error;
        me = memberFromRow(data);
        if (myPresence) await this.joinRoom();
        return me;
      },

      /* Presence is the room; a session is a field on it. An entry with
         no itemId means "here, not currently smoking" — which is how
         someone who came only to talk gets seen and counted. */
      async joinRoom() {
        if (!me || !presenceChan) return null;
        myPresence = Object.assign(myPresence || { joinedAt: Date.now() }, {
          memberId: me.id,
          handle: me.handle,
          avatar: me.avatar,
          reddit: me.reddit || null,
          loc: (me.locMode !== 'off' && me.loc) ? me.loc : null,
        });
        await presenceChan.track(myPresence);
        return myPresence;
      },

      async leaveRoom() {
        myPresence = null;
        if (presenceChan) await presenceChan.untrack();
      },

      async listRoom() {
        if (!presenceChan) return [];
        return Object.values(presenceChan.presenceState()).flat()
          .filter(Boolean)
          .sort((a, b) => (a.joinedAt || 0) - (b.joinedAt || 0));
      },

      async startSession(sess) {
        await this.ensureAuth();
        await this.joinRoom();
        myPresence = Object.assign(myPresence, sess, { startedAt: Date.now() });
        await presenceChan.track(myPresence);
        return myPresence;
      },

      async updateSession(patch) {
        if (!myPresence) return null;
        Object.assign(myPresence, patch, {
          handle: me.handle, avatar: me.avatar, reddit: me.reddit || null,
        });
        await presenceChan.track(myPresence);
        return myPresence;
      },

      async endSession() {
        // Record the finished smoke before dropping presence — see
        // lounge_smokes in docs/lounge-backend.md.
        if (myPresence && myPresence.itemId) {
          const minutes = (Date.now() - myPresence.startedAt) / 60000;
          if (minutes >= 2) {
            await sb.from('lounge_smokes').insert({
              item_type: myPresence.itemType,
              item_id: myPresence.itemId,
              item_name: myPresence.itemName,
              drink: myPresence.drink || null,
              started_at: new Date(myPresence.startedAt).toISOString(),
              minutes: Math.round(minutes),
            });
          }
          // Stay in the room; only the session ends.
          ['itemType','itemId','itemName','drink','note','startedAt']
            .forEach(k => delete myPresence[k]);
          await presenceChan.track(myPresence);
        }
      },

      async getMySession() {
        return (myPresence && myPresence.itemId) ? myPresence : null;
      },

      async listSmokes(memberId) {
        let q = sb.from('lounge_smokes_v').select('*')
          .order('started_at', { ascending: false }).limit(500);
        if (memberId) q = q.eq('member_id', memberId);
        const { data, error } = await q;
        if (error) throw error;
        return (data || []).map(r => ({
          id: r.id, memberId: r.member_id, handle: r.handle, avatar: r.avatar,
          itemType: r.item_type, itemId: r.item_id, itemName: r.item_name,
          drink: r.drink, minutes: r.minutes,
          startedAt: new Date(r.started_at).getTime(),
          endedAt: new Date(r.created_at).getTime(),
        }));
      },

      async listPresence() {
        if (!presenceChan) return [];
        const state = presenceChan.presenceState();
        return Object.values(state)
          .flat()
          .filter(s => s && s.itemId)
          .sort((a, b) => a.startedAt - b.startedAt);
      },

      // Reads go through the *_v views, which join the author's handle/avatar
      // and compute my_vote for the calling user. Writes go to the base tables.
      async listPosts() {
        const { data, error } = await sb
          .from('lounge_posts_v').select('*')
          .order('created_at', { ascending: false }).limit(200);
        if (error) throw error;
        return (data || []).map(fromRow);
      },

      async createPost(p) {
        await this.ensureAuth();
        const { data, error } = await sb.from('lounge_posts').insert(toRow(p)).select().single();
        if (error) throw error;
        return fromRow(data);
      },

      async deletePost(id) {
        const { error } = await sb.from('lounge_posts').delete().eq('id', id);
        if (error) throw error;
      },

      async vote(postId, dir) {
        await this.ensureAuth();
        // `lounge_vote` is a SECURITY DEFINER function — it upserts the
        // caller's vote and recomputes the score atomically. See the docs.
        const { error } = await sb.rpc('lounge_vote', {
          p_kind: 'post', p_target: postId, p_dir: dir,
        });
        if (error) throw error;
      },

      async listComments(postId) {
        const { data, error } = await sb
          .from('lounge_comments_v').select('*')
          .eq('post_id', postId).order('created_at');
        if (error) throw error;
        return (data || []).map(fromRow);
      },

      async createComment(postId, body, parentId) {
        await this.ensureAuth();
        const { data, error } = await sb.from('lounge_comments')
          .insert({ post_id: postId, parent_id: parentId || null, body })
          .select().single();
        if (error) throw error;
        return fromRow(data);
      },

      async voteComment(id, dir) {
        await this.ensureAuth();
        const { error } = await sb.rpc('lounge_vote', {
          p_kind: 'comment', p_target: id, p_dir: dir,
        });
        if (error) throw error;
      },

      async deleteComment(id) {
        const { error } = await sb.from('lounge_comments').delete().eq('id', id);
        if (error) throw error;
      },

      async listChat() { return chatLog; },

      async sendChat(body) {
        await this.ensureAuth();
        if (!me) throw new Error('Set up a handle before chatting.');
        const msg = {
          id: 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
          memberId: me.id, handle: me.handle, avatar: me.avatar,
          reddit: me.reddit || null, body, at: Date.now(),
        };
        await presenceChan.send({ type: 'broadcast', event: 'chat', payload: msg });
        // Broadcast does not echo to the sender, so add it locally.
        chatLog = chatLog.concat(msg).slice(-200);
        emit('chat');
        return msg;
      },

      // Read markers stay on the device either way — what you've already
      // looked at is nobody else's business.
      async getSeen() {
        try { return JSON.parse(localStorage.getItem('vp_lounge_seen')) || {}; }
        catch (e) { return {}; }
      },
      async markSeen(patch) {
        const cur = await this.getSeen();
        try { localStorage.setItem('vp_lounge_seen', JSON.stringify(Object.assign(cur, patch))); } catch (e) {}
        emit('seen');
      },

      on(evt, cb) {
        if (!listeners[evt]) listeners[evt] = [];
        listeners[evt].push(cb);
        return () => { listeners[evt] = listeners[evt].filter(f => f !== cb); };
      },

      destroy() {
        if (presenceChan) sb.removeChannel(presenceChan);
      },
    };

    // snake_case (Postgres) ⇄ camelCase (UI)
    /* Two Reddit columns, deliberately: `reddit_verified_username` is
       writable only by the Edge Function's service role, while
       `reddit_username` is the self-declared one anybody can type. A
       client that tries to forge a verified name can't — it has no write
       access to the column that grants the checkmark. */
    function redditFromRow(r) {
      if (r.reddit_verified_username) {
        return { username: r.reddit_verified_username, verified: true };
      }
      if (r.reddit_username) {
        return { username: r.reddit_username, verified: false };
      }
      return null;
    }

    function memberFromRow(r) {
      if (!r) return null;
      return {
        id: r.id, handle: r.handle, avatar: r.avatar,
        locMode: r.loc_mode, loc: r.loc,
        reddit: redditFromRow(r),
        joinedAt: r.created_at ? new Date(r.created_at).getTime() : Date.now(),
      };
    }
    function fromRow(r) {
      if (!r) return r;
      return {
        id: r.id, memberId: r.member_id, handle: r.handle, avatar: r.avatar,
        reddit: redditFromRow(r),
        flair: r.flair, title: r.title, body: r.body,
        itemType: r.item_type, itemId: r.item_id,
        postId: r.post_id, parentId: r.parent_id,
        createdAt: new Date(r.created_at).getTime(),
        score: r.score, commentCount: r.comment_count,
        // The UI reads votes as a {memberId: dir} map; the view hands back
        // only the caller's own vote, which is all the UI ever needs.
        voters: (r.my_vote && me) ? { [me.id]: r.my_vote } : {},
      };
    }
    function toRow(p) {
      return {
        flair: p.flair, title: p.title, body: p.body,
        item_type: p.itemType || null, item_id: p.itemId || null,
      };
    }
  }

  /* ══════════════════════════════════════════════════════════════════
     BOOTSTRAP — pick an adapter, fall back to solo if live fails
  ══════════════════════════════════════════════════════════════════ */
  window.LoungeBackend = null;

  window.LoungeReady = (async function () {
    if (LOUNGE_CONFIG.supabase && LOUNGE_CONFIG.supabase.url) {
      try {
        const live = SupabaseLoungeAdapter(LOUNGE_CONFIG.supabase);
        await live.init();
        window.LoungeBackend = live;
        return live;
      } catch (err) {
        console.warn('[lounge] live backend unavailable, using solo mode:', err.message);
      }
    }
    const local = LocalLoungeAdapter();
    await local.init();
    window.LoungeBackend = local;
    return local;
  })();

  /* ══════════════════════════════════════════════════════════════════
     TURNSTILE
     Cloudflare's captcha, rendered invisibly and only at the moment
     someone claims a handle — never on page load. Managed mode resolves
     with no interaction for almost everyone; a challenge appears only if
     Cloudflare thinks it needs one, and then it needs somewhere visible
     to appear, which is why the container is attached to the document
     rather than kept detached.
  ══════════════════════════════════════════════════════════════════ */
  let turnstileScript = null;

  function loadTurnstile() {
    if (window.turnstile) return Promise.resolve();
    if (turnstileScript) return turnstileScript;
    turnstileScript = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
      s.async = true; s.defer = true;
      s.onload = resolve;
      s.onerror = () => reject(new Error('Could not load the captcha. Check your connection and try again.'));
      document.head.appendChild(s);
    });
    return turnstileScript;
  }

  function getTurnstileToken(siteKey) {
    return loadTurnstile().then(() => new Promise((resolve, reject) => {
      const host = document.createElement('div');
      host.className = 'vp-turnstile';
      document.body.appendChild(host);

      let done = false;
      const finish = (fn, val) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        // Leave the widget up a beat so a visible challenge doesn't vanish
        // mid-interaction, then clean up.
        setTimeout(() => { try { host.remove(); } catch (e) {} }, 60);
        fn(val);
      };

      const timer = setTimeout(
        () => finish(reject, new Error('The captcha timed out — please try again.')), 20000);

      try {
        window.turnstile.render(host, {
          sitekey: siteKey,
          action: 'lounge-join',            // names the protected surface, per Cloudflare's guidance
          appearance: 'interaction-only',   // invisible unless a challenge is needed
          callback: t => finish(resolve, t),
          'error-callback': () => finish(reject, new Error('Captcha failed — please try again.')),
          'timeout-callback': () => finish(reject, new Error('The captcha timed out — please try again.')),
        });
      } catch (e) {
        finish(reject, new Error('Captcha could not start — please try again.'));
      }
    }));
  }

  /* ══════════════════════════════════════════════════════════════════
     REDDIT LINKING
     Only the popup handshake lives here; the token swap is server-side.
  ══════════════════════════════════════════════════════════════════ */
  const Reddit = {
    get config() { return LOUNGE_CONFIG.reddit; },
    get canVerify() {
      const c = LOUNGE_CONFIG.reddit;
      return !!(c && c.clientId && c.redirectUri && c.exchangeUrl);
    },

    /* Opens Reddit's consent screen in a popup and resolves with the
       verified username. `duration=temporary` and the `identity` scope
       mean we ask for the least Reddit offers: a one-shot read of who
       you are, no refresh token, no posting rights. */
    async link() {
      if (!this.canVerify) throw new Error('Reddit verification is not configured.');
      const cfg = LOUNGE_CONFIG.reddit;

      // CSRF: a nonce we hand to Reddit and demand back unchanged.
      const state = 'r' + Math.random().toString(36).slice(2) + Date.now().toString(36);
      sessionStorage.setItem('vp_reddit_state', state);

      const url = 'https://www.reddit.com/api/v1/authorize?' + new URLSearchParams({
        client_id: cfg.clientId,
        response_type: 'code',
        state,
        redirect_uri: cfg.redirectUri,
        duration: 'temporary',
        scope: 'identity',
      });

      const popup = window.open(url, 'vp-reddit', 'width=560,height=720');
      if (!popup) throw new Error('Popup blocked — allow popups for this site and try again.');

      const code = await new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          cleanup();
          reject(new Error('Timed out waiting for Reddit.'));
        }, 180000);

        const closeWatch = setInterval(() => {
          if (popup.closed) { cleanup(); reject(new Error('Cancelled.')); }
        }, 700);

        function onMsg(e) {
          if (e.origin !== window.location.origin) return;      // only our own callback page
          if (!e.data || e.data.type !== 'vp-reddit') return;
          if (e.data.state !== sessionStorage.getItem('vp_reddit_state')) {
            cleanup(); reject(new Error('State mismatch — link aborted.')); return;
          }
          cleanup();
          if (e.data.error) reject(new Error('Reddit returned: ' + e.data.error));
          else resolve(e.data.code);
        }

        function cleanup() {
          clearTimeout(timer);
          clearInterval(closeWatch);
          window.removeEventListener('message', onMsg);
          sessionStorage.removeItem('vp_reddit_state');
          try { popup.close(); } catch (err) {}
        }

        window.addEventListener('message', onMsg);
      });

      const res = await fetch(cfg.exchangeUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, redirect_uri: cfg.redirectUri }),
      });
      if (!res.ok) throw new Error('Could not verify with Reddit (' + res.status + ').');
      const data = await res.json();
      if (!data.username) throw new Error('Reddit did not return a username.');
      return data.username;
    },
  };

  /* Shared helpers the UI needs. */
  window.LoungeUtil = { fuzzCoords, LOC_GRID };
  window.LoungeReddit = Reddit;
})();
