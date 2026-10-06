// Fizyka i maszyna stanow bohatera: ziemia, powietrze, bujanie na sieci, bieg po scianie, przyciaganie siecia (zip).
import * as THREE from 'three';
import { closestEdge } from '../world/collision.js';
import { findAnchor } from './web.js';
import { KEYS } from '../input.js';

export const RADIUS = 0.35;
export const HEIGHT = 1.8;

const G = 22;                 // grawitacja [m/s^2] - mocniejsza niz ziemska, dla "ciezszego", dynamicznego ruchu
const RUN = 7.5, SPRINT = 17;
const JUMP = 10.5, SPRINT_JUMP = 12.5;
const WALL_SPEED = 14;
const SWING_MAX = 58;
const ZIP_MAX = 60;
const MAX_SPEED = 80;
const REEL = 24;             // predkosc zwijania liny [m/s]
const STEP_UP = 0.6;

const UP = new THREE.Vector3(0, 1, 0);
const _move = new THREE.Vector3();
const _wmove = new THREE.Vector3();
const _f = new THREE.Vector3();
const _r = new THREE.Vector3();
const _t = new THREE.Vector3();
const _edge = {};

export class Player {
  constructor(city) {
    this.city = city;
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.state = 'air';
    this.stateTime = 0;
    this.facing = new THREE.Vector3(0, 0, -1);
    this.move = new THREE.Vector3();

    this.anchor = new THREE.Vector3();     // punkt obrotu wahadla (fizyka)
    this.webPoint = new THREE.Vector3();   // punkt na budynku, do ktorego wizualnie biegnie lina
    this.swingDir = new THREE.Vector3(0, 0, -1);
    this.swingHeld = false;
    this.ropeLen = 0;
    this.handSign = 1;            // 1 = prawa reka, -1 = lewa
    this.lastRelease = -10;
    this.time = 0;

    this.wallNormal = new THREE.Vector3();
    this.wallPrism = null;
    this.wallLost = 0;

    this.zipTarget = new THREE.Vector3();
    this.zipMode = 'air';         // 'perch' | 'wall' | 'ground' | 'air'
    this.zipNormal = new THREE.Vector3();
    this.zipSpeed = 0;

    this.contact = { ground: false, wall: false, wallNormal: new THREE.Vector3(), wallPrism: null };
    this.lastGrounded = 0;
    this.diving = false;
    this.events = [];             // zdarzenia dla HUD/animacji: 'web', 'land', 'release', 'nowebtarget'
  }

  setState(s) {
    if (this.state !== s) {
      this.state = s;
      this.stateTime = 0;
    }
  }

  teleport(x, y, z) {
    this.pos.set(x, y, z);
    this.vel.set(0, 0, 0);
    this.setState('air');
  }

