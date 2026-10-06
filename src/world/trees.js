// Drzewa z OSM (natural=tree) + dosadzone w lasach. Ksztalt korony wg rodzaju/gatunku (genus/species/leaf_type):
// 0 lisciaste, 1 iglaste, 2 wierzba, 3 topola, 4 szerokie (kasztanowiec, dab, jesion), 5 brzoza, 6 lipa/klon.
// BatchedMesh: jedno wywolanie rysowania na korony i jedno na pnie; odrzucanie poza kadrem i zasiegiem po komorkach (cull.js).
import * as THREE from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { CellCuller } from './cull.js';
import { DRAW } from '../config.js';

function rng(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

// gladki szum 3D z sumy sinusow o losowych kierunkach - wystarczy do "grudek" korony
function lumpNoise(seed, n = 7) {
  const r = rng(seed);
  const waves = [];
  for (let i = 0; i < n; i++) {
    const d = new THREE.Vector3(r() - 0.5, r() - 0.5, r() - 0.5).normalize();
    waves.push({ d, f: 1.5 + r() * 3.5, p: r() * 6.28, a: 1 / (1 + i * 0.6) });
  }
  const norm = waves.reduce((s, w) => s + w.a, 0);
  return v => waves.reduce((s, w) => s + w.a * Math.sin(v.dot(w.d) * w.f + w.p), 0) / norm;
}

// Korona: sfera (ikosaedr) deformowana do ksztaltu rodzaju + grudki; kolory wierzcholkow: ciemniejszy spod (cien wewnatrz)
function crownGeometry(type, seed, near = true) {
  const detail = type === 1 ? 1 : near ? 2 : 1;
  // ikosaedr jest bez indeksow - scalamy wierzcholki, zeby normalne byly gladkie (wspolne dla sasiednich scian)
  let geo = new THREE.IcosahedronGeometry(1, detail);
  geo.deleteAttribute('normal');
  geo.deleteAttribute('uv');
  geo = mergeVertices(geo);
  const pos = geo.attributes.position;
  const nz = lumpNoise(seed);
  const v = new THREE.Vector3();
  const col = new Float32Array(pos.count * 3);
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const y = v.y;                     // -1 (spod) .. 1 (wierzch)
    let sx = 1, sy = 1, lump = 0.22;
    switch (type) {
      case 1: {                          // iglaste: stozek
        const k = (y + 1) / 2;
        sx = Math.max(0.06, 1 - k * 0.95);
        sy = 1.9;
        lump = 0.12;
        break;
      }
      case 2: sx = 1.35; sy = 0.8; if (y < 0) sx *= 1 + y * 0.15; lump = 0.18; break;   // wierzba: szeroka, zwisajaca
      case 3: sx = 0.5; sy = 1.9; lump = 0.14; break;                                   // topola: kolumnowa
      case 4: sx = 1.25; sy = 0.95; lump = 0.26; break;                                  // szerokie
      case 5: sx = 0.72; sy = 1.3; lump = 0.2; break;                                    // brzoza: smukla
      case 6: sx = 1.05; sy = 1.05; lump = 0.2; break;                                   // lipa/klon
      default: sx = 1.0; sy = 1.1;
    }
    if (type !== 1 && y < -0.5) sx *= 0.85 + (y + 1) * 0.3;   // splaszczony spod
    const d = 1 + lump * (nz(v) * 1.35 + 0.45 * nz(v.clone().multiplyScalar(2.3)));
    pos.setXYZ(i, v.x * sx * d, v.y * sy * d, v.z * sx * d);
    const ao = type === 2 && y < 0 ? 0.62 : 0.55 + 0.5 * Math.min(1, (y + 1) / 1.6);
    const j = 0.92 + 0.16 * (nz(v.clone().multiplyScalar(3.1)) * 0.5 + 0.5);
    col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = ao * j;
    uv[i * 2] = Math.atan2(v.z, v.x) / Math.PI * 2;
    uv[i * 2 + 1] = y * 1.5;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geo.computeVertexNormals();
  return geo;
}

function trunkGeometry() {
  // pien 1 m wysokosci (skalowany), zwezajacy sie, z lekkim rozszerzeniem u podstawy
  const geo = new THREE.CylinderGeometry(0.1, 0.16, 1, 7, 2, true).translate(0, 0.5, 0);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) if (pos.getY(i) < 0.01) { pos.setX(i, pos.getX(i) * 1.35); pos.setZ(i, pos.getZ(i) * 1.35); }
  geo.computeVertexNormals();
  const col = new Float32Array(pos.count * 3).fill(1);
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return geo;
}

