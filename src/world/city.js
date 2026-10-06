// Budowanie miasta z public/data/city.json: budynki (w kawalkach 400 m dla cullingu), ulice, tereny, drzewa,
// dane kolizji (graniastoslupy) i BVH do szybkich raycastow (celowanie siecia, kamera).
import * as THREE from 'three';
import { MeshBVH } from 'three-mesh-bvh';
import { CollisionWorld } from './collision.js';
import { makeRoof } from './roofs.js';
import { facadeStyles, glassTexture, noiseTexture, asphaltTexture, FACADE_CELLS, GLASS_CELLS } from './textures.js';
import { loadLandmarks, inRing, heightfield } from './landmarks.js';
import { buildTrees } from './trees.js';
import { buildMarkings } from './markings.js';
import { buildStreetFurniture } from './street.js';
import { NIGHT } from './night.js';
import { fetchBinary } from '../binary.js';
import { CITY_RANGE } from '../config.js';

const CHUNK = 400;
const FLOOR_H = 3.3;   // wysokosc pietra na teksturze fasady
const WIN_W = 3.6;     // szerokosc "okna" na teksturze fasady
const KIND_GLASS = 3;
const KIND_PLAIN = 6;

const _c = new THREE.Color();
const hash = (n) => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };

class GeoBuffer {
  constructor() { this.pos = []; this.nor = []; this.uv = []; this.col = []; this.pid = []; this.sty = []; this.style = 0; }
  get count() { return this.pos.length / 3; }
  vert(x, y, z, nx, ny, nz, u, v, r, g, b, pid) {
    this.pos.push(x, y, z); this.nor.push(nx, ny, nz); this.uv.push(u, v); this.col.push(r, g, b); this.pid.push(pid);
    this.sty.push(this.style);
  }
}

// Styl fasady (warstwa tablicy tekstur, patrz FACADE_STYLES), gdy dane nie podaja: wg rodzaju budynku
// (0 mieszkalny, 1 blok, 2 biurowy, 3 szklany, 4 zabytkowy, 5 gospodarczy, 6 plain)
const DEFAULT_STYLE = [0, 1, 2, 7, 3, 5, 7];

