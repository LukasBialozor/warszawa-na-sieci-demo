// Szuka bryl wiszacych w powietrzu: base > 2 m i brak pod nimi innej bryly (w srodku ciezkosci).
import { readFileSync } from 'node:fs';
const d = JSON.parse(readFileSync('public/data/city.json', 'utf8'));
const [cx0, cz0, R] = process.argv.slice(2).map(Number);
const B = d.buildings.map(b => {
  let x = 0, z = 0, n = b.o.length / 2, minX = 1e9, maxX = -1e9, minZ = 1e9, maxZ = -1e9;
  for (let i = 0; i < b.o.length; i += 2) { x += b.o[i]; z += b.o[i + 1]; minX = Math.min(minX, b.o[i]); maxX = Math.max(maxX, b.o[i]); minZ = Math.min(minZ, b.o[i + 1]); maxZ = Math.max(maxZ, b.o[i + 1]); }
  let area = 0; for (let i = 0; i < n; i++) { const j = (i + 1) % n; area += (b.o[2*i] * b.o[2*j+1] - b.o[2*j] * b.o[2*i+1]) / 2; }
  return { b, cx: x / n, cz: z / n, minX, maxX, minZ, maxZ, area };
});
const inside = (r, x, z) => { let ins = false; for (let i = 0, n = r.length / 2, j = n - 1; i < n; j = i++) { const xi = r[2*i], zi = r[2*i+1], xj = r[2*j], zj = r[2*j+1]; if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) ins = !ins; } return ins; };
let n = 0;
for (const p of B) {
  const base = p.b.b || 0;
  if (base <= 2 || p.area < 30) continue;
  if (!isNaN(cx0) && Math.hypot(p.cx - cx0, p.cz - cz0) > R) continue;
  const sup = B.some(q => q !== p && q.b.t >= base - 1.5 && (q.b.b || 0) < base && p.cx >= q.minX && p.cx <= q.maxX && p.cz >= q.minZ && p.cz <= q.maxZ && inside(q.b.o, p.cx, p.cz));
  if (!sup) { n++; console.log(`(${p.cx.toFixed(0)},${p.cz.toFixed(0)}) base=${base} top=${p.b.t} area=${p.area.toFixed(0)} k=${p.b.k} ${p.b.n || ''}`); }
}
console.log('wiszacych:', n);