  update(dt, input, cam) {
    this.time += dt;
    this.stateTime += dt;
    this.events.length = 0;

    // kierunek ruchu wzgledem kamery
    cam.forward(_f);
    _r.set(-_f.z, 0, _f.x);
    const mx = (input.down(...KEYS.right) ? 1 : 0) - (input.down(...KEYS.left) ? 1 : 0) + (input.moveX || 0);
    const mz = (input.down(...KEYS.forward) ? 1 : 0) - (input.down(...KEYS.back) ? 1 : 0) + (input.moveY || 0);
    _move.set(0, 0, 0).addScaledVector(_f, mz).addScaledVector(_r, mx);
    if (_move.lengthSq() > 1) _move.normalize();
    this.move.copy(_move);
    // Na scianie drazek/WASD dziala wzgledem muru: do przodu = w gore, w bok = wzdluz sciany (w strone ekranu),
    // do tylu = odejscie. Liczone od kamery "do przodu" odrywalo od muru, gdy kamera patrzyla od sciany.
    const wn = this.wallNormal, wtx = wn.z, wtz = -wn.x;
    const side = Math.sign(_r.x * wtx + _r.z * wtz) || 1;
    _wmove.set(-wn.x * mz + wtx * mx * side, 0, -wn.z * mz + wtz * mx * side);
    if (_wmove.lengthSq() > 1) _wmove.normalize();
    const sprint = input.down(...KEYS.sprint);
    this.sprint = sprint;
    this.diving = this.state === 'air' && input.down(...KEYS.dive);

    // ---- akcje ----
    const swingHeld = input.down(...KEYS.swing);
    this.swingHeld = swingHeld;
    if (input.hit(...KEYS.swing) && this.state !== 'swing') this.trySwing(cam);
    else if (swingHeld && this.time - this.lastRelease > 0.3 &&
      ((this.state === 'air' && this.vel.y < 5) || (this.state === 'ground' && this.stateTime > 0.2))) this.trySwing(cam, true);
    if (!swingHeld && this.state === 'swing') this.releaseSwing(false);

    if (input.hit(...KEYS.zip)) this.tryZip(cam);

    if (input.hit(...KEYS.jump)) {
      if (this.state === 'ground' || (this.state === 'air' && this.time - this.lastGrounded < 0.12 && this.vel.y <= 0)) {
        this.vel.y = sprint ? SPRINT_JUMP : JUMP;
        if (sprint && _move.lengthSq() > 0.1) this.vel.addScaledVector(_move, 3);
        this.setState('air');
      } else if (this.state === 'wall') {
        this.vel.copy(this.wallNormal).multiplyScalar(11).addScaledVector(UP, 9).addScaledVector(_move, 4);
        this.setState('air');
      } else if (this.state === 'swing') {
        this.releaseSwing(true);
      } else if (this.state === 'zip') {
        // "wystrzal" z przyciagania - wybicie w gore
        _t.subVectors(this.zipTarget, this.pos).normalize();
        this.vel.copy(_t).multiplyScalar(18).addScaledVector(UP, 16);
        this.setState('air');
      }
    }

    // ---- fizyka w podkrokach (duze predkosci) ----
    const speed = this.vel.length();
    const n = Math.min(16, Math.max(1, Math.ceil(speed * dt / 0.22)));
    const h = dt / n;
    for (let i = 0; i < n; i++) this.step(h, this.state === 'wall' ? _wmove : _move, sprint);

    // obrot postaci (kierunek patrzenia)
    const velH = _t.set(this.vel.x, 0, this.vel.z);
    if (this.state === 'ground' && _move.lengthSq() > 0.01) this.facing.lerp(_move, 1 - Math.exp(-dt * 14)).normalize();
    else if (velH.lengthSq() > 4) this.facing.lerp(velH.normalize(), 1 - Math.exp(-dt * 6)).normalize();
  }

  step(h, move, sprint) {
    const v = this.vel;
    switch (this.state) {
      case 'ground': {
        const target = sprint ? SPRINT : RUN;
        const tx = move.x * target, tz = move.z * target;
        const dx = tx - v.x, dz = tz - v.z;
        const dl = Math.hypot(dx, dz);
        const maxDv = (move.lengthSq() > 0.01 ? 60 : 45) * h;
        if (dl > maxDv) { v.x += dx / dl * maxDv; v.z += dz / dl * maxDv; } else { v.x = tx; v.z = tz; }
        v.y -= G * h;
        break;
      }
      case 'air': {
        v.y -= G * (this.diving ? 2.2 : 1) * h;
        // sterowanie w powietrzu: tylko dopychanie, nie zabija predkosci
        const along = v.x * move.x + v.z * move.z;
        if (along < 20 && !(this.time < this.hopUntil)) { v.x += move.x * 11 * h; v.z += move.z * 11 * h; }
        const drag = this.diving ? 0.02 : 0.12;
        v.x *= 1 - drag * h; v.z *= 1 - drag * h;
        break;
      }
      case 'swing': {
        v.y -= G * h;
        v.x += move.x * 9 * h; v.z += move.z * 9 * h;
        // "pompowanie" w dolnej czesci luku - utrzymuje plynnosc bujania
        const sp = v.length();
        if (this.pos.y < this.anchor.y - 2 && sp > 1 && sp < SWING_MAX) v.multiplyScalar(1 + 5 * h / sp);
        break;
      }
      case 'wall': {
        const n = this.wallNormal;
        const climb = Math.max(0, -(move.x * n.x + move.z * n.z));
        // styczna do sciany (w poziomie)
        const tx = n.z, tz = -n.x;
        const lateral = move.x * tx + move.z * tz;
        if (climb > 0.2 || Math.abs(lateral) > 0.2) {
          v.set(tx * lateral * 11, WALL_SPEED * climb, tz * lateral * 11);
          if (climb < 0.2) v.y = -1; // bieg w poziomie po scianie - powolne opadanie
        } else {
          v.set(0, 0, 0); // przyklejony do sciany
        }
        v.addScaledVector(n, -4); // docisk do sciany
        break;
      }
      case 'zip': {
        _t.subVectors(this.zipTarget, this.pos);
        const d = _t.length();
        this.zipSpeed = Math.min(ZIP_MAX, this.zipSpeed + 140 * h);
        if (d < Math.max(0.6, this.zipSpeed * h * 1.2)) { this.arriveZip(); return; }
        v.copy(_t).multiplyScalar(this.zipSpeed / d);
        break;
      }
    }

    if (v.lengthSq() > MAX_SPEED * MAX_SPEED) v.setLength(MAX_SPEED);

    const prevY = this.pos.y;
    this.pos.addScaledVector(v, h);

    if (this.state === 'swing') this.applyRope(h);
    this.collide(prevY);
    this.afterContacts(h, move, sprint);
  }

