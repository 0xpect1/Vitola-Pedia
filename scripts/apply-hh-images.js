/**
 * Applies Havana House images from /tmp/hh_images.json into js/data.js.
 * Only updates cigars that currently have no image field.
 */

import { readFileSync, writeFileSync } from 'fs';

const images = JSON.parse(readFileSync('/tmp/hh_images.json', 'utf8'));
const imageMap = Object.fromEntries(images.map(e => [e.id, e.image]));
console.log(`Loaded ${images.length} Havana House images`);

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
console.log(`✓ Applied ${applied} images | Skipped ${skipped}`);

try {
  eval(dataJs.replace(/^const /gm, 'var '));
  const count = (dataJs.match(/id:\s*"[^"]+"/g) || []).length;
  console.log(`✓ Syntax OK — ${count} entries`);
} catch(e) {
  console.error(`✗ SYNTAX ERROR: ${e.message}`);
  process.exit(1);
}
