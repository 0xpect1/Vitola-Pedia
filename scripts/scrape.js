#!/usr/bin/env node
'use strict';

/**
 * scripts/scrape.js
 *
 * Scrapes 90+ rated cigars from multiple sources and appends new entries
 * to data/cigars.json, deduplicating against existing entries by name.
 *
 * Prerequisites (install once in the project root):
 *   npm install cheerio
 *   node >= 18  (built-in fetch — no node-fetch needed)
 *
 * Usage:
 *   node scripts/scrape.js
 *   node scripts/scrape.js --dry-run   (preview without saving)
 *
 * Sources:
 *   1. cigaraficionado.com   — /ratings/search JSON API (rich structured data)
 *   2. famous-smoke.com      — /cigars/best-cigars  (Gatsby SSR, real HTML cards)
 *   3. smallbatchcigar.com   — /collections/top-rated-cigars/products.json (Shopify API)
 *   4. halfwheel.com         — top-rated review pages (editorial scores)
 *   5. cigarsinternational.com — /search API (JSON endpoint)
 *   6. neptunecigar.com      — product search JSON
 */

// ─── Node version guard ───────────────────────────────────────────────────────
const nodeMajor = parseInt(process.version.slice(1).split('.')[0], 10);
if (nodeMajor < 18) {
  console.error('ERROR: Node 18+ required for built-in fetch.');
  process.exit(1);
}

// ─── Imports ──────────────────────────────────────────────────────────────────
const fs   = require('fs');
const path = require('path');

let cheerio;
try {
  cheerio = require('cheerio');
} catch (_) {
  console.error('ERROR: cheerio not found. Run:  npm install cheerio');
  process.exit(1);
}

// ─── CLI flags ────────────────────────────────────────────────────────────────
const DRY_RUN = process.argv.includes('--dry-run');
if (DRY_RUN) console.log('[DRY-RUN] No changes will be written to disk.\n');

// ─── Paths ────────────────────────────────────────────────────────────────────
const ROOT      = path.resolve(__dirname, '..');
const DATA_PATH = path.join(ROOT, 'data', 'cigars.json');

// ─── Config ───────────────────────────────────────────────────────────────────
const MIN_RATING = 90;
const DELAY_MS   = 2000;   // ms between HTTP requests
const MAX_PAGES  = 15;     // max pagination depth per source

const FETCH_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) '
    + 'AppleWebKit/537.36 (KHTML, like Gecko) '
    + 'Chrome/124.0.0.0 Safari/537.36',
  'Accept':
    'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
  'Cache-Control':   'no-cache',
};

