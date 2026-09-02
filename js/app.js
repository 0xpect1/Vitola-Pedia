/* ================================================================
   CIGAR CONNOISSEUR — App Engine
   ================================================================ */

// ── STATE ────────────────────────────────────────────────────────
const state = {
  search: '',
  brand: 'all',
  strength: 'all',
  origin: 'all',
  wrapper: 'all',
  flavor: 'all',
  time: 'all',
  maxPrice: 65,
  limitedOnly: false,
  sort: 'rating-desc',
  view: 'grid',
  currentView: 'library'
};

// ── STRENGTH CONFIG ──────────────────────────────────────────────
const STRENGTH_CONFIG = {
  1: { label: 'Mild',       color: '#7fc99e' },
  2: { label: 'Mild–Med',   color: '#b5c97a' },
  3: { label: 'Medium',     color: '#e0b84a' },
  4: { label: 'Med–Full',   color: '#e07b3a' },
  5: { label: 'Full',       color: '#d04040' }
};

const ORIGIN_FLAGS = {
  'Cuba': '🇨🇺',
  'Nicaragua': '🇳🇮',
  'Dominican Republic': '🇩🇴',
  'Honduras': '🇭🇳',
  'Guatemala': '🇬🇹'
};

// ── FLAVOR ICONS ────────────────────────────────────────────────
const FLAVOR_ICONS = {
  'Espresso': '☕', 'Coffee': '☕', 'Dark Coffee': '☕', 'Roasted Coffee': '☕', 'Mild Coffee': '☕',
  'Dark Chocolate': '🍫', 'Cocoa': '🍫', 'Chocolate': '🍫',
  'Leather': '🟤', 'Earth': '🌱', 'Dark Earth': '🌍',
  'Cedar': '🌲', 'Wood': '🪵',
  'Pepper': '🌶️', 'Spice': '✨', 'Sweet Spice': '✨', 'Mild Spice': '✨', 'White Pepper': '🌶️',
  'Cream': '🥛', 'Vanilla': '🍦', 'Caramel': '🍯', 'Honey': '🍯', 'Almond': '🌰', 'Nuts': '🌰',
  'Floral': '🌸', 'Dark Fruit': '🍇', 'Dried Fruit': '🍇', 'Raisin': '🍇',
  'Hay': '🌾', 'Grass': '🌿', 'Tobacco': '🌿', 'Tar': '⚫', 'Charcoal': '⚫',
  'Toast': '🍞', 'Sweet': '🍬', 'Herbal': '🌿',
  'Barnyard': '🏡'
};

// ── DOM REFS ─────────────────────────────────────────────────────
const $grid       = document.getElementById('cigarsGrid');
const $count      = document.getElementById('resultsCount');
const $noResults  = document.getElementById('noResults');
const $totalStat  = document.getElementById('statTotal');
const $search     = document.getElementById('searchInput');
const $searchClr  = document.getElementById('searchClear');
const $sort       = document.getElementById('sortSelect');
const $priceRange = document.getElementById('priceRange');
const $priceLabel = document.getElementById('priceLabel');
const $limited    = document.getElementById('limitedToggle');
const $modalOverlay = document.getElementById('modalOverlay');
const $modal      = document.getElementById('cigarModal');
const $modalBody  = document.getElementById('modalBody');
const $modalClose = document.getElementById('modalClose');
const $filtersPanel = document.getElementById('filtersPanel');
const $filterOverlay = document.getElementById('filterOverlay');
const $viewGrid   = document.getElementById('viewGrid');
const $viewList   = document.getElementById('viewList');

// ── HELPERS ──────────────────────────────────────────────────────
function formatTime(mins) {
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `${h}h ${m}m` : `${h} hr`;
}

function formatPrice(p) {
  return p >= 50 ? `$${p.toFixed(0)}+` : `$${p.toFixed(2)}`;
}

function strengthConfig(s) {
  return STRENGTH_CONFIG[s] || STRENGTH_CONFIG[3];
}

function matchesFlavor(cigar, flavorFilter) {
  if (flavorFilter === 'all') return true;
  return cigar.flavors.some(f => f.toLowerCase().includes(flavorFilter.toLowerCase()));
}

function matchesWrapper(cigar, wrapperFilter) {
  if (wrapperFilter === 'all') return true;
  return cigar.wrapper.toLowerCase().includes(wrapperFilter.toLowerCase());
}

function matchesTime(cigar, timeFilter) {
  if (timeFilter === 'all') return true;
  const t = cigar.smokingTime;
  if (timeFilter === 'quick') return t < 30;
  if (timeFilter === 'short') return t >= 30 && t <= 50;
  if (timeFilter === 'medium') return t > 50 && t <= 75;
  if (timeFilter === 'long') return t > 75;
}

// Lowercase and strip diacritics so "Padron" finds "Padrón", "Antano"
// finds "Antaño", and so on.
function normText(s) {
  return String(s == null ? '' : s)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

// The searchable blob is built once per cigar and cached in a WeakMap —
// re-normalising 20,815 records on every keystroke is needless work, and a
// side table keeps the cigar objects themselves clean.
const SEARCH_BLOBS = new WeakMap();

function searchBlob(cigar) {
  let blob = SEARCH_BLOBS.get(cigar);
  if (blob === undefined) {
    blob = normText([
      cigar.name, cigar.brand, cigar.origin, cigar.region, cigar.wrapper,
      cigar.size, cigar.description,
      (cigar.flavors || []).join(' '),
      (cigar.pairings || []).join(' '),
    ].join(' '));
    SEARCH_BLOBS.set(cigar, blob);
  }
  return blob;
}

function matchesSearch(cigar, query) {
  if (!query) return true;
  return searchBlob(cigar).includes(normText(query));
}

function sortCigars(cigars) {
  const [key, dir] = state.sort.split('-');
  return [...cigars].sort((a, b) => {
    let av = a[key], bv = b[key];
    if (key === 'name') { av = av.toLowerCase(); bv = bv.toLowerCase(); }
    if (dir === 'asc') return av < bv ? -1 : av > bv ? 1 : 0;
    return av > bv ? -1 : av < bv ? 1 : 0;
  });
}

function getFiltered() {
  return CIGARS.filter(c =>
    (state.brand === 'all' || c.brand === state.brand) &&
    (state.strength === 'all' || c.strength === parseInt(state.strength)) &&
    (state.origin === 'all' || c.origin === state.origin) &&
    matchesWrapper(c, state.wrapper) &&
    matchesFlavor(c, state.flavor) &&
    matchesTime(c, state.time) &&
    c.price <= state.maxPrice &&
    (!state.limitedOnly || c.limited) &&
    matchesSearch(c, state.search)
  );
}

// ── CARD RENDERER ────────────────────────────────────────────────
function renderCard(cigar, index) {
  const sc = strengthConfig(cigar.strength);
  const dots = Array.from({ length: 5 }, (_, i) => {
    const filled = i < cigar.strength;
    return `<div class="strength-dot${filled ? ' filled' : ''}" style="${filled ? `--strength-val:${sc.color}` : ''}"></div>`;
  }).join('');

  const topFlavors = cigar.flavors.slice(0, 4).map(f =>
    `<span class="flavor-tag">${f}</span>`
  ).join('');

  const flag = ORIGIN_FLAGS[cigar.origin] || '';

  const limitedBadge = cigar.limited
    ? `<span class="limited-badge">Limited</span>`
    : '';

  const siblings = SIBLING_MAP.get(cigar.id) || [];
  const allSizes = siblings.length > 0
    ? [...siblings, cigar].sort((a, b) => a.length - b.length)
    : null;
  const cardSizesRow = allSizes ? `
    <div class="card-sizes">
      ${allSizes.map(s => `<button class="card-size-pill${s.id === cigar.id ? ' active' : ''}"
        onclick="event.stopPropagation();openModal('${s.id}')" tabindex="-1">${s.size}</button>`).join('')}
    </div>` : '';

  const cardImg = cigar.image
    ? `<div class="card-img-wrap"><img class="card-img" src="${cigar.image}" alt="${cigar.name}" loading="lazy" onerror="this.parentElement.style.display='none'"></div>`
    : '';

  const inCompare = compareList.includes(cigar.id);
  const inCellar = typeof isInCellar === 'function' && isInCellar(cigar.id);
  const wrapperSlug = cigar.wrapper.toLowerCase();
  return `
    <article class="cigar-card${cigar.image ? ' has-img' : ''}" data-id="${cigar.id}" data-wrapper="${wrapperSlug}" style="animation-delay:${Math.min(index * 0.04, 0.5)}s" role="button" tabindex="0">
      ${cardImg}
      ${limitedBadge}
      <button class="card-heart-btn${inCellar ? ' saved' : ''}" data-id="${cigar.id}" title="Save to Cellar" tabindex="-1" onclick="event.stopPropagation();toggleCellar('${cigar.id}', event)">
        <svg viewBox="0 0 24 24" fill="${inCellar ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
      </button>
      <button class="card-compare-btn${inCompare ? ' in-compare' : ''}" data-id="${cigar.id}" title="Compare" tabindex="-1">+</button>
      <div class="card-header">
        <span class="card-origin-badge">${flag} ${cigar.origin}</span>
        <div class="card-rating-wrap">
          <div class="card-rating-seal">
            <span class="seal-num">${cigar.rating}</span>
            <span class="seal-label">pts</span>
          </div>
        </div>
      </div>
      <div class="card-name">${cigar.name}</div>
      <div class="card-brand">${cigar.brand}</div>
      <div class="strength-row">
        <span class="strength-label">Strength</span>
        <div class="strength-dots">${dots}</div>
        <span class="strength-text" style="color:${sc.color}">${sc.label}</span>
      </div>
      <div class="card-details">
        <div class="detail-item">
          <span class="detail-label">Wrapper</span>
          <span class="detail-value">${cigar.wrapper.replace(/Ecuadorian |Nicaraguan |Honduran |Cuban /gi, '').trim()}</span>
        </div>
        <div class="detail-item">
          <span class="detail-label">Size</span>
          <span class="detail-value">${cigar.size}</span>
        </div>
        <div class="detail-item">
          <span class="detail-label">Smoke Time</span>
          <span class="detail-value time">${formatTime(cigar.smokingTime)}</span>
        </div>
        <div class="detail-item">
          <span class="detail-label">Price / Stick</span>
          <span class="detail-value price">${formatPrice(cigar.price)}</span>
        </div>
      </div>
      <div class="flavor-tags">${topFlavors}</div>
      ${cardSizesRow}
    </article>
  `;
}

// ── LIST VIEW CARD ────────────────────────────────────────────────
function renderListCard(cigar) {
  const sc = strengthConfig(cigar.strength);
  const dots = Array.from({ length: 5 }, (_, i) => {
    const filled = i < cigar.strength;
    return `<div class="strength-dot${filled ? ' filled' : ''}" style="${filled ? `--strength-val:${sc.color}` : ''}"></div>`;
  }).join('');
  const flag = ORIGIN_FLAGS[cigar.origin] || '';

  const siblings = SIBLING_MAP.get(cigar.id) || [];
  const allSizes = siblings.length > 0
    ? [...siblings, cigar].sort((a, b) => a.length - b.length)
    : null;
  const listSizesRow = allSizes ? `
    <div class="card-sizes" style="margin-top:8px">
      ${allSizes.map(s => `<button class="card-size-pill${s.id === cigar.id ? ' active' : ''}"
        onclick="event.stopPropagation();openModal('${s.id}')" tabindex="-1">${s.size}</button>`).join('')}
    </div>` : '';

  return `
    <article class="cigar-card" data-id="${cigar.id}" role="button" tabindex="0">
      <div class="card-left">
        <div class="card-name">${cigar.name}</div>
        <div class="card-brand">${cigar.brand} · ${flag} ${cigar.origin} · ${cigar.region}</div>
        <div class="card-details">
          <div class="detail-item">
            <span class="detail-label">Wrapper:</span>
            <span class="detail-value">${cigar.wrapper}</span>
          </div>
          <div class="detail-item">
            <span class="detail-label">Size:</span>
            <span class="detail-value">${cigar.size} (${cigar.length}"×${cigar.ringGauge})</span>
          </div>
          <div class="detail-item">
            <span class="detail-label">Time:</span>
            <span class="detail-value time">${formatTime(cigar.smokingTime)}</span>
          </div>
        </div>
        <div class="strength-row" style="margin-top:8px">
          <div class="strength-dots">${dots}</div>
          <span class="strength-text" style="color:${sc.color}">${sc.label}</span>
        </div>
        ${listSizesRow}
      </div>
      <div class="card-right">
        <div class="card-rating">${cigar.rating}<span class="card-rating-label">pts</span></div>
        <div class="detail-value price" style="font-size:16px">${formatPrice(cigar.price)}</div>
        ${cigar.limited ? '<span class="limited-badge" style="position:static">Limited</span>' : ''}
      </div>
    </article>
  `;
}

// ── RENDER GRID ──────────────────────────────────────────────────
/* ── PROGRESSIVE RENDER ───────────────────────────────────────────
   The library used to put all 1,456 matching cards in the DOM at once —
   64k nodes, which mobile scrolling really felt. Cards now arrive a page
   at a time as you approach the end of the list. The result count still
   reports the true total, so nothing about the filtering is hidden.
────────────────────────────────────────────────────────────────── */
const PAGE_SIZE = 60;
let _pool = [];        // everything currently matching, in sort order
let _shown = 0;        // how many of those are actually in the DOM
let _tailObserver = null;

function render() {
  _pool = sortCigars(getFiltered());
  const count = _pool.length;

  $count.innerHTML = `<strong>${count}</strong> cigar${count !== 1 ? 's' : ''} found`;
  $noResults.classList.toggle('hidden', count > 0);
  $grid.innerHTML = '';
  _shown = 0;

  if (count === 0) { syncTail(); return; }

  $grid.classList.toggle('list-view', state.view === 'list');
  appendPage();
}

function appendPage() {
  const slice = _pool.slice(_shown, _shown + PAGE_SIZE);
  if (!slice.length) return;

  $grid.insertAdjacentHTML('beforeend', state.view === 'list'
    ? slice.map(c => renderListCard(c)).join('')
    : slice.map((c, i) => renderCard(c, _shown + i)).join(''));

  _shown += slice.length;
  if (window.VP && VP.onGridRender) VP.onGridRender($grid);
  syncTail();

  // The observer only reports edge crossings, so on a tall viewport — or
  // after a jump straight to the bottom — the sentinel can sit in view
  // without ever firing again. Check its geometry directly and keep
  // filling until it's genuinely below the fold.
  requestAnimationFrame(fillViewport);
}

function fillViewport() {
  if (_shown >= _pool.length) return;
  const tail = document.getElementById('gridTail');
  if (!tail) return;
  const rect = tail.getBoundingClientRect();
  if (rect.top < window.innerHeight + 600) appendPage();
}

/* A sentinel just past the grid; when it scrolls into view the next page
   is added. Kept out of the DOM entirely once everything is shown. */
function syncTail() {
  let tail = document.getElementById('gridTail');
  const more = _shown < _pool.length;

  if (!more) {
    if (tail) { if (_tailObserver) _tailObserver.unobserve(tail); tail.remove(); }
    return;
  }

  if (!tail) {
    tail = document.createElement('div');
    tail.id = 'gridTail';
    tail.className = 'grid-tail';
    tail.innerHTML = `<span class="grid-tail-ember"></span>`;
    $grid.insertAdjacentElement('afterend', tail);
  } else {
    // Move it back to the end so it always trails the last card.
    $grid.insertAdjacentElement('afterend', tail);
  }
  tail.querySelector('.grid-tail-ember').setAttribute(
    'aria-label', `Loading more — ${_pool.length - _shown} of ${_pool.length} still to come`);

  if (!_tailObserver) {
    _tailObserver = new IntersectionObserver(entries => {
      if (entries.some(e => e.isIntersecting)) appendPage();
    }, { rootMargin: '600px 0px' });
  }
  _tailObserver.observe(tail);
}

/* One delegated listener instead of two per card — at 1,456 cards the old
   approach was wiring up nearly three thousand handlers on every render. */
function bindGridDelegation() {
  const openFrom = el => {
    const card = el.closest('.cigar-card');
    if (!card || !card.dataset.id) return;
    openModal(card.dataset.id);
  };
  $grid.addEventListener('click', e => {
    if (e.target.closest('.card-compare-btn') || e.target.closest('.card-heart-btn')
        || e.target.closest('.card-size-pill')) return;
    openFrom(e.target);
  });
  $grid.addEventListener('keydown', e => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    if (!e.target.classList || !e.target.classList.contains('cigar-card')) return;
    e.preventDefault();
    openFrom(e.target);
  });
}

