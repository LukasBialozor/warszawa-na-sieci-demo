// Kamera trzecioosobowa: orbita myszka, lekkie opoznienie, oddalanie i szerszy FOV przy duzej predkosci, kolizja z budynkami.
import * as THREE from 'three';

const _v = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _o = new THREE.Vector3();
const _p = new THREE.Vector3();
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _end = new THREE.Vector3();
const _pd = new THREE.Vector3();
const _want = new THREE.Vector3();
const _off = new THREE.Vector3();
const _slide = new THREE.Vector3();
const _look = new THREE.Vector3();
const _cand = new THREE.Vector3();
const _candPos = new THREE.Vector3();
const Y = new THREE.Vector3(0, 1, 0);
const CAM_RADIUS = 0.45;   // promien "bryly" kamery: wiekszy niz polowa przekroju bliskiej plaszczyzny obcinania
const SLIDE_RADIUS = 0.3;  // przy poslizgu wzdluz sciany (mniejszy, zeby nie ocierac o sciane, po ktorej jedziemy)
const PROBES = [[0, 0], [1, 1], [-1, 1], [1, -1], [-1, -1]];
const PITCH_MIN = -1.3;    // patrzenie w gore do ~75 st. (celowanie w krawedz dachu z dna podworka-studni)
const AIM = 12;            // kamera patrzy na punkt AIM m przed glowa w zadanym kierunku (celownik = zadany kierunek)
const ROOMY = 2.0;         // ponizej tej odleglosci od glowy szukamy miejsca obok (obrot ramienia w bok)
const SWINGS = [0.45, -0.45, 0.9, -0.9, 1.35, -1.35];

export class ThirdPersonCamera {
  constructor(camera, city) {
    this.camera = camera;
    this.city = city;
    this.yaw = 0;
    this.pitch = 0.22;
    this.target = new THREE.Vector3();
    this.dist = 5.5;
    this.offset = new THREE.Vector3();   // kamera wzgledem glowy (wygladzane)
    this.fresh = true;
    this.yawOff = 0;                     // obrot ramienia w bok, gdy za plecami brak miejsca (wygladzany)
    this.sensitivity = 0.0022;
    this.right = new THREE.Vector3(1, 0, 0);
  }

  snap(player) {
    this.target.copy(player.pos).y += 1.55;
    this.dist = 5.5;
    this.fresh = true;
    this.yawOff = 0;
    this.swing = 0;
    this.swingTimer = 0;
  }

  // poziomy kierunek "do przodu" kamery
  forward(out = new THREE.Vector3()) {
    return out.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
  }

  // pelny kierunek patrzenia (z pochyleniem)
  lookDir(out = new THREE.Vector3()) {
    return this.camera.getWorldDirection(out);
  }

  // Wolna dlugosc ramienia od punktu from w kierunku dir (max len): piec promieni z from do srodka i naroznikow
  // "bryly" kamery na koncu ramienia. Wszystkie startuja w wolnej przestrzeni (rownolegle promienie przesuniete
  // o promien kamery potrafily zaczynac sie w scianie i jej nie widziec). this.hitNormal = normalna przeszkody.
  sweep(from, dir, len, radius) {
    _a.crossVectors(dir, Y);
    if (_a.lengthSq() < 1e-6) _a.set(1, 0, 0);
    _a.normalize();
    _b.crossVectors(_a, dir).normalize();
    let d = len;
    this.hitNormal = null;
    for (const [sx, sy] of PROBES) {
      const corner = sx !== 0;
      _end.copy(from).addScaledVector(dir, len).addScaledVector(_a, sx * radius).addScaledVector(_b, sy * radius);
      _pd.subVectors(_end, from);
      const L = _pd.length();
      _pd.divideScalar(L);
      const hit = this.city.raycast(from, _pd, corner ? L : L + radius);
      if (!hit) continue;
      const free = corner ? hit.distance * len / L - 0.1 : hit.distance - radius;
      if (free < d) { d = free; this.hitNormal = hit.normal; }
    }
    return Math.max(0, d);
  }

  // Pozycja kamery dla kierunku ramienia dir: do pierwszej przeszkody, a reszta ramienia rzutowana na jej
  // plaszczyzne (przy scianie i patrzeniu w gore kamera zjezdza wzdluz muru, zamiast wbijac sie w glowe).
  place(origin, dir, len, out) {
    const d = this.sweep(origin, dir, len, CAM_RADIUS);
    out.copy(origin).addScaledVector(dir, d);
    if (this.hitNormal && d < len - 0.3) {
      const n = this.hitNormal;
      _slide.copy(dir).multiplyScalar(len - d);
      _slide.addScaledVector(n, -_slide.dot(n));
      const L = _slide.length();
      if (L > 0.3) {
        _slide.divideScalar(L);
        out.addScaledVector(_slide, this.sweep(out, _slide, L, SLIDE_RADIUS));
      }
    }
    // wnetrze bryly kolizji bez widocznych scian (np. wneka miedzy lizenami) - cofniecie do jej granicy
    if (this.city.collision.insideBuilding(out)) {
      _slide.subVectors(out, origin);
      let lo = 0, hi = 1;
      for (let i = 0; i < 7; i++) {
        const t = (lo + hi) / 2;
        if (this.city.collision.insideBuilding(out.copy(origin).addScaledVector(_slide, t))) hi = t; else lo = t;
      }
      out.copy(origin).addScaledVector(_slide, lo);
    }
    return out.distanceTo(origin);
  }

  armDir(yaw, out) {
    const cp = Math.cos(this.pitch);
    return out.set(Math.sin(yaw) * cp, Math.sin(this.pitch), Math.cos(yaw) * cp);
  }

