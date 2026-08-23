/**
 * Fill remaining Cigar Page gaps (91 missing) using Google site: search.
 * Outputs: /tmp/fill_gaps_cp_queries.json (for agents to run via WebSearch)
 */

import { readFileSync, writeFileSync } from 'fs';

const MISSING = JSON.parse(readFileSync('/tmp/missing_cp.json', 'utf8'));

function norm(s) {
  return String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[''`]/g, '').replace(/[^a-z0-9 ]/gi, ' ').toLowerCase().trim();
}

function getLine(name) {
  return norm(name)
    .replace(/\b(robusto|toro|torpedo|churchill|corona|gordo|lancero|belicoso|lonsdale|figurado|petit|grande|no \d+|box pressed|gorda|perfecto|especial|rothschild|magnum|double|gran|extra|short|xxl|sixty|sixty-four|sixty-six)\b/g, '')
    .replace(/\s+/g, ' ').trim();
}

const queries = MISSING.map(c => ({
  id: c.id,
  name: c.name,
  brand: c.brand,
  query: `site:cigarpage.com ${getLine(c.name)}`
}));

writeFileSync('/tmp/fill_gaps_cp_queries.json', JSON.stringify(queries, null, 2));
console.log(`Exported ${queries.length} CP queries to /tmp/fill_gaps_cp_queries.json`);
console.log('\nSample:');
queries.slice(0, 10).forEach(q => console.log(`  ${q.query}`));