function openModal(id) {
  const cigar = CIGARS.find(c => c.id === id);
  if (!cigar) return;

  history.pushState({ cigarId: id }, '', '/#/cigar/' + id);
  document.title = cigar.name + ' — Vitola Pedia';

  const sc = strengthConfig(cigar.strength);
  const strengthPct = (cigar.strength / 5) * 100;
  const flag = ORIGIN_FLAGS[cigar.origin] || '';

  const flavorChips = cigar.flavors.map(f => {
    const icon = FLAVOR_ICONS[f] || '·';
    return `<span class="flavor-chip">${icon} ${f}</span>`;
  }).join('');

  const pairingItems = (cigar.pairings || []).map(p =>
    `<span class="pairing-item">🥃 ${p}</span>`
  ).join('');

  const limitedBadge = cigar.limited ? `<span class="modal-badge limited">Limited Release</span>` : '';

  const modalImg = cigar.image
    ? `<div class="modal-hero-img-wrap"><img class="modal-hero-img" src="${cigar.image}" alt="${cigar.name}" loading="lazy" onerror="this.parentElement.style.display='none'"></div>`
    : '';

  $modalBody.innerHTML = `
    <div class="modal-header">
      <div class="modal-badges">
        <span class="modal-badge origin">${flag} ${cigar.origin}</span>
        <span class="modal-badge">${cigar.region}</span>
        ${limitedBadge}
        ${cigar.yearFounded ? `<span class="modal-badge">Est. ${cigar.yearFounded}</span>` : ''}
      </div>
      <h2 class="modal-title">${cigar.name}</h2>
      <div class="modal-brand">${cigar.brand}</div>
    </div>

    ${modalImg}

    <div class="modal-stats-row">
      <div class="modal-stat-box">
        <div class="msb-val">${cigar.rating}</div>
        <div class="msb-label">Expert Rating</div>
      </div>
      <div class="modal-stat-box">
        <div class="msb-val">${formatPrice(cigar.price)}</div>
        <div class="msb-label">Per Stick</div>
      </div>
      <div class="modal-stat-box">
        <div class="msb-val">${formatTime(cigar.smokingTime)}</div>
        <div class="msb-label">Smoke Time</div>
      </div>
      <div class="modal-strength-full">
        <div class="msf-label">Body &amp; Strength</div>
        <div class="msf-bar-track">
          <div class="msf-bar-fill" style="width:${strengthPct}%; --fill-end:${sc.color}"></div>
        </div>
        <div class="msf-text" style="color:${sc.color}">${sc.label}</div>
      </div>
    </div>

    <div class="modal-description">${cigar.description}</div>

    <div class="modal-specs">
      <div class="spec-item">
        <div class="spec-label">Wrapper</div>
        <div class="spec-value">${cigar.wrapper}</div>
      </div>
      <div class="spec-item">
        <div class="spec-label">Binder</div>
        <div class="spec-value">${cigar.binder}</div>
      </div>
      <div class="spec-item">
        <div class="spec-label">Filler</div>
        <div class="spec-value">${cigar.filler}</div>
      </div>
      <div class="spec-item">
        <div class="spec-label">Size / Vitola</div>
        <div class="spec-value">${cigar.size}</div>
      </div>
      <div class="spec-item">
        <div class="spec-label">Length</div>
        <div class="spec-value">${cigar.length}"</div>
      </div>
      <div class="spec-item">
        <div class="spec-label">Ring Gauge</div>
        <div class="spec-value">${cigar.ringGauge}</div>
      </div>
    </div>

    ${buildSiblingsSection(cigar)}

    <div class="modal-flavors">
      <div class="modal-section-title">Flavor Profile</div>
      <div class="flavor-wheel-wrap">
        ${buildFlavorWheel(cigar.flavors)}
      </div>
      <div class="flavor-chips">${flavorChips}</div>
    </div>

    ${pairingItems ? `
    <div class="modal-pairings">
      <div class="modal-section-title">Pairs Well With</div>
      <div class="pairing-list">${pairingItems}</div>
    </div>` : ''}

    ${buildBuySection(cigar)}
  `;

  $modalOverlay.classList.remove('hidden');
  document.body.style.overflow = 'hidden';
  $modal.scrollTop = 0;
}

function closeModal() {
  $modalOverlay.classList.add('hidden');
  document.body.style.overflow = '';
  if (window.location.hash.startsWith('#/cigar/') || window.location.hash.startsWith('#/tobacco/')) {
    history.pushState({}, '', '/');
  }
  document.title = 'Vitola Pedia — Premium Cigar Encyclopedia | 20,815 Cigars, 364 Brands';
}

// ── WHERE TO BUY ─────────────────────────────────────────────────

