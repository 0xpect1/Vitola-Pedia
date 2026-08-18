/* ══════════════════════════════════════════════════════════════════
   VITOLA PEDIA — THE HOUSES
   138 brands existed only as an option in a filter dropdown. This gives
   each one a page: a crest, a founding year, its terroir, the shape of
   its whole range, and its flavour signature — all derived from the
   library, nothing hand-written.
   ══════════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  const cigars = () => (typeof CIGARS !== 'undefined' ? CIGARS : []);
  const nrm = s => (typeof normText === 'function' ? normText(s) : String(s || '').toLowerCase());

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  const slug = s => nrm(s).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

  let HOUSES = null;
  let sortMode = 'count';
  let query = '';
  let openBrand = null;

  const STRENGTH_LABEL = ['Mild', 'Mild–Med', 'Medium', 'Med–Full', 'Full'];

  /* ── AGGREGATE ──────────────────────────────────────────────── */
  function build() {
    const map = new Map();
    cigars().forEach(c => {
      if (!map.has(c.brand)) map.set(c.brand, []);
      map.get(c.brand).push(c);
    });

    const out = [];
    map.forEach((list, brand) => {
      const prices = list.map(c => c.price).sort((a, b) => a - b);
      const ratings = list.map(c => c.rating);
      const years = list.map(c => c.yearFounded).filter(Boolean);

      // Most common origin, not just the first one seen.
      const originCount = {};
      list.forEach(c => { originCount[c.origin] = (originCount[c.origin] || 0) + 1; });
      const origins = Object.keys(originCount).sort((a, b) => originCount[b] - originCount[a]);

      const flavorCount = {};
      list.forEach(c => (c.flavors || []).forEach(f => {
        flavorCount[f] = (flavorCount[f] || 0) + 1;
      }));
      const flavors = Object.keys(flavorCount)
        .sort((a, b) => flavorCount[b] - flavorCount[a])
        .map(f => ({ name: f, n: flavorCount[f] }));

      const strengths = list.map(c => c.strength);

      out.push({
        brand,
        slug: slug(brand),
        cigars: list,
        count: list.length,
        avgRating: ratings.reduce((a, b) => a + b, 0) / ratings.length,
        topRating: Math.max(...ratings),
        best: list.reduce((a, b) => (b.rating > a.rating ? b : a)),
        priceMin: prices[0],
        priceMax: prices[prices.length - 1],
        priceMed: prices[prices.length >> 1],
        origins,
        founded: years.length ? Math.min(...years) : null,
        strengthMin: Math.min(...strengths),
        strengthMax: Math.max(...strengths),
        flavors,
        limited: list.filter(c => c.limited).length,
      });
    });
    return out;
  }

  /* Two-letter monogram: initials of the first two significant words,
     so "Arturo Fuente" reads AF and "Padrón" reads PA. */
  function monogram(brand) {
    const words = brand.replace(/[^\p{L}\p{N} ]/gu, ' ').split(/\s+/)
      .filter(w => w && !/^(y|de|del|la|el|the|and|of|cigar|cigars|co)$/i.test(w));
    if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
    return brand.replace(/[^\p{L}\p{N}]/gu, '').slice(0, 2).toUpperCase();
  }

  /* The house's identity mark: a registered logo where one exists,
     otherwise a typeset monogram. `onerror` collapses a logo that fails
     to load back to the monogram rather than leaving a broken image. */
  function crest(h, size) {
    const logo = (typeof brandLogo === 'function') ? brandLogo(h.brand) : null;
    const cls = size === 'lg' ? 'house-hero-crest' : 'house-crest';
    const mono = `<span class="crest-mono">${esc(monogram(h.brand))}</span>`;
    if (!logo || !logo.src) return `<span class="${cls}">${mono}</span>`;
    const plate = logo.plate === 'dark' ? ' plate-dark' : ' plate-cream';
    return `<span class="${cls} has-logo${plate}">
      <img class="crest-logo" src="${esc(logo.src)}" alt="${esc(h.brand)} logo" loading="lazy"
           onerror="this.closest('.${cls}').classList.remove('has-logo','plate-dark','plate-cream');this.remove()">
      ${mono}
    </span>`;
  }

  const FLAG = b => (typeof ORIGIN_FLAGS !== 'undefined' && ORIGIN_FLAGS[b]) || '';

  /* ── HOUSE GRID ─────────────────────────────────────────────── */
  function filtered() {
    let list = HOUSES;
    if (query) {
      const q = nrm(query);
      list = list.filter(h => nrm(h.brand).includes(q) ||
        h.origins.some(o => nrm(o).includes(q)) ||
        h.flavors.slice(0, 6).some(f => nrm(f.name).includes(q)));
    }
    const sorted = [...list];
    if (sortMode === 'az') sorted.sort((a, b) => a.brand.localeCompare(b.brand));
    else if (sortMode === 'rating') sorted.sort((a, b) => b.avgRating - a.avgRating || b.count - a.count);
    else if (sortMode === 'oldest') sorted.sort((a, b) => (a.founded || 9999) - (b.founded || 9999));
    else sorted.sort((a, b) => b.count - a.count || b.avgRating - a.avgRating);
    return sorted;
  }

  function houseCard(h) {
    return `
      <button class="house-card" data-house="${esc(h.slug)}">
        ${crest(h)}
        <span class="house-body">
          <span class="house-name">${esc(h.brand)}</span>
          <span class="house-sub">
            ${FLAG(h.origins[0])} ${esc(h.origins[0])}${h.founded ? ` · Est. ${h.founded}` : ''}
          </span>
          <span class="house-flavors">
            ${h.flavors.slice(0, 3).map(f => `<span class="house-flav">${esc(f.name)}</span>`).join('')}
          </span>
          <span class="house-stats">
            <span><strong>${h.count}</strong> cigar${h.count !== 1 ? 's' : ''}</span>
            <span><strong>${h.avgRating.toFixed(1)}</strong> avg</span>
            <span><strong>$${h.priceMin.toFixed(0)}–${h.priceMax.toFixed(0)}</strong></span>
          </span>
        </span>
      </button>`;
  }

  function renderGrid() {
    const wrap = document.getElementById('housesInner');
    if (!wrap) return;
    const list = filtered();

    wrap.innerHTML = `
      <div class="houses-hero">
        <h1>The <em>Houses</em></h1>
        <p>Every marque in the library — who they are, where they grow, and what they taste like.</p>
        <div class="houses-stats">
          <span><strong>${HOUSES.length}</strong> houses</span>
          <span><strong>${cigars().length.toLocaleString()}</strong> cigars</span>
          <span><strong>${new Set(HOUSES.flatMap(h => h.origins)).size}</strong> origins</span>
        </div>
      </div>
      <div class="houses-controls">
        <div class="houses-search">
          <svg viewBox="0 0 24 24" fill="none" width="16" height="16"><circle cx="11" cy="11" r="7" stroke="currentColor" stroke-width="1.8"/><path d="M16.5 16.5L21 21" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>
          <input id="housesSearch" type="text" placeholder="Search houses, origins, flavours…"
                 autocomplete="off" value="${esc(query)}">
        </div>
        <div class="houses-sorts">
          ${[['count','Most cigars'],['rating','Highest rated'],['oldest','Oldest'],['az','A–Z']]
            .map(([k, l]) => `<button class="houses-sort${sortMode === k ? ' active' : ''}" data-sort="${k}">${l}</button>`).join('')}
        </div>
      </div>
      <div class="houses-count">${list.length} house${list.length !== 1 ? 's' : ''}</div>
      <div class="houses-grid">${list.map(houseCard).join('') ||
        '<p class="houses-empty">No house matches that.</p>'}</div>`;

    const search = document.getElementById('housesSearch');
    search.addEventListener('input', () => {
      query = search.value;
      const pos = search.selectionStart;
      renderGrid();
      const s2 = document.getElementById('housesSearch');
      s2.focus();
      s2.setSelectionRange(pos, pos);
    });

    wrap.querySelectorAll('.houses-sort').forEach(b => {
      b.addEventListener('click', () => { sortMode = b.dataset.sort; renderGrid(); });
    });

    wrap.querySelectorAll('.house-card').forEach(b => {
      b.addEventListener('click', () => showHouse(b.dataset.house));
    });
  }

  /* ── HOUSE DETAIL ───────────────────────────────────────────── */
  function renderHouse(h) {
    const wrap = document.getElementById('housesInner');
    const maxFlav = h.flavors[0] ? h.flavors[0].n : 1;

    const lineup = [...h.cigars].sort((a, b) => b.rating - a.rating);
    const cardsHtml = typeof renderCard === 'function'
      ? lineup.map((c, i) => renderCard(c, i)).join('')
      : '';

    wrap.innerHTML = `
      <button class="house-back" id="houseBack">← All houses</button>

      <header class="house-hero">
        ${crest(h, 'lg')}
        <div class="house-hero-text">
          <h1>${esc(h.brand)}</h1>
          <p class="house-hero-sub">
            ${h.origins.map(o => `${FLAG(o)} ${esc(o)}`).join(' · ')}
            ${h.founded ? ` &nbsp;·&nbsp; Est. ${h.founded}` : ''}
          </p>
        </div>
      </header>

      <div class="house-metrics">
        <div class="hm"><span class="hm-v">${h.count}</span><span class="hm-l">in the library</span></div>
        <div class="hm"><span class="hm-v">${h.avgRating.toFixed(1)}</span><span class="hm-l">average rating</span></div>
        <div class="hm"><span class="hm-v">${h.topRating}</span><span class="hm-l">highest rated</span></div>
        <div class="hm"><span class="hm-v">$${h.priceMed.toFixed(2)}</span><span class="hm-l">median stick</span></div>
        <div class="hm"><span class="hm-v">$${h.priceMin.toFixed(0)}–${h.priceMax.toFixed(0)}</span><span class="hm-l">price range</span></div>
        ${h.limited ? `<div class="hm"><span class="hm-v">${h.limited}</span><span class="hm-l">limited release${h.limited !== 1 ? 's' : ''}</span></div>` : ''}
      </div>

      <div class="house-panels">
        <section class="house-panel">
          <h2>Flavour Signature</h2>
          <p class="house-panel-sub">How often each note appears across the ${h.count} ${h.brand} cigar${h.count !== 1 ? 's' : ''} catalogued.</p>
          <div class="house-flav-bars">
            ${h.flavors.slice(0, 8).map(f => `
              <div class="hfb-row">
                <span class="hfb-name">${esc(f.name)}</span>
                <span class="hfb-track"><span class="hfb-fill" style="width:${(f.n / maxFlav * 100).toFixed(1)}%"></span></span>
                <span class="hfb-n">${Math.round(f.n / h.count * 100)}%</span>
              </div>`).join('')}
          </div>
        </section>

        <section class="house-panel">
          <h2>Body Range</h2>
          <p class="house-panel-sub">
            ${h.strengthMin === h.strengthMax
              ? `Every one of them lands at ${STRENGTH_LABEL[h.strengthMin - 1]}.`
              : `Runs from ${STRENGTH_LABEL[h.strengthMin - 1]} through ${STRENGTH_LABEL[h.strengthMax - 1]}.`}
          </p>
          <div class="house-strength">
            ${STRENGTH_LABEL.map((lbl, i) => {
              const n = h.cigars.filter(c => c.strength === i + 1).length;
              const pct = (n / h.count) * 100;
              return `<div class="hs-row">
                <span class="hs-l">${lbl}</span>
                <span class="hs-track"><span class="hs-fill s${i + 1}" style="width:${pct.toFixed(1)}%"></span></span>
                <span class="hs-n">${n || '—'}</span>
              </div>`;
            }).join('')}
          </div>
          <div class="house-signature">
            <span class="house-sig-label">House benchmark</span>
            <button class="house-sig-card" onclick="openModal('${esc(h.best.id)}')">
              ${h.best.image ? `<img src="${esc(h.best.image)}" alt="" loading="lazy" onerror="this.style.display='none'">` : '<span class="house-sig-noimg">🚬</span>'}
              <span>
                <strong>${esc(h.best.name)}</strong>
                <em>${h.best.rating} pts · ${esc(h.best.size)} · $${h.best.price.toFixed(2)}</em>
              </span>
            </button>
          </div>
        </section>
      </div>

      <h2 class="house-lineup-title">The Full Lineup</h2>
      <div class="cigars-grid house-lineup" id="houseLineup">${cardsHtml}</div>`;

    document.getElementById('houseBack').addEventListener('click', () => showAll());

    // Reuse the library's card behaviour: click-to-open, hearts, tilt, sheen.
    const grid = document.getElementById('houseLineup');
    grid.addEventListener('click', e => {
      if (e.target.closest('.card-compare-btn') || e.target.closest('.card-heart-btn')
          || e.target.closest('.card-size-pill')) return;
      const card = e.target.closest('.cigar-card');
      if (card && card.dataset.id) openModal(card.dataset.id);
    });
    if (window.VP && typeof VP.onGridRender === 'function') VP.onGridRender(grid);
  }

  /* ── NAVIGATION ─────────────────────────────────────────────── */
  function showHouse(s, skipHash) {
    if (!HOUSES) HOUSES = build();
    const h = HOUSES.find(x => x.slug === s);
    if (!h) return showAll();
    openBrand = s;
    if (typeof switchView === 'function') switchView('houses');
    renderHouse(h);
    if (!skipHash) history.pushState({ house: s }, '', '#/house/' + s);
    document.title = `${h.brand} — Vitola Pedia`;
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function showAll(skipHash) {
    if (!HOUSES) HOUSES = build();
    openBrand = null;
    renderGrid();
    if (!skipHash && location.hash.startsWith('#/house/')) {
      history.pushState({}, '', location.pathname);
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function onHash() {
    const m = location.hash.match(/^#\/house\/(.+)$/);
    if (m) showHouse(m[1], true);
  }

  /* ── BOOT ───────────────────────────────────────────────────── */
  function init() {
    const section = document.getElementById('view-houses');
    if (!section) return;
    section.innerHTML = '<div id="housesInner"></div>';

    HOUSES = build();

    // Render lazily — the grid is only built when the view is first opened.
    const origSwitch = window.switchView;
    if (typeof origSwitch === 'function') {
      window.switchView = function (name) {
        origSwitch(name);
        if (name === 'houses' && !openBrand) renderGrid();
      };
    }

    window.addEventListener('hashchange', onHash);
    window.addEventListener('popstate', () => {
      const m = location.hash.match(/^#\/house\/(.+)$/);
      if (m) showHouse(m[1], true);
      else if (openBrand) showAll(true);
    });
    onHash();
  }

  document.addEventListener('DOMContentLoaded', () => setTimeout(init, 80));

  window.VPHouses = { showHouse, showAll, get data() { return HOUSES || (HOUSES = build()); } };
})();
