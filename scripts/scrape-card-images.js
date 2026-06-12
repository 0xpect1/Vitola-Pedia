/**
 * Scrapes accurate product images for every imageless cigar in js/data.js.
 *
 * For each cigar without an image, visits its buyLinks product pages
 * (Neptune → Famous Smoke → CI → JR → Smoke Inn → Cigar Page → Havana House → C.Gars)
 * and accepts the page's og:image ONLY if the page title matches the cigar's
 * brand + line tokens — so a wrong buy link can never produce a wrong image.
 *
 * Output:
 *   /tmp/card_images.json        [{id, image, source}]
 *   /tmp/bad_buylinks.json       [{id, retailer, url, pageTitle}]  (title mismatch)
 *   /tmp/card_images_progress.jsonl  (incremental, survives crashes)
 */

import puppeteer from 'puppeteer';
import { readFileSync, writeFileSync, appendFileSync, existsSync } from 'fs';

const dataSrc = readFileSync(new URL('../js/data.js', import.meta.url), 'utf8');
const CIGARS = eval(dataSrc.replace(/^const /m, 'var ') + '; CIGARS');

const RETAILER_PRIORITY = [
  'Neptune Cigar', 'Famous Smoke Shop', 'Cigars International', 'JR Cigars',
  'Smoke Inn', 'Cigar Page', 'Havana House', 'C.Gars Ltd',
];

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
const CONCURRENCY = 5;

const VITOLA_WORDS = new Set(['robusto','toro','churchill','churchills','corona','coronas','gordo','gorda','lancero','torpedo','belicoso','perfecto','gigante','magnum','petit','petite','double','doble','grande','gran','no','bp','box','pressed','short','half','figurado','salomon','pyramid','piramide','toros','panatela','panetela','lonsdale','demi','tube','tubos','tubo','xl','warship','prominente','laguito','especial','especiales','fino','grueso','extra','maduro','natural','oscuro','claro','rothschild','rothchild','single','cigar','cigars','pack','i','ii','iii','iv','v','vi','vii','viii','ix','x']);

const BAD_IMG_RX = [
  /res\/Logo\.png/i, /prodimgl\/non\.jpg/i, /fb_cigars/i, /fss_share/i,
  /cotm/i, /placeholder/i, /default[_-]?(product|image)/i, /\/logo[._-]/i,
  /favicon/i, /sprite/i,
];