// Converts a cigar name to Neptune Cigar's URL slug format
// e.g. "Padrón 1964 Anniversary Maduro" → "padron-1964-anniversary-maduro"
function toNeptuneSlug(name) {
  // Neptune drops "Drew Estate" prefix — Liga Privada is sold as its own brand
  const normalized = name.replace(/^Drew Estate\s+/i, '');
  return normalized
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // remove diacritics (ó→o, é→e, etc.)
    .replace(/[''`~]/g, '')          // remove apostrophes/backticks
    .replace(/[^a-z0-9]+/g, '-')    // non-alphanumeric → hyphen
    .replace(/^-+|-+$/g, '');        // trim leading/trailing hyphens
}

// ── AVAILABLE SIZES ───────────────────────────────────────────────
function findSiblings(cigar) {
  const parts = cigar.name.split(' ');
  // Try progressively shorter prefixes; minimum 4 words to avoid false-positive
  // brand-level groupings (e.g. "Romeo y Julieta" matching all RyJ entries)
  for (let len = parts.length - 1; len >= 4; len--) {
    const prefix = parts.slice(0, len).join(' ');
    const siblings = CIGARS.filter(c =>
      c.id !== cigar.id &&
      c.brand === cigar.brand &&
      c.name.startsWith(prefix + ' ')
    );
    if (siblings.length >= 1) return siblings;
  }
  return [];
}

function buildSiblingsSection(cigar) {
  const siblings = findSiblings(cigar);
  if (siblings.length === 0) return '';

  // Merge current cigar with siblings, sort all by length ascending (small→large)
  const all = [...siblings, { ...cigar, _isCurrent: true }]
    .sort((a, b) => a.length - b.length);

  const pills = all.map(c => {
    if (c._isCurrent) {
      return `<button class="size-pill size-pill--active" disabled aria-current="true">
        <span class="size-pill-name">${c.size}</span>
        <span class="size-pill-dims">${c.length}" &times; ${c.ringGauge}</span>
      </button>`;
    }
    return `<button class="size-pill" onclick="openModal('${c.id}')">
      <span class="size-pill-name">${c.size}</span>
      <span class="size-pill-dims">${c.length}" &times; ${c.ringGauge} &middot; ${formatPrice(c.price)}</span>
    </button>`;
  }).join('');

  return `
    <div class="modal-sizes-section">
      <div class="modal-section-title">Available Sizes</div>
      <div class="size-pills">${pills}</div>
    </div>`;
}

// Precompute siblings for every cigar once so card rendering stays fast
const SIBLING_MAP = new Map();
for (const cigar of CIGARS) {
  SIBLING_MAP.set(cigar.id, findSiblings(cigar));
}

const US_RETAILERS = [
  { name: 'Famous Smoke Shop',    search: 'https://www.famous-smoke.com/search?q=',            tagline: 'Largest Online Selection', badge: '★ Best Value Pick' },
  { name: 'Cigars International', search: 'https://www.cigarsinternational.com/search?q=',     tagline: 'Best Deals & Bundles' },
  { name: 'Cigar Page',           search: 'https://www.cigarpage.com/search?q=',               tagline: 'Top Prices, Huge Selection' },
  { name: 'JR Cigars',            search: 'https://www.jrcigars.com/search?term=',             tagline: 'Est. 1975 · Trusted Since' },
  { name: 'Neptune Cigar',        search: 'https://www.neptunecigar.com/search?q=',            tagline: 'Great Prices, Fast Shipping' },
  { name: 'Smoke Inn',            search: 'https://www.smokeinn.com/search?q=',                tagline: 'Boutique & Premium Brands' },
];

const INTL_RETAILERS = [
  { name: 'Havana House',         search: 'https://www.havanahouse.co.uk/search?q=',           tagline: 'UK · Authentic Habanos',  badge: '★ Best Value Pick' },
  { name: 'C.Gars Ltd',           search: 'https://www.cgarsltd.co.uk/search?q=',              tagline: 'UK · Cuban Specialists' },
];

function buildBuySection(cigar) {
  const isCuban = cigar.origin === 'Cuba';
  // Strip diacritics so searches match retailer indexes (Padrón → Padron, Añejo → Anejo)
  const searchName = cigar.name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[''`]/g, '');
  const query = encodeURIComponent(searchName);
  const retailers = isCuban ? INTL_RETAILERS : US_RETAILERS;

  // If cigar has handcrafted buyLinks, sort by price and flag cheapest.
  let specificLinks = [];
  if (cigar.buyLinks && cigar.buyLinks.length > 0) {
    specificLinks = [...cigar.buyLinks].sort((a, b) => (a.price || 0) - (b.price || 0));
    if (specificLinks.length > 0) specificLinks[0].isBest = true;
  }

  // Auto-generate links; skip retailers already in specific links
  const covered = new Set(specificLinks.map(l => l.retailer));
  const autoLinks = retailers
    .filter(r => !covered.has(r.name))
    .map((r, i) => ({
      name: r.name,
      url: r.search + query,
      tagline: r.tagline,
      badge: (!specificLinks.length && i === 0) ? r.badge : null,
    }));

  const allLinks = [
    ...specificLinks.map(l => ({
      name: l.retailer,
      url: l.url,
      tagline: l.tagline || '',
      badge: l.isBest ? '★ Best Price' : null,
      price: l.price,
    })),
    ...autoLinks,
  ];

  const cards = allLinks.map(link => {
    const badgeHtml = link.badge ? `<div class="buy-badge">${link.badge}</div>` : '';
    const priceHtml = link.price != null
      ? `<div class="buy-cta buy-price-tag">${formatPrice(link.price)} / stick</div>`
      : `<div class="buy-cta">Shop Now →</div>`;
    return `
      <a href="${link.url}" target="_blank" rel="noopener noreferrer" class="buy-card${link.badge ? ' buy-card-top' : ''}">
        ${badgeHtml}
        <div class="buy-card-name">${link.name}</div>
        <div class="buy-card-tagline">${link.tagline}</div>
        ${priceHtml}
      </a>`;
  }).join('');

  const cubanNote = isCuban
    ? `<p class="buy-cuban-note">🇨🇺 Cuban cigars cannot be purchased in the US. Links go to authorized international retailers.</p>`
    : '';

  return `
    <div class="modal-buy-section">
      <div class="modal-section-title">Where to Buy</div>
      ${cubanNote}
      <div class="buy-cards-grid">${cards}</div>
      <p class="buy-disclaimer">Prices vary by retailer and change often — click through for current pricing.</p>
    </div>`;
}

// ═══════════════════════════════════════════════════════════════════
// PIPE TOBACCO ENGINE
// ═══════════════════════════════════════════════════════════════════

const PT_RETAILERS = [
  { name: 'Pipes & Cigars', search: 'https://www.pipesandcigars.com/search/?q=', tagline: 'Largest Pipe Tobacco Selection', badge: '★ Top Pick' },
  { name: '4 Noggins',      search: 'https://www.4noggins.com/search/?q=',       tagline: 'Specialty Pipe Tobacco Shop' },
];

const PT_BLEND_COLORS = {
  'English':          '#8b5e3c',
  'Balkan':           '#6b4a2a',
  'Aromatic':         '#c9943a',
  'Virginia':         '#7a8c5e',
  'Virginia/Perique': '#5e8a4a',
  'Virginia/Burley':  '#8c7a5e',
  'Burley':           '#a0714f',
  'Dark Fired':       '#4a5a8a',
  'Scottish':         '#7a5e8a',
  'Oriental':         '#8a7a3a',
};

const ptState = {
  search: '',
  brand: 'all',
  blendType: 'all',
  cut: 'all',
  strength: 'all',
  maxPrice: 50,
  sort: 'rating-desc',
  view: 'grid',
};

function ptBlendColor(bt) {
  return PT_BLEND_COLORS[bt] || '#c9943a';
}

function matchesPTSearch(pt, query) {
  if (!query) return true;
  const q = query.toLowerCase();
  return (
    pt.name.toLowerCase().includes(q) ||
    pt.brand.toLowerCase().includes(q) ||
    pt.origin.toLowerCase().includes(q) ||
    pt.blendType.toLowerCase().includes(q) ||
    pt.cut.toLowerCase().includes(q) ||
    pt.components.some(c => c.toLowerCase().includes(q)) ||
    pt.flavors.some(f => f.toLowerCase().includes(q)) ||
    pt.description.toLowerCase().includes(q)
  );
}

function getFilteredPT() {
  return PIPE_TOBACCOS.filter(pt =>
    (ptState.brand === 'all' || pt.brand === ptState.brand) &&
    (ptState.blendType === 'all' || pt.blendType === ptState.blendType) &&
    (ptState.cut === 'all' || pt.cut.toLowerCase().includes(ptState.cut.toLowerCase())) &&
    (ptState.strength === 'all' || pt.strength === parseInt(ptState.strength)) &&
    pt.price <= ptState.maxPrice &&
    matchesPTSearch(pt, ptState.search)
  );
}

function sortPT(items) {
  const [key, dir] = ptState.sort.split('-');
  return [...items].sort((a, b) => {
    let av = a[key], bv = b[key];
    if (key === 'name') { av = av.toLowerCase(); bv = bv.toLowerCase(); }
    if (dir === 'asc') return av < bv ? -1 : av > bv ? 1 : 0;
    return av > bv ? -1 : av < bv ? 1 : 0;
  });
}

function buildPTBuySection(pt) {
  const searchName = (pt.brand + ' ' + pt.name).normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const query = encodeURIComponent(searchName);

  let specificLinks = [];
  if (pt.buyLinks && pt.buyLinks.length > 0) {
    specificLinks = [...pt.buyLinks].sort((a, b) => (a.price || 0) - (b.price || 0));
    if (specificLinks.length > 0) specificLinks[0].isBest = true;
  }

  const covered = new Set(specificLinks.map(l => l.retailer));
  const autoLinks = PT_RETAILERS
    .filter(r => !covered.has(r.name))
    .map((r, i) => ({
      name: r.name,
      url: r.search + query,
      tagline: r.tagline,
      badge: (!specificLinks.length && i === 0) ? r.badge : null,
    }));

  const allLinks = [
    ...specificLinks.map(l => ({
      name: l.retailer, url: l.url, tagline: '', badge: l.isBest ? '★ Best Price' : null, price: l.price,
    })),
    ...autoLinks,
  ];

  const cards = allLinks.map(link => {
    const badgeHtml = link.badge ? `<div class="buy-badge">${link.badge}</div>` : '';
    const priceHtml = link.price != null
      ? `<div class="buy-cta buy-price-tag">$${link.price.toFixed(2)} / tin</div>`
      : `<div class="buy-cta">Shop Now →</div>`;
    return `<a href="${link.url}" target="_blank" rel="noopener noreferrer" class="buy-card${link.badge ? ' buy-card-top' : ''}">
      ${badgeHtml}
      <div class="buy-card-name">${link.name}</div>
      <div class="buy-card-tagline">${link.tagline}</div>
      ${priceHtml}
    </a>`;
  }).join('');

  return `
    <div class="modal-buy-section">
      <div class="modal-section-title">Where to Buy</div>
      <div class="buy-cards-grid">${cards}</div>
      <p class="buy-disclaimer">Prices vary and change often — click through for current pricing.</p>
    </div>`;
}

function renderPTCard(pt, index) {
  const sc = strengthConfig(pt.strength);
  const bc = ptBlendColor(pt.blendType);

  const dots = Array.from({ length: 5 }, (_, i) => {
    const filled = i < pt.strength;
    return `<div class="strength-dot${filled ? ' filled' : ''}" style="${filled ? `--strength-val:${sc.color}` : ''}"></div>`;
  }).join('');

  const roomStars = Array.from({ length: 5 }, (_, i) =>
    `<span style="color:${i < pt.roomNote ? '#c9943a' : 'var(--text-muted)'}">★</span>`
  ).join('');

  const topFlavors = pt.flavors.slice(0, 4).map(f => `<span class="flavor-tag">${f}</span>`).join('');

  const cardImg = pt.image
    ? `<div class="card-img-wrap"><img class="card-img" src="${pt.image}" alt="${pt.name}" loading="lazy" onerror="this.parentElement.style.display='none'"></div>`
    : '';

  return `
    <article class="cigar-card${pt.image ? ' has-img' : ''}" data-pt-id="${pt.id}" style="animation-delay:${Math.min(index * 0.04, 0.5)}s" role="button" tabindex="0">
      ${cardImg}
      <div class="card-header">
        <span class="card-origin-badge" style="background:${bc}22;color:${bc};border-color:${bc}44">${pt.blendType}</span>
        <div>
          <div class="card-rating">${pt.rating}</div>
          <span class="card-rating-label">pts</span>
        </div>
      </div>
      <div class="card-name">${pt.name}</div>
      <div class="card-brand">${pt.brand}</div>
      <div class="strength-row">
        <span class="strength-label">Strength</span>
        <div class="strength-dots">${dots}</div>
        <span class="strength-text" style="color:${sc.color}">${sc.label}</span>
      </div>
      <div class="card-details">
        <div class="detail-item">
          <span class="detail-label">Cut</span>
          <span class="detail-value">${pt.cut}</span>
        </div>
        <div class="detail-item">
          <span class="detail-label">Tin</span>
          <span class="detail-value">${pt.tinWeight}g</span>
        </div>
        <div class="detail-item">
          <span class="detail-label">Room Note</span>
          <span class="detail-value" style="letter-spacing:1px;font-size:13px">${roomStars}</span>
        </div>
        <div class="detail-item">
          <span class="detail-label">Price / Tin</span>
          <span class="detail-value price">$${pt.price.toFixed(2)}</span>
        </div>
      </div>
      <div class="flavor-tags">${topFlavors}</div>
    </article>`;
}

