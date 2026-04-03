/**
 * Multi-retailer buy-link scraper.
 *
 * Retailers:
 *   Cigars International — scrape sitemap (6108 URLs), fuzzy-match
 *   Neptune Cigar        — scrape brand pages (/brand-cigar), fuzzy-match
 *   JR Cigars            — scrape sitemap
 *   Havana House (Cuban) — scrape category pages
 *   C.Gars Ltd   (Cuban) — scrape category pages
 *
 * Output: /tmp/retailer_links.json
 *   { "cigar-id": { "Cigars International": "url", "Neptune Cigar": "url", ... } }
 */

import puppeteer from 'puppeteer';
import { readFileSync, writeFileSync } from 'fs';
import * as unicodedata from 'node:buffer';

const DATA = JSON.parse(readFileSync('/tmp/cigars_for_scrape.json', 'utf8'));

// ── helpers ──────────────────────────────────────────────────────────────────

function norm(s) {
  return String(s)
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[''`]/g, '')
    .replace(/[^a-z0-9 ]/gi, ' ')
    .toLowerCase().trim();
}

function wordSet(s) {
  return new Set(norm(s).split(/\s+/).filter(w => w.length > 2));
}

function matchScore(cigarName, urlSlug) {
  const nWords = wordSet(cigarName);
  const sWords = wordSet(urlSlug);
  if (!nWords.size) return 0;
  const overlap = [...nWords].filter(w => sWords.has(w)).length;
  return overlap / nWords.size;
}

function bestMatch(cigarName, urls, slugExtractor, minScore = 0.45) {
  let best = null, bestScore = 0;
  for (const url of urls) {
    const slug = slugExtractor(url);
    const score = matchScore(cigarName, slug);
    if (score > bestScore) { bestScore = score; best = url; }
  }
  return bestScore >= minScore ? best : null;
}

async function fetchPage(page, url, wait = 2000) {
  try {
    const resp = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });
    if (!resp || resp.status() >= 400) return null;
    await new Promise(r => setTimeout(r, wait));
    return true;
  } catch { return null; }
}

// ── Cigars International — sitemap ───────────────────────────────────────────

async function scrapeCIFromSitemap(page) {
  console.log('\n=== Cigars International (sitemap) ===');
  await page.goto('https://www.cigarsinternational.com/sitemap.xml', { waitUntil: 'domcontentloaded', timeout: 20000 });
  const html = await page.evaluate(() => document.documentElement.outerHTML);
  const allUrls = [...html.matchAll(/https:\/\/www\.cigarsinternational\.com\/p\/[^<"'\s]+/g)].map(m => m[0]);
  console.log(`Loaded ${allUrls.length} CI product URLs from sitemap`);

  const results = {};
  const cubanIds = new Set(DATA.filter(c => c.origin === 'Cuba').map(c => c.id));

  for (const cigar of DATA) {
    if (cubanIds.has(cigar.id)) continue;
    // slug extractor: /p/{slug}/{id}/  → slug
    const url = bestMatch(cigar.name, allUrls, u => u.replace(/https:\/\/www\.cigarsinternational\.com\/p\//, '').replace(/\/\d+\/$/, ''), 0.45);
    if (url) {
      results[cigar.id] = url;
    }
  }
  console.log(`CI: matched ${Object.keys(results).length} cigars`);
  return results;
}

// ── Neptune Cigar — brand pages ───────────────────────────────────────────────

const NEPTUNE_BRANDS = [
  'padron-cigar','oliva-cigar','arturo-fuente-cigar','drew-estate-cigar','liga-privada-cigar',
  'rocky-patel-cigar','davidoff-cigar','avo-cigar','camacho-cigar','my-father-cigar',
  'alec-bradley-cigar','ashton-cigar','cao-cigar','macanudo-cigar','punch-cigar',
  'romeo-y-julieta-cigar','h-upmann-cigar','crowned-heads-cigar','nub-cigar',
  'la-flor-dominicana-cigar','plasencia-cigar','perdomo-cigar','foundation-cigar',
  'joya-de-nicaragua-cigar','dunbarton-cigar','ep-carrillo-cigar','aging-room-cigar',
  'aj-fernandez-cigar','espinosa-cigar','tatuaje-cigar','illusione-cigar',
  'southern-draw-cigar','herrera-esteli-cigar','caldwell-cigar','warped-cigar',
  'protocol-cigar','crux-cigar','aganorsa-leaf-cigar','la-palina-cigar',
  'diesel-cigar','gurkha-cigar','roma-craft-cigar','man-o-war-cigar',
  'black-label-trading-cigar','viaje-cigar','brick-house-cigar','fratello-cigar',
  'diamond-crown-cigar','leaf-by-oscar-cigar','serino-cigar','ace-prime-cigar',
  'cain-cigar','acid-cigar','undercrown-cigar','montecristo-cigar',
  '5-vegas-cigar','asylum-cigar','henry-clay-cigar','kristoff-cigar',
  'room-101-cigar','ferio-tego-cigar','la-aroma-de-cuba-cigar','nat-sherman-cigar',
  'quesada-cigar','balmoral-cigar','villiger-cigar','gran-habano-cigar',
];

async function scrapeNeptune(page) {
  console.log('\n=== Neptune Cigar (brand pages) ===');
  const allProductUrls = [];

  for (const brand of NEPTUNE_BRANDS) {
    const ok = await fetchPage(page, `https://www.neptunecigar.com/${brand}`, 2500);
    if (!ok) { process.stdout.write(`  ✗ ${brand}\n`); continue; }

    const links = await page.evaluate(() =>
      Array.from(document.querySelectorAll('a[href]')).map(a => a.href)
        .filter(h => /neptunecigar\.com\/cigar\//.test(h))
        .filter((v, i, a) => a.indexOf(v) === i)
    );
    if (links.length) {
      allProductUrls.push(...links);
      process.stdout.write(`  ✓ ${brand} (${links.length})\n`);
    } else {
      process.stdout.write(`  ✗ ${brand} (0)\n`);
    }
  }

  const uniqueUrls = [...new Set(allProductUrls)];
  console.log(`Neptune: ${uniqueUrls.length} product URLs collected`);

  const results = {};
  const cubanIds = new Set(DATA.filter(c => c.origin === 'Cuba').map(c => c.id));

  for (const cigar of DATA) {
    if (cubanIds.has(cigar.id)) continue;
    // slug: /cigar/{slug}
    const url = bestMatch(cigar.name, uniqueUrls, u => u.replace(/https:\/\/www\.neptunecigar\.com\/cigar\//, ''), 0.45);
    if (url) results[cigar.id] = url;
  }
  console.log(`Neptune: matched ${Object.keys(results).length} cigars`);
  return results;
}

// ── JR Cigars — sitemap ───────────────────────────────────────────────────────

async function scrapeJRFromSitemap(page) {
  console.log('\n=== JR Cigars (sitemap) ===');
  // Try robots.txt first
  await page.goto('https://www.jrcigars.com/robots.txt', { waitUntil: 'domcontentloaded', timeout: 15000 });
  const robotsText = await page.evaluate(() => document.body?.innerText || '');
  const sitemapUrl = robotsText.match(/Sitemap:\s*(https?:\/\/[^\s]+)/)?.[1];
  console.log('JR Sitemap from robots.txt:', sitemapUrl);

  const targetUrl = sitemapUrl || 'https://www.jrcigars.com/sitemap.xml';
  await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 20000 });
  const html = await page.evaluate(() => document.documentElement.outerHTML);

  // Check for sub-sitemaps
  const subSitemaps = [...html.matchAll(/https?:\/\/[^\s<>"']+sitemap[^\s<>"']+\.xml[^\s<>"']*/gi)].map(m => m[0]).filter((v,i,a) => a.indexOf(v)===i);
  console.log('Sub-sitemaps:', subSitemaps.slice(0,5));

  let allUrls = [...html.matchAll(/https:\/\/www\.jrcigars\.com\/p\/[^<"'\s]+/g)].map(m => m[0]);

  // If sub-sitemaps, try the products one
  if (subSitemaps.length && allUrls.length < 100) {
    for (const sm of subSitemaps.slice(0, 10)) {
      await page.goto(sm, { waitUntil: 'domcontentloaded', timeout: 20000 }).catch(() => {});
      const smHtml = await page.evaluate(() => document.documentElement.outerHTML);
      const smUrls = [...smHtml.matchAll(/https:\/\/www\.jrcigars\.com\/p\/[^<"'\s]+/g)].map(m => m[0]);
      if (smUrls.length) { allUrls.push(...smUrls); console.log(`  sub-sitemap ${sm.split('/').pop()}: ${smUrls.length} product URLs`); }
    }
  }

  allUrls = [...new Set(allUrls)];
  console.log(`JR: ${allUrls.length} product URLs found`);

  if (!allUrls.length) {
    console.log('JR: no sitemap product URLs, skipping');
    return {};
  }

  const results = {};
  const cubanIds = new Set(DATA.filter(c => c.origin === 'Cuba').map(c => c.id));
  for (const cigar of DATA) {
    if (cubanIds.has(cigar.id)) continue;
    const url = bestMatch(cigar.name, allUrls, u => u.replace(/https:\/\/www\.jrcigars\.com\/p\//, '').replace(/\/\d+\/$/, ''), 0.45);
    if (url) results[cigar.id] = url;
  }
  console.log(`JR: matched ${Object.keys(results).length} cigars`);
  return results;
}

// ── Havana House — category scrape ────────────────────────────────────────────

const HH_CATEGORIES = [
  'product-category/cigars/cuban/cohiba-cigars/',
  'product-category/cigars/cuban/montecristo-cigars/',
  'product-category/cigars/cuban/romeo-y-julieta/',
  'product-category/cigars/cuban/partagas-cigars/',
  'product-category/cigars/cuban/bolivar-cigars/',
  'product-category/cigars/cuban/h-upmann/',
  'product-category/cigars/cuban/trinidad-cigars/',
  'product-category/cigars/cuban/diplomaticos-cigars/',
  'product-category/cigars/cuban/hoyo-de-monterrey-cuban/',
  'product-category/cigars/cuban/punch-cigars/',
  'product-category/cigars/cuban/saint-luis-rey/',
  'product-category/cigars/cuban/cuaba-cigars/',
  'product-category/cigars/cuban/',
];

async function scrapeHavanaHouse(page) {
  console.log('\n=== Havana House (Cuban category pages) ===');
  const allProductUrls = [];

  for (const cat of HH_CATEGORIES) {
    const ok = await fetchPage(page, `https://www.havanahouse.co.uk/${cat}`, 2000);
    if (!ok) continue;

    // Click "load more" if present, then collect
    const links = await page.evaluate(() =>
      Array.from(document.querySelectorAll('a[href]')).map(a => a.href)
        .filter(h => /havanahouse\.co\.uk\/product\//.test(h) && h.includes('single'))
        .filter((v,i,a) => a.indexOf(v) === i)
    );
    if (links.length) {
      allProductUrls.push(...links);
      console.log(`  ✓ ${cat} (${links.length})`);
    }
  }

  const uniqueUrls = [...new Set(allProductUrls)];
  console.log(`Havana House: ${uniqueUrls.length} product URLs`);

  const results = {};
  const cubanCigars = DATA.filter(c => c.origin === 'Cuba');

  for (const cigar of cubanCigars) {
    // slug: /product/{brand}-{vitola}-cigar-single/
    const url = bestMatch(cigar.name, uniqueUrls, u => u.replace(/https:\/\/www\.havanahouse\.co\.uk\/product\//, '').replace(/-cigar-single\/?$/, '').replace(/-cigar-pack-5\/?$/, ''), 0.4);
    if (url) results[cigar.id] = url;
  }
  console.log(`Havana House: matched ${Object.keys(results).length} Cuban cigars`);
  return results;
}

// ── C.Gars Ltd — category scrape ─────────────────────────────────────────────

const CGARS_CATEGORIES = [
  'cuban-cigars-cohiba-cigars-c-317_44_48.html',
  'cuban-cigars-montecristo-c-317_40_44.html',
  'cuban-cigars-romeo-julieta-c-317_73_75.html',
  'cuban-cigars-partagas-c-317_65_67.html',
  'cuban-cigars-bolivar-c-317_36_37.html',
  'cuban-cigars-h-upmann-c-317_52_53.html',
  'cuban-cigars-trinidad-c-317_89_91.html',
  'cuban-cigars-diplomaticos-c-317_45_46.html',
  'cuban-cigars-hoyo-de-monterrey-c-317_54_55.html',
  'cuban-cigars-punch-c-317_70_72.html',
  'cuban-cigars-saint-luis-rey-c-317_76_77.html',
  'cuban-cigars-cuaba-c-317_43_44.html',
];

async function scrapeGars(page) {
  console.log('\n=== C.Gars Ltd (Cuban category pages) ===');
  const allProductUrls = [];

  for (const cat of CGARS_CATEGORIES) {
    const ok = await fetchPage(page, `https://www.cgarsltd.co.uk/${cat}`, 2000);
    if (!ok) continue;

    const links = await page.evaluate(() =>
      Array.from(document.querySelectorAll('a[href]')).map(a => a.href)
        .filter(h => /cgarsltd\.co\.uk\/.*-p-\d+/.test(h))
        .filter((v,i,a) => a.indexOf(v) === i)
    );
    if (links.length) {
      allProductUrls.push(...links);
      console.log(`  ✓ ${cat} (${links.length})`);
    }
  }

  const uniqueUrls = [...new Set(allProductUrls)];
  console.log(`C.Gars: ${uniqueUrls.length} product URLs`);

  const results = {};
  const cubanCigars = DATA.filter(c => c.origin === 'Cuba');

  for (const cigar of cubanCigars) {
    const url = bestMatch(cigar.name, uniqueUrls, u => u.replace(/https:\/\/www\.cgarsltd\.co\.uk\//, '').replace(/-p-\d+\.html$/, '').replace(/-single$/, '').replace(/-cigar$/, ''), 0.4);
    if (url) results[cigar.id] = url;
  }
  console.log(`C.Gars: matched ${Object.keys(results).length} Cuban cigars`);
  return results;
}

// ── main ─────────────────────────────────────────────────────────────────────

async function main() {
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu']
  });
  const page = await browser.newPage();
  await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
  await page.setViewport({ width: 1280, height: 800 });

  const ci = await scrapeCIFromSitemap(page);
  const neptune = await scrapeNeptune(page);
  const jr = await scrapeJRFromSitemap(page);
  const hh = await scrapeHavanaHouse(page);
  const cg = await scrapeGars(page);

  // Merge all results per cigar ID
  const merged = {};
  for (const [id, url] of Object.entries(ci)) {
    if (!merged[id]) merged[id] = {};
    merged[id]['Cigars International'] = url;
  }
  for (const [id, url] of Object.entries(neptune)) {
    if (!merged[id]) merged[id] = {};
    merged[id]['Neptune Cigar'] = url;
  }
  for (const [id, url] of Object.entries(jr)) {
    if (!merged[id]) merged[id] = {};
    merged[id]['JR Cigars'] = url;
  }
  for (const [id, url] of Object.entries(hh)) {
    if (!merged[id]) merged[id] = {};
    merged[id]['Havana House'] = url;
  }
  for (const [id, url] of Object.entries(cg)) {
    if (!merged[id]) merged[id] = {};
    merged[id]['C.Gars Ltd'] = url;
  }

  writeFileSync('/tmp/retailer_links.json', JSON.stringify(merged, null, 2));

  const total = Object.keys(merged).length;
  console.log(`\n✓ Done! ${total} cigars with at least one new direct link`);
  console.log(`  CI: ${Object.keys(ci).length}`);
  console.log(`  Neptune: ${Object.keys(neptune).length}`);
  console.log(`  JR: ${Object.keys(jr).length}`);
  console.log(`  Havana House: ${Object.keys(hh).length}`);
  console.log(`  C.Gars: ${Object.keys(cg).length}`);
  console.log('Output: /tmp/retailer_links.json');

  try { await browser.close(); } catch(e) {}
}

main().catch(e => { console.error(e); process.exit(1); });
