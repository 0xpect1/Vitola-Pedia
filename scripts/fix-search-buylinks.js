/**
 * Replaces all search-URL buyLinks with direct product page URLs.
 * Handles: Famous Smoke, JR Cigars, Smoke Inn, Havana House (sitemaps via HTTP)
 *          Neptune (brand-page Puppeteer), CI, Cigar Page, C.Gars (Puppeteer search)
 *
 * Reads:  /tmp/search_url_issues.json  — grouped by retailer
 * Writes: /tmp/direct_url_results.json — [{retailer, id, directUrl}]
 */

import puppeteer from 'puppeteer';
import { readFileSync, writeFileSync } from 'fs';
import { setTimeout as sleep } from 'timers/promises';

const ISSUES = JSON.parse(readFileSync('/tmp/search_url_issues.json', 'utf8'));
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// ─── Fuzzy matching helpers ───────────────────────────────────────────────────

function norm(s) {
  return String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[''`]/g, '').replace(/[^a-z0-9 ]/gi, ' ').toLowerCase().trim();
}
function words(s) { return new Set(norm(s).split(/\s+/).filter(w => w.length > 1)); }
function matchScore(target, candidate) {
  const tw = words(target), cw = words(candidate);
  if (!tw.size) return 0;
  const hits = [...tw].filter(w => cw.has(w)).length;
  return hits / tw.size;
}
function bestMatch(cigar, urls, toText, minScore = 0.4) {
  const query = cigar.name + ' ' + cigar.brand;
  let best = null, bs = 0;
  for (const u of urls) {
    const s = matchScore(query, toText(u));
    if (s > bs) { bs = s; best = u; }
  }
  return bs >= minScore ? best : null;
}

// ─── HTTP fetch helper ────────────────────────────────────────────────────────

async function httpGet(url, timeout = 20000) {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': UA, 'Accept': '*/*' },
      signal: AbortSignal.timeout(timeout)
    });
    if (!res.ok) return null;
    return await res.text();
  } catch { return null; }
}

// ─── JR Cigars — sitemap-based ────────────────────────────────────────────────

async function loadJRSitemap() {
  console.log('  Loading JR Cigars sitemaps...');
  const allUrls = [];
  // JR has multiple product sitemaps: sitemap_0-product.xml, sitemap_1-product.xml, etc.
  for (let i = 0; i <= 5; i++) {
    const xml = await httpGet(`https://www.jrcigars.com/sitemap_${i}-product.xml`);
    if (!xml) break;
    const matches = [...xml.matchAll(/<loc>(https:\/\/www\.jrcigars\.com\/item\/[^<]+)<\/loc>/g)];
    if (!matches.length) break;
    allUrls.push(...matches.map(m => m[1]));
    console.log(`    sitemap_${i}: ${matches.length} URLs`);
    await sleep(200);
  }
  console.log(`  JR total: ${allUrls.length} product URLs`);
  return allUrls;
}

function findJRUrl(cigar, jrUrls) {
  // URL: /item/{brand}/{product}/{code}.html — extract brand+product for matching
  return bestMatch(cigar, jrUrls, u => {
    const parts = u.replace('https://www.jrcigars.com/item/', '').split('/');
    return parts.slice(0, 2).join(' ');  // brand + product slug
  }, 0.35);
}

// ─── Famous Smoke — sitemap-based ─────────────────────────────────────────────

async function loadFamousSitemap() {
  console.log('  Loading Famous Smoke sitemaps...');
  const allUrls = [];
  // Fetch the index to get sub-sitemap URLs
  const index = await httpGet('https://www.famous-smoke.com/media/sitemap/prod_sitemap.xml');
  if (!index) { console.log('  Failed to fetch Famous Smoke sitemap index'); return []; }
  const subMaps = [...index.matchAll(/<loc>(https:\/\/www\.famous-smoke\.com\/media\/sitemap\/[^<]+)<\/loc>/g)].map(m => m[1]);
  console.log(`  Found ${subMaps.length} sub-sitemaps`);
  for (const smUrl of subMaps) {
    const xml = await httpGet(smUrl);
    if (!xml) continue;
    const matches = [...xml.matchAll(/<loc>(https:\/\/www\.famous-smoke\.com\/[^<]+)<\/loc>/g)];
    // Filter to cigar product URLs (contain 'cigars')
    const cigarUrls = matches.map(m => m[1]).filter(u => u.includes('-cigars') || u.includes('/cigars'));
    allUrls.push(...cigarUrls);
    process.stdout.write(`    ${smUrl.split('/').pop()}: ${cigarUrls.length} cigar URLs\n`);
    await sleep(100);
  }
  console.log(`  Famous Smoke total: ${allUrls.length} cigar URLs`);
  return allUrls;
}

