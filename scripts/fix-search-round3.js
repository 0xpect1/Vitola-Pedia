/**
 * Round 3: Fix remaining search URLs.
 *
 * Cigar Page (287): Individual Puppeteer searches with proper JS wait
 * Neptune (66): Use /search page (showed 1553 cigar links)
 * CI (47): Individual Puppeteer searches on product pages
 * Famous Smoke (32): Skip (JS-rendered search, zero results from Puppeteer)
 * Smoke Inn (26): Try BigCommerce search_query format
 * Havana House (1): Manual lookup
 */

import puppeteer from 'puppeteer';
import { readFileSync, writeFileSync } from 'fs';
import { setTimeout as sleep } from 'timers/promises';

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const SRC = readFileSync('./js/data.js', 'utf8');
eval(SRC.replace(/^const CIGARS/m, 'globalThis.CIGARS'));
const CIGARS = globalThis.CIGARS;

function isSearchUrl(url) {
  return /[?&](q|query|search|s|term)=/i.test(url) ||
    /\/search(\?|\/|$)/i.test(url) || /\/catalogsearch\//i.test(url);
}

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
  const query = cigar.name;
  let best = null, bs = 0;
  for (const u of urls) {
    const s = matchScore(query, toText(u));
    if (s > bs) { bs = s; best = u; }
  }
  return bs >= minScore ? best : null;
}

// Get remaining cigars per retailer
function getRemaining(retailer) {
  const result = [];
  for (const cigar of CIGARS) {
    if (!cigar.buyLinks) continue;
    for (const l of cigar.buyLinks) {
      if (l.retailer === retailer && isSearchUrl(l.url)) {
        result.push(cigar);
        break;
      }
    }
  }
  return result;
}

const results = [];

