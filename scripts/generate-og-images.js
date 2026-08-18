#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════
   VITOLA PEDIA — Per-Cigar Open Graph Share Cards
   ───────────────────────────────────────────────────────────────────
   Generates a unique 1200×630 SVG preview image for every cigar and
   every brand "house" in the encyclopedia.  No external npm deps —
   pure Node fs + string templating.

   Output:
     og/cigar-<id>.svg   — 1 per cigar  (1,458 files)
     og/house-<slug>.svg  — 1 per brand  (134 files)

   SVG → PNG conversion is handled by scripts/og-svg-to-png.js (Puppeteer).
   ═══════════════════════════════════════════════════════════════════ */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT      = resolve(__dirname, '..');
const DATA      = resolve(ROOT, 'data/cigars.json');
const OUT_DIR   = resolve(ROOT, 'og');

/* ── palette ─────────────────────────────────────────────────────── */
const BG       = '#1a1209';   // dark tobacco brown
const BG2       = '#241a0e';   // slightly lighter for gradient
const GOLD     = '#c9943a';   // gold accent
const EMBER    = '#ff6b35';   // ember orange
const CREAM    = '#f5ecd6';   // warm white text
const MUTED    = '#a89270';   // muted brown-grey
const PILL_BG  = 'rgba(201,148,58,0.14)';
const PILL_BD  = 'rgba(201,148,58,0.35)';
const LINE     = 'rgba(201,148,58,0.30)';

/* ── helpers ─────────────────────────────────────────────────────── */
const esc = s => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

const slug = s => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

const STRENGTH_LABEL = ['Mild', 'Mild–Med', 'Medium', 'Med–Full', 'Full'];

/** Fit a name into a max width by shrinking the font size in steps. */
function fitNameFont(name) {
  const len = name.length;
  if (len <= 22) return 60;
  if (len <= 30) return 50;
  if (len <= 42) return 42;
  if (len <= 56) return 34;
  if (len <= 72) return 28;
  return 24;
}

/** Truncate a string to n chars with ellipsis. */
const trunc = (s, n) => s.length > n ? s.slice(0, n - 1) + '…' : s;

/** Wrap a long title into up to 2 lines for the big name area. */
function wrapName(name, maxCharsPerLine) {
  const words = name.split(' ');
  const lines = [];
  let cur = '';
  for (const w of words) {
    if ((cur + ' ' + w).trim().length > maxCharsPerLine && cur) {
      lines.push(cur.trim());
      cur = w;
    } else {
      cur = (cur + ' ' + w).trim();
    }
  }
  if (cur) lines.push(cur.trim());
  return lines.slice(0, 2);
}

/** Strength meter as 5 dots, filled = strength level. */
function strengthDots(strength, x, y) {
  let s = '';
  for (let i = 0; i < 5; i++) {
    const filled = i < strength;
    const cx = x + i * 22;
    s += `<circle cx="${cx}" cy="${y}" r="7" fill="${filled ? EMBER : 'none'}" stroke="${filled ? EMBER : MUTED}" stroke-width="1.5" opacity="${filled ? 1 : 0.45}"/>`;
  }
  return s;
}

/** Rating as a row of 5 stars (rating / 20 each) + numeric. */
function ratingStars(rating, x, y) {
  const filled = Math.round(rating / 20);   // 0..5
  let s = '';
  for (let i = 0; i < 5; i++) {
    const on = i < filled;
    const cx = x + i * 20;
    s += `<path d="M${cx} ${y-7}l4.4 9 9.8 1.4-7.1 6.9 1.7 9.8-8.8-4.6-8.8 4.6 1.7-9.8-7.1-6.9 9.8-1.4z" fill="${on ? GOLD : 'none'}" stroke="${on ? GOLD : MUTED}" stroke-width="1.2" opacity="${on ? 1 : 0.35}"/>`;
  }
  return s;
}

