// Siec: wybor punktu zaczepienia i wizualizacja liny.
import * as THREE from 'three';
import { Line2 } from 'three/addons/lines/Line2.js';
import { LineGeometry } from 'three/addons/lines/LineGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';

const UP = new THREE.Vector3(0, 1, 0);
const _dir = new THREE.Vector3();
const _d = new THREE.Vector3();
const _o = new THREE.Vector3();

const YAWS = [-60, -40, -22, -8, 8, 22, 40, 60].map(THREE.MathUtils.degToRad);
const ELEVS = [14, 21, 28, 40, 52, 64, 76].map(THREE.MathUtils.degToRad);

// Szuka punktu na budynku z przodu i powyzej gracza, jak w grach o bujaniu na sieci:
// preferuje punkt ~30 m wyzej i ~20 m do przodu, lekko z boku (strona reki, ktora strzela).
export function findAnchor(city, pos, vel, camForward, handSign) {
  const velH = _d.set(vel.x, 0, vel.z);
  const sp = velH.length();
  _dir.set(camForward.x, 0, camForward.z).normalize();
  if (sp > 6) _dir.multiplyScalar(0.6).addScaledVector(velH.divideScalar(sp), 0.4).normalize();

  _o.copy(pos).y += 1.4;
  let best = null, bestScore = -Infinity;
  for (const yaw of YAWS) {
    const cy = Math.cos(yaw), sy = Math.sin(yaw);
    const hx = _dir.x * cy + _dir.z * sy, hz = -_dir.x * sy + _dir.z * cy;
    for (const el of ELEVS) {
      const ce = Math.cos(el);
      const ray = new THREE.Vector3(hx * ce, Math.sin(el), hz * ce);
      const hit = city.raycast(_o, ray, 150);
      if (!hit || !hit.prism) continue;
      const h = hit.point.y - pos.y;
      if (h < 5 || hit.distance < 9) continue;
      const ox = hit.point.x - _o.x, oz = hit.point.z - _o.z;
      const horiz = Math.hypot(ox, oz);
      const fwd = horiz > 0.5 ? (ox * _dir.x + oz * _dir.z) / horiz : 0;
      // strona: + gdy punkt po prawej (patrzac w kierunku ruchu)
      const side = horiz > 0.5 ? (ox * -_dir.z + oz * _dir.x) / horiz : 0;
      let score = -Math.abs(h - 30) / 22 - Math.abs(horiz - 20) / 28 + fwd * 1.3 - Math.abs(yaw) * 0.25;
      if (Math.sign(side) === handSign) score += 0.2;
      if (score > bestScore) { bestScore = score; best = hit; }
    }
  }
  if (!best) return null;
  best.point.addScaledVector(best.normal, 0.05);
  return best;
}

// Lina: linia o stalej grubosci w pikselach (widoczna z kazdej odleglosci), z krotka animacja wystrzalu
export class WebLine {
  constructor(scene) {
    // dwie linie na jednej geometrii: ciemny obrys + jasny rdzen -> widoczna i na niebie, i na bialej fasadzie
    this.geo = new LineGeometry();
    this.geo.setPositions([0, 0, 0, 0, 1, 0]);
    this.outline = new LineMaterial({ color: 0x1c1f24, linewidth: 4.2, worldUnits: false, transparent: true, opacity: 0.55 });
    this.material = new LineMaterial({ color: 0xffffff, linewidth: 2.2, worldUnits: false, transparent: true }); // transparent: rysowana po obrysie (kolejnosc renderOrder)
    this.mesh = new THREE.Group();
    for (const [mat, order] of [[this.outline, 9], [this.material, 10]]) {
      const line = new Line2(this.geo, mat);
      line.frustumCulled = false;
      line.renderOrder = order;
      this.mesh.add(line);
    }
    this.mesh.visible = false;
    scene.add(this.mesh);
    this.t = 0;
    this.from = new THREE.Vector3();
    this.to = new THREE.Vector3();
    this.fade = 0;
  }

  setResolution(w, h) {
    this.material.resolution.set(w, h);
    this.outline.resolution.set(w, h);
  }

  shoot() { this.t = 0; }

  update(dt, active, hand, anchor) {
    if (active) {
      this.t = Math.min(1, this.t + dt / 0.09);
      this.from.copy(hand);
      this.to.copy(anchor);
      this.fade = 0.12;
    } else if (this.fade > 0) {
      // po puszczeniu lina jeszcze chwile "wisi" przy punkcie zaczepienia
      this.fade -= dt;
      this.from.lerp(this.to, Math.min(1, dt * 18));
    }
    const visible = active || this.fade > 0;
    this.mesh.visible = visible;
    if (!visible) return;
    const end = _d.copy(this.from).lerp(this.to, active ? this.t : 1);
    // aktualizacja bufora w miejscu (setPositions tworzy nowe bufory GPU przy kazdym wywolaniu)
    const buf = this.geo.attributes.instanceStart.data;
    const p = buf.array;
    p[0] = this.from.x; p[1] = this.from.y; p[2] = this.from.z;
    p[3] = end.x; p[4] = end.y; p[5] = end.z;
    buf.needsUpdate = true;
  }
}
