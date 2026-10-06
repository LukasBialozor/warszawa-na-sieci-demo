// Zycie miasta: samochody i autobusy na jezdniach, tramwaje na torach, piesi na chodnikach.
// Graf powstaje z polilinii OSM (city.json roads): wierzcholki wspolne dla kilku drog to skrzyzowania.
// Pojazdy jezdza prawa strona (pas zalezny od lanes/oneway), wybieraja losowy wylot na skrzyzowaniu, zwalniaja
// za pojazdem przed soba. Symulowane sa tylko obiekty w promieniu wokol gracza - dalsze sa przenoszone blizej.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(1, 1, 1);
const _up = new THREE.Vector3(0, 1, 0);
const _c = new THREE.Color();

// ---------------------------------------------------------------- geometria (proceduralna, kolory wierzcholkow)
// atrybut glow: 1 = reflektor (bialy), 2 = swiatlo tylne (czerwone), 3 = okna oswietlone w nocy
function part(geo, color, glow = 0) {
  if (geo.index) geo = geo.toNonIndexed();
  geo.deleteAttribute('uv');
  const n = geo.attributes.position.count;
  const col = new Float32Array(n * 3), gl = new Float32Array(n);
  _c.set(color);
  for (let i = 0; i < n; i++) { col[i * 3] = _c.r; col[i * 3 + 1] = _c.g; col[i * 3 + 2] = _c.b; gl[i] = glow; }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setAttribute('glow', new THREE.BufferAttribute(gl, 1));
  return geo;
}
const box = (w, h, l, x, y, z) => new THREE.BoxGeometry(w, h, l).translate(x, y, z);

function wheels(len, track, r = 0.32) {
  const out = [];
  for (const z of [len * 0.33, -len * 0.33]) for (const x of [-track, track]) {
    out.push(part(new THREE.CylinderGeometry(r, r, 0.22, 10).rotateZ(Math.PI / 2).translate(x, r, z), 0x16171a));
  }
  return out;
}

// samochod: nadwozie bialo-szare (kolor instancji mnozy), kabina z ciemnymi szybami; przod w +z
function carGeometry(len, wid, h, cabin, cabLen, cabZ) {
  const parts = [
    part(box(wid, h * 0.5, len, 0, 0.3 + h * 0.25, 0), 0xffffff),
    part(box(wid * 0.92, h * cabin, cabLen, 0, 0.3 + h * 0.5 + h * cabin / 2, cabZ), 0xffffff),
    part(box(wid * 0.94, h * cabin * 0.8, cabLen * 0.96, 0, 0.3 + h * 0.5 + h * cabin * 0.45, cabZ), 0x22282e),
    part(box(wid * 0.8, 0.12, 0.04, 0, 0.3 + h * 0.32, len / 2 + 0.01), 0xf4f1e0, 1),
    part(box(wid * 0.8, 0.1, 0.04, 0, 0.3 + h * 0.38, -len / 2 - 0.01), 0xb01818, 2),
    ...wheels(len, wid / 2 - 0.12),
  ];
  return mergeGeometries(parts);
}

// autobus miejski (Solaris Urbino 12, barwy warszawskie: czerwony dol, zolta gora)
function busGeometry() {
  const parts = [
    part(box(2.55, 1.2, 12, 0, 0.95, 0), 0xc4161c),
    part(box(2.55, 1.15, 12, 0, 2.12, 0), 0xf2c200),
    part(box(2.57, 0.85, 11.2, 0, 2.05, 0.2), 0x1d2328, 3),
    part(box(2.4, 0.3, 11.5, 0, 2.85, 0), 0xe8e8e8),
    part(box(2.0, 0.14, 0.05, 0, 0.75, 6.02), 0xf4f1e0, 1),
    part(box(2.0, 0.12, 0.05, 0, 0.9, -6.02), 0xb01818, 2),
    ...wheels(12, 1.1, 0.48),
  ];
  return mergeGeometries(parts);
}

