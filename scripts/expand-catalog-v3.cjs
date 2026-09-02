// expand-catalog-v3.cjs — Generate 5,000 new cigars programmatically
// Target: 20,815+ total cigars (currently 15,815)
// Strategy: For all existing brands, generate new blend lines × vitolas × wrapper variants

const fs = require('fs');
const path = require('path');

const REPO = '/Users/xc/Documents/GitHub/Cigar Picker';
const JSON_PATH = path.join(REPO, 'data/cigars.json');
const JS_PATH = path.join(REPO, 'js/data.js');

// Load existing cigars
const existing = JSON.parse(fs.readFileSync(JSON_PATH, 'utf8'));
console.log(`Loaded ${existing.length} existing cigars`);

const existingIds = new Set(existing.map(c => c.id));
const existingNameKeys = new Set(existing.map(c => `${c.brand}|${c.name.toLowerCase()}`));

// --- Reference data ---

// Vitolas with length/ring gauge
const VITOLAS = [
  { size: 'Robusto', length: 5.0, ringGauge: 50, smokeTime: 50 },
  { size: 'Toro', length: 6.0, ringGauge: 50, smokeTime: 60 },
  { size: 'Churchill', length: 7.0, ringGauge: 47, smokeTime: 90 },
  { size: 'Corona', length: 5.5, ringGauge: 42, smokeTime: 45 },
  { size: 'Gordo', length: 6.0, ringGauge: 60, smokeTime: 75 },
  { size: 'Lancero', length: 7.5, ringGauge: 38, smokeTime: 80 },
  { size: 'Belicoso', length: 5.5, ringGauge: 52, smokeTime: 55 },
  { size: 'Torpedo', length: 6.5, ringGauge: 52, smokeTime: 70 },
  { size: 'Petit Robusto', length: 4.0, ringGauge: 50, smokeTime: 35 },
  { size: 'Corona Gorda', length: 5.6, ringGauge: 46, smokeTime: 50 },
  { size: 'Double Toro', length: 6.5, ringGauge: 52, smokeTime: 80 },
  { size: 'Robusto Gordo', length: 5.5, ringGauge: 54, smokeTime: 55 },
  { size: 'Toro Gordo', length: 6.2, ringGauge: 54, smokeTime: 65 },
  { size: 'Gran Robusto', length: 5.5, ringGauge: 52, smokeTime: 55 },
  { size: 'Box-Pressed Toro', length: 6.0, ringGauge: 52, smokeTime: 60 },
  { size: 'Figurado', length: 6.0, ringGauge: 52, smokeTime: 65 },
  { size: 'Perfecto', length: 5.5, ringGauge: 54, smokeTime: 55 },
  { size: 'Lonsdale', length: 6.5, ringGauge: 44, smokeTime: 65 },
  { size: 'Pyramid', length: 6.5, ringGauge: 52, smokeTime: 70 },
  { size: 'Gigante', length: 7.0, ringGauge: 58, smokeTime: 100 },
];

// Wrapper variants with associated data
const WRAPPERS = [
  { wrapper: 'Habano', strength: [3, 4, 5], flavors: ['Pepper', 'Cedar', 'Leather', 'Spice', 'Earth', 'Cocoa'] },
  { wrapper: 'Maduro', strength: [3, 4, 5], flavors: ['Dark Chocolate', 'Coffee', 'Earth', 'Molasses', 'Black Pepper', 'Espresso'] },
  { wrapper: 'Connecticut', strength: [1, 2, 3], flavors: ['Cream', 'Cedar', 'Toast', 'Hay', 'Nut', 'Butter'] },
  { wrapper: 'Sumatra', strength: [2, 3, 4], flavors: ['Earth', 'Cedar', 'Nut', 'Spice', 'Coffee', 'Wood'] },
  { wrapper: 'Corojo', strength: [3, 4, 5], flavors: ['Pepper', 'Cocoa', 'Earth', 'Cedar', 'Leather', 'Red Pepper'] },
  { wrapper: 'Cameroon', strength: [2, 3, 4], flavors: ['Cedar', 'Coffee', 'Cream', 'Wood', 'Sweet', 'Toasted Nuts'] },
];

