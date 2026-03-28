# Vitola Pedia

A premium digital cigar encyclopedia — 1000+ cigars catalogued with full specs, flavor profiles, strength ratings, smoking times, and pairing recommendations.

**Live site:** [vitolapedia.com](https://vitolapedia.com)

## Features

- **1000+ cigars** across 110+ brands — from Cuban classics to boutique Nicaraguan blends to everyday cigarillos
- **Powerful filtering** by strength, origin, wrapper, price range, and flavor profile
- **Search** by name, brand, or tasting note
- **Sort** by rating, price, strength, or smoking time
- **Detail modals** with full construction specs, flavor wheel, and pairing suggestions
- **Region guide** covering the world's major tobacco-growing regions
- **Beginner's guide** to cigar anatomy, strength, and how to smoke
- Grid and list view toggle
- Fully responsive — works on mobile and desktop

## Cigar Database

Each cigar includes:
- Brand, origin, region
- Wrapper, binder, filler
- Strength (1–5 scale)
- Smoking time, price, expert rating
- Flavor profile tags
- Food & drink pairings
- Year founded, limited edition flag

## Running Locally

No build step required — just open the file:

```bash
open index.html
```

Or with a local server:

```bash
npx serve .
# or
python3 -m http.server 8080
```

## Stack

Pure HTML, CSS, and vanilla JavaScript. No frameworks, no dependencies, no build tools.

## Adding Cigars

All cigar data lives in `js/data.js` as a JavaScript array. Add new entries following the existing schema and mirror the change in `data/cigars.json`.
