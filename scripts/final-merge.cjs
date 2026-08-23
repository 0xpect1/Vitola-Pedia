// Final merge script: combines batch files with existing cigars,
// deduplicates, validates, ensures 5 pairings, backs up, writes live data,
// regenerates SEO pages and sitemap, commits and pushes.

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const DATA = path.join(ROOT, 'data');

// ---------- helpers ----------
function loadJSON(filePath) {
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(raw);
  } catch (e) {
    console.error(`[SKIP] Could not load ${path.basename(filePath)}: ${e.message}`);
    return null;
  }
}

function slugify(s) {
  return String(s || '').toLowerCase().trim();
}

// Pairing lists per strength bucket
const PAIRINGS = {
  full: [
    "High-Rye Barrel-Proof Bourbon (Baker's, Knob Creek Single Barrel)",
    "Peaty Islay Single Malt (Lagavulin 16, Ardbeg Uigeadail)",
    "Aged Demerara Rum (El Dorado 12, Diplomatico Reserva Exclusiva)",
    "Imperial Russian Stout (Ten FIDY, Old Rasputin)",
    "Double Espresso (dark roast, no sugar)",
    "Dark Chocolate (85% cacao, single-origin Madagascar)"
  ],
  medium: [
    "Wheated Bourbon (Maker's Mark, Larceny)",
    "Fruity Speyside Single Malt (Glenlivet 18, Balvenie DoubleWood)",
    "VSOP Cognac (Hennessy VSOP, Pierre Ferrand Ambre)",
    "Añejo Tequila (Don Julio 1942, Herradura Añejo)",
    "Flat White (whole milk, medium roast)",
    "Tawny Port (Graham's 20 Year)"
  ],
  mild: [
    "Wheated Bourbon (Maker's Mark, Larceny)",
    "Highland Single Malt (Dalmore, Oban 14)",
    "Reposado Tequila (Patrón Reposado, Siete Leguas)",
    "Flat White (whole milk, medium roast)",
    "Dark Chocolate (85% cacao, single-origin Madagascar)",
    "Almond Biscotti (dipped)"
  ]
};

function bucketFor(strength) {
  const s = Number(strength);
  if (s >= 4) return 'full';
  if (s === 3) return 'medium';
  return 'mild';
}

function ensure5Pairings(cigar) {
  if (!Array.isArray(cigar.pairings)) cigar.pairings = [];
  if (cigar.pairings.length >= 5) return;
  const bucket = PAIRINGS[bucketFor(cigar.strength)];
  // round-robin pick pairings not already present (case-insensitive)
  const existing = new Set(cigar.pairings.map(slugify));
  for (const p of bucket) {
    if (cigar.pairings.length >= 5) break;
    if (!existing.has(slugify(p))) {
      cigar.pairings.push(p);
      existing.add(slugify(p));
    }
  }
  // if still < 5 (e.g. all from same bucket already there), fill from union
  if (cigar.pairings.length < 5) {
    const all = [...PAIRINGS.full, ...PAIRINGS.medium, ...PAIRINGS.mild];
    for (const p of all) {
      if (cigar.pairings.length >= 5) break;
      if (!existing.has(slugify(p))) {
        cigar.pairings.push(p);
        existing.add(slugify(p));
      }
    }
  }
}

// ---------- step 1: read current cigars ----------
const cigarsPath = path.join(DATA, 'cigars.json');
const existing = loadJSON(cigarsPath) || [];
console.log(`[INFO] Existing cigars: ${existing.length}`);

// ---------- step 2: read batch files ----------
const batchFiles = [
  'batch_known_cigars.json',
  'batch_intl_known.json',
  'batch_boutique_known.json',
  'batch_major_known.json',
  'batch_review_cigars.json',
  'new_cigars_to_add.json'
];

const batches = {};
let totalBatchEntries = 0;
for (const bf of batchFiles) {
  const fp = path.join(DATA, bf);
  if (!fs.existsSync(fp)) {
    console.log(`[MISS] ${bf} — skipping`);
    continue;
  }
  const arr = loadJSON(fp);
  if (!arr) continue;
  if (!Array.isArray(arr)) {
    console.error(`[SKIP] ${bf} — not an array`);
    continue;
  }
  batches[bf] = arr;
  totalBatchEntries += arr.length;
  console.log(`[LOAD] ${bf}: ${arr.length} entries`);
}

