/* ══════════════════════════════════════════════════════════════════
   VITOLA PEDIA — PREMIUM ENRICHMENTS
   Builds the premium modal sections:
     F. Tasting Notes (third-by-third)
     G. Cigar DNA cross-section
     H. Rating sub-score breakdown
     I. Pairing match scores
     J. Cellar / Wishlist (localStorage)
     A. Cursor-following gold glow (card hover)
   Hooks after VPEnrich wraps openModal.
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
     F. TASTING NOTES — THIRD-BY-THIRD
     Generates a structured tasting progression from the cigar's
     flavor profile, strength, and blend data.
  ══════════════════════════════════════════════════════════════ */

  // Flavor role inference — which flavors tend to appear in which third
  const FIRST_THIRD_FLAVORS = ['Cedar', 'Toast', 'Cream', 'Vanilla', 'Honey', 'Hay', 'Grass', 'Floral', 'Sweet', 'Baking Spice', 'Caramel', 'Nuts', 'Almond', 'Coffee', 'Mild Coffee', 'Citrus', 'Orange Zest'];
  const MIDDLE_THIRD_FLAVORS = ['Leather', 'Earth', 'Cocoa', 'Chocolate', 'Dark Chocolate', 'Espresso', 'Dark Coffee', 'Roasted Coffee', 'Pepper', 'Spice', 'Wood', 'Tobacco', 'Herbal', 'Mineral', 'Olive', 'Barnyard'];
  const FINAL_THIRD_FLAVORS = ['Dark Chocolate', 'Espresso', 'Leather', 'Earth', 'Tar', 'Charcoal', 'Dark Earth', 'Pepper', 'Black Pepper', 'White Pepper', 'Dark Spice', 'Fig', 'Raisin', 'Dried Fruit', 'Dark Fruit', 'Smoke', 'Anise'];

  function partitionFlavors(flavors) {
    const first = [], middle = [], final = [];
    const remaining = [...flavors];

    for (const f of remaining) {
      if (FIRST_THIRD_FLAVORS.some(p => f.toLowerCase().includes(p.toLowerCase()))) first.push(f);
      else if (MIDDLE_THIRD_FLAVORS.some(p => f.toLowerCase().includes(p.toLowerCase()))) middle.push(f);
      else if (FINAL_THIRD_FLAVORS.some(p => f.toLowerCase().includes(p.toLowerCase()))) final.push(f);
    }
    // Assign any unclassified flavors to middle
    const classified = new Set([...first, ...middle, ...final]);
    for (const f of remaining) {
      if (!classified.has(f)) middle.push(f);
    }
    return { first, middle, final };
  }

  function buildTastingNotes(cigar) {
    const { first, middle, final } = partitionFlavors(cigar.flavors);
    const sc = cigar.strength;

    // Build narrative text for each third
    const firstText = first.length
      ? `Opens with ${first.slice(0, 3).map(f => f.toLowerCase()).join(', ')}${first.length > 3 ? ' and subtle ' + first[3].toLowerCase() : ''}. ${sc <= 2 ? 'A gentle, approachable start that invites the palate.' : sc <= 3 ? 'A balanced introduction that builds gradually.' : 'A bold opening that announces the cigar\u2019s character.'}`
      : `The cigar opens with a smooth, inviting character. ${sc <= 2 ? 'Mild and approachable from the first puff.' : 'Building intensity as the blend warms.'}`;

    const midText = middle.length
      ? `The middle third develops ${middle.slice(0, 3).map(f => f.toLowerCase()).join(', ')}${middle.length > 3 ? ' layered with ' + middle[3].toLowerCase() : ''}. ${sc >= 4 ? 'The body deepens and the spice builds on the retrohale.' : 'The flavor profile rounds out and the draw remains effortless.'}`
      : `The middle third rounds out beautifully. The blend hits its stride, with the core flavors harmonizing into a satisfying midpoint.`;

    const finalText = final.length
      ? `The final third intensifies with ${final.slice(0, 3).map(f => f.toLowerCase()).join(', ')}${final.length > 3 ? ' and lingering ' + final[3].toLowerCase() : ''}. ${sc >= 4 ? 'A powerful, memorable finish that rewards the patient smoker.' : 'A smooth, satisfying conclusion that doesn\u2019t overwhelm.'}`
      : `The final third brings a satisfying crescendo. The warmth builds, the flavors concentrate, and the cigar concludes with a clean, memorable finish.`;

    // Retrohale notes
    const pepperFlavors = cigar.flavors.filter(f => /pepper|spice/i.test(f));
    const retrohale = pepperFlavors.length
      ? `${pepperFlavors[0]} on the retrohale, with a warm, tingly sensation through the sinuses.`
      : `Smooth and cool on the retrohale, with subtle sweetness.`;

    // Split the flavors array into thirds for display
    const allFlavors = cigar.flavors;
    const thirdCount = Math.max(1, Math.ceil(allFlavors.length / 3));
    const firstThirdFlavors = allFlavors.slice(0, thirdCount);
    const middleThirdFlavors = allFlavors.slice(thirdCount, thirdCount * 2);
    const finalThirdFlavors = allFlavors.slice(thirdCount * 2);

    return `
      <div class="modal-section-block" style="margin-top:28px">
        <div class="modal-section-title">Tasting Notes</div>
        <div class="tasting-notes">
          <div class="tasting-third">
            <div class="tasting-third-label">
              <span class="tasting-third-name">First Third</span>
              <span class="tasting-third-pct">0–33%</span>
              <div class="tasting-third-progress"><div class="tasting-third-progress-fill" style="width:33%"></div></div>
            </div>
            <div class="tasting-third-body">
              ${esc(firstText)}
              <div class="tasting-third-flavors">${firstThirdFlavors.map(f => `<span class="tasting-flavor-tag">${esc(f)}</span>`).join('')}</div>
              <div class="tasting-retrohale">${esc(retrohale)}</div>
            </div>
          </div>
          <div class="tasting-third">
            <div class="tasting-third-label">
              <span class="tasting-third-name">Middle Third</span>
              <span class="tasting-third-pct">33–66%</span>
              <div class="tasting-third-progress"><div class="tasting-third-progress-fill" style="width:66%"></div></div>
            </div>
            <div class="tasting-third-body">
              ${esc(midText)}
              <div class="tasting-third-flavors">${middleThirdFlavors.map(f => `<span class="tasting-flavor-tag">${esc(f)}</span>`).join('')}</div>
            </div>
          </div>
          <div class="tasting-third">
            <div class="tasting-third-label">
              <span class="tasting-third-name">Final Third</span>
              <span class="tasting-third-pct">66–100%</span>
              <div class="tasting-third-progress"><div class="tasting-third-progress-fill" style="width:100%"></div></div>
            </div>
            <div class="tasting-third-body">
              ${esc(finalText)}
              <div class="tasting-third-flavors">${finalThirdFlavors.map(f => `<span class="tasting-flavor-tag">${esc(f)}</span>`).join('')}</div>
            </div>
          </div>
        </div>
      </div>`;
  }

  /* ══════════════════════════════════════════════════════════════
     G. CIGAR DNA CROSS-SECTION DIAGRAM
     A concentric-layer SVG showing wrapper → binder → filler.
  ══════════════════════════════════════════════════════════════ */

  // Map wrapper names to representative colors
  const WRAPPER_COLORS = {
    'maduro': '#3d2817', 'broadleaf': '#4a3020', 'connecticut': '#8b7355',
    'habano': '#a05530', 'corojo': '#8b3a2a', 'cameroon': '#7a5c3a',
    'sumatra': '#6b4e2e', 'criollo': '#9c6b3f', 'shade': '#c4a87a',
    'negro': '#2d1f12', 'mexican': '#5a3e1e', 'ojas': '#7a5c3a',
  };

  function wrapperColor(wrapperName) {
    const w = wrapperName.toLowerCase();
    for (const [key, color] of Object.entries(WRAPPER_COLORS)) {
      if (w.includes(key)) return color;
    }
    return '#7a5c3a'; // default brown
  }

  function buildDNADiagram(cigar) {
    const wc = wrapperColor(cigar.wrapper);
    const bc = wrapperColor(cigar.binder);
    const fc = wrapperColor(cigar.filler);

    return `
      <div class="modal-section-block" style="margin-top:28px">
        <div class="modal-section-title">Blend Composition</div>
        <div class="cigar-dna">
          <svg class="cigar-dna-svg" viewBox="0 0 120 120" role="img" aria-label="Cigar cross-section showing wrapper, binder, and filler layers">
            <!-- Filler (center) -->
            <circle cx="60" cy="60" r="20" fill="${fc}" opacity="0.6" stroke="${fc}" stroke-width="1.5"/>
            <!-- Filler strands -->
            <circle cx="52" cy="54" r="5" fill="${fc}" opacity="0.8"/>
            <circle cx="66" cy="56" r="5" fill="${fc}" opacity="0.8"/>
            <circle cx="58" cy="66" r="5" fill="${fc}" opacity="0.8"/>
            <circle cx="68" cy="66" r="4" fill="${fc}" opacity="0.8"/>
            <!-- Binder (middle ring) -->
            <circle cx="60" cy="60" r="36" fill="none" stroke="${bc}" stroke-width="12" opacity="0.5"/>
            <!-- Wrapper (outer ring) -->
            <circle cx="60" cy="60" r="50" fill="none" stroke="${wc}" stroke-width="10" opacity="0.7"/>
            <!-- Labels -->
            <text x="60" y="64" text-anchor="middle" font-size="8" fill="rgba(255,255,255,0.6)" font-family="Inter, sans-serif" font-weight="600">FILLER</text>
          </svg>
          <div class="cigar-dna-legend">
            <div class="dna-layer">
              <div class="dna-swatch" style="background:${wc}"></div>
              <div class="dna-label">
                <span class="dna-layer-name">Wrapper</span>
                <span class="dna-layer-value">${esc(cigar.wrapper)}</span>
              </div>
            </div>
            <div class="dna-layer">
              <div class="dna-swatch" style="background:${bc}"></div>
              <div class="dna-label">
                <span class="dna-layer-name">Binder</span>
                <span class="dna-layer-value">${esc(cigar.binder)}</span>
              </div>
            </div>
            <div class="dna-layer">
              <div class="dna-swatch" style="background:${fc}"></div>
              <div class="dna-label">
                <span class="dna-layer-name">Filler</span>
                <span class="dna-layer-value">${esc(cigar.filler)}</span>
              </div>
            </div>
          </div>
        </div>
      </div>`;
  }

  /* ══════════════════════════════════════════════════════════════
     H. RATING SUB-SCORE BREAKDOWN
     Derives 5 sub-scores from the composite rating using
     deterministic weighting based on blend characteristics.
  ══════════════════════════════════════════════════════════════ */

  function buildRatingBreakdown(cigar) {
    const base = cigar.rating;
    // Derive sub-scores with deterministic offsets
    // Appearance: influenced by wrapper type and rating
    const appearance = Math.max(80, Math.min(100, base + (cigar.wrapper.toLowerCase().includes('maduro') ? 1 : 0) - 2));
    // Draw & Construction: influenced by origin and brand reputation
    const construction = Math.max(80, Math.min(100, base + (cigar.popularity >= 7 ? 1 : -1) - 1));
    // Flavor: the most important — closest to the base rating
    const flavor = Math.max(80, Math.min(100, base + (cigar.flavors.length >= 5 ? 1 : -1)));
    // Finish: influenced by strength (fuller = longer finish)
    const finish = Math.max(80, Math.min(100, base + (cigar.strength >= 4 ? 1 : 0) - 1));
    // Overall: weighted average, slightly higher than sub-scores
    const overall = Math.max(80, Math.min(100, Math.round((appearance + construction + flavor + finish) / 4) + 1));

    const scores = [
      { label: 'Appearance', score: appearance },
      { label: 'Draw', score: construction },
      { label: 'Flavor', score: flavor },
      { label: 'Finish', score: finish },
      { label: 'Overall', score: overall },
    ];

    return `
      <div class="modal-section-block" style="margin-top:28px">
        <div class="modal-section-title">Rating Breakdown</div>
        <div class="rating-breakdown">
          ${scores.map(s => `
            <div class="rating-sub-box">
              <span class="rating-sub-label">${esc(s.label)}</span>
              <div class="rating-sub-bar"><div class="rating-sub-bar-fill" style="width:${s.score}%"></div></div>
              <span class="rating-sub-score">${s.score}</span>
            </div>
          `).join('')}
        </div>
      </div>`;
  }

  /* ══════════════════════════════════════════════════════════════
     I. PAIRING MATCH SCORES
     Adds star ratings to each pairing entry based on
     the pairing knowledge base rules.
  ══════════════════════════════════════════════════════════════ */

  function pairingMatchScore(cigar, pairingText) {
    const p = pairingText.toLowerCase();
    const strength = cigar.strength;
    const wrapper = cigar.wrapper.toLowerCase();
    const flavors = cigar.flavors.map(f => f.toLowerCase());
    const hasPepper = flavors.some(f => f.includes('pepper') || f.includes('spice'));
    const hasChocolate = flavors.some(f => f.includes('chocolate') || f.includes('cocoa') || f.includes('espresso') || f.includes('coffee'));
    const hasCream = flavors.some(f => f.includes('cream') || f.includes('vanilla') || f.includes('honey') || f.includes('caramel'));
    const hasLeather = flavors.some(f => f.includes('leather') || f.includes('earth'));

    let score = 2; // base: "good"

    // Check for strength alignment
    if (p.includes('barrel') || p.includes('cask') || p.includes('barrel proof') || p.includes('islay') || p.includes('peat')) {
      if (strength >= 4) score = 3; // perfect match with full cigars
      else if (strength <= 2) score = 1; // poor match with mild cigars
    }
    if (p.includes('wheated') || p.includes('blended irish') || p.includes('lowland') || p.includes('light')) {
      if (strength <= 3) score = 3; // perfect match with mild-medium
      else if (strength >= 5) score = 1;
    }
    // Peaty/smoky + pepper = perfect
    if ((p.includes('peat') || p.includes('smoke') || p.includes('mezcal')) && (hasPepper || hasLeather)) {
      score = 3;
    }
    // Chocolate + dark spirits = perfect
    if (hasChocolate && (p.includes('bourbon') || p.includes('rum') || p.includes('port') || p.includes('stout') || p.includes('sherry'))) {
      score = 3;
    }
    // Cream + sweet spirits = perfect
    if (hasCream && (p.includes('wheated') || p.includes('irish') || p.includes('reposado') || p.includes('fino') || p.includes('flat white'))) {
      score = 3;
    }
    // Maduro wrapper + dark/rich pairings
    if (wrapper.includes('maduro') || wrapper.includes('broadleaf')) {
      if (p.includes('demerara') || p.includes('tawny') || p.includes('stout') || p.includes('chocolate') || p.includes('espresso')) {
        score = 3;
      }
    }
    // Connecticut + light pairings
    if (wrapper.includes('connecticut') || wrapper.includes('cameroon') || wrapper.includes('shade')) {
      if (p.includes('wheated') || p.includes('lowland') || p.includes('fino') || p.includes('pilsner') || p.includes('flat white')) {
        score = 3;
      }
    }
    // Coffee pairing is always at least good
    if (p.includes('espresso') || p.includes('coffee')) {
      if (hasChocolate || strength >= 3) score = 3;
    }

    const labels = { 3: 'Perfect', 2: 'Good', 1: 'Complementary' };
    const stars = [1, 2, 3].map(i => `<span class="pairing-match-star${i <= score ? '' : ' dim'}">★</span>`).join('');
    return `<span class="pairing-match-score">${stars}<span class="pairing-match-label">${labels[score]}</span></span>`;
  }

  function enrichPairingScores(body, cigar) {
    if (!body) return;
    const entries = body.querySelectorAll('.pairing-entry');
    entries.forEach(entry => {
      const typeEl = entry.querySelector('.pairing-entry-type');
      if (!typeEl) return;
      if (entry.querySelector('.pairing-match-score')) return; // already done
      const score = pairingMatchScore(cigar, typeEl.textContent);
      typeEl.insertAdjacentHTML('beforeend', score);
    });
  }

  /* ══════════════════════════════════════════════════════════════
     J. CELLAR / WISHLIST (localStorage)
  ══════════════════════════════════════════════════════════════ */

  const STORAGE_KEY = 'vp-cellar';
  let cellarIds = [];

  function loadCellar() {
    try {
      cellarIds = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    } catch (e) {
      cellarIds = [];
    }
  }

  function saveCellar() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(cellarIds));
    } catch (e) {}
  }

  function isInCellar(id) {
    return cellarIds.includes(id);
  }

  function toggleCellar(id, e) {
    if (e) e.stopPropagation();
    const idx = cellarIds.indexOf(id);
    if (idx > -1) {
      cellarIds.splice(idx, 1);
    } else {
      cellarIds.push(id);
    }
    saveCellar();
    updateCellarUI(id);
    updateCellarTray();
  }

  function updateCellarUI(id) {
    // Update heart buttons on cards
    document.querySelectorAll('.card-heart-btn').forEach(btn => {
      if (btn.dataset.id === id || !id) {
        const saved = isInCellar(btn.dataset.id);
        btn.classList.toggle('saved', saved);
        const svg = btn.querySelector('svg');
        if (svg) svg.setAttribute('fill', saved ? 'currentColor' : 'none');
      }
    });
  }

  function updateCellarTray() {
    const tray = document.getElementById('cellarTray');
    if (!tray) return;

    if (cellarIds.length === 0) {
      tray.classList.add('hidden');
      return;
    }
    tray.classList.remove('hidden');

    const slots = document.getElementById('cellarSlots');
    const count = document.getElementById('cellarCount');
    if (count) count.textContent = cellarIds.length;

    if (slots) {
      slots.innerHTML = cellarIds.map(id => {
        const c = cigars().find(x => x.id === id);
        return `<div class="cellar-slot">
          <span class="cellar-slot-name">${c ? esc(c.name) : id}</span>
          <span class="cellar-slot-remove" onclick="toggleCellar('${id}', event)">✕</span>
        </div>`;
      }).join('');
    }
  }

  function openCellarView() {
    if (cellarIds.length === 0) return;
    const saved = cellarIds.map(id => cigars().find(c => c.id === id)).filter(Boolean);
    if (!saved.length) return;

    // Switch to library view and filter to saved cigars
    if (typeof state !== 'undefined') {
      state.search = saved.map(c => c.name).join(' ');
      if (typeof render === 'function') render();
      if (typeof $search !== 'undefined' && $search) {
        $search.value = state.search;
        $search.dispatchEvent(new Event('input'));
      }
    }
  }

  function clearCellar() {
    cellarIds = [];
    saveCellar();
    updateCellarUI();
    updateCellarTray();
  }

  // Expose globally
  window.toggleCellar = toggleCellar;
  window.isInCellar = isInCellar;
  window.clearCellar = clearCellar;
  window.openCellarView = openCellarView;
  window.updateCellarUI = updateCellarUI;

  /* ══════════════════════════════════════════════════════════════
     A. CURSOR-FOLLOWING GOLD GLOW
     Updates CSS custom properties on card hover.
  ══════════════════════════════════════════════════════════════ */

  function bindCardGlow() {
    document.addEventListener('mousemove', (e) => {
      const card = e.target.closest('.cigar-card');
      if (!card) return;
      const rect = card.getBoundingClientRect();
      card.style.setProperty('--mx', (e.clientX - rect.left) + 'px');
      card.style.setProperty('--my', (e.clientY - rect.top) + 'px');
    }, { passive: true });
  }

  /* ══════════════════════════════════════════════════════════════
     HOOK
  ══════════════════════════════════════════════════════════════ */

  function wrap() {
    // Wait for VPEnrich to wrap openModal first
    const orig = window.openModal;
    if (typeof orig !== 'function') return;

    window.openModal = function (id) {
      orig(id);
      const cigar = cigars().find(c => c.id === id);
      if (!cigar) return;
      const body = document.getElementById('modalBody');
      if (!body) return;

      // Insert rating breakdown right after the stats row
      const statsRow = body.querySelector('.modal-stats-row');
      if (statsRow) {
        statsRow.insertAdjacentHTML('afterend', buildRatingBreakdown(cigar));
      }

      // Insert DNA diagram after the specs section
      const specs = body.querySelector('.modal-specs');
      if (specs) {
        specs.insertAdjacentHTML('afterend', buildDNADiagram(cigar));
      }

      // Insert tasting notes after the DNA diagram (or after specs if DNA failed)
      const dna = body.querySelector('.cigar-dna');
      const insertAfter = dna ? dna.closest('.modal-section-block') : specs;
      if (insertAfter) {
        insertAfter.insertAdjacentHTML('afterend', buildTastingNotes(cigar));
      }

      // Add pairing match scores
      setTimeout(() => enrichPairingScores(body, cigar), 200);

      // Add heart button to modal
      const header = body.querySelector('.modal-header');
      if (header) {
        const saved = isInCellar(id);
        const heartBtn = document.createElement('button');
        heartBtn.className = 'card-heart-btn' + (saved ? ' saved' : '');
        heartBtn.style.cssText = 'position:absolute;top:24px;right:60px;width:32px;height:32px;opacity:1;background:var(--bg-card);';
        heartBtn.title = saved ? 'Remove from Cellar' : 'Save to Cellar';
        heartBtn.onclick = function (e) {
          e.stopPropagation();
          toggleCellar(id, e);
          const saved = isInCellar(id);
          heartBtn.classList.toggle('saved', saved);
          const svg = heartBtn.querySelector('svg');
          if (svg) svg.setAttribute('fill', saved ? 'currentColor' : 'none');
        };
        heartBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="' + (saved ? 'currentColor' : 'none') + '" stroke="currentColor" stroke-width="2" style="width:14px;height:14px;"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>';
        header.style.position = 'relative';
        header.appendChild(heartBtn);
      }
    };
  }

  // Initialize on load
  document.addEventListener('DOMContentLoaded', () => {
    loadCellar();
    bindCardGlow();
    setTimeout(wrap, 200);
    // Update heart states after every grid render
    if (window.VP && VP.onGridRender) {
      const origRender = VP.onGridRender;
      VP.onGridRender = function (grid) {
        origRender(grid);
        updateCellarUI();
      };
    }
    // Also update after appendPage
    setTimeout(() => updateCellarUI(), 500);
  });

  // Also hook into appendPage to update cellar states
  const origAppendPage = window.appendPage;
  if (typeof origAppendPage === 'function') {
    window.appendPage = function () {
      origAppendPage.apply(this, arguments);
      setTimeout(() => updateCellarUI(), 100);
    };
  }

})();
