# Brand logos

47 of the 138 houses have a logo here, pulled from each brand's own
website. The rest fall back to a typeset monogram crest — see
[`js/brand-logos.js`](../../js/brand-logos.js).

## Adding one

Name the file after the brand slug — lowercase, accents stripped,
non-alphanumerics as hyphens:

| Brand in `js/data.js` | Filename              |
|-----------------------|-----------------------|
| Padrón                | `padron.png`          |
| Arturo Fuente         | `arturo-fuente.png`   |
| E.P. Carrillo         | `e-p-carrillo.svg`    |
| Romeo y Julieta       | `romeo-y-julieta.png` |

Then register it in `js/brand-logos.js`:

```js
'Padrón': { src: 'img/brands/padron.png', plate: 'dark' },
```

Nothing is auto-detected — an unlisted brand renders its monogram crest,
so the grid never fires 404s or shows a broken image. A registered file
that fails to load also falls back to the monogram.

## Picking `plate`

Cigar logos split almost evenly between dark marks drawn for white paper
and light marks drawn for dark packaging, so no single backing works for
both — a white Padrón script vanishes on cream.

- `plate: 'cream'` — dark or colour mark, warm cream disc
- `plate: 'dark'` — light or white mark, deep espresso disc

Don't eyeball it. Re-run the measurement:

```bash
node scripts/measure-logo-plate.js
```

It renders each file to a canvas and takes the mean luminance of the
non-transparent pixels; anything above 150 that isn't a solid rectangle
gets the dark plate.

## Re-running the scrape

```bash
node scripts/scrape-brand-logos.js
```

Walks each brand's own site, scores every `<img>` for "looks like a header
logo", and downloads the winner. **Review the results before shipping** —
the first pass returned 87 files of which 40 were wrong: parked-domain
placeholders (HugeDomains, Spaceship, porkbun), Surgeon General warning
labels, "96 Rated" award badges, product box shots, and the generic
`Habanos` wordmark standing in for thirteen separate Cuban marques.

## File guidance

SVG preferred, otherwise PNG/WebP at 400px+. Transparent background,
whitespace trimmed — the crest frame supplies its own padding.
