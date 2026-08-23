/**
 * Scrape Smoke Inn catalog using direct HTTP + Puppeteer for catalog browsing.
 * Phase 1: Use Puppeteer to browse /cigars/ category with pagination to get all product URLs
 * Phase 2: Direct HTTP fetch each product page for og:image and details
 *
 * Output: /tmp/smokeinn_catalog.json
 */

import puppeteer from 'puppeteer';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { setTimeout as sleep } from 'timers/promises';

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

async function httpGet(url) {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': UA, 'Accept': 'text/html' },
      signal: AbortSignal.timeout(15000)
    });
    if (!res.ok) return null;
    return await res.text();
  } catch { return null; }
}

async function main() {
  // Phase 1: Get all product URLs
  console.log('=== Phase 1: Discovering product URLs ===');
  const allUrls = new Set();

  // Add sitemap URLs first
  if (existsSync('/tmp/smokeinn_product_urls.json')) {
    const sitemapUrls = JSON.parse(readFileSync('/tmp/smokeinn_product_urls.json', 'utf8'));
    sitemapUrls.forEach(u => allUrls.add(u));
    console.log(`  Sitemap: ${sitemapUrls.length} URLs`);
  }

  // Use Puppeteer to browse /cigars/ with pagination
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu']
  });

  const page = await browser.newPage();
  await page.setUserAgent(UA);
  await page.setRequestInterception(true);
  page.on('request', req => {
    if (['font', 'media', 'stylesheet'].includes(req.resourceType())) req.abort();
    else req.continue();
  });

  // Try /cigars/ category pages
  for (let p = 1; p <= 50; p++) {
    try {
      const url = p === 1
        ? 'https://www.smokeinn.com/cigars/'
        : `https://www.smokeinn.com/cigars/?page=${p}`;
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });
      await sleep(1500);

      const links = await page.evaluate(() =>
        [...new Set(Array.from(document.querySelectorAll('a[href]')).map(a => a.href)
          .filter(h => h.includes('smokeinn.com') && h.endsWith('.html') &&
            !h.includes('/cart') && !h.includes('/search') && !h.includes('/login')))]
      );

      if (links.length === 0) { console.log(`  /cigars/ page ${p}: 0 products — stopping`); break; }

      let newCount = 0;
      for (const l of links) { if (!allUrls.has(l)) { allUrls.add(l); newCount++; } }
      console.log(`  /cigars/ page ${p}: ${links.length} links (${newCount} new)`);
      if (newCount === 0) break;
    } catch { break; }
    await sleep(800);
  }

  // Try Clearance pages too
  for (let p = 1; p <= 20; p++) {
    try {
      const url = p === 1
        ? 'https://www.smokeinn.com/Clearance/'
        : `https://www.smokeinn.com/Clearance/?page=${p}`;
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });
      await sleep(1500);

      const links = await page.evaluate(() =>
        [...new Set(Array.from(document.querySelectorAll('a[href]')).map(a => a.href)
          .filter(h => h.includes('smokeinn.com') && h.endsWith('.html')))]
      );

      if (links.length === 0) break;
      let newCount = 0;
      for (const l of links) { if (!allUrls.has(l)) { allUrls.add(l); newCount++; } }
      console.log(`  /Clearance/ page ${p}: ${links.length} links (${newCount} new)`);
      if (newCount === 0) break;
    } catch { break; }
    await sleep(800);
  }

  // Try Smoke Inn Gallery / Past Cigar Gallery
  for (const catUrl of [
    'https://www.smokeinn.com/Past-Cigar-Gallery/',
    'https://www.smokeinn.com/Flash-Sales/',
    'https://www.smokeinn.com/Custom-Packs/',
  ]) {
    for (let p = 1; p <= 10; p++) {
      try {
        const url = p === 1 ? catUrl : `${catUrl}?page=${p}`;
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });
        await sleep(1500);
        const links = await page.evaluate(() =>
          [...new Set(Array.from(document.querySelectorAll('a[href]')).map(a => a.href)
            .filter(h => h.includes('smokeinn.com') && h.endsWith('.html')))]
        );
        if (links.length === 0) break;
        let newCount = 0;
        for (const l of links) { if (!allUrls.has(l)) { allUrls.add(l); newCount++; } }
        if (newCount > 0) console.log(`  ${catUrl.split('.com/')[1]} page ${p}: ${newCount} new`);
        if (newCount === 0) break;
      } catch { break; }
      await sleep(800);
    }
  }

  await page.close().catch(() => {});
  await browser.close().catch(() => {});

  // Filter to cigar product URLs
  const allUrlArray = [...allUrls];
  const cigarUrls = allUrlArray.filter(u => {
    const slug = u.split('/').pop().replace('.html', '').toLowerCase();
    if (/sampler|assortment|ashtray|humidor|cutter|lighter|torch|case|pouch|holder|locker|gift-set|gift-card|membership|punch-cutter|mug|shirt|hat|book|candle|spray|wipe|solution|bag|tray|tube|jar|infuser/i.test(slug)) return false;
    if (/\d+ct-|10ct|20ct|25ct/i.test(slug)) return false;
    return true;
  });

  console.log(`\nTotal product URLs: ${allUrlArray.length}`);
  console.log(`Cigar product URLs: ${cigarUrls.length}`);

  // Phase 2: Scrape each product page via HTTP
  console.log('\n=== Phase 2: Scraping product details via HTTP ===');
  const products = [];
  const BATCH = 5;

  for (let i = 0; i < cigarUrls.length; i += BATCH) {
    const batch = cigarUrls.slice(i, i + BATCH);
    const batchResults = await Promise.all(batch.map(async (url) => {
      const html = await httpGet(url);
      if (!html) return null;

      // Extract details from HTML
      const nameMatch = html.match(/<h1[^>]*class="[^"]*productView-title[^"]*"[^>]*>([^<]+)/i) ||
        html.match(/<h1[^>]*>([^<]+)/);
      const name = nameMatch ? nameMatch[1].trim() : '';

      const brandMatch = html.match(/data-product-brand="([^"]+)"/) ||
        html.match(/<span[^>]*class="[^"]*productView-brand[^"]*"[^>]*>([^<]+)/i);
      const brand = brandMatch ? (brandMatch[1] || brandMatch[2] || '').trim() : '';

      const ogImageMatch = html.match(/og:image[^>]*content="([^"]+)"/);
      const image = ogImageMatch ? ogImageMatch[1] : '';

      const priceMatch = html.match(/data-product-price="([^"]+)"/) ||
        html.match(/<span[^>]*class="price price--withTax[^"]*"[^>]*>\$?([\d.,]+)/);
      const price = priceMatch ? (priceMatch[1] || priceMatch[2] || '').trim() : '';

      const descMatch = html.match(/<div[^>]*class="[^"]*productView-description[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
      let desc = '';
      if (descMatch) {
        desc = descMatch[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 500);
      }

      if (!name) return null;

      return { url, name, brand, image, price, description: desc };
    }));

    for (const p of batchResults) {
      if (p && p.name) {
        products.push(p);
        process.stdout.write(`  ✓ [${products.length}] ${p.name.slice(0, 55)}\n`);
      }
    }
    await sleep(300);
  }

  writeFileSync('/tmp/smokeinn_catalog.json', JSON.stringify(products, null, 2));
  console.log(`\n✓ Done! Scraped ${products.length} Smoke Inn products → /tmp/smokeinn_catalog.json`);
}

main().catch(e => { console.error(e); process.exit(1); });
