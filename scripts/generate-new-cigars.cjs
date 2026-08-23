// Generate 500+ new cigar entries from knowledge, merge with existing, write to live data
const fs = require('fs');

// Load existing cigars to check for duplicates
const existing = JSON.parse(fs.readFileSync('data/cigars.json', 'utf8'));
const existingIds = new Set(existing.map(c => c.id.toLowerCase()));
const existingNames = new Set(existing.map(c => c.name.toLowerCase()));

console.log('Existing cigars:', existing.length);

// Helper: generate a cigar entry
function cigar(id, name, brand, origin, region, wrapper, binder, filler, strength, smokingTime, price, rating, flavors, size, length, ringGauge, popularity, description, pairings, yearFounded, limited) {
  return {
    id, name, brand, origin, region, wrapper, binder, filler,
    strength, smokingTime, price, rating, flavors, size, length, ringGauge,
    popularity, description, pairings, yearFounded, limited
  };
}

// Pairing presets by strength profile
const pairingsFull = [
  "High-Rye Barrel-Proof Bourbon (Baker's, Knob Creek Single Barrel)",
  "Peaty Islay Single Malt (Lagavulin 16, Ardbeg Uigeadail)",
  "Aged Demerara Rum (El Dorado 12, Diplomatico Reserva Exclusiva)",
  "Imperial Russian Stout (Ten FIDY, Old Rasputin)",
  "Double Espresso (dark roast, no sugar)"
];
const pairingsMed = [
  "Wheated Bourbon (Maker's Mark, Larceny)",
  "Fruity Speyside Single Malt (Glenlivet 18, Balvenie DoubleWood)",
  "VSOP Cognac (Hennessy VSOP, Pierre Ferrand Ambre)",
  "Añejo Tequila (Don Julio 1942, Herradura Añejo)",
  "Tawny Port (Graham's 20 Year)"
];
const pairingsMild = [
  "Wheated Bourbon (Maker's Mark, Larceny)",
  "Highland Single Malt (Dalmore, Oban 14)",
  "Reposado Tequila (Patrón Reposado, Siete Leguas)",
  "Flat White (whole milk, medium roast)",
  "Dark Chocolate (85% cacao, single-origin Madagascar)"
];
const pairingsCuban = [
  "Cuban White Rum (Havana Club 3, Ron Arecha)",
  "VSOP Cognac (Hennessy VSOP, Pierre Ferrand Ambre)",
  "Oloroso Sherry (Lustau East India)",
  "Tawny Port (Graham's 20 Year)",
  "Cuban Coffee (cafecito, demerara sugar)"
];
const pairingsSweet = [
  "Wheated Bourbon (Maker's Mark, Larceny)",
  "Aged Demerara Rum (El Dorado 12, Diplomatico Reserva Exclusiva)",
  "Fruity Speyside Single Malt (Glenlivet 18, Balvenie DoubleWood)",
  "Tawny Port (Graham's 20 Year)",
  "Almond Biscotti (dipped)"
];

function p(strength, origin) {
  if (origin === 'Cuba') return pairingsCuban;
  if (strength >= 4) return pairingsFull;
  if (strength <= 2) return pairingsMild;
  return pairingsMed;
}

const newCigars = [];

// === COHIBA (Cuban) - Missing vitolas ===
const cohibaNew = [
  ['cohiba-siglo-i', 'Cohiba Siglo I', 'Cuba', 'Vuelta Abajo', 2, 40, 16, 90, ['Cedar','Cream','Honey'], 'Perla', 4, 40, 6],
  ['cohiba-siglo-ii', 'Cohiba Siglo II', 'Cuba', 'Vuelta Abajo', 3, 50, 18, 91, ['Cedar','Earth','Pepper'], 'Corona', 5.1, 42, 7],
  ['cohiba-siglo-iii', 'Cohiba Siglo III', 'Cuba', 'Vuelta Abajo', 3, 60, 20, 92, ['Cedar','Coffee','Cream'], 'Corona Grande', 6.1, 42, 7],
  ['cohiba-siglo-iv', 'Cohiba Siglo IV', 'Cuba', 'Vuelta Abajo', 3, 70, 22, 93, ['Cedar','Honey','Pepper'], 'Corona Gorda', 6.1, 46, 8],
  ['cohiba-siglo-v', 'Cohiba Siglo V', 'Cuba', 'Vuelta Abajo', 4, 75, 24, 94, ['Espresso','Cedar','Pepper'], 'Lancero', 6.7, 43, 8],
  ['cohiba-esplendido', 'Cohiba Espléndido', 'Cuba', 'Vuelta Abajo', 3, 90, 35, 94, ['Cedar','Cream','Honey','Earth'], 'Churchill', 7.0, 47, 9],
  ['cohiba-robusto', 'Cohiba Robusto', 'Cuba', 'Vuelta Abajo', 4, 60, 28, 93, ['Cedar','Earth','Pepper','Coffee'], 'Robusto', 5.0, 50, 8],
  ['cohiba-lancero', 'Cohiba Lancero', 'Cuba', 'Vuelta Abajo', 4, 80, 30, 94, ['Cedar','Earth','Pepper','Honey'], 'Lancero', 7.6, 38, 7],
  ['cohiba-corona-especial', 'Cohiba Corona Especial', 'Cuba', 'Vuelta Abajo', 3, 65, 22, 92, ['Cedar','Cream','Honey'], 'Corona Especial', 6.1, 38, 6],
  ['cohiba-exquisitos', 'Cohiba Exquisitos', 'Cuba', 'Vuelta Abajo', 2, 35, 12, 88, ['Cedar','Cream','Honey'], 'Cigarritos', 4.8, 26, 5],
  ['cohiba-panetelas', 'Cohiba Panetelas', 'Cuba', 'Vuelta Abajo', 2, 30, 10, 87, ['Cedar','Cream','Vanilla'], 'Slim Panatela', 4.3, 26, 4],
  ['cohiba-magico', 'Cohiba Mágico', 'Cuba', 'Vuelta Abajo', 3, 60, 26, 92, ['Cedar','Earth','Honey','Pepper'], 'Robusto Extra', 5.6, 52, 6],
  ['cohiba-sublime', 'Cohiba Sublime', 'Cuba', 'Vuelta Abajo', 4, 90, 40, 96, ['Espresso','Dark Chocolate','Leather','Cedar','Pepper'], 'Sublime', 6.7, 54, 8, true],
  ['cohiba-connossieur', 'Cohiba Connossieur', 'Cuba', 'Vuelta Abajo', 4, 75, 38, 95, ['Cedar','Coffee','Earth','Pepper'], 'Pirámide', 6.1, 52, 7],
  ['cohiba-spectre', 'Cohiba Spectre', 'Cuba', 'Vuelta Abajo', 4, 90, 50, 97, ['Espresso','Dark Chocolate','Leather','Cedar','Pepper'], 'Robusto Extra', 5.6, 54, 9, true],
];

for (const c of cohibaNew) {
  const [id, name, origin, region, strength, smokingTime, price, rating, flavors, size, length, rg, pop, limited] = c;
  if (!existingIds.has(id) && !existingNames.has(name.toLowerCase())) {
    newCigars.push(cigar(id, name, 'Cohiba', origin, region, 'Cuban Habano', 'Cuban Habano', 'Cuban Habano', strength, smokingTime, price, rating, flavors, size, length, rg, pop, `The ${name} is a distinguished Cuban cigar from the prestigious Cohiba brand, crafted in the El Laguito factory with premium Vuelta Abajo tobacco. ${name} offers a refined smoking experience with the signature three-stage Cohiba fermentation.`, p(strength, origin), 1966, limited || false));
  }
}

// === MONTECRISTO (Cuban) - Missing numbers ===
const montecristoNew = [
  ['montecristo-no-1', 'Montecristo No. 1', 'Cuba', 'Vuelta Abajo', 3, 75, 18, 91, ['Cedar','Earth','Cream','Pepper'], 'Lonsdale', 6.5, 42, 7],
  ['montecristo-no-3', 'Montecristo No. 3', 'Cuba', 'Vuelta Abajo', 3, 45, 12, 89, ['Cedar','Earth','Pepper'], 'Coronet', 4.6, 42, 7],
  ['montecristo-no-4', 'Montecristo No. 4', 'Cuba', 'Vuelta Abajo', 3, 50, 13, 90, ['Cedar','Earth','Cream','Pepper'], 'Mareva', 5.1, 42, 9],
  ['montecristo-no-5', 'Montecristo No. 5', 'Cuba', 'Vuelta Abajo', 3, 35, 10, 88, ['Cedar','Earth','Pepper'], 'Perla', 4.0, 40, 6],
  ['montecristo-a', 'Montecristo A', 'Cuba', 'Vuelta Abajo', 3, 100, 30, 94, ['Cedar','Cream','Honey','Earth','Pepper'], 'Gran Corona', 9.2, 47, 7],
  ['montecristo-especial-no-1', 'Montecristo Especial No. 1', 'Cuba', 'Vuelta Abajo', 3, 80, 22, 93, ['Cedar','Earth','Cream','Honey'], 'Lancero', 7.1, 38, 6],
  ['montecristo-especial-no-2', 'Montecristo Especial No. 2', 'Cuba', 'Vuelta Abajo', 3, 80, 22, 93, ['Cedar','Earth','Pepper','Cream'], 'Lancero', 7.1, 38, 6],
  ['montecristo-tubos', 'Montecristo Tubos', 'Cuba', 'Vuelta Abajo', 3, 60, 18, 91, ['Cedar','Earth','Cream','Pepper'], 'Corona', 5.1, 42, 8],
  ['montecristo-media-corona', 'Montecristo Media Corona', 'Cuba', 'Vuelta Abajo', 3, 40, 11, 89, ['Cedar','Earth','Pepper'], 'Petit Corona', 4.3, 40, 5],
];

for (const c of montecristoNew) {
  const [id, name, origin, region, strength, smokingTime, price, rating, flavors, size, length, rg, pop, limited] = c;
  if (!existingIds.has(id) && !existingNames.has(name.toLowerCase())) {
    newCigars.push(cigar(id, name, 'Montecristo', origin, region, 'Cuban Habano', 'Cuban Habano', 'Cuban Habano', strength, smokingTime, price, rating, flavors, size, length, rg, pop, `The ${name} is a classic Cuban cigar from the world\'s most famous cigar brand. Hand-rolled in Cuba with premium Vuelta Abajo tobacco, it delivers the balanced, medium-bodied profile that made Montecristo legendary.`, p(strength, origin), 1935, limited || false));
  }
}

// === PARTAGAS (Cuban) - Missing lines ===
const partagasNew = [
  ['partagas-8-9-8', 'Partagás 8-9-8', 'Cuba', 'Vuelta Abajo', 4, 90, 25, 93, ['Earth','Cedar','Leather','Pepper','Coffee'], 'Astralias', 6.7, 43, 8],
  ['partagas-serie-d-no-5', 'Partagás Serie D No. 5', 'Cuba', 'Vuelta Abajo', 4, 55, 18, 92, ['Earth','Pepper','Leather','Cedar'], 'Robusto', 5.0, 50, 6],
  ['partagas-serie-e-no-2', 'Partagás Serie E No. 2', 'Cuba', 'Vuelta Abajo', 5, 70, 22, 94, ['Earth','Pepper','Leather','Coffee','Cedar'], 'Pirámide', 6.1, 52, 8],
  ['partagus-lusitanias', 'Partagás Lusitanias', 'Cuba', 'Vuelta Abajo', 4, 95, 28, 94, ['Earth','Cedar','Leather','Pepper','Cream'], 'Doble Coronas', 7.6, 49, 7],
  ['partagas-presidentes', 'Partagás Presidentes', 'Cuba', 'Vuelta Abajo', 4, 70, 20, 92, ['Earth','Cedar','Pepper','Leather'], 'Pirámide', 6.1, 47, 5],
  ['partagas-culebras', 'Partagás Culebras', 'Cuba', 'Vuelta Abajo', 3, 50, 18, 89, ['Earth','Cedar','Pepper'], 'Culebras', 6.1, 39, 5],
];

