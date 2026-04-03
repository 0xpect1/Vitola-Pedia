/**
 * For Cuban cigars with only HH search URLs, searches HH and extracts
 * the first product page URL, then fetches its og:image.
 *
 * Reads:  /tmp/hh_retry.json           [{id, name, url}]  (search URLs)
 * Output: /tmp/hh_search_images.json    [{id, image}]
 */

import puppeteer from 'puppeteer';
import { readFileSync, writeFileSync } from 'fs';

const DATA = JSON.parse(readFileSync('/tmp/hh_retry.json', 'utf8'));
const CONCURRENCY = 3;

async function getImageViaSearch(page, { id, name, url }) {
  try {
    // Load the search page
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 25000 });
    await new Promise(r => setTimeout(r, 500));

    // Find first product link
    const productUrl = await page.evaluate(() => {
      const links = Array.from(document.querySelectorAll('a[href]'))
        .map(a => a.href)
        .filter(h => /havanahouse\.co\.uk\/product\//.test(h));
      return links[0] || null;
    });

    if (!productUrl) {
      process.stdout.write(`✗ ${id.slice(0,50)} (no product link in search)\n`);
      return null;
    }

    // Visit the product page
    await page.goto(productUrl, { waitUntil: 'networkidle2', timeout: 25000 });
    await new Promise(r => setTimeout(r, 500));

    const image = await page.evaluate(() => {
      const og = document.querySelector('meta[property="og:image"]');
      return og ? og.getAttribute('content') : null;
    });

    if (image && image.startsWith('http')) {
      process.stdout.write(`✓ ${id.slice(0,50)}\n`);
      return { id, image };
    }
    process.stdout.write(`✗ ${id.slice(0,50)} (no og:image on product page)\n`);
    return null;
  } catch(e) {
    process.stdout.write(`✗ ${id.slice(0,50)} (${e.message.slice(0,30)})\n`);
    return null;
  }
}

async function worker(browser, queue, results) {
  const page = await browser.newPage();
  await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
  while (queue.length > 0) {
    const item = queue.shift();
    const result = await getImageViaSearch(page, item);
    if (result) results.push(result);
  }
  try { await page.close(); } catch(e) {}
}

async function main() {
  console.log(`Searching HH for ${DATA.length} Cuban cigars...`);
  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu'] });
  const queue = [...DATA];
  const results = [];
  const workers = [];
  for (let i = 0; i < CONCURRENCY; i++) workers.push(worker(browser, queue, results));
  await Promise.all(workers);
  writeFileSync('/tmp/hh_search_images.json', JSON.stringify(results, null, 2));
  console.log(`\n✓ Done! Found ${results.length} images → /tmp/hh_search_images.json`);
  try { await browser.close(); } catch(e) {}
}

main().catch(e => { console.error(e); process.exit(1); });
