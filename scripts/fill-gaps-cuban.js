/**
 * Fill remaining Cuban retailer gaps: Havana House (78) and C.Gars Ltd (131).
 * Output: /tmp/fill_gaps_cuban.json
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

const HH_MISSING = JSON.parse(readFileSync('/tmp/missing_hh.json', 'utf8'));
const CG_MISSING = JSON.parse(readFileSync('/tmp/missing_cg.json', 'utf8'));
const results = [];

const CUBAN_BRANDS = [
  'Cohiba', 'Montecristo', 'Romeo y Julieta', 'Partagas', 'H. Upmann',
  'Bolivar', 'Por Larrañaga', 'Hoyo de Monterrey', 'Punch', 'Diplomaticos',
  'Quai D\'Orsay', 'Trinidad', 'Vegas Robaina', 'Cuaba', 'San Cristobal',
  'Siglo', 'Ramon Allones', 'Saint Luis Rey', 'El Rey del Mundo'
];

async function fillHavanaHouse(browser) {
  console.log(`=== Havana House: ${HH_MISSING.length} missing ===`);
  const page = await browser.newPage();
  await page.setUserAgent(UA);
  await page.setRequestInterception(true);
  page.on('request', req => {
    if (['font', 'media', 'image'].includes(req.resourceType())) req.abort();
    else req.continue();
  });

  // Collect product URLs from brand category pages
  const allHHUrls = new Set();
  const brandSlugs = ['cohiba', 'montecristo', 'romeo-y-julieta', 'partagas', 'h-upmann',
    'bolivar', 'por-larranaga', 'hoyo-de-monterrey', 'punch', 'diplomaticos',
    'trinidad', 'vegas-robaina', 'cuaba', 'san-cristobal-de-la-habana',
    'ramon-allones', 'saint-luis-rey', 'el-rey-del-mundo'];

  for (const slug of brandSlugs) {
    try {
      await page.goto(`https://www.havanahouse.co.uk/product-category/cigars/cuban/${slug}/`, {
        waitUntil: 'domcontentloaded', timeout: 20000
      });
      await sleep(1500);
      const links = await page.evaluate(() =>
        [...new Set(Array.from(document.querySelectorAll('a[href]')).map(a => a.href)
          .filter(h => /havanahouse\.co\.uk\/product\/[^?#]+\/$/.test(h)))]
      );
      links.forEach(l => allHHUrls.add(l));
      if (links.length > 0) process.stdout.write(`  HH ${slug}: ${links.length}\n`);

      // Check page 2
      await page.goto(`https://www.havanahouse.co.uk/product-category/cigars/cuban/${slug}/page/2/`, {
        waitUntil: 'domcontentloaded', timeout: 15000
      });
      await sleep(1000);
      const links2 = await page.evaluate(() =>
        [...new Set(Array.from(document.querySelectorAll('a[href]')).map(a => a.href)
          .filter(h => /havanahouse\.co\.uk\/product\/[^?#]+\/$/.test(h)))]
      );
      links2.forEach(l => allHHUrls.add(l));
    } catch {}
    await sleep(400);
  }
  console.log(`  HH catalog: ${allHHUrls.size} product URLs`);

  const hhUrlArr = [...allHHUrls];
  for (const cigar of HH_MISSING) {
    let found = false;
    // Try sitemap match
    if (hhUrlArr.length) {
      const best = hhUrlArr.reduce((b, u) => {
        const slug = u.replace('https://www.havanahouse.co.uk/product/', '').replace(/\//g, '').replace(/-/g, ' ');
        const s = matchScore(cigar.name, slug);
        return s > b.score ? { url: u, score: s } : b;
      }, { url: '', score: 0 });
      if (best.score >= 0.3) {
        results.push({ retailer: 'Havana House', id: cigar.id, url: best.url });
        process.stdout.write(`  ✓ HH [${cigar.name.slice(0,45)}]\n`);
        found = true;
      }
    }
    if (!found) {
      // Search
      try {
        await page.goto(`https://www.havanahouse.co.uk/?s=${encodeURIComponent(norm(cigar.name))}`, {
          waitUntil: 'domcontentloaded', timeout: 15000
        });
        await sleep(1500);
        const links = await page.evaluate(() =>
          [...new Set(Array.from(document.querySelectorAll('a[href]')).map(a => a.href)
            .filter(h => /havanahouse\.co\.uk\/product\//.test(h)))]
        );
        if (links.length) {
          results.push({ retailer: 'Havana House', id: cigar.id, url: links[0] });
          process.stdout.write(`  ✓ HH [${cigar.name.slice(0,45)}] (search)\n`);
        } else {
          process.stdout.write(`  ✗ HH [${cigar.name.slice(0,45)}]\n`);
        }
      } catch {}
      await sleep(500);
    }
  }
  await page.close().catch(() => {});
  const found = results.filter(r => r.retailer === 'Havana House').length;
  console.log(`HH done: ${found}/${HH_MISSING.length}`);
}

async function fillCGars(browser) {
  console.log(`\n=== C.Gars Ltd: ${CG_MISSING.length} missing ===`);
  const page = await browser.newPage();
  await page.setUserAgent(UA);
  await page.setRequestInterception(true);
  page.on('request', req => {
    if (['font', 'media', 'image'].includes(req.resourceType())) req.abort();
    else req.continue();
  });

  // Collect product URLs from brand category pages
  const allCGUrls = new Set();
  const cgBrandSlugs = [
    { name: 'cohiba', id: '1' },
    { name: 'montecristo', id: '2' },
    { name: 'romeo-y-julieta', id: '3' },
    { name: 'partagas', id: '4' },
    { name: 'h-upmann', id: '5' },
    { name: 'bolivar', id: '6' },
    { name: 'punch', id: '8' },
    { name: 'hoyo-de-monterrey', id: '9' },
    { name: 'trinidad', id: '10' },
    { name: 'por-larranaga', id: '11' },
    { name: 'diplomaticos', id: '12' },
    { name: 'cuaba', id: '13' },
    { name: 'san-cristobal-de-la-habana', id: '14' },
    { name: 'ramon-allones', id: '15' },
  ];

  for (const { name, id } of cgBrandSlugs) {
    for (let pg = 1; pg <= 3; pg++) {
      try {
        const url = pg === 1
          ? `https://www.cgarsltd.co.uk/cuban-cigars-${name}-c-${id}.html`
          : `https://www.cgarsltd.co.uk/cuban-cigars-${name}-c-${id}.html?page=${pg}`;
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });
        await sleep(1200);
        const links = await page.evaluate(() =>
          [...new Set(Array.from(document.querySelectorAll('a[href]')).map(a => a.href)
            .filter(h => /cgarsltd\.co\.uk\/[a-z0-9-]+-p-\d+\.html/.test(h)))]
        );
        if (links.length === 0) break;
        links.forEach(l => allCGUrls.add(l));
        if (links.length > 0) process.stdout.write(`  CG ${name} p${pg}: ${links.length}\n`);
      } catch { break; }
      await sleep(400);
    }
  }
  console.log(`  CG catalog: ${allCGUrls.size} product URLs`);

  const cgUrlArr = [...allCGUrls];
  for (const cigar of CG_MISSING) {
    let found = false;
    if (cgUrlArr.length) {
      const best = cgUrlArr.reduce((b, u) => {
        const slug = u.split('/').pop().replace(/-p-\d+\.html$/, '').replace(/-/g, ' ');
        const s = matchScore(cigar.name, slug);
        return s > b.score ? { url: u, score: s } : b;
      }, { url: '', score: 0 });
      if (best.score >= 0.3) {
        results.push({ retailer: 'C.Gars Ltd', id: cigar.id, url: best.url });
        process.stdout.write(`  ✓ CG [${cigar.name.slice(0,45)}]\n`);
        found = true;
      }
    }
    if (!found) {
      try {
        await page.goto(`https://www.cgarsltd.co.uk/search?q=${encodeURIComponent(norm(cigar.name))}`, {
          waitUntil: 'domcontentloaded', timeout: 15000
        });
        await sleep(1500);
        const links = await page.evaluate(() =>
          [...new Set(Array.from(document.querySelectorAll('a[href]')).map(a => a.href)
            .filter(h => /cgarsltd\.co\.uk\/[a-z0-9-]+-p-\d+\.html/.test(h)))]
        );
        if (links.length) {
          results.push({ retailer: 'C.Gars Ltd', id: cigar.id, url: links[0] });
          process.stdout.write(`  ✓ CG [${cigar.name.slice(0,45)}] (search)\n`);
        } else {
          process.stdout.write(`  ✗ CG [${cigar.name.slice(0,45)}]\n`);
        }
      } catch {}
      await sleep(400);
    }
  }
  await page.close().catch(() => {});
  const found = results.filter(r => r.retailer === 'C.Gars Ltd').length;
  console.log(`CG done: ${found}/${CG_MISSING.length}`);
}

async function main() {
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu'],
    protocolTimeout: 90000
  });
  try {
    await fillHavanaHouse(browser);
    writeFileSync('/tmp/fill_gaps_cuban.json', JSON.stringify(results, null, 2));
    await fillCGars(browser);
  } finally {
    await browser.close().catch(() => {});
  }
  writeFileSync('/tmp/fill_gaps_cuban.json', JSON.stringify(results, null, 2));
  const hh = results.filter(r => r.retailer === 'Havana House').length;
  const cg = results.filter(r => r.retailer === 'C.Gars Ltd').length;
  console.log(`\nDone! HH: ${hh}/${HH_MISSING.length}, CG: ${cg}/${CG_MISSING.length}`);
}

main().catch(e => { console.error(e); process.exit(1); });