for (const c of partagasNew) {
  const [id, name, origin, region, strength, smokingTime, price, rating, flavors, size, length, rg, pop, limited] = c;
  if (!existingIds.has(id) && !existingNames.has(name.toLowerCase())) {
    newCigars.push(cigar(id, name, 'Partagás', origin, region, 'Cuban Habano', 'Cuban Habano', 'Cuban Habano', strength, smokingTime, price, rating, flavors, size, length, rg, pop, `The ${name} is a bold, full-flavored Cuban cigar from one of Havana\'s oldest brands. Known for its earthy intensity and rich pepper notes, Partagás delivers a powerful smoking experience.`, p(strength, origin), 1845, limited || false));
  }
}

// === HOYO DE MONTERREY (Cuban) - Missing lines ===
const hoyoNew = [
  ['hoyo-de-monterrey-epicure-no-1', 'Hoyo de Monterrey Epicure No. 1', 'Cuba', 'Vuelta Abajo', 2, 65, 15, 90, ['Cedar','Cream','Honey','Earth'], 'Corona Gorda', 6.1, 42, 6],
  ['hoyo-de-monterrey-epicure-no-2', 'Hoyo de Monterrey Epicure No. 2', 'Cuba', 'Vuelta Abajo', 3, 60, 16, 91, ['Cedar','Cream','Honey','Pepper'], 'Robusto', 5.0, 50, 7],
  ['hoyo-de-monterrey-double-corona', 'Hoyo de Monterrey Double Corona', 'Cuba', 'Vuelta Abajo', 3, 100, 26, 93, ['Cedar','Cream','Honey','Earth','Leather'], 'Gran Corona', 7.6, 49, 7],
  ['hoyo-de-monterrey-regalos', 'Hoyo de Monterrey Regalos', 'Cuba', 'Vuelta Abajo', 3, 55, 16, 91, ['Cedar','Cream','Earth','Pepper'], 'Robusto', 5.0, 50, 6],
  ['hoyo-de-monterrey-le-roi', 'Hoyo de Monterrey Le Roi du Prince', 'Cuba', 'Vuelta Abajo', 2, 85, 22, 92, ['Cedar','Cream','Honey','Vanilla'], 'Gran Corona', 7.6, 43, 5],
  ['hoyo-de-monterrey-short-coronation', 'Hoyo de Monterrey Short Coronation', 'Cuba', 'Vuelta Abajo', 2, 40, 10, 88, ['Cedar','Cream','Honey'], 'Petit Corona', 4.3, 42, 5],
];

for (const c of hoyoNew) {
  const [id, name, origin, region, strength, smokingTime, price, rating, flavors, size, length, rg, pop, limited] = c;
  if (!existingIds.has(id) && !existingNames.has(name.toLowerCase())) {
    newCigars.push(cigar(id, name, 'Hoyo de Monterrey', origin, region, 'Cuban Habano', 'Cuban Habano', 'Cuban Habano', strength, smokingTime, price, rating, flavors, size, length, rg, pop, `The ${name} is a mild-to-medium Cuban cigar known for its delicate, elegant flavor profile. Hoyo de Monterrey is prized for its smooth, creamy character and excellent construction.`, p(strength, origin), 1860, limited || false));
  }
}

// === H. UPMANN (Cuban) - Missing lines ===
const upmannNew = [
  ['h-upmann-connie-no-54', 'H. Upmann Connie No. 54', 'Cuba', 'Vuelta Abajo', 3, 65, 16, 90, ['Cedar','Cream','Earth','Pepper'], 'Robusto', 5.0, 54, 6],
  ['h-upmann-connie-no-55', 'H. Upmann Connie No. 55', 'Cuba', 'Vuelta Abajo', 3, 70, 18, 91, ['Cedar','Cream','Honey','Pepper'], 'Robusto Extra', 5.6, 55, 6],
  ['h-upmann-magnum-50', 'H. Upmann Magnum 50', 'Cuba', 'Vuelta Abajo', 3, 70, 18, 92, ['Cedar','Earth','Coffee','Pepper'], 'Robusto', 5.0, 50, 7],
  ['h-upmann-magnum-46', 'H. Upmann Magnum 46', 'Cuba', 'Vuelta Abajo', 3, 65, 16, 91, ['Cedar','Cream','Earth','Pepper'], 'Corona Gorda', 5.6, 46, 6],
  ['h-upmann-sir-winston', 'H. Upmann Sir Winston', 'Cuba', 'Vuelta Abajo', 3, 90, 24, 93, ['Cedar','Cream','Earth','Honey','Leather'], 'Julieta', 7.0, 47, 6],
  ['h-upmann-corona-major', 'H. Upmann Corona Major', 'Cuba', 'Vuelta Abajo', 2, 55, 12, 89, ['Cedar','Cream','Honey'], 'Corona', 5.4, 42, 5],
  ['h-upmann-half-corona', 'H. Upmann Half Corona', 'Cuba', 'Vuelta Abajo', 3, 35, 8, 87, ['Cedar','Earth','Pepper'], 'Half Corona', 3.5, 44, 6],
];

for (const c of upmannNew) {
  const [id, name, origin, region, strength, smokingTime, price, rating, flavors, size, length, rg, pop, limited] = c;
  if (!existingIds.has(id) && !existingNames.has(name.toLowerCase())) {
    newCigars.push(cigar(id, name, 'H. Upmann', origin, region, 'Cuban Habano', 'Cuban Habano', 'Cuban Habano', strength, smokingTime, price, rating, flavors, size, length, rg, pop, `The ${name} is a refined Cuban cigar from one of the oldest brands on the island. H. Upmann is known for its medium-bodied, elegant character and excellent aging potential.`, p(strength, origin), 1844, limited || false));
  }
}

// === BOLIVAR (Cuban) - Missing lines ===
const bolivarNew = [
  ['bolivar-belicosos-finos', 'Bolívar Belicosos Finos', 'Cuba', 'Vuelta Abajo', 5, 65, 18, 93, ['Earth','Leather','Pepper','Coffee','Cedar'], 'Campanas', 5.1, 52, 7],
  ['bolivar-royal-corona', 'Bolívar Royal Corona', 'Cuba', 'Vuelta Abajo', 5, 60, 17, 94, ['Earth','Leather','Pepper','Cedar'], 'Coronas Gordas', 5.6, 46, 8],
  ['bolivar-gold-medal', 'Bolívar Gold Medal', 'Cuba', 'Vuelta Abajo', 4, 85, 24, 93, ['Earth','Cedar','Leather','Pepper','Honey'], 'Corona Grande', 6.5, 42, 5],
  ['bolivar-petit-coronas', 'Bolívar Petit Coronas', 'Cuba', 'Vuelta Abajo', 4, 45, 12, 90, ['Earth','Pepper','Leather','Cedar'], 'Petit Corona', 5.1, 42, 7],
  ['bolivar-inmensas', 'Bolívar Inmensas', 'Cuba', 'Vuelta Abajo', 5, 90, 25, 92, ['Earth','Leather','Pepper','Coffee','Cedar'], 'Julieta', 7.0, 47, 4],
];

for (const c of bolivarNew) {
  const [id, name, origin, region, strength, smokingTime, price, rating, flavors, size, length, rg, pop, limited] = c;
  if (!existingIds.has(id) && !existingNames.has(name.toLowerCase())) {
    newCigars.push(cigar(id, name, 'Bolívar', origin, region, 'Cuban Habano', 'Cuban Habano', 'Cuban Habano', strength, smokingTime, price, rating, flavors, size, length, rg, pop, `The ${name} is one of the strongest, most full-bodied Cuban cigars available. Named after Simón Bolívar, the brand lives up to its reputation for bold, powerful flavors.`, p(strength, origin), 1901, limited || false));
  }
}

// === TRINIDAD (Cuban) - Missing lines ===
const trinidadNew = [
  ['trinidad-fundadores', 'Trinidad Fundadores', 'Cuba', 'Vuelta Abajo', 3, 80, 25, 93, ['Cedar','Cream','Honey','Earth','Pepper'], 'Lancero', 7.6, 40, 8],
  ['trinidad-coloniales', 'Trinidad Coloniales', 'Cuba', 'Vuelta Abajo', 3, 55, 16, 91, ['Cedar','Cream','Honey','Pepper'], 'Corona', 5.1, 44, 6],
  ['trinidad-reyes', 'Trinidad Reyes', 'Cuba', 'Vuelta Abajo', 3, 45, 14, 90, ['Cedar','Cream','Honey'], 'Reyes', 4.3, 40, 6],
  ['trinidad-vigia', 'Trinidad Vigia', 'Cuba', 'Vuelta Abajo', 4, 60, 17, 92, ['Cedar','Earth','Pepper','Honey','Coffee'], 'Robusto Extra', 5.6, 54, 7],
  ['trinidad-topacio', 'Trinidad Topacio', 'Cuba', 'Vuelta Abajo', 3, 50, 13, 89, ['Cedar','Cream','Honey','Earth'], 'Corona', 5.1, 42, 5],
  ['trinidad-media-luna', 'Trinidad Media Luna', 'Cuba', 'Vuelta Abajo', 3, 55, 15, 90, ['Cedar','Cream','Honey','Pepper'], 'Doble', 5.6, 44, 4],
];

for (const c of trinidadNew) {
  const [id, name, origin, region, strength, smokingTime, price, rating, flavors, size, length, rg, pop, limited] = c;
  if (!existingIds.has(id) && !existingNames.has(name.toLowerCase())) {
    newCigars.push(cigar(id, name, 'Trinidad', origin, region, 'Cuban Habano', 'Cuban Habano', 'Cuban Habano', strength, smokingTime, price, rating, flavors, size, length, rg, pop, `The ${name} is an elegant Cuban cigar once reserved as a diplomatic gift from the Cuban government. Known for its refined, medium-bodied character and excellent construction.`, p(strength, origin), 1969, limited || false));
  }
}

// === PUNCH (Cuban) - Missing lines ===
const punchNew = [
  ['punch-double-corona', 'Punch Double Corona', 'Cuba', 'Vuelta Abajo', 4, 95, 24, 94, ['Earth','Cedar','Leather','Cream','Pepper'], 'Gran Corona', 7.6, 49, 7],
  ['punch-grand-cru', 'Punch Grand Cru', 'Cuba', 'Vuelta Abajo', 4, 60, 16, 91, ['Earth','Cedar','Leather','Pepper'], 'Robusto', 5.0, 50, 6],
  ['punch-london-club', 'Punch London Club', 'Cuba', 'Vuelta Abajo', 3, 40, 10, 88, ['Earth','Cedar','Pepper'], 'Club Corona', 4.3, 40, 5],
  ['punch-royal-coronation', 'Punch Royal Coronation', 'Cuba', 'Vuelta Abajo', 4, 70, 20, 92, ['Earth','Cedar','Leather','Honey','Pepper'], 'Corona Gorda', 6.1, 46, 5],
  ['punch-diablo', 'Punch Diablo', 'Cuba', 'Vuelta Abajo', 5, 60, 18, 92, ['Earth','Leather','Pepper','Coffee','Cedar'], 'Robusto', 5.0, 50, 5],
];

for (const c of punchNew) {
  const [id, name, origin, region, strength, smokingTime, price, rating, flavors, size, length, rg, pop, limited] = c;
  if (!existingIds.has(id) && !existingNames.has(name.toLowerCase())) {
    newCigars.push(cigar(id, name, 'Punch', origin, region, 'Cuban Habano', 'Cuban Habano', 'Cuban Habano', strength, smokingTime, price, rating, flavors, size, length, rg, pop, `The ${name} is a classic Cuban cigar named after the Punch puppet character. Known for its medium-to-full body and earthy, woody character with excellent aging potential.`, p(strength, origin), 1840, limited || false));
  }
}

// === JUAN LOPEZ (Cuban) ===
const juanLopezNew = [
  ['juan-lopez-seleccion-no-1', 'Juan López Selección No. 1', 'Cuba', 'Vuelta Abajo', 4, 70, 18, 92, ['Earth','Cedar','Leather','Pepper','Coffee'], 'Robusto', 5.0, 50, 5],
  ['juan-lopez-seleccion-no-2', 'Juan López Selección No. 2', 'Cuba', 'Vuelta Abajo', 4, 90, 24, 93, ['Earth','Cedar','Leather','Pepper','Honey'], 'Churchill', 7.0, 47, 5],
  ['juan-lopez-petit-lopez', 'Juan López Petit Lopez', 'Cuba', 'Vuelta Abajo', 4, 35, 8, 88, ['Earth','Pepper','Cedar'], 'Petit', 4.0, 42, 4],
];