async function main() {
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu'],
    protocolTimeout: 60000
  });

  try {
    // ─── Neptune: Use search page to get full catalog ──────────────────
    const npTargets = getRemaining('Neptune Cigar');
    if (npTargets.length) {
      console.log(`\n=== Neptune (${npTargets.length}): Full catalog from search page ===`);
      const page = await browser.newPage();
      await page.setUserAgent(UA);
      try {
        await page.goto('https://www.neptunecigar.com/search?q=a', {
          waitUntil: 'networkidle2', timeout: 30000
        });
        await sleep(3000);
        const npUrls = await page.evaluate(() =>
          [...new Set(Array.from(document.querySelectorAll('a[href]')).map(a => a.href)
            .filter(h => /neptunecigar\.com\/cigar\//.test(h)))]
        );
        console.log(`  Neptune catalog: ${npUrls.length} cigar URLs`);
        for (const cigar of npTargets) {
          const url = bestMatch(cigar, npUrls, u =>
            u.replace('https://www.neptunecigar.com/cigar/', ''), 0.35);
          if (url) {
            results.push({ retailer: 'Neptune Cigar', id: cigar.id, directUrl: url });
            process.stdout.write(`  ✓ NP [${cigar.id.slice(0, 45)}]\n`);
          } else {
            process.stdout.write(`  ✗ NP [${cigar.id.slice(0, 45)}]\n`);
          }
        }
      } catch (e) { console.log('  NP error:', e.message.slice(0, 80)); }
      await page.close().catch(() => {});
    }

    // ─── Cigar Page: Individual searches (3 workers) ─────────────────
    const cpTargets = getRemaining('Cigar Page');
    if (cpTargets.length) {
      console.log(`\n=== Cigar Page (${cpTargets.length}): Individual Puppeteer searches ===`);
      const cpQueue = [...cpTargets];
      let cpFound = 0;

      async function cpWorker(workerId) {
        const pg = await browser.newPage();
        await pg.setUserAgent(UA);
        await pg.setRequestInterception(true);
        pg.on('request', req => {
          if (['font', 'media', 'image'].includes(req.resourceType())) req.abort();
          else req.continue();
        });

        while (cpQueue.length) {
          const cigar = cpQueue.shift();
          const q = norm(cigar.name);
          try {
            await pg.goto(`https://www.cigarpage.com/catalogsearch/result/?q=${encodeURIComponent(q)}`, {
              waitUntil: 'networkidle0', timeout: 20000
            });
            await sleep(1500);

            // Try multiple selectors for product links
            const links = await pg.evaluate(() => {
              const selectors = [
                '.product-item-link',
                '.product-item a',
                '.product-image-link',
                'a.product-item-photo',
                '.products-grid a[href]',
                '.product-items a[href]',
                'ol.products a[href]',
                '.product-item-info a[href]',
              ];
              const allLinks = new Set();
              for (const sel of selectors) {
                document.querySelectorAll(sel).forEach(el => {
                  const h = el.href || el.getAttribute('href');
                  if (h && h.includes('cigarpage.com') && !h.includes('catalogsearch') &&
                    !h.includes('/customer') && !h.includes('/cart') && !h.includes('/checkout') &&
                    !h.includes('page-plus') && h.endsWith('.html')) {
                    allLinks.add(h);
                  }
                });
              }
              return [...allLinks];
            });

            if (links.length > 0) {
              const url = bestMatch(cigar, links, u =>
                u.split('/').pop().replace('.html', ''), 0.25) || links[0];
              results.push({ retailer: 'Cigar Page', id: cigar.id, directUrl: url });
              cpFound++;
              process.stdout.write(`  ✓ CP [${cigar.id.slice(0, 45)}] (${links.length} results)\n`);
            } else {
              process.stdout.write(`  ✗ CP [${cigar.id.slice(0, 45)}]\n`);
            }
          } catch (e) {
            process.stdout.write(`  ✗ CP [${cigar.id.slice(0, 45)}] (err)\n`);
          }
          await sleep(500);
        }
        await pg.close().catch(() => {});
      }

      await Promise.all([cpWorker(1), cpWorker(2), cpWorker(3)]);
      console.log(`  CP total found: ${cpFound}/${cpTargets.length}`);
    }

    // ─── CI: Individual product search ──────────────────────────────
    const ciTargets = getRemaining('Cigars International');
    if (ciTargets.length) {
      console.log(`\n=== CI (${ciTargets.length}): Puppeteer product search ===`);
      const ciQueue = [...ciTargets];
      async function ciWorker() {
        const pg = await browser.newPage();
        await pg.setUserAgent(UA);
        await pg.setRequestInterception(true);
        pg.on('request', req => {
          if (['font', 'media', 'image'].includes(req.resourceType())) req.abort();
          else req.continue();
        });
        while (ciQueue.length) {
          const cigar = ciQueue.shift();
          const q = norm(cigar.name);
          try {
            await pg.goto(`https://www.cigarsinternational.com/search?q=${encodeURIComponent(q)}`, {
              waitUntil: 'domcontentloaded', timeout: 20000
            });
            await sleep(3000);
            const links = await pg.evaluate(() =>
              [...new Set(Array.from(document.querySelectorAll('a[href]')).map(a => a.href)
                .filter(h => /cigarsinternational\.com\/p\//.test(h)))]
            );
            if (links.length) {
              const url = bestMatch(cigar, links, u => u.split('/p/')[1] || '', 0.25) || links[0];
              results.push({ retailer: 'Cigars International', id: cigar.id, directUrl: url });
              process.stdout.write(`  ✓ CI [${cigar.id.slice(0, 45)}]\n`);
            } else {
              process.stdout.write(`  ✗ CI [${cigar.id.slice(0, 45)}]\n`);
            }
          } catch {
            process.stdout.write(`  ✗ CI [${cigar.id.slice(0, 45)}] (err)\n`);
          }
          await sleep(500);
        }
        await pg.close().catch(() => {});
      }
      await Promise.all([ciWorker(), ciWorker()]);
    }

    // ─── Smoke Inn: Try BigCommerce search ──────────────────────────
    const siTargets = getRemaining('Smoke Inn');
    if (siTargets.length) {
      console.log(`\n=== Smoke Inn (${siTargets.length}): BigCommerce search ===`);
      const pg = await browser.newPage();
      await pg.setUserAgent(UA);
      for (const cigar of siTargets) {
        const q = norm(cigar.name);
        try {
          await pg.goto(`https://www.smokeinn.com/search.php?search_query=${encodeURIComponent(q)}&section=product`, {
            waitUntil: 'domcontentloaded', timeout: 15000
          });
          await sleep(2000);
          const links = await pg.evaluate(() =>
            [...new Set(Array.from(document.querySelectorAll('.card-figure a, .listItem-figure a, .product a, [data-product-id] a')).map(a => a.href)
              .filter(h => h && h.includes('smokeinn.com') && !h.includes('search') && h.endsWith('/')))]
          );
          if (links.length) {
            const url = bestMatch(cigar, links, u => u.split('/').filter(Boolean).pop(), 0.25) || links[0];
            results.push({ retailer: 'Smoke Inn', id: cigar.id, directUrl: url });
            process.stdout.write(`  ✓ SI [${cigar.id.slice(0, 45)}]\n`);
          } else {
            process.stdout.write(`  ✗ SI [${cigar.id.slice(0, 45)}]\n`);
          }
        } catch {
          process.stdout.write(`  ✗ SI [${cigar.id.slice(0, 45)}] (err)\n`);
        }
        await sleep(400);
      }
      await pg.close().catch(() => {});
    }

    // ─── Famous Smoke: Try brand pages from sitemap ────────────────
    const fsTargets = getRemaining('Famous Smoke Shop');
    if (fsTargets.length) {
      console.log(`\n=== Famous Smoke (${fsTargets.length}): Trying brand-specific searches ===`);
      const pg = await browser.newPage();
      await pg.setUserAgent(UA);
      // Try loading individual search results with networkidle0
      for (const cigar of fsTargets) {
        const q = cigar.name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[''`]/g, '');
        try {
          await pg.goto(`https://www.famous-smoke.com/search?q=${encodeURIComponent(q)}`, {
            waitUntil: 'networkidle0', timeout: 25000
          });
          await sleep(3000);
          const links = await pg.evaluate(() => {
            const allLinks = [];
            // Try every possible product link selector
            document.querySelectorAll('a[href]').forEach(a => {
              const h = a.href;
              if (h && h.includes('famous-smoke.com') && !h.includes('/search') &&
                !h.includes('/sale/') && !h.includes('/promo/') && !h.includes('/cigaradvisor') &&
                (h.includes('-cigars-') || h.includes('-cigar-'))) {
                allLinks.push(h);
              }
            });
            return [...new Set(allLinks)];
          });
          if (links.length) {
            const url = bestMatch(cigar, links, u => u.split('/').pop(), 0.2) || links[0];
            results.push({ retailer: 'Famous Smoke Shop', id: cigar.id, directUrl: url });
            process.stdout.write(`  ✓ FS [${cigar.id.slice(0, 45)}]\n`);
          } else {
            process.stdout.write(`  ✗ FS [${cigar.id.slice(0, 45)}]\n`);
          }
        } catch {
          process.stdout.write(`  ✗ FS [${cigar.id.slice(0, 45)}] (err)\n`);
        }
        await sleep(500);
      }
      await pg.close().catch(() => {});
    }

  } finally {
    await browser.close().catch(() => {});
  }

  writeFileSync('/tmp/direct_url_results_r3.json', JSON.stringify(results, null, 2));
  const byRetailer = {};
  for (const r of results) byRetailer[r.retailer] = (byRetailer[r.retailer] || 0) + 1;
  console.log('\n=== ROUND 3 RESULTS ===');
  console.log(`Total new direct URLs: ${results.length}`);
  Object.entries(byRetailer).forEach(([r, n]) => console.log(`  ${r}: ${n}`));
}

main().catch(e => { console.error(e); process.exit(1); });
