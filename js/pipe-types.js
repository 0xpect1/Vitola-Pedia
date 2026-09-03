/* ================================================================
   VITOLA PEDIA — Pipe Types & Pairing System
   Matches each pipe tobacco blend to the best pipe material.
   ================================================================ */

/* ---- Pipe type definitions ---------------------------------------
   Each entry describes a pipe material and what it does best:
   - id            short slug
   - name          display name
   - material      the raw material
   - bestForBlends  blend types this pipe shines with
   - ghostingRisk  none | low | medium | high
                   (how readily it retains prior flavours)
   - heatResistance 1-5 (how well it handles a hot, fast smoke)
   - flavorProfile  how the material shapes the tobacco's taste
   - careNotes     maintenance guidance
------------------------------------------------------------------ */
const PIPE_TYPES = [
  {
    id: "meerschaum",
    name: "Meerschaum",
    material: "Magnesium silicate (sepiolite) — a soft, porous mineral mined chiefly in Eskisehir, Turkey.",
    bestForBlends: ["Aromatic", "Virginia", "Virginia/Perique"],
    bestForStrength: [1, 2, 3],
    ghostingRisk: "none",
    heatResistance: 3,
    flavorProfile: "Neutral and flavour-neutral — adds nothing, subtracts nothing. Lets the tobacco speak in its purest voice. The porous bowl 'breathes', cooling the smoke, and slowly tints from ivory to amber-brown ('coloring') as aromatic oils wick into the stone.",
    careNotes: "Fragile — drops and knocks crack the bowl. Colour deepens with use; never ream aggressively or you'll scrub off the patina. Wipe the rim after each bowl. Use a soft pipe cleaner; no alcohol salt treatment. Dedicate to aromatics and light Virginias so the colour develops evenly.",
  },
  {
    id: "briar",
    name: "Briar",
    material: "Root burl of the white heath tree (Erica arborea), sourced from the Mediterranean — Corsica, Italy, Greece, Algeria.",
    bestForBlends: ["English", "Balkan", "Dark Fired", "Virginia", "Virginia/Perique", "Virginia/Burley", "Burley"],
    bestForStrength: [2, 3, 4, 5],
    ghostingRisk: "low",
    heatResistance: 5,
    flavorProfile: "Slightly sweet, woody grain that adds a subtle backbone without imposing. Absorbs heat and moisture superbly, smoking cool and dry. The dense burl handles a hot pipe without complaint, and a thin cake of carbon builds up to insulate the chamber.",
    careNotes: "The most versatile and forgiving pipe. Break in a new briar gently with a few full bowls to build cake. Rotate among pipes so wood rests and dries. Don't ream below a thin dime of cake. Tolerates Latakia, Orientals, and full-bodied blends — ghosting is minimal compared to clay or meerschaum.",
  },
  {
    id: "corn-cob",
    name: "Corn Cob",
    material: "Cobs from specially bred Missouri corn, hollowed, bored, and fitted with a wood or plastic shank. The American classic — Missouri Meerschaum since 1869.",
    bestForBlends: ["Burley", "Virginia", "Aromatic", "Virginia/Burley"],
    bestForStrength: [1, 2, 3],
    ghostingRisk: "low",
    heatResistance: 3,
    flavorProfile: "Mildly sweet, neutral, and clean — it doesn't impart the woody note of briar, which lets Burley's natural nuttiness and cocoa shine. Smokes cool and surprisingly dry for its weight. Many smokers swear cobs taste 'truer' than briar.",
    careNotes: "Inexpensive and disposable — smoke it till it burns through, then retire it. No break-in needed; the cob is already neutral. Keep it dry (moisture sogs the cob). Ideal for outdoors, fishing, and 'don't care if I lose it' situations. Limited lifespan: expect 50–150 bowls from a good cob.",
  },
  {
    id: "clay",
    name: "Clay",
    material: "High-fired white kaolin clay — the original European pipe, dating to the Tudor era and the 17th-century English tavern clay.",
    bestForBlends: ["Virginia", "Virginia/Perique"],
    bestForStrength: [1, 2, 3],
    ghostingRisk: "none",
    heatResistance: 5,
    flavorProfile: "Completely inert — the purest expression of the leaf, uncoloured by any wood. Virginia and delicate blends reveal their brightest citrus and hay. Smoke is cool and clean, but the bowl gets hot in the hand and can bite the tongue if pushed.",
    careNotes: "Fragile and heat-conductive — the bowl becomes scorching hot; hold it by the stem. Never grip the bowl while lit. Clean by gently heating to burn out residue, or with a soft brush once cool. Ghostes nothing; dedicate freely. Best for slow, contemplative sipping of pure Virginia.",
  },
  {
    id: "morta",
    name: "Morta",
    material: "Bog oak (Quercus or Taxodium) buried in peat marshes for centuries — mined and cured in France, Ireland, and the Netherlands. Scarce and prized.",
    bestForBlends: ["English", "Balkan", "Dark Fired", "Virginia/Perique"],
    bestForStrength: [3, 4, 5],
    ghostingRisk: "medium",
    heatResistance: 4,
    flavorProfile: "Earthy, smoky, slightly peaty undertone that marries with Latakia and dark-fired leaf like a hand in a glove. It amplifies the campfire, leather, and earth notes of heavy English blends. Dense and heat-tolerant, it smokes cool and dry with a distinctive 'bog' character.",
    careNotes: "Dense, slow-growing, and expensive — treat it like the heirloom it is. Break in gently. Morta can ghost; dedicate it to one family (English, say) so the earthiness compounds rather than clashes. Wipe the rim; ream only lightly. Morta ages beautifully over decades of smoking.",
  },
  {
    id: "olive-wood",
    name: "Olive Wood",
    material: "Heartwood of the olive tree (Olea europaea) — Mediterranean stock from Italy, Greece, and Spain; also French and Algerian olivewood.",
    bestForBlends: ["English", "Balkan", "Virginia", "Virginia/Perique"],
    bestForStrength: [2, 3, 4],
    ghostingRisk: "medium",
    heatResistance: 4,
    flavorProfile: "Subtly fruity, faintly peppery, and mineral — it carries Mediterranean warmth that complements Oriental and Latakia tobaccos. The dense, tightly grained wood smokes cool and adds a whisper of its own terroir to the blend.",
    careNotes: "Hard, dense, and heat-tolerant but with irregular, wandering grain that makes it prone to splitting along weak lines — keep it humidified and never over-ream. Can ghost; dedicate to one blend family. Wipe the rim after each smoke. Beautiful and characterful, but demands care.",
  },
  {
    id: "cherrywood",
    name: "Cherrywood",
    material: "Heartwood of the cherry tree (Prunus avium / Prunus serotina) — French, American, and Black cherry, kiln-cured for pipe use.",
    bestForBlends: ["Aromatic", "Virginia", "Virginia/Burley", "Burley"],
    bestForStrength: [1, 2, 3],
    ghostingRisk: "high",
    heatResistance: 3,
    flavorProfile: "Distinctly sweet, fruity, and slightly tart — it lends a cherry-pit and almond-paste note that pairs famously with cased aromatics and cherry-topped blends. The wood is softer than briar and contributes its own fruit character to the smoke.",
    careNotes: "Soft and heat-sensitive — easy to burn through; pack loosely and smoke slowly. Ghosts readily, so dedicate each cherrywood to its own aromatic and never rotate blend families through it. Wipe the rim; ream gently. The pipe equivalent of dessert: best with sweet, cased tobaccos.",
  },
];

