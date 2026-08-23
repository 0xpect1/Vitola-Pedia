#!/usr/bin/env node
/**
 * merge-new-cigars.js — Safely merges new cigar batch files into data/cigars.json
 *
 * What it does:
 *   1. Scans data/ for files matching batch_*.json or new_cigars*.json
 *   2. Reads existing data/cigars.json (the authoritative source)
 *   3. Deduplicates new entries by both id (slug) and name (case-insensitive)
 *   4. Validates every required field on each new cigar
 *   5. Ensures IDs are clean slugs (lowercase, hyphens, no special chars)
 *   6. Merges validated new cigars into the main array
 *   7. Writes data/cigars_merged.json (the merged result)
 *   8. Writes data/merge_report.json (stats: total in, rejected, new, dups, final count)
 *
 * Safety:
 *   - NEVER overwrites cigars.json directly (writes cigars_merged.json instead)
 *   - If ANY validation error occurs, reports and exits non-zero without writing
 *   - Idempotent: safe to run multiple times (previously-merged cigars are detected as dups)
 *
 * Usage:  node scripts/merge-new-cigars.js
 */

import fs   from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

// ── Paths ──────────────────────────────────────────────────────────────────
const DATA_DIR      = path.join(__dirname, '..', 'data');
const CIGARS_JSON   = path.join(DATA_DIR, 'cigars.json');
const MERGED_JSON   = path.join(DATA_DIR, 'cigars_merged.json');
const REPORT_JSON   = path.join(DATA_DIR, 'merge_report.json');

// ── Required fields ─────────────────────────────────────────────────────────
const REQUIRED_FIELDS = [
  'id', 'name', 'brand', 'origin', 'region', 'wrapper', 'binder', 'filler',
  'strength', 'smokingTime', 'price', 'rating', 'flavors', 'size',
  'length', 'ringGauge', 'popularity', 'description', 'pairings',
  'yearFounded', 'limited'
];

// ── Slug regex: lowercase letters, digits, and hyphens only ─────────────────
const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

// ── Helpers ─────────────────────────────────────────────────────────────────

/** Normalise a name for case-insensitive dedup (trim + lower). */
function normaliseName(name) {
  return String(name || '').trim().toLowerCase();
}

/** Check whether a field value is "present" (not undefined, null, or empty string). */
function isPresent(val) {
  if (val === undefined || val === null) return false;
  if (typeof val === 'string' && val.trim() === '') return false;
  if (Array.isArray(val) && val.length === 0) return false;
  return true;
}

/** Validate a single cigar object; returns a list of missing/invalid field names. */
function validateCigar(cigar) {
  const missing = [];
  for (const field of REQUIRED_FIELDS) {
    if (!isPresent(cigar[field])) {
      missing.push(field);
    }
  }
  return missing;
}

/** Ensure an ID is a valid slug; returns { valid, suggestion } */
function validateSlug(id) {
  const sid = String(id || '');
  if (SLUG_RE.test(sid)) return { valid: true, suggestion: sid };
  // Generate a slug suggestion
  const suggestion = sid
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')  // remove special chars
    .replace(/\s+/g, '-')           // spaces → hyphens
    .replace(/-+/g, '-')            // collapse multiple hyphens
    .replace(/^-|-$/g, '');         // trim leading/trailing hyphens
  return { valid: false, suggestion };
}

/** Read and parse a JSON file; returns { data, error } */
function readJson(filePath) {
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    return { data: JSON.parse(raw), error: null };
  } catch (e) {
    return { data: null, error: e.message };
  }
}

/** Find all batch files in data/ matching the patterns */
function findBatchFiles() {
  const files = fs.readdirSync(DATA_DIR);
  const batchFiles = files
    .filter(f => {
      const isBatch   = /^batch_.*\.json$/i.test(f);
      const isNewCig  = /^new_cigars.*\.json$/i.test(f);
      // Exclude the merged output and report files
      const isOutput  = f === 'cigars_merged.json' || f === 'merge_report.json';
      return (isBatch || isNewCig) && !isOutput;
    })
    .sort()
    .map(f => path.join(DATA_DIR, f));
  return batchFiles;
}

// ── Main ────────────────────────────────────────────────────────────────────

