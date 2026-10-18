#!/usr/bin/env node
/* ══════════════════════════════════════════════════════════════════
   VITOLA PEDIA — ALL CIGAR PAGES GENERATOR
   ──────────────────────────────────────────────────────────────────
   Generates a standalone, indexable HTML page for EVERY cigar in
   data/cigars.json into /cigars/{id}.html, matching the exact format
   of the existing 7,566 pages already in /cigars/.

   - Loads data/cigars.json (NOT js/data.js — it's 31MB).
   - Skips any id whose /cigars/{id}.html already exists.
   - canonical = https://vitolapedia.com/cigars/{id}.html
   - brand link = https://vitolapedia.com/houses/{slug}.html
   - JSON-LD Product schema with brand.foundingDate + foundingLocation.
   - Trailing <script>window.location.replace(.../#/cigar/{id})</script>.

   Usage:
     node scripts/generate-all-cigar-pages.cjs
   ═════════════════════════════════════════════════════════════════ */

'use strict';

const fs   = require('fs');
const path = require('path');

/* ── CONFIG ─────────────────────────────────────────────────────── */
const ROOT     = path.resolve(__dirname, '..');
const DATA_FILE = path.join(ROOT, 'data', 'cigars.json');
const CIGAR_DIR = path.join(ROOT, 'cigars');
const SITE_URL  = 'https://vitolapedia.com';
const OG_FALLBACK = SITE_URL + '/og-image.png';

