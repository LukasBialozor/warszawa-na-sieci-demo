// Modele 3D budynkow LOD2 z GUGiK (CityGML, EPSG:2180, skaning ALS 2012) dla centrum -> public/data/lod2.json + lod2.bin
// Budynek z LOD2 zastepuje budynek z OSM tylko wtedy, gdy obrys i wysokosc sie zgadzaja (budynek sie nie zmienil);
// wszystko nowsze (Varso, Hub, MSN...) zostaje z OSM - miasto ma byc "jak dzis".
// Uruchamiane po build-city (uzywa public/data/city.json). Uzycie: node tools/build-lod2.mjs
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import proj4 from 'proj4';
import * as THREE from 'three';
import { project, BOUNDS } from '../src/geo.js';

const ZIP = 'data/raw/gugik/1465_gml.zip';
if (!existsSync(ZIP)) {
  console.log('Brak', ZIP, '- pomijam LOD2 (pobierz: https://opendata.geoportal.gov.pl/InneDane/Budynki3D/LOD2/1465_gml.zip)');
  process.exit(0);
}
proj4.defs('EPSG:2180', '+proj=tmerc +lat_0=0 +lon_0=19 +k=0.9993 +x_0=500000 +y_0=-5300000 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs');
const toLL = proj4('EPSG:2180', 'EPSG:4326');

// Obszar: caly wycinek gry (BOUNDS z geo.js) - zmienna LOD2_REGION="minX,maxX,minZ,maxZ" pozwala go zawezic
const REGION = process.env.LOD2_REGION
  ? Object.fromEntries(['minX', 'maxX', 'minZ', 'maxZ'].map((k, i) => [k, +process.env.LOD2_REGION.split(',')[i]]))
  : { minX: BOUNDS.minX, maxX: BOUNDS.maxX, minZ: BOUNDS.minZ, maxZ: BOUNDS.maxZ };

const city = JSON.parse(readFileSync('public/data/city.json', 'utf8'));

// ---------- geometria pomocnicza ----------
function ringArea(r) {
  let a = 0;
  for (let i = 0, n = r.length / 2; i < n; i++) {
    const j = (i + 1) % n;
    a += r[2 * i] * r[2 * j + 1] - r[2 * j] * r[2 * i + 1];
  }
  return a / 2;
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
// Newell: normalna wielokata 3D
function newell(pts) {
  let nx = 0, ny = 0, nz = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    nx += (a[1] - b[1]) * (a[2] + b[2]);
    ny += (a[2] - b[2]) * (a[0] + b[0]);
    nz += (a[0] - b[0]) * (a[1] + b[1]);
  }
  const l = Math.hypot(nx, ny, nz) || 1;
  return [nx / l, ny / l, nz / l];
}
// triangulacja plaskiego wielokata 3D (z dziurami) przez rzut na dominujaca plaszczyzne
function triangulate(outer, holes, n) {
  const ax = Math.abs(n[0]), ay = Math.abs(n[1]), az = Math.abs(n[2]);
  const [i0, i1] = ay >= ax && ay >= az ? [0, 2] : ax >= az ? [1, 2] : [0, 1];
  const v2 = p => new THREE.Vector2(p[i0], p[i1]);
  let tris;
  try { tris = THREE.ShapeUtils.triangulateShape(outer.map(v2), holes.map(h => h.map(v2))); } catch { return []; }
  const all = outer.concat(...holes);
  const out = [];
  for (const [a, b, c] of tris) {
    let A = all[a], B = all[b], C = all[c];
    // zgodnosc nawiniecia z normalna wielokata (zewnetrzna)
    const e1 = [B[0] - A[0], B[1] - A[1], B[2] - A[2]], e2 = [C[0] - A[0], C[1] - A[1], C[2] - A[2]];
    const cr = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
    if (cr[0] * n[0] + cr[1] * n[1] + cr[2] * n[2] < 0) { const t = B; B = C; C = t; }
    out.push(A, B, C);
  }
  return out;
}

