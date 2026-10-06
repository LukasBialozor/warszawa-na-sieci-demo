// "Gdzie jestem": najblizsza ulica, obszar MSI (np. Mirow, Powisle) i dzielnica - do HUD.
const CELL = 40;
const key = (ix, iz) => (ix + 32768) * 65536 + (iz + 32768);

function inRings(rings, x, z) {
  let inside = false;
  for (const r of rings) {
    for (let i = 0, n = r.length / 2, j = n - 1; i < n; j = i++) {
      const xi = r[2 * i], zi = r[2 * i + 1], xj = r[2 * j], zj = r[2 * j + 1];
      if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) inside = !inside;
    }
  }
  return inside;
}

export class Locator {
  constructor(data) {
    this.names = data.names || [];
    this.grid = new Map();
    for (const r of data.roads) {
      if (r.n === undefined) continue;
      const p = r.p;
      for (let i = 0; i + 3 < p.length; i += 2) {
        const seg = { ax: p[i], az: p[i + 1], bx: p[i + 2], bz: p[i + 3], n: r.n, hw: r.w / 2 };
        const pad = 30;
        for (let ix = Math.floor((Math.min(seg.ax, seg.bx) - pad) / CELL); ix <= Math.floor((Math.max(seg.ax, seg.bx) + pad) / CELL); ix++) {
          for (let iz = Math.floor((Math.min(seg.az, seg.bz) - pad) / CELL); iz <= Math.floor((Math.max(seg.az, seg.bz) + pad) / CELL); iz++) {
            const k = key(ix, iz);
            let list = this.grid.get(k);
            if (!list) this.grid.set(k, (list = []));
            list.push(seg);
          }
        }
      }
    }
    const polys = (data.districts || []).map(d => ({ n: d.n, l: d.l, rings: [d.o, ...(d.h || [])] }));
    this.districts = polys.filter(d => d.l === 9);
    this.areas = polys.filter(d => d.l === 10);
    this.places = data.places || [];
  }

  street(x, z, maxDist = 30) {
    const list = this.grid.get(key(Math.floor(x / CELL), Math.floor(z / CELL)));
    if (!list) return null;
    let best = null, bestD = maxDist;
    for (const s of list) {
      const dx = s.bx - s.ax, dz = s.bz - s.az;
      const l2 = dx * dx + dz * dz || 1;
      const t = Math.max(0, Math.min(1, ((x - s.ax) * dx + (z - s.az) * dz) / l2));
      const d = Math.hypot(x - s.ax - dx * t, z - s.az - dz * t) - s.hw;
      if (d < bestD) { bestD = d; best = s.n; }
    }
    return best === null ? null : this.names[best];
  }

  lookup(x, z) {
    const district = this.districts.find(d => inRings(d.rings, x, z))?.n || null;
    let area = this.areas.find(a => inRings(a.rings, x, z))?.n || null;
    if (!area) {
      // brak obszaru MSI - najblizsza nazwa osiedla/rejonu (punkt place=*) w promieniu 700 m
      let bd = 700;
      for (const p of this.places) {
        const d = Math.hypot(p.x - x, p.z - z);
        if (d < bd && p.n !== district) { bd = d; area = p.n; }
      }
    }
    return { street: this.street(x, z), area, district };
  }

  describe(x, z) {
    const { street, area, district } = this.lookup(x, z);
    const parts = [street, area, district].filter((v, i, a) => v && a.indexOf(v) === i);
    return parts.length ? parts.join(' · ') : 'Warszawa';
  }
}
