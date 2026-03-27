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

function matchesSearch(cigar, query) {
  if (!query) return true;
  const q = query.toLowerCase();
  return (
    cigar.name.toLowerCase().includes(q) ||
    cigar.brand.toLowerCase().includes(q) ||
    cigar.origin.toLowerCase().includes(q) ||
    cigar.region.toLowerCase().includes(q) ||
    cigar.wrapper.toLowerCase().includes(q) ||
    cigar.size.toLowerCase().includes(q) ||
    cigar.flavors.some(f => f.toLowerCase().includes(q)) ||
    cigar.description.toLowerCase().includes(q) ||
    (cigar.pairings || []).some(p => p.toLowerCase().includes(q))
  );
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
  return `
    <article class="cigar-card${cigar.image ? ' has-img' : ''}" data-id="${cigar.id}" style="animation-delay:${Math.min(index * 0.04, 0.5)}s" role="button" tabindex="0">
      ${cardImg}
      ${limitedBadge}
      <button class="card-compare-btn${inCompare ? ' in-compare' : ''}" data-id="${cigar.id}" title="Compare" tabindex="-1">+</button>
      <div class="card-header">
        <span class="card-origin-badge">${flag} ${cigar.origin}</span>
        <div>
          <div class="card-rating">${cigar.rating}</div>
          <span class="card-rating-label">pts</span>
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
function render() {
  const filtered = sortCigars(getFiltered());
  const count = filtered.length;

  $count.innerHTML = `<strong>${count}</strong> cigar${count !== 1 ? 's' : ''} found`;
  $noResults.classList.toggle('hidden', count > 0);
  $grid.innerHTML = '';

  if (count === 0) return;

  const html = state.view === 'list'
    ? filtered.map(c => renderListCard(c)).join('')
    : filtered.map((c, i) => renderCard(c, i)).join('');

  $grid.innerHTML = html;
  $grid.classList.toggle('list-view', state.view === 'list');

  // Attach click handlers
  $grid.querySelectorAll('.cigar-card').forEach(card => {
    const open = (e) => {
      if (e.target.closest('.card-compare-btn')) return;
      openModal(card.dataset.id);
    };
    card.addEventListener('click', open);
    card.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') open(e); });
  });
}

// ── MODAL ────────────────────────────────────────────────────────
function openModal(id) {
  const cigar = CIGARS.find(c => c.id === id);
  if (!cigar) return;

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
  { name: 'Cigars International', search: 'https://www.cigarsinternational.com/search?q=',     tagline: 'Best Deals & Bundles',   badge: '★ Best Value Pick' },
  { name: 'Cigar Page',           search: 'https://www.cigarpage.com/search?q=',               tagline: 'Top Prices, Huge Selection' },
  { name: 'Famous Smoke Shop',    search: 'https://www.famous-smoke.com/search?q=',            tagline: 'Largest Online Selection' },
  { name: 'JR Cigars',            search: 'https://www.jrcigars.com/search?term=',             tagline: 'Est. 1975 · Trusted Since' },
  { name: 'Neptune Cigar',        direct: 'https://www.neptunecigar.com/cigars/',              tagline: 'Great Prices, Fast Shipping' },
  { name: 'Smoke Inn',            search: 'https://www.smokeinn.com/search?q=',                tagline: 'Boutique & Premium Brands' },
];

const INTL_RETAILERS = [
  { name: 'Havana House',         search: 'https://www.havanahouse.co.uk/search?q=',           tagline: 'UK · Authentic Habanos',  badge: '★ Best Value Pick' },
  { name: 'C.Gars Ltd',           search: 'https://www.cgarsltd.co.uk/search?q=',              tagline: 'UK · Cuban Specialists' },
  { name: 'Hunters & Frankau',    search: 'https://cigars.co.uk/?s=',                         tagline: 'Official UK Habanos Dist.' },
];

function buildBuySection(cigar) {
  const isCuban = cigar.origin === 'Cuba';
  const query = encodeURIComponent(cigar.name);
  const retailers = isCuban ? INTL_RETAILERS : US_RETAILERS;

  // If cigar has handcrafted buyLinks (with prices), sort by price and flag cheapest.
  // Exclude Neptune Cigar search-URL entries so Neptune always uses the direct-URL generator below.
  let specificLinks = [];
  if (cigar.buyLinks && cigar.buyLinks.length > 0) {
    const filtered = cigar.buyLinks.filter(
      l => !(l.retailer === 'Neptune Cigar' && l.url && l.url.includes('/search?'))
    );
    specificLinks = [...filtered].sort((a, b) => a.price - b.price);
    if (specificLinks.length > 0) specificLinks[0].isBest = true;
  }

  // Auto-generate links; skip retailers already in specific links
  const covered = new Set(specificLinks.map(l => l.retailer));
  const autoLinks = retailers
    .filter(r => !covered.has(r.name))
    .map((r, i) => ({
      name: r.name,
      url: r.direct ? r.direct + toNeptuneSlug(cigar.name) : r.search + query,
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

  const views = ['library', 'regions', 'guide'];
  views.forEach(v => {
    const el = document.getElementById(`view-${v}`);
    if (el) el.classList.toggle('hidden', v !== viewName);
  });

  // main-content visibility
  const mainContent = document.querySelector('.main-content');
  if (mainContent) mainContent.classList.toggle('hidden', viewName !== 'library');

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

// ── INIT ─────────────────────────────────────────────────────────
function init() {
  // Update total stat
  $totalStat.textContent = CIGARS.length;

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
  bindPills('timeFilter', 'time');

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
    render();
  };
  document.getElementById('resetFilters').addEventListener('click', resetAll);
  document.getElementById('noResultsReset').addEventListener('click', resetAll);
}

// ── COMPARE ──────────────────────────────────────────────────────
const compareList = [];

function toggleCompare(id, e) {
  if (e) e.stopPropagation();
  const idx = compareList.indexOf(id);
  if (idx > -1) {
    compareList.splice(idx, 1);
  } else {
    if (compareList.length >= 2) return;
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

  const empties = 2 - compareList.length;
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
}

function openCompareModal() {
  if (compareList.length < 2) return;
  const [a, b] = compareList.map(id => CIGARS.find(c => c.id === id));
  if (!a || !b) return;

  const sc = s => STRENGTH_CONFIG[s] || STRENGTH_CONFIG[3];

  function col(cigar, side) {
    const s = sc(cigar.strength);
    const pct = (cigar.strength / 5) * 100;
    const flavTags = cigar.flavors.slice(0, 5).map(f => `<span class="compare-flavor-tag">${f}</span>`).join('');
    const borderClass = side === 'left' ? 'compare-left' : 'compare-right';
    const pairingItems = (cigar.pairings || []).map(p => `<span class="compare-pairing-chip">🥃 ${p}</span>`).join('');
    return `
      <div class="compare-col">
        <div class="compare-col-header">
          <div class="compare-col-name">${cigar.name}</div>
          <div class="compare-col-brand">${cigar.brand}</div>
        </div>
        <div class="compare-cell ${borderClass}">${cigar.origin} · ${cigar.region}</div>
        <div class="compare-cell ${borderClass} ${a.rating !== b.rating && ((side==='left'&&a.rating>b.rating)||(side==='right'&&b.rating>a.rating)) ? 'highlight' : ''}">${cigar.rating} pts</div>
        <div class="compare-cell ${borderClass} ${a.price !== b.price && ((side==='left'&&a.price<b.price)||(side==='right'&&b.price<a.price)) ? 'highlight' : ''}">$${cigar.price.toFixed(2)}</div>
        <div class="compare-cell ${borderClass}">
          <div style="color:${s.color};font-weight:600">${s.label}</div>
          <div class="compare-strength-bar"><div class="compare-strength-fill" style="width:${pct}%;background:${s.color}"></div></div>
        </div>
        <div class="compare-cell ${borderClass}">${formatTime(cigar.smokingTime)}</div>
        <div class="compare-cell ${borderClass}">${cigar.wrapper}</div>
        <div class="compare-cell ${borderClass}">${cigar.size}</div>
        <div class="compare-cell ${borderClass}">${cigar.length}" × ${cigar.ringGauge}</div>
        <div class="compare-cell compare-cell-hover-wrap ${borderClass}">
          <div class="compare-flavor-tags">${flavTags}</div>
          <div class="compare-hover-reveal">
            <div class="compare-hover-wheel">${buildFlavorWheel(cigar.flavors)}</div>
            <div class="compare-hover-pairings-label">Pairs With</div>
            <div class="compare-hover-pairings">${pairingItems}</div>
          </div>
        </div>
      </div>`;
  }

  function dividerRows() {
    const labels = ['Origin', 'Rating', 'Price', 'Strength', 'Smoke Time', 'Wrapper', 'Size', 'Dimensions', 'Flavors'];
    return labels.map(l => `<div class="compare-cell-label">${l}</div>`).join('');
  }

  document.getElementById('compareBody').innerHTML = `
    <div class="compare-header">
      <h2>Side by Side</h2>
      <p>Comparing two cigars across all key specs</p>
    </div>
    <div class="compare-grid">
      ${col(a, 'left')}
      <div class="compare-divider-col">
        <div class="compare-vs">VS</div>
        ${dividerRows()}
      </div>
      ${col(b, 'right')}
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

  const NUM_FACES = 32;   // more faces = smoother cylinder
  const RADIUS = 24;      // cylinder radius in px

  for (let i = 0; i < NUM_FACES; i++) {
    const angle = (i / NUM_FACES) * 360;
    const rad = angle * Math.PI / 180;

    // Directional light from above: brighter at top, darker at bottom
    const light = 0.5 + 0.5 * Math.cos(rad);
    const bodyBrightness = (0.42 + 0.58 * light).toFixed(3);
    const bandBrightness = (0.55 + 0.45 * light).toFixed(3);

    // Wrapper body face
    const face = document.createElement('div');
    face.className = 'cigar-face cigar-face-body';
    face.style.transform = `rotateX(${angle}deg) translateZ(${RADIUS}px)`;
    face.style.filter = `brightness(${bodyBrightness})`;
    container.appendChild(face);

    // Gold band overlay
    const band = document.createElement('div');
    band.className = 'cigar-face cigar-face-band';
    band.style.transform = `rotateX(${angle}deg) translateZ(${RADIUS + 0.8}px)`;
    band.style.filter = `brightness(${bandBrightness})`;
    container.appendChild(band);

    // Ember glow at foot end
    const foot = document.createElement('div');
    foot.className = 'cigar-face cigar-face-foot';
    foot.style.transform = `rotateX(${angle}deg) translateZ(${RADIUS + 0.4}px)`;
    foot.style.opacity = (0.35 + 0.65 * light).toFixed(2);
    container.appendChild(foot);
  }

  // Head cap
  const capHead = document.createElement('div');
  capHead.className = 'cigar-cap cigar-cap-head';
  container.appendChild(capHead);

  // Foot cap
  const capFoot = document.createElement('div');
  capFoot.className = 'cigar-cap cigar-cap-foot';
  container.appendChild(capFoot);
}