function renderPTListCard(pt) {
  const sc = strengthConfig(pt.strength);
  const bc = ptBlendColor(pt.blendType);
  const dots = Array.from({ length: 5 }, (_, i) => {
    const filled = i < pt.strength;
    return `<div class="strength-dot${filled ? ' filled' : ''}" style="${filled ? `--strength-val:${sc.color}` : ''}"></div>`;
  }).join('');

  return `
    <article class="cigar-card" data-pt-id="${pt.id}" role="button" tabindex="0">
      <div class="card-left">
        <div class="card-name">${pt.name}</div>
        <div class="card-brand">${pt.brand} · <span style="color:${bc}">${pt.blendType}</span> · ${pt.origin}</div>
        <div class="card-details">
          <div class="detail-item"><span class="detail-label">Cut:</span><span class="detail-value">${pt.cut}</span></div>
          <div class="detail-item"><span class="detail-label">Components:</span><span class="detail-value">${pt.components.join(', ')}</span></div>
          <div class="detail-item"><span class="detail-label">Tin:</span><span class="detail-value">${pt.tinWeight}g</span></div>
        </div>
        <div class="strength-row" style="margin-top:8px">
          <div class="strength-dots">${dots}</div>
          <span class="strength-text" style="color:${sc.color}">${sc.label}</span>
        </div>
      </div>
      <div class="card-right">
        <div class="card-rating">${pt.rating}<span class="card-rating-label">pts</span></div>
        <div class="detail-value price" style="font-size:16px">$${pt.price.toFixed(2)}</div>
      </div>
    </article>`;
}

function openPTModal(id) {
  const pt = PIPE_TOBACCOS.find(p => p.id === id);
  if (!pt) return;

  const sc = strengthConfig(pt.strength);
  const bc = ptBlendColor(pt.blendType);
  const strengthPct = (pt.strength / 5) * 100;

  const flavorChips = pt.flavors.map(f => {
    const icon = FLAVOR_ICONS[f] || '·';
    return `<span class="flavor-chip">${icon} ${f}</span>`;
  }).join('');

  const componentsHtml = pt.components.map(c => `<span class="flavor-chip">🌿 ${c}</span>`).join('');
  const pairingItems = (pt.pairings || []).map(p => `<span class="pairing-item">🥃 ${p}</span>`).join('');

  const roomStarsHtml = Array.from({ length: 5 }, (_, i) =>
    `<span style="color:${i < pt.roomNote ? '#c9943a' : 'rgba(201,168,76,0.25)'}; font-size:18px">★</span>`
  ).join('');

  const modalImg = pt.image
    ? `<div class="modal-hero-img-wrap"><img class="modal-hero-img" src="${pt.image}" alt="${pt.name}" loading="lazy" onerror="this.parentElement.style.display='none'"></div>`
    : '';

  $modalBody.innerHTML = `
    <div class="modal-header">
      <div class="modal-badges">
        <span class="modal-badge origin" style="background:${bc}22;color:${bc};border-color:${bc}44">${pt.blendType}</span>
        <span class="modal-badge">${pt.cut}</span>
        <span class="modal-badge">${pt.origin}</span>
        <span class="modal-badge">${pt.tinWeight}g tin</span>
      </div>
      <h2 class="modal-title">${pt.name}</h2>
      <div class="modal-brand">${pt.brand}</div>
    </div>

    ${modalImg}

    <div class="modal-stats-row">
      <div class="modal-stat-box">
        <div class="msb-val">${pt.rating}</div>
        <div class="msb-label">Expert Rating</div>
      </div>
      <div class="modal-stat-box">
        <div class="msb-val">$${pt.price.toFixed(2)}</div>
        <div class="msb-label">Per Tin</div>
      </div>
      <div class="modal-stat-box">
        <div class="msb-val" style="letter-spacing:2px;font-size:18px">${roomStarsHtml}</div>
        <div class="msb-label">Room Note</div>
      </div>
      <div class="modal-strength-full">
        <div class="msf-label">Body &amp; Strength</div>
        <div class="msf-bar-track">
          <div class="msf-bar-fill" style="width:${strengthPct}%; --fill-end:${sc.color}"></div>
        </div>
        <div class="msf-text" style="color:${sc.color}">${sc.label}</div>
      </div>
    </div>

    <div class="modal-description">${pt.description}</div>

    <div class="modal-specs">
      <div class="spec-item">
        <div class="spec-label">Blend Type</div>
        <div class="spec-value" style="color:${bc}">${pt.blendType}</div>
      </div>
      <div class="spec-item">
        <div class="spec-label">Cut</div>
        <div class="spec-value">${pt.cut}</div>
      </div>
      <div class="spec-item">
        <div class="spec-label">Tin Weight</div>
        <div class="spec-value">${pt.tinWeight}g</div>
      </div>
      <div class="spec-item">
        <div class="spec-label">Origin</div>
        <div class="spec-value">${pt.origin}</div>
      </div>
    </div>

    <div class="modal-flavors">
      <div class="modal-section-title">Leaf Components</div>
      <div class="flavor-chips">${componentsHtml}</div>
    </div>

    <div class="modal-flavors">
      <div class="modal-section-title">Flavor Profile</div>
      <div class="flavor-wheel-wrap">
        ${buildFlavorWheel(pt.flavors)}
      </div>
      <div class="flavor-chips">${flavorChips}</div>
    </div>

    ${pairingItems ? `
    <div class="modal-pairings">
      <div class="modal-section-title">Pairs Well With</div>
      <div class="pairing-list">${pairingItems}</div>
    </div>` : ''}

    ${buildPTBuySection(pt)}
  `;

  $modalOverlay.classList.remove('hidden');
  document.body.style.overflow = 'hidden';
  $modal.scrollTop = 0;
  history.pushState({ ptId: id }, '', '/#/tobacco/' + id);
  document.title = pt.name + ' — Vitola Pedia';
}

function renderPT() {
  const filtered = sortPT(getFilteredPT());
  const count = filtered.length;
  const $ptCount = document.getElementById('ptResultsCount');
  const $ptNoResults = document.getElementById('ptNoResults');
  const $ptGrid = document.getElementById('ptGrid');
  if (!$ptGrid) return;

  if ($ptCount) $ptCount.innerHTML = `<strong>${count}</strong> blend${count !== 1 ? 's' : ''} found`;
  if ($ptNoResults) $ptNoResults.classList.toggle('hidden', count > 0);
  $ptGrid.innerHTML = '';
  if (count === 0) return;

  $ptGrid.innerHTML = ptState.view === 'list'
    ? filtered.map(pt => renderPTListCard(pt)).join('')
    : filtered.map((pt, i) => renderPTCard(pt, i)).join('');

  $ptGrid.classList.toggle('list-view', ptState.view === 'list');

  $ptGrid.querySelectorAll('.cigar-card[data-pt-id]').forEach(card => {
    const open = (e) => {
      if (e.target && e.target.closest && e.target.closest('.card-heart-btn')) return;
      openPTModal(card.dataset.ptId);
    };
    card.addEventListener('click', open);
    card.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(e); } });
  });

  if (window.VP && VP.onGridRender) VP.onGridRender($ptGrid);
}

function bindPTpills(containerId, stateKey) {
  const container = document.getElementById(containerId);
  if (!container) return;
  container.addEventListener('click', e => {
    const pill = e.target.closest('.pill');
    if (!pill) return;
    container.querySelectorAll('.pill').forEach(p => p.classList.remove('active'));
    pill.classList.add('active');
    ptState[stateKey] = pill.dataset.value;
    renderPT();
  });
}

function updatePTPriceRangeStyle() {
  const $r = document.getElementById('ptPriceRange');
  if (!$r) return;
  const pct = ((ptState.maxPrice - 5) / (50 - 5)) * 100;
  $r.style.setProperty('--pct', `${pct}%`);
}

function initPipeTobacco() {
  if (!PIPE_TOBACCOS || !PIPE_TOBACCOS.length) return;

  const $ptStat = document.getElementById('ptStatTotal');
  if ($ptStat) $ptStat.textContent = PIPE_TOBACCOS.length;

  const $ptBrand = document.getElementById('ptBrandSelect');
  if ($ptBrand) {
    const brands = [...new Set(PIPE_TOBACCOS.map(p => p.brand))].sort();
    brands.forEach(b => {
      const opt = document.createElement('option');
      opt.value = b; opt.textContent = b;
      $ptBrand.appendChild(opt);
    });
    $ptBrand.addEventListener('change', e => { ptState.brand = e.target.value; renderPT(); });
  }

  const $ptSearch = document.getElementById('ptSearchInput');
  const $ptClr = document.getElementById('ptSearchClear');
  if ($ptSearch) {
    $ptSearch.addEventListener('input', e => {
      ptState.search = e.target.value.trim();
      if ($ptClr) $ptClr.classList.toggle('visible', ptState.search.length > 0);
      renderPT();
    });
  }
  if ($ptClr) {
    $ptClr.addEventListener('click', () => {
      if ($ptSearch) $ptSearch.value = '';
      ptState.search = '';
      $ptClr.classList.remove('visible');
      renderPT();
    });
  }

  const $ptSort = document.getElementById('ptSortSelect');
  if ($ptSort) $ptSort.addEventListener('change', e => { ptState.sort = e.target.value; renderPT(); });

  bindPTpills('ptBlendFilter', 'blendType');
  bindPTpills('ptCutFilter', 'cut');
  bindPTpills('ptStrengthFilter', 'strength');

  const $ptPrice = document.getElementById('ptPriceRange');
  const $ptPriceLabel = document.getElementById('ptPriceLabel');
  if ($ptPrice) {
    $ptPrice.addEventListener('input', e => {
      ptState.maxPrice = parseInt(e.target.value);
      if ($ptPriceLabel) $ptPriceLabel.textContent = ptState.maxPrice >= 50 ? 'All prices' : `Up to $${ptState.maxPrice}`;
      updatePTPriceRangeStyle();
      renderPT();
    });
    updatePTPriceRangeStyle();
  }

  const resetPT = () => {
    ptState.search = ''; ptState.brand = 'all'; ptState.blendType = 'all';
    ptState.cut = 'all'; ptState.strength = 'all'; ptState.maxPrice = 50;
    if ($ptSearch) $ptSearch.value = '';
    if ($ptClr) $ptClr.classList.remove('visible');
    if ($ptBrand) $ptBrand.value = 'all';
    if ($ptPrice) { $ptPrice.value = 50; updatePTPriceRangeStyle(); }
    if ($ptPriceLabel) $ptPriceLabel.textContent = 'All prices';
    ['ptBlendFilter','ptCutFilter','ptStrengthFilter'].forEach(id => {
      const el = document.getElementById(id);
      if (!el) return;
      el.querySelectorAll('.pill').forEach(p => p.classList.remove('active'));
      const allPill = el.querySelector('.pill[data-value="all"]');
      if (allPill) allPill.classList.add('active');
    });
    renderPT();
  };

  const $ptReset = document.getElementById('ptResetFilters');
  if ($ptReset) $ptReset.addEventListener('click', resetPT);
  const $ptNR = document.getElementById('ptNoResultsReset');
  if ($ptNR) $ptNR.addEventListener('click', resetPT);

  const $ptMobileBtn = document.getElementById('ptMobileFilterBtn');
  const $ptFiltersPanel = document.getElementById('ptFiltersPanel');
  const $ptFilterOverlay = document.getElementById('ptFilterOverlay');
  const $ptFilterClose = document.getElementById('ptFiltersMobileClose');
  if ($ptMobileBtn && $ptFiltersPanel && $ptFilterOverlay) {
    $ptMobileBtn.addEventListener('click', () => {
      $ptFiltersPanel.classList.add('open');
      $ptFilterOverlay.classList.remove('hidden');
    });
    const closePTFilters = () => {
      $ptFiltersPanel.classList.remove('open');
      $ptFilterOverlay.classList.add('hidden');
    };
    $ptFilterOverlay.addEventListener('click', closePTFilters);
    if ($ptFilterClose) $ptFilterClose.addEventListener('click', closePTFilters);
  }

  const $ptViewGrid = document.getElementById('ptViewGrid');
  const $ptViewList = document.getElementById('ptViewList');
  if ($ptViewGrid && $ptViewList) {
    $ptViewGrid.addEventListener('click', () => {
      ptState.view = 'grid'; $ptViewGrid.classList.add('active'); $ptViewList.classList.remove('active'); renderPT();
    });
    $ptViewList.addEventListener('click', () => {
      ptState.view = 'list'; $ptViewList.classList.add('active'); $ptViewGrid.classList.remove('active'); renderPT();
    });
  }

  renderPT();
}

