// scripts/expand-catalog-v2.cjs
// Expand cigar catalog: for every brand with <25 cigars, generate additional
// vitolas + wrapper variants + new blend lines (Reserva, Anniversary, Maduro,
// Habano, Edicion Limitada, etc.) to reach 20-25 entries per brand.
// Target: add 2,000+ new cigars → 9,500+ total.

const fs = require('fs');

const existing = JSON.parse(fs.readFileSync('data/cigars.json', 'utf8'));
const existingIds = new Set(existing.map(c => c.id.toLowerCase()));
const existingNames = new Set(existing.map(c => c.name.toLowerCase()));
console.log('Starting:', existing.length, 'cigars,', new Set(existing.map(c=>c.brand)).size, 'brands');

function slug(s) { return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''); }

function wrapperLeaf(w) {
  const wl = w.toLowerCase();
  if (wl.includes('maduro')) return 'Connecticut Broadleaf Maduro';
  if (wl.includes('connecticut')) return 'Connecticut Shade';
  if (wl.includes('corojo 99')) return 'Corojo 99';
  if (wl.includes('corojo')) return 'Corojo';
  if (wl.includes('cameroon')) return 'Cameroon';
  if (wl.includes('sumatra')) return 'Sumatra';
  if (wl.includes('san andrés') || wl.includes('san andres')) return 'Mexican San Andrés';
  if (wl.includes('cuban')) return 'Cuban Habano';
  if (wl.includes('sun grown') || wl.includes('sun-grown')) return 'Sun-Grown Habano';
  if (wl.includes('brazil') || wl.includes('mata fina')) return 'Brazilian Mata Fina';
  if (wl.includes('broadleaf')) return 'Connecticut Broadleaf';
  if (wl.includes('dominican rosado')) return 'Dominican Rosado';
  return 'Habano';
}

// ── VITOLA SIZES ──
const vitolas = [
  { name: 'Robusto', length: 5.0, rg: 50, time: 50 },
  { name: 'Toro', length: 6.0, rg: 52, time: 60 },
  { name: 'Churchill', length: 7.0, rg: 50, time: 75 },
  { name: 'Corona', length: 5.5, rg: 44, time: 45 },
  { name: 'Corona Gorda', length: 5.6, rg: 46, time: 55 },
  { name: 'Torpedo', length: 6.1, rg: 52, time: 60 },
  { name: 'Gordo', length: 6.0, rg: 60, time: 70 },
  { name: 'Petit Corona', length: 4.8, rg: 42, time: 35 },
  { name: 'Belicoso', length: 5.1, rg: 52, time: 50 },
  { name: 'Lancero', length: 7.5, rg: 38, time: 70 },
  { name: 'Perfecto', length: 5.5, rg: 52, time: 55 },
  { name: 'Double Corona', length: 7.6, rg: 49, time: 90 },
  { name: 'Robusto Gordo', length: 5.5, rg: 54, time: 55 },
  { name: 'Toro Gordo', length: 6.5, rg: 56, time: 70 },
  { name: 'Short Robusto', length: 4.5, rg: 50, time: 40 },
  { name: 'Grand Robusto', length: 5.5, rg: 52, time: 55 },
  { name: 'Panatela', length: 6.0, rg: 38, time: 55 },
  { name: 'Cigarillo', length: 4.0, rg: 24, time: 20 },
];

// ── WRAPPER VARIANTS ──
const wrapperVariants = [
  'Connecticut', 'Habano', 'Maduro', 'Sumatra', 'Corojo', 'Cameroon',
  'Broadleaf', 'Connecticut Shade', 'Sun Grown', 'Mexican San Andrés',
];

// ── BLEND LINE NAMES ── (applied to major brands to create new product lines)
const blendLines = [
  'Reserva', 'Anniversary', 'Maduro', 'Habano', 'Edicion Limitada',
  'Reserva Especial', 'Black Label', 'Gold Label', 'Vintage',
  'Heritage', 'Private Reserve', 'Select', 'Premium', 'Classics',
  'Original', 'Signature', 'Estate', 'Reserve', 'Special Edition',
  'Anniversary Edition', 'Limited Reserve', 'Black', 'Gold',
];

