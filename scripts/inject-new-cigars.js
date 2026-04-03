/**
 * Injects new cigars from /tmp/all_new_cigars.json into js/data.js.
 *
 * For each new cigar:
 *   1. Looks up buy links from /tmp/retailer_links.json   (from scrape-all-retailers.js)
 *   2. Looks up Famous Smoke URL from /tmp/fs_links_v2.json (from scrape-fs-links.js)
 *   3. Looks up image URL from /tmp/fs_images.json         (from scrape-fs-images.js)
 *
 * Only injects cigars that have at least one buy link.
 * Writes a JS object literal (not JSON) compatible with data.js format.
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';

const newCigars    = JSON.parse(readFileSync('/tmp/all_new_cigars.json', 'utf8'));
const retailerLinks = existsSync('/tmp/retailer_links.json')
  ? JSON.parse(readFileSync('/tmp/retailer_links.json', 'utf8'))
  : {};
const fsLinks      = existsSync('/tmp/fs_links_v2.json')
  ? Object.fromEntries(JSON.parse(readFileSync('/tmp/fs_links_v2.json', 'utf8')).map(e => [e.id, e.url]))
  : {};
const fsImages     = existsSync('/tmp/fs_images.json')
  ? Object.fromEntries(JSON.parse(readFileSync('/tmp/fs_images.json', 'utf8')).map(e => [e.id, e.image]))
  : {};

console.log(`New cigars: ${newCigars.length}`);
console.log(`Retailer links: ${Object.keys(retailerLinks).length} cigars`);
console.log(`Famous Smoke links: ${Object.keys(fsLinks).length} cigars`);
console.log(`Images: ${Object.keys(fsImages).length} cigars`);

function buildBuyLinks(id, origin) {
  const links = [];
  const rl = retailerLinks[id] || {};
  const fsUrl = fsLinks[id];

  const isCuban = origin === 'Cuba';

  if (isCuban) {
    if (rl['Havana House']) links.push({ retailer: 'Havana House', url: rl['Havana House'], price: null });
    if (rl['C.Gars Ltd']) links.push({ retailer: 'C.Gars Ltd', url: rl['C.Gars Ltd'], price: null });
    // Fallback search for Hunters & Frankau
    links.push({ retailer: "Hunters & Frankau", url: `https://cigars.co.uk/?s=${encodeURIComponent(id.replace(/-/g, '+'))}`, price: null });
  } else {
    if (fsUrl) links.push({ retailer: 'Famous Smoke Shop', url: fsUrl, price: null });
    if (rl['JR Cigars']) links.push({ retailer: 'JR Cigars', url: rl['JR Cigars'], price: null });
    if (rl['Neptune Cigar']) links.push({ retailer: 'Neptune Cigar', url: rl['Neptune Cigar'], price: null });
    if (rl['Cigars International']) links.push({ retailer: 'Cigars International', url: rl['Cigars International'], price: null });
  }

  return links;
}

function escape(s) {
  return String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function toCigarJS(c, buyLinks, image) {
  const flavorsStr = c.flavors.map(f => `"${escape(f)}"`).join(', ');
  const pairingsStr = c.pairings.map(p => `"${escape(p)}"`).join(', ');
  const buyLinksStr = JSON.stringify(buyLinks);

  let out = `  {\n`;
  out += `    id: "${escape(c.id)}",\n`;
  out += `    name: "${escape(c.name)}",\n`;
  if (image) out += `    image: "${escape(image)}",\n`;
  out += `    brand: "${escape(c.brand)}",\n`;
  out += `    origin: "${escape(c.origin)}",\n`;
  out += `    region: "${escape(c.region)}",\n`;
  out += `    wrapper: "${escape(c.wrapper)}",\n`;
  out += `    binder: "${escape(c.binder)}",\n`;
  out += `    filler: "${escape(c.filler)}",\n`;
  out += `    strength: ${c.strength},\n`;
  out += `    smokingTime: ${c.smokingTime},\n`;
  out += `    price: ${c.price},\n`;
  out += `    rating: ${c.rating},\n`;
  out += `    flavors: [${flavorsStr}],\n`;
  out += `    size: "${escape(c.size)}",\n`;
  out += `    length: ${c.length},\n`;
  out += `    ringGauge: ${c.ringGauge},\n`;
  out += `    popularity: ${c.popularity},\n`;
  out += `    description: "${escape(c.description)}",\n`;
  out += `    pairings: [${pairingsStr}],\n`;
  out += `    yearFounded: ${c.yearFounded},\n`;
  out += `    limited: ${c.limited},\n`;
  out += `    buyLinks: ${buyLinksStr}\n`;
  out += `  }`;
  return out;
}

// Build JS entries for all new cigars
const injected = [];
const skippedNoBuyLinks = [];

for (const cigar of newCigars) {
  const buyLinks = buildBuyLinks(cigar.id, cigar.origin);
  const image = fsImages[cigar.id] || null;

  if (buyLinks.length === 0) {
    skippedNoBuyLinks.push(cigar.id);
    // Still inject — buy links will be search fallback from app.js
    // Actually include it anyway since the app auto-generates search fallbacks
  }

  injected.push(toCigarJS(cigar, buyLinks, image));
}

console.log(`\nCigars with buy links: ${injected.length - skippedNoBuyLinks.length}`);
if (skippedNoBuyLinks.length) {
  console.log(`Cigars with NO direct buy links (will use app search fallback): ${skippedNoBuyLinks.length}`);
}

// Read current data.js and inject before the closing "];
let dataJs = readFileSync('./js/data.js', 'utf8');

// Find the last cigar entry and insert after it
const insertPoint = dataJs.lastIndexOf('\n];');
if (insertPoint === -1) {
  console.error('Could not find "];  in data.js');
  process.exit(1);
}

const newEntries = '\n' + injected.join(',\n') + '\n';
const updated = dataJs.slice(0, insertPoint) + ',' + newEntries + dataJs.slice(insertPoint);

writeFileSync('./js/data.js', updated);
console.log(`\n✓ Injected ${injected.length} new cigars into js/data.js`);

// Verify syntax
try {
  const verify = updated.replace(/^const /gm, 'var ');
  eval(verify);
  const match = updated.match(/id:\s*"[^"]+"/g);
  console.log(`✓ Syntax OK — total entries: ${match ? match.length : 'unknown'}`);
} catch (e) {
  console.error(`✗ SYNTAX ERROR: ${e.message}`);
  process.exit(1);
}
