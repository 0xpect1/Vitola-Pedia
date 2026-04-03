/**
 * Multi-source image scraper for cigars missing an image field.
 *
 * Sources (in priority order):
 *   1. Famous Smoke — search by name, extract og:image
 *   2. Cigars International — sitemap match, extract og:image
 *   3. Neptune Cigar — brand page match, extract og:image
 *
 * Reads:  /tmp/cigars_missing_images.json  [{id, name, brand, origin}]
 * Output: /tmp/all_new_images.json          [{id, image}]
 */

import puppeteer from 'puppeteer';
import { readFileSync, writeFileSync } from 'fs';

const DATA = JSON.parse(readFileSync('/tmp/cigars_missing_images.json', 'utf8'));
const NON_CUBAN = DATA.filter(c => c.origin !== 'Cuba');
const CUBAN = DATA.filter(c => c.origin === 'Cuba');

const CONCURRENCY = 4;

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

function upgradeImageUrl(url) {
  if (!url) return null;
  return url
    .replace(/h_75,q_auto,w_75/, 'h_400,q_auto,w_400')
    .replace(/h_75,w_75/, 'h_400,w_400');
}

async function getOgImage(page, url) {
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });
    await new Promise(r => setTimeout(r, 1000));
    const img = await page.evaluate(() => {
      const el = document.querySelector('meta[property="og:image"]');
      return el ? el.getAttribute('content') : null;
    });
    return upgradeImageUrl(img);
  } catch { return null; }
}

// ── Phase 1: collect CI sitemap ───────────────────────────────────────────────