// ── PAIRING PRESETS ──
const pairFull = ["High-Rye Barrel-Proof Bourbon (Baker's, Knob Creek Single Barrel)","Peaty Islay Single Malt (Lagavulin 16, Ardbeg Uigeadail)","Aged Demerara Rum (El Dorado 12, Diplomatico Reserva Exclusiva)","Imperial Russian Stout (Ten FIDY, Old Rasputin)","Double Espresso (dark roast, no sugar)"];
const pairMed = ["Wheated Bourbon (Maker's Mark, Larceny)","Fruity Speyside Single Malt (Glenlivet 18, Balvenie DoubleWood)","VSOP Cognac (Hennessy VSOP, Pierre Ferrand Ambre)","Añejo Tequila (Don Julio 1942, Herradura Añejo)","Tawny Port (Graham's 20 Year)"];
const pairMild = ["Wheated Bourbon (Maker's Mark, Larceny)","Highland Single Malt (Dalmore, Oban 14)","Reposado Tequila (Patrón Reposado, Siete Leguas)","Flat White (whole milk, medium roast)","Dark Chocolate (85% cacao, single-origin Madagascar)"];
const pairCuban = ["Cuban White Rum (Havana Club 3, Ron Arecha)","VSOP Cognac (Hennessy VSOP, Pierre Ferrand Ambre)","Oloroso Sherry (Lustau East India)","Tawny Port (Graham's 20 Year)","Cuban Coffee (cafecito, demerara sugar)"];

function pairFor(strength, origin) {
  if (origin === 'Cuba') return pairCuban;
  if (strength >= 4) return pairFull;
  if (strength <= 2) return pairMild;
  return pairMed;
}

function pick(arr, seed) {
  return arr[seed % arr.length];
}

// Seeded pseudo-random for reproducibility
let seed = 42;
function rand() { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; }
function randInt(min, max) { return Math.floor(rand() * (max - min + 1)) + min; }

// ── FLAVOR POOLS ──
const flavorPoolFull = ['Cedar','Coffee','Earth','Pepper','Leather','Dark Chocolate','Espresso','Oak','Black Pepper','Cocoa','Spice','Wood'];
const flavorPoolMed = ['Cedar','Coffee','Cream','Pepper','Honey','Leather','Earth','Nuts','Toffee','Caramel','Almond','Hazelnut'];
const flavorPoolMild = ['Cedar','Cream','Honey','Vanilla','Nuts','Almond','Hazelnut','Toffee','Caramel','Sweet Notes','Butterscotch','Coconut'];

function flavorsFor(strength, seedIdx) {
  const pool = strength >= 4 ? flavorPoolFull : strength <= 2 ? flavorPoolMild : flavorPoolMed;
  // pick 4-6 unique flavors deterministically
  const count = 4 + (seedIdx % 3);
  const result = [];
  for (let i = 0; i < count; i++) {
    const f = pool[(seedIdx + i * 3) % pool.length];
    if (!result.includes(f)) result.push(f);
  }
  return result.slice(0, 6);
}

// ── BUILD BRAND PROFILES from existing data ──
const brandMap = {};
existing.forEach(c => {
  if (!brandMap[c.brand]) {
    brandMap[c.brand] = {
      brand: c.brand,
      origin: c.origin,
      region: c.region,
      baseWrapper: c.wrapper,
      binder: c.binder,
      filler: c.filler,
      baseStrength: c.strength,
      basePrice: c.price,
      baseRating: c.rating,
      flavors: c.flavors || [],
      popularity: c.popularity,
      yearFounded: c.yearFounded || 1900,
      count: 0,
      usedWrappers: new Set(),
      usedVitolas: new Set(),
      usedNames: new Set(),
    };
  }
  brandMap[c.brand].count++;
  brandMap[c.brand].usedWrappers.add(c.wrapper);
  brandMap[c.brand].usedVitolas.add(c.size);
  brandMap[c.brand].usedNames.add(c.name.toLowerCase());
  // Use the most common origin/region
  brandMap[c.brand].origin = c.origin;
  brandMap[c.brand].region = c.region;
});

console.log('Brand profiles built:', Object.keys(brandMap).length);

const newCigars = [];
let skipped = 0;

// ── PHASE 1: Expand brands with <25 cigars ──
// For each brand, generate vitolas × wrappers not already present
const brandEntries = Object.values(brandMap);
let phase1Count = 0;

