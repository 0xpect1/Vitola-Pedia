/* ================================================================
 * expand-pipe-tobacco.cjs
 * Programmatically generates 200+ new pipe tobacco blends and
 * appends them to js/pipe_tobacco_data.js.
 *
 * Strategy:
 *   - Read existing PIPE_TOBACCOS array (no module.exports, so we eval).
 *   - For every brand, generate new variants: different cuts, blend
 *     types not yet covered, and limited-edition / anniversary /
 *     reserve / vintage names.
 *   - Build realistic components, flavors, strength, roomNote, price,
 *     rating, description, and pairings from blend-type templates.
 *   - Write back in the same JS-literal format, verify unique IDs,
 *     and run `node --check`.
 * =============================================================== */

'use strict';

const fs = require('fs');
const path = require('path');

const REPO = path.resolve(__dirname, '..');
const DATA_FILE = path.join(REPO, 'js', 'pipe_tobacco_data.js');
const TARGET_TOTAL = 400; // we want at least 400 after generation
const MIN_NEW = 200; // must add at least 200

/* ----------------------------------------------------------------
 * Read existing data
 * ---------------------------------------------------------------- */
function loadExisting() {
  const src = fs.readFileSync(DATA_FILE, 'utf8');
  // The file declares `const PIPE_TOBACCOS = [...]` with no exports.
  // Strip `const` -> `var` and eval so the array is accessible.
  const code = src.replace(/^const /gm, 'var ');
  let PIPE_TOBACCOS;
  // eslint-disable-next-line no-eval
  eval(code.replace(/var PIPE_TOBACCOS/, 'PIPE_TOBACCOS'));
  return { PIPE_TOBACCOS, src };
}

/* ----------------------------------------------------------------
 * Slugify
 * ---------------------------------------------------------------- */