// ── FLAVOR WHEEL SVG ─────────────────────────────────────────────
function buildFlavorWheel(flavors) {
  const categories = {
    'Earth & Wood': { color: '#7a5c3a', flavors: ['Earth', 'Cedar', 'Wood', 'Barnyard', 'Hay', 'Grass', 'Tobacco', 'Dark Earth'] },
    'Spice': { color: '#c94040', flavors: ['Pepper', 'Spice', 'Sweet Spice', 'Mild Pepper', 'Mild Spice', 'White Pepper'] },
    'Coffee & Cocoa': { color: '#6b3f2a', flavors: ['Coffee', 'Dark Coffee', 'Roasted Coffee', 'Espresso', 'Mild Coffee', 'Dark Chocolate', 'Cocoa', 'Chocolate'] },
    'Cream & Sweet': { color: '#c9a84c', flavors: ['Cream', 'Vanilla', 'Caramel', 'Honey', 'Toast', 'Almond', 'Nuts', 'Sweet'] },
    'Leather': { color: '#8b5e3c', flavors: ['Leather', 'Tar', 'Charcoal'] },
    'Floral & Fruit': { color: '#7a8c5e', flavors: ['Floral', 'Dark Fruit', 'Dried Fruit', 'Raisin', 'Herbal'] }
  };

  const cx = 120, cy = 120, r = 100, innerR = 28;
  const catKeys = Object.keys(categories);
  const sliceAngle = (2 * Math.PI) / catKeys.length;
  let svgPaths = '';
  let svgLabels = '';

  catKeys.forEach((cat, i) => {
    const conf = categories[cat];
    const matchCount = flavors.filter(f => conf.flavors.includes(f)).length;
    const hasMatch = matchCount > 0;
    const startAngle = i * sliceAngle - Math.PI / 2;
    const endAngle = startAngle + sliceAngle - 0.04;

    // Outer radius based on match
    const outerR = hasMatch ? r : r * 0.55;
    const opacity = hasMatch ? 0.85 : 0.18;

    const x1 = cx + innerR * Math.cos(startAngle);
    const y1 = cy + innerR * Math.sin(startAngle);
    const x2 = cx + outerR * Math.cos(startAngle);
    const y2 = cy + outerR * Math.sin(startAngle);
    const x3 = cx + outerR * Math.cos(endAngle);
    const y3 = cy + outerR * Math.sin(endAngle);
    const x4 = cx + innerR * Math.cos(endAngle);
    const y4 = cy + innerR * Math.sin(endAngle);

    svgPaths += `<path d="M${x1},${y1} L${x2},${y2} A${outerR},${outerR} 0 0,1 ${x3},${y3} L${x4},${y4} A${innerR},${innerR} 0 0,0 ${x1},${y1} Z"
      fill="${conf.color}" opacity="${opacity}" stroke="${conf.color}" stroke-width="1" stroke-opacity="0.3"/>`;

    // Label at midpoint
    const midAngle = startAngle + sliceAngle / 2;
    const labelR = hasMatch ? r * 0.78 : r * 0.4;
    const lx = cx + labelR * Math.cos(midAngle);
    const ly = cy + labelR * Math.sin(midAngle);
    const shortLabel = cat.split(' &')[0].split(' ')[0];

    svgLabels += `<text x="${lx}" y="${ly}" text-anchor="middle" dominant-baseline="middle"
      fill="${hasMatch ? '#f0ead8' : '#4a3d28'}" font-size="${hasMatch ? 9 : 8}" font-family="Inter,sans-serif" font-weight="${hasMatch ? 600 : 400}">${shortLabel}</text>`;
  });

  return `
    <svg id="flavorWheelSvg" viewBox="0 0 240 240" xmlns="http://www.w3.org/2000/svg">
      <circle cx="${cx}" cy="${cy}" r="${r + 6}" fill="none" stroke="rgba(201,168,76,0.1)" stroke-width="1"/>
      ${svgPaths}
      ${svgLabels}
      <circle cx="${cx}" cy="${cy}" r="${innerR}" fill="#1e1912" stroke="rgba(201,168,76,0.2)" stroke-width="1"/>
      <text x="${cx}" y="${cy - 4}" text-anchor="middle" fill="#c9a84c" font-size="8" font-family="Inter,sans-serif" font-weight="600" letter-spacing="0.08em">FLAVOR</text>
      <text x="${cx}" y="${cy + 6}" text-anchor="middle" fill="#c9a84c" font-size="8" font-family="Inter,sans-serif" font-weight="600" letter-spacing="0.08em">PROFILE</text>
    </svg>
  `;
}

// ── REGIONS DATA ─────────────────────────────────────────────────
const REGIONS_DATA = [
  {
    flag: '🇨🇺',
    name: 'Vuelta Abajo',
    country: 'Cuba',
    description: 'Considered the world\'s finest tobacco-growing region, Vuelta Abajo in Pinar del Río province produces leaves of incomparable complexity. The combination of red clay soil, subtropical humidity, and maritime breezes creates conditions found nowhere else on Earth. Home to Cohiba, Montecristo, Partagás, and virtually every great Cuban brand.',
    traits: ['Complex', 'Earthy', 'Creamy', 'Cedar', 'Floral', 'Silky Ash'],
    id: 'Cuba'
  },
  {
    flag: '🇳🇮',
    name: 'Jalapa Valley',
    country: 'Nicaragua',
    description: 'Nicaragua\'s crown jewel sits at high altitude (1,800–2,100 ft) in the northeastern highlands. The cooler temperatures and mineral-rich volcanic soil produce tobacco with exceptional sweetness and complexity. Home to Padrón and Oliva, Jalapa tobacco is the reason Nicaragua became a world-class cigar origin.',
    traits: ['Sweet', 'Cocoa', 'Coffee', 'Complex', 'Volcanic', 'Cool Burn'],
    id: 'Nicaragua'
  },
  {
    flag: '🇳🇮',
    name: 'Estelí',
    country: 'Nicaragua',
    description: 'The powerhouse of Nicaraguan tobacco, Estelí sits in a valley surrounded by mountains that trap heat and moisture. The result is a bolder, earthier, more pepper-forward tobacco than Jalapa. Estelí is where Drew Estate, My Father, and Rocky Patel craft their boldest blends.',
    traits: ['Bold', 'Peppery', 'Earthy', 'Leather', 'Full Body', 'Volcanic'],
    id: 'Nicaragua'
  },
  {
    flag: '🇩🇴',
    name: 'Cibao Valley',
    country: 'Dominican Republic',
    description: 'The fertile Cibao Valley in the Dominican Republic\'s interior produces the mildest, most refined tobacco in the New World. Dominican tobacco is renowned for its creaminess and smooth character — the reason Arturo Fuente, Davidoff, and Macanudo chose this island for their operations.',
    traits: ['Mild', 'Creamy', 'Smooth', 'Nutty', 'Refined', 'Low Nicotine'],
    id: 'Dominican Republic'
  },
  {
    flag: '🇩🇴',
    name: 'Chateau de la Fuente',
    country: 'Dominican Republic',
    description: 'A single private estate in the Dominican Republic, owned by the Fuente family. Previously used for flower cultivation, Carlos Fuente Jr. transformed it into the world\'s most coveted private tobacco farm. The only source of the Opus X\'s legendary rosado wrapper — a wrapper the industry said could never exist in the Dominican Republic.',
    traits: ['Exclusive', 'Rosado Wrapper', 'Complex', 'Spicy', 'Limited', 'Bold'],
    id: 'Dominican Republic'
  },
  {
    flag: '🇭🇳',
    name: 'Jamastran Valley',
    country: 'Honduras',
    description: 'Honduras\'s most prestigious growing region sits in a narrow valley that traps tropical warmth and moisture. Jamastran tobacco has a rich, full-bodied character with earthy depth and natural sweetness. Alec Bradley\'s award-winning Prensado and Camacho\'s legendary Corojo both originate here.',
    traits: ['Rich', 'Full Body', 'Earth', 'Natural Sweetness', 'Robust', 'Bold'],
    id: 'Honduras'
  },
  {
    flag: '🇬🇹',
    name: 'Jalapa-Cobán',
    country: 'Guatemala',
    description: 'Guatemala\'s high-altitude growing regions in the Verapaz highlands produce tobacco with a distinctive mineral quality shaped by volcanic soil and dramatic temperature swings between day and night. Guatemalan Habano wrappers are prized for their strength and complexity, used extensively in Honduran and Nicaraguan blends.',
    traits: ['Mineral', 'Bold', 'Volcanic', 'Earthy', 'High Altitude', 'Complex'],
    id: 'Guatemala'
  },
  {
    flag: '🇪🇨',
    name: 'Ecuador (Shade-Grown)',
    country: 'Ecuador',
    description: 'Ecuador\'s equatorial cloud cover provides a natural "tent" effect — diffusing sunlight just as shade cloth does in Connecticut. This produces thin, silky, mild wrappers at a fraction of the cost of true Connecticut Shade. Ecuadorian Connecticut wrappers are now the most widely used mild wrappers in the premium cigar industry.',
    traits: ['Silky', 'Mild', 'Thin Leaf', 'Creamy', 'Natural Tent', 'Economical'],
    id: 'Ecuador'
  }
];

function renderRegions() {
  const regionsGrid = document.getElementById('regionsGrid');
  regionsGrid.innerHTML = REGIONS_DATA.map(r => {
    const count = CIGARS.filter(c => c.origin === r.id).length;
    const countDisplay = count > 0
      ? `<div class="region-cigars-count">In our library: <strong>${count} cigars</strong> from ${r.country}</div>`
      : '';
    const traits = r.traits.map(t => `<span class="region-trait">${t}</span>`).join('');
    return `
      <div class="region-card">
        <div class="region-card-header">
          <div class="region-flag">${r.flag}</div>
          <div class="region-name">${r.name}</div>
          <div class="region-country">${r.country}</div>
        </div>
        <div class="region-card-body">
          <p class="region-body-text">${r.description}</p>
          <div class="region-traits">${traits}</div>
          ${countDisplay}
        </div>
      </div>
    `;
  }).join('');
}

// ── VIEW SWITCHING ────────────────────────────────────────────────
function switchView(viewName) {
  state.currentView = viewName;

  const views = ['library', 'regions', 'guide', 'pipe-tobacco', 'lounge', 'houses'];
  views.forEach(v => {
    const el = document.getElementById(`view-${v}`);
    if (el) el.classList.toggle('hidden', v !== viewName);
  });

  // main-content (cigar library) visibility
  const mainContent = document.querySelector('.main-content');
  if (mainContent) mainContent.classList.toggle('hidden', viewName !== 'library');

  // shelves — shown below the lounge only
  const shelves = document.getElementById('shelves');
  if (shelves) shelves.classList.toggle('hidden', viewName !== 'lounge');


  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.view === viewName);
  });

  if (viewName === 'regions') renderRegions();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ── FILTER PILL HANDLER ──────────────────────────────────────────
