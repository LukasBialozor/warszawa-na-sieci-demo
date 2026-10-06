// Ktore arkusze GML z paczki GUGiK pokrywaja centrum (obszar wokol PKiN)
import { execFileSync } from 'node:child_process';
const ZIP = 'data/raw/gugik/1465_gml.zip';
const list = execFileSync('unzip', ['-Z1', ZIP], { encoding: 'utf8' }).split('\n').filter(n => n.endsWith('.gml'));
const box = { minE: 636952 - 1300, maxE: 636952 + 1300, minN: 486979 - 1200, maxN: 486979 + 1200 };
let total = 0;
for (const name of list) {
  const head = execFileSync('sh', ['-c', `unzip -p "${ZIP}" "${name}" | head -c 3000`], { encoding: 'utf8' });
  const lo = head.match(/<gml:lowerCorner>([\d.]+) ([\d.]+)/), hi = head.match(/<gml:upperCorner>([\d.]+) ([\d.]+)/);
  if (!lo) continue;
  const [e0, n0, e1, n1] = [+lo[1], +lo[2], +hi[1], +hi[2]];
  if (e1 < box.minE || e0 > box.maxE || n1 < box.minN || n0 > box.maxN) continue;
  console.log(name, e0.toFixed(0), n0.toFixed(0), e1.toFixed(0), n1.toFixed(0));
  total++;
}
console.log('arkuszy:', total);
