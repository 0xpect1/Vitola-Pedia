/**
 * Final comprehensive image scraper for remaining 75 cigars.
 * Sources: Holt's (direct HTTP), halfwheel.com (direct HTTP),
 *          Ezra Zion Store (direct HTTP), Neptune Cigar (Puppeteer),
 *          Havana House (Puppeteer) for Cubans.
 *
 * Reads:  /tmp/missing_images.json
 * Output: /tmp/final_images.json [{id, image, retailer}]
 */

import puppeteer from 'puppeteer';
import { readFileSync, writeFileSync } from 'fs';
import { setTimeout as sleep } from 'timers/promises';

const DATA  = JSON.parse(readFileSync('/tmp/missing_images.json', 'utf8'));
const HOLTS = JSON.parse(readFileSync('/tmp/holts_products.json', 'utf8'));

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// ─── URL MAPPINGS (highest confidence first) ─────────────────────────────────

// Neptune Cigar product page → og:image (use Puppeteer)
const NEPTUNE_MAP = {
  'ace-prime-lucia-toro':                      'https://www.neptunecigar.com/cigar/ace-prime-maria-lucia',
  'ace-prime-lucia-robusto':                   'https://www.neptunecigar.com/cigar/ace-prime-maria-lucia',
  'ace-prime-fiat-lux-toro':                   'https://www.neptunecigar.com/cigar/fiat-lux-by-luciano',
  'espinosa-murcielago-toro':                  'https://www.neptunecigar.com/cigar/murcielago',
  'espinosa-601-orange-label-toro':            'https://www.neptunecigar.com/cigar/601-habano',
  'cornelius-anthony-daddy-mac-toro':          'https://www.neptunecigar.com/cigar/cornelius-and-anthony-daddy-mac',
  'cornelius-anthony-aerial-robusto':          'https://www.neptunecigar.com/cigar/cornelius-and-anthony-aerial',
  'cornelius-anthony-venganza-judge':          'https://www.neptunecigar.com/cigar/cornelius-and-anthony-aerial',
  'principle-cigars-accomplice-habano-robusto':'https://www.neptunecigar.com/cigar/accomplice-classic',
  'principle-cigars-accomplice-habano-toro':   'https://www.neptunecigar.com/cigar/accomplice-classic',
  'principle-cigars-accomplice-connecticut-robusto':'https://www.neptunecigar.com/cigar/accomplice-connecticut',
  'protocol-gold-themis-toro':                 'https://www.neptunecigar.com/cigar/protocol-gold-themis',
};

// Ezra Zion official store → og:image (direct HTTP)
const EZ_MAP = {
  'ezra-zion-fhk-toro':           'https://www.ezrazionstore.com/collections/cigars/products/fhk',
  'ezra-zion-tantrum-toro':       'https://www.ezrazionstore.com/collections/cigars/products/tantrum',
  'ezra-zion-possession-robusto': 'https://www.ezrazionstore.com/collections/cigars/products/ame-bp',
  'ezra-zion-section-1-robusto':  'https://www.ezrazionstore.com/collections/cigars/products/house-blend',
  'ezra-zion-inception-robusto':  'https://www.ezrazionstore.com/collections/cigars/products/jamais-vu-primera-edicion',
  'ezra-zion-collaboration-robusto':'https://www.ezrazionstore.com/collections/cigars/products/ezra-zion-blending-sessions',
  'ezra-zion-encore-robusto':     'https://www.ezrazionstore.com/collections/cigars/products/eminence-tercera-edicion',
  'ezra-zion-commencement-toro':  'https://www.ezrazionstore.com/collections/cigars/products/fhk',
};

