# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Cigar Picker** is a premium, static single-page cigar encyclopedia — no build step, no framework, no dependencies beyond vanilla HTML/CSS/JS. Open `index.html` in any browser to run it.

## Architecture

```
index.html          — Single page app shell, all UI structure
css/style.css       — All styles: dark luxury theme, layout, animations, responsive
js/app.js           — Core engine: filtering, search, sorting, modal detail views, flavor wheel
js/data.js          — Cigar database (200+ cigars as a JS const, avoids CORS issues with JSON fetch)
data/cigars.json    — Source-of-truth cigar data (mirrors js/data.js, kept in sync manually)
img/                — Static assets (flags, tobacco leaf icons, etc.)
```

## Data Schema

Each cigar object in `CIGARS` array follows this shape:
```js
{
  id: "unique-slug",
  name: "Full Cigar Name",
  brand: "Brand Name",
  origin: "Country",           // Nicaragua, Cuba, Dominican Republic, Honduras, etc.
  region: "Region Name",       // Jalapa, Estelí, Vuelta Abajo, Cibao Valley, etc.
  wrapper: "Wrapper leaf",     // Connecticut, Habano, Maduro, Cameroon, Corojo, etc.
  binder: "Binder leaf",
  filler: "Filler blend",
  strength: 1-5,               // 1=Mild, 2=Mild-Med, 3=Medium, 4=Med-Full, 5=Full
  smokingTime: 45,             // minutes
  price: 12.50,                // single stick USD
  rating: 94,                  // 0-100 expert composite
  flavors: ["Cedar", "Leather", "Earth", "Coffee", "Cream"],  // flavor tags
  size: "Robusto",             // vitola/size name
  length: 5.0,                 // inches
  ringGauge: 50,
  popularity: 1-10,            // 1=niche, 10=iconic
  description: "...",
  pairings: ["Bourbon", "Espresso"],
  yearFounded: 1962,
  limited: false,              // true for limited/rare releases
  image: "https://cdn.famous-smoke.com/...",  // optional — direct product photo URL (jpg/png/webp)
  buyLinks: [                  // optional — specific product page links with prices
    { retailer: "Cigars International", url: "https://...", price: 11.95 },
    { retailer: "Famous Smoke Shop",    url: "https://...", price: 12.99 },
  ]
}
```

## Key Decisions

- **No JSON fetch** — cigar data is a JS `const CIGARS = [...]` in `js/data.js` to avoid CORS issues when opening `index.html` directly from the filesystem without a local server.
- **No framework** — vanilla JS with DOM manipulation for max performance and zero dependencies.
- **Strength scale** is 1–5 (not text strings) so it's sortable and filterable numerically; display labels are applied in the render layer.
- **Flavor wheel** is SVG-based, drawn programmatically in JS — no canvas library needed.
- When adding new cigars, update **both** `js/data.js` and `data/cigars.json` to keep them in sync.
- **Where to Buy** auto-generates search links to 5 US retailers (or 3 international retailers for Cuban cigars) for every cigar. Preferred retailers (in priority order): Cigars International, Cigar Page, Famous Smoke Shop, JR Cigars, Smoke Inn. If `buyLinks` is provided on a cigar, those specific product links are shown first, sorted cheapest-first with "Best Price" badge on the cheapest entry.

## Adding New Cigars — Complete Checklist (MANDATORY)

Every cigar added to `js/data.js` MUST be complete from day one. Never add a cigar with placeholder data or missing fields. Do all of the following before committing:

### 1. Fill all schema fields
All fields in the schema above are required. No empty strings, no `null` for required fields, no guessed values — research each field accurately.

### 2. Find a product image
Search for a direct product photo URL on famous-smoke.com or cigarsinternational.com. Use Puppeteer to load the product page and extract the `og:image` meta tag value. The URL must end in `.jpg`, `.jpeg`, `.png`, or `.webp`. If absolutely no image can be found after searching both sites, omit the `image` field entirely (cards render fine without it).

### 3. Find direct buy links for ALL retailers (REQUIRED)

**This is the most important step.** Every cigar must have `buyLinks` populated with direct product page URLs — not search URLs. Users must land on the exact product page with one click.

Use Puppeteer to search each retailer and extract the first matching product URL:

**US retailers (non-Cuban cigars):**
```js
buyLinks: [
  { retailer: "Famous Smoke Shop",    url: "https://www.famous-smoke.com/{product-slug}",                        price: null },
  { retailer: "JR Cigars",            url: "https://www.jrcigars.com/item/{brand}/{product}/{code}.html",        price: null },
  { retailer: "Neptune Cigar",        url: "https://www.neptunecigar.com/cigar/{slug}",                         price: null },
  { retailer: "Cigars International", url: "https://www.cigarsinternational.com/p/{slug}/{id}/",                 price: null },
]
```

**Cuban cigars only:**
```js
buyLinks: [
  { retailer: "Havana House", url: "https://www.havanahouse.co.uk/product/{slug}/", price: null },
  { retailer: "C.Gars Ltd",   url: "https://www.cgarsltd.co.uk/{slug}-p-{id}.html", price: null },
]
```

**How to find URLs for a new cigar using Puppeteer:**
```js
// Famous Smoke — search and extract product slug from DOM
await page.goto(`https://www.famous-smoke.com/search?q=${encodeURIComponent(name)}`);
// Product URLs match: /-cigars-/ in the path at root level

// JR Cigars — sitemap has all 10,600+ products at:
// https://www.jrcigars.com/sitemap_0-product.xml
// URLs pattern: /item/{brand}/{product}/{code}.html

// Neptune — brand page: https://www.neptunecigar.com/{brand-slug}-cigar
// Product URLs pattern: /cigar/{slug}

// Cigars International — sitemap has all 6,100+ products at:
// https://www.cigarsinternational.com/sitemap.xml
// URLs pattern: /p/{slug}/{id}/

// Havana House — category: https://www.havanahouse.co.uk/product-category/cigars/cuban/{brand}/
// Product URLs pattern: /product/{slug}/

// C.Gars — category: https://www.cgarsltd.co.uk/cuban-cigars-{brand}-c-{id}.html
// Product URLs pattern: /{slug}-p-{id}.html
```

If a retailer genuinely doesn't stock the cigar (very niche/boutique brands), omit that retailer from `buyLinks` — the app will auto-generate a search fallback for it.

### 4. Verify all URLs return 200
Before committing, confirm each `buyLinks` URL actually loads (not 404). Cloudflare on CI/JR may return 403 to bots but will work fine for real users — that's acceptable.

### 5. Update README.md count
Update the cigar count in `README.md` to reflect the new total (round down to nearest 10).

### 6. Syntax check
After editing `js/data.js`, always verify no JS syntax errors were introduced:
```bash
node -e "const c=require('fs').readFileSync('js/data.js','utf8'); eval(c.replace(/^const /gm,'var ')); console.log('OK:', CIGARS.length);"
```
Common mistake: inserting a `buyLinks:` line after `limited: false` without adding a comma to the preceding line. Always add the comma.

## Running Locally

```bash
# Option 1: just open the file
open index.html

# Option 2: local dev server (avoids any future fetch-based features)
npx serve .
# or
python3 -m http.server 8080
```
