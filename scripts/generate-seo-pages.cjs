#!/usr/bin/env node
/* ══════════════════════════════════════════════════════════════════
   VITOLA PEDIA — SEO STATIC PAGE GENERATOR
   ──────────────────────────────────────────────────────────────────
   Generates standalone, indexable HTML pages for every cigar and house
   (brand) so search engines can crawl them without executing JavaScript.

   Output:
     cigars/<id>.html       — 1,458 cigar pages
     houses/<slug>.html     — 134  brand/house pages

   Usage:
     node scripts/generate-seo-pages.js

   NOTE: Re-run this script whenever data/cigars.json changes, then
   commit the regenerated cigars/ and houses/ directories so GitHub
   Pages serves the updated pages.
   ═════════════════════════════════════════════════════════════════ */

'use strict';

const fs   = require('fs');
const path = require('path');

/* ── CONFIG ─────────────────────────────────────────────────────── */
const ROOT      = path.resolve(__dirname, '..');
const DATA_FILE = path.join(ROOT, 'data', 'cigars.json');
const CIGAR_DIR = path.join(ROOT, 'cigars');
const HOUSE_DIR = path.join(ROOT, 'houses');
const SITE_URL  = 'https://vitolapedia.com';
const OG_FALLBACK_IMAGE = SITE_URL + '/og-image.png';

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

/* ── REDIRECT JS ────────────────────────────────────────────────── */
function redirectScript(hashRoute) {
  return `<script>window.location.replace('${SITE_URL}/${hashRoute}');</script>`;
}

/* ── CIGAR PAGE ─────────────────────────────────────────────────── */
function buildCigarPage(c) {
  const canonical  = `${SITE_URL}/cigars/${c.id}.html`;
  const interactiveUrl = `${SITE_URL}/#/cigar/${c.id}`;
  const image      = c.image || OG_FALLBACK_IMAGE;
  const flavors    = (c.flavors || []).join(', ');
  const pairings   = (c.pairings || []).join(', ');
  const description = `${esc(c.name)} by ${esc(c.brand)}. ${strengthWord(c.strength)} ${esc(c.origin)} cigar with ${esc(flavors)} notes. ${c.smokingTime} min smoke. Rated ${c.rating}/100. From $${c.price}.`;

  // JSON-LD: Product + AggregateRating + Review
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
  if (c.yearFounded) jsonLd.brand.foundingDate = String(c.yearFounded);
  if (c.region) jsonLd.brand.foundingLocation = { "@type": "Place", "name": c.region };

  // Flavor tags HTML
  const flavorTagsHtml = (c.flavors || [])
    .map(f => `<span class="flavor-tag">${esc(f)}</span>`)
    .join('');

  // Pairing tags HTML
  const pairingTagsHtml = (c.pairings || [])
    .map(p => `<span class="pairing-tag">${esc(p)}</span>`)
    .join('');

  // Buy links HTML
  let buyLinksHtml = '';
  if (c.buyLinks && c.buyLinks.length) {
    buyLinksHtml = c.buyLinks.map(bl => {
      const priceStr = (bl.price != null) ? ` — $${bl.price}` : '';
      return `<a class="buy-link" href="${esc(bl.url)}" rel="nofollow noopener" target="_blank">${esc(bl.retailer)}${priceStr}</a>`;
    }).join('\n');
  }

  // Strength bar
  const strengthPct = (parseInt(c.strength, 10) / 5) * 100;
  const strengthColor = ['#7fc99e','#b5c97a','#e0b84a','#e07b3a','#d04040'][parseInt(c.strength,10)-1] || '#e0b84a';

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(c.name)} — Review, Flavors &amp; Stats | Vitola Pedia</title>
<meta name="description" content="${description}">
<link rel="canonical" href="${canonical}">
<meta name="robots" content="index, follow">
<meta name="theme-color" content="#1a1209">
<meta property="og:type" content="article">
<meta property="og:url" content="${canonical}">
<meta property="og:title" content="${esc(c.name)} — Review, Flavors &amp; Stats | Vitola Pedia">
<meta property="og:description" content="${description}">
<meta property="og:image" content="${esc(image)}">
<meta property="og:site_name" content="Vitola Pedia">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(c.name)} — Review, Flavors &amp; Stats | Vitola Pedia">
<meta name="twitter:description" content="${description}">
<meta name="twitter:image" content="${esc(image)}">
<link rel="icon" type="image/svg+xml" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='6' fill='%231a1209'/%3E%3Crect x='4' y='14' width='20' height='5' rx='2.5' fill='%23c9943a'/%3E%3C/svg%3E">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;600;700&family=Inter:wght@300;400;500;600&family=Crimson+Text:wght@400;600&display=swap" rel="stylesheet">
<script type="application/ld+json">
${JSON.stringify(jsonLd, null, 2)}
</script>
<style>${SHARED_CSS}</style>
</head>
<body>
<div class="site-header"><a href="${SITE_URL}/">Vitola Pedia</a></div>
<div class="container">

<article class="cigar-card">
  <h1 class="cigar-name">${esc(c.name)}</h1>
  <div class="cigar-brand"><a href="${SITE_URL}/houses/${slug(c.brand)}.html">${esc(c.brand)}</a> · ${esc(c.origin)}${c.region ? ' · ' + esc(c.region) : ''}</div>

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
    <a class="cta-btn secondary" href="${SITE_URL}/houses/${slug(c.brand)}.html">${esc(c.brand)} Cigars</a>
  </div>
