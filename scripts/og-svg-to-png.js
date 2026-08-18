#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════
   VITOLA PEDIA — OG SVG → PNG converter (Puppeteer)
   ───────────────────────────────────────────────────────────────────
   Reads every SVG from og/ and rasterises it to a 1200×630 PNG using
   headless Chrome (Puppeteer, already in node_modules).

   Usage:
     node scripts/og-svg-to-png.js              # convert ALL svg files
     node scripts/og-svg-to-png.js --limit 10   # convert first 10 only
     node scripts/og-svg-to-png.js --only cigar-cohiba-behike-bhe-52
     node scripts/og-svg-to-png.js --houses     # only house-* files
     node scripts/og-svg-to-png.js --cigars     # only cigar-* files

   Strategy: build one big HTML page that inlines ALL SVGs as <img>
   data-URI sources, wait for Google Fonts (Playfair Display + Inter)
   to load, then screenshot each <img> element to its own PNG.
   ═══════════════════════════════════════════════════════════════════ */

import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { resolve, dirname, basename, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT      = resolve(__dirname, '..');
const OG_DIR    = resolve(ROOT, 'og');

// ── parse args ─────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const arg = (name) => argv.includes(name);
const argVal = (name) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : null; };

const LIMIT   = argVal('--limit') ? parseInt(argVal('--limit'), 10) : 0;
const ONLY    = argVal('--only');
const HOUSES  = arg('--houses');
const CIGARS  = arg('--cigars');

// ── collect svg files ──────────────────────────────────────────────
let files = readdirSync(OG_DIR)
  .filter(f => f.endsWith('.svg'))
  .map(f => basename(f, '.svg'))
  .sort();

if (HOUSES && !CIGARS) files = files.filter(f => f.startsWith('house-'));
if (CIGARS && !HOUSES) files = files.filter(f => f.startsWith('cigar-'));
if (ONLY) files = files.filter(f => f === ONLY || f === ONLY.replace(/^cigar-/, '').replace(/^house-/, ''));

if (LIMIT > 0) files = files.slice(0, LIMIT);

console.log(`→ ${files.length} SVG files to convert`);

// ── build the all-in-one HTML page ─────────────────────────────────
// Each SVG is inlined in its own 1200x630 container, stacked vertically.
// Google Fonts are loaded via <link> so Playfair Display + Inter render.
function buildPage(files) {
  const items = files.map(name => {
    const svgPath = resolve(OG_DIR, name + '.svg');
    const svg = readFileSync(svgPath, 'utf8');
    return { name, svg };
  });

  const body = items.map(({ name, svg }) =>
    `<div class="card" data-name="${name}">${svg}</div>`
  ).join('\n');

  return `<!doctype html>
<html><head>
<meta charset="utf-8">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@600;700&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { background:#000; }
  .card { width:1200px; height:630px; overflow:hidden; }
  .card svg { display:block; width:1200px; height:630px; }
</style>
</head><body>
${body}
</body></html>`;
}

// ── run puppeteer ──────────────────────────────────────────────────
async function main() {
  const puppeteer = (await import('puppeteer')).default;

  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--font-render-hinting=none'],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1200, height: 630, deviceScaleFactor: 1 });

  const html = buildPage(files);
  await page.setContent(html, { waitUntil: 'networkidle0' });

  // Wait for fonts to be ready so Playfair Display + Inter actually render.
  await page.evaluate(async () => {
    if (document.fonts && document.fonts.ready) {
      await document.fonts.ready;
    }
  });
  // Extra settle time for font layout.
  await new Promise(r => setTimeout(r, 800));

  let ok = 0, fail = 0;
  for (const name of files) {
    try {
      const selName = name.replace(/"/g, '\\"');
      const el = await page.$(`.card[data-name="${selName}"]`);
      if (!el) { fail++; continue; }
      const outPath = resolve(OG_DIR, name + '.png');
      await el.screenshot({ path: outPath, type: 'png' });
      ok++;
      if (ok % 50 === 0) console.log(`  …${ok}/${files.length}`);
    } catch (e) {
      fail++;
      console.error(`  ✗ ${name}: ${e.message}`);
    }
  }

  await browser.close();
  console.log(`✓ ${ok} PNGs written, ${fail} failures`);
  if (fail) process.exitCode = 1;
}

main().catch(e => { console.error(e); process.exit(1); });