// ---------- wybor arkuszy ----------
// przyblizony prostokat w EPSG:2180 (x gry ~ wschod, z gry ~ -polnoc) z zapasem na skale i zbieznosc poludnikow
const PK = { e: 636952.5, n: 486978.9 };
const BOX = { minE: PK.e + REGION.minX - 250, maxE: PK.e + REGION.maxX + 250, minN: PK.n - REGION.maxZ - 250, maxN: PK.n - REGION.minZ + 250 };
const names = execFileSync('unzip', ['-Z1', ZIP], { encoding: 'utf8' }).split('\n').filter(n => n.endsWith('.gml'));
const sheets = [];
for (const name of names) {
  const head = execFileSync('sh', ['-c', `unzip -p "${ZIP}" "${name}" | head -c 3000`], { encoding: 'utf8' });
  const lo = head.match(/<gml:lowerCorner>([\d.]+) ([\d.]+)/), hi = head.match(/<gml:upperCorner>([\d.]+) ([\d.]+)/);
  if (!lo) continue;
  if (+hi[1] < BOX.minE || +lo[1] > BOX.maxE || +hi[2] < BOX.minN || +lo[2] > BOX.maxN) continue;
  sheets.push(name);
}
console.log('Arkusze LOD2:', sheets.length);

// ---------- parsowanie CityGML ----------
const posRe = /<gml:pos[^>]*>([^<]+)<\/gml:pos>|<gml:posList[^>]*>([^<]+)<\/gml:posList>/g;
function ringPts(xml) {
  const pts = [];
  for (const m of xml.matchAll(posRe)) {
    const nums = (m[1] || m[2]).trim().split(/\s+/).map(Number);
    for (let i = 0; i + 2 < nums.length; i += 3) pts.push([nums[i], nums[i + 1], nums[i + 2]]);
  }
  if (pts.length > 1) {
    const a = pts[0], b = pts[pts.length - 1];
    if (a[0] === b[0] && a[1] === b[1] && a[2] === b[2]) pts.pop();
  }
  return pts;
}
function polygons(xml) {
  const out = [];
  for (const pm of xml.matchAll(/<gml:Polygon[^>]*>([\s\S]*?)<\/gml:Polygon>/g)) {
    const ext = pm[1].match(/<gml:exterior>([\s\S]*?)<\/gml:exterior>/);
    if (!ext) continue;
    const holes = [...pm[1].matchAll(/<gml:interior>([\s\S]*?)<\/gml:interior>/g)].map(h => ringPts(h[1]));
    out.push({ outer: ringPts(ext[1]), holes: holes.filter(h => h.length >= 3) });
  }
  return out;
}

const llCache = new Map();
function toGame(e, n) {
  const k = e.toFixed(2) + ',' + n.toFixed(2);
  let v = llCache.get(k);
  if (!v) {
    const [lon, lat] = toLL.forward([e, n]);
    v = project(lat, lon);
    llCache.set(k, v);
  }
  return v;
}

const lod = [];
for (const name of sheets) {
  const xml = execFileSync('unzip', ['-p', ZIP, name], { encoding: 'utf8', maxBuffer: 1 << 30 });
  let n = 0;
  for (const bm of xml.matchAll(/<bldg:Building gml:id="([^"]+)">([\s\S]*?)<\/bldg:Building>/g)) {
    const body = bm[2];
    const first = body.match(/<gml:pos[^>]*>([\d.]+) ([\d.]+)/);
    if (!first) continue;
    const [fx, fz] = toGame(+first[1], +first[2]);
    if (fx < REGION.minX || fx > REGION.maxX || fz < REGION.minZ || fz > REGION.maxZ) continue;
    const surf = { GroundSurface: [], WallSurface: [], RoofSurface: [] };
    for (const sm of body.matchAll(/<bldg:(GroundSurface|WallSurface|RoofSurface)[^>]*>([\s\S]*?)<\/bldg:\1>/g)) {
      surf[sm[1]].push(...polygons(sm[2]));
    }
    if (!surf.GroundSurface.length || !surf.RoofSurface.length) continue;
    // wysokosc terenu budynku = najnizszy punkt podstawy (swiat gry jest plaski)
    let ground = Infinity;
    for (const p of surf.GroundSurface) for (const q of p.outer) ground = Math.min(ground, q[2]);
    const conv = p => { const [x, z] = toGame(p[0], p[1]); return [x, p[2] - ground, z]; };
    const conv3 = poly => ({ outer: poly.outer.map(conv), holes: poly.holes.map(h => h.map(conv)) });
    const b = {
      id: bm[1],
      ground: surf.GroundSurface.map(conv3),
      walls: surf.WallSurface.map(conv3),
      roofs: surf.RoofSurface.map(conv3),
    };
    b.top = Math.max(...b.roofs.flatMap(p => p.outer.map(q => q[1])));
    b.eave = Math.min(...b.roofs.flatMap(p => p.outer.map(q => q[1])));
    // obrysy (x,z) do kolizji: zewnetrzny pole > 0, dziury (podworka) pole < 0 - jak w build-city
    const orient = (pts, positive) => {
      let r = pts.flatMap(q => [q[0], q[2]]);
      if ((ringArea(r) > 0) !== positive) { const o = []; for (let i = r.length - 2; i >= 0; i -= 2) o.push(r[i], r[i + 1]); r = o; }
      return r;
    };
    b.polys = b.ground
      .map(g => [orient(g.outer, true), ...g.holes.map(h => orient(h, false)).filter(h => Math.abs(ringArea(h)) > 4)])
      .filter(p => p[0].length >= 6 && Math.abs(ringArea(p[0])) > 4);
    b.rings = b.polys.map(p => p[0]);
    if (!b.rings.length || b.top < 1) continue;
    b.area = b.rings.reduce((s, r) => s + Math.abs(ringArea(r)), 0);
    lod.push(b);
    n++;
  }
  console.log(`  ${name}: ${n} budynkow w obszarze`);
}