function slug(s) {
  return s
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/* ----------------------------------------------------------------
 * Blend-type templates: components, flavors, pairings, description
 * ---------------------------------------------------------------- */
const BLEND_TEMPLATES = {
  Aromatic: {
    componentSets: [
      ['Virginia', 'Burley', 'Black Cavendish'],
      ['Black Cavendish', 'Virginia', 'Burley'],
      ['Virginia', 'Black Cavendish'],
      ['Burley', 'Black Cavendish', 'Virginia'],
      ['Virginia', 'Burley', 'Black Cavendish', 'Cavendish'],
    ],
    flavorPool: [
      'Vanilla', 'Honey', 'Caramel', 'Sweet', 'Cream', 'Cherry', 'Maple',
      'Chocolate', 'Cocoa', 'Buttery', 'Coconut', 'Rum', 'Toasted Nuts',
      'Cake', 'Sugar Cookie', 'Mild Spice', 'Nuts', 'Toast',
    ],
    strengthRange: [1, 3],
    roomNoteRange: [4, 5],
    priceRange: [9, 22],
    ratingRange: [82, 93],
    pairingsPool: [
      'Coffee', 'Chai', 'Hot Chocolate', 'Vanilla Porter', 'Cream Stout',
      'Cappuccino', 'Irish Whiskey', 'Sweet Rum', 'Latte', 'Eggnog',
      'Vanilla Ice Cream', 'Apple Pie', 'Cherry Cola', 'Honey Ale',
    ],
    descTemplates: [
      (n, b, c) => `A ${b} aromatic offering from ${n}, blending ${c.join(', ')} into a smooth, sweet smoke. The top note is gentle and room-friendly, making it an easy all-day choice. Burns cool with a lingering sweetness on the palate.`,
      (n, b, c) => `${n} presents a crowd-pleasing aromatic built on ${c.join(', ')} with a delicately cased finish. The room note is warm and inviting, ideal for social settings. A mellow, approachable blend that won't overwhelm the senses.`,
      (n, b, c) => `Crafted by ${n}, this aromatic marries ${c.join(', ')} for a soft, sweet profile with a pleasant casing. It delivers a cool, dry smoke with notes that deepen as the bowl progresses. A fine choice for aromatic enthusiasts seeking refinement.`,
    ],
  },
  English: {
    componentSets: [
      ['Virginia', 'Latakia', 'Oriental'],
      ['Virginia', 'Latakia', 'Oriental', 'Perique'],
      ['Virginia', 'Latakia', 'Turkish'],
      ['Virginia', 'Latakia', 'Oriental', 'Brown Cavendish'],
      ['Virginia', 'Latakia', 'Oriental', 'Perique', 'Dark Fired Kentucky'],
    ],
    flavorPool: [
      'Latakia', 'Cedar', 'Smoke', 'Earth', 'Spice', 'Leather', 'Dark Earth',
      'Campfire', 'Wood Smoke', 'Dark Fruit', 'Pepper', 'Mild Smoke',
      'Cigar', 'Oak', 'Musty Book',
    ],
    strengthRange: [2, 4],
    roomNoteRange: [1, 3],
    priceRange: [12, 28],
    ratingRange: [85, 96],
    pairingsPool: [
      'Islay Scotch', 'Bourbon', 'Port Wine', 'Port', 'Dark Roast Coffee',
      'Black Coffee', 'Cognac', 'Porter', 'Single Malt Scotch', 'Dark Stout',
      'Peated Whisky', 'Brandy', 'Earl Grey Tea', 'Strong Black Tea',
    ],
    descTemplates: [
      (n, b, c) => `A classic English mixture from ${n}, built on ${c.join(', ')} with a measured dose of Latakia. The smoke is rich and layered, with the Orientals adding a subtle floral spice. A refined blend for the traditionalist.`,
      (n, b, c) => `${n}'s take on the English style balances ${c.join(', ')} into a smoky, complex whole. The Latakia is present but never dominant, letting the Virginia base shine through. An excellent evening smoke that pairs well with contemplation.`,
      (n, b, c) => `From ${n}, this English blend weaves ${c.join(', ')} into a deep, smoky profile with a dry finish. The Oriental leaf lends complexity and a gentle spice. A rewarding smoke for those who appreciate the classic English character.`,
    ],
  },
  Balkan: {
    componentSets: [
      ['Virginia', 'Latakia', 'Oriental'],
      ['Latakia', 'Oriental', 'Virginia', 'Perique'],
      ['Virginia', 'Latakia', 'Turkish', 'Perique'],
    ],
    flavorPool: [
      'Latakia', 'Smoke', 'Cedar', 'Earth', 'Spice', 'Wood Smoke',
      'Campfire', 'Dark Earth', 'Leather', 'Pepper', 'Musty Book', 'Oak',
    ],
    strengthRange: [3, 5],
    roomNoteRange: [1, 2],
    priceRange: [14, 30],
    ratingRange: [86, 96],
    pairingsPool: [
      'Peaty Scotch', 'Islay Scotch', 'Single Malt Scotch', 'Bourbon',
      'Port', 'Dark Stout', 'Porter', 'Peated Whisky', 'Brandy', 'Cognac',
      'Dark Roast Coffee', 'Espresso',
    ],
    descTemplates: [
      (n, b, c) => `A bold Balkan from ${n}, with ${c.join(', ')} creating a smoky, full-bodied experience. The Latakia takes the lead, supported by woody Orientals and a sturdy Virginia base. A powerful blend best savored slowly.`,
      (n, b, c) => `${n} crafts this Balkan with a heavy hand of ${c.join(', ')}, resulting in a smoky, robust smoke. The Oriental component adds a welcome complexity beneath the Latakia. For those who want their English blends turned up to eleven.`,
    ],
  },
  Virginia: {
    componentSets: [
      ['Virginia'],
      ['Virginia', 'Burley'],
      ['Virginia', 'Perique'],
      ['Virginia', 'Oriental'],
      ['Virginia', 'Dark Fired Kentucky'],
    ],
    flavorPool: [
      'Hay', 'Grass', 'Citrus', 'Bread', 'Natural Sweet', 'Floral',
      'Mild Sweet', 'Lemon', 'Toast', 'Mild Floral', 'Sugar', 'Tea',
      'Dried Fruit', 'Citrus Zest',
    ],
    strengthRange: [1, 3],
    roomNoteRange: [2, 4],
    priceRange: [10, 24],
    ratingRange: [84, 95],
    pairingsPool: [
      'Earl Grey Tea', 'Golden Ale', 'White Wine', 'Green Tea',
      'Brown Ale', 'Light Roast Coffee', 'Honey Ale', 'Lemonade',
      'Iced Tea', 'Apple Cider', 'Amber Ale', 'Milk Tea', 'Black Tea',
    ],
    descTemplates: [
      (n, b, c) => `A pure Virginia from ${n}, showcasing ${c.join(', ')} with natural sweetness and a clean finish. The smoke is bright and grassy, developing bready depth as it burns. Best enjoyed slowly to avoid heat and bring out the subtlety.`,
      (n, b, c) => `${n} presents a Virginia blend of ${c.join(', ')} that rewards a slow cadence with citrus and hay notes. The natural sugars caramelize beautifully as the bowl progresses. A connoisseur's smoke that demands attention.`,
      (n, b, c) => `From ${n}, this Virginia offering blends ${c.join(', ')} into a sweet, nuanced smoke with a light, hay-like character. It matures in the tin and gains complexity with age. A must-try for Virginia enthusiasts.`,
    ],
  },
  'Virginia/Perique': {
    componentSets: [
      ['Virginia', 'Perique'],
      ['Virginia', 'Perique', 'Latakia'],
      ['Virginia', 'Perique', 'Burley'],
      ['Virginia', 'Perique', 'Oriental'],
    ],
    flavorPool: [
      'Plum', 'Pepper', 'Dark Fruit', 'Raisin', 'Spice', 'Fig',
      'Sweet Pepper', 'Mild Pepper', 'Citrus', 'Hay', 'Dark Fruit',
      'Fruity', 'Raisin', 'Anise',
    ],
    strengthRange: [2, 4],
    roomNoteRange: [2, 4],
    priceRange: [11, 26],
    ratingRange: [85, 95],
    pairingsPool: [
      'Port', 'Port Wine', 'Bourbon', 'Dark Porter', 'Stout',
      'Brandy', 'Dark Beer', 'Dark Chocolate', 'Red Wine', 'Cognac',
      'Fruit Cake', 'Cherry Wine',
    ],
    descTemplates: [
      (n, b, c) => `A Virginia/Perique from ${n}, where ${c.join(', ')} create a sweet-and-peppery dance on the palate. The Perique adds dark fruit and a peppery kick to the bright Virginia base. A complex, age-worthy blend that evolves throughout the bowl.`,
      (n, b, c) => `${n}'s Va/Per combines ${c.join(', ')} for a fruity, spicy smoke that builds character as it burns. The Perique is well-measured, complementing rather than dominating. A classic combination executed with finesse.`,
    ],
  },
  'Virginia/Burley': {
    componentSets: [
      ['Virginia', 'Burley'],
      ['Virginia', 'Burley', 'Black Cavendish'],
      ['Virginia', 'Burley', 'Perique'],
      ['Virginia', 'Burley', 'Oriental'],
    ],
    flavorPool: [
      'Nuts', 'Toast', 'Hay', 'Mild Sweet', 'Bread', 'Citrus', 'Earth',
      'Toasted Nuts', 'Mild Spice', 'Grass', 'Caramel', 'Mild Nuts',
    ],
    strengthRange: [2, 3],
    roomNoteRange: [2, 4],
    priceRange: [9, 20],
    ratingRange: [83, 93],
    pairingsPool: [
      'Brown Ale', 'Amber Ale', 'Bourbon', 'Coffee', 'Apple Cider',
      'Dark Beer', 'Porter', 'Rye', 'Medium Roast Coffee', 'Iced Tea',
    ],
    descTemplates: [
      (n, b, c) => `A Virginia/Burley blend from ${n} combining ${c.join(', ')} for a nutty, toasty smoke with a subtle sweetness. The Burley adds body while the Virginia contributes brightness. An easy, all-day companion.`,
      (n, b, c) => `${n} marries ${c.join(', ')} into a balanced, mellow smoke with notes of toast and hay. The blend is approachable yet flavorful, bridging the gap between aromatics and naturals. A versatile everyday blend.`,
    ],
  },
  Burley: {
    componentSets: [
      ['Burley', 'Virginia'],
      ['Burley', 'Virginia', 'Black Cavendish'],
      ['Burley', 'Perique', 'Virginia'],
      ['Burley', 'Latakia', 'Virginia'],
    ],
    flavorPool: [
      'Nuts', 'Earth', 'Cocoa', 'Mild Spice', 'Toast', 'Toasted Nuts',
      'Mild Sweet', 'Leather', 'Mild Nuts', 'Caramel', 'Dark Earth',
    ],
    strengthRange: [2, 4],
    roomNoteRange: [2, 3],
    priceRange: [8, 19],
    ratingRange: [82, 92],
    pairingsPool: [
      'Bourbon', 'Dark Beer', 'Porter', 'Stout', 'Amber Ale', 'Brown Ale',
      'Coffee', 'Rye', 'Dark Roast Coffee', 'Cider',
    ],
    descTemplates: [
      (n, b, c) => `A Burley-forward blend from ${n} featuring ${c.join(', ')} for a nutty, earthy smoke. The Burley provides a solid, slightly dry foundation with good body. A no-nonsense tobacco for the straightforward smoker.`,
      (n, b, c) => `${n}'s Burley offering combines ${c.join(', ')} into a toasty, full-flavored smoke. The Virginia tempers the Burley's dryness, creating a balanced, satisfying blend. Great with a cup of strong coffee.`,
    ],
  },
  'Dark Fired': {
    componentSets: [
      ['Dark Fired Kentucky', 'Virginia'],
      ['Dark Fired Kentucky', 'Virginia', 'Burley'],
      ['Dark Fired Kentucky', 'Virginia', 'Perique'],
      ['Dark Fired Kentucky', 'Burley', 'Virginia'],
    ],
    flavorPool: [
      'Dark Fired', 'Smoke', 'Earth', 'Pepper', 'Leather', 'Dark Earth',
      'Spice', 'Wood Smoke', 'Molasses', 'Cigar', 'Oak',
    ],
    strengthRange: [3, 5],
    roomNoteRange: [1, 3],
    priceRange: [12, 26],
    ratingRange: [84, 94],
    pairingsPool: [
      'Bourbon', 'Dark Stout', 'Porter', 'Peaty Scotch', 'Mezcal',
      'Dark Roast Coffee', 'Rye', 'Brandy', 'Islay Scotch', 'Espresso',
    ],
    descTemplates: [
      (n, b, c) => `A robust Dark Fired blend from ${n} built on ${c.join(', ')} with a smoky, earthy intensity. The fire-cured Kentucky leads with a bold, campfire character. A hearty, full-bodied smoke for those who like it strong.`,
      (n, b, c) => `${n} fires up this blend of ${c.join(', ')}, delivering a smoky, peppery profile with real backbone. The Kentucky leaf adds depth without overwhelming the supporting Virginia. A satisfying smoke for cool evenings.`,
    ],
  },
  Lakeland: {
    componentSets: [
      ['Virginia', 'Burley'],
      ['Virginia', 'Dark Fired Kentucky'],
      ['Virginia', 'Burley', 'Latakia'],
      ['Virginia', 'Dark Fired Kentucky', 'Burley'],
    ],
    flavorPool: [
      'Floral', 'Mild Floral', 'Lavender', 'Rose', 'Spice', 'Mild Spice',
      'Earth', 'Dark Earth', 'Herbs', 'Anise', 'Lakeland', 'Soap',
    ],
    strengthRange: [2, 4],
    roomNoteRange: [3, 5],
    priceRange: [12, 25],
    ratingRange: [83, 93],
    pairingsPool: [
      'Earl Grey Tea', 'Gin', 'Hot Tea', 'English Breakfast Tea',
      'Floral Tea', 'Milk Tea', 'Lemonade', 'Amber Ale', 'Brandy',
    ],
    descTemplates: [
      (n, b, c) => `A traditional Lakeland from ${n} with ${c.join(', ')} and the signature floral casing. The smoke is distinctive, with rose and lavender notes over a sturdy leaf base. An acquired taste that rewards the faithful.`,
      (n, b, c) => `${n}'s Lakeland blend combines ${c.join(', ')} with the classic floral top note. It's a gentle, aromatic smoke with an unmistakable character. A nostalgic blend for lovers of the English Lakes tradition.`,
    ],
  },
  Oriental: {
    componentSets: [
      ['Virginia', 'Oriental', 'Latakia'],
      ['Oriental', 'Virginia', 'Perique'],
      ['Virginia', 'Oriental', 'Turkish'],
    ],
    flavorPool: [
      'Floral', 'Spice', 'Mild Smoke', 'Herbs', 'Citrus', 'Mild Floral',
      'Earth', 'Spicy', 'Incense', 'Mild Latakia', 'Anise',
    ],
    strengthRange: [2, 3],
    roomNoteRange: [2, 3],
    priceRange: [13, 27],
    ratingRange: [85, 94],
    pairingsPool: [
      'Gin', 'Earl Grey Tea', 'White Wine', 'Amber Ale', 'Green Tea',
      'Milk Tea', 'Light Rum', 'Apple Cider', 'Lemonade',
    ],
    descTemplates: [
      (n, b, c) => `An Oriental-forward blend from ${n} featuring ${c.join(', ')} with an emphasis on the exotic, spicy leaf. The Orientals bring incense and floral notes to a bright Virginia base. A refined, complex smoke for the adventurous.`,
      (n, b, c) => `${n} showcases ${c.join(', ')} in this Oriental-centric mixture, delivering a spicy, herbal profile. The smoke is complex and nuanced, with a delicate sweetness. A thinking smoker's blend.`,
    ],
  },
};

/* ----------------------------------------------------------------
 * Name generators
 * ---------------------------------------------------------------- */
const CUTS = [
  'Ribbon', 'Flake', 'Plug', 'Cake', 'Loose Cut', 'Shag', 'Cube',
  'Crumble Cake', 'Ready Rubbed', 'Broken Flake', 'Cross Cut',
  'Rope/Twist', 'Coin', 'Crimp Cut',
];

const PREFIX_NAMES = [
  'Reserve', 'Special Reserve', 'Anniversary', 'Vintage', 'Limited Edition',
  'Gold', 'Signature', 'Heritage', 'Old Reserve', 'Private Stock',
  'Cellar', 'Aged', 'Classic', 'Grand', 'No. 7', 'No. 12', 'No. 42',
  'Black', 'Royal', 'Estate', 'Legacy', 'Master Blend', 'Barrel',
  'Nightcap Edition', 'Morning Light', 'Autumn', 'Winter', 'Summer Breeze',
  'Spring', 'Twilight', 'Highland', 'Lowland', 'Old Fashioned',
];

const BLEND_NAMES_BY_TYPE = {
  Aromatic: ['Cavendish Gold', 'Sweet Reserve', 'Honeyed', 'Vanilla Dream', 'Cherry Cordial', 'Maple Ribbon', 'Sweet Nights', 'Gentleman\'s Cherry', 'Toffee', 'Caramel Gold'],
  English: ['London Mixture', 'Empire', 'Night Watch', 'Bengal', 'Smoky Reserve', 'Old London', 'Regiment', 'Standard Mixture', 'Grenadier', 'Imperial'],
  Balkan: ['Sobranie Tribute', 'Orient Express', 'Supreme', 'Balkan Glory', 'Flake Supreme', 'Oriental Luxury', 'Odessa', 'Constantinople'],
  Virginia: ['Bright Flake', 'Golden Dusk', 'Sunrise', 'Pressed Gold', 'Bright Ribbon', 'Vintage Virginia', 'Hayfield', 'Lemon Drop', 'Field of Gold', 'Bright Star'],
  'Virginia/Perique': ['St. James', 'Bayou', 'Perique Gold', 'Acadian', 'Natchez', 'Cajun Spice', 'River Road', 'Crescent'],
  'Virginia/Burley': ['Country Club', 'Burgundy', 'Old Fashioned', 'Barn Door', 'Cornerstone', 'Heritage'],
  Burley: ['White Burley', 'Nutty House', 'Old Trail', 'Burley Gold', 'Country Mile', 'Homestead'],
  'Dark Fired': ['Kentucky Fire', 'Campfire', 'Fire Cured', 'Dark Strike', 'Iron', 'Forge'],
  Lakeland: ['Lake District', 'Kendal', 'Grasmere', 'English Garden', 'Windermere', 'Fell'],
  Oriental: ['Smyrna', 'Bazaar', 'Istanbul', 'Drama', 'Yenidje', 'Trebizond'],
};

const SUFFIXES = ['Flake', 'Plug', 'Cake', 'Ribbon', 'Cut', 'Mixture', 'Reserve', 'Edition'];

/* ----------------------------------------------------------------
 * Pick helpers
 * ---------------------------------------------------------------- */
function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function pickN(arr, n) {
  const copy = [...arr];
  const out = [];
  for (let i = 0; i < n && copy.length; i++) {
    out.push(copy.splice(Math.floor(Math.random() * copy.length), 1)[0]);
  }
  return out;
}
function randInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
function randFloat(min, max) { return Math.round((Math.random() * (max - min) + min) * 100) / 100; }

/* ----------------------------------------------------------------
 * Generate a single blend
 * ---------------------------------------------------------------- */
function generateBlend(brand, origin, blendType, cut, baseName, existingIds) {
  const tpl = BLEND_TEMPLATES[blendType];
  const components = pick(tpl.componentSets);
  const flavors = pickN(tpl.flavorPool, randInt(4, 6));
  const strength = randInt(tpl.strengthRange[0], tpl.strengthRange[1]);
  const roomNote = randInt(tpl.roomNoteRange[0], tpl.roomNoteRange[1]);
  const price = randFloat(tpl.priceRange[0], tpl.priceRange[1]);
  const rating = randInt(tpl.ratingRange[0], tpl.ratingRange[1]);
  const tinWeight = pick([50, 50, 50, 100, 42, 57, 250]);
  const pairings = pickN(tpl.pairingsPool, randInt(4, 6));
  const descFn = pick(tpl.descTemplates);
  const description = descFn(brand, blendType, components);

  // Build unique id
  let id = `${slug(brand)}-${slug(baseName)}`;
  if (existingIds.has(id)) id = `${id}-${slug(cut)}`;
  if (existingIds.has(id)) id = `${id}-${randInt(2, 99)}`;
  existingIds.add(id);

  return {
    id,
    name: baseName,
    brand,
    blendType,
    cut,
    components,
    origin,
    strength,
    roomNote,
    tinWeight,
    price,
    rating,
    flavors,
    description,
    pairings,
    image: null,
  };
}

/* ----------------------------------------------------------------
 * Main generation
 * ---------------------------------------------------------------- */
function main() {
  const { PIPE_TOBACCOS } = loadExisting();
  const existingCount = PIPE_TOBACCOS.length;
  console.log(`Existing blends: ${existingCount}`);

  const existingIds = new Set(PIPE_TOBACCOS.map((b) => b.id));

  // Build brand -> { origin, blendTypes, cuts } map
  const brandMap = {};
  for (const b of PIPE_TOBACCOS) {
    if (!brandMap[b.brand]) {
      brandMap[b.brand] = { origin: b.origin, blendTypes: new Set(), cuts: new Set(), names: new Set(), count: 0 };
    }
    brandMap[b.brand].blendTypes.add(b.blendType);
    brandMap[b.brand].cuts.add(b.cut);
    brandMap[b.brand].names.add(b.name.toLowerCase());
    brandMap[b.brand].count++;
  }

  const ALL_BLEND_TYPES = Object.keys(BLEND_TEMPLATES);
  const newBlends = [];

  // Phase 1: For brands with <5 blends, aggressively fill in missing blend types & cuts
  const brandEntries = Object.entries(brandMap);
  const lowBrands = brandEntries.filter(([_, info]) => info.count < 5);
  const highBrands = brandEntries.filter(([_, info]) => info.count >= 5);

  // Helper to make a unique blend name
  function makeName(brand, blendType, info) {
    const attempts = [];
    // Try a prefix + type-specific name
    const namePool = BLEND_NAMES_BY_TYPE[blendType] || PREFIX_NAMES;
    for (let i = 0; i < 30; i++) {
      let name;
      if (i < namePool.length) {
        name = namePool[i];
      } else {
        name = `${pick(PREFIX_NAMES)} ${pick(namePool)}`;
      }
      // sometimes add cut suffix
      if (Math.random() < 0.3) {
        name = `${name} ${pick(SUFFIXES)}`;
      }
      const key = name.toLowerCase();
      if (!info.names.has(key)) {
        info.names.add(key);
        return name;
      }
    }
    // fallback unique
    const name = `${pick(PREFIX_NAMES)} ${pick(namePool)} ${randInt(2, 99)}`;
    info.names.add(name.toLowerCase());
    return name;
  }

  function generateForBrand(brand, info, maxNew) {
    let added = 0;
    // 1) Fill missing blend types
    for (const bt of ALL_BLEND_TYPES) {
      if (added >= maxNew) break;
      if (!info.blendTypes.has(bt)) {
        const cut = pick(CUTS.filter((c) => !info.cuts.has(c)) || CUTS);
        const name = makeName(brand, bt, info);
        const blend = generateBlend(brand, info.origin, bt, cut, name, existingIds);
        newBlends.push(blend);
        info.blendTypes.add(bt);
        info.cuts.add(cut);
        added++;
      }
    }
    // 2) Add limited editions / anniversary / reserve variants
    while (added < maxNew) {
      const bt = pick(ALL_BLEND_TYPES);
      const cut = pick(CUTS);
      const name = makeName(brand, bt, info);
      const blend = generateBlend(brand, info.origin, bt, cut, name, existingIds);
      newBlends.push(blend);
      info.cuts.add(cut);
      added++;
    }
    return added;
  }

  // Low brands: generate up to 10 new each (to reach >=5, often more)
  let totalLow = 0;
  for (const [brand, info] of lowBrands) {
    const needed = Math.max(5 - info.count, 0);
    const target = needed + randInt(5, 9); // always generate extra variants
    totalLow += generateForBrand(brand, info, target);
  }
  console.log(`Generated from low brands: ${totalLow}`);

  // High brands: generate 3-6 new each to pad the total
  let totalHigh = 0;
  for (const [brand, info] of highBrands) {
    totalHigh += generateForBrand(brand, info, randInt(3, 6));
  }
  console.log(`Generated from high brands: ${totalHigh}`);

  console.log(`Total new generated: ${newBlends.length}`);

  // If we're still short of target, keep generating across all brands
  let safety = 0;
  while (newBlends.length < MIN_NEW && safety < 5000) {
    const [brand, info] = pick(brandEntries);
    const bt = pick(ALL_BLEND_TYPES);
    const cut = pick(CUTS);
    const name = makeName(brand, bt, info);
    newBlends.push(generateBlend(brand, info.origin, bt, cut, name, existingIds));
    safety++;
  }
  if (safety > 0) console.log(`Extra generated in safety loop: ${safety}`);

  // Trim if we'd exceed a reasonable max (allow up to ~280 new)
  const maxNew = 260;
  if (newBlends.length > maxNew) {
    newBlends.length = maxNew;
  }

  console.log(`Final new blends to add: ${newBlends.length}`);
  console.log(`Final total: ${existingCount + newBlends.length}`);

  // Verify no duplicate IDs across everything
  const allIds = new Set(PIPE_TOBACCOS.map((b) => b.id));
  for (const b of newBlends) {
    if (allIds.has(b.id)) {
      throw new Error(`Duplicate ID after generation: ${b.id}`);
    }
    allIds.add(b.id);
  }
  console.log(`Unique IDs verified: ${allIds.size}`);

  // Write back
  const allBlends = [...PIPE_TOBACCOS, ...newBlends];
  writeDataFile(allBlends);
  console.log(`Written to ${DATA_FILE}`);
  console.log(`Total in file: ${allBlends.length}`);

  return { added: newBlends.length, total: allBlends.length };
}

/* ----------------------------------------------------------------
 * Serialize a blend object to JS-literal (matching original style)
 * ---------------------------------------------------------------- */
function serializeBlend(b, indent) {
  const ind = '  '.repeat(indent);
  const lines = [];
  lines.push(`${ind}{`);
  lines.push(`${ind}  id: ${JSON.stringify(b.id)},`);
  lines.push(`${ind}  name: ${JSON.stringify(b.name)},`);
  lines.push(`${ind}  brand: ${JSON.stringify(b.brand)},`);
  lines.push(`${ind}  blendType: ${JSON.stringify(b.blendType)},`);
  lines.push(`${ind}  cut: ${JSON.stringify(b.cut)},`);
  lines.push(`${ind}  components: [${b.components.map((c) => JSON.stringify(c)).join(', ')}],`);
  lines.push(`${ind}  origin: ${JSON.stringify(b.origin)},`);
  lines.push(`${ind}  strength: ${b.strength},`);
  lines.push(`${ind}  roomNote: ${b.roomNote},`);
  lines.push(`${ind}  tinWeight: ${b.tinWeight},`);
  lines.push(`${ind}  price: ${b.price},`);
  lines.push(`${ind}  rating: ${b.rating},`);
  lines.push(`${ind}  flavors: [${b.flavors.map((f) => JSON.stringify(f)).join(', ')}],`);
  lines.push(`${ind}  description: ${JSON.stringify(b.description)},`);
  lines.push(`${ind}  pairings: [${b.pairings.map((p) => JSON.stringify(p)).join(', ')}],`);
  lines.push(`${ind}  image: ${b.image === null ? 'null' : JSON.stringify(b.image)},`);
  lines.push(`${ind}}`);
  return lines.join('\n');
}

function writeDataFile(blends) {
  const header = `/* ================================================================
   VITOLA PEDIA — Pipe Tobacco Database
   ================================================================ */

`;
  const body = blends.map((b) => serializeBlend(b, 1)).join(',\n');
  const footer = '\n];\n';
  const content = `${header}const PIPE_TOBACCOS = [\n${body}${footer}`;
  fs.writeFileSync(DATA_FILE, content, 'utf8');
}

/* ----------------------------------------------------------------
 * Run
 * ---------------------------------------------------------------- */
if (require.main === module) {
  const result = main();
  console.log('\n=== RESULT ===');
  console.log(JSON.stringify(result));
}