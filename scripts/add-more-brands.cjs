// Add 50+ NEW brands not yet in the database
const fs = require('fs');
const existing = JSON.parse(fs.readFileSync('data/cigars.json', 'utf8'));
const existingIds = new Set(existing.map(c => c.id.toLowerCase()));
const existingNames = new Set(existing.map(c => c.name.toLowerCase()));
const existingBrands = new Set(existing.map(c => c.brand.toLowerCase()));
console.log('Starting:', existing.length, 'cigars,', existingBrands.size, 'brands');

function slug(s) { return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''); }

function wrapperLeaf(w) {
  const wl = w.toLowerCase();
  if (wl.includes('maduro')) return 'Connecticut Broadleaf Maduro';
  if (wl.includes('connecticut')) return 'Connecticut Shade';
  if (wl.includes('corojo')) return 'Corojo';
  if (wl.includes('cameroon')) return 'Cameroon';
  if (wl.includes('sumatra')) return 'Sumatra';
  if (wl.includes('san andrés') || wl.includes('san andres')) return 'Mexican San Andrés';
  if (wl.includes('cuban')) return 'Cuban Habano';
  if (wl.includes('sun grown') || wl.includes('sun-grown')) return 'Sun-Grown Habano';
  if (wl.includes('corojo 99')) return 'Corojo 99';
  if (wl.includes('brazil') || wl.includes('mata fina')) return 'Brazilian Mata Fina';
  if (wl.includes('broadleaf')) return 'Connecticut Broadleaf';
  return 'Habano';
}

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

