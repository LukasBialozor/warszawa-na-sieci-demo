// Kolizje gracza z budynkami. Kazdy budynek to graniastoslup: wielokat (z dziurami) wyciagniety od base do top.
// Dzieki temu wiemy dokladnie, czy gracz stoi na dachu, czy dotyka sciany (i jaka ma ona normalna) - potrzebne do biegu po scianie.

const CELL = 16;
const key = (ix, iz) => (ix + 32768) * 65536 + (iz + 32768);

export class CollisionWorld {
  constructor() {
    this.prisms = [];
    this.grid = new Map();
    this._stamp = 0;
    this._out = [];
  }

  // rings: tablica Float32Array [x0,z0,x1,z1,...]; pierwszy = obrys zewnetrzny (pole > 0), kolejne = dziury (pole < 0)
  add(rings, base, top, data) {
    let minX = Infinity, minZ = Infinity, maxX = -Infinity, maxZ = -Infinity;
    for (const r of rings) {
      for (let i = 0; i < r.length; i += 2) {
        if (r[i] < minX) minX = r[i];
        if (r[i] > maxX) maxX = r[i];
        if (r[i + 1] < minZ) minZ = r[i + 1];
        if (r[i + 1] > maxZ) maxZ = r[i + 1];
      }
    }
    let area = 0;
    for (const r of rings) {
      for (let i = 0, n = r.length / 2; i < n; i++) {
        const j = (i + 1) % n;
        area += (r[2 * i] * r[2 * j + 1] - r[2 * j] * r[2 * i + 1]) / 2;
      }
    }
    const p = { rings, base, top, area, minX, minZ, maxX, maxZ, data, stamp: 0, index: this.prisms.length };
    this.prisms.push(p);
    for (let ix = Math.floor(minX / CELL); ix <= Math.floor(maxX / CELL); ix++) {
      for (let iz = Math.floor(minZ / CELL); iz <= Math.floor(maxZ / CELL); iz++) {
        const k = key(ix, iz);
        let list = this.grid.get(k);
        if (!list) this.grid.set(k, (list = []));
        list.push(p);
      }
    }
    return p;
  }

  query(minX, minZ, maxX, maxZ) {
    const out = this._out;
    out.length = 0;
    const stamp = ++this._stamp;
    for (let ix = Math.floor(minX / CELL); ix <= Math.floor(maxX / CELL); ix++) {
      for (let iz = Math.floor(minZ / CELL); iz <= Math.floor(maxZ / CELL); iz++) {
        const list = this.grid.get(key(ix, iz));
        if (!list) continue;
        for (const p of list) {
          if (p.stamp === stamp) continue;
          p.stamp = stamp;
          if (p.maxX < minX || p.minX > maxX || p.maxZ < minZ || p.minZ > maxZ) continue;
          out.push(p);
        }
      }
    }
    return out;
  }

  // Czy punkt (x, y, z) jest wewnatrz ktorejs bryly (z marginesem 5 cm ponizej dachu)
  insideBuilding(v) {
    for (const p of this.query(v.x, v.z, v.x, v.z)) {
      const top = p.topAt ? p.topAt(v.x, v.z) : p.top;
      if (v.y > p.base && v.y < top - 0.05 && pointInPrism(p, v.x, v.z)) return true;
    }
    return false;
  }

  // Najwyzszy dach pod punktem (x,z) ponizej wysokosci maxY (lub 0 = ziemia)
  groundHeight(x, z, maxY = Infinity) {
    let best = 0;
    for (const p of this.query(x, z, x, z)) {
      const top = p.topAt ? p.topAt(x, z) : p.top;
      if (top > best && top <= maxY && pointInPrism(p, x, z)) best = top;
    }
    return best;
  }

  // Dachy w promieniu, na ktorych da sie stanac (bez iglic i masztow), od najwyzszego - do teleportu na dach
  roofsNear(x, z, radius, minArea = 150) {
    return this.query(x - radius, z - radius, x + radius, z + radius)
      .filter(p => p.area >= minArea)
      .sort((a, b) => b.top - a.top);
  }
}

// Punkt wewnatrz obrysu, mozliwie daleko od krawedzi (srodek ciezkosci bywa poza wielokatem w ksztalcie L/U)
export function interiorPoint(p) {
  const info = {};
  let best = null, bestD = -1;
  const N = 12;
  for (let i = 0; i <= N; i++) {
    for (let j = 0; j <= N; j++) {
      const x = p.minX + (p.maxX - p.minX) * i / N, z = p.minZ + (p.maxZ - p.minZ) * j / N;
      closestEdge(p, x, z, info);
      if (info.inside && info.dist > bestD) { bestD = info.dist; best = [x, z]; }
    }
  }
  return best || [p.rings[0][0], p.rings[0][1]];
}

export function pointInPrism(p, x, z) {
  let inside = false;
  for (const r of p.rings) {
    const n = r.length / 2;
    for (let i = 0, j = n - 1; i < n; j = i++) {
      const xi = r[2 * i], zi = r[2 * i + 1], xj = r[2 * j], zj = r[2 * j + 1];
      if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) inside = !inside;
    }
  }
  return inside;
}

// Najblizszy punkt brzegu wielokata. Zwraca (w obiekcie out): inside, dist, nx, nz - kierunek "na zewnatrz" bryly.
export function closestEdge(p, x, z, out) {
  let inside = false, best = Infinity, bnx = 0, bnz = 0, bcx = 0, bcz = 0;
  for (const r of p.rings) {
    const n = r.length / 2;
    for (let i = 0, j = n - 1; i < n; j = i++) {
      const ax = r[2 * j], az = r[2 * j + 1], bx = r[2 * i], bz = r[2 * i + 1];
      if ((bz > z) !== (az > z) && x < (ax - bx) * (z - bz) / (az - bz) + bx) inside = !inside;
      const dx = bx - ax, dz = bz - az;
      const len2 = dx * dx + dz * dz;
      if (len2 < 1e-8) continue;
      let t = ((x - ax) * dx + (z - az) * dz) / len2;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const cx = ax + dx * t, cz = az + dz * t;
      const d2 = (x - cx) * (x - cx) + (z - cz) * (z - cz);
      if (d2 < best) {
        best = d2;
        bcx = cx; bcz = cz;
        const len = Math.sqrt(len2);
        bnx = dz / len; bnz = -dx / len; // normalna zewnetrzna (pierscienie maja ustalona orientacje)
      }
    }
  }
  const dist = Math.sqrt(best);
  out.inside = inside;
  out.dist = dist;
  if (!inside && dist > 1e-4) {
    // na zewnatrz - kierunek od najblizszego punktu do gracza (gladko wokol naroznikow)
    out.nx = (x - bcx) / dist;
    out.nz = (z - bcz) / dist;
  } else {
    out.nx = bnx;
    out.nz = bnz;
  }
  return out;
}
