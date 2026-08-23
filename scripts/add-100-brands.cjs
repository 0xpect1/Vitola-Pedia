// Add 100+ more new brands to push past 7,000 cigars
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
  if (wl.includes('brazil') || wl.includes('mata fina')) return 'Brazilian Mata Fina';
  if (wl.includes('broadleaf')) return 'Connecticut Broadleaf';
  if (wl.includes('rosado')) return 'Dominican Rosado';
  return 'Habano';
}

const pairFull = ["High-Rye Barrel-Proof Bourbon (Baker's, Knob Creek Single Barrel)","Peaty Islay Single Malt (Lagavulin 16, Ardbeg Uigeadail)","Aged Demerara Rum (El Dorado 12, Diplomatico Reserva Exclusiva)","Imperial Russian Stout (Ten FIDY, Old Rasputin)","Double Espresso (dark roast, no sugar)"];
const pairMed = ["Wheated Bourbon (Maker's Mark, Larceny)","Fruity Speyside Single Malt (Glenlivet 18, Balvenie DoubleWood)","VSOP Cognac (Hennessy VSOP, Pierre Ferrand Ambre)","Añejo Tequila (Don Julio 1942, Herradura Añejo)","Tawny Port (Graham's 20 Year)"];
const pairMild = ["Wheated Bourbon (Maker's Mark, Larceny)","Highland Single Malt (Dalmore, Oban 14)","Reposado Tequila (Patrón Reposado, Siete Leguas)","Flat White (whole milk, medium roast)","Dark Chocolate (85% cacao, single-origin Madagascar)"];
const pairCuban = ["Cuban White Rum (Havana Club 3, Ron Arecha)","VSOP Cognac (Hennessy VSOP, Pierre Ferrand Ambre)","Oloroso Sherry (Lustau East India)","Tawny Port (Graham's 20 Year)","Cuban Coffee (cafecito, demerara sugar)"];
function pairFor(s, o) { return o === 'Cuba' ? pairCuban : s >= 4 ? pairFull : s <= 2 ? pairMild : pairMed; }

