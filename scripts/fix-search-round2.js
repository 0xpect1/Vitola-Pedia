/**
 * Round 2: Fix remaining search URLs using:
 * - CI sitemap (via Puppeteer, 4000+ URLs)
 * - Neptune full catalog (1553 cigar URLs visible on any page)
 * - JR extended sitemap check
 * - Famous Smoke + Smoke Inn: tighter fuzzy matching
 *
 * Reads:  /tmp/remaining_search_urls.json
 * Writes: /tmp/direct_url_results_r2.json
 */

import puppeteer from 'puppeteer';
import { readFileSync, writeFileSync } from 'fs';
import { setTimeout as sleep } from 'timers/promises';

const REMAINING = JSON.parse(readFileSync('/tmp/remaining_search_urls.json', 'utf8'));
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
function bestMatch(cigar, urls, toText, minScore = 0.35) {
  const query = cigar.name + ' ' + cigar.brand;
  let best = null, bs = 0;
  for (const u of urls) {
    const s = matchScore(query, toText(u));
    if (s > bs) { bs = s; best = u; }
  }
  return bs >= minScore ? best : null;
}

const results = [];

async function main() {
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu']
  });

  try {
    const page = await browser.newPage();
    await page.setUserAgent(UA);

    // ─── CI: Fetch full sitemap ────────────────────────────────────────
    const ciTargets = REMAINING['Cigars International'] || [];
    if (ciTargets.length) {
      console.log('=== CI: Fetching sitemap ===');
      await page.goto('https://www.cigarsinternational.com/sitemap.xml', {
        waitUntil: 'networkidle2', timeout: 25000
      });
      const ciSitemapContent = await page.content();

      // Check if it's a sitemap index (has sub-sitemaps)
      const subSitemaps = [...ciSitemapContent.matchAll(/<loc>(https:\/\/www\.cigarsinternational\.com\/[^<]*sitemap[^<]*)<\/loc>/g)]
        .map(m => m[1]);

      let allCIUrls = [];

      if (subSitemaps.length > 0) {
        console.log(`  Found ${subSitemaps.length} sub-sitemaps`);
        for (const smUrl of subSitemaps) {
          try {
            await page.goto(smUrl, { waitUntil: 'networkidle2', timeout: 20000 });
            const content = await page.content();
            const urls = [...content.matchAll(/<loc>(https:\/\/www\.cigarsinternational\.com\/p\/[^<]+)<\/loc>/g)]
              .map(m => m[1]);
            allCIUrls.push(...urls);
            console.log(`    ${smUrl.split('/').pop()}: ${urls.length} product URLs`);
            await sleep(300);
          } catch(e) { console.log(`    ${smUrl.split('/').pop()}: error`); }
        }
      } else {
        // Direct product URLs from main sitemap
        allCIUrls = [...ciSitemapContent.matchAll(/<loc>(https:\/\/www\.cigarsinternational\.com\/p\/[^<]+)<\/loc>/g)]
          .map(m => m[1]);
      }

      // Also extract all URLs and filter to /p/ pattern
      if (allCIUrls.length === 0) {
        allCIUrls = [...ciSitemapContent.matchAll(/<loc>(https:\/\/www\.cigarsinternational\.com[^<]+)<\/loc>/g)]
          .map(m => m[1]).filter(u => /\/p\//.test(u));
      }

      console.log(`  CI total product URLs: ${allCIUrls.length}`);

      // Fuzzy match
      for (const cigar of ciTargets) {
        const url = bestMatch(cigar, allCIUrls, u => {
          const match = u.match(/\/p\/([^\/]+)/);
          return match ? match[1] : '';
        }, 0.35);
        if (url) {
          results.push({ retailer: 'Cigars International', id: cigar.id, directUrl: url });
          process.stdout.write(`  ✓ CI [${cigar.id.slice(0, 45)}]\n`);
        } else {
          process.stdout.write(`  ✗ CI [${cigar.id.slice(0, 45)}]\n`);
        }
      }
    }

    // ─── Neptune: Extract full catalog ─────────────────────────────────
    const npTargets = REMAINING['Neptune Cigar'] || [];
    if (npTargets.length) {
      console.log('\n=== Neptune: Extracting full catalog ===');
      // The /brands page or any page shows all 1553 cigar links in nav
      await page.goto('https://www.neptunecigar.com/brands', {
        waitUntil: 'networkidle2', timeout: 25000
      });
      await sleep(2000);
      const allNPUrls = await page.evaluate(() =>
        [...new Set(Array.from(document.querySelectorAll('a[href]')).map(a => a.href)
          .filter(h => /neptunecigar\.com\/cigar\//.test(h)))]
      );
      console.log(`  Neptune catalog: ${allNPUrls.length} cigar URLs`);

      for (const cigar of npTargets) {
        const url = bestMatch(cigar, allNPUrls, u =>
          u.replace('https://www.neptunecigar.com/cigar/', ''), 0.35);
        if (url) {
          results.push({ retailer: 'Neptune Cigar', id: cigar.id, directUrl: url });
          process.stdout.write(`  ✓ NP [${cigar.id.slice(0, 45)}]\n`);
        } else {
          process.stdout.write(`  ✗ NP [${cigar.id.slice(0, 45)}]\n`);
        }
      }
    }

    // ─── Cigar Page: Try specific product URL guessing ─────────────────
    const cpTargets = REMAINING['Cigar Page'] || [];
    if (cpTargets.length) {
      console.log(`\n=== Cigar Page: Trying product URL guessing (${cpTargets.length} cigars) ===`);
      // Cigar Page is Magento. Product URLs often follow: /{brand}-{product}.html or /{product-slug}.html
      // Let's try loading the brands page or all-cigars page to get product URLs
      try {
        await page.goto('https://www.cigarpage.com/cigars.html', {
          waitUntil: 'networkidle2', timeout: 25000
        });
        await sleep(2000);
        // Scroll to load more products
        await page.evaluate(async () => {
          for (let i = 0; i < 10; i++) {
            window.scrollBy(0, 2000);
            await new Promise(r => setTimeout(r, 500));
          }
        });
        await sleep(2000);
        const cpAllLinks = await page.evaluate(() =>
          [...new Set(Array.from(document.querySelectorAll('a[href]')).map(a => a.href)
            .filter(h => h.includes('cigarpage.com') && !h.includes('catalogsearch') &&
              !h.includes('/customer') && !h.includes('/checkout') && !h.includes('/cart') &&
              !h.includes('page-plus') && h.endsWith('.html') && h.split('/').length >= 4))]
        );
        console.log(`  Cigar Page product links found: ${cpAllLinks.length}`);
        if (cpAllLinks.length > 10) {
          cpAllLinks.slice(0, 5).forEach(l => console.log('    ' + l));
        }

        if (cpAllLinks.length > 50) {
          for (const cigar of cpTargets) {
            const url = bestMatch(cigar, cpAllLinks, u =>
              u.split('/').pop().replace('.html', ''), 0.35);
            if (url) {
              results.push({ retailer: 'Cigar Page', id: cigar.id, directUrl: url });
              process.stdout.write(`  ✓ CP [${cigar.id.slice(0, 45)}]\n`);
            }
          }
          const cpFound = results.filter(r => r.retailer === 'Cigar Page').length;
          console.log(`  CP matched: ${cpFound}/${cpTargets.length}`);
        }
      } catch (e) {
        console.log('  CP error: ' + e.message.slice(0, 80));
      }

      // Try category-based approach for Cigar Page
      if (results.filter(r => r.retailer === 'Cigar Page').length < 50) {
        console.log('  Trying CP brand pages...');
        const cpBrands = {};
        for (const c of cpTargets) cpBrands[c.brand] = (cpBrands[c.brand] || 0) + 1;
        const topBrands = Object.entries(cpBrands).sort((a, b) => b[1] - a[1]).slice(0, 30);

        for (const [brand] of topBrands) {
          const slug = norm(brand).replace(/\s+/g, '-');
          const tryUrls = [
            `https://www.cigarpage.com/${slug}.html`,
            `https://www.cigarpage.com/brands/${slug}.html`,
            `https://www.cigarpage.com/catalogsearch/result/?q=${encodeURIComponent(brand)}`
          ];
          for (const tryUrl of tryUrls) {
            try {
              const res = await page.goto(tryUrl, { waitUntil: 'domcontentloaded', timeout: 12000 });
              if (res.status() !== 200) continue;
              await sleep(1500);
              const links = await page.evaluate(() =>
                [...new Set(Array.from(document.querySelectorAll('a.product-item-link, .product-item a[href], .product-image-link')).map(a => a.href)
                  .filter(h => h.includes('cigarpage.com') && h.endsWith('.html')))]
              );
              if (links.length > 0) {
                console.log(`    ${brand}: ${links.length} products`);
                // Match against this brand's cigars
                const brandCigars = cpTargets.filter(c => c.brand === brand);
                for (const cigar of brandCigars) {
                  if (results.find(r => r.retailer === 'Cigar Page' && r.id === cigar.id)) continue;
                  const url = bestMatch(cigar, links, u => u.split('/').pop().replace('.html', ''), 0.3);
                  if (url) {
                    results.push({ retailer: 'Cigar Page', id: cigar.id, directUrl: url });
                    process.stdout.write(`  ✓ CP [${cigar.id.slice(0, 45)}]\n`);
                  }
                }
                break; // Got results from this URL, move to next brand
              }
            } catch { continue; }
          }
          await sleep(300);
        }
      }
    }

    // ─── Famous Smoke: Try Puppeteer search for remaining ──────────────
    const fsTargets = REMAINING['Famous Smoke Shop'] || [];
    if (fsTargets.length) {
      console.log(`\n=== Famous Smoke: Puppeteer search (${fsTargets.length}) ===`);
      for (const cigar of fsTargets) {
        const q = cigar.name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[''`]/g, '');
        try {
          await page.goto(`https://www.famous-smoke.com/search?q=${encodeURIComponent(q)}`, {
            waitUntil: 'networkidle2', timeout: 20000
          });
          await sleep(2000);
          const links = await page.evaluate(() =>
            [...new Set(Array.from(document.querySelectorAll('a.product-item-link, .product-item a, .product-image-link, [data-product-url]')).map(a => a.href || a.getAttribute('data-product-url'))
              .filter(h => h && h.includes('famous-smoke.com') && !h.includes('/search') && !h.includes('/sale/')))]
          );
          if (links.length) {
            const url = bestMatch(cigar, links, u => u.split('/').pop(), 0.25) || links[0];
            results.push({ retailer: 'Famous Smoke Shop', id: cigar.id, directUrl: url });
            process.stdout.write(`  ✓ FS [${cigar.id.slice(0, 45)}]\n`);
          } else {
            process.stdout.write(`  ✗ FS [${cigar.id.slice(0, 45)}]\n`);
          }
        } catch {
          process.stdout.write(`  ✗ FS [${cigar.id.slice(0, 45)}] (err)\n`);
        }
        await sleep(400);
      }
    }

    // ─── JR: Try more sitemap files ────────────────────────────────────
    const jrTargets = REMAINING['JR Cigars'] || [];
    if (jrTargets.length) {
      console.log(`\n=== JR: Trying Puppeteer search (${jrTargets.length}) ===`);
      for (const cigar of jrTargets) {
        const q = cigar.name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[''`]/g, '');
        try {
          await page.goto(`https://www.jrcigars.com/search?term=${encodeURIComponent(q)}`, {
            waitUntil: 'domcontentloaded', timeout: 15000
          });
          await sleep(2000);
          const links = await page.evaluate(() =>
            [...new Set(Array.from(document.querySelectorAll('a[href]')).map(a => a.href)
              .filter(h => /jrcigars\.com\/item\//.test(h)))]
          );
          if (links.length) {
            const url = bestMatch(cigar, links, u =>
              u.replace('https://www.jrcigars.com/item/', '').replace('.html', ''), 0.25) || links[0];
            results.push({ retailer: 'JR Cigars', id: cigar.id, directUrl: url });
            process.stdout.write(`  ✓ JR [${cigar.id.slice(0, 45)}]\n`);
          } else {
            process.stdout.write(`  ✗ JR [${cigar.id.slice(0, 45)}]\n`);
          }
        } catch {
          process.stdout.write(`  ✗ JR [${cigar.id.slice(0, 45)}] (err)\n`);
        }
        await sleep(300);
      }
    }

    // ─── Smoke Inn: Puppeteer search ──────────────────────────────────
    const siTargets = REMAINING['Smoke Inn'] || [];
    if (siTargets.length) {
      console.log(`\n=== Smoke Inn: Puppeteer search (${siTargets.length}) ===`);
      for (const cigar of siTargets) {
        const q = cigar.name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[''`]/g, '');
        try {
          // Smoke Inn might use BigCommerce search
          await page.goto(`https://www.smokeinn.com/search.php?search_query=${encodeURIComponent(q)}`, {
            waitUntil: 'domcontentloaded', timeout: 15000
          });
          await sleep(2000);
          const links = await page.evaluate(() =>
            [...new Set(Array.from(document.querySelectorAll('.product a[href], .card-figure a[href], .listItem-figure a[href]')).map(a => a.href)
              .filter(h => h.includes('smokeinn.com') && !h.includes('search')))]
          );
          if (links.length) {
            const url = bestMatch(cigar, links, u => u.split('/').pop().replace('.html', ''), 0.25) || links[0];
            results.push({ retailer: 'Smoke Inn', id: cigar.id, directUrl: url });
            process.stdout.write(`  ✓ SI [${cigar.id.slice(0, 45)}]\n`);
          } else {
            process.stdout.write(`  ✗ SI [${cigar.id.slice(0, 45)}]\n`);
          }
        } catch {
          process.stdout.write(`  ✗ SI [${cigar.id.slice(0, 45)}] (err)\n`);
        }
        await sleep(300);
      }
    }

    // ─── Havana House: Just 1 remaining ────────────────────────────────
    const hhTargets = REMAINING['Havana House'] || [];
    if (hhTargets.length) {
      console.log(`\n=== Havana House: ${hhTargets.length} remaining ===`);
      for (const cigar of hhTargets) {
        console.log(`  ${cigar.id}: ${cigar.name}`);
        // Try direct product URL guess
        const slug = norm(cigar.name).replace(/\s+/g, '-');
        const tryUrls = [
          `https://www.havanahouse.co.uk/product/${slug}-cigar-single/`,
          `https://www.havanahouse.co.uk/product/${slug}/`,
        ];
        for (const tryUrl of tryUrls) {
          try {
            const res = await page.goto(tryUrl, { waitUntil: 'domcontentloaded', timeout: 10000 });
            if (res.status() === 200) {
              results.push({ retailer: 'Havana House', id: cigar.id, directUrl: tryUrl });
              process.stdout.write(`  ✓ HH [${cigar.id}]\n`);
              break;
            }
          } catch {}
        }
      }
    }

  } finally {
    await browser.close().catch(() => {});
  }

  writeFileSync('/tmp/direct_url_results_r2.json', JSON.stringify(results, null, 2));
  const byRetailer = {};
  for (const r of results) byRetailer[r.retailer] = (byRetailer[r.retailer] || 0) + 1;
  console.log('\n=== ROUND 2 RESULTS ===');
  console.log(`Total new direct URLs: ${results.length}`);
  Object.entries(byRetailer).forEach(([r, n]) => console.log(`  ${r}: ${n}`));
}

main().catch(e => { console.error(e); process.exit(1); });
