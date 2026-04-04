/**
 * Multi-retailer image scraper for cigars still missing images.
 * Tries: Smoke Inn, Holt's, Thompson Cigar, Corona Cigar, Cigars Daily
 * For Cubans: re-tries Havana House existing links + GQ Tobaccos
 *
 * Reads:  /tmp/missing_images.json   [{id, name, brand, origin, buyLinks}]
 * Output: /tmp/multi_retailer_images.json  [{id, image, retailer, url}]
 */

import puppeteer from 'puppeteer';
import { readFileSync, writeFileSync } from 'fs';

const DATA = JSON.parse(readFileSync('/tmp/missing_images.json', 'utf8'));
const CONCURRENCY = 3;

function norm(s) {
  return String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[''`]/g, '').replace(/[^a-z0-9 ]/gi, ' ').toLowerCase().trim();
}

function normalize(s) {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[''`]/g, '');
}

async function tryOgImage(page, url, waitFor = 'domcontentloaded', delay = 1500) {
  try {
    await page.goto(url, { waitUntil: waitFor, timeout: 20000 });
    await new Promise(r => setTimeout(r, delay));
    return await page.evaluate(() => {
      const og = document.querySelector('meta[property="og:image"]');
      if (og) return og.getAttribute('content');
      // Fallback: product image selectors
      const img = document.querySelector(
        '.product-img img, .pdp-image img, .product-image img, ' +
        '#product-image img, .product_image img, [data-main-image], ' +
        '.swiper-slide-active img, .product-gallery img'
      );
      return img ? (img.src || img.getAttribute('data-src') || img.getAttribute('data-lazy')) : null;
    });
  } catch { return null; }
}

// Smoke Inn — good boutique selection
async function trySmokeInn(page, cigar) {
  const q = normalize(cigar.name).replace(/[^a-z0-9 ]/gi, ' ').trim();
  try {
    await page.goto(`https://www.smokeinn.com/search?query=${encodeURIComponent(q)}`, {
      waitUntil: 'domcontentloaded', timeout: 20000
    });
    await new Promise(r => setTimeout(r, 1500));
    const productUrl = await page.evaluate(() => {
      const links = Array.from(document.querySelectorAll('a[href]'))
        .map(a => a.href)
        .filter(h => {
          try {
            const u = new URL(h);
            return u.hostname.includes('smokeinn.com') && /\/product\/|\/cigars\//.test(u.pathname);
          } catch { return false; }
        });
      return links[0] || null;
    });
    if (!productUrl) return null;
    const img = await tryOgImage(page, productUrl);
    if (img && img.startsWith('http')) return { image: img, retailer: 'Smoke Inn', url: productUrl };
  } catch {}
  return null;
}

// Holt's Cigars
async function tryHolts(page, cigar) {
  const q = normalize(cigar.name).replace(/[^a-z0-9 ]/gi, ' ').trim();
  try {
    await page.goto(`https://www.holts.com/catalogsearch/result/?q=${encodeURIComponent(q)}`, {
      waitUntil: 'domcontentloaded', timeout: 20000
    });
    await new Promise(r => setTimeout(r, 1500));
    const productUrl = await page.evaluate(() => {
      const links = Array.from(document.querySelectorAll('a[href]'))
        .map(a => a.href)
        .filter(h => {
          try {
            const u = new URL(h);
            return u.hostname.includes('holts.com') &&
              u.pathname.length > 5 &&
              !u.pathname.includes('catalogsearch') &&
              !u.pathname.includes('category');
          } catch { return false; }
        });
      return links[0] || null;
    });
    if (!productUrl) return null;
    const img = await tryOgImage(page, productUrl);
    if (img && img.startsWith('http')) return { image: img, retailer: "Holt's Cigars", url: productUrl };
  } catch {}
  return null;
}

