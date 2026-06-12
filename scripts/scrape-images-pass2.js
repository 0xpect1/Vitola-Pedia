/**
 * Pass 2 image scraper for remaining imageless cigars.
 *
 * Stage A: match cigars to JR Cigars sitemap URLs (slug token match),
 *          visit page, title-validate, take og:image.
 * Stage B: Neptune search for whatever Stage A missed.
 * Stage C: Holt's search for whatever remains.
 *
 * Same hard rule as pass 1: only accept an image when the page title
 * matches the cigar's brand + line tokens.
 *
 * Output: appends to /tmp/card_images_pass2.jsonl, final /tmp/card_images2.json
 */

import puppeteer from 'puppeteer';
import { readFileSync, writeFileSync, appendFileSync, existsSync } from 'fs';

const dataSrc = readFileSync(new URL('../js/data.js', import.meta.url), 'utf8');
const CIGARS = eval(dataSrc.replace(/^const /m, 'var ') + '; CIGARS');

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
const CONCURRENCY = 5;

const VITOLA_WORDS = new Set(['robusto','toro','churchill','churchills','corona','coronas','gordo','gorda','gordito','lancero','torpedo','belicoso','perfecto','gigante','magnum','petit','petite','double','doble','grande','gran','no','bp','box','pressed','short','half','figurado','salomon','pyramid','piramide','toros','panatela','panetela','lonsdale','demi','tube','tubos','tubo','xl','warship','prominente','laguito','especial','especiales','fino','grueso','extra','maduro','natural','oscuro','claro','rothschild','rothchild','single','cigar','cigars','pack','sixty','fifty','i','ii','iii','iv','v','vi','vii','viii','ix','x']);
// Wrapper words: retailers often fold these into or out of line names
// ("Oliva Serie G Cameroon" is Neptune's "Oliva Serie G"). Excluded from the
// title gate, but used to steer candidate picking toward the right variant.
const WRAPPER_WORDS = new Set(['cameroon','connecticut','habano','corojo','sumatra','broadleaf','criollo','shade','sungrown','sun','grown','candela','rosado','colorado','claro']);
const BAD_IMG_RX = [/res\/Logo\.png/i, /prodimgl\/non\.jpg/i, /fb_cigars/i, /fss_share/i, /cotm/i, /placeholder/i, /default[_-]?(product|image)/i, /\/logo[._-]/i, /favicon/i, /sprite/i];

