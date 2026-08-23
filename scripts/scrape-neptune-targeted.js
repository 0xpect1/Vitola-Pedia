/**
 * Scrapes Neptune Cigar brand pages for all brands with missing images,
 * then fuzzy-matches and fetches og:image for each missing cigar.
 *
 * Output: /tmp/neptune_targeted_images.json  [{id, image}]
 */

import puppeteer from 'puppeteer';
import { readFileSync, writeFileSync } from 'fs';

// Brands still needing images and their Neptune brand slugs
const BRAND_SLUGS = {
  'Tatuaje':                  'tatuaje-cigar',
  'Viaje Cigar':              'viaje-cigar',
  'Viaje':                    'viaje-cigar',
  'Viaje Cigars':             'viaje-cigar',
  'Ezra Zion':                'ezra-zion-cigar',
  'La Palina':                'la-palina-cigar',
  'ACE Prime':                'ace-prime-cigar',
  'Ace Prime':                'ace-prime-cigar',
  'Principle Cigars':         'principle-cigars-cigar',
  'Dunbarton Tobacco & Trust':'dunbarton-cigar',
  'Protocol Cigars':          'protocol-cigar',
  'Protocol':                 'protocol-cigar',
  'Camacho':                  'camacho-cigar',
  'E.P. Carrillo':            'ep-carrillo-cigar',
  'Drew Estate':              'drew-estate-cigar',
  'Alec Bradley':             'alec-bradley-cigar',
  'Espinosa Cigars':          'espinosa-cigar',
  'Espinosa Premium Cigars':  'espinosa-cigar',
  'Ferio Tego':               'ferio-tego-cigar',
  'HVC':                      'hvc-cigar',
  'La Palina':                'la-palina-cigar',
  'Quesada':                  'quesada-cigar',
  'Serino Cigars':            'serino-cigar',
  'Rojas Cigars':             'rojas-cigars-cigar',
  'Kristoff':                 'kristoff-cigar',
  'Perdomo':                  'perdomo-cigar',
  'Perdomo Cigars':           'perdomo-cigar',
  'La Flor Dominicana':       'la-flor-dominicana-cigar',
  'Dapper Cigar Co.':         'dapper-cigar',
  'La Barba':                 'la-barba-cigar',
  'La Barba Cigars':          'la-barba-cigar',
  'Caldwell Cigar Co.':       'caldwell-cigar',
  'Cornelius & Anthony':      'cornelius-anthony-cigar',
  'Ventura Cigar Co.':        'ventura-cigar',
  'Room 101':                 'room-101-cigar',
  '5 Vegas':                  '5-vegas-cigar',
  'Aging Room':               'aging-room-cigar',
  'Diesel':                   'diesel-cigar',
  'Illusione':                'illusione-cigar',
  'Foundation Cigar Company': 'foundation-cigar',
  'Crux Cigars':              'crux-cigar',
  'Crux Cigar Co.':           'crux-cigar',
  'J. Fuego':                 'j-fuego-cigar',
  'Mombacho Cigars':          'mombacho-cigar',
  'Punch':                    'punch-cigar',
};

function norm(s) {
  return String(s).normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .replace(/[''`]/g,'').replace(/[^a-z0-9 ]/gi,' ').toLowerCase().trim();
}
function wordSet(s) { return new Set(norm(s).split(/\s+/).filter(w=>w.length>2)); }
function matchScore(name, slug) {
  const nw = wordSet(name), sw = wordSet(slug);
  if (!nw.size) return 0;
  return [...nw].filter(w=>sw.has(w)).length / nw.size;
}
function bestMatch(name, urls, extractor, minScore=0.4) {
  let best=null, bs=0;
  for (const u of urls) {
    const s = matchScore(name, extractor(u));
    if (s>bs) { bs=s; best=u; }
  }
  return bs>=minScore ? best : null;
}

async function main() {
  const src = readFileSync('./js/data.js', 'utf8').replace(/^const CIGARS/m, 'globalThis.CIGARS');
  eval(src);
  const missing = globalThis.CIGARS.filter(c => !c.image && BRAND_SLUGS[c.brand]);
  console.log(`${missing.length} cigars to find via Neptune brand pages`);

  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox','--disable-setuid-sandbox','--disable-gpu'] });
  const page = await browser.newPage();
  await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

  // Collect product URLs per brand
  const brandUrls = {};
  const slugsSeen = new Set();
  for (const cigar of missing) {
    const slug = BRAND_SLUGS[cigar.brand];
    if (!slug || slugsSeen.has(slug)) continue;
    slugsSeen.add(slug);
    try {
      await page.goto(`https://www.neptunecigar.com/${slug}`, { waitUntil: 'domcontentloaded', timeout: 15000 });
      await new Promise(r => setTimeout(r, 1000));
      const links = await page.evaluate(() =>
        [...new Set(Array.from(document.querySelectorAll('a[href]')).map(a=>a.href)
          .filter(h => /neptunecigar\.com\/cigar\//.test(h)))]
      );
      brandUrls[slug] = links;
      process.stdout.write(`  ✓ ${slug} (${links.length})\n`);
    } catch(e) {
      brandUrls[slug] = [];
      process.stdout.write(`  ✗ ${slug}\n`);
    }
  }
  await page.close().catch(()=>{});

  // Match cigars to URLs
  const queue = [];
  for (const cigar of missing) {
    const slug = BRAND_SLUGS[cigar.brand];
    if (!slug) continue;
    const urls = brandUrls[slug] || [];
    const url = bestMatch(cigar.name, urls, u => u.replace(/.*\/cigar\//, ''));
    if (url) queue.push({ id: cigar.id, url });
    else process.stdout.write(`  no match: ${cigar.id}\n`);
  }
  console.log(`\nMatched ${queue.length}/${missing.length} to Neptune URLs. Fetching images...`);

  // Fetch og:image with 4 workers
  const results = [];
  async function worker() {
    const pg = await browser.newPage();
    await pg.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36');
    await pg.setRequestInterception(true);
    pg.on('request', req => { if (['font','media'].includes(req.resourceType())) req.abort(); else req.continue(); });
    while (queue.length > 0) {
      const { id, url } = queue.shift();
      try {
        await pg.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });
        await new Promise(r => setTimeout(r, 1200));
        const img = await pg.evaluate(() => {
          const og = document.querySelector('meta[property="og:image"]');
          return og ? og.getAttribute('content') : null;
        });
        if (img) { results.push({ id, image: img }); process.stdout.write(`✓ ${id.slice(0,55)}\n`); }
        else process.stdout.write(`✗ ${id.slice(0,55)} (no og:image)\n`);
      } catch(e) { process.stdout.write(`✗ ${id.slice(0,55)} (err)\n`); }
    }
    try { await pg.close(); } catch(e) {}
  }
  await Promise.all([worker(), worker(), worker(), worker()]);

  writeFileSync('/tmp/neptune_targeted_images.json', JSON.stringify(results, null, 2));
  console.log(`\n✓ Done! Found ${results.length} images → /tmp/neptune_targeted_images.json`);
  try { await browser.close(); } catch(e) {}
}

main().catch(e => { console.error(e); process.exit(1); });
