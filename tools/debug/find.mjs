// Pomocnicze: szukanie obiektow OSM po nazwie/okolicy. Uzycie: node tools/debug/find.mjs "<regex nazwy>" [x z promien]
import { readFileSync } from 'node:fs';
import { project } from '../../src/geo.js';
const els = JSON.parse(readFileSync('data/raw/osm.json', 'utf8')).elements;
const [re, x, z, r] = process.argv.slice(2);
const rx = new RegExp(re || '.', 'i');
const pos = e => {
  const g = e.geometry || (e.members || []).flatMap(m => m.geometry || []);
  if (!g.length) return e.lat ? project(e.lat, e.lon) : null;
  let la = 0, lo = 0;
  for (const p of g) { la += p.lat; lo += p.lon; }
  return project(la / g.length, lo / g.length);
};
for (const e of els) {
  const t = e.tags || {};
  if (!(t.building || t['building:part'])) continue;
  const p = pos(e);
  if (!p) continue;
  if (x !== undefined && Math.hypot(p[0] - +x, p[1] - +z) > +r) continue;
  const n = (t.name || '') + ' ' + (t['name:pl'] || '');
  if (x === undefined && !rx.test(n)) continue;
  if (x !== undefined && re !== '.' && !rx.test(JSON.stringify(t))) continue;
  console.log(e.type, e.id, p.map(v => v.toFixed(0)).join(','), JSON.stringify(t).slice(0, 330));
}
