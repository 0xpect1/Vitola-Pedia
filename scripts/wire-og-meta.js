#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════
   VITOLA PEDIA — Wire per-cigar / per-house OG SVG images into pages
   ───────────────────────────────────────────────────────────────────
   Updates the og:image / twitter:image meta tags (and adds
   og:image:width / og:image:height) in:

     index.html              → og/home.svg
     cigars/<id>.html (1,458) → og/cigar-<id>.svg
     houses/<slug>.html (134) → og/house-<slug>.svg

   Each SVG is 1200×630, so the width/height meta tags are constant.

   Idempotent: re-running replaces any existing og:image with the
   per-cigar SVG, so it's safe to run after data/design updates.
   ═══════════════════════════════════════════════════════════════════ */

import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { resolve, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const BASE = 'https://vitolapedia.com/og/';
const W = '1200', H = '630';

/** Replace the first <meta property=og:image …> line's content attr,
 *  and add og:image:width/height if missing. Also handle twitter:image. */
function patchHTML(html, imageUrl) {
  const widthMeta  = `<meta property="og:image:width"  content="${W}" />`;
  const heightMeta = `<meta property="og:image:height" content="${H}" />`;

  // --- og:image ---
  const ogImgRe = /<meta\s+property="og:image"\s+content="[^"]*"\s*\/?>/g;
  let updated;
  if (ogImgRe.test(html)) {
    updated = html.replace(ogImgRe, `<meta property="og:image" content="${imageUrl}" />`);
  } else {
    // Insert after og:description (or og:title) if no og:image exists.
    const anchor = /<meta\s+property="og:(?:description|title)"\s+content="[^"]*"\s*\/?>/;
    const insert = `<meta property="og:image" content="${imageUrl}" />`;
    updated = anchor.test(html)
      ? html.replace(anchor, m => m + '\n' + insert)
      : html.replace(/<meta\s+property="og:site_name"[^>]*>/, m => m + '\n' + insert);
  }

  // Add width/height if missing (insert right after og:image line).
  if (!/og:image:width/.test(updated)) {
    updated = updated.replace(
      /(<meta\s+property="og:image"\s+content="[^"]*"\s*\/?>)/,
      `$1\n${widthMeta}\n${heightMeta}`
    );
  } else {
    // Replace any stale width/height values.
    updated = updated
      .replace(/<meta\s+property="og:image:width"\s+content="[^"]*"\s*\/?>/g, widthMeta)
      .replace(/<meta\s+property="og:image:height"\s+content="[^"]*"\s*\/?>/g, heightMeta);
  }

  // --- twitter:image (summary_large_image cards benefit too) ---
  const twRe = /<meta\s+name="twitter:image"\s+content="[^"]*"\s*\/?>/g;
  if (twRe.test(updated)) {
    updated = updated.replace(twRe, `<meta name="twitter:image" content="${imageUrl}" />`);
  } else {
    // Insert after twitter:description if present, else after og:image:height.
    const anchor = /<meta\s+name="twitter:(?:description|title)"\s+content="[^"]*"\s*\/?>/;
    const insert = `<meta name="twitter:image" content="${imageUrl}" />`;
    if (anchor.test(updated)) {
      updated = updated.replace(anchor, m => m + '\n' + insert);
    }
  }

  return updated;
}

function updateDir(dir, kind) {
  if (!existsSync(dir)) { console.log(`  (skip: ${dir} missing)`); return 0; }
  const files = readdirSync(dir).filter(f => f.endsWith('.html'));
  let n = 0;
  for (const f of files) {
    const stem = basename(f, '.html');
    const url = BASE + kind + '-' + stem + '.svg';
    const path = resolve(dir, f);
    const html = readFileSync(path, 'utf8');
    const next = patchHTML(html, url);
    if (next !== html) { writeFileSync(path, next); n++; }
  }
  return n;
}

// ── homepage ────────────────────────────────────────────────────────
const idxPath = resolve(ROOT, 'index.html');
const idx = readFileSync(idxPath, 'utf8');
const idxNext = patchHTML(idx, BASE + 'home.svg');
if (idxNext !== idx) {
  writeFileSync(idxPath, idxNext);
  console.log(`✓ index.html → og/home.svg`);
} else {
  console.log(`• index.html already correct`);
}

// ── cigars + houses ─────────────────────────────────────────────────
const cigarN = updateDir(resolve(ROOT, 'cigars'), 'cigar');
console.log(`✓ ${cigarN} cigar pages updated`);
const houseN = updateDir(resolve(ROOT, 'houses'), 'house');
console.log(`✓ ${houseN} house pages updated`);
console.log(`\nDone.`);
