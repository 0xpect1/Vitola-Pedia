/**
 * Applies images from /tmp/all_new_images.json into js/data.js.
 * Only updates cigars that currently have no image field.
 */

import { readFileSync, writeFileSync } from 'fs';

const newImages = JSON.parse(readFileSync('/tmp/all_new_images.json', 'utf8'));
const imageMap = Object.fromEntries(newImages.map(e => [e.id, e.image]));
console.log(`Loaded ${newImages.length} new images`);

let dataJs = readFileSync('./js/data.js', 'utf8');
let applied = 0, skipped = 0;

for (const [id, image] of Object.entries(imageMap)) {
  if (!image) continue;

  // Only inject if this cigar doesn't already have an image field
  // Match the cigar block: id: "the-id", ... and check if image: already present within ~300 chars after id
  const idPattern = new RegExp(`(id:\\s*"${id.replace(/[-]/g, '[-]')}",[\\s\\S]{0,300}?)(\n\\s+brand:)`, 'm');
  const match = idPattern.exec(dataJs);
  if (!match) { skipped++; continue; }

  // Check if image already exists between id and brand
  const segment = match[1];
  if (/image:\s*"/.test(segment)) { skipped++; continue; }

  // Insert image: "..." after the name: line
  const escaped = image.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  dataJs = dataJs.replace(
    new RegExp(`(id:\\s*"${id.replace(/[-]/g, '[-]')}",[\\s\\S]*?name:\\s*"[^"]*",)`, 'm'),
    `$1\n    image: "${escaped}",`
  );
  applied++;
}

writeFileSync('./js/data.js', dataJs);
console.log(`✓ Applied ${applied} images, ${skipped} skipped (already had image or no match)`);

// Verify
try {
  const verify = dataJs.replace(/^const /gm, 'var ');
  eval(verify);
  const match = dataJs.match(/id:\s*"[^"]+"/g);
  console.log(`✓ Syntax OK — ${match ? match.length : 'unknown'} entries`);
} catch(e) {
  console.error(`✗ SYNTAX ERROR: ${e.message}`);
  process.exit(1);
}
