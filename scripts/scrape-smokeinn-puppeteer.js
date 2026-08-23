/**
 * Scrape Smoke Inn product pages with Puppeteer (networkidle2 to handle JS rendering).
 * Gets real product names, brands, prices, images, descriptions for all ~290 products.
 * Then:
 *   1. Match to existing cigars in data.js → add Smoke Inn buyLink
 *   2. Collect unmatched products for potential new entries
 *
 * Output:
 *   /tmp/smokeinn_scraped.json     — all scraped products
 *   /tmp/smokeinn_matches.json     — {id, url} pairs for existing cigars
 *   /tmp/smokeinn_new.json         — unmatched products (potential new entries)
 */

import puppeteer from 'puppeteer';
import { readFileSync, writeFileSync } from 'fs';
import { setTimeout as sleep } from 'timers/promises';

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

function norm(s) {
  return String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[''`]/g, '').replace(/[^a-z0-9 ]/gi, ' ').toLowerCase().trim();
}
function words(s) { return new Set(norm(s).split(/\s+/).filter(w => w.length > 1)); }
function matchScore(target, candidate) {
  const tw = words(target), cw = words(candidate);
  if (!tw.size) return 0;
  return [...tw].filter(w => cw.has(w)).length / tw.size;
}

// Load all product URLs from sitemap + existing catalog
const sitemapUrls = JSON.parse(readFileSync('/tmp/smokeinn_product_urls.json', 'utf8'));
const existing = JSON.parse(readFileSync('/tmp/smokeinn_catalog.json', 'utf8'));
const existingUrls = new Set(existing.map(p => p.url));
const allUrls = [...new Set([...sitemapUrls, ...existing.map(p => p.url)])];
console.log(`Total Smoke Inn URLs to scrape: ${allUrls.length}`);

// Load current cigar database
const SRC = readFileSync('./js/data.js', 'utf8');
eval(SRC.replace(/^const CIGARS/m, 'globalThis.CIGARS'));
const CIGARS = globalThis.CIGARS;
const NON_CUBAN = CIGARS.filter(c => c.origin !== 'Cuba');

async function scrapeProduct(page, url) {
  try {
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
    await sleep(500);

    const data = await page.evaluate(() => {
      // Name
      const h1 = document.querySelector('h1.productView-title, h1[itemprop="name"], h1');
      const name = h1 ? h1.textContent.trim() : '';

      // Brand
      const brandEl = document.querySelector('[itemprop="brand"] span, .productView-brand a, .productView-brand');
      const brand = brandEl ? brandEl.textContent.trim() : '';

      // Price
      const priceEl = document.querySelector('[itemprop="price"], .price--main .price, .price--withTax');
      const price = priceEl ? priceEl.textContent.trim().replace(/[^0-9.]/g, '') : '';

      // Image - try og:image first (most reliable)
      const ogImg = document.querySelector('meta[property="og:image"]');
      const imgEl = document.querySelector('.productView-image img, [itemprop="image"]');
      const image = (ogImg && !ogImg.content.includes('logo')) ? ogImg.content :
                    (imgEl ? (imgEl.src || imgEl.getAttribute('data-src') || '') : '');

      // Description
      const descEl = document.querySelector('[itemprop="description"], .productView-description');
      let desc = '';
      if (descEl) {
        desc = descEl.innerText.replace(/\s+/g, ' ').trim().slice(0, 600);
      }

      // Look for size/vitola info in description or specs
      const specEls = document.querySelectorAll('.productView-info-name, .spec-name, th');
      const specs = {};
      specEls.forEach(el => {
        const key = el.textContent.trim().toLowerCase();
        const val = el.nextElementSibling ? el.nextElementSibling.textContent.trim() : '';
        if (val) specs[key] = val;
      });

      return { name, brand, price, image, description: desc, specs };
    });

    return { url, ...data };
  } catch (e) {
    return { url, name: '', brand: '', price: '', image: '', description: '', error: e.message };
  }
}

// Parse vitola/size from product name slug
function parseVitola(name) {
  const n = norm(name);
  const sizes = {
    'robusto': { size: 'Robusto', length: 5.0, ring: 50 },
    'toro': { size: 'Toro', length: 6.0, ring: 50 },
    'torpedo': { size: 'Torpedo', length: 6.0, ring: 52 },
    'churchill': { size: 'Churchill', length: 7.0, ring: 48 },
    'corona': { size: 'Corona', length: 5.5, ring: 44 },
    'gordo': { size: 'Gordo', length: 6.0, ring: 60 },
    'lancero': { size: 'Lancero', length: 7.5, ring: 38 },
    'belicoso': { size: 'Belicoso', length: 5.5, ring: 52 },
    'lonsdale': { size: 'Lonsdale', length: 6.5, ring: 44 },
    'figurado': { size: 'Figurado', length: 5.5, ring: 54 },
    'rothschild': { size: 'Rothschild', length: 4.5, ring: 50 },
    'petit': { size: 'Petit Corona', length: 4.5, ring: 42 },
    'sixty': { size: 'Sixty', length: 6.0, ring: 60 },
    'magnum': { size: 'Magnum', length: 6.0, ring: 60 },
    'double robusto': { size: 'Double Robusto', length: 5.5, ring: 54 },
    'gran toro': { size: 'Gran Toro', length: 6.0, ring: 54 },
  };
  for (const [key, val] of Object.entries(sizes)) {
    if (n.includes(key)) return val;
  }
  return { size: 'Robusto', length: 5.0, ring: 50 };
}

async function main() {
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu'],
    protocolTimeout: 120000
  });

  const scraped = [];

  try {
    // Use 3 workers for speed
    const queue = [...allUrls];
    const total = queue.length;

    async function worker(id) {
      const pg = await browser.newPage();
      await pg.setUserAgent(UA);
      await pg.setRequestInterception(true);
      pg.on('request', req => {
        if (['font', 'media', 'stylesheet'].includes(req.resourceType())) req.abort();
        else req.continue();
      });

      while (queue.length) {
        const url = queue.shift();
        const done = total - queue.length;
        const product = await scrapeProduct(pg, url);

        if (product.name && product.name !== 'Access denied!' && product.name.length > 2) {
          scraped.push(product);
          process.stdout.write(`[${done}/${total}] ✓ ${product.name.slice(0, 55)}\n`);
        } else {
          // Try to parse name from URL slug
          const slug = url.split('/').pop().replace('.html', '').replace(/-/g, ' ').replace(/_/g, ' ');
          if (slug.length > 3) {
            // Capitalize each word
            const name = slug.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
            scraped.push({ url, name, brand: '', price: '', image: '', description: '', fromSlug: true });
            process.stdout.write(`[${done}/${total}] ~ ${name.slice(0, 55)} (from slug)\n`);
          } else {
            process.stdout.write(`[${done}/${total}] ✗ ${url.split('/').pop()}\n`);
          }
        }
        await sleep(300);
      }
      await pg.close().catch(() => {});
    }

    await Promise.all([worker(0), worker(1), worker(2)]);
  } finally {
    await browser.close().catch(() => {});
  }

  writeFileSync('/tmp/smokeinn_scraped.json', JSON.stringify(scraped, null, 2));
  console.log(`\nScraped ${scraped.length}/${allUrls.length} Smoke Inn products`);

  // Now match to existing cigars
  console.log('\n=== Matching to existing cigars ===');
  const matches = [];
  const unmatched = [];

  // Filter out non-cigar products (samplers, accessories, etc.)
  const cigarsOnly = scraped.filter(p => {
    const n = norm(p.name);
    if (/sampler|assortment|ashtray|humidor|cutter|lighter|torch|case|pouch|holder|locker|gift.set|gift.card|membership|mug|shirt|hat|book|candle|spray|wipe|solution|bag|tray|tube|jar|infuser/i.test(n)) return false;
    if (/\d+\s*(ct|pack|stick)/.test(n) && !/\bpack\b/.test(norm(p.url))) return true; // keep packs
    return true;
  });

  console.log(`Cigar products (after filtering accessories): ${cigarsOnly.length}`);

  for (const product of cigarsOnly) {
    let bestMatch = null;
    let bestScore = 0;

    for (const cigar of NON_CUBAN) {
      const s = matchScore(cigar.name, product.name);
      if (s > bestScore) {
        bestScore = s;
        bestMatch = cigar;
      }
    }

    if (bestScore >= 0.5 && bestMatch) {
      // Check if already has a Smoke Inn link
      const alreadyHas = bestMatch.buyLinks && bestMatch.buyLinks.some(l => l.retailer === 'Smoke Inn');
      if (!alreadyHas) {
        matches.push({
          id: bestMatch.id,
          cigarName: bestMatch.name,
          productName: product.name,
          url: product.url,
          score: bestScore,
          image: product.image || '',
          price: product.price || ''
        });
      }
    } else {
      unmatched.push({ ...product, bestScore, bestMatchName: bestMatch?.name || '' });
    }
  }

  // Dedupe matches — keep highest-score match per cigar ID
  const deduped = new Map();
  for (const m of matches) {
    if (!deduped.has(m.id) || m.score > deduped.get(m.id).score) {
      deduped.set(m.id, m);
    }
  }
  const finalMatches = [...deduped.values()];

  writeFileSync('/tmp/smokeinn_matches.json', JSON.stringify(finalMatches, null, 2));
  writeFileSync('/tmp/smokeinn_new.json', JSON.stringify(unmatched, null, 2));

  console.log(`\nMatched to existing cigars: ${finalMatches.length}`);
  console.log(`Unmatched (potential new entries): ${unmatched.length}`);
  console.log('\nTop matches:');
  finalMatches.slice(0, 10).forEach(m =>
    console.log(`  [${m.score.toFixed(2)}] ${m.cigarName} → ${m.productName}`)
  );
}

main().catch(e => { console.error(e); process.exit(1); });
