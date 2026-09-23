// Lists place strings in the given trees that places.json can't resolve.
// Usage: node scripts/unresolved.mjs I12345 [I67890 ...]
import { findUnresolved } from '../src/places.js';
import fs from 'fs';

const data = new URL('../data/', import.meta.url);
const lookup = JSON.parse(fs.readFileSync(new URL('places.json', data))).places;
const all = new Map();
for (const id of process.argv.slice(2)) {
  const a = JSON.parse(fs.readFileSync(new URL(`ancestors_${id}.json`, data)));
  for (const [p, c] of findUnresolved(a, lookup)) {
    const e = all.get(p) || { c: 0, ids: new Set() };
    e.c += c; e.ids.add(id); all.set(p, e);
  }
}
const rows = [...all].sort((a, b) => b[1].c - a[1].c);
console.log(rows.length, 'unresolved place strings');
for (const [p, e] of rows) console.log(e.c + '\t' + p + '\t' + [...e.ids].join(','));