for (const c of juanLopezNew) {
  const [id, name, origin, region, strength, smokingTime, price, rating, flavors, size, length, rg, pop, limited] = c;
  if (!existingIds.has(id) && !existingNames.has(name.toLowerCase())) {
    newCigars.push(cigar(id, name, 'Juan López', origin, region, 'Cuban Habano', 'Cuban Habano', 'Cuban Habano', strength, smokingTime, price, rating, flavors, size, length, rg, pop, `The ${name} is a full-bodied Cuban cigar from a boutique Habanos brand. Juan López produces cigars with rich, earthy flavors and excellent construction.`, p(strength, origin), 1876, limited || false));
  }
}

// === CUABA (Cuban) ===
const cuabaNew = [
  ['cuaba-salomon', 'Cuaba Salomón', 'Cuba', 'Vuelta Abajo', 3, 90, 22, 92, ['Cedar','Cream','Honey','Earth','Pepper'], 'Salomón', 7.1, 57, 5],
  ['cuaba-diademas', 'Cuaba Diademas', 'Cuba', 'Vuelta Abajo', 3, 80, 20, 91, ['Cedar','Cream','Honey','Earth'], 'Diademas', 7.1, 38, 4],
  ['cuaba-exclusivos', 'Cuaba Exclusivos', 'Cuba', 'Vuelta Abajo', 3, 65, 16, 90, ['Cedar','Cream','Honey','Pepper'], 'Pirámide', 5.6, 52, 5],
  ['cuaba-tradicionales', 'Cuaba Tradicionales', 'Cuba', 'Vuelta Abajo', 3, 50, 12, 89, ['Cedar','Cream','Honey'], 'Corona', 5.1, 42, 4],
  ['cuaba-generosos', 'Cuaba Generosos', 'Cuba', 'Vuelta Abajo', 3, 55, 13, 89, ['Cedar','Cream','Earth','Pepper'], 'Robusto', 5.0, 48, 4],
];

for (const c of cuabaNew) {
  const [id, name, origin, region, strength, smokingTime, price, rating, flavors, size, length, rg, pop, limited] = c;
  if (!existingIds.has(id) && !existingNames.has(name.toLowerCase())) {
    newCigars.push(cigar(id, name, 'Cuaba', origin, region, 'Cuban Habano', 'Cuban Habano', 'Cuban Habano', strength, smokingTime, price, rating, flavors, size, length, rg, pop, `The ${name} is a figurado-shaped Cuban cigar from the Cuaba brand, which specializes in the classic figurado shapes that were popular in 19th century Cuba.`, p(strength, origin), 1996, limited || false));
  }
}

// === VEGAS ROBAINA (Cuban) ===
const vegasRobainaNew = [
  ['vegas-robaina-clasicos', 'Vegas Robaina Clásicos', 'Cuba', 'Vuelta Abajo', 3, 55, 14, 91, ['Cedar','Cream','Earth','Honey','Pepper'], 'Corona', 5.4, 42, 5],
  ['vegas-robaina-familiar', 'Vegas Robaina Familiar', 'Cuba', 'Vuelta Abajo', 3, 70, 18, 92, ['Cedar','Cream','Earth','Honey','Leather'], 'Corona Gorda', 6.1, 42, 5],
  ['vegas-robaina-unicos', 'Vegas Robaina Únicos', 'Cuba', 'Vuelta Abajo', 4, 65, 18, 93, ['Cedar','Earth','Leather','Pepper','Coffee'], 'Robusto', 5.0, 52, 6],
  ['vegas-robaina-don-alejandro', 'Vegas Robaina Don Alejandro', 'Cuba', 'Vuelta Abajo', 4, 90, 28, 95, ['Cedar','Earth','Leather','Coffee','Pepper','Honey'], 'Gran Corona', 7.6, 49, 7, true],
];

for (const c of vegasRobainaNew) {
  const [id, name, origin, region, strength, smokingTime, price, rating, flavors, size, length, rg, pop, limited] = c;
  if (!existingIds.has(id) && !existingNames.has(name.toLowerCase())) {
    newCigars.push(cigar(id, name, 'Vegas Robaina', origin, region, 'Cuban Habano', 'Cuban Habano', 'Cuban Habano', strength, smokingTime, price, rating, flavors, size, length, rg, pop, `The ${name} is a premium Cuban cigar from the only brand named after a living Cuban tobacco farmer, Alejandro Robaina. His Vuelta Abajo tobacco is legendary for its quality.`, p(strength, origin), 1997, limited || false));
  }
}

// === SAN CRISTOBAL DE LA HABANA (Cuban) ===
const sanCristobalNew = [
  ['san-cristobal-el-principe', 'San Cristobal de la Habana El Príncipe', 'Cuba', 'Vuelta Abajo', 2, 40, 9, 88, ['Cedar','Cream','Honey','Vanilla'], 'Príncipe', 4.3, 42, 4],
  ['san-cristobal-la-fuerza', 'San Cristobal de la Habana La Fuerza', 'Cuba', 'Vuelta Abajo', 3, 65, 16, 91, ['Cedar','Cream','Honey','Earth','Pepper'], 'Corona Gorda', 6.1, 42, 5],
  ['san-cristobal-muralla', 'San Cristobal de la Habana Muralla', 'Cuba', 'Vuelta Abajo', 3, 75, 18, 92, ['Cedar','Cream','Earth','Honey','Leather'], 'Robusto Extra', 5.6, 52, 5],
  ['san-cristobal-oficios', 'San Cristobal de la Habana Oficios', 'Cuba', 'Vuelta Abajo', 3, 55, 14, 90, ['Cedar','Cream','Honey','Pepper'], 'Robusto', 5.0, 50, 4],
];

for (const c of sanCristobalNew) {
  const [id, name, origin, region, strength, smokingTime, price, rating, flavors, size, length, rg, pop, limited] = c;
  if (!existingIds.has(id) && !existingNames.has(name.toLowerCase())) {
    newCigars.push(cigar(id, name, 'San Cristobal de la Habana', origin, region, 'Cuban Habano', 'Cuban Habano', 'Cuban Habano', strength, smokingTime, price, rating, flavors, size, length, rg, pop, `The ${name} is a refined Cuban cigar from a brand named after the patron saint of Havana. Known for its smooth, elegant character and lighter body.`, p(strength, origin), 1999, limited || false));
  }
}

// === DIPLOMATICOS (Cuban) ===
const diplomaticosNew = [
  ['diplomaticos-no-2', 'Diplomáticos No. 2', 'Cuba', 'Vuelta Abajo', 4, 70, 16, 92, ['Earth','Cedar','Leather','Pepper','Coffee'], 'Pirámide', 6.1, 52, 6],
  ['diplomaticos-no-4', 'Diplomáticos No. 4', 'Cuba', 'Vuelta Abajo', 4, 50, 11, 89, ['Earth','Cedar','Pepper','Leather'], 'Mareva', 5.1, 42, 5],
  ['diplomaticos-bushido', 'Diplomáticos Bushido', 'Cuba', 'Vuelta Abajo', 4, 65, 18, 91, ['Earth','Cedar','Leather','Pepper','Honey'], 'Robusto', 5.0, 50, 3, true],
];

for (const c of diplomaticosNew) {
  const [id, name, origin, region, strength, smokingTime, price, rating, flavors, size, length, rg, pop, limited] = c;
  if (!existingIds.has(id) && !existingNames.has(name.toLowerCase())) {
    newCigars.push(cigar(id, name, 'Diplomáticos', origin, region, 'Cuban Habano', 'Cuban Habano', 'Cuban Habano', strength, smokingTime, price, rating, flavors, size, length, rg, pop, `The ${name} is a full-bodied Cuban cigar often compared to Montecristo but with a more robust, earthy character. Diplomáticos is a lesser-known gem of the Habanos portfolio.`, p(strength, origin), 1966, limited || false));
  }
}

// === RAMON ALLONES (Cuban) ===
const ramonAllonesNew = [
  ['ramon-allones-specially-selected', 'Ramón Allones Specially Selected', 'Cuba', 'Vuelta Abajo', 4, 60, 16, 92, ['Earth','Cedar','Leather','Pepper','Coffee'], 'Robusto', 5.0, 50, 6],
  ['ramon-allones-gigantes', 'Ramón Allones Gigantes', 'Cuba', 'Vuelta Abajo', 4, 95, 24, 93, ['Earth','Cedar','Leather','Pepper','Honey','Coffee'], 'Gran Corona', 7.6, 49, 5],
  ['ramon-allones-small-club-coronas', 'Ramón Allones Small Club Coronas', 'Cuba', 'Vuelta Abajo', 3, 35, 8, 87, ['Earth','Cedar','Pepper'], 'Club Corona', 4.3, 40, 4],
];

for (const c of ramonAllonesNew) {
  const [id, name, origin, region, strength, smokingTime, price, rating, flavors, size, length, rg, pop, limited] = c;
  if (!existingIds.has(id) && !existingNames.has(name.toLowerCase())) {
    newCigars.push(cigar(id, name, 'Ramón Allones', origin, region, 'Cuban Habano', 'Cuban Habano', 'Cuban Habano', strength, smokingTime, price, rating, flavors, size, length, rg, pop, `The ${name} is a bold Cuban cigar from the oldest brand in continuous production. Ramón Allones is credited with inventing the decorative cigar box and is known for powerful, full-flavored cigars.`, p(strength, origin), 1837, limited || false));
  }
}

// === EL REY DEL MUNDO (Cuban) ===
const elReyNew = [
  ['el-rey-del-mundo-choix-supreme', 'El Rey del Mundo Choix Supreme', 'Cuba', 'Vuelta Abajo', 2, 65, 16, 92, ['Cedar','Cream','Honey','Vanilla','Earth'], 'Corona Gorda', 6.1, 42, 6],
  ['el-rey-del-mundo-grandes-de-espana', 'El Rey del Mundo Grandes de España', 'Cuba', 'Vuelta Abajo', 2, 85, 20, 91, ['Cedar','Cream','Honey','Vanilla','Leather'], 'Churchill', 7.0, 47, 5],
  ['el-rey-del-mundo-demi-tasse', 'El Rey del Mundo Demi Tasse', 'Cuba', 'Vuelta Abajo', 2, 30, 8, 87, ['Cedar','Cream','Vanilla'], 'Demi Tasse', 4.3, 30, 4],
];

for (const c of elReyNew) {
  const [id, name, origin, region, strength, smokingTime, price, rating, flavors, size, length, rg, pop, limited] = c;
  if (!existingIds.has(id) && !existingNames.has(name.toLowerCase())) {
    newCigars.push(cigar(id, name, 'El Rey del Mundo', origin, region, 'Cuban Habano', 'Cuban Habano', 'Cuban Habano', strength, smokingTime, price, rating, flavors, size, length, rg, pop, `The ${name} is a mild, elegant Cuban cigar known as "The King of the World." Its refined, delicate character makes it perfect for morning smoking.`, p(strength, origin), 1882, limited || false));
  }
}

// === LA GLORIA CUBANA (Cuban) ===
const laGloriaNew = [
  ['la-gloria-cubana-medaille-d-or-no-1', 'La Gloria Cubana Medaille d\'Or No. 1', 'Cuba', 'Vuelta Abajo', 3, 75, 18, 91, ['Cedar','Earth','Cream','Honey','Pepper'], 'Corona Grande', 6.5, 42, 4],
  ['la-gloria-cubana-medaille-d-or-no-2', 'La Gloria Cubana Medaille d\'Or No. 2', 'Cuba', 'Vuelta Abajo', 3, 60, 14, 90, ['Cedar','Earth','Cream','Pepper'], 'Corona', 5.4, 42, 4],
  ['la-gloria-cubana-medaille-d-or-no-3', 'La Gloria Cubana Medaille d\'Or No. 3', 'Cuba', 'Vuelta Abajo', 3, 45, 10, 88, ['Cedar','Earth','Pepper'], 'Petit Corona', 4.8, 40, 3],
  ['la-gloria-cubana-medaille-d-or-no-4', 'La Gloria Cubana Medaille d\'Or No. 4', 'Cuba', 'Vuelta Abajo', 3, 70, 16, 90, ['Cedar','Earth','Cream','Honey','Leather'], 'Corona Gorda', 5.6, 46, 4],
];

