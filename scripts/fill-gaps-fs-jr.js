/**
 * Fill remaining FS (55) and JR (23) gaps.
 * FS: HTTP search; JR: sitemap + HTTP search
 * Output: /tmp/fill_gaps_fs_jr.json
 */

import { readFileSync, writeFileSync } from 'fs';
import { setTimeout as sleep } from 'timers/promises';

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

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

async function httpGet(url) {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': UA, 'Accept': 'text/html' },
      signal: AbortSignal.timeout(15000)
    });
    if (!res.ok) return null;
    return await res.text();
  } catch { return null; }
}

const FS_MISSING = JSON.parse(readFileSync('/tmp/missing_fs.json', 'utf8'));
const JR_MISSING = JSON.parse(readFileSync('/tmp/missing_jr.json', 'utf8'));
const results = [];

// FS: search and extract product URLs
async function fillFS() {
  console.log(`=== Famous Smoke: ${FS_MISSING.length} missing ===`);
  const BATCH = 4;
  for (let i = 0; i < FS_MISSING.length; i += BATCH) {
    const batch = FS_MISSING.slice(i, i + BATCH);
    await Promise.all(batch.map(async cigar => {
      const q = encodeURIComponent(norm(cigar.name));
      const html = await httpGet(`https://www.famous-smoke.com/search?q=${q}`);
      if (!html) {
        process.stdout.write(`  ✗ FS [${cigar.name.slice(0,45)}]\n`);
        return;
      }
      // Extract product links matching /-cigars-/ pattern
      const matches = [...html.matchAll(/href="(https?:\/\/www\.famous-smoke\.com\/[^"]+cigars[^"]+)"[^>]*>/gi)];
      const links = [...new Set(matches.map(m => m[1]).filter(u =>
        !u.includes('/search') && !u.includes('?') && u.split('/').length >= 4
      ))];
      if (links.length) {
        const best = links.reduce((b, u) => {
          const slug = u.split('/').pop() || '';
          const s = matchScore(cigar.name, slug.replace(/-/g, ' '));
          return s > b.score ? { url: u, score: s } : b;
        }, { url: links[0], score: 0 });
        results.push({ retailer: 'Famous Smoke Shop', id: cigar.id, url: best.url });
        process.stdout.write(`  ✓ FS [${cigar.name.slice(0,45)}]\n`);
      } else {
        // Try alternative search
        const q2 = encodeURIComponent(norm(cigar.brand + ' ' + cigar.name));
        const html2 = await httpGet(`https://www.famous-smoke.com/search?q=${q2}`);
        if (html2) {
          const m2 = [...html2.matchAll(/href="(https?:\/\/www\.famous-smoke\.com\/[^"]+cigars[^"]+)"[^>]*>/gi)];
          const l2 = [...new Set(m2.map(m => m[1]).filter(u => !u.includes('/search') && !u.includes('?')))];
          if (l2.length) {
            results.push({ retailer: 'Famous Smoke Shop', id: cigar.id, url: l2[0] });
            process.stdout.write(`  ✓ FS [${cigar.name.slice(0,45)}] (alt)\n`);
            return;
          }
        }
        process.stdout.write(`  ✗ FS [${cigar.name.slice(0,45)}]\n`);
      }
    }));
    await sleep(400);
  }
  console.log(`FS done: ${results.filter(r=>r.retailer==='Famous Smoke Shop').length}/${FS_MISSING.length}`);
}

// JR: try sitemap lookup + search
async function fillJR() {
  console.log(`\n=== JR Cigars: ${JR_MISSING.length} missing ===`);

  // Load JR sitemap
  let jrUrls = [];
  console.log('  Loading JR sitemap...');
  const xml = await httpGet('https://www.jrcigars.com/sitemap_0-product.xml');
  if (xml) {
    jrUrls = [...xml.matchAll(/<loc>(https:\/\/www\.jrcigars\.com\/item\/[^<]+)<\/loc>/g)].map(m => m[1]);
    console.log(`  JR sitemap: ${jrUrls.length} URLs`);
  }

  for (const cigar of JR_MISSING) {
    // Try sitemap match first
    let found = false;
    if (jrUrls.length) {
      const best = jrUrls.reduce((b, u) => {
        const slug = u.split('/item/').pop() || '';
        const s = matchScore(cigar.name, slug.replace(/\//g, ' ').replace(/-/g, ' '));
        return s > b.score ? { url: u, score: s } : b;
      }, { url: '', score: 0 });
      if (best.score >= 0.4) {
        results.push({ retailer: 'JR Cigars', id: cigar.id, url: best.url });
        process.stdout.write(`  ✓ JR [${cigar.name.slice(0,45)}] sitemap\n`);
        found = true;
      }
    }
    if (!found) {
      // Try search
      const q = encodeURIComponent(norm(cigar.name));
      const html = await httpGet(`https://www.jrcigars.com/search?q=${q}`);
      if (html) {
        const links = [...html.matchAll(/href="(https?:\/\/www\.jrcigars\.com\/item\/[^"]+)"/gi)].map(m => m[1]);
        if (links.length) {
          results.push({ retailer: 'JR Cigars', id: cigar.id, url: links[0] });
          process.stdout.write(`  ✓ JR [${cigar.name.slice(0,45)}] search\n`);
        } else {
          process.stdout.write(`  ✗ JR [${cigar.name.slice(0,45)}]\n`);
        }
      } else {
        process.stdout.write(`  ✗ JR [${cigar.name.slice(0,45)}]\n`);
      }
      await sleep(300);
    }
  }
  console.log(`JR done: ${results.filter(r=>r.retailer==='JR Cigars').length}/${JR_MISSING.length}`);
}

async function main() {
  await fillFS();
  await fillJR();
  writeFileSync('/tmp/fill_gaps_fs_jr.json', JSON.stringify(results, null, 2));
  const fs = results.filter(r=>r.retailer==='Famous Smoke Shop').length;
  const jr = results.filter(r=>r.retailer==='JR Cigars').length;
  console.log(`\nDone! FS: ${fs}/${FS_MISSING.length}, JR: ${jr}/${JR_MISSING.length}`);
}

main().catch(e => { console.error(e); process.exit(1); });