// halfwheel.com review/collection pages → og:image (direct HTTP)
const HW_MAP = {
  // Viaje
  'viaje-skull-and-bones-robusto':     'https://halfwheel.com/collections/viaje-skull-and-bones/',
  'viaje-skull-and-bones-frank-castle':'https://halfwheel.com/collections/viaje-skull-and-bones/',
  'viaje-skull-and-bones-ten-ton-tess':'https://halfwheel.com/collections/viaje-skull-and-bones/',
  'viaje-skull-bones-el-catrin':       'https://halfwheel.com/collections/viaje-skull-and-bones/',
  'viaje-honey-hand-grenades-toro':    'https://halfwheel.com/viaje-honey-hand-grenades/',
  'viaje-honey-hand-grenades':         'https://halfwheel.com/viaje-honey-hand-grenades/',
  'viaje-circa-robusto':               'https://halfwheel.com/viaje-circa/',
  'viaje-wlp-robusto':                 'https://halfwheel.com/viaje-wlp/',
  'viaje-exclusivo-florida-robusto':   'https://halfwheel.com/viaje-exclusivo-reserva-robusto/122396/',
  'viaje-honey-and-money-toro':        'https://halfwheel.com/viaje-honey-hand-grenades/',
  'viaje-oro-reserva-robusto':         'https://halfwheel.com/viaje-oro/',
  'viaje-exclusivo-nicaragua-toro':    'https://halfwheel.com/viaje-exclusivo-nicaragua/',
  // Protocol
  'protocol-probable-cause-toro':      'https://halfwheel.com/protocol-probable-cause/',
  'protocol-probable-cause-lancero':   'https://halfwheel.com/protocol-probable-cause/',
  'protocol-blue-line-toro':           'https://halfwheel.com/protocol-blue-line-toro/',
  'protocol-forgotten-soldier-toro':   'https://halfwheel.com/protocol-blue-line-toro/',
  'protocol-john-doe-20':              'https://halfwheel.com/protocol-probable-cause/',
  // Dunbarton
  'dunbarton-sobremesa-toro':          'https://halfwheel.com/sobremesa/',
  'dunbarton-sobremesa-cervantes-fino':'https://halfwheel.com/sobremesa/',
  // Dapper
  'dapper-el-borracho-toro':           'https://halfwheel.com/el-borracho-san-andres-belicoso/413430/',
  'dapper-desvalido-robusto':          'https://halfwheel.com/desvalido-toro/384879/',
  'dapper-cubo-sumatra-toro':          'https://halfwheel.com/cubo-sumatra-robusto/297544/',
  // Ventura
  'ventura-archetype-initiation-toro': 'https://halfwheel.com/archetype-initiation-corona/144694/',
  'ventura-archetype-american-hero':   'https://halfwheel.com/archetype-strange-passage-robusto/129349/',
  'ventura-case-study-cs03-toro':      'https://halfwheel.com/case-study-cs-13-ships/286146/',
  'ventura-case-study-no-13':          'https://halfwheel.com/case-study-cs-13-ships/286146/',
  // Rojas
  'rojas-unfinished-business-toro':    'https://halfwheel.com/rojas-cigars/',
  'rojas-unfinished-business-robusto': 'https://halfwheel.com/rojas-cigars/',
  'rojas-unfinished-business-corona-gorda':'https://halfwheel.com/rojas-cigars/',
  // Crux
  'crux-guild-toro':                   'https://halfwheel.com/crux-guild/',
  'crux-guild-corona':                 'https://halfwheel.com/crux-guild/',
  // Liga Privada
  'liga-privada-unico-feral-flying-pig':'https://halfwheel.com/liga-privada-unico-serie-feral-flying-pig/',
  // ACE Prime
  'ace-prime-mona-y-lisa-toro':        'https://halfwheel.com/ipcpr-2019-ace-prime/336763/',
  'ace-prime-mona-y-lisa-corona':      'https://halfwheel.com/ipcpr-2019-ace-prime/336763/',
  'ace-prime-pichardo-san-andres-toro':'https://halfwheel.com/m-x-s-adrian-gonzalez-el-titan/387707/',
  'ace-prime-mxs-dominique-wilkins':   'https://halfwheel.com/m-x-s-adrian-gonzalez-el-titan/387707/',
  'ace-prime-muestra-de-saka-nacatamale':'https://halfwheel.com/sobremesa/',
  'ace-prime-muestra-de-saka-mionca':  'https://halfwheel.com/sobremesa/',
  // Espinosa
  'espinosa-alpha-dawg-toro':          'https://halfwheel.com/espinosa-habano/152069/',
  'espinosa-alpha-dawg-gordo':         'https://halfwheel.com/espinosa-habano/152069/',
  // Principle
  'principle-cigars-el-caballero-robusto':   'https://halfwheel.com/principle-cigars/',
  'principle-cigars-momento-dios-robusto':   'https://halfwheel.com/principle-cigars/',
  'principle-cigars-isleno-robusto':         'https://halfwheel.com/principle-cigars/',
  'principle-cigars-cardinal-robusto':       'https://halfwheel.com/principle-cigars/',
};

