# Vitola Pedia

A premium digital cigar encyclopedia — 1,400+ cigars catalogued with full specs, flavor profiles, strength ratings, smoking times, and pairing recommendations.

**Live site:** [vitolapedia.com](https://vitolapedia.com)

## Features

- **1,400+ cigars** across 130+ brands — from Cuban classics to boutique Nicaraguan blends to everyday cigarillos
- **Powerful filtering** by strength, origin, wrapper, price range, and flavor profile
- **Search** by name, brand, or tasting note
- **Sort** by rating, price, strength, or smoking time
- **Detail modals** with full construction specs, flavor wheel, and pairing suggestions
- **Region guide** covering the world's major tobacco-growing regions
- **Beginner's guide** to cigar anatomy, strength, and how to smoke
- **The Lounge** — a live room: light up a cigar and appear as an ember on a
  world map, plus a threaded feed with flairs, voting, and comments. Location
  sharing is opt-in and coarse-grained. See [Backend setup](#the-lounge).
- Grid and list view toggle
- Fully responsive — works on mobile and desktop

## Cigar Database

Each cigar includes:
- Brand, origin, region
- Wrapper, binder, filler
- Strength (1–5 scale)
- Smoking time, price, expert rating
- Flavor profile tags (169 unique notes, searchable)
- Food & drink pairings
- Year founded, limited edition flag
- Product image sourced from Famous Smoke Shop, Neptune Cigar, or Havana House
- Direct buy links to applicable retailers (Famous Smoke, Neptune, Cigars International, JR Cigars, Havana House, C.Gars Ltd)

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

## The Lounge

The Lounge ships in **solo mode** — fully functional, but you're the only person
in the room. Your identity and posts live in `localStorage`; live presence is
broadcast across your own browser tabs, so opening a second tab genuinely shows
two embers on the map. No users are simulated.

To open it to everyone, point `LOUNGE_CONFIG` in `js/lounge-adapter.js` at a
free Supabase project. That's the only code change — the site stays static, with
no build step. Schema, RLS policies, and setup steps:
[`docs/lounge-backend.md`](docs/lounge-backend.md).

**Location privacy:** sharing is off by default. Device coordinates are rounded
to a ~55 km grid the moment they're received — the precise fix is never stored
or transmitted — and the form previews the exact rounded position before you
confirm. Picking a city from a list never touches the Geolocation API at all.

## Stack

Pure HTML, CSS, and vanilla JavaScript. No frameworks, no dependencies, no build
tools. The Lounge optionally loads `supabase-js` from a CDN at runtime, and only
when a backend is configured.

## Adding Cigars

All cigar data lives in `js/data.js` as a JavaScript array. Add new entries following the existing schema and mirror the change in `data/cigars.json`.

### Pipeline scripts (in `scripts/`)

| Script | Purpose |
|---|---|
| `merge-batches.js` | Merges `data/batches/batch_N.json` files, deduplicates against `data/existing_ids.json` |
| `scrape-all-retailers.js` | Scrapes buy links from CI, Neptune, JR, Havana House, C.Gars |
| `scrape-fs-links.js` | Finds Famous Smoke product URLs by searching |
| `scrape-fs-images.js` | Extracts og:image from Famous Smoke product pages |
| `scrape-neptune-images.js` | Extracts og:image from Neptune Cigar product pages |
| `scrape-hh-images.js` | Extracts og:image from Havana House product pages (Cuban cigars) |
| `inject-new-cigars.js` | Injects merged cigars with buy links + images into `js/data.js` |
| `apply-neptune-images.js` | Applies Neptune images to existing cigars missing images |

### Deduplication

`data/existing_ids.json` is the authoritative list of all cigar IDs. Always read this file to avoid duplicates — never re-scan `js/data.js` manually. Update it after every batch injection.
