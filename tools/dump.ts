/**
 * Dump a Civ7 save as a labeled, indented chunk tree.
 *
 * Usage:
 *   npx tsx tools/dump.ts <file.Civ7Save> [--unknown] [--marker=<hex>] [--grep=<text>]
 *
 *   --unknown        only show chunks with no known marker name
 *   --marker=<hex>   only show chunks with this marker
 *   --grep=<text>    only show entries whose value/name/path contains <text> (case-insensitive)
 */
import { readFileSync } from 'fs';
import minimist from 'minimist';
import { flattenBuffer } from './flatten';
import { MARKERS } from '../src/markers';

const argv = minimist(process.argv.slice(2));
const file = argv._[0];

if (!file) {
  console.error(
    'Usage: npx tsx tools/dump.ts <file.Civ7Save> [--unknown] [--marker=hex] [--grep=text]'
  );
  process.exit(1);
}

const entries = flattenBuffer(readFileSync(file));
const grep = argv.grep ? String(argv.grep).toLowerCase() : undefined;

let shown = 0;
for (const e of entries) {
  if (argv.unknown && e.name) continue;
  if (argv.marker && e.marker !== String(argv.marker).toLowerCase()) continue;
  if (grep && ![e.value, e.name ?? '', e.path].some(s => s.toLowerCase().includes(grep))) continue;

  const depth = (e.path.match(/\//g)?.length ?? 1) - 1;
  const indent = '  '.repeat(depth);
  const conf = MARKERS[e.marker]?.confidence;
  const label = e.name
    ? `${e.name}${conf && conf !== 'known' ? ` (${conf})` : ''}`
    : `?${e.marker}`;
  const val = e.value.length > 200 ? e.value.slice(0, 200) + '…' : e.value;
  console.log(`${indent}${label} [${e.typeName}] = ${val}`);
  shown++;
}

console.error(`\n(${shown}/${entries.length} chunks shown)`);