  // Lina jako ograniczenie nierownosciowe: odleglosc od punktu zaczepienia <= dlugosc liny (wahadlo)
  applyRope(h) {
    // lina nie moze sprowadzic gracza na ziemie - zwijamy ja plynnie (skokowe skrocenie = teleport)
    const minLen = this.anchor.y - 1.6;
    if (this.ropeLen > minLen) this.ropeLen = Math.max(minLen, this.ropeLen - REEL * h);
    _t.subVectors(this.pos, this.anchor);
    const d = _t.length();
    if (d > this.ropeLen) {
      _t.divideScalar(d);
      this.pos.copy(this.anchor).addScaledVector(_t, this.ropeLen);
      const radial = this.vel.dot(_t);
      if (radial > 0) this.vel.addScaledVector(_t, -radial);
    }
  }

  collide(prevY) {
    const c = this.contact;
    c.ground = false;
    c.wall = false;
    c.wallPrism = null;
    c.impact = 0;
    const p = this.pos, v = this.vel;
    const list = this.city.collision.query(p.x - RADIUS - 0.5, p.z - RADIUS - 0.5, p.x + RADIUS + 0.5, p.z + RADIUS + 0.5);
    for (const pr of list) {
      // wysokosc dachu w tym miejscu (dachy spadziste/kopuly maja funkcje topAt)
      // (liczone tylko w poblizu okapu - ponizej gracz i tak tylko zderza sie ze sciana)
      const top = pr.topAt && p.y + HEIGHT > pr.eave - 0.5 ? pr.topAt(p.x, p.z) : pr.top;
      if (p.y >= top + 0.01 || p.y + HEIGHT <= pr.base) continue;
      closestEdge(pr, p.x, p.z, _edge);
      if (!_edge.inside && _edge.dist >= RADIUS) continue;

      // ladowanie na dachu
      if (prevY >= top - 0.05 - (pr.topAt ? 0.6 : 0) && v.y <= 0.5 && (_edge.inside || _edge.dist < RADIUS * 0.8)) {
        p.y = top;
        if (v.y < 0) v.y = 0;
        c.ground = true;
        continue;
      }
      // sufit (spod wiszacej bryly)
      if (prevY + HEIGHT <= pr.base + 0.05 && v.y > 0) {
        p.y = pr.base - HEIGHT;
        v.y = 0;
        continue;
      }
      // wejscie na niski stopien (albo w gore po spadzistym dachu)
      if (top - p.y <= STEP_UP && (this.state === 'ground' || this.state === 'air')) {
        p.y = top;
        if (v.y < 0) v.y = 0;
        c.ground = true;
        continue;
      }
      // sciana - wypchniecie w poziomie
      const push = _edge.inside ? _edge.dist + RADIUS : RADIUS - _edge.dist;
      p.x += _edge.nx * (push + 0.001);
      p.z += _edge.nz * (push + 0.001);
      const vn = v.x * _edge.nx + v.z * _edge.nz;
      if (vn < 0) { v.x -= _edge.nx * vn; v.z -= _edge.nz * vn; }
      if (-vn > c.impact) c.impact = -vn;
      c.wall = true;
      c.wallNormal.set(_edge.nx, 0, _edge.nz);
      c.wallPrism = pr;
    }
    if (p.y <= 0) {
      p.y = 0;
      if (v.y < 0) v.y = 0;
      c.ground = true;
    }
  }

