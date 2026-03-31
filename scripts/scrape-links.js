/**
 * Puppeteer scraper — collect direct Famous Smoke product URLs.
 *
 * Uses hardcoded brand page URLs (confirmed working), loads each page
 * with a real browser to get JS-rendered product links, then fuzzy-matches
 * each cigar name to the best product URL.
 */

import puppeteer from 'puppeteer';
import { readFileSync, writeFileSync } from 'fs';

const cigars = JSON.parse(readFileSync('/tmp/cigars_for_scrape.json', 'utf8'));
const BASE = 'https://www.famous-smoke.com';

// Confirmed Famous Smoke brand page URLs (from WebFetch verification)
// brand name → array of brand page URLs to try
const BRAND_PAGES = {
  'Padrón':                ['brand/padron-series-cigars', 'brand/padron-family-reserve-cigars', 'brand/padron-1964-anniversary-series-cigars', 'brand/padron-1926-serie-cigars'],
  'Oliva':                 ['brand/oliva-serie-v-cigars', 'brand/oliva-serie-v-melanio-cigars', 'brand/oliva-serie-g-cigars', 'brand/oliva-serie-o-cigars', 'brand/oliva-connecticut-reserve-cigars', 'brand/oliva-master-blends-cigars'],
  'Arturo Fuente':         ['brand/arturo-fuente-hemingway-cigars', 'brand/arturo-fuente-don-carlos-cigars', 'brand/arturo-fuente-opus-x-cigars', 'brand/arturo-fuente-cigars', 'brand/arturo-fuente-anejo-cigars'],
  'Drew Estate':           ['brand/liga-privada-no-9-cigars', 'brand/liga-privada-t52-cigars', 'brand/undercrown-cigars', 'brand/undercrown-sun-grown-cigars', 'brand/undercrown-shade-cigars', 'brand/acid-cigars', 'brand/java-cigars', 'brand/deadwood-cigars'],
  'ACID by Drew Estate':   ['brand/acid-cigars'],
  'Rocky Patel':           ['brand/rocky-patel-vintage-1990-cigars', 'brand/rocky-patel-decade-cigars', 'brand/rocky-patel-15th-anniversary-cigars', 'brand/rocky-patel-edge-cigars', 'brand/rocky-patel-grand-reserve-cigars', 'brand/rocky-patel-sun-grown-cigars', 'brand/rocky-patel-american-market-selection-cigars', 'brand/rocky-patel-connecticut-cigars', 'brand/rocky-patel-vintage-1999-cigars', 'brand/rocky-patel-number-6-cigars', 'brand/rocky-patel-a2-cigars', 'brand/rocky-patel-smoking-jacket-cigars', 'brand/rocky-patel-burn-cigars', 'brand/rocky-patel-dbs-cigars'],
  'Davidoff':              ['brand/davidoff-grand-cru-series-cigars', 'brand/davidoff-millennium-cigars', 'brand/davidoff-aniversario-series-cigars', 'brand/davidoff-escurio-cigars', 'brand/davidoff-yamasa-cigars', 'brand/davidoff-nicaragua-cigars', 'brand/davidoff-signature-series-cigars', 'brand/winston-churchill-late-hour-cigars', 'brand/winston-churchill-cigars'],
  'AVO':                   ['brand/avo-classic-cigars', 'brand/avo-syncro-cigars', 'brand/avo-heritage-cigars', 'brand/avo-domaine-cigars'],
  'Camacho':               ['brand/camacho-corojo-cigars', 'brand/camacho-connecticut-cigars', 'brand/camacho-triple-maduro-cigars', 'brand/camacho-american-barrel-aged-cigars', 'brand/camacho-ecuador-cigars', 'brand/camacho-criollo-cigars', 'brand/camacho-factory-unleashed-cigars'],
  'My Father Cigars':      ['brand/my-father-cigars', 'brand/my-father-le-bijou-1922-cigars', 'brand/my-father-flor-de-las-antillas-cigars', 'brand/my-father-el-centurion-cigars', 'brand/my-father-la-antiguedad-cigars', 'brand/my-father-garcia-garcia-cigars'],
  'Alec Bradley':          ['brand/alec-bradley-prensado-cigars', 'brand/alec-bradley-magic-toast-cigars', 'brand/alec-bradley-black-market-cigars', 'brand/alec-bradley-tempus-cigars', 'brand/alec-bradley-family-blend-cigars', 'brand/alec-bradley-gatekeeper-cigars'],
  'Ashton':                ['brand/ashton-vsg-cigars', 'brand/ashton-classic-cigars', 'brand/ashton-cabinet-selection-cigars', 'brand/ashton-heritage-cigars', 'brand/ashton-symmetry-cigars', 'brand/ashton-aged-maduro-cigars', 'brand/ashton-esg-cigars'],
  'CAO':                   ['brand/cao-mx2-cigars', 'brand/cao-cameroon-cigars', 'brand/cao-brazilia-cigars', 'brand/cao-flathead-cigars', 'brand/cao-colombia-cigars', 'brand/cao-amazon-basin-cigars', 'brand/cao-oriente-cigars'],
  'Macanudo':              ['brand/macanudo-cafe-cigars', 'brand/macanudo-inspirado-orange-cigars', 'brand/macanudo-inspirado-white-cigars', 'brand/macanudo-inspirado-black-cigars', 'brand/macanudo-maduro-cigars', 'brand/macanudo-vintage-cigars'],
  'Punch':                 ['brand/punch-rare-corojo-cigars', 'brand/punch-gran-puro-cigars', 'brand/punch-diablo-cigars', 'brand/punch-clasico-cigars'],
  'Romeo y Julieta':       ['brand/romeo-y-julieta-1875-cigars', 'brand/romeo-y-julieta-reserve-cigars', 'brand/romeo-y-julieta-reserva-real-cigars', 'brand/romeo-y-julieta-aniversario-cigars', 'brand/romeo-y-julieta-vintage-cigars'],
  'H. Upmann':             ['brand/h-upmann-the-banker-cigars', 'brand/h-upmann-vintage-cameroon-cigars', 'brand/h-upmann-1844-cigars'],
  'Crowned Heads':         ['brand/crowned-heads-four-kicks-cigars', 'brand/crowned-heads-jericho-hill-cigars', 'brand/crowned-heads-le-careme-cigars', 'brand/crowned-heads-mil-dias-cigars', 'brand/crowned-heads-headley-grange-cigars'],
  'Nub':                   ['brand/nub-habano-cigars', 'brand/nub-connecticut-cigars', 'brand/nub-maduro-cigars', 'brand/nub-cameroon-cigars', 'brand/nub-nuance-cigars'],
  'La Flor Dominicana':    ['brand/la-flor-dominicana-air-bender-cigars', 'brand/la-flor-dominicana-double-ligero-cigars', 'brand/la-flor-dominicana-andalusian-bull-cigars', 'brand/la-flor-dominicana-coronado-cigars'],
  'Plasencia':             ['brand/plasencia-alma-del-fuego-cigars', 'brand/plasencia-alma-del-campo-cigars', 'brand/plasencia-alma-fuerte-cigars', 'brand/plasencia-reserva-original-cigars', 'brand/plasencia-cosecha-cigars'],
  'Perdomo':               ['brand/perdomo-reserve-cigars', 'brand/perdomo-habano-bourbon-barrel-aged-cigars', 'brand/perdomo-champagne-cigars', 'brand/perdomo-craft-series-cigars', 'brand/perdomo-2-cigars', 'brand/perdomo-lot-23-cigars', 'brand/perdomo-small-batch-cigars'],
  'Foundation Cigar Co.':  ['brand/foundation-el-gueguense-cigars', 'brand/foundation-the-wiseman-cigars', 'brand/foundation-charter-oak-cigars', 'brand/foundation-highclere-castle-cigars', 'brand/foundation-the-tabernacle-cigars'],
  'Joya de Nicaragua':     ['brand/joya-de-nicaragua-antano-cigars', 'brand/joya-de-nicaragua-clasico-cigars', 'brand/joya-de-nicaragua-cuatro-cinco-cigars', 'brand/joya-de-nicaragua-cinco-decadas-cigars'],
  'Dunbarton Tobacco & Trust': ['brand/dunbarton-sobremesa-cigars', 'brand/dunbarton-sin-compromiso-cigars'],
  'E.P. Carrillo':         ['brand/ep-carrillo-la-historia-cigars', 'brand/ep-carrillo-encore-cigars', 'brand/ep-carrillo-pledge-cigars', 'brand/ep-carrillo-core-plus-cigars'],
  'Aging Room':            ['brand/aging-room-quattro-cigars', 'brand/aging-room-bin-no1-cigars'],
  'AJ Fernandez':          ['brand/aj-fernandez-new-world-cigars', 'brand/aj-fernandez-last-call-cigars', 'brand/aj-fernandez-enclave-cigars', 'brand/aladino-cigars', 'brand/san-lotano-cigars'],
  'Espinosa Cigars':       ['brand/espinosa-las-6-provincias-cigars', 'brand/espinosa-laranja-cigars', 'brand/espinosa-la-bomba-cigars', 'brand/espinosa-alpha-cigars'],
  'Tatuaje':               ['brand/tatuaje-havana-vi-cigars', 'brand/tatuaje-verocu-cigars', 'brand/tatuaje-brown-label-cigars'],
  'Illusione':             ['brand/illusione-epernay-cigars', 'brand/illusione-rothchildes-cigars', 'brand/illusione-cigars'],
  'Southern Draw':         ['brand/southern-draw-jacobs-ladder-cigars', 'brand/southern-draw-kudzu-cigars', 'brand/southern-draw-rose-of-sharon-cigars', 'brand/southern-draw-cedrus-cigars', 'brand/southern-draw-300-hands-cigars'],
  'Herrera Estelí':        ['brand/herrera-esteli-cigars', 'brand/herrera-esteli-miami-cigars', 'brand/herrera-esteli-norteno-cigars'],
  'Caldwell Cigar Co.':    ['brand/caldwell-long-live-the-king-cigars', 'brand/caldwell-eastern-standard-cigars', 'brand/caldwell-all-out-kings-cigars', 'brand/caldwell-blind-mans-bluff-cigars'],
  'Warped Cigars':         ['brand/warped-la-colmena-cigars', 'brand/warped-maestro-del-tiempo-cigars', 'brand/warped-guardian-of-the-farm-cigars'],
  'Protocol Cigars':       ['brand/protocol-themis-cigars', 'brand/protocol-blue-line-cigars', 'brand/protocol-forgotten-soldier-cigars'],
  'Crux Cigars':           ['brand/crux-epicure-cigars', 'brand/crux-bull-bear-cigars', 'brand/crux-guild-cigars'],
  'Aganorsa Leaf':         ['brand/aganorsa-leaf-supreme-leaf-cigars', 'brand/aganorsa-leaf-signature-selection-cigars', 'brand/aganorsa-leaf-inspector-general-cigars'],
  'La Palina':             ['brand/la-palina-black-label-cigars', 'brand/la-palina-classic-series-cigars'],
  'Diesel':                ['brand/diesel-whiskey-row-cigars', 'brand/diesel-unholy-cocktail-cigars', 'brand/diesel-defy-cigars', 'brand/diesel-warhorse-cigars'],
  'Gurkha':                ['brand/gurkha-black-dragon-cigars', 'brand/gurkha-cellar-reserve-cigars', 'brand/gurkha-heritage-cigars'],
  'RoMa Craft Tobac':      ['brand/roma-craft-cromagnon-cigars', 'brand/roma-craft-neanderthal-cigars', 'brand/roma-craft-intemperance-cigars'],
  'Man O':                 ['brand/man-o-war-ruination-cigars', 'brand/man-o-war-armada-cigars', 'brand/man-o-war-virtue-cigars'],
  'Black Label Trading Company': ['brand/black-label-trading-last-rites-cigars', 'brand/black-label-trading-bishops-blend-cigars'],
  'Viaje':                 ['brand/viaje-honey-and-hand-grenades-cigars', 'brand/viaje-skull-and-bones-cigars', 'brand/viaje-wmd-cigars'],
  'Brick House':           ['brand/brick-house-cigars', 'brand/brick-house-mighty-mighty-cigars', 'brand/brick-house-double-connecticut-cigars'],
  'Fratello':              ['brand/fratello-classico-cigars', 'brand/fratello-oro-cigars', 'brand/fratello-navetta-cigars'],
  'Diamond Crown':         ['brand/diamond-crown-cigars', 'brand/diamond-crown-maximus-cigars', 'brand/diamond-crown-black-diamond-cigars'],
  'Leaf by Oscar':         ['brand/leaf-by-oscar-maduro-cigars', 'brand/leaf-by-oscar-corojo-cigars', 'brand/leaf-by-oscar-connecticut-cigars'],
  'Serino':                ['brand/serino-royale-cigars', 'brand/serino-wayfarer-cigars'],
  'Ace Prime':             ['brand/ace-prime-luciano-cigars', 'brand/ace-prime-pichardo-cigars'],
  'Cain by Oliva':         ['brand/cain-cigars'],
};

