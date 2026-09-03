/* ══════════════════════════════════════════════════════════════════
   VITOLA PEDIA — MODAL ENRICHMENTS
   Four things the detail view was missing, all computed from data that
   was already in the library:

     1. Percentile context  — "94 pts" means nothing on its own
     2. Size visualiser     — length + ringGauge existed, were never drawn
     3. Similar cigars      — cross-brand, by flavour/strength/origin
     4. Share               — hash routing already worked, nothing used it

   Hooks openModal the same way js/immersive.js does.
   ══════════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  const cigars = () => (typeof CIGARS !== 'undefined' ? CIGARS : []);

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  /* ══════════════════════════════════════════════════════════════
     1. PERCENTILE CONTEXT
     Sorted columns built once, then a binary search per lookup.
  ══════════════════════════════════════════════════════════════ */
  const COLS = {};

  function column(key) {
    if (!COLS[key]) {
      COLS[key] = cigars().map(c => c[key]).filter(v => typeof v === 'number').sort((a, b) => a - b);
    }
    return COLS[key];
  }

  /* Share of the library at or below `value`, 0–100. */
  function percentile(key, value) {
    const arr = column(key);
    if (!arr.length) return 0;
    let lo = 0, hi = arr.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (arr[mid] <= value) lo = mid + 1; else hi = mid;
    }
    return (lo / arr.length) * 100;
  }

  function median(nums) {
    if (!nums.length) return 0;
    const s = [...nums].sort((a, b) => a - b);
    const m = s.length >> 1;
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
  }

  const ORIGIN_MEDIANS = {};
  function originMedianPrice(origin) {
    if (ORIGIN_MEDIANS[origin] === undefined) {
      ORIGIN_MEDIANS[origin] = median(
        cigars().filter(c => c.origin === origin).map(c => c.price)
      );
    }
    return ORIGIN_MEDIANS[origin];
  }

  function buildContext(cigar) {
    const ratingPct = percentile('rating', cigar.rating);
    const pricePct  = percentile('price', cigar.price);
    const strPct    = percentile('strength', cigar.strength);
    const timePct   = percentile('smokingTime', cigar.smokingTime);

    const topBand = 100 - ratingPct;
    const om = originMedianPrice(cigar.origin);
    const priceDelta = cigar.price - om;

    const facts = [
      {
        big: topBand < 1 ? 'Top 1%' : `Top ${Math.max(1, Math.round(topBand))}%`,
        label: 'by rating',
        note: `${cigar.rating} pts across ${column('rating').length.toLocaleString()} cigars`,
      },
      {
        big: `${Math.round(strPct)}%`,
        label: 'are milder',
        note: strPct > 50 ? 'On the bolder side of the library' : 'On the gentler side of the library',
      },
      {
        big: Math.abs(priceDelta) < 0.5
          ? 'At the median'
          : `${priceDelta > 0 ? '+' : '−'}$${Math.abs(priceDelta).toFixed(2)}`,
        label: `vs ${esc(cigar.origin)}`,
        note: `${cigar.origin} median is $${om.toFixed(2)} a stick`,
      },
      {
        big: `${Math.round(timePct)}%`,
        label: 'are shorter',
        note: `${cigar.smokingTime} minutes of smoke time`,
      },
    ];

    return `
      <div class="ctx-section">
        <div class="modal-section-title">How It Compares</div>
        <div class="ctx-grid">
          ${facts.map(f => `
            <div class="ctx-cell">
              <div class="ctx-big">${f.big}</div>
              <div class="ctx-label">${f.label}</div>
              <div class="ctx-note">${f.note}</div>
            </div>`).join('')}
        </div>
        <div class="ctx-bars">
          ${bar('Rating', ratingPct, cigar.rating + ' pts')}
          ${bar('Price', pricePct, '$' + cigar.price.toFixed(2))}
          ${bar('Strength', strPct, ['Mild','Mild–Med','Medium','Med–Full','Full'][cigar.strength - 1])}
          ${bar('Smoke Time', timePct, cigar.smokingTime + ' min')}
        </div>
      </div>`;
  }

  function bar(label, pct, value) {
    return `
      <div class="ctx-bar-row">
        <span class="ctx-bar-label">${label}</span>
        <span class="ctx-bar-track">
          <span class="ctx-bar-fill" style="width:${pct.toFixed(1)}%"></span>
          <span class="ctx-bar-marker" style="left:${pct.toFixed(1)}%"></span>
        </span>
        <span class="ctx-bar-value">${esc(value)}</span>
      </div>`;
  }

  /* ══════════════════════════════════════════════════════════════
     2. SIZE VISUALISER — drawn from the real length and ring gauge
  ══════════════════════════════════════════════════════════════ */
  const PPI = 46;                       // pixels per inch
  const REF = { length: 5.0, ringGauge: 50, name: 'Robusto' };

  /* Wrapper name → leaf colour. Order matters: a "Connecticut Broadleaf
     Maduro" is dark, so the dark keywords have to win over "Connecticut". */
  const WRAPPER_COLORS = [
    [/oscuro|double maduro/i,     ['#3a1c0c', '#180a04']],
    [/broadleaf|san andr[eé]s/i,  ['#5a2c14', '#2a1208']],
    [/maduro/i,                   ['#6b3418', '#331509']],
    [/corojo|criollo/i,           ['#a86a3c', '#6b3d1e']],
    [/habano|rosado/i,            ['#b07545', '#734525']],
    [/sumatra|cameroon/i,         ['#bd8551', '#7d522c']],
    [/connecticut|shade|claro/i,  ['#dcb87d', '#a8814a']],
    [/natural/i,                  ['#c18a55', '#82552f']],
  ];

  function wrapperColors(wrapper) {
    for (const [re, cols] of WRAPPER_COLORS) if (re.test(wrapper || '')) return cols;
    return ['#a8703f', '#6b4525'];
  }

  function cigarShape(x, y, lengthIn, rg, id, colors) {
    const w = lengthIn * PPI;
    const h = (rg / 64) * PPI;
    const capR = h * 0.5;
    // Foot (left) is a flat cut; head (right) is the rounded, capped end.
    const d = `M${x},${y - h / 2}
               L${x + w - capR},${y - h / 2}
               A${capR},${capR} 0 0 1 ${x + w - capR},${y + h / 2}
               L${x},${y + h / 2} Z`;
    return { d, w, h, gradId: id, colors };
  }

  function buildSizeViz(cigar) {
    const maxLen = Math.max(cigar.length, REF.length);
    // Reserve a gutter on the right so the dimension labels aren't clipped
    // by the viewBox edge.
    const LABEL_GUTTER = 96;
    const vw = 8 + maxLen * PPI + LABEL_GUTTER;
    const vh = 152;
    const yMain = 46;
    const yRef  = 104;
    const x0 = 8;

    const cols = wrapperColors(cigar.wrapper);
    const main = cigarShape(x0, yMain, cigar.length, cigar.ringGauge, 'g-main', cols);
    const ref  = cigarShape(x0, yRef,  REF.length,   REF.ringGauge,   'g-ref',  cols);

    // Band sits just below the cap, as it would on the real thing.
    const bandW = Math.min(22, main.w * 0.16);
    const bandX = x0 + main.w - main.h * 0.5 - bandW - 3;

    // Ruler
    const rulerInches = Math.floor(maxLen);
    let ticks = '';
    for (let i = 0; i <= rulerInches; i++) {
      const x = x0 + i * PPI;
      ticks += `<line x1="${x}" y1="${vh - 22}" x2="${x}" y2="${vh - 15}"/>`;
      if (i > 0) ticks += `<text x="${x}" y="${vh - 5}" class="sv-tick-label">${i}"</text>`;
    }

    const isSame = cigar.length === REF.length && cigar.ringGauge === REF.ringGauge;

    return `
      <div class="sv-section">
        <div class="modal-section-title">Actual Size</div>
        <div class="sv-wrap">
          <svg viewBox="0 0 ${vw.toFixed(0)} ${vh}" class="sv-svg" role="img"
               aria-label="${esc(cigar.name)} drawn to scale: ${cigar.length} inches by ring gauge ${cigar.ringGauge}">
            <defs>
              <linearGradient id="g-main" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%"   stop-color="${cols[0]}"/>
                <stop offset="45%"  stop-color="${cols[0]}"/>
                <stop offset="100%" stop-color="${cols[1]}"/>
              </linearGradient>
              <linearGradient id="g-sheen" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%"   stop-color="rgba(255,235,200,0.35)"/>
                <stop offset="40%"  stop-color="rgba(255,235,200,0.05)"/>
                <stop offset="100%" stop-color="rgba(0,0,0,0.25)"/>
              </linearGradient>
            </defs>

            <!-- the cigar itself -->
            <path d="${main.d}" fill="url(#g-main)"/>
            <path d="${main.d}" fill="url(#g-sheen)"/>
            <path d="${main.d}" fill="none" stroke="rgba(0,0,0,0.45)" stroke-width="0.7"/>
            <!-- lit foot -->
            <ellipse cx="${x0}" cy="${yMain}" rx="2.2" ry="${(main.h / 2).toFixed(1)}"
                     fill="#2a1a10" stroke="rgba(201,168,76,0.25)" stroke-width="0.5"/>
            <!-- band -->
            <rect x="${bandX.toFixed(1)}" y="${(yMain - main.h / 2 + 0.6).toFixed(1)}"
                  width="${bandW.toFixed(1)}" height="${(main.h - 1.2).toFixed(1)}"
                  rx="1.5" fill="rgba(201,168,76,0.9)" stroke="rgba(120,90,25,0.8)" stroke-width="0.5"/>

            <text x="${(x0 + main.w + 6).toFixed(0)}" y="${yMain - 4}" class="sv-label">${cigar.length}"</text>
            <text x="${(x0 + main.w + 6).toFixed(0)}" y="${yMain + 8}" class="sv-sublabel">×${cigar.ringGauge}</text>

            <!-- reference outline -->
            ${isSame ? '' : `
              <path d="${ref.d}" fill="none" stroke="rgba(201,168,76,0.35)"
                    stroke-width="0.9" stroke-dasharray="3 2.5"/>
              <text x="${(x0 + ref.w + 6).toFixed(0)}" y="${yRef + 2}" class="sv-sublabel">${REF.name} ${REF.length}"×${REF.ringGauge}</text>`}

            <!-- ruler -->
            <g class="sv-ruler">
              <line x1="${x0}" y1="${vh - 22}" x2="${(x0 + rulerInches * PPI).toFixed(0)}" y2="${vh - 22}"/>
              ${ticks}
            </g>
          </svg>
        </div>
        <p class="sv-note">
          Drawn to scale — ${cigar.length}&Prime; long, ring gauge ${cigar.ringGauge}
          (${(cigar.ringGauge / 64).toFixed(2)}&Prime; across).
          ${isSame ? 'This is the classic Robusto format.' :
            `The dashed outline is a standard Robusto for comparison.`}
        </p>
      </div>`;
  }

  /* ══════════════════════════════════════════════════════════════
     3. SIMILAR CIGARS
     Line extensions are already covered by "Available Sizes", so this
     deliberately reaches across brands instead.
  ══════════════════════════════════════════════════════════════ */
  function similarTo(cigar, limit) {
    const flavors = new Set((cigar.flavors || []).map(f => f.toLowerCase()));
    const sibIds = new Set((typeof SIBLING_MAP !== 'undefined'
      ? (SIBLING_MAP.get(cigar.id) || []) : []).map(c => c.id));

    const scored = [];
    for (const c of cigars()) {
      if (c.id === cigar.id || sibIds.has(c.id)) continue;

      // Flavour overlap is the backbone — Jaccard over the tag sets.
      let shared = 0;
      for (const f of (c.flavors || [])) if (flavors.has(f.toLowerCase())) shared++;
      if (!shared) continue;                            // nothing in common, skip early
      const union = flavors.size + (c.flavors || []).length - shared;
      const jac = shared / union;

      const strengthGap = Math.abs(c.strength - cigar.strength);
      const priceGap = Math.abs(c.price - cigar.price) / Math.max(cigar.price, 1);

      let score = jac * 100;
      score += (2 - Math.min(strengthGap, 2)) * 9;      // closer body scores higher
      score += c.origin === cigar.origin ? 7 : 0;
      score += c.wrapper === cigar.wrapper ? 6 : 0;
      score -= Math.min(priceGap, 1.5) * 10;            // wildly different price is a worse match
      score += (c.rating - 88) * 0.35;                  // gentle nudge toward the better ones
      score -= c.brand === cigar.brand ? 14 : 0;        // prefer a genuinely different house

      scored.push({ c, score, shared });
    }

    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, limit || 6);
  }

  function buildSimilar(cigar) {
    const hits = similarTo(cigar, 6);
    if (hits.length < 3) return '';

    return `
      <div class="sim-section">
        <div class="modal-section-title">If You Like This</div>
        <p class="sim-intro">Matched across the whole library on flavour, body, origin and price — not just other sizes of the same blend.</p>
        <div class="sim-grid">
          ${hits.map(({ c, shared }) => {
            const overlap = (c.flavors || []).filter(f =>
              (cigar.flavors || []).some(g => g.toLowerCase() === f.toLowerCase()));
            return `
              <button class="sim-card" onclick="openModal('${esc(c.id)}')">
                ${c.image
                  ? `<img class="sim-img" src="${esc(c.image)}" alt="" loading="lazy" onerror="this.style.display='none'">`
                  : `<span class="sim-noimg">🚬</span>`}
                <span class="sim-body">
                  <span class="sim-name">${esc(c.name)}</span>
                  <span class="sim-brand">${esc(c.brand)} · ${esc(c.origin)}</span>
                  <span class="sim-tags">${overlap.slice(0, 3).map(f =>
                    `<span class="sim-tag">${esc(f)}</span>`).join('')}</span>
                  <span class="sim-meta">
                    <span class="sim-rating">${c.rating}</span>
                    <span class="sim-price">$${c.price.toFixed(2)}</span>
                    <span class="sim-shared">${shared} shared note${shared !== 1 ? 's' : ''}</span>
                  </span>
                </span>
              </button>`;
          }).join('')}
        </div>
      </div>`;
  }

  /* ══════════════════════════════════════════════════════════════
     4. SHARE
  ══════════════════════════════════════════════════════════════ */
  function shareUrl(kind, id) {
    return location.href.split('#')[0] + '#/' + kind + '/' + id;
  }

  /**
   * Per-cigar / per-house Open Graph preview image URL.
   *
   * Each cigar and brand "house" has a generated 1200×630 share card in
   * /og/ (see scripts/generate-og-images.js + scripts/og-svg-to-png.js).
   * PNGs are preferred where present (rendered with web fonts); SVGs are
   * the always-available fallback.  Returned URLs are absolute so they
   * work when shared off-site.
   */
  const OG_BASE = (() => {
    const u = new URL(location.href);
    return u.origin + u.pathname.replace(/[^/]*$/, '') + 'og/';
  })();

  function ogImageFor(kind, id) {
    // kind is 'cigar' | 'house' | 'brand' | 'home'
    const file = kind === 'cigar'
      ? 'cigar-' + id
      : kind === 'home'
        ? 'home'
        : 'house-' + id;
    // SVG cards ship as-is — modern social scrapers (Facebook, X,
    // LinkedIn, Discord, Telegram, Slack) accept SVG OG images.
    return OG_BASE + file + '.svg';
  }

  function addShareButton(body, kind, id, title) {
    if (!body) return;
    const header = body.querySelector('.modal-header');
    if (!header || header.querySelector('.share-btn')) return;

    const btn = document.createElement('button');
    btn.className = 'share-btn';
    btn.type = 'button';
    btn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" width="15" height="15">
        <circle cx="18" cy="5" r="3" stroke="currentColor" stroke-width="1.8"/>
        <circle cx="6" cy="12" r="3" stroke="currentColor" stroke-width="1.8"/>
        <circle cx="18" cy="19" r="3" stroke="currentColor" stroke-width="1.8"/>
        <path d="M8.6 10.7l6.8-4M8.6 13.3l6.8 4" stroke="currentColor" stroke-width="1.8"/>
      </svg><span>Share</span>`;

    btn.addEventListener('click', async () => {
      const url = shareUrl(kind, id);
      const label = btn.querySelector('span');

      // Native sheet where it exists (mostly mobile), clipboard elsewhere.
      // When the Web Share API supports files, attach the per-cigar OG card
      // so the share preview image travels with the link on platforms that
      // honour image attachments (most mobile browsers, some chat apps).
      if (navigator.share) {
        const shareData = { title, url };
        try {
          if (navigator.canShare && navigator.canShare({ files: [] })) {
            const res = await fetch(ogImageFor(kind, id), { credentials: 'omit' });
            if (res.ok) {
              const blob = await res.blob();
              const file = new File([blob], `vitola-${kind}-${id}.svg`, { type: blob.type || 'image/svg+xml' });
              if (navigator.canShare({ files: [file] })) shareData.files = [file];
            }
          }
          await navigator.share(shareData);
          return;
        } catch (e) {
          if (e && e.name === 'AbortError') return;   // user dismissed; not an error
        }
      }
      try {
        await navigator.clipboard.writeText(url);
        label.textContent = 'Link copied';
        btn.classList.add('copied');
      } catch (e) {
        // Clipboard blocked (insecure origin, file://) — show it to copy by hand.
        label.textContent = 'Copy failed';
        window.prompt('Copy this link:', url);
      }
      setTimeout(() => {
        label.textContent = 'Share';
        btn.classList.remove('copied');
      }, 2200);
    });

    header.appendChild(btn);
  }

  /* ══════════════════════════════════════════════════════════════
     5. PAIRINGS — granular, grouped by category
     Handles BOTH legacy string pairings ("Bourbon") and the new
     structured objects ({ category, type, examples, notes }).
     Strings get their category inferred from keywords; objects use
     the explicit category when present.
  ══════════════════════════════════════════════════════════════ */
  /* Inline SVG icons — crisp at any size, themeable via currentColor.
     Drawn to read at 20×20 inside a pairing card. */
  const PAIRING_SVG = {
    spirits: `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 4h12l-1.5 15a1 1 0 0 1-1 .9H8.5a1 1 0 0 1-1-.9L6 4z"/><path d="M7.8 10h8.4" stroke-opacity="0.7"/></svg>`,
    wine: `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 4h8c0 4-1.5 6-2 7v6h2v3H8v-3h2v-6C9.5 10 8 8 8 4z"/><path d="M9 7c1.2 1.5 4.8 1.5 6 0" stroke-opacity="0.6"/></svg>`,
    beer: `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 4h9v14a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2V4z"/><path d="M7 8h9"/><path d="M16 7h2.5a2 2 0 0 1 0 4H16"/></svg>`,
    coffee: `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 7h12v6a4 4 0 0 1-4 4H9a4 4 0 0 1-4-4V7z"/><path d="M17 9h2a2 2 0 0 1 0 4h-2"/><path d="M8 3c-.4 1 .4 1.5 0 2.5M11 3c-.4 1 .4 1.5 0 2.5" stroke-opacity="0.7"/></svg>`,
    food: `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4.5" stroke-opacity="0.6"/></svg>`,
    other: `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="8"/></svg>`,
  };

  function pairingSvg(accent) {
    return PAIRING_SVG[accent] || PAIRING_SVG.other;
  }

  const PAIRING_CATEGORIES = {
    Whiskey: {
      accent: 'spirits',
      keywords: ['bourbon','scotch','whiskey','whisky','rye','tennessee',
        'irish whiskey','irish cream','japanese whisky','single malt',
        'islay','speyside','highland','lowland','campbeltown','blended whiskey',
        'blended whisky','rye whiskey','wheated bourbon','small batch'],
    },
    Rum: {
      accent: 'spirits',
      keywords: ['rum','aged rum','dark rum','spiced rum','white rum',
        'gold rum','demerara','rhum agricole','rhum','cachaça','cachaca'],
    },
    'Cognac and Brandy': {
      accent: 'spirits',
      keywords: ['cognac','brandy','armagnac','calvados','pisco',
        'vs','vsop','xo','napoleon','eau-de-vie','marc','grappa'],
    },
    'Tequila and Mezcal': {
      accent: 'spirits',
      keywords: ['tequila','mezcal','raicilla','sotol','bacanora',
        'blanco','reposado','añejo','anejo','extra añejo','joven'],
    },
    'Other Spirits': {
      accent: 'spirits',
      keywords: ['gin','vodka','absinthe','aquavit','moonshine',
        'chartreuse','pastis','ouzo','arrack','soju','shochu','sake','saké'],
    },
    Wine: {
      accent: 'wine',
      keywords: ['wine','champagne','sparkling','prosecco','cava','crémant',
        'cremant','chardonnay','cabernet','merlot','pinot','riesling',
        'sauternes','burgundy','bordeaux','chianti','sangiovese',
        'tempranillo','ice wine','icewine','gewürztraminer','gewurztraminer',
        'grüner','gruner','vouvray','tokaji','barolo','barbaresco',
        'malbec','zinfandel','syrah','shiraz','nebbiolo',' barbera'],
    },
    'Fortified Wine': {
      accent: 'wine',
      keywords: ['port','sherry','madeira','marsala','vermouth',
        'tawny','tawny port','cream sherry','amontillado','fino','oloroso',
        'pedro ximénez','pedro ximenez','banyuls','commandaria'],
    },
    Beer: {
      accent: 'beer',
      keywords: ['beer','ale','lager','stout','porter','pilsner','pils',
        'witbier','weiss','weizen','hefeweizen','ipa','amber ale','pale ale',
        'ginger ale','cream ale','saison','faro','lambic','gose','kölsch',
        'kolsch','bitter','dunkel','vienna','rauchbier','oktoberfest','märzen',
        'marzen','bock','doppelbock','weisse','belgian quad','quadrupel',
        'barrel-aged','barrel aged'],
    },
    Coffee: {
      accent: 'coffee',
      keywords: ['coffee','espresso','café','cafe','cappuccino','latte',
        'macchiato','mocha','americano','ristretto','cortado','au lait',
        'crème','creme','de olla','iced coffee','cold brew','flat white',
        'lungo','red eye','cortadito','café crème','cafe creme','café au lait',
        'cafe au lait','café de olla','cafe de olla','cuban coffee',
        'turkish coffee','french press'],
    },
    Tea: {
      accent: 'coffee',
      keywords: ['tea','black tea','chai','earl grey','green tea',
        'oolong','puer','pu-erh','matcha','yerba mate','darjeeling',
        'assam','ceylon','lapsang','souchong'],
    },
    Food: {
      accent: 'food',
      keywords: ['chocolate','cheese','dessert','food','nuts','cake','pastry',
        'croissant','crème brûlée','creme brulee','ice cream','gelato',
        'cookie','biscotti','caramel','toffee','fruit','dried fruit',
        'charcuterie','steak','bbq','barbecue','tapas','sushi','curry',
        'chili','chilli','olive','jam','honey','panettone','stollen',
        'marzipan','nougat','turrón','turron','dark chocolate',
        'grilled meats','aged cheese','blue cheese','cheddar','manchego',
        'parmesan','pecorino','prosciutto','salami','paté','pate'],
    },
    'Non-Alcoholic': {
      accent: 'food',
      keywords: ['cola','ginger beer','ginger ale','lemonade','mocktail',
        'kombucha','soda','tonic water','seltzer','sparkling water',
        'hot chocolate','cider','apple cider'],
    },
  };

  const PAIRING_ORDER = ['Whiskey','Rum','Cognac and Brandy','Tequila and Mezcal',
    'Other Spirits','Wine','Fortified Wine','Beer','Coffee','Tea',
    'Food','Non-Alcoholic','Other'];

  function inferPairingCategory(text) {
    const t = String(text || '').toLowerCase();
    if (!t) return 'Other';
    for (const [name, cfg] of Object.entries(PAIRING_CATEGORIES)) {
      for (const kw of cfg.keywords) {
        if (t.includes(kw)) return name;
      }
    }
    // Teas, waters, and anything else land in a neutral bucket so the
    // five colour-coded categories stay uncluttered.
    return 'Other';
  }

  function normalizePairing(p) {
    if (p == null) return null;
    if (typeof p === 'string') {
      const trimmed = p.trim();
      if (!trimmed) return null;
      return {
        category: inferPairingCategory(trimmed),
        type: trimmed,
        examples: [],
        notes: '',
      };
    }
    if (typeof p === 'object') {
      const type = String(p.type || p.name || '').trim();
      if (!type) return null;
      const category = p.category
        ? String(p.category).trim()
        : inferPairingCategory(type);
      const examples = Array.isArray(p.examples)
        ? p.examples.map(e => String(e).trim()).filter(Boolean)
        : (p.example ? [String(p.example).trim()] : []);
      const notes = String(p.notes || p.note || '').trim();
      return { category, type, examples, notes };
    }
    return null;
  }

  function buildPairings(pairings) {
    const raw = Array.isArray(pairings) ? pairings : [];
    if (!raw.length) return '';

    const normalized = raw.map(normalizePairing).filter(Boolean);
    if (!normalized.length) return '';

    // Group by category, preserving first-seen order within each group.
    const groups = {};
    for (const p of normalized) {
      (groups[p.category] = groups[p.category] || []).push(p);
    }

    // Order categories: known palette first, then any unexpected ones.
    const orderedCats = PAIRING_ORDER.filter(c => groups[c]);
    for (const c of Object.keys(groups)) {
      if (!orderedCats.includes(c)) orderedCats.push(c);
    }

    const groupHtml = orderedCats.map(cat => {
      const items = groups[cat];
      const cfg = PAIRING_CATEGORIES[cat] || { accent: 'other' };
      const groupSvg = pairingSvg(cfg.accent);

      const itemsHtml = items.map(p => {
        const exHtml = p.examples.length
          ? `<span class="pairing-examples">${p.examples.map(e =>
              `<span class="pairing-example">${esc(e)}</span>`).join('')}</span>`
          : '';
        const notesHtml = p.notes
          ? `<span class="pairing-notes">${esc(p.notes)}</span>`
          : '';
        return `<span class="pairing-tag pairing-tag--${cfg.accent}">
            <span class="pairing-tag-type">${esc(p.type)}</span>
            ${exHtml}${notesHtml}
          </span>`;
      }).join('');

      return `<div class="pairing-row pairing-row--${cfg.accent}">
        <div class="pairing-row-label">
          <span class="pairing-row-icon" aria-hidden="true">${groupSvg}</span>
          <span class="pairing-row-name">${esc(cat)}</span>
        </div>
        <div class="pairing-row-tags">${itemsHtml}</div>
      </div>`;
    }).join('');

    return `<div class="pairing-list-clean">${groupHtml}</div>`;
  }

  /* Replace the simple pairing chip list rendered by app.js with the
     granular, grouped display. Called from both the cigar and pipe
     tobacco modal hooks. Returns true if it replaced something. */
  function enrichPairings(body, pairings) {
    if (!body) return false;
    const section = body.querySelector('.modal-pairings');
    if (!section) return false;
    const rich = buildPairings(pairings);
    if (!rich) return false;
    section.innerHTML =
      `<div class="modal-section-title">Pairs Well With</div>${rich}`;
    section.classList.add('vp-pairings-rich-wrap');
    return true;
  }

  /* ══════════════════════════════════════════════════════════════
     6a. PIPE TYPE RECOMMENDATIONS
     For each pipe tobacco blend, recommend which pipe material pairs
     best. Uses the PIPE_TYPES / recommendPipeTypes() from js/pipe-types.js.
     Renders a compact "best pipe" row under the pairings in the modal.
  ══════════════════════════════════════════════════════════════ */
  function buildPipeTypeRecs(blend) {
    if (typeof recommendPipeTypes !== 'function') return '';
    const recs = recommendPipeTypes(blend);
    if (!recs.length) return '';

    // Risk badge colour per ghosting level
    const RISK_COLOR = {
      none: '#6fae6f',
      low: '#a4c25a',
      medium: '#e0a84a',
      high: '#d76b4a',
    };
    // Heat-resistance dots (1-5)
    const heatDots = level =>
      Array.from({ length: 5 }, (_, i) =>
        `<span style="color:${i < level ? '#c9943a' : 'rgba(201,168,76,0.25)'};font-size:14px">●</span>`
      ).join('');

    const top = recs[0];
    const rest = recs.slice(1, 4); // show the best + up to 3 runners-up

    const card = (r, isTop) => {
      const pt = r.pipe;
      const riskColor = RISK_COLOR[pt.ghostingRisk] || RISK_COLOR.medium;
      return `
        <div class="pt-rec${isTop ? ' pt-rec--top' : ''}">
          <div class="pt-rec-head">
            <span class="pt-rec-name">${esc(pt.name)}</span>
            ${isTop ? '<span class="pt-rec-best">Best match</span>' : ''}
          </div>
          <div class="pt-rec-material">${esc(pt.material)}</div>
          <div class="pt-rec-meta">
            <span class="pt-rec-field"><span class="pt-rec-label">Ghosting</span>
              <span class="pt-rec-risk" style="color:${riskColor}">${pt.ghostingRisk}</span></span>
            <span class="pt-rec-field"><span class="pt-rec-label">Heat</span>
              <span class="pt-rec-heat">${heatDots(pt.heatResistance)}</span></span>
          </div>
          <div class="pt-rec-flavor">${esc(pt.flavorProfile)}</div>
          <div class="pt-rec-care"><span class="pt-rec-care-label">Care</span>${esc(pt.careNotes)}</div>
        </div>`;
    };

    const topHtml = card(top, true);
    const restHtml = rest.length
      ? `<div class="pt-rec-others">
           <div class="pt-rec-others-label">Also excellent</div>
           ${rest.map(r => `
             <div class="pt-rec-mini">
               <span class="pt-rec-mini-name">${esc(r.pipe.name)}</span>
               <span class="pt-rec-mini-flavor">${esc(r.pipe.flavorProfile)}</span>
             </div>`).join('')}
         </div>`
      : '';

    return `<div class="modal-pipe-types">
      <div class="modal-section-title">Best Pipe for This Blend</div>
      ${topHtml}
      ${restHtml}
    </div>`;
  }

  /* ══════════════════════════════════════════════════════════════
     6. 360° PHOTO ROTATION
     Drag the hero photo horizontally to spin it on its Y axis. The
     rotation accumulates across drags and persists while the modal
     is open. A "drag to rotate" hint fades out after 3 seconds.
  ══════════════════════════════════════════════════════════════ */
  function enablePhotoRotation(body) {
    const wrapEl = body.querySelector('.modal-hero-img-wrap');
    const img = wrapEl && wrapEl.querySelector('.modal-hero-img');
    if (!wrapEl || !img) return;

    // Reset any state from a previous open.
    img.style.transform = '';
    let rotation = 0;
    let dragging = false;
    let startX = 0;
    let startRot = 0;

    // Hint — fades after 3s (CSS handles the fade).
    if (!wrapEl.querySelector('.vp-rotate-hint')) {
      const hint = document.createElement('span');
      hint.className = 'vp-rotate-hint';
      hint.textContent = 'drag to rotate ⟳';
      wrapEl.appendChild(hint);
      setTimeout(() => hint.classList.add('vp-rotate-hint--fade'), 3000);
    }

    const onDown = (e) => {
      dragging = true;
      startX = (e.touches ? e.touches[0].clientX : e.clientX);
      startRot = rotation;
      img.style.cursor = 'grabbing';
      e.preventDefault();
    };
    const onMove = (e) => {
      if (!dragging) return;
      const x = (e.touches ? e.touches[0].clientX : e.clientX);
      // 1px ≈ 1.6° of yaw — feels responsive without spinning out of control.
      rotation = startRot + (x - startX) * 1.6;
      img.style.transform = `rotateY(${rotation.toFixed(1)}deg)`;
    };
    const onUp = () => {
      if (!dragging) return;
      dragging = false;
      img.style.cursor = 'grab';
    };

    img.style.cursor = 'grab';
    img.style.willChange = 'transform';
    // perspective on the wrapper gives rotateY real depth.
    wrapEl.classList.add('vp-rotate-3d');

    img.addEventListener('mousedown', onDown);
    img.addEventListener('touchstart', onDown, { passive: false });
    window.addEventListener('mousemove', onMove);
    window.addEventListener('touchmove', onMove, { passive: false });
    window.addEventListener('mouseup', onUp);
    window.addEventListener('touchend', onUp);

    // Return a cleanup function so callers can remove the window-level
    // listeners when the modal closes — otherwise each open leaks 4
    // stale listeners (mousemove, mouseup, touchmove, touchend).
    return function cleanupPhotoRotation() {
      img.removeEventListener('mousedown', onDown);
      img.removeEventListener('touchstart', onDown);
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('mouseup', onUp);
      window.removeEventListener('touchend', onUp);
    };
  }

  /* ══════════════════════════════════════════════════════════════
     7. FLAVOR WHEEL — animated draw-in + hover tooltips + click-to-filter
     The wheel is SVG <path> segments. Each segment strokes itself
     in with a stroke-dasharray draw, staggered 100ms per segment.
     Falls back to a fade+scale for any non-path wheel (canvas).
     Hovering a segment shows a tooltip with category + flavors + count.
     Clicking a segment closes the modal and filters the grid by that
     flavor. Returns a cleanup function so listeners are removed on
     modal close (prevents the leak the prior fix addressed).
  ══════════════════════════════════════════════════════════════ */
  function animateFlavorWheel(body) {
    const svg = body.querySelector('#flavorWheelSvg');
    if (!svg) return;

    const segs = Array.from(svg.querySelectorAll('path.fw-seg'));
    if (!segs.length) {
      // Canvas/other fallback: fade + scale the whole wheel.
      const wheel = body.querySelector('.flavor-wheel-wrap');
      if (wheel) {
        wheel.classList.add('vp-wheel-fade');
        requestAnimationFrame(() => wheel.classList.add('vp-wheel-in'));
      }
      return;
    }

    // ── Draw-in animation (stroke-dashoffset) ──
    segs.forEach((p, i) => {
      const len = p.getTotalLength ? p.getTotalLength() : 0;
      // Highlight the segment outline while it draws.
      p.style.stroke = p.getAttribute('fill') || '#c9a84c';
      p.style.strokeWidth = '2';
      p.style.strokeOpacity = '0.85';
      p.style.fillOpacity = '0';
      p.style.strokeDasharray = len;
      p.style.strokeDashoffset = len;
      p.style.transition =
        `stroke-dashoffset 0.5s ease-out ${i * 0.1}s, fill-opacity 0.4s ease ${i * 0.1 + 0.25}s`;
    });

    // Force a reflow so the initial dashoffset sticks before we animate.
    void svg.getBoundingClientRect();

    segs.forEach((p) => {
      p.style.strokeDashoffset = '0';
      // Remove the SVG 'opacity' attribute before setting fillOpacity. The SVG
      // 'opacity' attribute composites the entire element (including fill),
      // so effective fill visibility = opacity_attr × fillOpacity_style.
      // Without this removal, unmatched segments end up at 0.18×0.18≈0.03
      // (nearly invisible) because both the attribute and style apply.
      const fill = p.getAttribute('opacity');
      if (fill != null) p.removeAttribute('opacity');
      p.style.fillOpacity = fill != null ? fill : '0.85';
    });

    // Reset the temporary stroke styles once the draw-in animation finishes,
    // otherwise the wheel permanently has thick outlines. The last segment
    // starts at (segs.length - 1) × 0.1s; its 0.5s stroke animation ends at
    // that time + 0.5s. We add a small buffer.
    const lastSegDelay = (segs.length - 1) * 0.1;
    const resetAfter = (lastSegDelay + 0.5 + 0.1) * 1000;
    setTimeout(() => {
      segs.forEach((p) => {
        p.style.stroke = '';
        p.style.strokeWidth = '';
        p.style.strokeOpacity = '';
        p.style.strokeDasharray = '';
        p.style.strokeDashoffset = '';
      });
    }, resetAfter);

    // ── Hover tooltip ──
    // A single floating div reused for all segments, created lazily.
    let tooltip = null;
    function ensureTooltip() {
      if (tooltip) return tooltip;
      tooltip = document.createElement('div');
      tooltip.className = 'fw-tooltip';
      tooltip.style.display = 'none';
      body.appendChild(tooltip);
      return tooltip;
    }

    function showTip(e, seg) {
      const tip = ensureTooltip();
      const cat = seg.getAttribute('data-cat') || '';
      const flavors = seg.getAttribute('data-flavors') || '';
      const count = seg.getAttribute('data-intensity') || '0';
      const filterFlavor = seg.getAttribute('data-filter') || '';

      const flavorList = flavors
        ? flavors.split(', ').map(f => `<span class="fw-tip-flavor">${esc(f)}</span>`).join('')
        : '<span class="fw-tip-empty">No matching notes</span>';

      tip.innerHTML = `
        <div class="fw-tip-cat">${esc(cat)}</div>
        ${count > 0 ? `<div class="fw-tip-count">${count} flavor note${count !== '1' ? 's' : ''}</div>` : ''}
        <div class="fw-tip-flavors">${flavorList}</div>
        ${count > 0 ? `<div class="fw-tip-hint">Click to filter by ${esc(filterFlavor)}</div>` : ''}
      `;
      tip.style.display = 'block';

      // Position near the cursor, clamped to the modal body.
      const rect = body.getBoundingClientRect();
      const tipW = 200;
      let x = e.clientX - rect.left + 14;
      let y = e.clientY - rect.top + 14;
      if (x + tipW > rect.width) x = e.clientX - rect.left - tipW - 10;
      if (y < 0) y = 4;
      tip.style.left = x + 'px';
      tip.style.top = y + 'px';
    }

    function moveTip(e) {
      if (!tooltip || tooltip.style.display === 'none') return;
      const rect = body.getBoundingClientRect();
      const tipW = 200;
      let x = e.clientX - rect.left + 14;
      let y = e.clientY - rect.top + 14;
      if (x + tipW > rect.width) x = e.clientX - rect.left - tipW - 10;
      if (y < 0) y = 4;
      tooltip.style.left = x + 'px';
      tooltip.style.top = y + 'px';
    }

    function hideTip() {
      if (tooltip) tooltip.style.display = 'none';
    }

    // ── Click-to-filter ──
    function filterBySeg(seg) {
      const filterFlavor = seg.getAttribute('data-filter');
      if (!filterFlavor) return;
      // Close the modal first, then apply the filter on the main grid.
      if (typeof window.closeModal === 'function') window.closeModal();
      if (typeof state !== 'undefined' && typeof render === 'function') {
        state.flavor = filterFlavor;
        // Sync the flavor search input if it exists.
        const input = document.getElementById('flavorSearch');
        if (input) {
          input.value = filterFlavor;
          input.classList.add('flavor-active');
          const clr = document.querySelector('.flavor-srch-clr');
          if (clr) clr.classList.add('visible');
        }
        // Deactivate all flavor pills, activate matching one if any.
        document.querySelectorAll('#flavorFilter .pill').forEach(p => p.classList.remove('active'));
        render();
      }
    }

    const onSegEnter = (e) => {
      const seg = e.currentTarget;
      seg.style.transition = 'fill-opacity 0.2s ease, stroke-width 0.2s ease';
      const orig = seg.getAttribute('data-orig-opacity');
      if (orig == null) {
        // Store current fillOpacity so we can restore on leave.
        seg.setAttribute('data-orig-opacity', seg.style.fillOpacity || '0.85');
      }
      seg.style.fillOpacity = '1';
      seg.style.strokeWidth = '2.5';
      showTip(e, seg);
    };
    const onSegMove = (e) => moveTip(e);
    const onSegLeave = (e) => {
      const seg = e.currentTarget;
      const orig = seg.getAttribute('data-orig-opacity');
      seg.style.fillOpacity = orig || '0.85';
      seg.style.strokeWidth = '';
      hideTip();
    };
    const onSegClick = (e) => {
      e.stopPropagation();
      filterBySeg(e.currentTarget);
    };
    const onSegKey = (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        filterBySeg(e.currentTarget);
      }
    };

    segs.forEach((p) => {
      p.addEventListener('mouseenter', onSegEnter);
      p.addEventListener('mousemove', onSegMove);
      p.addEventListener('mouseleave', onSegLeave);
      p.addEventListener('click', onSegClick);
      p.addEventListener('keydown', onSegKey);
    });

    // Return cleanup so callers can remove listeners on modal close.
    return function cleanupFlavorWheel() {
      segs.forEach((p) => {
        p.removeEventListener('mouseenter', onSegEnter);
        p.removeEventListener('mousemove', onSegMove);
        p.removeEventListener('mouseleave', onSegLeave);
        p.removeEventListener('click', onSegClick);
        p.removeEventListener('keydown', onSegKey);
      });
      if (tooltip && tooltip.parentNode) {
        tooltip.parentNode.removeChild(tooltip);
        tooltip = null;
      }
    };
  }

  /* ══════════════════════════════════════════════════════════════
     HOOK
  ══════════════════════════════════════════════════════════════ */
  function wrap() {
    const orig = window.openModal;
    if (typeof orig !== 'function') return;

    // Holds the cleanup function returned by enablePhotoRotation for the
    // currently-open modal, so we can tear down window listeners on close.
    let photoRotationCleanup = null;
    // Holds the cleanup function returned by animateFlavorWheel for the
    // currently-open modal, so we can tear down tooltip/listener leaks on close.
    let flavorWheelCleanup = null;

    window.openModal = function (id) {
      // Tear down any photo-rotation listeners left by the previous modal.
      if (photoRotationCleanup) {
        photoRotationCleanup();
        photoRotationCleanup = null;
      }
      // Tear down any flavor-wheel listeners left by the previous modal.
      if (flavorWheelCleanup) {
        flavorWheelCleanup();
        flavorWheelCleanup = null;
      }

      orig(id);
      const cigar = cigars().find(c => c.id === id);
      if (!cigar) return;
      const body = document.getElementById('modalBody');
      if (!body) return;

      // Context sits right under the headline numbers it explains.
      const specs = body.querySelector('.modal-specs');
      if (specs) specs.insertAdjacentHTML('afterend', buildSizeViz(cigar) + buildContext(cigar));

      // Replace the simple pairing chips with the granular, grouped display.
      enrichPairings(body, cigar.pairings);

      // 360° drag-to-rotate on the hero photo (skips silently if no image).
      // Store the cleanup function so listeners are removed on modal close.
      photoRotationCleanup = enablePhotoRotation(body);

      // Animate the flavor wheel segments in sequence + attach hover/click.
      // Store the cleanup function so listeners are removed on modal close.
      flavorWheelCleanup = animateFlavorWheel(body);

      // Recommendations go last, after the buy links.
      const buy = body.querySelector('.modal-buy-section') || body.lastElementChild;
      if (buy) buy.insertAdjacentHTML('afterend', buildSimilar(cigar));

      addShareButton(body, 'cigar', id, cigar.name + ' — Vitola Pedia');
    };

    // Also clean up when the modal is closed via closeModal.
    const origClose = window.closeModal;
    if (typeof origClose === 'function') {
      window.closeModal = function () {
        if (photoRotationCleanup) {
          photoRotationCleanup();
          photoRotationCleanup = null;
        }
        if (flavorWheelCleanup) {
          flavorWheelCleanup();
          flavorWheelCleanup = null;
        }
        return origClose.apply(this, arguments);
      };
    }

    const origPT = window.openPTModal;
    if (typeof origPT === 'function') {
      window.openPTModal = function (id) {
        origPT(id);
        const pt = (typeof PIPE_TOBACCOS !== 'undefined' ? PIPE_TOBACCOS : []).find(p => p.id === id);
        if (!pt) return;
        enrichPairings(document.getElementById('modalBody'), pt.pairings);
        addShareButton(document.getElementById('modalBody'), 'tobacco', id,
          pt.name + ' — Vitola Pedia');
        // Pipe type recommendations — injected under the pairings section
        const body = document.getElementById('modalBody');
        const recsHtml = buildPipeTypeRecs(pt);
        if (recsHtml) {
          const pairings = body && body.querySelector('.modal-pairings');
          if (pairings) pairings.insertAdjacentHTML('afterend', recsHtml);
          else if (body) body.insertAdjacentHTML('beforeend', recsHtml);
        }
      };
    }
  }

  // Run after immersive.js has done its own wrapping so both survive.
  document.addEventListener('DOMContentLoaded', () => setTimeout(wrap, 120));

  window.VPEnrich = { similarTo, percentile, buildSizeViz, buildContext, buildPairings, buildPipeTypeRecs };
})();