// Zrzut surowych bryl LOD2 (np. jako podklad do modeli landmarkow w Blenderze):
// DUMP_AT="x,z,promien,plik;x,z,promien,plik" - zapisuje budynki ze srodkiem obrysu w promieniu i konczy.
if (process.env.DUMP_AT) {
  for (const spec of process.env.DUMP_AT.split(';')) {
    const [dx, dz, dr, file] = spec.split(',');
    const out = lod.filter(L => { const [cx, cz] = centroid(L.rings[0]); return Math.hypot(cx - dx, cz - dz) < +dr; });
    writeFileSync(file, JSON.stringify(out.map(L => ({ id: L.id, top: L.top, eave: L.eave, polys: L.polys, walls: L.walls, roofs: L.roofs }))));
    console.log(`Zrzut LOD2: ${out.length} budynkow -> ${file}`);
  }
  process.exit(0);
}

// ---------- dopasowanie do OSM ----------
const osm = city.buildings.map((b, i) => {
  const [cx, cz] = centroid(b.o);
  return { i, b, cx, cz, area: Math.abs(ringArea(b.o)) };
});
const grid = new Map();
const CELL = 50;
for (const o of osm) {
  const k = Math.floor(o.cx / CELL) + ',' + Math.floor(o.cz / CELL);
  if (!grid.has(k)) grid.set(k, []);
  grid.get(k).push(o);
}
// indeks OSM po prostokatach otaczajacych (duze budynki, np. PKiN, maja srodek daleko od punktu)
const bgrid = new Map();
for (const o of osm) {
  const r = o.b.o;
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (let i = 0; i < r.length; i += 2) { x0 = Math.min(x0, r[i]); x1 = Math.max(x1, r[i]); z0 = Math.min(z0, r[i + 1]); z1 = Math.max(z1, r[i + 1]); }
  for (let gx = Math.floor(x0 / CELL); gx <= Math.floor(x1 / CELL); gx++) {
    for (let gz = Math.floor(z0 / CELL); gz <= Math.floor(z1 / CELL); gz++) {
      const k = gx + ',' + gz;
      if (!bgrid.has(k)) bgrid.set(k, []);
      bgrid.get(k).push(o);
    }
  }
}
// wysokosc zabudowy wg OSM w punkcie (najwyzsza bryla nad punktem)
function osmTopAt(x, z) {
  let h = 0, guessed = true;
  for (const o of bgrid.get(Math.floor(x / CELL) + ',' + Math.floor(z / CELL)) || []) {
    if (o.b.t > h && pointInRing(o.b.o, x, z) && !(o.b.h || []).some(hh => pointInRing(hh, x, z))) {
      h = o.b.t;
      guessed = !!o.b.d;
    }
  }
  return { h, guessed };
}
// Czy bryla OSM ma w punkcie pustke w pionie (np. przeswit InterContinental, nawis, dach na slupach)?
// LOD2 (dach ze skaningu + obrys) tego nie odda - taki budynek zostaje z OSM.
function osmGapAt(x, z) {
  const iv = [];
  for (const o of bgrid.get(Math.floor(x / CELL) + ',' + Math.floor(z / CELL)) || []) {
    if (pointInRing(o.b.o, x, z) && !(o.b.h || []).some(hh => pointInRing(hh, x, z))) iv.push([o.b.b || 0, o.b.t]);
  }
  if (!iv.length) return false;
  iv.sort((a, b) => a[0] - b[0]);
  let reach = 0;
  for (const [b0, t0] of iv) {
    if (b0 - reach > 3) return true;
    reach = Math.max(reach, t0);
  }
  return false;
}