const norm = s => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/['''`]/g, '');
const toks = s => norm(s).split(/[\s\-–—#./,()]+/).filter(Boolean);

function sigTokens(cigar) {
  const brandT = new Set(toks(cigar.brand));
  return toks(cigar.name).filter(t => !brandT.has(t) && !VITOLA_WORDS.has(t));
}

function titleMatches(cigar, pageTitle) {
  if (!pageTitle) return false;
  const titleN = norm(pageTitle).replace(/[^a-z0-9 ]/g, ' ');
  const titleToks = new Set(titleN.split(/\s+/).filter(Boolean));
  const brandFirst = toks(cigar.brand).filter(t => t.length > 1);
  const brandOk = brandFirst.length === 0 || brandFirst.some(t => titleN.includes(t));
  const sig = sigTokens(cigar);
  if (sig.length === 0) return brandOk;   // name == brand + vitola only
  const hit = sig.filter(t => titleToks.has(t) || titleN.includes(t)).length;
  return brandOk && hit / sig.length >= 0.8;
}

function imageOk(url) {
  if (!url || !/^https?:\/\//.test(url)) return false;
  if (BAD_IMG_RX.some(rx => rx.test(url))) return false;
  return /\.(jpe?g|png|webp)(\?|$)/i.test(url) || /famous-smoke\.com\/image\/upload/i.test(url) || /cigarsinternational\.com\/.*\/(image|img)/i.test(url);
}

// ── build work queue ──────────────────────────────────────────────
const targets = CIGARS.filter(c => !c.image && (c.buyLinks || []).length);
console.log(`Targets: ${targets.length} imageless cigars with buy links`);

// resume support
const done = new Set();
if (existsSync('/tmp/card_images_progress.jsonl')) {
  readFileSync('/tmp/card_images_progress.jsonl', 'utf8').trim().split('\n').filter(Boolean)
    .forEach(l => { try { done.add(JSON.parse(l).id); } catch (e) {} });
  console.log(`Resuming: ${done.size} already processed`);
}

const queue = targets.filter(c => !done.has(c.id));
const results = [];
const badLinks = [];
const blockedDomains = new Map();   // domain -> consecutive block count

function domainOf(url) { try { return new URL(url).hostname.replace(/^www\./, ''); } catch (e) { return ''; } }

async function processCigar(page, cigar) {
  const links = (cigar.buyLinks || [])
    .slice()
    .sort((a, b) => RETAILER_PRIORITY.indexOf(a.retailer) - RETAILER_PRIORITY.indexOf(b.retailer));

  for (const link of links) {
    const dom = domainOf(link.url);
    if ((blockedDomains.get(dom) || 0) >= 4) continue;   // give up on hard-blocked domains
    try {
      await page.goto(link.url, { waitUntil: 'domcontentloaded', timeout: 22000 });
      await new Promise(r => setTimeout(r, 900));
      const info = await page.evaluate(() => {
        const meta = p => { const el = document.querySelector(`meta[property="${p}"], meta[name="${p}"]`); return el ? el.getAttribute('content') : null; };
        let img = meta('og:image');
        if (!img) {
          const el = document.querySelector('.product-image img, #product-main-image img, .pdp-main-image img, .product-media img, img[itemprop="image"]');
          img = el ? (el.currentSrc || el.src || el.getAttribute('data-src')) : null;
        }
        return { title: meta('og:title') || document.title || '', img };
      });

      const blocked = /just a moment|access denied|attention required|cloudflare|403 forbidden/i.test(info.title);
      if (blocked) {
        blockedDomains.set(dom, (blockedDomains.get(dom) || 0) + 1);
        continue;
      }
      blockedDomains.set(dom, 0);

      if (!titleMatches(cigar, info.title)) {
        badLinks.push({ id: cigar.id, retailer: link.retailer, url: link.url, pageTitle: String(info.title).slice(0, 90) });
        continue;
      }
      let img = info.img;
      if (img && img.startsWith('//')) img = 'https:' + img;
      if (imageOk(img)) {
        return { id: cigar.id, image: img, source: link.retailer };
      }
    } catch (e) {
      // timeout / nav error — try next retailer
    }
  }
  return { id: cigar.id, image: null, source: null };
}

async function worker(browser) {
  const page = await browser.newPage();
  await page.setUserAgent(UA);
  await page.setRequestInterception(true);
  page.on('request', req => {
    if (['font', 'media', 'image'].includes(req.resourceType())) req.abort();
    else req.continue();
  });
  while (queue.length) {
    const cigar = queue.shift();
    const r = await processCigar(page, cigar);
    appendFileSync('/tmp/card_images_progress.jsonl', JSON.stringify(r) + '\n');
    results.push(r);
    const n = done.size + results.length;
    process.stdout.write(`[${n}/${targets.length}] ${r.image ? '✓' : '✗'} ${cigar.id} ${r.source ? '(' + r.source + ')' : ''}\n`);
  }
  try { await page.close(); } catch (e) {}
}

const browser = await puppeteer.launch({ headless: 'new' });
await Promise.all(Array.from({ length: CONCURRENCY }, () => worker(browser)));
await browser.close();

// merge with prior progress
const all = new Map();
readFileSync('/tmp/card_images_progress.jsonl', 'utf8').trim().split('\n').filter(Boolean)
  .forEach(l => { try { const r = JSON.parse(l); all.set(r.id, r); } catch (e) {} });

const found = [...all.values()].filter(r => r.image);
writeFileSync('/tmp/card_images.json', JSON.stringify(found, null, 2));
writeFileSync('/tmp/bad_buylinks.json', JSON.stringify(badLinks, null, 2));
console.log(`\nDONE. Images found: ${found.length}/${targets.length}. Bad links flagged: ${badLinks.length}`);
console.log('Blocked domains:', JSON.stringify([...blockedDomains.entries()].filter(([, v]) => v >= 4)));
