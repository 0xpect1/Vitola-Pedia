/**
 * Scrapes og:image from Famous Smoke product pages for cigars that have
 * Famous Smoke buyLinks but no image yet.
 * Also searches Famous Smoke for cigars with no FS link, to find + scrape images.
 *
 * Reads:  /tmp/noncuban_still_missing.json  [{id, name, brand, origin, buyLinks}]
 * Output: /tmp/fs_direct_images.json         [{id, image}]
 */

import puppeteer from 'puppeteer';
import { readFileSync, writeFileSync } from 'fs';

const DATA = JSON.parse(readFileSync('/tmp/noncuban_still_missing.json', 'utf8'));
const CONCURRENCY = 3;
const BASE = 'https://www.famous-smoke.com';

function upgradeImageUrl(url) {
  if (!url) return null;
  return url
    .replace(/h_75,q_auto,w_75/, 'h_400,q_auto,w_400')
    .replace(/h_75,w_75/, 'h_400,w_400');
}

function normalize(s) {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[''`]/g, '');
}

async function getOgImage(page, url) {
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });
    await new Promise(r => setTimeout(r, 1500));
    const img = await page.evaluate(() => {
      const el = document.querySelector('meta[property="og:image"]');
      return el ? el.getAttribute('content') : null;
    });
    return upgradeImageUrl(img);
  } catch { return null; }
}

async function searchAndGetImage(page, cigar) {
  // First try existing FS buyLink if available
  const fsLink = (cigar.buyLinks || []).find(l => l.retailer === 'Famous Smoke Shop');
  if (fsLink) {
    const img = await getOgImage(page, fsLink.url);
    if (img) return img;
  }

  // Fallback: search FS
  const query = normalize(cigar.name).replace(/[^a-z0-9 ]/gi, ' ').trim();
  const searchUrl = `${BASE}/search?q=${encodeURIComponent(query)}`;
  try {
    await page.goto(searchUrl, { waitUntil: 'networkidle2', timeout: 20000 });
    await new Promise(r => setTimeout(r, 1500));

    const productUrl = await page.evaluate(() => {
      const links = Array.from(document.querySelectorAll('a[href]'))
        .map(a => a.href)
        .filter(h => {
          try {
            const u = new URL(h);
            return u.hostname === 'www.famous-smoke.com'
              && u.pathname.split('/').length === 2
              && /-cigars-/.test(u.pathname)
              && !u.hash && !u.search;
          } catch { return false; }
        });
      return links[0] || null;
    });

    if (!productUrl) return null;
    return await getOgImage(page, productUrl);
  } catch { return null; }
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
    const image = await searchAndGetImage(page, cigar);
    if (image) {
      results.push({ id: cigar.id, image });
      process.stdout.write(`✓ ${cigar.id.slice(0, 55)}\n`);
    } else {
      process.stdout.write(`✗ ${cigar.id.slice(0, 55)}\n`);
    }
  }
  try { await page.close(); } catch(e) {}
}

async function main() {
  console.log(`Scraping Famous Smoke images for ${DATA.length} cigars with ${CONCURRENCY} workers...`);
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu']
  });
  const queue = [...DATA];
  const results = [];
  const workers = [];
  for (let i = 0; i < CONCURRENCY; i++) workers.push(worker(browser, queue, results));
  await Promise.all(workers);
  writeFileSync('/tmp/fs_direct_images.json', JSON.stringify(results, null, 2));
  console.log(`\n✓ Done! Found ${results.length} images → /tmp/fs_direct_images.json`);
  try { await browser.close(); } catch(e) {}
}

main().catch(e => { console.error(e); process.exit(1); });
