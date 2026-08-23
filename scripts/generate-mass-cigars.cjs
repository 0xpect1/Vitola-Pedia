// Programmatic cigar generator — produces 500-1000 entries from compact brand/vitola/wrapper tables
const fs = require('fs');

const existing = JSON.parse(fs.readFileSync('data/cigars.json', 'utf8'));
const existingIds = new Set(existing.map(c => c.id.toLowerCase()));
const existingNames = new Set(existing.map(c => c.name.toLowerCase()));
console.log('Existing:', existing.length);

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
];

// ── BRAND PROFILES ──
// Each: [brand, origin, region, baseWrapper, binder, filler, strength, basePrice, baseRating, flavors, popularity, yearFounded, wrappers[]]
const brands = [
  ['Padrón','Nicaragua','Estelí','Sun-Grown Habano','Nicaraguan','Nicaraguan',4,13,93,['Cedar','Coffee','Earth','Pepper','Dark Chocolate'],9,1964,['Natural','Maduro']],
  ['Oliva','Nicaragua','Estelí','Habano','Nicaraguan','Nicaraguan',4,11,92,['Cedar','Coffee','Cream','Pepper'],8,1886,['Habano','Maduro','Connecticut']],
  ['Arturo Fuente','Dominican Republic','Santiago','Cameroon','Dominican','Dominican',3,14,93,['Cedar','Cream','Coffee','Sweet Spice'],9,1912,['Cameroon','Connecticut','Maduro','Habano']],
  ['My Father','Nicaragua','Estelí','Habano','Nicaraguan','Nicaraguan',4,13,93,['Cedar','Coffee','Cream','Pepper','Leather'],8,2003,['Habano','Maduro','Connecticut']],
  ['Drew Estate','Nicaragua','Estelí','Mexican San Andrés Maduro','Nicaraguan','Nicaraguan',4,12,92,['Espresso','Dark Chocolate','Leather','Pepper'],9,1999,['Maduro','Habano','Connecticut','Sun Grown']],
  ['Rocky Patel','Honduras','Jamastran','Corojo','Honduran','Honduran/Nicaraguan',4,10,91,['Cedar','Coffee','Pepper','Leather','Cream'],7,1996,['Corojo','Maduro','Connecticut','Sumatra']],
  ['Alec Bradley','Honduras','Jamastran','Honduran Corojo','Honduran','Honduran/Nicaraguan',4,11,92,['Cedar','Coffee','Cream','Pepper','Leather'],6,1996,['Corojo','Maduro','Connecticut','Habano']],
  ['Perdomo','Nicaragua','Estelí','Habano','Nicaraguan','Nicaraguan',3,10,91,['Cedar','Cream','Coffee','Honey','Pepper'],7,1998,['Habano','Maduro','Connecticut','Sun Grown']],
  ['Camacho','Honduras','Jamastran','Corojo','Honduran','Honduran',4,10,90,['Earth','Leather','Pepper','Cedar','Coffee'],6,1962,['Corojo','Maduro','Connecticut','Habano']],
  ['La Aroma de Cuba','Nicaragua','Estelí','Connecticut Broadleaf','Nicaraguan','Nicaraguan',4,12,92,['Cedar','Coffee','Cream','Pepper','Honey'],5,1956,['Maduro','Connecticut','Habano']],
  ['Davidoff','Dominican Republic','Santiago','Connecticut','Dominican','Dominican',3,16,93,['Cedar','Cream','Coffee','Honey','Leather'],8,1946,['Connecticut','Maduro','Habano']],
  ['Gurkha','Dominican Republic','Santiago','Habano','Dominican','Dominican/Nicaraguan',4,14,92,['Cedar','Coffee','Cream','Pepper','Leather'],6,1887,['Habano','Maduro','Connecticut']],
  ['Crowned Heads','Dominican Republic','Santiago','Habano','Dominican','Dominican/Nicaraguan',4,11,92,['Cedar','Coffee','Cream','Pepper','Leather'],6,2011,['Habano','Maduro','Connecticut','Cameroon']],
  ['Espinosa','Nicaragua','Estelí','Habano','Nicaraguan','Nicaraguan',4,10,91,['Cedar','Coffee','Pepper','Earth','Leather'],5,2012,['Habano','Maduro','Connecticut']],
  ['Kristoff','Dominican Republic','Santiago','Habano','Dominican','Dominican/Nicaraguan',3,10,91,['Cedar','Cream','Coffee','Honey','Nuts'],5,2007,['Habano','Maduro','Connecticut','Sumatra']],
  ['Southern Draw','Nicaragua','Estelí','Habano','Nicaraguan','Nicaraguan',4,11,92,['Cedar','Coffee','Earth','Pepper','Leather'],5,2015,['Habano','Maduro','Connecticut','Corojo']],
  ['Viaje','Nicaragua','Estelí','Habano','Nicaraguan','Nicaraguan',4,12,92,['Cedar','Coffee','Pepper','Leather','Earth'],5,2009,['Habano','Maduro','Connecticut']],
  ['Illusione','Nicaragua','Estelí','Habano','Nicaraguan','Nicaraguan',3,11,92,['Cedar','Cream','Coffee','Pepper','Earth'],5,2008,['Habano','Connecticut','Maduro']],
  ['RoMa Craft','Nicaragua','Estelí','Habano','Nicaraguan','Nicaraguan',4,11,92,['Cedar','Earth','Leather','Pepper','Coffee'],5,2013,['Habano','Maduro','Connecticut']],
  ['Tatuaje','Nicaragua','Estelí','Habano','Nicaraguan','Nicaraguan',4,12,93,['Cedar','Coffee','Earth','Pepper','Leather'],7,2004,['Habano','Maduro','Connecticut']],
  ['Nub','Nicaragua','Estelí','Habano','Nicaraguan','Nicaraguan',3,8,90,['Cedar','Cream','Coffee','Pepper'],6,2008,['Habano','Maduro','Connecticut','Cameroon','Sumatra']],
  ['La Flor Dominicana','Dominican Republic','Santiago','Habano','Dominican','Dominican',4,12,92,['Cedar','Coffee','Pepper','Leather','Earth'],6,1996,['Habano','Maduro','Connecticut']],
  ['Joya de Nicaragua','Nicaragua','Estelí','Habano','Nicaraguan','Nicaraguan',4,10,91,['Cedar','Coffee','Earth','Pepper','Leather'],6,1968,['Habano','Maduro','Connecticut']],
  ['Plasencia','Nicaragua','Estelí','Habano','Nicaraguan','Nicaraguan',3,11,91,['Cedar','Cream','Coffee','Honey','Pepper'],5,1865,['Habano','Maduro','Connecticut']],
  ['Fratello','Dominican Republic','Santiago','Habano','Dominican','Dominican/Nicaraguan',3,11,91,['Cedar','Cream','Coffee','Honey','Pepper'],4,2013,['Habano','Maduro','Connecticut']],
  ['Gran Habano','Honduras','Jamastran','Habano','Honduran','Honduran/Nicaraguan',3,9,89,['Cedar','Coffee','Cream','Pepper','Earth'],4,1998,['Habano','Maduro','Connecticut']],
  ['Punch','Cuba','Vuelta Abajo','Cuban Habano','Cuban Habano','Cuban Habano',4,16,91,['Earth','Cedar','Leather','Cream','Pepper'],7,1840,['Cuban Habano']],
  ['H. Upmann','Cuba','Vuelta Abajo','Cuban Habano','Cuban Habano','Cuban Habano',3,15,90,['Cedar','Cream','Earth','Honey','Pepper'],7,1844,['Cuban Habano']],
  ['Bolívar','Cuba','Vuelta Abajo','Cuban Habano','Cuban Habano','Cuban Habano',5,16,92,['Earth','Leather','Pepper','Coffee','Cedar'],7,1901,['Cuban Habano']],
  ['Romeo y Julieta','Cuba','Vuelta Abajo','Cuban Habano','Cuban Habano','Cuban Habano',3,14,91,['Cedar','Cream','Earth','Honey','Pepper'],8,1875,['Cuban Habano']],
  ['Hoyo de Monterrey','Cuba','Vuelta Abajo','Cuban Habano','Cuban Habano','Cuban Habano',2,15,91,['Cedar','Cream','Honey','Earth','Vanilla'],7,1860,['Cuban Habano']],
  ['Partagás','Cuba','Vuelta Abajo','Cuban Habano','Cuban Habano','Cuban Habano',4,17,92,['Earth','Cedar','Leather','Pepper','Coffee'],8,1845,['Cuban Habano']],
  ['Cohiba','Cuba','Vuelta Abajo','Cuban Habano','Cuban Habano','Cuban Habano',4,25,94,['Cedar','Cream','Honey','Earth','Pepper'],10,1966,['Cuban Habano']],
  ['Montecristo','Cuba','Vuelta Abajo','Cuban Habano','Cuban Habano','Cuban Habano',3,16,92,['Cedar','Earth','Cream','Pepper','Honey'],9,1935,['Cuban Habano']],
  ['Trinidad','Cuba','Vuelta Abajo','Cuban Habano','Cuban Habano','Cuban Habano',3,17,91,['Cedar','Cream','Honey','Earth','Pepper'],7,1969,['Cuban Habano']],
  ['El Rey del Mundo','Cuba','Vuelta Abajo','Cuban Habano','Cuban Habano','Cuban Habano',2,14,90,['Cedar','Cream','Honey','Vanilla','Earth'],5,1882,['Cuban Habano']],
  ['Ramón Allones','Cuba','Vuelta Abajo','Cuban Habano','Cuban Habano','Cuban Habano',4,15,91,['Earth','Cedar','Leather','Pepper','Coffee'],6,1837,['Cuban Habano']],
  ['San Cristobal de la Habana','Cuba','Vuelta Abajo','Cuban Habano','Cuban Habano','Cuban Habano',3,14,90,['Cedar','Cream','Honey','Earth','Pepper'],4,1999,['Cuban Habano']],
  ['La Gloria Cubana','Cuba','Vuelta Abajo','Cuban Habano','Cuban Habano','Cuban Habano',3,14,90,['Cedar','Earth','Cream','Honey','Pepper'],4,1885,['Cuban Habano']],
  ['Diplomáticos','Cuba','Vuelta Abajo','Cuban Habano','Cuban Habano','Cuban Habano',4,15,91,['Earth','Cedar','Leather','Pepper','Coffee'],4,1966,['Cuban Habano']],
  ['Cuaba','Cuba','Vuelta Abajo','Cuban Habano','Cuban Habano','Cuban Habano',3,15,90,['Cedar','Cream','Honey','Earth','Pepper'],4,1996,['Cuban Habano']],
  ['Vegas Robaina','Cuba','Vuelta Abajo','Cuban Habano','Cuban Habano','Cuban Habano',3,16,92,['Cedar','Cream','Earth','Honey','Leather'],5,1997,['Cuban Habano']],
  ['Juan López','Cuba','Vuelta Abajo','Cuban Habano','Cuban Habano','Cuban Habano',4,16,92,['Earth','Cedar','Leather','Pepper','Coffee'],4,1876,['Cuban Habano']],
  ['Fonseca','Cuba','Vuelta Abajo','Cuban Habano','Cuban Habano','Cuban Habano',2,11,88,['Cedar','Cream','Honey','Vanilla','Earth'],4,1884,['Cuban Habano']],
  ['Por Larrañaga','Cuba','Vuelta Abajo','Cuban Habano','Cuban Habano','Cuban Habano',2,12,89,['Cedar','Cream','Honey','Earth','Vanilla'],4,1834,['Cuban Habano']],
  ['Quai d\'Orsay','Cuba','Vuelta Abajo','Cuban Habano','Cuban Habano','Cuban Habano',2,13,89,['Cedar','Cream','Honey','Vanilla','Pepper'],3,1970,['Cuban Habano']],
  ['Saint Luis Rey','Cuba','Vuelta Abajo','Cuban Habano','Cuban Habano','Cuban Habano',4,14,91,['Earth','Cedar','Leather','Pepper','Honey'],4,1940,['Cuban Habano']],
  ['José L. Piedra','Cuba','Remedios','Cuban Habano','Cuban Habano','Cuban Habano',4,6,86,['Earth','Pepper','Leather','Cedar'],5,1880,['Cuban Habano']],
  ['Foundation','Nicaragua','Estelí','Habano','Nicaraguan','Nicaraguan',3,11,92,['Cedar','Cream','Coffee','Honey','Pepper'],5,2015,['Habano','Maduro','Connecticut']],
  ['Aganorsa','Nicaragua','Jalapa','Corojo 99','Nicaraguan','Nicaraguan',4,11,92,['Cedar','Coffee','Pepper','Leather','Cream'],5,2014,['Corojo 99','Habano','Maduro']],
  ['HVC','Nicaragua','Estelí','Habano','Nicaraguan','Nicaraguan',4,9,91,['Cedar','Coffee','Pepper','Cream','Leather'],4,2011,['Habano','Maduro','Connecticut']],
  ['Dunbarton','Nicaragua','Estelí','Mexican San Andrés','Nicaraguan','Nicaraguan',5,13,93,['Espresso','Dark Chocolate','Leather','Pepper','Cedar','Earth'],5,2015,['Mexican San Andrés','Connecticut','Habano']],
  ['Warped','Nicaragua','Estelí','Habano','Nicaraguan','Nicaraguan',4,12,92,['Cedar','Coffee','Cream','Pepper','Leather'],5,2013,['Habano','Maduro','Connecticut']],
  ['Casa Turrent','Mexico','San Andrés','Mexican San Andrés','Mexican','Mexican/Nicaraguan',3,12,92,['Cedar','Cream','Coffee','Sweet Notes','Pepper'],5,1880,['Mexican San Andrés','Habano','Maduro']],
  ['La Aurora','Dominican Republic','Santiago','Connecticut','Dominican','Dominican',3,10,90,['Cedar','Cream','Honey','Nuts','Vanilla'],5,1903,['Connecticut','Maduro','Habano']],
  ['Baccarat','Honduras','Jamastran','Connecticut Sweet','Honduran','Honduran',2,6,87,['Sweet Notes','Cedar','Cream','Honey'],5,1978,['Connecticut','Maduro']],
  ['Don Tomás','Honduras','Jamastran','Connecticut','Honduran','Honduran/Nicaraguan',3,8,88,['Cedar','Cream','Coffee','Honey','Pepper'],4,1975,['Connecticut','Maduro','Habano']],
  ['Puros Indios','Honduras','Jamastran','Habano','Honduran','Honduran/Nicaraguan',4,9,89,['Cedar','Earth','Pepper','Leather','Coffee'],4,1996,['Habano','Maduro','Connecticut']],
  ['Padilla','Dominican Republic','Santiago','Habano','Dominican','Dominican/Nicaraguan',3,10,90,['Cedar','Cream','Coffee','Pepper','Honey'],4,2003,['Habano','Maduro','Connecticut']],
  ['Diesel','Nicaragua','Estelí','Mexican San Andrés Maduro','Nicaraguan','Nicaraguan',5,8,90,['Espresso','Dark Chocolate','Leather','Pepper','Earth'],5,2011,['Maduro','Habano','Corojo']],
  ['Foundry','Dominican Republic','Santiago','Habano','Dominican','Dominican/Nicaraguan',4,12,91,['Cedar','Coffee','Cream','Pepper','Leather'],4,2013,['Habano','Maduro','Connecticut']],
  ['La Barba','Dominican Republic','Santiago','Habano','Dominican','Dominican/Nicaraguan',4,11,91,['Cedar','Coffee','Cream','Pepper','Earth'],3,2012,['Habano','Maduro','Connecticut']],
  ['Mombacho','Nicaragua','Granada','Habano','Nicaraguan','Nicaraguan',3,13,92,['Cedar','Cream','Coffee','Honey','Nuts'],4,2006,['Habano','Maduro','Connecticut']],
  ['Casdagli','Dominican Republic','Santiago','Connecticut','Dominican','Dominican/Nicaraguan',3,15,92,['Cedar','Cream','Honey','Nuts','Vanilla'],3,2012,['Connecticut','Maduro','Habano']],
  ['Esteban Carreras','Nicaragua','Estelí','Habano','Nicaraguan','Nicaraguan',4,11,91,['Cedar','Coffee','Pepper','Leather','Earth'],4,2004,['Habano','Maduro','Connecticut']],
  ['Jas Sum Kral','Nicaragua','Estelí','Habano','Nicaraguan','Nicaraguan',4,10,90,['Cedar','Coffee','Pepper','Earth','Leather'],3,2015,['Habano','Maduro','Connecticut']],
  ['Oscar Valladares','Honduras','Jamastran','Habano','Honduran','Honduran/Nicaraguan',3,11,91,['Cedar','Cream','Coffee','Honey','Pepper'],4,2012,['Habano','Maduro','Connecticut','Sumatra']],
  ['Casa de Pailles','Dominican Republic','Santiago','Connecticut','Dominican','Dominican',2,10,89,['Cedar','Cream','Honey','Vanilla','Nuts'],3,2010,['Connecticut','Maduro']],
  ['Blackbird','Dominican Republic','Santiago','Habano','Dominican','Dominican/Nicaraguan',4,11,91,['Cedar','Coffee','Pepper','Leather','Dark Chocolate'],3,2015,['Habano','Maduro','Connecticut']],
  ['Corpus','Dominican Republic','Santiago','Habano','Dominican','Dominican/Nicaraguan',4,12,91,['Cedar','Coffee','Pepper','Earth','Leather'],3,2014,['Habano','Maduro']],
  ['Tabacalera Palma','Dominican Republic','Santiago','Connecticut','Dominican','Dominican',3,10,90,['Cedar','Cream','Coffee','Honey','Pepper'],4,1936,['Connecticut','Maduro','Habano']],
  ['Southern Draw','Nicaragua','Estelí','Corojo','Nicaraguan','Nicaraguan',4,11,92,['Cedar','Coffee','Earth','Pepper','Leather'],5,2015,['Corojo','Maduro','Connecticut','Habano']],
  ['Nomad','Dominican Republic','Santiago','Habano','Dominican','Dominican/Nicaraguan',4,11,91,['Cedar','Coffee','Pepper','Leather','Earth'],3,2013,['Habano','Maduro','Connecticut']],
  ['La Palina','Dominican Republic','Santiago','Connecticut','Dominican','Dominican/Nicaraguan',3,12,91,['Cedar','Cream','Coffee','Honey','Pepper'],4,2009,['Connecticut','Maduro','Habano']],
  ['Saga','Dominican Republic','Santiago','Habano','Dominican','Dominican/Nicaraguan',3,12,91,['Cedar','Cream','Coffee','Honey','Nuts'],3,2014,['Habano','Maduro','Connecticut']],
  ['Cave de Pailles','Dominican Republic','Santiago','Connecticut','Dominican','Dominican',2,11,89,['Cedar','Cream','Honey','Vanilla','Earth'],3,2011,['Connecticut','Maduro']],
  ['Terramoto','Dominican Republic','Santiago','Habano','Dominican','Dominican/Nicaraguan',4,12,91,['Cedar','Coffee','Pepper','Leather','Earth'],3,2013,['Habano','Maduro']],
  ['Sibaristica','Dominican Republic','Santiago','Connecticut','Dominican','Dominican',2,10,88,['Cedar','Cream','Honey','Vanilla','Nuts'],3,2012,['Connecticut','Maduro']],
  ['Toraño','Nicaragua','Estelí','Habano','Nicaraguan','Nicaraguan/Honduran',3,10,90,['Cedar','Coffee','Cream','Pepper','Earth'],5,1916,['Habano','Maduro','Connecticut']],
  ['Veger','Dominican Republic','Santiago','Habano','Dominican','Dominican/Nicaraguan',4,12,91,['Cedar','Coffee','Pepper','Leather','Earth'],3,2014,['Habano','Maduro','Connecticut']],
  ['Workhorse','Nicaragua','Estelí','Habano','Nicaraguan','Nicaraguan',4,9,89,['Cedar','Coffee','Pepper','Earth','Leather'],3,2014,['Habano','Maduro']],
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

function slug(s) { return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''); }

