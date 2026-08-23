/**
 * Fills missing buyLinks for Famous Smoke, CI, Neptune, JR.
 *
 * Famous Smoke: sitemap (all products including bundles/packs)
 * CI: sitemap via Puppeteer (3000+ products)
 * Neptune: brand pages via Puppeteer
 * JR: sitemap + Puppeteer search fallback
 *
 * Output: /tmp/fill_missing_links.json  [{retailer, id, url}]
 */

import puppeteer from 'puppeteer';
import { readFileSync, writeFileSync } from 'fs';
import { setTimeout as sleep } from 'timers/promises';

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const SRC = readFileSync('./js/data.js', 'utf8');
eval(SRC.replace(/^const CIGARS/m, 'globalThis.CIGARS'));
const CIGARS = globalThis.CIGARS;
const NON_CUBAN = CIGARS.filter(c => c.origin !== 'Cuba');

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

function getMissing(retailer) {
  return NON_CUBAN.filter(c => !c.buyLinks || !c.buyLinks.some(l => l.retailer === retailer));
}

function findBestUrl(cigar, urls, toSlug, minScore = 0.35) {
  const query = cigar.name;
  let best = null, bs = 0;
  for (const u of urls) {
    const s = matchScore(query, toSlug(u));
    if (s > bs) { bs = s; best = u; }
  }
  return bs >= minScore ? best : null;
}

async function httpGet(url) {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(15000)
    });
    if (!res.ok) return null;
    return await res.text();
  } catch { return null; }
}

const results = [];