// wysokosc dachu LOD2 w punkcie (trojkaty dachu w rzucie z gory)
function lodTopAt(tris, x, z) {
  let best = -Infinity;
  for (let i = 0; i < tris.length; i += 3) {
    const [ax, ay, az] = tris[i], [bx, by, bz] = tris[i + 1], [cx, cy, cz] = tris[i + 2];
    const d = (bz - cz) * (ax - cx) + (cx - bx) * (az - cz);
    if (Math.abs(d) < 1e-9) continue;
    const l1 = ((bz - cz) * (x - cx) + (cx - bx) * (z - cz)) / d;
    const l2 = ((cz - az) * (x - cx) + (ax - cx) * (z - cz)) / d;
    const l3 = 1 - l1 - l2;
    if (l1 < -1e-4 || l2 < -1e-4 || l3 < -1e-4) continue;
    best = Math.max(best, l1 * ay + l2 * by + l3 * cy);
  }
  return best;
}

// Dopasowanie przez probkowanie: porownujemy wysokosc dachu LOD2 i OSM w punktach rzutu budynku.
// LOD2 wchodzi tam, gdzie OSM pokrywa budynek i wysokosci sie zgadzaja (budynek nie zmienil sie od 2012).
const kept = [];
let changed = 0, orphan = 0;
for (const L of lod) {
  L.roofTris = L.roofs.flatMap(r => triangulate(r.outer, r.holes, newell(r.outer)));
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const r of L.rings) for (let i = 0; i < r.length; i += 2) {
    minX = Math.min(minX, r[i]); maxX = Math.max(maxX, r[i]);
    minZ = Math.min(minZ, r[i + 1]); maxZ = Math.max(maxZ, r[i + 1]);
  }
  L.bbox = [minX, maxX, minZ, maxZ];
  const step = Math.min(25, Math.max(2, Math.sqrt(L.area) / 6));
  let n = 0, covered = 0, agree = 0, gaps = 0;
  for (let x = minX + step / 2; x < maxX; x += step) {
    for (let z = minZ + step / 2; z < maxZ; z += step) {
      if (!L.polys.some(p => pointInRing(p[0], x, z) && !p.slice(1).some(h => pointInRing(h, x, z)))) continue;
      n++;
      const o = osmTopAt(x, z);
      if (!o.h) continue;
      covered++;
      if (osmGapAt(x, z)) gaps++;
      const lh = lodTopAt(L.roofTris, x, z);
      if (lh === -Infinity || o.guessed || Math.abs(o.h - lh) <= Math.max(6, lh * 0.25)) agree++;
    }
  }
  if (!n || covered / n < 0.5) { orphan++; continue; }   // w OSM tego nie ma -> pewnie wyburzony po 2012
  // budynki OSM ze srodkiem w obrysie (kandydaci do zastapienia)
  L.inside = [];
  for (let gx = Math.floor(minX / CELL); gx <= Math.floor(maxX / CELL); gx++) {
    for (let gz = Math.floor(minZ / CELL); gz <= Math.floor(maxZ / CELL); gz++) {
      for (const o of grid.get(gx + ',' + gz) || []) {
        if (L.rings.some(r => pointInRing(r, o.cx, o.cz))) L.inside.push(o);
      }
    }
  }
  // OSM ma duze zadaszenia/plyty na slupach (np. Dworzec Centralny) - szczegolowsze niz bryla LOD2
  const canopy = L.inside.filter(o => o.b.k === 6).reduce((s, o) => s + o.area, 0);
  const ok = agree / covered >= 0.65 && canopy <= L.area * 0.25 && gaps / covered < 0.04 && L.inside.length > 0;
  if (process.env.DEBUG_AT) {
    const [dx, dz, dr] = process.env.DEBUG_AT.split(',').map(Number);
    const [lx, lz] = centroid(L.rings[0]);
    if (Math.hypot(lx - dx, lz - dz) < dr) {
      console.log(`DEBUG LOD2 (${lx.toFixed(0)},${lz.toFixed(0)}) top=${L.top.toFixed(1)} area=${L.area.toFixed(0)} probki=${n} pokrycie=${(covered / n).toFixed(2)} zgodnosc=${(agree / Math.max(1, covered)).toFixed(2)} daszki=${canopy.toFixed(0)} pustki=${gaps} -> ${ok}`);
    }
  }
  if (!ok) { changed++; continue; }
  const main = L.inside.reduce((a, o) => (o.area > a.area ? o : a));
  L.c = main.b.c; L.r = main.b.r; L.k = main.b.k; L.s = main.b.s;
  kept.push(L);
}
// Zastepujemy tylko te bryly OSM, ktore uzyte LOD2 faktycznie "pokrywaja" (dach LOD2 nad srodkiem >= wysokosc OSM),
// zeby np. wieza nie zniknela, gdyby dopasowala sie tylko podstawa budynku.
const replaced = new Set();
for (const L of kept) {
  for (const o of L.inside) {
    if (replaced.has(o.i)) continue;
    let h = -Infinity;
    for (const K of kept) {
      const [x0, x1, z0, z1] = K.bbox;
      if (o.cx < x0 || o.cx > x1 || o.cz < z0 || o.cz > z1) continue;
      h = Math.max(h, lodTopAt(K.roofTris, o.cx, o.cz));
    }
    if (o.b.d || h >= o.b.t - Math.max(4, o.b.t * 0.15)) replaced.add(o.i);
  }
}