function bindPills(containerId, stateKey) {
  const container = document.getElementById(containerId);
  if (!container) return;
  container.addEventListener('click', e => {
    const pill = e.target.closest('.pill');
    if (!pill) return;
    container.querySelectorAll('.pill').forEach(p => p.classList.remove('active'));
    pill.classList.add('active');
    state[stateKey] = pill.dataset.value;
    render();
  });
}

// ── PRICE RANGE VISUAL UPDATE ────────────────────────────────────
function updatePriceRangeStyle() {
  const min = 5, max = 65;
  const pct = ((state.maxPrice - min) / (max - min)) * 100;
  $priceRange.style.setProperty('--pct', `${pct}%`);
}

// ── FLAVOR SEARCH ────────────────────────────────────────────────
function initFlavorSearch() {
  const allFlavors = [...new Set(CIGARS.flatMap(c => c.flavors))].sort();
  const $input = document.getElementById('flavorSearch');
  const $clr   = document.getElementById('flavorSearchClr');
  const $drop  = document.getElementById('flavorDropdown');

  const PREVIEW_CATEGORIES = [
    { label: 'Earth & Wood',    keywords: ['earth','cedar','wood','barnyard','hay','grass','tobacco','damp','dark earth','charred wood','smoked wood','dark wood','light cedar','mild cedar','toasted cedar','sweet cedar','rich tobacco'] },
    { label: 'Spice',           keywords: ['pepper','spice','cinnamon','clove','nutmeg','anise','chili','licorice','star anise'] },
    { label: 'Coffee & Cocoa',  keywords: ['coffee','espresso','mocha','cocoa','chocolate','cacao','dark roast'] },
    { label: 'Cream & Sweet',   keywords: ['cream','vanilla','caramel','honey','butter','sugar','toast','almond','nut','waffle','oatmeal','graham','marshmallow','milk chocolate','sweet','molasses'] },
    { label: 'Leather & Smoke', keywords: ['leather','tar','charcoal','smoke','hickory','campfire','mesquite','bbq','latakia'] },
    { label: 'Floral & Fruit',  keywords: ['floral','cherry','raisin','fruit','plum','grape','citrus','orange','apricot','herbal','herb','dried herb','earl grey'] },
  ];

  function buildPreviewHtml() {
    let html = '';
    const used = new Set();
    for (const cat of PREVIEW_CATEGORIES) {
      const matches = allFlavors.filter(f => {
        const fl = f.toLowerCase();
        return !used.has(f) && cat.keywords.some(k => fl.includes(k));
      });
      if (!matches.length) continue;
      matches.forEach(f => used.add(f));
      html += `<li class="flavor-dd-header">${cat.label}</li>`;
      html += matches.map(f => `<li>${f}</li>`).join('');
    }
    // Anything uncategorised
    const rest = allFlavors.filter(f => !used.has(f));
    if (rest.length) {
      html += `<li class="flavor-dd-header">Other</li>`;
      html += rest.map(f => `<li>${f}</li>`).join('');
    }
    return html;
  }

  const previewHtml = buildPreviewHtml();

  function showPreview() {
    $drop.innerHTML = previewHtml;
    $drop.classList.remove('hidden');
    $drop.scrollTop = 0;
  }

  function clearFlavorSearch() {
    $input.value = '';
    $input.classList.remove('flavor-active');
    $clr.classList.remove('visible');
    $drop.classList.add('hidden');
    $drop.innerHTML = '';
  }

  function applyFlavorNote(note) {
    $input.value = note;
    $input.classList.add('flavor-active');
    $clr.classList.add('visible');
    $drop.classList.add('hidden');
    document.querySelectorAll('#flavorFilter .pill').forEach(p => p.classList.remove('active'));
    state.flavor = note;
    render();
  }

  $input.addEventListener('focus', () => {
    if (!$input.value.trim()) showPreview();
  });

  $input.addEventListener('input', () => {
    const q = $input.value.trim();
    if (!q) {
      $input.classList.remove('flavor-active');
      $clr.classList.remove('visible');
      showPreview();
      const allPill = document.querySelector('#flavorFilter .pill[data-value="all"]');
      if (allPill) allPill.classList.add('active');
      state.flavor = 'all';
      render();
      return;
    }
    const matches = allFlavors.filter(f => f.toLowerCase().includes(q.toLowerCase()));
    $drop.innerHTML = matches.map(f => `<li>${f}</li>`).join('');
    $drop.classList.toggle('hidden', matches.length === 0);
    $clr.classList.add('visible');
    $input.classList.add('flavor-active');
    state.flavor = q;
    render();
  });

  $drop.addEventListener('click', e => {
    const li = e.target.closest('li');
    if (!li || li.classList.contains('flavor-dd-header')) return;
    applyFlavorNote(li.textContent);
  });

  $clr.addEventListener('click', () => {
    clearFlavorSearch();
    const allPill = document.querySelector('#flavorFilter .pill[data-value="all"]');
    if (allPill) allPill.classList.add('active');
    state.flavor = 'all';
    render();
  });

  document.addEventListener('click', e => {
    if (!e.target.closest('.flavor-search-wrap')) {
      $drop.classList.add('hidden');
    }
  });

  window._clearFlavorSearch = clearFlavorSearch;
}

// ── INIT ─────────────────────────────────────────────────────────
function init() {
  // Hero stats are derived, never hand-typed — the hardcoded ones had
  // drifted well out of date as the library grew.
  $totalStat.textContent = CIGARS.length.toLocaleString();
  const setStat = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
  };
  setStat('statBrands', new Set(CIGARS.map(c => c.brand)).size);
  setStat('statCountries', new Set(CIGARS.map(c => c.origin)).size);
  setStat('statFlavors', new Set(CIGARS.flatMap(c => c.flavors || [])).size);

  bindGridDelegation();

  // Belt and braces: momentum scrolling can outrun the observer.
  let scrollTick = false;
  window.addEventListener('scroll', () => {
    if (scrollTick) return;
    scrollTick = true;
    requestAnimationFrame(() => { scrollTick = false; fillViewport(); });
  }, { passive: true });

  // Populate brand dropdown
  const $brandSelect = document.getElementById('brandSelect');
  const brands = [...new Set(CIGARS.map(c => c.brand))].sort();
  brands.forEach(b => {
    const opt = document.createElement('option');
    opt.value = b;
    opt.textContent = b;
    $brandSelect.appendChild(opt);
  });
  $brandSelect.addEventListener('change', e => {
    state.brand = e.target.value;
    render();
  });

  // Initial render
  render();

  // Search
  $search.addEventListener('input', e => {
    state.search = e.target.value.trim();
    $searchClr.classList.toggle('visible', state.search.length > 0);
    render();
  });
  $searchClr.addEventListener('click', () => {
    $search.value = '';
    state.search = '';
    $searchClr.classList.remove('visible');
    render();
  });

  // Sort
  $sort.addEventListener('change', e => {
    state.sort = e.target.value;
    render();
  });

  // Filters
  bindPills('strengthFilter', 'strength');
  bindPills('originFilter', 'origin');
  bindPills('wrapperFilter', 'wrapper');
  bindPills('flavorFilter', 'flavor');
  // Clear flavor search when a quick-access pill is clicked
  document.getElementById('flavorFilter').addEventListener('click', e => {
    if (e.target.closest('.pill') && window._clearFlavorSearch) window._clearFlavorSearch();
  });
  bindPills('timeFilter', 'time');
  initFlavorSearch();

  // Price range
  $priceRange.addEventListener('input', e => {
    state.maxPrice = parseInt(e.target.value);
    $priceLabel.textContent = state.maxPrice >= 65 ? 'All prices' : `Up to $${state.maxPrice}`;
    updatePriceRangeStyle();
    render();
  });
  updatePriceRangeStyle();

  // Limited toggle
  $limited.addEventListener('change', e => {
    state.limitedOnly = e.target.checked;
    render();
  });

  // View toggle
  $viewGrid.addEventListener('click', () => {
    state.view = 'grid';
    $viewGrid.classList.add('active');
    $viewList.classList.remove('active');
    render();
  });
  $viewList.addEventListener('click', () => {
    state.view = 'list';
    $viewList.classList.add('active');
    $viewGrid.classList.remove('active');
    render();
  });

  // Modal close
  $modalClose.addEventListener('click', closeModal);
  $modalOverlay.addEventListener('click', e => {
    if (e.target === $modalOverlay) closeModal();
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') closeModal();
  });

  // Nav buttons
  document.querySelectorAll('.nav-btn, .footer-nav-btn').forEach(btn => {
    btn.addEventListener('click', () => switchView(btn.dataset.view));
  });

  // Mobile filter
  const $mobileFilterBtn = document.getElementById('mobileFilterBtn');
  if ($mobileFilterBtn) {
    $mobileFilterBtn.addEventListener('click', () => {
      $filtersPanel.classList.add('open');
      $filterOverlay.classList.remove('hidden');
    });
  }
  const closeFilters = () => {
    $filtersPanel.classList.remove('open');
    $filterOverlay.classList.add('hidden');
  };
  $filterOverlay.addEventListener('click', closeFilters);
  document.getElementById('filtersMobileClose').addEventListener('click', closeFilters);

  // Reset buttons
  const resetAll = () => {
    state.brand = 'all';
    state.strength = 'all';
    state.origin = 'all';
    state.wrapper = 'all';
    state.flavor = 'all';
    state.time = 'all';
    state.maxPrice = 65;
    state.limitedOnly = false;
    state.search = '';
    $search.value = '';
    $searchClr.classList.remove('visible');
    $priceRange.value = 65;
    $priceLabel.textContent = 'All prices';
    updatePriceRangeStyle();
    $limited.checked = false;
    document.getElementById('brandSelect').value = 'all';
    document.querySelectorAll('.pill.active').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.pill[data-value="all"]').forEach(p => p.classList.add('active'));
    if (window._clearFlavorSearch) window._clearFlavorSearch();
    render();
  };
  document.getElementById('resetFilters').addEventListener('click', resetAll);
  document.getElementById('noResultsReset').addEventListener('click', resetAll);
}

// ── COMPARE ──────────────────────────────────────────────────────
const compareList = [];
const COMPARE_MAX = 4;   // four fits a radar and a table without either going unreadable

function toggleCompare(id, e) {
  if (e) e.stopPropagation();
  const idx = compareList.indexOf(id);
  if (idx > -1) {
    compareList.splice(idx, 1);
  } else {
    if (compareList.length >= COMPARE_MAX) return;
    compareList.push(id);
  }
  updateCompareTray();
  // refresh compare button states on visible cards
  document.querySelectorAll('.cigar-card').forEach(card => {
    const btn = card.querySelector('.card-compare-btn');
    if (btn) btn.classList.toggle('in-compare', compareList.includes(card.dataset.id));
  });
}

function updateCompareTray() {
  const tray = document.getElementById('compareTray');
  const slots = document.getElementById('compareSlots');
  const goBtn = document.getElementById('compareGoBtn');

  if (compareList.length === 0) {
    tray.classList.add('hidden');
    return;
  }
  tray.classList.remove('hidden');

  const empties = COMPARE_MAX - compareList.length;
  let html = compareList.map(id => {
    const c = CIGARS.find(x => x.id === id);
    return `<div class="compare-slot">
      <span class="compare-slot-name">${c ? c.name : id}</span>
      <button class="compare-slot-remove" onclick="toggleCompare('${id}', event)">✕</button>
    </div>`;
  }).join('');
  for (let i = 0; i < empties; i++) {
    html += `<div class="compare-slot-empty">+ Add a cigar</div>`;
  }
  slots.innerHTML = html;
  goBtn.disabled = compareList.length < 2;
  goBtn.textContent = compareList.length > 2
    ? `Compare ${compareList.length} Side by Side` : 'Compare Side by Side';
}