async function main() {
  // ═══════════════════════════════════════════════════════════════════
  // FAMOUS SMOKE — sitemap (all products including bundles/packs)
  // ═══════════════════════════════════════════════════════════════════
  const fsMissing = getMissing('Famous Smoke Shop');
  console.log(`\n=== Famous Smoke: ${fsMissing.length} missing ===`);

  // Load full sitemap (all 8 sub-sitemaps)
  console.log('  Loading Famous Smoke sitemaps...');
  let fsUrls = [];
  const index = await httpGet('https://www.famous-smoke.com/media/sitemap/prod_sitemap.xml');
  if (index) {
    const subMaps = [...index.matchAll(/<loc>(https:\/\/www\.famous-smoke\.com\/media\/sitemap\/[^<]+)<\/loc>/g)].map(m => m[1]);
    for (const smUrl of subMaps) {
      const xml = await httpGet(smUrl);
      if (!xml) continue;
      const urls = [...xml.matchAll(/<loc>(https:\/\/www\.famous-smoke\.com\/[^<]+)<\/loc>/g)].map(m => m[1]);
      // Include ALL product URLs (cigars, packs, bundles)
      const productUrls = urls.filter(u => {
        const slug = u.split('/').pop();
        return slug && slug.includes('-') && !u.includes('/media/') && !u.includes('/cigaradvisor');
      });
      fsUrls.push(...productUrls);
      await sleep(100);
    }
  }
  console.log(`  Famous Smoke catalog: ${fsUrls.length} product URLs`);

  for (const cigar of fsMissing) {
    const url = findBestUrl(cigar, fsUrls, u => {
      const slug = u.split('/').pop() || '';
      return slug;
    }, 0.35);
    if (url) {
      results.push({ retailer: 'Famous Smoke Shop', id: cigar.id, url });
      process.stdout.write(`  ✓ FS [${cigar.id.slice(0, 45)}]\n`);
    } else {
      process.stdout.write(`  ✗ FS [${cigar.id.slice(0, 45)}]\n`);
    }
  }
  const fsFound = results.filter(r => r.retailer === 'Famous Smoke Shop').length;
  console.log(`  Famous Smoke: found ${fsFound}/${fsMissing.length}`);

  // Save checkpoint
  writeFileSync('/tmp/fill_missing_links.json', JSON.stringify(results, null, 2));

  // ═══════════════════════════════════════════════════════════════════
  // JR CIGARS — sitemap + Puppeteer search
  // ═══════════════════════════════════════════════════════════════════
  const jrMissing = getMissing('JR Cigars');
  console.log(`\n=== JR Cigars: ${jrMissing.length} missing ===`);

  // Load JR sitemap
  console.log('  Loading JR sitemap...');
  let jrUrls = [];
  for (let i = 0; i <= 5; i++) {
    const xml = await httpGet(`https://www.jrcigars.com/sitemap_${i}-product.xml`);
    if (!xml) break;
    const matches = [...xml.matchAll(/<loc>(https:\/\/www\.jrcigars\.com\/item\/[^<]+)<\/loc>/g)];
    if (!matches.length) break;
    jrUrls.push(...matches.map(m => m[1]));
    await sleep(200);
  }
  console.log(`  JR sitemap: ${jrUrls.length} product URLs`);

  // Phase 1: sitemap matching
  const jrSitemapMatched = new Set();
  for (const cigar of jrMissing) {
    const url = findBestUrl(cigar, jrUrls, u => {
      const parts = u.replace('https://www.jrcigars.com/item/', '').split('/');
      return parts.slice(0, 2).join(' ');
    }, 0.35);
    if (url) {
      results.push({ retailer: 'JR Cigars', id: cigar.id, url });
      jrSitemapMatched.add(cigar.id);
      process.stdout.write(`  ✓ JR-sitemap [${cigar.id.slice(0, 40)}]\n`);
    }
  }
  console.log(`  JR sitemap matched: ${jrSitemapMatched.size}/${jrMissing.length}`);

  // Phase 2: Puppeteer search for remaining
  const jrStillMissing = jrMissing.filter(c => !jrSitemapMatched.has(c.id));
  if (jrStillMissing.length > 0) {
    console.log(`  JR Puppeteer search: ${jrStillMissing.length} remaining...`);
    const browser = await puppeteer.launch({
      headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu']
    });
    const jrQueue = [...jrStillMissing];
    async function jrWorker() {
      const pg = await browser.newPage();
      await pg.setUserAgent(UA);
      await pg.setRequestInterception(true);
      pg.on('request', req => {
        if (['font', 'media', 'image'].includes(req.resourceType())) req.abort();
        else req.continue();
      });
      while (jrQueue.length) {
        const cigar = jrQueue.shift();
        const q = norm(cigar.name);
        try {
          await pg.goto(`https://www.jrcigars.com/search?term=${encodeURIComponent(q)}`, {
            waitUntil: 'domcontentloaded', timeout: 15000
          });
          await sleep(2000);
          const links = await pg.evaluate(() =>
            [...new Set(Array.from(document.querySelectorAll('a[href]')).map(a => a.href)
              .filter(h => /jrcigars\.com\/item\//.test(h)))]
          );
          if (links.length) {
            const url = findBestUrl(cigar, links, u =>
              u.replace('https://www.jrcigars.com/item/', '').replace('.html', ''), 0.25) || links[0];
            results.push({ retailer: 'JR Cigars', id: cigar.id, url });
            process.stdout.write(`  ✓ JR-search [${cigar.id.slice(0, 40)}]\n`);
          } else {
            process.stdout.write(`  ✗ JR [${cigar.id.slice(0, 40)}]\n`);
          }
        } catch {
          process.stdout.write(`  ✗ JR [${cigar.id.slice(0, 40)}] (err)\n`);
        }
        await sleep(400);
      }
      await pg.close().catch(() => {});
    }
    await Promise.all([jrWorker(), jrWorker(), jrWorker()]);
    await browser.close().catch(() => {});
  }
  const jrFound = results.filter(r => r.retailer === 'JR Cigars').length;
  console.log(`  JR total: found ${jrFound}/${jrMissing.length}`);

  // Save checkpoint
  writeFileSync('/tmp/fill_missing_links.json', JSON.stringify(results, null, 2));

  // ═══════════════════════════════════════════════════════════════════
  // CI — sitemap via Puppeteer
  // ═══════════════════════════════════════════════════════════════════
  const ciMissing = getMissing('Cigars International');
  console.log(`\n=== CI: ${ciMissing.length} missing ===`);

  {
    const browser = await puppeteer.launch({
      headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu']
    });
    const page = await browser.newPage();
    await page.setUserAgent(UA);

    // Fetch CI sitemap
    console.log('  Loading CI sitemap via Puppeteer...');
    await page.goto('https://www.cigarsinternational.com/sitemap.xml', {
      waitUntil: 'networkidle2', timeout: 25000
    });
    const ciSitemapContent = await page.content();
    let ciUrls = [...ciSitemapContent.matchAll(/<loc>(https:\/\/www\.cigarsinternational\.com\/p\/[^<]+)<\/loc>/g)]
      .map(m => m[1]);

    // Check sub-sitemaps
    if (ciUrls.length < 100) {
      const subMaps = [...ciSitemapContent.matchAll(/<loc>(https:\/\/www\.cigarsinternational\.com\/[^<]*sitemap[^<]*)<\/loc>/g)]
        .map(m => m[1]);
      for (const smUrl of subMaps) {
        try {
          await page.goto(smUrl, { waitUntil: 'networkidle2', timeout: 20000 });
          const content = await page.content();
          const urls = [...content.matchAll(/<loc>(https:\/\/www\.cigarsinternational\.com\/p\/[^<]+)<\/loc>/g)]
            .map(m => m[1]);
          ciUrls.push(...urls);
          await sleep(300);
        } catch {}
      }
    }
    console.log(`  CI sitemap: ${ciUrls.length} product URLs`);
    await page.close().catch(() => {});

    // Phase 1: sitemap matching
    const ciSitemapMatched = new Set();
    for (const cigar of ciMissing) {
      const url = findBestUrl(cigar, ciUrls, u => {
        const match = u.match(/\/p\/([^\/]+)/);
        return match ? match[1] : '';
      }, 0.35);
      if (url) {
        results.push({ retailer: 'Cigars International', id: cigar.id, url });
        ciSitemapMatched.add(cigar.id);
        process.stdout.write(`  ✓ CI-sitemap [${cigar.id.slice(0, 40)}]\n`);
      }
    }
    console.log(`  CI sitemap matched: ${ciSitemapMatched.size}/${ciMissing.length}`);

    // Phase 2: Puppeteer search for remaining
    const ciStillMissing = ciMissing.filter(c => !ciSitemapMatched.has(c.id));
    if (ciStillMissing.length > 0) {
      console.log(`  CI Puppeteer search: ${ciStillMissing.length} remaining...`);
      const ciQueue = [...ciStillMissing];
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
              const url = findBestUrl(cigar, links, u => u.split('/p/')[1] || '', 0.25) || links[0];
              results.push({ retailer: 'Cigars International', id: cigar.id, url });
              process.stdout.write(`  ✓ CI-search [${cigar.id.slice(0, 40)}]\n`);
            } else {
              process.stdout.write(`  ✗ CI [${cigar.id.slice(0, 40)}]\n`);
            }
          } catch {
            process.stdout.write(`  ✗ CI [${cigar.id.slice(0, 40)}] (err)\n`);
          }
          await sleep(500);
        }
        await pg.close().catch(() => {});
      }
      await Promise.all([ciWorker(), ciWorker()]);
    }
    await browser.close().catch(() => {});
  }
  const ciFound = results.filter(r => r.retailer === 'Cigars International').length;
  console.log(`  CI total: found ${ciFound}/${ciMissing.length}`);

  // Save checkpoint
  writeFileSync('/tmp/fill_missing_links.json', JSON.stringify(results, null, 2));

  // ═══════════════════════════════════════════════════════════════════
  // NEPTUNE — brand pages + search via Puppeteer
  // ═══════════════════════════════════════════════════════════════════
  const npMissing = getMissing('Neptune Cigar');
  console.log(`\n=== Neptune: ${npMissing.length} missing ===`);

  {
    const browser = await puppeteer.launch({
      headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu']
    });

    // Get full catalog from any page (Neptune loads all cigar links)
    const page = await browser.newPage();
    await page.setUserAgent(UA);

    // Try multiple brand pages to accumulate all cigar URLs
    const BRAND_SLUGS = {
      'Padrón': 'padron-cigar', 'Padron': 'padron-cigar',
      'Oliva': 'oliva-cigar', 'My Father Cigars': 'my-father-cigar',
      'Drew Estate': 'drew-estate-cigar', 'Arturo Fuente': 'arturo-fuente-cigar',
      'Rocky Patel': 'rocky-patel-cigar', 'Perdomo': 'perdomo-cigar',
      'Ashton': 'ashton-cigar', 'Davidoff': 'davidoff-cigar',
      'Alec Bradley': 'alec-bradley-cigar', 'CAO': 'cao-cigar',
      'Macanudo': 'macanudo-cigar', 'Camacho': 'camacho-cigar',
      'Tatuaje': 'tatuaje-cigar', 'Crowned Heads': 'crowned-heads-cigar',
      'Foundation Cigar Company': 'foundation-cigar', 'Foundation Cigar Co.': 'foundation-cigar',
      'Plasencia': 'plasencia-cigar', 'Aganorsa Leaf': 'aganorsa-leaf-cigar',
      'Dunbarton Tobacco & Trust': 'dunbarton-cigar', 'AJ Fernandez': 'aj-fernandez-cigar',
      'Espinosa Cigars': 'espinosa-cigar', 'Espinosa Premium Cigars': 'espinosa-cigar',
      'Nub': 'nub-cigar', 'La Flor Dominicana': 'la-flor-dominicana-cigar',
      'E.P. Carrillo': 'ep-carrillo-cigar', 'Warped Cigars': 'warped-cigar',
      'Illusione': 'illusione-cigar', 'Joya de Nicaragua': 'joya-de-nicaragua-cigar',
      'Southern Draw': 'southern-draw-cigar', 'Caldwell Cigar Co.': 'caldwell-cigar',
      'Gurkha': 'gurkha-cigar', 'Diesel': 'diesel-cigar',
      'Punch': 'punch-cigar', 'Montecristo': 'montecristo-dominican-cigar',
      'H. Upmann': 'h-upmann-cigar', 'Romeo y Julieta': 'romeo-y-julieta-cigar',
      'Cohiba (General Cigar)': 'cohiba-dominican-republic-cigar',
      'Man O\' War': 'man-o-war-cigar', 'Brick House': 'brick-house-cigar',
      'Acid': 'acid-cigar', 'La Aroma de Cuba': 'la-aroma-de-cuba-cigar',
      'Diamond Crown': 'diamond-crown-cigar', 'San Cristobal': 'san-cristobal-cigar',
      'Hoyo de Monterrey': 'hoyo-de-monterrey-cigar',
      'La Gloria Cubana': 'la-gloria-cubana-cigar',
      'Villiger': 'villiger-cigar', 'Henry Clay': 'henry-clay-cigar',
      'Asylum': 'asylum-cigar', 'Kristoff': 'kristoff-cigar',
      '5 Vegas': '5-vegas-cigar', 'Room 101': 'room-101-cigar',
      'La Palina': 'la-palina-cigar', 'HVC': 'hvc-cigar',
      'Crux Cigars': 'crux-cigar', 'Crux Cigar Co.': 'crux-cigar',
      'Ace Prime': 'ace-prime-cigar', 'Protocol Cigars': 'protocol-cigar',
      'Protocol': 'protocol-cigar', 'Viaje Cigar': 'viaje-cigar', 'Viaje': 'viaje-cigar',
      'Ezra Zion': 'ezra-zion-cigar', 'Dapper Cigar Co.': 'dapper-cigar',
      'Serino Cigars': 'serino-cigar', 'Cornelius & Anthony': 'cornelius-anthony-cigar',
      'Mombacho': 'mombacho-cigar', 'Mombacho Cigars': 'mombacho-cigar',
      'Balmoral': 'balmoral-cigar', 'Fratello': 'fratello-cigar',
      'Eiroa': 'eiroa-cigar', 'Aging Room': 'aging-room-cigar',
      'Leaf by Oscar': 'leaf-by-oscar-cigar', 'Nat Sherman': 'nat-sherman-cigar',
      'Dissident': 'dissident-cigar', 'Amendola': 'amendola-cigar',
      'Carlos Toraño': 'carlos-torano-cigar', 'J. Fuego': 'j-fuego-cigar',
      'Matilde': 'matilde-cigar', 'Quesada': 'quesada-cigar',
      'Gran Habano': 'gran-habano-cigar', 'Nestor Miranda': 'nestor-miranda-cigar',
      'Black Label Trading Company': 'black-label-trading-cigar',
      'RoMa Craft Tobac': 'roma-craft-cigar',
      'AVO': 'avo-cigar', 'Cain by Oliva': 'cain-cigar',
      'La Herencia Cubana': 'la-herencia-cubana-cigar',
    };

    const allNPUrls = new Set();
    const brandsNeeded = new Set();
    for (const c of npMissing) brandsNeeded.add(c.brand);
    const slugsSeen = new Set();

    for (const brand of brandsNeeded) {
      const slug = BRAND_SLUGS[brand] || norm(brand).replace(/\s+/g, '-') + '-cigar';
      if (slugsSeen.has(slug)) continue;
      slugsSeen.add(slug);
      try {
        await page.goto(`https://www.neptunecigar.com/${slug}`, {
          waitUntil: 'domcontentloaded', timeout: 15000
        });
        await sleep(1200);
        const links = await page.evaluate(() =>
          [...new Set(Array.from(document.querySelectorAll('a[href]')).map(a => a.href)
            .filter(h => /neptunecigar\.com\/cigar\//.test(h)))]
        );
        for (const l of links) allNPUrls.add(l);
        if (links.length > 0) process.stdout.write(`  ${slug}: ${links.length} products\n`);
      } catch {}
      await sleep(300);
    }
    await page.close().catch(() => {});
    console.log(`  Neptune catalog: ${allNPUrls.size} cigar URLs from brand pages`);

    const npUrlArr = [...allNPUrls];
    const npSitemapMatched = new Set();
    for (const cigar of npMissing) {
      const url = findBestUrl(cigar, npUrlArr, u =>
        u.replace('https://www.neptunecigar.com/cigar/', ''), 0.35);
      if (url) {
        results.push({ retailer: 'Neptune Cigar', id: cigar.id, url });
        npSitemapMatched.add(cigar.id);
        process.stdout.write(`  ✓ NP [${cigar.id.slice(0, 45)}]\n`);
      }
    }
    console.log(`  Neptune brand-page matched: ${npSitemapMatched.size}/${npMissing.length}`);

    // Search for remaining
    const npStillMissing = npMissing.filter(c => !npSitemapMatched.has(c.id));
    if (npStillMissing.length > 0) {
      console.log(`  Neptune Puppeteer search: ${npStillMissing.length} remaining...`);
      const npQueue = [...npStillMissing];
      async function npWorker() {
        const pg = await browser.newPage();
        await pg.setUserAgent(UA);
        await pg.setRequestInterception(true);
        pg.on('request', req => {
          if (['font', 'media', 'image'].includes(req.resourceType())) req.abort();
          else req.continue();
        });
        while (npQueue.length) {
          const cigar = npQueue.shift();
          const q = norm(cigar.name);
          try {
            await pg.goto(`https://www.neptunecigar.com/search?q=${encodeURIComponent(q)}`, {
              waitUntil: 'domcontentloaded', timeout: 15000
            });
            await sleep(2000);
            const links = await pg.evaluate(() =>
              [...new Set(Array.from(document.querySelectorAll('a[href]')).map(a => a.href)
                .filter(h => /neptunecigar\.com\/cigar\//.test(h)))]
            );
            if (links.length) {
              const url = findBestUrl(cigar, links, u =>
                u.replace('https://www.neptunecigar.com/cigar/', ''), 0.25) || links[0];
              results.push({ retailer: 'Neptune Cigar', id: cigar.id, url });
              process.stdout.write(`  ✓ NP-search [${cigar.id.slice(0, 40)}]\n`);
            } else {
              process.stdout.write(`  ✗ NP [${cigar.id.slice(0, 40)}]\n`);
            }
          } catch {
            process.stdout.write(`  ✗ NP [${cigar.id.slice(0, 40)}] (err)\n`);
          }
          await sleep(400);
        }
        await pg.close().catch(() => {});
      }
      await Promise.all([npWorker(), npWorker()]);
    }
    await browser.close().catch(() => {});
  }
  const npFound = results.filter(r => r.retailer === 'Neptune Cigar').length;
  console.log(`  Neptune total: found ${npFound}/${npMissing.length}`);

  // ═══════════════════════════════════════════════════════════════════
  // FINAL REPORT
  // ═══════════════════════════════════════════════════════════════════
  writeFileSync('/tmp/fill_missing_links.json', JSON.stringify(results, null, 2));
  const byRetailer = {};
  for (const r of results) byRetailer[r.retailer] = (byRetailer[r.retailer] || 0) + 1;
  console.log('\n=== FINAL RESULTS ===');
  console.log(`Total new links: ${results.length}`);
  Object.entries(byRetailer).forEach(([r, n]) => console.log(`  ${r}: ${n}`));
}

main().catch(e => { console.error(e); process.exit(1); });