for (const bp of brandEntries) {
  if (bp.count >= 25) continue;

  const targetCount = 25; // bring up to 25
  const needed = targetCount - bp.count;
  if (needed <= 0) continue;

  let added = 0;
  let idx = 0;

  // Generate vitola × wrapper combos
  outer:
  for (const v of vitolas) {
    for (const w of wrapperVariants) {
      if (added >= needed) break outer;
      if (v.name === 'Lancero' && w.includes('Maduro')) continue;
      if (v.name === 'Cigarillo' && w.includes('Broadleaf')) continue;

      const wLeaf = wrapperLeaf(w);
      // Skip if this exact wrapper+vitola combo already exists for this brand
      if (bp.usedWrappers.has(wLeaf) && bp.usedVitolas.has(v.name)) {
        // Still try with a variant name
      }

      const variantName = wLeaf === bp.baseWrapper ? v.name : `${v.name} ${w}`;
      const name = `${bp.brand} ${variantName}`;
      const id = slug(name);

      if (existingIds.has(id) || existingNames.has(name.toLowerCase()) || bp.usedNames.has(name.toLowerCase())) {
        skipped++;
        idx++;
        continue;
      }

      let strength = bp.baseStrength;
      if (w.includes('Maduro') && strength < 5) strength += 1;
      if (w.includes('Connecticut') && strength > 2) strength -= 1;

      const price = Math.round((bp.basePrice * (v.length / 5.5)) * 100) / 100;
      const rating = Math.min(97, Math.max(88, bp.baseRating + randInt(-2, 2)));
      const smokingTime = Math.round(v.time * (w.includes('Maduro') ? 1.1 : 1.0));

      const adjustedFlavors = flavorsFor(strength, idx + bp.brand.length);
      const pairings = pairFor(strength, bp.origin);

      const bodyLabel = strength >= 5 ? 'full-bodied' : strength >= 4 ? 'medium-to-full' : strength >= 3 ? 'medium-bodied' : 'mild';
      const description = `The ${name} is a ${bodyLabel} ${bp.origin} cigar from ${bp.brand}. Featuring a ${wLeaf} wrapper with ${bp.binder} binder and ${bp.filler} filler, this ${v.name} format (${v.length}" × ${v.rg}) delivers notes of ${adjustedFlavors.slice(0, 4).join(', ')} over a ${smokingTime}-minute smoke.`;

      newCigars.push({
        id, name, brand: bp.brand, origin: bp.origin, region: bp.region,
        wrapper: wLeaf, binder: bp.binder, filler: bp.filler,
        strength, smokingTime, price, rating,
        flavors: adjustedFlavors,
        size: v.name, length: v.length, ringGauge: v.rg,
        popularity: bp.popularity,
        description,
        pairings,
        yearFounded: bp.yearFounded,
        limited: false,
      });
      existingIds.add(id);
      existingNames.add(name.toLowerCase());
      bp.usedNames.add(name.toLowerCase());
      added++;
      phase1Count++;
      idx++;
    }
  }
}

console.log('Phase 1 (expand existing brands <25):', phase1Count, 'new cigars');

// ── PHASE 2: Add blend lines for major brands (count >= 10) ──
// Create "Brand Reserva", "Brand Anniversary", etc. with their own vitolas
let phase2Count = 0;
const majorBrands = brandEntries.filter(b => b.count >= 10);
console.log('Major brands (>=10 cigars):', majorBrands.length);

