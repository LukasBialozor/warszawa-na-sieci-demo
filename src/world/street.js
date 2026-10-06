// Meble uliczne: latarnie (z OSM + dostawione wzdluz ulic) i sygnalizatory (slupy z komorami swiatel).
// Dane z city.json: lamps / signals = [x, z, kat, ...] (kat = kierunek do jezdni, atan2(dz, dx)).
// BatchedMesh z odrzucaniem poza kadrem i zasiegiem po komorkach (cull.js), jak drzewa.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { NIGHT } from './night.js';
import { CellCuller } from './cull.js';
import { DRAW } from '../config.js';

// glow: sila swiecenia noca (oprawa latarni, swiatla sygnalizatora)
function colored(geo, hex, glow = 0) {
  const c = new THREE.Color(hex);
  const n = geo.attributes.position.count;
  const col = new Float32Array(n * 3), gl = new Float32Array(n).fill(glow);
  for (let i = 0; i < n; i++) { col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setAttribute('glow', new THREE.BufferAttribute(gl, 1));
  if (geo.index) geo = geo.toNonIndexed();
  geo.deleteAttribute('uv');
  return geo;
}

// latarnia: slup 8.5 m, wysiegnik 1.7 m w strone +x, oprawa na koncu
function lampGeometry() {
  const pole = colored(new THREE.CylinderGeometry(0.07, 0.11, 8.6, 6, 1, true).translate(0, 4.3, 0), 0x4b514c);
  const base = colored(new THREE.CylinderGeometry(0.16, 0.18, 0.9, 6, 1, true).translate(0, 0.45, 0), 0x3f4440);
  const arm = colored(new THREE.CylinderGeometry(0.045, 0.045, 1.8, 4, 1, true).rotateZ(Math.PI / 2).rotateZ(-0.12).translate(0.85, 8.55, 0), 0x4b514c);
  const head = colored(new THREE.BoxGeometry(0.75, 0.16, 0.32).translate(1.75, 8.62, 0), 0x6a706b);
  const lens = colored(new THREE.BoxGeometry(0.6, 0.02, 0.24).translate(1.75, 8.53, 0), 0xffd9a0, 6);
  return mergeGeometries([pole, base, arm, head, lens]);
}

// sygnalizator: slup 3.6 m, komora z trzema swiatlami zwrocona w strone jezdni (+x)
function signalGeometry() {
  const pole = colored(new THREE.CylinderGeometry(0.06, 0.07, 3.6, 6, 1, true).translate(0, 1.8, 0), 0x2f3336);
  const box = colored(new THREE.BoxGeometry(0.28, 0.95, 0.34).translate(0.18, 3.0, 0), 0x1c1e20);
  const parts = [pole, box];
  [[0xc0342a, 3.3], [0xd9a52a, 3.0], [0x3aa655, 2.7]].forEach(([c, y]) => {
    parts.push(colored(new THREE.CylinderGeometry(0.09, 0.09, 0.03, 10).rotateZ(Math.PI / 2).translate(0.335, y, 0), c, 2.5));
    parts.push(colored(new THREE.CylinderGeometry(0.09, 0.09, 0.03, 10).rotateZ(Math.PI / 2).translate(0.025, y, 0), c, 2.5));
  });
  return mergeGeometries(parts);
}

function batch(scene, geo, points, isBlocked, material, culler) {
  const list = [];
  for (let i = 0; i < points.length; i += 3) if (!isBlocked(points[i], points[i + 1])) list.push(i);
  const mesh = new THREE.BatchedMesh(list.length, geo.attributes.position.count, 0, material);
  const id = mesh.addGeometry(geo);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3(1, 1, 1);
  const up = new THREE.Vector3(0, 1, 0);
  for (const i of list) {
    p.set(points[i], 0, points[i + 1]);
    q.setFromAxisAngle(up, -points[i + 2]);   // +x modelu -> kierunek (cos a, sin a) w ukladzie x/z gry
    m.compose(p, q, s);
    const k = mesh.addInstance(id);
    mesh.setMatrixAt(k, m);
    culler.add(mesh, k, points[i], points[i + 1], 9);
  }
  mesh.castShadow = mesh.receiveShadow = true;
  scene.add(mesh);
  return list.length;
}

// plama swiatla pod latarnia (rysowana addytywnie na ziemi, tylko noca)
function poolTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, 'rgba(255,214,150,1)');
  grad.addColorStop(0.3, 'rgba(255,196,128,0.6)');
  grad.addColorStop(0.65, 'rgba(255,180,110,0.18)');
  grad.addColorStop(1, 'rgba(255,170,90,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}

export function buildStreetFurniture(scene, data, isBlocked) {
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.4 });
  mat.onBeforeCompile = sh => {
    sh.uniforms.uNight = NIGHT;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
attribute float glow;
varying float vGlow;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
vGlow = glow;`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
uniform float uNight;
varying float vGlow;`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
totalEmissiveRadiance += vColor.rgb * vGlow * uNight;`);
  };
  mat.customProgramCacheKey = () => 'street';
  const culler = new CellCuller(DRAW.street);
  const lamps = data.lamps ? batch(scene, lampGeometry(), data.lamps, isBlocked, mat, culler) : 0;
  const signals = data.signals ? batch(scene, signalGeometry(), data.signals, isBlocked, mat, culler) : 0;
  culler.finish();

  // plamy swiatla: kwadrat 14 m pod oprawa (1.75 m od slupa w strone jezdni)
  let pools = null, poolXZ = null, poolAt = null, poolTimer = 0;
  const pm = new THREE.Matrix4();
  if (data.lamps) {
    const L = data.lamps;
    const n = L.length / 3;
    const geo = new THREE.PlaneGeometry(20, 20).rotateX(-Math.PI / 2);
    const pmat = new THREE.MeshBasicMaterial({
      map: poolTexture(), transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, fog: true,
    });
    pools = new THREE.InstancedMesh(geo, pmat, n);
    poolXZ = new Float32Array(n * 2);
    for (let i = 0; i < n; i++) {
      const a = L[i * 3 + 2];
      poolXZ[i * 2] = L[i * 3] + Math.cos(a) * 1.75;
      poolXZ[i * 2 + 1] = L[i * 3 + 1] + Math.sin(a) * 1.75;
    }
    pools.count = 0;
    pools.renderOrder = 5;
    pools.visible = false;
    pools.frustumCulled = false;
    scene.add(pools);
  }
  return {
    lamps, signals,
    update(camera, dt = 1) {
      culler.update(camera, dt);
      if (!pools) return;
      pools.visible = NIGHT.value > 0.02;
      pools.material.opacity = NIGHT.value * 0.8;
      // plamy swiatla tylko w zasiegu: co 0.5 s (albo po przeskoku kamery) najblizsze trafiaja na poczatek bufora
      poolTimer -= dt;
      const p = camera.position;
      if (!pools.visible || (poolTimer > 0 && poolAt && Math.hypot(p.x - poolAt.x, p.z - poolAt.z) < 40)) return;
      poolTimer = 0.5;
      poolAt = { x: p.x, z: p.z };
      const R2 = (DRAW.street + 40) ** 2;
      let k = 0;
      for (let i = 0; i < poolXZ.length; i += 2) {
        const dx = poolXZ[i] - p.x, dz = poolXZ[i + 1] - p.z;
        if (dx * dx + dz * dz > R2) continue;
        pm.makeTranslation(poolXZ[i], 0.02, poolXZ[i + 1]);
        pools.setMatrixAt(k++, pm);
      }
      pools.count = k;
      pools.instanceMatrix.needsUpdate = true;
    },
  };
}
