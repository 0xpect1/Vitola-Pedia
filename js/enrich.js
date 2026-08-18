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
     HOOK
  ══════════════════════════════════════════════════════════════ */
  function wrap() {
    const orig = window.openModal;
    if (typeof orig !== 'function') return;

    window.openModal = function (id) {
      orig(id);
      const cigar = cigars().find(c => c.id === id);
      if (!cigar) return;
      const body = document.getElementById('modalBody');
      if (!body) return;

      // Context sits right under the headline numbers it explains.
      const specs = body.querySelector('.modal-specs');
      if (specs) specs.insertAdjacentHTML('afterend', buildSizeViz(cigar) + buildContext(cigar));

      // Recommendations go last, after the buy links.
      const buy = body.querySelector('.modal-buy-section') || body.lastElementChild;
      if (buy) buy.insertAdjacentHTML('afterend', buildSimilar(cigar));

      addShareButton(body, 'cigar', id, cigar.name + ' — Vitola Pedia');
    };

    const origPT = window.openPTModal;
    if (typeof origPT === 'function') {
      window.openPTModal = function (id) {
        origPT(id);
        const pt = (typeof PIPE_TOBACCOS !== 'undefined' ? PIPE_TOBACCOS : []).find(p => p.id === id);
        if (!pt) return;
        addShareButton(document.getElementById('modalBody'), 'tobacco', id,
          pt.name + ' — Vitola Pedia');
      };
    }
  }

  // Run after immersive.js has done its own wrapping so both survive.
  document.addEventListener('DOMContentLoaded', () => setTimeout(wrap, 120));

  window.VPEnrich = { similarTo, percentile, buildSizeViz, buildContext };
})();