function findFamousUrl(cigar, fsUrls) {
  return bestMatch(cigar, fsUrls, u => {
    // /brand-model-size-cigars-wrapper-qty — extract everything before '-cigars'
    const slug = u.split('/').pop() || '';
    const idx = slug.indexOf('-cigars');
    return idx > 0 ? slug.slice(0, idx) : slug;
  }, 0.4);
}

// ─── Smoke Inn — sitemap-based ────────────────────────────────────────────────

async function loadSmokeInnSitemap() {
  console.log('  Loading Smoke Inn sitemap...');
  const xml = await httpGet('https://www.smokeinn.com/sitemap.xml');
  if (!xml) return [];
  const matches = [...xml.matchAll(/<loc>(https:\/\/www\.smokeinn\.com\/[^<]+)<\/loc>/g)];
  // Filter to likely single-cigar product pages (not samplers/deals, has .html or is specific slug)
  const cigarUrls = matches.map(m => m[1]).filter(u =>
    !u.includes('Deal') && !u.includes('Pack') && !u.includes('sampler') &&
    !u.includes('Collector') && !u.includes('Assortment') && !u.includes('Ashtray') &&
    (u.endsWith('.html') || /\/[A-Z][a-z].*-/.test(u))
  );
  console.log(`  Smoke Inn total: ${cigarUrls.length} product URLs`);
  return cigarUrls;
}

function findSmokeInnUrl(cigar, siUrls) {
  return bestMatch(cigar, siUrls, u => u.split('/').pop().replace('.html', ''), 0.4);
}

// ─── Havana House — product sitemap ──────────────────────────────────────────

async function loadHavanaSitemap() {
  console.log('  Loading Havana House sitemaps...');
  const allUrls = [];
  // Fetch index to find all product sitemaps
  const index = await httpGet('https://www.havanahouse.co.uk/sitemap.xml');
  const productSmaps = index
    ? [...index.matchAll(/<loc>(https:\/\/www\.havanahouse\.co\.uk\/product-sitemap[^<]*)<\/loc>/g)].map(m => m[1])
    : ['https://www.havanahouse.co.uk/product-sitemap.xml'];

  for (const smUrl of productSmaps) {
    const xml = await httpGet(smUrl);
    if (!xml) continue;
    const matches = [...xml.matchAll(/<loc>(https:\/\/www\.havanahouse\.co\.uk\/product\/[^<]+)<\/loc>/g)];
    allUrls.push(...matches.map(m => m[1]));
    console.log(`    ${smUrl.split('/').pop()}: ${matches.length} product URLs`);
    await sleep(100);
  }
  console.log(`  Havana House total: ${allUrls.length} product URLs`);
  return allUrls;
}

function findHavanaUrl(cigar, hhUrls) {
  return bestMatch(cigar, hhUrls, u => {
    const slug = u.replace('https://www.havanahouse.co.uk/product/', '').replace(/\/$/, '');
    return slug;
  }, 0.35);
}

// ─── Neptune — brand page Puppeteer ──────────────────────────────────────────

const NEPTUNE_BRAND_SLUGS = {
  'Ace Prime': 'ace-prime-cigar',
  'Viaje Cigar': 'viaje-cigar',
  'Viaje Cigars': 'viaje-cigar',
  'Viaje': 'viaje-cigar',
  '5 Vegas': '5-vegas-cigar',
  'Cornelius & Anthony': 'cornelius-anthony-cigar',
  'Ezra Zion': 'ezra-zion-cigar',
  'Dapper Cigar Co.': 'dapper-cigar',
  'Padrón': 'padron-cigar',
  'Padron': 'padron-cigar',
  'AJ Fernandez': 'aj-fernandez-cigar',
  'Perdomo': 'perdomo-cigar',
  'Perdomo Cigars': 'perdomo-cigar',
  'Drew Estate': 'drew-estate-cigar',
  'Dissident': 'dissident-cigar',
  'Serino Cigars': 'serino-cigar',
  'Mombacho': 'mombacho-cigar',
  'Mombacho Cigars': 'mombacho-cigar',
  'Carlos Toraño': 'carlos-torano-cigar',
  'Rocky Patel': 'rocky-patel-cigar',
  'Crowned Heads': 'crowned-heads-cigar',
  'Diesel': 'diesel-cigar',
  'Crux Cigars': 'crux-cigar',
  'Crux Cigar Co.': 'crux-cigar',
  'Amendola': 'amendola-cigar',
  'Ferio Tego': 'ferio-tego-cigar',
  'CAO': 'cao-cigar',
  'Warped Cigars': 'warped-cigar',
  'Illusione': 'illusione-cigar',
  'Arturo Fuente': 'arturo-fuente-cigar',
  'Cohiba (General Cigar)': 'cohiba-dominican-republic-cigar',
  'Aganorsa Leaf': 'aganorsa-leaf-cigar',
  'Davidoff': 'davidoff-cigar',
  'Ashton': 'ashton-cigar',
  'Tatuaje': 'tatuaje-cigar',
  'Gurkha': 'gurkha-cigar',
  'Balmoral': 'balmoral-cigar',
  'HVC': 'hvc-cigar',
  'Matilde': 'matilde-cigar',
  'J. Fuego': 'j-fuego-cigar',
  'Nestor Miranda': 'nestor-miranda-cigar',
  'Montecristo': 'montecristo-dominican-cigar',
  'E.P. Carrillo': 'ep-carrillo-cigar',
  'La Flor Dominicana': 'la-flor-dominicana-cigar',
  'Espinosa Cigars': 'espinosa-cigar',
  'Gran Habano': 'gran-habano-cigar',
  'La Herencia Cubana': 'la-herencia-cubana-cigar',
};