function main() {
  console.log('═══════════════════════════════════════════════════');
  console.log('  Cigar Batch Merge — ' + new Date().toISOString());
  console.log('═══════════════════════════════════════════════════\n');

  // 1. Read existing cigars.json
  if (!fs.existsSync(CIGARS_JSON)) {
    console.error('✗ FATAL: data/cigars.json not found at ' + CIGARS_JSON);
    process.exit(1);
  }

  const existingResult = readJson(CIGARS_JSON);
  if (existingResult.error) {
    console.error('✗ FATAL: Could not parse data/cigars.json: ' + existingResult.error);
    process.exit(1);
  }

  const existingCigars = existingResult.data;
  if (!Array.isArray(existingCigars)) {
    console.error('✗ FATAL: data/cigars.json is not an array');
    process.exit(1);
  }

  console.log(`Existing cigars in cigars.json: ${existingCigars.length}\n`);

  // Build dedup sets from existing data
  const existingIdMap   = new Map();   // id → cigar
  const existingNameMap = new Map();   // normalised name → cigar
  for (const c of existingCigars) {
    if (c.id)   existingIdMap.set(c.id, c);
    if (c.name) existingNameMap.set(normaliseName(c.name), c);
  }

  // 2. Find batch files
  const batchFiles = findBatchFiles();
  console.log(`Found ${batchFiles.length} batch file(s):`);
  if (batchFiles.length === 0) {
    console.log('  (none — no files matching batch_*.json or new_cigars*.json in data/)');
  }
  for (const f of batchFiles) {
    console.log('  • ' + path.basename(f));
  }
  console.log();

  // 3. Read all batch files and collect new cigar entries
  const allNewEntries = [];
  let totalRead     = 0;
  let totalRejected = 0;
  const rejected    = [];   // { file, id, name, reason }
  const duplicates  = [];   // { file, id, name, reason, matchedId }
  const slugIssues  = [];   // { file, id, suggestion }

  const seenNewIds   = new Set();   // track IDs seen across batch files
  const seenNewNames = new Set();   // track names seen across batch files

  for (const filePath of batchFiles) {
    const fileName = path.basename(filePath);
    const result = readJson(filePath);

    if (result.error) {
      console.error(`✗ Could not parse ${fileName}: ${result.error}`);
      rejected.push({ file: fileName, id: '(file)', name: '(file)', reason: 'JSON parse error: ' + result.error });
      totalRejected++;
      continue;
    }

    let entries = result.data;
    // Handle both array and single-object formats
    if (!Array.isArray(entries)) {
      if (entries && typeof entries === 'object') {
        entries = [entries];
      } else {
        console.error(`✗ ${fileName} is not an array or object`);
        rejected.push({ file: fileName, id: '(file)', name: '(file)', reason: 'Not an array or object' });
        totalRejected++;
        continue;
      }
    }

    console.log(`\nProcessing ${fileName}: ${entries.length} entries`);
    let fileAdded = 0;
    let fileDup   = 0;
    let fileReject = 0;

    for (const cigar of entries) {
      totalRead++;

      // Check for id field
      if (!isPresent(cigar.id)) {
        const name = cigar.name || '(unknown)';
        rejected.push({ file: fileName, id: '(missing)', name, reason: 'Missing id' });
        totalRejected++;
        fileReject++;
        continue;
      }

      // Check for name field
      if (!isPresent(cigar.name)) {
        rejected.push({ file: fileName, id: cigar.id, name: '(missing)', reason: 'Missing name' });
        totalRejected++;
        fileReject++;
        continue;
      }

      // ── Slug validation ──
      const slugCheck = validateSlug(cigar.id);
      if (!slugCheck.valid) {
        slugIssues.push({ file: fileName, id: cigar.id, suggestion: slugCheck.suggestion });
        // Auto-fix the slug
        cigar.id = slugCheck.suggestion;
        console.log(`  ⚠ Fixed slug: "${cigar.id}" → "${slugCheck.suggestion}"`);
      }

      // ── Dedup against existing cigars ──
      if (existingIdMap.has(cigar.id)) {
        duplicates.push({
          file: fileName, id: cigar.id, name: cigar.name,
          reason: 'Duplicate ID in existing cigars.json',
          matchedId: cigar.id
        });
        totalRejected++;
        fileDup++;
        continue;
      }

      const normName = normaliseName(cigar.name);
      if (existingNameMap.has(normName)) {
        const matched = existingNameMap.get(normName);
        duplicates.push({
          file: fileName, id: cigar.id, name: cigar.name,
          reason: 'Duplicate name (case-insensitive) in existing cigars.json',
          matchedId: matched.id
        });
        totalRejected++;
        fileDup++;
        continue;
      }

      // ── Dedup across batch files (same ID) ──
      if (seenNewIds.has(cigar.id)) {
        duplicates.push({
          file: fileName, id: cigar.id, name: cigar.name,
          reason: 'Duplicate ID across batch files',
          matchedId: cigar.id
        });
        totalRejected++;
        fileDup++;
        continue;
      }

      // ── Dedup across batch files (same name) ──
      if (seenNewNames.has(normName)) {
        duplicates.push({
          file: fileName, id: cigar.id, name: cigar.name,
          reason: 'Duplicate name across batch files',
          matchedId: cigar.id
        });
        totalRejected++;
        fileDup++;
        continue;
      }

      // ── Validate required fields ──
      const missing = validateCigar(cigar);
      if (missing.length > 0) {
        rejected.push({
          file: fileName, id: cigar.id, name: cigar.name,
          reason: 'Missing/empty required fields: ' + missing.join(', ')
        });
        totalRejected++;
        fileReject++;
        continue;
      }

      // ── All checks passed — add to new entries ──
      seenNewIds.add(cigar.id);
      seenNewNames.add(normName);
      allNewEntries.push(cigar);
      fileAdded++;
    }

    console.log(`  → ${fileAdded} added, ${fileDup} duplicates, ${fileReject} rejected`);
  }

  // 4. Build merged array
  const mergedCigars = [...existingCigars, ...allNewEntries];

  // 5. Verify final count
  const expectedCount = existingCigars.length + allNewEntries.length;
  if (mergedCigars.length !== expectedCount) {
    console.error(`\n✗ FATAL: Merged count mismatch! Expected ${expectedCount}, got ${mergedCigars.length}`);
    process.exit(1);
  }

  // 6. Verify no ID collisions in the merged array
  const mergedIdSet = new Set();
  let collisionCount = 0;
  for (const c of mergedCigars) {
    if (mergedIdSet.has(c.id)) {
      collisionCount++;
      console.error(`✗ ID collision in merged array: ${c.id}`);
    }
    mergedIdSet.add(c.id);
  }
  if (collisionCount > 0) {
    console.error(`\n✗ FATAL: ${collisionCount} ID collision(s) in merged array`);
    process.exit(1);
  }

  // 7. Write merged output
  const mergedJson = JSON.stringify(mergedCigars, null, 2);
  fs.writeFileSync(MERGED_JSON, mergedJson, 'utf8');
  console.log(`\n✓ Written merged data → data/cigars_merged.json (${mergedCigars.length} cigars)`);

  // 8. Write merge report
  const report = {
    timestamp: new Date().toISOString(),
    existing_count: existingCigars.length,
    batch_files_found: batchFiles.length,
    batch_files: batchFiles.map(f => path.basename(f)),
    total_entries_read: totalRead,
    total_rejected: totalRejected,
    new_cigars_added: allNewEntries.length,
    duplicates_found: duplicates.length,
    validation_failures: rejected.length,
    slug_fixes: slugIssues.length,
    final_count: mergedCigars.length,
    expected_count: expectedCount,
    count_verified: mergedCigars.length === expectedCount,
    rejected_details: rejected,
    duplicate_details: duplicates,
    slug_fix_details: slugIssues,
    new_cigar_ids: allNewEntries.map(c => c.id)
  };

  fs.writeFileSync(REPORT_JSON, JSON.stringify(report, null, 2), 'utf8');
  console.log(`✓ Written report → data/merge_report.json\n`);

  // 9. Summary
  console.log('═══════════════════════════════════════════════════');
  console.log('  MERGE SUMMARY');
  console.log('═══════════════════════════════════════════════════');
  console.log(`  Existing cigars:        ${existingCigars.length}`);
  console.log(`  Batch files found:      ${batchFiles.length}`);
  console.log(`  Total entries read:     ${totalRead}`);
  console.log(`  New cigars added:       ${allNewEntries.length}`);
  console.log(`  Duplicates found:       ${duplicates.length}`);
  console.log(`  Validation failures:    ${rejected.length}`);
  console.log(`  Slug fixes applied:     ${slugIssues.length}`);
  console.log(`  Total rejected:         ${totalRejected}`);
  console.log(`  Final merged count:     ${mergedCigars.length}`);
  console.log(`  Expected count:         ${expectedCount}`);
  console.log(`  Count verified:         ${report.count_verified ? '✓ YES' : '✗ NO'}`);
  console.log('═══════════════════════════════════════════════════\n');

  if (rejected.length > 0) {
    console.log('\n⚠ REJECTED ENTRIES:');
    for (const r of rejected) {
      console.log(`  ✗ [${r.file}] ${r.id} — ${r.reason}`);
    }
  }

  if (duplicates.length > 0) {
    console.log('\n  DUPLICATE ENTRIES (skipped):');
    for (const d of duplicates) {
      console.log(`  ⊘ [${d.file}] ${d.id} — ${d.reason} (matched: ${d.matchedId})`);
    }
  }

  // Exit non-zero if all entries were rejected
  if (rejected.length > 0 && allNewEntries.length === 0 && totalRead > 0) {
    console.error('\n✗ All entries were rejected — no new cigars added. Check data quality.');
    process.exit(1);
  }

  console.log('\n✓ Merge complete.\n');
}

main();