  update(dt, player, input) {
    this.yaw -= input.dx * this.sensitivity;
    this.pitch = THREE.MathUtils.clamp(this.pitch + input.dy * this.sensitivity, PITCH_MIN, 1.35);

    const speed = player.vel.length();
    const sf = THREE.MathUtils.smoothstep(speed, 8, 50);

    _v.copy(player.pos).y += 1.55;
    const follow = 1 - Math.exp(-dt * (player.state === 'ground' ? 18 : 11));
    this.target.lerp(_v, follow);
    // nie pozwol, by kamera za bardzo zostala w tyle przy bardzo duzej predkosci
    if (this.target.distanceTo(_v) > 6) this.target.copy(_v).addScaledVector(_dir.subVectors(this.target, _v).normalize(), 6);

    // dlugosc ramienia rosnie z predkoscia; wygladzona, bo przy nagłym zatrzymaniu (ladowanie, sciana) skok z 9 na
    // 5.2 m bylby natychmiastowy (przyblizenie kamery do przeszkody nadal jest natychmiastowe - w place())
    const goal = THREE.MathUtils.lerp(5.2, 9, sf);
    this.arm = this.fresh || !this.arm ? goal : THREE.MathUtils.lerp(this.arm, goal, 1 - Math.exp(-dt * 2.5));
    const wantDist = this.arm;
    const cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
    _dir.set(Math.sin(this.yaw) * cp, sp, Math.cos(this.yaw) * cp);
    this.right.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw));

    // Ramie (przesuniecie w bok) skracamy, gdy gracz stoi przy scianie.
    const center = _v.copy(this.target);
    let shoulder = 0.55;
    const sideHit = this.city.raycast(center, this.right, shoulder + 0.35);
    if (sideHit) shoulder = Math.max(0, sideHit.distance - 0.35);
    const origin = _o.copy(center).addScaledVector(this.right, shoulder);
    // bryla kolizji bywa wieksza niz widoczne sciany (wneki miedzy lizenami) - ramie nie moze w nia wejsc
    if (shoulder > 0 && this.city.collision.insideBuilding(origin)) origin.copy(center);

    // Kolizja. Gdy za plecami nie ma miejsca (sciana, kat miedzy murami), ramie obraca sie w bok tam, gdzie jest
    // wolno - z premia za strone wybrana wczesniej, zeby kamera nie przeskakiwala z boku na bok.
    // (kandydatow szukamy najwyzej 10 razy na sekunde - kazdy to kilka-kilkanascie promieni)
    const d0 = this.place(origin, _dir, wantDist, _want);
    if (d0 < ROOMY) {
      this.swingTimer = (this.swingTimer || 0) - dt;
      if (this.swingTimer <= 0) {
        this.swingTimer = 0.1;
        let best = d0, swing = 0;
        for (const off of SWINGS) {
          const dc = this.place(origin, this.armDir(this.yaw + off, _cand), wantDist, _candPos);
          const score = dc - 1.2 * Math.abs(off) + (off * this.yawOff > 0 ? 0.4 : 0);
          if (score > best + 0.3) { best = score; swing = off; }
        }
        this.swing = swing;
      }
    } else {
      this.swing = 0;
      this.swingTimer = 0;
    }
    this.yawOff += ((this.swing || 0) - this.yawOff) * (1 - Math.exp(-dt * 4));
    if (Math.abs(this.yawOff) > 0.01) this.place(origin, this.armDir(this.yaw + this.yawOff, _cand), wantDist, _want);

    // Wygladzanie: przyblizenie natychmiast, oddalanie i zmiana kierunku plynnie - o ile droga od glowy do
    // wygladzonej pozycji jest wolna (inaczej skok wprost na bezpieczna pozycje).
    _off.subVectors(_want, origin);
    if (this.fresh || _off.length() < this.offset.length()) {
      this.offset.copy(_off);
      this.fresh = false;
    } else {
      this.offset.lerp(_off, 1 - Math.exp(-dt * 5));
      const L = this.offset.length();
      if (L > 0.01 && this.city.raycast(origin, _pd.copy(this.offset).divideScalar(L), L + CAM_RADIUS * 0.5)) this.offset.copy(_off);
    }

    this.camera.position.copy(origin).add(this.offset);
    if (this.camera.position.y < 0.3) this.camera.position.y = 0.3;
    // ostatnia ochrona: kamera nie moze stac wewnatrz bryly budynku - cofamy ja do granicy bryly (bisekcja po ramieniu)
    if (this.city.collision.insideBuilding(this.camera.position)) {
      let lo = 0, hi = 1;
      for (let i = 0; i < 8; i++) {
        const t = (lo + hi) / 2;
        if (this.city.collision.insideBuilding(_p.copy(origin).addScaledVector(this.offset, t))) hi = t; else lo = t;
      }
      this.offset.multiplyScalar(lo);
      this.camera.position.copy(origin).add(this.offset);
    }
    this.dist = this.camera.position.distanceTo(origin);
    // Patrzymy na punkt przed glowa w zadanym kierunku: bez kolizji to dokladnie "na postac", po poslizgu
    // (kamera przy ziemi albo przy murze) celownik dalej idzie za myszka/palcem, a postac zostaje w kadrze.
    _look.copy(origin).addScaledVector(_dir, -AIM);
    this.camera.lookAt(_look);
    // z bliska postac zaslanialaby caly obraz
    this.tooClose = this.dist < 1.1;

    const fov = THREE.MathUtils.lerp(68, 86, sf);
    if (Math.abs(this.camera.fov - fov) > 0.05) {
      this.camera.fov = THREE.MathUtils.lerp(this.camera.fov, fov, 1 - Math.exp(-dt * 3));
      this.camera.updateProjectionMatrix();
    }
  }
}