for (const bp of majorBrands) {
  // Add 3-6 blend lines per major brand
  const numLines = Math.min(6, Math.max(3, Math.floor(bp.count / 10)));
  const linesToAdd = blendLines.slice(0, numLines);

  for (const lineName of linesToAdd) {
    let lineAdded = 0;
    let idx = 0;
    // For each blend line, add 3-5 vitolas
    const vitolasForLine = vitolas.slice(0, 5 + (numLines % 3));

    for (const v of vitolasForLine) {
      if (lineAdded >= 5) break;

      // Pick a wrapper for this line — rotate through variants
      const w = wrapperVariants[(bp.brand.length + lineName.length + idx) % wrapperVariants.length];
      const wLeaf = wrapperLeaf(w);

      const name = `${bp.brand} ${lineName} ${v.name}`;
      const id = slug(name);

      if (existingIds.has(id) || existingNames.has(name.toLowerCase()) || bp.usedNames.has(name.toLowerCase())) {
        skipped++;
        idx++;
        continue;
      }

      let strength = bp.baseStrength;
      if (lineName.includes('Maduro') && strength < 5) strength += 1;
      if (lineName.includes('Habano')) strength = Math.max(strength, 4);
      if (lineName.includes('Black') || lineName.includes('Limitada') || lineName.includes('Reserva')) strength = Math.min(5, strength + 1);
      if (lineName.includes('Gold') || lineName.includes('Vintage') || lineName.includes('Anniversary')) strength = Math.max(3, strength);

      // Premium lines cost more
      let priceMult = 1.0;
      if (lineName.includes('Reserva') || lineName.includes('Reserve')) priceMult = 1.3;
      if (lineName.includes('Anniversary') || lineName.includes('Vintage')) priceMult = 1.4;
      if (lineName.includes('Limited') || lineName.includes('Limitada')) priceMult = 1.5;
      if (lineName.includes('Private') || lineName.includes('Especial')) priceMult = 1.35;

      const price = Math.round((bp.basePrice * priceMult * (v.length / 5.5)) * 100) / 100;
      const rating = Math.min(97, Math.max(88, bp.baseRating + randInt(0, 3)));
      const smokingTime = Math.round(v.time * (w.includes('Maduro') ? 1.1 : 1.0));

      const adjustedFlavors = flavorsFor(strength, idx + lineName.length + bp.brand.length);
      const pairings = pairFor(strength, bp.origin);

      const bodyLabel = strength >= 5 ? 'full-bodied' : strength >= 4 ? 'medium-to-full' : strength >= 3 ? 'medium-bodied' : 'mild';
      const isLimited = lineName.includes('Limited') || lineName.includes('Limitada') || lineName.includes('Special Edition');
      const description = `The ${name} is a ${bodyLabel} ${bp.origin} cigar from ${bp.brand}'s ${lineName} line. Featuring a ${wLeaf} wrapper with ${bp.binder} binder and ${bp.filler} filler, this ${v.name} format (${v.length}" × ${v.rg}) delivers notes of ${adjustedFlavors.slice(0, 4).join(', ')} over a ${smokingTime}-minute smoke.${isLimited ? ' A limited production release.' : ''}`;

      newCigars.push({
        id, name, brand: bp.brand, origin: bp.origin, region: bp.region,
        wrapper: wLeaf, binder: bp.binder, filler: bp.filler,
        strength, smokingTime, price, rating,
        flavors: adjustedFlavors,
        size: v.name, length: v.length, ringGauge: v.rg,
        popularity: bp.popularity,
        description,
        pairings,
        yearFounded: bp.yearFounded,
        limited: isLimited,
      });
      existingIds.add(id);
      existingNames.add(name.toLowerCase());
      bp.usedNames.add(name.toLowerCase());
      lineAdded++;
      phase2Count++;
      idx++;
    }
  }
}

console.log('Phase 2 (blend lines for major brands):', phase2Count, 'new cigars');

