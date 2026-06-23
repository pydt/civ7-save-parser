/**
 * Differential analysis between two Civ7 saves — the core reverse-engineering tool.
 *
 * Flattens both saves to path-keyed entries and reports what CHANGED, was ADDED,
 * or was REMOVED. Use it on saves that differ by exactly one known variable
 * (e.g. consecutive turns of the same game) to isolate the meaning of a marker.
 *
 * Usage:
 *   npx tsx tools/diff.ts <a.Civ7Save> <b.Civ7Save> [--all] [--by-marker]
 *
 *   --all          also show ADDED / REMOVED paths (default shows CHANGED only)
 *   --by-marker    key by marker instead of full structural path (robust to
 *                  chunks shifting position; collapses repeats — use for noisy diffs)
 */
import { readFileSync } from 'fs';
import minimist from 'minimist';
import { flattenBuffer, FlatEntry } from './flatten';
import { MARKERS } from '../src/markers';

const argv = minimist(process.argv.slice(2));
const [fileA, fileB] = argv._;

if (!fileA || !fileB) {
  console.error('Usage: npx tsx tools/diff.ts <a.Civ7Save> <b.Civ7Save> [--all] [--by-marker]');
  process.exit(1);
}

const keyOf = (e: FlatEntry) => (argv['by-marker'] ? e.marker : e.path);

const index = (entries: FlatEntry[]) => {
  const m = new Map<string, FlatEntry>();
  for (const e of entries) {
    // when keying by marker, only keep the first occurrence to avoid collapse noise
    if (!m.has(keyOf(e))) m.set(keyOf(e), e);
  }
  return m;
};

const a = index(flattenBuffer(readFileSync(fileA)));
const b = index(flattenBuffer(readFileSync(fileB)));

const label = (e: FlatEntry) => {
  const conf = MARKERS[e.marker]?.confidence;
  return e.name ? `${e.name}${conf && conf !== 'known' ? ` (${conf})` : ''}` : `?${e.marker}`;
};

const changed: string[] = [];
const removed: string[] = [];
const added: string[] = [];

for (const [k, ea] of a) {
  const eb = b.get(k);
  if (!eb) {
    removed.push(`  - ${label(ea)} [${ea.path}] = ${ea.value}`);
  } else if (ea.value !== eb.value && !ea.container) {
    changed.push(
      `  ~ ${label(ea)} [${argv['by-marker'] ? ea.marker : ea.path}]\n      A: ${ea.value}\n      B: ${eb.value}`
    );
  }
}
for (const [k, eb] of b) {
  if (!a.has(k)) added.push(`  + ${label(eb)} [${eb.path}] = ${eb.value}`);
}

console.log(`=== CHANGED (${changed.length}) ===`);
console.log(changed.join('\n') || '  (none)');

if (argv.all) {
  console.log(`\n=== REMOVED from A (${removed.length}) ===`);
  console.log(removed.join('\n') || '  (none)');
  console.log(`\n=== ADDED in B (${added.length}) ===`);
  console.log(added.join('\n') || '  (none)');
} else {
  console.error(`\n(${removed.length} removed, ${added.length} added — pass --all to see them)`);
}
