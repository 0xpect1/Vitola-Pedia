#!/usr/bin/env node
/* ══════════════════════════════════════════════════════════════════
   VITOLA PEDIA — SEO STATIC PAGE GENERATOR (top-100 + all brands)
   ──────────────────────────────────────────────────────────────────
   Generates standalone, indexable HTML pages for every brand (house)
   and the top-100 highest-rated cigars so search engines can crawl them
   without executing JavaScript.

   Output:
     seo-pages/brands/<slug>.html   — 364 brand/house pages
     seo-pages/cigars/<id>.html     — 100 top-rated cigar pages
     seo-pages/index.html           — landing index with links

   Usage:
     node scripts/generate-seo-pages.cjs

   NOTE: Re-run this script whenever data/cigars.json changes, then
   commit the regenerated seo-pages/ directory so GitHub Pages serves
   the updated pages.
   ═════════════════════════════════════════════════════════════════ */

'use strict';

const fs   = require('fs');
const path = require('path');

/* ── CONFIG ─────────────────────────────────────────────────────── */
const ROOT          = path.resolve(__dirname, '..');
const DATA_FILE      = path.join(ROOT, 'data', 'cigars.json');
const OUT_DIR        = path.join(ROOT, 'seo-pages');
const BRAND_DIR      = path.join(OUT_DIR, 'brands');
const CIGAR_DIR      = path.join(OUT_DIR, 'cigars');
const TOP_N          = 100;                 // generate top-100 cigars
const SITE_URL       = 'https://vitolapedia.com';
const OG_FALLBACK    = SITE_URL + '/og-image.png';

/* ── HELPERS ────────────────────────────────────────────────────── */

/** Escape text for safe HTML insertion. */
function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Replicate the slug function from js/app.js + js/houses.js:
 *   normText(s) = lowercase + NFD-normalise + strip combining marks
 *   slug(s)     = replace non-[a-z0-9] runs with '-' then trim edges
 */
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
const STRENGTH_WORD  = ['mild', 'mild-medium', 'medium', 'medium-full', 'full-bodied'];

function strengthLabel(n) {
  return STRENGTH_LABEL[parseInt(n, 10) - 1] || 'Medium';
}
function strengthWord(n) {
  return STRENGTH_WORD[parseInt(n, 10) - 1] || 'medium';
}

/* ── SHARED CSS ──────────────────────────────────────────────────── */
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
.cigar-list{list-style:none;padding:0}
.cigar-list li{padding:10px 16px;border-bottom:1px solid var(--border)}
.cigar-list li:last-child{border-bottom:none}
.cigar-list a{color:var(--text-primary);font-weight:500}
.cigar-list a:hover{color:var(--gold)}
.cigar-list .rating{float:right;font-size:.85rem;color:var(--gold)}
.brand-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:12px;margin-top:16px}
.brand-grid a{display:block;background:var(--bg-deep);border:1px solid var(--border);border-radius:var(--radius);padding:10px 14px;font-size:.95rem}
.brand-grid a:hover{border-color:var(--border-h);color:var(--gold)}
noscript p{text-align:center;padding:20px;color:var(--text-secondary)}
`;

/* ── HEAD HELPER ────────────────────────────────────────────────── */
function headBlock(opts) {
  const { title, description, canonical, image, ogType } = opts;
  return `<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${canonical}">
<meta name="robots" content="index, follow">
<meta name="theme-color" content="#1a1209">
<meta property="og:type" content="${ogType || 'article'}">
<meta property="og:url" content="${canonical}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:image" content="${esc(image || OG_FALLBACK)}">
<meta property="og:site_name" content="Vitola Pedia">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(description)}">
<meta name="twitter:image" content="${esc(image || OG_FALLBACK)}">
<link rel="icon" type="image/svg+xml" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='6' fill='%231a1209'/%3E%3Crect x='4' y='14' width='20' height='5' rx='2.5' fill='%23c9943a'/%3E%3C/svg%3E">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;600;700&family=Inter:wght@300;400;500;600&family=Crimson+Text:wght@400;600&display=swap" rel="stylesheet">`;
}

/* ── JSON-LD HELPER ─────────────────────────────────────────────── */
function jsonLdBlock(obj) {
  return `<script type="application/ld+json">\n${JSON.stringify(obj, null, 2)}\n</script>`;
}

/* ── CIGAR PAGE ─────────────────────────────────────────────────── */
function buildCigarPage(c) {
  const canonical  = `${SITE_URL}/seo-pages/cigars/${c.id}.html`;
  const interactiveUrl = `${SITE_URL}/#/cigar/${c.id}`;
  const image      = c.image || OG_FALLBACK;
  const flavors    = (c.flavors || []).join(', ');
  const pairings   = (c.pairings || []).join(', ');
  const description = `${c.name} by ${c.brand}. ${strengthWord(c.strength)} ${c.origin} cigar with ${flavors || 'complex'} flavor notes. ${c.smokingTime} min smoke. Rated ${c.rating}/100. From $${c.price}.`;

  // JSON-LD: Product + AggregateRating
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    "name": c.name,
    "image": image,
    "url": canonical,
    "brand": { "@type": "Brand", "name": c.brand },
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

  const flavorTagsHtml = (c.flavors || [])
    .map(f => `<span class="flavor-tag">${esc(f)}</span>`)
    .join('');
  const pairingTagsHtml = (c.pairings || [])
    .map(p => `<span class="pairing-tag">${esc(p)}</span>`)
    .join('');

  let buyLinksHtml = '';
  if (c.buyLinks && c.buyLinks.length) {
    buyLinksHtml = c.buyLinks.map(bl => {
      const priceStr = (bl.price != null) ? ` — $${bl.price}` : '';
      return `<a class="buy-link" href="${esc(bl.url)}" rel="nofollow noopener" target="_blank">${esc(bl.retailer)}${priceStr}</a>`;
    }).join('\n');
  }

  const brandSlug = slug(c.brand);
  const title = `${c.name} — Review, Flavors & Stats | Vitola Pedia`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