/** Flavor pills, wrapping into rows of up to `perRow`. */
function flavorPills(flavors, x, y, perRow = 4) {
  const list = (flavors || []).slice(0, perRow);
  let s = '';
  let cx = x;
  let cy = y;
  const pillH = 30;
  const gap = 10;
  list.forEach((f, i) => {
    const text = trunc(f, 16);
    const w = text.length * 8.5 + 24;
    s += `<rect x="${cx}" y="${cy}" width="${w}" height="${pillH}" rx="15" fill="${PILL_BG}" stroke="${PILL_BD}" stroke-width="1"/>`;
    s += `<text x="${cx + w / 2}" y="${cy + pillH / 2 + 5}" font-family="Inter,Helvetica,Arial,sans-serif" font-size="14" fill="${GOLD}" text-anchor="middle">${esc(text)}</text>`;
    cx += w + gap;
  });
  return s;
}

/** Decorative smoke wisps + ember glow in the background. */
function decor() {
  return `
    <defs>
      <radialGradient id="ember" cx="85%" cy="15%" r="55%">
        <stop offset="0%" stop-color="${EMBER}" stop-opacity="0.18"/>
        <stop offset="40%" stop-color="${EMBER}" stop-opacity="0.06"/>
        <stop offset="100%" stop-color="${EMBER}" stop-opacity="0"/>
      </radialGradient>
      <linearGradient id="bgGrad" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="${BG2}"/>
        <stop offset="60%" stop-color="${BG}"/>
        <stop offset="100%" stop-color="#0e0904"/>
      </linearGradient>
      <linearGradient id="goldBar" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="${GOLD}" stop-opacity="0.9"/>
        <stop offset="100%" stop-color="${GOLD}" stop-opacity="0.3"/>
      </linearGradient>
    </defs>
    <rect width="1200" height="630" fill="url(#bgGrad)"/>
    <rect width="1200" height="630" fill="url(#ember)"/>
    <!-- smoke wisps -->
    <path d="M980 580 Q 1040 480 990 380 T 1010 180" stroke="${GOLD}" stroke-width="1.2" fill="none" opacity="0.10"/>
    <path d="M1080 600 Q 1120 470 1060 350 T 1100 140" stroke="${GOLD}" stroke-width="1" fill="none" opacity="0.07"/>
    <path d="M 60 520 Q 120 460 80 400 T 140 280" stroke="${GOLD}" stroke-width="1" fill="none" opacity="0.06"/>
    <!-- left accent bar -->
    <rect x="60" y="70" width="4" height="490" fill="url(#goldBar)" rx="2"/>
  `;
}

/** Wordmark in the bottom-right corner. */
function wordmark() {
  return `
    <g transform="translate(1010,578)">
      <circle cx="0" cy="-8" r="4" fill="${EMBER}"/>
      <text x="12" y="-3" font-family="Playfair Display,Georgia,serif" font-size="20" fill="${GOLD}" font-weight="700">Vitola Pedia</text>
    </g>
  `;
}

