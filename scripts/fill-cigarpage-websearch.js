/**
 * Finds Cigar Page URLs for missing cigars using Google site: search.
 * Groups by brand/line for efficiency, then fuzzy-matches individual cigars.
 *
 * Strategy: For each unique cigar line (e.g., "Oliva Serie V", "Padron 1964"),
 * search Google for `site:cigarpage.com {line name}` and collect all CP URLs.
 * Then match each cigar to the most specific URL.
 *
 * Output: /tmp/cigarpage_urls.json [{id, url}]
 */

import { readFileSync, writeFileSync } from 'fs';
import { setTimeout as sleep } from 'timers/promises';

const MISSING = JSON.parse(readFileSync('/tmp/cp_missing_full.json', 'utf8'));
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

// Try to fetch a URL and check if it returns 200
async function urlExists(url) {
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

// Generate plausible CP URL slugs from a cigar name
function generateSlugs(cigar) {
  const n = norm(cigar.name);
  const b = norm(cigar.brand);
  const slugs = [];

  // Try full name
  slugs.push(n.replace(/\s+/g, '-'));

  // Try brand + line (e.g., "oliva-serie-v-melanio")
  slugs.push(n.replace(/\s+/g, '-').replace(/robusto|toro|torpedo|churchill|corona|gordo|lancero|belicoso|lonsdale|figurado|petit|grande|no-\d+|box-pressed/g, '').replace(/-+/g, '-').replace(/-$/, ''));

  // Try without brand
  const withoutBrand = n.replace(new RegExp('^' + b.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*', 'i'), '');
  if (withoutBrand !== n) {
    slugs.push(b.replace(/\s+/g, '-') + '-' + withoutBrand.replace(/\s+/g, '-'));
  }

  // Try brand_name with underscores
  slugs.push(b.replace(/\s+/g, '_'));

  // Try various common patterns
  const line = n.replace(/robusto|toro|torpedo|churchill|corona|gordo|lancero|belicoso|lonsdale|figurado|petit|grande$/g, '').trim();
  slugs.push(line.replace(/\s+/g, '-'));

  // Dedupe
  return [...new Set(slugs.filter(s => s.length > 3))];
}

async function main() {
  const results = [];
  const cpUrlCache = new Map(); // url -> true/false
  const verifiedUrls = new Map(); // cigar line → [verified URLs]

  // Group cigars by brand
  const byBrand = {};
  for (const c of MISSING) {
    if (!byBrand[c.brand]) byBrand[c.brand] = [];
    byBrand[c.brand].push(c);
  }

  const brands = Object.entries(byBrand).sort((a, b) => b[1].length - a[1].length);
  console.log(`Processing ${MISSING.length} cigars across ${brands.length} brands\n`);

  // For each brand, generate candidate URLs and verify them
  for (const [brand, cigars] of brands) {
    const brandSlug = norm(brand).replace(/\s+/g, '-');
    const brandSlugUnderscore = norm(brand).replace(/\s+/g, '_');

    // Collect all candidate URLs for this brand
    const candidateUrls = new Set();

    // Add brand-level page
    candidateUrls.add(`https://www.cigarpage.com/${brandSlugUnderscore}.html`);
    candidateUrls.add(`https://www.cigarpage.com/${brandSlug}.html`);

    // Generate specific URLs for each cigar
    for (const cigar of cigars) {
      const slugs = generateSlugs(cigar);
      for (const slug of slugs) {
        candidateUrls.add(`https://www.cigarpage.com/${slug}.html`);
        // Also try ks- prefix (seen in ashton-vsg-ks-ahv.html)
        candidateUrls.add(`https://www.cigarpage.com/${slug}-ks-${slug.split('-').map(w => w[0]).join('')}.html`);
      }
    }

    // Verify URLs in batches (HEAD requests)
    const urlsToCheck = [...candidateUrls].filter(u => !cpUrlCache.has(u));
    const verified = [];

    const BATCH = 10;
    for (let i = 0; i < urlsToCheck.length; i += BATCH) {
      const batch = urlsToCheck.slice(i, i + BATCH);
      const checks = await Promise.all(batch.map(async url => {
        const exists = await urlExists(url);
        cpUrlCache.set(url, exists);
        return { url, exists };
      }));
      for (const { url, exists } of checks) {
        if (exists) verified.push(url);
      }
      await sleep(200);
    }

    // Also check cached URLs
    for (const url of candidateUrls) {
      if (cpUrlCache.get(url) && !verified.includes(url)) verified.push(url);
    }

    if (verified.length === 0) {
      // Try the brand page as fallback
      const brandUrl = `https://www.cigarpage.com/${brandSlugUnderscore}.html`;
      if (cpUrlCache.get(brandUrl)) {
        verified.push(brandUrl);
      }
    }

    if (verified.length > 0) {
      process.stdout.write(`✓ ${brand} (${verified.length} URLs): `);

      // Match each cigar to the best verified URL
      for (const cigar of cigars) {
        let bestUrl = null;
        let bestScore = 0;

        for (const url of verified) {
          const slug = url.split('/').pop().replace('.html', '').replace(/-/g, ' ').replace(/_/g, ' ');
          const score = matchScore(cigar.name, slug);
          if (score > bestScore) {
            bestScore = score;
            bestUrl = url;
          }
        }

        if (bestUrl) {
          results.push({ id: cigar.id, url: bestUrl });
        }
      }
      process.stdout.write(`${cigars.length} cigars matched\n`);
    } else {
      process.stdout.write(`✗ ${brand}: no URLs verified\n`);
    }

    // Periodic save
    if (results.length % 100 === 0 && results.length > 0) {
      writeFileSync('/tmp/cigarpage_urls.json', JSON.stringify(results, null, 2));
    }
  }

  writeFileSync('/tmp/cigarpage_urls.json', JSON.stringify(results, null, 2));
  console.log(`\n✓ Done! Found ${results.length}/${MISSING.length} Cigar Page URLs`);
}

main().catch(e => { console.error(e); process.exit(1); });
