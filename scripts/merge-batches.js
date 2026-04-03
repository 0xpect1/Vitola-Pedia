/**
 * Merges all /tmp/new_cigars_batch_*.json files into one deduplicated list.
 * Also checks for ID conflicts with existing data.js entries.
 * Output: /tmp/all_new_cigars.json
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';

// Load existing IDs from data.js
const dataJs = readFileSync('./js/data.js', 'utf8');
const existingIds = new Set(
  [...dataJs.matchAll(/id:\s*"([^"]+)"/g)].map(m => m[1])
);
console.log(`Existing IDs in data.js: ${existingIds.size}`);

// Load all batch files
const allCigars = [];
const seenIds = new Set();
const conflicts = [];
const duplicates = [];

for (let i = 1; i <= 10; i++) {
  const path = `./data/batches/batch_${i}.json`;
  if (!existsSync(path)) {
    console.log(`⚠ Batch ${i} not found: ${path}`);
    continue;
  }
  let batch;
  try {
    batch = JSON.parse(readFileSync(path, 'utf8'));
  } catch (e) {
    console.log(`✗ Batch ${i} JSON parse error: ${e.message}`);
    continue;
  }
  if (!Array.isArray(batch)) {
    console.log(`✗ Batch ${i} is not an array`);
    continue;
  }
  let added = 0, skipped = 0;
  for (const cigar of batch) {
    if (!cigar.id) { skipped++; continue; }
    if (existingIds.has(cigar.id)) {
      conflicts.push({ id: cigar.id, batch: i });
      skipped++;
      continue;
    }
    if (seenIds.has(cigar.id)) {
      duplicates.push({ id: cigar.id, batch: i });
      skipped++;
      continue;
    }
    seenIds.add(cigar.id);
    allCigars.push(cigar);
    added++;
  }
  console.log(`Batch ${i}: ${batch.length} entries → ${added} added, ${skipped} skipped`);
}

console.log(`\nTotal new cigars: ${allCigars.length}`);
if (conflicts.length) {
  console.log(`Conflicts with existing data (skipped): ${conflicts.length}`);
  conflicts.forEach(c => console.log(`  ✗ ${c.id} (batch ${c.batch})`));
}
if (duplicates.length) {
  console.log(`Duplicates across batches (skipped): ${duplicates.length}`);
  duplicates.forEach(d => console.log(`  ✗ ${d.id} (batch ${d.batch})`));
}

// Validate required fields
const required = ['id','name','brand','origin','region','wrapper','binder','filler',
  'strength','smokingTime','price','rating','flavors','size','length','ringGauge',
  'popularity','description','pairings','yearFounded','limited'];

let invalid = 0;
for (const c of allCigars) {
  const missing = required.filter(f => c[f] === undefined || c[f] === null || c[f] === '');
  if (missing.length) {
    console.log(`  ⚠ ${c.id} missing: ${missing.join(', ')}`);
    invalid++;
  }
}
if (invalid) console.log(`\n⚠ ${invalid} cigars have missing fields`);

writeFileSync('/tmp/all_new_cigars.json', JSON.stringify(allCigars, null, 2));
console.log(`\n✓ Written to /tmp/all_new_cigars.json`);

// Also write a scrape-ready version (id + name + brand + origin)
const scrapeReady = allCigars.map(c => ({
  id: c.id,
  name: c.name,
  brand: c.brand,
  origin: c.origin
}));
writeFileSync('/tmp/cigars_for_scrape.json', JSON.stringify(scrapeReady, null, 2));
console.log(`✓ Scrape list written to /tmp/cigars_for_scrape.json (${scrapeReady.length} entries)`);