/* ── cigar card ──────────────────────────────────────────────────── */
function cigarSVG(c) {
  const name = c.name || c.id;
  const brand = c.brand || '';
  const origin = c.origin || '';
  const strength = c.strength || 0;
  const rating = c.rating || 0;
  const price = c.price != null ? `$${c.price}` : '—';
  const size = c.size || '';
  const length = c.length || '';
  const rg = c.ringGauge || '';
  const smokeTime = c.smokingTime ? `${c.smokingTime} min` : '';
  const flavors = c.flavors || [];

  // Auto-fit name
  const nameFont = fitNameFont(name);
  const lines = wrapName(name, nameFont > 40 ? 30 : 36);
  const lineHeight = nameFont * 1.1;
  const nameY = 250 + (lines.length > 1 ? 0 : 10);

  // Stats row Y
  const statsY = nameY + lineHeight * lines.length + 60;

  // Size + smoke time chip
  const sizeText = [size, length && rg ? `${length}" × ${rg}` : '', smokeTime].filter(Boolean).join('  ·  ');

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  ${decor()}
  <!-- brand eyebrow -->
  <text x="90" y="120" font-family="Inter,Helvetica,Arial,sans-serif" font-size="20" fill="${GOLD}" letter-spacing="4" font-weight="600">${esc(trunc(brand.toUpperCase(), 34))}</text>
  <line x1="90" y1="138" x2="200" y2="138" stroke="${GOLD}" stroke-width="2" opacity="0.6"/>

  <!-- cigar name (serif, auto-fit) -->
  ${lines.map((ln, i) => `<text x="90" y="${nameY + i * lineHeight}" font-family="Playfair Display,Georgia,serif" font-size="${nameFont}" fill="${CREAM}" font-weight="700">${esc(trunc(ln, 44))}</text>`).join('\n  ')}

  <!-- thin gold rule under name -->
  <line x1="90" y1="${nameY + lineHeight * lines.length + 18}" x2="1110" y2="${nameY + lineHeight * lines.length + 18}" stroke="${LINE}" stroke-width="1.5"/>

  <!-- stats row -->
  <g transform="translate(90,${statsY})">
    <!-- strength -->
    <text x="0" y="0" font-family="Inter,Helvetica,Arial,sans-serif" font-size="14" fill="${MUTED}" letter-spacing="2" font-weight="600">STRENGTH</text>
    ${strengthDots(strength, 4, 28)}
    <text x="120" y="33" font-family="Inter,Helvetica,Arial,sans-serif" font-size="14" fill="${CREAM}">${esc(STRENGTH_LABEL[Math.max(0, Math.min(4, strength - 1))] || '—')}</text>

    <!-- rating -->
    <text x="260" y="0" font-family="Inter,Helvetica,Arial,sans-serif" font-size="14" fill="${MUTED}" letter-spacing="2" font-weight="600">RATING</text>
    ${ratingStars(rating, 264, 28)}
    <text x="372" y="33" font-family="Playfair Display,Georgia,serif" font-size="20" fill="${GOLD}" font-weight="700">${rating}</text>
    <text x="402" y="33" font-family="Inter,Helvetica,Arial,sans-serif" font-size="12" fill="${MUTED}">/ 100</text>

    <!-- price -->
    <text x="470" y="0" font-family="Inter,Helvetica,Arial,sans-serif" font-size="14" fill="${MUTED}" letter-spacing="2" font-weight="600">PRICE</text>
    <text x="474" y="33" font-family="Playfair Display,Georgia,serif" font-size="22" fill="${CREAM}" font-weight="700">${esc(price)}</text>

    <!-- origin -->
    <text x="600" y="0" font-family="Inter,Helvetica,Arial,sans-serif" font-size="14" fill="${MUTED}" letter-spacing="2" font-weight="600">ORIGIN</text>
    <text x="604" y="33" font-family="Inter,Helvetica,Arial,sans-serif" font-size="17" fill="${CREAM}">${esc(trunc(origin, 22))}</text>
  </g>

  <!-- size + smoke time -->
  <text x="90" y="${statsY + 80}" font-family="Inter,Helvetica,Arial,sans-serif" font-size="16" fill="${MUTED}" letter-spacing="1">${esc(trunc(sizeText, 80))}</text>

  <!-- flavor pills -->
  <text x="90" y="${statsY + 120}" font-family="Inter,Helvetica,Arial,sans-serif" font-size="14" fill="${MUTED}" letter-spacing="2" font-weight="600">FLAVOR NOTES</text>
  ${flavorPills(flavors, 90, statsY + 138)}

  ${wordmark()}
</svg>`;
}

/* ── house (brand) card ──────────────────────────────────────────── */
function houseSVG(h) {
  const brand = h.brand;
  const count = h.count;
  const avgRating = h.avgRating.toFixed(1);
  const topRating = h.topRating;
  const priceMin = h.priceMin;
  const priceMax = h.priceMax;
  const priceRange = priceMin === priceMax ? `$${priceMin}` : `$${priceMin}–$${priceMax}`;
  const founded = h.founded || '';
  const origin = h.origins[0] || '';
  const strengthRange = h.strengthMin === h.strengthMax
    ? STRENGTH_LABEL[Math.max(0, Math.min(4, h.strengthMin - 1))]
    : `${STRENGTH_LABEL[Math.max(0, Math.min(4, h.strengthMin - 1))]} – ${STRENGTH_LABEL[Math.max(0, Math.min(4, h.strengthMax - 1))]}`;

  const nameFont = fitNameFont(brand);

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  ${decor()}
  <!-- eyebrow -->
  <text x="90" y="120" font-family="Inter,Helvetica,Arial,sans-serif" font-size="18" fill="${GOLD}" letter-spacing="5" font-weight="600">THE HOUSE OF</text>
  <line x1="90" y1="138" x2="220" y2="138" stroke="${GOLD}" stroke-width="2" opacity="0.6"/>

  <!-- brand name -->
  <text x="90" y="260" font-family="Playfair Display,Georgia,serif" font-size="${nameFont}" fill="${CREAM}" font-weight="700">${esc(trunc(brand, 40))}</text>

  <!-- subtitle -->
  <text x="90" y="310" font-family="Inter,Helvetica,Arial,sans-serif" font-size="22" fill="${GOLD}">${count} cigars in the encyclopedia</text>

  <line x1="90" y1="340" x2="1110" y2="340" stroke="${LINE}" stroke-width="1.5"/>

  <!-- stats -->
  <g transform="translate(90,390)">
    <text x="0" y="0" font-family="Inter,Helvetica,Arial,sans-serif" font-size="14" fill="${MUTED}" letter-spacing="2" font-weight="600">AVG RATING</text>
    <text x="0" y="36" font-family="Playfair Display,Georgia,serif" font-size="30" fill="${GOLD}" font-weight="700">${avgRating}</text>
    <text x="62" y="36" font-family="Inter,Helvetica,Arial,sans-serif" font-size="14" fill="${MUTED}">/ 100</text>

    <text x="230" y="0" font-family="Inter,Helvetica,Arial,sans-serif" font-size="14" fill="${MUTED}" letter-spacing="2" font-weight="600">TOP RATED</text>
    <text x="230" y="36" font-family="Playfair Display,Georgia,serif" font-size="30" fill="${CREAM}" font-weight="700">${topRating}</text>

    <text x="420" y="0" font-family="Inter,Helvetica,Arial,sans-serif" font-size="14" fill="${MUTED}" letter-spacing="2" font-weight="600">PRICE RANGE</text>
    <text x="420" y="36" font-family="Playfair Display,Georgia,serif" font-size="26" fill="${CREAM}" font-weight="700">${esc(priceRange)}</text>

    <text x="650" y="0" font-family="Inter,Helvetica,Arial,sans-serif" font-size="14" fill="${MUTED}" letter-spacing="2" font-weight="600">STRENGTH</text>
    <text x="650" y="36" font-family="Inter,Helvetica,Arial,sans-serif" font-size="18" fill="${CREAM}">${esc(strengthRange)}</text>

    <text x="880" y="0" font-family="Inter,Helvetica,Arial,sans-serif" font-size="14" fill="${MUTED}" letter-spacing="2" font-weight="600">ORIGIN</text>
    <text x="880" y="36" font-family="Inter,Helvetica,Arial,sans-serif" font-size="18" fill="${CREAM}">${esc(trunc(origin, 20))}</text>
  </g>

  ${founded ? `<text x="90" y="500" font-family="Inter,Helvetica,Arial,sans-serif" font-size="16" fill="${MUTED}">Established ${esc(founded)}</text>` : ''}

  ${wordmark()}
</svg>`;
}