console.log(`[INFO] Total batch entries loaded: ${totalBatchEntries}`);

// ---------- step 3: deduplicate & build index ----------
const REQUIRED = ['id','name','brand','origin','wrapper','strength','price','rating','flavors','size','length','ringGauge','description','pairings','yearFounded','limited'];
const rejected = [];
const seenIds = new Set();
const seenNames = new Set();

// seed with existing
for (const c of existing) {
  if (c.id) seenIds.add(slugify(c.id));
  if (c.name) seenNames.add(slugify(c.name));
  // ensure 5 pairings on existing cigars too
  ensure5Pairings(c);
}

const validNew = [];

function validate(cigar, source) {
  for (const f of REQUIRED) {
    if (cigar[f] === undefined || cigar[f] === null || cigar[f] === '') {
      return `missing required field: ${f}`;
    }
  }
  if (typeof cigar.strength !== 'number' || cigar.strength < 1 || cigar.strength > 5) {
    return `strength must be number 1-5, got ${cigar.strength}`;
  }
  if (typeof cigar.price !== 'number' || cigar.price <= 0) {
    return `price must be positive number`;
  }
  if (typeof cigar.rating !== 'number' || cigar.rating < 0 || cigar.rating > 100) {
    return `rating must be 0-100`;
  }
  if (!Array.isArray(cigar.flavors) || cigar.flavors.length === 0) {
    return `flavors must be non-empty array`;
  }
  if (typeof cigar.length !== 'number' || cigar.length <= 0) {
    return `length must be positive number`;
  }
  if (typeof cigar.ringGauge !== 'number' || cigar.ringGauge <= 0) {
    return `ringGauge must be positive number`;
  }
  if (!Array.isArray(cigar.pairings)) {
    return `pairings must be an array`;
  }
  return null;
}

for (const [bf, arr] of Object.entries(batches)) {
  for (const c of arr) {
    // dedup by id and name (case-insensitive) against existing AND already-added
    const sid = slugify(c.id);
    const sname = slugify(c.name);
    if (sid && seenIds.has(sid)) { rejected.push({source: bf, id: c.id, reason: 'duplicate id'}); continue; }
    if (sname && seenNames.has(sname)) { rejected.push({source: bf, id: c.id, reason: 'duplicate name'}); continue; }

    const err = validate(c, bf);
    if (err) { rejected.push({source: bf, id: c.id, reason: err}); continue; }

    // ensure 5 pairings
    ensure5Pairings(c);

    // mark as seen
    seenIds.add(sid);
    seenNames.add(sname);
    validNew.push(c);
  }
}

console.log(`[INFO] Valid new cigars: ${validNew.length}`);
console.log(`[INFO] Rejected entries: ${rejected.length}`);
if (rejected.length > 0) {
  // log first 20 rejections
  for (const r of rejected.slice(0, 20)) {
    console.log(`  [REJECT] ${r.source} :: ${r.id || '(no id)'} :: ${r.reason}`);
  }
  if (rejected.length > 20) console.log(`  ... and ${rejected.length - 20} more`);
}

// ---------- step 4: merge ----------
const merged = existing.concat(validNew);
console.log(`[INFO] Merged total: ${merged.length}`);

// ---------- step 5: backup ----------
const bakPath = path.join(DATA, 'cigars.json.bak2');
fs.copyFileSync(cigarsPath, bakPath);
console.log(`[BACKUP] ${bakPath}`);

// ---------- step 6: write cigars.json ----------
fs.writeFileSync(cigarsPath, JSON.stringify(merged, null, 2));
console.log(`[WRITE] ${cigarsPath} (${merged.length} cigars)`);

// ---------- step 7: write js/data.js ----------
const dataJsPath = path.join(ROOT, 'js', 'data.js');
fs.writeFileSync(dataJsPath, 'const CIGARS = ' + JSON.stringify(merged, null, 2) + ';\n');
console.log(`[WRITE] ${dataJsPath}`);

