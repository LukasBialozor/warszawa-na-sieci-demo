// Landmarki: modele z Blendera (public/models/<nazwa>.glb) zastepujace bryly OSM/LOD2 w swoim obszarze.
// Kazdy model ma opis public/models/<nazwa>.json:
//   exclude: [[x,z,...]]  - wielokaty; budynki OSM/LOD2 ze srodkiem w srodku sa pomijane (model je zastepuje)
//   prisms:  [{o:[x,z,...], h?:[[...]], b, t, e?, hf?}] - kolizje (graniastoslupy); hf = siatka wysokosci dachu
// Wspolrzedne modelu = wspolrzedne gry (x = wschod, y = gora, z = poludnie), wiec model nie wymaga ustawiania.
// Lista wczytywanych modeli: public/models/landmarks.json (tablica nazw).
import { loadGltf } from '../binary.js';

export async function loadLandmarks(base = 'models/', onStatus = () => {}) {
  let names = [];
  try {
    const res = await fetch(base + 'landmarks.json');
    if (res.ok) names = await res.json();
  } catch { /* brak listy - gra bez landmarkow */ }
  const out = [];
  for (const name of names) {
    try {
      onStatus(`Ładowanie modelu: ${name}...`);
      const def = await fetch(`${base}${name}.json`).then(r => r.json());
      const gltf = await loadGltf(`${base}${def.model || name + '.glb'}`);
      out.push({ name, def, root: gltf.scene });
    } catch (e) {
      console.warn('Nie udalo sie wczytac landmarku', name, e);
    }
  }
  return out;
}

export function inRing(r, x, z) {
  let inside = false;
  for (let i = 0, n = r.length / 2, j = n - 1; i < n; j = i++) {
    const xi = r[2 * i], zi = r[2 * i + 1], xj = r[2 * j], zj = r[2 * j + 1];
    if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

// Wysokosc dachu z siatki: hf = {x0, z0, d, nx, nz, h: [nz*nx]} (wiersze wzdluz z), interpolacja dwuliniowa
export function heightfield(hf) {
  const { x0, z0, d, nx, nz, h } = hf;
  return (x, z) => {
    const fx = (x - x0) / d, fz = (z - z0) / d;
    const ix = Math.max(0, Math.min(nx - 2, Math.floor(fx)));
    const iz = Math.max(0, Math.min(nz - 2, Math.floor(fz)));
    const tx = Math.min(1, Math.max(0, fx - ix)), tz = Math.min(1, Math.max(0, fz - iz));
    const i = iz * nx + ix;
    return (h[i] * (1 - tx) + h[i + 1] * tx) * (1 - tz) + (h[i + nx] * (1 - tx) + h[i + nx + 1] * tx) * tz;
  };
}
