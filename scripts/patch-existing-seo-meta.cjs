#!/usr/bin/env node
/* Patch <title> and <meta name="description"> in existing cigars/*.html
   and houses/*.html to match the new SEO format from generate-seo-pages.cjs.
   Uses data/cigars.json (never js/data.js) for cigar metadata. */

'use strict';

const fs   = require('fs');
const path = require('path');

const ROOT      = path.resolve(__dirname, '..');
const DATA_FILE = path.join(ROOT, 'data', 'cigars.json');
const CIGAR_DIR = path.join(ROOT, 'cigars');
const HOUSE_DIR = path.join(ROOT, 'houses');

/* ── slug helpers (mirror generate-seo-pages.cjs) ─────────────── */
function normText(s) {
  return String(s == null ? '' : s)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}
function slug(s) {
  return normText(s)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

const STRENGTH_LABEL = ['Mild', 'Mild–Medium', 'Medium', 'Medium–Full', 'Full'];
function strengthLabel(n) {
  return STRENGTH_LABEL[parseInt(n, 10) - 1] || 'Medium';
}

/** Escape text for safe HTML attribute insertion. */
function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Replace all occurrences of <title>...</title> in the html with newTitle,
 * and all <meta name="description" content="..."> with newDesc.
 * Also patches og:title, og:description, twitter:title, twitter:description.
 * Returns { html, changed }.
 */
function patchMeta(html, newTitle, newDesc) {
  const escTitle = esc(newTitle);
  const escDesc  = esc(newDesc);
  let changed = false;
  let out = html;

  // <title>...</title>
  const titleRe = /<title>[^]*?<\/title>/;
  if (titleRe.test(out)) {
    out = out.replace(titleRe, `<title>${escTitle}</title>`);
    changed = true;
  }

  // <meta name="description" content="...">
  const descRe = /<meta\s+name="description"\s+content="[^"]*"\s*\/?>/g;
  if (descRe.test(out)) {
    out = out.replace(descRe, `<meta name="description" content="${escDesc}">`);
    changed = true;
  }

  // og:title
  const ogTitleRe = /<meta\s+property="og:title"\s+content="[^"]*"\s*\/?>/g;
  if (ogTitleRe.test(out)) {
    out = out.replace(ogTitleRe, `<meta property="og:title" content="${escTitle}">`);
    changed = true;
  }

  // og:description
  const ogDescRe = /<meta\s+property="og:description"\s+content="[^"]*"\s*\/?>/g;
  if (ogDescRe.test(out)) {
    out = out.replace(ogDescRe, `<meta property="og:description" content="${escDesc}">`);
    changed = true;
  }

  // twitter:title
  const twTitleRe = /<meta\s+name="twitter:title"\s+content="[^"]*"\s*\/?>/g;
  if (twTitleRe.test(out)) {
    out = out.replace(twTitleRe, `<meta name="twitter:title" content="${escTitle}">`);
    changed = true;
  }

  // twitter:description
  const twDescRe = /<meta\s+name="twitter:description"\s+content="[^"]*"\s*\/?>/g;
  if (twDescRe.test(out)) {
    out = out.replace(twDescRe, `<meta name="twitter:description" content="${escDesc}">`);
    changed = true;
  }

  return { html: out, changed };
}

/* ── MAIN ─────────────────────────────────────────────────────── */
console.log('Loading cigar data…');
const cigars = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
console.log(`  ${cigars.length} cigars found.`);

let cigarUpdated = 0;
let cigarSkipped  = 0;

// ── Patch cigar pages ──
const cigarMap = new Map(cigars.map(c => [c.id, c]));
if (fs.existsSync(CIGAR_DIR)) {
  const files = fs.readdirSync(CIGAR_DIR).filter(f => f.endsWith('.html'));
  console.log(`Processing ${files.length} cigar pages…`);
  for (const f of files) {
    const id = f.replace(/\.html$/, '');
    const c = cigarMap.get(id);
    if (!c) { cigarSkipped++; continue; }

    const title = `${c.name} by ${c.brand} — Review, Flavors & Pairings | Vitola Pedia`;
    const description = `${c.name} by ${c.brand}: ${c.origin} ${c.wrapper} wrapper, ${strengthLabel(c.strength)} strength, ${c.rating} rating. Full tasting notes, flavor profile, and pairings.`;

    const fp = path.join(CIGAR_DIR, f);
    const html = fs.readFileSync(fp, 'utf8');
    const { html: next, changed } = patchMeta(html, title, description);
    if (changed) {
      fs.writeFileSync(fp, next, 'utf8');
      cigarUpdated++;
    }
  }
  console.log(`✓ Cigar pages: ${cigarUpdated} updated, ${cigarSkipped} skipped (no data match)`);
}

// ── Patch house/brand pages ──
// Build brand → cigar list map
const brandMap = new Map();
cigars.forEach(c => {
  if (!brandMap.has(c.brand)) brandMap.set(c.brand, []);
  brandMap.get(c.brand).push(c);
});

let houseUpdated = 0;
let houseSkipped = 0;

if (fs.existsSync(HOUSE_DIR)) {
  const files = fs.readdirSync(HOUSE_DIR).filter(f => f.endsWith('.html'));
  console.log(`Processing ${files.length} house pages…`);
  for (const f of files) {
    const stem = f.replace(/\.html$/, '');
    // Match by slug — find brand whose slug === stem
    let matchedBrand = null;
    for (const [brand] of brandMap) {
      if (slug(brand) === stem) { matchedBrand = brand; break; }
    }
    if (!matchedBrand) { houseSkipped++; continue; }

    const title = `${matchedBrand} Cigars — Complete Guide & Reviews | Vitola Pedia`;
    const description = `Browse all ${matchedBrand} cigars in the Vitola Pedia encyclopedia. Reviews, ratings, flavor profiles, and where to buy.`;

    const fp = path.join(HOUSE_DIR, f);
    const html = fs.readFileSync(fp, 'utf8');
    const { html: next, changed } = patchMeta(html, title, description);
    if (changed) {
      fs.writeFileSync(fp, next, 'utf8');
      houseUpdated++;
    }
  }
  console.log(`✓ House pages: ${houseUpdated} updated, ${houseSkipped} skipped (no data match)`);
}

const total = cigarUpdated + houseUpdated;
console.log(`\nDone. ${total} pages updated (${cigarUpdated} cigars + ${houseUpdated} houses).`);
