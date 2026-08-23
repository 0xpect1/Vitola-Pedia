/**
 * Fill remaining CI (175) and Neptune (116) gaps using Puppeteer search.
 * Output: /tmp/fill_gaps_ci_np.json [{retailer, id, url}]
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

const CI_MISSING = JSON.parse(readFileSync('/tmp/missing_ci.json', 'utf8'));
const NP_MISSING = JSON.parse(readFileSync('/tmp/missing_np.json', 'utf8'));
const results = [];

async function searchCI(browser, cigars) {
  console.log(`=== CI: searching ${cigars.length} cigars ===`);
  const queue = [...cigars];
  async function worker() {
    const pg = await browser.newPage();
    await pg.setUserAgent(UA);
    await pg.setRequestInterception(true);
    pg.on('request', req => {
      if (['font', 'media', 'image', 'stylesheet'].includes(req.resourceType())) req.abort();
      else req.continue();
    });
    while (queue.length) {
      const cigar = queue.shift();
      try {
        const q = encodeURIComponent(norm(cigar.name));
        await pg.goto(`https://www.cigarsinternational.com/search?q=${q}`, {
          waitUntil: 'domcontentloaded', timeout: 25000
        });
        await sleep(2500);
        const links = await pg.evaluate(() =>
          [...new Set(Array.from(document.querySelectorAll('a[href]')).map(a => a.href)
            .filter(h => /cigarsinternational\.com\/p\//.test(h)))]
        );
        if (links.length) {
          const best = links.reduce((b, u) => {
            const slug = u.split('/p/')[1]?.split('/')[0] || '';
            const s = matchScore(cigar.name, slug);
            return s > b.score ? { url: u, score: s } : b;
          }, { url: links[0], score: 0 });
          if (best.score >= 0.2) {
            results.push({ retailer: 'Cigars International', id: cigar.id, url: best.url });
            process.stdout.write(`  ✓ CI [${cigar.name.slice(0, 45)}]\n`);
          } else {
            results.push({ retailer: 'Cigars International', id: cigar.id, url: links[0] });
            process.stdout.write(`  ~ CI [${cigar.name.slice(0, 45)}] (low score)\n`);
          }
        } else {
          process.stdout.write(`  ✗ CI [${cigar.name.slice(0, 45)}]\n`);
        }
      } catch {
        process.stdout.write(`  ✗ CI [${cigar.name.slice(0, 45)}] (err)\n`);
      }
      await sleep(600);
    }
    await pg.close().catch(() => {});
  }
  await Promise.all([worker(), worker(), worker()]);
  const found = results.filter(r => r.retailer === 'Cigars International').length;
  console.log(`CI done: ${found}/${cigars.length}`);
}

async function searchNeptune(browser, cigars) {
  console.log(`\n=== Neptune: searching ${cigars.length} cigars ===`);
  const queue = [...cigars];
  async function worker() {
    const pg = await browser.newPage();
    await pg.setUserAgent(UA);
    await pg.setRequestInterception(true);
    pg.on('request', req => {
      if (['font', 'media', 'image', 'stylesheet'].includes(req.resourceType())) req.abort();
      else req.continue();
    });
    while (queue.length) {
      const cigar = queue.shift();
      try {
        const q = encodeURIComponent(norm(cigar.name));
        await pg.goto(`https://www.neptunecigar.com/search?q=${q}`, {
          waitUntil: 'domcontentloaded', timeout: 20000
        });
        await sleep(2000);
        const links = await pg.evaluate(() =>
          [...new Set(Array.from(document.querySelectorAll('a[href]')).map(a => a.href)
            .filter(h => /neptunecigar\.com\/cigar\//.test(h)))]
        );
        if (links.length) {
          const best = links.reduce((b, u) => {
            const slug = u.replace('https://www.neptunecigar.com/cigar/', '');
            const s = matchScore(cigar.name, slug);
            return s > b.score ? { url: u, score: s } : b;
          }, { url: links[0], score: 0 });
          results.push({ retailer: 'Neptune Cigar', id: cigar.id, url: best.url });
          process.stdout.write(`  ✓ NP [${cigar.name.slice(0, 45)}]\n`);
        } else {
          process.stdout.write(`  ✗ NP [${cigar.name.slice(0, 45)}]\n`);
        }
      } catch {
        process.stdout.write(`  ✗ NP [${cigar.name.slice(0, 45)}] (err)\n`);
      }
      await sleep(500);
    }
    await pg.close().catch(() => {});
  }
  await Promise.all([worker(), worker(), worker()]);
  const found = results.filter(r => r.retailer === 'Neptune Cigar').length;
  console.log(`Neptune done: ${found}/${cigars.length}`);
}

async function main() {
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu'],
    protocolTimeout: 90000
  });
  try {
    await searchCI(browser, CI_MISSING);
    writeFileSync('/tmp/fill_gaps_ci_np.json', JSON.stringify(results, null, 2));
    await searchNeptune(browser, NP_MISSING);
  } finally {
    await browser.close().catch(() => {});
  }
  writeFileSync('/tmp/fill_gaps_ci_np.json', JSON.stringify(results, null, 2));
  const ci = results.filter(r => r.retailer === 'Cigars International').length;
  const np = results.filter(r => r.retailer === 'Neptune Cigar').length;
  console.log(`\nDone! CI: ${ci}/${CI_MISSING.length}, Neptune: ${np}/${NP_MISSING.length}`);
}

main().catch(e => { console.error(e); process.exit(1); });
