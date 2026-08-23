// Fix duplicates and normalize brand names
const fs = require('fs');
const cigars = JSON.parse(fs.readFileSync('data/cigars.json', 'utf8'));
console.log('Before:', cigars.length);

// 1. Remove duplicate IDs (keep first occurrence)
const seen = new Set();
const deduped = [];
let removed = 0;
for (const c of cigars) {
  const key = c.id.toLowerCase();
  if (seen.has(key)) { removed++; continue; }
  seen.add(key);
  deduped.push(c);
}
console.log('Removed duplicates:', removed);

// 2. Normalize brand names
const brandMap = {
  'ACID by Drew Estate': 'Drew Estate',
  'Aganorsa Leaf': 'Aganorsa',
  'Black Label Trading Company': 'Black Label Trading Co.',
  'Blackbird Cigar Co.': 'Blackbird',
  'Cave de Pailles': 'Casa de Pailles',
  'Diplomaticos': 'Diplomáticos',
  'Dunbarton Tobacco & Trust': 'Dunbarton',
  'Espinosa Cigars': 'Espinosa',
  'Espinosa Premium Cigars': 'Espinosa',
  'Foundation Cigar Co.': 'Foundation',
  'Foundation Cigar Company': 'Foundation',
  'HVC Cigars': 'HVC',
  'Mombacho Cigars': 'Mombacho',
  'My Father Cigars': 'My Father',
  'Perdomo Cigars': 'Perdomo',
  'RoMa Craft Tobac': 'RoMa Craft',
  'Rojas Cigars': 'Rojas Cigar',
  'San Cristóbal de la Habana': 'San Cristobal de la Habana',
  'Tatuaje Cigars': 'Tatuaje',
  'Viaje Cigar': 'Viaje',
  'Viaje Cigars': 'Viaje',
  'Warped Cigars': 'Warped',
  'Quesada Cigars': 'Quesada',
  'Protocol Cigars': 'Protocol',
  'La Barba Cigars': 'La Barba',
  'Crux Cigar Co.': 'Crux Cigars',
  'Cain by Oliva': 'Cain',
};

let normalized = 0;
for (const c of deduped) {
  if (brandMap[c.brand]) {
    c.brand = brandMap[c.brand];
    normalized++;
  }
}

console.log('Brand names normalized:', normalized);

// 3. Check for remaining duplicate names (case-insensitive) and fix
const nameMap = new Map();
const finalArr = [];
let nameDups = 0;
for (const c of deduped) {
  const nameKey = c.name.toLowerCase();
  if (nameMap.has(nameKey)) {
    nameDups++;
    // Append the wrapper variant to make unique
    const wrapperShort = c.wrapper.split(' ')[0];
    c.name = c.name + ' ' + wrapperShort;
    c.id = c.id + '-' + wrapperShort.toLowerCase().replace(/[^a-z0-9]/g, '');
  }
  nameMap.set(nameKey, true);
  finalArr.push(c);
}
console.log('Name duplicates fixed:', nameDups);

// 4. Final duplicate check
const finalIds = finalArr.map(c => c.id);
const finalDups = finalIds.filter((id, i) => finalIds.indexOf(id) !== i);
console.log('Remaining duplicate IDs:', finalDups.length);

// 5. Count brands
const brands = [...new Set(finalArr.map(c => c.brand))].sort();
console.log('Total unique brands:', brands.length);

// Write
fs.writeFileSync('data/cigars.json', JSON.stringify(finalArr, null, 2));
fs.writeFileSync('js/data.js', `const CIGARS = ${JSON.stringify(finalArr, null, 2)};\n`);
console.log('\nFinal count:', finalArr.length);
console.log('Wrote data/cigars.json and js/data.js');
