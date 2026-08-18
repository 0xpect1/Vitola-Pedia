# Open Graph Share Cards

Every cigar and brand "house" in the encyclopedia has its own unique
1,200 × 630 share-card image so links look deliberate and professional
when shared on X, Facebook, Slack, Discord, iMessage, etc.

## Files

| Path | Count | Size (approx) | Purpose |
|---|---|---|---|
| `og/cigar-<id>.svg`  | 1,458 | ~3-6 KB each | Source card for each cigar |
| `og/house-<slug>.svg` | 134   | ~3-5 KB each | Source card for each brand house |
| `og/cigar-<id>.png`  | 1,458 | ~80-170 KB each | Rasterised PNG (what social scrapers fetch) |
| `og/house-<slug>.png` | 134   | ~70-140 KB each | Rasterised PNG |
| `og/manifest.json`    | 1     | ~80 KB        | Index of every generated card |

Total `og/` directory: ~13 MB SVG + ~140 MB PNG ≈ 150 MB.

## Card design

- **1200 × 630 px** — standard Open Graph image size
- Dark luxury theme: `#1a1209` tobacco-brown background with an ember
  radial glow (`#ff6b35`) and faint smoke wisps
- **Playfair Display** serif for the cigar/house name
- **Inter** sans-serif for stats and labels
- Cigar cards show: brand eyebrow, name, strength dots, rating stars,
  price, origin, vitola/size, smoke time, and 4 flavour pills
- House cards show: "THE HOUSE OF" eyebrow, brand name, cigar count,
  avg/top rating, price range, strength range, origin, founding year
- "Vitola Pedia" wordmark in the bottom-right of every card

## Generating the cards

### 1. Generate SVGs (fast, ~1 second)

```bash
node scripts/generate-og-images.js
```

Reads `data/cigars.json`, writes one SVG per cigar and one per brand
house into `og/`.  No npm dependencies — pure Node `fs` + string
templating.  Re-running overwrites; safe to run after data updates.

### 2. Rasterise to PNG (Puppeteer, slow)

```bash
# All 1,592 cards (takes ~10-15 minutes — headless Chrome screenshots)
node scripts/og-svg-to-png.js

# Just the first 10 cigars (smoke test)
node scripts/og-svg-to-png.js --limit 10 --cigars

# A single card
node scripts/og-svg-to-png.js --only cigar-cohiba-behike-bhe-52

# Only house cards
node scripts/og-svg-to-png.js --houses
```

Uses Puppeteer (already in `node_modules`, gitignored).  Loads Google
Fonts (Playfair Display + Inter) in a single headless page, then
screenshots each SVG card to PNG at 1,200 × 630.

**Re-run PNG conversion** whenever:
- Cigar data changes (new cigars, renamed brands, updated ratings/prices)
- You change the card design in `generate-og-images.js`

## How the app uses them

`js/enrich.js` exposes two helpers:

```js
shareUrl(kind, id)           // → "https://vitolapedia.com/#/cigar/<id>"
ogImageFor(kind, id)         // → "https://vitolapedia.com/og/cigar-<id>.png"
```

When a user taps **Share** on a cigar or house modal:

1. If the browser supports `navigator.share` with files (most mobile
   browsers), the matching PNG is fetched and attached to the share
   sheet, so the preview image travels with the link.
2. Otherwise the URL is copied to the clipboard (the OG image is still
   picked up by any social scraper that re-fetches the page).

## Serving per-cigar OG meta tags

The site is a hash-routed SPA, so social scrapers that only read
`index.html` see the **default** OG tags (the homepage card).  To make
per-cigar previews work on Facebook/X/Slack, either:

- **Static pre-rendered pages** — generate `cigar/<id>.html` per cigar
  with `<meta property="og:image" content="…/og/cigar-<id>.png">` and a
  `<meta http-equiv="refresh">` redirect to the SPA.  (Task for the
  SEO/static-page generator.)
- **Edge function** — a tiny serverless function at the edge rewrites
  the OG meta tags based on the path before serving `index.html`.

Either way, the `ogImageFor(kind, id)` helper is the canonical URL
pattern: `https://vitolapedia.com/og/<kind>-<id>.png`.

## File-size budget (GitHub Pages)

- SVGs alone: 1,592 × ~4 KB ≈ **6.4 MB** — well under any limit.
- SVG + PNG: ~150 MB — fits GitHub's 1 GB repo limit, but watch
  bandwidth on the free Pages tier if every card is hot-linked.
- If size becomes an issue, drop the PNGs and serve SVGs directly
  (modern scrapers increasingly accept SVG, though PNG is the safe bet).