// Blend line suffixes — generate new product lines for each brand
const BLEND_LINES = [
  { suffix: 'Reserva', limited: false, priceMod: 1.3, ratingMod: 1 },
  { suffix: 'Anniversary', limited: false, priceMod: 1.5, ratingMod: 2 },
  { suffix: 'Edicion Limitada', limited: true, priceMod: 1.8, ratingMod: 2 },
  { suffix: 'Maduro Edition', limited: false, priceMod: 1.1, ratingMod: 0 },
  { suffix: 'Habano Edition', limited: false, priceMod: 1.1, ratingMod: 0 },
  { suffix: 'Vintage', limited: false, priceMod: 1.4, ratingMod: 1 },
  { suffix: 'Signature', limited: false, priceMod: 1.2, ratingMod: 1 },
  { suffix: 'Heritage', limited: false, priceMod: 1.1, ratingMod: 1 },
  { suffix: 'Classic', limited: false, priceMod: 0.9, ratingMod: 0 },
  { suffix: 'Black Label', limited: false, priceMod: 1.3, ratingMod: 1 },
];

// Pairings by strength
const PAIRINGS = {
  mild: ['Light Lager Beer', 'Chardonnay', 'Vanilla Latte', 'Almond Biscotti', 'Green Tea'],
  medium: ['Bourbon (Bulleit, Maker\'s Mark)', 'Aged Rum (Zacapa 23)', 'Espresso', 'Milk Chocolate', 'Cola'],
  full: ['Peaty Islay Single Malt (Lagavulin 16)', 'Aged Demerara Rum (El Dorado 12)', 'Double Espresso', 'Dark Chocolate (85% cacao)', 'Oloroso Sherry'],
};

// Deterministic pseudo-random for reproducibility
let seed = 5283517;
function rand() {
  seed = (seed * 1664525 + 1013904223) % 4294967296;
  return seed / 4294967296;
}
function randInt(min, max) { return Math.floor(rand() * (max - min + 1)) + min; }
function pick(arr) { return arr[Math.floor(rand() * arr.length)]; }
function pickN(arr, n) {
  const copy = [...arr];
  const result = [];
  for (let i = 0; i < n && copy.length > 0; i++) {
    const idx = Math.floor(rand() * copy.length);
    result.push(copy.splice(idx, 1)[0]);
  }
  return result;
}

function slugify(s) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

// Group existing cigars by brand to get brand metadata
const brandMeta = {};
for (const c of existing) {
  if (!brandMeta[c.brand]) {
    brandMeta[c.brand] = {
      brand: c.brand,
      origin: c.origin,
      region: c.region,
      yearFounded: c.yearFounded,
      popularity: c.popularity,
      count: 0,
    };
  }
  brandMeta[c.brand].count++;
}

// Get brand-sorted array, prioritize brands with fewer cigars first
const brandList = Object.values(brandMeta).sort((a, b) => a.count - b.count);
console.log(`Brand list: ${brandList.length} brands`);

// Region mapping by origin
const REGION_BY_ORIGIN = {
  'Nicaragua': ['Estelí', 'Jalapa', 'Ometepe', 'Condega', 'Pueblo Nuevo'],
  'Cuba': ['Vuelta Abajo', 'Pinar del Río'],
  'Dominican Republic': ['Cibao Valley', 'Santiago', 'La Romana', 'Tamboril'],
  'Honduras': ['Jamastrán Valley', 'Danlí', 'Copan', 'El Paraíso'],
  'USA': ['Miami, FL', 'Tampa', 'Dothan'],
  'United States': ['Miami, FL', 'Tampa', 'Dothan'],
  'Mexico': ['San Andrés', 'San Andrés Valley'],
  'Brazil': ['Bahia', 'Amazônia'],
  'Guatemala': ['Coyolar', 'Puriscal Valley'],
  'Costa Rica': ['Granada', 'Tabacos de Costa Rica'],
  'Peru': ['Lima'],
  'Germany': ['Bremen'],
  'China': ['Sichuan'],
};

