/* ══════════════════════════════════════════════════════════════════
   VITOLA PEDIA — NOTIFY ME WHEN SOMEONE LIGHTS UP
   ───────────────────────────────────────────────────────────────────
   In-page / tab-open notifications for the Lounge. When another member
   starts a smoking session (lights up), anyone with the tab open who has
   opted in gets a browser notification — or an in-page toast if the tab
   is already focused. No server infrastructure required.

   This module is self-contained and degrades gracefully:
     • No Notification API → silently disabled, UI toggle hidden.
     • No LoungeBackend → no-op (never breaks the page).

   FUTURE-PROOFING (not implemented here):
     • Web Push (notifications that arrive when the tab is closed):
       Register a Service Worker, generate VAPID keys, subscribe the
       browser to a push endpoint, and send the subscription to a backend
       that stores it. When a member lights up, the backend fires a
       Web Push to every stored subscription. Needs:
         - sw.js with a 'push' event handler that calls
           self.registration.showNotification(...)
         - applicationServerKey (VAPID public key) passed to
           registration.pushManager.subscribe(...)
         - A server (Supabase Edge Function) to store subscriptions and
           send push messages via the Web Push protocol (web-push npm).
       The Notification API code below stays useful as the "tab open"
       fast path; Web Push covers the "tab closed" case.
     • Email notifications: collect an opt-in email + a Supabase Edge
       Function triggered on session start (a postgres_changes listener
       or a database trigger calling pg_net.http_post) that sends an
       email via Resend / Postmark / SES. Rate-limit per (email, member)
       to avoid spamming.
   ══════════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  /* ── State ─────────────────────────────────────────────────────── */
  const PREF_KEY      = 'vp_notify_lights_up';   // '1' / '0'
  const RATE_LIMIT_MS = 10000;                     // max 1 notify / 10s
  const TOAST_LIFE_MS = 6000;

  let   _enabled       = false;   // user's persisted opt-in preference
  let   _attached      = false;   // presence listener registered?
  let   _firstSync     = true;    // skip the initial presence baseline
  let   _litIds        = new Set(); // memberIds currently known to be lit
  let   _lastNotifyAt  = 0;
  let   _activeNotifs  = [];      // open Notification objects to clean up
  let   _toastEl       = null;
  let   _toastTimer    = null;
  let   _backend       = null;

  /* ── Capability checks ────────────────────────────────────────── */
  const _hasAPI = (typeof window !== 'undefined') &&
                  ('Notification' in window) &&
                  (typeof window.Notification === 'function');

  function _perm() {
    if (!_hasAPI) return 'denied';
    try { return Notification.permission; } catch (e) { return 'denied'; }
  }

  /* ── Escaping (in-page toast renders person-authored names) ───── */
  function _esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  /* ── Preference persistence ────────────────────────────────────── */
  function _loadPref() {
    try { _enabled = localStorage.getItem(PREF_KEY) === '1'; }
    catch (e) { _enabled = false; }
  }
  function _savePref() {
    try { localStorage.setItem(PREF_KEY, _enabled ? '1' : '0'); }
    catch (e) { /* private mode — preference won't survive reload */ }
  }

  /* ── Public API ────────────────────────────────────────────────── */
  const NOTIFY = {
    /* Notification API present in this browser. */
    isSupported: _hasAPI,

    /* Current permission: 'default' | 'granted' | 'denied'. */
    get isPermitted() { return _perm() === 'granted'; },

    /* Whether the user has opted in (persisted preference). */
    get isEnabled() { return _enabled; },

    /* ─────────────────────────────────────────────────────────────
       init() — call once on load (or after LoungeBackend is ready).
       Idempotent. Never throws.
       Sets up capability detection, loads the persisted preference,
       and attaches the presence listener once the backend resolves.
    ─────────────────────────────────────────────────────────────── */
    init() {
      if (!_hasAPI) return;                 // unsupported → stay silent
      _loadPref();
      _attachBackend();
    },

    /* ─────────────────────────────────────────────────────────────
       requestPermission() — MUST be called from a user gesture.
       Returns a promise resolving to true if permission was granted.
    ─────────────────────────────────────────────────────────────── */
    async requestPermission() {
      if (!_hasAPI) return false;
      if (_perm() === 'granted') return true;
      if (_perm() === 'denied') return false;   // can't re-prompt
      try {
        const res = await Notification.requestPermission();
        return res === 'granted';
      } catch (e) { return false; }
    },

    /* ─────────────────────────────────────────────────────────────
       toggle() — the user-gesture entry point from the UI button.
       • If permission is 'default', request it first.
       • If granted (or already granted), flip the opt-in preference.
       • If denied, leave preference as-is; the UI will surface the
         "blocked" state with re-enable instructions.
       Returns the new effective state so the caller can update its UI.
    ─────────────────────────────────────────────────────────────── */
    async toggle() {
      if (!_hasAPI) return { supported: false, enabled: false, denied: false };

      if (_perm() === 'default') {
        const granted = await this.requestPermission();
        if (!granted) {
          // User dismissed or denied the prompt — don't enable.
          return { supported: true, enabled: false, denied: _perm() === 'denied' };
        }
      }
      if (_perm() !== 'granted') {
        return { supported: true, enabled: false, denied: true };
      }
      _enabled = !_enabled;
      _savePref();
      // When turning on, snapshot who is already lit so we don't
      // immediately fire for pre-existing sessions.
      if (_enabled) _snapshotBaseline();
      return { supported: true, enabled: _enabled, denied: false };
    },

    /* ─────────────────────────────────────────────────────────────
       syncButton(el) — keep a toggle button's label/aria state in
       sync with the current capability + preference. Call after init
       and after every toggle().
    ─────────────────────────────────────────────────────────────── */
    syncButton(el) {
      if (!el) return;
      if (!_hasAPI) { el.style.display = 'none'; return; }

      const perm = _perm();
      if (perm === 'denied') {
        el.textContent = '🔔 Notifications blocked';
        el.classList.add('is-denied');
        el.classList.remove('is-on');
        el.setAttribute('aria-pressed', 'false');
        el.title = 'Notifications are blocked for this site. ' +
                   'Re-enable them in your browser site settings ' +
                   '(usually the lock icon in the address bar).';
        return;
      }
      el.classList.remove('is-denied');
      if (_enabled && perm === 'granted') {
        el.textContent = '🔔 Notify on — tap to turn off';
        el.classList.add('is-on');
        el.setAttribute('aria-pressed', 'true');
        el.title = 'You will get a notification when someone lights up.';
      } else {
        el.textContent = '🔔 Notify me when someone lights up';
        el.classList.remove('is-on');
        el.setAttribute('aria-pressed', 'false');
        el.title = 'Get a browser notification when another member ' +
                   'sparks up a cigar in the Lounge.';
      }
    }
  };

  /* ── Backend wiring ────────────────────────────────────────────── */
  function _attachBackend() {
    if (_attached) return;
    // lounge-adapter.js resolves window.LoungeReady to the live adapter.
    const ready = window.LoungeReady;
    if (ready && typeof ready.then === 'function') {
      ready.then(be => { _backend = be; _hookPresence(); })
           .catch(() => { /* solo fallback — no realtime to listen to */ });
    } else {
      // Backend not yet promised; retry shortly.
      setTimeout(_attachBackend, 800);
    }
  }

  function _hookPresence() {
    if (_attached || !_backend || typeof _backend.on !== 'function') return;
    _attached = true;
    try {
      _backend.on('presence', _onPresence);
    } catch (e) {
      console.warn('[notify] could not attach presence listener:', e);
    }
  }

  /* Snapshot the currently-lit member IDs without firing any
     notifications. Used after enabling and on first sync. */
  async function _snapshotBaseline() {
    try {
      const lit = await _safeListPresence();
      _litIds = new Set(lit.map(s => s.memberId));
    } catch (e) { /* ignore */ }
  }

  async function _safeListPresence() {
    if (!_backend || typeof _backend.listPresence !== 'function') return [];
    const r = await _backend.listPresence();
    return Array.isArray(r) ? r : [];
  }

  async function _safeGetMe() {
    if (!_backend || typeof _backend.getMe !== 'function') return null;
    try { return await _backend.getMe(); } catch (e) { return null; }
  }

  /* ── Presence diff → light-up detection ──────────────────────────
     The 'presence' event fires for EVERY presence change (join, leave,
     heartbeat, session start, session end). We re-query listPresence()
     and diff against the last known set of lit member IDs to detect
     members who are NEWLY lit.
  ─────────────────────────────────────────────────────────────────── */
  async function _onPresence() {
    try {
      const lit = await _safeListPresence();
      const me  = await _safeGetMe();
      const myId = me && me.id;

      const nowIds = new Set(lit.map(s => s.memberId));
      const newlyLit = lit.filter(s =>
        s.memberId !== myId && !_litIds.has(s.memberId));

      // Update the baseline regardless, so we never re-fire for the
      // same light-up on a later heartbeat.
      _litIds = nowIds;

      // Skip the very first sync — it carries everyone already lit
      // when the page opened, which is not a "new" light-up.
      if (_firstSync) { _firstSync = false; return; }

      if (!newlyLit.length) return;

      // Only fire when the user has opted in AND permission is granted.
      if (!_enabled || _perm() !== 'granted') return;

      // Rate-limit: max one notification per RATE_LIMIT_MS window.
      const now = Date.now();
      if (now - _lastNotifyAt < RATE_LIMIT_MS) return;
      _lastNotifyAt = now;

      _dispatch(newlyLit);
    } catch (e) {
      console.warn('[notify] presence handler error:', e);
    }
  }

  /* ── Dispatch: toast vs system notification ────────────────────── */
  function _dispatch(members) {
    const tabFocused = (typeof document !== 'undefined') &&
                       document.visibilityState === 'visible' &&
                       (typeof document.hasFocus === 'function'
                         ? document.hasFocus() : true);
    if (tabFocused) {
      _showToast(members);
    } else {
      _showSystemNotification(members);
    }
  }

  /* ── In-page toast (tab is focused) ────────────────────────────── */
  function _showToast(members) {
    _clearToast();
    const el = document.createElement('div');
    el.className = 'lg-notify-toast';
    el.setAttribute('role', 'status');

    const lines = members.map(m => {
      const av  = m.avatar ? (_esc(m.avatar) + ' ') : '';
      const who = _esc(m.handle || 'Someone');
      const what = m.itemName ? _esc(m.itemName) : 'a cigar';
      return `<div class="lg-notify-toast-line">${av}<strong>${who}</strong> lit up <span>${what}</span></div>`;
    }).join('');
    el.innerHTML =
      `<div class="lg-notify-toast-icon">🔥</div>` +
      `<div class="lg-notify-toast-body">${lines}</div>`;

    el.addEventListener('click', () => { _gotoLounge(); _clearToast(); });
    document.body.appendChild(el);
    _toastEl = el;

    // Animate in.
    requestAnimationFrame(() => el.classList.add('is-visible'));

    _toastTimer = setTimeout(_clearToast, TOAST_LIFE_MS);
  }

  function _clearToast() {
    if (_toastTimer) { clearTimeout(_toastTimer); _toastTimer = null; }
    if (_toastEl && _toastEl.parentNode) {
      const el = _toastEl;
      el.classList.remove('is-visible');
      const remove = () => { if (el.parentNode) el.parentNode.removeChild(el); };
      setTimeout(remove, 300);
    }
    _toastEl = null;
  }

  /* ── System notification (tab not focused) ────────────────────── */
  function _showSystemNotification(members) {
    if (!_hasAPI || _perm() !== 'granted') return;

    let title, body;
    if (members.length === 1) {
      const m = members[0];
      const who  = m.handle || 'Someone';
      const what = m.itemName ? (' a ' + m.itemName) : '';
      title = `🔥 ${who} just lit up${what}`;
      body  = m.avatar
        ? `${m.avatar} ${who} is now smoking in the Lounge. Tap to join.`
        : `${who} is now smoking in the Lounge. Tap to join.`;
    } else {
      title = `🔥 ${members.length} members just lit up`;
      body  = members.map(m => (m.handle || 'Someone') +
              (m.itemName ? ' — ' + m.itemName : '')).join('\n');
    }

    try {
      const n = new Notification(title, {
        body: body,
        tag: 'vp-lights-up',
        // renotify keeps the tag useful without buzzing repeatedly
        renotify: true,
        icon: 'data:image/svg+xml,' + encodeURIComponent(
          '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">' +
          '<rect width="32" height="32" rx="6" fill="#1a1209"/>' +
          '<rect x="4" y="14" width="20" height="5" rx="2.5" fill="#c9943a"/>' +
          '<circle cx="25" cy="13" r="2.5" fill="#ff6b35"/></svg>')
      });
      n.onclick = () => { _gotoLounge(); n.close(); };
      _activeNotifs.push(n);
      // Auto-clean after a while so the array doesn't grow unbounded.
      setTimeout(() => {
        const i = _activeNotifs.indexOf(n);
        if (i >= 0) _activeNotifs.splice(i, 1);
      }, 30000);
    } catch (e) {
      console.warn('[notify] could not show notification:', e);
    }
  }

  /* ── Navigate to the Lounge + focus the tab ───────────────────── */
  function _gotoLounge() {
    try {
      if (typeof window.switchView === 'function') window.switchView('lounge');
      else if (typeof window.Lounge === 'object' && window.Lounge &&
               typeof window.Lounge.refresh === 'function') {
        window.Lounge.refresh();
      }
    } catch (e) { /* non-fatal */ }
    try { window.focus(); } catch (e) {}
  }

  /* ── Clear stale notifications when the tab regains focus ──────── */
  function _onVisibility() {
    if (typeof document === 'undefined') return;
    if (document.visibilityState === 'visible') {
      // Close any outstanding system notifications — the user is back.
      _activeNotifs.forEach(n => { try { n.close(); } catch (e) {} });
      _activeNotifs = [];
      _clearToast();
    }
  }

  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', _onVisibility);
  }

  /* ── Boot ─────────────────────────────────────────────────────── */
  if (typeof window !== 'undefined') {
    window.NOTIFY = NOTIFY;
  }
  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => NOTIFY.init());
    } else {
      NOTIFY.init();
    }
  }
})();
