// Tablice "gdzie jestem": wejscie do nowego obszaru/dzielnicy, zblizenie do landmarku oraz podpis wiezowca,
// na ktorym (lub na scianie ktorego) jest gracz. Sprawdzane kilka razy na sekunde.
import { LANDMARKS, project } from './geo.js';
import { inRing } from './world/landmarks.js';

const AREA_HOLD = 1.5;        // obszar musi sie utrzymac tyle sekund, zanim pokazemy tablice (bez migania na granicy)
const LANDMARK_COOLDOWN = 90; // ten sam landmark najwyzej co tyle sekund
const TOWER_MARGIN = 4;       // [m] wokol obrysu - lapie tez bieg po scianie

export class Discovery {
  constructor(locator, towers, hud) {
    this.locator = locator;
    this.hud = hud;
    this.landmarks = LANDMARKS.map(l => {
      const [x, z] = project(l.lat, l.lon);
      return { ...l, x, z, last: -Infinity };
    });
    this.towers = (towers || []).map(t => {
      let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
      for (let i = 0; i < t.o.length; i += 2) {
        x0 = Math.min(x0, t.o[i]); x1 = Math.max(x1, t.o[i]);
        z0 = Math.min(z0, t.o[i + 1]); z1 = Math.max(z1, t.o[i + 1]);
      }
      return { ...t, x0, x1, z0, z1 };
    });
    this.time = 0;
    this.check = 0;
    this.area = null;
    this.candidate = null;
    this.candidateTime = 0;
    this.tower = null;
    this.pendingArea = null;
  }

  update(dt, pos) {
    this.time += dt;
    this.check -= dt;
    if (this.check > 0) return;
    this.check = 0.25;

    // obszar MSI / dzielnica
    const { area, district } = this.locator.lookup(pos.x, pos.z);
    const key = area || district;
    if (key !== this.area) {
      if (key !== this.candidate) { this.candidate = key; this.candidateTime = 0; }
      this.candidateTime += 0.25;
      if (this.candidateTime >= AREA_HOLD) {
        const first = this.area === null;
        this.area = key;
        // tablica landmarku ma pierwszenstwo - nazwa obszaru poczeka, az zniknie
        if (key && !first) this.pendingArea = [area || district, area && district && area !== district ? district : ''];
      }
    } else this.candidate = null;
    if (this.pendingArea && this.hud.bannerTime <= 0.5) {
      this.hud.banner(...this.pendingArea);
      this.pendingArea = null;
    }

    // landmarki
    for (const l of this.landmarks) {
      if (Math.hypot(pos.x - l.x, pos.z - l.z) > l.r) continue;
      if (this.time - l.last < LANDMARK_COOLDOWN) { l.last = this.time; continue; }
      l.last = this.time;
      this.hud.banner(l.name, l.info);
      break;
    }

    // wiezowiec pod graczem (dach lub sciana powyzej 15 m)
    let tower = null;
    if (pos.y > 15) {
      for (const t of this.towers) {
        if (pos.x < t.x0 - TOWER_MARGIN || pos.x > t.x1 + TOWER_MARGIN || pos.z < t.z0 - TOWER_MARGIN || pos.z > t.z1 + TOWER_MARGIN) continue;
        if (pos.y > t.h + 20) continue;
        if (inRing(t.o, pos.x, pos.z) || nearRing(t.o, pos.x, pos.z, TOWER_MARGIN)) { tower = t; break; }
      }
    }
    if (tower !== this.tower) {
      this.tower = tower;
      this.hud.label(tower ? `${tower.n} · ${Math.round(tower.h)} m${tower.y ? ' · ' + tower.y : ''}` : '');
    }
  }
}

function nearRing(r, x, z, d) {
  for (let i = 0, n = r.length / 2, j = n - 1; i < n; j = i++) {
    const ax = r[2 * j], az = r[2 * j + 1], bx = r[2 * i], bz = r[2 * i + 1];
    const dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz || 1;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / L2));
    if (Math.hypot(x - ax - dx * t, z - az - dz * t) < d) return true;
  }
  return false;
}