// Shader fasad: tablica tekstur ze stylami; najnizsza kondygnacja bierze rzad parteru (witryny, bramy),
// wyzsze pietra cyklicznie rzedy 1-3. textureGrad z pochodnych ciaglego UV - bez szwow mipmap na granicach kafli.
function facadeMaterial(styles) {
  const dummy = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
  dummy.needsUpdate = true;
  const mat = new THREE.MeshStandardMaterial({ map: dummy, vertexColors: true, roughness: 0.88 });
  mat.onBeforeCompile = shader => {
    shader.uniforms.facadeStyles = { value: styles };
    shader.uniforms.uNight = NIGHT;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
        attribute float style;
        varying float vStyle;
        varying float vWorldY;`)
      .replace('#include <uv_vertex>', `#include <uv_vertex>
        vStyle = style;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vWorldY = (modelMatrix * vec4(transformed, 1.0)).y;`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform highp sampler2DArray facadeStyles;
        uniform float uNight;
        varying float vStyle;
        varying float vWorldY;
        // hash bez sin(): stabilny dla duzych argumentow (numer okna wzdluz obwodu budynku)
        float hash21(vec2 p) { vec3 q = fract(p.xyx * 0.1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }`)
      .replace('#include <map_fragment>', `
        float flr = vMapUv.y * ${FACADE_CELLS}.0;
        float fi = floor(flr);
        float row = fi < 0.5 ? 0.0 : 1.0 + mod(fi - 1.0, ${FACADE_CELLS - 1}.0);
        vec2 fuv = vec2(fract(vMapUv.x), (row + fract(flr)) / ${FACADE_CELLS}.0);
        float layer = floor(vStyle + 0.5);
        vec4 fac = textureGrad(facadeStyles, vec3(fuv, layer), dFdx(vMapUv), dFdy(vMapUv));
        diffuseColor.rgb *= fac.rgb;
        // noca czesc okien swieci: maska szyb w kanale alfa, los na okno (przeslo x pietro). Styl zaokraglony -
        // interpolowany atrybut drga o ulamki i hash dawal "sniezenie" w oknach.
        vec2 cell = vec2(floor(vMapUv.x * 4.0), fi);
        float h1 = hash21(cell + layer * 17.0), h2 = hash21(cell.yx + 91.0);
        float lit = step(h1, fi < 0.5 ? 0.6 : 0.24);
        vec3 tint = mix(vec3(1.0, 0.72, 0.42), vec3(0.85, 0.9, 1.0), step(0.78, h2)) * (0.65 + 0.45 * fract(h2 * 7.0));
        vec3 windowGlow = fac.a * lit * uNight * tint * (0.85 + 0.3 * fract(flr));
        // z daleka okno ma mniej niz kilka pikseli - zamiast migoczacego szumu srednia poswiata pietra
        float cellPx = max(fwidth(vMapUv.x * 4.0), fwidth(flr));
        windowGlow = mix(windowGlow, uNight * vec3(1.0, 0.8, 0.55) * 0.075, smoothstep(0.18, 0.55, cellPx));
        // dolne kondygnacje oswietlone przez latarnie i witryny (cieple swiatlo od ulicy)
        float streetLight = uNight * 0.5 * (1.0 - smoothstep(1.5, 16.0, vWorldY));`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        totalEmissiveRadiance += windowGlow * 1.1 + diffuseColor.rgb * vec3(1.0, 0.8, 0.55) * streetLight;`);
  };
  mat.customProgramCacheKey = () => 'facadeStyles';
  return mat;
}

function toGeometry(groups) {
  // groups: [GeoBuffer,...] -> jedna geometria z grupami materialow
  const total = groups.reduce((s, g) => s + g.count, 0);
  const pos = new Float32Array(total * 3), nor = new Float32Array(total * 3), uv = new Float32Array(total * 2), col = new Float32Array(total * 3);
  const geo = new THREE.BufferGeometry();
  let off = 0;
  groups.forEach((g, i) => {
    pos.set(g.pos, off * 3); nor.set(g.nor, off * 3); uv.set(g.uv, off * 2); col.set(g.col, off * 3);
    if (g.count) geo.addGroup(off, g.count, i);
    off += g.count;
  });
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const sty = new Uint8Array(total);
  off = 0;
  for (const g of groups) { sty.set(g.sty, off); off += g.count; }
  geo.setAttribute('style', new THREE.BufferAttribute(sty, 1));
  geo.computeBoundingSphere();
  geo.computeBoundingBox();
  return geo;
}

function ringArray(flat) { return Float32Array.from(flat); }

export class City {
  constructor(data, renderer, scene, lod2 = null, landmarks = []) {
    this.data = data;
    this.lod2 = lod2;
    this.replaced = new Set(lod2 ? lod2.index.replaced : []);
    // modele landmarkow z Blendera: budynki OSM/LOD2 w ich obszarze sa pomijane
    this.landmarks = landmarks;
    this.exclude = landmarks.flatMap(l => l.def.exclude || []);
    this.reflectiveMaterials = [];
    this.bounds = data.bounds;
    this.scene = scene;
    this.renderer = renderer;
    this.collision = new CollisionWorld();
    this.group = new THREE.Group();
    scene.add(this.group);

    this.textures = {
      facade: facadeStyles(renderer),
      glass: glassTexture(renderer),
      roof: noiseTexture(renderer, { base: 215, amp: 50, seed: 9 }),
      ground: noiseTexture(renderer, { base: 205, amp: 36, seed: 21, size: 512 }),
      asphalt: asphaltTexture(renderer),
    };
    this.materials = {
      facade: facadeMaterial(this.textures.facade),
      glass: new THREE.MeshStandardMaterial({ map: this.textures.glass, vertexColors: true, roughness: 0.2, metalness: 0.4 }),
      roof: new THREE.MeshStandardMaterial({ map: this.textures.roof, vertexColors: true, roughness: 0.95 }),
      plain: new THREE.MeshStandardMaterial({ map: this.textures.roof, vertexColors: true, roughness: 0.8 }),
    };

    // szklane wiezowce noca: czesc tafli (pietro x tafla) oswietlona
    this.materials.glass.onBeforeCompile = shader => {
      shader.uniforms.uNight = NIGHT;
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>
          uniform float uNight;
          float hash21(vec2 p) { vec3 q = fract(p.xyx * 0.1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }`)
        .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
          vec2 paneUv = vMapUv * vec2(${GLASS_CELLS * 2}.0, ${GLASS_CELLS}.0);
          vec2 pane = floor(paneUv);
          float h = hash21(pane);
          vec3 glow = step(h, 0.14) * mix(vec3(1.0, 0.82, 0.6), vec3(0.8, 0.88, 1.0), step(0.07, h)) * 0.3;
          float panePx = max(fwidth(paneUv.x), fwidth(paneUv.y));
          glow = mix(glow, vec3(0.9, 0.88, 0.85) * 0.045, smoothstep(0.2, 0.6, panePx));
          totalEmissiveRadiance += glow * uNight;`);
    };
    this.buildBuildings();
    this.buildGround();
    this.buildAreas();
    this.buildRoads();
    this.markings = buildMarkings(scene, data);
    this.buildTrees();
    this.furniture = buildStreetFurniture(scene, data, (x, z) => this.collision.groundHeight(x, z) > 0);
  }

  // ---------------- budynki ----------------
  buildBuildings() {
    const chunks = new Map();
    const bvhPos = [];
    const bvhPid = [];
    const getChunk = (x, z) => {
      const k = Math.floor(x / CHUNK) + ',' + Math.floor(z / CHUNK);
      let c = chunks.get(k);
      if (!c) chunks.set(k, (c = [new GeoBuffer(), new GeoBuffer(), new GeoBuffer(), new GeoBuffer()]));
      return c;
    };

    const buildings = this.data.buildings;
    for (let bi = 0; bi < buildings.length; bi++) {
      if (this.replaced.has(bi)) continue; // zastapiony dokladniejszym modelem LOD2
      const b = buildings[bi];
      let cx = 0, cz = 0;
      for (let i = 0; i < b.o.length; i += 2) { cx += b.o[i]; cz += b.o[i + 1]; }
      cx /= b.o.length / 2; cz /= b.o.length / 2;
      if (this.excluded(cx, cz)) continue; // zastapiony modelem landmarku
      const base = b.b || 0, top = b.t;
      const rings = [ringArray(b.o), ...(b.h || []).map(ringArray)];
      const prism = this.collision.add(rings, base, top, { index: bi, name: b.n });
      const pid = prism.index;
      const roof = makeRoof(b);
      if (roof) {
        prism.topAt = roof.topAt;
        prism.eave = roof.wallTop;
      }
      const wallTopAt = roof ? roof.wallTopAt : () => top;

      const [walls, glassWalls, roofs, plainWalls] = getChunk(cx, cz);
      const glass = b.k === KIND_GLASS;
      const wb = glass ? glassWalls : b.k === KIND_PLAIN ? plainWalls : walls;
      walls.style = b.s ?? DEFAULT_STYLE[b.k] ?? 7;
      const rb = b.rg ? glassWalls : roofs;   // szklany dach (np. kopuly Zlotych Tarasow) - material szkla
      const cells = glass ? GLASS_CELLS : FACADE_CELLS;
      const floorH = glass ? 3.8 : FLOOR_H;

      _c.setHex(b.c);
      const wr = _c.r, wg = _c.g, wbl = _c.b;
      // przesuniecie wzoru wzdluz obwodu (cale kafle - inny uklad zapalonych okien w kazdym budynku)
      const uOff = hash(bi) * 4 + Math.floor(hash(bi + 0.25) * 64) * WIN_W * cells;
      // lekkie przyciemnienie przy ziemi (przyblizenie okluzji otoczenia)
      const lo = base < 0.5 ? 0.72 : 1;

      for (const r of rings) {
        const n = r.length / 2;
        let s = uOff;
        for (let i = 0; i < n; i++) {
          const j = (i + 1) % n;
          const ax0 = r[2 * i], az0 = r[2 * i + 1], bx0 = r[2 * j], bz0 = r[2 * j + 1];
          const dx = bx0 - ax0, dz = bz0 - az0;
          const len = Math.hypot(dx, dz);
          if (len < 0.01) continue;
          const ta = wallTopAt(ax0, az0), tb = wallTopAt(bx0, bz0);
          const u0 = s / WIN_W / cells, u1 = (s + len) / WIN_W / cells;
          s += len;
          if (ta - base < 0.01 && tb - base < 0.01) continue; // sam dach (np. kopula bez scian)
          const nx = dz / len, nz = -dx / len;
          const v0 = base / floorH / cells, va = ta / floorH / cells, vb = tb / floorH / cells;
          // Sciany pokrywajace sie z inna bryla (czesci OSM, bryla LOD2) migotalyby - kazdy budynek OSM odsuwamy
          // o staly, wlasny ulamek centymetrow na zewnatrz, wiec jedna ze scian zawsze wygrywa test glebi.
          const push = 0.03 + hash(bi + 0.5) * 0.06;
          const ax = ax0 + nx * push, az = az0 + nz * push, bx = bx0 + nx * push, bz = bz0 + nz * push;
          // dwa trojkaty zwrocone na zewnatrz: (a_dol, b_gora, b_dol), (a_dol, a_gora, b_gora)
          wb.vert(ax, base, az, nx, 0, nz, u0, v0, wr * lo, wg * lo, wbl * lo, pid);
          wb.vert(bx, tb, bz, nx, 0, nz, u1, vb, wr, wg, wbl, pid);
          wb.vert(bx, base, bz, nx, 0, nz, u1, v0, wr * lo, wg * lo, wbl * lo, pid);
          wb.vert(ax, base, az, nx, 0, nz, u0, v0, wr * lo, wg * lo, wbl * lo, pid);
          wb.vert(ax, ta, az, nx, 0, nz, u0, va, wr, wg, wbl, pid);
          wb.vert(bx, tb, bz, nx, 0, nz, u1, vb, wr, wg, wbl, pid);
          bvhPos.push(ax, base, az, bx, tb, bz, bx, base, bz, ax, base, az, ax, ta, az, bx, tb, bz);
          bvhPid.push(pid, pid, pid, pid, pid, pid);
        }
      }

      _c.setHex(b.r);
      const rr = _c.r, rg = _c.g, rbl = _c.b;
      if (roof && roof.tris) {
        // kopula / piramida / dwuspadowy
        for (const t of roof.tris) {
          const gable = t.kind === 'gable';
          const target = gable ? wb : rb;
          for (let k = 0; k < 3; k++) {
            const [x, y, z] = t.p[k], [nx, ny, nz] = t.n[k];
            if (gable) target.vert(x, y, z, nx, ny, nz, (x + z) / WIN_W / cells, y / floorH / cells, wr, wg, wbl, pid);
            else target.vert(x, y, z, nx, ny, nz, x / 12, z / 12, rr, rg, rbl, pid);
          }
          bvhPos.push(...t.p[0], ...t.p[1], ...t.p[2]);
          bvhPid.push(pid, pid, pid);
        }
      }

      // dach plaski lub jednospadowy (triangulacja obrysu) i spod, jesli bryla wisi nad ziemia
      const contour = [];
      for (let i = 0; i < b.o.length; i += 2) contour.push(new THREE.Vector2(b.o[i], b.o[i + 1]));
      const holes = (b.h || []).map(h => { const a = []; for (let i = 0; i < h.length; i += 2) a.push(new THREE.Vector2(h[i], h[i + 1])); return a; });
      let tris;
      try { tris = THREE.ShapeUtils.triangulateShape(contour, holes); } catch { tris = []; }
      const all = contour.concat(...holes);
      const flatTop = !roof || !roof.tris;
      const pn = roof && roof.planeNormal ? roof.planeNormal : [0, 1, 0];
      for (const [ia, ib, ic] of tris) {
        let A = all[ia], B = all[ib], C = all[ic];
        // normalna w gore: (Bz-Az)(Cx-Ax) - (Bx-Ax)(Cz-Az) > 0
        if ((B.y - A.y) * (C.x - A.x) - (B.x - A.x) * (C.y - A.y) < 0) { const t = B; B = C; C = t; }
        if (flatTop) {
          const ya = wallTopAt(A.x, A.y), yb = wallTopAt(B.x, B.y), yc = wallTopAt(C.x, C.y);
          rb.vert(A.x, ya, A.y, pn[0], pn[1], pn[2], A.x / 12, A.y / 12, rr, rg, rbl, pid);
          rb.vert(B.x, yb, B.y, pn[0], pn[1], pn[2], B.x / 12, B.y / 12, rr, rg, rbl, pid);
          rb.vert(C.x, yc, C.y, pn[0], pn[1], pn[2], C.x / 12, C.y / 12, rr, rg, rbl, pid);
          bvhPos.push(A.x, ya, A.y, B.x, yb, B.y, C.x, yc, C.y);
          bvhPid.push(pid, pid, pid);
        }
        if (base > 0.5) {
          for (const P of [A, C, B]) roofs.vert(P.x, base, P.y, 0, -1, 0, P.x / 12, P.y / 12, rr * 0.5, rg * 0.5, rbl * 0.5, pid);
          bvhPos.push(A.x, base, A.y, C.x, base, C.y, B.x, base, B.y);
          bvhPid.push(pid, pid, pid);
        }
      }
    }

    if (this.lod2) this.buildLod2(getChunk, bvhPos, bvhPid);
    this.buildLandmarks(bvhPos, bvhPid);

    const mats = [this.materials.facade, this.materials.glass, this.materials.roof, this.materials.plain];
    this.chunkMeshes = [];
    for (const groups of chunks.values()) {
      const mesh = new THREE.Mesh(toGeometry(groups), mats);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.matrixAutoUpdate = false;
      this.group.add(mesh);
      this.chunkMeshes.push(mesh);
    }

    // BVH do raycastow
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(bvhPos), 3));
    geo.setAttribute('pid', new THREE.BufferAttribute(new Float32Array(bvhPid), 1));
    this.bvhGeometry = geo;
    this.bvh = new MeshBVH(geo, { targetLeafSize: 8 });
    this.chunkCount = chunks.size;
  }

  // ---------------- budynki LOD2 (GUGiK, centrum) ----------------
  buildLod2(getChunk, bvhPos, bvhPid) {
    const { index, bin } = this.lod2;
    const nv = index.vertices;
    // format 2: Int16 w cm wzgledem poczatku budynku (b.p); UV scian liczone z normalnej trojkata
    const q = new Int16Array(bin, 0, nv * 3);
    const pos = new Float32Array(nv * 3);
    for (const b of index.buildings) {
      const [ox, oz] = b.p;
      for (let v = b.w[0], e = b.r[0] + b.r[1]; v < e; v++) {
        pos[v * 3] = q[v * 3] / 100 + ox;
        pos[v * 3 + 1] = q[v * 3 + 1] / 100;
        pos[v * 3 + 2] = q[v * 3 + 2] / 100 + oz;
      }
    }
    const A = new THREE.Vector3(), B = new THREE.Vector3(), C = new THREE.Vector3(), N = new THREE.Vector3();
    for (const b of index.buildings) {
      const outer = b.o[0][0];
      let ox = 0, oz = 0;
      for (let i = 0; i < outer.length; i += 2) { ox += outer[i]; oz += outer[i + 1]; }
      if (this.excluded(ox / (outer.length / 2), oz / (outer.length / 2))) continue;
      // wysokosc dachu w punkcie: trojkaty dachu zawierajace (x,z) w rzucie z gory
      const [rs, rc] = b.r;
      const roof = pos.subarray(rs * 3, (rs + rc) * 3);
      const eave = b.e;
      const topAt = (x, z) => {
        let best = -Infinity;
        for (let i = 0; i < roof.length; i += 9) {
          const ax = roof[i], az = roof[i + 2], bx = roof[i + 3], bz = roof[i + 5], cx = roof[i + 6], cz = roof[i + 8];
          const d = (bz - cz) * (ax - cx) + (cx - bx) * (az - cz);
          if (Math.abs(d) < 1e-9) continue;
          const l1 = ((bz - cz) * (x - cx) + (cx - bx) * (z - cz)) / d;
          const l2 = ((cz - az) * (x - cx) + (ax - cx) * (z - cz)) / d;
          const l3 = 1 - l1 - l2;
          if (l1 < -1e-4 || l2 < -1e-4 || l3 < -1e-4) continue;
          const y = l1 * roof[i + 1] + l2 * roof[i + 4] + l3 * roof[i + 7];
          if (y > best) best = y;
        }
        return best === -Infinity ? eave : best;
      };
      let pid = -1;
      for (const poly of b.o) {
        const prism = this.collision.add(poly.map(r => Float32Array.from(r)), 0, b.t, { lod2: true });
        prism.topAt = topAt;
        prism.eave = eave;
        if (pid < 0) pid = prism.index;
      }
      const [cx, cz] = [b.o[0][0][0], b.o[0][0][1]];
      const [walls, glassWalls, roofs] = getChunk(cx, cz);
      const glass = b.k === KIND_GLASS;
      const wb = glass ? glassWalls : walls;
      walls.style = b.s ?? DEFAULT_STYLE[b.k] ?? 7;
      const cells = glass ? GLASS_CELLS : FACADE_CELLS;
      const floorH = glass ? 3.8 : FLOOR_H;
      _c.setHex(b.c ?? 0xcfc9bd);
      const wr = _c.r, wg = _c.g, wbl = _c.b;
      _c.setHex(b.rc ?? 0x5f5d5a);
      const rr = _c.r, rg = _c.g, rbl = _c.b;
      const emit = (start, count, target, isWall) => {
        for (let v = start; v < start + count; v += 3) {
          A.fromArray(pos, v * 3); B.fromArray(pos, v * 3 + 3); C.fromArray(pos, v * 3 + 6);
          N.subVectors(C, B).cross(A.clone().sub(B)).normalize();
          // u sciany: odleglosc w poziomie wzdluz sciany (styczna pozioma (-nz, nx)), v: wysokosc
          const hl = Math.hypot(N.x, N.z) || 1;
          for (let k = 0; k < 3; k++) {
            const P = k === 0 ? A : k === 1 ? B : C;
            if (isWall) {
              const lo = P.y < 0.5 ? 0.72 : 1;
              const u = (P.z * N.x - P.x * N.z) / hl / WIN_W / cells;
              target.vert(P.x, P.y, P.z, N.x, N.y, N.z, u, P.y / floorH / cells, wr * lo, wg * lo, wbl * lo, pid);
            } else {
              target.vert(P.x, P.y, P.z, N.x, N.y, N.z, P.x / 12, P.z / 12, rr, rg, rbl, pid);
            }
          }
          bvhPos.push(A.x, A.y, A.z, B.x, B.y, B.z, C.x, C.y, C.z);
          bvhPid.push(pid, pid, pid);
        }
      };
      emit(b.w[0], b.w[1], wb, true);
      emit(rs, rc, roofs, false);
    }
    this.lod2Count = index.buildings.length;
  }

  excluded(x, z) {
    for (const r of this.exclude) if (inRing(r, x, z)) return true;
    return false;
  }

  // ---------------- landmarki (modele z Blendera) ----------------
  buildLandmarks(bvhPos, bvhPid) {
    const reflective = new Set();
    const v = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
    for (const lm of this.landmarks) {
      const prisms = (lm.def.prisms || []).map(p => {
        const rings = [Float32Array.from(p.o), ...(p.h || []).map(h => Float32Array.from(h))];
        const prism = this.collision.add(rings, p.b || 0, p.t, { landmark: lm.name, name: p.n });
        if (p.hf) prism.topAt = heightfield(p.hf);
        if (p.e !== undefined) prism.eave = p.e;
        return prism;
      });
      // punkt (x,z) -> graniastoslup landmarku (do identyfikacji trafien raycastu)
      const pidAt = (x, y, z) => {
        let best = null, bestD = Infinity;
        for (const p of this.collision.query(x, z, x, z)) {
          if (p.data?.landmark !== lm.name || !inRing(p.rings[0], x, z)) continue;
          const d = y < p.base ? p.base - y : y > p.top ? y - p.top : 0;
          if (d < bestD) { bestD = d; best = p; }
        }
        if (best) return best.index;
        for (const p of prisms) {
          const d = Math.hypot((p.minX + p.maxX) / 2 - x, (p.minZ + p.maxZ) / 2 - z);
          if (d < bestD) { bestD = d; best = p; }
        }
        return best ? best.index : -1;
      };
      lm.root.updateMatrixWorld(true);
      lm.root.traverse(o => {
        if (!o.isMesh) return;
        o.castShadow = o.receiveShadow = true;
        for (const m of [].concat(o.material)) if (/glass|szklo/i.test(m.name)) reflective.add(m);
        // flaga z Blendera siedzi na wezle; siatka z kilkoma materialami to grupa z dziecmi
        if (o.userData.noCollide || o.parent?.userData.noCollide) return;
        const P = o.geometry.attributes.position, I = o.geometry.index;
        const n = I ? I.count : P.count;
        for (let i = 0; i + 2 < n; i += 3) {
          for (let k = 0; k < 3; k++) v[k].fromBufferAttribute(P, I ? I.getX(i + k) : i + k).applyMatrix4(o.matrixWorld);
          const pid = pidAt((v[0].x + v[1].x + v[2].x) / 3, (v[0].y + v[1].y + v[2].y) / 3, (v[0].z + v[1].z + v[2].z) / 3);
          if (pid < 0) continue;
          bvhPos.push(v[0].x, v[0].y, v[0].z, v[1].x, v[1].y, v[1].z, v[2].x, v[2].y, v[2].z);
          bvhPid.push(pid, pid, pid);
        }
      });
      this.scene.add(lm.root);
    }
    this.reflectiveMaterials = [...reflective];
  }

  // ---------------- podloze ----------------
  buildGround() {
    const size = 16000;
    const geo = new THREE.PlaneGeometry(size, size);
    geo.rotateX(-Math.PI / 2);
    const uv = geo.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * size / 10, uv.getY(i) * size / 10);
    // Ziemia i dekale (tereny, woda, ulice) nie zapisuja glebi: ziemia rysuje sie przed wszystkim (zaraz po niebie),
    // dekale po budynkach, w ustalonej kolejnosci. Zadnego polygonOffset = zadnego migotania (z-fighting) z dala.
    const mat = new THREE.MeshStandardMaterial({ color: 0x7a7771, map: this.textures.ground, roughness: 0.95, depthWrite: false });
    const ground = new THREE.Mesh(geo, mat);
    ground.receiveShadow = true;
    ground.renderOrder = -1;
    this.scene.add(ground);
    this.ground = ground;
  }

  // ---------------- tereny: parki, woda, place ----------------
  buildAreas() {
    const COLORS = { grass: 0x6f8f4c, wood: 0x52703b, sand: 0xd6c8a0, pitch: 0x5d8d48, plaza: 0xb4ada2 };
    const land = { pos: [], col: [] }, water = { pos: [] };
    for (const a of this.data.areas) {
      const contour = [];
      for (let i = 0; i < a.o.length; i += 2) contour.push(new THREE.Vector2(a.o[i], a.o[i + 1]));
      const holes = (a.h || []).map(h => { const r = []; for (let i = 0; i < h.length; i += 2) r.push(new THREE.Vector2(h[i], h[i + 1])); return r; });
      let tris;
      try { tris = THREE.ShapeUtils.triangulateShape(contour, holes); } catch { continue; }
      const all = contour.concat(...holes);
      const target = a.k === 'water' ? water : land;
      if (a.k !== 'water') _c.setHex(COLORS[a.k]);
      for (const [ia, ib, ic] of tris) {
        let A = all[ia], B = all[ib], C = all[ic];
        if ((B.y - A.y) * (C.x - A.x) - (B.x - A.x) * (C.y - A.y) < 0) { const t = B; B = C; C = t; }
        for (const P of [A, B, C]) {
          target.pos.push(P.x, 0, P.y);
          if (target === land) target.col.push(_c.r, _c.g, _c.b);
        }
      }
    }
    const decal = (pos, col, mat, order) => {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
      if (col) geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(col), 3));
      const n = new Float32Array(pos.length);
      for (let i = 1; i < n.length; i += 3) n[i] = 1;
      geo.setAttribute('normal', new THREE.BufferAttribute(n, 3));
      const uv = new Float32Array(pos.length / 3 * 2);
      for (let i = 0, j = 0; i < pos.length; i += 3, j += 2) { uv[j] = pos[i] / 6; uv[j + 1] = pos[i + 2] / 6; }
      geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
      mat.depthWrite = false;
      const mesh = new THREE.Mesh(geo, mat);
      mesh.receiveShadow = true;
      mesh.renderOrder = order;
      mesh.matrixAutoUpdate = false;
      this.scene.add(mesh);
      return mesh;
    };
    decal(land.pos, land.col, new THREE.MeshStandardMaterial({ vertexColors: true, map: this.textures.ground, roughness: 1 }), 1);
    this.materials.water = new THREE.MeshStandardMaterial({ color: 0x3a5664, roughness: 0.06, metalness: 0.6 });
    decal(water.pos, null, this.materials.water, 2);
  }

  // ---------------- ulice, chodniki, tory ----------------
  buildRoads() {
    // rodzaje: 0 jezdnia, 1 chodnik, 2 droga rowerowa (warszawski czerwony asfalt), 3 kolej, 4 tramwaj
    const COLORS = [0x4a4c50, 0xa7a298, 0x8b5b50, 0x5f554d, 0x55534f];
    const ORDER = [3, 1, 2, 0, 4];
    const roads = this.data.roads.slice().sort((a, b) => ORDER.indexOf(a.k) - ORDER.indexOf(b.k));
    const pos = [], col = [];
    for (const r of roads) {
      _c.setHex(COLORS[r.k]);
      const p = r.p, n = p.length / 2, hw = r.w / 2;
      // przesuniecia boczne w kazdym wierzcholku (miter z ograniczeniem)
      const off = [];
      for (let i = 0; i < n; i++) {
        let nx = 0, nz = 0;
        for (const [a, b] of [[i - 1, i], [i, i + 1]]) {
          if (a < 0 || b >= n) continue;
          const dx = p[2 * b] - p[2 * a], dz = p[2 * b + 1] - p[2 * a + 1];
          const l = Math.hypot(dx, dz) || 1;
          nx += -dz / l; nz += dx / l;
        }
        const l = Math.hypot(nx, nz) || 1;
        nx /= l; nz /= l;
        // skala miter: 1/cos(polowa kata), ograniczona
        let scale = 1;
        if (i > 0 && i < n - 1) {
          const dx = p[2 * i] - p[2 * i - 2], dz = p[2 * i + 1] - p[2 * i - 1];
          const ll = Math.hypot(dx, dz) || 1;
          const dot = (-dz / ll) * nx + (dx / ll) * nz;
          scale = Math.min(2.5, 1 / Math.max(0.4, dot));
        }
        off.push(nx * hw * scale, nz * hw * scale);
      }
      for (let i = 0; i < n - 1; i++) {
        const ax = p[2 * i], az = p[2 * i + 1], bx = p[2 * i + 2], bz = p[2 * i + 3];
        const aLx = ax + off[2 * i], aLz = az + off[2 * i + 1], aRx = ax - off[2 * i], aRz = az - off[2 * i + 1];
        const bLx = bx + off[2 * i + 2], bLz = bz + off[2 * i + 3], bRx = bx - off[2 * i + 2], bRz = bz - off[2 * i + 3];
        // trojkaty zwrocone w gore
        const quad = [[aRx, aRz], [aLx, aLz], [bLx, bLz], [aRx, aRz], [bLx, bLz], [bRx, bRz]];
        for (let t = 0; t < 6; t += 3) {
          let A = quad[t], B = quad[t + 1], C = quad[t + 2];
          if ((B[1] - A[1]) * (C[0] - A[0]) - (B[0] - A[0]) * (C[1] - A[1]) < 0) { const tmp = B; B = C; C = tmp; }
          for (const P of [A, B, C]) { pos.push(P[0], 0, P[1]); col.push(_c.r, _c.g, _c.b); }
        }
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
    geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(col), 3));
    const nrm = new Float32Array(pos.length);
    for (let i = 1; i < nrm.length; i += 3) nrm[i] = 1;
    geo.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
    const uv = new Float32Array(pos.length / 3 * 2);
    for (let i = 0, j = 0; i < pos.length; i += 3, j += 2) { uv[j] = pos[i] / 8; uv[j + 1] = pos[i + 2] / 8; }
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    const mat = new THREE.MeshStandardMaterial({
      vertexColors: true, map: this.textures.asphalt, roughness: 0.92,
      depthWrite: false, emissive: 0x000000, emissiveMap: this.textures.asphalt,
    });
    this.materials.road = mat;
    const mesh = new THREE.Mesh(geo, mat);
    mesh.receiveShadow = true;
    mesh.renderOrder = 3;
    mesh.matrixAutoUpdate = false;
    this.scene.add(mesh);
  }

  // ---------------- drzewa ----------------
  buildTrees() {
    // drzewo "w budynku" (np. zadaszony dziedziniec) pomijamy
    this.trees = buildTrees(this.scene, this.renderer, this.data.trees, (x, z) => this.collision.groundHeight(x, z) > 0);
    this.treeCount = this.trees.count;
  }

  // Zasieg rysowania budynkow (tylko telefony, CITY_RANGE): kawalki 400 m dalej niz zasieg sa ukryte
  update(camera, dt = 1) {
    if (CITY_RANGE === Infinity) return;
    this.rangeTimer = (this.rangeTimer || 0) - dt;
    if (this.rangeTimer > 0) return;
    this.rangeTimer = 0.3;
    const p = camera.position;
    for (const m of this.chunkMeshes) {
      const s = m.geometry.boundingSphere;
      m.visible = Math.hypot(s.center.x - p.x, s.center.z - p.z) - s.radius < CITY_RANGE;
    }
  }

  // ---------------- zapytania ----------------
  // Promien w swiat (budynki + ziemia). Zwraca { point, normal, distance, prism } lub null.
  raycast(origin, dir, far = 200) {
    const ray = this._ray || (this._ray = new THREE.Ray());
    ray.origin.copy(origin);
    ray.direction.copy(dir);
    const hit = this.bvh.raycastFirst(ray, THREE.DoubleSide, 0, far);
    let best = null;
    if (hit) {
      const pid = this.bvhGeometry.attributes.pid.getX(hit.face.a);
      const normal = hit.face.normal.clone();
      if (normal.dot(dir) > 0) normal.negate();
      best = { point: hit.point.clone(), normal, distance: hit.distance, prism: this.collision.prisms[pid] };
    }
    if (dir.y < -1e-4) {
      const t = -origin.y / dir.y;
      if (t > 0 && t < far && (!best || t < best.distance)) {
        best = { point: origin.clone().addScaledVector(dir, t), normal: new THREE.Vector3(0, 1, 0), distance: t, prism: null };
      }
    }
    return best;
  }
}

export async function loadCity(url, renderer, scene, onStatus = () => {}) {
  onStatus('Pobieranie danych miasta...');
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Nie mozna wczytac ${url} (${res.status}). Uruchom: npm run build-city`);
  const data = await res.json();
  // dokladne bryly centrum z GUGiK (opcjonalne - gra dziala tez bez nich)
  let lod2 = null;
  try {
    const [index, bin] = await Promise.all([
      fetch(url.replace('city.json', 'lod2.json')).then(r => (r.ok ? r.json() : null)),
      fetchBinary(url.replace('city.json', 'lod2.bin')).catch(() => null),
    ]);
    if (index && bin) lod2 = { index, bin };
  } catch { /* brak LOD2 */ }
  const landmarks = await loadLandmarks(import.meta.env.BASE_URL + 'models/', onStatus);
  onStatus(`Budowanie ${data.buildings.length} budynkow...`);
  await new Promise(r => setTimeout(r, 30));
  return new City(data, renderer, scene, lod2, landmarks);
}