  afterContacts(h, move, sprint) {
    const c = this.contact;
    const s = this.state;
    if (c.ground) this.lastGrounded = this.time;

    if (s === 'ground' && !c.ground) this.setState('air');
    if ((s === 'air' || s === 'swing') && c.ground && this.vel.y <= 0.01) {
      if (s === 'swing') this.releaseSwing(false, true);
      this.setState('ground');
      this.events.push('land');
    }

    // wejscie na sciane: sprint + ruch w strone sciany, albo uderzenie w sciane w locie (przyklejenie)
    if (c.wall && (s === 'ground' || s === 'air' || s === 'swing')) {
      const into = -(move.x * c.wallNormal.x + move.z * c.wallNormal.z);
      const run = sprint && into > 0.35;
      // tylko uderzenie czolowe przykleja do sciany; otarcie bokiem = poslizg wzdluz sciany
      const frontal = c.impact / Math.max(0.01, Math.hypot(c.impact, this.vel.length()));
      const hitInAir = s !== 'ground' && c.impact > 5 && frontal > 0.55;
      if ((run || hitInAir) && (c.wallPrism.eave ?? c.wallPrism.top) - this.pos.y > 2.5) {
        if (s === 'swing') this.releaseSwing(false, true);
        this.wallNormal.copy(c.wallNormal);
        this.wallPrism = c.wallPrism;
        this.wallLost = 0;
        this.setState('wall');
        if (s === 'ground') {
          // oderwanie od ziemi, inaczej kontakt z podlozem od razu konczylby bieg po scianie
          this.pos.y += 0.05;
          this.vel.y = WALL_SPEED * 0.6;
        }
      }
    }

    if (this.state === 'wall') {
      if (c.wall) {
        this.wallNormal.lerp(c.wallNormal, 0.5).normalize();
        this.wallPrism = c.wallPrism;
        this.wallLost = 0;
      } else {
        this.wallLost += h;
      }
      // wysokosc sciany w tym miejscu: dach spadzisty/jednospadowy (topAt) tuz za krawedzia, inaczej okap lub wierzch
      const wp = this.wallPrism;
      const top = !wp ? 0 : wp.topAt ? wp.topAt(this.pos.x - this.wallNormal.x * 0.3, this.pos.z - this.wallNormal.z * 0.3)
        : (wp.eave ?? wp.top);
      const pullAway = move.x * this.wallNormal.x + move.z * this.wallNormal.z > 0.6;
      if (this.pos.y + 0.4 >= top || this.wallLost > 0.06) {
        if (this.pos.y > top - 2.5) {
          // przeskok przez krawedz dachu: na dach 1.2 m za krawedzia (spadzisty bywa duzo wyzej niz okap);
          // przez chwile bez sterowania w powietrzu - drazek "od sciany" sciagal z powrotem w dol
          const pr = this.wallPrism;
          const lx = this.pos.x - this.wallNormal.x * 1.2, lz = this.pos.z - this.wallNormal.z * 1.2;
          const roof = pr ? (pr.topAt ? pr.topAt(lx, lz) : pr.top) : top;
          const rise = Math.max(1.4, roof - this.pos.y + 1.0);
          this.vel.copy(this.wallNormal).multiplyScalar(-6).addScaledVector(UP, Math.sqrt(2 * G * rise));
          this.pos.y = Math.max(this.pos.y, top - 0.2);
          this.hopUntil = this.time + 0.45;
        }
        this.setState('air');
      } else if (pullAway || (c.ground && this.vel.y <= 0 && this.stateTime > 0.15)) {
        this.vel.addScaledVector(this.wallNormal, 3);
        this.setState(c.ground ? 'ground' : 'air');
      }
    }

    if (this.state === 'swing') {
      if (this.pos.y > this.anchor.y - 0.5) this.releaseSwing(false);
      else if (this.swingHeld && this.stateTime > 0.4 && this.vel.y > 0) {
        // za punktem obrotu i ~40 st. od pionu -> puszczamy, zeby lot szedl do przodu, a nie stromo w gore
        const ahead = (this.pos.x - this.anchor.x) * this.swingDir.x + (this.pos.z - this.anchor.z) * this.swingDir.z;
        if (ahead > 0 && this.pos.y > this.anchor.y - this.ropeLen * 0.77) this.releaseSwing(false);
      }
    }
    if (this.state === 'zip' && this.stateTime > 2.5) this.setState('air');
  }