const norm = s => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/['''`]/g, '');
const toks = s => norm(s).split(/[\s\-–—#./,()]+/).filter(Boolean);
const sigTokens = c => { const b = new Set(toks(c.brand)); return toks(c.name).filter(t => !b.has(t) && !VITOLA_WORDS.has(t) && !WRAPPER_WORDS.has(t)); };
const wrapperTokens = c => toks(c.name).filter(t => WRAPPER_WORDS.has(t));

function titleMatches(cigar, pageTitle) {
  if (!pageTitle) return false;
  const titleN = norm(pageTitle).replace(/[^a-z0-9 ]/g, ' ');
  const titleToks = new Set(titleN.split(/\s+/).filter(Boolean));
  const brandFirst = toks(cigar.brand).filter(t => t.length > 1);
  const brandOk = brandFirst.length === 0 || brandFirst.some(t => titleN.includes(t));
  const sig = sigTokens(cigar);
  if (sig.length === 0) return brandOk;
  const hit = sig.filter(t => titleToks.has(t) || titleN.includes(t)).length;
  if (brandOk && hit / sig.length >= 0.8) return true;
  // Retailers often drop the maker from line names (Neptune lists "Undercrown"
  // without "Drew Estate") — accept distinctive line tokens fully present.
  const distinctive = sig.filter(t => t.length >= 5);
  return distinctive.length >= 1 && distinctive.every(t => titleN.includes(t)) && hit / sig.length >= 0.8;
}
const imageOk = u => u && /^https?:\/\//.test(u) && !BAD_IMG_RX.some(rx => rx.test(u)) && (/\.(jpe?g|png|webp)(\?|$)/i.test(u) || /image\/upload/i.test(u));

// ── targets ───────────────────────────────────────────────────────
const targets = CIGARS.filter(c => !c.image);
console.log('Pass 2 targets:', targets.length);

const done = new Set();
if (existsSync('/tmp/card_images_pass2.jsonl')) {
  readFileSync('/tmp/card_images_pass2.jsonl', 'utf8').trim().split('\n').filter(Boolean)
    .forEach(l => { try { done.add(JSON.parse(l).id); } catch (e) {} });
  console.log('Resuming, already done:', done.size);
}

// ── Stage A prep: JR sitemap match ────────────────────────────────
const sitemap = readFileSync('/tmp/jr_sitemap.xml', 'utf8');
const jrUrls = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1]);
const jrIndex = jrUrls.map(u => {
  const parts = u.replace('https://www.jrcigars.com/item/', '').split('/');
  return { url: u, slugToks: new Set(toks(decodeURIComponent(parts.slice(0, 2).join(' ')))) };
});

function jrMatch(cigar) {
  const need = [...new Set([...toks(cigar.brand), ...sigTokens(cigar)])].filter(t => t.length > 1);
  if (!need.length) return null;
  let best = null, bestScore = 0;
  for (const e of jrIndex) {
    let hit = 0;
    for (const t of need) if (e.slugToks.has(t)) hit++;
    const score = hit / need.length;
    if (score > bestScore) { bestScore = score; best = e; }
  }
  return bestScore >= 0.85 ? best.url : null;
}

// ── scrape helpers ────────────────────────────────────────────────
async function fetchOg(page, url) {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 22000 });
  await new Promise(r => setTimeout(r, 800));
  return page.evaluate(() => {
    const meta = p => { const el = document.querySelector(`meta[property="${p}"], meta[name="${p}"]`); return el ? el.getAttribute('content') : null; };
    let img = meta('og:image');
    if (!img) {
      const el = document.querySelector('.product-image img, #product-main-image img, .pdp-main-image img, .product-media img, img[itemprop="image"]');
      img = el ? (el.currentSrc || el.src || el.getAttribute('data-src')) : null;
    }
    return { title: meta('og:title') || document.title || '', img };
  });
}

async function tryStageA(page, cigar) {
  const url = jrMatch(cigar);
  if (!url) return null;
  try {
    const info = await fetchOg(page, url);
    if (titleMatches(cigar, info.title) && imageOk(info.img)) {
      return { id: cigar.id, image: info.img.startsWith('//') ? 'https:' + info.img : info.img, source: 'JR Cigars', buyUrl: url };
    }
  } catch (e) {}
  return null;
}

function pickCandidate(links, cigar) {
  // Recall-oriented: line tokens drive the pick; the og:title gate at the
  // product page is the real safety check. Wrapper words steer toward the
  // right variant (serie-g vs serie-g-maduro) without blocking the match.
  const sig = sigTokens(cigar);
  const myWrappers = new Set(wrapperTokens(cigar));
  const brandToks = toks(cigar.brand).filter(t => t.length > 1);
  let best = null, bestScore = 0;
  for (const l of links) {
    const lt = norm(l.href + ' ' + l.text);
    const ltToks = new Set(toks(l.href + ' ' + l.text));
    const brandHit = brandToks.length === 0 || brandToks.some(t => lt.includes(t));
    const hit = sig.filter(t => lt.includes(t)).length;
    const cov = sig.length ? hit / sig.length : (brandHit ? 1 : 0);
    let score = cov + (brandHit ? 0.2 : 0);
    for (const w of myWrappers) if (ltToks.has(w)) score += 0.15;       // right wrapper variant
    for (const t of ltToks) if (WRAPPER_WORDS.has(t) && !myWrappers.has(t)) score -= 0.2; // wrong variant
    if (cov >= 0.75 && score > bestScore) { bestScore = score; best = l; }
  }
  return best;
}

async function validateAndTake(page, cigar, href, source) {
  const info = await fetchOg(page, href);
  if (titleMatches(cigar, info.title) && imageOk(info.img)) {
    return { id: cigar.id, image: info.img.startsWith('//') ? 'https:' + info.img : info.img, source, buyUrl: href };
  }
  return null;
}

// Neptune's nav (on every page) lists ALL ~1600 line pages — harvest once.
let NEPTUNE_LINES = [];
const neptuneCache = new Map();   // line URL -> {title, img}

async function harvestNeptuneNav(page) {
  try {
    await page.goto('https://www.neptunecigar.com/cigars', { waitUntil: 'domcontentloaded', timeout: 25000 });
    await new Promise(r => setTimeout(r, 1500));
    NEPTUNE_LINES = await page.evaluate(() => {
      const seen = new Map();
      [...document.querySelectorAll('a[href*="/cigar/"]')].forEach(a => {
        const href = a.href.split('?')[0];
        if (!seen.has(href)) seen.set(href, { href, text: a.textContent.trim() });
      });
      return [...seen.values()];
    });
    console.log('Neptune nav harvested:', NEPTUNE_LINES.length, 'line pages');
  } catch (e) { console.log('Neptune nav harvest failed:', e.message); }
}

async function tryStageB(page, cigar) {
  if (!NEPTUNE_LINES.length) return null;
  const cand = pickCandidate(NEPTUNE_LINES, cigar);
  if (!cand) return null;
  try {
    let info = neptuneCache.get(cand.href);
    if (!info) {
      info = await fetchOg(page, cand.href);
      neptuneCache.set(cand.href, info);
    }
    if (titleMatches(cigar, info.title) && imageOk(info.img)) {
      return { id: cigar.id, image: info.img.startsWith('//') ? 'https:' + info.img : info.img, source: 'Neptune Cigar', buyUrl: cand.href };
    }
  } catch (e) {}
  return null;
}

async function tryStageC(page, cigar) {
  // Holt's search (results render after JS — wait for product links)
  const q = encodeURIComponent((cigar.brand + ' ' + cigar.name).replace(/[^\w\s]/g, ' '));
  try {
    await page.goto(`https://www.holts.com/catalogsearch/result/?q=${q}`, { waitUntil: 'domcontentloaded', timeout: 22000 });
    await page.waitForSelector('.products-grid .product-name a, h2.product-name a, a.product-item-link', { timeout: 9000 }).catch(() => null);
    const links = await page.evaluate(() =>
      [...document.querySelectorAll('.products-grid .product-name a, h2.product-name a, a.product-item-link')]
        .map(a => ({ href: a.href, text: a.textContent.trim() })).slice(0, 12)
    );
    const cand = pickCandidate(links, cigar);
    if (!cand) return null;
    return await validateAndTake(page, cigar, cand.href, "Holt's");
  } catch (e) {}
  return null;
}

// Havana House: harvest the full Cuban catalog once (paginated category).
let HH_LINKS = [];

async function harvestHavanaHouse(page) {
  const all = new Map();
  for (let p = 1; p <= 14; p++) {
    const url = p === 1
      ? 'https://www.havanahouse.co.uk/product-category/cigars/cuban/'
      : `https://www.havanahouse.co.uk/product-category/cigars/cuban/page/${p}/`;
    try {
      const resp = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 22000 });
      if (resp && resp.status() >= 400) break;
      await new Promise(r => setTimeout(r, 600));
      const links = await page.evaluate(() => {
        const seen = new Map();
        document.querySelectorAll('ul.products a[href*="/product/"], .products a[href*="/product/"]').forEach(a => {
          const href = a.href.split('?')[0];
          const text = a.textContent.trim();
          if (!seen.has(href) || text.length > (seen.get(href).text || '').length) seen.set(href, { href, text });
        });
        return [...seen.values()];
      });
      if (!links.length) break;
      let added = 0;
      links.forEach(l => { if (!all.has(l.href)) { all.set(l.href, l); added++; } });
      if (!added) break;
    } catch (e) { break; }
  }
  HH_LINKS = [...all.values()];
  console.log('Havana House catalog harvested:', HH_LINKS.length, 'products');
}

async function tryStageD(page, cigar) {
  try {
    const cand = pickCandidate(HH_LINKS, cigar);
    if (cand) {
      const r = await validateAndTake(page, cigar, cand.href, 'Havana House');
      if (r) return r;
    }
    // fallback: site search
    const q = encodeURIComponent((cigar.brand + ' ' + cigar.name).replace(/[^\w\s]/g, ' '));
    await page.goto(`https://www.havanahouse.co.uk/?s=${q}&post_type=product`, { waitUntil: 'domcontentloaded', timeout: 22000 });
    await new Promise(r => setTimeout(r, 900));
    const sLinks = await page.evaluate(() =>
      [...document.querySelectorAll('a[href*="/product/"]')].map(a => ({ href: a.href, text: a.textContent.trim() })).slice(0, 40)
    );
    const sCand = pickCandidate(sLinks, cigar);
    if (!sCand) return null;
    return await validateAndTake(page, cigar, sCand.href, 'Havana House');
  } catch (e) {}
  return null;
}

const queue = targets.filter(c => !done.has(c.id));

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
    const isCuban = cigar.origin === 'Cuba';
    let r = null;
    if (isCuban) {
      r = await tryStageD(page, cigar);          // Cubans: Havana House only
    } else {
      r = await tryStageA(page, cigar);          // JR sitemap match
      if (!r) r = await tryStageB(page, cigar);  // Neptune line pages (nav harvest)
      if (!r) r = await tryStageC(page, cigar);  // Holt's search
      if (!r) r = await tryStageD(page, cigar);  // Havana House (stocks New World too)
    }
    if (!r) r = { id: cigar.id, image: null, source: null };
    appendFileSync('/tmp/card_images_pass2.jsonl', JSON.stringify(r) + '\n');
    const n = done.size + (targets.length - queue.length - done.size);
    process.stdout.write(`[${n}/${targets.length}] ${r.image ? '✓ ' + r.source : '✗'} ${cigar.id}\n`);
  }
  try { await page.close(); } catch (e) {}
}

const browser = await puppeteer.launch({ headless: 'new' });
{
  const navPage = await browser.newPage();
  await navPage.setUserAgent(UA);
  await harvestNeptuneNav(navPage);
  await harvestHavanaHouse(navPage);
  await navPage.close();
}
await Promise.all(Array.from({ length: CONCURRENCY }, () => worker(browser)));
await browser.close();

const all = new Map();
readFileSync('/tmp/card_images_pass2.jsonl', 'utf8').trim().split('\n').filter(Boolean)
  .forEach(l => { try { const r = JSON.parse(l); all.set(r.id, r); } catch (e) {} });
const found = [...all.values()].filter(r => r.image);
writeFileSync('/tmp/card_images2.json', JSON.stringify(found, null, 2));
console.log(`\nPASS 2 DONE. Found: ${found.length}/${targets.length}`);