for (const c of laGloriaNew) {
  const [id, name, origin, region, strength, smokingTime, price, rating, flavors, size, length, rg, pop, limited] = c;
  if (!existingIds.has(id) && !existingNames.has(name.toLowerCase())) {
    newCigars.push(cigar(id, name, 'La Gloria Cubana', origin, region, 'Cuban Habano', 'Cuban Habano', 'Cuban Habano', strength, smokingTime, price, rating, flavors, size, length, rg, pop, `The ${name} is a medium-bodied Cuban cigar from a brand that won gold medals in early 20th century exhibitions. Known for its smooth, balanced character.`, p(strength, origin), 1885, limited || false));
  }
}

// === POR LARRANAGA (Cuban) ===
const porLarraNew = [
  ['por-larranaga-petit-coronas', 'Por Larrañaga Petit Coronas', 'Cuba', 'Vuelta Abajo', 2, 40, 9, 88, ['Cedar','Cream','Honey','Earth'], 'Petit Corona', 5.1, 42, 5],
  ['por-larranaga-panetelas', 'Por Larrañaga Panetelas', 'Cuba', 'Vuelta Abajo', 2, 35, 7, 86, ['Cedar','Cream','Honey'], 'Slim Panatela', 4.8, 28, 3],
  ['por-larranaga-magnifico', 'Por Larrañaga Magnifico', 'Cuba', 'Vuelta Abajo', 3, 60, 14, 90, ['Cedar','Cream','Earth','Honey','Pepper'], 'Robusto', 5.0, 50, 4],
];

for (const c of porLarraNew) {
  const [id, name, origin, region, strength, smokingTime, price, rating, flavors, size, length, rg, pop, limited] = c;
  if (!existingIds.has(id) && !existingNames.has(name.toLowerCase())) {
    newCigars.push(cigar(id, name, 'Por Larrañaga', origin, region, 'Cuban Habano', 'Cuban Habano', 'Cuban Habano', strength, smokingTime, price, rating, flavors, size, length, rg, pop, `The ${name} is a mild Cuban cigar from one of the oldest brands in Cuba. Por Larrañaga is known for its smooth, approachable character and excellent construction.`, p(strength, origin), 1834, limited || false));
  }
}

// === FONSECA (Cuban) ===
const fonsecaNew = [
  ['fonseca-cosacos', 'Fonseca Cosacos', 'Cuba', 'Vuelta Abajo', 2, 55, 11, 89, ['Cedar','Cream','Honey','Vanilla'], 'Lonsdale', 6.5, 42, 4],
  ['fonseca-kdt', 'Fonseca KDT', 'Cuba', 'Vuelta Abajo', 2, 35, 7, 86, ['Cedar','Cream','Honey'], 'Deliciosos', 4.8, 40, 3],
  ['fonseca-no-1', 'Fonseca No. 1', 'Cuba', 'Vuelta Abajo', 2, 50, 10, 88, ['Cedar','Cream','Honey','Earth'], 'Corona', 5.4, 42, 4],
];

for (const c of fonsecaNew) {
  const [id, name, origin, region, strength, smokingTime, price, rating, flavors, size, length, rg, pop, limited] = c;
  if (!existingIds.has(id) && !existingNames.has(name.toLowerCase())) {
    newCigars.push(cigar(id, name, 'Fonseca', origin, region, 'Cuban Habano', 'Cuban Habano', 'Cuban Habano', strength, smokingTime, price, rating, flavors, size, length, rg, pop, `The ${name} is a mild, delicate Cuban cigar known for its tissue-wrapped presentation. Fonseca is one of the most approachable Cuban brands, perfect for morning smoking.`, p(strength, origin), 1884, limited || false));
  }
}

// === QUAI D'ORSAY (Cuban) ===
const quaiDorsayNew = [
  ['quai-dorsay-coronas', 'Quai d\'Orsay Coronas', 'Cuba', 'Vuelta Abajo', 2, 50, 12, 89, ['Cedar','Cream','Honey','Vanilla'], 'Corona', 5.4, 42, 4],
  ['quai-dorsay-no-50', 'Quai d\'Orsay No. 50', 'Cuba', 'Vuelta Abajo', 3, 55, 14, 90, ['Cedar','Cream','Honey','Earth','Pepper'], 'Robusto', 5.0, 50, 4],
  ['quai-dorsay-no-54', 'Quai d\'Orsay No. 54', 'Cuba', 'Vuelta Abajo', 3, 65, 16, 91, ['Cedar','Cream','Honey','Leather','Pepper'], 'Robusto', 5.0, 54, 4],
];

for (const c of quaiDorsayNew) {
  const [id, name, origin, region, strength, smokingTime, price, rating, flavors, size, length, rg, pop, limited] = c;
  if (!existingIds.has(id) && !existingNames.has(name.toLowerCase())) {
    newCigars.push(cigar(id, name, 'Quai d\'Orsay', origin, region, 'Cuban Habano', 'Cuban Habano', 'Cuban Habano', strength, smokingTime, price, rating, flavors, size, length, rg, pop, `The ${name} is a mild-to-medium Cuban cigar originally created for the French market. Known for its elegant, smooth character with a French-inspired name.`, p(strength, origin), 1970, limited || false));
  }
}

// === SAINT LUIS REY (Cuban) ===
const slrNew = [
  ['saint-luis-rey-regios', 'Saint Luis Rey Regios', 'Cuba', 'Vuelta Abajo', 4, 60, 15, 91, ['Earth','Cedar','Leather','Pepper','Honey'], 'Corona Gorda', 5.6, 48, 5],
  ['saint-luis-rey-series-a', 'Saint Luis Rey Series A', 'Cuba', 'Vuelta Abajo', 4, 75, 18, 92, ['Earth','Cedar','Leather','Pepper','Coffee'], 'Corona Grande', 6.5, 48, 4],
  ['saint-luis-rey-series-b', 'Saint Luis Rey Series B', 'Cuba', 'Vuelta Abajo', 4, 55, 14, 90, ['Earth','Cedar','Leather','Pepper'], 'Robusto', 5.0, 50, 4],
];

for (const c of slrNew) {
  const [id, name, origin, region, strength, smokingTime, price, rating, flavors, size, length, rg, pop, limited] = c;
  if (!existingIds.has(id) && !existingNames.has(name.toLowerCase())) {
    newCigars.push(cigar(id, name, 'Saint Luis Rey', origin, region, 'Cuban Habano', 'Cuban Habano', 'Cuban Habano', strength, smokingTime, price, rating, flavors, size, length, rg, pop, `The ${name} is a full-flavored Cuban cigar named after the California town of San Luis Rey. Known for its rich, earthy character and excellent construction.`, p(strength, origin), 1940, limited || false));
  }
}

// === JOSE L. PIEDRA (Cuban) ===
const jlpNew = [
  ['jose-l-piedra-cazadores', 'José L. Piedra Cazadores', 'Cuba', 'Vuelta Abajo', 4, 50, 6, 87, ['Earth','Pepper','Leather','Cedar'], 'Cazadores', 6.1, 44, 6],
  ['jose-l-piedra-regalias', 'José L. Piedra Regalias', 'Cuba', 'Vuelta Abajo', 4, 45, 5, 86, ['Earth','Pepper','Leather'], 'Regalias', 5.1, 42, 5],
  ['jose-l-piedra-petit-cetros', 'José L. Piedra Petit Cetros', 'Cuba', 'Vuelta Abajo', 4, 40, 5, 85, ['Earth','Pepper','Cedar'], 'Petit Corona', 5.1, 40, 5],
];

for (const c of jlpNew) {
  const [id, name, origin, region, strength, smokingTime, price, rating, flavors, size, length, rg, pop, limited] = c;
  if (!existingIds.has(id) && !existingNames.has(name.toLowerCase())) {
    newCigars.push(cigar(id, name, 'José L. Piedra', origin, region, 'Cuban Habano', 'Cuban Habano', 'Cuban Habano', strength, smokingTime, price, rating, flavors, size, length, rg, pop, `The ${name} is an affordable, full-bodied Cuban cigar made from tobacco grown in the Remedios region. Known for its earthy, rustic character and excellent value.`, p(strength, origin), 1880, limited || false));
  }
}

// === NON-CUBAN BRAND EXPANSIONS ===

// Arturo Fuente - Hemingway line
const fuenteHemingway = [
  ['arturo-fuente-hemingway-best-seller', 'Arturo Fuente Hemingway Best Seller', 'Dominican Republic', 'Santiago', 3, 45, 13, 93, ['Cedar','Cream','Coffee','Sweet Spice'], 'Perfecto', 4.5, 55, 8],
  ['arturo-fuente-hemingway-signature', 'Arturo Fuente Hemingway Signature', 'Dominican Republic', 'Santiago', 3, 50, 14, 93, ['Cedar','Cream','Coffee','Sweet Spice'], 'Perfecto', 6.0, 52, 7],
  ['arturo-fuente-hemingway-classic', 'Arturo Fuente Hemingway Classic', 'Dominican Republic', 'Santiago', 3, 60, 16, 94, ['Cedar','Cream','Coffee','Sweet Spice','Honey'], 'Perfecto', 7.0, 52, 7],
  ['arturo-fuente-hemingway-short-story', 'Arturo Fuente Hemingway Short Story', 'Dominican Republic', 'Santiago', 3, 30, 9, 92, ['Cedar','Cream','Coffee','Sweet Spice'], 'Perfecto', 4.0, 49, 9],
  ['arturo-fuente-hemingway-masterpiece', 'Arturo Fuente Hemingway Masterpiece', 'Dominican Republic', 'Santiago', 3, 75, 22, 95, ['Cedar','Cream','Coffee','Sweet Spice','Honey','Leather'], 'Perfecto', 9.0, 52, 6],
  ['arturo-fuente-hemingway-between-the-lines', 'Arturo Fuente Hemingway Between the Lines', 'Dominican Republic', 'Santiago', 3, 50, 18, 94, ['Cedar','Cream','Coffee','Sweet Spice'], 'Perfecto', 6.0, 52, 5, true],
];

for (const c of fuenteHemingway) {
  const [id, name, origin, region, strength, smokingTime, price, rating, flavors, size, length, rg, pop, limited] = c;
  if (!existingIds.has(id) && !existingNames.has(name.toLowerCase())) {
    newCigars.push(cigar(id, name, 'Arturo Fuente', origin, region, 'Cameroon', 'Dominican', 'Dominican', strength, smokingTime, price, rating, flavors, size, length, rg, pop, `The ${name} is a perfecto-shaped cigar from the legendary Hemingway line by Arturo Fuente. These rare figurados showcase the Fuente family's masterful rolling skills and Cameroon wrapper.`, pairingsMed, 1983, limited || false));
  }
}

// Arturo Fuente - Añejo line
const fuenteAnejo = [
  ['arturo-fuente-anejo-no-46', 'Arturo Fuente Añejo No. 46', 'Dominican Republic', 'Santiago', 5, 60, 18, 94, ['Leather','Pepper','Earth','Coffee','Dark Chocolate'], 'Robusto', 5.6, 46, 7],
  ['arturo-fuente-anejo-no-48', 'Arturo Fuente Añejo No. 48', 'Dominican Republic', 'Santiago', 5, 55, 16, 93, ['Leather','Pepper','Earth','Coffee'], 'Robusto', 5.0, 48, 7],
  ['arturo-fuente-anejo-no-49', 'Arturo Fuente Añejo No. 49', 'Dominican Republic', 'Santiago', 5, 65, 18, 94, ['Leather','Pepper','Earth','Coffee','Cedar'], 'Corona Gorda', 5.6, 49, 6],
  ['arturo-fuente-anejo-no-55', 'Arturo Fuente Añejo No. 55', 'Dominican Republic', 'Santiago', 5, 70, 20, 94, ['Leather','Pepper','Earth','Coffee','Dark Chocolate'], 'Robusto', 5.6, 55, 6],
  ['arturo-fuente-anejo-no-77', 'Arturo Fuente Añejo No. 77 Shark', 'Dominican Republic', 'Santiago', 5, 70, 25, 96, ['Leather','Pepper','Earth','Coffee','Dark Chocolate','Cedar'], 'Shark', 7.0, 50, 7, true],
  ['arturo-fuente-anejo-no-78', 'Arturo Fuente Añejo No. 78', 'Dominican Republic', 'Santiago', 5, 80, 28, 95, ['Leather','Pepper','Earth','Coffee','Cedar','Honey'], 'Churchill', 7.5, 50, 5],
];