  trySwing(cam, auto = false) {
    const next = -this.handSign;
    const hit = findAnchor(this.city, this.pos, this.vel, cam.forward(_f), next);
    if (!hit) {
      if (!auto) this.events.push('nowebtarget');
      return false;
    }
    this.handSign = next;
    this.webPoint.copy(hit.point);
    // Kierunek lotu; punkt obrotu wahadla przesuwamy znad sciany nad tor lotu (ulice),
    // zeby luk nie wbijal bohatera w budynek. Lina wizualnie nadal biegnie do sciany.
    _t.set(this.vel.x, 0, this.vel.z);
    if (_t.lengthSq() > 16) this.swingDir.copy(_t).normalize();
    else this.swingDir.copy(cam.forward(_f));
    const rx = -this.swingDir.z, rz = this.swingDir.x;
    const lateral = (hit.point.x - this.pos.x) * rx + (hit.point.z - this.pos.z) * rz;
    this.anchor.copy(hit.point);
    this.anchor.x -= rx * lateral * 0.75;
    this.anchor.z -= rz * lateral * 0.75;
    const d = this.pos.distanceTo(this.anchor);
    this.ropeLen = d * 0.96;
    if (this.state === 'ground' || this.state === 'wall') {
      this.vel.y = Math.max(this.vel.y, 12);
      if (this.state === 'wall') this.vel.addScaledVector(this.wallNormal, 6);
    }
    // krotkie szarpniecie w strone punktu
    _t.subVectors(this.anchor, this.pos).normalize();
    this.vel.addScaledVector(_t, 3);
    this.setState('swing');
    this.events.push('web');
    return true;
  }

  releaseSwing(jumped, silent = false) {
    if (this.state !== 'swing') return;
    this.lastRelease = this.time;
    if (!silent) {
      // premia za puszczenie liny: wyrzut w gore i do przodu (wieksza przy skoku)
      _t.set(this.vel.x, 0, this.vel.z);
      if (_t.lengthSq() > 1) _t.normalize();
      this.vel.y = Math.max(this.vel.y, 0) + (jumped ? 11 : 4);
      this.vel.addScaledVector(_t, jumped ? 5 : 2.5);
      this.events.push('release');
    }
    this.setState('air');
  }

  tryZip(cam) {
    const origin = cam.camera.position;
    const dir = cam.lookDir(new THREE.Vector3());
    const hit = this.city.raycast(origin, dir, 180);
    if (!hit || hit.distance < 2) { this.events.push('nowebtarget'); return; }
    const p = hit.point, n = hit.normal;
    const pr = hit.prism;
    const eave = pr ? (pr.eave ?? pr.top) : 0;
    if (pr && Math.abs(n.y) < 0.5 && eave - p.y < 7) {
      // blisko krawedzi dachu -> przyciagnij sie i stan na krawedzi
      this.zipMode = 'perch';
      const tx = p.x - n.x * 0.7, tz = p.z - n.z * 0.7;
      this.zipTarget.set(tx, pr.topAt ? pr.topAt(tx, tz) : pr.top, tz);
    } else if (hit.prism && n.y > 0.5) {
      this.zipMode = 'perch';
      this.zipTarget.copy(p);
    } else if (hit.prism) {
      this.zipMode = 'wall';
      this.zipTarget.copy(p).addScaledVector(n, RADIUS + 0.05);
      this.zipTarget.y -= 0.9;
      this.zipNormal.copy(n).setY(0).normalize();
      this.wallPrism = hit.prism;
    } else {
      this.zipMode = 'ground';
      this.zipTarget.copy(p);
    }
    this.anchor.copy(p);
    this.webPoint.copy(p);
    this.zipSpeed = Math.max(12, this.vel.length() * 0.5);
    if (this.state === 'swing') this.lastRelease = this.time;
    this.setState('zip');
    this.events.push('web');
  }

  arriveZip() {
    this.pos.copy(this.zipTarget);
    if (this.zipMode === 'perch' || this.zipMode === 'ground') {
      this.vel.set(0, 0, 0);
      this.setState('ground');
      this.events.push('land');
    } else if (this.zipMode === 'wall') {
      this.vel.set(0, 0, 0);
      this.wallNormal.copy(this.zipNormal);
      this.wallLost = 0;
      this.setState('wall');
    } else {
      this.setState('air');
    }
  }
}
