// Bohater: model z Blendera (public/models/hero.glb, skrypt blender/hero.py) + proceduralna animacja na kosciach.
// Pozy opisujemy katami w osiach modelu (x = lewo postaci, y = gora, z = przod), jak dla konczyn zwisajacych w dol;
// przeliczenie na lokalne obroty kosci (ktore maja dowolna orientacje spoczynkowa, A-poza) robi setDelta().
import * as THREE from 'three';
import { loadGltf } from '../binary.js';

const UP = new THREE.Vector3(0, 1, 0);
const DOWN = new THREE.Vector3(0, -1, 0);
const HIP_H = 0.95;

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _e = new THREE.Euler();
const _x = new THREE.Vector3();
const _y = new THREE.Vector3();
const _z = new THREE.Vector3();
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();

// Wzor sieci na czerwonych czesciach kostiumu: promienie + wygiete pierscienie, liczone z pozycji spoczynkowej
// wierzcholka (os patrzenia = z). Srodek: miedzy oczami (glowa) albo srodek piersi (reszta ciala).
const WEB_GLSL = /* glsl */`
varying vec3 vRestPos;
float webLine(float d, float w) {
  float aa = fwidth(d) + 1e-5;
  return 1.0 - smoothstep(w - aa, w + aa, d);
}
vec3 applyWeb(vec3 col, vec3 p) {
  if (col.r < col.b * 1.6 || col.r < 0.1) return col;
  vec2 c = p.y > 1.60 ? vec2(0.0, 1.742) : vec2(0.0, 1.33);
  vec2 d = p.xy - c;
  float r = length(d);
  float ang = atan(d.y, d.x);
  float spokes = p.y > 1.60 ? 16.0 : 20.0;
  float dA = abs(sin(ang * spokes * 0.5)) * r * 2.0 / spokes;
  float ring = p.y > 1.60 ? 0.028 : 0.05;
  float sag = 0.18 * ring * abs(sin(ang * spokes * 0.5));
  float dR = abs(sin(3.14159265 * (r + sag) / ring)) * ring / 3.14159265;
  float web = max(webLine(dA, 0.0022), webLine(dR, 0.0022)) * smoothstep(0.012, 0.03, r);
  return mix(col, vec3(0.015), web * 0.8);
}`;

export async function loadHeroModel(url = import.meta.env.BASE_URL + 'models/hero.glb') {
  const gltf = await loadGltf(url);
  return gltf.scene;
}