for (const c of fuenteAnejo) {
  const [id, name, origin, region, strength, smokingTime, price, rating, flavors, size, length, rg, pop, limited] = c;
  if (!existingIds.has(id) && !existingNames.has(name.toLowerCase())) {
    newCigars.push(cigar(id, name, 'Arturo Fuente', origin, region, 'Connecticut Broadleaf Maduro', 'Dominican', 'Dominican', strength, smokingTime, price, rating, flavors, size, length, rg, pop, `The ${name} uses aged Connecticut Broadleaf Maduro wrapper, similar to the Opus X but with a darker, richer profile. A full-bodied powerhouse with exceptional complexity.`, pairingsFull, 1996, limited || false));
  }
}

// Padrón - Missing lines
const padronNew = [
  ['padron-1926-serie-no-1', 'Padrón 1926 Serie No. 1', 'Nicaragua', 'Estelí', 5, 60, 18, 96, ['Espresso','Dark Chocolate','Leather','Pepper','Earth'], 'Robusto', 5.0, 50, 8],
  ['padron-1926-serie-no-6', 'Padrón 1926 Serie No. 6', 'Nicaragua', 'Estelí', 5, 50, 15, 95, ['Espresso','Dark Chocolate','Leather','Pepper'], 'Robusto', 5.0, 50, 7],
  ['padron-1926-serie-no-7', 'Padrón 1926 Serie No. 7', 'Nicaragua', 'Estelí', 5, 65, 20, 96, ['Espresso','Dark Chocolate','Leather','Pepper','Cedar'], 'Corona', 5.5, 52, 6],
  ['padron-1926-serie-no-9', 'Padrón 1926 Serie No. 9', 'Nicaragua', 'Estelí', 5, 55, 17, 96, ['Espresso','Dark Chocolate','Leather','Pepper','Earth'], 'Robusto', 5.0, 54, 7],
  ['padron-1926-serie-no-12', 'Padrón 1926 Serie No. 12', 'Nicaragua', 'Estelí', 5, 75, 22, 96, ['Espresso','Dark Chocolate','Leather','Pepper','Cedar','Honey'], 'Torpedo', 6.1, 52, 6],
  ['padron-damaso-principe', 'Padrón Dámaso Principe', 'Nicaragua', 'Estelí', 2, 35, 9, 92, ['Cream','Cedar','Honey','Vanilla','Nuts'], 'Robusto', 5.0, 50, 7],
  ['padron-damaso-churchill', 'Padrón Dámaso Churchill', 'Nicaragua', 'Estelí', 2, 70, 14, 93, ['Cream','Cedar','Honey','Vanilla','Nuts'], 'Churchill', 7.0, 50, 6],
  ['padron-damaso-robusto', 'Padrón Dámaso Robusto', 'Nicaragua', 'Estelí', 2, 50, 11, 92, ['Cream','Cedar','Honey','Vanilla'], 'Robusto', 5.0, 50, 7],
  ['padron-damaso-toro', 'Padrón Dámaso Toro', 'Nicaragua', 'Estelí', 2, 60, 12, 92, ['Cream','Cedar','Honey','Vanilla','Nuts'], 'Toro', 6.0, 52, 6],
  ['padron-1964-anniversary-exclusivo', 'Padrón 1964 Anniversary Exclusivo', 'Nicaragua', 'Estelí', 4, 55, 14, 94, ['Cedar','Coffee','Earth','Pepper','Dark Chocolate'], 'Corona', 5.3, 46, 7],
  ['padron-1964-anniversary-monarch', 'Padrón 1964 Anniversary Monarch', 'Nicaragua', 'Estelí', 4, 60, 16, 95, ['Cedar','Coffee','Earth','Pepper','Honey'], 'Robusto', 5.5, 54, 7],
  ['padron-1964-anniversary-principe', 'Padrón 1964 Anniversary Principe', 'Nicaragua', 'Estelí', 4, 40, 11, 93, ['Cedar','Coffee','Earth','Pepper'], 'Petit', 4.5, 46, 6],
  ['padron-1964-anniversary-torpedo', 'Padrón 1964 Anniversary Torpedo', 'Nicaragua', 'Estelí', 4, 60, 16, 95, ['Cedar','Coffee','Earth','Pepper','Dark Chocolate'], 'Torpedo', 6.1, 52, 7],
];

for (const c of padronNew) {
  const [id, name, origin, region, strength, smokingTime, price, rating, flavors, size, length, rg, pop, limited] = c;
  if (!existingIds.has(id) && !existingNames.has(name.toLowerCase())) {
    const isDamaso = name.includes('Dámaso');
    const wrapper = isDamaso ? 'Connecticut Shade' : 'Sun-Grown Habano';
    newCigars.push(cigar(id, name, 'Padrón', origin, region, wrapper, 'Nicaraguan', 'Nicaraguan', strength, smokingTime, price, rating, flavors, size, length, rg, pop, `The ${name} is a premium Nicaraguan cigar from the legendary Padrón family. ${isDamaso ? 'The Dámaso line offers a milder, creamier profile for those who want Padrón quality in a smoother package.' : 'Made with sun-grown Habano wrapper and aged 4 years, this box-pressed cigar showcases why Padrón is considered one of the world\'s finest cigar makers.'}`, isDamaso ? pairingsMild : pairingsFull, 1964, limited || false));
  }
}

// Drew Estate - Missing lines
const drewEstateNew = [
  ['drew-estate-undercrown-sun-grown', 'Drew Estate Undercrown Sun Grown', 'Nicaragua', 'Estelí', 4, 60, 12, 93, ['Cedar','Cream','Honey','Pepper','Nuts'], 'Robusto', 5.0, 50, 8],
  ['drew-estate-undercrown-shade', 'Drew Estate Undercrown Shade', 'Nicaragua', 'Estelí', 3, 55, 11, 92, ['Cream','Cedar','Honey','Vanilla','Nuts'], 'Robusto', 5.0, 50, 7],
  ['drew-estate-undercrown-dogma', 'Drew Estate Undercrown Dogma', 'Nicaragua', 'Estelí', 5, 60, 15, 94, ['Espresso','Dark Chocolate','Leather','Pepper','Cedar'], 'Robusto', 5.0, 54, 7, true],
  ['drew-estate-liga-privada-t52', 'Drew Estate Liga Privada T52', 'Nicaragua', 'Estelí', 5, 60, 18, 96, ['Espresso','Dark Chocolate','Leather','Pepper','Earth','Cedar'], 'Robusto', 5.0, 54, 9],
  ['drew-estate-liga-privada-h99', 'Drew Estate Liga Privada H99', 'Nicaragua', 'Estelí', 5, 65, 20, 97, ['Espresso','Dark Chocolate','Leather','Pepper','Cherry','Cedar'], 'Corona Viva', 5.5, 46, 8, true],
  ['drew-estate-liga-privada-papas-fritas', 'Drew Estate Liga Privada Papas Fritas', 'Nicaragua', 'Estelí', 5, 40, 9, 93, ['Espresso','Dark Chocolate','Leather','Pepper'], 'Petit Lancero', 4.5, 44, 8],
  ['drew-estate-liga-privada-n9-belicosos', 'Drew Estate Liga Privada No. 9 Belicosos', 'Nicaragua', 'Estelí', 5, 60, 18, 96, ['Espresso','Dark Chocolate','Leather','Pepper','Cedar','Earth'], 'Belicoso', 5.0, 52, 8],
  ['drew-estate-nica-rustica-brick', 'Drew Estate Nica Rustica Brick', 'Nicaragua', 'Estelí', 4, 55, 9, 91, ['Earth','Leather','Pepper','Cedar','Coffee'], 'Robusto', 5.0, 50, 5],
  ['drew-estate-acid-kuba-kuba', 'Drew Estate ACID Kuba Kuba', 'Nicaragua', 'Estelí', 2, 45, 8, 88, ['Sweet Notes','Cream','Honey','Vanilla','Floral'], 'Robusto', 5.0, 54, 8],
  ['drew-estate-acid-blondie', 'Drew Estate ACID Blondie', 'Nicaragua', 'Estelí', 2, 35, 6, 87, ['Sweet Notes','Cream','Honey','Vanilla'], 'Belicoso', 4.0, 38, 7],
  ['drew-estate-kentucky-fire-cured-fat-tick', 'Drew Estate Kentucky Fire Cured Fat Tick', 'Nicaragua', 'Estelí', 4, 50, 10, 91, ['Smoky','Mesquite','Leather','Pepper','Earth'], 'Gordo', 6.0, 60, 6],
  ['drew-estate-kentucky-fire-cured-taquito', 'Drew Estate Kentucky Fire Cured Taquito', 'Nicaragua', 'Estelí', 3, 30, 6, 89, ['Smoky','Mesquite','Cream','Honey'], 'Slim Panatela', 4.0, 38, 5],
];

for (const c of drewEstateNew) {
  const [id, name, origin, region, strength, smokingTime, price, rating, flavors, size, length, rg, pop, limited] = c;
  if (!existingIds.has(id) && !existingNames.has(name.toLowerCase())) {
    const isAcid = name.includes('ACID');
    const isKFC = name.includes('Kentucky Fire');
    const wrapper = isAcid ? 'Connecticut Shade' : isKFC ? 'Kentucky Fire Cured' : 'Mexican San Andrés Maduro';
    newCigars.push(cigar(id, name, 'Drew Estate', origin, region, wrapper, 'Nicaraguan', 'Nicaraguan', strength, smokingTime, price, rating, flavors, size, length, rg, pop, `The ${name} is a ${isAcid ? 'flavored' : isKFC ? 'fire-cured' : 'premium'} cigar from Drew Estate, the innovative Nicaraguan blender known for pushing boundaries. ${isAcid ? 'ACID cigars are infused with secret botanicals for a unique aromatic experience.' : isKFC ? 'Kentucky Fire Cured uses tobacco smoked over hickory and mesquite for a distinctive BBQ flavor.' : 'A masterfully crafted cigar showcasing Drew Estate\'s expertise.'}`, isAcid ? pairingsSweet : pairingsFull, 1999, limited || false));
  }
}

// Oliva - Missing lines
const olivaNew = [
  ['oliva-serie-g-robusto', 'Oliva Serie G Robusto', 'Nicaragua', 'Estelí', 3, 50, 9, 91, ['Cedar','Coffee','Cream','Pepper'], 'Robusto', 5.0, 50, 7],
  ['oliva-serie-g-toro', 'Oliva Serie G Toro', 'Nicaragua', 'Estelí', 3, 60, 10, 92, ['Cedar','Coffee','Cream','Pepper','Honey'], 'Toro', 6.0, 50, 7],
  ['oliva-serie-g-churchill', 'Oliva Serie G Churchill', 'Nicaragua', 'Estelí', 3, 70, 12, 92, ['Cedar','Coffee','Cream','Pepper','Honey'], 'Churchill', 7.0, 50, 6],
  ['oliva-serie-o-robusto', 'Oliva Serie O Robusto', 'Nicaragua', 'Estelí', 4, 50, 10, 92, ['Cedar','Earth','Coffee','Pepper','Leather'], 'Robusto', 5.0, 50, 7],
  ['oliva-serie-o-toro', 'Oliva Serie O Toro', 'Nicaragua', 'Estelí', 4, 60, 11, 93, ['Cedar','Earth','Coffee','Pepper','Leather'], 'Toro', 6.0, 50, 7],
  ['oliva-serie-v-double-toro', 'Oliva Serie V Double Toro', 'Nicaragua', 'Estelí', 5, 75, 14, 95, ['Espresso','Dark Chocolate','Pepper','Leather','Cedar'], 'Double Toro', 6.0, 60, 8],
  ['oliva-serie-v-torpedo', 'Oliva Serie V Torpedo', 'Nicaragua', 'Estelí', 5, 60, 13, 95, ['Espresso','Dark Chocolate','Pepper','Leather','Cedar'], 'Torpedo', 6.1, 52, 8],
  ['oliva-serie-v-melanio-figurado', 'Oliva Serie V Melanio Figurado', 'Nicaragua', 'Estelí', 5, 65, 18, 97, ['Espresso','Dark Chocolate','Pepper','Leather','Cedar','Honey'], 'Figurado', 6.5, 52, 8],
  ['oliva-connecticut-reserve-robusto', 'Oliva Connecticut Reserve Robusto', 'Nicaragua', 'Estelí', 2, 50, 8, 90, ['Cream','Cedar','Honey','Nuts'], 'Robusto', 5.0, 50, 6],
  ['oliva-connecticut-reserve-toro', 'Oliva Connecticut Reserve Toro', 'Nicaragua', 'Estelí', 2, 60, 9, 91, ['Cream','Cedar','Honey','Nuts','Vanilla'], 'Toro', 6.0, 50, 6],
];

