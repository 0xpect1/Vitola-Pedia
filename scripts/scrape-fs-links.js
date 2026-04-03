/**
 * Scrapes real Famous Smoke product URLs by searching for each cigar.
 * Uses 4 parallel Puppeteer tabs for speed.
 * Output: /tmp/fs_links_v2.json  [{id, url}]
 */

import puppeteer from 'puppeteer';
import { readFileSync, writeFileSync } from 'fs';

const DATA = JSON.parse(readFileSync('/tmp/cigars_for_scrape.json', 'utf8'));

const CONCURRENCY = 2;
const BASE = 'https://www.famous-smoke.com';

function normalize(s) {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[''`]/g, '');
}

function pickBestUrl(urls, cigarName) {
  if (!urls.length) return null;
  const norm = normalize(cigarName).toLowerCase();

  // Filter to actual product pages (not promos, not samplers, not accessories)
  const products = urls.filter(u => {
    const path = new URL(u).pathname;
    return path.split('/').length === 2 // root level only
      && !u.includes('/promo/')
      && !u.includes('/sampler')
      && !u.includes('/lighter')
      && !u.includes('/cutter')
      && !u.includes('/ashtray');
  });

  if (!products.length) return null;

  // Prefer 5-pack or single over box
  const single = products.find(u => !u.includes('-pack-of-') && !u.includes('-box-of-'));
  if (single) return single;

  const fivePack = products.find(u => u.includes('-pack-of-5') || u.includes('-5-pack-'));
  if (fivePack) return fivePack;

  return products[0]; // fallback: first product
}

async function searchCigar(page, cigar) {
  const query = normalize(cigar.name).replace(/[^a-z0-9 ]/gi, ' ').trim();
  const url = `${BASE}/search?q=${encodeURIComponent(query)}`;

  try {
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 20000 });
    await new Promise(r => setTimeout(r, 2000));

    const links = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('a[href]'))
        .map(a => a.href)
        .filter(h => {
          try {
            const u = new URL(h);
            const path = u.pathname;
            // Only match actual product pages — they all have the pattern /X-cigars-Y
            return u.hostname === 'www.famous-smoke.com'
              && path.split('/').length === 2
              && /-cigars-/.test(path)
              && !u.hash
              && !u.search;
          } catch { return false; }
        })
        .filter((v,i,a) => a.indexOf(v) === i);
    });

    return pickBestUrl(links, cigar.name);
  } catch (e) {
    return null;
  }
}

async function worker(browser, queue, results, workerIdx) {
  const page = await browser.newPage();
  await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

  while (queue.length > 0) {
    const cigar = queue.shift();
    const url = await searchCigar(page, cigar);
    if (url) {
      results[cigar.id] = url;
      process.stdout.write(`✓ ${cigar.name.slice(0,50)}\n`);
    } else {
      process.stdout.write(`✗ ${cigar.name.slice(0,50)}\n`);
    }
  }

  await page.close();
}

async function main() {
  const cubanBrands = new Set(['Cohiba','Montecristo','Romeo y Julieta','Partagás','Bolívar',
    'H. Upmann','Trinidad','Diplomaticos','Hoyo de Monterrey','Punch','Saint Luis Rey','Cuaba']);

  // Only scrape non-Cuban cigars
  const queue = DATA.filter(c => c.origin !== 'Cuba' && !cubanBrands.has(c.brand));
  console.log(`Scraping ${queue.length} non-Cuban cigars with ${CONCURRENCY} workers...`);

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu']
  });

  const results = {};
  const workers = [];
  for (let i = 0; i < CONCURRENCY; i++) {
    workers.push(worker(browser, queue, results, i));
  }
  await Promise.all(workers);

  // Save BEFORE closing browser (browser.close can throw)
  const output = Object.entries(results).map(([id, url]) => ({ id, url }));
  writeFileSync('/tmp/fs_links_v2.json', JSON.stringify(output, null, 2));
  console.log(`\n✓ Done! Found ${output.length} URLs → /tmp/fs_links_v2.json`);

  try { await browser.close(); } catch(e) {}
}

main().catch(e => { console.error(e); process.exit(1); });