function foliageTexture(renderer) {
  const S = 256;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  const r = rng(77);
  g.fillStyle = '#c4c4c4';
  g.fillRect(0, 0, S, S);
  for (let i = 0; i < 5200; i++) {   // kepki lisci: ciemne szczeliny i jasne liscie
    const x = r() * S, y = r() * S, rad = 1.5 + r() * 3.5;
    const v = r() < 0.4 ? 110 + r() * 50 : 200 + r() * 55;
    g.fillStyle = `rgba(${v},${v},${v},0.45)`;
    g.beginPath();
    g.ellipse(x, y, rad, rad * (0.5 + r() * 0.5), r() * 3.14, 0, 6.29);
    g.fill();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  return tex;
}

// kolor liści (HSL) i rozmiar (promien korony, wysokosc pnia do dolu korony) wg rodzaju
const LOOK = [
  { h: 0.24, s: 0.40, l: 0.30, r: 2.6, trunk: 2.6 },   // lisciaste
  { h: 0.36, s: 0.35, l: 0.20, r: 2.2, trunk: 1.2 },   // iglaste
  { h: 0.20, s: 0.40, l: 0.40, r: 3.4, trunk: 2.2 },   // wierzba
  { h: 0.25, s: 0.38, l: 0.31, r: 2.2, trunk: 3.0 },   // topola
  { h: 0.27, s: 0.44, l: 0.25, r: 3.4, trunk: 2.8 },   // szerokie
  { h: 0.22, s: 0.46, l: 0.40, r: 2.0, trunk: 3.2 },   // brzoza
  { h: 0.25, s: 0.45, l: 0.29, r: 2.8, trunk: 2.6 },   // lipa/klon
];

// Poziomy szczegolowosci: korona z ikosaedru stopnia 2 blisko kamery, stopnia 1 dalej (zamiana co ~0.5 s w update).
const LOD_NEAR = 120;

export function buildTrees(scene, renderer, points, isBlocked) {
  const VARIANTS = 2;
  const crowns = [];
  for (let t = 0; t < LOOK.length; t++) for (let k = 0; k < VARIANTS; k++) crowns.push(crownGeometry(t, 31 + t * 7 + k * 101));
  const nCrown = crowns.length;
  for (let t = 0; t < LOOK.length; t++) for (let k = 0; k < VARIANTS; k++) crowns.push(crownGeometry(t, 31 + t * 7 + k * 101, false));
  const trunkGeo = trunkGeometry();

  const list = [];
  for (let i = 0; i < points.length; i += 3) {
    if (isBlocked(points[i], points[i + 1])) continue;
    list.push(i);
  }
  const n = list.length;
  let maxV = 0, maxI = 0;
  for (const g of crowns) { maxV += g.attributes.position.count; maxI += g.index.count; }
  const crownMat = new THREE.MeshStandardMaterial({ map: foliageTexture(renderer), vertexColors: true, roughness: 0.9 });
  const crownMesh = new THREE.BatchedMesh(n, maxV, maxI, crownMat);
  const crownIds = crowns.map(g => crownMesh.addGeometry(g));
  const inst = [];   // [id instancji, x, z, id geometrii blisko, id geometrii daleko]
  const trunkMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 });
  const trunkMesh = new THREE.BatchedMesh(n, trunkGeo.attributes.position.count, trunkGeo.index.count, trunkMat);
  const trunkId = trunkMesh.addGeometry(trunkGeo);

  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);
  const c = new THREE.Color();
  const hash = x => { const y = Math.sin(x * 127.1 + 311.7) * 43758.5453; return y - Math.floor(y); };
  for (const i of list) {
    const x = points[i], z = points[i + 1], t = points[i + 2] | 0;
    const L = LOOK[t] || LOOK[0];
    const h1 = hash(x * 0.73 + z * 1.31), h2 = hash(x * 1.7 - z * 0.37), h3 = hash(x * 0.11 + z * 2.9);
    const size = 0.75 + h1 * 0.6;                           // mlode i stare drzewa
    const R = L.r * size;
    const trunkH = L.trunk * (0.8 + h2 * 0.5) * (0.7 + size * 0.4);
    const sy = t === 1 || t === 3 ? R * 1.0 : R * (0.9 + h3 * 0.25);
    // pien: do srodka korony (korona go zaslania od gory)
    q.setFromAxisAngle(up, h2 * 6.28);
    s.set(size * (t === 3 ? 0.8 : 1.1), trunkH + sy * 0.6, size * (t === 3 ? 0.8 : 1.1));
    p.set(x, 0, z);
    m.compose(p, q, s);
    const ti = trunkMesh.addInstance(trunkId);
    trunkMesh.setMatrixAt(ti, m);
    if (t === 5) c.setRGB(0.86, 0.85, 0.8, THREE.SRGBColorSpace);
    else c.setRGB(0.33 + h3 * 0.08, 0.27 + h3 * 0.05, 0.21, THREE.SRGBColorSpace);
    trunkMesh.setColorAt(ti, c);
    // korona
    const yC = trunkH + sy * (t === 1 ? 1.6 : 0.95);
    p.set(x, yC, z);
    s.set(R, sy, R * (0.9 + h1 * 0.2));
    m.compose(p, q, s);
    const gi = t * VARIANTS + (h3 < 0.5 ? 0 : 1);
    const ci = crownMesh.addInstance(crownIds[nCrown + gi]);
    inst.push(ci, x, z, crownIds[gi], crownIds[nCrown + gi]);
    crownMesh.setMatrixAt(ci, m);
    c.setHSL(L.h + (h1 - 0.5) * 0.04, L.s + (h2 - 0.5) * 0.12, L.l + (h3 - 0.5) * 0.08);
    crownMesh.setColorAt(ci, c);
  }
  for (const b of [crownMesh, trunkMesh]) {
    b.castShadow = b.receiveShadow = true;
    scene.add(b);
  }
  const culler = new CellCuller(DRAW.trees);
  for (let k = 0; k < inst.length; k += 5) {
    culler.add(crownMesh, inst[k], inst[k + 1], inst[k + 2], 14);
    culler.add(trunkMesh, inst[k], inst[k + 1], inst[k + 2], 14);
  }
  culler.finish();
  const near = new Uint8Array(inst.length / 5);
  let last = null;
  return {
    count: n,
    // widocznosc po komorkach + zamiana geometrii koron wg odleglosci od kamery (gdy kamera przesunela sie o > 15 m)
    update(camera, dt = 1) {
      culler.update(camera, dt);
      const camPos = camera.position;
      if (last && Math.hypot(camPos.x - last.x, camPos.z - last.z) < 15) return;
      last = { x: camPos.x, z: camPos.z };
      const r2 = LOD_NEAR * LOD_NEAR;
      for (let k = 0, j = 0; k < inst.length; k += 5, j++) {
        const dx = inst[k + 1] - camPos.x, dz = inst[k + 2] - camPos.z;
        const want = dx * dx + dz * dz < r2 ? 1 : 0;
        if (want !== near[j]) {
          near[j] = want;
          crownMesh.setGeometryIdAt(inst[k], want ? inst[k + 3] : inst[k + 4]);
        }
      }
    },
  };
}
