/* ══════════════════════════════════════════════════════════════════
   VITOLA PEDIA — GUIDED PICKER
   "What should I smoke?" — the question the whole site exists to answer.

   The old quiz asked a beginner "what body and strength do you prefer?".
   Someone who has never smoked a cigar cannot answer that; it assumes the
   knowledge it's supposed to supply. This asks only about things people
   already know — how long they have, what they drink, which flavours they
   like in food — and does the translation itself.

   Three tracks:
     first  — never smoked. Hard guardrails, and it says why.
     some   — a few under the belt. Wider, still guided.
     pro    — knows the vocabulary. Asks in cigar terms, no hand-holding.

   Every recommendation carries the reasons it was chosen, built from the
   actual record rather than generic copy.
   ══════════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  const cigars = () => (typeof CIGARS !== 'undefined' ? CIGARS : []);

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  const ic = n => (typeof VPIcons !== 'undefined' ? VPIcons.get(n) : '');
  const bodyIcon = n => (typeof VPIcons !== 'undefined' ? VPIcons.body(n) : '');

  const STRENGTH_LABEL = ['Mild', 'Mild–Medium', 'Medium', 'Medium–Full', 'Full'];
  // Short forms for the stat row, where a wrapped label unbalances the grid.
  const STRENGTH_SHORT = ['Mild', 'Mild–Med', 'Medium', 'Med–Full', 'Full'];

  /* ── VOCABULARY BRIDGES ─────────────────────────────────────────
     Left side is how people describe taste. Right side is the tags
     actually used in the library. This mapping is the whole trick.
  ─────────────────────────────────────────────────────────────── */
  const TASTES = [
    { id: 'coffee', icon: ic('coffee'), label: 'Coffee & dark chocolate',
      hint: 'Espresso, cocoa, roasted, bittersweet',
      tags: ['Coffee','Dark Chocolate','Espresso','Cocoa','Chocolate','Dark Coffee','Mocha','Mild Coffee'] },
    { id: 'cream', icon: ic('cream'), label: 'Cream & vanilla',
      hint: 'Smooth, sweet, buttery',
      tags: ['Cream','Vanilla','Honey','Caramel','Butter','Sweet','Milk Chocolate'] },
    { id: 'nuts', icon: ic('nuts'), label: 'Nuts & toast',
      hint: 'Almond, cashew, warm bread',
      tags: ['Nuts','Almond','Almonds','Toasted Nuts','Toast','Mild Nuts','Hazelnut','Bread','Walnut'] },
    { id: 'pepper', icon: ic('pepper'), label: 'Pepper & spice',
      hint: 'Black pepper, cinnamon, a bite',
      tags: ['Pepper','Black Pepper','Red Pepper','White Pepper','Spice','Sweet Spice','Cinnamon','Mild Pepper','Light Pepper','Mild Spice','Light Spice'] },
    { id: 'wood', icon: ic('wood'), label: 'Wood & earth',
      hint: 'Cedar, leather, forest floor',
      tags: ['Cedar','Earth','Leather','Oak','Wood','Hay','Dark Earth','Mild Earth','Tobacco','Grass'] },
    { id: 'fruit', icon: ic('fruit'), label: 'Fruit & sweetness',
      hint: 'Raisin, cherry, molasses, floral',
      tags: ['Dark Fruit','Dried Fruit','Molasses','Dark Cherry','Raisin','Citrus','Floral','Fruit'] },
  ];

  const DRINKS = [
    { id: 'coffee',  icon: ic('coffee'), label: 'Coffee',            tags: ['Espresso','Coffee','Black Coffee','Café au Lait','Dark Coffee','Light Coffee','Cappuccino'] },
    { id: 'whiskey', icon: ic('whiskey'), label: 'Whiskey or bourbon', tags: ['Bourbon','Single Malt Scotch','Rye Whiskey','Peated Scotch','Whiskey','Scotch'] },
    { id: 'rum',     icon: ic('rum'), label: 'Rum',               tags: ['Dark Rum','Aged Rum','Light Rum','Rum'] },
    { id: 'beer',    icon: ic('beer'), label: 'Beer',              tags: ['Dark Beer','Light Beer','Amber Ale','Lager','Craft Beer','Stout','Porter'] },
    { id: 'wine',    icon: ic('wine'), label: 'Wine or champagne',  tags: ['Champagne','White Wine','Chardonnay','Red Wine','Port','Cabernet'] },
    { id: 'none',    icon: ic('water'), label: 'Just water or tea',  tags: ['Earl Grey Tea','Tea','Water','Green Tea'] },
  ];

  const TIMES = [
    { id: 'short',  icon: ic('clockShort'), label: 'About half an hour', hint: 'A quick one', max: 40 },
    { id: 'hour',   icon: ic('clockHour'), label: 'An hour or so',      hint: 'The usual sit',  max: 70 },
    { id: 'long',   icon: ic('moon'), label: 'A whole evening',     hint: 'No rush at all', max: 999 },
  ];

  const BUDGETS = [
    { id: 'low',  icon: ic('coin'), label: 'Under $10',  hint: 'Everyday smoking',  max: 10 },
    { id: 'mid',  icon: ic('card'), label: '$10 – $20',  hint: 'A proper treat',    max: 20 },
    { id: 'high', icon: ic('crown'), label: 'Whatever it takes', hint: 'Show me the best', max: 999 },
  ];

  const EXPERIENCE = [
    { id: 'first', icon: ic('seedling'), label: "This is my first cigar",
      hint: "I'll keep you away from anything that would put you off" },
    { id: 'some',  icon: ic('flame'), label: "I've smoked a few",
      hint: 'Ready for more body and more going on' },
    { id: 'pro',   icon: ic('trophy'), label: 'I know what I like',
      hint: "Ask me in cigar terms and skip the guardrails" },
  ];

  const BODIES = [
    { id: 1, icon: bodyIcon(1), label: 'Mild',        hint: 'Cream and cedar, nothing pushy' },
    { id: 2, icon: bodyIcon(2), label: 'Mild–Medium', hint: 'Approachable, more to chew on' },
    { id: 3, icon: bodyIcon(3), label: 'Medium',      hint: 'The broad middle' },
    { id: 4, icon: bodyIcon(4), label: 'Medium–Full', hint: 'Rich, after a meal' },
    { id: 5, icon: bodyIcon(5), label: 'Full',        hint: 'All the nicotine and pepper' },
  ];

  /* ── FLOW ───────────────────────────────────────────────────── */
  let answers = {};
  let stepIdx = 0;

  function steps() {
    const exp = answers.experience;
    const base = [{
      id: 'experience', kind: 'one',
      q: 'Have you smoked a cigar before?',
      sub: 'This changes everything that follows, so it comes first.',
      options: EXPERIENCE.map(e => ({ value: e.id, icon: e.icon, title: e.label, desc: e.hint })),
    }];

    if (!exp) return base;

    if (exp === 'pro') {
      return base.concat([
        { id: 'body', kind: 'one', q: 'What body are you after?',
          options: BODIES.map(b => ({ value: b.id, icon: b.icon, title: b.label, desc: b.hint })) },
        { id: 'tastes', kind: 'many', q: 'Which notes are you chasing?',
          sub: 'Pick as many as you like.',
          options: TASTES.map(t => ({ value: t.id, icon: t.icon, title: t.label, desc: t.hint })) },
        { id: 'time', kind: 'one', q: 'How long have you got?',
          options: TIMES.map(t => ({ value: t.id, icon: t.icon, title: t.label, desc: t.hint })) },
        { id: 'budget', kind: 'one', q: 'Budget per stick?',
          options: BUDGETS.map(b => ({ value: b.id, icon: b.icon, title: b.label, desc: b.hint })) },
      ]);
    }

    // Beginner and intermediate get asked only what they can actually answer.
    return base.concat([
      { id: 'time', kind: 'one', q: 'How much time have you got?',
        sub: exp === 'first'
          ? "A cigar isn't a cigarette — you can't rush one. Better to pick something that fits the time you actually have."
          : 'Pick something that fits the sitting.',
        options: TIMES.map(t => ({ value: t.id, icon: t.icon, title: t.label, desc: t.hint })) },
      { id: 'drink', kind: 'one', q: "What are you most likely to be drinking?",
        sub: 'Cigars and drinks lift each other. This narrows things a lot.',
        options: DRINKS.map(d => ({ value: d.id, icon: d.icon, title: d.label, desc: '' })) },
      { id: 'tastes', kind: 'many', q: 'Which of these do you actually enjoy?',
        sub: 'Think coffee, chocolate, food — not cigars. Pick as many as you like.',
        options: TASTES.map(t => ({ value: t.id, icon: t.icon, title: t.label, desc: t.hint })) },
      { id: 'budget', kind: 'one', q: "What are you happy to spend?",
        sub: exp === 'first'
          ? "Don't overspend on your first. An expensive cigar is wasted on a palate that hasn't learned what to look for yet."
          : '',
        options: BUDGETS.map(b => ({ value: b.id, icon: b.icon, title: b.label, desc: b.hint })) },
    ]);
  }

  /* ── SCORING ────────────────────────────────────────────────── */
  function tasteTags(ids) {
    const set = new Set();
    (ids || []).forEach(id => {
      const t = TASTES.find(x => x.id === id);
      if (t) t.tags.forEach(tag => set.add(tag.toLowerCase()));
    });
    return set;
  }

  function recommend() {
    const exp = answers.experience;
    const time = TIMES.find(t => t.id === answers.time) || TIMES[2];
    const budget = BUDGETS.find(b => b.id === answers.budget) || BUDGETS[2];
    const drink = DRINKS.find(d => d.id === answers.drink);
    const wanted = tasteTags(answers.tastes);
    const drinkTags = new Set((drink ? drink.tags : []).map(s => s.toLowerCase()));

    /* Guardrails. For a first cigar these are hard filters, not
       preferences — the aim is that nobody's first experience is a
       nicotine headache from a full-bodied 60-ring monster. */
    const guard = exp === 'first'
      ? { maxStrength: 2, maxRing: 54, minRating: 88 }
      : exp === 'some'
        ? { maxStrength: 4, maxRing: 60, minRating: 86 }
        : { maxStrength: 5, maxRing: 99, minRating: 0 };

    const results = [];
    for (const c of cigars()) {
      if (c.price > budget.max) continue;
      if (c.smokingTime > time.max) continue;
      if (c.strength > guard.maxStrength) continue;
      if (c.ringGauge > guard.maxRing) continue;
      if (c.rating < guard.minRating) continue;

      // Pros asked for a specific body; hold them to it.
      if (exp === 'pro' && answers.body && Math.abs(c.strength - answers.body) > 1) continue;

      const why = [];
      let score = 0;

      const hits = (c.flavors || []).filter(f => wanted.has(f.toLowerCase()));
      if (wanted.size) {
        if (!hits.length) continue;               // must share at least one note
        score += Math.min(hits.length, 4) * 14;
        why.push({ k: 'taste', t: `Tastes of ${hits.slice(0, 3).join(', ').toLowerCase()}` });
      }

      if (drink) {
        const pm = (c.pairings || []).filter(p => drinkTags.has(p.toLowerCase()));
        if (pm.length) {
          score += 18;
          why.push({ k: 'drink', t: `Pairs with ${pm[0].toLowerCase()}` });
        }
      }

      // Fit the sitting rather than merely staying under the ceiling.
      const ideal = time.max === 999 ? 90 : time.max - 10;
      const timeGap = Math.abs(c.smokingTime - ideal);
      score += Math.max(0, 14 - timeGap / 4);
      if (timeGap <= 12) why.push({ k: 'time', t: `${c.smokingTime} minutes — fits the time you have` });

      score += (c.rating - 86) * 1.6;
      score += (c.popularity || 5) * (exp === 'first' ? 1.8 : 0.5);  // findable in a shop
      score -= (c.price / budget.max) * 6;                           // value within the budget

      if (exp === 'first') {
        if (c.strength === 1) { score += 10; }
        if (c.ringGauge <= 50) { score += 6; }
        if (c.limited) score -= 25;                                  // can't buy it anyway
      }

      results.push({ c, score, why, hits });
    }

    results.sort((a, b) => b.score - a.score);

    // Don't hand back five cigars from one brand.
    const picked = [];
    const seen = {};
    for (const r of results) {
      const n = seen[r.c.brand] || 0;
      if (n >= (picked.length < 3 ? 1 : 2)) continue;
      seen[r.c.brand] = n + 1;
      picked.push(r);
      if (picked.length === 5) break;
    }
    return picked;
  }

  /* ── RENDER ─────────────────────────────────────────────────── */
  function render() {
    const all = steps();
    const step = all[stepIdx];
    const body = document.getElementById('pickerBody');
    if (!body) return;

    if (!step) return renderResults();

    const chosen = answers[step.id];
    const isMany = step.kind === 'many';

    body.innerHTML = `
      <div class="pk-progress">
        ${all.map((_, i) => `<span class="pk-dot${i < stepIdx ? ' done' : i === stepIdx ? ' active' : ''}"></span>`).join('')}
        <span class="pk-step-label">Step ${stepIdx + 1} of ${all.length}</span>
      </div>
      <h3 class="pk-q">${esc(step.q)}</h3>
      ${step.sub ? `<p class="pk-sub">${step.sub}</p>` : ''}
      <div class="pk-options${isMany ? ' many' : ''}">
        ${step.options.map(o => {
          const on = isMany ? (chosen || []).includes(o.value) : chosen === o.value;
          return `<button class="pk-opt${on ? ' on' : ''}" data-v="${esc(String(o.value))}">
            <span class="pk-opt-icon">${o.icon}</span>
            <span class="pk-opt-text">
              <span class="pk-opt-title">${esc(o.title)}</span>
              ${o.desc ? `<span class="pk-opt-desc">${esc(o.desc)}</span>` : ''}
            </span>
            ${isMany ? '<span class="pk-check">✓</span>' : ''}
          </button>`;
        }).join('')}
      </div>
      <div class="pk-nav">
        ${stepIdx > 0 ? '<button class="pk-back" id="pkBack">← Back</button>' : '<span></span>'}
        <button class="pk-next" id="pkNext" ${isMany && !(chosen || []).length ? 'disabled' : ''}>
          ${stepIdx === all.length - 1 ? 'Show me' : 'Next'}
        </button>
      </div>`;

    body.querySelectorAll('.pk-opt').forEach(btn => {
      btn.addEventListener('click', () => {
        const raw = btn.dataset.v;
        const val = /^\d+$/.test(raw) ? Number(raw) : raw;
        if (isMany) {
          const cur = answers[step.id] || [];
          answers[step.id] = cur.includes(val) ? cur.filter(v => v !== val) : cur.concat(val);
          render();
        } else {
          // Changing your mind about experience invalidates the rest.
          if (step.id === 'experience' && answers.experience !== val) {
            answers = { experience: val };
          } else {
            answers[step.id] = val;
          }
          stepIdx++;
          render();
        }
      });
    });

    const next = document.getElementById('pkNext');
    if (next) next.addEventListener('click', () => {
      if (isMany && !(answers[step.id] || []).length) return;
      stepIdx++;
      render();
    });
    const back = document.getElementById('pkBack');
    if (back) back.addEventListener('click', () => { stepIdx = Math.max(0, stepIdx - 1); render(); });
  }

  function renderResults() {
    const picks = recommend();
    const exp = answers.experience;
    const body = document.getElementById('pickerBody');

    if (!picks.length) {
      body.innerHTML = `
        <div class="pk-none">
          <div class="pk-none-icon">${ic('search')}</div>
          <h3>Nothing clears the bar</h3>
          <p>That combination is too narrow — most often it's a short time
             window plus a tight budget. Loosen one and there'll be plenty.</p>
          <button class="pk-restart" id="pkRestart">Start over</button>
        </div>`;
      document.getElementById('pkRestart').addEventListener('click', restart);
      return;
    }

    const [top, ...rest] = picks;

    body.innerHTML = `
      <div class="pk-results-head">
        <span class="pk-kicker">${exp === 'first' ? 'Start here' : 'Your match'}</span>
        <h3>${esc(top.c.name)}</h3>
        <p class="pk-top-brand">${esc(top.c.brand)} · ${esc(top.c.origin)}</p>
      </div>

      <button class="pk-hero" data-open="${esc(top.c.id)}">
        ${top.c.image
          ? `<img src="${esc(top.c.image)}" alt="" onerror="this.style.display='none'">`
          : `<span class="pk-hero-noimg">${ic('cigar')}</span>`}
        <span class="pk-hero-stats">
          <span><b>${top.c.rating}</b><i>rating</i></span>
          <span><b>$${top.c.price.toFixed(2)}</b><i>per stick</i></span>
          <span><b>${STRENGTH_SHORT[top.c.strength - 1]}</b><i>body</i></span>
          <span><b>${top.c.smokingTime}m</b><i>smoke time</i></span>
        </span>
      </button>

      <div class="pk-why">
        <span class="pk-why-label">Why this one</span>
        <ul>
          ${top.why.map(w => `<li>${esc(w.t)}</li>`).join('')}
          <li>${esc(STRENGTH_LABEL[top.c.strength - 1])} body${exp === 'first'
            ? " — gentle enough that you'll enjoy it rather than endure it" : ''}</li>
          <li>${top.c.length}&Prime; × ${top.c.ringGauge} ring — ${top.c.ringGauge <= 46
            ? 'a slim, easy-drawing size' : top.c.ringGauge <= 54
            ? 'the everyday size most cigars come in' : 'a thick ring, cooler and slower'}</li>
        </ul>
      </div>

      ${exp === 'first' ? `
        <div class="pk-firsttimer">
          <span class="pk-why-label">Before you light it</span>
          <ul>
            <li><strong>Don't inhale.</strong> Draw the smoke into your mouth, taste it, let it go. Inhaling is what makes people ill.</li>
            <li><strong>Puff slowly</strong> — roughly once a minute. Rushing makes it burn hot and turn bitter.</li>
            <li><strong>Eat first.</strong> Smoking on an empty stomach is the other thing that makes people ill.</li>
            <li><strong>Buy two, not a box.</strong> You don't know yet what you like, and that's fine.</li>
            <li><strong>Stop when you want to.</strong> Nobody has to smoke to the band.</li>
          </ul>
        </div>` : ''}

      ${rest.length ? `
        <div class="pk-alts">
          <span class="pk-why-label">Also worth your time</span>
          ${rest.map(r => `
            <button class="pk-alt" data-open="${esc(r.c.id)}">
              ${r.c.image ? `<img src="${esc(r.c.image)}" alt="" loading="lazy" onerror="this.style.display='none'">`
                          : `<span class="pk-alt-noimg">${ic('cigar')}</span>`}
              <span class="pk-alt-body">
                <span class="pk-alt-name">${esc(r.c.name)}</span>
                <span class="pk-alt-meta">${esc(r.c.brand)} · ${STRENGTH_LABEL[r.c.strength - 1]} · ${r.c.smokingTime}m · $${r.c.price.toFixed(2)}</span>
                ${r.why[0] ? `<span class="pk-alt-why">${esc(r.why[0].t)}</span>` : ''}
              </span>
              <span class="pk-alt-rating">${r.c.rating}</span>
            </button>`).join('')}
        </div>` : ''}

      <div class="pk-actions">
        <button class="pk-restart" id="pkRestart">Start over</button>
        <button class="pk-browse" id="pkBrowse">Browse everything that fits</button>
      </div>`;

    body.querySelectorAll('[data-open]').forEach(b => b.addEventListener('click', () => {
      close();
      setTimeout(() => openModal(b.dataset.open), 60);
    }));
    document.getElementById('pkRestart').addEventListener('click', restart);
    document.getElementById('pkBrowse').addEventListener('click', () => applyAsFilters(picks));
  }

  /* Hand the answers to the main library filters, so the guided path and
     the manual one end up in the same place. */
  function applyAsFilters(picks) {
    const time = TIMES.find(t => t.id === answers.time) || TIMES[2];
    const budget = BUDGETS.find(b => b.id === answers.budget) || BUDGETS[2];
    const exp = answers.experience;

    close();
    if (typeof switchView === 'function') switchView('library');
    if (typeof state === 'undefined' || typeof render !== 'function') return;

    state.search = '';
    const box = document.getElementById('searchInput');
    if (box) box.value = '';

    state.maxPrice = Math.min(65, budget.max === 999 ? 65 : budget.max);
    const slider = document.getElementById('priceRange');
    if (slider) { slider.value = state.maxPrice; if (typeof updatePriceRangeStyle === 'function') updatePriceRangeStyle(); }

    state.strength = exp === 'first' ? '1' : exp === 'some' ? 'all' : String(answers.body || 'all');
    document.querySelectorAll('#strengthFilter .pill').forEach(p =>
      p.classList.toggle('active', p.dataset.value === state.strength));

    state.time = time.max <= 40 ? 'short' : time.max <= 70 ? 'medium' : 'all';
    document.querySelectorAll('#timeFilter .pill').forEach(p =>
      p.classList.toggle('active', p.dataset.value === state.time));

    window.render();
    const main = document.querySelector('.main-content');
    if (main) window.scrollTo({ top: main.offsetTop - 80, behavior: 'smooth' });
  }

  function restart() { answers = {}; stepIdx = 0; render(); }

  /* ── MODAL ──────────────────────────────────────────────────── */
  function open() {
    restart();
    document.getElementById('pickerOverlay').classList.remove('hidden');
    document.body.style.overflow = 'hidden';
  }
  function close() {
    document.getElementById('pickerOverlay').classList.add('hidden');
    const other = [...document.querySelectorAll('.modal-overlay')]
      .some(o => o.id !== 'pickerOverlay' && !o.classList.contains('hidden'));
    if (!other) document.body.style.overflow = '';
  }

  function init() {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay hidden';
    overlay.id = 'pickerOverlay';
    overlay.innerHTML = `
      <div class="modal pk-modal" role="dialog" aria-modal="true" aria-label="Find your cigar">
        <button class="modal-close" id="pickerClose" aria-label="Close">
          <svg viewBox="0 0 24 24" fill="none"><path d="M18 6L6 18M6 6l12 12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
        </button>
        <div class="modal-body"><div id="pickerBody"></div></div>
      </div>`;
    document.body.appendChild(overlay);

    document.getElementById('pickerClose').addEventListener('click', close);
    overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && !overlay.classList.contains('hidden')) close();
    });

    // Take over the existing entry point, including the palette action
    // that clicks it.
    const btn = document.getElementById('quizTriggerBtn');
    if (btn) {
      const fresh = btn.cloneNode(true);
      btn.parentNode.replaceChild(fresh, btn);
      fresh.addEventListener('click', open);
    }
  }

  document.addEventListener('DOMContentLoaded', () => setTimeout(init, 200));
  window.VPPicker = { open, close, recommend: () => recommend(), answers: () => answers };
})();