// ---------- geometria do pliku binarnego ----------
// Format 2: pozycje jako Int16 w centymetrach wzgledem poczatku budynku (p: [x, z] w indeksie), bez UV
// (gra liczy UV scian z normalnej trojkata tak samo jak wczesniej narzedzie). ~6 B na wierzcholek zamiast 20.
const pos = [], index = [];
for (const L of kept) {
  const ox = Math.round(L.rings[0][0] * 100) / 100, oz = Math.round(L.rings[0][1] * 100) / 100;
  const push = p => {
    pos.push(Math.round((p[0] - ox) * 100), Math.round(p[1] * 100), Math.round((p[2] - oz) * 100));
  };
  const wallStart = pos.length / 3;
  for (const w of L.walls) for (const p of triangulate(w.outer, w.holes, newell(w.outer))) push(p);
  const roofStart = pos.length / 3;
  for (const r of L.roofs) for (const p of triangulate(r.outer, r.holes, newell(r.outer))) push(p);
  const end = pos.length / 3;
  index.push({
    p: [ox, oz], w: [wallStart, roofStart - wallStart], r: [roofStart, end - roofStart],
    o: L.polys.map(p => p.map(r => r.map(v => Math.round(v * 10) / 10))),
    t: Math.round(L.top * 10) / 10, e: Math.round(L.eave * 10) / 10, c: L.c, rc: L.r, k: L.k, s: L.s,
  });
}
if (pos.some(v => v > 32767 || v < -32768)) throw new Error('Wspolrzedne LOD2 poza zakresem Int16');

const posArr = new Int16Array(pos);
const bin = Buffer.from(posArr.buffer);
writeFileSync('public/data/lod2.bin', bin);
writeFileSync('public/data/lod2.json', JSON.stringify({
  version: 2, source: 'GUGiK LOD2 (ALS 2012), dopasowane do OSM', region: REGION,
  vertices: posArr.length / 3, replaced: [...replaced].sort((a, b) => a - b), buildings: index,
}));
console.log(`LOD2: ${lod.length} budynkow w obszarze, uzyte ${kept.length}, zmienione od 2012 (zostaje OSM): ${changed}, brak w OSM (wyburzone?): ${orphan}`);
console.log(`Zastapione budynki OSM: ${replaced.size}, trojkatow: ${posArr.length / 9}, plik ${(bin.length / 1e6).toFixed(1)} MB`);
