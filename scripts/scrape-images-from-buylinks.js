/**
 * Scrapes og:image for cigars that have a Famous Smoke buyLink but no image.
 * Reads /tmp/fs_links_from_buylinks.json  [{id, url}]
 * Output: /tmp/images_from_buylinks.json  [{id, image}]
 */

import puppeteer from 'puppeteer';
import { readFileSync, writeFileSync } from 'fs';

const DATA = JSON.parse(readFileSync('/tmp/fs_links_from_buylinks.json', 'utf8'));
const CONCURRENCY = 5;

function upgradeImageUrl(url) {
  if (!url) return null;
  return url
    .replace(/h_75,q_auto,w_75/, 'h_400,q_auto,w_400')
    .replace(/h_75,w_75/, 'h_400,w_400');
}

async function getImage(page, { id, url }) {
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });
    await new Promise(r => setTimeout(r, 800));
    const ogImage = await page.evaluate(() => {
      const el = document.querySelector('meta[property="og:image"]');
      return el ? el.getAttribute('content') : null;
    });
    const image = upgradeImageUrl(ogImage);
    if (image) {
      process.stdout.write(`✓ ${id.slice(0, 55)}\n`);
      return { id, image };
    }
    process.stdout.write(`✗ ${id.slice(0, 55)} (no og:image)\n`);
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
    if (['image', 'font', 'media'].includes(req.resourceType())) req.abort();
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
  console.log(`Scraping og:image for ${DATA.length} cigars with existing FS buy links...`);
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu']
  });
  const queue = [...DATA];
  const results = [];
  const workers = [];
  for (let i = 0; i < CONCURRENCY; i++) workers.push(worker(browser, queue, results));
  await Promise.all(workers);
  writeFileSync('/tmp/images_from_buylinks.json', JSON.stringify(results, null, 2));
  console.log(`\n✓ Done! Found ${results.length} images → /tmp/images_from_buylinks.json`);
  try { await browser.close(); } catch(e) {}
}

main().catch(e => { console.error(e); process.exit(1); });