async function collectCIUrls(page) {
  console.log('\n[CI] Loading sitemap...');
  try {
    await page.goto('https://www.cigarsinternational.com/sitemap.xml', { waitUntil: 'domcontentloaded', timeout: 25000 });
    const html = await page.evaluate(() => document.documentElement.outerHTML);
    const urls = [...html.matchAll(/https:\/\/www\.cigarsinternational\.com\/p\/[^<"'\s]+/g)].map(m => m[0]);
    console.log(`[CI] ${urls.length} product URLs`);
    return urls;
  } catch(e) {
    console.log(`[CI] Sitemap failed: ${e.message.slice(0,50)}`);
    return [];
  }
}

// ── Phase 2: collect Neptune brand pages ─────────────────────────────────────

const NEPTUNE_BRANDS = [
  'arturo-fuente-cigar','macanudo-cigar','camacho-cigar','joya-de-nicaragua-cigar',
  'alec-bradley-cigar','tatuaje-cigar','ep-carrillo-cigar','room-101-cigar',
  'la-palina-cigar','espinosa-cigar','kristoff-cigar','ferio-tego-cigar',
  'cavalier-geneve-cigar','ezra-zion-cigar','black-works-studio-cigar',
  'padron-cigar','oliva-cigar','drew-estate-cigar','liga-privada-cigar',
  'rocky-patel-cigar','davidoff-cigar','avo-cigar','my-father-cigar',
  'crowned-heads-cigar','dunbarton-cigar','foundation-cigar','ashton-cigar',
  'plasencia-cigar','perdomo-cigar','punch-cigar','cao-cigar',
  'illusione-cigar','nub-cigar','aganorsa-leaf-cigar','southern-draw-cigar',
  'caldwell-cigar','black-label-trading-cigar','la-flor-dominicana-cigar',
  'herrera-esteli-cigar','quesada-cigar','gran-habano-cigar','nat-sherman-cigar',
  'gurkha-cigar','man-o-war-cigar','diesel-cigar','aging-room-cigar',
  'acid-cigar','crux-cigar','warped-cigar','protocol-cigar',
  'viaje-cigar','brick-house-cigar','fratello-cigar','hvc-cigar',
  'ace-prime-cigar','cain-cigar','henry-clay-cigar','la-gloria-cubana-cigar',
  'la-aroma-de-cuba-cigar','carlos-torano-cigar','montecristo-cigar',
  '5-vegas-cigar','asylum-cigar','la-barba-cigar',
];

async function collectNeptuneUrls(page) {
  console.log('\n[Neptune] Loading brand pages...');
  const allUrls = [];
  for (const brand of NEPTUNE_BRANDS) {
    try {
      const resp = await page.goto(`https://www.neptunecigar.com/${brand}`, { waitUntil: 'domcontentloaded', timeout: 15000 });
      if (!resp || resp.status() >= 400) continue;
      await new Promise(r => setTimeout(r, 800));
      const links = await page.evaluate(() =>
        Array.from(document.querySelectorAll('a[href]')).map(a => a.href)
          .filter(h => /neptunecigar\.com\/cigar\//.test(h))
          .filter((v, i, a) => a.indexOf(v) === i)
      );
      if (links.length) allUrls.push(...links);
      process.stdout.write(`  ✓ ${brand} (${links.length})\n`);
    } catch { process.stdout.write(`  ✗ ${brand}\n`); }
  }
  const unique = [...new Set(allUrls)];
  console.log(`[Neptune] ${unique.length} product URLs`);
  return unique;
}

// ── Phase 3: build URL map for all missing-image cigars ───────────────────────

function buildUrlMap(cigar, fsUrls, ciUrls, neptuneUrls) {
  // Try FS first (highest image quality)
  const fsUrl = fsUrls[cigar.id];
  if (fsUrl) return { url: fsUrl, source: 'FS' };

  // Try CI
  const ciUrl = bestMatch(cigar.name, ciUrls,
    u => u.replace(/https:\/\/www\.cigarsinternational\.com\/p\//, '').replace(/\/\d+\/$/, ''), 0.45);
  if (ciUrl) return { url: ciUrl, source: 'CI' };

  // Try Neptune
  const neptuneUrl = bestMatch(cigar.name, neptuneUrls,
    u => u.replace(/https:\/\/www\.neptunecigar\.com\/cigar\//, ''), 0.45);
  if (neptuneUrl) return { url: neptuneUrl, source: 'Neptune' };

  return null;
}

// ── Phase 4: parallel og:image fetcher ───────────────────────────────────────

async function imageWorker(browser, queue, results) {
  const page = await browser.newPage();
  await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
  await page.setRequestInterception(true);
  page.on('request', req => {
    if (['image', 'font', 'media'].includes(req.resourceType())) req.abort();
    else req.continue();
  });

  while (queue.length > 0) {
    const { cigar, url, source } = queue.shift();
    const image = await getOgImage(page, url);
    if (image) {
      results.push({ id: cigar.id, image });
      process.stdout.write(`✓ [${source}] ${cigar.name.slice(0, 50)}\n`);
    } else {
      process.stdout.write(`✗ [${source}] ${cigar.name.slice(0, 50)} (no image)\n`);
    }
  }
  try { await page.close(); } catch(e) {}
}

// ── main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`Finding images for ${DATA.length} cigars (${NON_CUBAN.length} non-Cuban, ${CUBAN.length} Cuban)`);

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu']
  });

  const setupPage = await browser.newPage();
  await setupPage.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

  // Load bulk URL sources
  const ciUrls = await collectCIUrls(setupPage);
  const neptuneUrls = await collectNeptuneUrls(setupPage);
  await setupPage.close().catch(() => {});

  // Load FS links already scraped
  let fsUrls = {};
  try {
    const fsLinks = JSON.parse(readFileSync('/tmp/fs_links_v2.json', 'utf8'));
    fsUrls = Object.fromEntries(fsLinks.map(e => [e.id, e.url]));
    console.log(`\n[FS] ${Object.keys(fsUrls).length} pre-scraped Famous Smoke URLs loaded`);
  } catch { console.log('[FS] No pre-scraped URLs found'); }

  // Build queue: match each missing-image cigar to a product URL
  const queue = [];
  let noMatch = 0;
  for (const cigar of DATA) {
    const match = buildUrlMap(cigar, fsUrls, cigar.origin !== 'Cuba' ? ciUrls : [], cigar.origin !== 'Cuba' ? neptuneUrls : []);
    if (match) queue.push({ cigar, ...match });
    else noMatch++;
  }
  console.log(`\nMatched: ${queue.length} cigars | No URL found: ${noMatch}`);

  // Fetch og:image in parallel
  const results = [];
  const workers = [];
  for (let i = 0; i < CONCURRENCY; i++) {
    workers.push(imageWorker(browser, queue, results));
  }
  await Promise.all(workers);

  writeFileSync('/tmp/all_new_images.json', JSON.stringify(results, null, 2));
  console.log(`\n✓ Done! Found ${results.length} images → /tmp/all_new_images.json`);

  try { await browser.close(); } catch(e) {}
}

main().catch(e => { console.error(e); process.exit(1); });
