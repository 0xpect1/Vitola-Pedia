#!/usr/bin/env node
/* ══════════════════════════════════════════════════════════════════
   VITOLA PEDIA — SITEMAP GENERATOR
   ──────────────────────────────────────────────────────────────────
   Generates sitemap.xml covering the homepage, all 1,458 cigar pages,
   all 134 house (brand) pages, and main section pages.

   Output: sitemap.xml (in project root)

   Usage:
     node scripts/generate-sitemap.js

   NOTE: Re-run after regenerating static pages (generate-seo-pages.js)
   so the sitemap stays in sync with the generated HTML files.
   ═════════════════════════════════════════════════════════════════ */

'use strict';

const fs   = require('fs');
const path = require('path');

/* ── CONFIG ─────────────────────────────────────────────────────── */
const ROOT      = path.resolve(__dirname, '..');
const DATA_FILE = path.join(ROOT, 'data', 'cigars.json');
const SITEMAP   = path.join(ROOT, 'sitemap.xml');
const SITE_URL  = 'https://vitolapedia.com';

/* ── HELPERS ────────────────────────────────────────────────────── */
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

function xmlEscape(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function urlEntry(loc, lastmod, changefreq, priority) {
  return `  <url>
    <loc>${xmlEscape(loc)}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>${changefreq}</changefreq>
    <priority>${priority}</priority>
  </url>`;
}

/* ── MAIN ───────────────────────────────────────────────────────── */
function main() {
  console.log('Loading cigar data…');
  const cigars = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  console.log(`  ${cigars.length} cigars found.`);

  const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
  const urls = [];

  // 1. Homepage
  urls.push(urlEntry(SITE_URL + '/', today, 'weekly', '1.0'));

  // 2. Main section pages (if they exist)
  urls.push(urlEntry(SITE_URL + '/cigars.html', today, 'weekly', '0.9'));
  urls.push(urlEntry(SITE_URL + '/houses.html', today, 'weekly', '0.9'));

  // 3. Cigar pages (priority 0.8)
  cigars.forEach(c => {
    urls.push(urlEntry(`${SITE_URL}/cigars/${c.id}.html`, today, 'monthly', '0.8'));
  });

  // 4. House / brand pages (priority 0.6)
  const brands = [...new Set(cigars.map(c => c.brand))];
  brands.forEach(brand => {
    urls.push(urlEntry(`${SITE_URL}/houses/${slug(brand)}.html`, today, 'monthly', '0.6'));
  });

  // Assemble XML
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.join('\n')}
</urlset>
`;

  fs.writeFileSync(SITEMAP, xml, 'utf8');
  console.log(`✓ Generated sitemap.xml with ${urls.length} URLs`);
  console.log(`  - Homepage: 1`);
  console.log(`  - Section pages: 2`);
  console.log(`  - Cigar pages: ${cigars.length}`);
  console.log(`  - House pages: ${brands.length}`);
}

main();