function normalize(str) {
  return str.toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ').trim();
}

function bestMatch(cigarName, urls) {
  const normName = normalize(cigarName);
  const nameWords = normName.split(' ').filter(w => w.length > 2);
  if (!nameWords.length) return null;

  let best = null, bestScore = 0;
  for (const url of urls) {
    const slug = url.split('/').pop()
      .replace(/-cigars.*$/, '')
      .replace(/-(natural|maduro|oscuro|claro|sumatra|habano|corojo|connecticut)$/, '');
    const normSlug = normalize(slug);
    let score = 0;
    for (const word of nameWords) {
      if (normSlug.includes(word)) score++;
    }
    const ratio = score / nameWords.length;
    if (ratio > bestScore && ratio >= 0.4) {
      bestScore = ratio;
      best = url;
    }
  }
  return best;
}

async function getProductUrls(page, path) {
  try {
    const url = `${BASE}/${path}`;
    const resp = await page.goto(url, { waitUntil: 'networkidle2', timeout: 20000 });
    if (!resp || resp.status() >= 400) return [];

    // Wait for JS-rendered product links
    await new Promise(r => setTimeout(r, 2500));

    const urls = await page.evaluate((base) => {
      const links = Array.from(document.querySelectorAll('a[href]'));
      return links
        .map(a => a.href)
        .filter(h => h.includes('/brand/') && h.split('/brand/')[1]?.includes('/'))
        .filter(h => !h.includes('/search') && !h.includes('?'))
        .filter((v, i, a) => a.indexOf(v) === i);
    }, BASE);

    return urls;
  } catch (e) {
    return [];
  }
}