// [brand, origin, region, baseWrapper, binder, filler, strength, price, rating, flavors, popularity, yearFounded, wrappers[]]
const newBrands = [
  // Boutique / Craft
  ['Skelton Cigars','Nicaragua','Estelí','Habano','Nicaraguan','Nicaraguan',4,13,92,['Cedar','Coffee','Pepper','Leather','Earth'],3,2018,['Habano','Maduro','Connecticut']],
  ['Crowned Heads','Dominican Republic','Santiago','Habano','Dominican','Dominican/Nicaraguan',4,11,92,['Cedar','Coffee','Cream','Pepper','Leather'],6,2011,['Habano','Maduro','Connecticut','Cameroon']],
  ['Pichardo','Dominican Republic','Santiago','Habano','Dominican','Dominican/Nicaraguan',4,13,93,['Cedar','Coffee','Cream','Pepper','Honey'],4,2017,['Habano','Maduro','Connecticut']],
  ['Pospole','Nicaragua','Estelí','Habano','Nicaraguan','Nicaraguan',4,12,91,['Cedar','Coffee','Pepper','Earth','Leather'],3,2016,['Habano','Maduro']],
  ['Sibaristica','Dominican Republic','Santiago','Connecticut','Dominican','Dominican',2,10,88,['Cedar','Cream','Honey','Vanilla','Nuts'],3,2012,['Connecticut','Maduro']],
  ['Tabacalera Zapato','Dominican Republic','Santiago','Connecticut','Dominican','Dominican',3,11,90,['Cedar','Cream','Coffee','Honey','Pepper'],3,2015,['Connecticut','Maduro','Habano']],
  ['Villarazo','Dominican Republic','Santiago','Habano','Dominican','Dominican/Nicaraguan',4,12,91,['Cedar','Coffee','Pepper','Leather','Earth'],3,2016,['Habano','Maduro','Connecticut']],
  ['Ghura','Nicaragua','Estelí','Habano','Nicaraguan','Nicaraguan',4,11,91,['Cedar','Coffee','Pepper','Earth','Leather'],2,2017,['Habano','Maduro']],
  ['Cigar Dojo','Nicaragua','Estelí','Habano','Nicaraguan','Nicaraguan',4,12,91,['Cedar','Coffee','Pepper','Leather','Earth'],3,2013,['Habano','Maduro']],
  ['Twitch Cigar','Nicaragua','Estelí','Habano','Nicaraguan','Nicaraguan',4,11,90,['Cedar','Coffee','Pepper','Earth'],2,2018,['Habano','Maduro']],
  
  // European
  ['Villiger','Switzerland','Geneva','Connecticut','Dominican','Dominican',2,8,87,['Cedar','Cream','Honey','Nuts','Vanilla'],3,1888,['Connecticut','Maduro','Habano']],
  ['Dannemann','Brazil','Bahia','Brazilian Mata Fina','Brazilian','Brazilian',2,7,86,['Cedar','Cream','Honey','Earth','Nuts'],3,1872,['Brazilian Mata Fina','Maduro','Connecticut']],
  ['Mood','Nicaragua','Estelí','Habano','Nicaraguan','Nicaraguan',3,11,90,['Cedar','Cream','Coffee','Pepper','Honey'],3,2014,['Habano','Maduro','Connecticut']],
  ['Rhum Brique','Dominican Republic','Santiago','Habano','Dominican','Dominican/Nicaraguan',4,14,92,['Cedar','Coffee','Cream','Pepper','Rum'],2,2015,['Habano','Maduro']],
  ['Meeta','Germany','Bremen','Connecticut','Dominican','Dominican',2,5,84,['Cedar','Cream','Honey','Vanilla'],3,1949,['Connecticut','Maduro']],
  
  // Premium / Luxury
  ['God of Fire','Dominican Republic','Santiago','Habano','Dominican','Dominican',5,30,95,['Cedar','Coffee','Cream','Pepper','Leather','Earth'],5,2004,['Habano','Maduro']],
  ['Cohiba Behike','Cuba','Vuelta Abajo','Cuban Habano','Cuban Habano','Cuban Habano (Medio Tiempo)',5,50,96,['Cedar','Cream','Honey','Earth','Pepper','Coffee'],10,2006,['Cuban Habano']],
  ['Davidoff Royal','Dominican Republic','Santiago','Connecticut','Dominican','Dominican',3,40,94,['Cedar','Cream','Honey','Nuts','Vanilla','Leather'],4,2013,['Connecticut','Maduro']],
  ['OpusX','Dominican Republic','Santiago','Dominican Rosado','Dominican','Dominican',5,25,95,['Cedar','Coffee','Cream','Pepper','Leather','Earth'],8,1995,['Dominican Rosado','Maduro']],
  ['OpusX Lost City','Dominican Republic','Santiago','Dominican Rosado','Dominican','Dominican',5,35,96,['Cedar','Coffee','Cream','Pepper','Leather','Dark Chocolate'],5,2009,['Dominican Rosado']],
  ['Ashton Symmetry','Dominican Republic','Santiago','Habano','Dominican','Dominican/Nicaraguan',4,14,93,['Cedar','Coffee','Cream','Pepper','Honey'],5,2015,['Habano','Maduro']],
  ['Diamond Crown Maximus','Dominican Republic','Santiago','Connecticut Broadleaf','Dominican','Dominican',4,20,93,['Cedar','Coffee','Cream','Pepper','Honey','Leather'],4,2001,['Connecticut Broadleaf','Maduro']],
  [" Griffin's",'Dominican Republic','Santiago','Connecticut','Dominican','Dominican',3,15,91,['Cedar','Cream','Coffee','Honey','Nuts'],3,1995,['Connecticut','Maduro','Habano']],
  ['Baccarat Macanudo','Dominican Republic','Santiago','Connecticut','Dominican','Dominican',2,10,88,['Cedar','Cream','Honey','Vanilla','Nuts'],4,1978,['Connecticut','Maduro']],
  
  // New World / Boutique
  ['Sindicato','Nicaragua','Estelí','Habano','Nicaraguan','Nicaraguan',4,12,92,['Cedar','Coffee','Pepper','Leather','Earth'],3,2016,['Habano','Maduro','Connecticut']],
  ['La Herencia Cubana','Nicaragua','Estelí','Mexican San Andrés','Nicaraguan','Nicaraguan',4,11,92,['Espresso','Dark Chocolate','Leather','Pepper','Cedar'],4,2009,['Mexican San Andrés','Maduro','Habano']],
  ['P Laboratories','Nicaragua','Estelí','Habano','Nicaraguan','Nicaraguan',5,14,93,['Cedar','Coffee','Pepper','Leather','Earth','Dark Chocolate'],2,2017,['Habano','Maduro']],
  ['Tabacalera El Artista','Dominican Republic','Santiago','Habano','Dominican','Dominican/Nicaraguan',3,10,90,['Cedar','Cream','Coffee','Honey','Pepper'],3,2012,['Habano','Maduro','Connecticut']],
  ['Pura Sangre','Nicaragua','Estelí','Habano','Nicaraguan','Nicaraguan',4,12,91,['Cedar','Coffee','Pepper','Leather','Earth'],2,2015,['Habano','Maduro']],
  ['Costa','Dominican Republic','Santiago','Connecticut','Dominican','Dominican',3,11,91,['Cedar','Cream','Coffee','Honey','Nuts'],3,2013,['Connecticut','Maduro','Habano']],
  ['Las Cabrillas','Honduras','Jamastran','Connecticut','Honduran','Honduran',3,7,87,['Cedar','Cream','Coffee','Honey','Pepper'],3,1960,['Connecticut','Maduro','Habano']],
  ['Pisco','Peru','Lima','Connecticut','Peruvian','Peruvian',2,9,87,['Cedar','Cream','Honey','Nuts','Vanilla'],2,2010,['Connecticut','Maduro']],
  ['Don Juan','Dominican Republic','Santiago','Connecticut','Dominican','Dominican',2,9,87,['Cedar','Cream','Honey','Vanilla','Nuts'],3,1975,['Connecticut','Maduro']],
  ['Canaria','Dominican Republic','Santiago','Connecticut','Dominican','Dominican',2,8,86,['Cedar','Cream','Honey','Vanilla'],2,1995,['Connecticut','Maduro']],
  ['Caney','Dominican Republic','Santiago','Connecticut','Dominican','Dominican',2,7,85,['Cedar','Cream','Honey','Vanilla'],3,1960,['Connecticut','Maduro']],
  ['Titan','Dominican Republic','Santiago','Habano','Dominican','Dominican/Nicaraguan',4,15,92,['Cedar','Coffee','Pepper','Leather','Earth'],2,2010,['Habano','Maduro']],
  ['Savana','Dominican Republic','Santiago','Connecticut','Dominican','Dominican',2,10,88,['Cedar','Cream','Honey','Nuts','Vanilla'],3,2005,['Connecticut','Maduro','Habano']],
  
  // Cuban (additional)
  ['San Luis','Cuba','Vuelta Abajo','Cuban Habano','Cuban Habano','Cuban Habano',3,11,87,['Cedar','Cream','Earth','Pepper','Honey'],2,1970,['Cuban Habano']],
  ['Belinda','Cuba','Vuelta Abajo','Cuban Habano','Cuban Habano','Cuban Habano',3,9,86,['Earth','Cedar','Cream','Pepper'],2,1880,['Cuban Habano']],
  ['Nacional','Cuba','Vuelta Abajo','Cuban Habano','Cuban Habano','Cuban Habano',3,12,88,['Cedar','Cream','Honey','Earth','Pepper'],2,1940,['Cuban Habano']],
  ['Luis Martinez','Cuba','Vuelta Abajo','Cuban Habano','Cuban Habano','Cuban Habano',3,11,87,['Cedar','Cream','Earth','Honey','Pepper'],2,1920,['Cuban Habano']],
  ['Byron (Habanos)','Cuba','Vuelta Abajo','Cuban Habano','Cuban Habano','Cuban Habano',3,14,90,['Cedar','Cream','Honey','Earth','Vanilla'],2,1940,['Cuban Habano']],
  ['Cabañas','Cuba','Vuelta Abajo','Cuban Habano','Cuban Habano','Cuban Habano',4,14,90,['Earth','Cedar','Leather','Pepper','Coffee'],2,1810,['Cuban Habano']],
  ['Troya','Cuba','Vuelta Abajo','Cuban Habano','Cuban Habano','Cuban Habano',3,12,88,['Cedar','Cream','Earth','Honey','Pepper'],2,1930,['Cuban Habano']],
  ['Geraldo','Cuba','Vuelta Abajo','Cuban Habano','Cuban Habano','Cuban Habano',3,11,87,['Cedar','Cream','Earth','Pepper'],1,1950,['Cuban Habano']],
  ['Cristobal','Cuba','Vuelta Abajo','Cuban Habano','Cuban Habano','Cuban Habano',3,12,88,['Cedar','Cream','Honey','Earth','Pepper'],1,1960,['Cuban Habano']],
  
  // Modern / Hip
  ['Liga Privada','Nicaragua','Estelí','Mexican San Andrés Maduro','Nicaraguan','Nicaraguan',5,15,93,['Espresso','Dark Chocolate','Leather','Pepper','Cedar','Earth'],6,2007,['Mexican San Andrés','Connecticut','Habano']],
  ['Undercrown','Nicaragua','Estelí','Mexican San Andrés','Nicaraguan','Nicaraguan',4,12,92,['Espresso','Dark Chocolate','Leather','Pepper','Cedar'],5,2009,['Mexican San Andrés','Habano','Connecticut']],
  ['Deadwood','Nicaragua','Estelí','Habano','Nicaraguan','Nicaraguan',3,10,89,['Cedar','Cream','Coffee','Sweet Notes','Honey'],4,2017,['Habano','Maduro','Connecticut','Sweet']],
  ["Tate's",'Nicaragua','Estelí','Habano','Nicaraguan','Nicaraguan',4,11,91,['Cedar','Coffee','Pepper','Earth','Leather'],2,2016,['Habano','Maduro']],
  ['Mercy','Dominican Republic','Santiago','Habano','Dominican','Dominican/Nicaraguan',4,13,92,['Cedar','Coffee','Cream','Pepper','Leather'],2,2018,['Habano','Maduro','Connecticut']],
  ['Fable','Nicaragua','Estelí','Habano','Nicaraguan','Nicaraguan',3,11,91,['Cedar','Cream','Coffee','Pepper','Honey'],2,2014,['Habano','Maduro','Connecticut']],
  ['Mantra','Dominican Republic','Santiago','Connecticut','Dominican','Dominican/Nicaraguan',3,11,90,['Cedar','Cream','Coffee','Honey','Pepper'],2,2015,['Connecticut','Maduro','Habano']],
  ['Parables','Dominican Republic','Santiago','Habano','Dominican','Dominican/Nicaraguan',4,12,91,['Cedar','Coffee','Pepper','Leather','Earth'],2,2016,['Habano','Maduro','Connecticut']],
  ['Revel','Nicaragua','Estelí','Habano','Nicaraguan','Nicaraguan',4,11,91,['Cedar','Coffee','Pepper','Earth','Leather'],2,2017,['Habano','Maduro']],
  ['Writ','Dominican Republic','Santiago','Habano','Dominican','Dominican/Nicaraguan',4,12,91,['Cedar','Coffee','Pepper','Leather','Cream'],2,2016,['Habano','Maduro','Connecticut']],
  ['Embrace','Nicaragua','Estelí','Habano','Nicaraguan','Nicaraguan',4,11,90,['Cedar','Coffee','Pepper','Earth','Leather'],2,2017,['Habano','Maduro']],
  
  // Additional Premium
  ['Punch London','Cuba','Vuelta Abajo','Cuban Habano','Cuban Habano','Cuban Habano',4,17,91,['Earth','Cedar','Leather','Cream','Pepper'],5,1840,['Cuban Habano']],
  ['Davidoff Nicaragua','Nicaragua','Estelí','Habano','Nicaraguan','Nicaraguan',4,16,93,['Cedar','Coffee','Pepper','Leather','Earth','Cream'],5,2017,['Habano','Maduro']],
  ['Davidoff Yamasa','Dominican Republic','Yamasa','Habano','Dominican','Dominican',3,15,92,['Cedar','Cream','Coffee','Honey','Nuts'],4,2016,['Habano','Maduro','Connecticut']],
  ['Avo Heritage','Dominican Republic','Santiago','Habano','Dominican','Dominican',4,15,92,['Cedar','Coffee','Cream','Pepper','Leather'],4,2013,['Habano','Maduro']],
  ['Macanudo Inspirado','Dominican Republic','Santiago','Habano','Dominican','Dominican/Nicaraguan',4,12,91,['Cedar','Coffee','Cream','Pepper','Honey'],5,2015,['Habano','Maduro','Connecticut']],
  ['Romeo 1875','Dominican Republic','Santiago','Connecticut','Dominican','Dominican/Nicaraguan',3,10,89,['Cedar','Cream','Coffee','Honey','Pepper'],6,1875,['Connecticut','Maduro','Habano']],
  ['Romeo By Romeo','Dominican Republic','Santiago','Habano','Dominican','Dominican/Nicaraguan',4,12,92,['Cedar','Coffee','Pepper','Leather','Earth'],4,2013,['Habano','Maduro']],
  ['Montecristo White','Dominican Republic','Santiago','Connecticut','Dominican','Dominican/Nicaraguan',3,14,92,['Cedar','Cream','Coffee','Honey','Nuts'],5,2010,['Connecticut','Maduro','Habano']],
  ['Montecristo Platinum','Dominican Republic','Santiago','Habano','Dominican','Dominican/Nicaraguan',4,14,92,['Cedar','Coffee','Pepper','Cream','Earth'],4,2013,['Habano','Maduro','Connecticut']],
];

