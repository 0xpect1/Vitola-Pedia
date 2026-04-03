/**
 * Scrapes product images from C.Gars Ltd for Cuban cigars missing images.
 *
 * Reads:  /tmp/cgars_image_targets.json  [{id, name, url}]
 * Output: /tmp/cgars_images.json          [{id, image}]
 */

import puppeteer from 'puppeteer';
import { readFileSync, writeFileSync } from 'fs';

const DATA = JSON.parse(readFileSync('/tmp/cgars_image_targets.json', 'utf8'));
const CONCURRENCY = 3;

async function getImage(page, { id, url }) {
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });
    await new Promise(r => setTimeout(r, 1200));
    const image = await page.evaluate(() => {
      const og = document.querySelector('meta[property="og:image"]');
      if (og) return og.getAttribute('content');
      const img = document.querySelector('.product-image img, #productMainImage img, .main-image img, img.ProductImage');
      return img ? (img.src || img.getAttribute('data-src')) : null;
    });
    if (image && image.startsWith('http')) {
      process.stdout.write(`✓ ${id.slice(0, 55)}\n`);
      return { id, image };
    }
    process.stdout.write(`✗ ${id.slice(0, 55)} (no image)\n`);
    return null;
  } catch(e) {
    process.stdout.write(`✗ ${id.slice(0, 55)} (${e.message.slice(0, 30)})\n`);
    return null;
  }
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
    const item = queue.shift();
    const result = await getImage(page, item);
    if (result) results.push(result);
  }
  try { await page.close(); } catch(e) {}
}

async function main() {
  console.log(`Scraping C.Gars images for ${DATA.length} Cuban cigars...`);
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu']
  });
  const queue = [...DATA];
  const results = [];
  const workers = [];
  for (let i = 0; i < CONCURRENCY; i++) workers.push(worker(browser, queue, results));
  await Promise.all(workers);
  writeFileSync('/tmp/cgars_images.json', JSON.stringify(results, null, 2));
  console.log(`\n✓ Done! Found ${results.length} images → /tmp/cgars_images.json`);
  try { await browser.close(); } catch(e) {}
}

main().catch(e => { console.error(e); process.exit(1); });