// ── COMPARE — up to four, radar + spec table ─────────────────────
const COMPARE_COLORS = ['#c9a84c', '#7fc99e', '#8fb8d8', '#e07b3a'];

/* The five axes worth overlaying. Each is normalised to 0–1 against the
   whole library so the shape means something beyond the chosen few. */
const RADAR_AXES = [
  { key: 'strength',    label: 'Body',      get: c => c.strength,    min: 1, max: 5 },
  { key: 'rating',      label: 'Rating',    get: c => c.rating,      min: 82, max: 100 },
  { key: 'price',       label: 'Price',     get: c => c.price,       min: 0, max: 60 },
  { key: 'smokingTime', label: 'Length',    get: c => c.smokingTime, min: 20, max: 120 },
  { key: 'ringGauge',   label: 'Ring',      get: c => c.ringGauge,   min: 30, max: 64 },
];

function buildCompareRadar(cigars) {
  const R = 92, CX = 150, CY = 120;
  const n = RADAR_AXES.length;
  const pt = (i, r) => {
    const a = (Math.PI * 2 * i) / n - Math.PI / 2;
    return [CX + Math.cos(a) * r, CY + Math.sin(a) * r];
  };

  let rings = '';
  [0.25, 0.5, 0.75, 1].forEach(f => {
    const p = Array.from({ length: n }, (_, i) => pt(i, R * f).map(v => v.toFixed(1)).join(','));
    rings += `<polygon points="${p.join(' ')}" class="cmp-radar-ring"/>`;
  });

  let spokes = '', labels = '';
  RADAR_AXES.forEach((ax, i) => {
    const [x, y] = pt(i, R);
    spokes += `<line x1="${CX}" y1="${CY}" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}" class="cmp-radar-spoke"/>`;
    const [lx, ly] = pt(i, R + 17);
    const anchor = Math.abs(lx - CX) < 6 ? 'middle' : (lx > CX ? 'start' : 'end');
    labels += `<text x="${lx.toFixed(1)}" y="${(ly + 3).toFixed(1)}" text-anchor="${anchor}" class="cmp-radar-label">${ax.label}</text>`;
  });

  const shapes = cigars.map((c, ci) => {
    const pts = RADAR_AXES.map((ax, i) => {
      const raw = ax.get(c);
      const f = Math.max(0.06, Math.min((raw - ax.min) / (ax.max - ax.min), 1));
      return pt(i, R * f).map(v => v.toFixed(1)).join(',');
    });
    const col = COMPARE_COLORS[ci];
    return `<polygon points="${pts.join(' ')}" fill="${col}" fill-opacity="0.13"
              stroke="${col}" stroke-width="1.8" stroke-linejoin="round"/>`;
  }).join('');

  return `
    <div class="cmp-radar-wrap">
      <svg viewBox="0 0 300 248" class="cmp-radar" role="img" aria-label="Radar comparison across body, rating, price, length and ring gauge">
        <g>${rings}${spokes}</g>
        ${shapes}
        ${labels}
      </svg>
      <div class="cmp-legend">
        ${cigars.map((c, i) => `<span class="cmp-legend-item">
          <span class="cmp-swatch" style="background:${COMPARE_COLORS[i]}"></span>
          ${c.name}<em>${c.brand}</em>
        </span>`).join('')}
      </div>
      <p class="cmp-radar-note">Each axis is scaled against the whole library, so a shape reads the same wherever you meet it.</p>
    </div>`;
}

function openCompareModal() {
  if (compareList.length < 2) return;
  const picked = compareList.map(id => CIGARS.find(c => c.id === id)).filter(Boolean);
  if (picked.length < 2) return;

  // Which cigar wins each row — highest rating, lowest price, and so on.
  const best = {
    rating: Math.max(...picked.map(c => c.rating)),
    price:  Math.min(...picked.map(c => c.price)),
  };

  const ROWS = [
    ['Origin',      c => `${ORIGIN_FLAGS[c.origin] || ''} ${c.origin}`],
    ['Region',      c => c.region],
    ['Rating',      c => `<div class="cmp-bar-cell"><div class="cmp-bar"><div class="cmp-bar-fill rating" style="width:${((c.rating - 82) / 18) * 100}%"></div></div><span class="cmp-val">${c.rating}</span></div>`,        c => c.rating === best.rating],
    ['Price',       c => `<div class="cmp-bar-cell"><div class="cmp-bar"><div class="cmp-bar-fill price" style="width:${Math.min(100, (c.price / 60) * 100)}%"></div></div><span class="cmp-val">$${c.price.toFixed(0)}</span></div>`,     c => c.price === best.price],
    ['Strength',    c => {
      const sc = strengthConfig(c.strength);
      return `<div class="cmp-bar-cell"><div class="cmp-bar"><div class="cmp-bar-fill strength" style="width:${(c.strength / 5) * 100}%"></div></div><span style="color:${sc.color};font-weight:600;font-size:13px">${sc.label}</span></div>`;
    }],
    ['Smoke Time',  c => `<div class="cmp-bar-cell"><div class="cmp-bar"><div class="cmp-bar-fill time" style="width:${((c.smokingTime - 20) / 100) * 100}%"></div></div><span class="cmp-val">${formatTime(c.smokingTime)}</span></div>`],
    ['Wrapper',     c => c.wrapper],
    ['Binder',      c => c.binder],
    ['Filler',      c => c.filler],
    ['Size',        c => c.size],
    ['Dimensions',  c => `${c.length}" × ${c.ringGauge}`],
    ['Flavors',     c => `<span class="compare-flavor-tags">${c.flavors.slice(0, 4)
      .map(f => `<span class="compare-flavor-tag">${f}</span>`).join('')}</span>`],
    ['Pairs With',  c => (c.pairings || []).slice(0, 3)
      .map(pp => `<span class="compare-pairing-chip">🥃 ${pp}</span>`).join('') || '—'],
  ];

  // Flavours every one of them shares — the actual common ground.
  const shared = picked[0].flavors.filter(f =>
    picked.every(c => c.flavors.some(g => g.toLowerCase() === f.toLowerCase())));

  document.getElementById('compareBody').innerHTML = `
    <div class="compare-header">
      <h2>Side by Side</h2>
      <p>${picked.length} cigars across every spec that matters</p>
    </div>

    ${buildCompareRadar(picked)}

    ${shared.length ? `<div class="cmp-shared">
      <span class="cmp-shared-label">All ${picked.length} share</span>
      ${shared.map(f => `<span class="compare-flavor-tag">${f}</span>`).join('')}
    </div>` : ''}

    <div class="cmp-table-wrap">
      <table class="cmp-table" style="--cols:${picked.length}">
        <thead>
          <tr>
            <th></th>
            ${picked.map((c, i) => `<th>
              <span class="cmp-th-dot" style="background:${COMPARE_COLORS[i]}"></span>
              <button class="cmp-th-name" onclick="closeCompareModal();openModal('${c.id}')">${c.name}</button>
              <span class="cmp-th-brand">${c.brand}</span>
            </th>`).join('')}
          </tr>
        </thead>
        <tbody>
          ${ROWS.map(([label, fn, isBest]) => `
            <tr>
              <th scope="row">${label}</th>
              ${picked.map(c => `<td${isBest && isBest(c) ? ' class="cmp-best"' : ''}>${fn(c)}</td>`).join('')}
            </tr>`).join('')}
        </tbody>
      </table>
    </div>`;

  document.getElementById('compareOverlay').classList.remove('hidden');
  document.body.style.overflow = 'hidden';
}

function closeCompareModal() {
  document.getElementById('compareOverlay').classList.add('hidden');
  document.body.style.overflow = '';
}

// ── QUIZ ─────────────────────────────────────────────────────────
const quizSteps = [
  {
    id: 'experience',
    label: 'Step 1 of 4',
    question: 'How would you describe your cigar experience?',
    options: [
      { icon: '🌱', title: 'Just starting out', desc: 'New to cigars, want something approachable', value: 'beginner' },
      { icon: '🔥', title: "I've smoked a few", desc: 'Some experience, ready for more complexity', value: 'intermediate' },
      { icon: '🏆', title: 'Seasoned aficionado', desc: 'Experienced, want the full spectrum', value: 'expert' }
    ]
  },
  {
    id: 'strength',
    label: 'Step 2 of 4',
    question: 'What body & strength do you prefer?',
    options: [
      { icon: '☁️', title: 'Light & Smooth', desc: 'Mild, creamy, easy on the palate', value: 1 },
      { icon: '🌤️', title: 'Mild to Medium', desc: 'Some complexity without too much punch', value: 2 },
      { icon: '⛅', title: 'Medium & Complex', desc: 'The sweet spot — rich and nuanced', value: 3 },
      { icon: '🌩️', title: 'Full & Bold', desc: 'Maximum strength and intensity', value: 5 }
    ]
  },
  {
    id: 'flavor',
    label: 'Step 3 of 4',
    question: 'Which flavor direction appeals most?',
    options: [
      { icon: '🍦', title: 'Creamy & Sweet', desc: 'Vanilla, cream, caramel, honey', value: 'Cream' },
      { icon: '🌿', title: 'Earthy & Woody', desc: 'Cedar, earth, leather, hay', value: 'Earth' },
      { icon: '🌶️', title: 'Spicy & Peppery', desc: 'Pepper, spice, red pepper, intensity', value: 'Pepper' },
      { icon: '☕', title: 'Coffee & Chocolate', desc: 'Espresso, cocoa, dark chocolate, roast', value: 'Coffee' }
    ]
  },
  {
    id: 'budget',
    label: 'Step 4 of 4',
    question: "What's your budget per stick?",
    options: [
      { icon: '💰', title: 'Under $10', desc: 'Great cigars at an everyday price', value: 10 },
      { icon: '💎', title: '$10 – $20', desc: 'Premium range, special occasion value', value: 20 },
      { icon: '👑', title: '$20+', desc: 'No budget — give me the best', value: 100 }
    ]
  }
];

const quizState = { step: 0, answers: {} };

function renderQuizStep() {
  const step = quizSteps[quizState.step];
  const dots = quizSteps.map((_, i) =>
    `<div class="quiz-progress-dot${i <= quizState.step ? ' active' : ''}"></div>`
  ).join('');

  const opts = step.options.map(o => `
    <button class="quiz-option${quizState.answers[step.id] === o.value ? ' selected' : ''}"
      onclick="selectQuizOption('${step.id}', ${JSON.stringify(o.value).replace(/"/g, '&quot;')})">
      <span class="quiz-option-icon">${o.icon}</span>
      <span class="quiz-option-text">
        <span class="quiz-option-title">${o.title}</span>
        <span class="quiz-option-desc">${o.desc}</span>
      </span>
    </button>`).join('');

  const hasAnswer = quizState.answers[step.id] !== undefined;
  const isLast = quizState.step === quizSteps.length - 1;

  document.getElementById('quizBody').innerHTML = `
    <div class="quiz-progress">${dots}</div>
    <div class="quiz-step-label">${step.label}</div>
    <div class="quiz-question">${step.question}</div>
    <div class="quiz-options">${opts}</div>
    <div class="quiz-nav">
      ${quizState.step > 0 ? '<button class="quiz-back-btn" onclick="quizBack()">Back</button>' : ''}
      <button class="quiz-next-btn" onclick="quizNext()" ${!hasAnswer ? 'disabled' : ''}>
        ${isLast ? 'Find My Cigar →' : 'Next →'}
      </button>
    </div>`;
}

function selectQuizOption(stepId, value) {
  quizState.answers[stepId] = value;
  renderQuizStep();
}

function quizNext() {
  if (quizState.step < quizSteps.length - 1) {
    quizState.step++;
    renderQuizStep();
  } else {
    showQuizResults();
  }
}

function quizBack() {
  if (quizState.step > 0) {
    quizState.step--;
    renderQuizStep();
  }
}

