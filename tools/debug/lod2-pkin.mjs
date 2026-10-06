// Diagnostyka dopasowania LOD2 <-> OSM w okolicy punktu (domyslnie PKiN)
import { readFileSync } from 'node:fs';
const [X, Z, R] = process.argv.slice(2).map(Number);
const cx = isNaN(X) ? 13 : X, cz = isNaN(Z) ? 4 : Z, rad = isNaN(R) ? 60 : R;
const city = JSON.parse(readFileSync('public/data/city.json', 'utf8'));
const l = JSON.parse(readFileSync('public/data/lod2.json', 'utf8'));
const rep = new Set(l.replaced);
const cen = r => { let x = 0, z = 0; for (let i = 0; i < r.length; i += 2) { x += r[i]; z += r[i + 1]; } return [x / (r.length / 2), z / (r.length / 2)]; };
console.log('--- OSM w promieniu', rad);
city.buildings.forEach((b, i) => { const [x, z] = cen(b.o); if (Math.hypot(x - cx, z - cz) < rad) console.log(i, rep.has(i) ? 'ZASTAPIONY' : 'osm', 'base', b.b || 0, 'top', b.t, 'k', b.k, 'd', b.d || 0, `(${x.toFixed(0)},${z.toFixed(0)})`); });
console.log('--- LOD2 uzyte w promieniu', rad);
l.buildings.forEach(b => { const [x, z] = cen(b.o[0][0]); if (Math.hypot(x - cx, z - cz) < rad) console.log('top', b.t, 'eave', b.e, 'k', b.k, `(${x.toFixed(0)},${z.toFixed(0)})`); });
