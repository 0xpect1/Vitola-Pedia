/* ══════════════════════════════════════════════════════════════════
   VITOLA PEDIA — THE THREE SHELVES
   Three rails under the hero, each telling a different story:

   "Punching Above Its Price" — value picks, sub-$15, rated 90+
   "The Cabinet" — the elite, 96+ rated, price no object
   "Hidden Gems" — 92+ rated but obscure (popularity < 5), the deep cuts

   Each shelf supports:
   - Drag to scroll (mouse)
   - Touch scroll (native)
   - Wheel scroll (horizontal AND vertical both scroll the rail)
   - Arrow buttons (← →) for explicit control
   - "Expand" button to toggle between rail view and full grid view
   - Keyboard left/right arrows when focused
   ══════════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  const cigars = () => (typeof CIGARS !== 'undefined' ? CIGARS : []);

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  /* ── SHELF 1: PUNCHING ABOVE ITS PRICE ── */
  function bestValue(n) {
    return cigars()
      .filter(c => c.price > 0 && c.price <= 15 && c.rating >= 90 && !c.limited)
      .sort((a, b) => b.rating - a.rating || a.price - b.price)
      .slice(0, n);
  }

  /* ── SHELF 2: THE CABINET ── */
  function bestOverall(n) {
    return cigars()
      .filter(c => c.rating >= 96)
      .sort((a, b) => b.rating - a.rating || b.price - b.price)
      .slice(0, n);
  }

  /* ── SHELF 3: HIDDEN GEMS ── */
  function hiddenGems(n) {
    return cigars()
      .filter(c => c.rating >= 92 && c.popularity < 5 && c.price > 0)
      .sort((a, b) => b.rating - a.rating || a.popularity - b.popularity)
      .slice(0, n);
  }

  /* ── CARD TEMPLATE ── */
  function card(c, kind) {
    let badge, tagline;
    if (kind === 'value') {
      badge = `<span class="rail-badge value">${c.rating} pts · $${c.price.toFixed(2)}</span>`;
      tagline = c.price < 5
        ? `Under $5 and rated ${c.rating}.`
        : c.price < 10
        ? `${c.rating} points for under $10.`
        : `${c.rating} points for $${c.price.toFixed(0)}.`;
    } else if (kind === 'best') {
      badge = `<span class="rail-badge best">${c.rating} pts</span>`;
      tagline = c.limited
        ? `Limited edition. ${c.rating} points.`
        : c.price >= 50
        ? `Top shelf. $${c.price.toFixed(0)} a stick.`
        : `${c.rating} points — the elite.`;
    } else if (kind === 'gem') {
      badge = `<span class="rail-badge gem">${c.rating} pts · hidden</span>`;
      tagline = `Rated ${c.rating} but barely known. Popularity ${c.popularity}/10.`;
    } else {
      badge = `<span class="rail-badge">${c.rating} pts</span>`;
      tagline = '';
    }

    return `
      <button class="rail-card" data-id="${esc(c.id)}">
        <span class="rail-img">
          ${c.image
            ? `<img src="${esc(c.image)}" alt="" loading="lazy" onerror="this.style.display='none'">`
            : (typeof VPIcons!=='undefined'?`<span class="rail-noimg">${VPIcons.get('cigar')}</span>`:'<span class="rail-noimg"></span>')}
        </span>
        <span class="rail-body">
          <span class="rail-name">${esc(c.name)}</span>
          <span class="rail-brand">${esc(c.brand)} · ${esc(c.origin)}</span>
          ${badge}
          ${tagline ? `<span class="rail-tagline">${esc(tagline)}</span>` : ''}
        </span>
      </button>`;
  }

  function shelfHTML(title, desc, kind, items) {
    return `
      <div class="shelf" data-shelf="${kind}">
        <div class="shelf-head">
          <div class="shelf-title-row">
            <div>
              <h2>${title}</h2>
              <p>${desc}</p>
            </div>
            <div class="shelf-controls">
              <button class="shelf-arrow shelf-prev" aria-label="Scroll left" tabindex="0">‹</button>
              <button class="shelf-arrow shelf-next" aria-label="Scroll right" tabindex="0">›</button>
              <button class="shelf-expand" aria-label="Expand shelf" tabindex="0">⊞</button>
            </div>
          </div>
        </div>
        <div class="shelf-rail" data-kind="${kind}" tabindex="0">${items.map(c => card(c, kind)).join('')}</div>
      </div>`;
  }

  function render() {
    const host = document.getElementById('shelves');
    if (!host) return;

    const value = bestValue(15);
    const best = bestOverall(15);
    const gems = hiddenGems(15);
    if (!value.length || !best.length) return;

    const cheapest = value.reduce((a, b) => (b.price < a.price ? b : a));
    const dearest = best.reduce((a, b) => (b.price > a.price ? b : a));
    const totalCigars = cigars().length;

    host.innerHTML =
      shelfHTML('Punching Above Its Price',
        `Everything here is under $15 and rated 90 or better. ${esc(cheapest.name)} scores ${cheapest.rating} at $${cheapest.price.toFixed(2)}.`,
        'value', value) +
      shelfHTML('The Cabinet',
        `The highest-rated cigars in the library, price no object — up to $${dearest.price.toFixed(0)} a stick.`,
        'best', best) +
      shelfHTML('Hidden Gems',
        `Rated 92+ but barely known — the deep cuts from ${totalCigars.toLocaleString()} cigars that most people will never find on their own.`,
        'gem', gems) +
      `<p class="shelf-note">
        All three shelves are drawn from the same ${totalCigars.toLocaleString()} cigars and scored the same way.
        Spending more buys you rarity and refinement; it does not buy you a better evening.
      </p>`;

    // Card clicks
    host.querySelectorAll('.rail-card').forEach(b =>
      b.addEventListener('click', () => openModal(b.dataset.id)));

    // Wire up each shelf
    host.querySelectorAll('.shelf').forEach(shelf => {
      const rail = shelf.querySelector('.shelf-rail');
      const prevBtn = shelf.querySelector('.shelf-prev');
      const nextBtn = shelf.querySelector('.shelf-next');
      const expandBtn = shelf.querySelector('.shelf-expand');

      makeDraggable(rail);
      makeArrowScroll(rail, prevBtn, nextBtn);
      makeExpandable(shelf, rail, expandBtn);
      makeKeyboard(rail);
    });
  }

  /* ── ARROW BUTTON SCROLL ──
     Click ‹ or › to scroll by one card-width. */
  function makeArrowScroll(rail, prevBtn, nextBtn) {
    const scrollAmount = () => {
      const card = rail.querySelector('.rail-card');
      return card ? card.offsetWidth + 10 : 186; // gap is 10px
    };

    if (prevBtn) prevBtn.addEventListener('click', () => {
      rail.scrollBy({ left: -scrollAmount() * 2, behavior: 'smooth' });
    });
    if (nextBtn) nextBtn.addEventListener('click', () => {
      rail.scrollBy({ left: scrollAmount() * 2, behavior: 'smooth' });
    });
  }

  /* ── EXPAND / COLLAPSE ──
     Toggle between horizontal rail (compact) and grid (all cards visible). */
  function makeExpandable(shelf, rail, expandBtn) {
    if (!expandBtn) return;
    expandBtn.addEventListener('click', () => {
      shelf.classList.toggle('shelf-expanded');
      const expanded = shelf.classList.contains('shelf-expanded');
      expandBtn.textContent = expanded ? '⊟' : '⊞';
      expandBtn.setAttribute('aria-label', expanded ? 'Collapse shelf' : 'Expand shelf');
      // When collapsing, reset scroll to start
      if (!expanded) rail.scrollTo({ left: 0, behavior: 'smooth' });
    });
  }

  /* ── KEYBOARD SUPPORT ──
     Left/Right arrows scroll the rail when it has focus. */
  function makeKeyboard(rail) {
    rail.addEventListener('keydown', e => {
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        rail.scrollBy({ left: -186 * 2, behavior: 'smooth' });
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        rail.scrollBy({ left: 186 * 2, behavior: 'smooth' });
      }
    });
  }

  /* ── DRAG TO SCROLL + WHEEL + EDGE FADES ── */
  function makeDraggable(rail) {
    let down = false, startX = 0, startScroll = 0, moved = 0;

    const fades = () => {
      // Skip fades when expanded (grid view doesn't need them)
      const shelf = rail.closest('.shelf');
      if (shelf && shelf.classList.contains('shelf-expanded')) return;

      const max = rail.scrollWidth - rail.clientWidth;
      rail.classList.toggle('at-start', rail.scrollLeft <= 2);
      rail.classList.toggle('at-end', rail.scrollLeft >= max - 2);
      rail.classList.toggle('no-scroll', max <= 2);
    };

    rail.addEventListener('pointerdown', e => {
      if (e.pointerType === 'touch') return;
      // Don't drag in expanded mode
      const shelf = rail.closest('.shelf');
      if (shelf && shelf.classList.contains('shelf-expanded')) return;
      down = true; moved = 0;
      startX = e.clientX;
      startScroll = rail.scrollLeft;
      rail.classList.add('dragging');
    });

    rail.addEventListener('pointermove', e => {
      if (!down) return;
      const dx = e.clientX - startX;
      moved = Math.max(moved, Math.abs(dx));
      if (moved > 3) {
        if (!rail.hasPointerCapture(e.pointerId)) rail.setPointerCapture(e.pointerId);
        rail.scrollLeft = startScroll - dx;
      }
    });

    const end = e => {
      if (!down) return;
      down = false;
      rail.classList.remove('dragging');
      if (rail.hasPointerCapture && e.pointerId != null &&
          rail.hasPointerCapture(e.pointerId)) rail.releasePointerCapture(e.pointerId);
      if (moved > 3) {
        const swallow = ev => { ev.stopPropagation(); ev.preventDefault(); };
        rail.addEventListener('click', swallow, { capture: true, once: true });
        setTimeout(() => rail.removeEventListener('click', swallow, true), 0);
      }
    };
    rail.addEventListener('pointerup', end);
    rail.addEventListener('pointercancel', end);
    rail.addEventListener('pointerleave', end);

    /* Wheel: BOTH horizontal and vertical wheel events scroll the rail.
       This lets trackpad users scroll naturally in any direction, and
       mouse-wheel users scroll the rail without hunting for the exact
       horizontal axis. */
    rail.addEventListener('wheel', e => {
      const shelf = rail.closest('.shelf');
      if (shelf && shelf.classList.contains('shelf-expanded')) return; // let page scroll in grid mode

      // If it's a horizontal trackpad swipe, always handle it
      // If it's a vertical wheel, also scroll horizontally (convert Y to X)
      if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
        e.preventDefault();
        rail.scrollLeft += e.deltaX;
      } else if (Math.abs(e.deltaY) > 0) {
        // Vertical wheel → horizontal scroll
        e.preventDefault();
        rail.scrollLeft += e.deltaY;
      }
    }, { passive: false });

    rail.addEventListener('scroll', fades, { passive: true });
    window.addEventListener('resize', fades);
    fades();
  }

  document.addEventListener('DOMContentLoaded', () => setTimeout(render, 50));
  window.VPShelves = { render, bestValue, bestOverall, hiddenGems };
})();