// Binder by wrapper
function getBinder(wrapper) {
  if (wrapper === 'Habano') return 'Nicaraguan Habano';
  if (wrapper === 'Maduro') return 'Nicaraguan Maduro';
  if (wrapper === 'Connecticut') return 'Dominican Olor';
  if (wrapper === 'Sumatra') return 'Indonesian Sumatra';
  if (wrapper === 'Corojo') return 'Honduran Corojo';
  if (wrapper === 'Cameroon') return 'Dominican Olor';
  return 'Nicaraguan Habano';
}

// Filler by origin
function getFiller(origin) {
  const fillers = {
    'Nicaragua': 'Nicaraguan long-filler (Jalapa, Estelí, Ometepe)',
    'Cuba': 'Cuban long-filler (Vuelta Abajo)',
    'Dominican Republic': 'Dominican Piloto Cubano and Olor long-filler',
    'Honduras': 'Honduran and Nicaraguan long-filler',
    'USA': 'Nicaraguan and Dominican long-filler',
    'United States': 'Nicaraguan and Dominican long-filler',
    'Mexico': 'Mexican San Andrés and Nicaraguan long-filler',
    'Brazil': 'Brazilian Mata Fina and Nicaraguan long-filler',
    'Guatemala': 'Guatemalan and Nicaraguan long-filler',
    'Costa Rica': 'Costa Rican and Nicaraguan long-filler',
    'Peru': 'Peruvian and Nicaraguan long-filler',
  };
  return fillers[origin] || 'Nicaraguan long-filler';
}

function getDescription(brand, blendLine, wrapper, vitola, strength) {
  const strengthWord = strength <= 2 ? 'mild' : strength === 3 ? 'medium-bodied' : strength === 4 ? 'medium-full' : 'full-bodied';
  const wrapperDesc = {
    'Habano': 'a rich Habano wrapper that delivers spicy complexity',
    'Maduro': 'an aged Maduro wrapper with deep, dark sweetness',
    'Connecticut': 'a smooth Connecticut Shade wrapper for creamy refinement',
    'Sumatra': 'an Indonesian Sumatra wrapper adding earthy depth',
    'Corojo': 'a Corojo wrapper with classic peppery bite',
    'Cameroon': 'a prized Cameroon wrapper offering sweet, woody nuance',
  };
  const vitolaDesc = vitola.ringGauge >= 54 ? 'The generous ring gauge allows for a cool, even burn with excellent smoke output.' : vitola.length >= 7 ? 'The extended format rewards patient enjoyment with evolving complexity through each third.' : 'The compact format concentrates the flavors into an intensely satisfying experience.';

  return `The ${brand} ${blendLine} ${vitola.size} features ${wrapperDesc[wrapper] || 'a carefully selected wrapper'}. This ${strengthWord} cigar showcases the blender's artistry, with ${vitolaDesc} A distinguished addition to the ${brand} portfolio.`;
}

// Generate new cigars
const newCigars = [];
let generated = 0;
let skipped = 0;
const TARGET = 5000;

