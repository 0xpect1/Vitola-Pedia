/* ══════════════════════════════════════════════════════════════════
   VITOLA PEDIA — THE LOUNGE
   A live room: who's smoking what, where (only if they say so), and a
   threaded feed to talk about it.

   All persistence goes through window.LoungeBackend (js/lounge-adapter.js).
   This file owns rendering and interaction only.
   ══════════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  let BE = null;                 // backend adapter, resolved on init
  let me = null;                 // current member
  let mySession = null;          // my live session, if lit
  let feedSort = 'hot';
  let feedFlair = 'all';
  let openPostId = null;
  let tickTimer = null;

  const FLAIRS = [
    { id: 'review',  label: 'Review',      color: '#c9a84c' },
    { id: 'pairing', label: 'Pairing',     color: '#7fc99e' },
    { id: 'haul',    label: 'Haul',        color: '#e0b84a' },
    { id: 'ask',     label: 'Question',    color: '#8fb8d8' },
    { id: 'talk',    label: 'Lounge Talk', color: '#a89b7a' },
    { id: 'deal',    label: 'Deal',        color: '#e07b3a' },
  ];

  const AVATARS = ['🚬','🥃','🍷','☕','🔥','🌿','🎩','♠️','🦅','🐺','⚓','🎷','📚','🍺','🥂','🧭'];

  const STRENGTH_LABELS = ['Mild', 'Mild–Med', 'Medium', 'Med–Full', 'Full'];

  /* Avatars may be an emoji, a drawn mark or an uploaded photo — every
     render site goes through here so none of them has to care which. */
  const av = (a, alt) => (typeof VPAvatar !== 'undefined'
    ? VPAvatar.render(a, alt) : `<span class="av-emoji">${esc(a || '🚬')}</span>`);

  /* ══════════════════════════════════════════════════════════════
     1. WORLD MAP
     Equirectangular, so placing a coordinate is exact arithmetic
     rather than a projection library:
         x = lon + 180   (0..360)
         y = 90 - lat    (0..180)
     Country outlines come from js/world-data.js (Natural Earth 110m).
  ══════════════════════════════════════════════════════════════ */
  const VIEW = { top: 14, height: 130 };   // y-window: lat +76 → -54

  const X = lon => lon + 180;
  const Y = lat => 90 - lat;

  /* Where the tobacco in the library actually grows. Coordinates point at
     the growing region, not the country centroid — Vuelta Abajo rather
     than the middle of Cuba. */
  const TERROIR = [
    { origin: 'Cuba',               region: 'Vuelta Abajo',           lat: 22.4,  lon: -83.7 },
    { origin: 'Nicaragua',          region: 'Estelí & Jalapa',        lat: 13.1,  lon: -86.35 },
    { origin: 'Dominican Republic', region: 'Cibao Valley',           lat: 19.45, lon: -70.7 },
    { origin: 'Honduras',           region: 'Jamastran & Danlí',      lat: 14.0,  lon: -86.6 },
    { origin: 'Guatemala',          region: 'Jalapa Valley',          lat: 15.5,  lon: -90.3 },
    { origin: 'Mexico',             region: 'San Andrés, Veracruz',   lat: 18.3,  lon: -95.2 },
    { origin: 'Brazil',             region: 'Recôncavo, Bahia',       lat: -12.5, lon: -39.0 },
    { origin: 'Costa Rica',         region: 'Central Valley',         lat: 10.0,  lon: -84.1 },
    { origin: 'United States',      region: 'Connecticut River Valley', lat: 41.8, lon: -72.6 },
    { origin: 'Ecuador',            region: 'Los Ríos (wrapper leaf)', lat: -1.0, lon: -79.5 },
  ];

  const terroirFor = origin => TERROIR.find(t => t.origin === origin) || null;

  /* ── Day/night terminator ──────────────────────────────────────
     The curve where the sun sits exactly on the horizon. Declination is
     the standard cosine approximation and longitude comes straight from
     UTC; the equation of time is skipped, which costs a few minutes of
     accuracy at the edge — invisible at this scale.
  ─────────────────────────────────────────────────────────────── */
  function nightPolygon(now) {
    const d = now || new Date();
    const dayMs = 86400000;
    const yearStart = Date.UTC(d.getUTCFullYear(), 0, 0);
    const dayOfYear = (Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - yearStart) / dayMs;
    const decl = -23.44 * Math.cos((2 * Math.PI / 365) * (dayOfYear + 10));

    const utcHours = d.getUTCHours() + d.getUTCMinutes() / 60;
    const subsolarLon = -15 * (utcHours - 12);

    // Near the equinoxes tan(decl) → 0 and the terminator becomes a
    // meridian; clamp so the polygon stays finite instead of exploding.
    let tanDecl = Math.tan(decl * Math.PI / 180);
    if (Math.abs(tanDecl) < 0.02) tanDecl = 0.02 * (tanDecl < 0 ? -1 : 1);

    const pts = [];
    for (let lon = -180; lon <= 180; lon += 2) {
      const lat = Math.atan(-Math.cos((lon - subsolarLon) * Math.PI / 180) / tanDecl) * 180 / Math.PI;
      pts.push(`${X(lon).toFixed(1)},${Y(lat).toFixed(1)}`);
    }
    // Close the ring onto whichever pole is currently in darkness.
    const darkPole = decl > 0 ? -90 : 90;
    pts.push(`${X(180)},${Y(darkPole)}`, `${X(-180)},${Y(darkPole)}`);
    return 'M' + pts.join('L') + 'Z';
  }

  /* A shipping-route style arc between two coordinates. On an
     equirectangular map a quadratic curve bowed toward the nearer pole
     reads far better than a straight chord. */
  function arcPath(from, to) {
    // Pick whichever way round the globe is actually shorter — a cigar
    // grown in the Caribbean reaches Sydney across the Pacific, not by
    // doubling back over Europe.
    let lon2 = to.lon;
    while (lon2 - from.lon > 180) lon2 -= 360;
    while (lon2 - from.lon < -180) lon2 += 360;

    const x1 = X(from.lon), y1 = Y(from.lat);
    const x2 = X(lon2),     y2 = Y(to.lat);
    const dist = Math.hypot(x2 - x1, y2 - y1);
    const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
    // Bow away from the equator, scaled by distance.
    const lift = Math.min(dist * 0.22, 26) * (my < Y(0) ? -1 : 1);
    const d = `M${x1.toFixed(1)},${y1.toFixed(1)}Q${mx.toFixed(1)},${(my + lift).toFixed(1)} ${x2.toFixed(1)},${y2.toFixed(1)}`;

    // That shorter route can run off the side of the map. Report the
    // extent so the caller can repeat the arc one world-width over and
    // keep it continuous across the antimeridian.
    return { d, minX: Math.min(x1, x2, mx), maxX: Math.max(x1, x2, mx) };
  }

  function buildWorldMap() {
    const countries = (typeof WORLD_COUNTRY_PATHS !== 'undefined' ? WORLD_COUNTRY_PATHS : [])
      .map(d => `<path d="${d}"/>`).join('');

    let grid = '';
    for (let lon = -180; lon <= 180; lon += 30) {
      grid += `<line x1="${X(lon)}" y1="${VIEW.top}" x2="${X(lon)}" y2="${VIEW.top + VIEW.height}"/>`;
    }
    for (let lat = 60; lat >= -40; lat -= 20) {
      grid += `<line x1="0" y1="${Y(lat)}" x2="360" y2="${Y(lat)}"/>`;
    }
    // The two tropics bracket nearly every growing region on earth —
    // worth calling out on a map about tobacco.
    const tropics = [23.44, -23.44]
      .map(lat => `<line x1="0" y1="${Y(lat).toFixed(1)}" x2="360" y2="${Y(lat).toFixed(1)}"/>`).join('');

    return `<svg class="lg-map-svg" viewBox="0 ${VIEW.top} 360 ${VIEW.height}"
                 preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <defs>
        <linearGradient id="lgArcGrad" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%"   stop-color="#c9a84c" stop-opacity="0.75"/>
          <stop offset="100%" stop-color="#e07b3a" stop-opacity="0.15"/>
        </linearGradient>
        <radialGradient id="lgOcean" cx="50%" cy="45%" r="70%">
          <stop offset="0%"   stop-color="#1b1610"/>
          <stop offset="100%" stop-color="#0d0b09"/>
        </radialGradient>
        <linearGradient id="lgNight" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stop-color="#04060d" stop-opacity="0.62"/>
          <stop offset="100%" stop-color="#04060d" stop-opacity="0.48"/>
        </linearGradient>
      </defs>

      <rect x="0" y="0" width="360" height="180" fill="url(#lgOcean)"/>
      <g class="lg-map-grid">${grid}</g>
      <g class="lg-map-tropics">${tropics}</g>
      <g class="lg-map-land">${countries}</g>
      <g class="lg-map-night"><path id="lgNightPath" d="${nightPolygon()}" fill="url(#lgNight)"/></g>
      <g class="lg-map-terroir" id="lgTerroirLayer"></g>
      <g class="lg-map-arcs" id="lgArcLayer"></g>
    </svg>`;
  }

  /* Terroir markers are drawn inside the SVG so they sit under the night
     overlay's sibling layers but above the land. */
  function renderTerroir() {
    const layer = $('lgTerroirLayer');
    if (!layer) return;
    const counts = {};
    cigars().forEach(c => { counts[c.origin] = (counts[c.origin] || 0) + 1; });

    layer.innerHTML = TERROIR.map(t => {
      const n = counts[t.origin] || 0;
      if (!n) return '';
      const x = X(t.lon), y = Y(t.lat);
      const r = Math.max(1.1, Math.min(2.6, 0.9 + Math.log10(n + 1) * 0.85));
      return `<g class="lg-terroir" data-origin="${esc(t.origin)}">
        <circle class="lg-terroir-halo" cx="${x}" cy="${y}" r="${(r * 2.1).toFixed(2)}"/>
        <path class="lg-terroir-mark" d="M${x},${(y - r).toFixed(2)}L${(x + r).toFixed(2)},${y}L${x},${(y + r).toFixed(2)}L${(x - r).toFixed(2)},${y}Z"/>
        <title>${esc(t.origin)} — ${esc(t.region)} · ${n} cigar${n !== 1 ? 's' : ''} in the library</title>
      </g>`;
    }).join('');
  }

  function refreshTerminator() {
    const p = document.getElementById('lgNightPath');
    if (p) p.setAttribute('d', nightPolygon());
  }

  /* Convert a coordinate to a percentage position inside the map box. */
  function project(lat, lon) {
    return {
      left: (X(lon) / 360) * 100,
      top: ((Y(lat) - VIEW.top) / VIEW.height) * 100,
    };
  }

  /* Longitude is a good enough proxy for wall-clock time at this
     resolution. Labelled "≈" in the UI because it ignores real timezone
     boundaries and DST. */
  function approxLocalDate(lon) {
    const utc = Date.now() + new Date().getTimezoneOffset() * 60000;
    return new Date(utc + Math.round(lon / 15) * 3600000);
  }

  function approxLocalTime(lon) {
    return approxLocalDate(lon).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  }

  // 0–23, read from the Date rather than parsed back out of a
  // locale-formatted string (24-hour locales have no "PM" to match on).
  const approxLocalHour = lon => approxLocalDate(lon).getHours();

  /* ══════════════════════════════════════════════════════════════
     2. CITY LIST — for people who want to share a place without
     handing over device location at all.
  ══════════════════════════════════════════════════════════════ */
  const CITIES = [
    ['New York','United States',40.7,-74.0], ['Los Angeles','United States',34.1,-118.2],
    ['Chicago','United States',41.9,-87.6], ['Houston','United States',29.8,-95.4],
    ['Miami','United States',25.8,-80.2], ['Tampa','United States',27.9,-82.5],
    ['Atlanta','United States',33.7,-84.4], ['Dallas','United States',32.8,-96.8],
    ['Denver','United States',39.7,-105.0], ['Phoenix','United States',33.4,-112.1],
    ['Seattle','United States',47.6,-122.3], ['San Francisco','United States',37.8,-122.4],
    ['Las Vegas','United States',36.2,-115.1], ['Boston','United States',42.4,-71.1],
    ['Philadelphia','United States',39.95,-75.2], ['Nashville','United States',36.2,-86.8],
    ['New Orleans','United States',30.0,-90.1], ['Detroit','United States',42.3,-83.0],
    ['Toronto','Canada',43.7,-79.4], ['Montreal','Canada',45.5,-73.6],
    ['Vancouver','Canada',49.3,-123.1], ['Calgary','Canada',51.0,-114.1],
    ['Mexico City','Mexico',19.4,-99.1], ['Guadalajara','Mexico',20.7,-103.3],
    ['Havana','Cuba',23.1,-82.4], ['Santiago de Cuba','Cuba',20.0,-75.8],
    ['Santo Domingo','Dominican Republic',18.5,-69.9],
    ['Santiago','Dominican Republic',19.5,-70.7],
    ['Managua','Nicaragua',12.1,-86.3], ['Estelí','Nicaragua',13.1,-86.4],
    ['Tegucigalpa','Honduras',14.1,-87.2], ['Danlí','Honduras',14.0,-86.6],
    ['Guatemala City','Guatemala',14.6,-90.5], ['San José','Costa Rica',9.9,-84.1],
    ['Panama City','Panama',9.0,-79.5], ['Bogotá','Colombia',4.7,-74.1],
    ['Lima','Peru',-12.0,-77.0], ['Quito','Ecuador',-0.2,-78.5],
    ['São Paulo','Brazil',-23.5,-46.6], ['Rio de Janeiro','Brazil',-22.9,-43.2],
    ['Buenos Aires','Argentina',-34.6,-58.4], ['Santiago','Chile',-33.4,-70.7],
    ['London','United Kingdom',51.5,-0.1], ['Manchester','United Kingdom',53.5,-2.2],
    ['Edinburgh','United Kingdom',55.9,-3.2], ['Dublin','Ireland',53.3,-6.3],
    ['Paris','France',48.9,2.4], ['Madrid','Spain',40.4,-3.7],
    ['Barcelona','Spain',41.4,2.2], ['Lisbon','Portugal',38.7,-9.1],
    ['Rome','Italy',41.9,12.5], ['Milan','Italy',45.5,9.2],
    ['Berlin','Germany',52.5,13.4], ['Munich','Germany',48.1,11.6],
    ['Frankfurt','Germany',50.1,8.7], ['Zurich','Switzerland',47.4,8.5],
    ['Geneva','Switzerland',46.2,6.1], ['Vienna','Austria',48.2,16.4],
    ['Amsterdam','Netherlands',52.4,4.9], ['Brussels','Belgium',50.8,4.4],
    ['Copenhagen','Denmark',55.7,12.6], ['Stockholm','Sweden',59.3,18.1],
    ['Oslo','Norway',59.9,10.8], ['Helsinki','Finland',60.2,24.9],
    ['Warsaw','Poland',52.2,21.0], ['Prague','Czechia',50.1,14.4],
    ['Budapest','Hungary',47.5,19.0], ['Athens','Greece',38.0,23.7],
    ['Istanbul','Turkey',41.0,29.0], ['Moscow','Russia',55.8,37.6],
    ['Kyiv','Ukraine',50.5,30.5], ['Bucharest','Romania',44.4,26.1],
    ['Dubai','United Arab Emirates',25.2,55.3], ['Abu Dhabi','United Arab Emirates',24.5,54.4],
    ['Doha','Qatar',25.3,51.5], ['Riyadh','Saudi Arabia',24.7,46.7],
    ['Beirut','Lebanon',33.9,35.5], ['Tel Aviv','Israel',32.1,34.8],
    ['Cairo','Egypt',30.0,31.2], ['Casablanca','Morocco',33.6,-7.6],
    ['Lagos','Nigeria',6.5,3.4], ['Nairobi','Kenya',-1.3,36.8],
    ['Johannesburg','South Africa',-26.2,28.0], ['Cape Town','South Africa',-33.9,18.4],
    ['Mumbai','India',19.1,72.9], ['Delhi','India',28.6,77.2],
    ['Bangalore','India',13.0,77.6], ['Karachi','Pakistan',24.9,67.0],
    ['Bangkok','Thailand',13.8,100.5], ['Singapore','Singapore',1.35,103.8],
    ['Kuala Lumpur','Malaysia',3.1,101.7], ['Jakarta','Indonesia',-6.2,106.8],
    ['Manila','Philippines',14.6,121.0], ['Ho Chi Minh City','Vietnam',10.8,106.7],
    ['Hong Kong','Hong Kong',22.3,114.2], ['Shanghai','China',31.2,121.5],
    ['Beijing','China',39.9,116.4], ['Taipei','Taiwan',25.0,121.6],
    ['Seoul','South Korea',37.6,127.0], ['Tokyo','Japan',35.7,139.7],
    ['Osaka','Japan',34.7,135.5], ['Sydney','Australia',-33.9,151.2],
    ['Melbourne','Australia',-37.8,145.0], ['Brisbane','Australia',-27.5,153.0],
    ['Perth','Australia',-31.95,115.9], ['Auckland','New Zealand',-36.9,174.8],
  ];

  /* ══════════════════════════════════════════════════════════════
     3. UTILITIES
  ══════════════════════════════════════════════════════════════ */

  /* Every string that originated with a person goes through this before
     it touches innerHTML. Non-negotiable once the backend is live. */
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function elapsed(ms) {
    const s = Math.max(0, Math.floor((Date.now() - ms) / 1000));
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
    if (h) return `${h}:${String(m).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
    return `${m}:${String(s % 60).padStart(2, '0')}`;
  }

  function ago(ms) {
    const s = Math.floor((Date.now() - ms) / 1000);
    if (s < 60) return 'just now';
    if (s < 3600) return `${Math.floor(s / 60)}m ago`;
    if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
    if (s < 604800) return `${Math.floor(s / 86400)}d ago`;
    return new Date(ms).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }

  /* A Reddit name shown next to a handle. Verified and self-declared get
     visibly different treatment — same information, very different claim. */
  function redditChip(row) {
    const r = row && row.reddit;
    if (!r || !r.username) return '';
    const u = esc(r.username);
    return `<a class="lg-reddit-chip${r.verified ? ' verified' : ''}"
               href="https://www.reddit.com/user/${encodeURIComponent(r.username)}"
               target="_blank" rel="noopener noreferrer nofollow"
               onclick="event.stopPropagation()"
               title="${r.verified
                 ? `u/${u} — verified with Reddit`
                 : `u/${u} — self-declared, not verified`}"
            >${r.verified ? '<span class="lg-rc-tick">✓</span>' : ''}u/${u}</a>`;
  }

  /* How far through a cigar someone is, measured against that cigar's own
     expected smoking time. A Lancero at 40 minutes is barely started; a
     petit corona at 40 is nearly done — the library already knows which. */
  function burnState(sess) {
    const item = lookupItem(sess.itemType, sess.itemId);
    const expected = item && item.smokingTime;
    if (!expected) return null;
    const mins = (Date.now() - sess.startedAt) / 60000;
    const pct = Math.min(mins / expected, 1.35);
    const label =
      pct >= 1.05 ? 'past the nub'
      : pct >= 0.98 ? 'nubbing it'
      : pct >= 0.66 ? 'final third'
      : pct >= 0.33 ? 'second third'
      : 'first third';
    return { pct, shown: Math.min(pct, 1) * 100, label, expected, mins };
  }

  function burnBar(sess) {
    const b = burnState(sess);
    if (!b) return '';
    return `
      <div class="lg-burn" title="${Math.round(b.mins)} of about ${b.expected} minutes">
        <div class="lg-burn-track">
          <div class="lg-burn-fill${b.pct >= 0.98 ? ' done' : ''}" style="width:${b.shown.toFixed(1)}%"></div>
          <div class="lg-burn-ember" style="left:${b.shown.toFixed(1)}%"></div>
        </div>
        <span class="lg-burn-label">${b.label}</span>
      </div>`;
  }

  function flairOf(id) {
    return FLAIRS.find(f => f.id === id) || FLAIRS[4];
  }

  /* Accent-insensitive matching so "Padron" finds "Padrón". Falls back to a
     plain lowercase compare if app.js hasn't defined normText yet. */
  const nrm = s => (typeof normText === 'function'
    ? normText(s)
    : String(s || '').toLowerCase());

  /* data.js declares `const CIGARS`, which is script-scoped rather than a
     property of window — so these must be read as bare identifiers. */
  const cigars = () => (typeof CIGARS !== 'undefined' ? CIGARS : []);
  const pipes  = () => (typeof PIPE_TOBACCOS !== 'undefined' ? PIPE_TOBACCOS : []);

  /* Shared by the Spark Up picker and the composer's attach field. */
  function searchLibrary(q, cigarLimit, pipeLimit) {
    const term = nrm(q).trim();
    if (term.length < 2) return [];
    const hit = x => nrm(x.name).includes(term) || nrm(x.brand).includes(term);
    return cigars().filter(hit).slice(0, cigarLimit)
      .map(item => ({ type: 'cigar', item }))
      .concat(pipes().filter(hit).slice(0, pipeLimit)
        .map(item => ({ type: 'pipe', item })));
  }

  function pickRow(h) {
    return `<li><button type="button" data-type="${h.type}" data-id="${esc(h.item.id)}">
      <span class="lg-pick-kind">${h.type === 'pipe' ? '🪈' : '🚬'}</span>
      <span><strong>${esc(h.item.name)}</strong><em>${esc(h.item.brand)}</em></span>
    </button></li>`;
  }

  function lookupItem(type, id) {
    if (!id) return null;
    const pool = type === 'pipe' ? pipes() : cigars();
    return pool.find(x => x.id === id) || null;
  }

  /* Reddit-style hot ranking: score decayed by age, so a lively new
     thread can outrank a stale popular one. */
  function hotScore(p) {
    const order = Math.log10(Math.max(Math.abs(p.score), 1));
    const sign = p.score > 0 ? 1 : p.score < 0 ? -1 : 0;
    const hours = (Date.now() - p.createdAt) / 3600000;
    return sign * order - hours / 12;
  }

  function myVote(row) {
    return (me && row.voters && row.voters[me.id]) || 0;
  }

  const $ = id => document.getElementById(id);

  /* ══════════════════════════════════════════════════════════════
     4. SHELL
  ══════════════════════════════════════════════════════════════ */
  function renderShell() {
    const view = $('view-lounge');
    if (!view) return;
    view.innerHTML = `
      <div class="lg-hero">
        <div class="lg-hero-badge" id="lgModeBadge"></div>
        <h1>The <em>Lounge</em></h1>
        <p>Who's burning right now, and what they're saying about it.</p>
        <div class="lg-hero-actions">
          <button class="lg-spark-btn" id="lgSparkBtn">
            <span class="lg-spark-ember"></span>
            <span id="lgSparkLabel">Spark Up</span>
          </button>
          <button class="lg-ghost-btn" id="lgIdentityBtn">Your Handle</button>
        </div>
      </div>

      <section class="lg-map-panel">
        <div class="lg-map-head">
          <h2>Burning Now</h2>
          <span class="lg-live-count" id="lgLiveCount">0 lit</span>
        </div>
        <div class="lg-map" id="lgMap">
          ${buildWorldMap()}
          <div class="lg-map-dots" id="lgMapDots"></div>
          <div class="lg-map-empty" id="lgMapEmpty">
            <span class="lg-map-empty-ember"></span>
            <p>Nobody has shared a location yet.</p>
          </div>
        </div>
        <div class="lg-map-legend">
          <span class="lg-lg-item"><span class="lg-lg-ember"></span>Someone smoking</span>
          <span class="lg-lg-item"><span class="lg-lg-terroir"></span>Growing region</span>
          <span class="lg-lg-item"><span class="lg-lg-arc"></span>Leaf's journey</span>
          <span class="lg-lg-item"><span class="lg-lg-night"></span>Night side, right now</span>
        </div>
        <div class="lg-map-stats" id="lgMapStats"></div>
        <p class="lg-map-note">
          Location is optional and off by default. Shared positions are rounded
          to a ~55&nbsp;km grid — a region, never an address.
        </p>
        <div class="lg-strip" id="lgStrip"></div>
      </section>

      <section class="lg-popular" id="lgPopular"></section>

      <section class="lg-chat-panel">
        <div class="lg-chat-head">
          <h2>The Rail</h2>
          <span class="lg-chat-note">Live talk. Kept for a few hours, then gone.</span>
        </div>
        <div class="lg-chat-log" id="lgChatLog"></div>
        <form class="lg-chat-form" id="lgChatForm">
          <input class="lg-chat-input" id="lgChatInput" maxlength="400"
                 autocomplete="off" placeholder="Say something to the room…">
          <button class="lg-chat-send" type="submit" aria-label="Send">
            <svg viewBox="0 0 24 24" fill="none" width="17" height="17"><path d="M20 12L4 4l6 8-6 8 16-8z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>
          </button>
        </form>
      </section>

      <section class="lg-feed-wrap">
        <div class="lg-feed-head">
          <div class="lg-sorts" id="lgSorts">
            <button class="lg-sort active" data-sort="hot">Hot</button>
            <button class="lg-sort" data-sort="new">New</button>
            <button class="lg-sort" data-sort="top">Top</button>
          </div>
          <button class="lg-new-post-btn" id="lgNewPostBtn">＋ New Post</button>
        </div>
        <div class="lg-flairs" id="lgFlairs">
          <button class="lg-flair-pill active" data-flair="all">All</button>
          ${FLAIRS.map(f => `<button class="lg-flair-pill" data-flair="${f.id}"
            style="--fl:${f.color}">${f.label}</button>`).join('')}
        </div>
        <div class="lg-feed" id="lgFeed"></div>
      </section>
    `;

    $('lgSparkBtn').addEventListener('click', onSparkClick);
    $('lgIdentityBtn').addEventListener('click', () => openIdentity());
    $('lgNewPostBtn').addEventListener('click', () => requireMe(openComposer));

    $('lgSorts').addEventListener('click', e => {
      const b = e.target.closest('.lg-sort');
      if (!b) return;
      feedSort = b.dataset.sort;
      $('lgSorts').querySelectorAll('.lg-sort')
        .forEach(x => x.classList.toggle('active', x === b));
      renderFeed();
    });

    $('lgFlairs').addEventListener('click', e => {
      const b = e.target.closest('.lg-flair-pill');
      if (!b) return;
      feedFlair = b.dataset.flair;
      $('lgFlairs').querySelectorAll('.lg-flair-pill')
        .forEach(x => x.classList.toggle('active', x === b));
      renderFeed();
    });

    $('lgChatForm').addEventListener('submit', e => {
      e.preventDefault();
      requireMe(async () => {
        const input = $('lgChatInput');
        const body = input.value.trim();
        if (!body) return;
        input.value = '';
        try { await BE.sendChat(body); } catch (err) { console.error(err); }
        renderChat(true);
      });
    });

    // Any handle, anywhere, opens that member's profile.
    view.addEventListener('click', e => {
      const w = e.target.closest('.lg-who');
      if (w && w.dataset.who) { e.stopPropagation(); openProfile(w.dataset.who); }
    });

    renderModeBadge();
  }

  /* ══════════════════════════════════════════════════════════════
     WHAT THE ROOM SMOKES
     The smoke log doubles as a recommendation signal: what people here
     actually finish, rather than what gets talked about. Useful to a
     beginner in a way a rating never is.
  ══════════════════════════════════════════════════════════════ */
  async function renderPopular() {
    const el = $('lgPopular');
    if (!el || !BE.listSmokes) return;

    const smokes = await BE.listSmokes();
    if (smokes.length < 3) { el.innerHTML = ''; return; }

    const tally = {};
    smokes.forEach(sm => {
      if (!sm.itemId) return;
      const k = `${sm.itemType || 'cigar'}:${sm.itemId}`;
      tally[k] = tally[k] || { n: 0, people: new Set(), minutes: 0, type: sm.itemType, id: sm.itemId };
      tally[k].n++;
      tally[k].people.add(sm.memberId);
      tally[k].minutes += sm.minutes || 0;
    });

    const top = Object.values(tally)
      .map(t => ({ ...t, item: lookupItem(t.type, t.id) }))
      .filter(t => t.item)
      .sort((a, b) => b.people.size - a.people.size || b.n - a.n)
      .slice(0, 6);

    if (!top.length) { el.innerHTML = ''; return; }

    el.innerHTML = `
      <div class="lg-pop-head">
        <h2>What the Room Smokes</h2>
        <span class="lg-pop-note">Ranked by how many different people have actually finished one here.</span>
      </div>
      <div class="lg-pop-grid">
        ${top.map((t, i) => `
          <button class="lg-pop-card" data-open="${esc(t.type || 'cigar')}:${esc(t.id)}">
            <span class="lg-pop-rank">${i + 1}</span>
            ${t.item.image
              ? `<img src="${esc(t.item.image)}" alt="" loading="lazy" onerror="this.style.display='none'">`
              : `<span class="lg-pop-noimg">${t.type === 'pipe' ? '🪈' : '🚬'}</span>`}
            <span class="lg-pop-body">
              <span class="lg-pop-name">${esc(t.item.name)}</span>
              <span class="lg-pop-meta">${esc(t.item.brand)} · ${STRENGTH_LABELS[t.item.strength - 1] || '—'} · $${t.item.price.toFixed(2)}</span>
              <span class="lg-pop-count">${t.people.size} ${t.people.size === 1 ? 'person' : 'people'} · ${t.n} smoked · ${Math.round(t.minutes / 60)}h burned</span>
            </span>
          </button>`).join('')}
      </div>`;

    el.querySelectorAll('[data-open]').forEach(b => b.addEventListener('click', () => {
      const [ty, id] = b.dataset.open.split(':');
      openItem(ty, id);
    }));
  }

  /* ══════════════════════════════════════════════════════════════
     THE RAIL — synchronous chat
     The feed is for things worth keeping; this is for the room.
  ══════════════════════════════════════════════════════════════ */
  let chatAtBottom = true;

  async function renderChat(forceBottom) {
    const log = $('lgChatLog');
    if (!log) return;

    // Don't yank someone out of scrollback when a message arrives.
    const stick = forceBottom || chatAtBottom;
    const msgs = await BE.listChat();

    if (!msgs.length) {
      log.innerHTML = `<p class="lg-chat-empty">${BE.mode === 'solo'
        ? 'Nothing said yet. In solo mode the rail is just you — open a second tab and it works across both.'
        : 'Nothing said yet. Start it off.'}</p>`;
      return;
    }

    let lastWho = null, lastAt = 0;
    log.innerHTML = msgs.map(m => {
      const isMe = me && m.memberId === me.id;
      // Group consecutive messages from the same person within 4 minutes.
      const grouped = m.memberId === lastWho && (m.at - lastAt) < 240000;
      lastWho = m.memberId; lastAt = m.at;
      return `
        <div class="lg-msg${grouped ? ' grouped' : ''}${isMe ? ' is-me' : ''}">
          ${grouped ? '<span class="lg-msg-gutter"></span>' : `
            <button class="lg-msg-avatar lg-who" data-who="${esc(m.memberId)}"
                    aria-label="${esc(m.handle)}">${av(m.avatar, '')}</button>`}
          <div class="lg-msg-body">
            ${grouped ? '' : `<div class="lg-msg-head">
              <button class="lg-who lg-msg-who" data-who="${esc(m.memberId)}">${esc(m.handle)}</button>
              ${redditChip(m)}
              <span class="lg-msg-time">${new Date(m.at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</span>
            </div>`}
            <p class="lg-msg-text">${esc(m.body)}</p>
          </div>
        </div>`;
    }).join('');

    if (stick) log.scrollTop = log.scrollHeight;
  }

  /* ══════════════════════════════════════════════════════════════
     MEMBER PROFILE
     Everything shown is already public in the room; this just gathers
     one person's traces into one place.
  ══════════════════════════════════════════════════════════════ */
  async function openProfile(memberId) {
    const [sessions, posts, chat, smokes] = await Promise.all([
      BE.listPresence(), BE.listPosts(), BE.listChat(),
      BE.listSmokes ? BE.listSmokes(memberId) : [],
    ]);

    const theirs = posts.filter(p => p.memberId === memberId);
    const live = sessions.find(s => s.memberId === memberId);
    const said = chat.filter(m => m.memberId === memberId);
    const ident = live || theirs[0] || said[0] || smokes[0];
    if (!ident) return;

    const isMe = me && memberId === me.id;

    // Comments are stored per post, so gather theirs across the board.
    let wrote = 0, commentScore = 0;
    for (const p of posts) {
      const cs = await BE.listComments(p.id);
      cs.filter(c => c.memberId === memberId).forEach(c => {
        wrote++; commentScore += (c.score || 0);
      });
    }
    const postScore = theirs.reduce((a, p) => a + (p.score || 0), 0);

    const byFlair = {};
    theirs.forEach(p => { byFlair[p.flair] = (byFlair[p.flair] || 0) + 1; });
    const reviews = byFlair.review || 0;

    /* ── Smoke history ──────────────────────────────────────────
       Completed sessions this room actually witnessed. Posts with an
       attached cigar count toward taste, but never toward "smoked" —
       writing about one isn't smoking it.
    ───────────────────────────────────────────────────────────── */
    const minutes = smokes.reduce((a, s) => a + (s.minutes || 0), 0);
    const longest = smokes.reduce((a, s) => Math.max(a, s.minutes || 0), 0);

    const origins = {}, houses = {}, byCigar = {};
    const noteTaste = (it, n) => {
      if (!it) return;
      origins[it.origin] = (origins[it.origin] || 0) + n;
      houses[it.brand] = (houses[it.brand] || 0) + n;
    };
    smokes.forEach(s => {
      const it = lookupItem(s.itemType, s.itemId);
      noteTaste(it, 1);
      if (it) byCigar[it.id] = (byCigar[it.id] || 0) + 1;
    });
    if (live) noteTaste(lookupItem(live.itemType, live.itemId), 1);
    theirs.forEach(p => noteTaste(lookupItem(p.itemType, p.itemId), 1));

    const originList = Object.keys(origins).sort((a, b) => origins[b] - origins[a]);
    const houseList = Object.keys(houses).sort((a, b) => houses[b] - houses[a]);
    const topCigars = Object.keys(byCigar)
      .sort((a, b) => byCigar[b] - byCigar[a]).slice(0, 3)
      .map(id => ({ item: lookupItem('cigar', id) || lookupItem('pipe', id), n: byCigar[id] }))
      .filter(x => x.item);

    // Average strength of what they actually finish.
    let strSum = 0, strN = 0;
    smokes.forEach(s => {
      const it = lookupItem(s.itemType, s.itemId);
      if (it && typeof it.strength === 'number') { strSum += it.strength; strN++; }
    });
    const avgStrength = strN ? STRENGTH_LABELS[Math.round(strSum / strN) - 1] : null;

    // "First seen" beats a fake join date: the earliest trace of them here.
    const firstSeen = Math.min(
      ...[
        ...smokes.map(s => s.startedAt),
        ...theirs.map(p => p.createdAt),
        ...said.map(m => m.at),
        live ? live.startedAt : Infinity,
      ].filter(n => Number.isFinite(n))
    );

    const hrs = minutes / 60;
    const timeLabel = minutes < 60 ? `${minutes}m` : `${hrs.toFixed(hrs < 10 ? 1 : 0)}h`;

    $('loungeModalLabel').textContent = isMe ? 'You' : esc(ident.handle);
    $('loungeBody').innerHTML = `
      <div class="lg-profile">
        <header class="lg-prof-head">
          <span class="lg-prof-avatar">${av(ident.avatar, esc(ident.handle))}</span>
          <div>
            <h3>${esc(ident.handle)}${isMe ? ' <em>you</em>' : ''}</h3>
            <div class="lg-prof-sub">
              ${redditChip(ident)}
              ${live ? `<span class="lg-prof-live"><span class="lg-prof-dot"></span>lit right now</span>` : ''}
            </div>
          </div>
        </header>

        ${live ? (() => {
          const it = lookupItem(live.itemType, live.itemId);
          return `
            <section class="lg-prof-now">
              <span class="lg-prof-label">Burning now</span>
              <button class="lg-prof-item"${live.itemId ? ` data-open="${esc(live.itemType || 'cigar')}:${esc(live.itemId)}"` : ''}>
                ${it && it.image ? `<img src="${esc(it.image)}" alt="" onerror="this.style.display='none'">` : '<span class="lg-prof-noimg">🚬</span>'}
                <span>
                  <strong>${esc(live.itemName || (it && it.name) || '—')}</strong>
                  <em>${it ? esc(it.brand) + ' · ' : ''}lit ${elapsed(live.startedAt)}</em>
                </span>
              </button>
              ${burnBar(live)}
              ${live.loc ? `<p class="lg-prof-loc">${esc(live.loc.label)} · ${approxLocalTime(live.loc.lon)} local</p>` : ''}
              ${live.drink ? `<p class="lg-prof-loc">🥃 ${esc(live.drink)}</p>` : ''}
            </section>`;
        })() : ''}

        <span class="lg-prof-label">In the lounge</span>
        <div class="lg-prof-metrics">
          <div class="lg-pm"><span>${smokes.length}</span><em>cigar${smokes.length !== 1 ? 's' : ''} smoked</em></div>
          <div class="lg-pm"><span>${timeLabel}</span><em>on the ember</em></div>
          <div class="lg-pm"><span>${reviews}</span><em>review${reviews !== 1 ? 's' : ''}</em></div>
          <div class="lg-pm"><span>${theirs.length}</span><em>post${theirs.length !== 1 ? 's' : ''}</em></div>
          <div class="lg-pm"><span>${wrote}</span><em>comment${wrote !== 1 ? 's' : ''}</em></div>
          <div class="lg-pm"><span>${postScore + commentScore}</span><em>points</em></div>
          <div class="lg-pm"><span>${said.length}</span><em>on the rail</em></div>
          <div class="lg-pm"><span>${houseList.length || '—'}</span><em>house${houseList.length !== 1 ? 's' : ''}</em></div>
        </div>

        <p class="lg-prof-since">
          ${Number.isFinite(firstSeen) ? `First seen here ${ago(firstSeen)}.` : ''}
          ${longest ? ` Longest sit: ${longest} minutes.` : ''}
          ${avgStrength ? ` Tends toward <strong>${esc(avgStrength)}</strong>.` : ''}
        </p>

        ${theirs.length ? `
          <span class="lg-prof-label">What they post</span>
          <div class="lg-prof-flairs">
            ${FLAIRS.filter(f => byFlair[f.id]).map(f => `
              <span class="lg-prof-flair" style="--fl:${f.color}">
                ${f.label}<em>${byFlair[f.id]}</em>
              </span>`).join('')}
          </div>` : ''}

        ${topCigars.length ? `
          <span class="lg-prof-label">Goes back to</span>
          <div class="lg-prof-tops">
            ${topCigars.map(t => `
              <button class="lg-prof-top" data-open="cigar:${esc(t.item.id)}">
                ${t.item.image ? `<img src="${esc(t.item.image)}" alt="" loading="lazy" onerror="this.style.display='none'">` : '<span class="lg-prof-noimg">🚬</span>'}
                <span>
                  <strong>${esc(t.item.name)}</strong>
                  <em>${esc(t.item.brand)}${t.n > 1 ? ` · ${t.n} times` : ''}</em>
                </span>
              </button>`).join('')}
          </div>` : ''}

        ${originList.length ? `
          <span class="lg-prof-label">Origins</span>
          <div class="lg-prof-origins">
            ${originList.map(o => `<span class="lg-prof-stamp">${(typeof ORIGIN_FLAGS !== 'undefined' && ORIGIN_FLAGS[o]) || ''} ${esc(o)}<em>${origins[o]}</em></span>`).join('')}
          </div>` : ''}

        ${isMe && window.VPJournal ? (() => {
          const prof = window.VPJournal.profile();
          if (!prof) return '';
          return `
            <section class="lg-prof-private">
              <span class="lg-prof-label">Your journal <span class="lg-prof-only-you">only you see this</span></span>
              <div class="lg-prof-metrics">
                <div class="lg-pm"><span>${prof.total}</span><em>logged</em></div>
                <div class="lg-pm"><span>${prof.avgRating ? prof.avgRating.toFixed(1) : '—'}</span><em>your average</em></div>
                <div class="lg-pm"><span>${prof.originsList.length}</span><em>origins tried</em></div>
                <div class="lg-pm"><span>${prof.topFlavors[0] ? esc(prof.topFlavors[0].name) : '—'}</span><em>top note</em></div>
              </div>
              <button class="lg-prof-journal-btn" id="lgOpenJournal">Open your journal</button>
            </section>`;
        })() : ''}

        ${theirs.length ? `
          <section class="lg-prof-posts">
            <span class="lg-prof-label">Posts</span>
            ${theirs.slice(0, 8).map(p => `
              <button class="lg-prof-post" data-post="${esc(p.id)}">
                <span class="lg-post-flair" style="--fl:${flairOf(p.flair).color}">${flairOf(p.flair).label}</span>
                <span class="lg-prof-post-title">${esc(p.title)}</span>
                <span class="lg-prof-post-meta">${p.score} pt${p.score === 1 ? '' : 's'} · ${p.commentCount || 0} comment${p.commentCount === 1 ? '' : 's'} · ${ago(p.createdAt)}</span>
              </button>`).join('')}
          </section>` : `<p class="lg-prof-none">Hasn't posted yet.</p>`}
      </div>`;

    const body = $('loungeBody');
    body.querySelectorAll('[data-open]').forEach(b => b.addEventListener('click', () => {
      const [t, id] = b.dataset.open.split(':');
      closeLoungeModal();
      setTimeout(() => openItem(t, id), 60);
    }));
    const jb = document.getElementById('lgOpenJournal');
    if (jb) jb.addEventListener('click', () => {
      closeLoungeModal();
      setTimeout(() => window.VPJournal.open(), 80);
    });

    body.querySelectorAll('[data-post]').forEach(b => b.addEventListener('click', () => {
      closeLoungeModal();
      feedFlair = 'all';
      document.querySelectorAll('#lgFlairs .lg-flair-pill')
        .forEach(x => x.classList.toggle('active', x.dataset.flair === 'all'));
      renderFeed().then(() => {
        const el = document.querySelector(`.lg-post[data-post="${CSS.escape(b.dataset.post)}"]`);
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
          el.classList.add('lg-post-flash');
          setTimeout(() => el.classList.remove('lg-post-flash'), 1600);
        }
      });
    }));

    openLoungeModal();
  }

  function renderModeBadge() {
    const el = $('lgModeBadge');
    if (!el || !BE) return;
    if (BE.mode === 'live') {
      el.className = 'lg-hero-badge live';
      el.innerHTML = `<span class="lg-dot-live"></span> Live`;
      el.title = 'Connected to the lounge server — you can see everyone here.';
    } else {
      el.className = 'lg-hero-badge solo';
      el.innerHTML = `<span class="lg-dot-solo"></span> Solo Mode`;
      el.title = 'No lounge server connected yet. You are the only person here — ' +
                 'nothing is faked. Open a second tab to see live presence work.';
    }
  }

  /* ══════════════════════════════════════════════════════════════
     5. PRESENCE — map dots + session strip
  ══════════════════════════════════════════════════════════════ */
  async function renderPresence() {
    if (!$('lgMap')) return;
    const sessions = await BE.listPresence();

    $('lgLiveCount').textContent =
      sessions.length === 1 ? '1 lit' : `${sessions.length} lit`;

    // Map dots — only sessions that opted into sharing a location.
    const located = sessions.filter(s => s.loc && typeof s.loc.lat === 'number');

    // Two people in the same city would otherwise stack into one
    // unreadable blob, so co-located sessions collapse into one marker
    // that carries a count and lists everyone on hover.
    const clusters = [];
    located.forEach(s => {
      const key = `${Math.round(s.loc.lat / 3)}:${Math.round(s.loc.lon / 3)}`;
      let c = clusters.find(x => x.key === key);
      if (!c) {
        c = { key, lat: s.loc.lat, lon: s.loc.lon, sessions: [] };
        clusters.push(c);
      }
      c.sessions.push(s);
    });

    const dots = $('lgMapDots');
    dots.innerHTML = clusters.map(c => {
      const { left, top } = project(c.lat, c.lon);
      if (top < -2 || top > 102) return '';   // outside the visible latitude band
      const mine = me && c.sessions.some(s => s.memberId === me.id);
      const n = c.sessions.length;
      const rows = c.sessions.map(s => {
        const isMe = me && s.memberId === me.id;
        const item = lookupItem(s.itemType, s.itemId);
        return `<span class="lg-ec-row">
          <span class="lg-ec-head"><span class="lg-ec-av">${av(s.avatar, '')}</span>${esc(s.handle)}${isMe ? ' <em>(you)</em>' : ''}</span>
          ${redditChip(s)}
          <span class="lg-ec-item">${esc(s.itemName || (item && item.name) || 'Something good')}</span>
          <span class="lg-ec-meta">lit ${elapsed(s.startedAt)}${(() => {
            const b = burnState(s); return b ? ` · ${b.label}` : '';
          })()}</span>
        </span>`;
      }).join('');

      return `
        <button class="lg-ember${mine ? ' is-me' : ''}${n > 1 ? ' is-cluster' : ''}"
                style="left:${left}%;top:${top}%"
                data-cluster="${esc(c.key)}"
                aria-label="${n} smoking near ${esc(c.sessions[0].loc.label || 'here')}">
          <span class="lg-ember-glow"></span>
          <span class="lg-ember-core"></span>
          <span class="lg-ember-smoke" aria-hidden="true"></span>
          ${n > 1 ? `<span class="lg-ember-count">${n}</span>` : ''}
          <span class="lg-ember-card">
            ${rows}
            <span class="lg-ec-foot">${esc(c.sessions[0].loc.label || 'Somewhere')}
              · ${approxLocalTime(c.lon)} local</span>
          </span>
        </button>`;
    }).join('');

    $('lgMapEmpty').classList.toggle('hidden', located.length > 0);

    dots.querySelectorAll('.lg-ember').forEach(d => {
      d.addEventListener('click', () => {
        const c = clusters.find(x => x.key === d.dataset.cluster);
        const s = c && c.sessions.find(x => x.itemId);
        if (s) openItem(s.itemType, s.itemId);
      });
      d.addEventListener('mouseenter', () => highlightArcs(d.dataset.cluster, true));
      d.addEventListener('mouseleave', () => highlightArcs(d.dataset.cluster, false));
    });

    // Draw a line from each ember back to where its tobacco was grown —
    // the map's whole reason for existing, on a site about origin.
    const arcLayer = $('lgArcLayer');
    if (arcLayer) {
      arcLayer.innerHTML = clusters.flatMap(c =>
        c.sessions.map(s => {
          const item = lookupItem(s.itemType, s.itemId);
          const t = item && terroirFor(item.origin);
          if (!t) return '';
          const a = arcPath(t, { lat: c.lat, lon: c.lon });
          const one = shift =>
            `<path class="lg-arc" data-cluster="${esc(c.key)}"${shift ? ` transform="translate(${shift},0)"` : ''} d="${a.d}"/>`;
          let out = one(0);
          if (a.minX < 0)   out += one(360);    // continues in from the right
          if (a.maxX > 360) out += one(-360);   // continues in from the left
          return out;
        })
      ).join('');
    }

    renderTerroir();
    renderMapStats(sessions, clusters);

    // Strip — everyone who's lit, located or not.
    const strip = $('lgStrip');
    if (!sessions.length) {
      strip.innerHTML = `
        <div class="lg-strip-empty">
          <p>The lounge is quiet. <button class="lg-inline-btn" id="lgStripSpark">Spark one up</button> and you'll be the first ember on the map.</p>
        </div>`;
      const b = $('lgStripSpark');
      if (b) b.addEventListener('click', onSparkClick);
      return;
    }

    strip.innerHTML = sessions.map(s => {
      const item = lookupItem(s.itemType, s.itemId);
      const isMe = me && s.memberId === me.id;
      return `
        <article class="lg-sess-card${isMe ? ' is-me' : ''}"
                 ${s.itemId ? `data-item="${esc(s.itemType || 'cigar')}:${esc(s.itemId)}"` : ''}>
          <div class="lg-sess-top">
            <span class="lg-sess-avatar">${av(s.avatar, esc(s.handle))}</span>
            <div class="lg-sess-who">
              <button class="lg-sess-handle lg-who" data-who="${esc(s.memberId)}">${esc(s.handle)}${isMe ? ' <em>you</em>' : ''}</button>
              ${redditChip(s)}
              <span class="lg-sess-place">${s.loc ? esc(s.loc.label) : 'Location private'}</span>
            </div>
            <span class="lg-sess-timer" data-since="${s.startedAt}">${elapsed(s.startedAt)}</span>
          </div>
          <div class="lg-sess-item">
            ${item && item.image
              ? `<img src="${esc(item.image)}" alt="" loading="lazy" onerror="this.style.display='none'">`
              : `<span class="lg-sess-noimg">${s.itemType === 'pipe' ? '🪈' : '🚬'}</span>`}
            <div>
              <div class="lg-sess-item-name">${esc(s.itemName || (item && item.name) || '—')}</div>
              ${item ? `<div class="lg-sess-item-brand">${esc(item.brand)}</div>` : ''}
            </div>
          </div>
          ${burnBar(s)}
          ${s.drink ? `<div class="lg-sess-drink">🥃 ${esc(s.drink)}</div>` : ''}
          ${s.note ? `<div class="lg-sess-note">${esc(s.note)}</div>` : ''}
        </article>`;
    }).join('');

    strip.querySelectorAll('[data-item]').forEach(c => {
      c.addEventListener('click', e => {
        // The card's own listener runs before the delegated handle
        // listener on the view, so stopPropagation there is too late —
        // the card has to bow out of clicks aimed at something inside it.
        if (e.target.closest('.lg-who, a, button:not(.lg-sess-card)')) return;
        const [type, id] = c.dataset.item.split(':');
        openItem(type, id);
      });
    });
  }

  /* A reading of the room: what the map is actually showing right now. */
  function renderMapStats(sessions, clusters) {
    const el = $('lgMapStats');
    if (!el) return;
    if (!sessions.length) { el.innerHTML = ''; return; }

    const origins = {};
    let totalMinutes = 0;
    sessions.forEach(s => {
      const item = lookupItem(s.itemType, s.itemId);
      if (item) origins[item.origin] = (origins[item.origin] || 0) + 1;
      totalMinutes += (Date.now() - s.startedAt) / 60000;
    });

    const topOrigin = Object.keys(origins).sort((a, b) => origins[b] - origins[a])[0];
    const places = new Set(sessions.filter(s => s.loc).map(s => s.loc.label)).size;

    // How many of the lit sessions are on the dark side of the planet.
    const afterDark = sessions.filter(s => {
      if (!s.loc) return false;
      const h = approxLocalHour(s.loc.lon);
      return h >= 18 || h < 6;
    }).length;

    const stats = [
      places ? [places, places === 1 ? 'place' : 'places'] : null,
      topOrigin ? [topOrigin, 'most lit'] : null,
      [Math.round(totalMinutes) + 'm', 'burning'],
      afterDark ? [afterDark, afterDark === 1 ? 'after dark' : 'after dark'] : null,
    ].filter(Boolean);

    el.innerHTML = stats.map(([v, l]) =>
      `<span class="lg-ms"><strong>${esc(v)}</strong><em>${esc(l)}</em></span>`).join('');
  }

  function highlightArcs(key, on) {
    document.querySelectorAll('.lg-arc').forEach(a => {
      a.classList.toggle('lit', on && a.dataset.cluster === key);
      a.classList.toggle('dim', on && a.dataset.cluster !== key);
    });
  }

  function openItem(type, id) {
    if (type === 'pipe') {
      if (typeof switchView === 'function') switchView('pipe-tobacco');
      if (typeof openPTModal === 'function') openPTModal(id);
    } else {
      if (typeof switchView === 'function') switchView('library');
      if (typeof openModal === 'function') openModal(id);
    }
  }

  /* Live timers tick without re-rendering the whole strip. */
  function startTicker() {
    clearInterval(tickTimer);
    tickTimer = setInterval(() => {
      document.querySelectorAll('[data-since]').forEach(el => {
        el.textContent = elapsed(Number(el.dataset.since));
      });
      const bar = $('lgSessionBarTime');
      if (bar && mySession) bar.textContent = elapsed(mySession.startedAt);
    }, 1000);
  }

  /* ══════════════════════════════════════════════════════════════
     6. IDENTITY
  ══════════════════════════════════════════════════════════════ */
  function openIdentity(afterSave) {
    const cur = me || {};
    const body = $('loungeBody');
    $('loungeModalLabel').textContent = me ? 'Your Handle' : 'Join the Lounge';

    body.innerHTML = `
      <div class="lg-form">
        <p class="lg-form-intro">
          Pick a handle. No email, no password — your identity lives on this
          device${BE.mode === 'live' ? ' and is tied to an anonymous account' : ''}.
        </p>

        <label class="lg-label" for="lgHandle">Handle</label>
        <input class="lg-input" id="lgHandle" maxlength="24" autocomplete="off"
               placeholder="e.g. AshAndOak" value="${esc(cur.handle || '')}">

        <label class="lg-label">Avatar</label>
        <div class="lg-av-picker" id="lgAvPicker"></div>

        <div class="lg-reddit-block" id="lgRedditBlock"></div>

        <div class="lg-loc-block">
          <label class="lg-label">Location sharing</label>
          <p class="lg-loc-help">
            Off by default. If you turn it on, others see a rounded position —
            roughly a 55&nbsp;km cell — and the label below. Never your exact
            coordinates, never your address.
          </p>
          <div class="lg-loc-modes" id="lgLocModes">
            <button class="lg-loc-mode${(cur.locMode || 'off') === 'off' ? ' active' : ''}" data-mode="off" type="button">
              <strong>Don't share</strong><span>You appear in the list, not on the map</span>
            </button>
            <button class="lg-loc-mode${cur.locMode === 'city' ? ' active' : ''}" data-mode="city" type="button">
              <strong>Pick a city</strong><span>Choose from a list — no device access</span>
            </button>
            <button class="lg-loc-mode${cur.locMode === 'device' ? ' active' : ''}" data-mode="device" type="button">
              <strong>Use my location</strong><span>Browser location, rounded to a coarse grid</span>
            </button>
          </div>

          <div class="lg-city-pick hidden" id="lgCityPick">
            <input class="lg-input" id="lgCityInput" placeholder="Search cities…" autocomplete="off">
            <ul class="lg-city-list" id="lgCityList"></ul>
          </div>

          <div class="lg-loc-preview hidden" id="lgLocPreview">
            <span class="lg-loc-preview-dot"></span>
            <div>
              <strong id="lgLocPreviewLabel">—</strong>
              <span id="lgLocPreviewCoords"></span>
            </div>
            <button class="lg-loc-clear" id="lgLocClear" type="button">Clear</button>
          </div>
        </div>

        <div class="lg-form-actions">
          <button class="lg-primary-btn" id="lgSaveIdentity">${me ? 'Save' : 'Enter the Lounge'}</button>
        </div>
        <p class="lg-form-err hidden" id="lgIdentityErr"></p>
      </div>`;

    let draft = {
      locMode: cur.locMode || 'off',
      loc: cur.loc || null,
      avatar: cur.avatar || AVATARS[0],
      reddit: cur.reddit || null,
    };

    /* ── Reddit linking ──────────────────────────────────────────
       Two very different things share this panel, and the copy keeps
       them apart: a real OAuth link (verified, we asked Reddit) and a
       typed-in handle (self-declared, we did not).
    ─────────────────────────────────────────────────────────────── */
    function renderReddit() {
      const box = $('lgRedditBlock');
      const canVerify = window.LoungeReddit && window.LoungeReddit.canVerify;
      const r = draft.reddit;

      if (r) {
        box.innerHTML = `
          <label class="lg-label">Reddit</label>
          <div class="lg-reddit-linked${r.verified ? ' verified' : ''}">
            <span class="lg-reddit-mark">${r.verified ? '✓' : '?'}</span>
            <div>
              <strong>u/${esc(r.username)}</strong>
              <span>${r.verified
                ? 'Verified with Reddit'
                : 'Self-declared — not checked with Reddit'}</span>
            </div>
            <button class="lg-loc-clear" type="button" id="lgRedditUnlink">Remove</button>
          </div>
          ${!r.verified && canVerify
            ? `<button class="lg-reddit-btn" type="button" id="lgRedditVerify">Verify it with Reddit</button>`
            : ''}
          <p class="lg-form-err hidden" id="lgRedditErr"></p>`;
        $('lgRedditUnlink').addEventListener('click', () => {
          draft.reddit = null;
          renderReddit();
        });
        const vb = $('lgRedditVerify');
        if (vb) vb.addEventListener('click', doOAuth);
        return;
      }

      box.innerHTML = `
        <label class="lg-label">Reddit <span class="lg-opt">optional</span></label>
        ${canVerify ? `
          <p class="lg-reddit-help">
            Link your account and your Reddit name shows next to your handle with a
            verified mark. We ask Reddit for your username and nothing else — no
            posting, no reading your history, no lasting access.
          </p>
          <button class="lg-reddit-btn" type="button" id="lgRedditLink">
            <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><circle cx="12" cy="12" r="11" fill="currentColor" opacity=".18"/><path d="M17.6 12a1.5 1.5 0 0 0-2.5-1.1c-1-.7-2.3-1.1-3.8-1.1s-2.8.4-3.8 1.1A1.5 1.5 0 1 0 6 13.3c0 .2 0 .3 0 .5 0 2.2 2.6 3.9 5.8 3.9s5.8-1.7 5.8-3.9c0-.2 0-.3 0-.5.6-.2 1-.7 1-1.3z" fill="currentColor"/><circle cx="9.6" cy="13.4" r="1" fill="#120f0b"/><circle cx="14.4" cy="13.4" r="1" fill="#120f0b"/><path d="M9.5 15.6c.7.5 1.6.7 2.5.7s1.8-.2 2.5-.7" stroke="#120f0b" stroke-width="1" stroke-linecap="round" fill="none"/><path d="M15.4 9.3l.6-2.7 2.1.5" stroke="currentColor" stroke-width="1.2" fill="none" stroke-linecap="round"/></svg>
            Connect with Reddit
          </button>
          <details class="lg-reddit-manual">
            <summary>Or just type it in</summary>
            <div class="lg-reddit-manual-row">
              <input class="lg-input" id="lgRedditManual" maxlength="20" autocomplete="off" placeholder="u/yourname">
              <button class="lg-primary-btn slim" type="button" id="lgRedditManualSave">Add</button>
            </div>
            <p class="lg-reddit-help">This is shown as self-declared, without a verified mark.</p>
          </details>
        ` : `
          <p class="lg-reddit-help">
            Reddit verification isn't set up on this site, so a handle you enter here
            is <strong>self-declared</strong> — it shows without a verified mark and
            nobody should read it as proof of identity.
            ${BE.mode === 'solo' ? '' : ' See docs/lounge-backend.md to enable real linking.'}
          </p>
          <div class="lg-reddit-manual-row">
            <input class="lg-input" id="lgRedditManual" maxlength="20" autocomplete="off" placeholder="u/yourname">
            <button class="lg-primary-btn slim" type="button" id="lgRedditManualSave">Add</button>
          </div>
        `}
        <p class="lg-form-err hidden" id="lgRedditErr"></p>`;

      const lb = $('lgRedditLink');
      if (lb) lb.addEventListener('click', doOAuth);

      const ms = $('lgRedditManualSave');
      if (ms) ms.addEventListener('click', () => {
        const raw = $('lgRedditManual').value.trim().replace(/^\/?(u\/)?/i, '');
        const err = $('lgRedditErr');
        if (!/^[A-Za-z0-9_-]{3,20}$/.test(raw)) {
          err.textContent = 'Reddit usernames are 3–20 characters: letters, numbers, underscore or hyphen.';
          err.classList.remove('hidden');
          return;
        }
        draft.reddit = { username: raw, verified: false, linkedAt: Date.now() };
        renderReddit();
      });
    }

    function showRedditError(msg) {
      const err = $('lgRedditErr');
      if (!err) return;
      err.textContent = msg;
      err.classList.remove('hidden');
    }

    async function doOAuth() {
      $('lgRedditErr').classList.add('hidden');
      const btn = $('lgRedditLink') || $('lgRedditVerify');
      if (btn) { btn.disabled = true; btn.textContent = 'Waiting for Reddit…'; }
      try {
        const username = await window.LoungeReddit.link();
        draft.reddit = { username, verified: true, linkedAt: Date.now() };
        renderReddit();
      } catch (e) {
        // Re-render first to restore the button, THEN write the error —
        // the other order paints it onto an element that's about to be
        // replaced, which silently swallowed every failure.
        renderReddit();
        showRedditError(e.message);
      }
    }
    renderReddit();

    function syncLoc() {
      $('lgCityPick').classList.toggle('hidden', draft.locMode !== 'city');
      const hasLoc = draft.locMode !== 'off' && draft.loc;
      $('lgLocPreview').classList.toggle('hidden', !hasLoc);
      if (hasLoc) {
        $('lgLocPreviewLabel').textContent = draft.loc.label;
        $('lgLocPreviewCoords').textContent =
          `shown at ${draft.loc.lat.toFixed(1)}°, ${draft.loc.lon.toFixed(1)}° — this is what others see`;
      }
    }

    /* ── AVATAR PICKER ───────────────────────────────────────────
       Marks, emoji, or your own picture. The upload is processed
       entirely on this machine — cropped, scaled and re-encoded in a
       canvas — and never sent anywhere.
    ─────────────────────────────────────────────────────────────── */
    let avTab = (typeof VPAvatar !== 'undefined' && VPAvatar.isUpload(draft.avatar)) ? 'upload'
              : (typeof VPAvatar !== 'undefined' && VPAvatar.isMark(draft.avatar)) ? 'marks'
              : 'emoji';

    function renderAvPicker() {
      const box = $('lgAvPicker');
      if (!box) return;
      const marks = (typeof VPAvatar !== 'undefined' ? VPAvatar.MARK_IDS : []);
      const emoji = (typeof VPAvatar !== 'undefined' ? VPAvatar.EMOJI : AVATARS);

      box.innerHTML = `
        <div class="lg-av-current">
          <span class="lg-av-preview">${av(draft.avatar, 'Your avatar')}</span>
          <span class="lg-av-caption">${
            (typeof VPAvatar !== 'undefined' && VPAvatar.isUpload(draft.avatar))
              ? 'Your picture — stored on this device only'
              : 'This is how you\'ll appear in the room'}</span>
        </div>
        <div class="lg-av-tabs">
          ${[['marks','Marks'],['emoji','Emoji'],['upload','Upload']].map(([k,l]) =>
            `<button type="button" class="lg-av-tab${avTab===k?' active':''}" data-tab="${k}">${l}</button>`).join('')}
        </div>
        <div class="lg-av-body">
          ${avTab === 'marks' ? `
            <div class="lg-av-grid">
              ${marks.map(id => `<button type="button" class="lg-av-opt mark${draft.avatar===('mark:'+id)?' active':''}"
                data-a="mark:${id}" aria-label="${id}">${VPAvatar.MARKS[id]}</button>`).join('')}
            </div>` : ''}
          ${avTab === 'emoji' ? `
            <div class="lg-av-grid">
              ${emoji.map(e => `<button type="button" class="lg-av-opt${draft.avatar===e?' active':''}"
                data-a="${esc(e)}">${esc(e)}</button>`).join('')}
            </div>` : ''}
          ${avTab === 'upload' ? `
            <div class="lg-av-upload">
              <label class="lg-av-drop" for="lgAvFile">
                <strong>Choose a picture</strong>
                <span>Square-cropped and scaled to 160px in your browser. It is never uploaded anywhere.</span>
              </label>
              <input type="file" id="lgAvFile" accept="image/*" hidden>
              ${(typeof VPAvatar !== 'undefined' && VPAvatar.isUpload(draft.avatar))
                ? '<button type="button" class="lg-av-remove" id="lgAvRemove">Remove picture</button>' : ''}
              <p class="lg-form-err hidden" id="lgAvErr"></p>
            </div>` : ''}
        </div>`;

      box.querySelectorAll('.lg-av-tab').forEach(t =>
        t.addEventListener('click', () => { avTab = t.dataset.tab; renderAvPicker(); }));

      box.querySelectorAll('.lg-av-opt').forEach(o =>
        o.addEventListener('click', () => { draft.avatar = o.dataset.a; renderAvPicker(); }));

      const file = $('lgAvFile');
      if (file) file.addEventListener('change', async () => {
        const err = $('lgAvErr');
        err.classList.add('hidden');
        const drop = box.querySelector('.lg-av-drop strong');
        if (drop) drop.textContent = 'Processing…';
        try {
          draft.avatar = await VPAvatar.fromFile(file.files[0]);
          renderAvPicker();
        } catch (e) {
          renderAvPicker();
          const e2 = $('lgAvErr');
          if (e2) { e2.textContent = e.message; e2.classList.remove('hidden'); }
        }
      });

      const rm = $('lgAvRemove');
      if (rm) rm.addEventListener('click', () => {
        draft.avatar = AVATARS[0];
        avTab = 'emoji';
        renderAvPicker();
      });
    }
    renderAvPicker();

    body.querySelector('#lgLocModes').addEventListener('click', async e => {
      const b = e.target.closest('.lg-loc-mode');
      if (!b) return;
      body.querySelectorAll('.lg-loc-mode').forEach(x => x.classList.toggle('active', x === b));
      draft.locMode = b.dataset.mode;
      if (draft.locMode === 'off') draft.loc = null;
      if (draft.locMode === 'device') await requestDeviceLocation();
      syncLoc();
    });

    async function requestDeviceLocation() {
      const err = $('lgIdentityErr');
      if (!navigator.geolocation) {
        err.textContent = 'This browser has no location support — pick a city instead.';
        err.classList.remove('hidden');
        return;
      }
      err.classList.add('hidden');
      try {
        const pos = await new Promise((res, rej) =>
          navigator.geolocation.getCurrentPosition(res, rej, { timeout: 10000, maximumAge: 600000 }));
        // Rounded immediately — the precise fix is never stored or sent.
        const f = window.LoungeUtil.fuzzCoords(pos.coords.latitude, pos.coords.longitude);
        const near = nearestCity(f.lat, f.lon);
        draft.loc = { lat: f.lat, lon: f.lon, label: near ? `near ${near[0]}` : 'Approximate area' };
      } catch (e) {
        draft.locMode = 'off';
        draft.loc = null;
        body.querySelectorAll('.lg-loc-mode').forEach(x =>
          x.classList.toggle('active', x.dataset.mode === 'off'));
        err.textContent = 'Location permission denied — you can pick a city instead.';
        err.classList.remove('hidden');
      }
    }

    // City search
    const cityInput = $('lgCityInput');
    const cityList = $('lgCityList');
    function renderCities(q) {
      const term = (q || '').trim().toLowerCase();
      const hits = (term
        ? CITIES.filter(c => c[0].toLowerCase().includes(term) || c[1].toLowerCase().includes(term))
        : CITIES).slice(0, 40);
      cityList.innerHTML = hits.map((c, i) =>
        `<li><button type="button" data-i="${CITIES.indexOf(c)}">
          <strong>${esc(c[0])}</strong><span>${esc(c[1])}</span></button></li>`).join('')
        || '<li class="lg-city-none">No match</li>';
    }
    cityInput.addEventListener('input', () => renderCities(cityInput.value));
    cityList.addEventListener('click', e => {
      const b = e.target.closest('button[data-i]');
      if (!b) return;
      const c = CITIES[Number(b.dataset.i)];
      draft.loc = { lat: c[2], lon: c[3], label: `${c[0]}, ${c[1]}` };
      cityInput.value = c[0];
      cityList.innerHTML = '';
      syncLoc();
    });
    renderCities('');

    $('lgLocClear').addEventListener('click', () => {
      draft.loc = null;
      draft.locMode = 'off';
      body.querySelectorAll('.lg-loc-mode').forEach(x =>
        x.classList.toggle('active', x.dataset.mode === 'off'));
      syncLoc();
    });

    $('lgSaveIdentity').addEventListener('click', async () => {
      const handle = $('lgHandle').value.trim();
      const err = $('lgIdentityErr');
      if (handle.length < 2) {
        err.textContent = 'Pick a handle of at least 2 characters.';
        err.classList.remove('hidden');
        return;
      }
      me = await BE.saveMe({
        handle,
        avatar: draft.avatar,
        locMode: draft.locMode,
        loc: draft.locMode === 'off' ? null : draft.loc,
        reddit: draft.reddit,
      });
      closeLoungeModal();
      updateIdentityBtn();
      await refresh();
      if (typeof afterSave === 'function') afterSave();
    });

    syncLoc();
    openLoungeModal();
    setTimeout(() => $('lgHandle').focus(), 60);
  }

  function nearestCity(lat, lon) {
    let best = null, bestD = Infinity;
    CITIES.forEach(c => {
      const d = (c[2] - lat) ** 2 + (c[3] - lon) ** 2;
      if (d < bestD) { bestD = d; best = c; }
    });
    return bestD < 25 ? best : null;   // within ~5° or we don't claim a name
  }

  function updateIdentityBtn() {
    const b = $('lgIdentityBtn');
    if (!b) return;
    b.innerHTML = me
      ? `<span class="lg-inline-av">${av(me.avatar, '')}</span>${esc(me.handle)}`
      : 'Your Handle';
  }

  function requireMe(fn) {
    if (me) return fn();
    openIdentity(fn);
  }

  /* ══════════════════════════════════════════════════════════════
     7. SPARK UP — start a session
  ══════════════════════════════════════════════════════════════ */
  function onSparkClick() {
    if (mySession) return endSessionFlow();
    requireMe(openSparkModal);
  }

  function openSparkModal() {
    $('loungeModalLabel').textContent = 'Spark Up';
    const canShare = me.locMode !== 'off' && me.loc;
    $('loungeBody').innerHTML = `
      <div class="lg-form">
        <p class="lg-form-intro">What are you smoking? You'll show up as a live ember until you put it out.</p>

        <label class="lg-label" for="lgPickInput">Cigar or pipe blend</label>
        <div class="lg-picker">
          <input class="lg-input" id="lgPickInput" placeholder="Search the library…" autocomplete="off">
          <ul class="lg-pick-list" id="lgPickList"></ul>
        </div>
        <div class="lg-picked hidden" id="lgPicked"></div>

        <label class="lg-label" for="lgDrink">In your glass <span class="lg-opt">optional</span></label>
        <input class="lg-input" id="lgDrink" maxlength="40" placeholder="e.g. Lagavulin 16" autocomplete="off">

        <label class="lg-label" for="lgNote">A note <span class="lg-opt">optional</span></label>
        <input class="lg-input" id="lgNote" maxlength="90" placeholder="e.g. Back porch, first cool night of fall" autocomplete="off">

        <label class="lg-check">
          <input type="checkbox" id="lgShareLoc" ${canShare ? 'checked' : ''} ${canShare ? '' : 'disabled'}>
          <span>
            Show me on the map${canShare ? ` as <strong>${esc(me.loc.label)}</strong>` : ''}
            ${canShare ? '' : '<em>— set a location in Your Handle to enable</em>'}
          </span>
        </label>

        <div class="lg-form-actions">
          <button class="lg-primary-btn" id="lgStartSession" disabled>Light It</button>
        </div>
        <p class="lg-form-err hidden" id="lgSparkErr"></p>
      </div>`;

    let picked = null;
    const input = $('lgPickInput');
    const list = $('lgPickList');

    input.addEventListener('input', () => {
      list.innerHTML = searchLibrary(input.value, 8, 4).map(pickRow).join('');
    });

    list.addEventListener('click', e => {
      const b = e.target.closest('button[data-id]');
      if (!b) return;
      const item = lookupItem(b.dataset.type, b.dataset.id);
      if (!item) return;
      picked = { type: b.dataset.type, item };
      list.innerHTML = '';
      input.value = '';
      $('lgPicked').classList.remove('hidden');
      $('lgPicked').innerHTML = `
        <span class="lg-picked-kind">${picked.type === 'pipe' ? '🪈' : '🚬'}</span>
        <div><strong>${esc(item.name)}</strong><span>${esc(item.brand)}</span></div>
        <button class="lg-picked-clear" type="button" id="lgPickClear">✕</button>`;
      $('lgPickClear').addEventListener('click', () => {
        picked = null;
        $('lgPicked').classList.add('hidden');
        $('lgStartSession').disabled = true;
      });
      $('lgStartSession').disabled = false;
    });

    $('lgStartSession').addEventListener('click', async () => {
      if (!picked) return;
      const share = $('lgShareLoc').checked && me.loc;
      try {
        mySession = await BE.startSession({
          itemType: picked.type,
          itemId: picked.item.id,
          itemName: picked.item.name,
          drink: $('lgDrink').value.trim() || null,
          note: $('lgNote').value.trim() || null,
          loc: share ? me.loc : null,
        });
        closeLoungeModal();
        renderSessionBar();
        await refresh();
      } catch (e) {
        const err = $('lgSparkErr');
        err.textContent = e.message;
        err.classList.remove('hidden');
      }
    });

    openLoungeModal();
    setTimeout(() => input.focus(), 60);
  }

  async function endSessionFlow() {
    const sess = mySession;
    await BE.endSession();
    mySession = null;
    renderSessionBar();
    await refresh();

    // Offer to turn the finished session into a post while it's fresh.
    if (sess && sess.itemId) {
      const item = lookupItem(sess.itemType, sess.itemId);
      $('loungeModalLabel').textContent = 'Nub It';
      $('loungeBody').innerHTML = `
        <div class="lg-form lg-nub">
          <div class="lg-nub-icon">🔥</div>
          <h3>${esc(item ? item.name : sess.itemName)}</h3>
          <p class="lg-nub-time">${elapsed(sess.startedAt)} of smoke time</p>
          <p class="lg-form-intro">Want to write it up while it's fresh?</p>
          <div class="lg-form-actions">
            <button class="lg-primary-btn" id="lgNubReview">Post a Review</button>
            ${window.VPJournal ? `<button class="lg-ghost-btn" id="lgNubJournal">Log to Journal</button>` : ''}
            <button class="lg-ghost-btn" id="lgNubSkip">Not now</button>
          </div>
          ${window.VPJournal ? `<p class="lg-nub-hint">A post goes to the lounge; a journal entry stays on this device and feeds your palate profile.</p>` : ''}
        </div>`;
      $('lgNubSkip').addEventListener('click', closeLoungeModal);
      $('lgNubReview').addEventListener('click', () =>
        openComposer({ flair: 'review', itemType: sess.itemType, itemId: sess.itemId }));
      const jb = $('lgNubJournal');
      if (jb) jb.addEventListener('click', () => {
        closeLoungeModal();
        setTimeout(() => window.VPJournal.log(sess.itemType, sess.itemId), 80);
      });
      openLoungeModal();
    }
  }

  function renderSessionBar() {
    let bar = $('lgSessionBar');
    if (!mySession) {
      if (bar) bar.remove();
      const lbl = $('lgSparkLabel');
      if (lbl) lbl.textContent = 'Spark Up';
      const btn = $('lgSparkBtn');
      if (btn) btn.classList.remove('is-lit');
      return;
    }

    const lbl = $('lgSparkLabel');
    if (lbl) lbl.textContent = 'Put It Out';
    const btn = $('lgSparkBtn');
    if (btn) btn.classList.add('is-lit');

    if (!bar) {
      bar = document.createElement('div');
      bar.id = 'lgSessionBar';
      bar.className = 'lg-session-bar';
      document.body.appendChild(bar);
    }
    const item = lookupItem(mySession.itemType, mySession.itemId);
    bar.innerHTML = `
      <span class="lg-sb-ember"></span>
      <div class="lg-sb-text">
        <strong>${esc(item ? item.name : mySession.itemName)}</strong>
        <span id="lgSessionBarTime">${elapsed(mySession.startedAt)}</span>
      </div>
      <button class="lg-sb-end" id="lgSbEnd">Put it out</button>`;
    $('lgSbEnd').addEventListener('click', endSessionFlow);
  }

  /* ══════════════════════════════════════════════════════════════
     8. FEED
  ══════════════════════════════════════════════════════════════ */
  async function renderFeed() {
    const wrap = $('lgFeed');
    if (!wrap) return;

    let posts = await BE.listPosts();
    if (feedFlair !== 'all') posts = posts.filter(p => p.flair === feedFlair);

    if (feedSort === 'new') posts.sort((a, b) => b.createdAt - a.createdAt);
    else if (feedSort === 'top') posts.sort((a, b) => b.score - a.score);
    else posts.sort((a, b) => hotScore(b) - hotScore(a));

    if (!posts.length) {
      wrap.innerHTML = `
        <div class="lg-feed-empty">
          <div class="lg-feed-empty-icon">🗞</div>
          <h3>${feedFlair === 'all' ? 'Nothing on the board yet' : 'Nothing under this flair yet'}</h3>
          <p>${BE.mode === 'solo'
            ? 'You\'re in solo mode — posts you write are saved on this device only. Connect a lounge server to open the room to everyone.'
            : 'Be the first to say something.'}</p>
          <button class="lg-primary-btn" id="lgEmptyPost">Write the first post</button>
        </div>`;
      $('lgEmptyPost').addEventListener('click', () => requireMe(openComposer));
      return;
    }

    wrap.innerHTML = posts.map(renderPostRow).join('');
    bindFeedEvents(wrap);
  }

  function renderPostRow(p) {
    const fl = flairOf(p.flair);
    const item = lookupItem(p.itemType, p.itemId);
    const v = myVote(p);
    const mine = me && p.memberId === me.id;
    return `
      <article class="lg-post" data-post="${esc(p.id)}">
        <div class="lg-votes">
          <button class="lg-vote up${v === 1 ? ' on' : ''}" data-vote="1" data-post="${esc(p.id)}" aria-label="Upvote">▲</button>
          <span class="lg-score${v === 1 ? ' up' : v === -1 ? ' down' : ''}">${p.score}</span>
          <button class="lg-vote down${v === -1 ? ' on' : ''}" data-vote="-1" data-post="${esc(p.id)}" aria-label="Downvote">▼</button>
        </div>
        <div class="lg-post-main">
          <div class="lg-post-meta">
            <span class="lg-post-flair" style="--fl:${fl.color}">${fl.label}</span>
            <button class="lg-post-by lg-who" data-who="${esc(p.memberId)}"><span class="lg-inline-av">${av(p.avatar, '')}</span>${esc(p.handle)}</button>
            ${redditChip(p)}
            <span class="lg-post-time">${ago(p.createdAt)}</span>
          </div>
          <h3 class="lg-post-title">${esc(p.title)}</h3>
          ${p.body ? `<p class="lg-post-body">${esc(p.body)}</p>` : ''}
          ${item ? `
            <button class="lg-post-item" data-open-item="${esc(p.itemType || 'cigar')}:${esc(p.itemId)}">
              ${item.image
                ? `<img src="${esc(item.image)}" alt="" loading="lazy" onerror="this.style.display='none'">`
                : `<span class="lg-pi-noimg">${p.itemType === 'pipe' ? '🪈' : '🚬'}</span>`}
              <span>
                <strong>${esc(item.name)}</strong>
                <em>${esc(item.brand)} · ${esc(item.origin)} · ${item.rating} pts</em>
              </span>
            </button>` : ''}
          <div class="lg-post-actions">
            <button class="lg-post-act" data-comments="${esc(p.id)}">
              💬 ${p.commentCount || 0} ${p.commentCount === 1 ? 'comment' : 'comments'}
            </button>
            ${mine ? `<button class="lg-post-act danger" data-del="${esc(p.id)}">Delete</button>` : ''}
          </div>
          <div class="lg-thread hidden" data-thread="${esc(p.id)}"></div>
        </div>
      </article>`;
  }

  function bindFeedEvents(wrap) {
    wrap.querySelectorAll('.lg-vote').forEach(b => {
      b.addEventListener('click', () => requireMe(async () => {
        await BE.vote(b.dataset.post, Number(b.dataset.vote));
        renderFeed().then(() => { if (openPostId) reopenThread(); });
      }));
    });

    wrap.querySelectorAll('[data-open-item]').forEach(b => {
      b.addEventListener('click', e => {
        e.stopPropagation();
        const [type, id] = b.dataset.openItem.split(':');
        openItem(type, id);
      });
    });

    wrap.querySelectorAll('[data-comments]').forEach(b => {
      b.addEventListener('click', () => toggleThread(b.dataset.comments));
    });

    wrap.querySelectorAll('[data-del]').forEach(b => {
      b.addEventListener('click', async () => {
        if (!confirm('Delete this post and its comments?')) return;
        await BE.deletePost(b.dataset.del);
        if (openPostId === b.dataset.del) openPostId = null;
        renderFeed();
      });
    });

    if (openPostId) reopenThread();
  }

  function reopenThread() {
    const el = document.querySelector(`[data-thread="${CSS.escape(openPostId)}"]`);
    if (el) renderThread(openPostId, el);
  }

  function toggleThread(postId) {
    const el = document.querySelector(`[data-thread="${CSS.escape(postId)}"]`);
    if (!el) return;
    if (openPostId === postId) {
      openPostId = null;
      el.classList.add('hidden');
      el.innerHTML = '';
      return;
    }
    openPostId = postId;
    document.querySelectorAll('.lg-thread').forEach(t => {
      if (t !== el) { t.classList.add('hidden'); t.innerHTML = ''; }
    });
    renderThread(postId, el);
  }

  async function renderThread(postId, el) {
    const comments = await BE.listComments(postId);
    el.classList.remove('hidden');

    // Two levels: top-level comments and one tier of replies.
    const top = comments.filter(c => !c.parentId);
    const kids = c => comments.filter(k => k.parentId === c.id);

    const row = (c, isReply) => {
      const v = myVote(c);
      const mine = me && c.memberId === me.id;
      return `
        <div class="lg-comment${isReply ? ' is-reply' : ''}">
          <div class="lg-votes small">
            <button class="lg-vote up${v === 1 ? ' on' : ''}" data-cvote="1" data-cid="${esc(c.id)}" aria-label="Upvote">▲</button>
            <span class="lg-score${v === 1 ? ' up' : v === -1 ? ' down' : ''}">${c.score}</span>
            <button class="lg-vote down${v === -1 ? ' on' : ''}" data-cvote="-1" data-cid="${esc(c.id)}" aria-label="Downvote">▼</button>
          </div>
          <div class="lg-comment-main">
            <div class="lg-comment-meta">
              <button class="lg-who lg-comment-by" data-who="${esc(c.memberId)}"><span class="lg-inline-av">${av(c.avatar, '')}</span>${esc(c.handle)}</button>
              ${redditChip(c)}
              <span class="lg-post-time">${ago(c.createdAt)}</span>
            </div>
            <p>${esc(c.body)}</p>
            <div class="lg-comment-acts">
              ${!isReply ? `<button class="lg-post-act" data-reply="${esc(c.id)}">Reply</button>` : ''}
              ${mine ? `<button class="lg-post-act danger" data-cdel="${esc(c.id)}">Delete</button>` : ''}
            </div>
            <div class="lg-reply-box hidden" data-replybox="${esc(c.id)}"></div>
          </div>
        </div>`;
    };

    el.innerHTML = `
      <div class="lg-comment-form">
        <textarea class="lg-textarea" id="lgCommentInput-${esc(postId)}" rows="2"
                  maxlength="1200" placeholder="Add a comment…"></textarea>
        <button class="lg-primary-btn slim" data-addc="${esc(postId)}">Comment</button>
      </div>
      ${top.length
        ? top.map(c => row(c, false) + kids(c).map(k => row(k, true)).join('')).join('')
        : '<p class="lg-no-comments">No comments yet.</p>'}`;

    el.querySelector('[data-addc]').addEventListener('click', () => requireMe(async () => {
      const ta = $(`lgCommentInput-${postId}`);
      const body = ta.value.trim();
      if (!body) return;
      await BE.createComment(postId, body);
      await renderFeed();
    }));

    el.querySelectorAll('[data-cvote]').forEach(b => {
      b.addEventListener('click', () => requireMe(async () => {
        await BE.voteComment(b.dataset.cid, Number(b.dataset.cvote));
        await renderThread(postId, el);
      }));
    });

    el.querySelectorAll('[data-cdel]').forEach(b => {
      b.addEventListener('click', async () => {
        await BE.deleteComment(b.dataset.cdel);
        await renderFeed();
      });
    });

    el.querySelectorAll('[data-reply]').forEach(b => {
      b.addEventListener('click', () => requireMe(() => {
        const box = el.querySelector(`[data-replybox="${CSS.escape(b.dataset.reply)}"]`);
        if (!box.classList.contains('hidden')) {
          box.classList.add('hidden');
          box.innerHTML = '';
          return;
        }
        box.classList.remove('hidden');
        box.innerHTML = `
          <textarea class="lg-textarea" rows="2" maxlength="1200" placeholder="Reply…"></textarea>
          <button class="lg-primary-btn slim">Reply</button>`;
        const ta = box.querySelector('textarea');
        ta.focus();
        box.querySelector('button').addEventListener('click', async () => {
          const body = ta.value.trim();
          if (!body) return;
          await BE.createComment(postId, body, b.dataset.reply);
          await renderFeed();
        });
      }));
    });
  }

  /* ══════════════════════════════════════════════════════════════
     9. COMPOSER
  ══════════════════════════════════════════════════════════════ */
  function openComposer(prefill) {
    prefill = prefill || {};
    $('loungeModalLabel').textContent = 'New Post';

    // If lit right now, offer to attach what's burning.
    const attachDefault = prefill.itemId
      ? lookupItem(prefill.itemType, prefill.itemId)
      : (mySession ? lookupItem(mySession.itemType, mySession.itemId) : null);
    const attachType = prefill.itemId ? prefill.itemType : (mySession ? mySession.itemType : 'cigar');

    $('loungeBody').innerHTML = `
      <div class="lg-form">
        <label class="lg-label">Flair</label>
        <div class="lg-flairs compose" id="lgComposeFlairs">
          ${FLAIRS.map(f => `<button class="lg-flair-pill${(prefill.flair || 'talk') === f.id ? ' active' : ''}"
            data-flair="${f.id}" style="--fl:${f.color}" type="button">${f.label}</button>`).join('')}
        </div>

        <label class="lg-label" for="lgPostTitle">Title</label>
        <input class="lg-input" id="lgPostTitle" maxlength="140" autocomplete="off"
               placeholder="Say it in one line">

        <label class="lg-label" for="lgPostBody">Body <span class="lg-opt">optional</span></label>
        <textarea class="lg-textarea" id="lgPostBody" rows="6" maxlength="4000"
                  placeholder="Draw, burn, flavor progression, what you paired it with…"></textarea>

        <label class="lg-label">Attach a cigar or blend <span class="lg-opt">optional</span></label>
        <div class="lg-picker">
          <input class="lg-input" id="lgAttachInput" placeholder="Search the library…" autocomplete="off">
          <ul class="lg-pick-list" id="lgAttachList"></ul>
        </div>
        <div class="lg-picked${attachDefault ? '' : ' hidden'}" id="lgAttached"></div>

        <div class="lg-form-actions">
          <button class="lg-primary-btn" id="lgSubmitPost">Post</button>
        </div>
        <p class="lg-form-err hidden" id="lgPostErr"></p>
      </div>`;

    let flair = prefill.flair || 'talk';
    let attached = attachDefault ? { type: attachType, item: attachDefault } : null;

    function paintAttached() {
      const box = $('lgAttached');
      if (!attached) { box.classList.add('hidden'); box.innerHTML = ''; return; }
      box.classList.remove('hidden');
      box.innerHTML = `
        <span class="lg-picked-kind">${attached.type === 'pipe' ? '🪈' : '🚬'}</span>
        <div><strong>${esc(attached.item.name)}</strong><span>${esc(attached.item.brand)}</span></div>
        <button class="lg-picked-clear" type="button" id="lgAttachClear">✕</button>`;
      $('lgAttachClear').addEventListener('click', () => { attached = null; paintAttached(); });
    }
    paintAttached();

    $('lgComposeFlairs').addEventListener('click', e => {
      const b = e.target.closest('.lg-flair-pill');
      if (!b) return;
      flair = b.dataset.flair;
      $('lgComposeFlairs').querySelectorAll('.lg-flair-pill')
        .forEach(x => x.classList.toggle('active', x === b));
    });

    const ai = $('lgAttachInput'), al = $('lgAttachList');
    ai.addEventListener('input', () => {
      al.innerHTML = searchLibrary(ai.value, 8, 4).map(pickRow).join('');
    });
    al.addEventListener('click', e => {
      const b = e.target.closest('button[data-id]');
      if (!b) return;
      const item = lookupItem(b.dataset.type, b.dataset.id);
      if (!item) return;
      attached = { type: b.dataset.type, item };
      al.innerHTML = '';
      ai.value = '';
      paintAttached();
    });

    $('lgSubmitPost').addEventListener('click', async () => {
      const title = $('lgPostTitle').value.trim();
      const err = $('lgPostErr');
      if (title.length < 3) {
        err.textContent = 'Give it a title of at least 3 characters.';
        err.classList.remove('hidden');
        return;
      }
      try {
        await BE.createPost({
          flair,
          title,
          body: $('lgPostBody').value.trim(),
          itemType: attached ? attached.type : null,
          itemId: attached ? attached.item.id : null,
        });
        closeLoungeModal();
        // Jump the feed to where the new post actually is — otherwise an
        // active flair filter or a "Top" sort silently swallows it.
        feedSort = 'new';
        feedFlair = 'all';
        document.querySelectorAll('#lgSorts .lg-sort')
          .forEach(x => x.classList.toggle('active', x.dataset.sort === 'new'));
        document.querySelectorAll('#lgFlairs .lg-flair-pill')
          .forEach(x => x.classList.toggle('active', x.dataset.flair === 'all'));
        await renderFeed();
      } catch (e) {
        err.textContent = e.message;
        err.classList.remove('hidden');
      }
    });

    openLoungeModal();
    setTimeout(() => $('lgPostTitle').focus(), 60);
  }

  /* ══════════════════════════════════════════════════════════════
     10. MODAL PLUMBING
  ══════════════════════════════════════════════════════════════ */
  function openLoungeModal() {
    $('loungeOverlay').classList.remove('hidden');
    document.body.style.overflow = 'hidden';
  }
  function closeLoungeModal() {
    $('loungeOverlay').classList.add('hidden');
    document.body.style.overflow = '';
  }

  /* ══════════════════════════════════════════════════════════════
     11. INIT
  ══════════════════════════════════════════════════════════════ */
  async function refresh() {
    // Re-read identity so the header button follows any change to the
    // avatar or handle, wherever that change came from.
    me = await BE.getMe();
    updateIdentityBtn();
    await renderPresence();
    await renderFeed();
    await renderChat();
    await renderPopular();
    await renderUnread();
    updateNavBadge();
  }

  /* ── UNREAD ─────────────────────────────────────────────────────
     Two different signals, kept apart: chatter on the rail while you
     were away, and someone actually replying to you.
  ─────────────────────────────────────────────────────────────── */
  async function renderUnread() {
    if (!me) return;
    const seen = await BE.getSeen();

    const chat = await BE.listChat();
    const newChat = chat.filter(m => m.memberId !== me.id && m.at > (seen.chatAt || 0)).length;
    const head = document.querySelector('.lg-chat-head');
    let pill = document.getElementById('lgChatUnread');
    if (newChat > 0) {
      if (!pill && head) {
        pill = document.createElement('span');
        pill.id = 'lgChatUnread';
        pill.className = 'lg-unread-pill';
        head.appendChild(pill);
      }
      if (pill) pill.textContent = `${newChat} new`;
    } else if (pill) {
      pill.remove();
    }

    // Replies to your own posts, since you last opened the lounge.
    const posts = await BE.listPosts();
    const mine = posts.filter(p => p.memberId === me.id);
    let replies = 0;
    for (const p of mine) {
      const cs = await BE.listComments(p.id);
      const fresh = cs.filter(c => c.memberId !== me.id && c.createdAt > (seen.repliesAt || 0));
      if (fresh.length) {
        replies += fresh.length;
        const el = document.querySelector(`.lg-post[data-post="${CSS.escape(p.id)}"] [data-comments]`);
        if (el && !el.querySelector('.lg-reply-dot')) {
          const dot = document.createElement('span');
          dot.className = 'lg-reply-dot';
          dot.title = `${fresh.length} new repl${fresh.length === 1 ? 'y' : 'ies'}`;
          el.appendChild(dot);
        }
      }
    }

    const nav = document.getElementById('loungeReplyBadge');
    if (nav) {
      nav.textContent = replies;
      nav.classList.toggle('hidden', replies === 0);
    }
  }

  /* Opening the lounge is the act of catching up. */
  async function markCaughtUp() {
    if (!me) return;
    await BE.markSeen({ chatAt: Date.now(), repliesAt: Date.now() });
    const pill = document.getElementById('lgChatUnread');
    if (pill) pill.remove();
    document.querySelectorAll('.lg-reply-dot').forEach(d => d.remove());
    const nav = document.getElementById('loungeReplyBadge');
    if (nav) nav.classList.add('hidden');
  }

  async function updateNavBadge() {
    const badge = $('loungeNavBadge');
    if (!badge) return;
    const n = (await BE.listPresence()).length;
    badge.textContent = n;
    badge.classList.toggle('hidden', n === 0);
  }

  async function init() {
    BE = await window.LoungeReady;
    me = await BE.getMe();
    mySession = await BE.getMySession();

    renderShell();
    updateIdentityBtn();
    renderSessionBar();
    await refresh();
    startTicker();

    BE.on('presence', () => { renderPresence(); updateNavBadge(); });
    BE.on('posts', () => renderFeed());
    BE.on('chat', () => renderChat());

    // Track whether the reader is parked at the bottom of the rail, so an
    // incoming message never yanks them out of scrollback.
    const log = $('lgChatLog');
    if (log) {
      log.addEventListener('scroll', () => {
        chatAtBottom = log.scrollHeight - log.scrollTop - log.clientHeight < 40;
      });
    }

    // Catching up happens when the lounge is actually on screen.
    document.querySelectorAll('.nav-btn[data-view="lounge"]').forEach(b =>
      b.addEventListener('click', () => setTimeout(markCaughtUp, 400)));
    if (typeof state !== 'undefined' && state.currentView === 'lounge') markCaughtUp();

    $('loungeClose').addEventListener('click', closeLoungeModal);
    $('loungeOverlay').addEventListener('click', e => {
      if (e.target === $('loungeOverlay')) closeLoungeModal();
    });
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && !$('loungeOverlay').classList.contains('hidden')) {
        closeLoungeModal();
      }
    });

    // Keep the nav badge warm even when the lounge isn't the active view.
    setInterval(updateNavBadge, 20000);

    // The terminator moves ~0.25° of longitude a minute; redrawing every
    // two minutes keeps it honest without any visible cost.
    setInterval(refreshTerminator, 120000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  window.Lounge = { refresh, openIdentity, openComposer };
})();
