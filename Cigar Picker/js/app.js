/* ================================================================
   CIGAR CONNOISSEUR — App Engine
   ================================================================ */

// ── STATE ────────────────────────────────────────────────────────
const state = {
  search: '',
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

  return `
    <article class="cigar-card" data-id="${cigar.id}" style="animation-delay:${Math.min(index * 0.04, 0.5)}s" role="button" tabindex="0">
      ${limitedBadge}
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
    const open = () => openModal(card.dataset.id);
    card.addEventListener('click', open);
    card.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') open(); });
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
  `;

  $modalOverlay.classList.remove('hidden');
  document.body.style.overflow = 'hidden';
}

function closeModal() {
  $modalOverlay.classList.add('hidden');
  document.body.style.overflow = '';
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
    document.querySelectorAll('.pill.active').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.pill[data-value="all"]').forEach(p => p.classList.add('active'));
    render();
  };
  document.getElementById('resetFilters').addEventListener('click', resetAll);
  document.getElementById('noResultsReset').addEventListener('click', resetAll);
}

document.addEventListener('DOMContentLoaded', init);