/* ---- Pipe-type recommendation logic ------------------------------
   Given a pipe tobacco blend, return the pipe types that pair best,
   sorted from most to least ideal. Scoring is driven by:
   - blendType  (Aromatic, English, Balkan, Virginia, Dark Fired, ...)
   - components (Latakia, Oriental, Burley, Virginia, Perique, ...)
   - strength   (1 = mild → 5 = full)
   The function returns an array of { pipe, score } for the top matches.
------------------------------------------------------------------ */
function recommendPipeTypes(blend) {
  if (!blend) return [];
  const bt = String(blend.blendType || '').toLowerCase();
  const comps = Array.isArray(blend.components) ? blend.components.map(c => String(c).toLowerCase()) : [];
  const strength = Number(blend.strength) || 0;

  const hasLatakia  = comps.some(c => c.includes('latakia'));
  const hasOriental = comps.some(c => c.includes('oriental') || c.includes('turkish'));
  const hasBurley   = comps.some(c => c.includes('burley'));
  const hasVirginia = comps.some(c => c.includes('virginia'));
  const hasPerique  = comps.some(c => c.includes('perique'));
  const hasDarkFired = comps.some(c => c.includes('dark fired') || c.includes('kentucky fire') || c.includes('fire cured'));

  // Aromatic detection — cased blends or blends whose dominant component is Black Cavendish
  const isAromatic = bt === 'aromatic' ||
                     comps.some(c => c.includes('black cavendish') || c.includes('cavendish'));

  const scored = PIPE_TYPES.map(pt => {
    let score = 0;
    const ptBlends = (pt.bestForBlends || []).map(b => b.toLowerCase());

    // Exact blendType match — the strongest signal
    if (ptBlends.includes(bt)) score += 6;

    // Component-driven bonuses
    if (pt.id === 'meerschaum') {
      if (isAromatic)                score += 4;   // no ghosting, neutral, colours with aromatics
      if (bt === 'virginia' && !hasLatakia) score += 3;
      if (strength <= 2)             score += 1;
    }
    if (pt.id === 'briar') {
      if (hasLatakia)                score += 4;   // heat-resistant, durable, ghosts little
      if (bt === 'english' || bt === 'balkan') score += 2;
      if (hasDarkFired)               score += 2;
      if (strength >= 3)             score += 1;   // full-bodied blends reward its durability
    }
    if (pt.id === 'corn-cob') {
      if (hasBurley)                 score += 4;   // burley's nuttiness sings in a cob
      if (strength <= 2)             score += 2;   // casual, all-day smoking
      if (isAromatic)                score += 1;
    }
    if (pt.id === 'clay') {
      if (bt === 'virginia' && comps.length <= 2) score += 5;  // pure Virginia, delicate flavours
      if (hasVirginia && !hasLatakia && !hasBurley) score += 2;
    }
    if (pt.id === 'morta') {
      if (hasLatakia)                score += 5;   // earthy, smoky — a Latakia lover's pipe
      if (hasDarkFired)              score += 3;
      if (bt === 'english' || bt === 'balkan' || bt === 'dark fired') score += 2;
      if (strength >= 3)             score += 1;
    }
    if (pt.id === 'olive-wood') {
      if (hasOriental)               score += 5;   // Mediterranean kinship with Orientals
      if (hasLatakia)                score += 2;
      if (bt === 'english' || bt === 'balkan') score += 2;
    }
    if (pt.id === 'cherrywood') {
      if (isAromatic)                score += 5;   // sweet, fruity — a natural for cased blends
      if (comps.some(c => c.includes('cherry'))) score += 4;
      if (strength <= 2)             score += 1;
    }

    // Strength alignment — favour pipes whose heat tolerance suits the blend
    if (strength >= 4) {
      // Heavy blends want heat-tolerant, low-ghosting pipes
      if (pt.heatResistance >= 4) score += 1;
      if (pt.ghostingRisk === 'high') score -= 3;   // don't burn a fragile, ghosting pipe
    } else if (strength <= 2) {
      // Light blends suit the neutral, cool-smoking pipes
      if (pt.id === 'meerschaum' || pt.id === 'clay' || pt.id === 'corn-cob') score += 1;
    }

    // Perique adds spice — Morta and Olive Wood's earthy backbone balances it
    if (hasPerique && (pt.id === 'morta' || pt.id === 'olive-wood')) score += 1;

    return { pipe: pt, score };
  });

  // Keep only the genuinely recommended matches (score ≥ 5), then sort desc.
  return scored
    .filter(r => r.score >= 5)
    .sort((a, b) => b.score - a.score);
}

/* Expose for the UI layer (enrich.js / app.js). */
if (typeof window !== 'undefined') {
  window.PIPE_TYPES = PIPE_TYPES;
  window.recommendPipeTypes = recommendPipeTypes;
}
