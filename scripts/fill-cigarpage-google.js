/**
 * Uses Google search to find Cigar Page product URLs.
 * Searches `site:cigarpage.com {brand} {line}` for each cigar line.
 *
 * Since we can't use WebSearch from Node.js, this script outputs
 * the search queries that need to be run, and processes results.
 *
 * Instead, we'll try fetching Google search results directly.
 * Output: /tmp/cigarpage_google.json [{id, url}]
 */

import { readFileSync, writeFileSync } from 'fs';
import { setTimeout as sleep } from 'timers/promises';

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const SRC = readFileSync('./js/data.js', 'utf8');
eval(SRC.replace(/^const CIGARS/m, 'globalThis.CIGARS'));
const CIGARS = globalThis.CIGARS;
const NON_CUBAN = CIGARS.filter(c => c.origin !== 'Cuba');

function norm(s) {
  return String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[''`]/g, '').replace(/[^a-z0-9 ]/gi, ' ').toLowerCase().trim();
}
function words(s) { return new Set(norm(s).split(/\s+/).filter(w => w.length > 1)); }
function matchScore(target, candidate) {
  const tw = words(target), cw = words(candidate);
  if (!tw.size) return 0;
  return [...tw].filter(w => cw.has(w)).length / tw.size;
}

const cpMissing = NON_CUBAN.filter(c => !c.buyLinks || !c.buyLinks.some(l => l.retailer === 'Cigar Page'));

// Group by brand and dedupe cigar lines
// E.g., "Oliva Serie V Melanio Robusto" and "Oliva Serie V Melanio Toro" are same line
function getLine(cigar) {
  const n = norm(cigar.name);
  // Remove vitola size words
  return n.replace(/\b(robusto|toro|torpedo|churchill|corona|gordo|lancero|belicoso|lonsdale|figurado|petit|grande|no \d+|box pressed|gorda|perfecto|especial)\b/g, '').replace(/\s+/g, ' ').trim();
}

const lineMap = {};
for (const c of cpMissing) {
  const line = getLine(c);
  if (!lineMap[line]) lineMap[line] = { brand: c.brand, cigars: [] };
  lineMap[line].cigars.push(c);
}

console.log(`${cpMissing.length} cigars → ${Object.keys(lineMap).length} unique lines`);

// For each line, construct the Google query
const queries = Object.entries(lineMap).map(([line, data]) => ({
  line,
  brand: data.brand,
  cigars: data.cigars,
  query: `site:cigarpage.com ${line}`
}));

// Export queries for the agent to run via WebSearch
writeFileSync('/tmp/cp_google_queries.json', JSON.stringify(queries, null, 2));
console.log(`Exported ${queries.length} queries to /tmp/cp_google_queries.json`);
console.log('\nSample queries:');
queries.slice(0, 15).forEach(q => console.log(`  "${q.query}" (${q.cigars.length} cigars)`));
