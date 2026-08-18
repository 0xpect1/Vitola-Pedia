/* ══════════════════════════════════════════════════════════════════
   VITOLA PEDIA — SMOKE JOURNAL & PALATE PROFILE
   The humidor was a bookmark list: you saved a cigar and nothing else
   happened. This adds the other half — what you actually smoked, what
   you thought of it, and what that says about your palate.

   Everything is local to the browser (localStorage). Nothing is sent
   anywhere; the lounge only ever sees what you explicitly post.
   ══════════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  const KEY = 'vp_journal';
  const cigars = () => (typeof CIGARS !== 'undefined' ? CIGARS : []);
  const pipes  = () => (typeof PIPE_TOBACCOS !== 'undefined' ? PIPE_TOBACCOS : []);

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  const STRENGTH_LABEL = ['Mild', 'Mild–Med', 'Medium', 'Med–Full', 'Full'];
  let tab = 'journal';

  /* ── STORE ──────────────────────────────────────────────────── */
  function load() {
    try { return JSON.parse(localStorage.getItem(KEY)) || []; }
    catch (e) { return []; }
  }
  function save(list) {
    try { localStorage.setItem(KEY, JSON.stringify(list)); } catch (e) {}
  }
  const uid = () => 'j' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

  function addEntry(e) {
    const list = load();
    list.unshift(Object.assign({ id: uid(), createdAt: Date.now() }, e));
    save(list);
    updateBadge();
    return list[0];
  }
  function updateEntry(id, patch) {
    const list = load();
    const e = list.find(x => x.id === id);
    if (e) { Object.assign(e, patch); save(list); }
    return e;
  }
  function removeEntry(id) {
    save(load().filter(x => x.id !== id));
    updateBadge();
  }

  function lookup(type, id) {
    return (type === 'pipe' ? pipes() : cigars()).find(x => x.id === id) || null;
  }

  const today = () => new Date().toISOString().slice(0, 10);

  function fmtDate(d) {
    if (!d) return '';
    const dt = new Date(d + 'T12:00:00');
    if (isNaN(dt)) return d;
    return dt.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  }

  /* ══════════════════════════════════════════════════════════════
     PALATE PROFILE — derived entirely from what you rated
  ══════════════════════════════════════════════════════════════ */
  function profile() {
    const entries = load();
    const resolved = entries
      .map(e => ({ e, item: lookup(e.type, e.itemId) }))
      .filter(x => x.item);

    if (!resolved.length) return null;

    // Flavour affinity is weighted by your own score, so notes from a
    // cigar you rated 95 count for more than one you rated 60.
    const flavorScore = {};
    const flavorCount = {};
    let strengthSum = 0, strengthW = 0;
    const origins = {}, wrappers = {}, brands = {};
    let minutes = 0, ratingSum = 0, rated = 0, spend = 0;

    resolved.forEach(({ e, item }) => {
      const r = typeof e.rating === 'number' ? e.rating : null;
      const w = r == null ? 1 : Math.max(0.1, (r - 55) / 45);   // 55→~0, 100→1

      (item.flavors || []).forEach(f => {
        flavorScore[f] = (flavorScore[f] || 0) + w;
        flavorCount[f] = (flavorCount[f] || 0) + 1;
      });

      if (typeof item.strength === 'number') { strengthSum += item.strength * w; strengthW += w; }
      origins[item.origin] = (origins[item.origin] || 0) + 1;
      if (item.wrapper) wrappers[item.wrapper] = (wrappers[item.wrapper] || 0) + 1;
      brands[item.brand] = (brands[item.brand] || 0) + 1;
      minutes += item.smokingTime || 0;
      spend += item.price || 0;
      if (r != null) { ratingSum += r; rated++; }
    });

    const topFlavors = Object.keys(flavorScore)
      .sort((a, b) => flavorScore[b] - flavorScore[a])
      .map(f => ({ name: f, score: flavorScore[f], n: flavorCount[f] }));

    const byKey = o => Object.keys(o).sort((a, b) => o[b] - o[a]);

    // Do you rate a given origin above or below your own average?
    const originBias = {};
    Object.keys(origins).forEach(o => {
      const rs = resolved.filter(x => x.item.origin === o && typeof x.e.rating === 'number')
        .map(x => x.e.rating);
      if (rs.length >= 2) originBias[o] = rs.reduce((a, b) => a + b, 0) / rs.length;
    });

    const best = resolved.filter(x => typeof x.e.rating === 'number')
      .sort((a, b) => b.e.rating - a.e.rating)[0];

    return {
      entries: resolved,
      total: resolved.length,
      topFlavors,
      avgStrength: strengthW ? strengthSum / strengthW : null,
      origins, wrappers, brands,
      originsList: byKey(origins),
      wrappersList: byKey(wrappers),
      brandsList: byKey(brands),
      minutes,
      hours: minutes / 60,
      avgRating: rated ? ratingSum / rated : null,
      rated,
      spend,
      originBias,
      best,
    };
  }

  /* ══════════════════════════════════════════════════════════════
     LOG FORM
  ══════════════════════════════════════════════════════════════ */
  function openLogForm(type, itemId, existing) {
    const item = lookup(type, itemId);
    if (!item) return;
    const e = existing || {};

    const body = document.getElementById('journalBody');
    document.getElementById('journalTitle').textContent = existing ? 'Edit Entry' : 'Log a Smoke';

    body.innerHTML = `
      <div class="jn-form">
        <div class="jn-form-item">
          ${item.image ? `<img src="${esc(item.image)}" alt="" onerror="this.style.display='none'">`
                       : `<span class="jn-form-noimg">${type === 'pipe' ? '🪈' : '🚬'}</span>`}
          <div>
            <strong>${esc(item.name)}</strong>
            <span>${esc(item.brand)}${item.origin ? ' · ' + esc(item.origin) : ''}</span>
          </div>
        </div>

        <label class="jn-label">Your rating <span class="jn-opt">out of 100</span></label>
        <div class="jn-rating">
          <input type="range" id="jnRating" min="50" max="100" step="1"
                 value="${e.rating != null ? e.rating : 88}" class="jn-range">
          <output id="jnRatingOut" class="jn-rating-out">${e.rating != null ? e.rating : 88}</output>
        </div>
        <p class="jn-rating-hint" id="jnRatingHint"></p>

        <label class="jn-label" for="jnDate">Smoked on</label>
        <input class="jn-input" type="date" id="jnDate" value="${esc(e.smokedAt || today())}" max="${today()}">

        <label class="jn-label" for="jnDrink">Paired with <span class="jn-opt">optional</span></label>
        <input class="jn-input" id="jnDrink" maxlength="60" autocomplete="off"
               placeholder="e.g. Buffalo Trace, black coffee" value="${esc(e.drink || '')}">

        <label class="jn-label" for="jnPlace">Where <span class="jn-opt">optional</span></label>
        <input class="jn-input" id="jnPlace" maxlength="60" autocomplete="off"
               placeholder="e.g. Back porch" value="${esc(e.place || '')}">

        <label class="jn-label" for="jnNotes">Tasting notes <span class="jn-opt">optional</span></label>
        <textarea class="jn-textarea" id="jnNotes" rows="5" maxlength="2000"
                  placeholder="Draw, burn, how it changed through the thirds…">${esc(e.notes || '')}</textarea>

        <div class="jn-form-actions">
          <button class="jn-primary" id="jnSave">${existing ? 'Save changes' : 'Add to journal'}</button>
          <button class="jn-ghost" id="jnCancel">Cancel</button>
        </div>
      </div>`;

    const range = document.getElementById('jnRating');
    const out = document.getElementById('jnRatingOut');
    const hint = document.getElementById('jnRatingHint');
    function paint() {
      const v = Number(range.value);
      out.textContent = v;
      range.style.setProperty('--pct', ((v - 50) / 50 * 100) + '%');
      hint.textContent = v >= 95 ? 'Exceptional — one of the best you\'ve had'
        : v >= 90 ? 'Excellent — you\'d buy it again without thinking'
        : v >= 85 ? 'Very good — a solid, repeatable smoke'
        : v >= 78 ? 'Good — enjoyable, not memorable'
        : v >= 70 ? 'Fair — finished it, wouldn\'t rush back'
        : 'Poor — put it down early';
    }
    range.addEventListener('input', paint);
    paint();

    document.getElementById('jnCancel').addEventListener('click', () => {
      existing ? render() : closeJournal();
    });

    document.getElementById('jnSave').addEventListener('click', () => {
      const patch = {
        type, itemId,
        rating: Number(range.value),
        smokedAt: document.getElementById('jnDate').value || today(),
        drink: document.getElementById('jnDrink').value.trim(),
        place: document.getElementById('jnPlace').value.trim(),
        notes: document.getElementById('jnNotes').value.trim(),
      };
      if (existing) updateEntry(existing.id, patch);
      else addEntry(patch);
      if (window.VPAnalytics) VPAnalytics.journalLogged(patch.rating);
      tab = 'journal';
      render();
    });

    openJournal();
  }

  /* ══════════════════════════════════════════════════════════════
     RENDER
  ══════════════════════════════════════════════════════════════ */
  function render() {
    const body = document.getElementById('journalBody');
    if (!body) return;
    document.getElementById('journalTitle').textContent = 'Your Smoke Journal';

    const tabs = `
      <div class="jn-tabs">
        <button class="jn-tab${tab === 'journal' ? ' active' : ''}" data-tab="journal">Journal</button>
        <button class="jn-tab${tab === 'palate' ? ' active' : ''}" data-tab="palate">Palate Profile</button>
      </div>`;

    body.innerHTML = tabs + (tab === 'journal' ? renderJournal() : renderPalate());

    body.querySelectorAll('.jn-tab').forEach(b => {
      b.addEventListener('click', () => { tab = b.dataset.tab; render(); });
    });

    body.querySelectorAll('[data-edit]').forEach(b => b.addEventListener('click', () => {
      const e = load().find(x => x.id === b.dataset.edit);
      if (e) openLogForm(e.type, e.itemId, e);
    }));
    body.querySelectorAll('[data-del]').forEach(b => b.addEventListener('click', () => {
      if (!confirm('Delete this journal entry?')) return;
      removeEntry(b.dataset.del);
      render();
    }));
    body.querySelectorAll('[data-open]').forEach(b => b.addEventListener('click', () => {
      const [t, id] = b.dataset.open.split(':');
      closeJournal();
      setTimeout(() => {
        if (t === 'pipe') { switchView('pipe-tobacco'); openPTModal(id); }
        else openModal(id);
      }, 60);
    }));
  }

  function renderJournal() {
    const list = load();
    if (!list.length) {
      return `
        <div class="jn-empty">
          <div class="jn-empty-icon">📓</div>
          <h3>Nothing logged yet</h3>
          <p>Open any cigar and hit <strong>Log a Smoke</strong>. Once you've
             logged a few, the Palate Profile tab works out what you actually
             gravitate toward — and it's usually not what you'd guess.</p>
        </div>`;
    }

    return `<div class="jn-list">${list.map(e => {
      const item = lookup(e.type, e.itemId);
      if (!item) {
        return `<article class="jn-entry jn-orphan">
          <div class="jn-entry-main">
            <div class="jn-entry-name">Entry for a cigar no longer in the library</div>
            <div class="jn-entry-meta">${fmtDate(e.smokedAt)}</div>
            ${e.notes ? `<p class="jn-entry-notes">${esc(e.notes)}</p>` : ''}
          </div>
          <button class="jn-act danger" data-del="${esc(e.id)}">Delete</button>
        </article>`;
      }
      return `
        <article class="jn-entry">
          <button class="jn-entry-img" data-open="${esc(e.type)}:${esc(e.itemId)}" aria-label="Open ${esc(item.name)}">
            ${item.image ? `<img src="${esc(item.image)}" alt="" loading="lazy" onerror="this.style.display='none'">`
                         : `<span>${e.type === 'pipe' ? '🪈' : '🚬'}</span>`}
          </button>
          <div class="jn-entry-main">
            <div class="jn-entry-head">
              <button class="jn-entry-name" data-open="${esc(e.type)}:${esc(e.itemId)}">${esc(item.name)}</button>
              ${e.rating != null ? `<span class="jn-entry-score">${e.rating}</span>` : ''}
            </div>
            <div class="jn-entry-meta">
              ${esc(item.brand)} · ${fmtDate(e.smokedAt)}
              ${e.place ? ` · ${esc(e.place)}` : ''}
              ${e.drink ? ` · 🥃 ${esc(e.drink)}` : ''}
            </div>
            ${e.notes ? `<p class="jn-entry-notes">${esc(e.notes)}</p>` : ''}
            <div class="jn-entry-acts">
              <button class="jn-act" data-edit="${esc(e.id)}">Edit</button>
              <button class="jn-act danger" data-del="${esc(e.id)}">Delete</button>
            </div>
          </div>
        </article>`;
    }).join('')}</div>`;
  }

  function renderPalate() {
    const p = profile();
    if (!p) {
      return `
        <div class="jn-empty">
          <div class="jn-empty-icon">🌿</div>
          <h3>Your palate takes a few smokes to read</h3>
          <p>Log three or four and this fills in: the notes you keep coming
             back to, the body you actually prefer, and which origins you
             score higher than your own average.</p>
        </div>`;
    }

    const thin = p.total < 4;
    const wheel = (typeof buildFlavorWheel === 'function' && p.topFlavors.length)
      ? buildFlavorWheel(p.topFlavors.slice(0, 6).map(f => f.name))
      : '';

    const maxFlav = p.topFlavors[0] ? p.topFlavors[0].score : 1;
    const bias = Object.keys(p.originBias)
      .sort((a, b) => p.originBias[b] - p.originBias[a]);

    return `
      ${thin ? `<p class="jn-thin">Based on ${p.total} entr${p.total === 1 ? 'y' : 'ies'} — this
        will sharpen as you log more.</p>` : ''}

      <div class="jn-metrics">
        <div class="jm"><span class="jm-v">${p.total}</span><span class="jm-l">smokes logged</span></div>
        <div class="jm"><span class="jm-v">${p.avgRating ? p.avgRating.toFixed(1) : '—'}</span><span class="jm-l">your average score</span></div>
        <div class="jm"><span class="jm-v">${p.avgStrength ? STRENGTH_LABEL[Math.round(p.avgStrength) - 1] : '—'}</span><span class="jm-l">body you favour</span></div>
        <div class="jm"><span class="jm-v">${p.hours < 1 ? Math.round(p.minutes) + 'm' : p.hours.toFixed(0) + 'h'}</span><span class="jm-l">time spent smoking</span></div>
        <div class="jm"><span class="jm-v">${p.originsList.length}</span><span class="jm-l">origins tried</span></div>
        <div class="jm"><span class="jm-v">$${p.spend.toFixed(0)}</span><span class="jm-l">on sticks logged</span></div>
      </div>

      <div class="jn-panels">
        <section class="jn-panel">
          <h3>Your Flavour Signature</h3>
          <p class="jn-panel-sub">Weighted by how you scored each one — a note from a
            cigar you rated 95 counts for more than one you rated 65.</p>
          ${wheel ? `<div class="jn-wheel">${wheel}</div>` : ''}
          <div class="jn-flav-bars">
            ${p.topFlavors.slice(0, 8).map(f => `
              <div class="jfb-row">
                <span class="jfb-name">${esc(f.name)}</span>
                <span class="jfb-track"><span class="jfb-fill" style="width:${(f.score / maxFlav * 100).toFixed(1)}%"></span></span>
                <span class="jfb-n">${f.n}×</span>
              </div>`).join('')}
          </div>
        </section>

        <section class="jn-panel">
          <h3>Your Passport</h3>
          <p class="jn-panel-sub">Origins and wrappers you've actually smoked, not just saved.</p>
          <div class="jn-passport">
            ${p.originsList.map(o => `<span class="jn-stamp">
              ${(typeof ORIGIN_FLAGS !== 'undefined' && ORIGIN_FLAGS[o]) || ''} ${esc(o)}
              <em>${p.origins[o]}</em></span>`).join('')}
          </div>
          <h4 class="jn-sub-h">Wrappers</h4>
          <div class="jn-passport">
            ${p.wrappersList.slice(0, 8).map(w => `<span class="jn-stamp muted">${esc(w)} <em>${p.wrappers[w]}</em></span>`).join('')}
          </div>
          ${bias.length >= 2 ? `
            <h4 class="jn-sub-h">How you score by origin</h4>
            <div class="jn-bias">
              ${bias.map(o => {
                const v = p.originBias[o];
                const delta = p.avgRating ? v - p.avgRating : 0;
                return `<div class="jn-bias-row">
                  <span>${esc(o)}</span>
                  <span class="jn-bias-v ${delta >= 0 ? 'up' : 'down'}">
                    ${v.toFixed(1)} <em>${delta >= 0 ? '+' : ''}${delta.toFixed(1)}</em>
                  </span>
                </div>`;
              }).join('')}
            </div>
            <p class="jn-panel-sub" style="margin-top:10px">
              Compared with your own ${p.avgRating.toFixed(1)} average across everything logged.
            </p>` : ''}
        </section>
      </div>

      ${p.best ? `
        <section class="jn-panel jn-best">
          <h3>Your Highest Scored</h3>
          <button class="jn-best-card" data-open="${esc(p.best.e.type)}:${esc(p.best.e.itemId)}">
            ${p.best.item.image ? `<img src="${esc(p.best.item.image)}" alt="" onerror="this.style.display='none'">` : '<span class="jn-best-noimg">🚬</span>'}
            <span>
              <strong>${esc(p.best.item.name)}</strong>
              <em>${esc(p.best.item.brand)} · you gave it ${p.best.e.rating}</em>
              ${p.best.e.notes ? `<span class="jn-best-note">${esc(p.best.e.notes.slice(0, 160))}${p.best.e.notes.length > 160 ? '…' : ''}</span>` : ''}
            </span>
          </button>
        </section>` : ''}`;
  }

  /* ══════════════════════════════════════════════════════════════
     MODAL PLUMBING
  ══════════════════════════════════════════════════════════════ */
  function openJournal() {
    document.getElementById('journalOverlay').classList.remove('hidden');
    document.body.style.overflow = 'hidden';
  }
  function closeJournal() {
    document.getElementById('journalOverlay').classList.add('hidden');
    const otherOpen = [...document.querySelectorAll('.modal-overlay')]
      .some(o => o.id !== 'journalOverlay' && !o.classList.contains('hidden'));
    if (!otherOpen) document.body.style.overflow = '';
  }

  function updateBadge() {
    const b = document.getElementById('journalBadge');
    if (!b) return;
    const n = load().length;
    b.textContent = n;
    b.classList.toggle('hidden', n === 0);
  }

  /* ══════════════════════════════════════════════════════════════
     BOOT
  ══════════════════════════════════════════════════════════════ */
  function init() {
    // Modal
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay hidden';
    overlay.id = 'journalOverlay';
    overlay.innerHTML = `
      <div class="modal" role="dialog" aria-modal="true" aria-labelledby="journalTitle">
        <button class="modal-close" id="journalClose" aria-label="Close">
          <svg viewBox="0 0 24 24" fill="none"><path d="M18 6L6 18M6 6l12 12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
        </button>
        <div class="modal-body">
          <h2 class="jn-modal-title" id="journalTitle">Your Smoke Journal</h2>
          <div id="journalBody"></div>
        </div>
      </div>`;
    document.body.appendChild(overlay);

    document.getElementById('journalClose').addEventListener('click', closeJournal);
    overlay.addEventListener('click', e => { if (e.target === overlay) closeJournal(); });
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && !overlay.classList.contains('hidden')) closeJournal();
    });

    // Header button, next to the humidor heart
    const nav = document.querySelector('.header-nav');
    const humBtn = document.getElementById('humidorBtn');
    if (nav) {
      const btn = document.createElement('button');
      btn.className = 'nav-icon-btn';
      btn.id = 'journalBtn';
      btn.title = 'Your Smoke Journal';
      btn.setAttribute('aria-label', 'Your Smoke Journal');
      btn.innerHTML = `<svg viewBox="0 0 24 24" fill="none"><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H19a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H6.5A2.5 2.5 0 0 0 4 21V5.5z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><path d="M8 8h8M8 12h5" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg><span class="hum-badge hidden" id="journalBadge">0</span>`;
      btn.addEventListener('click', () => { tab = 'journal'; render(); openJournal(); });
      if (humBtn) nav.insertBefore(btn, humBtn);
      else nav.appendChild(btn);
    }
    updateBadge();

    // "Log a Smoke" in the cigar and pipe modals
    const origOpen = window.openModal;
    if (typeof origOpen === 'function') {
      window.openModal = function (id) {
        origOpen(id);
        addLogButton('cigar', id);
      };
    }
    const origPT = window.openPTModal;
    if (typeof origPT === 'function') {
      window.openPTModal = function (id) {
        origPT(id);
        addLogButton('pipe', id);
      };
    }
  }

  function addLogButton(type, id) {
    const body = document.getElementById('modalBody');
    const header = body && body.querySelector('.modal-header');
    if (!header || header.querySelector('.jn-log-btn')) return;

    const logged = load().filter(e => e.type === type && e.itemId === id);
    const btn = document.createElement('button');
    btn.className = 'jn-log-btn' + (logged.length ? ' logged' : '');
    btn.type = 'button';
    btn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" width="15" height="15">
        <path d="M12 20h9" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
        <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>
      </svg><span>${logged.length
        ? `Logged ${logged.length}×${logged[0].rating != null ? ` · you gave it ${logged[0].rating}` : ''}`
        : 'Log a Smoke'}</span>`;
    btn.addEventListener('click', () => openLogForm(type, id));
    header.appendChild(btn);
  }

  document.addEventListener('DOMContentLoaded', () => setTimeout(init, 160));

  window.VPJournal = {
    open: () => { tab = 'journal'; render(); openJournal(); },
    log: openLogForm,
    profile,
    entries: load,
  };
})();