${headBlock({ title, description, canonical, image, ogType: 'article' })}
${jsonLdBlock(jsonLd)}
<style>${SHARED_CSS}</style>
</head>
<body>
<div class="site-header"><a href="${SITE_URL}/">Vitola Pedia</a></div>
<div class="container">

<article class="cigar-card">
  <h1 class="cigar-name">${esc(c.name)}</h1>
  <div class="cigar-brand"><a href="${SITE_URL}/seo-pages/brands/${brandSlug}.html">${esc(c.brand)}</a> · ${esc(c.origin)}${c.region ? ' · ' + esc(c.region) : ''}</div>

  <div class="meta-grid">
    <div class="meta-item"><div class="meta-label">Strength</div><div class="meta-value">${strengthLabel(c.strength)} (${c.strength}/5)</div></div>
    <div class="meta-item"><div class="meta-label">Rating</div><div class="meta-value">${c.rating}/100</div></div>
    <div class="meta-item"><div class="meta-label">Price</div><div class="meta-value">$${c.price}</div></div>
    <div class="meta-item"><div class="meta-label">Smoke Time</div><div class="meta-value">${c.smokingTime} min</div></div>
    <div class="meta-item"><div class="meta-label">Size</div><div class="meta-value">${esc(c.size)}</div></div>
    <div class="meta-item"><div class="meta-label">Dimensions</div><div class="meta-value">${c.length}" × ${c.ringGauge} RG</div></div>
    <div class="meta-item"><div class="meta-label">Wrapper</div><div class="meta-value">${esc(c.wrapper)}</div></div>
    <div class="meta-item"><div class="meta-label">Binder</div><div class="meta-value">${esc(c.binder)}</div></div>
    <div class="meta-item"><div class="meta-label">Filler</div><div class="meta-value">${esc(c.filler)}</div></div>
    ${c.yearFounded ? `<div class="meta-item"><div class="meta-label">Year Founded</div><div class="meta-value">${c.yearFounded}</div></div>` : ''}
    ${c.limited ? `<div class="meta-item"><div class="meta-label">Limited Edition</div><div class="meta-value">Yes</div></div>` : ''}
  </div>

  ${c.description ? `<div class="section"><h2>Description</h2><p class="description">${esc(c.description)}</p></div>` : ''}
  ${flavorTagsHtml ? `<div class="section"><h2>Flavor Notes</h2><div class="flavor-tags">${flavorTagsHtml}</div></div>` : ''}
  ${pairingTagsHtml ? `<div class="section"><h2>Pairings</h2><div class="pairing-tags">${pairingTagsHtml}</div></div>` : ''}
  ${buyLinksHtml ? `<div class="section"><h2>Where to Buy</h2><div class="buy-links">${buyLinksHtml}</div></div>` : ''}

  <div class="cta-bar">
    <a class="cta-btn" href="${interactiveUrl}">View on Vitola Pedia</a>
    <a class="cta-btn secondary" href="${SITE_URL}/seo-pages/brands/${brandSlug}.html">${esc(c.brand)} Cigars</a>
  </div>
</article>

<div class="age-notice">⚠️ You must be 21 or older to purchase tobacco products. This site is for informational purposes only.</div>

