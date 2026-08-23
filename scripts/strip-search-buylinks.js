/**
 * Strips bad buyLinks entries from data.js:
 *   1. Removes all "Hunters & Frankau" entries (cigars.co.uk is a B2B distributor, not a retail site)
 *   2. Removes any entry whose URL is a search/query URL (not a direct product page)
 *      These are already covered by the app's auto-generated search fallbacks.
 *
 * Reports: how many links removed per retailer, and which cigars now have no buyLinks.
 *
 * Usage: node scripts/strip-search-buylinks.js [--dry-run]
 */

import { readFileSync, writeFileSync } from 'fs';

const DRY_RUN = process.argv.includes('--dry-run');
const SRC = readFileSync('./js/data.js', 'utf8');

// Parse the CIGARS array
const src = SRC.replace(/^const CIGARS/m, 'globalThis.CIGARS');
eval(src);
const CIGARS = globalThis.CIGARS;

function isSearchUrl(url) {
  return /[?&](q|query|search|s|term)=/i.test(url) ||
    /\/search(\?|\/|$)/i.test(url) ||
    /\/catalogsearch\//i.test(url);
}

const removedByRetailer = {};
let totalRemoved = 0;
let cigarsEmptied = 0;
const emptiedCigars = [];

for (const cigar of CIGARS) {
  if (!cigar.buyLinks || cigar.buyLinks.length === 0) continue;

  const before = cigar.buyLinks.length;
  cigar.buyLinks = cigar.buyLinks.filter(l => {
    const remove = l.retailer === 'Hunters & Frankau' || isSearchUrl(l.url || '');
    if (remove) {
      removedByRetailer[l.retailer] = (removedByRetailer[l.retailer] || 0) + 1;
      totalRemoved++;
    }
    return !remove;
  });

  if (cigar.buyLinks.length === 0) {
    delete cigar.buyLinks;
    cigarsEmptied++;
    emptiedCigars.push(cigar.id);
  }
}

console.log('\n=== Buy Link Cleanup Report ===');
console.log(`Total links removed: ${totalRemoved}`);
console.log('\nRemoved by retailer:');
Object.entries(removedByRetailer).sort((a,b) => b[1]-a[1]).forEach(([r,n]) => console.log(`  ${r}: ${n}`));
console.log(`\nCigars with buyLinks fully removed: ${cigarsEmptied}`);
if (emptiedCigars.length <= 30) {
  emptiedCigars.forEach(id => console.log('  ' + id));
} else {
  emptiedCigars.slice(0,30).forEach(id => console.log('  ' + id));
  console.log(`  ... and ${emptiedCigars.length - 30} more`);
}

if (DRY_RUN) {
  console.log('\n[DRY RUN] No files written.');
  process.exit(0);
}

// Re-serialize data.js
// We do a targeted replacement: for each cigar, update its buyLinks line in the source.
// Strategy: parse line-by-line, find buyLinks lines and replace.
let output = SRC;

// Replace each buyLinks entry in the source text
// Pattern: "    buyLinks: [...]" on one line OR "    buyLinks: undefined" (after we deleted the field)
// We iterate CIGARS and for each, build the correct new buyLinks text.

// Build a map: id -> new buyLinks (or null if removed)
const buyLinksMap = {};
for (const cigar of CIGARS) {
  buyLinksMap[cigar.id] = cigar.buyLinks || null;
}

// Replace buyLinks lines in the source
// Each line looks like: "    buyLinks: [{"retailer":...}]" or "    buyLinks: [{...},{...}]"
// We need to match and replace these. The id comes before the buyLinks in the file.
// Strategy: use a stateful regex replacement tracking current cigar id.

let currentId = null;
const lines = output.split('\n');
const newLines = [];

for (let i = 0; i < lines.length; i++) {
  const line = lines[i];

  // Track current cigar id
  const idMatch = line.match(/^\s+id:\s+"([^"]+)"/);
  if (idMatch) currentId = idMatch[1];

  // Check if this is a buyLinks line
  if (/^\s+buyLinks:/.test(line) && currentId) {
    const newBuyLinks = buyLinksMap[currentId];

    if (newBuyLinks === null) {
      // All buyLinks removed - skip this line entirely
      continue;
    } else {
      // Replace with updated buyLinks
      const indent = line.match(/^(\s+)/)[1];
      const serialized = JSON.stringify(newBuyLinks);
      newLines.push(`${indent}buyLinks: ${serialized}`);
      continue;
    }
  }

  newLines.push(line);
}

output = newLines.join('\n');

// Make sure it still starts with const CIGARS
if (!output.startsWith('const CIGARS')) {
  console.error('ERROR: output does not start with const CIGARS!');
  process.exit(1);
}

writeFileSync('./js/data.js', output);
console.log('\n✓ js/data.js updated.');