</article>

<div class="age-notice">⚠️ You must be 21 or older to purchase tobacco products. This site is for informational purposes only.</div>

</div>
<noscript><p>This page is part of the <a href="${SITE_URL}/">Vitola Pedia</a> cigar encyclopedia. Visit the <a href="${interactiveUrl}">interactive ${esc(c.name)} page</a> for the full experience.</p></noscript>
${redirectScript('#/cigar/' + c.id)}
</body>
</html>`;
}

/* ── HOUSE PAGE ────────────────────────────────────────────────── */
function buildHousePage(brand, brandSlug, cigarList) {
  const canonical      = `${SITE_URL}/houses/${brandSlug}.html`;
  const interactiveUrl = `${SITE_URL}/#/house/${brandSlug}`;
  const count           = cigarList.length;
  const origins         = [...new Set(cigarList.map(c => c.origin))].join(', ');
  const avgRating       = (cigarList.reduce((a, c) => a + c.rating, 0) / count).toFixed(1);
  const prices          = cigarList.map(c => c.price).sort((a, b) => a - b);
  const priceMin        = prices[0];
  const priceMax        = prices[prices.length - 1];
  const description     = `${esc(brand)} cigars from ${esc(origins)}. ${count} cigars in the encyclopedia. Browse the full range, reviews, and flavor profiles. Average rating ${avgRating}/100. Prices from $${priceMin} to $${priceMax}.`;

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
    "description": `${brand} cigars from ${origins}. ${count} cigars in the Vitola Pedia encyclopedia.`,
  };
  if (cigarList[0] && cigarList[0].image) jsonLd.logo = cigarList[0].image;

  // Cigar list HTML (sorted by rating desc)
  const sortedCigars = [...cigarList].sort((a, b) => b.rating - a.rating);
  const cigarListHtml = sortedCigars.map((c, i) =>
    `    <li><a href="${SITE_URL}/cigars/${c.id}.html">${esc(c.name)}</a><span class="rating">${c.rating}/100</span></li>`
  ).join('\n');

  // Founded year
  const years = cigarList.map(c => c.yearFounded).filter(Boolean);
  const founded = years.length ? Math.min(...years) : null;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(brand)} Cigars — History, Lines &amp; Reviews | Vitola Pedia</title>
<meta name="description" content="${description}">
<link rel="canonical" href="${canonical}">
<meta name="robots" content="index, follow">
<meta name="theme-color" content="#1a1209">
<meta property="og:type" content="website">
<meta property="og:url" content="${canonical}">
<meta property="og:title" content="${esc(brand)} Cigars — History, Lines &amp; Reviews | Vitola Pedia">
<meta property="og:description" content="${description}">
<meta property="og:site_name" content="Vitola Pedia">
<meta name="twitter:card" content="summary">
<meta name="twitter:title" content="${esc(brand)} Cigars | Vitola Pedia">
<meta name="twitter:description" content="${description}">
<link rel="icon" type="image/svg+xml" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='6' fill='%231a1209'/%3E%3Crect x='4' y='14' width='20' height='5' rx='2.5' fill='%23c9943a'/%3E%3C/svg%3E">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;600;700&family=Inter:wght@300;400;500;600&family=Crimson+Text:wght@400;600&display=swap" rel="stylesheet">
<script type="application/ld+json">
${JSON.stringify(jsonLd, null, 2)}
</script>
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
${redirectScript('#/house/' + brandSlug)}
</body>
</html>`;
}

/* ── MAIN ───────────────────────────────────────────────────────── */
function main() {
  console.log('Loading cigar data…');
  const cigars = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  console.log(`  ${cigars.length} cigars found.`);

  // Ensure output directories exist
  if (!fs.existsSync(CIGAR_DIR)) fs.mkdirSync(CIGAR_DIR, { recursive: true });
  if (!fs.existsSync(HOUSE_DIR)) fs.mkdirSync(HOUSE_DIR, { recursive: true });

  // ── Generate cigar pages ──
  let cigarCount = 0;
  cigars.forEach(c => {
    const html = buildCigarPage(c);
    const dest = path.join(CIGAR_DIR, c.id + '.html');
    fs.writeFileSync(dest, html, 'utf8');
    cigarCount++;
  });
  console.log(`✓ Generated ${cigarCount} cigar pages in cigars/`);

  // ── Build brand → cigar list map ──
  const brandMap = new Map();
  cigars.forEach(c => {
    if (!brandMap.has(c.brand)) brandMap.set(c.brand, []);
    brandMap.get(c.brand).push(c);
  });

  // ── Generate house pages ──
  let houseCount = 0;
  brandMap.forEach((list, brand) => {
    const brandSlug = slug(brand);
    const html = buildHousePage(brand, brandSlug, list);
    const dest = path.join(HOUSE_DIR, brandSlug + '.html');
    fs.writeFileSync(dest, html, 'utf8');
    houseCount++;
  });
  console.log(`✓ Generated ${houseCount} house pages in houses/`);

  console.log('\nDone. Don\'t forget to regenerate these pages when data/cigars.json changes.');
}

main();
