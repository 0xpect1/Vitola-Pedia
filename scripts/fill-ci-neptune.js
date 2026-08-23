/**
 * Fill missing CI + Neptune links (separate from FS/JR which already completed).
 * Output: /tmp/fill_ci_neptune.json
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
function findBestUrl(cigar, urls, toSlug, minScore = 0.35) {
  const query = cigar.name;
  let best = null, bs = 0;
  for (const u of urls) {
    const s = matchScore(query, toSlug(u));
    if (s > bs) { bs = s; best = u; }
  }
  return bs >= minScore ? best : null;
}
function getMissing(retailer) {
  return NON_CUBAN.filter(c => !c.buyLinks || !c.buyLinks.some(l => l.retailer === retailer));
}

const results = [];

async function main() {
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu'],
    protocolTimeout: 90000
  });

  try {
    // ═══ CI ═══
    const ciMissing = getMissing('Cigars International');
    console.log(`=== CI: ${ciMissing.length} missing ===`);

    const page = await browser.newPage();
    await page.setUserAgent(UA);

    console.log('  Loading CI sitemap...');
    await page.goto('https://www.cigarsinternational.com/sitemap.xml', {
      waitUntil: 'networkidle2', timeout: 30000
    });
    const content = await page.content();
    let ciUrls = [...content.matchAll(/<loc>(https:\/\/www\.cigarsinternational\.com\/p\/[^<]+)<\/loc>/g)]
      .map(m => m[1]);

    if (ciUrls.length < 100) {
      const subs = [...content.matchAll(/<loc>(https:\/\/www\.cigarsinternational\.com\/[^<]*sitemap[^<]*)<\/loc>/g)]
        .map(m => m[1]);
      console.log(`  Found ${subs.length} sub-sitemaps`);
      for (const smUrl of subs) {
        try {
          await page.goto(smUrl, { waitUntil: 'networkidle2', timeout: 25000 });
          const c2 = await page.content();
          const urls = [...c2.matchAll(/<loc>(https:\/\/www\.cigarsinternational\.com\/p\/[^<]+)<\/loc>/g)].map(m => m[1]);
          ciUrls.push(...urls);
          console.log(`    ${smUrl.split('/').pop()}: ${urls.length}`);
          await sleep(500);
        } catch (e) { console.log(`    ${smUrl.split('/').pop()}: error`); }
      }
    }
    console.log(`  CI catalog: ${ciUrls.length} product URLs`);

    // Match
    const ciMatched = new Set();
    for (const cigar of ciMissing) {
      const url = findBestUrl(cigar, ciUrls, u => {
        const m = u.match(/\/p\/([^\/]+)/);
        return m ? m[1] : '';
      }, 0.35);
      if (url) {
        results.push({ retailer: 'Cigars International', id: cigar.id, url });
        ciMatched.add(cigar.id);
      }
    }
    console.log(`  CI sitemap matched: ${ciMatched.size}/${ciMissing.length}`);

    // Search remaining
    const ciRemaining = ciMissing.filter(c => !ciMatched.has(c.id));
    if (ciRemaining.length > 0) {
      console.log(`  CI search: ${ciRemaining.length} remaining...`);
      const queue = [...ciRemaining];
      async function ciWorker() {
        const pg = await browser.newPage();
        await pg.setUserAgent(UA);
        await pg.setRequestInterception(true);
        pg.on('request', req => {
          if (['font', 'media', 'image'].includes(req.resourceType())) req.abort();
          else req.continue();
        });
        while (queue.length) {
          const cigar = queue.shift();
          try {
            await pg.goto(`https://www.cigarsinternational.com/search?q=${encodeURIComponent(norm(cigar.name))}`, {
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
    const ciFound = results.filter(r => r.retailer === 'Cigars International').length;
    console.log(`  CI total: ${ciFound}/${ciMissing.length}`);
    await page.close().catch(() => {});

    writeFileSync('/tmp/fill_ci_neptune.json', JSON.stringify(results, null, 2));

    // ═══ Neptune ═══
    const npMissing = getMissing('Neptune Cigar');
    console.log(`\n=== Neptune: ${npMissing.length} missing ===`);

    const BRAND_SLUGS = {
      'Padrón': 'padron-cigar', 'Padron': 'padron-cigar', 'Oliva': 'oliva-cigar',
      'My Father Cigars': 'my-father-cigar', 'Drew Estate': 'drew-estate-cigar',
      'Arturo Fuente': 'arturo-fuente-cigar', 'Rocky Patel': 'rocky-patel-cigar',
      'Perdomo': 'perdomo-cigar', 'Ashton': 'ashton-cigar', 'Davidoff': 'davidoff-cigar',
      'Alec Bradley': 'alec-bradley-cigar', 'CAO': 'cao-cigar', 'Macanudo': 'macanudo-cigar',
      'Camacho': 'camacho-cigar', 'Tatuaje': 'tatuaje-cigar',
      'Crowned Heads': 'crowned-heads-cigar', 'Foundation Cigar Company': 'foundation-cigar',
      'Foundation Cigar Co.': 'foundation-cigar', 'Plasencia': 'plasencia-cigar',
      'Aganorsa Leaf': 'aganorsa-leaf-cigar', 'Dunbarton Tobacco & Trust': 'dunbarton-cigar',
      'AJ Fernandez': 'aj-fernandez-cigar', 'Espinosa Cigars': 'espinosa-cigar',
      'Nub': 'nub-cigar', 'La Flor Dominicana': 'la-flor-dominicana-cigar',
      'E.P. Carrillo': 'ep-carrillo-cigar', 'Warped Cigars': 'warped-cigar',
      'Illusione': 'illusione-cigar', 'Joya de Nicaragua': 'joya-de-nicaragua-cigar',
      'Southern Draw': 'southern-draw-cigar', 'Caldwell Cigar Co.': 'caldwell-cigar',
      'Gurkha': 'gurkha-cigar', 'Diesel': 'diesel-cigar', 'Punch': 'punch-cigar',
      'Montecristo': 'montecristo-dominican-cigar', 'H. Upmann': 'h-upmann-cigar',
      'Romeo y Julieta': 'romeo-y-julieta-cigar',
      'Cohiba (General Cigar)': 'cohiba-dominican-republic-cigar',
      'Man O\' War': 'man-o-war-cigar', 'Brick House': 'brick-house-cigar',
      'Acid': 'acid-cigar', 'La Aroma de Cuba': 'la-aroma-de-cuba-cigar',
      'Diamond Crown': 'diamond-crown-cigar', 'San Cristobal': 'san-cristobal-cigar',
      'Hoyo de Monterrey': 'hoyo-de-monterrey-cigar',
      'La Gloria Cubana': 'la-gloria-cubana-cigar', 'Villiger': 'villiger-cigar',
      'Henry Clay': 'henry-clay-cigar', 'Asylum': 'asylum-cigar',
      'Kristoff': 'kristoff-cigar', '5 Vegas': '5-vegas-cigar',
      'Room 101': 'room-101-cigar', 'La Palina': 'la-palina-cigar',
      'HVC': 'hvc-cigar', 'Crux Cigars': 'crux-cigar', 'Crux Cigar Co.': 'crux-cigar',
      'Ace Prime': 'ace-prime-cigar', 'Protocol Cigars': 'protocol-cigar',
      'Viaje Cigar': 'viaje-cigar', 'Viaje': 'viaje-cigar', 'Ezra Zion': 'ezra-zion-cigar',
      'Dapper Cigar Co.': 'dapper-cigar', 'Serino Cigars': 'serino-cigar',
      'Cornelius & Anthony': 'cornelius-anthony-cigar', 'Mombacho': 'mombacho-cigar',
      'Balmoral': 'balmoral-cigar', 'Fratello': 'fratello-cigar', 'Eiroa': 'eiroa-cigar',
      'Aging Room': 'aging-room-cigar', 'Leaf by Oscar': 'leaf-by-oscar-cigar',
      'Nat Sherman': 'nat-sherman-cigar', 'Dissident': 'dissident-cigar',
      'Amendola': 'amendola-cigar', 'Carlos Toraño': 'carlos-torano-cigar',
      'J. Fuego': 'j-fuego-cigar', 'Matilde': 'matilde-cigar', 'Quesada': 'quesada-cigar',
      'Gran Habano': 'gran-habano-cigar', 'Nestor Miranda': 'nestor-miranda-cigar',
      'Black Label Trading Company': 'black-label-trading-cigar',
      'RoMa Craft Tobac': 'roma-craft-cigar', 'AVO': 'avo-cigar',
      'Cain by Oliva': 'cain-cigar', 'La Herencia Cubana': 'la-herencia-cubana-cigar',
    };

    const npPage = await browser.newPage();
    await npPage.setUserAgent(UA);
    await npPage.setRequestInterception(true);
    npPage.on('request', req => {
      if (['font', 'media', 'image'].includes(req.resourceType())) req.abort();
      else req.continue();
    });

    const allNPUrls = new Set();
    const slugsSeen = new Set();
    const brandsNeeded = new Set(npMissing.map(c => c.brand));

    for (const brand of brandsNeeded) {
      const slug = BRAND_SLUGS[brand] || norm(brand).replace(/\s+/g, '-') + '-cigar';
      if (slugsSeen.has(slug)) continue;
      slugsSeen.add(slug);
      try {
        await npPage.goto(`https://www.neptunecigar.com/${slug}`, {
          waitUntil: 'domcontentloaded', timeout: 15000
        });
        await sleep(1200);
        const links = await npPage.evaluate(() =>
          [...new Set(Array.from(document.querySelectorAll('a[href]')).map(a => a.href)
            .filter(h => /neptunecigar\.com\/cigar\//.test(h)))]
        );
        for (const l of links) allNPUrls.add(l);
        if (links.length > 0) process.stdout.write(`  ${slug}: ${links.length}\n`);
      } catch {}
      await sleep(300);
    }
    await npPage.close().catch(() => {});
    console.log(`  Neptune: ${allNPUrls.size} cigar URLs`);

    const npUrlArr = [...allNPUrls];
    const npMatched = new Set();
    for (const cigar of npMissing) {
      const url = findBestUrl(cigar, npUrlArr, u =>
        u.replace('https://www.neptunecigar.com/cigar/', ''), 0.35);
      if (url) {
        results.push({ retailer: 'Neptune Cigar', id: cigar.id, url });
        npMatched.add(cigar.id);
      }
    }
    console.log(`  Neptune matched: ${npMatched.size}/${npMissing.length}`);

    // Search remaining
    const npRemaining = npMissing.filter(c => !npMatched.has(c.id));
    if (npRemaining.length > 0) {
      console.log(`  Neptune search: ${npRemaining.length} remaining...`);
      const queue = [...npRemaining];
      async function npWorker() {
        const pg = await browser.newPage();
        await pg.setUserAgent(UA);
        await pg.setRequestInterception(true);
        pg.on('request', req => {
          if (['font', 'media', 'image'].includes(req.resourceType())) req.abort();
          else req.continue();
        });
        while (queue.length) {
          const cigar = queue.shift();
          try {
            await pg.goto(`https://www.neptunecigar.com/search?q=${encodeURIComponent(norm(cigar.name))}`, {
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
              process.stdout.write(`  ✓ NP [${cigar.id.slice(0, 45)}]\n`);
            } else {
              process.stdout.write(`  ✗ NP [${cigar.id.slice(0, 45)}]\n`);
            }
          } catch {
            process.stdout.write(`  ✗ NP [${cigar.id.slice(0, 45)}] (err)\n`);
          }
          await sleep(400);
        }
        await pg.close().catch(() => {});
      }
      await Promise.all([npWorker(), npWorker()]);
    }
    const npFound = results.filter(r => r.retailer === 'Neptune Cigar').length;
    console.log(`  Neptune total: ${npFound}/${npMissing.length}`);

  } finally {
    await browser.close().catch(() => {});
  }

  writeFileSync('/tmp/fill_ci_neptune.json', JSON.stringify(results, null, 2));
  const byRetailer = {};
  for (const r of results) byRetailer[r.retailer] = (byRetailer[r.retailer] || 0) + 1;
  console.log('\n=== RESULTS ===');
  console.log(`Total: ${results.length}`);
  Object.entries(byRetailer).forEach(([r, n]) => console.log(`  ${r}: ${n}`));
}

main().catch(e => { console.error(e); process.exit(1); });