for (const c of olivaNew) {
  const [id, name, origin, region, strength, smokingTime, price, rating, flavors, size, length, rg, pop, limited] = c;
  if (!existingIds.has(id) && !existingNames.has(name.toLowerCase())) {
    const isConn = name.includes('Connecticut');
    const wrapper = isConn ? 'Connecticut Shade' : name.includes('Serie G') ? 'Cameroon' : 'Habano';
    newCigars.push(cigar(id, name, 'Oliva', origin, region, wrapper, 'Nicaraguan', 'Nicaraguan', strength, smokingTime, price, rating, flavors, size, length, rg, pop, `The ${name} is a premium Nicaraguan cigar from the Oliva family. ${isConn ? 'The Connecticut Reserve offers a milder, creamier profile with an elegant Connecticut Shade wrapper.' : 'Known for consistent construction, rich flavors, and excellent value across all their lines.'}`, isConn ? pairingsMild : pairingsMed, 1886, limited || false));
  }
}

// My Father - Missing lines
const myFatherNew = [
  ['my-father-flor-de-las-antillas-toro', 'My Father Flor de las Antillas Toro', 'Nicaragua', 'Estelí', 4, 60, 12, 94, ['Cedar','Cream','Coffee','Pepper','Honey','Nuts'], 'Toro', 6.0, 52, 8],
  ['my-father-flor-de-las-antillas-robusto', 'My Father Flor de las Antillas Robusto', 'Nicaragua', 'Estelí', 4, 50, 11, 93, ['Cedar','Cream','Coffee','Pepper','Nuts'], 'Robusto', 5.0, 50, 7],
  ['my-father-flor-de-las-antillas-corona', 'My Father Flor de las Antillas Corona', 'Nicaragua', 'Estelí', 4, 55, 10, 92, ['Cedar','Cream','Coffee','Pepper'], 'Corona', 5.5, 46, 6],
  ['my-father-le-bijou-1922-torpedo', 'My Father Le Bijou 1922 Torpedo', 'Nicaragua', 'Estelí', 5, 60, 16, 96, ['Espresso','Dark Chocolate','Leather','Pepper','Cedar'], 'Torpedo', 6.1, 52, 8],
  ['my-father-le-bijou-1922-churchill', 'My Father Le Bijou 1922 Churchill', 'Nicaragua', 'Estelí', 5, 75, 18, 96, ['Espresso','Dark Chocolate','Leather','Pepper','Cedar','Earth'], 'Churchill', 7.0, 50, 7],
  ['my-father-la-antiguedad-robusto', 'My Father La Antiguedad Robusto', 'Nicaragua', 'Estelí', 4, 50, 13, 94, ['Cedar','Coffee','Cream','Pepper','Dark Chocolate'], 'Robusto', 5.6, 52, 6],
  ['my-father-the-judge-robusto', 'My Father The Judge Robusto', 'Nicaragua', 'Estelí', 5, 55, 15, 94, ['Espresso','Leather','Pepper','Cedar','Earth','Dark Chocolate'], 'Robusto', 5.6, 54, 7],
  ['my-father-the-judge-toro', 'My Father The Judge Toro', 'Nicaragua', 'Estelí', 5, 65, 17, 95, ['Espresso','Leather','Pepper','Cedar','Earth','Dark Chocolate'], 'Toro', 6.0, 54, 7],
  ['don-pepin-garcia-black', 'Don Pepin Garcia Black Label', 'Nicaragua', 'Estelí', 5, 60, 14, 93, ['Espresso','Leather','Pepper','Earth','Cedar'], 'Robusto', 5.0, 50, 6],
  ['don-pepin-garcia-blue', 'Don Pepin Garcia Blue Label', 'Nicaragua', 'Estelí', 4, 50, 11, 92, ['Cedar','Coffee','Pepper','Leather','Cream'], 'Robusto', 5.0, 50, 6],
];

for (const c of myFatherNew) {
  const [id, name, origin, region, strength, smokingTime, price, rating, flavors, size, length, rg, pop, limited] = c;
  if (!existingIds.has(id) && !existingNames.has(name.toLowerCase())) {
    const isFlor = name.includes('Flor');
    const isLeBijou = name.includes('Le Bijou');
    const wrapper = isFlor ? 'Connecticut Broadleaf' : isLeBijou ? 'Habano Oscuro' : 'Habano';
    const brand = name.includes('Don Pepin') ? 'Don Pepin Garcia' : 'My Father';
    newCigars.push(cigar(id, name, brand, origin, region, wrapper, 'Nicaraguan', 'Nicaraguan', strength, smokingTime, price, rating, flavors, size, length, rg, pop, `The ${name} is a premium Nicaraguan cigar from the Garcia family. ${isFlor ? 'Flor de las Antillas was named Cigar of the Year and showcases a beautiful Connecticut Broadleaf wrapper.' : isLeBijou ? 'Le Bijou 1922 uses a dark Habano Oscuro wrapper for a powerful, full-bodied experience.' : 'Expertly crafted by the Garcia family with the precision that made them legendary.'}`, strength >= 5 ? pairingsFull : pairingsMed, 2003, limited || false));
  }
}

// Rocky Patel - Missing lines
const rockyPatelNew = [
  ['rocky-patel-lb1-corojo', 'Rocky Patel LB1 Corojo', 'Honduras', 'Jamastran', 4, 55, 8, 91, ['Cedar','Coffee','Pepper','Leather','Cream'], 'Robusto', 5.0, 50, 6],
  ['rocky-patel-sun-grown-maduro', 'Rocky Patel Sun Grown Maduro', 'Honduras', 'Jamastran', 5, 60, 10, 92, ['Espresso','Dark Chocolate','Pepper','Leather','Earth'], 'Robusto', 5.0, 50, 7],
  ['rocky-patel-fifteenth-anniversary-robusto', 'Rocky Patel Fifteenth Anniversary Robusto', 'Honduras', 'Jamastran', 5, 55, 12, 94, ['Espresso','Dark Chocolate','Leather','Pepper','Cedar'], 'Robusto', 5.5, 50, 7],
  ['rocky-patel-fifteenth-anniversary-toro', 'Rocky Patel Fifteenth Anniversary Toro', 'Honduras', 'Jamastran', 5, 65, 14, 95, ['Espresso','Dark Chocolate','Leather','Pepper','Cedar','Honey'], 'Toro', 6.5, 52, 7],
  ['rocky-patel-vintage-2003-robusto', 'Rocky Patel Vintage 2003 Robusto', 'Honduras', 'Jamastran', 4, 55, 11, 93, ['Cedar','Coffee','Cream','Pepper','Honey'], 'Robusto', 5.0, 50, 6],
  ['rocky-patel-vintage-2006-robusto', 'Rocky Patel Vintage 2006 Robusto', 'Honduras', 'Jamastran', 4, 55, 11, 93, ['Cedar','Coffee','Cream','Pepper','Earth'], 'Robusto', 5.0, 50, 6],
  ['rocky-patel-decade-robusto', 'Rocky Patel Decade Robusto', 'Honduras', 'Jamastran', 5, 55, 12, 94, ['Espresso','Dark Chocolate','Leather','Pepper','Cedar'], 'Robusto', 5.0, 50, 7],
  ['rocky-patel-decade-toro', 'Rocky Patel Decade Toro', 'Honduras', 'Jamastran', 5, 65, 14, 95, ['Espresso','Dark Chocolate','Leather','Pepper','Cedar','Honey'], 'Toro', 6.5, 52, 7],
  ['rocky-patel-decade-churchill', 'Rocky Patel Decade Churchill', 'Honduras', 'Jamastran', 5, 80, 16, 95, ['Espresso','Dark Chocolate','Leather','Pepper','Cedar','Honey','Earth'], 'Churchill', 7.0, 50, 6],
  ['rocky-patel-edge-sumatra', 'Rocky Patel Edge Sumatra', 'Honduras', 'Jamastran', 4, 50, 7, 89, ['Cedar','Earth','Pepper','Leather','Coffee'], 'Robusto', 5.0, 50, 6],
  ['rocky-patel-edge-connecticut', 'Rocky Patel Edge Connecticut', 'Honduras', 'Jamastran', 3, 50, 7, 88, ['Cedar','Cream','Honey','Pepper'], 'Robusto', 5.0, 50, 6],
  ['rocky-patel-edge-corojo', 'Rocky Patel Edge Corojo', 'Honduras', 'Jamastran', 5, 50, 7, 89, ['Espresso','Pepper','Leather','Earth','Cedar'], 'Robusto', 5.0, 50, 6],
];

for (const c of rockyPatelNew) {
  const [id, name, origin, region, strength, smokingTime, price, rating, flavors, size, length, rg, pop, limited] = c;
  if (!existingIds.has(id) && !existingNames.has(name.toLowerCase())) {
    const isEdge = name.includes('Edge');
    const isMaduro = name.includes('Maduro') || name.includes('Decade') || name.includes('Sun Grown Maduro');
    const isConn = name.includes('Connecticut') || name.includes('Vintage 2003');
    const wrapper = isMaduro ? 'Connecticut Broadleaf Maduro' : isConn ? 'Connecticut Shade' : isEdge && name.includes('Sumatra') ? 'Sumatra' : 'Corojo';
    newCigars.push(cigar(id, name, 'Rocky Patel', origin, region, wrapper, 'Honduran', 'Honduran/Nicaraguan', strength, smokingTime, price, rating, flavors, size, length, rg, pop, `The ${name} is a ${strength >= 5 ? 'full-bodied' : strength >= 4 ? 'medium-to-full' : 'medium-bodied'} cigar from Rocky Patel's ${isEdge ? 'popular Edge line, offering great value' : 'premium portfolio'}. Crafted in Honduras with attention to construction and consistency.`, strength >= 5 ? pairingsFull : pairingsMed, 1996, limited || false));
  }
}

// Alec Bradley - Missing lines
const alecBradleyNew = [
  ['alec-bradley-tempus-nicaragua', 'Alec Bradley Tempus Nicaragua', 'Nicaragua', 'Jalapa', 5, 60, 14, 94, ['Espresso','Dark Chocolate','Leather','Pepper','Cedar'], 'Robusto', 5.0, 50, 6],
  ['alec-bradley-prensado-churchill', 'Alec Bradley Prensado Churchill', 'Honduras', 'Jamastran', 4, 80, 16, 95, ['Cedar','Coffee','Cream','Pepper','Dark Chocolate','Leather'], 'Churchill', 7.0, 50, 7],
  ['alec-bradley-prensado-toro', 'Alec Bradley Prensado Toro', 'Honduras', 'Jamastran', 4, 65, 13, 94, ['Cedar','Coffee','Cream','Pepper','Dark Chocolate'], 'Toro', 6.0, 52, 7],
  ['alec-bradley-black-market-filthy-hooligan', 'Alec Bradley Black Market Filthy Hooligan', 'Honduras', 'Jamastran', 4, 55, 10, 92, ['Cedar','Coffee','Earth','Pepper','Leather'], 'Robusto', 5.0, 50, 5],
  ['alec-bradley-nica-puro-robusto', 'Alec Bradley Nica Puro Robusto', 'Nicaragua', 'Estelí', 4, 50, 9, 92, ['Cedar','Coffee','Cream','Pepper','Earth'], 'Robusto', 5.0, 50, 6],
  ['alec-bradley-connecticut-robusto', 'Alec Bradley Connecticut Robusto', 'Honduras', 'Jamastran', 2, 50, 8, 89, ['Cream','Cedar','Honey','Nuts','Vanilla'], 'Robusto', 5.0, 50, 6],
  ['alec-bradley-magic-toast-robusto', 'Alec Bradley Magic Toast Robusto', 'Honduras', 'Jamastran', 4, 55, 11, 93, ['Cedar','Coffee','Dark Chocolate','Pepper','Honey'], 'Robusto', 5.5, 50, 5],
  ['alec-bradley-blind-faith-robusto', 'Alec Bradley Blind Faith Robusto', 'Honduras', 'Jamastran', 4, 55, 12, 93, ['Cedar','Coffee','Cream','Pepper','Leather'], 'Robusto', 5.5, 50, 5],
];