function wrapperLeaf(wrapperVariant, brand) {
  const w = wrapperVariant.toLowerCase();
  if (w.includes('maduro')) return 'Connecticut Broadleaf Maduro';
  if (w.includes('connecticut')) return 'Connecticut Shade';
  if (w.includes('corojo')) return 'Corojo';
  if (w.includes('cameroon')) return 'Cameroon';
  if (w.includes('sumatra')) return 'Sumatra';
  if (w.includes('san andrés') || w.includes('san andres')) return 'Mexican San Andrés';
  if (w.includes('cuban')) return 'Cuban Habano';
  if (w.includes('sun grown') || w.includes('sun-grown')) return 'Sun-Grown Habano';
  if (w.includes('corojo 99')) return 'Corojo 99';
  return 'Habano';
}

const newCigars = [];
let skipped = 0;

for (const b of brands) {
  const [brand, origin, region, baseWrapper, binder, filler, baseStrength, basePrice, baseRating, flavors, popularity, yearFounded, wrappers] = b;

  for (const v of vitolas) {
    for (const w of wrappers) {
      // Skip some combos that don't make sense
      if (v.name === 'Lancero' && w.includes('Maduro')) continue;
      if (v.name === 'Perfecto' && w.includes('Connecticut') && baseStrength >= 4) continue;

      const wLeaf = wrapperLeaf(w, brand);
      const variantName = w === baseWrapper ? v.name : `${v.name} ${w}`;
      const name = `${brand} ${variantName}`;
      const id = slug(name);

      if (existingIds.has(id) || existingNames.has(name.toLowerCase())) { skipped++; continue; }

      // Adjust strength slightly for wrapper
      let strength = baseStrength;
      if (w.includes('Maduro') && strength < 5) strength += 1;
      if (w.includes('Connecticut') && strength > 2) strength -= 1;

      // Adjust price for vitola
      const price = Math.round(basePrice * (v.length / 5.5) * 100) / 100;

      // Adjust rating slightly
      const rating = Math.min(97, Math.max(85, baseRating + Math.floor(Math.random() * 3) - 1));

      // Adjust smoking time for wrapper
      const smokingTime = Math.round(v.time * (w.includes('Maduro') ? 1.1 : 1.0));

      // Flavors adjusted for wrapper
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
console.log('Skipped (already exist):', skipped);

// Merge
const all = [...existing, ...newCigars];

// Ensure 5 pairings each
all.forEach(c => {
  while ((c.pairings || []).length < 5) {
    const extra = pairFor(c.strength, c.origin);
    c.pairings = [...new Set([...(c.pairings || []), ...extra])].slice(0, 5);
  }
});

console.log('FINAL COUNT:', all.length);

// Backup and write
fs.copyFileSync('data/cigars.json', 'data/cigars.json.bak4');
fs.writeFileSync('data/cigars.json', JSON.stringify(all, null, 2));
fs.writeFileSync('js/data.js', `const CIGARS = ${JSON.stringify(all, null, 2)};\n`);

// Verify
const verify = JSON.parse(fs.readFileSync('data/cigars.json', 'utf8'));
const counts = verify.map(c => (c.pairings||[]).length);
console.log('\n=== VERIFICATION ===');
console.log('Total:', verify.length);
console.log('Min pairings:', Math.min(...counts));
console.log('Max pairings:', Math.max(...counts));
console.log('Avg pairings:', (counts.reduce((a,b)=>a+b,0)/counts.length).toFixed(1));
console.log('Sample new:', newCigars[0]?.name, '→', newCigars[0]?.pairings.length, 'pairings');
console.log('Sample new 2:', newCigars[50]?.name, '→', newCigars[50]?.pairings.length, 'pairings');