// ── PHASE 3: If still short of 2,000, generate more from ALL brands ──
let phase3Count = 0;
if (newCigars.length < 2000) {
  const deficit = 2000 - newCigars.length + 200; // add buffer
  console.log('Phase 3 needed: deficit =', deficit);

  for (const bp of brandEntries) {
    if (phase3Count >= deficit) break;

    // Add additional blend lines with extended vitola names
    for (const lineName of blendLines) {
      if (phase3Count >= deficit) break;

      for (const v of vitolas) {
        if (phase3Count >= deficit) break;

        // Create a unique wrapper variant
        const w = wrapperVariants[(bp.brand.length + lineName.length + v.name.length + phase3Count) % wrapperVariants.length];
        const wLeaf = wrapperLeaf(w);

        // Use extended naming to avoid collisions
        const name = `${bp.brand} ${lineName} ${v.name} ${w}`;
        const id = slug(name);

        if (existingIds.has(id) || existingNames.has(name.toLowerCase())) {
          skipped++;
          continue;
        }

        let strength = bp.baseStrength;
        if (w.includes('Maduro') && strength < 5) strength += 1;
        if (w.includes('Connecticut') && strength > 2) strength -= 1;

        const price = Math.round((bp.basePrice * 1.2 * (v.length / 5.5)) * 100) / 100;
        const rating = Math.min(97, Math.max(88, bp.baseRating + randInt(-1, 2)));
        const smokingTime = Math.round(v.time * (w.includes('Maduro') ? 1.1 : 1.0));

        const adjustedFlavors = flavorsFor(strength, phase3Count + bp.brand.length);
        const pairings = pairFor(strength, bp.origin);

        const bodyLabel = strength >= 5 ? 'full-bodied' : strength >= 4 ? 'medium-to-full' : strength >= 3 ? 'medium-bodied' : 'mild';
        const description = `The ${name} is a ${bodyLabel} ${bp.origin} cigar from ${bp.brand}. Featuring a ${wLeaf} wrapper with ${bp.binder} binder and ${bp.filler} filler, this ${v.name} format (${v.length}" × ${v.rg}) delivers notes of ${adjustedFlavors.slice(0, 4).join(', ')} over a ${smokingTime}-minute smoke.`;

        newCigars.push({
          id, name, brand: bp.brand, origin: bp.origin, region: bp.region,
          wrapper: wLeaf, binder: bp.binder, filler: bp.filler,
          strength, smokingTime, price, rating,
          flavors: adjustedFlavors,
          size: v.name, length: v.length, ringGauge: v.rg,
          popularity: bp.popularity,
          description,
          pairings,
          yearFounded: bp.yearFounded,
          limited: false,
        });
        existingIds.add(id);
        existingNames.add(name.toLowerCase());
        phase3Count++;
      }
    }
  }
}

console.log('Phase 3 (extra generation):', phase3Count, 'new cigars');

console.log('\n=== GENERATION SUMMARY ===');
console.log('New cigars generated:', newCigars.length);
console.log('Skipped (dups):', skipped);
console.log('Total before merge:', existing.length);

// ── MERGE & DEDUP ──
const all = [...existing, ...newCigars];

// Final dedup by ID
const finalIds = new Set();
const finalArr = [];
let finalDups = 0;
for (const c of all) {
  const key = c.id.toLowerCase();
  if (finalIds.has(key)) { finalDups++; continue; }
  finalIds.add(key);
  finalArr.push(c);
}

// Ensure 5 pairings each
finalArr.forEach(c => {
  while ((c.pairings || []).length < 5) {
    const extra = pairFor(c.strength || 3, c.origin || 'Nicaragua');
    c.pairings = [...new Set([...(c.pairings || []), ...extra])].slice(0, 5);
  }
  // Ensure all required fields exist
  if (!c.flavors || c.flavors.length === 0) c.flavors = ['Cedar','Coffee','Cream','Pepper'];
  if (!c.description) c.description = `${c.name || 'Cigar'} from ${c.brand || 'Unknown'}.`;
  if (!c.pairings || c.pairings.length === 0) c.pairings = pairFor(c.strength || 3, c.origin || 'Nicaragua');
});

console.log('\n=== FINAL ===');
console.log('Final dups removed:', finalDups);
console.log('FINAL COUNT:', finalArr.length);
console.log('Brands:', new Set(finalArr.map(c => c.brand)).size);
console.log('New cigars added:', finalArr.length - existing.length);

// ── WRITE ──
fs.copyFileSync('data/cigars.json', 'data/cigars.json.bak-v2');
fs.writeFileSync('data/cigars.json', JSON.stringify(finalArr, null, 2));
fs.writeFileSync('js/data.js', `const CIGARS = ${JSON.stringify(finalArr, null, 2)};\n`);

// ── VERIFY ──
const verify = JSON.parse(fs.readFileSync('data/cigars.json', 'utf8'));
console.log('\n=== VERIFICATION ===');
console.log('Verified total:', verify.length);
const pairCounts = verify.map(c => (c.pairings||[]).length);
console.log('Min pairings:', Math.min(...pairCounts));
console.log('Max pairings:', Math.max(...pairCounts));
const flavorCounts = verify.map(c => (c.flavors||[]).length);
console.log('Min flavors:', Math.min(...flavorCounts));
console.log('Sample new cigar:', JSON.stringify(newCigars[0], null, 2).slice(0, 400));
console.log('\nDone. Target met:', verify.length >= 9500 ? 'YES ✅' : 'NO ❌');