async function main() {
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu', '--disable-dev-shm-usage']
  });

  const page = await browser.newPage();
  await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
  await page.setViewport({ width: 1280, height: 800 });

  const results = {};
  const cubanOrigins = new Set(['Cuba', 'Cuba / Nicaragua blend']);

  // Group non-Cuban cigars by brand
  const byBrand = {};
  for (const c of cigars) {
    if (cubanOrigins.has(c.origin)) continue;
    if (!byBrand[c.brand]) byBrand[c.brand] = [];
    byBrand[c.brand].push(c);
  }

  // Cache: brand page path → product URLs
  const pageCache = {};

  async function fetchBrandPages(paths) {
    const allUrls = [];
    for (const path of paths) {
      if (pageCache[path] === undefined) {
        process.stdout.write(`  → /${path} `);
        const urls = await getProductUrls(page, path);
        pageCache[path] = urls;
        console.log(`(${urls.length} products)`);
        if (urls.length) await new Promise(r => setTimeout(r, 600));
      }
      allUrls.push(...pageCache[path]);
    }
    return [...new Set(allUrls)];
  }

  for (const [brand, brandCigars] of Object.entries(byBrand)) {
    console.log(`\n[${brand}] ${brandCigars.length} cigars`);
    const paths = BRAND_PAGES[brand] || [];
    const productUrls = paths.length ? await fetchBrandPages(paths) : [];

    for (const cigar of brandCigars) {
      if (productUrls.length) {
        const matched = bestMatch(cigar.name, productUrls);
        if (matched) {
          results[cigar.id] = matched;
          console.log(`  ✓ ${cigar.name}`);
          console.log(`      → ${matched.replace(BASE, '')}`);
          continue;
        }
      }
      console.log(`  ✗ ${cigar.name}`);
    }
  }

  await browser.close();

  const output = Object.entries(results).map(([id, url]) => ({ id, url }));
  writeFileSync('/tmp/fs_links.json', JSON.stringify(output, null, 2));
  console.log(`\n✓ Done! Found ${output.length} direct URLs → /tmp/fs_links.json`);
}

main().catch(e => { console.error(e); process.exit(1); });
