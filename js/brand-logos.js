/* ══════════════════════════════════════════════════════════════════
   BRAND LOGOS — manifest for The Houses
   ══════════════════════════════════════════════════════════════════

   Houses render their identity in this order:

     1. An entry in BRAND_LOGOS below
     2. Otherwise, a typeset monogram crest

   Each entry carries a `plate`: which backing disc the mark sits on.
   Cigar logos split almost evenly into dark marks drawn for white paper
   and light marks drawn for dark packaging, so one plate cannot serve
   both — a white Padrón script disappears on cream. The value was
   measured, not guessed: every file was rendered to a canvas and the
   mean luminance of its non-transparent pixels taken.

       plate: 'cream'  — dark/colour mark, warm cream disc
       plate: 'dark'   — light/white mark, deep espresso disc

   A bare string still works and is treated as 'cream'.

   There is no automatic lookup and no probing: an unlisted brand goes
   straight to its crest, so the grid never fires a wave of 404s and
   never shows a broken image.

   ── ADDING A LOGO ─────────────────────────────────────────────────

   Drop the file in img/brands/ and name it after the brand slug —
   lowercase, accents stripped, non-alphanumerics as hyphens:

       Padrón              → img/brands/padron.svg
       Arturo Fuente       → img/brands/arturo-fuente.png
       E.P. Carrillo       → img/brands/e-p-carrillo.svg

   Then add one line here. Both forms work:

       'Padrón':        { src: 'img/brands/padron.png', plate: 'dark' },
       'Arturo Fuente': 'img/brands/arturo-fuente.png',

   The key must match the `brand` field in js/data.js exactly, accents
   and all. Anything unmatched simply falls back to the crest.

   ── WHAT MAKES A GOOD FILE ───────────────────────────────────────

   • SVG where possible; otherwise PNG/WebP at 400px or wider.
   • Transparent background.
   • Trim the whitespace — the crest frame supplies its own padding.
   • Dark, light and colour marks all work: logos sit on a warm cream
     plate (the same idea as a cigar band), so contrast is handled.

   ── A NOTE ON SOURCING ───────────────────────────────────────────

   Brand logos are trademarks. Using them to identify the house they
   belong to in a reference work is ordinary nominative use, the same
   as the product photography already hotlinked throughout the library.
   Self-hosting in img/brands/ is still preferable to hotlinking: it
   survives the other site reorganising, and it keeps the encyclopedia
   from leaning on someone else's bandwidth.
   ══════════════════════════════════════════════════════════════════ */