// Thompson Cigar — massive inventory
async function tryThompson(page, cigar) {
  const q = normalize(cigar.name).replace(/[^a-z0-9 ]/gi, ' ').trim();
  try {
    await page.goto(`https://www.thompsoncigar.com/Catalogsearch?q=${encodeURIComponent(q)}`, {
      waitUntil: 'domcontentloaded', timeout: 20000
    });
    await new Promise(r => setTimeout(r, 1500));
    const productUrl = await page.evaluate(() => {
      const links = Array.from(document.querySelectorAll('a[href]'))
        .map(a => a.href)
        .filter(h => {
          try {
            const u = new URL(h);
            return u.hostname.includes('thompsoncigar.com') &&
              (/-cigars?-|\/cigars?\//.test(u.pathname) || /\/p\//.test(u.pathname)) &&
              !u.pathname.includes('search');
          } catch { return false; }
        });
      return links[0] || null;
    });
    if (!productUrl) return null;
    const img = await tryOgImage(page, productUrl);
    if (img && img.startsWith('http')) return { image: img, retailer: 'Thompson Cigar', url: productUrl };
  } catch {}
  return null;
}

// Corona Cigar (coronacigar.com)
async function tryCorona(page, cigar) {
  const q = normalize(cigar.name).replace(/[^a-z0-9 ]/gi, ' ').trim();
  try {
    await page.goto(`https://www.coronacigar.com/search?query=${encodeURIComponent(q)}`, {
      waitUntil: 'domcontentloaded', timeout: 20000
    });
    await new Promise(r => setTimeout(r, 1500));
    const productUrl = await page.evaluate(() => {
      const links = Array.from(document.querySelectorAll('a[href]'))
        .map(a => a.href)
        .filter(h => {
          try {
            const u = new URL(h);
            return u.hostname.includes('coronacigar.com') && /\/product\/|\/cigars\//.test(u.pathname);
          } catch { return false; }
        });
      return links[0] || null;
    });
    if (!productUrl) return null;
    const img = await tryOgImage(page, productUrl);
    if (img && img.startsWith('http')) return { image: img, retailer: 'Corona Cigar', url: productUrl };
  } catch {}
  return null;
}

// GQ Tobaccos (UK Cuban specialist)
async function tryGQTobaccos(page, cigar) {
  const q = normalize(cigar.name).replace(/[^a-z0-9 ]/gi, ' ').trim();
  try {
    await page.goto(`https://www.gqtobaccos.com/?s=${encodeURIComponent(q)}`, {
      waitUntil: 'domcontentloaded', timeout: 20000
    });
    await new Promise(r => setTimeout(r, 1500));
    const productUrl = await page.evaluate(() => {
      const links = Array.from(document.querySelectorAll('a[href]'))
        .map(a => a.href)
        .filter(h => {
          try {
            const u = new URL(h);
            return u.hostname.includes('gqtobaccos.com') && /\/product\//.test(u.pathname);
          } catch { return false; }
        });
      return links[0] || null;
    });
    if (!productUrl) return null;
    const img = await tryOgImage(page, productUrl, 'networkidle2', 1000);
    if (img && img.startsWith('http')) return { image: img, retailer: 'GQ Tobaccos', url: productUrl };
  } catch {}
  return null;
}

// Turmeaus (UK Cuban specialist)
async function tryTurmeaus(page, cigar) {
  const q = normalize(cigar.name).replace(/[^a-z0-9 ]/gi, ' ').trim();
  try {
    await page.goto(`https://www.turmeaus.co.uk/?s=${encodeURIComponent(q)}&post_type=product`, {
      waitUntil: 'domcontentloaded', timeout: 20000
    });
    await new Promise(r => setTimeout(r, 1500));
    const productUrl = await page.evaluate(() => {
      const links = Array.from(document.querySelectorAll('a[href]'))
        .map(a => a.href)
        .filter(h => {
          try {
            const u = new URL(h);
            return u.hostname.includes('turmeaus.co.uk') && /\/product\//.test(u.pathname);
          } catch { return false; }
        });
      return links[0] || null;
    });
    if (!productUrl) return null;
    const img = await tryOgImage(page, productUrl, 'networkidle2', 1000);
    if (img && img.startsWith('http')) return { image: img, retailer: 'Turmeaus', url: productUrl };
  } catch {}
  return null;
}

// Re-try Havana House existing links (with networkidle2)
async function tryHavanaHouseLink(page, cigar) {
  const hhLink = (cigar.buyLinks || []).find(l =>
    l.retailer === 'Havana House' && l.url && l.url.includes('/product/')
  );
  if (!hhLink) return null;
  const img = await tryOgImage(page, hhLink.url, 'networkidle2', 2000);
  if (img && img.startsWith('http')) return { image: img, retailer: 'Havana House', url: hhLink.url };
  return null;
}

async function findImage(page, cigar) {
  const isCuban = cigar.origin === 'Cuba';

  if (isCuban) {
    // Cuban cigars: HH direct link first, then search on GQ + Turmeaus
    let r = await tryHavanaHouseLink(page, cigar);
    if (r) return r;
    r = await tryGQTobaccos(page, cigar);
    if (r) return r;
    r = await tryTurmeaus(page, cigar);
    if (r) return r;
  } else {
    // Non-Cuban: Smoke Inn → Holt's → Thompson → Corona
    let r = await trySmokeInn(page, cigar);
    if (r) return r;
    r = await tryHolts(page, cigar);
    if (r) return r;
    r = await tryThompson(page, cigar);
    if (r) return r;
    r = await tryCorona(page, cigar);
    if (r) return r;
  }
  return null;
}

async function worker(browser, queue, results) {
  const page = await browser.newPage();
  await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
  await page.setRequestInterception(true);
  page.on('request', req => {
    if (['font', 'media'].includes(req.resourceType())) req.abort();
    else req.continue();
  });

  while (queue.length > 0) {
    const cigar = queue.shift();
    const result = await findImage(page, cigar);
    if (result) {
      results.push({ id: cigar.id, image: result.image, retailer: result.retailer, url: result.url });
      process.stdout.write(`✓ ${cigar.id.slice(0, 50)} [${result.retailer}]\n`);
    } else {
      process.stdout.write(`✗ ${cigar.id.slice(0, 50)}\n`);
    }
  }
  try { await page.close(); } catch(e) {}
}

async function main() {
  console.log(`Searching ${DATA.length} cigars across multiple retailers (${CONCURRENCY} workers)...`);
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu']
  });
  const queue = [...DATA];
  const results = [];
  const workers = [];
  for (let i = 0; i < CONCURRENCY; i++) workers.push(worker(browser, queue, results));
  await Promise.all(workers);
  writeFileSync('/tmp/multi_retailer_images.json', JSON.stringify(results, null, 2));
  console.log(`\n✓ Done! Found ${results.length}/${DATA.length} images → /tmp/multi_retailer_images.json`);
  try { await browser.close(); } catch(e) {}
}

main().catch(e => { console.error(e); process.exit(1); });
