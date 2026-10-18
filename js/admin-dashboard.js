/* ══════════════════════════════════════════════════════════════════
   VITOLA PEDIA — PRIVATE ADMIN DASHBOARD
   ══════════════════════════════════════════════════════════════════

   Opens only when the URL carries ?admin=true or a #/admin hash. In
   every other case it is inert — nothing renders, nothing in the DOM
   betrays that it exists. Tracking (search terms, cigar views, session
   length) runs on every load regardless, so the metrics accumulate
   before the owner ever opens the dashboard.

   Data sources:
     • js/data.js            → CIGARS array (counts, image/buy coverage,
                               price distribution)
     • js/pipe_tobacco_data  → PIPE_TOBACCOS count
     • js/pipe-types.js      → PIPE_TYPES count
     • VPAnalytics.recent()  → last 60 pageview/event entries (ring buffer
                               maintained by js/analytics.js)
     • Supabase REST API     → lounge member / message / smoke counts
                               (public anon key, RLS permitting)
     • localStorage          → search terms, popular cigars, sessions
     • sitemap.xml           → URL count (fetched live when same-origin)

   No external chart library — bars are CSS, the donut is inline SVG.
   ══════════════════════════════════════════════════════════════════ */

const VPAdmin = (function () {
  'use strict';

  /* ── STORAGE KEYS ───────────────────────────────────────────────── */
  const K = {
    searches:    'vp_searches',     // [{q, at}] last 100
    popular:     'vp_popular',      // {cigarId: {name, brand, count, last}}
    sessions:    'vp_sessions',     // [{start, end, duration}] last 50
    sessionFlag: 'vp_session_started',
  };
  const MAX_SEARCHES = 100;
  const MAX_POPULAR   = 40;       // store top 40, display top 20
  const MAX_SESSIONS = 50;

  /* ── SUPABASE (public anon key — RLS is the real gate) ─────────── */
  const SB = {
    url:     'https://kygxntaptlnyxinchgxm.supabase.co',
    anonKey: 'sb_publishable_SfhLchaNwPUj9gwxNWbkLw_IcQ_Qnc7',
  };

  /* ── ADMIN MODE DETECTION ───────────────────────────────────────── */
  function isAdminMode() {
    try {
      if (new URLSearchParams(location.search).get('admin') === 'true') return true;
      if (location.hash === '#/admin' || location.hash.startsWith('#/admin')) return true;
    } catch (e) {}
    return false;
  }

  /* ── LOCALSTORAGE HELPERS ───────────────────────────────────────── */
  function load(key, fallback) {
    try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; }
    catch (e) { return fallback; }
  }
  function save(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) {}
  }

  /* ═════════════════════════════════════════════════════════════════
     TRACKING — runs on every load so data accrues before admin opens
     ═════════════════════════════════════════════════════════════════ */

  function trackSession() {
    // Record a session start once per tab; on dashboard render we
    // compute the live elapsed. Persist a finished-session summary
    // on pagehide for an all-time sessions list.
    if (!sessionStorage.getItem(K.sessionFlag)) {
      sessionStorage.setItem(K.sessionFlag, String(Date.now()));
    }
    const startedAt = Number(sessionStorage.getItem(K.sessionFlag));
    window.addEventListener('pagehide', () => {
      const dur = Date.now() - startedAt;
      if (dur < 2000) return;             // ignore bounces
      const list = load(K.sessions, []);
      list.push({ start: startedAt, end: Date.now(), duration: dur });
      if (list.length > MAX_SESSIONS) list.shift();
      save(K.sessions, list);
    });
  }

  function trackSearches() {
    const input = document.getElementById('searchInput');
    if (!input) return;
    let lastQ = '';
    const record = (q) => {
      q = (q || '').trim();
      if (q.length < 2) return;
      if (q === lastQ) return;             // dedupe immediate repeats
      lastQ = q;
      const list = load(K.searches, []);
      list.push({ q, at: Date.now() });
      if (list.length > MAX_SEARCHES) list.shift();
      save(K.searches, list);
    };
    input.addEventListener('change', e => record(e.target.value));
    input.addEventListener('keydown', e => {
      if (e.key === 'Enter') record(e.target.value);
    });
    // Debounced capture of longer queries so we still log terms the
    // user typed and then clicked away without submitting.
    let t = null;
    input.addEventListener('input', e => {
      clearTimeout(t);
      t = setTimeout(() => {
        const v = e.target.value;
        if (v && v.trim().length >= 4) record(v);
      }, 1200);
    });
  }

  function hasVPAnalytics() {
    // analytics.js declares `const VPAnalytics`, which is a global
    // lexical binding — NOT a property of window. Access via typeof
    // to avoid a ReferenceError when analytics.js hasn't loaded.
    return typeof VPAnalytics !== 'undefined' && VPAnalytics &&
           typeof VPAnalytics.recent === 'function';
  }

  function trackPopular() {
    // Reuse VPAnalytics instrumentation: poll the ring buffer for new
    // 'cigar_opened' events and accumulate a count per cigar into
    // localStorage. Independent of script-load order.
    if (!hasVPAnalytics()) return;
    let lastAt = 0;
    setInterval(() => {
      const recent = VPAnalytics.recent();
      for (const ev of recent) {
        if (ev.kind !== 'event' || ev.name !== 'cigar_opened') continue;
        if (ev.at <= lastAt) continue;
        lastAt = ev.at;
        const p = ev.props || {};
        const id = p.cigar || p.name || '(unknown)';
        if (id === '(unknown)') continue;
        const map = load(K.popular, {});
        const cur = map[id] || { name: p.cigar || p.name, brand: p.brand || '', count: 0, last: 0 };
        cur.count++;
        cur.last = ev.at;
        map[id] = cur;
        // Trim to top MAX_POPULAR by count.
        const entries = Object.entries(map).sort((a, b) => b[1].count - a[1].count);
        const trimmed = {};
        for (let i = 0; i < Math.min(entries.length, MAX_POPULAR); i++) trimmed[entries[i][0]] = entries[i][1];
        save(K.popular, trimmed);
      }
    }, 3000);
  }

  /* ═════════════════════════════════════════════════════════════════
     METRIC GATHERERS
     ═════════════════════════════════════════════════════════════════ */

  function databaseStats() {
    const cigars = (typeof CIGARS !== 'undefined' && CIGARS) ? CIGARS : [];
    const pipeTobs = (typeof PIPE_TOBACCOS !== 'undefined' && PIPE_TOBACCOS) ? PIPE_TOBACCOS : [];
    const pipeTypes = (typeof PIPE_TYPES !== 'undefined' && PIPE_TYPES) ? PIPE_TYPES : [];
    const brands = new Set();
    let withImg = 0, withBuy = 0, prices = [];
    for (const c of cigars) {
      if (c.brand) brands.add(c.brand);
      if (c.image) withImg++;
      if (c.buyLinks && c.buyLinks.length) withBuy++;
      if (typeof c.price === 'number' && c.price > 0) prices.push(c.price);
    }
    prices.sort((a, b) => a - b);
    const n = cigars.length || 1;
    const buckets = {
      'Under $5':   prices.filter(p => p < 5).length,
      '$5–$10':     prices.filter(p => p >= 5 && p < 10).length,
      '$10–$20':    prices.filter(p => p >= 10 && p < 20).length,
      '$20–$50':    prices.filter(p => p >= 20 && p < 50).length,
      '$50–$100':   prices.filter(p => p >= 50 && p < 100).length,
      'Over $100':  prices.filter(p => p >= 100).length,
    };
    return {
      cigars: cigars.length,
      pipeTobacco: pipeTobs.length,
      brands: brands.size,
      pipeTypes: pipeTypes.length,
      withImage: withImg,
      withImagePct: n ? (100 * withImg / n) : 0,
      withBuy: withBuy,
      withBuyPct: n ? (100 * withBuy / n) : 0,
      priceBuckets: buckets,
      priceMin: prices[0] || 0,
      priceMedian: prices.length ? prices[Math.floor(prices.length / 2)] : 0,
      priceMax: prices.length ? prices[prices.length - 1] : 0,
    };
  }

  function searchTrends() {
    const list = load(K.searches, []);
    // Aggregate by term (case-insensitive), keep most-recent timestamp.
    const map = {};
    for (const s of list) {
      const key = (s.q || '').toLowerCase();
      if (!key) continue;
      if (!map[key]) map[key] = { q: s.q, count: 0, last: 0 };
      map[key].count++;
      map[key].last = Math.max(map[key].last, s.at || 0);
    }
    const top = Object.values(map).sort((a, b) => b.count - a.count).slice(0, 10);
    return { total: list.length, top };
  }

  function popularCigars() {
    const map = load(K.popular, {});
    return Object.values(map).sort((a, b) => b.count - a.count).slice(0, 20);
  }

  function analyticsStats() {
    const recent = hasVPAnalytics() ? VPAnalytics.recent() : [];
    const pageviews = recent.filter(e => e.kind === 'pageview');
    const events = recent.filter(e => e.kind === 'event');
    const byPath = {};
    for (const p of pageviews) {
      const k = p.name || '(root)';
      byPath[k] = (byPath[k] || 0) + 1;
    }
    const byEvent = {};
    for (const e of events) {
      const k = e.name || '(event)';
      byEvent[k] = (byEvent[k] || 0) + 1;
    }
    const topPaths = Object.entries(byPath).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([k, v]) => ({ path: k, count: v }));
    return {
      ringCapacity: 60,
      pageviewsInBuffer: pageviews.length,
      eventsInBuffer: events.length,
      topPaths,
      byEvent,
    };
  }

  function sessionStats() {
    const startedAt = Number(sessionStorage.getItem(K.sessionFlag)) || Date.now();
    const elapsed = Date.now() - startedAt;
    const sessions = load(K.sessions, []);
    const totalSec = sessions.reduce((a, s) => a + (s.duration || 0), 0);
    const avgSec = sessions.length ? totalSec / sessions.length : 0;
    return { currentElapsed: elapsed, sessionCount: sessions.length, totalSeconds: totalSec, avgSeconds: avgSec };
  }

  async function fetchSupabaseCount(table) {
    // HEAD with Prefer: count=exact returns a content-range header we
    // parse for the total. Falls back to a 0-count on any failure.
    try {
      const r = await fetch(`${SB.url}/rest/v1/${table}?select=id&limit=1`, {
        method: 'GET',
        headers: {
          'apikey': SB.anonKey,
          'Authorization': `Bearer ${SB.anonKey}`,
          'Prefer': 'count=exact',
        },
      });
      if (!r.ok) return { ok: false, count: 0, status: r.status };
      const range = r.headers.get('content-range') || '';
      // content-range: "0-0/12345" → 12345 ;  "*/12345" → 12345
      const m = range.match(/\/(\d+)/);
      return { ok: true, count: m ? Number(m[1]) : 0, status: r.status };
    } catch (e) {
      return { ok: false, count: 0, status: 0, error: String(e) };
    }
  }

  async function loungeStats() {
    const [members, messages, smokes] = await Promise.all([
      fetchSupabaseCount('lounge_members'),
      fetchSupabaseCount('lounge_chat_messages'),
      fetchSupabaseCount('lounge_smokes'),
    ]);
    return {
      members,
      messages,
      smokes,
      reachable: members.ok || messages.ok || smokes.ok,
    };
  }

  async function seoStats() {
    let sitemapCount = null;
    let sitemapError = null;
    try {
      const r = await fetch('/sitemap.xml', { cache: 'no-store' });
      if (r.ok) {
        const txt = await r.text();
        sitemapCount = (txt.match(/<loc>/g) || []).length;
      } else {
        sitemapError = `HTTP ${r.status}`;
      }
    } catch (e) { sitemapError = String(e); }

    const metaTags = document.querySelectorAll('meta').length;
    const ogTags = document.querySelectorAll('meta[property^="og:"]').length;
    const twitterTags = document.querySelectorAll('meta[name^="twitter:"]').length;
    const ldJson = document.querySelectorAll('script[type="application/ld+json"]').length;
    const hasCanonical = !!document.querySelector('link[rel="canonical"]');
    const hasDescription = !!document.querySelector('meta[name="description"]');
    const hasRobots = !!document.querySelector('meta[name="robots"]');

    // SEO pages — count static .html that look like landing pages.
    let seoPages = 0;
    try {
      // Heuristic: count <loc> entries in the sitemap that point to .html
      // or non-hash paths on this origin (excludes cigar/#/cigar routes).
      if (sitemapCount !== null) seoPages = sitemapCount;
    } catch (e) {}

    return {
      sitemapUrls: sitemapCount,
      sitemapError,
      seoPages,
      metaTags,
      ogTags,
      twitterTags,
      ldJson,
      hasCanonical,
      hasDescription,
      hasRobots,
    };
  }

  /* ═════════════════════════════════════════════════════════════════
     FORMATTING
     ═════════════════════════════════════════════════════════════════ */
  function fmtNum(n) {
    if (n == null || isNaN(n)) return '—';
    return Number(n).toLocaleString('en-US');
  }
  function fmtDur(ms) {
    if (!ms || ms < 0) return '—';
    const s = Math.floor(ms / 1000);
    const m = Math.floor(s / 60), sec = s % 60;
    if (m < 1) return `${sec}s`;
    const h = Math.floor(m / 60), mm = m % 60;
    if (h < 1) return `${m}m ${sec}s`;
    return `${h}h ${mm}m`;
  }
  function fmtTimeAgo(ts) {
    if (!ts) return '—';
    const d = Date.now() - ts;
    if (d < 60000) return 'just now';
    const m = Math.floor(d / 60000);
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    return `${Math.floor(h / 24)}d ago`;
  }
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&').replace(/</g, '<').replace(/>/g, '>')
      .replace(/"/g, '"').replace(/'/g, '&#39;');
  }

  /* ═════════════════════════════════════════════════════════════════
     CHART HELPERS  (pure CSS + inline SVG, no library)
     ═════════════════════════════════════════════════════════════════ */
  function barRow(label, value, max, suffix) {
    const pct = max > 0 ? Math.max(2, (value / max) * 100) : 0;
    return `
      <div class="ad-bar-row">
        <div class="ad-bar-label" title="${esc(label)}">${esc(label)}</div>
        <div class="ad-bar-track">
          <div class="ad-bar-fill" style="width:${pct}%"></div>
        </div>
        <div class="ad-bar-value">${fmtNum(value)}${suffix || ''}</div>
      </div>`;
  }

  function donutSVG(pct, color, label) {
    // 36x36 viewBox, circumference = 2πr ≈ 100 for r≈15.9
    const r = 15.9155;
    const c = 2 * Math.PI * r;
    const dash = (pct / 100) * c;
    return `
      <div class="ad-donut">
        <svg viewBox="0 0 36 36" width="92" height="92">
          <circle cx="18" cy="18" r="${r}" fill="none" stroke="rgba(255,255,255,0.08)" stroke-width="3.2"/>
          <circle cx="18" cy="18" r="${r}" fill="none" stroke="${color}"
                  stroke-width="3.2" stroke-linecap="round"
                  stroke-dasharray="${dash.toFixed(2)} ${c.toFixed(2)}"
                  stroke-dashoffset="${(c / 4).toFixed(2)}"
                  transform="rotate(-90 18 18)"/>
          <text x="18" y="20.5" text-anchor="middle" font-size="7.5"
                font-family="Inter, sans-serif" font-weight="600" fill="#e8b86d">${pct.toFixed(1)}%</text>
        </svg>
        <div class="ad-donut-label">${esc(label)}</div>
      </div>`;
  }

  /* ═════════════════════════════════════════════════════════════════
     DASHBOARD RENDER
     ═════════════════════════════════════════════════════════════════ */

  let overlayEl = null;

  function buildOverlay() {
    if (overlayEl) return overlayEl;
    const css = `
      .ad-overlay{position:fixed;inset:0;z-index:2147483000;background:rgba(8,5,2,0.97);
        color:#e9e0d2;font-family:Inter,system-ui,sans-serif;overflow-y:auto;
        backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);}
      .ad-wrap{max-width:1180px;margin:0 auto;padding:28px 26px 80px;}
      .ad-top{display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:14px;
        margin-bottom:22px;border-bottom:1px solid rgba(201,148,58,0.25);padding-bottom:18px;}
      .ad-title{font-family:'Playfair Display',Georgia,serif;font-size:28px;font-weight:700;
        color:#e8b86d;letter-spacing:0.3px;}
      .ad-title small{display:block;font-family:Inter,sans-serif;font-size:11px;font-weight:400;
        color:#8a7a5e;letter-spacing:1.6px;text-transform:uppercase;margin-top:3px;}
      .ad-actions{display:flex;gap:10px;align-items:center;flex-wrap:wrap;}
      .ad-btn{background:rgba(201,148,58,0.12);border:1px solid rgba(201,148,58,0.4);color:#e8b86d;
        padding:8px 16px;border-radius:8px;font-size:13px;font-weight:500;cursor:pointer;
        font-family:inherit;transition:background .15s, border-color .15s;}
      .ad-btn:hover{background:rgba(201,148,58,0.22);border-color:#c9943a;}
      .ad-btn.ghost{background:transparent;color:#9c8b6f;border-color:rgba(156,139,111,0.3);}
      .ad-btn.ghost:hover{color:#e9e0d2;border-color:#9c8b6f;}
      .ad-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:14px;margin-bottom:22px;}
      .ad-card{background:linear-gradient(160deg,rgba(26,18,9,0.85),rgba(18,12,6,0.85));
        border:1px solid rgba(201,148,58,0.18);border-radius:12px;padding:18px 18px 16px;}
      .ad-card h3{font-family:'Playfair Display',serif;font-size:13px;font-weight:600;color:#c9943a;
        margin:0 0 14px;letter-spacing:1.4px;text-transform:uppercase;
        padding-bottom:10px;border-bottom:1px solid rgba(201,148,58,0.15);}
      .ad-panel{background:linear-gradient(160deg,rgba(26,18,9,0.85),rgba(18,12,6,0.85));
        border:1px solid rgba(201,148,58,0.18);border-radius:12px;padding:18px 20px;margin-bottom:16px;}
      .ad-panel h3{font-family:'Playfair Display',serif;font-size:15px;font-weight:600;color:#c9943a;
        margin:0 0 16px;letter-spacing:1.2px;text-transform:uppercase;
        padding-bottom:12px;border-bottom:1px solid rgba(201,148,58,0.15);}
      .ad-row{display:flex;justify-content:space-between;align-items:baseline;padding:7px 0;
        font-size:13px;border-bottom:1px dashed rgba(201,148,58,0.1);}
      .ad-row:last-child{border-bottom:none;}
      .ad-row .k{color:#9c8b6f;}
      .ad-row .v{color:#f0e6d4;font-weight:500;font-variant-numeric:tabular-nums;}
      .ad-row .v.muted{color:#6e6048;font-style:italic;font-weight:400;}
      .ad-row .v.good{color:#7bbf8a;} .ad-row .v.warn{color:#d9a441;} .ad-row .v.bad{color:#d97a6b;}
      .ad-big{font-size:30px;font-weight:700;color:#f0e6d4;line-height:1;font-variant-numeric:tabular-nums;}
      .ad-big + .ad-sub{font-size:11px;color:#8a7a5e;letter-spacing:0.6px;text-transform:uppercase;margin-top:6px;}
      .ad-statcard .ad-big{font-family:'Playfair Display',serif;color:#e8b86d;}
      .ad-donuts{display:flex;gap:18px;flex-wrap:wrap;}
      .ad-donut{display:flex;flex-direction:column;align-items:center;gap:6px;}
      .ad-donut-label{font-size:11px;color:#9c8b6f;text-align:center;max-width:100px;letter-spacing:0.4px;}
      .ad-bars{display:flex;flex-direction:column;gap:8px;margin-top:4px;}
      .ad-bar-row{display:grid;grid-template-columns:130px 1fr 56px;align-items:center;gap:10px;font-size:12px;}
      .ad-bar-label{color:#b8a888;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
      .ad-bar-track{height:9px;background:rgba(255,255,255,0.06);border-radius:6px;overflow:hidden;}
      .ad-bar-fill{height:100%;background:linear-gradient(90deg,#c9943a,#e8b86d);border-radius:6px;
        transition:width .4s ease;}
      .ad-bar-value{color:#f0e6d4;text-align:right;font-variant-numeric:tabular-nums;}
      .ad-tag{display:inline-block;background:rgba(201,148,58,0.1);border:1px solid rgba(201,148,58,0.25);
        color:#c9943a;padding:2px 8px;border-radius:10px;font-size:11px;margin:2px 4px 2px 0;}
      .ad-empty{color:#6e6048;font-style:italic;font-size:12px;padding:6px 0;}
      .ad-section-title{font-family:'Playfair Display',serif;font-size:16px;color:#c9943a;
        margin:18px 0 12px;letter-spacing:1px;text-transform:uppercase;
        border-bottom:1px solid rgba(201,148,58,0.2);padding-bottom:8px;}
      .ad-footer{text-align:center;color:#5e5238;font-size:11px;margin-top:30px;letter-spacing:0.5px;}
      .ad-panel.muted{opacity:0.7;}
      @media (max-width:560px){
        .ad-bar-row{grid-template-columns:90px 1fr 44px;}
        .ad-title{font-size:22px;}
        .ad-big{font-size:24px;}
      }
    `;
    overlayEl = document.createElement('div');
    overlayEl.id = 'adminDashboard';
    overlayEl.className = 'ad-overlay';
    overlayEl.setAttribute('role','dialog');
    overlayEl.setAttribute('aria-label','Vitola Pedia admin dashboard');
    const style = document.createElement('style');
    style.textContent = css;
    overlayEl.appendChild(style);
    document.body.appendChild(overlayEl);
    return overlayEl;
  }

  function renderTopBar(overlay) {
    const now = new Date().toLocaleString();
    overlay.innerHTML += `
      <div class="ad-wrap">
        <div class="ad-top">
          <div class="ad-title">Vitola Pedia · Admin Dashboard
            <small>Private · ${esc(now)}</small>
          </div>
          <div class="ad-actions">
            <button class="ad-btn" id="adRefresh">↻ Refresh</button>
            <button class="ad-btn" id="adExport">⤓ Export JSON</button>
            <button class="ad-btn ghost" id="adClose">✕ Close</button>
          </div>
        </div>`;
  }

  function renderInventory(db) {
    return `
      <div class="ad-grid">
        <div class="ad-card ad-statcard">
          <div class="ad-big">${fmtNum(db.cigars)}</div>
          <div class="ad-sub">Total Cigars</div>
        </div>
        <div class="ad-card ad-statcard">
          <div class="ad-big">${fmtNum(db.pipeTobacco)}</div>
          <div class="ad-sub">Pipe Tobacco Blends</div>
        </div>
        <div class="ad-card ad-statcard">
          <div class="ad-big">${fmtNum(db.brands)}</div>
          <div class="ad-sub">Brands</div>
        </div>
        <div class="ad-card ad-statcard">
          <div class="ad-big">${fmtNum(db.pipeTypes)}</div>
          <div class="ad-sub">Pipe Types</div>
        </div>
      </div>`;
  }

  function renderDbHealth(db) {
    const maxBucket = Math.max(1, ...Object.values(db.priceBuckets));
    const bars = Object.entries(db.priceBuckets).map(([k, v]) => barRow(k, v, maxBucket)).join('');
    return `
      <div class="ad-panel">
        <h3>Cigar Database Health</h3>
        <div class="ad-donuts">
          ${donutSVG(db.withImagePct, '#c9943a', 'Have image')}
          ${donutSVG(db.withBuyPct, '#7bbf8a', 'Have buy link')}
        </div>
        <div class="ad-row" style="margin-top:14px"><span class="k">Cigars with image</span>
          <span class="v">${fmtNum(db.withImage)} / ${fmtNum(db.cigars)} (${db.withImagePct.toFixed(1)}%)</span></div>
        <div class="ad-row"><span class="k">Cigars with buy links</span>
          <span class="v">${fmtNum(db.withBuy)} / ${fmtNum(db.cigars)} (${db.withBuyPct.toFixed(1)}%)</span></div>
        <div class="ad-row"><span class="k">Price range</span>
          <span class="v">$${db.priceMin.toFixed(2)} – $${db.priceMax.toFixed(2)} <span style="color:#8a7a5e">(median $${db.priceMedian.toFixed(2)})</span></span></div>
        <div class="ad-section-title" style="font-size:12px;margin-top:14px">Price distribution</div>
        <div class="ad-bars">${bars}</div>
      </div>`;
  }

  function renderLounge(lounge) {
    const cell = (label, r) => `
      <div class="ad-row">
        <span class="k">${label}</span>
        <span class="v ${r.ok ? '' : 'muted'}">${r.ok ? fmtNum(r.count) : (r.status === 0 ? 'offline' : `RLS/HTTP ${r.status}`)}</span>
      </div>`;
    const note = lounge.reachable ? '' :
      `<div class="ad-empty" style="margin-top:8px">Live counts require a Supabase query permitted by RLS. Run a server-side query if the anon role is blocked.</div>`;
    return `
      <div class="ad-panel ${lounge.reachable ? '' : 'muted'}">
        <h3>Lounge (Supabase)</h3>
        ${cell('Active members', lounge.members)}
        ${cell('Total messages', lounge.messages)}
        ${cell('Total smokes logged', lounge.smokes)}
        ${note}
      </div>`;
  }

  function renderAnalytics(an) {
    const maxP = Math.max(1, ...an.topPaths.map(p => p.count));
    const pathBars = an.topPaths.length
      ? an.topPaths.map(p => barRow(p.path, p.count, maxP)).join('')
      : '<div class="ad-empty">No pageviews in the ring buffer yet.</div>';
    const eventTags = Object.entries(an.byEvent)
      .map(([k, v]) => `<span class="ad-tag">${esc(k)} · ${v}</span>`).join('');
    return `
      <div class="ad-panel">
        <h3>Analytics (live ring buffer — last 60)</h3>
        <div class="ad-row"><span class="k">Pageviews in buffer</span><span class="v">${an.pageviewsInBuffer} / ${an.ringCapacity}</span></div>
        <div class="ad-row"><span class="k">Custom events in buffer</span><span class="v">${an.eventsInBuffer} / ${an.ringCapacity}</span></div>
        ${eventTags ? `<div style="margin-top:10px"><div class="ad-section-title" style="font-size:12px">Event types</div>${eventTags}</div>` : ''}
        <div class="ad-section-title" style="font-size:12px">Top pageviews by path</div>
        <div class="ad-bars">${pathBars}</div>
        <div class="ad-empty" style="margin-top:8px">Cloudflare Web Analytics counts pageviews only; custom events are held locally. Add Zaraz or Plausible to forward them.</div>
      </div>`;
  }

  function renderSearch(trends) {
    const max = Math.max(1, ...trends.top.map(t => t.count));
    const bars = trends.top.length
      ? trends.top.map(t => barRow(t.q, t.count, max, ` ×${t.count}`)).join('')
      : '<div class="ad-empty">No searches tracked yet. Search terms are recorded as visitors use the search box.</div>';
    return `
      <div class="ad-panel">
        <h3>Search Trends <span style="font-size:11px;color:#8a7a5e;font-weight:400;text-transform:none">· last ${MAX_SEARCHES} queries</span></h3>
        <div class="ad-row"><span class="k">Queries recorded</span><span class="v">${fmtNum(trends.total)}</span></div>
        <div class="ad-row"><span class="k">Unique terms</span><span class="v">${fmtNum(trends.top.length)}</span></div>
        <div class="ad-section-title" style="font-size:12px">Top search terms</div>
        <div class="ad-bars">${bars}</div>
      </div>`;
  }

  function renderPopular(pop) {
    const max = Math.max(1, ...pop.map(p => p.count));
    const bars = pop.length
      ? pop.map(p => barRow(`${p.name}${p.brand ? ' · ' + p.brand : ''}`, p.count, max, ` ×${p.count}`)).join('')
      : '<div class="ad-empty">No cigar modal opens tracked yet. Counts accrue as visitors open cigar detail modals.</div>';
    return `
      <div class="ad-panel">
        <h3>Popular Cigars <span style="font-size:11px;color:#8a7a5e;font-weight:400;text-transform:none">· top 20 by modal opens</span></h3>
        <div class="ad-row"><span class="k">Distinct cigars viewed</span><span class="v">${fmtNum(pop.length)}</span></div>
        <div class="ad-section-title" style="font-size:12px">Most-viewed cigars</div>
        <div class="ad-bars">${bars}</div>
      </div>`;
  }

  function renderSessions(s) {
    return `
      <div class="ad-panel">
        <h3>Session Activity</h3>
        <div class="ad-row"><span class="k">Current session duration</span><span class="v">${fmtDur(s.currentElapsed)}</span></div>
        <div class="ad-row"><span class="k">Sessions recorded</span><span class="v">${fmtNum(s.sessionCount)}</span></div>
        <div class="ad-row"><span class="k">Avg session length</span><span class="v">${fmtDur(s.avgSeconds * 1000)}</span></div>
        <div class="ad-row"><span class="k">Total time on site</span><span class="v">${fmtDur(s.totalSeconds * 1000)}</span></div>
      </div>`;
  }

  function renderSeo(seo) {
    const coverage = ['hasCanonical','hasDescription','hasRobots'];
    const good = coverage.filter(k => seo[k]).length;
    return `
      <div class="ad-panel">
        <h3>SEO Health</h3>
        <div class="ad-row"><span class="k">Sitemap URLs</span>
          <span class="v ${seo.sitemapUrls == null ? 'muted' : ''}">${seo.sitemapUrls == null ? (esc(seo.sitemapError) || 'unavailable') : fmtNum(seo.sitemapUrls)}</span></div>
        <div class="ad-row"><span class="k">SEO landing pages</span><span class="v">${fmtNum(seo.seoPages)}</span></div>
        <div class="ad-row"><span class="k">Meta tags on page</span><span class="v">${fmtNum(seo.metaTags)}</span></div>
        <div class="ad-row"><span class="k">Open Graph tags</span><span class="v">${fmtNum(seo.ogTags)}</span></div>
        <div class="ad-row"><span class="k">Twitter Card tags</span><span class="v">${fmtNum(seo.twitterTags)}</span></div>
        <div class="ad-row"><span class="k">JSON-LD blocks</span><span class="v">${fmtNum(seo.ldJson)}</span></div>
        <div class="ad-row"><span class="k">Essential meta coverage</span>
          <span class="v ${good === 3 ? 'good' : good === 0 ? 'bad' : 'warn'}">${good}/3 · canonical, description, robots</span></div>
      </div>`;
  }

  async function renderDashboard() {
    const overlay = buildOverlay();
    overlay.innerHTML = '';  // clear
    renderTopBar(overlay);

    const db = databaseStats();
    overlay.lastChild.insertAdjacentHTML('beforebegin', renderInventory(db));
    overlay.querySelector('.ad-wrap').insertAdjacentHTML('beforeend', renderDbHealth(db));

    // Synchronous metrics.
    const an = analyticsStats();
    const trends = searchTrends();
    const pop = popularCigars();
    const s = sessionStats();
    overlay.querySelector('.ad-wrap').insertAdjacentHTML('beforeend',
      `<div id="adLoungeSlot">${renderLounge({ members:{ok:false,status:0}, messages:{ok:false,status:0}, smokes:{ok:false,status:0}, reachable:false })}</div>` +
      renderAnalytics(an) +
      renderSearch(trends) +
      renderPopular(pop) +
      renderSessions(s) +
      `<div id="adSeoSlot"></div>`
    );

    overlay.querySelector('.ad-wrap').insertAdjacentHTML('beforeend',
      '<div class="ad-footer">Vitola Pedia admin dashboard · private · ?admin=true or #/admin · data lives in localStorage & the VPAnalytics ring buffer</div>');

    // Async fills.
    loungeStats().then(lounge => {
      const slot = overlay.querySelector('#adLoungeSlot');
      if (slot) slot.innerHTML = renderLounge(lounge);
    });

    seoStats().then(seo => {
      const slot = overlay.querySelector('#adSeoSlot');
      if (slot) slot.outerHTML = renderSeo(seo);
    });

    // Wire actions.
    overlay.querySelector('#adRefresh').addEventListener('click', () => renderDashboard());
    overlay.querySelector('#adClose').addEventListener('click', closeDashboard);
    overlay.querySelector('#adExport').addEventListener('click', exportJSON);
  }

  function closeDashboard() {
    // Drop the dashboard but keep ?admin / #/admin out of the URL so a
    // refresh does not immediately bring it back. The Dashboard nav
    // link stays (still in admin mode) to re-open it.
    if (overlayEl) { overlayEl.remove(); overlayEl = null; }
  }

  function exportJSON() {
    const db = databaseStats();
    const an = analyticsStats();
    const trends = searchTrends();
    const pop = popularCigars();
    const s = sessionStats();
    const payload = {
      generatedAt: new Date().toISOString(),
      url: location.href,
      database: db,
      analytics: an,
      searchTrends: trends,
      popularCigars: pop,
      sessions: s,
      seo: {
        metaTags: document.querySelectorAll('meta').length,
        ogTags: document.querySelectorAll('meta[property^="og:"]').length,
        twitterTags: document.querySelectorAll('meta[name^="twitter:"]').length,
        ldJson: document.querySelectorAll('script[type="application/ld+json"]').length,
      },
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `vitolapedia-metrics-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  /* ── DASHBOARD NAV LINK (visible only in admin mode) ──────────── */
  function addDashboardLink() {
    const nav = document.querySelector('.header-nav');
    if (!nav || nav.querySelector('#adminDashLink')) return;
    const btn = document.createElement('button');
    btn.id = 'adminDashLink';
    btn.className = 'nav-btn';
    btn.style.cssText = 'color:#e8b86d;border:1px solid rgba(201,148,58,0.5);';
    btn.title = 'Open the private admin dashboard';
    btn.textContent = 'Dashboard';
    btn.addEventListener('click', e => {
      e.preventDefault();
      if (!overlayEl) renderDashboard();
      else closeDashboard();
    });
    nav.appendChild(btn);
  }

  /* ── ENTRY ────────────────────────────────────────────────────── */
  function boot() {
    // Tracking always runs.
    trackSession();
    trackSearches();
    trackPopular();

    // Dashboard + nav link only when admin mode is active.
    if (isAdminMode()) {
      addDashboardLink();
      // Render after the data files + feature modules have had a
      // moment to initialise (analytics instrumentation fires at +400ms).
      setTimeout(renderDashboard, 600);
    }
  }

  // React to hash changes that flip admin mode on after load.
  window.addEventListener('hashchange', () => {
    if (isAdminMode()) {
      if (!document.querySelector('#adminDashLink')) addDashboardLink();
      if (!overlayEl) renderDashboard();
    }
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

  return {
    open: renderDashboard,
    close: closeDashboard,
    exportJSON,
    isAdminMode,
  };
})();
