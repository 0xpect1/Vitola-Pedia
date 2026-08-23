/**
 * Applies found direct URLs to data.js:
 * 1. Replaces search URLs with direct product URLs from /tmp/direct_url_results.json
 * 2. Removes all Hunters & Frankau entries
 *
 * Usage: node scripts/apply-direct-urls.js
 */

import { readFileSync, writeFileSync } from 'fs';

const RESULTS = JSON.parse(readFileSync('/tmp/direct_url_results.json', 'utf8'));
const SRC = readFileSync('./js/data.js', 'utf8');

// Build lookup: {cigarId: {retailer: directUrl}}
const lookup = {};
for (const r of RESULTS) {
  if (!lookup[r.id]) lookup[r.id] = {};
  lookup[r.id][r.retailer] = r.directUrl;
}

// Parse CIGARS
const src = SRC.replace(/^const CIGARS/m, 'globalThis.CIGARS');
eval(src);
const CIGARS = globalThis.CIGARS;

function isSearchUrl(url) {
  return /[?&](q|query|search|s|term)=/i.test(url) ||
    /\/search(\?|\/|$)/i.test(url) ||
    /\/catalogsearch\//i.test(url);
}

let replaced = 0, removed = 0, hfRemoved = 0;

for (const cigar of CIGARS) {
  if (!cigar.buyLinks) continue;

  cigar.buyLinks = cigar.buyLinks.filter(l => {
    // Remove H&F
    if (l.retailer === 'Hunters & Frankau') { hfRemoved++; return false; }
    return true;
  }).map(l => {
    // If this is a search URL and we have a direct URL, replace it
    if (isSearchUrl(l.url || '') && lookup[cigar.id] && lookup[cigar.id][l.retailer]) {
      replaced++;
      return { ...l, url: lookup[cigar.id][l.retailer] };
    }
    return l;
  });

  // Remove empty buyLinks
  if (cigar.buyLinks.length === 0) delete cigar.buyLinks;
}

console.log(`Replaced: ${replaced} search URLs → direct URLs`);
console.log(`Removed: ${hfRemoved} Hunters & Frankau entries`);

// Write back to data.js line-by-line
let output = SRC;
let currentId = null;
const lines = output.split('\n');
const newLines = [];

for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  const idMatch = line.match(/^\s+id:\s+"([^"]+)"/);
  if (idMatch) currentId = idMatch[1];

  if (/^\s+buyLinks:/.test(line) && currentId) {
    const cigar = CIGARS.find(c => c.id === currentId);
    if (!cigar || !cigar.buyLinks) {
      // buyLinks were removed entirely
      continue;
    }
    const indent = line.match(/^(\s+)/)[1];
    newLines.push(`${indent}buyLinks: ${JSON.stringify(cigar.buyLinks)}`);
    continue;
  }
  newLines.push(line);
}

output = newLines.join('\n');
writeFileSync('./js/data.js', output);
console.log('✓ js/data.js updated');

// Count remaining search URLs
let remaining = 0;
for (const cigar of CIGARS) {
  if (!cigar.buyLinks) continue;
  for (const l of cigar.buyLinks) {
    if (isSearchUrl(l.url || '')) remaining++;
  }
}
console.log(`Remaining search URLs: ${remaining}`);
