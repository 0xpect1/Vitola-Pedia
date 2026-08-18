/* ══════════════════════════════════════════════════════════════════
   VITOLA PEDIA — THE TWO SHELVES
   Two rails, presented as equals, sitting directly under the hero.

   "The Cabinet" is what money buys. "Punching Above Its Price" is what
   knowledge buys — the cigars whose rating has no business being that
   high for what they cost.

   They share a row on purpose. A cigar encyclopedia that only celebrates
   the $50 stick is a catalogue for people who already have everything;
   the room is better when the man with the Dupont and the man with the
   Bic are arguing about the same $8 Nicaraguan.
   ══════════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  const cigars = () => (typeof CIGARS !== 'undefined' ? CIGARS : []);

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  const VALUE_CEILING = 10;   // what "affordable" means here, in dollars

  /* Rating alone would just re-list the expensive ones, and rating ÷ price
     over-rewards the very cheapest. Rank the sub-$10 shelf by rating, then
     let price break ties — the best cigar you can buy for a tenner. */
  function bestValue(n) {
    return cigars()
      .filter(c => c.price <= VALUE_CEILING && c.rating >= 90 && !c.limited)
      .sort((a, b) => b.rating - a.rating || a.price - b.price)
      .slice(0, n);
  }

  function bestOverall(n) {
    return cigars()
      .filter(c => c.rating >= 96)
      .sort((a, b) => b.rating - a.rating || b.price - a.price)
      .slice(0, n);
  }

  function card(c, kind) {
    const badge = kind === 'value'
      ? `<span class="rail-badge value">${c.rating} pts · $${c.price.toFixed(2)}</span>`
      : `<span class="rail-badge best">${c.rating} pts</span>`;
    return `
      <button class="rail-card" data-id="${esc(c.id)}">
        <span class="rail-img">
          ${c.image
            ? `<img src="${esc(c.image)}" alt="" loading="lazy" onerror="this.style.display='none'">`
            : '<span class="rail-noimg">🚬</span>'}
        </span>
        <span class="rail-body">
          <span class="rail-name">${esc(c.name)}</span>
          <span class="rail-brand">${esc(c.brand)} · ${esc(c.origin)}</span>
          ${badge}
        </span>
      </button>`;
  }

  function render() {
    const host = document.getElementById('shelves');
    if (!host) return;

    const value = bestValue(8);
    const best = bestOverall(8);
    if (!value.length || !best.length) return;

    const cheapest = value.reduce((a, b) => (b.price < a.price ? b : a));
    const dearest = best.reduce((a, b) => (b.price > a.price ? b : a));

    host.innerHTML = `
      <div class="shelf">
        <div class="shelf-head">
          <h2>Punching Above Its Price</h2>
          <p>Everything here is ${VALUE_CEILING > 0 ? `under $${VALUE_CEILING}` : 'affordable'} and rated 90 or better.
             ${esc(cheapest.name)} scores ${cheapest.rating} at $${cheapest.price.toFixed(2)}.</p>
        </div>
        <div class="shelf-rail" data-kind="value">${value.map(c => card(c, 'value')).join('')}</div>
      </div>

      <div class="shelf">
        <div class="shelf-head">
          <h2>The Cabinet</h2>
          <p>The highest-rated cigars in the library, price no object —
             up to $${dearest.price.toFixed(0)} a stick.</p>
        </div>
        <div class="shelf-rail" data-kind="best">${best.map(c => card(c, 'best')).join('')}</div>
      </div>

      <p class="shelf-note">
        Both shelves are drawn from the same 1,458 cigars and scored the same way.
        Spending more buys you rarity and refinement; it does not buy you a better evening.
      </p>`;

    host.querySelectorAll('.rail-card').forEach(b =>
      b.addEventListener('click', () => openModal(b.dataset.id)));
  }

  document.addEventListener('DOMContentLoaded', () => setTimeout(render, 260));
  window.VPShelves = { render, bestValue, bestOverall };
})();