// Havana House (Puppeteer, networkidle2 required)
const HH_BRANDS = ['Cuba'];

// ─── FETCH HELPERS ───────────────────────────────────────────────────────────

function upgradeImg(url) {
  if (!url) return null;
  return url.replace(/\/thumb\/\d+x\d+\//g, '/thumb/600x600/');
}

async function fetchOgImage(url) {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': UA, 'Accept-Language': 'en-US,en;q=0.9' },
      signal: AbortSignal.timeout(15000),
      redirect: 'follow'
    });
    if (!res.ok) return null;
    const html = await res.text();
    const m = html.match(/og:image[^>]*content="([^"]+)"/);
    if (!m) return null;
    const img = m[1];
    if (!img.startsWith('http')) return null;
    // Filter out logos and transparent images
    if (/logo|icon|transparent|placeholder/i.test(img)) return null;
    return upgradeImg(img);
  } catch { return null; }
}

// Holt's fuzzy matching (same as before)
function norm(s) {
  return String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[''`]/g, '').replace(/[^a-z0-9 ]/gi, ' ').toLowerCase().trim();
}
function matchScore(target, candidate) {
  const tw = new Set(norm(target).split(/\s+/).filter(w=>w.length>2));
  const cw = new Set(norm(candidate).split(/\s+/).filter(w=>w.length>2));
  if (!tw.size) return 0;
  return [...tw].filter(w=>cw.has(w)).length / tw.size;
}
function findHoltsUrl(cigar) {
  const brand = norm(cigar.brand);
  const brandKw = brand.split(/\s+/)[0];
  const candidates = HOLTS.filter(u => u.toLowerCase().includes(brandKw));
  if (!candidates.length) return null;
  let best = null, bs = 0;
  for (const u of candidates) {
    const slug = u.replace(/.*\/all-cigar-brands\//, '').replace('.html', '');
    const s = matchScore(cigar.name, slug);
    if (s > bs) { bs = s; best = u; }
  }
  return bs >= 0.3 ? best : null;
}

// ─── MAIN ────────────────────────────────────────────────────────────────────

async function processDirectFetch(cigar) {
  // 1. Try EZ store
  if (EZ_MAP[cigar.id]) {
    const img = await fetchOgImage(EZ_MAP[cigar.id]);
    if (img) return { image: img, retailer: 'Ezra Zion Store', url: EZ_MAP[cigar.id] };
  }

  // 2. Try halfwheel
  if (HW_MAP[cigar.id]) {
    const img = await fetchOgImage(HW_MAP[cigar.id]);
    if (img) return { image: img, retailer: 'halfwheel', url: HW_MAP[cigar.id] };
  }

  // 3. Try Holt's (if not Cuban)
  if (cigar.origin !== 'Cuba') {
    const holtsUrl = findHoltsUrl(cigar);
    if (holtsUrl) {
      const img = await fetchOgImage(holtsUrl);
      if (img) return { image: img, retailer: "Holt's Cigars", url: holtsUrl };
    }
  }

  return null;
}

async function main() {
  // Phase 1: Direct HTTP fetch (no Puppeteer)
  console.log('Phase 1: Direct HTTP fetch...');
  const phase1Results = [];
  const needPuppeteer = [];

  for (const cigar of DATA) {
    await sleep(100);
    const result = await processDirectFetch(cigar);
    if (result) {
      phase1Results.push({ id: cigar.id, image: result.image, retailer: result.retailer });
      process.stdout.write(`✓ ${cigar.id.slice(0,55)} [${result.retailer}]\n`);
    } else {
      needPuppeteer.push(cigar);
      process.stdout.write(`→ ${cigar.id.slice(0,55)} (needs puppeteer)\n`);
    }
  }

  console.log(`\nPhase 1: ${phase1Results.length} found. Phase 2: ${needPuppeteer.length} need Puppeteer`);

  // Phase 2: Puppeteer for Neptune + Havana House
  const phase2Results = [];
  if (needPuppeteer.length > 0) {
    console.log('\nPhase 2: Puppeteer scraping...');
    const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox','--disable-setuid-sandbox','--disable-gpu'] });

    async function puppeteerWorker(items) {
      const page = await browser.newPage();
      await page.setUserAgent(UA);
      await page.setRequestInterception(true);
      page.on('request', req => { if (['font','media'].includes(req.resourceType())) req.abort(); else req.continue(); });

      for (const cigar of items) {
        try {
          const isCuban = cigar.origin === 'Cuba';
          const neptuneUrl = NEPTUNE_MAP[cigar.id];

          if (neptuneUrl) {
            await page.goto(neptuneUrl, { waitUntil: 'domcontentloaded', timeout: 20000 });
            await sleep(1200);
            const img = await page.evaluate(() => {
              const og = document.querySelector('meta[property="og:image"]');
              return og ? og.getAttribute('content') : null;
            });
            if (img && img.startsWith('http')) {
              phase2Results.push({ id: cigar.id, image: img, retailer: 'Neptune Cigar' });
              process.stdout.write(`✓ ${cigar.id.slice(0,55)} [Neptune]\n`);
              continue;
            }
          }

          if (isCuban) {
            const hhLink = (cigar.buyLinks || []).find(l => l.retailer === 'Havana House' && l.url?.includes('/product/'));
            if (hhLink) {
              await page.goto(hhLink.url, { waitUntil: 'networkidle2', timeout: 25000 });
              await sleep(1000);
              const img = await page.evaluate(() => {
                const og = document.querySelector('meta[property="og:image"]');
                return og ? og.getAttribute('content') : null;
              });
              if (img && img.startsWith('http')) {
                phase2Results.push({ id: cigar.id, image: img, retailer: 'Havana House' });
                process.stdout.write(`✓ ${cigar.id.slice(0,55)} [HH]\n`);
                continue;
              }
            }
          }
          process.stdout.write(`✗ ${cigar.id.slice(0,55)}\n`);
        } catch(e) {
          process.stdout.write(`✗ ${cigar.id.slice(0,55)} (${e.message.slice(0,30)})\n`);
        }
      }
      try { await page.close(); } catch {}
    }

    // Split into 3 parallel workers
    const chunks = [
      needPuppeteer.filter((_, i) => i % 3 === 0),
      needPuppeteer.filter((_, i) => i % 3 === 1),
      needPuppeteer.filter((_, i) => i % 3 === 2),
    ];
    await Promise.all(chunks.map(ch => puppeteerWorker(ch)));
    try { await browser.close(); } catch {}
  }

  const allResults = [...phase1Results, ...phase2Results];
  writeFileSync('/tmp/final_images.json', JSON.stringify(allResults, null, 2));
  console.log(`\n✓ Done! Found ${allResults.length}/${DATA.length} images → /tmp/final_images.json`);
}

main().catch(e => { console.error(e); process.exit(1); });