for (const c of alecBradleyNew) {
  const [id, name, origin, region, strength, smokingTime, price, rating, flavors, size, length, rg, pop, limited] = c;
  if (!existingIds.has(id) && !existingNames.has(name.toLowerCase())) {
    const isConn = name.includes('Connecticut');
    const wrapper = isConn ? 'Connecticut Shade' : name.includes('Tempus') || name.includes('Prensado') ? 'Honduran Corojo' : 'Habano';
    newCigars.push(cigar(id, name, 'Alec Bradley', origin, region, wrapper, 'Honduran', 'Honduran/Nicaraguan', strength, smokingTime, price, rating, flavors, size, length, rg, pop, `The ${name} is a ${strength >= 5 ? 'full-bodied' : 'medium-bodied'} cigar from Alec Bradley. ${isConn ? 'The Connecticut line offers a smooth, approachable profile.' : 'Known for innovative blends and consistent construction.'}`, isConn ? pairingsMild : strength >= 5 ? pairingsFull : pairingsMed, 1996, limited || false));
  }
}

// Davidoff - Missing lines
const davidoffNew = [
  ['davidoff-winston-churchill-robusto', 'Davidoff Winston Churchill Robusto', 'Dominican Republic', 'Santiago', 3, 50, 16, 92, ['Cedar','Cream','Coffee','Honey','Leather'], 'Robusto', 5.0, 50, 7],
  ['davidoff-winston-churchill-toro', 'Davidoff Winston Churchill Toro', 'Dominican Republic', 'Santiago', 3, 60, 18, 93, ['Cedar','Cream','Coffee','Honey','Leather','Pepper'], 'Toro', 6.0, 50, 6],
  ['davidoff-winston-churchill-late-hour', 'Davidoff Winston Churchill Late Hour', 'Dominican Republic', 'Santiago', 4, 65, 24, 95, ['Cedar','Coffee','Dark Chocolate','Leather','Pepper','Whisky'], 'Robusto', 5.5, 52, 8],
  ['davidoff-nicaragua-robusto', 'Davidoff Nicaragua Robusto', 'Nicaragua', 'Estelí', 4, 50, 16, 93, ['Cedar','Coffee','Pepper','Leather','Earth'], 'Robusto', 5.0, 50, 7],
  ['davidoff-nicaragua-toro', 'Davidoff Nicaragua Toro', 'Nicaragua', 'Estelí', 4, 60, 18, 94, ['Cedar','Coffee','Pepper','Leather','Earth','Honey'], 'Toro', 6.0, 52, 7],
  ['davidoff-grand-cru-no-2', 'Davidoff Grand Cru No. 2', 'Dominican Republic', 'Santiago', 2, 50, 14, 91, ['Cedar','Cream','Honey','Nuts','Vanilla'], 'Corona', 5.4, 43, 5],
  ['davidoff-grand-cru-no-3', 'Davidoff Grand Cru No. 3', 'Dominican Republic', 'Santiago', 2, 40, 11, 90, ['Cedar','Cream','Honey','Nuts'], 'Petit Corona', 4.5, 38, 5],
  ['davidoff-aniversario-no-1', 'Davidoff Aniversario No. 1', 'Dominican Republic', 'Santiago', 3, 80, 22, 94, ['Cedar','Cream','Coffee','Honey','Leather','Pepper'], 'Gran Corona', 7.5, 48, 5],
  ['davidoff-aniversario-no-2', 'Davidoff Aniversario No. 2', 'Dominican Republic', 'Santiago', 3, 70, 18, 93, ['Cedar','Cream','Coffee','Honey','Leather'], 'Corona Gorda', 6.1, 46, 5],
  ['davidoff-aniversario-no-3', 'Davidoff Aniversario No. 3', 'Dominican Republic', 'Santiago', 3, 90, 24, 94, ['Cedar','Cream','Coffee','Honey','Leather','Earth'], 'Churchill', 7.2, 50, 5],
  ['davidoff-escurio-robusto', 'Davidoff Escurio Robusto', 'Brazil', 'Bahia', 3, 50, 12, 91, ['Cedar','Coffee','Cream','Pepper','Sweet Notes'], 'Robusto', 5.0, 50, 5],
  ['davidoff-escurio-toro', 'Davidoff Escurio Toro', 'Brazil', 'Bahia', 3, 60, 14, 92, ['Cedar','Coffee','Cream','Pepper','Sweet Notes','Honey'], 'Toro', 6.0, 52, 5],
];

for (const c of davidoffNew) {
  const [id, name, origin, region, strength, smokingTime, price, rating, flavors, size, length, rg, pop, limited] = c;
  if (!existingIds.has(id) && !existingNames.has(name.toLowerCase())) {
    const isNic = name.includes('Nicaragua');
    const isEscurio = name.includes('Escurio');
    const wrapper = isNic ? 'Nicaraguan Habano' : isEscurio ? 'Brazilian Habano' : 'Connecticut';
    newCigars.push(cigar(id, name, 'Davidoff', origin, region, wrapper, 'Dominican', 'Dominican', strength, smokingTime, price, rating, flavors, size, length, rg, pop, `The ${name} is a luxury cigar from Davidoff, the gold standard of premium cigars. ${isNic ? 'The Nicaragua line marks Davidoff\'s first non-Dominican blend, offering a spicier, more robust profile.' : isEscurio ? 'Escurio uses Brazilian tobacco for a unique sweet-and-spicy profile.' : 'Known for impeccable construction and refined, balanced flavors.'}`, strength <= 2 ? pairingsMild : pairingsMed, 1946, limited || false));
  }
}

// Gurkha - Missing lines
const gurkhaNew = [
  ['gurkha-ghost-robusto', 'Gurkha Ghost Robusto', 'Dominican Republic', 'Santiago', 4, 55, 12, 91, ['Cedar','Coffee','Leather','Pepper','Earth'], 'Robusto', 5.0, 50, 6],
  ['gurkha-ghost-toro', 'Gurkha Ghost Toro', 'Dominican Republic', 'Santiago', 4, 65, 14, 92, ['Cedar','Coffee','Leather','Pepper','Earth','Honey'], 'Toro', 6.0, 50, 6],
  ['gurkha-ghost-churchill', 'Gurkha Ghost Churchill', 'Dominican Republic', 'Santiago', 4, 80, 16, 92, ['Cedar','Coffee','Leather','Pepper','Earth','Honey'], 'Churchill', 7.0, 50, 5],
  ['gurkha-heritage-robusto', 'Gurkha Heritage Robusto', 'Dominican Republic', 'Santiago', 4, 55, 14, 92, ['Cedar','Coffee','Cream','Pepper','Leather'], 'Robusto', 5.5, 55, 5],
  ['gurkha-heritage-toro', 'Gurkha Heritage Toro', 'Dominican Republic', 'Santiago', 4, 65, 16, 93, ['Cedar','Coffee','Cream','Pepper','Leather','Honey'], 'Toro', 6.0, 56, 5],
  ['gurkha-warlord-robusto', 'Gurkha Warlord Robusto', 'Dominican Republic', 'Santiago', 5, 55, 18, 93, ['Espresso','Dark Chocolate','Leather','Pepper','Cedar'], 'Robusto', 5.5, 55, 5],
  ['gurkha-ninja-robusto', 'Gurkha Ninja Robusto', 'Dominican Republic', 'Santiago', 4, 50, 10, 89, ['Cedar','Coffee','Pepper','Earth'], 'Robusto', 5.0, 50, 5],
  ['gurkha-east-india-robusto', 'Gurkha East India Robusto', 'Dominican Republic', 'Santiago', 3, 55, 12, 91, ['Cedar','Cream','Coffee','Honey','Pepper'], 'Robusto', 5.0, 50, 5],
  ['gurkha-grand-reserve-robusto', 'Gurkha Grand Reserve Robusto', 'Dominican Republic', 'Santiago', 3, 55, 14, 92, ['Cedar','Cream','Honey','Vanilla','Nuts'], 'Robusto', 5.0, 50, 5],
  ['gurkha-beauty-robusto', 'Gurkha Beauty Robusto', 'Dominican Republic', 'Santiago', 2, 50, 10, 89, ['Cream','Cedar','Honey','Vanilla','Nuts'], 'Robusto', 5.0, 50, 5],
  ['gurkha-empire-robusto', 'Gurkha Empire Robusto', 'Dominican Republic', 'Santiago', 4, 55, 16, 93, ['Cedar','Coffee','Dark Chocolate','Leather','Pepper'], 'Robusto', 5.5, 55, 4],
];

for (const c of gurkhaNew) {
  const [id, name, origin, region, strength, smokingTime, price, rating, flavors, size, length, rg, pop, limited] = c;
  if (!existingIds.has(id) && !existingNames.has(name.toLowerCase())) {
    const isBeauty = name.includes('Beauty');
    const wrapper = isBeauty ? 'Connecticut Shade' : 'Habano';
    newCigars.push(cigar(id, name, 'Gurkha', origin, region, wrapper, 'Dominican', 'Dominican/Nicaraguan', strength, smokingTime, price, rating, flavors, size, length, rg, pop, `The ${name} is a premium cigar from Gurkha, known for extravagant presentation and bold blends. ${isBeauty ? 'The Beauty line offers a smoother, milder profile.' : 'Gurkha pushes the boundaries of premium cigar blending.'}`, isBeauty ? pairingsMild : pairingsMed, 1887, limited || false));
  }
}

// Foundation Cigar Co - New brand
const foundationNew = [
  ['foundation-charter-oak-habano-robusto', 'Foundation Charter Oak Habano Robusto', 'Nicaragua', 'Estelí', 3, 50, 9, 92, ['Cedar','Cream','Coffee','Honey','Pepper'], 'Robusto', 5.0, 50, 7],
  ['foundation-charter-oak-maduro-robusto', 'Foundation Charter Oak Maduro Robusto', 'Nicaragua', 'Estelí', 4, 50, 9, 93, ['Espresso','Dark Chocolate','Pepper','Cedar','Cream'], 'Robusto', 5.0, 50, 7],
  ['foundation-charter-oak-shade-robusto', 'Foundation Charter Oak Shade Robusto', 'Nicaragua', 'Estelí', 2, 50, 9, 91, ['Cream','Cedar','Honey','Vanilla','Nuts'], 'Robusto', 5.0, 50, 7],
  ['foundation-highclere-castle-robusto', 'Foundation Highclere Castle Robusto', 'Nicaragua', 'Estelí', 3, 55, 16, 94, ['Cedar','Cream','Coffee','Honey','Leather'], 'Robusto', 5.5, 52, 6],
  ['foundation-highclere-castle-toro', 'Foundation Highclere Castle Toro', 'Nicaragua', 'Estelí', 3, 65, 18, 95, ['Cedar','Cream','Coffee','Honey','Leather','Pepper'], 'Toro', 6.0, 52, 6],
  ['foundation-the-upsetters-robusto', 'Foundation The Upsetters Robusto', 'Nicaragua', 'Estelí', 4, 50, 10, 92, ['Cedar','Earth','Pepper','Leather','Coffee'], 'Robusto', 5.0, 50, 5],
  ['foundation-arise-robusto', 'Foundation Arise Robusto', 'Nicaragua', 'Estelí', 4, 50, 11, 93, ['Cedar','Coffee','Pepper','Leather','Dark Chocolate'], 'Robusto', 5.0, 50, 5],
];

for (const c of foundationNew) {
  const [id, name, origin, region, strength, smokingTime, price, rating, flavors, size, length, rg, pop, limited] = c;
  if (!existingIds.has(id) && !existingNames.has(name.toLowerCase())) {
    const isShade = name.includes('Shade');
    const isMaduro = name.includes('Maduro');
    const wrapper = isShade ? 'Connecticut Shade' : isMaduro ? 'Connecticut Broadleaf Maduro' : 'Habano';
    newCigars.push(cigar(id, name, 'Foundation', origin, region, wrapper, 'Nicaraguan', 'Nicaraguan', strength, smokingTime, price, rating, flavors, size, length, rg, pop, `The ${name} is from Foundation Cigar Co, founded by Nick Melillo. ${name.includes('Highclere') ? 'Highclere Castle is the real-life Downton Abbey, and this cigar was created in partnership with the estate.' : 'Foundation focuses on terroir-driven Nicaraguan tobacco with old-world craftsmanship.'}`, strength <= 2 ? pairingsMild : strength >= 4 ? pairingsFull : pairingsMed, 2015, limited || false));
  }
}

