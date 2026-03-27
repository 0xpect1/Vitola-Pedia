#!/usr/bin/env node
/**
 * Reports duplicate `id` values in js/data.js (breaks openModal — .find returns first match).
 * Usage: node scripts/check-cigar-ids.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataPath = path.join(__dirname, "..", "js", "data.js");
const lines = fs.readFileSync(dataPath, "utf8").split("\n");
const idToLines = new Map();
lines.forEach((line, i) => {
  const m = line.match(/^\s*id:\s*"([^"]+)"/);
  if (!m) return;
  const id = m[1];
  if (!idToLines.has(id)) idToLines.set(id, []);
  idToLines.get(id).push(i + 1);
});
const dupEntries = [...idToLines.entries()].filter(([, ls]) => ls.length > 1);
if (dupEntries.length === 0) {
  console.log(`OK: ${idToLines.size} entries, all ids unique.`);
  process.exit(0);
}
console.error("Duplicate ids:");
for (const [id, ls] of dupEntries) console.error(`  ${id}: lines ${ls.join(", ")}`);
process.exit(1);
