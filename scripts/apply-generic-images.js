/**
 * Generic image applier — reads any [{id, image}] JSON file and applies
 * images to js/data.js for cigars currently missing an image.
 *
 * Usage: node apply-generic-images.js /tmp/source_images.json
 */

import { readFileSync, writeFileSync } from 'fs';

const src = process.argv[2];
if (!src) { console.error('Usage: node apply-generic-images.js <path>'); process.exit(1); }

const images = JSON.parse(readFileSync(src, 'utf8'));
const imageMap = Object.fromEntries(images.map(e => [e.id, e.image]));
console.log(`Loaded ${images.length} images from ${src}`);

let dataJs = readFileSync('./js/data.js', 'utf8');
let applied = 0, skipped = 0;

for (const [id, image] of Object.entries(imageMap)) {
  if (!image) continue;
  const idIdx = dataJs.indexOf(`id: "${id}"`);
  if (idIdx === -1) { skipped++; continue; }
  const ahead = dataJs.slice(idIdx, idIdx + 400);
  if (/image:\s*"/.test(ahead)) { skipped++; continue; }
  const nameMatch = /name:\s*"[^"]*",/.exec(ahead);
  if (!nameMatch) { skipped++; continue; }
  const insertPos = idIdx + nameMatch.index + nameMatch[0].length;
  const escaped = image.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  dataJs = dataJs.slice(0, insertPos) + `\n    image: "${escaped}",` + dataJs.slice(insertPos);
  applied++;
}

writeFileSync('./js/data.js', dataJs);
console.log(`✓ Applied ${applied} | Skipped ${skipped}`);

try {
  eval(dataJs.replace(/^const /gm, 'var '));
  const count = (dataJs.match(/id:\s*"[^"]+"/g) || []).length;
  console.log(`✓ Syntax OK — ${count} entries`);
} catch(e) {
  console.error(`✗ SYNTAX ERROR: ${e.message}`);
  process.exit(1);
}