/* ── main ────────────────────────────────────────────────────────── */
function main() {
  mkdirSync(OUT_DIR, { recursive: true });

  const cigars = JSON.parse(readFileSync(DATA, 'utf8'));
  console.log(`→ ${cigars.length} cigars loaded`);

  let cigarCount = 0;
  for (const c of cigars) {
    const svg = cigarSVG(c);
    const path = resolve(OUT_DIR, `cigar-${c.id}.svg`);
    writeFileSync(path, svg, 'utf8');
    cigarCount++;
  }
  console.log(`✓ wrote ${cigarCount} cigar SVGs`);

  // Build house aggregates
  const brandMap = new Map();
  for (const c of cigars) {
    if (!brandMap.has(c.brand)) brandMap.set(c.brand, []);
    brandMap.get(c.brand).push(c);
  }

  const houses = [];
  brandMap.forEach((list, brand) => {
    const prices = list.map(c => c.price).filter(p => p != null).sort((a, b) => a - b);
    const ratings = list.map(c => c.rating).filter(r => r != null);
    const years = list.map(c => c.yearFounded).filter(Boolean);
    const originCount = {};
    list.forEach(c => { if (c.origin) originCount[c.origin] = (originCount[c.origin] || 0) + 1; });
    const origins = Object.keys(originCount).sort((a, b) => originCount[b] - originCount[a]);
    const strengths = list.map(c => c.strength).filter(s => s != null);
    houses.push({
      brand,
      slug: slug(brand),
      count: list.length,
      avgRating: ratings.reduce((a, b) => a + b, 0) / ratings.length,
      topRating: Math.max(...ratings),
      priceMin: prices[0],
      priceMax: prices[prices.length - 1],
      origins,
      founded: years.length ? Math.min(...years) : null,
      strengthMin: Math.min(...strengths),
      strengthMax: Math.max(...strengths),
    });
  });

  let houseCount = 0;
  for (const h of houses) {
    const svg = houseSVG(h);
    const path = resolve(OUT_DIR, `house-${h.slug}.svg`);
    writeFileSync(path, svg, 'utf8');
    houseCount++;
  }
  console.log(`✓ wrote ${houseCount} house SVGs`);

  // Write a manifest JSON for the converter + app to reference
  const manifest = {
    generated: new Date().toISOString(),
    cigarCount,
    houseCount,
    cigars: cigars.map(c => ({ id: c.id, file: `cigar-${c.id}.svg` })),
    houses: houses.map(h => ({ slug: h.slug, brand: h.brand, file: `house-${h.slug}.svg` })),
  };
  writeFileSync(resolve(OUT_DIR, 'manifest.json'), JSON.stringify(manifest, null, 2));
  console.log(`✓ wrote manifest.json`);

  // Generic homepage card (brand wordmark + tagline).
  const homeSVG = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  ${decor()}
  <text x="600" y="250" font-family="Inter,Helvetica,Arial,sans-serif" font-size="18" fill="${GOLD}" letter-spacing="8" font-weight="600" text-anchor="middle">THE CIGAR ENCYCLOPEDIA</text>
  <text x="600" y="340" font-family="Playfair Display,Georgia,serif" font-size="72" fill="${CREAM}" font-weight="700" text-anchor="middle">Vitola Pedia</text>
  <line x1="450" y1="370" x2="750" y2="370" stroke="${GOLD}" stroke-width="2" opacity="0.6"/>
  <text x="600" y="410" font-family="Inter,Helvetica,Arial,sans-serif" font-size="24" fill="${MUTED}" text-anchor="middle">${cigars.length} cigars · ${houses.length} brands · Every detail</text>
  ${wordmark().replace('translate(1010,578)', 'translate(1010,578)')}
</svg>`;
  writeFileSync(resolve(OUT_DIR, 'home.svg'), homeSVG);
  console.log(`✓ wrote home.svg (generic homepage card)`);

  console.log(`\nDone.  ${cigarCount + houseCount + 1} SVG files in ${OUT_DIR}`);
}

main();