async function loadNeptuneBrandPages(page, targetCigars) {
  console.log('  Loading Neptune brand pages...');
  const brandUrls = {};
  const slugsSeen = new Set();

  for (const cigar of targetCigars) {
    const slug = NEPTUNE_BRAND_SLUGS[cigar.brand] ||
      norm(cigar.brand).replace(/\s+/g, '-') + '-cigar';
    if (slugsSeen.has(slug)) continue;
    slugsSeen.add(slug);
    try {
      await page.goto(`https://www.neptunecigar.com/${slug}`, { waitUntil: 'domcontentloaded', timeout: 15000 });
      await sleep(1000);
      const links = await page.evaluate(() =>
        [...new Set(Array.from(document.querySelectorAll('a[href]')).map(a => a.href)
          .filter(h => /neptunecigar\.com\/cigar\//.test(h)))]
      );
      brandUrls[slug] = links;
      process.stdout.write(`    ✓ ${slug} (${links.length} products)\n`);
    } catch {
      brandUrls[slug] = [];
      process.stdout.write(`    ✗ ${slug}\n`);
    }
  }
  return brandUrls;
}

function findNeptuneUrl(cigar, brandUrls) {
  const slug = NEPTUNE_BRAND_SLUGS[cigar.brand] ||
    norm(cigar.brand).replace(/\s+/g, '-') + '-cigar';
  const urls = brandUrls[slug] || [];
  return bestMatch(cigar, urls, u => u.replace('https://www.neptunecigar.com/cigar/', ''), 0.35);
}

// ─── CI — Puppeteer search ────────────────────────────────────────────────────

async function searchCI(page, cigar) {
  const q = cigar.name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[''`]/g, '');
  try {
    await page.goto(`https://www.cigarsinternational.com/search?q=${encodeURIComponent(q)}`, {
      waitUntil: 'domcontentloaded', timeout: 20000
    });
    await sleep(2500);
    const links = await page.evaluate(() =>
      [...new Set(Array.from(document.querySelectorAll('a[href]')).map(a => a.href)
        .filter(h => /cigarsinternational\.com\/p\//.test(h)))]
    );
    if (!links.length) return null;
    const best = bestMatch(cigar, links, u => u.split('/p/')[1] || '', 0.3);
    return best || links[0];
  } catch { return null; }
}

// ─── Cigar Page — Puppeteer search ───────────────────────────────────────────

async function searchCigarPage(page, cigar) {
  const q = cigar.name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[''`]/g, '');
  try {
    await page.goto(`https://www.cigarpage.com/catalogsearch/result/?q=${encodeURIComponent(q)}`, {
      waitUntil: 'domcontentloaded', timeout: 20000
    });
    await sleep(2500);
    const links = await page.evaluate(() =>
      [...new Set(Array.from(document.querySelectorAll('a.product-item-link, a.product.photo, .product-item a[href], .product-image-link, .product-item-name a')).map(a => a.href)
        .filter(h => h.includes('cigarpage.com') && !h.includes('catalogsearch') && !h.includes('/customer/') && !h.includes('/cart')))]
    );
    if (!links.length) {
      // Fallback: any cigarpage link that looks like a product
      const fallback = await page.evaluate(() =>
        [...new Set(Array.from(document.querySelectorAll('a[href]')).map(a => a.href)
          .filter(h => h.includes('cigarpage.com') && !h.includes('catalogsearch') && !h.includes('/customer/') && !h.includes('/cart') && !h.includes('/checkout') && h.split('/').filter(Boolean).length >= 4 && !h.includes('sampler') && !h.includes('page-plus')))]
      );
      if (!fallback.length) return null;
      return bestMatch(cigar, fallback, u => u.split('/').pop().replace('.html', ''), 0.3) || null;
    }
    return bestMatch(cigar, links, u => u.split('/').pop().replace('.html', ''), 0.3) || links[0];
  } catch { return null; }
}

// ─── C.Gars — Puppeteer search ───────────────────────────────────────────────

async function searchCGars(page, cigar) {
  const q = cigar.name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[''`]/g, '');
  try {
    await page.goto(`https://www.cgarsltd.co.uk/?s=${encodeURIComponent(q)}&post_type=product`, {
      waitUntil: 'domcontentloaded', timeout: 20000
    });
    await sleep(2000);
    const links = await page.evaluate(() =>
      [...new Set(Array.from(document.querySelectorAll('a[href]')).map(a => a.href)
        .filter(h => /-p-\d+\.html/.test(h)))]
    );
    if (!links.length) return null;
    return bestMatch(cigar, links, u => u.split('/').pop().replace(/-p-\d+\.html/, ''), 0.3) || links[0];
  } catch { return null; }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const results = []; // [{retailer, id, directUrl}]

  // ── Phase 1: Sitemap-based retailers (no Puppeteer) ──
  console.log('\n=== Phase 1: Sitemap-based retailers ===');

  // JR Cigars
  const jrTargets = ISSUES['JR Cigars'] || [];
  if (jrTargets.length) {
    const jrUrls = await loadJRSitemap();
    for (const cigar of jrTargets) {
      const url = findJRUrl(cigar, jrUrls);
      if (url) {
        results.push({ retailer: 'JR Cigars', id: cigar.id, directUrl: url });
        process.stdout.write(`  ✓ JR [${cigar.id.slice(0,45)}]\n`);
      } else {
        process.stdout.write(`  ✗ JR [${cigar.id.slice(0,45)}]\n`);
      }
    }
  }

  // Famous Smoke
  const fsTargets = ISSUES['Famous Smoke Shop'] || [];
  if (fsTargets.length) {
    const fsUrls = await loadFamousSitemap();
    for (const cigar of fsTargets) {
      const url = findFamousUrl(cigar, fsUrls);
      if (url) {
        results.push({ retailer: 'Famous Smoke Shop', id: cigar.id, directUrl: url });
        process.stdout.write(`  ✓ FS [${cigar.id.slice(0,45)}]\n`);
      } else {
        process.stdout.write(`  ✗ FS [${cigar.id.slice(0,45)}]\n`);
      }
    }
  }

  // Smoke Inn
  const siTargets = ISSUES['Smoke Inn'] || [];
  if (siTargets.length) {
    const siUrls = await loadSmokeInnSitemap();
    for (const cigar of siTargets) {
      const url = findSmokeInnUrl(cigar, siUrls);
      if (url) {
        results.push({ retailer: 'Smoke Inn', id: cigar.id, directUrl: url });
        process.stdout.write(`  ✓ SI [${cigar.id.slice(0,45)}]\n`);
      } else {
        process.stdout.write(`  ✗ SI [${cigar.id.slice(0,45)}]\n`);
      }
    }
  }

  // Havana House
  const hhTargets = ISSUES['Havana House'] || [];
  if (hhTargets.length) {
    const hhUrls = await loadHavanaSitemap();
    for (const cigar of hhTargets) {
      const url = findHavanaUrl(cigar, hhUrls);
      if (url) {
        results.push({ retailer: 'Havana House', id: cigar.id, directUrl: url });
        process.stdout.write(`  ✓ HH [${cigar.id.slice(0,45)}]\n`);
      } else {
        process.stdout.write(`  ✗ HH [${cigar.id.slice(0,45)}]\n`);
      }
    }
  }

  // Save Phase 1 results early
  writeFileSync('/tmp/direct_url_results_phase1.json', JSON.stringify(results, null, 2));
  console.log(`\nPhase 1 done: ${results.length} direct URLs found`);

  // ── Phase 2: Puppeteer-based retailers ──
  console.log('\n=== Phase 2: Puppeteer-based retailers ===');
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu']
  });

  try {
    // Neptune — brand pages
    const npTargets = ISSUES['Neptune Cigar'] || [];
    if (npTargets.length) {
      console.log('  Neptune brand pages...');
      const page = await browser.newPage();
      await page.setUserAgent(UA);
      await page.setRequestInterception(true);
      page.on('request', req => { if (['font','media'].includes(req.resourceType())) req.abort(); else req.continue(); });

      const brandUrls = await loadNeptuneBrandPages(page, npTargets);
      for (const cigar of npTargets) {
        const url = findNeptuneUrl(cigar, brandUrls);
        if (url) {
          results.push({ retailer: 'Neptune Cigar', id: cigar.id, directUrl: url });
          process.stdout.write(`  ✓ NP [${cigar.id.slice(0,45)}]\n`);
        } else {
          process.stdout.write(`  ✗ NP [${cigar.id.slice(0,45)}]\n`);
        }
      }
      await page.close().catch(() => {});
    }

    // CI — Puppeteer search (3 concurrent workers)
    const ciTargets = ISSUES['Cigars International'] || [];
    if (ciTargets.length) {
      console.log(`  CI search (${ciTargets.length} cigars)...`);
      const ciQueue = [...ciTargets];
      async function ciWorker() {
        const pg = await browser.newPage();
        await pg.setUserAgent(UA);
        await pg.setRequestInterception(true);
        pg.on('request', req => { if (['font','media'].includes(req.resourceType())) req.abort(); else req.continue(); });
        while (ciQueue.length) {
          const cigar = ciQueue.shift();
          const url = await searchCI(pg, cigar);
          if (url) {
            results.push({ retailer: 'Cigars International', id: cigar.id, directUrl: url });
            process.stdout.write(`  ✓ CI [${cigar.id.slice(0,45)}]\n`);
          } else {
            process.stdout.write(`  ✗ CI [${cigar.id.slice(0,45)}]\n`);
          }
          await sleep(300);
        }
        await pg.close().catch(() => {});
      }
      await Promise.all([ciWorker(), ciWorker(), ciWorker()]);
    }

    // Cigar Page — Puppeteer search (3 concurrent workers)
    const cpTargets = ISSUES['Cigar Page'] || [];
    if (cpTargets.length) {
      console.log(`  Cigar Page search (${cpTargets.length} cigars)...`);
      const cpQueue = [...cpTargets];
      async function cpWorker() {
        const pg = await browser.newPage();
        await pg.setUserAgent(UA);
        await pg.setRequestInterception(true);
        pg.on('request', req => { if (['font','media'].includes(req.resourceType())) req.abort(); else req.continue(); });
        while (cpQueue.length) {
          const cigar = cpQueue.shift();
          const url = await searchCigarPage(pg, cigar);
          if (url) {
            results.push({ retailer: 'Cigar Page', id: cigar.id, directUrl: url });
            process.stdout.write(`  ✓ CP [${cigar.id.slice(0,45)}]\n`);
          } else {
            process.stdout.write(`  ✗ CP [${cigar.id.slice(0,45)}]\n`);
          }
          await sleep(300);
        }
        await pg.close().catch(() => {});
      }
      await Promise.all([cpWorker(), cpWorker(), cpWorker()]);
    }

    // C.Gars — Puppeteer search
    const cgTargets = ISSUES['C.Gars Ltd'] || [];
    if (cgTargets.length) {
      console.log(`  C.Gars search (${cgTargets.length} cigars)...`);
      const cgQueue = [...cgTargets];
      async function cgWorker() {
        const pg = await browser.newPage();
        await pg.setUserAgent(UA);
        await pg.setRequestInterception(true);
        pg.on('request', req => { if (['font','media'].includes(req.resourceType())) req.abort(); else req.continue(); });
        while (cgQueue.length) {
          const cigar = cgQueue.shift();
          const url = await searchCGars(pg, cigar);
          if (url) {
            results.push({ retailer: 'C.Gars Ltd', id: cigar.id, directUrl: url });
            process.stdout.write(`  ✓ CG [${cigar.id.slice(0,45)}]\n`);
          } else {
            process.stdout.write(`  ✗ CG [${cigar.id.slice(0,45)}]\n`);
          }
          await sleep(300);
        }
        await pg.close().catch(() => {});
      }
      await Promise.all([cgWorker(), cgWorker()]);
    }

  } finally {
    await browser.close().catch(() => {});
  }

  writeFileSync('/tmp/direct_url_results.json', JSON.stringify(results, null, 2));
  const byRetailer = {};
  for (const r of results) byRetailer[r.retailer] = (byRetailer[r.retailer] || 0) + 1;
  console.log('\n=== RESULTS ===');
  console.log(`Total direct URLs found: ${results.length}`);
  Object.entries(byRetailer).forEach(([r, n]) => console.log(`  ${r}: ${n}`));
  console.log('\n✓ Saved to /tmp/direct_url_results.json');
}

main().catch(e => { console.error(e); process.exit(1); });
