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
  limited: false               // true for limited/rare releases
}
```

## Key Decisions

- **No JSON fetch** — cigar data is a JS `const CIGARS = [...]` in `js/data.js` to avoid CORS issues when opening `index.html` directly from the filesystem without a local server.
- **No framework** — vanilla JS with DOM manipulation for max performance and zero dependencies.
- **Strength scale** is 1–5 (not text strings) so it's sortable and filterable numerically; display labels are applied in the render layer.
- **Flavor wheel** is SVG-based, drawn programmatically in JS — no canvas library needed.
- When adding new cigars, update **both** `js/data.js` and `data/cigars.json` to keep them in sync.

## Running Locally

```bash
# Option 1: just open the file
open index.html

# Option 2: local dev server (avoids any future fetch-based features)
npx serve .
# or
python3 -m http.server 8080
```