/* ── HELPERS ────────────────────────────────────────────────────── */
function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&')
    .replace(/</g, '<')
    .replace(/>/g, '>')
    .replace(/"/g, '"')
    .replace(/'/g, '&#39;');
}

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

/* ── SHARED CSS (matches existing /cigars/*.html exactly) ───────── */
const SHARED_CSS = `
:root{--gold:#c9a84c;--gold-light:#e0c070;--bg-deep:#0d0b09;--bg-base:#120f0b;--bg-card:#1a1510;--bg-card-h:#221c14;--border:rgba(201,168,76,.15);--border-h:rgba(201,168,76,.35);--text-primary:#f0ead8;--text-secondary:#a89b7a;--text-muted:#6b5e42;--radius:12px;--radius-lg:20px;--font-serif:'Playfair Display',Georgia,serif;--font-sans:'Inter',system-ui,sans-serif;--font-body:'Crimson Text',Georgia,serif}
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
body{background:var(--bg-base);color:var(--text-primary);font-family:var(--font-sans);font-size:15px;line-height:1.6;min-height:100vh;-webkit-font-smoothing:antialiased}
a{color:var(--gold);text-decoration:none}
a:hover{color:var(--gold-light)}
img{max-width:100%;display:block}
.container{max-width:860px;margin:0 auto;padding:40px 20px}
.site-header{text-align:center;padding:28px 20px 0}
.site-header a{font-family:var(--font-serif);font-size:1.5rem;font-weight:700;letter-spacing:.5px;color:var(--gold)}
.site-header a:hover{color:var(--gold-light)}
.cigar-card{background:var(--bg-card);border:1px solid var(--border);border-radius:var(--radius-lg);padding:32px;margin-top:24px}
.cigar-name{font-family:var(--font-serif);font-size:2rem;font-weight:700;line-height:1.2;color:var(--text-primary)}
.cigar-brand{font-family:var(--font-body);font-size:1.15rem;color:var(--gold);margin-top:4px}
.cigar-brand a{color:var(--gold)}
.meta-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:12px;margin-top:24px}
.meta-item{background:var(--bg-deep);border:1px solid var(--border);border-radius:var(--radius);padding:12px 16px}
.meta-label{font-size:.7rem;text-transform:uppercase;letter-spacing:.08em;color:var(--text-muted)}
.meta-value{font-size:1.05rem;color:var(--text-primary);font-weight:500;margin-top:2px}
.section{margin-top:24px}
.section h2{font-family:var(--font-serif);font-size:1.25rem;color:var(--gold);margin-bottom:8px;border-bottom:1px solid var(--border);padding-bottom:6px}
.flavor-tags{display:flex;flex-wrap:wrap;gap:8px;margin-top:8px}
.flavor-tag{background:var(--bg-deep);border:1px solid var(--border);border-radius:20px;padding:4px 14px;font-size:.85rem;color:var(--text-secondary)}
.description{font-family:var(--font-body);font-size:1.1rem;line-height:1.7;color:var(--text-primary);margin-top:8px}
.pairing-tags{display:flex;flex-wrap:wrap;gap:8px;margin-top:8px}
.pairing-tag{background:rgba(201,168,76,.08);border:1px solid var(--border);border-radius:6px;padding:4px 12px;font-size:.85rem;color:var(--gold-light)}
.buy-links{margin-top:12px}
.buy-link{display:inline-block;background:var(--bg-deep);border:1px solid var(--border);border-radius:var(--radius);padding:10px 18px;margin:4px 4px 4px 0;font-size:.9rem;color:var(--text-secondary)}
.buy-link:hover{border-color:var(--border-h);color:var(--gold)}
.cta-bar{display:flex;gap:12px;justify-content:center;margin-top:28px;flex-wrap:wrap}
.cta-btn{display:inline-block;background:var(--gold);color:var(--bg-deep);font-weight:600;padding:12px 28px;border-radius:var(--radius);font-size:.95rem}
.cta-btn:hover{background:var(--gold-light);color:var(--bg-deep)}
.cta-btn.secondary{background:transparent;border:1px solid var(--border-h);color:var(--gold)}
.cta-btn.secondary:hover{background:var(--bg-card-h);color:var(--gold-light)}
.age-notice{text-align:center;font-size:.8rem;color:var(--text-muted);margin-top:24px;padding-top:16px;border-top:1px solid var(--border)}
.rating-badge{display:inline-flex;align-items:center;gap:4px;background:rgba(201,168,76,.12);border:1px solid var(--gold);border-radius:8px;padding:4px 12px;font-weight:600;color:var(--gold)}
.strength-bar{display:inline-block;width:80px;height:8px;border-radius:4px;background:var(--bg-deep);position:relative;margin-left:8px}
.strength-fill{height:100%;border-radius:4px}
.cigar-list{list-style:none;padding:0}
.cigar-list li{padding:10px 16px;border-bottom:1px solid var(--border)}
.cigar-list li:last-child{border-bottom:none}
.cigar-list a{color:var(--text-primary);font-weight:500}
.cigar-list a:hover{color:var(--gold)}
.cigar-list .rating{float:right;font-size:.85rem;color:var(--gold)}
noscript p{text-align:center;padding:20px;color:var(--text-secondary)}
`;

/* ── HEAD BLOCK (matches existing /cigars/*.html exactly) ───────── */
function headBlock(c, title, description, canonical, image) {
  return `<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${canonical}">
<meta name="robots" content="index, follow">
<meta name="theme-color" content="#1a1209">
<meta property="og:type" content="article">
<meta property="og:url" content="${canonical}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:image" content="${esc(image)}">
<meta property="og:site_name" content="Vitola Pedia">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(description)}">
<meta name="twitter:image" content="${esc(image)}">
<link rel="icon" type="image/svg+xml" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='6' fill='%231a1209'/%3E%3Crect x='4' y='14' width='20' height='5' rx='2.5' fill='%23c9943a'/%3E%3C/svg%3E">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;600;700&family=Inter:wght@300;400;500;600&family=Crimson+Text:wght@400;600&display=swap" rel="stylesheet">`;
}

/* ── JSON-LD Product schema (matches existing format) ──────────── */
function jsonLdBlock(c, canonical, image) {
  const brand = {
    "@type": "Brand",
    "name": c.brand
  };
  if (c.yearFounded) brand.foundingDate = String(c.yearFounded);
  if (c.region) {
    brand.foundingLocation = { "@type": "Place", "name": c.region };
  }
  const obj = {
    "@context": "https://schema.org",
    "@type": "Product",
    "name": c.name,
    "image": image,
    "url": canonical,
    "brand": brand,
    "category": "Cigar",
    "description": c.description || `${c.name} by ${c.brand}.`,
    "aggregateRating": {
      "@type": "AggregateRating",
      "ratingValue": String(c.rating),
      "bestRating": "100",
      "worstRating": "0",
      "reviewCount": "1"
    },
    "offers": {
      "@type": "Offer",
      "price": String(c.price),
      "priceCurrency": "USD",
      "availability": "https://schema.org/InStock"
    }
  };
  return `<script type="application/ld+json">\n${JSON.stringify(obj, null, 2)}\n</script>`;
}

/* ── BUILD CIGAR PAGE (matches existing /cigars/*.html exactly) ─── */
function buildCigarPage(c) {
  const canonical  = `${SITE_URL}/cigars/${c.id}.html`;
  const interactiveUrl = `${SITE_URL}/#/cigar/${c.id}`;
  const image      = c.image || OG_FALLBACK;
  const flavors    = (c.flavors || []);
  const pairings   = (c.pairings || []);
  const description = `${c.name} by ${c.brand}: ${c.origin} ${c.wrapper} wrapper, ${strengthLabel(c.strength)} strength, ${c.rating} rating. Full tasting notes, flavor profile, and pairings.`;
  const title = `${c.name} by ${c.brand} — Review, Flavors & Pairings | Vitola Pedia`;
  const brandSlug = slug(c.brand);

  const flavorTagsHtml = flavors
    .map(f => `<span class="flavor-tag">${esc(f)}</span>`)
    .join('');
  const pairingTagsHtml = pairings
    .map(p => `<span class="pairing-tag">${esc(p)}</span>`)
    .join('');

  let buyLinksHtml = '';
  if (c.buyLinks && c.buyLinks.length) {
    buyLinksHtml = c.buyLinks.map(bl => {
      const priceStr = (bl.price != null) ? ` — $${bl.price}` : '';
      return `<a class="buy-link" href="${esc(bl.url)}" rel="nofollow noopener" target="_blank">${esc(bl.retailer)}${priceStr}</a>`;
    }).join('\n');
  }

  const regionPart = c.region ? ' · ' + esc(c.region) : '';

  const metaGridItems = [
    `<div class="meta-item"><div class="meta-label">Strength</div><div class="meta-value">${strengthLabel(c.strength)} (${c.strength}/5)</div></div>`,
    `<div class="meta-item"><div class="meta-label">Rating</div><div class="meta-value">${c.rating}/100</div></div>`,
    `<div class="meta-item"><div class="meta-label">Price</div><div class="meta-value">$${c.price}</div></div>`,
    `<div class="meta-item"><div class="meta-label">Smoke Time</div><div class="meta-value">${c.smokingTime} min</div></div>`,
    `<div class="meta-item"><div class="meta-label">Size</div><div class="meta-value">${esc(c.size)}</div></div>`,
    `<div class="meta-item"><div class="meta-label">Dimensions</div><div class="meta-value">${c.length}" × ${c.ringGauge} RG</div></div>`,
    `<div class="meta-item"><div class="meta-label">Wrapper</div><div class="meta-value">${esc(c.wrapper)}</div></div>`,
    `<div class="meta-item"><div class="meta-label">Binder</div><div class="meta-value">${esc(c.binder)}</div></div>`,
    `<div class="meta-item"><div class="meta-label">Filler</div><div class="meta-value">${esc(c.filler)}</div></div>`
  ];
  if (c.yearFounded) {
    metaGridItems.push(`<div class="meta-item"><div class="meta-label">Year Founded</div><div class="meta-value">${c.yearFounded}</div></div>`);
  }
  if (c.limited) {
    metaGridItems.push(`<div class="meta-item"><div class="meta-label">Limited Edition</div><div class="meta-value">Yes</div></div>`);
  }

  return `<!DOCTYPE html>
<html lang="en">
<head>
${headBlock(c, title, description, canonical, image)}
${jsonLdBlock(c, canonical, image)}
<style>${SHARED_CSS}</style>
</head>
<body>
<div class="site-header"><a href="${SITE_URL}/">Vitola Pedia</a></div>
<div class="container">

<article class="cigar-card">
  <h1 class="cigar-name">${esc(c.name)}</h1>
  <div class="cigar-brand"><a href="${SITE_URL}/houses/${brandSlug}.html">${esc(c.brand)}</a> · ${esc(c.origin)}${regionPart}</div>

  <div class="meta-grid">
    ${metaGridItems.join('\n    ')}
  </div>

  ${c.description ? `<div class="section"><h2>Description</h2><p class="description">${esc(c.description)}</p></div>` : ''}
  ${flavorTagsHtml ? `<div class="section"><h2>Flavor Notes</h2><div class="flavor-tags">${flavorTagsHtml}</div></div>` : ''}
  ${pairingTagsHtml ? `<div class="section"><h2>Pairings</h2><div class="pairing-tags">${pairingTagsHtml}</div></div>` : ''}
  ${buyLinksHtml ? `<div class="section"><h2>Where to Buy</h2><div class="buy-links">${buyLinksHtml}</div></div>` : ''}

  <div class="cta-bar">
    <a class="cta-btn" href="${interactiveUrl}">View on Vitola Pedia</a>
    <a class="cta-btn secondary" href="${SITE_URL}/houses/${brandSlug}.html">${esc(c.brand)} Cigars</a>
  </div>
</article>

<div class="age-notice">⚠️ You must be 21 or older to purchase tobacco products. This site is for informational purposes only.</div>

</div>
<noscript><p>This page is part of the <a href="${SITE_URL}/">Vitola Pedia</a> cigar encyclopedia. Visit the <a href="${interactiveUrl}">interactive ${esc(c.name)} page</a> for the full experience.</p></noscript>
<script>window.location.replace('${interactiveUrl}');</script>
</body>
</html>`;
}

/* ── MAIN ───────────────────────────────────────────────────────── */
function main() {
  console.log('Loading cigar data…');
  const cigars = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  console.log(`  ${cigars.length} cigars found.`);

  if (!fs.existsSync(CIGAR_DIR)) fs.mkdirSync(CIGAR_DIR, { recursive: true });

  // Build a set of existing page ids (filenames without .html)
  const existing = new Set();
  fs.readdirSync(CIGAR_DIR).forEach(f => {
    if (f.endsWith('.html')) existing.add(f.replace(/\.html$/, ''));
  });
  console.log(`  ${existing.size} existing pages in /cigars/.`);

  let generated = 0;
  let skipped = 0;
  let missingData = 0;

  for (const c of cigars) {
    if (!c || !c.id) { missingData++; continue; }
    if (existing.has(c.id)) { skipped++; continue; }
    const html = buildCigarPage(c);
    fs.writeFileSync(path.join(CIGAR_DIR, c.id + '.html'), html, 'utf8');
    generated++;
    if (generated % 2000 === 0) console.log(`  …${generated} generated`);
  }

  console.log(`\nDone.`);
  console.log(`  Generated: ${generated}`);
  console.log(`  Skipped (already existed): ${skipped}`);
  console.log(`  Missing data: ${missingData}`);

  // Final count
  const finalCount = fs.readdirSync(CIGAR_DIR).filter(f => f.endsWith('.html')).length;
  console.log(`  Total pages in /cigars/ now: ${finalCount}`);
}

main();