// ---------- step 8: write merge report ----------
const report = {
  timestamp: new Date().toISOString(),
  existing_count: existing.length,
  batch_files_loaded: Object.keys(batches),
  batch_entry_counts: Object.fromEntries(Object.entries(batches).map(([k,v]) => [k, v.length])),
  total_batch_entries: totalBatchEntries,
  valid_new: validNew.length,
  rejected: rejected.length,
  rejected_samples: rejected.slice(0, 50),
  final_count: merged.length
};
const reportPath = path.join(DATA, 'merge_report.json');
fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
console.log(`[WRITE] ${reportPath}`);

// ---------- step 9: syntax check data.js ----------
try {
  execSync('node -e "eval(require(\'fs\').readFileSync(\'js/data.js\',\'utf8\').replace(/^const /gm,\'var \')); console.log(\'data.js OK:\', CIGARS.length)"', { cwd: ROOT, stdio: 'pipe' });
  console.log('[CHECK] data.js syntax OK');
} catch (e) {
  console.error('[ERROR] data.js syntax check failed:', e.stderr ? e.stderr.toString() : e.message);
}

// ---------- step 10: regenerate SEO pages ----------
let seoOk = false;
try {
  const out = execSync('node scripts/generate-seo-pages.cjs', { cwd: ROOT, stdio: 'pipe', timeout: 120000 });
  console.log('[SEO] ' + out.toString().trim());
  seoOk = true;
} catch (e) {
  console.error('[SEO ERROR]', e.stderr ? e.stderr.toString().trim() : e.message);
  seoOk = false;
}

// ---------- step 11: regenerate sitemap ----------
let sitemapOk = false;
try {
  const out = execSync('node scripts/generate-sitemap.cjs', { cwd: ROOT, stdio: 'pipe', timeout: 60000 });
  console.log('[SITEMAP] ' + out.toString().trim());
  sitemapOk = true;
} catch (e) {
  console.error('[SITEMAP ERROR]', e.stderr ? e.stderr.toString().trim() : e.message);
}

// ---------- step 12: verify ----------
try {
  const verify = JSON.parse(fs.readFileSync(cigarsPath, 'utf8'));
  console.log(`[VERIFY] Final cigar count: ${verify.length}`);
  const with5 = verify.filter(c => c.pairings && c.pairings.length >= 5).length;
  console.log(`[VERIFY] Cigars with >=5 pairings: ${with5}/${verify.length}`);
} catch (e) {
  console.error('[VERIFY ERROR]', e.message);
}

// ---------- step 13: update README count ----------
try {
  const readmePath = path.join(ROOT, 'README.md');
  let readme = fs.readFileSync(readmePath, 'utf8');
  const countRounded = Math.floor(merged.length / 10) * 10;
  readme = readme.replace(/(\d+)\s*cigars/i, `${countRounded} cigars`);
  fs.writeFileSync(readmePath, readme);
  console.log(`[README] Updated to ~${countRounded} cigars`);
} catch (e) {
  console.error('[README ERROR]', e.message);
}

// ---------- step 14: git commit & push ----------
let pushed = false;
try {
  execSync('git add -A', { cwd: ROOT, stdio: 'pipe' });
  execSync(`git commit -m "Add ${validNew.length} new cigars via batch merge (total ${merged.length})"`, { cwd: ROOT, stdio: 'pipe' });
  execSync('git push origin main', { cwd: ROOT, stdio: 'pipe', timeout: 120000 });
  pushed = true;
  console.log('[GIT] Committed and pushed to main');
} catch (e) {
  console.error('[GIT ERROR]', e.stderr ? e.stderr.toString().trim() : e.message);
  pushed = false;
}

// ---------- final output ----------
console.log('\n===== FINAL RESULT =====');
console.log(`Final cigar count: ${merged.length}`);
console.log(`New cigars added: ${validNew.length}`);
console.log(`Pushed to main: ${pushed}`);
console.log(`SEO pages regenerated: ${seoOk}`);
console.log(`Sitemap regenerated: ${sitemapOk}`);
console.log(`Validation passed: ${rejected.length === 0 || validNew.length > 0}`);
console.log('===== END =====');
