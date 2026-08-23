/**
 * Scrapes Smoke Inn's full product catalog via Puppeteer.
 * Uses brand pages + pagination to find all individual cigars.
 * Extracts: name, brand, image, price, url, description
 *
 * Output: /tmp/smokeinn_catalog.json
 */

import puppeteer from 'puppeteer';
import { readFileSync, writeFileSync } from 'fs';
import { setTimeout as sleep } from 'timers/promises';

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

async function main() {
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu'],
    protocolTimeout: 60000
  });

  const page = await browser.newPage();
  await page.setUserAgent(UA);

  // Step 1: Find all brand pages from the brands listing
  console.log('=== Step 1: Discovering brand pages ===');
  let brandPages = [];
  try {
    await page.goto('https://www.smokeinn.com/brands/', {
      waitUntil: 'networkidle2', timeout: 30000
    });
    await sleep(2000);
    brandPages = await page.evaluate(() =>
      [...new Set(Array.from(document.querySelectorAll('a[href]')).map(a => a.href)
        .filter(h => h.includes('smokeinn.com/brands/') && h !== 'https://www.smokeinn.com/brands/'))]
    );
    console.log(`  Found ${brandPages.length} brand pages`);
  } catch (e) {
    console.log('  Brands page failed:', e.message.slice(0, 60));
  }

  // Step 2: Also try the main category pages
  const categoryUrls = [
    'https://www.smokeinn.com/premium-cigars/',
    'https://www.smokeinn.com/cigars/',
    'https://www.smokeinn.com/all/',
  ];

  for (const catUrl of categoryUrls) {
    try {
      const res = await page.goto(catUrl, { waitUntil: 'domcontentloaded', timeout: 10000 });
      if (res.status() === 200) {
        console.log(`  Category found: ${catUrl}`);
        brandPages.push(catUrl);
      }
    } catch {}
  }

  // Step 3: Use search to find all products (search with blank or common terms)
  console.log('\n=== Step 2: Collecting all product URLs via search + brand pages ===');
  const allProductUrls = new Set();

  // Use alphabet search to get all products
  const searchTerms = [
    'padron', 'oliva', 'my father', 'drew estate', 'arturo fuente',
    'rocky patel', 'perdomo', 'ashton', 'davidoff', 'acid',
    'alec bradley', 'cao', 'macanudo', 'romeo', 'montecristo',
    'nub', 'camacho', 'tatuaje', 'crowned heads', 'foundation',
    'plasencia', 'aganorsa', 'dunbarton', 'aj fernandez', 'espinosa',
    'la flor', 'herrera', 'san cristobal', 'undercrown', 'liga privada',
    'joya de nicaragua', 'southern draw', 'brick house', 'caldwell',
    'diamond crown', 'punch', 'hoyo', 'gurkha', 'diesel',
    'warped', 'illusione', 'room 101', 'villiger', 'romacraft',
    'henry clay', 'asylum', 'eiroa', 'ep carrillo', 'crux',
    'hvc', 'protocol', 'ace prime', 'viaje', 'ezra zion',
    'serino', 'cornelius', 'dapper', 'mombacho', 'man o war',
    'la palina', 'leaf by oscar', 'nat sherman', 'gloria cubana',
    'kristoff', 'aging room', 'charter oak', 'h upmann', 'cohiba',
    'balmoral', 'fratello', '5 vegas', 'quesada', 'la barba',
    'matilde', 'dissident', 'amendola', 'fuego', 'gran habano',
    'torano', 'nestor miranda', 'tabernacle', 'black label',
    'kentucky fire', 'java', 'ferio tego', 'sobremesa',
  ];

  // Scrape search results page by page
  async function scrapeSearchResults(query) {
    let pageNum = 1;
    let found = 0;
    while (pageNum <= 10) {
      try {
        const url = `https://www.smokeinn.com/search.php?search_query=${encodeURIComponent(query)}&section=product&page=${pageNum}`;
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });
        await sleep(1500);

        const productLinks = await page.evaluate(() => {
          const links = [];
          // BigCommerce product cards
          document.querySelectorAll('.card .card-figure a, .card .card-body a, .product a, .listItem a').forEach(a => {
            const h = a.href;
            if (h && h.includes('smokeinn.com') && !h.includes('search') &&
              !h.includes('/cart') && !h.includes('/login') && !h.includes('/brands/') &&
              !h.includes('/categories/') && h.endsWith('.html')) {
              links.push(h);
            }
          });
          // Also try generic product card links
          document.querySelectorAll('[data-product-id] a, .productGrid .product a').forEach(a => {
            if (a.href && a.href.endsWith('.html')) links.push(a.href);
          });
          return [...new Set(links)];
        });

        if (productLinks.length === 0) break;

        let newCount = 0;
        for (const link of productLinks) {
          if (!allProductUrls.has(link)) {
            allProductUrls.add(link);
            newCount++;
            found++;
          }
        }

        if (newCount === 0) break; // No new products on this page
        pageNum++;
      } catch { break; }
    }
    return found;
  }

  for (const term of searchTerms) {
    const found = await scrapeSearchResults(term);
    if (found > 0) process.stdout.write(`  "${term}": ${found} new products\n`);
    await sleep(800); // Respect robots.txt crawl delay
  }

  // Also scrape brand pages
  for (const brandUrl of brandPages.slice(0, 80)) {
    try {
      await page.goto(brandUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
      await sleep(1000);
      const links = await page.evaluate(() =>
        [...new Set(Array.from(document.querySelectorAll('a[href]')).map(a => a.href)
          .filter(h => h.includes('smokeinn.com') && h.endsWith('.html') &&
            !h.includes('/cart') && !h.includes('/search')))]
      );
      let newCount = 0;
      for (const link of links) {
        if (!allProductUrls.has(link)) { allProductUrls.add(link); newCount++; }
      }
      if (newCount > 0) {
        process.stdout.write(`  brand ${brandUrl.split('/brands/')[1] || brandUrl.split('/').pop()}: ${newCount} new\n`);
      }
    } catch {}
    await sleep(800);
  }

  // Add sitemap product URLs too
  const sitemapUrls = JSON.parse(readFileSync('/tmp/smokeinn_product_urls.json', 'utf8'));
  for (const u of sitemapUrls) allProductUrls.add(u);

  console.log(`\nTotal unique product URLs: ${allProductUrls.size}`);

  // Step 3: Scrape product details from each URL
  console.log('\n=== Step 3: Scraping product details ===');
  const products = [];
  const urls = [...allProductUrls];

  // Filter out obvious non-cigar items
  const cigarUrls = urls.filter(u => {
    const slug = u.split('/').pop().replace('.html', '').toLowerCase();
    // Skip samplers, packs, deals, accessories, ashtrays, humidors, cutters, lighters
    if (/sampler|assortment|ashtray|humidor|cutter|lighter|punch-cutter|torch|case|pouch|holder|locker|gift-set|gift-card|membership/i.test(slug)) return false;
    if (/\d+-pack-deal|pack-de|\d+ct-sampler/i.test(slug)) return false;
    return true;
  });

  console.log(`  Filtered to ${cigarUrls.length} potential cigar product URLs (from ${urls.length})`);

  // Use 2 workers to scrape product details
  const queue = [...cigarUrls];

  async function worker(workerId) {
    const pg = await browser.newPage();
    await pg.setUserAgent(UA);
    await pg.setRequestInterception(true);
    pg.on('request', req => {
      if (['font', 'media'].includes(req.resourceType())) req.abort();
      else req.continue();
    });

    while (queue.length > 0) {
      const url = queue.shift();
      try {
        await pg.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });
        await sleep(1200);

        const product = await pg.evaluate(() => {
          const name = document.querySelector('h1.productView-title, h1[itemprop="name"], .productView-title')?.textContent?.trim() || '';
          const brand = document.querySelector('[data-product-brand], .productView-brand, [itemprop="brand"]')?.textContent?.trim() || '';
          const price = document.querySelector('[data-product-price], .price--withTax, [itemprop="price"]')?.textContent?.trim() || '';
          const desc = document.querySelector('.productView-description [data-content], .productView-description, [itemprop="description"]')?.textContent?.trim() || '';

          // Image: og:image or product image
          const ogImg = document.querySelector('meta[property="og:image"]')?.getAttribute('content');
          const prodImg = document.querySelector('.productView-image img, [data-main-image], .productView-img-container img')?.src;
          const image = ogImg || prodImg || '';

          // Category/type
          const breadcrumbs = Array.from(document.querySelectorAll('.breadcrumb a, .breadcrumbs a')).map(a => a.textContent.trim());

          return { name, brand, price, desc, image, breadcrumbs };
        });

        if (product.name) {
          products.push({
            url,
            name: product.name,
            brand: product.brand,
            price: product.price,
            description: product.desc.slice(0, 500),
            image: product.image,
            breadcrumbs: product.breadcrumbs
          });
          process.stdout.write(`  ✓ [${products.length}] ${product.name.slice(0, 55)}\n`);
        } else {
          process.stdout.write(`  ✗ ${url.split('/').pop().slice(0, 55)} (no title)\n`);
        }
      } catch (e) {
        process.stdout.write(`  ✗ ${url.split('/').pop().slice(0, 55)} (err)\n`);
      }
      await sleep(600);
    }
    await pg.close().catch(() => {});
  }

  await Promise.all([worker(1), worker(2)]);

  writeFileSync('/tmp/smokeinn_catalog.json', JSON.stringify(products, null, 2));
  console.log(`\n✓ Done! Scraped ${products.length} products → /tmp/smokeinn_catalog.json`);
  await browser.close().catch(() => {});
}

main().catch(e => { console.error(e); process.exit(1); });