function enterSite() {
  const landing = document.getElementById('landing');
  if (!landing) return;

  landing.classList.add('landing-exit');
  document.body.classList.remove('has-landing');
  document.body.classList.add('site-entered');

  landing.addEventListener('animationend', () => {
    landing.classList.add('landing-hidden');
  }, { once: true });
}

document.addEventListener('DOMContentLoaded', () => {
  // Build 3D cigar and set up landing page
  const landing = document.getElementById('landing');
  if (landing) {
    document.body.classList.add('has-landing');
    buildCigar3D();

    // CTA button
    const enterBtn = document.getElementById('enterSite');
    if (enterBtn) enterBtn.addEventListener('click', enterSite);

    // Scroll detection — enter site on scroll
    // Delay registration to avoid Mac trackpad momentum firing on page load
    let scrollTriggered = false;
    setTimeout(() => {
      window.addEventListener('wheel', function onWheel(e) {
        if (scrollTriggered) return;
        if (e.deltaY > 20 && !document.body.classList.contains('site-entered')) {
          scrollTriggered = true;
          enterSite();
          window.removeEventListener('wheel', onWheel);
        }
      }, { passive: true });
    }, 1500);

    // Touch swipe up on mobile
    let touchStartY = 0;
    landing.addEventListener('touchstart', e => { touchStartY = e.touches[0].clientY; }, { passive: true });
    landing.addEventListener('touchmove', e => {
      if (scrollTriggered) return;
      const delta = touchStartY - e.touches[0].clientY;
      if (delta > 50 && !document.body.classList.contains('site-entered')) {
        scrollTriggered = true;
        enterSite();
      }
    }, { passive: true });
  }

  init();

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