function showQuizResults() {
  const { strength, flavor, budget, experience } = quizState.answers;
  const maxStrength = experience === 'beginner' ? Math.min(strength, 2) : strength;

  const scored = CIGARS
    .filter(c => c.price <= budget)
    .map(c => {
      const strengthDiff = Math.abs(c.strength - maxStrength);
      const flavorMatch = c.flavors.some(f => f.toLowerCase().includes(flavor.toLowerCase()));
      if (strengthDiff > 1) return null;
      const score = c.rating + (flavorMatch ? 10 : 0) - (strengthDiff * 5);
      return { cigar: c, score };
    })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);

  const resultCards = scored.map((r, i) => `
    <div class="quiz-result-card" onclick="closeQuizModal(); openModal('${r.cigar.id}')">
      <div class="qrc-rank">${i + 1}</div>
      <div class="qrc-info">
        <div class="qrc-name">${r.cigar.name}</div>
        <div class="qrc-brand">${r.cigar.brand} · ${r.cigar.origin} · $${r.cigar.price.toFixed(2)}</div>
      </div>
      <div class="qrc-rating">${r.cigar.rating}</div>
    </div>`).join('');

  document.getElementById('quizBody').innerHTML = `
    <div class="quiz-results-header">
      <h3>Your Perfect Cigars</h3>
      <p>Based on your preferences — click any to see full details</p>
    </div>
    ${resultCards || '<p style="color:var(--text-muted);text-align:center">No exact matches — try adjusting your budget or strength.</p>'}
    <button class="quiz-restart-btn" onclick="restartQuiz()">Start Over</button>`;
}

function restartQuiz() {
  quizState.step = 0;
  quizState.answers = {};
  renderQuizStep();
}

function openQuizModal() {
  quizState.step = 0;
  quizState.answers = {};
  renderQuizStep();
  document.getElementById('quizOverlay').classList.remove('hidden');
  document.body.style.overflow = 'hidden';
}

function closeQuizModal() {
  document.getElementById('quizOverlay').classList.add('hidden');
  document.body.style.overflow = '';
}

// ── COMPARE BUTTON IN CARD ────────────────────────────────────────
// Patch renderCard to include compare button
const _origRenderCard = renderCard;
// (patched inline below via modified render)

// ── LANDING PAGE — 3D CIGAR ─────────────────────────────────────
function buildCigar3D() {
  const container = document.getElementById('cigar3d');
  if (!container) return;

  // Use WebGL renderer if Three.js loaded successfully
  if (window.THREE && window.initCigar3DWebGL) {
    try { initCigar3DWebGL(container); return; } catch (e) { console.warn('WebGL cigar failed, falling back to CSS:', e); }
  }

  // ── CSS polygon fallback ──────────────────────────────────────
  const NUM_FACES = 48;
  const RADIUS    = 24;

  for (let i = 0; i < NUM_FACES; i++) {
    const angle = (i / NUM_FACES) * 360;
    const rad   = angle * Math.PI / 180;
    const cosA  = Math.cos(rad);
    const light   = 0.5 + 0.5 * cosA;
    const spec    = Math.pow(Math.max(0, cosA), 8);
    const bodyBr  = (0.10 + 0.72 * light + 0.25 * spec).toFixed(3);
    const bandBr  = (0.22 + 0.60 * light + 0.20 * spec).toFixed(3);
    const hue     = Math.round(-8 + 16 * light);
    const sat     = (0.78 + 0.32 * light).toFixed(2);

    const face = document.createElement('div');
    face.className = 'cigar-face cigar-face-body';
    face.style.transform = `rotateX(${angle}deg) translateZ(${RADIUS}px)`;
    face.style.filter    = `brightness(${bodyBr}) saturate(${sat}) hue-rotate(${hue}deg)`;
    face.style.setProperty('--vein-y', `${((i / NUM_FACES) * 15).toFixed(3)}px`);
    container.appendChild(face);

    const inRedZone = (angle > 44 && angle < 136) || (angle > 224 && angle < 316);
    const band = document.createElement('div');
    band.className = 'cigar-face ' + (inRedZone ? 'cigar-face-band-red' : 'cigar-face-band-gold');
    band.style.transform = `rotateX(${angle}deg) translateZ(${RADIUS + 0.8}px)`;
    band.style.filter    = `brightness(${bandBr})`;
    container.appendChild(band);

    const foot = document.createElement('div');
    foot.className = 'cigar-face cigar-face-foot';
    foot.style.transform = `rotateX(${angle}deg) translateZ(${RADIUS + 0.4}px)`;
    foot.style.opacity   = (0.28 + 0.72 * light).toFixed(2);
    container.appendChild(foot);
  }

  for (let i = 0; i < NUM_FACES; i++) {
    const angle = (i / NUM_FACES) * 360;
    const cosA  = Math.cos(angle * Math.PI / 180);
    if (cosA < 0.55) continue;
    const sheen = document.createElement('div');
    sheen.className = 'cigar-face cigar-face-sheen';
    sheen.style.transform = `rotateX(${angle}deg) translateZ(${RADIUS + 0.4}px)`;
    sheen.style.opacity   = (((cosA - 0.55) / 0.45) * 0.52).toFixed(3);
    container.appendChild(sheen);
  }

  const capHead = document.createElement('div');
  capHead.className = 'cigar-cap cigar-cap-head';
  container.appendChild(capHead);

  const capFoot = document.createElement('div');
  capFoot.className = 'cigar-cap cigar-cap-foot';
  container.appendChild(capFoot);
}
// ── HASH ROUTING ─────────────────────────────────────────────────
function _parseHashCigar(hash) {
  const m = hash.match(/^#\/cigar\/(.+)$/);
  return m ? m[1] : null;
}

function _handleHashRouting() {
  const hash = window.location.hash;

  // Cigar deep-link: /#/cigar/{id}
  const id = _parseHashCigar(hash);
  if (id) {
    const landing = document.getElementById('landing');
    if (landing && !document.body.classList.contains('site-entered')) {
      landing.classList.add('landing-hidden');
      document.body.classList.remove('has-landing');
      document.body.classList.add('site-entered');
    }
    openModal(id);
    return;
  }

  // Pipe tobacco deep-link: /#/tobacco/{id}
  const ptm = hash.match(/^#\/tobacco\/(.+)$/);
  if (ptm) {
    const landing = document.getElementById('landing');
    if (landing && !document.body.classList.contains('site-entered')) {
      landing.classList.add('landing-hidden');
      document.body.classList.remove('has-landing');
      document.body.classList.add('site-entered');
    }
    switchView('pipe-tobacco');
    openPTModal(ptm[1]);
    return;
  }

  // Search shortcut: /#search={query}
  const sm = hash.match(/^#search=(.+)$/);
  if (sm) {
    const q = decodeURIComponent(sm[1]);
    const $s = document.getElementById('searchInput');
    if ($s) { $s.value = q; state.search = q; render(); }
  }
}

window.addEventListener('popstate', (e) => {
  if (e.state && e.state.cigarId) {
    openModal(e.state.cigarId);
  } else if (e.state && e.state.ptId) {
    openPTModal(e.state.ptId);
  } else {
    $modalOverlay.classList.add('hidden');
    document.body.style.overflow = '';
    document.title = 'Vitola Pedia — Premium Cigar Encyclopedia | 20,815 Cigars, 364 Brands';
  }
});

function enterSite() {
  const landing = document.getElementById('landing');
  if (!landing) return;

  landing.classList.add('landing-exit');
  document.body.classList.remove('has-landing');
  document.body.classList.add('site-entered');

  // Hide on a timer matched to the animation rather than animationend —
  // if the animation is skipped (reduced motion, backgrounded tab) the
  // event never fires and the landing stays in the layout forever.
  setTimeout(() => landing.classList.add('landing-hidden'), 460);
}

// Disable browser scroll restoration so landing page always shows on reload
if ('scrollRestoration' in history) history.scrollRestoration = 'manual';

document.addEventListener('DOMContentLoaded', () => {
  // Build 3D cigar and set up landing page
  const landing = document.getElementById('landing');
  if (landing) {
    document.body.classList.add('has-landing');
    window.scrollTo(0, 0);  // prevent browser scroll-restore showing blank area

    /* The 3D scene is 573KB of JS in an iframe. Held back until after the
       first paint so the headline, the CTA and the scroll affordance are
       interactive immediately instead of queueing behind it. */
    const frame = document.getElementById('cigar3d-frame');
    if (frame && frame.dataset.src && !frame.src) {
      const load = () => { frame.src = frame.dataset.src; };
      if ('requestIdleCallback' in window) requestIdleCallback(load, { timeout: 900 });
      else setTimeout(load, 250);
    }
    // 3D cigar is rendered via iframe (cigar3d/index.html) — no JS init needed

    // CTA button
    const enterBtn = document.getElementById('enterSite');
    if (enterBtn) enterBtn.addEventListener('click', enterSite);

    /* The landing invites you to "scroll down", so every way of scrolling
       has to count — not just the mouse wheel. Touch scrolling fires no
       wheel event at all, which left phones stranded on the landing with
       the entered-state styling never applied. A plain scroll listener
       catches the rest: momentum, scrollbar drags, Space, PageDown. */
    let scrollTriggered = false;
    const trigger = () => {
      if (scrollTriggered || document.body.classList.contains('site-entered')) return;
      scrollTriggered = true;
      disarm();
      enterSite();
    };

    const onWheel = e => { if (e.deltaY > 8) trigger(); };
    const onScroll = () => { if (window.scrollY > 24) trigger(); };
    let touchStartY = 0;
    const onTouchStart = e => { touchStartY = e.touches[0].clientY; };
    const onTouchMove = e => {
      if (touchStartY - e.touches[0].clientY > 24) trigger();
    };

    function disarm() {
      window.removeEventListener('wheel', onWheel);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('touchstart', onTouchStart);
      window.removeEventListener('touchmove', onTouchMove);
    }

    // Barely delayed — just enough that stale trackpad momentum from the
    // previous page can't fire it. The old 1.2s meant any scroll in the
    // first second did nothing, which read as the page hanging.
    setTimeout(() => {
      window.addEventListener('wheel', onWheel, { passive: true });
      window.addEventListener('scroll', onScroll, { passive: true });
      window.addEventListener('touchstart', onTouchStart, { passive: true });
      window.addEventListener('touchmove', onTouchMove, { passive: true });
    }, 220);
  }

  // Defer init so the landing page paints before processing all data
  setTimeout(() => { init(); initPipeTobacco(); _handleHashRouting(); }, 0);

  // Quiz
  document.getElementById('quizTriggerBtn').addEventListener('click', openQuizModal);
  document.getElementById('quizClose').addEventListener('click', closeQuizModal);
  document.getElementById('quizOverlay').addEventListener('click', e => {
    if (e.target === document.getElementById('quizOverlay')) closeQuizModal();
  });

  // Compare tray
  document.getElementById('compareGoBtn').addEventListener('click', openCompareModal);
  document.getElementById('compareClearBtn').addEventListener('click', () => {
    compareList.length = 0;
    updateCompareTray();
    document.querySelectorAll('.card-compare-btn').forEach(b => b.classList.remove('in-compare'));
  });

  // Compare modal
  document.getElementById('compareModalClose').addEventListener('click', closeCompareModal);
  document.getElementById('compareOverlay').addEventListener('click', e => {
    if (e.target === document.getElementById('compareOverlay')) closeCompareModal();
  });

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      closeQuizModal();
      closeCompareModal();
    }
  });

  // Delegate compare button clicks on grid
  document.getElementById('cigarsGrid').addEventListener('click', e => {
    const btn = e.target.closest('.card-compare-btn');
    if (btn) {
      e.stopPropagation();
      toggleCompare(btn.dataset.id, e);
    }
  });
});