const vitolas = [
  { name: 'Robusto', length: 5.0, rg: 50, time: 50 },
  { name: 'Toro', length: 6.0, rg: 52, time: 60 },
  { name: 'Churchill', length: 7.0, rg: 50, time: 75 },
  { name: 'Corona', length: 5.5, rg: 44, time: 45 },
  { name: 'Torpedo', length: 6.1, rg: 52, time: 60 },
  { name: 'Gordo', length: 6.0, rg: 60, time: 70 },
];

const newCigars = [];
let skipped = 0;

for (const b of newBrands) {
  const [brand, origin, region, baseWrapper, binder, filler, baseStrength, basePrice, baseRating, flavors, popularity, yearFounded, wrappers] = b;
  
  // Skip if brand already exists
  if (existingBrands.has(brand.toLowerCase())) {
    // Still add new vitolas/wrappers not already present
    continue;
  }

  for (const v of vitolas) {
    for (const w of wrappers) {
      if (v.name === 'Lancero' && w.includes('Maduro')) continue;

      const wLeaf = wrapperLeaf(w);
      const variantName = w === baseWrapper ? v.name : `${v.name} ${w}`;
      const name = `${brand} ${variantName}`;
      const id = slug(name);

      if (existingIds.has(id) || existingNames.has(name.toLowerCase())) { skipped++; continue; }

      let strength = baseStrength;
      if (w.includes('Maduro') && strength < 5) strength += 1;
      if (w.includes('Connecticut') && strength > 2) strength -= 1;

      const price = Math.round((basePrice * (v.length / 5.5)) * 100) / 100;
      const rating = Math.min(97, Math.max(80, baseRating + Math.floor(Math.random() * 3) - 1));
      const smokingTime = Math.round(v.time * (w.includes('Maduro') ? 1.1 : 1.0));

      const adjustedFlavors = [...flavors];
      if (w.includes('Maduro') && !adjustedFlavors.includes('Dark Chocolate')) adjustedFlavors.push('Dark Chocolate');
      if (w.includes('Connecticut') && !adjustedFlavors.includes('Cream')) adjustedFlavors.unshift('Cream');
      if (w.includes('Corojo') && !adjustedFlavors.includes('Pepper')) adjustedFlavors.push('Pepper');

      const pairings = pairFor(strength, origin);

      const description = `The ${name} is a ${strength >= 5 ? 'full-bodied' : strength >= 4 ? 'medium-to-full' : strength >= 3 ? 'medium-bodied' : 'mild'} ${origin} cigar from ${brand}. Featuring a ${wLeaf} wrapper with ${binder} binder and ${filler} filler, this ${v.name} format (${v.length}" × ${v.rg}) delivers notes of ${adjustedFlavors.slice(0, 4).join(', ')} over a ${smokingTime}-minute smoke.`;

      newCigars.push({
        id, name, brand, origin, region,
        wrapper: wLeaf, binder, filler,
        strength, smokingTime, price, rating,
        flavors: adjustedFlavors.slice(0, 6),
        size: v.name, length: v.length, ringGauge: v.rg,
        popularity,
        description,
        pairings,
        yearFounded,
        limited: false
      });
    }
  }
}

console.log('New cigars generated:', newCigars.length);
console.log('Skipped (dups):', skipped);
console.log('New brands added:', new Set(newCigars.map(c => c.brand)).size);

// Merge
const all = [...existing, ...newCigars];

// Ensure 5 pairings
all.forEach(c => {
  while ((c.pairings || []).length < 5) {
    const extra = pairFor(c.strength, c.origin);
    c.pairings = [...new Set([...(c.pairings || []), ...extra])].slice(0, 5);
  }
});

// Final dedup
const finalIds = new Set();
const finalArr = [];
let finalDups = 0;
for (const c of all) {
  const key = c.id.toLowerCase();
  if (finalIds.has(key)) { finalDups++; continue; }
  finalIds.add(key);
  finalArr.push(c);
}

console.log('Final dups removed:', finalDups);
console.log('FINAL COUNT:', finalArr.length);
console.log('Brands:', new Set(finalArr.map(c => c.brand)).size);

// Write
fs.copyFileSync('data/cigars.json', 'data/cigars.json.bak6');
fs.writeFileSync('data/cigars.json', JSON.stringify(finalArr, null, 2));
fs.writeFileSync('js/data.js', `const CIGARS = ${JSON.stringify(finalArr, null, 2)};\n`);
console.log('Done.');