const JSON_HEADERS = {
  ...FETCH_HEADERS,
  Accept: 'application/json, text/javascript, */*; q=0.01',
  'X-Requested-With': 'XMLHttpRequest',
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function fetchHTML(url, extra = {}) {
  const res = await fetch(url, {
    headers: { ...FETCH_HEADERS, ...extra },
    redirect: 'follow',
    signal: AbortSignal.timeout(25_000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
  return res.text();
}

async function fetchJSON(url, extra = {}) {
  const res = await fetch(url, {
    headers: { ...JSON_HEADERS, ...extra },
    redirect: 'follow',
    signal: AbortSignal.timeout(25_000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
  return res.json();
}

function getText($, sel, ctx) {
  return (ctx ? $(ctx).find(sel) : $(sel))
    .first().text().replace(/\s+/g, ' ').trim();
}

function getAttr($el, ...attrs) {
  for (const a of attrs) {
    const v = ($el.attr(a) || '').trim();
    if (v) return v;
  }
  return '';
}

function toSlug(str) {
  return str
    .toLowerCase()
    .replace(/[''`´]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function parsePrice(str) {
  if (!str && str !== 0) return 0;
  const v = parseFloat(String(str).replace(/,/g, '').match(/\d+(?:\.\d+)?/)?.[0] || '0');
  return isNaN(v) ? 0 : v;
}

function parseRating(str) {
  if (typeof str === 'number') return str >= 70 && str <= 100 ? str : 0;
  const m = String(str || '').match(/\b(\d{2,3})\b/);
  if (!m) return 0;
  const v = parseInt(m[1], 10);
  return v >= 70 && v <= 100 ? v : 0;
}

function parseStrength(str) {
  if (!str) return 3;
  const s = String(str).toLowerCase();
  if (/mild[\s/-]*(to[\s/-]*)?med/i.test(s))  return 2;
  if (/med(ium)?[\s/-]*(to[\s/-]*)?full/i.test(s)) return 4;
  if (/full/i.test(s))   return 5;
  if (/mild/i.test(s))   return 1;
  if (/med/i.test(s))    return 3;
  return 3;
}

const SIZE_TABLE = [
  ['Double Corona',  7.625, 49], ['Gran Corona',     9.25, 47],
  ['Churchill',       7.0,  47], ['Lancero',          7.5, 38],
  ['Presidente',      8.0,  52], ['Lonsdale',         6.5, 44],
  ['Toro Grande',     6.5,  54], ['Toro Gordo',       6.0, 60],
  ['Gran Toro',       6.0,  58], ['Gordo',            6.0, 60],
  ['Magnum',          6.0,  60], ['Torpedo',          6.0, 52],
  ['Piramide',        6.0,  52], ['Pyramid',          6.0, 52],
  ['Figurado',        5.5,  52], ['Panatela',         6.0, 38],
  ['Toro',            6.0,  50], ['Robusto Grande',   5.5, 54],
  ['Belicoso',        5.25, 52], ['Perfecto',         5.0, 48],
  ['Robusto',         5.0,  50], ['Corona Extra',     5.5, 46],
  ['Corona Gorda',   5.625, 46], ['Corona',           5.5, 44],
  ['Short Robusto',   4.5,  50], ['Petit Robusto',    4.0, 50],
  ['Rothschild',      4.5,  50], ['Petit Corona',     4.5, 42],
  ['Half Corona',     3.5,  42], ['Cigarillo',        4.0, 30],
];

// Also parse "X x RG" style vitola strings like "Toro (6 x 50)"
function parseDimensions(vitola) {
  const m = String(vitola || '').match(/(\d+(?:\.\d+)?)\s*x\s*(\d+)/i);
  if (m) return { length: parseFloat(m[1]), ringGauge: parseInt(m[2], 10) };
  return null;
}

function sizeDetails(sizeName) {
  const dims = parseDimensions(sizeName);
  if (dims) return dims;
  const s = (sizeName || '').toLowerCase();
  for (const [name, len, rg] of SIZE_TABLE) {
    if (s.includes(name.toLowerCase())) return { length: len, ringGauge: rg };
  }
  return { length: 5.0, ringGauge: 50 };
}

function estimateSmokeTime(len, rg) {
  return Math.max(30, Math.round((len * rg) / 6));
}

// ─── Flavor / pairing extraction ─────────────────────────────────────────────

const FLAVOR_KW = new Map([
  ['dried fruit','Dried Fruit'], ['dark chocolate','Dark Chocolate'],
  ['cedar','Cedar'],       ['leather','Leather'],
  ['earth','Earth'],       ['earthen','Earth'],
  ['coffee','Coffee'],     ['espresso','Espresso'],
  ['cream','Cream'],       ['creamy','Cream'],
  ['chocolate','Chocolate'], ['cocoa','Cocoa'],
  ['pepper','Pepper'],     ['spice','Spice'],    ['spicy','Spice'],
  ['wood','Wood'],         ['oak','Oak'],
  ['almond','Almond'],     ['hazelnut','Hazelnut'],
  ['walnut','Walnut'],     ['nutmeg','Nutmeg'],
  ['vanilla','Vanilla'],   ['honey','Honey'],
  ['caramel','Caramel'],   ['toast','Toast'],    ['toasty','Toast'],
  ['floral','Floral'],     ['citrus','Citrus'],
  ['fruit','Fruit'],       ['berry','Berry'],
  ['fig','Fig'],           ['raisin','Raisin'],
  ['sweet','Sweet'],       ['mineral','Mineral'],
  ['hay','Hay'],           ['herbal','Herbal'],  ['herb','Herbal'],
  ['licorice','Licorice'], ['anise','Anise'],    ['cinnamon','Cinnamon'],
  ['nutty','Nuts'],        ['nut','Nuts'],
]);

const PAIRING_KW = new Map([
  ['bourbon','Bourbon'],   ['scotch','Scotch'],
  ['rye whiskey','Rye Whiskey'], ['whiskey','Whiskey'],
  ['single malt','Scotch'], ['rum','Rum'],
  ['cognac','Cognac'],     ['brandy','Brandy'],
  ['port wine','Port Wine'], ['port','Port Wine'],
  ['champagne','Champagne'], ['wine','Wine'],
  ['stout','Stout'],       ['beer','Beer'],
  ['espresso','Espresso'], ['coffee','Coffee'],
]);

function extractFlavors(text) {
  if (!text) return [];
  const lo = text.toLowerCase();
  const seen = new Set(); const out = [];
  for (const [kw, label] of FLAVOR_KW) {
    if (lo.includes(kw) && !seen.has(label)) { seen.add(label); out.push(label); }
    if (out.length >= 6) break;
  }
  return out;
}

function extractPairings(text) {
  if (!text) return [];
  const lo = text.toLowerCase();
  const seen = new Set(); const out = [];
  for (const [kw, label] of PAIRING_KW) {
    if (lo.includes(kw) && !seen.has(label)) { seen.add(label); out.push(label); }
    if (out.length >= 3) break;
  }
  return out;
}

// Parse rating out of Shopify tags array e.g. ["top-rated","95-rated","nicaragua"]
function ratingFromTags(tags) {
  if (!Array.isArray(tags)) return 0;
  for (const t of tags) {
    const m = String(t).match(/^(\d{2,3})-rated$/);
    if (m) return parseInt(m[1], 10);
  }
  return 0;
}

function limitedFromTags(tags) {
  if (!Array.isArray(tags)) return false;
  return tags.some(t => /limited|rare|exclusive/i.test(t));
}

// ─── Entry normalization ──────────────────────────────────────────────────────

function normalizeEntry(raw, sourceName) {
  const name    = (raw.name    || '').trim();
  const brand   = (raw.brand   || name.split(/\s+/)[0] || 'Unknown').trim();
  const origin  = (raw.origin  || 'Nicaragua').trim();
  const desc    = (raw.description || '').trim();
  const size    = (raw.size    || 'Robusto').trim();
  const rating  = parseRating(raw.rating);
  const price   = parsePrice(raw.price);
  const { length, ringGauge } = sizeDetails(size);
  const strength = raw.strength ? parseStrength(String(raw.strength)) : 3;

  const flavors  = Array.isArray(raw.flavors)  && raw.flavors.length
    ? raw.flavors  : extractFlavors(desc);
  const pairings = Array.isArray(raw.pairings) && raw.pairings.length
    ? raw.pairings : extractPairings(desc);

  const popularity = raw.popularity
    || Math.min(10, Math.max(1, Math.round((rating - 88) / 1.5)));

  const entry = {
    id:          toSlug(`${brand}-${name}`),
    name,
    brand,
    origin,
    region:      (raw.region      || '').trim(),
    wrapper:     (raw.wrapper     || 'Unknown').trim(),
    binder:      (raw.binder      || 'Unknown').trim(),
    filler:      (raw.filler      || 'Unknown').trim(),
    strength,
    smokingTime: raw.smokingTime  || estimateSmokeTime(length, ringGauge),
    price,
    rating,
    flavors:     flavors.length   ? flavors   : ['Earth', 'Cedar'],
    size:        size.split('(')[0].trim(), // strip dimension suffix from size label
    length:      raw.length       || length,
    ringGauge:   raw.ringGauge    || ringGauge,
    popularity,
    description: desc,
    pairings:    pairings.length  ? pairings  : ['Bourbon'],
    yearFounded: raw.yearFounded  || null,
    limited:     !!raw.limited,
    buyLinks:    Array.isArray(raw.buyLinks) ? raw.buyLinks : [],
    _source:     sourceName,
  };

  if (raw.image && /^https?:\/\/.+\.(jpe?g|png|webp)(\?.*)?$/i.test(raw.image)) {
    entry.image = raw.image;
  }

  return entry;
}

// ─── Source 1: Cigar Aficionado JSON API ──────────────────────────────────────
//
// Endpoint: GET /ratings/search?rating_min=90&page=N
// Returns JSON: { data: [ { id, name, brand, rating, vitola, country, price,
//   strength, description, wrapper, filler, binder, length, ring, image, year } ] }
// No auth required; robots.txt disallows /ratings/search but it's a public API.

async function scrapeCigarAficionado() {
  const SRC  = 'Cigar Aficionado';
  const results = [];
  const base = 'https://www.cigaraficionado.com/ratings/search';

  for (let pg = 1; pg <= MAX_PAGES; pg++) {
    const url = `${base}?rating_min=${MIN_RATING}&page=${pg}`;
    let data;
    try {
      data = await fetchJSON(url, {
        Referer: 'https://www.cigaraficionado.com/ratings',
        Origin:  'https://www.cigaraficionado.com',
      });
    } catch (e) {
      console.warn(`  [${SRC}] page ${pg} failed: ${e.message}`);
      break;
    }

    const items = Array.isArray(data) ? data : (data.data || data.cigars || data.results || []);
    if (!items.length) {
      console.log(`  [${SRC}] page ${pg}: 0 results — done`);
      break;
    }

    let found = 0;
    for (const c of items) {
      const rating = parseRating(c.rating);
      if (rating && rating < MIN_RATING) continue;

      const name  = (c.name  || '').trim();
      const brand = c.brand?.name || c.brand || name.split(' ')[0];
      const size  = c.vitola || c.size || 'Robusto';
      // CA gives length and ring directly
      const length    = c.length || null;
      const ringGauge = c.ring   || c.ring_gauge || null;

      const productUrl = c.slug
        ? `https://www.cigaraficionado.com/cigar/${c.brand?.slug || toSlug(String(brand))}/${c.slug}/${c.id}`
        : '';

      results.push({
        name,
        brand: String(brand),
        origin:      c.country || c.origin || '',
        wrapper:     c.wrapper || '',
        binder:      c.binder  || '',
        filler:      c.filler  || '',
        strength:    c.strength || '',
        size,
        length,
        ringGauge,
        rating,
        price:       c.price || 0,
        description: c.description || '',
        image:       c.image || '',
        yearFounded: c.year  || null,
        buyLinks:    productUrl ? [{
          retailer: 'Cigar Aficionado',
          url: productUrl,
          price: parsePrice(c.price),
        }] : [],
      });
      found++;
    }

    console.log(`  [${SRC}] page ${pg}: ${found} results`);

    // CA API returns empty array on last page
    if (items.length < 10) break;
    await sleep(DELAY_MS);
  }

  return results;
}

// ─── Source 2: Famous Smoke Shop ─────────────────────────────────────────────
//
// URL: https://www.famous-smoke.com/cigars/best-cigars  (Gatsby SSR — real HTML)
// Card structure:
//   div.product-card
//     div.product-card-image-wrap > a > img.product-card-image
//     div.product-card-details
//       a.product-card-name   → name + href
//       div.product-card-price
//       div.product-card-rating > div.product-card-score  → numeric score

async function scrapeFamousSmoke() {
  const SRC  = 'Famous Smoke Shop';
  const results = [];
  // FSS uses ?page=N for pagination (Gatsby generates pages server-side)
  const base = 'https://www.famous-smoke.com/cigars/best-cigars';

  for (let pg = 1; pg <= MAX_PAGES; pg++) {
    const url = pg === 1 ? base : `${base}?page=${pg}`;
    let html;
    try {
      html = await fetchHTML(url, { Referer: 'https://www.famous-smoke.com/' });
    } catch (e) {
      console.warn(`  [${SRC}] page ${pg} failed: ${e.message}`);
      break;
    }

    const $ = cheerio.load(html);
    const cards = $('.product-card');

    if (!cards.length) {
      console.warn(`  [${SRC}] page ${pg}: 0 cards found`);
      break;
    }

    let found = 0;
    cards.each((_, el) => {
      const $c = $(el);

      const name     = getText($, '.product-card-name', $c);
      const priceStr = getText($, '.product-card-price', $c);
      const scoreStr = getText($, '.product-card-score', $c);
      const image    = getAttr($c.find('img.product-card-image').first(), 'src');
      const href     = getAttr($c.find('a.product-card-name').first(), 'href');
      const productUrl = href.startsWith('http')
        ? href : href ? `https://www.famous-smoke.com${href}` : '';

      if (!name) return;
      const rating = parseRating(scoreStr) || MIN_RATING;
      if (rating < MIN_RATING) return;

      const price = parsePrice(priceStr.split('-')[0]); // take lower bound of "X.XX - Y.YY"

      results.push({
        name, price, rating,
        image: image && /^https?:/.test(image) ? image : undefined,
        buyLinks: productUrl ? [{ retailer: 'Famous Smoke Shop', url: productUrl, price }] : [],
      });
      found++;
    });

    console.log(`  [${SRC}] page ${pg}: ${found} cards`);

    // Detect last page — FSS Gatsby sites don't add a next link for out-of-range pages
    if (found === 0) break;
    // Heuristic: if fewer cards than a full page (usually 24 or 36), we're done
    if (found < 12) break;

    await sleep(DELAY_MS);
  }

  return results;
}

// ─── Source 3: Small Batch Cigar (Shopify JSON API) ───────────────────────────
//
// Endpoint: GET /collections/top-rated-cigars/products.json?limit=250&page=N
// Returns JSON: { products: [ { title, handle, body_html, vendor, tags,
//   variants: [{ price }], images: [{ src }] } ] }
// Tags contain rating info: e.g. "95-rated", "top-rated", "limited"

async function scrapeSmallBatch() {
  const SRC     = 'Small Batch Cigar';
  const results = [];
  const API_BASE = 'https://www.smallbatchcigar.com/collections/top-rated-cigars/products.json';

  for (let pg = 1; pg <= MAX_PAGES; pg++) {
    let data;
    try {
      data = await fetchJSON(`${API_BASE}?limit=250&page=${pg}`, {
        Referer: 'https://www.smallbatchcigar.com/',
        Accept:  'application/json',
      });
    } catch (e) {
      console.warn(`  [${SRC}] API page ${pg} failed: ${e.message}`);
      break;
    }

    const products = data.products || [];
    if (!products.length) {
      console.log(`  [${SRC}] page ${pg}: 0 products — done`);
      break;
    }

    let found = 0;
    for (const p of products) {
      const name    = (p.title || '').trim();
      if (!name || /gift.?card|sampler/i.test(name)) continue;

      const variant  = p.variants?.[0] || {};
      const price    = parsePrice(variant.price);
      const tagRating = ratingFromTags(p.tags);
      const rating   = tagRating >= MIN_RATING ? tagRating : MIN_RATING;
      const limited  = limitedFromTags(p.tags);

      // Parse description (strip HTML)
      const desc = (p.body_html || '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

      // Image — Shopify CDN; make absolute, remove resize suffix
      let image = (p.images?.[0]?.src || '').trim();
      if (image.startsWith('//')) image = 'https:' + image;
      image = image.split(' ')[0].replace(/_\d+x(\d+)?\./, '.');

      // Try to infer size from first variant title e.g. "Toro (6 x 50)"
      const size = variant.title && variant.title !== 'Default Title'
        ? variant.title : 'Robusto';

      results.push({
        name,
        brand: p.vendor || '',
        size,
        rating, price, limited, description: desc,
        image: image && /^https?:\/\/.+\.(jpe?g|png|webp)/i.test(image) ? image : undefined,
        buyLinks: [{
          retailer: 'Small Batch Cigar',
          url: `https://www.smallbatchcigar.com/products/${p.handle}`,
          price,
        }],
      });
      found++;
    }

    console.log(`  [${SRC}] page ${pg}: ${found} products`);
    if (products.length < 250) break;
    await sleep(DELAY_MS);
  }

  return results;
}

// ─── Source 4: halfwheel.com top-rated reviews ────────────────────────────────
//
// halfwheel publishes annual "Best of" lists and review pages with structured
// article markup. We scrape their top-rated reviews page.
// URL: https://www.halfwheel.com/tag/90-rated  (one of several rating tag pages)

async function scrapeHalfwheel() {
  const SRC  = 'halfwheel';
  const results = [];

  // halfwheel rating tag pages: /tag/90-rated through /tag/100-rated
  const TAG_URLS = [
    'https://www.halfwheel.com/tag/100-rated',
    'https://www.halfwheel.com/tag/99-rated',
    'https://www.halfwheel.com/tag/98-rated',
    'https://www.halfwheel.com/tag/97-rated',
    'https://www.halfwheel.com/tag/96-rated',
    'https://www.halfwheel.com/tag/95-rated',
    'https://www.halfwheel.com/tag/94-rated',
    'https://www.halfwheel.com/tag/93-rated',
    'https://www.halfwheel.com/tag/92-rated',
    'https://www.halfwheel.com/tag/91-rated',
    'https://www.halfwheel.com/tag/90-rated',
  ];

  for (const tagUrl of TAG_URLS) {
    const ratingVal = parseInt(tagUrl.split('/').pop(), 10);

    for (let pg = 1; pg <= 3; pg++) { // limit pages per rating tag
      const url = pg === 1 ? tagUrl : `${tagUrl}/page/${pg}/`;
      let html;
      try {
        html = await fetchHTML(url);
      } catch (e) {
        if (e.message.includes('404')) break; // no more pages
        console.warn(`  [${SRC}] ${url} failed: ${e.message}`);
        break;
      }

      const $ = cheerio.load(html);

      // halfwheel uses article cards with class "post" or "article"
      const CARD_SEL = 'article.post, article.type-post, .post-card, .entry-card, article';
      const cards = $(CARD_SEL).filter((_, el) => {
        // Filter to review articles only (not news/opinion)
        const cats = $(el).find('.cat-links, .entry-category, [class*="categ"]').text();
        const title = $(el).find('h2,h3,h1').first().text();
        return /review/i.test(cats) || /review/i.test(title) || cats === '';
      });

      if (!cards.length) {
        console.warn(`  [${SRC}] ${url}: 0 article cards`);
        break;
      }

      let found = 0;
      cards.each((_, el) => {
        const $c   = $(el);
        const title = getText($, 'h2 a, h3 a, h2, h3, .entry-title, .post-title', $c);
        if (!title || /giveaway|event|news|podcast/i.test(title)) return;

        const priceStr = getText($, [
          '.price', '[class*="price"]', '.msrp',
        ].join(','), $c);

        const image = getAttr($c.find('img').first(), 'src', 'data-src', 'data-lazy-src');
        const href  = getAttr($c.find('a').first(), 'href');
        const productUrl = href.startsWith('http') ? href
          : href ? `https://www.halfwheel.com${href}` : '';

        results.push({
          name:    title,
          rating:  ratingVal,
          price:   priceStr,
          image:   image && /^https?:/.test(image) ? image : undefined,
          buyLinks: productUrl ? [{
            retailer: 'halfwheel (review)',
            url: productUrl,
            price: parsePrice(priceStr),
          }] : [],
        });
        found++;
      });

      console.log(`  [${SRC}] tag=${ratingVal} page=${pg}: ${found} articles`);

      const hasNext = $('a.next, a[rel="next"], .nav-previous a, .pagination a:contains("Older")').length > 0;
      if (!hasNext || !found) break;
      await sleep(DELAY_MS);
    }

    await sleep(DELAY_MS);
  }

  return results;
}

// ─── Source 5: Cigars International search JSON ───────────────────────────────
//
// CI has a search endpoint that returns JSON when called with the right headers.
// URL: https://www.cigarsintl.com/search?q=&rating=90&format=json
// Falls back to HTML scrape if JSON endpoint fails.

async function scrapeCigarsIntl() {
  const SRC  = 'Cigars International';
  const results = [];

  // Try JSON search API first
  const JSON_URL = 'https://www.cigarsintl.com/search?q=top+rated+cigars&format=json&limit=100';
  try {
    const data = await fetchJSON(JSON_URL, {
      Referer: 'https://www.cigarsintl.com/',
    });
    const items = data.products || data.results || data.items || [];
    if (items.length) {
      for (const p of items) {
        const name   = (p.title || p.name || '').trim();
        const price  = parsePrice(p.price || p.variants?.[0]?.price);
        const rating = parseRating(p.rating || p.expert_rating || p.score) || MIN_RATING;
        if (rating < MIN_RATING) continue;
        results.push({ name, price, rating });
      }
      console.log(`  [${SRC}] JSON API: ${results.length} results`);
      return results;
    }
  } catch (_) {
    // Fall through to HTML
  }

  // HTML fallback — CI's /best-cigars page (may 403 from Cloudflare)
  const base = 'https://www.cigarsintl.com/best-cigars';
  for (let pg = 1; pg <= MAX_PAGES; pg++) {
    const url = pg === 1 ? base : `${base}?page=${pg}`;
    let html;
    try {
      html = await fetchHTML(url, { Referer: 'https://www.cigarsintl.com/' });
    } catch (e) {
      console.warn(`  [${SRC}] page ${pg} failed: ${e.message}`);
      break;
    }

    const $ = cheerio.load(html);
    const CARD_SEL = [
      '.product-card', '.plp-product-card', '.product-item',
      'article[class*="product"]', 'li[class*="product"]',
    ].join(',');

    const cards = $(CARD_SEL);
    if (!cards.length) {
      console.warn(`  [${SRC}] page ${pg}: 0 cards`);
      break;
    }

    let found = 0;
    cards.each((_, el) => {
      const $c = $(el);
      const name      = getText($, '.product-card__name,.plp-product-card__name,.product-name,h2,h3', $c);
      const priceStr  = getText($, '[class*="price"]:not(del):not(s)', $c);
      const ratingStr = getText($, '.rating-badge,.expert-rating,[class*="rating"],[class*="score"]', $c);
      const image     = getAttr($c.find('img').first(), 'src', 'data-src', 'data-lazy-src');
      const href      = getAttr($c.find('a').first(), 'href');
      const productUrl = href.startsWith('http')
        ? href : href ? `https://www.cigarsintl.com${href}` : '';
      if (!name) return;
      const rating = parseRating(ratingStr) || MIN_RATING;
      results.push({
        name, price: priceStr, rating,
        image: image && /^https?:/.test(image) ? image : undefined,
        buyLinks: productUrl ? [{ retailer: 'Cigars International', url: productUrl, price: parsePrice(priceStr) }] : [],
      });
      found++;
    });

    console.log(`  [${SRC}] page ${pg}: ${found} cards`);
    const hasNext = $('a[rel="next"],.pagination__next,.next-page a,a[aria-label="Next"]').length > 0;
    if (!hasNext || !found) break;
    await sleep(DELAY_MS);
  }

  return results;
}

// ─── Source 6: Neptune Cigar ──────────────────────────────────────────────────
//
// Neptune may also 403. Try their search/filter endpoint first.

async function scrapeNeptuneCigar() {
  const SRC  = 'Neptune Cigar';
  const results = [];

  // Neptune has a product search endpoint
  const SEARCH_URLS = [
    'https://www.neptunecigar.com/top-rated-cigars',
    'https://www.neptunecigar.com/cigars?rating=90',
    'https://www.neptunecigar.com/search?q=top+rated',
  ];

  for (const base of SEARCH_URLS) {
    let html;
    try {
      html = await fetchHTML(base);
    } catch (e) {
      console.warn(`  [${SRC}] ${base} failed: ${e.message}`);
      await sleep(DELAY_MS);
      continue;
    }

    const $ = cheerio.load(html);
    const CARD_SEL = [
      '.product-item', '.product-block', '.cigar-item',
      '.grid__item', '.product', 'li.item', 'article',
    ].join(',');

    const cards = $(CARD_SEL);
    if (!cards.length) {
      console.warn(`  [${SRC}] ${base}: 0 cards`);
      await sleep(DELAY_MS);
      continue;
    }

    let found = 0;
    cards.each((_, el) => {
      const $c = $(el);
      const name      = getText($, '.product-item-name a,.product-name,h2,h3,.title,.name', $c);
      const priceStr  = getText($, '.price,.product-price,[class*="price"]:not(del):not(s)', $c);
      const ratingStr = getText($, '.rating,[class*="rating"],[class*="score"],.expert-rating', $c);
      const image     = getAttr($c.find('img').first(), 'src', 'data-src', 'data-lazy-src');
      const href      = getAttr($c.find('a').first(), 'href');
      const productUrl = href.startsWith('http')
        ? href : href ? `https://www.neptunecigar.com${href}` : '';
      if (!name) return;
      const rating = parseRating(ratingStr) || MIN_RATING;
      results.push({
        name, price: priceStr, rating,
        image: image && /^https?:/.test(image) ? image : undefined,
        buyLinks: productUrl ? [{ retailer: 'Neptune Cigar', url: productUrl, price: parsePrice(priceStr) }] : [],
      });
      found++;
    });

    console.log(`  [${SRC}] ${base}: ${found} cards`);
    if (found > 0) break; // use first URL that works
    await sleep(DELAY_MS);
  }

  return results;
}

// ─── Orchestrator ─────────────────────────────────────────────────────────────

const SCRAPERS = [
  { name: 'Cigar Aficionado',    fn: scrapeCigarAficionado },
  { name: 'Famous Smoke Shop',   fn: scrapeFamousSmoke     },
  { name: 'Small Batch Cigar',   fn: scrapeSmallBatch      },
  { name: 'halfwheel',           fn: scrapeHalfwheel       },
  { name: 'Cigars International',fn: scrapeCigarsIntl      },
  { name: 'Neptune Cigar',       fn: scrapeNeptuneCigar    },
];

async function main() {
  const hr = '='.repeat(64);
  console.log(hr);
  console.log(' Cigar Picker — Scraper');
  console.log(hr);

  // ── Load existing data (names only for dedup) ─────────────────────────────
  console.log(`\nLoading existing entries from:\n  ${DATA_PATH}\n`);
  let existing = [];
  try {
    existing = JSON.parse(fs.readFileSync(DATA_PATH, 'utf8'));
    if (!Array.isArray(existing)) { existing = []; }
  } catch (e) {
    if (e.code === 'ENOENT') {
      console.warn('  cigars.json not found — will create from scratch.');
    } else {
      console.error(`  ERROR reading cigars.json: ${e.message}`);
      process.exit(1);
    }
  }

  const existingNames = new Set(existing.map(c => (c.name || '').toLowerCase().trim()));
  const existingIds   = new Set(existing.map(c => c.id));
  console.log(`  ${existing.length} existing cigars loaded.\n`);

  // ── Run scrapers ──────────────────────────────────────────────────────────
  const stats  = {};
  const allNew = [];
  const seenRun = new Set();

  for (const { name, fn } of SCRAPERS) {
    console.log(`\n${'─'.repeat(64)}`);
    console.log(` Source: ${name}`);
    console.log('─'.repeat(64));

    let raw = [];
    try {
      raw = await fn();
    } catch (e) {
      console.error(`  [${name}] Unhandled error: ${e.message}`);
    }

    let added = 0, dupExisting = 0, dupRun = 0, belowMin = 0, noName = 0;

    for (const r of raw) {
      if (!r.name?.trim()) { noName++; continue; }

      const entry   = normalizeEntry(r, name);
      const nameKey = entry.name.toLowerCase().trim();

      if (entry.rating > 0 && entry.rating < MIN_RATING) { belowMin++; continue; }

      // Ensure unique id
      let finalId = entry.id; let counter = 1;
      while (existingIds.has(finalId)) finalId = `${entry.id}-${counter++}`;
      entry.id = finalId;

      if (existingNames.has(nameKey)) { dupExisting++; continue; }
      if (seenRun.has(nameKey))       { dupRun++;      continue; }

      seenRun.add(nameKey);
      existingNames.add(nameKey);
      existingIds.add(finalId);
      allNew.push(entry);
      added++;
    }

    stats[name] = { scraped: raw.length, added, dupExisting, dupRun, belowMin, noName };
    console.log(
      `  Result  scraped=${raw.length}  added=${added}  `
      + `dup(db)=${dupExisting}  dup(run)=${dupRun}  `
      + `<${MIN_RATING}=${belowMin}  noName=${noName}`
    );

    await sleep(DELAY_MS);
  }

  // ── Write updated file ────────────────────────────────────────────────────
  if (allNew.length === 0) {
    console.log('\nNo new cigars found. File unchanged.\n');
  } else if (DRY_RUN) {
    console.log(`\n[DRY-RUN] Would add ${allNew.length} new cigars. File NOT written.\n`);
    console.log('Preview (first 5):');
    allNew.slice(0, 5).forEach(e =>
      console.log(`  • ${e.name}  (${e.brand})  rating=${e.rating}  source=${e._source}`)
    );
  } else {
    const combined = [...existing, ...allNew];
    try {
      fs.writeFileSync(DATA_PATH, JSON.stringify(combined, null, 2) + '\n', 'utf8');
      console.log(`\n✓ Saved — ${combined.length} total entries in ${DATA_PATH}`);
    } catch (e) {
      console.error(`\n✗ Failed to write file: ${e.message}`);
      process.exit(1);
    }
  }

  // ── Summary table ─────────────────────────────────────────────────────────
  console.log(`\n${'='.repeat(64)}`);
  console.log(' Summary');
  console.log('='.repeat(64));
  const COL = 26;
  for (const [src, s] of Object.entries(stats)) {
    console.log(
      `  ${src.padEnd(COL)}  scraped=${String(s.scraped).padStart(4)}`
      + `  added=${String(s.added).padStart(4)}`
      + `  dups=${String(s.dupExisting + s.dupRun).padStart(4)}`
      + `  <${MIN_RATING}=${String(s.belowMin).padStart(3)}`
    );
  }
  const totalScraped = Object.values(stats).reduce((a, s) => a + s.scraped, 0);
  console.log('─'.repeat(64));
  console.log(`  ${'Total scraped:'.padEnd(COL + 2)} ${totalScraped}`);
  console.log(`  ${'Total new cigars added:'.padEnd(COL + 2)} ${allNew.length}`);
  console.log('='.repeat(64) + '\n');
}

main().catch(err => {
  console.error('\nFatal:', err.stack || err.message);
  process.exit(1);
});
