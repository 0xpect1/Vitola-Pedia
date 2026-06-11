/* ================================================================
   VITOLA PEDIA — Immersive Layer
   Ember trail · ambient smoke · scroll reveal · fireplace sound ·
   humidor · cigar of the day · surprise me · pairing explorer ·
   origin map · card tilt + sheen · burn line
   ================================================================ */

(function () {
  'use strict';

  const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const isCoarse = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;

  /* ══════════════════════════════════════════════════════════════
     1. EMBER CURSOR TRAIL
  ══════════════════════════════════════════════════════════════ */
  function initEmberTrail() {
    if (reduceMotion || isCoarse) return;

    const canvas = document.createElement('canvas');
    canvas.id = 'emberCanvas';
    document.body.appendChild(canvas);
    const ctx = canvas.getContext('2d');

    let w, h;
    const resize = () => {
      w = canvas.width = window.innerWidth;
      h = canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener('resize', resize);

    const particles = [];
    let lastSpawn = 0;

    window.addEventListener('pointermove', (e) => {
      const now = performance.now();
      if (now - lastSpawn < 28) return;     // throttle spawn rate
      lastSpawn = now;
      const count = 1 + (Math.random() < 0.3 ? 1 : 0);
      for (let i = 0; i < count; i++) {
        particles.push({
          x: e.clientX + (Math.random() - 0.5) * 6,
          y: e.clientY + (Math.random() - 0.5) * 6,
          vx: (Math.random() - 0.5) * 0.35,
          vy: -0.25 - Math.random() * 0.55,   // embers drift upward
          r: 1.2 + Math.random() * 2.2,
          life: 1,
          decay: 0.012 + Math.random() * 0.02,
          hue: 28 + Math.random() * 18,        // amber→gold
        });
      }
      if (particles.length > 90) particles.splice(0, particles.length - 90);
    }, { passive: true });

    function tick() {
      ctx.clearRect(0, 0, w, h);
      ctx.globalCompositeOperation = 'lighter';
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.x += p.vx;
        p.y += p.vy;
        p.vy -= 0.004;                        // gentle acceleration upward
        p.life -= p.decay;
        if (p.life <= 0) { particles.splice(i, 1); continue; }
        const alpha = p.life * 0.55;
        const r = p.r * (0.4 + p.life * 0.6);
        const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r * 3);
        g.addColorStop(0, `hsla(${p.hue}, 90%, 62%, ${alpha})`);
        g.addColorStop(0.5, `hsla(${p.hue}, 85%, 45%, ${alpha * 0.35})`);
        g.addColorStop(1, 'transparent');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(p.x, p.y, r * 3, 0, Math.PI * 2);
        ctx.fill();
      }
      requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }

  /* ══════════════════════════════════════════════════════════════
     2. SITE-WIDE SMOKE — pure CSS (.site-smoke in HTML), no JS

     3. SCROLL-REVEAL CARDS
  ══════════════════════════════════════════════════════════════ */
  let revealObserver = null;
  function initScrollReveal() {
    if (!('IntersectionObserver' in window) || reduceMotion) return;
    document.body.classList.add('js-reveal');
    revealObserver = new IntersectionObserver((entries) => {
      entries.forEach(en => {
        if (en.isIntersecting) {
          en.target.classList.add('in-view');
          revealObserver.unobserve(en.target);
        }
      });
    }, { rootMargin: '0px 0px -40px 0px', threshold: 0.05 });
  }

  function observeCards(grid) {
    if (!revealObserver) return;
    grid.querySelectorAll('.cigar-card:not(.in-view)').forEach(c => revealObserver.observe(c));
  }

  /* ══════════════════════════════════════════════════════════════
     4. AMBIENT FIREPLACE SOUND (Web Audio, synthesized — no files)
  ══════════════════════════════════════════════════════════════ */
  const fire = { ctx: null, master: null, crackleTimer: null, on: false };

  function fireStart() {
    if (!fire.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      fire.ctx = new AC();

      // Low rumble: looped brown noise through a lowpass
      const sr = fire.ctx.sampleRate;
      const buf = fire.ctx.createBuffer(1, sr * 2, sr);
      const d = buf.getChannelData(0);
      let last = 0;
      for (let i = 0; i < d.length; i++) {
        const white = Math.random() * 2 - 1;
        last = (last + 0.02 * white) / 1.02;
        d[i] = last * 3.2;
      }
      const src = fire.ctx.createBufferSource();
      src.buffer = buf;
      src.loop = true;
      const lp = fire.ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 320;
      fire.master = fire.ctx.createGain();
      fire.master.gain.value = 0;
      src.connect(lp);
      lp.connect(fire.master);
      fire.master.connect(fire.ctx.destination);
      src.start();

      // Crackle pops: short filtered noise bursts at random intervals
      const popBuf = fire.ctx.createBuffer(1, sr * 0.05, sr);
      const pd = popBuf.getChannelData(0);
      for (let i = 0; i < pd.length; i++) {
        pd[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / pd.length, 2);
      }
      fire._popBuf = popBuf;
    }
    fire.ctx.resume();
    fire.master.gain.cancelScheduledValues(fire.ctx.currentTime);
    fire.master.gain.linearRampToValueAtTime(0.16, fire.ctx.currentTime + 1.2);

    fire.crackleTimer = setInterval(() => {
      if (Math.random() > 0.55) return;
      const pop = fire.ctx.createBufferSource();
      pop.buffer = fire._popBuf;
      pop.playbackRate.value = 0.5 + Math.random() * 1.6;
      const bp = fire.ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 900 + Math.random() * 2400;
      bp.Q.value = 1.2;
      const g = fire.ctx.createGain();
      g.gain.value = 0.05 + Math.random() * 0.16;
      pop.connect(bp);
      bp.connect(g);
      g.connect(fire.ctx.destination);
      pop.start();
    }, 110);
    fire.on = true;
  }

  function fireStop() {
    if (fire.crackleTimer) { clearInterval(fire.crackleTimer); fire.crackleTimer = null; }
    if (fire.master && fire.ctx) {
      fire.master.gain.cancelScheduledValues(fire.ctx.currentTime);
      fire.master.gain.linearRampToValueAtTime(0, fire.ctx.currentTime + 0.6);
    }
    fire.on = false;
  }

  function initSound() {
    const btn = document.getElementById('soundToggle');
    if (!btn) return;
    btn.addEventListener('click', () => {
      if (fire.on) { fireStop(); btn.classList.remove('active'); btn.title = 'Fireplace ambience'; }
      else { fireStart(); btn.classList.add('active'); btn.title = 'Ambience on — click to mute'; }
    });
  }

  /* ══════════════════════════════════════════════════════════════
     5. HUMIDOR — saved collection in localStorage
  ══════════════════════════════════════════════════════════════ */
  const HUM_KEY = 'vp_humidor';
  const HEART_SVG = '<svg viewBox="0 0 24 24" fill="none"><path d="M12 21C12 21 4 13.9 4 8.9C4 6.2 6.2 4 8.9 4C10.2 4 11.4 4.6 12 5.5C12.6 4.6 13.8 4 15.1 4C17.8 4 20 6.2 20 8.9C20 13.9 12 21 12 21Z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" fill="currentColor" fill-opacity="0.15"/></svg>';

  function humLoad() {
    try {
      const raw = localStorage.getItem(HUM_KEY);
      const v = raw ? JSON.parse(raw) : null;
      return (v && Array.isArray(v.c) && Array.isArray(v.t)) ? v : { c: [], t: [] };
    } catch (e) { return { c: [], t: [] }; }
  }
  function humSave(v) {
    try { localStorage.setItem(HUM_KEY, JSON.stringify(v)); } catch (e) { /* private mode */ }
  }
  function humHas(type, id) { return humLoad()[type].includes(id); }
  function humToggle(type, id) {
    const v = humLoad();
    const i = v[type].indexOf(id);
    if (i >= 0) v[type].splice(i, 1); else v[type].push(id);
    humSave(v);
    humUpdateBadge();
    return i < 0;   // true if now saved
  }
  function humUpdateBadge() {
    const b = document.getElementById('humBadge');
    if (!b) return;
    const v = humLoad();
    const n = v.c.length + v.t.length;
    b.textContent = n;
    b.classList.toggle('hidden', n === 0);
  }

  function injectHearts(grid) {
    grid.querySelectorAll('.cigar-card').forEach(card => {
      if (card.querySelector('.card-heart-btn')) return;
      const isPT = !!card.dataset.ptId;
      const type = isPT ? 't' : 'c';
      const id = isPT ? card.dataset.ptId : card.dataset.id;
      if (!id) return;
      const btn = document.createElement('button');
      btn.className = 'card-heart-btn' + (humHas(type, id) ? ' saved' : '');
      btn.title = 'Save to my Humidor';
      btn.innerHTML = HEART_SVG;
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const saved = humToggle(type, id);
        btn.classList.toggle('saved', saved);
      });
      card.appendChild(btn);
    });
  }

  function renderHumidor() {
    const body = document.getElementById('humidorBody');
    if (!body) return;
    const v = humLoad();
    const cigars = v.c.map(id => CIGARS.find(c => c.id === id)).filter(Boolean);
    const tobaccos = v.t.map(id => PIPE_TOBACCOS.find(p => p.id === id)).filter(Boolean);

    if (!cigars.length && !tobaccos.length) {
      body.innerHTML = `
        <div class="hum-empty">
          <div class="he-icon">🤎</div>
          <h3>Your humidor is empty</h3>
          <p>Hover any cigar or pipe tobacco card and tap the heart to start your collection.<br/>It's saved on this device — no account needed.</p>
        </div>`;
      return;
    }

    const row = (item, type) => `
      <div class="quiz-result-card" data-hum-type="${type}" data-hum-id="${item.id}">
        <div class="qrc-info">
          <div class="qrc-name">${item.name}</div>
          <div class="qrc-brand">${item.brand} · ${item.origin} · $${item.price.toFixed(2)}</div>
        </div>
        <div class="qrc-rating">${item.rating}</div>
        <button class="hum-remove" title="Remove" data-rm-type="${type}" data-rm-id="${item.id}">✕</button>
      </div>`;

    body.innerHTML = `
      <h3 class="hum-title">My Humidor</h3>
      <p class="hum-sub">${cigars.length} cigar${cigars.length !== 1 ? 's' : ''} · ${tobaccos.length} pipe blend${tobaccos.length !== 1 ? 's' : ''} — saved on this device</p>
      ${cigars.length ? `<div class="pairing-section-label">Cigars</div>${cigars.map(c => row(c, 'c')).join('')}` : ''}
      ${tobaccos.length ? `<div class="pairing-section-label">Pipe Tobacco</div>${tobaccos.map(t => row(t, 't')).join('')}` : ''}
    `;

    body.querySelectorAll('.quiz-result-card').forEach(el => {
      el.addEventListener('click', (e) => {
        if (e.target.closest('.hum-remove')) return;
        closeHumidor();
        if (el.dataset.humType === 'c') openModal(el.dataset.humId);
        else { switchView('pipe-tobacco'); openPTModal(el.dataset.humId); }
      });
    });
    body.querySelectorAll('.hum-remove').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        humToggle(btn.dataset.rmType, btn.dataset.rmId);
        renderHumidor();
        // sync hearts on visible cards
        document.querySelectorAll('.card-heart-btn.saved').forEach(h => {
          const card = h.closest('.cigar-card');
          const isPT = !!card.dataset.ptId;
          const id = isPT ? card.dataset.ptId : card.dataset.id;
          if (!humHas(isPT ? 't' : 'c', id)) h.classList.remove('saved');
        });
      });
    });
  }

  function openHumidor() {
    renderHumidor();
    document.getElementById('humidorOverlay').classList.remove('hidden');
    document.body.style.overflow = 'hidden';
  }
  function closeHumidor() {
    document.getElementById('humidorOverlay').classList.add('hidden');
    document.body.style.overflow = '';
  }

  function initHumidor() {
    const btn = document.getElementById('humidorBtn');
    if (btn) btn.addEventListener('click', openHumidor);
    const close = document.getElementById('humidorClose');
    if (close) close.addEventListener('click', closeHumidor);
    const overlay = document.getElementById('humidorOverlay');
    if (overlay) overlay.addEventListener('click', e => { if (e.target === overlay) closeHumidor(); });
    humUpdateBadge();
  }

  /* ══════════════════════════════════════════════════════════════
     6. CIGAR OF THE DAY (date-seeded, same pick for everyone)
  ══════════════════════════════════════════════════════════════ */
  function initCOTD() {
    const banner = document.getElementById('cotdBanner');
    if (!banner || typeof CIGARS === 'undefined' || !CIGARS.length) return;

    const pool = CIGARS.filter(c => c.rating >= 93);
    const today = new Date();
    const seedStr = `${today.getFullYear()}${today.getMonth() + 1}${today.getDate()}`;
    let seed = 0;
    for (let i = 0; i < seedStr.length; i++) seed = (seed * 31 + seedStr.charCodeAt(i)) >>> 0;
    const pick = pool[seed % pool.length];
    if (!pick) return;

    const flag = (typeof ORIGIN_FLAGS !== 'undefined' && ORIGIN_FLAGS[pick.origin]) || '';
    banner.innerHTML = `
      <span class="cotd-flame">🔥</span>
      <span>
        <span class="cotd-label">Cigar of the Day</span>
        <span class="cotd-name">${pick.name}</span>
        <span class="cotd-meta">${pick.brand} · ${flag} ${pick.origin} · ${pick.rating} pts</span>
      </span>
      <span class="cotd-arrow">
        <svg viewBox="0 0 24 24" fill="none" width="18" height="18"><path d="M5 12h14M13 6l6 6-6 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
      </span>`;
    banner.classList.remove('hidden');
    banner.addEventListener('click', () => openModal(pick.id));
  }

  /* ══════════════════════════════════════════════════════════════
     7. SURPRISE ME — roulette
  ══════════════════════════════════════════════════════════════ */
  function initSurprise() {
    const btn = document.getElementById('surpriseBtn');
    if (!btn) return;
    btn.addEventListener('click', () => {
      const winner = CIGARS[Math.floor(Math.random() * CIGARS.length)];

      const overlay = document.createElement('div');
      overlay.className = 'roulette-overlay';
      overlay.innerHTML = `
        <div class="roulette-box">
          <div class="roulette-label">Spinning the humidor…</div>
          <div class="roulette-name" id="rouletteName"></div>
        </div>`;
      document.body.appendChild(overlay);
      const nameEl = overlay.querySelector('#rouletteName');

      let ticks = 0;
      const total = 16;
      const spin = () => {
        ticks++;
        const c = ticks >= total ? winner : CIGARS[Math.floor(Math.random() * CIGARS.length)];
        nameEl.textContent = c.name;
        if (ticks < total) {
          setTimeout(spin, 45 + ticks * ticks * 1.1);  // decelerate
        } else {
          nameEl.style.color = 'var(--gold-light)';
          setTimeout(() => {
            overlay.remove();
            openModal(winner.id);
          }, 650);
        }
      };
      spin();
    });
  }

  /* ══════════════════════════════════════════════════════════════
     8. PAIRING EXPLORER — "What's in your glass?"
  ══════════════════════════════════════════════════════════════ */
  const DRINKS = [
    { label: 'Bourbon',   emoji: '🥃', terms: ['bourbon'] },
    { label: 'Scotch',    emoji: '🥃', terms: ['scotch', 'single malt', 'islay'] },
    { label: 'Rum',       emoji: '🍹', terms: ['rum'] },
    { label: 'Coffee',    emoji: '☕', terms: ['coffee', 'espresso'] },
    { label: 'Red Wine',  emoji: '🍷', terms: ['red wine', 'wine', 'malbec', 'cabernet'] },
    { label: 'Port',      emoji: '🍷', terms: ['port'] },
    { label: 'Cognac',    emoji: '🥂', terms: ['cognac', 'brandy', 'armagnac'] },
    { label: 'Beer & Stout', emoji: '🍺', terms: ['beer', 'stout', 'porter', 'ale'] },
    { label: 'Tea',       emoji: '🍵', terms: ['tea'] },
  ];

  function pairingMatches(list, terms) {
    return list.filter(item =>
      (item.pairings || []).some(p => {
        const pl = p.toLowerCase();
        return terms.some(t => pl.includes(t));
      })
    ).sort((a, b) => b.rating - a.rating);
  }

  function renderPairingHome() {
    const body = document.getElementById('pairingBody');
    body.innerHTML = `
      <div class="pairing-intro">
        <h3>What's in Your Glass?</h3>
        <p>Pick your pour — we'll match it with cigars and pipe blends that love it.</p>
      </div>
      <div class="pairing-choices">
        ${DRINKS.map((d, i) => `
          <button class="pairing-choice" data-drink="${i}">
            <span class="pc-emoji">${d.emoji}</span>
            <span>${d.label}</span>
          </button>`).join('')}
      </div>`;
    body.querySelectorAll('.pairing-choice').forEach(btn => {
      btn.addEventListener('click', () => renderPairingResults(DRINKS[btn.dataset.drink]));
    });
  }

  function renderPairingResults(drink) {
    const body = document.getElementById('pairingBody');
    const cigars = pairingMatches(CIGARS, drink.terms).slice(0, 10);
    const tobaccos = pairingMatches(PIPE_TOBACCOS, drink.terms).slice(0, 5);

    const row = (item, type) => `
      <div class="quiz-result-card" data-pair-type="${type}" data-pair-id="${item.id}">
        <div class="qrc-info">
          <div class="qrc-name">${item.name}</div>
          <div class="qrc-brand">${item.brand} · ${item.origin} · $${item.price.toFixed(2)}</div>
        </div>
        <div class="qrc-rating">${item.rating}</div>
      </div>`;

    body.innerHTML = `
      <button class="pairing-back">← All drinks</button>
      <div class="pairing-intro">
        <h3>${drink.emoji} Perfect with ${drink.label}</h3>
        <p>${cigars.length + tobaccos.length} matches from the library</p>
      </div>
      ${cigars.length ? `<div class="pairing-section-label">Cigars</div>${cigars.map(c => row(c, 'c')).join('')}` : ''}
      ${tobaccos.length ? `<div class="pairing-section-label">Pipe Tobacco</div>${tobaccos.map(t => row(t, 't')).join('')}` : ''}
      ${!cigars.length && !tobaccos.length ? '<p style="color:var(--text-muted);text-align:center;padding:20px">No direct matches — try another pour.</p>' : ''}
    `;

    body.querySelector('.pairing-back').addEventListener('click', renderPairingHome);
    body.querySelectorAll('.quiz-result-card').forEach(el => {
      el.addEventListener('click', () => {
        closePairing();
        if (el.dataset.pairType === 'c') openModal(el.dataset.pairId);
        else { switchView('pipe-tobacco'); openPTModal(el.dataset.pairId); }
      });
    });
  }

  function openPairing() {
    renderPairingHome();
    document.getElementById('pairingOverlay').classList.remove('hidden');
    document.body.style.overflow = 'hidden';
  }
  function closePairing() {
    document.getElementById('pairingOverlay').classList.add('hidden');
    document.body.style.overflow = '';
  }

  function initPairing() {
    const btn = document.getElementById('pairingTriggerBtn');
    if (btn) btn.addEventListener('click', openPairing);
    const close = document.getElementById('pairingClose');
    if (close) close.addEventListener('click', closePairing);
    const overlay = document.getElementById('pairingOverlay');
    if (overlay) overlay.addEventListener('click', e => { if (e.target === overlay) closePairing(); });
  }

  /* ══════════════════════════════════════════════════════════════
     9. ORIGIN MAP — glowing dots over a graticule
  ══════════════════════════════════════════════════════════════ */
  const ORIGIN_COORDS = {
    'Cuba':               [21.5, -79.5],
    'Nicaragua':          [12.9, -85.2],
    'Dominican Republic': [18.8, -70.2],
    'Honduras':           [14.7, -86.6],
    'Guatemala':          [15.6, -90.4],
    'Ecuador':            [-1.5, -78.6],
    'Mexico':             [23.6, -102.5],
    'Costa Rica':         [9.9, -84.1],
    'Brazil':             [-10.0, -52.0],
    'Peru':               [-9.2, -75.0],
    'United States':      [37.0, -96.0],
    'USA':                [37.0, -96.0],
    'United Kingdom':     [53.0, -2.4],
    'Ireland':            [53.3, -7.7],
    'Scotland':           [56.8, -4.2],
    'Denmark':            [56.0, 9.6],
    'Germany':            [51.1, 10.4],
  };

  function initOriginMap() {
    const map = document.getElementById('originMap');
    if (!map) return;

    // Tally counts per origin across both libraries
    const counts = {};
    CIGARS.forEach(c => {
      counts[c.origin] = counts[c.origin] || { cigars: 0, blends: 0 };
      counts[c.origin].cigars++;
    });
    PIPE_TOBACCOS.forEach(p => {
      counts[p.origin] = counts[p.origin] || { cigars: 0, blends: 0 };
      counts[p.origin].blends++;
    });

    // Projection bounds (Atlantic view: Americas + Western Europe)
    const LON_MIN = -118, LON_MAX = 24, LAT_MIN = -18, LAT_MAX = 68;

    Object.keys(counts).forEach(origin => {
      const coords = ORIGIN_COORDS[origin];
      if (!coords) return;
      const [lat, lon] = coords;
      if (lon < LON_MIN || lon > LON_MAX || lat < LAT_MIN || lat > LAT_MAX) return;
      const left = ((lon - LON_MIN) / (LON_MAX - LON_MIN)) * 100;
      const top = ((LAT_MAX - lat) / (LAT_MAX - LAT_MIN)) * 100;

      const { cigars, blends } = counts[origin];
      const total = cigars + blends;
      const size = Math.max(9, Math.min(26, 8 + Math.log2(total + 1) * 3.2));

      const parts = [];
      if (cigars) parts.push(`${cigars} cigar${cigars !== 1 ? 's' : ''}`);
      if (blends) parts.push(`${blends} blend${blends !== 1 ? 's' : ''}`);

      const dot = document.createElement('button');
      dot.className = 'om-dot';
      dot.style.left = left + '%';
      dot.style.top = top + '%';
      dot.title = `${origin} — ${parts.join(' · ')}`;
      dot.innerHTML = `
        <span class="om-pulse" style="width:${size}px;height:${size}px"></span>
        <span class="om-label">${origin}</span>
        <span class="om-count">${parts.join(' · ')}</span>`;

      dot.addEventListener('click', () => {
        if (cigars > 0) {
          switchView('library');
          state.origin = origin;
          const pills = document.querySelectorAll('#originFilter .pill');
          pills.forEach(p => p.classList.toggle('active', p.dataset.value === origin));
          if (![...pills].some(p => p.dataset.value === origin)) {
            pills.forEach(p => p.classList.remove('active'));
          }
          render();
        } else {
          switchView('pipe-tobacco');
          const $s = document.getElementById('ptSearchInput');
          if ($s) { $s.value = origin; }
          ptState.search = origin;
          renderPT();
        }
      });

      map.appendChild(dot);
    });
  }

  /* ══════════════════════════════════════════════════════════════
     10. 3D TILT + GOLD SHEEN ON CARDS
  ══════════════════════════════════════════════════════════════ */
  function initTilt() {
    if (reduceMotion || isCoarse) return;
    document.body.classList.add('js-tilt');

    document.addEventListener('pointermove', (e) => {
      const card = e.target.closest && e.target.closest('.cigar-card');
      if (!card) return;
      const rect = card.getBoundingClientRect();
      const px = (e.clientX - rect.left) / rect.width;
      const py = (e.clientY - rect.top) / rect.height;
      const rx = (0.5 - py) * 5;     // subtle: max ±2.5°
      const ry = (px - 0.5) * 5;
      card.style.transform = `perspective(900px) rotateX(${rx}deg) rotateY(${ry}deg) translateY(-3px)`;
      card.style.setProperty('--mx', (px * 100) + '%');
      card.style.setProperty('--my', (py * 100) + '%');
    }, { passive: true });

    document.addEventListener('pointerout', (e) => {
      const card = e.target.closest && e.target.closest('.cigar-card');
      if (!card) return;
      if (e.relatedTarget && card.contains(e.relatedTarget)) return;
      card.style.transform = '';
    }, { passive: true });
  }

  function injectSheens(grid) {
    if (!document.body.classList.contains('js-tilt')) return;
    grid.querySelectorAll('.cigar-card').forEach(card => {
      if (card.querySelector('.card-sheen')) return;
      const sheen = document.createElement('div');
      sheen.className = 'card-sheen';
      card.appendChild(sheen);
    });
  }

  /* ══════════════════════════════════════════════════════════════
     11. BURN LINE — visual smoke-time gauge in the cigar modal
  ══════════════════════════════════════════════════════════════ */
  function buildBurnLine(cigar) {
    const MAX_MIN = 120;
    const frac = Math.max(0.12, Math.min(1, cigar.smokingTime / MAX_MIN));
    // Cigar body spans x=14..286 in a 300-wide viewBox. Ash length ∝ smoke time.
    const bodyStart = 14, bodyEnd = 286, bodyLen = bodyEnd - bodyStart;
    const ashLen = bodyLen * frac;
    const emberX = bodyEnd - ashLen;          // burn proceeds right→left
    const t = formatTime(cigar.smokingTime);

    return `
      <div class="burn-line">
        <div class="bl-head">
          <span class="bl-title">Burn Time</span>
          <span class="bl-time">${t} of slow smoke</span>
        </div>
        <svg class="bl-svg" viewBox="0 0 300 46" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <linearGradient id="blBody" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0" stop-color="#5a3c22"/>
              <stop offset="0.5" stop-color="#7a5232"/>
              <stop offset="1" stop-color="#4a3018"/>
            </linearGradient>
            <linearGradient id="blAsh" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0" stop-color="#8a8378"/>
              <stop offset="1" stop-color="#55504a"/>
            </linearGradient>
          </defs>
          <!-- rising smoke from the ember -->
          <path class="bl-smoke-path" d="M ${emberX} 16 C ${emberX - 4} 11, ${emberX + 5} 8, ${emberX} 3"
                stroke="rgba(201,168,76,0.45)" stroke-width="1.4" fill="none" stroke-linecap="round"/>
          <!-- unburned body (head side, left) -->
          <rect x="${bodyStart}" y="20" width="${Math.max(0, emberX - bodyStart)}" height="14" rx="7" fill="url(#blBody)"/>
          <!-- band -->
          <rect x="${bodyStart + 26}" y="20" width="9" height="14" rx="2" fill="#c9a84c" opacity="${emberX > bodyStart + 38 ? 0.9 : 0}"/>
          <!-- ash (foot side, right) -->
          <rect x="${emberX}" y="21" width="${ashLen}" height="12" rx="6" fill="url(#blAsh)" opacity="0.85"/>
          <!-- ember ring -->
          <rect class="bl-ember-dot" x="${emberX - 2.5}" y="19.5" width="5" height="15" rx="2.5" fill="#ff6b35"/>
          <!-- time ticks every 30 min -->
          ${[30, 60, 90].filter(m => m < MAX_MIN).map(m => {
            const x = bodyEnd - bodyLen * (m / MAX_MIN);
            return `<line x1="${x}" y1="36" x2="${x}" y2="40" stroke="rgba(201,168,76,0.35)" stroke-width="1"/>
                    <text x="${x}" y="45" font-size="5.5" fill="rgba(240,230,210,0.45)" text-anchor="middle">${m}m</text>`;
          }).join('')}
        </svg>
      </div>`;
  }

  function wrapModals() {
    // Wrap openModal: add burn line + humidor save button after the original renders.
    const origOpen = window.openModal;
    window.openModal = function (id) {
      origOpen(id);
      const cigar = CIGARS.find(c => c.id === id);
      if (!cigar) return;
      const body = document.getElementById('modalBody');
      const specs = body && body.querySelector('.modal-specs');
      if (specs) specs.insertAdjacentHTML('beforebegin', buildBurnLine(cigar));
      addModalHeart(body, 'c', id);
    };

    const origOpenPT = window.openPTModal;
    window.openPTModal = function (id) {
      origOpenPT(id);
      const pt = PIPE_TOBACCOS.find(p => p.id === id);
      if (!pt) return;
      addModalHeart(document.getElementById('modalBody'), 't', id);
    };
  }

  function addModalHeart(body, type, id) {
    if (!body) return;
    const header = body.querySelector('.modal-header');
    if (!header || header.querySelector('.modal-heart-btn')) return;
    const saved = humHas(type, id);
    const btn = document.createElement('button');
    btn.className = 'modal-heart-btn' + (saved ? ' saved' : '');
    btn.innerHTML = HEART_SVG + `<span>${saved ? 'In your Humidor' : 'Save to Humidor'}</span>`;
    btn.addEventListener('click', () => {
      const nowSaved = humToggle(type, id);
      btn.classList.toggle('saved', nowSaved);
      btn.querySelector('span').textContent = nowSaved ? 'In your Humidor' : 'Save to Humidor';
      // sync grid hearts
      document.querySelectorAll(`.cigar-card[data-${type === 't' ? 'pt-id' : 'id'}="${id}"] .card-heart-btn`)
        .forEach(h => h.classList.toggle('saved', nowSaved));
    });
    header.appendChild(btn);
  }

  /* ══════════════════════════════════════════════════════════════
     HOOK — app.js calls VP.onGridRender(grid) after every render
  ══════════════════════════════════════════════════════════════ */
  window.VP = {
    onGridRender(grid) {
      observeCards(grid);
      injectHearts(grid);
      injectSheens(grid);
    }
  };

  /* ══════════════════════════════════════════════════════════════
     BOOT
  ══════════════════════════════════════════════════════════════ */
  document.addEventListener('DOMContentLoaded', () => {
    initEmberTrail();
    initScrollReveal();
    initSound();
    initHumidor();
    initSurprise();
    initPairing();
    initTilt();
    wrapModals();
    // Wait one tick so app.js's deferred init() has populated everything
    setTimeout(() => {
      initCOTD();
      initOriginMap();
      // process any grid already rendered before our hook existed
      const g1 = document.getElementById('cigarsGrid');
      const g2 = document.getElementById('ptGrid');
      if (g1) VP.onGridRender(g1);
      if (g2) VP.onGridRender(g2);
    }, 60);
  });
})();