</div>
<noscript><p>This page is part of the <a href="${SITE_URL}/">Vitola Pedia</a> cigar encyclopedia. Visit the <a href="${interactiveUrl}">interactive ${esc(c.name)} page</a> for the full experience.</p></noscript>
</body>
</html>`;
}

/* ── BRAND PAGE ─────────────────────────────────────────────────── */
function buildBrandPage(brand, brandSlug, cigarList) {
  const canonical      = `${SITE_URL}/seo-pages/brands/${brandSlug}.html`;
  const interactiveUrl = `${SITE_URL}/#/house/${brandSlug}`;
  const count           = cigarList.length;
  const origins         = [...new Set(cigarList.map(c => c.origin))].join(', ');
  const avgRating       = (cigarList.reduce((a, c) => a + c.rating, 0) / count).toFixed(1);
  const prices          = cigarList.map(c => c.price).sort((a, b) => a - b);
  const priceMin        = prices[0];
  const priceMax        = prices[prices.length - 1];
  const description     = `${brand} cigars from ${origins}. ${count} cigars in the encyclopedia. Browse the full range, reviews, and flavor profiles. Average rating ${avgRating}/100. Prices from $${priceMin} to $${priceMax}.`;

  // Aggregate flavor data
  const flavorCount = {};
  cigarList.forEach(c => (c.flavors || []).forEach(f => {
    flavorCount[f] = (flavorCount[f] || 0) + 1;
  }));
  const topFlavors = Object.keys(flavorCount)
    .sort((a, b) => flavorCount[b] - flavorCount[a])
    .slice(0, 10);

  // JSON-LD: Brand
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Brand",
    "name": brand,
    "url": canonical,
    "description": `${brand} cigars from ${origins}. ${count} cigars in the Vitola Pedia encyclopedia.`
  };
  if (cigarList[0] && cigarList[0].image) jsonLd.logo = cigarList[0].image;

  // Cigar list HTML (sorted by rating desc)
  const sortedCigars = [...cigarList].sort((a, b) => b.rating - a.rating);
  const cigarListHtml = sortedCigars.map(c =>
    `    <li><a href="${SITE_URL}/seo-pages/cigars/${c.id}.html">${esc(c.name)}</a><span class="rating">${c.rating}/100</span></li>`
  ).join('\n');

  const years = cigarList.map(c => c.yearFounded).filter(Boolean);
  const founded = years.length ? Math.min(...years) : null;
  const title = `${brand} Cigars — History, Lines & Reviews | Vitola Pedia`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
${headBlock({ title, description, canonical, image: cigarList[0] && cigarList[0].image, ogType: 'website' })}
${jsonLdBlock(jsonLd)}
<style>${SHARED_CSS}</style>
</head>
<body>
<div class="site-header"><a href="${SITE_URL}/">Vitola Pedia</a></div>
<div class="container">

<article class="cigar-card">
  <h1 class="cigar-name">${esc(brand)} Cigars</h1>
  <div class="cigar-brand">House of ${esc(brand)} · ${esc(origins)}${founded ? ' · Est. ' + founded : ''}</div>

  <div class="meta-grid">
    <div class="meta-item"><div class="meta-label">Cigars in Encyclopedia</div><div class="meta-value">${count}</div></div>
    <div class="meta-item"><div class="meta-label">Average Rating</div><div class="meta-value">${avgRating}/100</div></div>
    <div class="meta-item"><div class="meta-label">Price Range</div><div class="meta-value">$${priceMin} – $${priceMax}</div></div>
    ${founded ? `<div class="meta-item"><div class="meta-label">Founded</div><div class="meta-value">${founded}</div></div>` : ''}
  </div>

  ${topFlavors.length ? `<div class="section"><h2>Signature Flavors</h2><div class="flavor-tags">${topFlavors.map(f => `<span class="flavor-tag">${esc(f)}</span>`).join('')}</div></div>` : ''}

  <div class="section">
    <h2>All Cigars by ${esc(brand)} (${count})</h2>
    <ul class="cigar-list">
${cigarListHtml}
    </ul>
  </div>

  <div class="cta-bar">
    <a class="cta-btn" href="${interactiveUrl}">View ${esc(brand)} on Vitola Pedia</a>
    <a class="cta-btn secondary" href="${SITE_URL}/">Browse All Cigars</a>
  </div>
</article>

<div class="age-notice">⚠️ You must be 21 or older to purchase tobacco products. This site is for informational purposes only.</div>

