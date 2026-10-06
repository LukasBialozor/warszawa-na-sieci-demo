// Oznakowanie poziome i szyny: linie osiowe i miedzy pasami (drogi klasy glownej/zbiorczej/lokalnej z OSM:
// lanes, oneway), przejscia dla pieszych (zebry na liniach footway=crossing) i szyny torowisk tramwajowych i kolejowych.
// Jedna siatka (dekal bez zapisu glebi, rysowany po jezdniach).
import * as THREE from 'three';

const WHITE = [0.78, 0.78, 0.74];
const RAIL = [0.34, 0.35, 0.36];
const GAUGE = 1.435 / 2 + 0.035;

export function buildMarkings(scene, data) {
  const pos = [], col = [];

  // Skrzyzowania: wierzcholki wspolne dla >= 2 jezdni (drogi OSM dziela wezly). Linie urywamy w promieniu
  // polowy najszerszej jezdni + 1.5 m od takiego punktu (w rzeczywistosci oznakowanie konczy sie przed skrzyzowaniem).
  const vkey = (x, z) => Math.round(x * 2) + ',' + Math.round(z * 2);
  const vcount = new Map();
  data.roads.forEach((r, ri) => {
    if (r.k !== 0) return;
    for (let i = 0; i < r.p.length; i += 2) {
      const k = vkey(r.p[i], r.p[i + 1]);
      const e = vcount.get(k);
      if (!e) vcount.set(k, { n: 1, road: ri, w: r.w, x: r.p[i], z: r.p[i + 1] });
      else if (e.road !== ri) { e.n++; e.road = ri; e.w = Math.max(e.w, r.w); }
    }
  });
  const JC = 20;
  const junctions = new Map();
  for (const e of vcount.values()) {
    if (e.n < 2) continue;
    const rad = e.w / 2 + 1.5;
    for (let gx = Math.floor((e.x - rad) / JC); gx <= Math.floor((e.x + rad) / JC); gx++) {
      for (let gz = Math.floor((e.z - rad) / JC); gz <= Math.floor((e.z + rad) / JC); gz++) {
        const k = gx + ',' + gz;
        if (!junctions.has(k)) junctions.set(k, []);
        junctions.get(k).push([e.x, e.z, rad]);
      }
    }
  }
  const inJunction = (x, z) => {
    for (const [jx, jz, r] of junctions.get(Math.floor(x / JC) + ',' + Math.floor(z / JC)) || []) {
      if ((x - jx) * (x - jx) + (z - jz) * (z - jz) < r * r) return true;
    }
    return false;
  };

  const tri = (a, b, c, k) => {
    // normalna w gore: pole w ukladzie x/z musi byc ujemne
    if ((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]) > 0) { const t = b; b = c; c = t; }
    for (const P of [a, b, c]) { pos.push(P[0], 0, P[1]); col.push(k[0], k[1], k[2]); }
  };
  // prostokat wzdluz odcinka AB o polszerokosci hw
  const bar = (ax, az, bx, bz, hw, k) => {
    const dx = bx - ax, dz = bz - az, L = Math.hypot(dx, dz);
    if (L < 1e-3) return;
    const nx = -dz / L * hw, nz = dx / L * hw;
    const A = [ax + nx, az + nz], B = [bx + nx, bz + nz], C = [bx - nx, bz - nz], D = [ax - nx, az - nz];
    tri(A, B, C, k);
    tri(A, C, D, k);
  };

  // linia rownolegla odsunieta o d (styk w wierzcholkach jak przy jezdniach: normalna usredniona, miter ograniczony)
  function offset(p, d) {
    if (!d) return p;
    const n = p.length / 2, out = new Array(p.length);
    for (let i = 0; i < n; i++) {
      let nx = 0, nz = 0;
      for (const [a, b] of [[i - 1, i], [i, i + 1]]) {
        if (a < 0 || b >= n) continue;
        const dx = p[2 * b] - p[2 * a], dz = p[2 * b + 1] - p[2 * a + 1], l = Math.hypot(dx, dz) || 1;
        nx += -dz / l; nz += dx / l;
      }
      const l = Math.hypot(nx, nz) || 1;
      nx /= l; nz /= l;
      let scale = 1;
      if (i > 0 && i < n - 1) {
        const dx = p[2 * i] - p[2 * i - 2], dz = p[2 * i + 1] - p[2 * i - 1], ll = Math.hypot(dx, dz) || 1;
        scale = Math.min(2.5, 1 / Math.max(0.4, (-dz / ll) * nx + (dx / ll) * nz));
      }
      out[2 * i] = p[2 * i] + nx * d * scale;
      out[2 * i + 1] = p[2 * i + 1] + nz * d * scale;
    }
    return out;
  }

  // ciagla (dash = 0) lub przerywana linia wzdluz lamanej; odcinki w skrzyzowaniach pomijane (trim = true)
  function stroke(p, hw, k, dash = 0, gap = 0, trim = true) {
    let acc = 0;
    if (!dash && trim) { dash = 2; gap = 0; }   // ciagla dzielona na 2-metrowe kawalki, zeby dalo sie ja przycinac
    const period = dash + gap;
    const piece = (x0, z0, x1, z1) => {
      if (trim && inJunction((x0 + x1) / 2, (z0 + z1) / 2)) return;
      bar(x0, z0, x1, z1, hw, k);
    };
    for (let i = 0; i + 3 < p.length; i += 2) {
      const ax = p[i], az = p[i + 1], bx = p[i + 2], bz = p[i + 3];
      const L = Math.hypot(bx - ax, bz - az);
      if (L < 1e-3) continue;
      if (!dash) { bar(ax, az, bx, bz, hw, k); acc += L; continue; }
      const at = t => [ax + (bx - ax) * t / L, az + (bz - az) * t / L];
      let t = 0;
      while (t < L - 1e-3) {
        const ph = (acc + t) % period;
        if (ph < dash) {
          const e = Math.min(L, t + dash - ph);
          const [x0, z0] = at(t), [x1, z1] = at(e);
          piece(x0, z0, x1, z1);
          t = e;
        } else t += period - ph;
      }
      acc += L;
    }
  }

  let lines = 0;
  for (const r of data.roads) {
    const p = r.p;
    if (r.k === 3 || r.k === 4) {        // szyny (tramwaj, kolej)
      stroke(offset(p, GAUGE), 0.045, RAIL, 0, 0, false);
      stroke(offset(p, -GAUGE), 0.045, RAIL, 0, 0, false);
      continue;
    }
    if (r.k !== 0 || r.c === undefined || r.c > 3 || r.w < 7) continue;
    const lanes = r.l ?? (r.ow ? (r.w >= 10 ? 3 : 2) : r.w >= 14 ? 4 : 2);
    const lw = r.w / lanes;
    if (r.ow) {
      for (let j = 1; j < lanes; j++) stroke(offset(p, -r.w / 2 + lw * j), 0.07, WHITE, 4, 8);
    } else {
      if (lanes >= 4) {                    // podwojna ciagla na osi (P-3) na drogach wielopasowych
        stroke(offset(p, 0.14), 0.06, WHITE);
        stroke(offset(p, -0.14), 0.06, WHITE);
      } else stroke(p, 0.07, WHITE, 4, 8);   // przerywana osiowa (P-1)
      const perDir = Math.floor(lanes / 2);
      for (let j = 1; j < perDir; j++) {
        stroke(offset(p, lw * j), 0.07, WHITE, 4, 8);
        stroke(offset(p, -lw * j), 0.07, WHITE, 4, 8);
      }
    }
    lines++;
  }

  // zebry (P-10): pasy 0.5 m co 1 m wzdluz przejscia, dlugosc pasa 4 m (rownolegle do jezdni)
  for (const z of data.zebras || []) {
    let L = 0;
    const seg = [];
    for (let i = 0; i + 3 < z.length; i += 2) {
      const l = Math.hypot(z[i + 2] - z[i], z[i + 3] - z[i + 1]);
      seg.push([z[i], z[i + 1], z[i + 2], z[i + 3], L, l]);
      L += l;
    }
    if (L < 2 || L > 60) continue;
    const n = Math.floor((L - 0.3) / 1.0);
    for (let k = 0; k < n; k++) {
      const s = L / 2 + (k - (n - 1) / 2) * 1.0;
      const S = seg.find(q => s >= q[4] && s <= q[4] + q[5]) || seg[seg.length - 1];
      const t = (s - S[4]) / (S[5] || 1);
      const cx = S[0] + (S[2] - S[0]) * t, cz = S[1] + (S[3] - S[1]) * t;
      const ux = (S[2] - S[0]) / (S[5] || 1), uz = (S[3] - S[1]) / (S[5] || 1);
      // pas: 0.5 m wzdluz przejscia (u), 4 m w poprzek (v = prostopadly)
      bar(cx - uz * 2.0, cz + ux * 2.0, cx + uz * 2.0, cz - ux * 2.0, 0.25, WHITE);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
  geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(col), 3));
  const nrm = new Float32Array(pos.length);
  for (let i = 1; i < nrm.length; i += 3) nrm[i] = 1;
  geo.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75, depthWrite: false });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  mesh.renderOrder = 4;
  mesh.matrixAutoUpdate = false;
  scene.add(mesh);
  return { lines, triangles: pos.length / 9 };
}
