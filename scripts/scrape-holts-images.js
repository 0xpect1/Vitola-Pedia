/**
 * Fetches og:image from Holt's Cigars product-line pages using direct HTTP
 * (no Puppeteer needed — Holt's serves full HTML). Fuzzy-matches each
 * missing cigar to the closest product-line URL from the sitemap.
 *
 * Also tries: brand websites (Viaje, Ezra Zion, ACE Prime, Principle, etc.)
 * and Cuban retailers for the 8 remaining Cuban cigars.
 *
 * Reads:   /tmp/missing_images.json       [{id, name, brand, origin, buyLinks}]
 *          /tmp/holts_products.json        [all holts product URLs]
 * Output:  /tmp/holts_images.json          [{id, image, retailer, url}]
 */

import { readFileSync, writeFileSync } from 'fs';
import { setTimeout as sleep } from 'timers/promises';

const DATA   = JSON.parse(readFileSync('/tmp/missing_images.json', 'utf8'));
const HOLTS  = JSON.parse(readFileSync('/tmp/holts_products.json', 'utf8'));

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

function norm(s) {
  return String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[''`]/g, '').replace(/[^a-z0-9 ]/gi, ' ').toLowerCase().trim();
}
function words(s) { return norm(s).split(/\s+/).filter(w => w.length > 2); }
function matchScore(target, candidate) {
  const tw = new Set(words(target)), cw = new Set(words(candidate));
  if (!tw.size) return 0;
  return [...tw].filter(w => cw.has(w)).length / tw.size;
}

// Upgrade thumbnail → larger image
function upgradeImg(url) {
  if (!url) return null;
  return url
    .replace(/\/thumb\/\d+x\d+\//g, '/thumb/600x600/')
    .replace(/h_75,q_auto,w_75/,  'h_400,q_auto,w_400')
    .replace(/h_75,w_75/,         'h_400,w_400');
}

async function fetchOgImage(url, label = '') {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': UA, 'Accept-Language': 'en-US,en;q=0.9' },
      signal: AbortSignal.timeout(15000)
    });
    if (!res.ok) return null;
    const html = await res.text();
    const m = html.match(/og:image[^>]*content="([^"]+)"/);
    if (!m) return null;
    return upgradeImg(m[1]);
  } catch { return null; }
}

// Find best Holt's URL for a cigar name
function findHoltsUrl(cigar) {
  const brand = norm(cigar.brand);
  const name  = norm(cigar.name);
  // Filter to brand-relevant URLs
  const brandKw = brand.split(/\s+/)[0];
  const candidates = HOLTS.filter(u => u.toLowerCase().includes(brandKw));
  if (!candidates.length) return null;

  // Score each by how well it matches the cigar name
  let best = null, bs = 0;
  for (const u of candidates) {
    const slug = u.replace(/.*\/all-cigar-brands\//, '').replace('.html', '');
    const s = matchScore(name, slug);
    if (s > bs) { bs = s; best = u; }
  }
  // Require at least brand keyword + one more word matching
  if (bs < 0.3) {
    // Fall back to brand-level page
    const brandPage = HOLTS.find(u => {
      const slug = u.replace(/.*\/all-cigar-brands\//, '').replace('.html', '');
      return slug === brandKw || slug.startsWith(brandKw + '-') && slug.split('-').length === 2;
    });
    return brandPage || null;
  }
  return best;
}

// Brand websites (direct fetch)
const BRAND_SITES = {
  'viaje':       async (name) => await tryBrandSite('https://www.viajecigars.com', name, /viajecigars\.com\/product\//),
  'ezra zion':   async (name) => await tryBrandSite('https://ezrazioncigar.com', name, /ezrazioncigar\.com\/product\//),
  'ace prime':   async (name) => await tryBrandSite('https://www.aceprimecigars.com', name, /aceprimecigars\.com\/product\//),
  'protocol':    async (name) => await tryBrandSite('https://protocolcigars.com', name, /protocolcigars\.com\/product\//),
  'serino':      async (name) => await trySerinoImages(name),
  'cornelius':   async (name) => await tryBrandSite('https://corneliusandanthony.com', name, /corneliusandanthony\.com\/product\//),
  'ventura':     async (name) => await tryBrandSite('https://venturacigars.com', name, /venturacigars\.com\/product\//),
  'rojas':       async (name) => await tryBrandSite('https://rojascigars.com', name, /rojascigars\.com\/product\//),
  'dapper':      async (name) => await tryBrandSite('https://dappercigar.com', name, /dappercigar\.com\/product\//),
  'j. fuego':    async (name) => await tryBrandSite('https://jfuegocigars.com', name, /jfuego.*\/product\//),
  'crux':        async (name) => await tryBrandSite('https://cruxcigar.com', name, /cruxcigar\.com\/product\//),
  'hvc':         async (name) => await tryBrandSite('https://hvccigar.com', name, /hvccigar\.com\/product\//),
  'dunbarton':   async (name) => await tryBrandSite('https://dunbartontobacco.com', name, /dunbartontobacco\.com\/product\//),
  'ferio tego':  async (name) => await tryBrandSite('https://feriotego.com', name, /feriotego\.com\/product\//),
  'principle':   async (name) => await tryBrandSite('https://principlecigar.com', name, /principlecigar\.com\/product\//),
  'la palina':   async (name) => await tryBrandSite('https://lapalinacigar.com', name, /lapalinacigar\.com\/product\//),
};

async function tryBrandSite(baseUrl, cigarName, linkPattern) {
  try {
    // Try the homepage first to find the search or products URL
    const q = norm(cigarName).replace(/\s+/g, '+');
    const searchUrl = `${baseUrl}/?s=${encodeURIComponent(norm(cigarName))}`;
    const res = await fetch(searchUrl, {
      headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(10000)
    });
    if (!res.ok) return null;
    const html = await res.text();

    // Find first matching product link
    const linkRe = /href="(https?:\/\/[^"]+)"/g;
    let m;
    const candidates = [];
    while ((m = linkRe.exec(html)) !== null) {
      if (linkPattern.test(m[1])) candidates.push(m[1]);
    }
    if (!candidates.length) return null;

    // Pick best match by name
    let best = null, bs = 0;
    for (const url of candidates) {
      const slug = url.split('/').pop() || url.split('/').slice(-2)[0];
      const s = matchScore(cigarName, slug);
      if (s > bs) { bs = s; best = url; }
    }
    if (!best) best = candidates[0];

    const img = await fetchOgImage(best);
    if (img && img.startsWith('http')) return { image: img, retailer: baseUrl.replace('https://www.','').replace('https://',''), url: best };
  } catch {}
  return null;
}

async function trySerinoImages(name) {
  // Serino has a site at serinohandmade.com
  return await tryBrandSite('https://serinohandmadecigars.com', name, /serinohandmade.*\/product\//);
}

// Havana House retry for Cubans with product links
async function tryHavanaHouseRetry(cigar) {
  const hhLink = (cigar.buyLinks || []).find(l =>
    l.retailer === 'Havana House' && l.url && l.url.includes('/product/')
  );
  if (!hhLink) return null;
  // Fetch directly
  try {
    const res = await fetch(hhLink.url, {
      headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(15000)
    });
    if (!res.ok) return null;
    const html = await res.text();
    const m = html.match(/og:image[^>]*content="([^"]+)"/);
    if (!m) return null;
    const img = m[1];
    if (img && img.startsWith('http')) return { image: img, retailer: 'Havana House', url: hhLink.url };
  } catch {}
  return null;
}

// GQ Tobaccos search
async function tryGQTobaccos(name) {
  try {
    const res = await fetch(`https://www.gqtobaccos.com/?s=${encodeURIComponent(name)}`, {
      headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(10000)
    });
    if (!res.ok) return null;
    const html = await res.text();
    const m = html.match(/href="(https?:\/\/www\.gqtobaccos\.com\/product\/[^"]+)"/);
    if (!m) return null;
    const img = await fetchOgImage(m[1]);
    if (img && img.startsWith('http')) return { image: img, retailer: 'GQ Tobaccos', url: m[1] };
  } catch {}
  return null;
}

