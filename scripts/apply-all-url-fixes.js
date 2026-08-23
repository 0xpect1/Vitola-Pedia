/**
 * Combined apply script: replaces search URLs and removes H&F entries.
 * Handles trailing commas correctly.
 *
 * Reads: /tmp/direct_url_results.json (round 1)
 *        /tmp/direct_url_results_r2.json (round 2)
 */

import { readFileSync, writeFileSync } from 'fs';

const R1 = JSON.parse(readFileSync('/tmp/direct_url_results.json', 'utf8'));
const R2 = JSON.parse(readFileSync('/tmp/direct_url_results_r2.json', 'utf8'));
const ALL = [...R1, ...R2];

// Build lookup: {cigarId: {retailer: directUrl}}
const lookup = {};
for (const r of ALL) {
  if (!lookup[r.id]) lookup[r.id] = {};
  lookup[r.id][r.retailer] = r.directUrl;
}

function isSearchUrl(url) {
  return /[?&](q|query|search|s|term)=/i.test(url) ||
    /\/search(\?|\/|$)/i.test(url) ||
    /\/catalogsearch\//i.test(url);
}

// Read and fix line by line
const SRC = readFileSync('./js/data.js', 'utf8');
const lines = SRC.split('\n');
const newLines = [];
let currentId = null;

for (let i = 0; i < lines.length; i++) {
  const line = lines[i];

  // Track current cigar id
  const idMatch = line.match(/^\s+id:\s+"([^"]+)"/);
  if (idMatch) currentId = idMatch[1];

  // Check if this is a buyLinks line
  if (/^\s+buyLinks:\s*\[/.test(line) && currentId) {
    const indent = line.match(/^(\s+)/)[1];

    // Parse the existing buyLinks array from the line
    const arrayMatch = line.match(/buyLinks:\s*(\[.*\])/);
    if (!arrayMatch) { newLines.push(line); continue; }

    let buyLinks;
    try { buyLinks = JSON.parse(arrayMatch[1]); }
    catch { newLines.push(line); continue; }

    // Apply fixes:
    // 1. Remove H&F entries
    buyLinks = buyLinks.filter(l => l.retailer !== 'Hunters & Frankau');

    // 2. Replace search URLs with direct URLs
    buyLinks = buyLinks.map(l => {
      if (isSearchUrl(l.url || '') && lookup[currentId] && lookup[currentId][l.retailer]) {
        return { ...l, url: lookup[currentId][l.retailer] };
      }
      return l;
    });

    if (buyLinks.length === 0) {
      // Skip this line entirely (no buyLinks left)
      // But check if next non-empty line is not `}` — then we need to check comma on previous line
      continue;
    }

    // Check if there's content after this line (need trailing comma)
    const nextLine = lines[i + 1] || '';
    const nextNonEmpty = nextLine.trim();
    const needsComma = nextNonEmpty && !nextNonEmpty.startsWith('}') && !nextNonEmpty.startsWith(']');

    const serialized = JSON.stringify(buyLinks);
    const comma = needsComma ? ',' : '';
    newLines.push(`${indent}buyLinks: ${serialized}${comma}`);
    continue;
  }

  newLines.push(line);
}

const output = newLines.join('\n');
writeFileSync('./js/data.js', output);

// Verify
try {
  eval(output.replace(/^const CIGARS/m, 'globalThis.CIGARS'));
  console.log('✓ Syntax OK. Cigars:', globalThis.CIGARS.length);
  const CIGARS = globalThis.CIGARS;

  // Count remaining search URLs
  let remaining = 0;
  const byRetailer = {};
  let replaced = 0, hfRemoved = 0;
  for (const cigar of CIGARS) {
    if (!cigar.buyLinks) continue;
    for (const l of cigar.buyLinks) {
      if (isSearchUrl(l.url || '')) {
        remaining++;
        byRetailer[l.retailer] = (byRetailer[l.retailer] || 0) + 1;
      }
    }
  }
  console.log(`Remaining search URLs: ${remaining}`);
  for (const [r, n] of Object.entries(byRetailer).sort((a, b) => b[1] - a[1])) console.log(`  ${r}: ${n}`);
} catch (e) {
  console.error('✗ Syntax error:', e.message);
  process.exit(1);
}