// czlon tramwaju (Pesa Jazz Duo ~10 m): zolty z czerwonym pasem dolnym, przod w +z; head = kabina na koncu
function tramGeometry(head) {
  const parts = [
    part(box(2.4, 1.0, 10.2, 0, 0.8, 0), 0xc8141b),
    part(box(2.4, 1.55, 10.2, 0, 2.08, 0), 0xf0c419),
    part(box(2.42, 1.05, 9.4, 0, 2.05, 0), 0x1d2328, 3),
    part(box(1.6, 0.25, 6, 0, 3.0, 0), 0x7a7d80),
  ];
  if (head) {
    parts.push(part(box(2.3, 2.2, 0.9, 0, 1.6, 5.4), 0xf0c419));
    parts.push(part(box(2.0, 0.9, 0.05, 0, 2.3, 5.86), 0x1d2328));
    parts.push(part(box(1.8, 0.12, 0.05, 0, 0.75, 5.86), 0xf4f1e0, 1));
  }
  return mergeGeometries(parts);
}

// pieszy ~1.75 m: nogi, tulow (kolor ubrania z instancji), glowa
function personGeometry() {
  const parts = [
    part(box(0.34, 0.85, 0.22, 0, 0.43, 0), 0x2b2f3a),
    part(box(0.42, 0.62, 0.26, 0, 1.17, 0), 0xffffff),
    part(new THREE.SphereGeometry(0.12, 8, 6).translate(0, 1.62, 0), 0xd9b49a),
  ];
  return mergeGeometries(parts);
}