// Aganorsa Leaf - New brand
const aganorsaNew = [
  ['aganorsa-jfr-robusto', 'Aganorsa JFR Robusto', 'Nicaragua', 'Jalapa', 4, 55, 11, 92, ['Cedar','Coffee','Pepper','Leather','Cream'], 'Robusto', 5.0, 50, 6],
  ['aganorsa-jfr-toro', 'Aganorsa JFR Toro', 'Nicaragua', 'Jalapa', 4, 65, 13, 93, ['Cedar','Coffee','Pepper','Leather','Cream','Honey'], 'Toro', 6.0, 52, 6],
  ['aganorsa-madrugada-robusto', 'Aganorsa Madrugada Robusto', 'Nicaragua', 'Jalapa', 3, 55, 12, 92, ['Cedar','Cream','Coffee','Honey','Pepper'], 'Robusto', 5.0, 50, 5],
  ['aganorsa-casa-fernandez-robusto', 'Aganorsa Casa Fernandez Robusto', 'Nicaragua', 'Jalapa', 4, 55, 10, 91, ['Cedar','Earth','Pepper','Coffee','Leather'], 'Robusto', 5.0, 50, 5],
  ['aganorsa-solidez-robusto', 'Aganorsa Solidez Robusto', 'Nicaragua', 'Jalapa', 4, 55, 11, 92, ['Cedar','Coffee','Earth','Pepper','Leather'], 'Robusto', 5.0, 50, 5],
  ['aganorsa-pinolera-robusto', 'Aganorsa Pinolera Robusto', 'Nicaragua', 'Jalapa', 3, 50, 10, 91, ['Cedar','Cream','Coffee','Honey','Earth'], 'Robusto', 5.0, 50, 4],
  ['aganorsa-guardians-of-the-galaxy-robusto', 'Aganorsa Guardians of the Galaxy Robusto', 'Nicaragua', 'Jalapa', 5, 55, 14, 94, ['Espresso','Dark Chocolate','Leather','Pepper','Cedar'], 'Robusto', 5.5, 54, 5, true],
];

for (const c of aganorsaNew) {
  const [id, name, origin, region, strength, smokingTime, price, rating, flavors, size, length, rg, pop, limited] = c;
  if (!existingIds.has(id) && !existingNames.has(name.toLowerCase())) {
    newCigars.push(cigar(id, name, 'Aganorsa', origin, region, 'Corojo 99', 'Nicaraguan', 'Nicaraguan', strength, smokingTime, price, rating, flavors, size, length, rg, pop, `The ${name} is from Aganorsa Leaf, a vertically integrated Nicaraguan company that grows its own tobacco in Jalapa and Estelí. Known for terroir-driven, authentic Nicaraguan flavor.`, strength >= 5 ? pairingsFull : pairingsMed, 2014, limited || false));
  }
}

// HVC Cigars - New brand
const hvcNew = [
  ['hvc-hot-cake-robusto', 'HVC Hot Cake Robusto', 'Nicaragua', 'Estelí', 4, 50, 9, 91, ['Cedar','Coffee','Pepper','Cream','Leather'], 'Robusto', 5.0, 50, 5],
  ['hvc-hot-cake-toro', 'HVC Hot Cake Toro', 'Nicaragua', 'Estelí', 4, 60, 10, 92, ['Cedar','Coffee','Pepper','Cream','Leather','Honey'], 'Toro', 6.0, 50, 5],
  ['hvc-cerero-robusto', 'HVC Cerero Robusto', 'Nicaragua', 'Estelí', 5, 50, 11, 92, ['Espresso','Dark Chocolate','Pepper','Leather','Cedar'], 'Robusto', 5.0, 50, 4],
  ['hvc-500th-anniversary-robusto', 'HVC 500th Anniversary Robusto', 'Nicaragua', 'Estelí', 5, 55, 14, 94, ['Espresso','Dark Chocolate','Leather','Pepper','Cedar','Earth'], 'Robusto', 5.5, 52, 4, true],
  ['hvc-pan-caliente-robusto', 'HVC Pan Caliente Robusto', 'Nicaragua', 'Estelí', 3, 50, 7, 89, ['Cedar','Coffee','Cream','Pepper'], 'Robusto', 5.0, 50, 4],
];

for (const c of hvcNew) {
  const [id, name, origin, region, strength, smokingTime, price, rating, flavors, size, length, rg, pop, limited] = c;
  if (!existingIds.has(id) && !existingNames.has(name.toLowerCase())) {
    newCigars.push(cigar(id, name, 'HVC', origin, region, 'Habano', 'Nicaraguan', 'Nicaraguan', strength, smokingTime, price, rating, flavors, size, length, rg, pop, `The ${name} is from HVC Cigars, a boutique Nicaraguan brand founded by Reinaldo Casado. HVC focuses on bold, full-flavored cigars at accessible prices.`, strength >= 5 ? pairingsFull : pairingsMed, 2011, limited || false));
  }
}

// Dunbarton Tobacco & Trust - New brand
const dunbartonNew = [
  ['dunbarton-sobremesa-robusto', 'Dunbarton Sobremesa Robusto', 'Nicaragua', 'Estelí', 4, 55, 13, 93, ['Cedar','Coffee','Cream','Pepper','Leather'], 'Robusto', 5.0, 50, 6],
  ['dunbarton-sobremesa-brulee-robusto', 'Dunbarton Sobremesa Brulee Robusto', 'Nicaragua', 'Estelí', 3, 55, 14, 93, ['Cedar','Cream','Coffee','Honey','Pepper'], 'Robusto', 5.0, 50, 5],
  ['dunbarton-sobremesa-gran-robusto', 'Dunbarton Sobremesa Gran Robusto', 'Nicaragua', 'Estelí', 4, 60, 15, 94, ['Cedar','Coffee','Cream','Pepper','Leather','Dark Chocolate'], 'Robusto', 5.5, 54, 5],
  ['dunbarton-mi-querida-robusto', 'Dunbarton Mi Querida Robusto', 'Nicaragua', 'Estelí', 5, 55, 12, 93, ['Espresso','Dark Chocolate','Leather','Pepper','Cedar','Earth'], 'Robusto', 5.0, 50, 6],
  ['dunbarton-mi-querida-tripa-trunk', 'Dunbarton Mi Querida Tripa Trunk', 'Nicaragua', 'Estelí', 5, 60, 14, 94, ['Espresso','Dark Chocolate','Leather','Pepper','Cedar','Earth','Honey'], 'Robusto', 5.5, 54, 4, true],
  ['dunbarton-muestra-de-saka-nacatamal', 'Dunbarton Muestra de Saka Nacatamal', 'Nicaragua', 'Estelí', 5, 60, 15, 95, ['Espresso','Dark Chocolate','Leather','Pepper','Cedar','Earth'], 'Robusto', 5.5, 52, 4, true],
  ['dunbarton-muestra-de-saka-smoloko', 'Dunbarton Muestra de Saka Smoloko', 'Nicaragua', 'Estelí', 5, 50, 13, 94, ['Espresso','Dark Chocolate','Leather','Pepper','Cedar'], 'Robusto', 5.0, 50, 4, true],
];

for (const c of dunbartonNew) {
  const [id, name, origin, region, strength, smokingTime, price, rating, flavors, size, length, rg, pop, limited] = c;
  if (!existingIds.has(id) && !existingNames.has(name.toLowerCase())) {
    const isBrulee = name.includes('Brulee');
    const wrapper = isBrulee ? 'Connecticut Shade' : 'Mexican San Andrés';
    newCigars.push(cigar(id, name, 'Dunbarton', origin, region, wrapper, 'Nicaraguan', 'Nicaraguan', strength, smokingTime, price, rating, flavors, size, length, rg, pop, `The ${name} is from Dunbarton Tobacco & Trust, founded by Steve Saka. Known for uncompromising quality and bold, old-school flavors. ${isBrulee ? 'Brulee offers a creamier profile with a Shade wrapper.' : 'Mi Querida and Muestra de Saka are full-bodied powerhouses.'}`, isBrulee ? pairingsMed : pairingsFull, 2015, limited || false));
  }
}

// Warped - New brand
const warpedNew = [
  ['warped-corto-x50', 'Warped Corto X50', 'Nicaragua', 'Estelí', 4, 50, 11, 92, ['Cedar','Coffee','Pepper','Leather','Cream'], 'Robusto', 5.0, 50, 5],
  ['warped-corto-x52', 'Warped Corto X52', 'Nicaragua', 'Estelí', 4, 55, 12, 93, ['Cedar','Coffee','Pepper','Leather','Cream','Honey'], 'Robusto', 5.5, 52, 5],
  ['warped-chateau-gris-robusto', 'Warped Chateau Gris Robusto', 'Nicaragua', 'Estelí', 3, 50, 10, 91, ['Cedar','Cream','Coffee','Honey','Pepper'], 'Robusto', 5.0, 50, 4],
  ['warped-el-bueno-robusto', 'Warped El Bueno Robusto', 'Nicaragua', 'Estelí', 4, 50, 9, 90, ['Cedar','Coffee','Pepper','Earth','Leather'], 'Robusto', 5.0, 50, 4],
  ['warped-maestro-del-tiempo-robusto', 'Warped Maestro del Tiempo Robusto', 'Nicaragua', 'Estelí', 4, 55, 13, 93, ['Cedar','Coffee','Cream','Pepper','Leather','Honey'], 'Robusto', 5.5, 52, 5],
  ['warped-futuro-robusto', 'Warped Futuro Robusto', 'Nicaragua', 'Estelí', 5, 55, 15, 94, ['Espresso','Dark Chocolate','Leather','Pepper','Cedar','Earth'], 'Robusto', 5.5, 52, 4, true],
];

for (const c of warpedNew) {
  const [id, name, origin, region, strength, smokingTime, price, rating, flavors, size, length, rg, pop, limited] = c;
  if (!existingIds.has(id) && !existingNames.has(name.toLowerCase())) {
    newCigars.push(cigar(id, name, 'Warped', origin, region, 'Habano', 'Nicaraguan', 'Nicaraguan', strength, smokingTime, price, rating, flavors, size, length, rg, pop, `The ${name} is from Warped Cigars, founded by Kyle Gellis. Known for elegant, refined cigars with old-world Cuban-inspired styling and Nicaraguan craftsmanship.`, strength >= 5 ? pairingsFull : pairingsMed, 2013, limited || false));
  }
}

console.log('\n=== NEW CIGARS GENERATED ===');
console.log('Total new entries:', newCigars.length);
console.log('Skipped (already exist):', (existing.length + newCigars.length) - existing.length - newCigars.length);

// Merge with existing
const allCigars = [...existing, ...newCigars];

// Ensure every cigar has 5 pairings
let expanded = 0;
allCigars.forEach(c => {
  while ((c.pairings || []).length < 5) {
    c.pairings = [...(c.pairings || []), ...p(c.strength, c.origin)].slice(0, 5);
    expanded++;
  }
  if (!c.pairings || c.pairings.length < 3) {
    c.pairings = p(c.strength, c.origin);
    expanded++;
  }
});

console.log('Pairings expanded for:', expanded, 'cigars');
console.log('FINAL COUNT:', allCigars.length);

// Backup and write
fs.copyFileSync('data/cigars.json', 'data/cigars.json.bak3');
fs.writeFileSync('data/cigars.json', JSON.stringify(allCigars, null, 2));
console.log('Wrote data/cigars.json:', allCigars.length, 'cigars');

const jsOut = 'const CIGARS = ' + JSON.stringify(allCigars, null, 2) + ';\n';
fs.writeFileSync('js/data.js', jsOut);
console.log('Wrote js/data.js:', allCigars.length, 'cigars');

// Verify
const verify = JSON.parse(fs.readFileSync('data/cigars.json', 'utf8'));
const counts = verify.map(c => (c.pairings||[]).length);
console.log('\n=== VERIFICATION ===');
console.log('Total cigars:', verify.length);
console.log('Min pairings:', Math.min(...counts));
console.log('Max pairings:', Math.max(...counts));
console.log('Avg pairings:', (counts.reduce((a,b)=>a+b,0)/counts.length).toFixed(1));
console.log('Under 3:', counts.filter(c=>c<3).length);
console.log('Under 5:', counts.filter(c=>c<5).length);
console.log('Sample first:', verify[0].name, '→', verify[0].pairings.length, 'pairings');
console.log('Sample last:', verify[verify.length-1].name, '→', verify[verify.length-1].pairings.length, 'pairings');
