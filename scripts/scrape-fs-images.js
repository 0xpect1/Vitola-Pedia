/**
 * Visits Famous Smoke product pages and extracts og:image URLs.
 * Reads Famous Smoke product URLs from /tmp/fs_links_v2.json
 * Output: /tmp/fs_images.json  [{id, image}]
 */

import puppeteer from 'puppeteer';
import { readFileSync, writeFileSync } from 'fs';

const FS_LINKS = JSON.parse(readFileSync('/tmp/fs_links_v2.json', 'utf8'));
// [{id, url}]

const CONCURRENCY = 3;

function upgradeImageUrl(url) {
  if (!url) return null;
  // Upgrade thumbnail to full-size display image
  return url
    .replace(/h_75,q_auto,w_75/, 'h_400,q_auto,w_400')
    .replace(/h_75,w_75/, 'h_400,w_400');
}

async function getImage(page, { id, url }) {
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });
    await new Promise(r => setTimeout(r, 1500));

    const ogImage = await page.evaluate(() => {
      const el = document.querySelector('meta[property="og:image"]');
      return el ? el.getAttribute('content') : null;
    });

    const image = upgradeImageUrl(ogImage);
    if (image) {
      process.stdout.write(`✓ ${id.slice(0, 50)}\n`);
      return { id, image };
    } else {
      process.stdout.write(`✗ ${id.slice(0, 50)} (no og:image)\n`);
      return null;
    }
  } catch (e) {
    process.stdout.write(`✗ ${id.slice(0, 50)} (error: ${e.message.slice(0, 40)})\n`);
    return null;
  }
}

async function worker(browser, queue, results) {
  const page = await browser.newPage();
  await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
  await page.setRequestInterception(true);
  page.on('request', req => {
    // Block images/fonts/media to speed up page loads
    if (['image', 'font', 'media'].includes(req.resourceType())) {
      req.abort();
    } else {
      req.continue();
    }
  });

  while (queue.length > 0) {
    const item = queue.shift();
    const result = await getImage(page, item);
    if (result) results.push(result);
  }

  await page.close();
}

async function main() {
  console.log(`Fetching og:image for ${FS_LINKS.length} Famous Smoke URLs with ${CONCURRENCY} workers...`);

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu']
  });

  const queue = [...FS_LINKS];
  const results = [];
  const workers = [];

  for (let i = 0; i < CONCURRENCY; i++) {
    workers.push(worker(browser, queue, results));
  }

  await Promise.all(workers);

  writeFileSync('/tmp/fs_images.json', JSON.stringify(results, null, 2));
  console.log(`\n✓ Done! Found ${results.length} images → /tmp/fs_images.json`);

  try { await browser.close(); } catch (e) {}
}

main().catch(e => { console.error(e); process.exit(1); });
