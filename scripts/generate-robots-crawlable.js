#!/usr/bin/env node
/* ══════════════════════════════════════════════════════════════════
   VITOLA PEDIA — CRAWLABLE URL GENERATOR
   ──────────────────────────────────────────────────────────────────
   Outputs a complete list of all crawlable static-page URLs so they
   can be added to robots.txt / sitemap / Google Search Console.

   Output (stdout):
     https://vitolapedia.com/seo-pages/index.html
     https://vitolapedia.com/seo-pages/brands/<slug>.html   (×364)
     https://vitolapedia.com/seo-pages/cigars/<id>.html      (×100)

   Usage:
     node scripts/generate-robots-crawlable.js              # print to stdout
     node scripts/generate-robots-crawlable.js > seo-pages/crawlable-urls.txt
   ═════════════════════════════════════════════════════════════════ */

import fs   from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

const ROOT      = path.resolve(__dirname, '..');
const DATA_FILE  = path.join(ROOT, 'data', 'cigars.json');
const TOP_N      = 100;
const SITE_URL   = 'https://vitolapedia.com';

/* ── slug (mirrors js/app.js) ───────────────────────────────────── */
function slug(s) {
  return String(s == null ? '' : s)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

const urls = [];

// Index page
urls.push(`${SITE_URL}/seo-pages/index.html`);

// Load cigar data
const cigars = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));

// Brand pages (all 364)
const brands = [...new Set(cigars.map(c => c.brand))].sort();
brands.forEach(brand => {
  urls.push(`${SITE_URL}/seo-pages/brands/${slug(brand)}.html`);
});

// Top-100 cigar pages by rating
const topCigars = [...cigars]
  .sort((a, b) => b.rating - a.rating)
  .slice(0, TOP_N);
topCigars.forEach(c => {
  urls.push(`${SITE_URL}/seo-pages/cigars/${c.id}.html`);
});

// Print to stdout
urls.forEach(u => console.log(u));

// Summary to stderr so it doesn't pollute the URL list
console.error(`\n# ${urls.length} crawlable URLs (${brands.length} brands + ${topCigars.length} top cigars + 1 index)`);