</div>
<noscript><p>This page is part of the <a href="${SITE_URL}/">Vitola Pedia</a> cigar encyclopedia. Visit the <a href="${interactiveUrl}">interactive ${esc(brand)} house page</a> for the full experience.</p></noscript>
</body>
</html>`;
}

/* ── INDEX PAGE ─────────────────────────────────────────────────── */
function buildIndexPage(brands, topCigars) {
  const canonical = `${SITE_URL}/seo-pages/index.html`;
  const title = 'Vitola Pedia — Cigar Encyclopedia Index | Vitola Pedia';
  const description = `Browse ${brands.length} cigar brands and ${topCigars.length} top-rated cigars in the Vitola Pedia encyclopedia. Static, crawlable pages for every brand and the top 100 cigars.`;

  const brandLinks = brands.sort((a, b) => a.localeCompare(b)).map(b => {
    const s = slug(b);
    return `<a href="${SITE_URL}/seo-pages/brands/${s}.html">${esc(b)}</a>`;
  }).join('\n      ');

  const topLinks = topCigars.map(c =>
    `      <li><a href="${SITE_URL}/seo-pages/cigars/${c.id}.html">${esc(c.name)}</a><span class="rating">${c.brand} · ${c.rating}/100</span></li>`
  ).join('\n');

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "name": "Vitola Pedia",
    "url": SITE_URL,
    "description": "Cigar encyclopedia with reviews, flavor profiles, and brand histories."
  };

  return `<!DOCTYPE html>
<html lang="en">
<head>
${headBlock({ title, description, canonical, ogType: 'website' })}
${jsonLdBlock(jsonLd)}
<style>${SHARED_CSS}</style>
</head>
<body>
<div class="site-header"><a href="${SITE_URL}/">Vitola Pedia</a></div>
<div class="container">

<article class="cigar-card">
  <h1 class="cigar-name">Cigar Encyclopedia Index</h1>
  <div class="cigar-brand">${brands.length} brands · ${topCigars.length} top-rated cigars</div>

  <div class="section">
    <h2>Top ${topCigars.length} Cigars</h2>
    <ul class="cigar-list">
${topLinks}
    </ul>
  </div>

  <div class="section">
    <h2>All Brands (${brands.length})</h2>
    <div class="brand-grid">
      ${brandLinks}
    </div>
  </div>

  <div class="cta-bar">
    <a class="cta-btn" href="${SITE_URL}/">Open Vitola Pedia</a>
  </div>
</article>

<div class="age-notice">⚠️ You must be 21 or older to purchase tobacco products. This site is for informational purposes only.</div>

</div>
</body>
</html>`;
}

/* ── MAIN ───────────────────────────────────────────────────────── */
function main() {
  console.log('Loading cigar data…');
  const cigars = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  console.log(`  ${cigars.length} cigars found.`);

  // Ensure output directories exist
  [OUT_DIR, BRAND_DIR, CIGAR_DIR].forEach(d => {
    if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
  });

  // ── Pick top-N cigars by rating ──
  const topCigars = [...cigars]
    .sort((a, b) => b.rating - a.rating)
    .slice(0, TOP_N);

  // ── Generate top cigar pages ──
  let cigarCount = 0;
  topCigars.forEach(c => {
    const html = buildCigarPage(c);
    const dest = path.join(CIGAR_DIR, c.id + '.html');
    fs.writeFileSync(dest, html, 'utf8');
    cigarCount++;
  });
  console.log(`✓ Generated ${cigarCount} top-${TOP_N} cigar pages in seo-pages/cigars/`);

  // ── Build brand → cigar list map ──
  const brandMap = new Map();
  cigars.forEach(c => {
    if (!brandMap.has(c.brand)) brandMap.set(c.brand, []);
    brandMap.get(c.brand).push(c);
  });

  // ── Generate brand pages ──
  let brandCount = 0;
  brandMap.forEach((list, brand) => {
    const brandSlug = slug(brand);
    const html = buildBrandPage(brand, brandSlug, list);
    const dest = path.join(BRAND_DIR, brandSlug + '.html');
    fs.writeFileSync(dest, html, 'utf8');
    brandCount++;
  });
  console.log(`✓ Generated ${brandCount} brand pages in seo-pages/brands/`);

  // ── Generate index page ──
  const indexHtml = buildIndexPage([...brandMap.keys()], topCigars);
  fs.writeFileSync(path.join(OUT_DIR, 'index.html'), indexHtml, 'utf8');
  console.log(`✓ Generated index.html`);

  // ── Write crawlable URL list for robots/sitemap tooling ──
  const urls = [];
  urls.push(`${SITE_URL}/seo-pages/index.html`);
  brandMap.forEach((_, brand) => {
    urls.push(`${SITE_URL}/seo-pages/brands/${slug(brand)}.html`);
  });
  topCigars.forEach(c => {
    urls.push(`${SITE_URL}/seo-pages/cigars/${c.id}.html`);
  });
  fs.writeFileSync(path.join(OUT_DIR, 'crawlable-urls.txt'), urls.join('\n') + '\n', 'utf8');
  console.log(`✓ Wrote ${urls.length} crawlable URLs to seo-pages/crawlable-urls.txt`);

  const total = cigarCount + brandCount + 1; // +1 for index
  console.log(`\nDone. ${total} pages total (${brandCount} brands + ${cigarCount} cigars + 1 index).`);
}

main();