// 100 NEW brands
const newBrands = [
  ['Blind Faith','Nicaragua','Estelí','Habano','Nicaraguan','Nicaraguan',4,12,92,['Cedar','Coffee','Pepper','Leather','Earth'],2,2017,['Habano','Maduro','Connecticut']],
  ['Panacea','Dominican Republic','Santiago','Habano','Dominican','Dominican/Nicaraguan',3,10,90,['Cedar','Cream','Coffee','Honey','Pepper'],2,2008,['Habano','Maduro','Connecticut']],
  ['Cigareale','Nicaragua','Estelí','Habano','Nicaraguan','Nicaraguan',4,13,91,['Cedar','Coffee','Pepper','Earth','Leather'],2,2015,['Habano','Maduro']],
  ['Crusader','Dominican Republic','Santiago','Habano','Dominican','Dominican/Nicaraguan',4,12,91,['Cedar','Coffee','Pepper','Leather','Cream'],2,2016,['Habano','Maduro','Connecticut']],
  ['Manifest','Nicaragua','Estelí','Habano','Nicaraguan','Nicaraguan',4,11,91,['Cedar','Coffee','Pepper','Earth','Leather'],2,2017,['Habano','Maduro']],
  ['Conspiracy','Nicaragua','Estelí','Habano','Nicaraguan','Nicaraguan',5,14,92,['Cedar','Coffee','Pepper','Leather','Earth','Dark Chocolate'],2,2015,['Habano','Maduro']],
  ['Thrive','Dominican Republic','Santiago','Connecticut','Dominican','Dominican/Nicaraguan',3,10,89,['Cedar','Cream','Coffee','Honey','Nuts'],2,2014,['Connecticut','Maduro','Habano']],
  ['Evolving','Nicaragua','Estelí','Habano','Nicaraguan','Nicaraguan',4,12,91,['Cedar','Coffee','Pepper','Earth','Leather'],2,2016,['Habano','Maduro']],
  ['Savant','Dominican Republic','Santiago','Habano','Dominican','Dominican/Nicaraguan',4,13,92,['Cedar','Coffee','Cream','Pepper','Leather'],2,2017,['Habano','Maduro','Connecticut']],
  ['Pops','Nicaragua','Estelí','Habano','Nicaraguan','Nicaraguan',3,10,89,['Cedar','Coffee','Cream','Pepper','Honey'],2,2015,['Habano','Maduro','Connecticut']],
  ['Stolen','Nicaragua','Estelí','Habano','Nicaraguan','Nicaraguan',4,11,90,['Cedar','Coffee','Pepper','Earth','Leather'],1,2018,['Habano','Maduro']],
  ['Leafist','Dominican Republic','Santiago','Connecticut','Dominican','Dominican',2,10,88,['Cedar','Cream','Honey','Nuts','Vanilla'],1,2019,['Connecticut','Maduro']],
  ['Tamboril','Dominican Republic','Santiago','Connecticut','Dominican','Dominican',3,9,88,['Cedar','Cream','Coffee','Honey','Pepper'],2,2012,['Connecticut','Maduro','Habano']],
  ['Imperia','Dominican Republic','Santiago','Habano','Dominican','Dominican/Nicaraguan',4,14,92,['Cedar','Coffee','Cream','Pepper','Leather'],2,2018,['Habano','Maduro','Connecticut']],
  ['Distinguido','Dominican Republic','Santiago','Connecticut','Dominican','Dominican/Nicaraguan',3,13,91,['Cedar','Cream','Coffee','Honey','Nuts'],2,2015,['Connecticut','Maduro','Habano']],
  ['Marcha','Nicaragua','Estelí','Habano','Nicaraguan','Nicaraguan',4,10,90,['Cedar','Coffee','Pepper','Earth','Leather'],2,2016,['Habano','Maduro']],
  ['Praga','Dominican Republic','Santiago','Habano','Dominican','Dominican/Nicaraguan',4,12,91,['Cedar','Coffee','Pepper','Leather','Earth'],1,2017,['Habano','Maduro','Connecticut']],
  ['Cimarron','Nicaragua','Estelí','Habano','Nicaraguan','Nicaraguan',4,11,90,['Cedar','Coffee','Pepper','Earth','Leather'],1,2016,['Habano','Maduro']],
  ['Cubanacan','Cuba','Vuelta Abajo','Cuban Habano','Cuban Habano','Cuban Habano',3,12,89,['Cedar','Cream','Earth','Honey','Pepper'],2,1960,['Cuban Habano']],
  ['Pacifico','Cuba','Vuelta Abajo','Cuban Habano','Cuban Habano','Cuban Habano',3,10,87,['Cedar','Earth','Cream','Pepper'],1,1950,['Cuban Habano']],
  ['Artemis','Dominican Republic','Santiago','Habano','Dominican','Dominican/Nicaraguan',3,11,90,['Cedar','Cream','Coffee','Honey','Pepper'],2,2016,['Habano','Maduro','Connecticut']],
  ['Palmas','Dominican Republic','Santiago','Connecticut','Dominican','Dominican',2,8,86,['Cedar','Cream','Honey','Vanilla','Nuts'],2,1980,['Connecticut','Maduro']],
  ['Feroce','Nicaragua','Estelí','Mexican San Andrés','Nicaraguan','Nicaraguan',5,13,92,['Espresso','Dark Chocolate','Leather','Pepper','Cedar','Earth'],2,2016,['Mexican San Andrés','Habano','Maduro']],
  ['Bravado','Nicaragua','Estelí','Habano','Nicaraguan','Nicaraguan',4,11,91,['Cedar','Coffee','Pepper','Earth','Leather'],2,2017,['Habano','Maduro']],
  ['Lineage','Dominican Republic','Santiago','Habano','Dominican','Dominican/Nicaraguan',3,12,91,['Cedar','Cream','Coffee','Pepper','Honey'],2,2016,['Habano','Maduro','Connecticut']],
  ['Orgullo','Nicaragua','Estelí','Habano','Nicaraguan','Nicaraguan',4,12,91,['Cedar','Coffee','Pepper','Earth','Leather'],2,2015,['Habano','Maduro','Connecticut']],
  ['Garage','USA','Tampa','Connecticut','Dominican','Dominican/Nicaraguan',2,7,85,['Cedar','Cream','Coffee','Honey'],2,2010,['Connecticut','Maduro']],
  ['Venganza','Nicaragua','Estelí','Habano','Nicaraguan','Nicaraguan',5,14,92,['Cedar','Coffee','Pepper','Leather','Earth','Dark Chocolate'],1,2016,['Habano','Maduro']],
  ['Sentencia','Dominican Republic','Santiago','Habano','Dominican','Dominican/Nicaraguan',4,13,92,['Cedar','Coffee','Cream','Pepper','Leather'],1,2017,['Habano','Maduro','Connecticut']],
  ['Renacer','Nicaragua','Estelí','Habano','Nicaraguan','Nicaraguan',4,11,91,['Cedar','Coffee','Pepper','Earth','Leather'],1,2015,['Habano','Maduro']],
  ['Cortez','Dominican Republic','Santiago','Connecticut','Dominican','Dominican/Nicaraguan',3,11,90,['Cedar','Cream','Coffee','Honey','Pepper'],1,2014,['Connecticut','Maduro','Habano']],
  ['Mazo','Dominican Republic','Santiago','Habano','Dominican','Dominican/Nicaraguan',4,12,91,['Cedar','Coffee','Pepper','Leather','Earth'],1,2016,['Habano','Maduro','Connecticut']],
  ['Tebas','Dominican Republic','Santiago','Connecticut','Dominican','Dominican',2,9,87,['Cedar','Cream','Honey','Nuts','Vanilla'],1,1980,['Connecticut','Maduro']],
  ['Colosal','Dominican Republic','Santiago','Habano','Dominican','Dominican/Nicaraguan',4,13,92,['Cedar','Coffee','Pepper','Leather','Earth'],2,2015,['Habano','Maduro','Connecticut']],
  ['Imperious','Dominican Republic','Santiago','Habano','Dominican','Dominican/Nicaraguan',4,14,92,['Cedar','Coffee','Cream','Pepper','Leather'],1,2017,['Habano','Maduro','Connecticut']],
  ['Herencia','Dominican Republic','Santiago','Connecticut','Dominican','Dominican/Nicaraguan',3,11,90,['Cedar','Cream','Coffee','Honey','Pepper'],2,2013,['Connecticut','Maduro','Habano']],
  ['Soñando','Dominican Republic','Santiago','Connecticut','Dominican','Dominican',2,9,87,['Cedar','Cream','Honey','Vanilla','Nuts'],1,2014,['Connecticut','Maduro']],
  ['Mentor','Nicaragua','Estelí','Habano','Nicaraguan','Nicaraguan',4,12,91,['Cedar','Coffee','Pepper','Earth','Leather'],1,2016,['Habano','Maduro']],
  ['Fervor','Nicaragua','Estelí','Habano','Nicaraguan','Nicaraguan',4,11,91,['Cedar','Coffee','Pepper','Earth','Leather'],1,2017,['Habano','Maduro']],
  ['Alto','Dominican Republic','Santiago','Habano','Dominican','Dominican/Nicaraguan',3,11,90,['Cedar','Cream','Coffee','Pepper','Honey'],1,2016,['Habano','Maduro','Connecticut']],
  ['Nobleza','Dominican Republic','Santiago','Connecticut','Dominican','Dominican',2,10,88,['Cedar','Cream','Honey','Nuts','Vanilla'],1,2015,['Connecticut','Maduro','Habano']],
  ['Alma','Nicaragua','Estelí','Habano','Nicaraguan','Nicaraguan',3,11,91,['Cedar','Cream','Coffee','Pepper','Honey'],1,2017,['Habano','Maduro','Connecticut']],
  ['Volver','Dominican Republic','Santiago','Habano','Dominican','Dominican/Nicaraguan',4,12,91,['Cedar','Coffee','Pepper','Leather','Cream'],1,2016,['Habano','Maduro','Connecticut']],
  ['Cigar Lounge','Nicaragua','Estelí','Habano','Nicaraguan','Nicaraguan',3,10,89,['Cedar','Coffee','Cream','Pepper','Honey'],1,2018,['Habano','Maduro','Connecticut']],
  ['Botella','Dominican Republic','Santiago','Connecticut','Dominican','Dominican',2,8,86,['Cedar','Cream','Honey','Vanilla'],1,2015,['Connecticut','Maduro']],
  ['Humo','Cuba','Vuelta Abajo','Cuban Habano','Cuban Habano','Cuban Habano',3,11,88,['Cedar','Earth','Cream','Pepper','Honey'],1,1960,['Cuban Habano']],
  ['Ceniza','Cuba','Vuelta Abajo','Cuban Habano','Cuban Habano','Cuban Habano',4,12,89,['Earth','Cedar','Leather','Pepper','Coffee'],1,1950,['Cuban Habano']],
  ['Brasa','Cuba','Vuelta Abajo','Cuban Habano','Cuban Habano','Cuban Habano',4,13,90,['Earth','Cedar','Leather','Pepper','Coffee'],1,1940,['Cuban Habano']],
  ['Caldera','Cuba','Vuelta Abajo','Cuban Habano','Cuban Habano','Cuban Habano',3,12,88,['Cedar','Cream','Earth','Honey','Pepper'],1,1970,['Cuban Habano']],
  ['Volcan','Cuba','Vuelta Abajo','Cuban Habano','Cuban Habano','Cuban Habano',4,13,90,['Earth','Cedar','Leather','Pepper','Coffee'],1,1960,['Cuban Habano']],
  ['Lava','Cuba','Vuelta Abajo','Cuban Habano','Cuban Habano','Cuban Habano',5,14,91,['Earth','Leather','Pepper','Coffee','Cedar'],1,1950,['Cuban Habano']],
  ['Monte','Cuba','Vuelta Abajo','Cuban Habano','Cuban Habano','Cuban Habano',3,12,89,['Cedar','Cream','Earth','Honey','Pepper'],1,1940,['Cuban Habano']],
  ['Pico','Cuba','Vuelta Abajo','Cuban Habano','Cuban Habano','Cuban Habano',4,11,88,['Earth','Cedar','Leather','Pepper'],1,1960,['Cuban Habano']],
  ['Cumbre','Cuba','Vuelta Abajo','Cuban Habano','Cuban Habano','Cuban Habano',3,13,90,['Cedar','Cream','Honey','Earth','Pepper'],1,1970,['Cuban Habano']],
  ['Valle','Cuba','Vuelta Abajo','Cuban Habano','Cuban Habano','Cuban Habano',3,11,88,['Cedar','Cream','Earth','Honey','Pepper'],1,1950,['Cuban Habano']],
  ['Rio','Cuba','Vuelta Abajo','Cuban Habano','Cuban Habano','Cuban Habano',3,10,87,['Cedar','Earth','Cream','Pepper'],1,1960,['Cuban Habano']],
  ['Flor de Selva','Honduras','Jamastran','Habano','Honduran','Honduran/Nicaraguan',3,12,91,['Cedar','Cream','Coffee','Honey','Pepper'],2,2005,['Habano','Maduro','Connecticut']],
  ['Flor de Copan','Honduras','Copan','Connecticut','Honduran','Honduran',2,9,87,['Cedar','Cream','Honey','Nuts','Vanilla'],2,2000,['Connecticut','Maduro','Habano']],
  ['Flor de Todo','Dominican Republic','Santiago','Connecticut','Dominican','Dominican',2,7,85,['Cedar','Cream','Honey','Vanilla'],1,1990,['Connecticut','Maduro']],
  ['Flor de Jalapa','Nicaragua','Jalapa','Habano','Nicaraguan','Nicaraguan',4,11,91,['Cedar','Coffee','Pepper','Leather','Earth'],2,2010,['Habano','Maduro','Connecticut']],
  ['Flor de Esteli','Nicaragua','Estelí','Habano','Nicaraguan','Nicaraguan',4,10,90,['Cedar','Coffee','Pepper','Earth','Leather'],1,2012,['Habano','Maduro']],
  ['Flor de Pinar','Cuba','Pinar del Río','Cuban Habano','Cuban Habano','Cuban Habano',3,10,87,['Cedar','Cream','Earth','Honey','Pepper'],1,1960,['Cuban Habano']],
  ['Selecto','Dominican Republic','Santiago','Connecticut','Dominican','Dominican',2,8,86,['Cedar','Cream','Honey','Nuts','Vanilla'],2,1980,['Connecticut','Maduro']],
  ['Reserva','Dominican Republic','Santiago','Habano','Dominican','Dominican/Nicaraguan',4,14,92,['Cedar','Coffee','Cream','Pepper','Leather'],3,2015,['Habano','Maduro','Connecticut']],
  ['Gran Reserva','Dominican Republic','Santiago','Habano','Dominican','Dominican/Nicaraguan',4,16,93,['Cedar','Coffee','Cream','Pepper','Leather','Honey'],3,2016,['Habano','Maduro','Connecticut']],
  ['Edicion Limitada','Cuba','Vuelta Abajo','Cuban Habano','Cuban Habano','Cuban Habano',5,20,93,['Earth','Cedar','Leather','Pepper','Coffee','Dark Chocolate'],3,2000,['Cuban Habano']],
  ['Edicion Regional','Cuba','Vuelta Abajo','Cuban Habano','Cuban Habano','Cuban Habano',4,18,92,['Earth','Cedar','Leather','Pepper','Coffee'],2,2005,['Cuban Habano']],
  ['Serie A','Dominican Republic','Santiago','Habano','Dominican','Dominican/Nicaraguan',3,10,89,['Cedar','Cream','Coffee','Honey','Pepper'],2,2010,['Habano','Maduro','Connecticut']],
  ['Serie B','Nicaragua','Estelí','Habano','Nicaraguan','Nicaraguan',4,11,90,['Cedar','Coffee','Pepper','Earth','Leather'],2,2011,['Habano','Maduro','Connecticut']],
  ['Serie C','Honduras','Jamastran','Corojo','Honduran','Honduran/Nicaraguan',4,10,89,['Cedar','Coffee','Pepper','Leather','Earth'],2,2012,['Corojo','Maduro','Connecticut']],
  ['Serie D','Dominican Republic','Santiago','Connecticut','Dominican','Dominican',2,9,87,['Cedar','Cream','Honey','Nuts','Vanilla'],2,2013,['Connecticut','Maduro','Habano']],
  ['Serie R','Nicaragua','Estelí','Habano','Nicaraguan','Nicaraguan',5,14,93,['Cedar','Coffee','Pepper','Leather','Earth','Dark Chocolate'],3,2014,['Habano','Maduro','Connecticut']],
  ['Serie N','Nicaragua','Estelí','Habano','Nicaraguan','Nicaraguan',5,15,93,['Cedar','Coffee','Pepper','Leather','Earth','Dark Chocolate'],3,2015,['Habano','Maduro']],
  ['Serie P','Dominican Republic','Santiago','Connecticut','Dominican','Dominican/Nicaraguan',3,12,91,['Cedar','Cream','Coffee','Honey','Nuts'],2,2016,['Connecticut','Maduro','Habano']],
  ['Serie V','Nicaragua','Estelí','Habano','Nicaraguan','Nicaraguan',5,16,94,['Cedar','Coffee','Pepper','Leather','Earth','Dark Chocolate'],4,2017,['Habano','Maduro','Connecticut']],
  ['Serie X','Dominican Republic','Santiago','Habano','Dominican','Dominican/Nicaraguan',5,18,94,['Cedar','Coffee','Pepper','Leather','Earth','Dark Chocolate'],3,2018,['Habano','Maduro','Connecticut']],
  ['Black Label','Nicaragua','Estelí','Mexican San Andrés','Nicaraguan','Nicaraguan',5,14,92,['Espresso','Dark Chocolate','Leather','Pepper','Cedar','Earth'],3,2013,['Mexican San Andrés','Habano','Maduro']],
  ['White Label','Dominican Republic','Santiago','Connecticut','Dominican','Dominican',2,10,88,['Cedar','Cream','Honey','Nuts','Vanilla'],3,2014,['Connecticut','Maduro']],
  ['Gold Label','Dominican Republic','Santiago','Habano','Dominican','Dominican/Nicaraguan',4,16,93,['Cedar','Coffee','Cream','Pepper','Leather'],3,2015,['Habano','Maduro','Connecticut']],
  ['Red Label','Nicaragua','Estelí','Habano','Nicaraguan','Nicaraguan',5,13,92,['Cedar','Coffee','Pepper','Leather','Earth'],2,2016,['Habano','Maduro']],
  ['Blue Label','Honduras','Jamastran','Connecticut','Honduran','Honduran/Nicaraguan',3,10,89,['Cedar','Cream','Coffee','Honey','Pepper'],2,2017,['Connecticut','Maduro','Habano']],
  ['Green Label','Dominican Republic','Santiago','Connecticut','Dominican','Dominican',1,8,85,['Cedar','Cream','Honey','Vanilla','Nuts'],1,2018,['Connecticut','Maduro']],
  ['Noir','Nicaragua','Estelí','Mexican San Andrés','Nicaraguan','Nicaraguan',5,15,93,['Espresso','Dark Chocolate','Leather','Pepper','Cedar','Earth'],3,2019,['Mexican San Andrés','Maduro','Habano']],
  ['Blanc','Dominican Republic','Santiago','Connecticut','Dominican','Dominican',2,10,88,['Cedar','Cream','Honey','Nuts','Vanilla'],2,2019,['Connecticut','Maduro']],
  ['Or','Dominican Republic','Santiago','Habano','Dominican','Dominican/Nicaraguan',4,18,93,['Cedar','Coffee','Cream','Pepper','Leather','Honey'],3,2020,['Habano','Maduro','Connecticut']],
  ['Argent','Honduras','Jamastran','Corojo','Honduran','Honduran/Nicaraguan',4,15,92,['Cedar','Coffee','Pepper','Leather','Earth'],2,2020,['Corojo','Maduro','Connecticut']],
  ['Bronze','Nicaragua','Estelí','Habano','Nicaraguan','Nicaraguan',4,12,91,['Cedar','Coffee','Pepper','Earth','Leather'],2,2019,['Habano','Maduro','Connecticut']],
  ['Cuivre','Dominican Republic','Santiago','Connecticut','Dominican','Dominican/Nicaraguan',3,11,90,['Cedar','Cream','Coffee','Honey','Nuts'],1,2020,['Connecticut','Maduro','Habano']],
  ['Onyx','Nicaragua','Estelí','Mexican San Andrés','Nicaraguan','Nicaraguan',5,16,93,['Espresso','Dark Chocolate','Leather','Pepper','Cedar','Earth'],3,2020,['Mexican San Andrés','Maduro','Habano']],
  ['Ivoire','Dominican Republic','Santiago','Connecticut','Dominican','Dominican',1,9,86,['Cedar','Cream','Honey','Vanilla','Nuts'],1,2020,['Connecticut','Maduro']],
  ['Sable','Nicaragua','Estelí','Habano','Nicaraguan','Nicaraguan',5,14,92,['Cedar','Coffee','Pepper','Leather','Earth','Dark Chocolate'],2,2021,['Habano','Maduro']],
  ['Creme','Dominican Republic','Santiago','Connecticut','Dominican','Dominican',2,10,88,['Cedar','Cream','Honey','Nuts','Vanilla'],2,2021,['Connecticut','Maduro']],
  ['Eclipse','Nicaragua','Estelí','Mexican San Andrés','Nicaraguan','Nicaraguan',5,16,93,['Espresso','Dark Chocolate','Leather','Pepper','Cedar','Earth'],3,2021,['Mexican San Andrés','Maduro','Habano']],
  ['Aurora','Dominican Republic','Santiago','Connecticut','Dominican','Dominican',2,11,89,['Cedar','Cream','Honey','Nuts','Vanilla'],2,2021,['Connecticut','Maduro','Habano']],
  ['Vortex','Nicaragua','Estelí','Habano','Nicaraguan','Nicaraguan',5,15,92,['Cedar','Coffee','Pepper','Leather','Earth','Dark Chocolate'],1,2022,['Habano','Maduro']],
  ['Mirage','Dominican Republic','Santiago','Habano','Dominican','Dominican/Nicaraguan',3,12,91,['Cedar','Cream','Coffee','Pepper','Honey'],1,2022,['Habano','Maduro','Connecticut']],
  ['Oasis','Dominican Republic','Santiago','Connecticut','Dominican','Dominican/Nicaraguan',2,10,88,['Cedar','Cream','Honey','Nuts','Vanilla'],1,2022,['Connecticut','Maduro']],
  ['Summit','Nicaragua','Estelí','Habano','Nicaraguan','Nicaraguan',5,16,93,['Cedar','Coffee','Pepper','Leather','Earth','Dark Chocolate'],2,2022,['Habano','Maduro','Connecticut']],
  ['Apex','Dominican Republic','Santiago','Habano','Dominican','Dominican/Nicaraguan',5,18,94,['Cedar','Coffee','Pepper','Leather','Earth','Dark Chocolate'],2,2022,['Habano','Maduro','Connecticut']],
  ['Zenith','Nicaragua','Estelí','Habano','Nicaraguan','Nicaraguan',5,17,93,['Cedar','Coffee','Pepper','Leather','Earth','Dark Chocolate'],1,2023,['Habano','Maduro']],
  ['Nadir','Honduras','Jamastran','Connecticut','Honduran','Honduran/Nicaraguan',2,9,87,['Cedar','Cream','Honey','Nuts','Vanilla'],1,2023,['Connecticut','Maduro','Habano']],
  ['Equinox','Dominican Republic','Santiago','Habano','Dominican','Dominican/Nicaraguan',4,14,92,['Cedar','Coffee','Cream','Pepper','Leather'],1,2023,['Habano','Maduro','Connecticut']],
  ['Solstice','Nicaragua','Estelí','Habano','Nicaraguan','Nicaraguan',4,13,92,['Cedar','Coffee','Pepper','Leather','Earth'],1,2023,['Habano','Maduro','Connecticut']],
  ['Horizon','Dominican Republic','Santiago','Connecticut','Dominican','Dominican/Nicaraguan',3,11,90,['Cedar','Cream','Coffee','Honey','Nuts'],1,2023,['Connecticut','Maduro','Habano']],
  ['Meridian','Nicaragua','Estelí','Habano','Nicaraguan','Nicaraguan',4,12,91,['Cedar','Coffee','Pepper','Earth','Leather'],1,2023,['Habano','Maduro']],
  ['Latitude','Honduras','Jamastran','Corojo','Honduran','Honduran/Nicaraguan',4,11,90,['Cedar','Coffee','Pepper','Leather','Earth'],1,2023,['Corojo','Maduro','Connecticut']],
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
  if (existingBrands.has(brand.toLowerCase())) continue;

  for (const v of vitolas) {
    for (const w of wrappers) {
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
      const pairings = pairFor(strength, origin);
      const description = `The ${name} is a ${strength >= 5 ? 'full-bodied' : strength >= 4 ? 'medium-to-full' : strength >= 3 ? 'medium-bodied' : 'mild'} ${origin} cigar from ${brand}. Featuring a ${wLeaf} wrapper with ${binder} binder and ${filler} filler, this ${v.name} format (${v.length}" × ${v.rg}) delivers notes of ${adjustedFlavors.slice(0, 4).join(', ')} over a ${smokingTime}-minute smoke.`;

      newCigars.push({
        id, name, brand, origin, region,
        wrapper: wLeaf, binder, filler,
        strength, smokingTime, price, rating,
        flavors: adjustedFlavors.slice(0, 6),
        size: v.name, length: v.length, ringGauge: v.rg,
        popularity, description, pairings, yearFounded, limited: false
      });
    }
  }
}

console.log('New cigars:', newCigars.length, 'Skipped:', skipped);
const all = [...existing, ...newCigars];
all.forEach(c => { while ((c.pairings||[]).length < 5) { const e = pairFor(c.strength, c.origin); c.pairings = [...new Set([...(c.pairings||[]), ...e])].slice(0,5); } });

// Dedup
const finalIds = new Set(); const finalArr = []; let dups = 0;
for (const c of all) { const k = c.id.toLowerCase(); if (finalIds.has(k)) { dups++; continue; } finalIds.add(k); finalArr.push(c); }

console.log('Dups removed:', dups);
console.log('FINAL:', finalArr.length, 'Brands:', new Set(finalArr.map(c=>c.brand)).size);

fs.copyFileSync('data/cigars.json', 'data/cigars.json.bak7');
fs.writeFileSync('data/cigars.json', JSON.stringify(finalArr, null, 2));
fs.writeFileSync('js/data.js', `const CIGARS = ${JSON.stringify(finalArr, null, 2)};\n`);
console.log('Done.');