async function processOne(cigar) {
  const isCuban = cigar.origin === 'Cuba';
  await sleep(200); // polite rate limiting

  if (isCuban) {
    let r = await tryHavanaHouseRetry(cigar);
    if (r) return r;
    r = await tryGQTobaccos(cigar.name);
    if (r) return r;
    return null;
  }

  // Non-Cuban: try Holt's first
  const holtsUrl = findHoltsUrl(cigar);
  if (holtsUrl) {
    const img = await fetchOgImage(holtsUrl);
    if (img) return { image: img, retailer: "Holt's Cigars", url: holtsUrl };
  }

  // Try brand site
  const brandKey = Object.keys(BRAND_SITES).find(k => {
    const nb = norm(cigar.brand);
    return nb.startsWith(k) || nb.includes(k);
  });
  if (brandKey) {
    const r = await BRAND_SITES[brandKey](cigar.name);
    if (r) return r;
  }

  return null;
}

async function main() {
  console.log(`Processing ${DATA.length} cigars...`);
  const results = [];

  // Process in small parallel batches
  const BATCH = 5;
  for (let i = 0; i < DATA.length; i += BATCH) {
    const batch = DATA.slice(i, i + BATCH);
    const batchResults = await Promise.all(batch.map(async cigar => {
      const r = await processOne(cigar);
      if (r) {
        process.stdout.write(`✓ ${cigar.id.slice(0, 50)} [${r.retailer}]\n`);
        return { id: cigar.id, image: r.image, retailer: r.retailer, url: r.url };
      } else {
        process.stdout.write(`✗ ${cigar.id.slice(0, 50)}\n`);
        return null;
      }
    }));
    results.push(...batchResults.filter(Boolean));
  }

  writeFileSync('/tmp/holts_images.json', JSON.stringify(results, null, 2));
  console.log(`\n✓ Done! Found ${results.length}/${DATA.length} images → /tmp/holts_images.json`);
}

main().catch(e => { console.error(e); process.exit(1); });
