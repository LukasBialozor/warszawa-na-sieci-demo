// Odrzucanie egzemplarzy BatchedMesh po komorkach siatki (100 m): kilka razy na sekunde komorki sa sprawdzane wzgledem
// kadru i odleglosci, a widocznosc zmienia sie tylko w komorkach, ktore weszly lub wyszly z widoku. Wbudowane
// perObjectFrustumCulled three.js liczy kazdy egzemplarz w kazdym przebiegu (kamera + cienie) i co klatke wysyla
// teksture posrednia - przy ~100 tys. drzew, latarni i sygnalizatorow kosztowalo to ~12 ms CPU na klatke.
import * as THREE from 'three';

const CELL = 100;
const NEAR = 160;          // [m] komorki tak blisko sa zawsze widoczne (cienie obiektow tuz za kamera)
const INTERVAL = 0.15;     // [s] co ile przeliczac widocznosc
const _frustum = new THREE.Frustum();
const _m = new THREE.Matrix4();
const _sphere = new THREE.Sphere();

export class CellCuller {
  constructor(maxDist) {
    this.maxDist = maxDist;
    this.cells = new Map();
    this.timer = 0;
  }

  // egzemplarz id siatki mesh w punkcie (x, z); h = wysokosc obiektu
  add(mesh, id, x, z, h = 12) {
    const kx = Math.floor(x / CELL), kz = Math.floor(z / CELL);
    const key = kx * 100003 + kz;
    let c = this.cells.get(key);
    if (!c) {
      c = { x: (kx + 0.5) * CELL, z: (kz + 0.5) * CELL, h, meshes: new Map(), visible: true };
      this.cells.set(key, c);
    }
    c.h = Math.max(c.h, h);
    if (!c.meshes.has(mesh)) c.meshes.set(mesh, []);
    c.meshes.get(mesh).push(id);
  }

  finish() {
    for (const c of this.cells.values()) {
      c.radius = Math.hypot(CELL * 0.71, c.h / 2) + 6;
      for (const [mesh, ids] of c.meshes) c.meshes.set(mesh, Int32Array.from(ids));
    }
    for (const mesh of new Set([...this.cells.values()].flatMap(c => [...c.meshes.keys()]))) {
      mesh.perObjectFrustumCulled = false;
      mesh.sortObjects = false;
    }
  }

  update(camera, dt) {
    this.timer -= dt;
    if (this.timer > 0) return;
    this.timer = INTERVAL;
    camera.updateMatrixWorld();
    _m.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    _frustum.setFromProjectionMatrix(_m);
    const px = camera.position.x, pz = camera.position.z;
    for (const c of this.cells.values()) {
      const d = Math.hypot(c.x - px, c.z - pz);
      let vis = d - c.radius < this.maxDist;
      if (vis && d > NEAR) {
        _sphere.center.set(c.x, c.h / 2, c.z);
        _sphere.radius = c.radius;
        vis = _frustum.intersectsSphere(_sphere);
      }
      if (vis === c.visible) continue;
      c.visible = vis;
      for (const [mesh, ids] of c.meshes) for (let i = 0; i < ids.length; i++) mesh.setVisibleAt(ids[i], vis);
    }
  }
}
