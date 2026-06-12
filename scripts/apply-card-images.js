/**
 * Applies scraped images from /tmp/card_images.json to js/data.js.
 *
 * Safety rails:
 *  - An image URL appearing on cigars of DIFFERENT lines is dropped from all
 *    (same-line vitola groups may share).
 *  - Bad buy links from /tmp/bad_buylinks.json are removed only when the page
 *    title provably matches a DIFFERENT cigar in the database (e.g. a JR link
 *    on Man O' War pointing at Foundation The Wise Man).
 *
 * Then resyncs data/cigars.json.
 */

import { readFileSync, writeFileSync } from 'fs';

const dataPath = new URL('../js/data.js', import.meta.url);
const src = readFileSync(dataPath, 'utf8');
const CIGARS = eval(src.replace(/^const /m, 'var ') + '; CIGARS');
const byId = new Map(CIGARS.map(c => [c.id, c]));

const foundPath = process.argv[2] || '/tmp/card_images.json';
const badPath = process.argv[3];   // optional
const found = JSON.parse(readFileSync(foundPath, 'utf8'));
const badLinks = badPath ? JSON.parse(readFileSync(badPath, 'utf8')) : [];

const VITOLA_WORDS = new Set(['robusto','toro','churchill','churchills','corona','coronas','gordo','gorda','lancero','torpedo','belicoso','perfecto','gigante','magnum','petit','petite','double','doble','grande','gran','no','bp','box','pressed','short','half','figurado','salomon','pyramid','piramide','toros','panatela','panetela','lonsdale','demi','tube','tubos','tubo','xl','warship','prominente','laguito','especial','especiales','fino','grueso','extra','maduro','natural','oscuro','claro','rothschild','rothchild','single','cigar','cigars','pack','i','ii','iii','iv','v','vi','vii','viii','ix','x']);
const norm = s => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/['''`]/g, '');
const toks = s => norm(s).split(/[\s\-–—#./,()]+/).filter(Boolean);
const lineKey = c => {
  const brandT = new Set(toks(c.brand));
  return toks(c.name).filter(t => !brandT.has(t) && !VITOLA_WORDS.has(t) && !/^\d+$/.test(t)).sort().join('|');
};

// ── cross-line dedupe ─────────────────────────────────────────────
const byImg = new Map();
found.forEach(r => {
  if (!byImg.has(r.image)) byImg.set(r.image, []);
  byImg.get(r.image).push(r);
});
const accepted = [];
let dropped = 0;
byImg.forEach(items => {
  const keys = new Set(items.map(r => (byId.get(r.id) ? lineKey(byId.get(r.id)) : Math.random())));
  if (keys.size === 1) accepted.push(...items);
  else { dropped += items.length; console.log('DROP cross-line dup:', items.map(i => i.id).join(', ')); }
});
console.log(`Accepted ${accepted.length} images, dropped ${dropped} cross-line dups`);

// ── provably-wrong buy links ──────────────────────────────────────
// A bad link is removed only if its page title matches another cigar's line.
function titleMatchesCigar(title, cigar) {
  const titleN = norm(title).replace(/[^a-z0-9 ]/g, ' ');
  const brandFirst = toks(cigar.brand).filter(t => t.length > 1);
  const brandOk = brandFirst.length === 0 || brandFirst.some(t => titleN.includes(t));
  const sig = toks(cigar.name).filter(t => !VITOLA_WORDS.has(t) && t.length > 2);
  if (!sig.length) return false;
  const hit = sig.filter(t => titleN.includes(t)).length;
  return brandOk && hit / sig.length >= 0.8;
}
const linkRemovals = [];
badLinks.forEach(b => {
  const owner = byId.get(b.id);
  if (!owner) return;
  const other = CIGARS.find(c => c.id !== b.id && lineKey(c) !== lineKey(owner) && titleMatchesCigar(b.pageTitle, c));
  if (other) linkRemovals.push({ ...b, matchedOther: other.id });
});
console.log(`Provably-wrong buy links to remove: ${linkRemovals.length}`);
writeFileSync('/tmp/link_removals.json', JSON.stringify(linkRemovals, null, 2));

// ── textual edits to js/data.js ───────────────────────────────────
const lines = src.split('\n');
const imgById = new Map(accepted.map(r => [r.id, r.image]));
const rmLinksById = new Map();
linkRemovals.forEach(r => {
  if (!rmLinksById.has(r.id)) rmLinksById.set(r.id, new Set());
  rmLinksById.get(r.id).add(r.url);
});

let currentId = null, imagesAdded = 0, linksRemoved = 0;
const out = [];
for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  const m = line.match(/^\s*id:\s*["']([^"']+)["']/);
  if (m) currentId = m[1];

  // remove provably-wrong buy link lines (single-line objects: { retailer: ..., url: "...", ... })
  if (currentId && rmLinksById.has(currentId)) {
    const urls = rmLinksById.get(currentId);
    if ([...urls].some(u => line.includes(`"${u}"`) || line.includes(`'${u}'`))) {
      linksRemoved++;
      continue;
    }
  }

  out.push(line);

  // insert image after the description line (image field goes anywhere in the object)
  if (currentId && imgById.has(currentId) && /^\s*rating:\s*/.test(line)) {
    const indent = line.match(/^\s*/)[0];
    out.push(`${indent}image: "${imgById.get(currentId)}",`);
    imagesAdded++;
    imgById.delete(currentId);
  }
}
writeFileSync(dataPath, out.join('\n'));
console.log(`Images added: ${imagesAdded}, bad link lines removed: ${linksRemoved}`);

// ── verify + sync json ────────────────────────────────────────────
const after = readFileSync(dataPath, 'utf8');
const C2 = eval(after.replace(/^const /m, 'var ') + '; CIGARS');
console.log('Re-parse OK:', C2.length, 'cigars |', C2.filter(x => x.image).length, 'with images');
writeFileSync(new URL('../data/cigars.json', import.meta.url), JSON.stringify(C2, null, 2) + '\n');
console.log('cigars.json synced');