export class Avatar {
  constructor(scene, model) {
    this.root = new THREE.Group();
    this.body = new THREE.Group();         // obrot calej postaci (pivot w biodrach)
    this.body.position.y = HIP_H;
    model.position.y = -HIP_H;
    this.root.add(this.body);
    this.body.add(model);
    this.model = model;

    const bones = {};
    model.traverse(o => {
      if (o.isBone) bones[o.name] = o;
      if (o.isSkinnedMesh || o.isMesh) {
        o.castShadow = true;
        o.receiveShadow = true;
        o.frustumCulled = false;
        const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, metalness: 0.0 });
        mat.onBeforeCompile = shader => {
          shader.vertexShader = shader.vertexShader
            .replace('#include <common>', '#include <common>\nvarying vec3 vRestPos;')
            .replace('#include <begin_vertex>', '#include <begin_vertex>\nvRestPos = position;');
          shader.fragmentShader = shader.fragmentShader
            .replace('#include <common>', '#include <common>\n' + WEB_GLSL)
            .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb = applyWeb(diffuseColor.rgb, vRestPos);');
        };
        o.material = mat;
      }
    });
    this.bones = bones;

    // lewa = +X modelu, prawa = -X
    this.arms = {
      left: { sh: bones.upperarm_l, el: bones.forearm_l, hand: bones.hand_l, side: 1 },
      right: { sh: bones.upperarm_r, el: bones.forearm_r, hand: bones.hand_r, side: -1 },
    };
    this.legs = {
      left: { hip: bones.thigh_l, kn: bones.shin_l, side: 1 },
      right: { hip: bones.thigh_r, kn: bones.shin_r, side: -1 },
    };
    this.joints = [bones.spine, bones.head, bones.upperarm_r, bones.forearm_r, bones.upperarm_l, bones.forearm_l,
      bones.thigh_r, bones.shin_r, bones.thigh_l, bones.shin_l];
    this.targets = this.joints.map(() => new THREE.Quaternion());
    this.aimed = new Set();

    // dane spoczynkowe: lokalny obrot, obrot w ukladzie modelu, korekta "konczyna w dol" (A-poza -> zwis)
    model.updateMatrixWorld(true);
    const modelInv = new THREE.Matrix4().copy(model.matrixWorld).invert();
    this.rest = this.joints.map(b => {
      const mm = new THREE.Matrix4().multiplyMatrices(modelInv, b.matrixWorld);
      const restModel = new THREE.Quaternion().setFromRotationMatrix(mm);
      return { local: b.quaternion.clone(), model: restModel, modelInv: restModel.clone().invert(), fix: new THREE.Quaternion() };
    });
    const limbDir = (bone, child) => {
      bone.getWorldPosition(_a).applyMatrix4(modelInv);
      child.getWorldPosition(_b).applyMatrix4(modelInv);
      return _b.sub(_a).normalize().clone();
    };
    for (const [i, bone, child] of [[2, bones.upperarm_r, bones.forearm_r], [4, bones.upperarm_l, bones.forearm_l],
      [6, bones.thigh_r, bones.shin_r], [8, bones.thigh_l, bones.shin_l]]) {
      this.rest[i].fix.setFromUnitVectors(limbDir(bone, child), DOWN);
    }
    // lokiec/kolano: zgiecie liczone w ukladzie "wyprostowanej w dol" konczyny rodzica -> sprzezenie korekta rodzica
    for (const [child, parent] of [[3, 2], [5, 4], [7, 6], [9, 8]]) {
      this.rest[child].pf = this.rest[parent].fix;
      this.rest[child].pfInv = this.rest[parent].fix.clone().invert();
    }

    this.phase = 0;
    this.bodyOffset = new THREE.Vector3(0, HIP_H, 0);
    this.orient = new THREE.Quaternion();
    this.handPos = new THREE.Vector3();
    scene.add(this.root);
  }

  // kwaternion z bazy (gora, przod); os x = gora x przod = LEWA strona postaci
  basis(up, fwd, out) {
    _y.copy(up).normalize();
    _z.copy(fwd).addScaledVector(_y, -fwd.dot(_y));
    if (_z.lengthSq() < 1e-6) _z.set(0, 0, 1).addScaledVector(_y, -_y.z);
    _z.normalize();
    _x.crossVectors(_y, _z);
    _m.makeBasis(_x, _y, _z);
    return out.setFromRotationMatrix(_m);
  }

  // obrot stawu w osiach modelu (katy jak dla konczyny zwisajacej w dol) -> lokalny kwaternion kosci
  setJoint(i, x, y = 0, z = 0) {
    const r = this.rest[i];
    _q.setFromEuler(_e.set(x, y, z));
    if (r.pf) _q.premultiply(r.pfInv).multiply(r.pf);            // f^-1 * D * f
    _q.multiply(r.fix);                                          // D * korekta
    _q2.copy(r.modelInv).multiply(_q).multiply(r.model);         // R^-1 * D * R
    this.targets[i].copy(r.local).multiply(_q2);
  }

  // ustaw ramie tak, by wskazywalo punkt w swiecie (po zwykłej animacji, w przestrzeni swiata)
  aimArm(arm, target, k) {
    const bone = arm.sh;
    bone.updateWorldMatrix(true, true);
    bone.getWorldPosition(_a);
    arm.el.getWorldPosition(_b);
    const cur = _b.sub(_a).normalize();
    const want = _z.subVectors(target, _a).normalize();
    _q.setFromUnitVectors(cur, want);
    bone.getWorldQuaternion(_q2);
    _q.multiply(_q2);                                            // nowy obrot w swiecie
    bone.parent.getWorldQuaternion(_q2).invert();
    _q2.multiply(_q);                                            // -> lokalny
    bone.quaternion.slerp(_q2, k);
  }

  update(dt, player) {
    const s = player.state;
    const v = player.vel;
    const speedH = Math.hypot(v.x, v.z);
    const J = { spine: 0, head: 1, shR: 2, elR: 3, shL: 4, elL: 5, hipR: 6, knR: 7, hipL: 8, knL: 9 };

    // ---- orientacja ciala ----
    const wantOffset = _a.set(0, HIP_H, 0);
    let up = UP, fwd = player.facing;
    if (s === 'swing') {
      up = _y.subVectors(player.anchor, player.pos).setY(player.anchor.y - player.pos.y - HIP_H).normalize().clone();
      fwd = v.lengthSq() > 1 ? v.clone() : player.facing;
    } else if (s === 'wall') {
      const n = player.wallNormal;
      up = n.clone();
      const lateral = player.move.x * n.z - player.move.z * n.x;
      fwd = v.y > 1 || Math.abs(lateral) < 0.2 ? UP : new THREE.Vector3(n.z, 0, -n.x).multiplyScalar(Math.sign(lateral));
      wantOffset.addScaledVector(n, HIP_H - 0.35);
    } else if (s === 'zip') {
      fwd = _z.subVectors(player.zipTarget, player.pos).clone();
    } else if (s === 'air' && player.diving && v.y < -5) {
      up = v.clone().normalize();
      fwd = new THREE.Vector3(0, -1, 0);
    } else if (s === 'air') {
      up = _y.set(v.x * 0.012, 1, v.z * 0.012).normalize().clone();
    }
    const orient = this.basis(up, fwd, new THREE.Quaternion());
    const rate = s === 'swing' ? 10 : s === 'wall' ? 14 : 12;
    this.orient.slerp(orient, 1 - Math.exp(-dt * rate));
    this.body.quaternion.copy(this.orient);
    this.bodyOffset.lerp(wantOffset, 1 - Math.exp(-dt * 16));
    this.body.position.copy(this.bodyOffset);
    this.root.position.copy(player.pos);

    // ---- poza (L = +X, P = -X; "na zewnatrz" dla ramienia = z * strona) ----
    const L = 1, R = -1;
    const webArm = player.handSign > 0 ? this.arms.right : this.arms.left;
    const freeArm = player.handSign > 0 ? this.arms.left : this.arms.right;
    const armIdx = arm => (arm === this.arms.right ? [J.shR, J.elR] : [J.shL, J.elL]);
    const t = performance.now() / 1000;
    this.aimed.clear();

    if (s === 'ground' && speedH > 0.5) {
      this.phase += dt * Math.PI * 2 * speedH / (2.0 + speedH * 0.1);
      const a = THREE.MathUtils.clamp(speedH / 12, 0.35, 1.05);
      const p = this.phase;
      this.setJoint(J.spine, 0.12 + a * 0.22);
      this.setJoint(J.head, -0.1 - a * 0.15);
      this.setJoint(J.hipR, Math.sin(p) * a);
      this.setJoint(J.hipL, -Math.sin(p) * a);
      this.setJoint(J.knR, 0.2 + Math.max(0, Math.cos(p)) * 1.5 * a);
      this.setJoint(J.knL, 0.2 + Math.max(0, -Math.cos(p)) * 1.5 * a);
      this.setJoint(J.shR, -Math.sin(p) * a * 0.9, 0, 0.12 * R);
      this.setJoint(J.shL, Math.sin(p) * a * 0.9, 0, 0.12 * L);
      this.setJoint(J.elR, -0.4 - a * 0.9);
      this.setJoint(J.elL, -0.4 - a * 0.9);
    } else if (s === 'ground') {
      const b = Math.sin(t * 2) * 0.03;
      this.setJoint(J.spine, 0.05 + b);
      this.setJoint(J.head, -0.05);
      this.setJoint(J.hipR, -0.05, 0, 0.06 * R);
      this.setJoint(J.hipL, -0.05, 0, 0.06 * L);
      this.setJoint(J.knR, 0.1);
      this.setJoint(J.knL, 0.1);
      this.setJoint(J.shR, 0.05, 0, (0.2 + b) * R);
      this.setJoint(J.shL, 0.05, 0, (0.2 + b) * L);
      this.setJoint(J.elR, -0.25);
      this.setJoint(J.elL, -0.25);
    } else if (s === 'wall') {
      this.phase += dt * Math.PI * 2 * 2.6;
      const p = this.phase;
      this.setJoint(J.spine, 0.35);
      this.setJoint(J.head, -0.5);
      this.setJoint(J.hipR, -0.3 + Math.sin(p) * 0.9);
      this.setJoint(J.hipL, -0.3 - Math.sin(p) * 0.9);
      this.setJoint(J.knR, 0.4 + Math.max(0, Math.cos(p)) * 1.4);
      this.setJoint(J.knL, 0.4 + Math.max(0, -Math.cos(p)) * 1.4);
      this.setJoint(J.shR, -Math.sin(p) * 0.9, 0, 0.3 * R);
      this.setJoint(J.shL, Math.sin(p) * 0.9, 0, 0.3 * L);
      this.setJoint(J.elR, -1.2);
      this.setJoint(J.elL, -1.2);
    } else if (s === 'swing') {
      // faza luku: w dol -> nogi podkurczone, w gore -> wyprostowane
      const rising = THREE.MathUtils.clamp(v.y / 15, -1, 1);
      this.setJoint(J.spine, 0.1 - rising * 0.2);
      this.setJoint(J.head, -0.2);
      this.setJoint(J.hipR, -0.9 + rising * 0.5, 0, 0.1 * R);
      this.setJoint(J.hipL, -0.5 + rising * 0.6, 0, 0.1 * L);
      this.setJoint(J.knR, 1.5 - rising * 0.6);
      this.setJoint(J.knL, 1.0 - rising * 0.5);
      const [fs, fe] = armIdx(freeArm);
      const [ws, we] = armIdx(webArm);
      this.setJoint(fs, 0.3, 0, 1.0 * freeArm.side);
      this.setJoint(fe, -0.6);
      this.setJoint(we, 0);
      this.aimed.add(ws);
    } else if (s === 'zip') {
      this.setJoint(J.spine, 0.2);
      this.setJoint(J.head, -0.2);
      this.setJoint(J.hipR, 0.3);
      this.setJoint(J.hipL, 0.1);
      this.setJoint(J.knR, 0.7);
      this.setJoint(J.knL, 0.9);
      this.setJoint(J.elR, 0);
      this.setJoint(J.elL, 0);
      this.aimed.add(J.shR).add(J.shL);
    } else if (player.diving && v.y < -5) {
      this.setJoint(J.spine, 0);
      this.setJoint(J.head, -0.3);
      this.setJoint(J.hipR, 0.05, 0, 0.03 * R);
      this.setJoint(J.hipL, 0.05, 0, 0.03 * L);
      this.setJoint(J.knR, 0.1);
      this.setJoint(J.knL, 0.1);
      this.setJoint(J.shR, 0.35, 0, 0.2 * R);
      this.setJoint(J.shL, 0.35, 0, 0.2 * L);
      this.setJoint(J.elR, 0);
      this.setJoint(J.elL, 0);
    } else {
      // powietrze: wznoszenie = podkurczone nogi, opadanie = rozlozone rece (jak skydiving)
      const k = THREE.MathUtils.clamp(-v.y / 18, 0, 1);
      const fl = Math.sin(t * 9) * 0.08 * k;
      this.setJoint(J.spine, 0.15 - k * 0.1);
      this.setJoint(J.head, -0.15);
      this.setJoint(J.hipR, -1.1 + k * 0.8, 0, (0.1 + k * 0.2) * R);
      this.setJoint(J.hipL, -0.4 + k * 0.5, 0, (0.1 + k * 0.2) * L);
      this.setJoint(J.knR, 1.7 - k * 0.9);
      this.setJoint(J.knL, 1.0 - k * 0.3);
      this.setJoint(J.shR, -0.3 + fl, 0, (0.7 + k * 0.8) * R);
      this.setJoint(J.shL, -0.3 - fl, 0, (0.7 + k * 0.8) * L);
      this.setJoint(J.elR, -0.5 + k * 0.3);
      this.setJoint(J.elL, -0.5 + k * 0.3);
    }

    const k = 1 - Math.exp(-dt * (s === 'ground' ? 18 : 10));
    for (let i = 0; i < this.joints.length; i++) {
      if (!this.aimed.has(i)) this.joints[i].quaternion.slerp(this.targets[i], k);
    }

    // ramiona celujace w punkt zaczepienia sieci
    this.root.updateMatrixWorld(true);
    const ka = 1 - Math.exp(-dt * 18);
    if (s === 'swing') this.aimArm(webArm, player.webPoint, ka);
    else if (s === 'zip') {
      this.aimArm(this.arms.right, player.webPoint, ka);
      this.aimArm(this.arms.left, player.webPoint, ka);
    }

    this.root.updateMatrixWorld(true);
    // dlon: nadgarstek + kawalek wzdluz przedramienia
    const arm = s === 'zip' ? this.arms.right : webArm;
    arm.hand.getWorldPosition(this.handPos);
    arm.el.getWorldPosition(_b);
    this.handPos.addScaledVector(_b.subVectors(this.handPos, _b).normalize(), 0.07);
  }
}
