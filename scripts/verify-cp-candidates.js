/**
 * Verify candidate Cigar Page URLs with HEAD requests.
 * Output: /tmp/cp_gap_verified.json
 */

import { readFileSync, writeFileSync } from 'fs';
import { setTimeout as sleep } from 'timers/promises';

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const candidates = JSON.parse(readFileSync('/tmp/cp_gap_candidates.json', 'utf8'));

async function checkUrl(url) {
  try {
    const res = await fetch(url, {
      method: 'HEAD',
      headers: { 'User-Agent': UA },
      signal: AbortSignal.timeout(8000),
      redirect: 'follow'
    });
    return res.ok;
  } catch { return false; }
}

const results = [];
const BATCH = 8;

for (let i = 0; i < candidates.length; i++) {
  const c = candidates[i];
  const uniqueSlugs = [...new Set(c.slugs.filter(s => s.length > 3))];
  let found = false;

  for (let j = 0; j < uniqueSlugs.length; j += BATCH) {
    const batch = uniqueSlugs.slice(j, j + BATCH);
    const checks = await Promise.all(batch.map(async slug => {
      const url = `https://www.cigarpage.com/${slug}.html`;
      const ok = await checkUrl(url);
      return { url, ok };
    }));
    for (const { url, ok } of checks) {
      if (ok) {
        results.push({ retailer: 'Cigar Page', id: c.id, url });
        process.stdout.write(`  ✓ CP [${c.name.slice(0, 45)}] → ${url.split('/').pop()}\n`);
        found = true;
        break;
      }
    }
    if (found) break;
    await sleep(150);
  }
  if (!found) {
    process.stdout.write(`  ✗ CP [${c.name.slice(0, 45)}]\n`);
  }
}

writeFileSync('/tmp/cp_gap_verified.json', JSON.stringify(results, null, 2));
console.log(`\nVerified ${results.length}/${candidates.length} CP URLs`);
