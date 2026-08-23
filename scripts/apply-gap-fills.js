/**
 * Apply all gap-fill results to js/data.js and sync cigars.json.
 * Reads from:
 *   /tmp/fill_gaps_ci_np.json   — CI + Neptune results
 *   /tmp/fill_gaps_cuban.json   — Havana House + C.Gars results
 *   /tmp/smokeinn_matches.json  — Smoke Inn matches
 *   /tmp/gap_fs_jr.json         — FS + JR from agents (manually assembled)
 *   /tmp/gap_cp.json            — CP gap from agents (manually assembled)
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';

function norm(s) {
  return String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[''`]/g, '').replace(/[^a-z0-9 ]/gi, ' ').toLowerCase().trim();
}

// Load all result files
const allResults = []; // [{retailer, id, url}]

const files = [
  { path: '/tmp/fill_gaps_ci_np.json', format: 'array' },
  { path: '/tmp/fill_gaps_cuban.json', format: 'array' },
  { path: '/tmp/fill_gaps_fs_jr.json', format: 'array' },
  { path: '/tmp/gap_fs_jr.json', format: 'pipe' },    // agent output: ID|retailer|url per line
  { path: '/tmp/gap_cp.json', format: 'pipe' },        // agent output
];

for (const { path, format } of files) {
  if (!existsSync(path)) {
    console.log(`Skipping ${path} (not found)`);
    continue;
  }
  const raw = readFileSync(path, 'utf8');
  if (format === 'array') {
    try {
      const arr = JSON.parse(raw);
      for (const item of arr) {
        if (item.retailer && item.id && item.url) {
          allResults.push(item);
        } else if (item.retailer && item.id) {
          // smokeinn_matches format
          allResults.push({ retailer: item.retailer || 'Smoke Inn', id: item.id, url: item.url });
        }
      }
    } catch (e) { console.log(`Error parsing ${path}:`, e.message); }
  } else if (format === 'pipe') {
    const lines = raw.split('\n').filter(l => l.includes('|'));
    for (const line of lines) {
      const parts = line.trim().split('|');
      if (parts.length >= 3) {
        allResults.push({ id: parts[0].trim(), retailer: parts[1].trim(), url: parts[2].trim() });
      }
    }
  }
}

// Load Smoke Inn matches separately
if (existsSync('/tmp/smokeinn_matches.json')) {
  const si = JSON.parse(readFileSync('/tmp/smokeinn_matches.json', 'utf8'));
  for (const m of si) {
    allResults.push({ retailer: 'Smoke Inn', id: m.id, url: m.url });
  }
}

console.log(`Loaded ${allResults.length} total results`);

// Dedupe by id+retailer (keep first)
const seen = new Set();
const deduped = allResults.filter(r => {
  const key = `${r.id}||${r.retailer}`;
  if (seen.has(key)) return false;
  seen.add(key);
  return true;
});
console.log(`After dedup: ${deduped.length} results`);

// Group by id
const byId = {};
for (const r of deduped) {
  if (!r.id || !r.url || !r.retailer) continue;
  if (!byId[r.id]) byId[r.id] = [];
  byId[r.id].push({ retailer: r.retailer, url: r.url });
}
console.log(`Affecting ${Object.keys(byId).length} cigars`);

// Load and patch js/data.js
let src = readFileSync('./js/data.js', 'utf8');
eval(src.replace(/^const CIGARS/m, 'globalThis.CIGARS'));
const CIGARS = globalThis.CIGARS;

let updated = 0;
for (const cigar of CIGARS) {
  const newLinks = byId[cigar.id];
  if (!newLinks || newLinks.length === 0) continue;

  if (!cigar.buyLinks) cigar.buyLinks = [];

  let changed = false;
  for (const { retailer, url } of newLinks) {
    // Skip if already has this retailer
    if (cigar.buyLinks.some(l => l.retailer === retailer)) continue;
    // Skip bad/category URLs
    if (!url || url.includes('/search') || url.includes('?q=') || url.includes('/catalogsearch/')) continue;
    // Skip FS category URLs
    if (url.includes('famous-smoke.com/cigars/type/')) continue;
    cigar.buyLinks.push({ retailer, url, price: null });
    changed = true;
  }
  if (changed) updated++;
}
console.log(`Updated ${updated} cigars`);

// Serialize back to data.js
function serializeCigar(c) {
  const lines = [];
  lines.push('  {');
  const fields = ['id','name','brand','origin','region','wrapper','binder','filler','strength','smokingTime','price','rating','flavors','size','length','ringGauge','popularity','description','pairings','yearFounded','limited'];
  for (const f of fields) {
    if (!(f in c)) continue;
    const v = c[f];
    if (f === 'flavors' || f === 'pairings') {
      lines.push(`    ${f}: ${JSON.stringify(v)},`);
    } else if (typeof v === 'string') {
      lines.push(`    ${f}: ${JSON.stringify(v)},`);
    } else {
      lines.push(`    ${f}: ${v},`);
    }
  }
  if (c.image) lines.push(`    image: ${JSON.stringify(c.image)},`);
  if (c.buyLinks && c.buyLinks.length > 0) {
    lines.push(`    buyLinks: ${JSON.stringify(c.buyLinks)},`);
  }
  lines.push('  }');
  return lines.join('\n');
}

// Rebuild the file preserving structure
const cigarBlock = CIGARS.map(serializeCigar).join(',\n');
const newSrc = `const CIGARS = [\n${cigarBlock}\n];\n`;
writeFileSync('./js/data.js', newSrc);
console.log('Written js/data.js');

// Sync cigars.json
writeFileSync('./data/cigars.json', JSON.stringify(CIGARS, null, 2));
console.log('Written data/cigars.json');

// Coverage report
const nonCuban = CIGARS.filter(c => c.origin !== 'Cuba');
const cuban = CIGARS.filter(c => c.origin === 'Cuba');
const retailers = ['Famous Smoke Shop','JR Cigars','Cigars International','Cigar Page','Neptune Cigar','Smoke Inn'];
console.log('\n=== Coverage After Apply ===');
console.log(`Non-Cuban: ${nonCuban.length}`);
retailers.forEach(r => {
  const has = nonCuban.filter(c => c.buyLinks && c.buyLinks.some(l => l.retailer === r)).length;
  console.log(`  ${r}: ${has}/${nonCuban.length} (${(100*has/nonCuban.length).toFixed(0)}%) — missing: ${nonCuban.length-has}`);
});
console.log(`Cuban: ${cuban.length}`);
['Havana House','C.Gars Ltd'].forEach(r => {
  const has = cuban.filter(c => c.buyLinks && c.buyLinks.some(l => l.retailer === r)).length;
  console.log(`  ${r}: ${has}/${cuban.length} (${(100*has/cuban.length).toFixed(0)}%) — missing: ${cuban.length-has}`);
});