// material: kolor wierzcholka x kolor instancji, a nocą swiecace reflektory, swiatla i okna pojazdow
function vehicleMaterial(night) {
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.45, metalness: 0.3 });
  mat.onBeforeCompile = sh => {
    sh.uniforms.uNight = night;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float glow;\nvarying float vGlow;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvGlow = glow;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uNight;\nvarying float vGlow;')
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        if (vGlow > 0.5) {
          vec3 g = vGlow < 1.5 ? vec3(1.0, 0.95, 0.8) * 3.0 : vGlow < 2.5 ? vec3(1.0, 0.1, 0.08) * 2.0 : vec3(1.0, 0.85, 0.55) * 0.6;
          totalEmissiveRadiance += g * uNight;
        }`);
  };
  mat.customProgramCacheKey = () => 'vehicle';
  return mat;
}

// ---------------------------------------------------------------- graf
class Graph {
  constructor(roads, accept) {
    const vkey = (x, z) => Math.round(x * 2) + ',' + Math.round(z * 2);
    const count = new Map();
    const list = roads.filter(accept);
    for (const r of list) {
      const seen = new Set();
      for (let i = 0; i < r.p.length; i += 2) {
        const k = vkey(r.p[i], r.p[i + 1]);
        if (seen.has(k)) continue;
        seen.add(k);
        count.set(k, (count.get(k) || 0) + 1);
      }
    }
    this.nodes = new Map();   // klucz -> [{ e, dir }] wyjazdy
    this.edges = [];
    const node = k => { let n = this.nodes.get(k); if (!n) this.nodes.set(k, (n = [])); return n; };
    for (const r of list) {
      let start = 0;
      const n = r.p.length / 2;
      for (let i = 1; i < n; i++) {
        const k = vkey(r.p[2 * i], r.p[2 * i + 1]);
        if (i === n - 1 || count.get(k) > 1) {
          const pts = r.p.slice(start * 2, i * 2 + 2);
          const cum = [0];
          for (let j = 2; j < pts.length; j += 2) cum.push(cum[cum.length - 1] + Math.hypot(pts[j] - pts[j - 2], pts[j + 1] - pts[j - 1]));
          const L = cum[cum.length - 1];
          if (L > 0.5) {
            const e = { pts, cum, L, w: r.w, lanes: r.l, ow: !!r.ow, c: r.c ?? 4, a: vkey(pts[0], pts[1]), b: k,
              mx: (pts[0] + pts[pts.length - 2]) / 2, mz: (pts[1] + pts[pts.length - 1]) / 2, idx: this.edges.length };
            this.edges.push(e);
            node(e.a).push({ e, dir: 1 });
            if (!e.ow) node(e.b).push({ e, dir: -1 });
            else node(e.b);
          }
          start = i;
        }
      }
    }
    this.grid = new Map();
    for (const e of this.edges) {
      const k = Math.floor(e.mx / 100) + ',' + Math.floor(e.mz / 100);
      if (!this.grid.has(k)) this.grid.set(k, []);
      this.grid.get(k).push(e);
    }
  }

  // losowa krawedz w pierscieniu [rmin, rmax] wokol punktu (z wagami)
  pick(x, z, rmin, rmax, weight) {
    for (let t = 0; t < 40; t++) {
      const a = Math.random() * Math.PI * 2, d = rmin + Math.random() * (rmax - rmin);
      const cell = this.grid.get(Math.floor((x + Math.cos(a) * d) / 100) + ',' + Math.floor((z + Math.sin(a) * d) / 100));
      if (!cell || !cell.length) continue;
      const e = cell[Math.floor(Math.random() * cell.length)];
      if (Math.random() < weight(e)) return e;
    }
    return null;
  }

  // punkt i kierunek na krawedzi w odleglosci s od poczatku (dla dir = -1 od konca)
  sample(e, s, dir, out) {
    const ss = dir > 0 ? s : e.L - s;
    let i = 1;
    while (i < e.cum.length - 1 && e.cum[i] < ss) i++;
    const t = (ss - e.cum[i - 1]) / ((e.cum[i] - e.cum[i - 1]) || 1);
    const ax = e.pts[2 * i - 2], az = e.pts[2 * i - 1], bx = e.pts[2 * i], bz = e.pts[2 * i + 1];
    out.x = ax + (bx - ax) * t;
    out.z = az + (bz - az) * t;
    const L = Math.hypot(bx - ax, bz - az) || 1;
    out.dx = (bx - ax) / L * dir;
    out.dz = (bz - az) / L * dir;
    return out;
  }

  next(e, dir) {
    const end = dir > 0 ? e.b : e.a;
    const outs = (this.nodes.get(end) || []).filter(o => o.e !== e);
    if (!outs.length) return null;
    return outs[Math.floor(Math.random() * outs.length)];
  }
}

// ---------------------------------------------------------------- agenci
class Fleet {
  constructor(scene, graph, opts) {
    this.graph = graph;
    this.o = opts;
    const geos = opts.geometries;
    let nv = 0;
    for (const g of geos) nv += g.attributes.position.count;
    this.mesh = new THREE.BatchedMesh(opts.count * (opts.sections || 1), nv, 0, opts.material);
    this.geoIds = geos.map(g => this.mesh.addGeometry(g));
    this.mesh.sortObjects = false;
    this.mesh.perObjectFrustumCulled = true;
    this.mesh.castShadow = opts.shadows !== false;
    this.mesh.receiveShadow = true;
    scene.add(this.mesh);
    this.agents = [];
    this.tmp = {};
  }

  spawn(a, px, pz, rmin, rmax) {
    const e = this.graph.pick(px, pz, rmin, rmax, this.o.weight);
    if (!e) return false;
    const dir = e.ow || Math.random() < 0.5 ? 1 : -1;
    a.e = e; a.dir = dir; a.s = Math.random() * e.L;
    a.lane = this.o.laneOf ? this.o.laneOf(e, dir) : 0;
    a.v = a.vmax = this.o.speedOf(e) * (0.85 + Math.random() * 0.3);
    return true;
  }

  init(px, pz) {
    for (let i = 0; i < this.o.count; i++) {
      const kind = this.o.kindOf(i);
      const a = { kind, ids: [], color: this.o.colorOf(kind) };
      for (let k = 0; k < (this.o.sections || 1); k++) {
        const id = this.mesh.addInstance(this.geoIds[this.o.geometryOf(kind, k)]);
        this.mesh.setColorAt(id, a.color);
        a.ids.push(id);
      }
      if (!this.spawn(a, px, pz, 20, this.o.radius)) { a.e = null; for (const id of a.ids) this.mesh.setVisibleAt(id, false); }
      this.agents.push(a);
    }
  }

  update(dt, px, pz) {
    const g = this.graph, o = this.o, P = this.tmp;
    // kolejki na krawedziach (do zachowania odstepow)
    const lanes = new Map();
    for (const a of this.agents) {
      if (!a.e) continue;
      const k = a.e.idx * 4 + (a.dir > 0 ? 0 : 2) + a.lane;
      let l = lanes.get(k);
      if (!l) lanes.set(k, (l = []));
      l.push(a);
    }
    for (const l of lanes.values()) l.sort((p, q) => p.s - q.s);
    for (const l of lanes.values()) {
      for (let i = 0; i < l.length; i++) {
        const a = l[i];
        const ahead = l[i + 1];
        const gap = ahead ? ahead.s - a.s - o.length : Infinity;
        const want = Math.max(0, Math.min(a.vmax, (gap - o.minGap) / 1.2));
        a.v += Math.max(-8 * dt, Math.min(2.5 * dt, want - a.v));
        a.s += a.v * dt;
      }
    }
    for (const a of this.agents) {
      if (!a.e) { if (!this.spawn(a, px, pz, o.radius * 0.5, o.radius)) continue; for (const id of a.ids) this.mesh.setVisibleAt(id, true); }
      while (a.e && a.s > a.e.L) {
        const n = g.next(a.e, a.dir);
        if (!n) { a.e = null; break; }
        a.s -= a.e.L;
        a.e = n.e; a.dir = n.dir;
        a.lane = o.laneOf ? o.laneOf(a.e, a.dir) : 0;
        a.vmax = o.speedOf(a.e) * (0.85 + Math.random() * 0.3);
      }
      if (!a.e) { this.spawn(a, px, pz, o.radius * 0.5, o.radius); if (!a.e) continue; }
      g.sample(a.e, Math.min(a.s, a.e.L), a.dir, P);
      if (Math.hypot(P.x - px, P.z - pz) > o.radius * 1.3) { a.e = null; continue; }
      // przesuniecie na pas (prawa strona kierunku jazdy)
      const off = o.offsetOf ? o.offsetOf(a.e, a.dir, a.lane) : 0;
      for (let k = 0; k < a.ids.length; k++) {
        let x = P.x, z = P.z, dx = P.dx, dz = P.dz;
        if (k > 0) {   // kolejne czlony tramwaju za czolem
          const sb = a.s - k * o.sectionLen;
          if (sb >= 0) {
            const Q = g.sample(a.e, sb, a.dir, {});
            x = Q.x; z = Q.z; dx = Q.dx; dz = Q.dz;
          } else { x -= P.dx * k * o.sectionLen; z -= P.dz * k * o.sectionLen; }
        }
        _p.set(x - dz * off, o.y || 0, z + dx * off);
        _q.setFromAxisAngle(_up, Math.atan2(dx, dz));
        _m.compose(_p, _q, _s);
        this.mesh.setMatrixAt(a.ids[k], _m);
      }
    }
  }
}

// ---------------------------------------------------------------- calosc
const CAR_COLORS = [0xf2f2f2, 0x1c1c1e, 0x8a8f96, 0xc9ccd0, 0x23324f, 0x7a1518, 0x2f4a3a, 0xb7b0a2, 0x4d5f78, 0xe8e3d9];

export class Traffic {
  // density < 1: mniej pojazdow i pieszych (telefony)
  constructor(scene, data, nightUniform, density = 1) {
    const mat = vehicleMaterial(nightUniform);
    const n = k => Math.max(1, Math.round(k * density));
    const roads = new Graph(data.roads, r => r.k === 0 && r.w >= 5.5);
    const speedOf = e => [19, 15, 13, 11, 8][e.c] ?? 8;
    const lanesOf = e => e.lanes ?? (e.ow ? (e.w >= 10 ? 3 : e.w >= 6.5 ? 2 : 1) : e.w >= 14 ? 4 : 2);
    const laneOf = (e, dir) => {
      const n = lanesOf(e), per = e.ow ? n : Math.max(1, Math.floor(n / 2));
      return Math.min(1, Math.floor(Math.random() * per));
    };
    const offsetOf = (e, dir, lane) => {
      const n = lanesOf(e), lw = e.w / n;
      return e.ow ? -e.w / 2 + lw * (lane + 0.5) + Math.min(lane, n - 1) * 0 : lw * (lane + 0.5);
    };
    const cars = [
      carGeometry(4.4, 1.8, 1.5, 0.42, 2.3, -0.2),    // osobowy
      carGeometry(4.0, 1.75, 1.55, 0.45, 2.0, -0.4),   // hatchback
      carGeometry(4.7, 1.9, 1.85, 0.45, 2.6, -0.3),    // SUV
      carGeometry(5.3, 2.0, 2.4, 0.5, 3.6, -0.6),      // dostawczy
      busGeometry(),
    ];
    this.cars = new Fleet(scene, roads, {
      count: n(420), radius: 520, geometries: cars, material: mat, length: 5, minGap: 3,
      kindOf: i => (i % 14 === 0 ? 4 : i % 9 === 0 ? 3 : i % 4 === 0 ? 2 : i % 3 === 0 ? 1 : 0),
      geometryOf: kind => kind,
      colorOf: kind => _c.set(kind === 4 ? 0xffffff : kind === 3 ? 0xeeeeee : CAR_COLORS[Math.floor(Math.random() * CAR_COLORS.length)]).clone(),
      weight: e => (e.c <= 2 ? 1 : e.c === 3 ? 0.6 : 0.25),
      speedOf, laneOf, offsetOf,
    });
    const tracks = new Graph(data.roads, r => r.k === 4);
    this.trams = new Fleet(scene, tracks, {
      count: n(26), radius: 900, geometries: [tramGeometry(true), tramGeometry(false)], material: mat,
      sections: 3, sectionLen: 10.4, length: 31, minGap: 12,
      kindOf: () => 0, geometryOf: (kind, k) => (k === 0 ? 0 : 1),
      colorOf: () => new THREE.Color(0xffffff), weight: () => 1, speedOf: () => 11,
    });
    const walks = new Graph(data.roads, r => r.k === 1);
    this.people = new Fleet(scene, walks, {
      count: n(380), radius: 260, geometries: [personGeometry()], material: mat, length: 0.6, minGap: 0.6, shadows: false,
      kindOf: () => 0, geometryOf: () => 0,
      colorOf: () => new THREE.Color().setHSL(Math.random(), 0.25 + Math.random() * 0.4, 0.25 + Math.random() * 0.4),
      weight: () => 1, speedOf: () => 1.35,
      laneOf: () => (Math.random() < 0.5 ? 0 : 1), offsetOf: (e, dir, lane) => (lane ? 0.6 : -0.6),
    });
    this.started = false;
  }

  update(dt, pos) {
    if (!this.started) {
      this.cars.init(pos.x, pos.z);
      this.trams.init(pos.x, pos.z);
      this.people.init(pos.x, pos.z);
      this.started = true;
    }
    dt = Math.min(dt, 0.1);
    this.cars.update(dt, pos.x, pos.z);
    this.trams.update(dt, pos.x, pos.z);
    this.people.update(dt, pos.x, pos.z);
  }
}
