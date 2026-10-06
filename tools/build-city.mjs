// Przerabia surowe dane OSM (data/raw/osm.json) na kompaktowy plik dla gry (public/data/city.json).
// Wspolrzedne w metrach w ukladzie gry (patrz src/geo.js). Uzycie: npm run build-city
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { project, BOUNDS, ORIGIN, BBOX } from '../src/geo.js';
import { OVERRIDES } from './overrides.mjs';

const raw = JSON.parse(readFileSync('data/raw/osm.json', 'utf8')).elements;
const MARGIN = 120;
const B = { minX: BOUNDS.minX - MARGIN, minZ: BOUNDS.minZ - MARGIN, maxX: BOUNDS.maxX + MARGIN, maxZ: BOUNDS.maxZ + MARGIN };
const FLOOR = 3.2;

// ---------- pomocnicze ----------
const r1 = v => Math.round(v * 10) / 10;
const inB = (x, z) => x >= B.minX && x <= B.maxX && z >= B.minZ && z <= B.maxZ;

function hash(id, salt = 0) {
  let x = (Number(id) % 2147483647) + salt * 7919 + 1;
  x = (x * 16807) % 2147483647;
  x = (x * 16807) % 2147483647;
  return x / 2147483647;
}

function parseLen(v) {
  if (v == null) return NaN;
  const m = String(v).trim().replace(',', '.').match(/^(-?\d+(?:\.\d+)?)\s*(m|ft|')?/i);
  if (!m) return NaN;
  const n = parseFloat(m[1]);
  return m[2] && /ft|'/i.test(m[2]) ? n * 0.3048 : n;
}

function cleanRing(pts) {
  const out = [];
  for (let i = 0; i < pts.length; i += 2) {
    const x = pts[i], z = pts[i + 1], n = out.length;
    if (n && Math.abs(out[n - 2] - x) < 0.05 && Math.abs(out[n - 1] - z) < 0.05) continue;
    out.push(x, z);
  }
  if (out.length >= 4 && Math.abs(out[0] - out[out.length - 2]) < 0.05 && Math.abs(out[1] - out[out.length - 1]) < 0.05) out.length -= 2;
  return out.length >= 6 ? out : null;
}

const geomToRing = geom => cleanRing(geom.filter(Boolean).flatMap(g => project(g.lat, g.lon)));

function ringArea(r) {
  let a = 0;
  for (let i = 0, n = r.length / 2; i < n; i++) {
    const j = (i + 1) % n;
    a += r[2 * i] * r[2 * j + 1] - r[2 * j] * r[2 * i + 1];
  }
  return a / 2;
}

// Zewnetrzne pierscienie: pole > 0, dziury: pole < 0 (w ukladzie x,z). Wtedy normalna (dz,-dx) krawedzi wskazuje na zewnatrz bryly.
function orient(r, positive) {
  if ((ringArea(r) > 0) === positive) return r;
  const out = [];
  for (let i = r.length - 2; i >= 0; i -= 2) out.push(r[i], r[i + 1]);
  return out;
}

function pointInRing(r, x, z) {
  let inside = false;
  for (let i = 0, n = r.length / 2, j = n - 1; i < n; j = i++) {
    const xi = r[2 * i], zi = r[2 * i + 1], xj = r[2 * j], zj = r[2 * j + 1];
    if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

function centroid(r) {
  let x = 0, z = 0;
  const n = r.length / 2;
  for (let i = 0; i < n; i++) { x += r[2 * i]; z += r[2 * i + 1]; }
  return [x / n, z / n];
}

// Sklejanie drog relacji multipolygon w zamkniete pierscienie
function assembleRings(ways) {
  const key = p => p.lat.toFixed(7) + ',' + p.lon.toFixed(7);
  const segs = ways.filter(w => w && w.length >= 2).map(w => w.filter(Boolean));
  const rings = [];
  while (segs.length) {
    let cur = segs.pop();
    for (let guard = 0; key(cur[0]) !== key(cur[cur.length - 1]) && guard < 100000; guard++) {
      const endK = key(cur[cur.length - 1]);
      let found = -1, rev = false;
      for (let i = 0; i < segs.length; i++) {
        if (key(segs[i][0]) === endK) { found = i; break; }
        if (key(segs[i][segs[i].length - 1]) === endK) { found = i; rev = true; break; }
      }
      if (found < 0) break;
      let s = segs.splice(found, 1)[0];
      if (rev) s = s.slice().reverse();
      cur = cur.concat(s.slice(1));
    }
    rings.push(cur);
  }
  return rings;
}

function elementPolygons(el) {
  if (el.type === 'way' && el.geometry) {
    const r = geomToRing(el.geometry);
    return r ? [{ outer: orient(r, true), holes: [] }] : [];
  }
  if (el.type === 'relation' && el.members) {
    const ways = role => el.members.filter(m => m.type === 'way' && m.geometry && (role === 'inner' ? m.role === 'inner' : m.role !== 'inner')).map(m => m.geometry);
    const polys = assembleRings(ways('outer')).map(geomToRing).filter(Boolean).map(r => ({ outer: orient(r, true), holes: [] }));
    for (const g of assembleRings(ways('inner'))) {
      const r = geomToRing(g);
      if (!r) continue;
      const p = polys.find(p => pointInRing(p.outer, r[0], r[1]));
      if (p) p.holes.push(orient(r, false));
    }
    return polys;
  }
  return [];
}

// Przycinanie wielokata do prostokata B (Sutherland-Hodgman)
function clipRing(r) {
  const edges = [
    (x, z) => x >= B.minX, (x, z) => x <= B.maxX, (x, z) => z >= B.minZ, (x, z) => z <= B.maxZ,
  ];
  const inter = [
    (ax, az, bx, bz) => { const t = (B.minX - ax) / (bx - ax); return [B.minX, az + t * (bz - az)]; },
    (ax, az, bx, bz) => { const t = (B.maxX - ax) / (bx - ax); return [B.maxX, az + t * (bz - az)]; },
    (ax, az, bx, bz) => { const t = (B.minZ - az) / (bz - az); return [ax + t * (bx - ax), B.minZ]; },
    (ax, az, bx, bz) => { const t = (B.maxZ - az) / (bz - az); return [ax + t * (bx - ax), B.maxZ]; },
  ];
  let pts = r;
  for (let e = 0; e < 4 && pts.length >= 6; e++) {
    const out = [], n = pts.length / 2;
    for (let i = 0; i < n; i++) {
      const ax = pts[2 * i], az = pts[2 * i + 1];
      const j = (i + 1) % n, bx = pts[2 * j], bz = pts[2 * j + 1];
      const ain = edges[e](ax, az), bin = edges[e](bx, bz);
      if (ain) out.push(ax, az);
      if (ain !== bin) out.push(...inter[e](ax, az, bx, bz));
    }
    pts = out;
  }
  return cleanRing(pts);
}

const round = r => r.map(r1);

// ---------- kolory ----------
const hex = s => parseInt(s.replace('#', ''), 16);
const PALETTE = {
  residential: ['#d9c7a5', '#cdb48f', '#e4d6bb', '#c2ad92', '#d6ba96', '#d2c7b6', '#bda78a', '#e2d0ae', '#c9bba5', '#b8a998'],
  block: ['#cfcbc2', '#c2bcb0', '#d9d5cc', '#b8b2a6', '#cbc2b1', '#b3b7ba', '#c9bfa8', '#a9aeb3'],
  office: ['#aab0b7', '#9ba3ac', '#bdbdb6', '#909aa3', '#b6b0a4', '#a39a8c'],
  glass: ['#7d97ad', '#8aa1b3', '#6e8aa3', '#94a9b8', '#62809a', '#8c9ba6'],
  historic: ['#e6d3a3', '#d9b77e', '#eedfc4', '#c99a6b', '#e2c27f', '#d7c2a0', '#c8a17a', '#e9d9b0', '#b98b6a', '#dcc9a0'],
  utility: ['#a09a92', '#8f8a84', '#aaa59c'],
  plain: ['#d8d6d0', '#c9c7c1', '#bdbab3'],
};
const ROOF = {
  residential: ['#5a5856', '#62605c', '#6e4c3e', '#55504a', '#7a5444'],
  block: ['#6a6a68', '#5f5f5e', '#727270'],
  office: ['#5d6064', '#6a6d70', '#56595c'],
  glass: ['#4d5358', '#5a6066'],
  historic: ['#7e4a36', '#6e3f30', '#5f5a55', '#8a5238', '#4f6b5f'],
  utility: ['#6b6b6b', '#777'],
  plain: ['#6b6b6b', '#777'],
};
const KIND_IDX = { residential: 0, block: 1, office: 2, glass: 3, historic: 4, utility: 5, plain: 6 };
const NAMED_COLOURS = {
  white: '#eeeeea', black: '#2a2a2a', grey: '#9a9a9a', gray: '#9a9a9a', lightgrey: '#c8c8c8', lightgray: '#c8c8c8', darkgrey: '#606060', darkgray: '#606060',
  silver: '#bfc3c7', beige: '#dccfae', brown: '#7b5a44', red: '#a4503e', maroon: '#7a3a2e', yellow: '#e2c86e', orange: '#d98f4e',
  green: '#6f8f5f', blue: '#6d87a6', cream: '#eee4c8', ivory: '#eeeadb', tan: '#cfb48c', pink: '#d9a6a0', sandybrown: '#d6a36c',
};
function parseColour(v) {
  if (!v) return null;
  const s = v.trim().toLowerCase();
  if (/^#[0-9a-f]{6}$/.test(s)) return hex(s);
  if (/^#[0-9a-f]{3}$/.test(s)) return hex('#' + [...s.slice(1)].map(c => c + c).join(''));
  return NAMED_COLOURS[s] ? hex(NAMED_COLOURS[s]) : null;
}

// ---------- budynki ----------
const DEFAULT_H = {
  house: 7, detached: 7, garage: 3, garages: 3, shed: 3, kiosk: 3.5, hut: 3, roof: 5, service: 4, transformer_tower: 6,
  church: 22, cathedral: 28, chapel: 10, industrial: 9, warehouse: 9, retail: 9, supermarket: 8, construction: 12,
  ruins: 4, bridge: 6, parking: 10, carport: 3, toilets: 3, greenhouse: 3,
};

function heights(t, id) {
  const levels = parseFloat(t['building:levels']);
  const roofLevels = parseFloat(t['roof:levels']) || 0;
  let top = parseLen(t.height);
  if (isNaN(top)) top = parseLen(t['building:height']);
  if (isNaN(top) && !isNaN(levels)) top = (levels + roofLevels * 0.5) * FLOOR + (levels > 0 ? 0.8 : 0);
  let base = parseLen(t.min_height);
  if (isNaN(base)) {
    const ml = parseFloat(t['building:min_level']);
    base = isNaN(ml) ? 0 : ml * FLOOR;
  }
  const b = t.building || t['building:part'];
  const guessed = isNaN(top);
  if (guessed) top = DEFAULT_H[b] ?? (13 + hash(id) * 9);
  if (b === 'roof' && isNaN(parseLen(t.min_height))) base = Math.max(0, top - 0.6);
  return { top: Math.max(top, base + 0.5), base: Math.max(0, base), guessed };
}

function kindOf(t, top, base = 0) {
  const b = t.building || t['building:part'];
  // zadaszenia, wiaty, plyty dachow na slupach, kladki - gladkie sciany bez okien
  if (b === 'roof' || t.man_made === 'bridge' || b === 'bridge' || top - base < 2.5) return 'plain';
  const mat = (t['building:material'] || t['building:facade:material'] || '').toLowerCase();
  if (/glass/.test(mat)) return 'glass';
  if (['church', 'cathedral', 'chapel', 'palace', 'castle', 'government', 'civic', 'museum', 'university', 'theatre'].includes(b) || t.historic || t['heritage']) return 'historic';
  if (top >= 70 && !/stone|brick|concrete|plaster|masonry|sandstone|granite/.test(mat)) return 'glass';
  if (['office', 'commercial', 'retail', 'hotel', 'bank', 'supermarket', 'mall'].includes(b)) return top >= 35 ? 'glass' : 'office';
  if (['industrial', 'warehouse', 'garage', 'garages', 'shed', 'service', 'parking', 'transformer_tower', 'roof', 'carport', 'kiosk'].includes(b)) return 'utility';
  return top >= 24 ? 'block' : 'residential';
}

const pick = (arr, h) => hex(arr[Math.floor(h * arr.length) % arr.length]);

// Ksztalty dachow: 1 kopula, 2 piramida (tez czterospadowy - przyblizenie), 3 dwuspadowy, 4 jednospadowy
const ROOF_SHAPES = { dome: 1, onion: 1, round: 1, pyramidal: 2, hipped: 2, 'half-hipped': 2, mansard: 2, gabled: 3, gambrel: 3, saltbox: 3, skillion: 4 };
const COMPASS = { N: 0, NNE: 22.5, NE: 45, ENE: 67.5, E: 90, ESE: 112.5, SE: 135, SSE: 157.5, S: 180, SSW: 202.5, SW: 225, WSW: 247.5, W: 270, WNW: 292.5, NW: 315, NNW: 337.5 };

function roofShape(t, ring, top, base) {
  const shape = ROOF_SHAPES[t['roof:shape']];
  if (!shape) return null;
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (let i = 0; i < ring.length; i += 2) {
    minX = Math.min(minX, ring[i]); maxX = Math.max(maxX, ring[i]);
    minZ = Math.min(minZ, ring[i + 1]); maxZ = Math.max(maxZ, ring[i + 1]);
  }
  const ext = Math.min(maxX - minX, maxZ - minZ);
  let rh = parseLen(t['roof:height']);
  if (isNaN(rh)) {
    const rl = parseFloat(t['roof:levels']);
    if (!isNaN(rl)) rh = rl * FLOOR;
  }
  if (isNaN(rh)) rh = shape === 1 ? Math.min(ext / 2, 12) : Math.min(8, Math.max(1.5, ext * 0.35));
  rh = Math.min(rh, top - base);
  if (rh < 0.3) return null;
  const out = { rs: shape, rh: r1(rh) };
  if (shape === 4) {
    const d = t['roof:direction'];
    const deg = d == null ? 0 : (COMPASS[String(d).toUpperCase()] ?? parseFloat(d));
    out.rd = isNaN(deg) ? 0 : Math.round(deg);
  }
  if (shape === 3 && t['roof:orientation'] === 'across') out.ra = 1;
  return out;
}

const isUnderground = t =>
  t.location === 'underground' || t.building === 'underground' || t.tunnel ||
  (parseFloat(t.layer) < 0 && !t.height && !t['building:levels']);

const outlines = [], parts = [];
// nazwane wysokie budynki (do podpisu, gdy gracz jest na wiezowcu): obrys calego budynku, wysokosc, rok
const towers = [];
for (const el of raw) {
  const t = { ...(el.tags || {}), ...(OVERRIDES[el.id] || {}) };
  const isPart = !!t['building:part'] && t['building:part'] !== 'no';
  const isBuilding = !!t.building && t.building !== 'no';
  if (!isPart && !isBuilding) continue;
  if (isUnderground(t)) continue;
  for (const poly of elementPolygons(el)) {
    const [cx, cz] = centroid(poly.outer);
    if (!inB(cx, cz)) continue;
    const { top, base, guessed } = heights(t, el.id);
    const kind = kindOf(t, top, base);
    const b = {
      o: round(poly.outer),
      t: r1(top),
      k: KIND_IDX[kind],
      c: parseColour(t['building:colour']) ?? pick(PALETTE[kind], hash(el.id, 1)),
      r: parseColour(t['roof:colour']) ?? pick(ROOF[kind], hash(el.id, 2)),
    };
    if (base > 0) b.b = r1(base);
    if (guessed) b.d = 1;
    if (poly.holes.length) b.h = poly.holes.map(round);
    if (t.name && top >= 50) b.n = t.name;
    const rs = roofShape(t, poly.outer, top, base);
    if (rs) Object.assign(b, rs);
    if (/glass/i.test(t['roof:material'] || '')) b.rg = 1;
    if (t.name && top >= 45 && !isPart) towers.push({ n: t.name, h: r1(top), o: round(poly.outer), y: parseInt(t.start_date, 10) || undefined });
    b._t = { b: t.building || t['building:part'], date: t.start_date || t['building:start_date'], arch: t['building:architecture'], id: el.id, cx, cz };
    (isPart ? parts : outlines).push({ b, cx, cz });
  }
}

// Obrys budynku, ktory ma zmapowane czesci (building:part), jest pomijany - wysokosci niosa czesci (konwencja Simple 3D Buildings)
const CELL = 50;
const partGrid = new Map();
for (const p of parts) {
  const k = Math.floor(p.cx / CELL) + ',' + Math.floor(p.cz / CELL);
  if (!partGrid.has(k)) partGrid.set(k, []);
  partGrid.get(k).push(p);
}
let skipped = 0;
const skippedOutlines = [];
const buildings = parts.map(p => p.b);
for (const o of outlines) {
  const r = o.b.o;
  let minX = Infinity, minZ = Infinity, maxX = -Infinity, maxZ = -Infinity;
  for (let i = 0; i < r.length; i += 2) {
    minX = Math.min(minX, r[i]); maxX = Math.max(maxX, r[i]);
    minZ = Math.min(minZ, r[i + 1]); maxZ = Math.max(maxZ, r[i + 1]);
  }
  let hasPart = false;
  for (let gx = Math.floor(minX / CELL); gx <= Math.floor(maxX / CELL) && !hasPart; gx++) {
    for (let gz = Math.floor(minZ / CELL); gz <= Math.floor(maxZ / CELL) && !hasPart; gz++) {
      for (const p of partGrid.get(gx + ',' + gz) || []) {
        if (pointInRing(r, p.cx, p.cz)) { hasPart = true; break; }
      }
    }
  }
  if (hasPart) { skipped++; skippedOutlines.push(o); continue; }
  buildings.push(o.b);
}

// Czesci wiszace w powietrzu wewnatrz obrysu budynku (zmapowano gore, a nie zmapowano dolu) - dopelniamy
// bryla od najblizszej podpory (lub ziemi) do spodu czesci, w kolorze budynku.
let fillers = 0;
for (const o of skippedOutlines) {
  const inside = parts.filter(p => pointInRing(o.b.o, p.cx, p.cz));
  for (const p of inside) {
    const base = p.b.b || 0;
    if (base <= 1.5 || p.b.t - base < 2 || Math.abs(ringArea(p.b.o)) < 20) continue;
    let floor = 0, supported = false;
    for (const q of inside) {
      if (q === p || (q.b.b || 0) >= base || !pointInRing(q.b.o, p.cx, p.cz)) continue;
      if (q.b.t >= base - 1.5) { supported = true; break; }
      floor = Math.max(floor, q.b.t);
    }
    if (supported) continue;
    const f = { o: p.b.o, t: r1(base), k: o.b.k, c: o.b.c, r: o.b.r, _t: o.b._t };
    if (floor > 0) f.b = r1(floor);
    if (p.b.h) f.h = p.b.h;
    buildings.push(f);
    fillers++;
  }
}

// ---------- drogi ----------
// [szerokosc m, rodzaj]; rodzaj: 0 jezdnia, 1 chodnik/deptak, 2 droga rowerowa, 3 kolej, 4 tramwaj
const ROAD = {
  motorway: [22, 0], trunk: [20, 0], primary: [17, 0], secondary: [14, 0], tertiary: [11, 0],
  motorway_link: [8, 0], trunk_link: [8, 0], primary_link: [8, 0], secondary_link: [7, 0], tertiary_link: [7, 0],
  unclassified: [8, 0], residential: [8, 0], living_street: [6, 0], service: [5, 0], road: [7, 0], busway: [7, 0],
  pedestrian: [7, 1], footway: [3, 1], path: [2.5, 1], steps: [3, 1], track: [3, 1], bridleway: [2, 1],
  cycleway: [2.5, 2],
};

function clipLine(pts) {
  const runs = [];
  let run = [];
  for (let i = 0; i < pts.length; i += 2) {
    const inside = inB(pts[i], pts[i + 1]);
    const prevInside = i > 0 && inB(pts[i - 2], pts[i - 1]);
    if (inside || prevInside) {
      if (!run.length && i > 0) run.push(pts[i - 2], pts[i - 1]);
      run.push(pts[i], pts[i + 1]);
    } else if (run.length) {
      runs.push(run);
      run = [];
    }
  }
  if (run.length >= 4) runs.push(run);
  return runs.filter(r => r.length >= 4);
}

const roads = [], areas = [], zebras = [];
// klasa drogi (do oznakowania poziomego): 0 ekspresowa/glowna ruchu przysp., 1 glowna, 2 zbiorcza, 3 lokalna, 4 pozostale
const ROAD_CLASS = { motorway: 0, trunk: 0, primary: 1, secondary: 2, tertiary: 3, motorway_link: 1, trunk_link: 1, primary_link: 2, secondary_link: 3, tertiary_link: 3 };
const names = [], nameIdx = new Map();
const nameId = n => {
  if (!nameIdx.has(n)) { nameIdx.set(n, names.length); names.push(n); }
  return nameIdx.get(n);
};
const UNNAMED_KINDS = new Set(['footway', 'path', 'cycleway', 'steps', 'track', 'bridleway', 'service']);
for (const el of raw) {
  if (el.type !== 'way' || !el.geometry) continue;
  const t = el.tags || {};
  if (t.tunnel && t.tunnel !== 'no') continue;
  if (t.indoor === 'yes' || parseFloat(t.level) < 0 || parseFloat(t.layer) < 0) continue;
  let spec = null;
  if (t.highway && ROAD[t.highway]) {
    if (t.area === 'yes') {
      if (t.highway === 'pedestrian' || t.highway === 'footway') {
        const r = geomToRing(el.geometry);
        const c = r && clipRing(orient(r, true));
        if (c) areas.push({ k: 'plaza', o: round(c) });
      }
      continue;
    }
    spec = ROAD[t.highway].slice();
    const w = parseLen(t.width), lanes = parseFloat(t.lanes);
    if (!isNaN(w) && w > 1 && w < 60) spec[0] = w;
    else if (spec[1] === 0 && !isNaN(lanes)) spec[0] = Math.max(spec[0], lanes * 3.2 + 1);
    if (t.footway === 'crossing' || t.cycleway === 'crossing') {
      // przejscie dla pieszych z pasami (zebra), jesli oznakowane
      const marked = t.footway === 'crossing' && t.crossing !== 'unmarked' && t['crossing:markings'] !== 'no' && t.crossing !== 'no';
      if (marked) {
        const pts = el.geometry.filter(Boolean).flatMap(g => project(g.lat, g.lon));
        if (pts.length >= 4 && inB(pts[0], pts[1])) zebras.push(round(pts));
      }
      continue;
    }
  } else if (t.railway === 'rail' || t.railway === 'light_rail') {
    spec = [3.2, 3];
  } else if (t.railway === 'tram') {
    spec = [2.4, 4];
  }
  if (!spec) continue;
  const pts = el.geometry.filter(Boolean).flatMap(g => project(g.lat, g.lon));
  for (const run of clipLine(pts)) {
    const road = { k: spec[1], w: r1(spec[0]), p: round(run) };
    if (t.bridge && t.bridge !== 'no') road.br = 1;
    if (spec[1] === 0) {
      const cls = ROAD_CLASS[t.highway];
      if (cls !== undefined) road.c = cls;
      const lanes = parseInt(t.lanes, 10);
      if (lanes > 0 && lanes < 12) road.l = lanes;
      if (t.oneway === 'yes' || t.oneway === '1' || t.junction === 'roundabout' || t.highway === 'motorway') road.ow = 1;
    }
    if (t.name && t.highway && !UNNAMED_KINDS.has(t.highway)) road.n = nameId(t.name);
    roads.push(road);
  }
}

// ---------- tereny ----------
function areaKind(t) {
  if (t.natural === 'water' || t.waterway === 'riverbank') return 'water';
  if (['wood', 'scrub'].includes(t.natural) || t.landuse === 'forest') return 'wood';
  if (['sand', 'beach'].includes(t.natural)) return 'sand';
  if (t.leisure === 'pitch') return 'pitch';
  if (['park', 'garden', 'playground'].includes(t.leisure) || ['grass', 'recreation_ground', 'cemetery', 'meadow', 'village_green'].includes(t.landuse) || t.natural === 'grassland') return 'grass';
  return null;
}
for (const el of raw) {
  const t = el.tags || {};
  const k = areaKind(t);
  if (!k || t.building || t.highway) continue;
  for (const poly of elementPolygons(el)) {
    const o = clipRing(poly.outer);
    if (!o || Math.abs(ringArea(o)) < 20) continue;
    const a = { k, o: round(orient(o, true)) };
    const holes = poly.holes.map(clipRing).filter(Boolean).map(h => round(orient(h, false)));
    if (holes.length) a.h = holes;
    areas.push(a);
  }
}
const AREA_ORDER = { grass: 0, wood: 1, sand: 2, pitch: 3, plaza: 4, water: 5 };
areas.sort((a, b) => AREA_ORDER[a.k] - AREA_ORDER[b.k]);

// ---------- drzewa ----------
// [x, z, rodzaj]: 0 lisciaste, 1 iglaste, 2 wierzba, 3 topola, 4 szerokie (kasztanowiec, dab, jesion...), 5 brzoza,
// 6 lipa/klon (gesta, okragla korona). Rodzaj z genus/species lub leaf_type (OSM).
function treeType(t) {
  const g = (t.genus || t.species || t['species:pl'] || '').toLowerCase();
  if (/^(pinus|picea|abies|larix|taxus|thuja|juniperus|pseudotsuga|sosna|świerk|swierk|jodła|modrzew)/.test(g) || t.leaf_type === 'needleleaved') return 1;
  if (/^(salix|wierzba)/.test(g)) return 2;
  if (/^(populus|topola)/.test(g)) return 3;
  if (/^(aesculus|quercus|fraxinus|juglans|fagus|ulmus|platanus|gleditsia|kasztanowiec|dąb|jesion)/.test(g)) return 4;
  if (/^(betula|brzoza)/.test(g)) return 5;
  if (/^(tilia|acer|lipa|klon)/.test(g)) return 6;
  return 0;
}
const trees = [];
const treeGrid = new Set();
for (const el of raw) {
  if (el.type !== 'node' || el.tags?.natural !== 'tree') continue;
  const [x, z] = project(el.lat, el.lon);
  if (!inB(x, z)) continue;
  trees.push(r1(x), r1(z), treeType(el.tags));
  treeGrid.add(Math.floor(x / 6) + ',' + Math.floor(z / 6));
}
// Lasy i zarosla (natural=wood, landuse=forest) zwykle nie maja zmapowanych pojedynczych drzew - wypelniamy je
// drzewami co ~7 m (z losowym przesunieciem), omijajac miejsca z drzewami z OSM.
let woodTrees = 0;
for (const a of areas) {
  if (a.k !== 'wood') continue;
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (let i = 0; i < a.o.length; i += 2) { x0 = Math.min(x0, a.o[i]); x1 = Math.max(x1, a.o[i]); z0 = Math.min(z0, a.o[i + 1]); z1 = Math.max(z1, a.o[i + 1]); }
  const step = 7;
  for (let x = x0 + step / 2; x < x1; x += step) {
    for (let z = z0 + step / 2; z < z1; z += step) {
      const h = hash(Math.round(x * 13 + z * 7919), 3);
      const px = x + (h - 0.5) * step * 0.8, pz = z + (hash(Math.round(x * 31 + z * 17), 4) - 0.5) * step * 0.8;
      if (!pointInRing(a.o, px, pz) || (a.h || []).some(hh => pointInRing(hh, px, pz))) continue;
      if (treeGrid.has(Math.floor(px / 6) + ',' + Math.floor(pz / 6))) continue;
      const u = hash(Math.round(px * 101 + pz * 37), 6);
      trees.push(r1(px), r1(pz), u < 0.12 ? 1 : u < 0.2 ? 5 : u < 0.5 ? 4 : u < 0.8 ? 6 : 0);
      woodTrees++;
    }
  }
}

// ---------- latarnie i sygnalizacja ----------
// Latarnie z OSM (highway=street_lamp); wzdluz ulic (klasa <= 3 i nazwane jezdnie), gdzie w promieniu 25 m nie ma
// zmapowanej latarni, dostawiamy wlasne co ~32 m po obu stronach. Wysiegnik zawsze w strone najblizszej jezdni.
// Sygnalizatory: wezly highway=traffic_signals / crossing=traffic_signals -> dwa slupy po bokach jezdni.
const SEG = 30;
const segGrid = new Map();
for (const r of roads) {
  if (r.k !== 0) continue;
  for (let i = 0; i + 3 < r.p.length; i += 2) {
    const s = [r.p[i], r.p[i + 1], r.p[i + 2], r.p[i + 3], r.w];
    for (let gx = Math.floor(Math.min(s[0], s[2]) / SEG); gx <= Math.floor(Math.max(s[0], s[2]) / SEG); gx++) {
      for (let gz = Math.floor(Math.min(s[1], s[3]) / SEG); gz <= Math.floor(Math.max(s[1], s[3]) / SEG); gz++) {
        const k = gx + ',' + gz;
        if (!segGrid.has(k)) segGrid.set(k, []);
        segGrid.get(k).push(s);
      }
    }
  }
}
function nearestRoad(x, z) {
  let best = null, bd = Infinity;
  const gx = Math.floor(x / SEG), gz = Math.floor(z / SEG);
  for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
    for (const s of segGrid.get((gx + dx) + ',' + (gz + dz)) || []) {
      const vx = s[2] - s[0], vz = s[3] - s[1], L2 = vx * vx + vz * vz || 1;
      const t = Math.max(0, Math.min(1, ((x - s[0]) * vx + (z - s[1]) * vz) / L2));
      const px = s[0] + vx * t, pz = s[1] + vz * t, d = Math.hypot(x - px, z - pz);
      if (d < bd) { bd = d; best = { px, pz, d, w: s[4], dx: vx, dz: vz }; }
    }
  }
  return best;
}
const lamps = [], signals = [];
const lampGrid = new Set();
const r2 = v => Math.round(v * 100) / 100;
for (const el of raw) {
  if (el.type !== 'node') continue;
  const t = el.tags || {};
  const [x, z] = project(el.lat, el.lon);
  if (!inB(x, z)) continue;
  if (t.highway === 'street_lamp') {
    const n = nearestRoad(x, z);
    const a = n && n.d > 0.3 ? Math.atan2(n.pz - z, n.px - x) : 0;
    lamps.push(r1(x), r1(z), r2(a));
    lampGrid.add(Math.floor(x / 25) + ',' + Math.floor(z / 25));
  } else if (t.highway === 'traffic_signals' || t.crossing === 'traffic_signals') {
    const n = nearestRoad(x, z);
    if (!n || n.d > 12) continue;
    const L = Math.hypot(n.dx, n.dz) || 1, ux = n.dx / L, uz = n.dz / L;
    for (const side of [-1, 1]) {
      const off = n.w / 2 + 1.2;
      const sx = n.px - uz * off * side, sz = n.pz + ux * off * side;
      signals.push(r1(sx), r1(sz), r2(Math.atan2(n.pz - sz, n.px - sx)));
    }
  }
}
const osmLamps = lamps.length / 3;
const nearLamp = (x, z) => {
  const gx = Math.floor(x / 25), gz = Math.floor(z / 25);
  for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) if (lampGrid.has((gx + dx) + ',' + (gz + dz))) return true;
  return false;
};
for (const r of roads) {
  if (r.k !== 0 || r.br || (r.c === undefined && r.n === undefined) || r.w < 6) continue;
  let acc = 0;
  for (let i = 0; i + 3 < r.p.length; i += 2) {
    const ax = r.p[i], az = r.p[i + 1], bx = r.p[i + 2], bz = r.p[i + 3];
    const L = Math.hypot(bx - ax, bz - az);
    if (L < 0.5) continue;
    const ux = (bx - ax) / L, uz = (bz - az) / L;
    for (let s = (32 - acc % 32) % 32; s < L; s += 32) {
      const cx = ax + ux * s, cz = az + uz * s;
      for (const side of [-1, 1]) {
        const off = r.w / 2 + 0.9;
        const x = cx - uz * off * side, z = cz + ux * off * side;
        if (nearLamp(x, z)) continue;
        lamps.push(r1(x), r1(z), r2(Math.atan2(cz - z, cx - x)));
      }
    }
    acc += L;
  }
}

// ---------- dzielnice, obszary MSI, osiedla (do HUD: "gdzie jestem") ----------
// Upraszczanie linii (Douglas-Peucker), zeby granice nie wazyly megabajtow
function simplify(r, tol) {
  const n = r.length / 2;
  if (n < 8) return r;
  const keep = new Uint8Array(n);
  keep[0] = keep[n - 1] = 1;
  const stack = [[0, n - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    const ax = r[2 * a], az = r[2 * a + 1], bx = r[2 * b], bz = r[2 * b + 1];
    const dx = bx - ax, dz = bz - az, len = Math.hypot(dx, dz) || 1;
    let best = -1, bi = -1;
    for (let i = a + 1; i < b; i++) {
      const d = Math.abs((r[2 * i] - ax) * dz - (r[2 * i + 1] - az) * dx) / len;
      if (d > best) { best = d; bi = i; }
    }
    if (best > tol) { keep[bi] = 1; stack.push([a, bi], [bi, b]); }
  }
  const out = [];
  for (let i = 0; i < n; i++) if (keep[i]) out.push(r[2 * i], r[2 * i + 1]);
  return out.length >= 6 ? out : r;
}
const districts = [], places = [];
for (const el of raw) {
  const t = el.tags || {};
  if (el.type === 'relation' && t.boundary === 'administrative' && (t.admin_level === '9' || t.admin_level === '10') && t.name) {
    for (const poly of elementPolygons(el)) {
      const o = clipRing(poly.outer);
      if (!o) continue;
      const d = { n: t.name, l: +t.admin_level, o: round(simplify(o, 4)) };
      const holes = poly.holes.map(clipRing).filter(Boolean).map(h => round(simplify(h, 4)));
      if (holes.length) d.h = holes;
      districts.push(d);
    }
  }
  if (el.type === 'node' && /^(suburb|quarter|neighbourhood)$/.test(t.place || '') && t.name) {
    const [x, z] = project(el.lat, el.lon);
    if (inB(x, z)) places.push({ n: t.name, t: t.place, x: r1(x), z: r1(z) });
  }
}

// ---------- style fasad ----------
// Indeksy jak FACADE_STYLES w src/world/textures.js. Brak danych o wygladzie elewacji, wiec styl wynika z obszaru
// (MSI), typu i wysokosci budynku, a gdy OSM podaje: z daty budowy i stylu architektonicznego.
const ST = { kamienica: 0, blok: 1, biurowiec: 2, socrealizm: 3, stare_miasto: 4, przemysl: 5, nowy: 6, dawny: 7 };
const AREA_MIX = {
  // [niskie mieszkalne (< 24 m)], [wysokie mieszkalne]
  srodmiescie: [{ kamienica: 55, socrealizm: 20, nowy: 20, dawny: 5 }, { socrealizm: 35, blok: 30, nowy: 35 }],
  muranow: [{ socrealizm: 45, blok: 35, nowy: 20 }, { blok: 55, socrealizm: 25, nowy: 20 }],
  wola: [{ blok: 40, nowy: 35, kamienica: 25 }, { blok: 50, nowy: 50 }],
  praga: [{ kamienica: 65, blok: 15, nowy: 20 }, { blok: 60, nowy: 40 }],
  saska: [{ nowy: 40, dawny: 40, kamienica: 20 }, { blok: 50, nowy: 50 }],
  ochota: [{ kamienica: 50, socrealizm: 20, nowy: 30 }, { blok: 50, socrealizm: 20, nowy: 30 }],
  inne: [{ kamienica: 40, blok: 25, nowy: 35 }, { blok: 50, nowy: 50 }],
};
const AREA_GROUP = {
  'Śródmieście Północne': 'srodmiescie', 'Śródmieście Południowe': 'srodmiescie', 'Powiśle': 'srodmiescie', 'Solec': 'srodmiescie',
  'Ujazdów': 'srodmiescie', 'Muranów': 'muranow', 'Nowolipki': 'muranow', 'Młynów': 'muranow', 'Mirów': 'wola', 'Czyste': 'wola',
  'Powązki': 'wola', 'Stara Praga': 'praga', 'Nowa Praga': 'praga', 'Szmulowizna': 'praga', 'Kamionek': 'praga',
  'Saska Kępa': 'saska', 'Filtry': 'ochota', 'Stara Ochota': 'ochota',
};
const areas10 = districts.filter(d => d.l === 10);
function areaAt(x, z) {
  for (const d of areas10) if (pointInRing(d.o, x, z) && !(d.h || []).some(h => pointInRing(h, x, z))) return d.n;
  return null;
}
function pickMix(mix, u) {
  const tot = Object.values(mix).reduce((a, b) => a + b, 0);
  let acc = 0;
  for (const [k, w] of Object.entries(mix)) { acc += w / tot; if (u < acc) return ST[k]; }
  return ST.dawny;
}
function styleOf(b) {
  const info = b._t || {};
  const K = ['residential', 'block', 'office', 'glass', 'historic', 'utility', 'plain'][b.k];
  if (K === 'glass' || K === 'plain') return undefined;
  if (K === 'utility') return ST.przemysl;
  const area = info.cx === undefined ? null : areaAt(info.cx, info.cz);
  const old = area === 'Stare Miasto' || area === 'Nowe Miasto';
  const u = hash(info.id ?? b.o.length * 7919 + Math.round(b.o[0]), 5);
  const arch = (info.arch || '').toLowerCase();
  if (/stalinist|socialist/.test(arch)) return ST.socrealizm;
  if (/baroque|renaissance|classic|gothic/.test(arch)) return old ? ST.stare_miasto : ST.kamienica;
  if (/modern|deconstruct|contemporary/.test(arch)) return ST.nowy;
  const year = parseInt(info.date, 10);
  if (year > 1000) {
    if (year < 1945) return old ? ST.stare_miasto : ST.kamienica;
    if (year < 1960) return old ? ST.stare_miasto : ST.socrealizm;
    if (year < 1990) return K === 'office' ? ST.biurowiec : ST.blok;
    return K === 'office' ? ST.biurowiec : ST.nowy;
  }
  if (old && (K === 'residential' || K === 'historic' || b.t < 30)) return ST.stare_miasto;
  if (K === 'historic') return /church|cathedral|chapel/.test(info.b || '') ? ST.stare_miasto : (u < 0.5 ? ST.socrealizm : ST.kamienica);
  if (K === 'office') return u < 0.65 ? ST.biurowiec : u < 0.85 ? ST.socrealizm : ST.nowy;
  if (/^(house|detached|semidetached_house|villa)$/.test(info.b || '')) return u < 0.5 ? ST.nowy : ST.dawny;
  const mix = AREA_MIX[AREA_GROUP[area] || 'inne'];
  return pickMix(mix[b.t < 24 ? 0 : 1], u);
}
const styleCount = {};
for (const b of buildings) {
  const st = styleOf(b);
  if (st !== undefined) { b.s = st; styleCount[st] = (styleCount[st] || 0) + 1; }
  delete b._t;
}

// ---------- zapis ----------
const out = {
  version: 2, // 2: drzewa [x, z, rodzaj]
  generated: new Date().toISOString(),
  origin: ORIGIN,
  bbox: BBOX,
  bounds: { minX: r1(B.minX), minZ: r1(B.minZ), maxX: r1(B.maxX), maxZ: r1(B.maxZ) },
  buildings,
  roads,
  areas,
  trees,
  zebras,
  towers,
  lamps,
  signals,
  names,
  districts,
  places,
};
mkdirSync('public/data', { recursive: true });
const json = JSON.stringify(out);
writeFileSync('public/data/city.json', json);

const tall = buildings.filter(b => b.t >= 100).sort((a, b) => b.t - a.t);
console.log(`Budynki: ${buildings.length} (czesci: ${parts.length}, pominiete obrysy z czesciami: ${skipped}, dopelnienia pod wiszacymi czesciami: ${fillers})`);
console.log(`Dachy o ksztalcie: ${buildings.filter(b => b.rs).length}, nazwy ulic: ${names.length}, dzielnice/obszary: ${districts.map(d => d.n + '(' + d.l + ')').join(', ')}, osiedla: ${places.length}`);
console.log(`Nazwane wiezowce: ${towers.length} (${towers.filter(t => t.h >= 100).map(t => t.n).join(', ')})`);
console.log(`Latarnie: ${lamps.length / 3} (z OSM ${osmLamps}), sygnalizatory: ${signals.length / 3}`);
console.log(`Drogi: ${roads.length}, przejscia (zebry): ${zebras.length}, tereny: ${areas.length}, drzewa: ${trees.length / 3} (w tym dosadzone w lasach: ${woodTrees})`);
console.log(`Style fasad: ${Object.entries(styleCount).map(([k, n]) => Object.keys(ST)[k] + ' ' + n).join(', ')}`);
console.log(`Najwyzsze: ${tall.slice(0, 12).map(b => `${b.n || '?'} ${b.t}m`).join(', ')}`);
console.log(`Zapisano public/data/city.json (${(json.length / 1e6).toFixed(1)} MB)`);