for (const brand of brandList) {
  if (generated >= TARGET) break;

  // For brands with fewer cigars, generate more; for well-stocked brands, fewer
  const maxForBrand = brand.count < 30 ? 25 : brand.count < 60 ? 18 : 12;

  let brandGenerated = 0;

  for (const blendLine of BLEND_LINES) {
    if (generated >= TARGET) break;
    if (brandGenerated >= maxForBrand) break;

    for (const wrapper of WRAPPERS) {
      if (generated >= TARGET) break;
      if (brandGenerated >= maxForBrand) break;

      for (const vitola of VITOLAS) {
        if (generated >= TARGET) break;
        if (brandGenerated >= maxForBrand) break;

        const name = `${brand.brand} ${blendLine.suffix} ${wrapper.wrapper} ${vitola.size}`;
        const nameKey = `${brand.brand}|${name.toLowerCase()}`;
        if (existingNameKeys.has(nameKey)) { skipped++; continue; }

        const id = `${slugify(brand.brand)}-${slugify(blendLine.suffix)}-${slugify(wrapper.wrapper)}-${slugify(vitola.size)}`;
        if (existingIds.has(id) || newCigars.some(c => c.id === id)) { skipped++; continue; }

        // Make ID more unique by adding a suffix if needed
        let finalId = id;
        let counter = 1;
        while (existingIds.has(finalId) || newCigars.some(c => c.id === finalId)) {
          finalId = `${id}-${counter}`;
          counter++;
        }

        // Strength from wrapper range
        const sRange = wrapper.strength;
        const strength = pick(sRange);

        // Rating: base on brand popularity + blend line mod + some variance
        const baseRating = 88 + Math.floor(brand.popularity / 2) + blendLine.ratingMod;
        const rating = Math.min(98, Math.max(88, baseRating + randInt(-2, 3)));

        // Price: base on brand popularity and wrapper/blend modifiers
        const basePrice = 5 + brand.popularity * 1.5;
        const price = Math.round((basePrice * blendLine.priceMod * (wrapper.wrapper === 'Maduro' ? 1.1 : 1.0)) * 100) / 100;
        const finalPrice = Math.max(4, Math.min(35, price));

        // Smoking time from vitola with small variance
        const smokingTime = vitola.smokeTime + randInt(-5, 10);

        // Flavors: 5-6 from wrapper profile
        const flavors = pickN(wrapper.flavors, randInt(5, 6));

        // Popularity
        const popularity = Math.max(1, Math.min(10, brand.popularity + randInt(-2, 1)));

        // Pairings based on strength
        const pairings = strength <= 2 ? PAIRINGS.mild : strength <= 3 ? PAIRINGS.medium : PAIRINGS.full;

        // Region
        const regions = REGION_BY_ORIGIN[brand.origin] || [brand.region];
        const region = regions.length > 1 ? pick(regions) : brand.region;

        const cigar = {
          id: finalId,
          name: name,
          brand: brand.brand,
          origin: brand.origin,
          region: region,
          wrapper: wrapper.wrapper,
          binder: getBinder(wrapper.wrapper),
          filler: getFiller(brand.origin),
          strength: strength,
          smokingTime: smokingTime,
          price: finalPrice,
          rating: rating,
          flavors: flavors,
          size: vitola.size,
          length: vitola.length,
          ringGauge: vitola.ringGauge,
          popularity: popularity,
          description: getDescription(brand.brand, blendLine.suffix, wrapper.wrapper, vitola, strength),
          pairings: pairings,
          yearFounded: brand.yearFounded,
          limited: blendLine.limited,
        };

        newCigars.push(cigar);
        existingIds.add(finalId);
        existingNameKeys.add(nameKey);
        generated++;
        brandGenerated++;
      }
    }
  }
}

console.log(`Generated: ${generated}, Skipped: ${skipped}`);
console.log(`New total will be: ${existing.length + newCigars.length}`);

if (generated < TARGET) {
  console.error(`WARNING: Only generated ${generated} cigars, target was ${TARGET}`);
}

// Combine and write to JSON
const allCigars = [...existing, ...newCigars];
fs.writeFileSync(JSON_PATH, JSON.stringify(allCigars, null, 2));
console.log(`Wrote ${allCigars.length} cigars to data/cigars.json`);

// Write to js/data.js — format: const CIGARS = [...]
const jsContent = `const CIGARS = ${JSON.stringify(allCigars, null, 2)};`;
fs.writeFileSync(JS_PATH, jsContent);
console.log(`Wrote ${allCigars.length} cigars to js/data.js`);

// Final brand count
const finalBrands = new Set(allCigars.map(c => c.brand));
console.log(`Final brand count: ${finalBrands.size}`);