const BRAND_LOGOS = {
  "Aganorsa Leaf":              { src: 'img/brands/aganorsa-leaf.svg', plate: 'dark' },
  "AJ Fernandez":               { src: 'img/brands/aj-fernandez.png', plate: 'cream' },
  "Arturo Fuente":              { src: 'img/brands/arturo-fuente.png', plate: 'cream' },
  "Ashton":                     { src: 'img/brands/ashton.svg', plate: 'cream' },
  "Casdagli":                   { src: 'img/brands/casdagli.png', plate: 'dark' },
  "Crowned Heads":              { src: 'img/brands/crowned-heads.png', plate: 'cream' },
  "Crux Cigars":                { src: 'img/brands/crux-cigars.png', plate: 'cream' },
  "Cuaba":                      { src: 'img/brands/cuaba.png', plate: 'cream' },
  "Drew Estate":                { src: 'img/brands/drew-estate.svg', plate: 'dark' },
  "Dunbarton Tobacco & Trust":  { src: 'img/brands/dunbarton-tobacco-and-trust.webp', plate: 'dark' },
  "Dutch Masters":              { src: 'img/brands/dutch-masters.svg', plate: 'cream' },
  "Espinosa Cigars":            { src: 'img/brands/espinosa-cigars.png', plate: 'cream' },
  "Ezra Zion":                  { src: 'img/brands/ezra-zion.png', plate: 'dark' },
  "Ferio Tego":                 { src: 'img/brands/ferio-tego.jpg', plate: 'cream' },
  "Foundation Cigar Co.":       { src: 'img/brands/foundation-cigar-co.png', plate: 'cream' },
  "Foundation Cigar Company":   { src: 'img/brands/foundation-cigar-company.png', plate: 'cream' },
  "Gurkha":                     { src: 'img/brands/gurkha.webp', plate: 'cream' },
  "Illusione":                  { src: 'img/brands/illusione.png', plate: 'dark' },
  "J.C. Newman":                { src: 'img/brands/j-c-newman.png', plate: 'cream' },
  "Joya de Nicaragua":          { src: 'img/brands/joya-de-nicaragua.png', plate: 'dark' },
  "Kristoff":                   { src: 'img/brands/kristoff.png', plate: 'dark' },
  "La Aroma de Cuba":           { src: 'img/brands/la-aroma-de-cuba.svg', plate: 'cream' },
  "La Flor Dominicana":         { src: 'img/brands/la-flor-dominicana.png', plate: 'cream' },
  "La Gloria Cubana":           { src: 'img/brands/la-gloria-cubana.png', plate: 'cream' },
  "Leaf by Oscar":              { src: 'img/brands/leaf-by-oscar.jpg', plate: 'dark' },
  "Macanudo":                   { src: 'img/brands/macanudo.svg', plate: 'cream' },
  "Man O' War":                 { src: 'img/brands/man-o-war.png', plate: 'dark' },
  "Matilde":                    { src: 'img/brands/matilde.png', plate: 'cream' },
  "Montecristo":                { src: 'img/brands/montecristo.png', plate: 'cream' },
  "My Father Cigars":           { src: 'img/brands/my-father-cigars.png', plate: 'cream' },
  "Oliva":                      { src: 'img/brands/oliva.png', plate: 'dark' },
  "Padrón":                     { src: 'img/brands/padron.png', plate: 'dark' },
  "Partagás":                   { src: 'img/brands/partagas.webp', plate: 'dark' },
  "Perdomo":                    { src: 'img/brands/perdomo.png', plate: 'dark' },
  "Perdomo Cigars":             { src: 'img/brands/perdomo-cigars.png', plate: 'dark' },
  "Plasencia":                  { src: 'img/brands/plasencia.svg', plate: 'cream' },
  "Principle Cigars":           { src: 'img/brands/principle-cigars.png', plate: 'cream' },
  "Quai d'Orsay":               { src: 'img/brands/quai-d-orsay.svg', plate: 'cream' },
  "Rocky Patel":                { src: 'img/brands/rocky-patel.png', plate: 'dark' },
  "RoMa Craft Tobac":           { src: 'img/brands/roma-craft-tobac.png', plate: 'cream' },
  "Romeo y Julieta":            { src: 'img/brands/romeo-y-julieta.png', plate: 'dark' },
  "Room 101":                   { src: 'img/brands/room-101.png', plate: 'cream' },
  "Serino Cigars":              { src: 'img/brands/serino-cigars.svg', plate: 'cream' },
  "Southern Draw":              { src: 'img/brands/southern-draw.png', plate: 'cream' },
  "Tatuaje":                    { src: 'img/brands/tatuaje.png', plate: 'dark' },
  "Tatuaje Cigars":             { src: 'img/brands/tatuaje-cigars.png', plate: 'dark' },
  "Villiger":                   { src: 'img/brands/villiger.svg', plate: 'cream' },
};

/* Resolver used by js/houses.js. Tolerates accent and spacing drift so
   "Ramon Allones" finds a logo filed under "Ramón Allones". */
function brandLogo(brand) {
  if (!brand) return null;

  const shape = v => (typeof v === 'string' ? { src: v, plate: 'cream' } : v);

  if (BRAND_LOGOS[brand]) return shape(BRAND_LOGOS[brand]);

  const norm = s => String(s).toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '');

  const want = norm(brand);
  for (const key in BRAND_LOGOS) {
    if (norm(key) === want) return shape(BRAND_LOGOS[key]);
  }
  return null;
}
