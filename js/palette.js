/* ══════════════════════════════════════════════════════════════════
   VITOLA PEDIA — COMMAND PALETTE  (⌘K / Ctrl-K)
   One box over 25,815 cigars, 30 blends, 364 brands, every flavour note,
   origin, wrapper and view. Search was previously only reachable by
   scrolling to the hero.
   ══════════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  const cigars = () => (typeof CIGARS !== 'undefined' ? CIGARS : []);
  const pipes  = () => (typeof PIPE_TOBACCOS !== 'undefined' ? PIPE_TOBACCOS : []);
  const nrm    = s => (typeof normText === 'function'
    ? normText(s) : String(s || '').toLowerCase());

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  let index = null;
  let open = false;
  let results = [];
  let cursor = 0;
  let $overlay, $input, $list, $hint;

  /* ── INDEX ──────────────────────────────────────────────────────
     Built once on first open, not at load — no reason to pay for it
     if nobody presses the key.
  ─────────────────────────────────────────────────────────────── */
  function buildIndex() {
    const rows = [];

    rows.push(
      { kind: 'view', label: 'Cigar Library',   sub: 'Browse all cigars',        icon: '🚬', run: () => switchView('library') },
      { kind: 'view', label: 'Pipe Tobacco',    sub: 'Blends and tins',          icon: '🪈', run: () => switchView('pipe-tobacco') },
      { kind: 'view', label: 'Regions',         sub: 'Growing terroirs',         icon: '🌍', run: () => switchView('regions') },
      { kind: 'view', label: "Connoisseur's Guide", sub: 'Anatomy, cutting, vitolas', icon: '📖', run: () => switchView('guide') },
      { kind: 'view', label: 'The Lounge',      sub: "Who's burning right now",  icon: '🔥', run: () => switchView('lounge') },
      { kind: 'action', label: 'Find My Cigar', sub: 'Take the matching quiz',   icon: '🎯',
        run: () => { const b = document.getElementById('quizTriggerBtn'); if (b) b.click(); } },
      { kind: 'action', label: 'Surprise Me',   sub: 'Pull one at random',       icon: '🎲',
        run: () => { const b = document.getElementById('surpriseBtn'); if (b) b.click(); } },
      { kind: 'action', label: "What's in Your Glass?", sub: 'Pairing explorer', icon: '🥃',
        run: () => { const b = document.getElementById('pairingTriggerBtn'); if (b) b.click(); } },
      { kind: 'action', label: 'My Humidor',    sub: 'Everything you saved',     icon: '❤️',
        run: () => { const b = document.getElementById('humidorBtn'); if (b) b.click(); } },
    );

    cigars().forEach(c => rows.push({
      kind: 'cigar', label: c.name, sub: `${c.brand} · ${c.origin} · ${c.rating} pts`,
      meta: '$' + c.price.toFixed(2), img: c.image, id: c.id,
      run: () => openModal(c.id),
    }));

    pipes().forEach(p => rows.push({
      kind: 'pipe', label: p.name, sub: `${p.brand} · ${p.blendType}`,
      meta: '$' + p.price.toFixed(2), img: p.image, id: p.id,
      run: () => { switchView('pipe-tobacco'); openPTModal(p.id); },
    }));

    // Brands, flavours, origins, wrappers become filter shortcuts.
    const brands = {};
    cigars().forEach(c => { brands[c.brand] = (brands[c.brand] || 0) + 1; });
    Object.keys(brands).forEach(b => rows.push({
      kind: 'brand', label: b, sub: `${brands[b]} cigar${brands[b] !== 1 ? 's' : ''}`, icon: '🏛',
      run: () => applySearch(b),
    }));

    const flavors = {};
    cigars().forEach(c => (c.flavors || []).forEach(f => { flavors[f] = (flavors[f] || 0) + 1; }));
    Object.keys(flavors).forEach(f => rows.push({
      kind: 'flavor', label: f, sub: `${flavors[f]} cigars with this note`, icon: '🍃',
      run: () => applySearch(f),
    }));

    const origins = {};
    cigars().forEach(c => { origins[c.origin] = (origins[c.origin] || 0) + 1; });
    Object.keys(origins).forEach(o => rows.push({
      kind: 'origin', label: o, sub: `${origins[o]} cigars`, icon: '📍',
      run: () => applySearch(o),
    }));

    rows.forEach(r => { r._n = nrm(r.label); r._ns = nrm(r.sub || ''); });
    return rows;
  }

  function applySearch(term) {
    switchView('library');
    const box = document.getElementById('searchInput');
    if (box) box.value = term;
    if (typeof state !== 'undefined') state.search = term;
    if (typeof render === 'function') render();
    window.scrollTo({ top: document.querySelector('.main-content').offsetTop - 80, behavior: 'smooth' });
  }

  /* ── SCORING ────────────────────────────────────────────────────
     Prefix beats word-start beats substring; views and actions float
     up so "lounge" reaches the room, not a cigar that mentions it.
  ─────────────────────────────────────────────────────────────── */
  const KIND_BOOST = { view: 60, action: 55, brand: 22, origin: 18, flavor: 14, cigar: 0, pipe: 4 };

  function score(row, q) {
    const n = row._n;
    let s = -1;
    if (n === q) s = 200;
    else if (n.startsWith(q)) s = 150 - Math.min(n.length - q.length, 40);
    else if (n.includes(' ' + q)) s = 110 - Math.min(n.length - q.length, 40);
    else if (n.includes(q)) s = 70 - Math.min(n.length - q.length, 40);
    else if (row._ns.includes(q)) s = 30;
    if (s < 0) return -1;
    return s + (KIND_BOOST[row.kind] || 0);
  }

  function search(q) {
    const term = nrm(q).trim();
    if (!term) {
      return index.filter(r => r.kind === 'view' || r.kind === 'action');
    }
    const out = [];
    for (const row of index) {
      const s = score(row, term);
      if (s >= 0) out.push({ row, s });
    }
    out.sort((a, b) => b.s - a.s);
    return out.slice(0, 40).map(x => x.row);
  }

  /* ── RENDER ─────────────────────────────────────────────────── */
  const KIND_LABEL = {
    view: 'Go to', action: 'Do', cigar: 'Cigar', pipe: 'Pipe blend',
    brand: 'Brand', flavor: 'Flavour', origin: 'Origin',
  };

  function renderList() {
    if (!results.length) {
      $list.innerHTML = `<li class="cp-empty">Nothing matches that.</li>`;
      return;
    }
    $list.innerHTML = results.map((r, i) => `
      <li>
        <button class="cp-row${i === cursor ? ' active' : ''}" data-i="${i}">
          <span class="cp-icon">${r.img
            ? `<img src="${esc(r.img)}" alt="" loading="lazy" onerror="this.replaceWith(document.createTextNode('🚬'))">`
            : (r.icon || '🚬')}</span>
          <span class="cp-text">
            <span class="cp-label">${esc(r.label)}</span>
            <span class="cp-sub">${esc(r.sub || '')}</span>
          </span>
          ${r.meta ? `<span class="cp-meta">${esc(r.meta)}</span>` : ''}
          <span class="cp-kind">${KIND_LABEL[r.kind] || ''}</span>
        </button>
      </li>`).join('');

    const active = $list.querySelector('.cp-row.active');
    if (active) active.scrollIntoView({ block: 'nearest' });
  }

  function move(delta) {
    if (!results.length) return;
    cursor = (cursor + delta + results.length) % results.length;
    renderList();
  }

  function choose(i) {
    const r = results[i];
    if (!r) return;
    closePalette();
    // Let the overlay finish closing before a modal opens over it.
    setTimeout(() => { try { r.run(); } catch (e) { console.error(e); } }, 40);
  }

  /* ── OPEN / CLOSE ───────────────────────────────────────────── */
  function openPalette() {
    if (open) return;
    if (!index) index = buildIndex();
    open = true;
    $overlay.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
    $input.value = '';
    results = search('');
    cursor = 0;
    renderList();
    setTimeout(() => $input.focus(), 20);
  }

  function closePalette() {
    if (!open) return;
    open = false;
    $overlay.classList.add('hidden');
    // Only release the scroll lock if no other modal is holding it.
    const otherOpen = [...document.querySelectorAll('.modal-overlay')]
      .some(o => o !== $overlay && !o.classList.contains('hidden'));
    if (!otherOpen) document.body.style.overflow = '';
  }

  /* ── BOOT ───────────────────────────────────────────────────── */
  function init() {
    const wrap = document.createElement('div');
    wrap.className = 'cp-overlay hidden';
    wrap.id = 'cpOverlay';
    wrap.innerHTML = `
      <div class="cp-panel" role="dialog" aria-modal="true" aria-label="Search everything">
        <div class="cp-input-row">
          <svg viewBox="0 0 24 24" fill="none" width="18" height="18" class="cp-search-icon">
            <circle cx="11" cy="11" r="7" stroke="currentColor" stroke-width="1.8"/>
            <path d="M16.5 16.5L21 21" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
          </svg>
          <input id="cpInput" type="text" autocomplete="off" spellcheck="false"
                 placeholder="Search cigars, brands, flavours, or jump anywhere…" />
          <kbd class="cp-esc">Esc</kbd>
        </div>
        <ul class="cp-list" id="cpList"></ul>
        <div class="cp-foot">
          <span><kbd>↑</kbd><kbd>↓</kbd> navigate</span>
          <span><kbd>↵</kbd> open</span>
          <span id="cpCount"></span>
        </div>
      </div>`;
    document.body.appendChild(wrap);

    $overlay = wrap;
    $input = wrap.querySelector('#cpInput');
    $list  = wrap.querySelector('#cpList');
    $hint  = wrap.querySelector('#cpCount');

    $input.addEventListener('input', () => {
      results = search($input.value);
      cursor = 0;
      renderList();
      $hint.textContent = results.length ? `${results.length} result${results.length !== 1 ? 's' : ''}` : '';
    });

    $input.addEventListener('keydown', e => {
      if (e.key === 'ArrowDown') { e.preventDefault(); move(1); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); move(-1); }
      else if (e.key === 'Enter') { e.preventDefault(); choose(cursor); }
      else if (e.key === 'Escape') { e.preventDefault(); closePalette(); }
    });

    $list.addEventListener('click', e => {
      const b = e.target.closest('.cp-row');
      if (b) choose(Number(b.dataset.i));
    });
    $list.addEventListener('mousemove', e => {
      const b = e.target.closest('.cp-row');
      if (b && Number(b.dataset.i) !== cursor) {
        cursor = Number(b.dataset.i);
        $list.querySelectorAll('.cp-row').forEach((r, i) => r.classList.toggle('active', i === cursor));
      }
    });

    wrap.addEventListener('click', e => { if (e.target === wrap) closePalette(); });

    document.addEventListener('keydown', e => {
      const key = (e.key || '').toLowerCase();
      if ((e.metaKey || e.ctrlKey) && key === 'k') {
        e.preventDefault();
        open ? closePalette() : openPalette();
        return;
      }
      // "/" is a search shortcut too, but not while someone is typing.
      if (key === '/' && !open) {
        const t = e.target;
        const typing = t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
        if (!typing) { e.preventDefault(); openPalette(); }
      }
    });

    // Header affordance — a keyboard shortcut nobody knows about is useless.
    const nav = document.querySelector('.header-nav');
    if (nav) {
      const btn = document.createElement('button');
      btn.className = 'nav-icon-btn cp-trigger';
      btn.title = 'Search everything (⌘K)';
      btn.setAttribute('aria-label', 'Search everything');
      const mac = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
      btn.innerHTML = `<svg viewBox="0 0 24 24" fill="none"><circle cx="11" cy="11" r="7" stroke="currentColor" stroke-width="1.8"/><path d="M16.5 16.5L21 21" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg><kbd class="cp-kbd">${mac ? '⌘' : 'Ctrl'}K</kbd>`;
      btn.addEventListener('click', openPalette);
      nav.insertBefore(btn, nav.firstChild);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  window.VPPalette = { open: openPalette, close: closePalette };
})();
